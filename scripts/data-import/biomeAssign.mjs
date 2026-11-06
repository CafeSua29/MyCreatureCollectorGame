/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Luật sinh biome từ danh sách map (scripts/data-import/biomes-source.json), hàm thuần, tất định
// theo md5 (cùng đầu vào luôn ra cùng biomes.json). Luật ở "Dữ liệu map ngẫu nhiên theo tầng"
// (docs/rules/content-data.md): gán loài theo môi trường sống (hệ, race, gợi ý loài), boss từ
// dạng cuối của loài trong map, đồ rơi / tỉ lệ khác nhau theo map. Script ghi file:
// biomes-import.mjs.

import { createHash } from 'node:crypto'

/** Số map tốt nhất mỗi loài được gán vào (ngoài các map gợi ý cứng của nó). */
export const MAPS_PER_SPECIES = 3
/** Map ít loài hơn số này thì bổ sung loài hợp nhất còn lại. */
export const MIN_SPECIES_PER_MAP = 40
/**
 * Phạt điểm theo số loài map đã nhận (mỗi loài −0,02): map hợp với cả một race / hệ đông loài không
 * nuốt hết loài đó, phần dư tràn sang map hợp kế tiếp.
 */
export const LOAD_PENALTY_PER_SPECIES = 0.02
/**
 * Boss nhắm tổng chỉ số gốc = hệ số này × tổng chỉ số gốc trung bình (theo trọng số gặp) của quái
 * hoang trong map: boss cỡ quái mạnh điển hình của map (đã nhân bossMultiplier ×2–5), không phải
 * huyền thoại mạnh nhất map. Chỉnh theo script mô phỏng (balance-numbers.md: 1,25 → 1,0).
 */
export const BOSS_STAT_RATIO = 1
/** Số boss ngẫu nhiên mỗi map (ngoài boss tầng). */
export const RANDOM_BOSSES_PER_MAP = 3
/** Dạng chỉ có trong trận / biến hình: không bao giờ gặp ngoài tự nhiên, không làm boss. */
export const BATTLE_ONLY_FORM_KINDS = ['mega', 'gmax', 'battleOnly']

/** Điểm khớp môi trường sống. */
const SCORE = {
  primaryElement: 3,
  primaryInMapOwnElements: 1,
  otherElement: 1,
  foreignElement: -1,
  faction: 5,
  softHint: 2
}

/** Đá tiến hóa theo hệ (rơi ở map có hệ đó). */
export const STONE_BY_ELEMENT = {
  fire: 'fireStone',
  water: 'waterStone',
  electric: 'thunderStone',
  grass: 'leafStone',
  ice: 'iceStone',
  fairy: 'moonStone',
  psychic: 'moonStone',
  light: 'shinyStone',
  dark: 'duskStone',
  ghost: 'duskStone',
  ground: 'earthStone',
  rock: 'earthStone',
  normal: 'dawnStone',
  flying: 'sunStone'
}

/** Bùa vùng rơi từ boss của map Pokémon cùng vùng. */
export const CHARM_BY_REGION = {
  Alola: 'alolaCharm',
  Galar: 'galarCharm',
  Hisui: 'hisuiCharm',
  Paldea: 'paldeaCharm'
}

/** Thuốc chữa trạng thái hợp môi trường của map (rơi ở map có môi trường đó). */
const CURE_BY_FIELD = {
  toxicMiasma: 'antidote',
  swampTerrain: 'antidote',
  sun: 'burnHeal',
  volcanicTerrain: 'burnHeal',
  ashfall: 'burnHeal',
  thunderstorm: 'paralyzeHeal',
  electricTerrain: 'paralyzeHeal',
  fog: 'awakening',
  darkness: 'awakening',
  psychicTerrain: 'awakening',
  cursedGround: 'fullHeal'
}

/** Số trong [0, 1) tất định theo các khóa (md5). */
export function hashUnit(...keys) {
  const hex = createHash('md5').update(keys.join('|')).digest('hex').slice(0, 12)
  return parseInt(hex, 16) / 2 ** 48
}

/** Số trong [min, max] theo khóa, làm tròn tới `step`. */
export function jitter(min, max, step, ...keys) {
  const value = min + (max - min) * hashUnit(...keys)
  return Math.round(value / step) * step
}

const round1 = (value) => Math.round(value * 10) / 10

