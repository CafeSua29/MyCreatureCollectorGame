// Kiểm tra dữ liệu câu cá và khai thác (docs/rules/gathering.md): config.gathering (quái theo hệ /
// nhóm race, bảng vật phẩm, cấp dụng cụ), cờ `gathering` của biome, cấp dụng cụ của bùa không vượt
// số cấp của config.

import { GATHERING_METHODS, type GameData, type GatheringMethod } from '../model'
import { GATHERING_METHOD_RULES, checkIdList, gatheringEncounters } from '../registries'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkChestItems, checkKnownFields } from './checks'

/**
 * Bảng vật phẩm: { itemId, weight, min, max } như rương, thêm minTier nguyên trong [1, số cấp] và
 * mapElementId là hệ tồn tại.
 */
function checkItems(
  data: GameData,
  { value, tierCount, at }: { value: unknown; tierCount: number; at: string },
  issues: string[]
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${at} phải là danh sách không rỗng`)
    return
  }
  const entries = value.map((raw: unknown, i) => {
    const { minTier, mapElementId, ...entry } = asObject(raw) ?? {}
    const where = `${at}[${i}]`
    if (minTier !== undefined) {
      issues.push(...checkInteger(minTier, `${where}.minTier`, 1))
      if (typeof minTier === 'number' && minTier > tierCount) {
        issues.push(`${where}.minTier vượt số cấp dụng cụ (${tierCount})`)
      }
    }
    if (mapElementId !== undefined && !Object.hasOwn(data.elements, String(mapElementId))) {
      issues.push(`${where}.mapElementId: hệ không tồn tại "${String(mapElementId)}"`)
    }
    return entry
  })
  checkChestItems(data, entries, at, issues)
}

function checkTiers(value: unknown, at: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${at} phải là danh sách không rỗng`)
    return
  }
  value.forEach((raw: unknown, i) => {
    const tier = asObject(raw) ?? {}
    const where = `${at}[${i}]`
    checkKnownFields(tier, ['rarityExponent', 'levelOffset', 'itemRolls'], where, 'cấp', issues)
    issues.push(...checkNumber(tier.rarityExponent, `${where}.rarityExponent`, 0))
    issues.push(...checkInteger(tier.levelOffset, `${where}.levelOffset`))
    issues.push(...checkInteger(tier.itemRolls, `${where}.itemRolls`, 1))
  })
}

/** Số của một cách thu thập. Trả về false nếu không phải object (bỏ qua phần kiểm tra theo map). */
function checkMethodConfig(
  data: GameData,
  { value, at }: { value: unknown; at: string },
  issues: string[]
): boolean {
  const config = asObject(value)
  if (!config) {
    issues.push(`${at} phải là { battleChance, elementIds, raceGroupIds, items, tiers }`)
    return false
  }
  const fields = ['battleChance', 'elementIds', 'raceGroupIds', 'items', 'tiers']
  checkKnownFields(config, fields, at, 'config', issues)
  issues.push(...checkNumber(config.battleChance, `${at}.battleChance`, 0, 100))
  const lists = [
    { key: 'elementIds', known: data.elements, label: 'hệ' },
    { key: 'raceGroupIds', known: data.raceGroups, label: 'nhóm race' }
  ] as const
  for (const { key, known, label } of lists) {
    issues.push(...checkIdList(config[key], `${at}.${key}`, known, { label, allowEmpty: true }))
  }
  checkTiers(config.tiers, `${at}.tiers`, issues)
  const tierCount = Array.isArray(config.tiers) ? config.tiers.length : 1
  checkItems(data, { value: config.items, tierCount, at: `${at}.items` }, issues)
  return Array.isArray(config.elementIds) && Array.isArray(config.raceGroupIds)
}

/** Cờ gathering của biome: chỉ các cách trong GATHERING_METHODS, ghi true, có quái gặp được. */
function checkBiomeGathering(
  data: GameData,
  validMethods: ReadonlySet<GatheringMethod>,
  issues: string[]
): void {
  for (const biome of Object.values(data.biomes)) {
    if (biome.gathering === undefined) continue
    const where = `Biome "${biome.id}": gathering`
    const gathering = asObject(biome.gathering)
    if (!gathering) {
      issues.push(`${where} phải là object`)
      continue
    }
    checkKnownFields(gathering, GATHERING_METHODS, where, 'cách thu thập', issues)
    for (const method of GATHERING_METHODS) {
      if (gathering[method] === undefined) continue
      if (gathering[method] !== true) {
        issues.push(`${where}.${method} chỉ được ghi true (bỏ trống = không có)`)
        continue
      }
      if (validMethods.has(method) && gatheringEncounters(data, biome, method).length === 0) {
        issues.push(`${where}.${method}: map không có loài nào hợp config.gathering.${method}`)
      }
    }
  }
  // Câu cá / khai thác chỉ làm ở tầng: map hiểm địa có gathering thì không bao giờ dùng tới.
  for (const zone of Object.values(data.zones)) {
    if ('gathering' in zone.map) {
      issues.push(`Hiểm địa "${zone.id}": map không có gathering (chỉ map của tầng)`)
    }
  }
}

/** Bùa cấp dụng cụ: cấp ≤ số cấp của config cách thu thập đó. */
function checkToolTiers(data: GameData, issues: string[]): void {
  for (const item of Object.values(data.items)) {
    if (item.category !== 'charm' || !Array.isArray(item.effects)) continue
    for (const method of GATHERING_METHODS) {
      const tierCount = data.config.gathering?.[method]?.tiers?.length ?? 0
      const effect = item.effects.find((e) => e.type === GATHERING_METHOD_RULES[method].toolEffect)
      if (effect && effect.value > tierCount) {
        issues.push(
          `Vật phẩm "${item.id}": ${effect.type} ${effect.value} vượt số cấp của config.gathering.${method} (${tierCount})`
        )
      }
    }
  }
}

/** Kiểm tra config.gathering, cờ gathering của biome và cấp dụng cụ. */
export function checkGatheringData(data: GameData, issues: string[]): void {
  const at = 'config.gathering'
  const config = asObject(data.config.gathering)
  if (!config) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(config, GATHERING_METHODS, at, 'config', issues)
  const validMethods = new Set(
    GATHERING_METHODS.filter((method) =>
      checkMethodConfig(data, { value: config[method], at: `${at}.${method}` }, issues)
    )
  )
  checkBiomeGathering(data, validMethods, issues)
  checkToolTiers(data, issues)
}
