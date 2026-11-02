// Breeding (NPC ở thị trấn): một cặp đực + cái tạo ra một trứng. Bố mẹ không mất đi.
//
// canBreed: cùng loài, hoặc loài con này nằm trong lineage con kia, hoặc race tương thích
// (Race.breedsWith, xét cả hai chiều). "Loài" của quái fuse để so sánh là baseSpeciesId.
//
// Con (random sẵn khi tạo trứng, tất định theo RNG):
// - Loài: dạng đầu tiên chưa tiến hóa của loài (gốc) của mẹ; level 1; gender 50/50.
// - Mẹ là quái fuse: con cũng fuse (lineage của mẹ), fusingBonusStats = max từng chỉ số của bố mẹ.
// - Gen: max(bố, mẹ) × (1 + r), r ∈ [−down%, +up%]; luôn lệch ít nhất 1; tối thiểu 1.
//   Đột biến: mọi gen chỉ tăng (r ∈ [0, +up%], ít nhất +1).
// - Trait thường: mỗi bên random 1 trait (không tính trait shiny / boss), giữ nguyên cấp;
//   trùng id thì gộp cấp; loại trừ nhau thì bốc lại trait của bố, hết lựa chọn thì bỏ.
// - Boss: bossMultiplier = max của bố mẹ; trait boss = cấp cao nhất của bố mẹ (nếu có).
// - Số ô trait: cao nhất của bố mẹ.
// - Shiny: cả hai shiny → chắc chắn; một bên shiny → shinyChanceOneParent; không ai →
//   shinyChance. Con shiny thì shinyStacks = max của bố mẹ (tối thiểu 1).
// - Tính cách: random đều; bố / mẹ lắp Bất Biến Thạch thì nhận của bên đó (docs/rules/natures.md).
// - Huyết mạch (docs/rules/bloodline.md): mẹ đủ độ thuần có tỉ lệ sinh loài tổ; độ thuần của con theo
//   trung bình bố mẹ, có đột biến phản tổ.

import { recordQuestEvent } from '../quests'
import { wrapEgg } from './eggs'
import { rollGene } from './genes'
import {
  addShinyStacks,
  assertNotBusy,
  expForLevel,
  getBaseSpecies,
  mapBigStats,
  mergeTraitLevel,
  newLifeFields,
  rollChildAbilitySlot,
  rollAncestorBirth,
  rollChildBloodlines,
  childPolarity,
  rollChildNature,
  rollChildWorkTraits,
  rollGender,
  skillCapacity,
  startHistory,
  uniformBigStats,
  emptySoulLevels,
  emptyEffortValues
} from '../monster'
import {
  bumpStat,
  charmEffect,
  isTooYoungToBreed,
  researchMultiplier,
  tamerBonusMultiplier
} from '../registries'
import { baseFormsOf } from '../inventory'
import { skillsAtLevel } from '../world'
import { locateOwned } from '../roster'
import {
  ActionError,
  BIG_ZERO,
  Decimal,
  levelCost,
  maxBig,
  pick,
  rollPercent,
  spendMoney,
  type RngState
} from '../shared'
import {
  DEFAULT_GROWTH_RATE,
  type AbilitySlot,
  STAT_NAMES,
  dayOf,
  usesTraitSlot,
  type BigStats,
  type GameData,
  type GameState,
  type Monster,
  type NormalSpecies,
  type TraitInstance
} from '../model'

/** Lý do không breed được; null nếu breed được (a, b theo thứ tự bất kỳ). */
/** Lý do hai quái không breed được (mã ActionError). */
export type BreedBlocker =
  | 'breedSameMonster'
  | 'breedGenderless'
  | 'breedSameGender'
  | 'tooYoungToBreed'
  | 'breedIncompatible'

export function breedBlocker(data: GameData, a: Monster, b: Monster): BreedBlocker | null {
  if (a.id === b.id) return 'breedSameMonster'
  // Quái không giới tính không breed được (mục "Loài không giới tính").
  if (a.gender === 'none' || b.gender === 'none') return 'breedGenderless'
  if (a.gender === b.gender) return 'breedSameGender'
  // Ấu niên chưa breed được (mục "Tuổi và thọ nguyên"); tắt thọ nguyên thì không xét.
  if (isTooYoungToBreed(data, a) || isTooYoungToBreed(data, b)) return 'tooYoungToBreed'
  if (a.baseSpeciesId === b.baseSpeciesId) return null
  if (a.lineage.includes(b.baseSpeciesId) || b.lineage.includes(a.baseSpeciesId)) return null
  if (areRacesCompatible(data, a.raceId, b.raceId)) return null
  return 'breedIncompatible'
}