/** Hệ của map: hệ của kiểu môi trường cộng hệ riêng của map. */
export function mapElements(map, themes) {
  return new Set([...(themes[map.theme]?.elements ?? []), ...map.elements])
}

/** Hệ không sống được ở map (theo kiểu môi trường). */
export function excludedElements(map, themes) {
  return new Set(themes[map.theme]?.excludeElements ?? [])
}

/** Loài Pokémon / Pal (gợi ý "pokemon"): dữ liệu Pokémon không có `source`. */
const isPokemonLike = (species) => species.source === undefined || species.source === 'palworld'

/**
 * Gợi ý cứng (phe Warhammer): loài của phe (rất ít loài) sống được ở map của phe dù không khớp hệ
 * và luôn được gán vào đó. Gợi ý mềm (race, "pokemon", "origin:<x>"): chỉ cộng điểm ưu tiên, loài
 * vẫn phải sống được ở map (khớp hệ, không mang hệ bị loại).
 */
export function hintMatch(species, map, factions) {
  let faction = false
  let soft = false
  for (const hint of map.speciesHints) {
    if (hint.startsWith('warhammer:')) {
      faction ||= factions[hint.slice('warhammer:'.length)]?.has(species.id) ?? false
    } else if (hint === 'pokemon') {
      soft ||= isPokemonLike(species)
    } else if (hint.startsWith('origin:')) {
      soft ||= species.origin === hint.slice('origin:'.length)
    } else {
      soft ||= species.raceId === hint
    }
  }
  return { faction, soft }
}

/**
 * Điểm khớp môi trường sống của loài với map; null = không sống được ở đó. Loài mang hệ bị loại
 * (cáo tuyết hệ băng ở núi lửa), loài race thủy sinh ở map không có hệ nước, hoặc không có hệ nào
 * khớp: không sống được, trừ loài của phe Warhammer ở map của phe. `relaxed`: bỏ luật hệ bị loại
 * và luật thủy sinh (chỉ dùng cho loài không sống được ở map nào, để loài nào cũng gặp được). Loài
 * không hệ (data.md mục "Loài không hệ") sống được mọi map (trừ luật thủy sinh), điểm hệ trung tính.
 */
export function habitatScore(species, map, ctx, { relaxed = false } = {}) {
  const elements = mapElements(map, ctx.themes)
  const excluded = excludedElements(map, ctx.themes)
  const { faction, soft } = hintMatch(species, map, ctx.factions)
  const [primary, ...others] = species.elementIds
  const typeless = species.elementIds.length === 0
  const matched = species.elementIds.filter((id) => elements.has(id)).length
  const livable =
    (typeless || matched > 0) &&
    (relaxed ||
      (!species.elementIds.some((id) => excluded.has(id)) &&
        (species.raceId !== 'aquatic' || elements.has('water'))))
  if (!livable && !faction) return null
  let score = 0
  if (typeless) return score + (faction ? SCORE.faction : 0) + (soft ? SCORE.softHint : 0)
  if (elements.has(primary)) score += SCORE.primaryElement
  if (map.elements.includes(primary)) score += SCORE.primaryInMapOwnElements
  for (const id of others) score += elements.has(id) ? SCORE.otherElement : SCORE.foreignElement
  if (!elements.has(primary)) score += SCORE.foreignElement
  if (faction) score += SCORE.faction
  if (soft) score += SCORE.softHint
  return score
}

/** Loài gặp được ngoài tự nhiên: loài thường, dạng đầu của chuỗi tiến hóa, không phải dạng trong trận. */
export function wildCandidates(species) {
  const evolvedInto = new Set()
  for (const s of species)
    for (const evolution of s.evolutions ?? []) evolvedInto.add(evolution.speciesId)
  return species.filter(
    (s) =>
      s.kind === 'normal' && !BATTLE_ONLY_FORM_KINDS.includes(s.formKind) && !evolvedInto.has(s.id)
  )
}

/**
 * Gán loài vào map: mỗi loài vào MAPS_PER_SPECIES map hợp nhất (điểm trừ phạt theo số loài map đã
 * nhận; hòa thì theo md5) và mọi map của phe Warhammer của nó; map còn dưới MIN_SPECIES_PER_MAP loài
 * thì bổ sung loài hợp nhất còn lại. Trả về Map<mapId, speciesId[]>.
 */
