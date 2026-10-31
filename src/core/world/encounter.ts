// Sinh quái hoang, boss ngẫu nhiên và boss tầng theo tầng. Mọi ngẫu nhiên đi qua RNG có seed.

import {
  addShinyStacks,
  expForLevel,
  newLifeFields,
  rollGender,
  rollAbilitySlot,
  rollNature,
  rollWildBloodlines,
  rollSpawnPolarity,
  uniformBigStats,
  emptySoulLevels,
  emptyEffortValues
} from '../monster'
import {
  activeTimeMultiplier,
  ageDaysAtPercent,
  bloodlineGroupsOf,
  isLargeMonster,
  purityOf,
  withPurity
} from '../registries'
import {
  BIG_ZERO,
  floorBig,
  nextBigInt,
  nextInt,
  pick,
  pickWeighted,
  rollPercent,
  type Decimal,
  type RngState
} from '../shared'
import {
  DEFAULT_GROWTH_RATE,
  type AbilitySlot,
  STAT_NAMES,
  STELLAR,
  type GameData,
  type Monster,
  type NormalSpecies,
  type BigStats,
  type TraitDef,
  type TraitInstance,
  type Biome,
  type BiomeBoss,
  type EncounterEntry,
  type EquipmentInstance,
  type EquipmentItem,
  type PercentRange
} from '../model'
import { canHaveGmaxFactor, equipmentInstanceId, rollEquipment, uniquePoolOf } from '../inventory'
import { floorBossLevel, floorGeneMultiplier, floorLevelRange, type FloorSite } from './floors'

/** Skill quái biết khi ở level này: các skill học gần nhất, tối đa maxSkills. */
export function skillsAtLevel(data: GameData, species: NormalSpecies, level: number): string[] {
  const learned: string[] = []
  const entries = species.learnset
    .filter((entry) => entry.level <= level)
    .sort((a, b) => a.level - b.level)
  for (const { skillId } of entries) {
    if (!learned.includes(skillId)) learned.push(skillId)
  }
  return learned.slice(-data.config.maxSkills)
}

/**
 * Gen random đều trong [geneMin × hệ số, geneMax × hệ số] (làm tròn xuống). Hệ số 1 cho đúng
 * kết quả như tung nextInt(geneMin, geneMax).
 */
function rollGenes(data: GameData, rng: RngState, multiplier: Decimal): [BigStats, RngState] {
  const { geneMin, geneMax } = data.config.wild
  const low = floorBig(multiplier.times(geneMin))
  const high = floorBig(multiplier.times(geneMax))
  const genes = {} as BigStats
  for (const stat of STAT_NAMES) {
    ;[genes[stat], rng] = nextBigInt(rng, low, high)
  }
  return [genes, rng]
}

/** Trait theo loại, giữ thứ tự của data.traits (tính một lần cho mỗi bộ dữ liệu). */
const traitsByKindCache = new WeakMap<GameData['traits'], Map<TraitDef['kind'], TraitDef[]>>()

function traitsByKind(data: GameData): Map<TraitDef['kind'], TraitDef[]> {
  const cached = traitsByKindCache.get(data.traits)
  if (cached) return cached
  const groups = new Map<TraitDef['kind'], TraitDef[]>()
  for (const trait of Object.values(data.traits)) {
    const group = groups.get(trait.kind)
    if (group) group.push(trait)
    else groups.set(trait.kind, [trait])
  }
  traitsByKindCache.set(data.traits, groups)
  return groups
}

/**
 * Tung một trait cho ô kế tiếp: loại theo `traitKindWeights` (trong các loại còn trait chọn được;
 * chỉ một loại thì không tốn RNG), rồi trait đều trong loại đó. null = hết trait chọn được.
 */
function rollTraitForSlot(
  data: GameData,
  rng: RngState,
  isAllowed: (trait: TraitDef) => boolean
): [TraitDef | null, RngState] {
  const weights = data.config.wild.traitKindWeights
  const groups = traitsByKind(data)
  const kinds = [...groups.keys()].filter(
    (kind) => (weights[kind] ?? 0) > 0 && (groups.get(kind) ?? []).some(isAllowed)
  )
  if (kinds.length === 0) return [null, rng]
  let kind = kinds[0]
  if (kinds.length > 1) [kind, rng] = pickWeighted(rng, kinds, (entry) => weights[entry] ?? 0)
  return pick(rng, (groups.get(kind) ?? []).filter(isAllowed))
}