/** Race tương thích: race này nằm trong breedsWith của race kia (xét cả hai chiều). */
export function areRacesCompatible(data: GameData, raceIdA: string, raceIdB: string): boolean {
  const raceA = data.races[raceIdA]
  const raceB = data.races[raceIdB]
  return (
    raceA?.breedsWith.includes(raceIdB) === true || raceB?.breedsWith.includes(raceIdA) === true
  )
}

export function canBreed(data: GameData, a: Monster, b: Monster): boolean {
  return breedBlocker(data, a, b) === null
}

export function breedCost(data: GameData, father: Monster, mother: Monster): Decimal {
  return levelCost(data.config.breeding.costPerLevel, father.level + mother.level)
}

// Chỉ trait thường (chiếm ô) mới truyền; trait race không lưu trên quái nên con tự có theo race.
const isInheritable = (data: GameData, trait: TraitInstance): boolean =>
  usesTraitSlot(data.traits[trait.id].kind)

const conflicts = (data: GameData, a: TraitInstance, b: TraitInstance): boolean => {
  const groupA = data.traits[a.id].exclusiveGroup
  return a.id !== b.id && groupA !== undefined && groupA === data.traits[b.id].exclusiveGroup
}

/** Mỗi bên random 1 trait thường, giữ nguyên cấp. */
function rollTraits(
  data: GameData,
  rng: RngState,
  father: Monster,
  mother: Monster
): [TraitInstance[], RngState] {
  const result: TraitInstance[] = []
  const motherPool = mother.traits.filter((t) => isInheritable(data, t))
  if (motherPool.length > 0) {
    let picked: TraitInstance
    ;[picked, rng] = pick(rng, motherPool)
    result.push({ ...picked })
  }
  const fatherPool = father.traits.filter(
    (t) => isInheritable(data, t) && !result.some((other) => conflicts(data, t, other))
  )
  if (fatherPool.length > 0) {
    let picked: TraitInstance
    ;[picked, rng] = pick(rng, fatherPool)
    const same = result.find((t) => t.id === picked.id)
    if (same) same.level += picked.level
    else result.push({ ...picked })
  }
  return [result, rng]
}

/**
 * Chiêu trứng của con (egg move như Pokémon thế hệ 6 trở đi): skill trong `eggSkillIds` của loài con
 * mà bố hoặc mẹ đang biết, theo thứ tự trong dữ liệu.
 */
export function inheritedEggSkills(
  species: NormalSpecies,
  father: Pick<Monster, 'skillIds'>,
  mother: Pick<Monster, 'skillIds'>
): string[] {
  return (species.eggSkillIds ?? []).filter(
    (skillId) => father.skillIds.includes(skillId) || mother.skillIds.includes(skillId)
  )
}

/**
 * Bộ skill lúc nở: skill level 1 rồi chiêu trứng; quá số ô thì bỏ skill cũ nhất (như Pokémon: chiêu
 * trứng được ưu tiên; skill level bị bỏ vẫn học lại được theo learnset). Chiêu trứng ghi vào
 * extraSkillIds để NPC học lại được.
 */
function withEggSkills(data: GameData, child: Monster, eggSkillIds: string[]): Monster {
  if (eggSkillIds.length === 0) return child
  const combined = [...child.skillIds.filter((id) => !eggSkillIds.includes(id)), ...eggSkillIds]
  return {
    ...child,
    skillIds: combined.slice(Math.max(0, combined.length - skillCapacity(data, child))),
    extraSkillIds: eggSkillIds.filter((id) => !child.skillIds.includes(id))
  }
}

