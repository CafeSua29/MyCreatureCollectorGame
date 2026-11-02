// Sinh đội ngự thú sư NPC (docs/rules/trainers.md): lớp NPC gặp ở map, loài theo hệ của lớp (hoặc
// của đạo quán), level / gen theo tầng như quái hoang, trang bị theo map, trận pháp. Mọi ngẫu nhiên
// đi qua RNG có seed.

import { isFormationMet, partySlotsOf, partySlotsUsed } from '../registries'
import { nextInt, pick, pickWeighted, type RngState } from '../shared'
import { BATTLE_FORM_KINDS } from '../model'
import type {
  Biome,
  EncounterEntry,
  EquipmentInstance,
  GameData,
  Gym,
  Monster,
  NormalRarity,
  TrainerClass,
  WeightedItem
} from '../model'
import { equipmentInstanceId, rollEquipment, rollRarity, pickZCrystalFor } from '../inventory'
import {
  rollBossTransformTraits,
  rollMonster,
  rollSpawnAge,
  type MonsterRollSpec
} from './encounter'
import { floorGeneMultiplier, floorLevelRange, type FloorSite } from './floors'

/** Loài hoang (xuất hiện trong bảng gặp của ít nhất một map), theo thứ tự map; mỗi loài một lần. */
/** Hệ của loài thường (loài trong bảng gặp luôn là loài thường; loài fused không có hệ riêng). */
function speciesElements(data: GameData, speciesId: string): readonly string[] {
  const species = data.species[speciesId]
  return species?.kind === 'normal' ? species.elementIds : []
}

const wildSpeciesCache = new WeakMap<GameData['biomes'], string[]>()

function wildSpeciesIds(data: GameData): string[] {
  const cached = wildSpeciesCache.get(data.biomes)
  if (cached) return cached
  const ids = [
    ...new Set(Object.values(data.biomes).flatMap((b) => b.encounters.map((e) => e.speciesId)))
  ]
  wildSpeciesCache.set(data.biomes, ids)
  return ids
}

/**
 * Bảng loài của đội NPC: mọi loài thường trừ dạng chỉ có trong trận, có ít nhất một hệ thuộc
 * `elementIds` (rỗng = mọi loài); loài hoang trọng số 1, loài không gặp ở map nào trọng số
 * nonWildSpeciesWeight; không loài nào khớp thì lấy mọi loài.
 */
export function trainerSpeciesPool(
  data: GameData,
  elementIds: readonly string[]
): readonly EncounterEntry[] {
  // Chỉ phụ thuộc dữ liệu: tính một lần cho mỗi bộ hệ (mỗi trận NPC đều cần, hàng nghìn loài hoang).
  let byElements = trainerPoolCache.get(data)
  if (!byElements) {
    byElements = new Map()
    trainerPoolCache.set(data, byElements)
  }
  const key = elementIds.join('|')
  const cached = byElements.get(key)
  if (cached) return cached
  const pool = buildTrainerSpeciesPool(data, elementIds)
  byElements.set(key, pool)
  return pool
}

const trainerPoolCache = new WeakMap<GameData, Map<string, readonly EncounterEntry[]>>()

function buildTrainerSpeciesPool(
  data: GameData,
  elementIds: readonly string[]
): readonly EncounterEntry[] {
  const wild = new Set(wildSpeciesIds(data))
  const { nonWildSpeciesWeight } = data.config.trainers
  const all: EncounterEntry[] = [
    ...[...wild].map((speciesId) => ({ speciesId, weight: 1 })),
    ...Object.values(data.species).flatMap((species) =>
      species.kind === 'normal' &&
      !wild.has(species.id) &&
      !BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate') &&
      nonWildSpeciesWeight > 0
        ? [{ speciesId: species.id, weight: nonWildSpeciesWeight }]
        : []
    )
  ]
  if (elementIds.length === 0) return all
  const matching = all.filter((entry) =>
    speciesElements(data, entry.speciesId).some((e) => elementIds.includes(e))
  )
  return matching.length > 0 ? matching : all
}

/** Lớp NPC thường (không phải quán chủ). */
export const regularTrainerClasses = (data: GameData): TrainerClass[] =>
  Object.values(data.trainers).filter((c) => c.kind === 'regular')

/**
 * Lớp NPC gặp được ở map, kèm trọng số: map có `trainerClassIds` thì đều nhau trong danh sách đó;
 * không thì mọi lớp thường, lớp mọi hệ trọng số 1, lớp theo hệ = phần trọng số gặp của các loài
 * trong map có hệ thuộc lớp (0 thì không gặp ở map này).
 */