/** Random trait cho quái hoang, không lấy hai trait cùng nhóm loại trừ. */
function rollTraits(data: GameData, rng: RngState): [TraitInstance[], RngState] {
  const { traitCountWeights } = data.config.wild
  const counts = traitCountWeights.map((weight, count) => ({ weight, count }))
  let target: { count: number }
  ;[target, rng] = pickWeighted(rng, counts, (entry) => entry.weight)
  const count = Math.min(target.count, data.config.traitSlots.initial)

  const chosen: TraitDef[] = []
  for (let i = 0; i < count; i++) {
    const isAllowed = (trait: TraitDef): boolean =>
      !chosen.includes(trait) &&
      (trait.exclusiveGroup === undefined ||
        !chosen.some((other) => other.exclusiveGroup === trait.exclusiveGroup))
    let trait: TraitDef | null
    ;[trait, rng] = rollTraitForSlot(data, rng, isAllowed)
    if (trait === null) break
    chosen.push(trait)
  }
  return [chosen.map((trait) => ({ id: trait.id, level: 1 })), rng]
}

/** Cách random một quái: loài theo trọng số, level trong khoảng, hệ số gen, tỉ lệ shiny. */
export interface MonsterRollSpec {
  encounters: readonly EncounterEntry[]
  levelMin: number
  levelMax: number
  /** Nhân khoảng gen quái hoang (floorGeneMultiplier của tầng; 1 = không đổi). */
  geneMultiplier: Decimal
  shinyChance: number
  /** Quái có già đi không (= options.lifespanEnabled của game). */
  aging: boolean
}

/**
 * Random một quái theo spec. Thứ tự tung: loài → level → gender → gen → trait → shiny → hệ Tera →
 * tính cách → ô ability (chỉ loài có ability) → huyết mạch (chỉ loài thuộc nhóm) (luật mới thêm vào
 * cuối để không làm đổi các giá trị random phía trước). Hệ Tera random trong hệ
 * của chính nó (như Pokémon); boss tung lại theo luật boss (rollBossTransformTraits). Quái mới
 * ở tuổi 0; quái hoang / boss tung tuổi sau cùng bằng rollSpawnAge.
 */
