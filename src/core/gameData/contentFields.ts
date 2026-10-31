// Trường được phép của từng loại nội dung JSON (trừ vật phẩm: theo category, xem itemCategories.ts).
// Trường lạ báo lỗi để gõ nhầm tên trường (ví dụ "hit" thay cho "hits") không bị bỏ qua im lặng.
// Danh sách viết bằng fieldList nên thêm trường vào type mà quên ở đây thì TypeScript báo lỗi.

import type {
  Biome,
  BiomeBoss,
  ElementDef,
  Evolution,
  EvolutionMutation,
  FieldEffectDef,
  FieldEntry,
  WeightedItem,
  FusedSpecies,
  GameData,
  HitRange,
  LearnsetEntry,
  MinionDef,
  NormalSpecies,
  Race,
  Skill,
  SkillFieldModifier,
  StatusDef,
  StatusDuration,
  TraitDef
} from '../model'
import { allMaps } from '../model'
import { checkKnownFields, fieldList } from './checks'

const ELEMENT_FIELDS = fieldList<ElementDef>({
  id: true,
  effectiveness: true,
  statusImmunities: true,
  trapImmune: true,
  airborne: true,
  immuneMoveFlags: true
})

const FIELD_EFFECT_FIELDS = fieldList<FieldEffectDef>({
  id: true,
  layer: true,
  hooks: true,
  duration: true,
  maxLayers: true,
  onReuse: true,
  actsAs: true,
  primal: true
})

const FIELD_ENTRY_FIELDS = fieldList<FieldEntry>({ fieldId: true, weight: true })
const WEIGHTED_ITEM_FIELDS = fieldList<WeightedItem>({ itemId: true, weight: true })

const SKILL_FIELD_MODIFIER_FIELDS = fieldList<SkillFieldModifier>({
  fieldId: true,
  power: true,
  powerMultiplier: true,
  accuracy: true,
  hitsAlways: true,
  elementId: true,
  requiresGroundedUser: true,
  priority: true,
  target: true
})

const STATUS_FIELDS = fieldList<StatusDef>({
  id: true,
  kind: true,
  duration: true,
  hooks: true,
  traitHooks: true,
  exclusiveGroup: true,
  overwritesGroup: true,
  battleOnly: true,
  endsOnLeave: true,
  resetsOnLeave: true,
  endsWhenSourceLeaves: true,
  disablesItems: true,
  blocksRepeatSkill: true,
  imprisons: true,
  blocksHealing: true,
  drainsToSource: true,
  marker: true,
  blocksSoundSkills: true,
  onEndStatusId: true,
  requiresStatusId: true,
  skillElementOverride: true,
  explodesOnElement: true,
  catchMultiplier: true
})

const MINION_FIELDS = fieldList<MinionDef>({
  id: true,
  maxStacks: true,
  leaveChance: true,
  hooks: true,
  excludeFromRandom: true
})

const STATUS_DURATION_FIELDS = fieldList<StatusDuration>({ min: true, max: true })

const RACE_FIELDS = fieldList<Race>({
  id: true,
  groupId: true,
  statBias: true,
  growth: true,
  breedsWith: true,
  traitIds: true,
  partnerSkillId: true,
  humanForm: true,
  frenzyProne: true,
  weightKg: true,
  bodyParts: true,
  weakPoints: true
})

const NORMAL_SPECIES_FIELDS = fieldList<NormalSpecies>({
  kind: true,
  id: true,
  raceId: true,
  elementIds: true,
  baseStats: true,
  evolutions: true,
  learnset: true,
  catchRate: true,
  lifespan: true,
  genderless: true,
  formOf: true,
  formKind: true,
  bookSkillIds: true,
  eggSkillIds: true,
  origin: true,
  source: true,
  gmaxSkillId: true,
  megaSkillId: true,
  fromSpeciesIds: true,
  teraElementId: true,
  teraFormId: true,
  rank: true,
  partnerSkillId: true,
  weightKg: true,
  heightM: true,
  bodyParts: true,
  weakPoints: true,
  effortYield: true,
  growthRate: true,
  abilities: true,
  hiddenAbility: true,
  activeTime: true
})