export function biomeTrainerClasses(
  data: GameData,
  biome: Biome
): { trainerClass: TrainerClass; weight: number }[] {
  const { offThemeClassWeight } = data.config.trainers
  if (biome.trainerClassIds) {
    // Lớp map khai riêng trọng số 1; lớp thường khác vẫn có cơ hội (offThemeClassWeight).
    const listed = biome.trainerClassIds.map((id) => ({
      trainerClass: data.trainers[id],
      weight: 1
    }))
    const others = regularTrainerClasses(data).filter(
      (trainerClass) => !biome.trainerClassIds?.includes(trainerClass.id)
    )
    return offThemeClassWeight > 0
      ? [
          ...listed,
          ...others.map((trainerClass) => ({ trainerClass, weight: offThemeClassWeight }))
        ]
      : listed
  }
  const total = biome.encounters.reduce((sum, entry) => sum + entry.weight, 0)
  return regularTrainerClasses(data).flatMap((trainerClass) => {
    if (trainerClass.elementIds.length === 0) return [{ trainerClass, weight: 1 }]
    const share = biome.encounters
      .filter((entry) =>
        speciesElements(data, entry.speciesId).some((e) => trainerClass.elementIds.includes(e))
      )
      .reduce((sum, entry) => sum + entry.weight, 0)
    // Map không có loài đúng hệ của lớp: vẫn có cơ hội gặp, trọng số offThemeClassWeight.
    const weight = total > 0 && share > 0 ? share / total : offThemeClassWeight
    return weight > 0 ? [{ trainerClass, weight }] : []
  })
}

/** Đội NPC đã sinh: quái, trận pháp đội đủ điều kiện (null = không), RNG và bộ đếm id mới. */
export interface TrainerTeam {
  enemies: Monster[]
  formationId: string | null
  rng: RngState
  nextMonsterId: number
  nextItemId: number
}

export interface TrainerTeamSpec {
  site: FloorSite
  trainerClass: TrainerClass
  /** Hệ lấy loài (đạo quán); bỏ trống = hệ của lớp. */
  elementIds?: readonly string[]
  /** Level cộng thêm ngoài levelOffset của lớp (vòng giải đấu, bậc đấu trường). */
  extraLevels: number
  /** Cảnh giới ngự thú sư NPC: cảnh giới khế ước của quái. */
  realm: number
  nextMonsterId: number
  nextItemId: number
}

/**
 * Trang bị của quái NPC: `equipmentSlots` món, mỗi món tung theo danh sách trang bị rơi của map và
 * bảng bậc của quái hoang. Map không có danh sách thì không mang gì, không tốn RNG.
 */
function equipTrainerMonster(
  data: GameData,
  rng: RngState,
  {
    monster,
    site,
    slots,
    nextItemId
  }: {
    monster: Monster
    site: FloorSite
    slots: number
    nextItemId: number
  }
): { monster: Monster; rng: RngState; nextItemId: number } {
  const candidates = (site.biome.equipmentDrops ?? []).filter((entry) => entry.weight > 0)
  if (candidates.length === 0 || slots === 0) return { monster, rng, nextItemId }
  const equipment = [...monster.equipment]
  for (let i = 0; i < slots; i++) {
    let entry: WeightedItem
    ;[entry, rng] = pickWeighted(rng, candidates, (candidate) => candidate.weight)
    let rarity: NormalRarity
    ;[rarity, rng] = rollRarity(data, rng, data.config.equipment.rarityWeights, site.floor)
    let instance: EquipmentInstance
    ;[instance, rng] = rollEquipment(data, rng, {
      itemId: entry.itemId,
      rarity,
      id: equipmentInstanceId(nextItemId)
    })
    nextItemId++
    equipment.push({ storage: 'instance', instance })
  }
  return { monster: { ...monster, equipment }, rng, nextItemId }
}

/**
 * Lớp NPC biến hình được (quán chủ) có Vòng Z: quái chủ lực (con cuối đội) cầm một Z-Crystal hợp
 * skill của nó (pickZCrystalFor, ưu tiên hệ đạo quán; docs/rules/z-moves.md). Không tốn RNG.
 */
function holdAceZCrystal(
  data: GameData,
  enemies: Monster[],
  preferredElementId: string | undefined
): void {
  const ace = enemies.at(-1)
  if (!ace) return
  const crystal = pickZCrystalFor(data, ace, { preferredElementId })
  if (!crystal) return
  enemies[enemies.length - 1] = {
    ...ace,
    equipment: [...ace.equipment, { storage: 'stack', itemId: crystal.id }]
  }
}

/**
 * Sinh đội NPC: số ô đội trong `teamSize` (quái lớn chiếm largePartySlots ô; quái lớn tung ra mà
 * không đủ ô còn lại thì đội dừng ở đó; docs/rules/monster-size.md); mỗi quái loài theo bảng loài, level như quái hoang của
 * tầng + levelOffset + extraLevels (tối thiểu 1), gen theo tầng, không shiny, đã khế ước theo cảnh
 * giới NPC; lớp biến hình được thì tung trường biến hình như boss; rồi trang bị. Trận pháp: mục đầu
 * tiên của `formationIds` đội đủ điều kiện.
 */