export function rollMonster(
  data: GameData,
  rng: RngState,
  spec: MonsterRollSpec,
  id: string
): [Monster, RngState] {
  let encounter: EncounterEntry
  ;[encounter, rng] = pickWeighted(rng, spec.encounters, (entry) => entry.weight)
  const species = data.species[encounter.speciesId] as NormalSpecies

  let level: number
  ;[level, rng] = nextInt(rng, spec.levelMin, spec.levelMax)
  let gender: Monster['gender']
  ;[gender, rng] = rollGender(data, rng, species.id)
  let genes: BigStats
  ;[genes, rng] = rollGenes(data, rng, spec.geneMultiplier)
  let traits: TraitInstance[]
  ;[traits, rng] = rollTraits(data, rng)

  let monster: Monster = {
    id,
    nickname: null,
    speciesId: species.id,
    baseSpeciesId: species.id,
    level,
    exp: expForLevel(level, species.growthRate ?? DEFAULT_GROWTH_RATE),
    gender,
    genes,
    fusingBonusStats: uniformBigStats(0),
    traits,
    shinyStacks: 0,
    bossMultiplier: 1,
    fused: false,
    lineage: [],
    raceId: species.raceId,
    elementIds: [...species.elementIds],
    skillIds: skillsAtLevel(data, species, level),
    damageTaken: BIG_ZERO,
    traitSlots: data.config.traitSlots.initial,
    pendingSkillIds: [],
    extraSkillIds: [],
    pendingEvolutionIds: [],
    statuses: [],
    equipment: [],
    teraElementId: species.elementIds[0],
    gmaxFactor: false,
    dynamaxLevel: 0,
    // Tuổi 0; quái hoang / boss tung tuổi sau cùng (rollSpawnAge), trứng nở ở tuổi 0.
    ...newLifeFields(level, spec.aging),
    // Lý lịch gắn khi quái về tay người chơi (startHistory).
    history: null,
    imprint: null,
    bossDefeats: 0,
    // Chưa thức tỉnh (docs/rules/awakening.md).
    awakening: 0,
    tribulationFailures: 0,
    injuryBattlesLeft: 0,
    humanForm: 'locked',
    assignment: null,
    tactic: 'balanced',
    skillMastery: {},
    // Quái hoang chưa khế ước (docs/rules/tamer.md), thân mật 0 (docs/rules/affinity.md).
    contractRealm: null,
    affinity: 0,
    // Tung sau cùng (rollNature) để không đổi các giá trị random phía trước.
    natureId: '',
    // Quái hoang / boss không có hồn tinh (docs/rules/soul-levels.md).
    soulLevels: emptySoulLevels(),
    // Quái hoang chưa có điểm nỗ lực (docs/rules/effort-values.md).
    effortValues: emptyEffortValues(),
    // Tung sau cùng (rollAbilitySlot) khi loài có ability (docs/rules/abilities.md).
    abilitySlot: 'first',
    // Chưa là bản mệnh của ai (docs/rules/tamer.md mục "Bản mệnh thú").
    bond: false,
    contractDays: 0,
    // Chưa nâng thiên phú (docs/rules/monster-talents.md).
    talentRanks: {},
    // Quái hoang chưa từng nhiễm linh dịch (docs/rules/spirit-virus.md).
    spiritVirus: null,
    // Tung sau cùng (rollWildBloodlines).
    bloodlines: [],
    // Quái hoang / boss tung cực sau tuổi (rollSpawnPolarity); trứng không cực.
    polarity: null,
    // Chưa từng được hiến tế (docs/rules/sacrifice.md).
    sacrificeStacks: 0,
    // Chưa từng được cấy ghép (docs/rules/implant.md).
    implantBonusStats: uniformBigStats(0),
    implantEffects: {},
    implantAttempts: 0,
    implantFails: 0
  }
  let shiny: boolean
  ;[shiny, rng] = rollPercent(rng, spec.shinyChance)
  if (shiny) monster = addShinyStacks(data, monster, 1)
  let teraElementId = species.teraElementId
  if (teraElementId === undefined) [teraElementId, rng] = pick(rng, species.elementIds)
  let natureId: string
  ;[natureId, rng] = rollNature(data, rng)
  // Loài không có ability thì ô không có tác dụng: không tung để giữ chuỗi random.
  let abilitySlot: AbilitySlot = 'first'
  if (species.abilities) [abilitySlot, rng] = rollAbilitySlot(data, rng)
  // Huyết mạch (docs/rules/bloodline.md): loài không thuộc nhóm nào thì không tốn RNG.
  let bloodlines: Monster['bloodlines']
  ;[bloodlines, rng] = rollWildBloodlines(data, rng, species.id)
  return [{ ...monster, teraElementId, natureId, abilitySlot, bloodlines }, rng]
}

const biomeShinyChance = (data: GameData, biome: Biome): number =>
  biome.shinyChance ?? data.config.shiny.wildChance

/**
 * Trọng số gặp nhân hệ số theo thời khắc của loài (docs/rules/calendar.md: loài ban ngày gặp nhiều
 * hơn ban ngày...); ngoài lịch (time null) giữ nguyên.
 */
const encountersAt = (
  data: GameData,
  encounters: readonly EncounterEntry[],
  time: number | null
): readonly EncounterEntry[] =>
  time === null
    ? encounters
    : encounters.map((entry) => ({
        ...entry,
        weight:
          entry.weight *
          activeTimeMultiplier(data, data.species[entry.speciesId] as NormalSpecies, time)
      }))

/**
 * Spec chung của tầng: loài theo trọng số × thời khắc, level quái thường, hệ số gen, tỉ lệ shiny
 * của map (nhân hệ số người chơi).
 */
function floorRollSpec(
  data: GameData,
  { floor, biome, aging, odds, time }: FloorSite,
  encounters: readonly EncounterEntry[]
): MonsterRollSpec {
  const levels = floorLevelRange(data, floor)
  return {
    encounters: encountersAt(data, encounters, time),
    levelMin: levels.min,
    levelMax: levels.max,
    geneMultiplier: floorGeneMultiplier(data, floor),
    shinyChance: biomeShinyChance(data, biome) * (odds?.shinyMultiplier ?? 1),
    aging
  }
}