/** Tạo quái con (chưa bọc trứng). */
export function makeOffspring(
  data: GameData,
  rng: RngState,
  father: Monster,
  mother: Monster,
  id: string,
  {
    shinyMultiplier = 1,
    speciesShinyMultiplier
  }: { shinyMultiplier?: number; speciesShinyMultiplier?: (speciesId: string) => number } = {}
): [Monster, RngState] {
  const { config } = data
  const motherBase = getBaseSpecies(data, mother) as NormalSpecies
  // Mẹ fuse: con giữ đúng dạng tiến hóa của mẹ; mẹ thường: con về dạng đầu tiên (mục Breeding);
  // loài có nhiều dạng đầu (nhiều dạng trước) thì chọn ngẫu nhiên, chỉ tốn RNG khi có lựa chọn.
  const bases = mother.fused ? [motherBase.id] : baseFormsOf(data, motherBase.id)
  let speciesId = bases[0]
  if (bases.length > 1) [speciesId, rng] = pick(rng, bases)
  // Sinh loài tổ (docs/rules/bloodline.md): chỉ tốn RNG khi mẹ đủ độ thuần.
  let ancestorId: string | undefined
  ;[ancestorId, rng] = rollAncestorBirth(data, rng, mother)
  if (ancestorId !== undefined) speciesId = ancestorId
  const species = data.species[speciesId] as NormalSpecies

  let mutation: boolean
  ;[mutation, rng] = rollPercent(rng, config.breeding.mutationChance)
  const genes = {} as BigStats
  for (const stat of STAT_NAMES) {
    ;[genes[stat], rng] = rollGene(
      data,
      rng,
      maxBig(father.genes[stat], mother.genes[stat]),
      mutation
    )
  }
  let gender: Monster['gender']
  ;[gender, rng] = rollGender(data, rng, species.id)
  let traits: TraitInstance[]
  ;[traits, rng] = rollTraits(data, rng, father, mother)

  const fusingBonusStats = mother.fused
    ? mapBigStats((stat) => maxBig(father.fusingBonusStats[stat], mother.fusingBonusStats[stat]))
    : uniformBigStats(0)

  let child: Monster = {
    id,
    nickname: null,
    speciesId: mother.fused ? config.fusedSpeciesId : species.id,
    baseSpeciesId: species.id,
    level: 1,
    exp: expForLevel(1, species.growthRate ?? DEFAULT_GROWTH_RATE),
    gender,
    genes,
    fusingBonusStats,
    traits,
    shinyStacks: 0,
    bossMultiplier: Math.max(father.bossMultiplier, mother.bossMultiplier),
    fused: mother.fused,
    lineage: mother.fused ? [...mother.lineage] : [],
    raceId: species.raceId,
    elementIds: [...species.elementIds],
    skillIds: skillsAtLevel(data, species, 1),
    damageTaken: BIG_ZERO,
    // Con nhận số ô trait cao nhất của bố mẹ.
    traitSlots: Math.max(father.traitSlots, mother.traitSlots),
    pendingSkillIds: [],
    extraSkillIds: [],
    pendingEvolutionIds: [],
    statuses: [],
    // Con breeding không thừa hưởng trang bị; Gmax Factor, cấp Dynamax không di truyền (như
    // Pokémon), hệ Tera random theo hệ của con (tung sau shiny).
    equipment: [],
    teraElementId: species.elementIds[0],
    gmaxFactor: false,
    dynamaxLevel: 0,
    // Tuổi 0 lúc nở; già đi theo tùy chọn của game (bố mẹ luôn cùng cờ aging với game).
    ...newLifeFields(1, mother.aging),
    // Lý lịch gắn khi bọc trứng (breed); con chưa khế ước (docs/rules/tamer.md mục "Khế ước").
    history: null,
    imprint: null,
    bossDefeats: 0,
    // Con không thừa hưởng thức tỉnh (docs/rules/awakening.md).
    awakening: 0,
    tribulationFailures: 0,
    injuryBattlesLeft: 0,
    humanForm: 'locked',
    assignment: null,
    tactic: 'balanced',
    skillMastery: {},
    contractRealm: null,
    // Quái trong trứng có thân mật khởi đầu của trứng (docs/rules/affinity.md).
    affinity: data.config.affinity.start.egg,
    // Tung sau cùng (rollChildNature) để không đổi các giá trị random phía trước.
    natureId: mother.natureId,
    // Con không thừa hưởng hồn tinh (docs/rules/soul-levels.md), không là bản mệnh.
    soulLevels: emptySoulLevels(),
    // Con không thừa hưởng điểm nỗ lực (docs/rules/effort-values.md).
    effortValues: emptyEffortValues(),
    // Tung sau cùng (rollChildAbilitySlot) khi loài có ability (docs/rules/abilities.md).
    abilitySlot: mother.abilitySlot,
    bond: false,
    contractDays: 0,
    // Con breeding 0 điểm thiên phú (docs/rules/monster-talents.md).
    talentRanks: {},
    // Con không nhiễm linh dịch (docs/rules/spirit-virus.md).
    spiritVirus: null,
    // Tung sau cùng (rollChildBloodlines) theo độ thuần của bố mẹ.
    bloodlines: [],
    // Tung sau cùng (childPolarity) theo cực của bố mẹ.
    polarity: null,
    // Breeding không truyền stack hiến tế (bố mẹ không mất, truyền thì nhân bản; sacrifice.md).
    sacrificeStacks: 0,
    // Luân hồi không truyền (docs/rules/rebirth.md).
    rebirths: 0,
    // Không truyền cấy ghép, cùng lý do như hiến tế (docs/rules/implant.md).
    implantBonusStats: uniformBigStats(0),
    implantEffects: {},
    implantAttempts: 0,
    implantFails: 0,
    // Tung sau cùng (rollChildWorkTraits) theo trait của bố mẹ.
    workTraits: [],
    // Chưa dùng sách làm việc / hồn tinh tốc độ (docs/rules/dwelling.md).
    workPoints: {},
    workSoulLevel: 0,
    // No và tinh thần đầy (docs/rules/dwelling.md mục "Đói và tinh thần").
    fullness: data.config.dwelling.needs.max,
    sanity: data.config.dwelling.needs.max,
    ailment: null,
    locked: false,
    favorite: false
  }

  child = withEggSkills(data, child, inheritedEggSkills(species, father, mother))

  // Trait boss đi theo bossMultiplier: lấy cấp cao nhất của bố mẹ.
  const bossLevel = Math.max(
    ...[father, mother].map((m) => m.traits.find((t) => t.id === config.boss.traitId)?.level ?? 0)
  )
  if (bossLevel > 0) child = mergeTraitLevel(child, config.boss.traitId, bossLevel)

  const shinyParents = [father, mother].filter((m) => m.shinyStacks > 0).length
  // Bùa shiny (docs/rules/dex.md mục "Bùa") nhân tỉ lệ, tối đa 100%.
  const shinyChance =
    shinyParents === 2
      ? 100
      : Math.min(
          100,
          shinyMultiplier *
            (speciesShinyMultiplier?.(child.speciesId) ?? 1) *
            (shinyParents === 1
              ? config.breeding.shinyChanceOneParent
              : config.breeding.shinyChance)
        )
  let shiny: boolean
  ;[shiny, rng] = rollPercent(rng, shinyChance)
  if (shiny) {
    child = addShinyStacks(data, child, Math.max(1, father.shinyStacks, mother.shinyStacks))
  }
  let teraElementId = species.teraElementId
  if (teraElementId === undefined) [teraElementId, rng] = pick(rng, species.elementIds)
  let natureId: string
  ;[natureId, rng] = rollChildNature(data, rng, [father, mother])
  let abilitySlot: AbilitySlot = mother.abilitySlot
  if (species.abilities) [abilitySlot, rng] = rollChildAbilitySlot(data, rng, mother)
  let bloodlines: Monster['bloodlines']
  ;[bloodlines, rng] = rollChildBloodlines(data, rng, { speciesId: species.id, father, mother })
  let polarity: Monster['polarity']
  ;[polarity, rng] = childPolarity(data, rng, [father, mother])
  let workTraits: string[]
  ;[workTraits, rng] = rollChildWorkTraits(data, rng, {
    parents: [father, mother],
    shinyStacks: child.shinyStacks
  })
  return [{ ...child, teraElementId, natureId, abilitySlot, bloodlines, polarity, workTraits }, rng]
}