export function generateTrainerTeam(
  data: GameData,
  rng: RngState,
  spec: TrainerTeamSpec
): TrainerTeam {
  const { site, trainerClass, realm } = spec
  let { nextMonsterId, nextItemId } = spec
  const levels = floorLevelRange(data, site.floor)
  const offset = trainerClass.levelOffset + spec.extraLevels
  const rollSpec: MonsterRollSpec = {
    encounters: trainerSpeciesPool(data, spec.elementIds ?? trainerClass.elementIds),
    levelMin: Math.max(1, levels.min + offset),
    levelMax: Math.max(1, levels.max + offset),
    geneMultiplier: floorGeneMultiplier(data, site.floor),
    shinyChance: 0,
    aging: site.aging
  }
  let size: number
  ;[size, rng] = nextInt(rng, trainerClass.teamSize.min, trainerClass.teamSize.max)
  const enemies: Monster[] = []
  while (partySlotsUsed(data, enemies) < size) {
    let monster: Monster
    ;[monster, rng] = rollMonster(data, rng, rollSpec, `m${nextMonsterId}`)
    nextMonsterId++
    if (partySlotsUsed(data, enemies) + partySlotsOf(data, monster) > size) break
    ;[monster, rng] = rollSpawnAge(data, rng, monster, data.config.lifespan.spawnAgePercent.wild)
    if (trainerClass.transforms) {
      ;[monster, rng] = rollBossTransformTraits(data, rng, { floor: site.floor, boss: monster })
    }
    const equipped = equipTrainerMonster(data, rng, {
      monster: { ...monster, contractRealm: realm },
      site,
      slots: trainerClass.equipmentSlots,
      nextItemId
    })
    rng = equipped.rng
    nextItemId = equipped.nextItemId
    enemies.push(equipped.monster)
  }
  if (trainerClass.transforms) holdAceZCrystal(data, enemies, spec.elementIds?.[0])
  const formationId =
    trainerClass.formationIds.find((id) => isFormationMet(data, id, enemies)) ?? null
  return { enemies, formationId, rng, nextMonsterId, nextItemId }
}

/** Tung lớp NPC gặp ở map theo trọng số; null = map không có lớp nào (không tốn RNG). */
export function rollBiomeTrainerClass(
  data: GameData,
  rng: RngState,
  biome: Biome
): [TrainerClass | null, RngState] {
  const options = biomeTrainerClasses(data, biome)
  if (options.length === 0) return [null, rng]
  const [chosen, next] = pickWeighted(rng, options, (option) => option.weight)
  return [chosen.trainerClass, next]
}

/** Tung đều một lớp NPC thường (giải đấu, đấu trường). */
export function rollRegularTrainerClass(data: GameData, rng: RngState): [TrainerClass, RngState] {
  return pick(rng, regularTrainerClasses(data))
}

/**
 * Lớp NPC của đạo quán hệ `elementId`: lớp thường có hệ đó; không có thì lớp thường mọi hệ; không
 * có nữa thì mọi lớp thường.
 */
export function gymTrainerClasses(data: GameData, elementId: string): TrainerClass[] {
  const regular = regularTrainerClasses(data)
  const themed = regular.filter((c) => c.elementIds.includes(elementId))
  if (themed.length > 0) return themed
  const general = regular.filter((c) => c.elementIds.length === 0)
  return general.length > 0 ? general : regular
}

/** Hệ có ít nhất một loài hoang (đạo quán chỉ lấy các hệ này), theo thứ tự elements.json. */
export function gymElementIds(data: GameData): string[] {
  const wild = wildSpeciesIds(data)
  return Object.keys(data.elements).filter((elementId) =>
    wild.some((id) => speciesElements(data, id).includes(elementId))
  )
}

/** Tầng `floor` có đạo quán không (mỗi config.trainers.gym.every tầng). */
export const isGymFloor = (data: GameData, floor: number): boolean =>
  floor % data.config.trainers.gym.every === 0

/**
 * Đạo quán mới của tầng vừa mở (tầng có đạo quán): hệ đều trong các hệ có loài hoang, số NPC trước
 * quán chủ trong config.trainers.gym.trainerCount.
 */
export function rollGym(data: GameData, rng: RngState, floor: number): [Gym, RngState] {
  let elementId: string
  ;[elementId, rng] = pick(rng, gymElementIds(data))
  const { min, max } = data.config.trainers.gym.trainerCount
  let trainerCount: number
  ;[trainerCount, rng] = nextInt(rng, min, max)
  return [{ floor, elementId, trainerCount, progress: 0, wins: 0 }, rng]
}