/**
 * Tuổi khi xuất hiện (mục "Tuổi và thọ nguyên"): random theo ngày trong khoảng % thọ nguyên, tung
 * sau cùng (sau cả hệ số boss, vì thọ nguyên boss nhân bossMultiplier). Quái không già đi (tắt thọ
 * nguyên) lấy giữa khoảng, không tốn RNG.
 */
export function rollSpawnAge(
  data: GameData,
  rng: RngState,
  monster: Monster,
  range: PercentRange
): [Monster, RngState] {
  const min = ageDaysAtPercent(data, monster, range.min)
  const max = ageDaysAtPercent(data, monster, range.max)
  if (!monster.aging) return [{ ...monster, ageDays: Math.floor((min + max) / 2) }, rng]
  let ageDays: number
  ;[ageDays, rng] = nextInt(rng, min, max)
  return [{ ...monster, ageDays }, rng]
}

/** Sinh một quái hoang thường của tầng (loài theo map của tầng). */
export function generateWildMonster(
  data: GameData,
  rng: RngState,
  site: FloorSite,
  id: string
): [Monster, RngState] {
  let monster: Monster
  ;[monster, rng] = rollMonster(data, rng, floorRollSpec(data, site, site.biome.encounters), id)
  ;[monster, rng] = rollSpawnAge(data, rng, monster, data.config.lifespan.spawnAgePercent.wild)
  return rollSpawnPolarity(data, rng, monster, {
    floor: site.floor,
    chance: data.config.polarity.wildChance
  })
}

/** Tuổi rồi cực của boss (tung sau cùng, sau mọi luật boss khác). */
function rollBossAgeAndPolarity(
  data: GameData,
  rng: RngState,
  { site, boss }: { site: FloorSite; boss: Monster }
): [Monster, RngState] {
  ;[boss, rng] = rollSpawnAge(data, rng, boss, data.config.lifespan.spawnAgePercent.boss)
  return rollSpawnPolarity(data, rng, boss, {
    floor: site.floor,
    chance: data.config.polarity.bossChance
  })
}

/** Gắn bossMultiplier: số nguyên random trong khoảng của biome, hoặc của config nếu không ghi đè. */
function rollBossMultiplier(
  data: GameData,
  rng: RngState,
  biome: Biome,
  monster: Monster
): [Monster, RngState] {
  const { config } = data
  let multiplier: number
  ;[multiplier, rng] = nextInt(
    rng,
    biome.bossMultiplierMin ?? config.boss.multiplierMin,
    biome.bossMultiplierMax ?? config.boss.multiplierMax
  )
  // Boss cộng thêm độ thuần vào mọi nhóm huyết mạch của nó (docs/rules/bloodline.md).
  const bonus = data.config.bloodline.bossPurityBonus
  const bloodlines = bloodlineGroupsOf(data, monster.baseSpeciesId).reduce(
    (list, groupId) => withPurity(data, list, groupId, purityOf(monster, groupId) + bonus),
    monster.bloodlines
  )
  return [{ ...monster, bossMultiplier: multiplier, bloodlines }, rng]
}

/**
 * Trường biến hình của boss (mục "Boss và AI" ở transformation.md), tung sau hệ số boss: hệ Tera
 * (từ tầng stellarFromFloor có tỉ lệ Stellar; không thì tỉ lệ lấy hệ của chính nó, còn lại random
 * mọi hệ), Gmax Factor (loài mang được), cấp Dynamax random 0–maxLevel.
 */