/** NPC breeding ở thị trấn: trả tiền, nhận một trứng. */
export function breed(
  data: GameData,
  state: GameState,
  fatherId: string,
  motherId: string
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const father = locateOwned(state, fatherId).monster
  const mother = locateOwned(state, motherId).monster
  // Quái đang thám hiểm bị khóa (docs/rules/expeditions.md).
  assertNotBusy(father)
  assertNotBusy(mother)
  if (father.gender !== 'male') throw new ActionError('notMale', { monsterId: fatherId })
  if (mother.gender !== 'female') throw new ActionError('notFemale', { monsterId: motherId })
  const blocker = breedBlocker(data, father, mother)
  if (blocker) throw new ActionError(blocker)
  const paid = spendMoney(state, breedCost(data, father, mother))

  const [child, afterChild] = makeOffspring(
    data,
    state.rng,
    father,
    mother,
    `m${state.nextMonsterId}`,
    {
      shinyMultiplier:
        charmEffect(data, state.inventory, 'shinyChanceMultiplier') *
        tamerBonusMultiplier(data, state, 'shinyChancePercent'),
      speciesShinyMultiplier: (speciesId: string) =>
        researchMultiplier(data, state.research, speciesId, 'shinyChancePercent')
    }
  )
  // Lý lịch tính từ lúc nhận trứng ở thị trấn (mục "Lý lịch quái").
  const withHistory = startHistory(
    child,
    { kind: 'egg', fatherSpeciesId: father.baseSpeciesId, motherSpeciesId: mother.baseSpeciesId },
    { day: dayOf(state.time), floor: null, level: child.level }
  )
  const [egg, rng] = wrapEgg(data, afterChild, withHistory)
  return {
    ...paid,
    rng,
    nextMonsterId: state.nextMonsterId + 1,
    eggs: [...state.eggs, egg],
    quests: recordQuestEvent(data, state.quests, { type: 'bred' }),
    stats: bumpStat(state.stats, 'breeds')
  }
}