const FUSED_SPECIES_FIELDS = fieldList<FusedSpecies>({ kind: true, id: true })

const EVOLUTION_FIELDS = fieldList<Evolution>({
  speciesId: true,
  level: true,
  itemId: true,
  conditions: true,
  mutation: true
})

const EVOLUTION_MUTATION_FIELDS = fieldList<EvolutionMutation>({
  speciesId: true,
  chance: true,
  catalystItemId: true,
  catalystChance: true
})

const LEARNSET_FIELDS = fieldList<LearnsetEntry>({ level: true, skillId: true })

const TRAIT_FIELDS = fieldList<TraitDef>({
  id: true,
  kind: true,
  exclusiveGroup: true,
  hooks: true,
  noBattleEffect: true
})

const SKILL_FIELDS = fieldList<Skill>({
  id: true,
  elementId: true,
  category: true,
  power: true,
  accuracy: true,
  priority: true,
  target: true,
  effects: true,
  hits: true,
  fieldModifiers: true,
  firstTurnOnly: true,
  alwaysHits: true,
  powerFormula: true,
  curesUserStatuses: true,
  elementFromHeldItem: true,
  elementFromUser: true,
  elementFromGenes: true,
  randomPower: true,
  usableWhileStatusIds: true,
  reflectable: true,
  snatchable: true,
  ignoresStatusPenalty: true,
  ignoresRedirect: true,
  moveFlags: true,
  breaksScreens: true,
  stealsBoosts: true,
  escalatingHits: true,
  delayedHealPercent: true,
  attackFrom: true,
  fixedDamage: true,
  contact: true,
  reach: true,
  bodyPart: true,
  charge: true,
  recharge: true,
  lockIn: true,
  hitsInvulnerable: true,
  delayedTurns: true,
  chargeAtTurnStart: true,
  breaksProtect: true,
  targetsLastAttacker: true,
  selfFaint: true,
  crashDamagePercent: true,
  selfDamagePercent: true,
  recoilPercent: true,
  leavesOneHp: true,
  defenseStat: true,
  categoryRule: true,
  ignoresTargetStages: true,
  ignoresAbility: true,
  effectiveness: true,
  curesTargetStatuses: true,
  tags: true,
  spell: true,
  maxMove: true,
  teraBlast: true,
  ignoresProtect: true,
  critStage: true,
  alwaysCrit: true,
  zMove: true,
  zPower: true,
  zEffects: true,
  synergy: true,
  hold: true,
  styles: true,
  formOverrides: true,
  bide: true,
  carriesTarget: true,
  onAlly: true,
  pursuit: true,
  pullsAllySameSkill: true,
  typeless: true,
  alwaysHitsVsStatusIds: true,
  stellar: true
})

const HIT_RANGE_FIELDS = fieldList<HitRange>({ min: true, max: true })

const BIOME_FIELDS = fieldList<Biome>({
  id: true,
  doubleChance: true,
  shinyChance: true,
  encounters: true,
  drops: true,
  bossDrops: true,
  floorBossSpeciesId: true,
  bosses: true,
  bossChance: true,
  bossMultiplierMin: true,
  bossMultiplierMax: true,
  equipmentDrops: true,
  weather: true,
  terrain: true,
  powerSpot: true,
  trainerClassIds: true,
  elementIds: true,
  gathering: true
})

const BIOME_BOSS_FIELDS = fieldList<BiomeBoss>({
  speciesId: true,
  weight: true,
  drops: true,
  bossField: true
})

/** Mỗi phần tử của danh sách (nếu là danh sách) chỉ có các trường được phép. */
function checkListFields(
  list: unknown,
  allowed: readonly string[],
  where: string,
  owner: string,
  issues: string[]
): void {
  if (!Array.isArray(list)) return
  list.forEach((entry, i) => checkKnownFields(entry, allowed, `${where}[${i}]`, owner, issues))
}