export function assignSpecies({ candidates, maps, ctx }) {
  const assigned = new Map(maps.map((map) => [map.id, new Set()]))
  const ordered = [...candidates].sort((a, b) => hashUnit('order', a.id) - hashUnit('order', b.id))
  for (const species of ordered) {
    let scored = scoreMaps(species, maps, ctx, false)
    if (scored.length === 0) scored = scoreMaps(species, maps, ctx, true)
    const effective = (entry) =>
      entry.score - LOAD_PENALTY_PER_SPECIES * assigned.get(entry.map.id).size
    scored.sort(
      (a, b) =>
        effective(b) - effective(a) ||
        hashUnit(species.id, a.map.id) - hashUnit(species.id, b.map.id)
    )
    const chosen = new Set(scored.slice(0, MAPS_PER_SPECIES).map((entry) => entry.map.id))
    for (const entry of scored) if (entry.faction) chosen.add(entry.map.id)
    for (const mapId of chosen) assigned.get(mapId).add(species.id)
  }
  for (const map of maps) fillMap(map, assigned.get(map.id), candidates, ctx)
  return new Map([...assigned].map(([mapId, ids]) => [mapId, [...ids]]))
}

/** Điểm của loài ở mọi map nó sống được. */
function scoreMaps(species, maps, ctx, relaxed) {
  const scored = []
  for (const map of maps) {
    const score = habitatScore(species, map, ctx, { relaxed })
    if (score !== null) {
      scored.push({ map, score, faction: hintMatch(species, map, ctx.factions).faction })
    }
  }
  return scored
}

