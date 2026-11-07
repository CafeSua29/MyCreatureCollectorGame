/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Luật danh sách trang bị rơi của map (`equipmentDrops`; "Dữ liệu trang bị và đồ cầm" ở
// docs/rules/content-mechanics.md, chủ project chốt: mọi món hợp map đều rơi được), dùng chung cho
// biomes-import.mjs và equipment-drops-import.mjs. Tất định theo dữ liệu, đọc thẳng items.json (không
// cần danh sách món của script sinh trang bị): nhóm của món suy từ dòng chính / hook cố định.

/** Trọng số theo nhóm món; nhóm theo hệ / race tính theo tỉ lệ quái của map × SHARE_WEIGHT. */
export const GROUP_WEIGHTS = { general: 10, gear: 4, spell: 2 }
export const SHARE_WEIGHT = 20

/**
 * Món gốc có nằm trong danh sách rơi của map không: trang bị thường (không unique của boss, không
 * hồn khí, không thuộc bộ đặt tên: các món đó có nguồn riêng).
 */
export function isMapDrop(item, namedSetIds) {
  return (
    item.category === 'equipment' &&
    item.unique === undefined &&
    item.soulRelicStat === undefined &&
    !(item.setId !== undefined && namedSetIds.has(item.setId))
  )
}

/**
 * Nhóm rơi của món: `element` (dòng chính + sát thương một hệ, không hook cố định: Charcoal...),
 * `race` (dòng chính sát thương lên nhóm race: vũ khí diệt race), `spell` (ô spell: Ngọc phép),
 * `general` (chỉ tăng chỉ số, không hook cố định), còn lại `gear` (đồ Pokémon / đặc biệt).
 */
export function dropGroupOf(item) {
  const { type, params } = item.mainLine.hook
  const hasFixedHooks = (item.hooks ?? []).length > 0
  if (type === 'elementDamageDealt' && !hasFixedHooks && params.elementIds?.length === 1) {
    return { group: 'element', keys: params.elementIds }
  }
  if (type === 'damageVsRace') return { group: 'race', keys: params.raceIds ?? [] }
  if (type === 'spellSlot') return { group: 'spell', keys: [] }
  if (type === 'statModifier' && !hasFixedHooks) return { group: 'general', keys: [] }
  return { group: 'gear', keys: [] }
}

/**
 * Tỉ lệ (theo trọng số gặp) của từng hệ và từng race / nhóm race trong quái hoang của map.
 * `lookup`: { byId: Map id → loài, groupOf: Map id race → id nhóm race }.
 */
export function mapShares(biome, { byId, groupOf }) {
  const elementShare = {}
  const raceShare = {}
  const total = biome.encounters.reduce((sum, entry) => sum + entry.weight, 0) || 1
  for (const { speciesId, weight } of biome.encounters) {
    const species = byId.get(speciesId)
    if (!species) continue
    const share = weight / total
    for (const elementId of species.elementIds) {
      elementShare[elementId] = (elementShare[elementId] ?? 0) + share
    }
    // Vũ khí diệt race ghi id race hoặc id nhóm race: cộng tỉ lệ cho cả hai.
    const raceKeys = new Set([species.raceId, groupOf.get(species.raceId)].filter(Boolean))
    for (const key of raceKeys) raceShare[key] = (raceShare[key] ?? 0) + share
  }
  return { elementShare, raceShare }
}

/** Trọng số theo tỉ lệ: map không có hệ / race đó thì 0, có thì ít nhất 1. */
const shareWeight = (share) => (share > 0 ? Math.max(1, Math.round(share * SHARE_WEIGHT)) : 0)

/**
 * Danh sách rơi `{ itemId, weight }` của map theo thứ tự items.json (bỏ món trọng số 0). `lookup`:
 * { byId, groupOf, items, namedSetIds: Set id bộ đặt tên }.
 */
export function mapEquipmentDrops(biome, lookup) {
  const { elementShare, raceShare } = mapShares(biome, lookup)
  const drops = []
  for (const item of lookup.items) {
    if (!isMapDrop(item, lookup.namedSetIds)) continue
    const { group, keys } = dropGroupOf(item)
    let weight = GROUP_WEIGHTS[group] ?? 0
    if (group === 'element') weight = shareWeight(sumOf(keys, elementShare))
    if (group === 'race') weight = shareWeight(sumOf(keys, raceShare))
    if (weight > 0) drops.push({ itemId: item.id, weight })
  }
  return drops
}

const sumOf = (keys, shares) => keys.reduce((sum, key) => sum + (shares[key] ?? 0), 0)

/** Biome kèm danh sách rơi đã tính lại (danh sách rỗng thì không có trường). */
export function withEquipmentDrops(biome, lookup) {
  const rest = { ...biome }
  delete rest.equipmentDrops
  const drops = mapEquipmentDrops(rest, lookup)
  return drops.length > 0 ? { ...rest, equipmentDrops: drops } : rest
}

/** Lookup đọc từ dữ liệu: { byId, groupOf, items, namedSetIds }. */
export function equipmentDropLookup({ species, races, items, equipmentSets }) {
  return {
    byId: new Map(species.map((entry) => [entry.id, entry])),
    groupOf: new Map(races.map((race) => [race.id, race.groupId])),
    items,
    namedSetIds: new Set(equipmentSets.filter((set) => set.kind === 'named').map((set) => set.id))
  }
}