function checkSpeciesFields(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    const where = `Loài "${species.id}"`
    if (species.kind === 'fused') {
      checkKnownFields(species, FUSED_SPECIES_FIELDS, where, 'loài fused', issues)
      continue
    }
    checkKnownFields(species, NORMAL_SPECIES_FIELDS, where, 'loài', issues)
    checkListFields(species.evolutions, EVOLUTION_FIELDS, `${where}.evolutions`, 'tiến hóa', issues)
    if (Array.isArray(species.evolutions)) {
      species.evolutions.forEach(({ mutation }, i) => {
        if (mutation === undefined) return
        const at = `${where}.evolutions[${i}].mutation`
        checkKnownFields(mutation, EVOLUTION_MUTATION_FIELDS, at, 'dị biến', issues)
      })
    }
    checkListFields(species.learnset, LEARNSET_FIELDS, `${where}.learnset`, 'learnset', issues)
  }
}

/** Kiểm tra trường lạ của hệ, trạng thái, môi trường, race, loài, trait, skill, biome. */
export function checkContentFields(data: GameData, issues: string[]): void {
  for (const element of Object.values(data.elements)) {
    checkKnownFields(element, ELEMENT_FIELDS, `Hệ "${element.id}"`, 'hệ', issues)
  }
  for (const status of Object.values(data.statuses)) {
    const where = `Trạng thái "${status.id}"`
    checkKnownFields(status, STATUS_FIELDS, where, 'trạng thái', issues)
    checkKnownFields(
      status.duration ?? {},
      STATUS_DURATION_FIELDS,
      `${where}.duration`,
      'duration',
      issues
    )
  }
  for (const minion of Object.values(data.minions)) {
    checkKnownFields(minion, MINION_FIELDS, `Minion "${minion.id}"`, 'minion', issues)
  }
  for (const effect of Object.values(data.fieldEffects)) {
    checkKnownFields(effect, FIELD_EFFECT_FIELDS, `Môi trường "${effect.id}"`, 'môi trường', issues)
  }
  for (const race of Object.values(data.races)) {
    checkKnownFields(race, RACE_FIELDS, `Race "${race.id}"`, 'race', issues)
  }
  checkSpeciesFields(data, issues)
  for (const trait of Object.values(data.traits)) {
    checkKnownFields(trait, TRAIT_FIELDS, `Trait "${trait.id}"`, 'trait', issues)
  }
  for (const skill of Object.values(data.skills)) {
    const where = `Skill "${skill.id}"`
    checkKnownFields(skill, SKILL_FIELDS, where, 'skill', issues)
    checkKnownFields(skill.hits, HIT_RANGE_FIELDS, `${where}.hits`, 'hits', issues)
    const modifiers = skill.fieldModifiers
    checkListFields(
      modifiers,
      SKILL_FIELD_MODIFIER_FIELDS,
      `${where}.fieldModifiers`,
      'fieldModifiers',
      issues
    )
  }
  for (const biome of allMaps(data)) {
    const where = `Biome "${biome.id}"`
    checkKnownFields(biome, BIOME_FIELDS, where, 'biome', issues)
    checkListFields(biome.bosses, BIOME_BOSS_FIELDS, `${where}.bosses`, 'boss của biome', issues)
    checkListFields(
      biome.weather,
      FIELD_ENTRY_FIELDS,
      `${where}.weather`,
      'môi trường biome',
      issues
    )
    checkListFields(
      biome.terrain,
      FIELD_ENTRY_FIELDS,
      `${where}.terrain`,
      'môi trường biome',
      issues
    )
    checkListFields(
      biome.equipmentDrops,
      WEIGHTED_ITEM_FIELDS,
      `${where}.equipmentDrops`,
      'trang bị rơi',
      issues
    )
  }
}