export function rollBossTransformTraits(
  data: GameData,
  rng: RngState,
  { floor, boss }: { floor: number; boss: Monster }
): [Monster, RngState] {
  const { tera, dynamax } = data.config.transform
  const species = data.species[boss.speciesId]
  const fixedTera = species?.kind === 'normal' ? species.teraElementId : undefined
  let stellar = false
  if (floor >= tera.stellarFromFloor) [stellar, rng] = rollPercent(rng, tera.stellarChance)
  let teraElementId = fixedTera ?? STELLAR
  if (!stellar && fixedTera === undefined) {
    let own: boolean
    ;[own, rng] = rollPercent(rng, tera.bossOwnElementChance)
    ;[teraElementId, rng] = pick(rng, own ? boss.elementIds : Object.keys(data.elements))
  }
  let gmaxFactor = false
  if (canHaveGmaxFactor(data, boss.speciesId)) {
    ;[gmaxFactor, rng] = rollPercent(rng, dynamax.bossGmaxFactorChance)
  }
  let dynamaxLevel: number
  ;[dynamaxLevel, rng] = nextInt(rng, 0, dynamax.maxLevel)
  return [{ ...boss, teraElementId, gmaxFactor, dynamaxLevel }, rng]
}

/** Boss gặp ngẫu nhiên được của biome (có trọng số). */
const randomBossesOf = (biome: Biome): BiomeBoss[] =>
  biome.bosses.filter((boss) => boss.weight !== undefined)

/**
 * Sinh boss ngẫu nhiên của tầng (biome phải có boss có trọng số): loài theo trọng số, level như
 * quái thường của tầng. Boss lúc đánh chưa mang trait "Huyết thống boss"; chỉ nhận khi bị bắt.
 */
export function generateBoss(
  data: GameData,
  rng: RngState,
  site: FloorSite,
  id: string
): [Monster, RngState] {
  const { biome } = site
  const encounters = randomBossesOf(biome).map((boss) => ({
    speciesId: boss.speciesId,
    weight: boss.weight ?? 0
  }))
  let monster: Monster
  ;[monster, rng] = rollMonster(data, rng, floorRollSpec(data, site, encounters), id)
  ;[monster, rng] = rollBossMultiplier(data, rng, biome, monster)
  ;[monster, rng] = rollBossTransformTraits(data, rng, { floor: site.floor, boss: monster })
  return rollBossAgeAndPolarity(data, rng, { site, boss: monster })
}

/** Sinh boss tầng: loài floorBossSpeciesId của biome, level cố định floorBossLevel. */
export function generateFloorBoss(
  data: GameData,
  rng: RngState,
  site: FloorSite,
  id: string
): [Monster, RngState] {
  const { biome } = site
  const level = floorBossLevel(data, site.floor)
  const spec: MonsterRollSpec = {
    ...floorRollSpec(data, site, [{ speciesId: biome.floorBossSpeciesId, weight: 1 }]),
    levelMin: level,
    levelMax: level
  }
  let monster: Monster
  ;[monster, rng] = rollMonster(data, rng, spec, id)
  ;[monster, rng] = rollBossMultiplier(data, rng, biome, monster)
  ;[monster, rng] = rollBossTransformTraits(data, rng, { floor: site.floor, boss: monster })
  return rollBossAgeAndPolarity(data, rng, { site, boss: monster })
}

/** Kết quả sinh trận: quái địch, trận boss hay không, RNG và bộ đếm id mới. */
export interface Encounter {
  enemies: Monster[]
  isBoss: boolean
  rng: RngState
  nextMonsterId: number
}

/**
 * Sinh trận quái hoang: biome có boss ngẫu nhiên thì trước hết tung tỉ lệ gặp boss (1 boss đánh
 * một mình); không thì 1 hoặc 2 quái thường theo doubleChance. Id dạng "m<số>" từ nextMonsterId.
 */
export function generateEncounter(
  data: GameData,
  rng: RngState,
  site: FloorSite,
  nextMonsterId: number
): Encounter {
  const { biome } = site
  if (randomBossesOf(biome).length > 0) {
    let isBoss: boolean
    const chance =
      (biome.bossChance ?? data.config.boss.chance) * (site.odds?.bossChanceMultiplier ?? 1)
    ;[isBoss, rng] = rollPercent(rng, chance)
    if (isBoss) {
      let boss: Monster
      ;[boss, rng] = generateBoss(data, rng, site, `m${nextMonsterId}`)
      return { enemies: [boss], isBoss: true, rng, nextMonsterId: nextMonsterId + 1 }
    }
  }
  let double: boolean
  ;[double, rng] = rollPercent(rng, biome.doubleChance)
  const enemies: Monster[] = []
  for (let i = 0; i < (double ? 2 : 1); i++) {
    let monster: Monster
    ;[monster, rng] = generateWildMonster(data, rng, site, `m${nextMonsterId}`)
    nextMonsterId++
    // Quái hoang lớn luôn xuất hiện một mình (docs/rules/monster-size.md).
    if (isLargeMonster(data, monster)) {
      return { enemies: [monster], isBoss: false, rng, nextMonsterId }
    }
    enemies.push(monster)
  }
  return { enemies, isBoss: false, rng, nextMonsterId }
}