/** Bổ sung loài hợp nhất (chưa có trong map) cho tới MIN_SPECIES_PER_MAP. */
function fillMap(map, ids, candidates, ctx) {
  if (ids.size >= MIN_SPECIES_PER_MAP) return
  const extra = candidates
    .filter((s) => !ids.has(s.id))
    .map((s) => ({ s, score: habitatScore(s, map, ctx) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score - a.score || hashUnit(map.id, a.s.id) - hashUnit(map.id, b.s.id))
  for (const { s } of extra) {
    if (ids.size >= MIN_SPECIES_PER_MAP) break
    ids.add(s.id)
  }
}

/** Trọng số gặp: catchRate của loài (dễ bắt thì hay gặp), tối thiểu 1. */
export const encounterWeight = (species) => Math.max(1, Math.round(species.catchRate ?? 1))

/** Tổng chỉ số gốc. */
export const baseStatTotal = (species) =>
  Object.values(species.baseStats).reduce((sum, value) => sum + value, 0)

/** Mọi dạng cuối (không tiến hóa tiếp) của chuỗi bắt đầu từ loài, bỏ dạng trong trận. */
export function finalForms(speciesId, byId) {
  const result = new Set()
  const stack = [speciesId]
  const seen = new Set()
  while (stack.length > 0) {
    const id = stack.pop()
    if (seen.has(id)) continue
    seen.add(id)
    const species = byId.get(id)
    if (
      !species ||
      species.kind !== 'normal' ||
      BATTLE_ONLY_FORM_KINDS.includes(species.formKind)
    ) {
      continue
    }
    const next = (species.evolutions ?? []).map((evolution) => evolution.speciesId)
    if (next.length === 0) result.add(id)
    else stack.push(...next)
  }
  return [...result]
}

/** Tổng chỉ số gốc trung bình của quái hoang trong map, theo trọng số gặp. */
export function averageWildTotal(encounters, byId) {
  let weight = 0
  let total = 0
  for (const entry of encounters) {
    weight += entry.weight
    total += entry.weight * baseStatTotal(byId.get(entry.speciesId))
  }
  return weight > 0 ? total / weight : 0
}

/**
 * Ứng viên boss của map: dạng cuối của loài trong map, xếp theo: khớp gợi ý (cứng hoặc mềm) trước,
 * rồi tổng chỉ số gốc gần `targetTotal` hơn, rồi md5.
 */
export function bossCandidates(map, speciesIds, byId, ctx, targetTotal) {
  const finals = new Set(speciesIds.flatMap((id) => finalForms(id, byId)))
  return [...finals]
    .map((id) => {
      const species = byId.get(id)
      const { faction, soft } = hintMatch(species, map, ctx.factions)
      return { id, hinted: faction || soft, total: baseStatTotal(species) }
    })
    .sort(
      (a, b) =>
        Number(b.hinted) - Number(a.hinted) ||
        Math.abs(a.total - targetTotal) - Math.abs(b.total - targetTotal) ||
        hashUnit(map.id, a.id) - hashUnit(map.id, b.id)
    )
}

/**
 * Boss tầng = ứng viên đầu tiên chưa làm boss tầng ở map khác (khác nhau giữa các map nếu được);
 * boss ngẫu nhiên = RANDOM_BOSSES_PER_MAP ứng viên tiếp theo. Mọi boss có weight 1.
 */
export function pickBosses(candidates, usedFloorBosses) {
  if (candidates.length === 0) return null
  const floorBoss = candidates.find((c) => !usedFloorBosses.has(c.id)) ?? candidates[0]
  usedFloorBosses.add(floorBoss.id)
  const others = candidates.filter((c) => c.id !== floorBoss.id).slice(0, RANDOM_BOSSES_PER_MAP)
  return { floorBossSpeciesId: floorBoss.id, randomBossIds: others.map((c) => c.id) }
}

/** Đổi { id: trọng số } của nguồn thành danh sách { fieldId, weight } (bỏ trọng số ≤ 0). */
export const fieldEntries = (weights) =>
  Object.entries(weights ?? {})
    .filter(([, weight]) => weight > 0)
    .map(([fieldId, weight]) => ({ fieldId, weight }))

/** Đấu trường boss: chỉ lớp có ghi. */
export function bossFieldOf(map, themes) {
  const source = map.bossField ?? themes[map.theme]?.bossField ?? {}
  const result = {}
  if (source.weather) result.weather = source.weather
  if (source.terrain) result.terrain = source.terrain
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Đồ rơi thường của map: bóng, thuốc theo tỉ lệ khác nhau mỗi map (md5), thuốc chữa trạng thái hợp
 * môi trường của map, đá tiến hóa theo hệ của map.
 */
export function mapDrops(map, elements) {
  const at = (key, min, max, step = 1) => jitter(min, max, step, map.id, key)
  const drops = [
    { itemId: 'basicBall', chance: at('basicBall', 6, 18) },
    { itemId: 'potion', chance: at('potion', 5, 16) },
    { itemId: 'greatBall', chance: at('greatBall', 1, 6) },
    { itemId: 'superPotion', chance: at('superPotion', 1, 6) },
    { itemId: 'revive', chance: round1(at('revive', 0.5, 2.5, 0.1)) },
    { itemId: 'genderPotion', chance: at('genderPotion', 1, 3) }
  ]
  const fieldIds = [...Object.keys(map.weather ?? {}), ...Object.keys(map.terrain ?? {})]
  const cures = new Set(fieldIds.map((id) => CURE_BY_FIELD[id]).filter(Boolean))
  for (const itemId of cures) drops.push({ itemId, chance: at(itemId, 3, 8) })
  const stones = new Set([...elements].map((id) => STONE_BY_ELEMENT[id]).filter(Boolean))
  for (const itemId of stones) drops.push({ itemId, chance: round1(at(itemId, 0.5, 2, 0.1)) })
  return drops
}

/**
 * Đồ rơi chung cho boss của map: bóng tốt hoặc cao cấp, thuốc hồi sinh, đá tiến hóa của hệ chủ đạo
 * đầu tiên có đá, bùa vùng với map Pokémon của vùng có dạng vùng miền.
 */
export function mapBossDrops(map) {
  const at = (key, min, max) => jitter(min, max, 1, map.id, 'boss', key)
  const ball = hashUnit(map.id, 'bossBall') < 0.5 ? 'greatBall' : 'ultraBall'
  const drops = [
    { itemId: ball, chance: at('ball', 30, 60) },
    { itemId: 'revive', chance: at('revive', 10, 25) }
  ]
  const stone = map.elements.map((id) => STONE_BY_ELEMENT[id]).find(Boolean)
  if (stone) drops.push({ itemId: stone, chance: at('stone', 15, 40) })
  const charm = map.source === 'pokemon' ? CHARM_BY_REGION[map.region] : undefined
  if (charm) drops.push({ itemId: charm, chance: at('charm', 15, 30) })
  return drops
}

/** Tỉ lệ gặp 2 quái / gặp boss ngẫu nhiên khác nhau mỗi map. */
export function mapChances(map, bossChance) {
  return {
    doubleChance: jitter(30, 70, 1, map.id, 'double'),
    bossChance: round1(jitter(bossChance * 0.5, bossChance * 1.5, 0.1, map.id, 'bossChance'))
  }
}