/** Trận boss tầng (challengeBoss): một boss tầng đánh một mình. */
export function generateFloorBossEncounter(
  data: GameData,
  rng: RngState,
  site: FloorSite,
  nextMonsterId: number
): Encounter {
  let boss: Monster
  ;[boss, rng] = generateFloorBoss(data, rng, site, `m${nextMonsterId}`)
  return { enemies: [boss], isBoss: true, rng, nextMonsterId: nextMonsterId + 1 }
}

/**
 * Trận boss bất kỳ của map (luật bossOnly của bí cảnh, docs/rules/trials.md): boss ngẫu nhiên của
 * map nếu có, không thì boss tầng (level theo tầng).
 */
export function generateAnyBossEncounter(
  data: GameData,
  rng: RngState,
  site: FloorSite,
  nextMonsterId: number
): Encounter {
  if (randomBossesOf(site.biome).length === 0) {
    return generateFloorBossEncounter(data, rng, site, nextMonsterId)
  }
  let boss: Monster
  ;[boss, rng] = generateBoss(data, rng, site, `m${nextMonsterId}`)
  return { enemies: [boss], isBoss: true, rng, nextMonsterId: nextMonsterId + 1 }
}

/**
 * Trận độ kiếp (docs/rules/awakening.md): một Thiên Kiếp level = level quái + levelOffset (tối thiểu
 * 1), gen theo tầng của `site`, không shiny, không già đi; hệ số chỉ số như bossMultiplier =
 * multiplierBase + multiplierPerTier × tầng hiện tại của quái. Không phải trận boss.
 */
export function generateTribulationEncounter(
  data: GameData,
  rng: RngState,
  { site, monster, nextMonsterId }: { site: FloorSite; monster: Monster; nextMonsterId: number }
): Encounter {
  const { speciesId, levelOffset, multiplierBase, multiplierPerTier } =
    data.config.awakening.tribulation
  const level = Math.max(1, monster.level + levelOffset)
  const spec: MonsterRollSpec = {
    ...floorRollSpec(data, site, [{ speciesId, weight: 1 }]),
    levelMin: level,
    levelMax: level,
    shinyChance: 0,
    aging: false
  }
  let enemy: Monster
  ;[enemy, rng] = rollMonster(data, rng, spec, `m${nextMonsterId}`)
  enemy = { ...enemy, bossMultiplier: multiplierBase + multiplierPerTier * monster.awakening }
  return { enemies: [enemy], isBoss: false, rng, nextMonsterId: nextMonsterId + 1 }
}

/**
 * Boss hoang mang 1 món unique (mục "Trang bị unique của boss"): tung đều trong pool của loài, rồi
 * tung dòng của món. Pool rỗng thì không mang gì, không tốn RNG. Gọi sau khi sinh xong boss nên
 * thêm trang bị không làm đổi loài, level, gen, trait, shiny, hệ số boss.
 */
export function equipBossUnique(
  data: GameData,
  rng: RngState,
  { boss, nextItemId }: { boss: Monster; nextItemId: number }
): { boss: Monster; rng: RngState; nextItemId: number } {
  const pool = uniquePoolOf(data, boss.speciesId)
  if (pool.length === 0) return { boss, rng, nextItemId }
  let item: EquipmentItem
  ;[item, rng] = pick(rng, pool)
  let instance: EquipmentInstance
  ;[instance, rng] = rollEquipment(data, rng, {
    itemId: item.id,
    rarity: 'unique',
    id: equipmentInstanceId(nextItemId)
  })
  const equipment = [...boss.equipment, { storage: 'instance' as const, instance }]
  return { boss: { ...boss, equipment }, rng, nextItemId: nextItemId + 1 }
}
