// Danh sách quái: thông tin hiển thị và lọc / sắp xếp. Chỉ đọc state, không đổi gì.
// Mọi số liệu đều tính lại từ "nguyên liệu" của quái (không lưu thêm gì vào save).

import {
  autoMegaForm,
  awakeningRequirements,
  awakeningStatMultiplier,
  computeStats,
  monsterExpForLevel,
  masteryExpForLevel,
  masteryOf,
  megaFormsByStone,
  humanFormBlocker,
  humanFormCost,
  implantChance,
  lockedSkillIds,
  nextAwakeningMilestone,
  nextMasteryMilestone,
  shinyFactor,
  skillCapacity,
  soulLevelView,
  effortView,
  abilityTraitId,
  type EffortView,
  talentView,
  traitSlotCap,
  type AwakeningRequirements,
  type HumanFormBlocker,
  type SoulLevelView,
  type TalentView
} from '../monster'
import { contentName } from '../gameData'
import {
  devolutionCost,
  evolutionInfo,
  isMarkTreatable,
  rebirthRequirements,
  treatMarkCost,
  type EvolutionInfo,
  type RebirthRequirements,
  workSpeedPercent,
  workStats,
  workConditionPercent,
  workerPower
} from '../progression'
import {
  affinityTierOf,
  ageStage,
  aptitudeOf,
  aptitudeTierRank,
  monsterSize,
  monsterSpeciesRankOf,
  partySlotsOf,
  type MonsterSize,
  speciesRankIndex,
  ageYears,
  lifePercent,
  lifespanYears,
  raceTraitIds,
  bloodlineGroupsOf,
  bloodlineTraitLevel,
  mainBloodline,
  MAX_PURITY,
  yearsLeft,
  type EvolutionScene,
  polarityStatPercent,
  sacrificeStatPercent,
  starRankView,
  type StarRankView,
  rebirthStatPercent,
  findMarkDef,
  isMarkActive,
  markPartId,
  equipmentSetStates,
  type EquipmentSetState
} from '../registries'
import { BIG_ZERO, cloneData, maxBig, type Decimal } from '../shared'
import { equipmentSlotCount, preEvolutionsOf } from '../inventory'
import { evolutionScene } from '../world'
import { partnerSkillIdOf, partnerStrength } from '../tamer'
import {
  STAT_NAMES,
  usesTraitSlot,
  type AgeStage,
  type AwakeningMilestone,
  type AbilitySlot,
  type BloodlinePurity,
  type GameData,
  type HumanFormState,
  type PartialStats,
  type GameState,
  type Gender,
  type ImprintRequest,
  type LanguageCode,
  type MasteryMilestone,
  type MarkKind,
  type MarkOrigin,
  type Monster,
  type Pole,
  type MonsterHistory,
  type SkillCategory,
  type SpiritVirus,
  type StatName,
  type BigStats,
  type EquippedItem,
  type StatPercentSourceId,
  type Stats,
  type StatusInstance,
  type TraitKind,
  type WorkType,
  WORK_TYPES,
  imprintPercent
} from '../model'

// Xuất lại cho bên ngoài core (script mô phỏng chấm tư chất quái chưa sở hữu).
export { aptitudeFloor, aptitudeOf, type Aptitude } from '../registries'
export { baseStatTotal, speciesRankOf, monsterSpeciesRankOf } from '../registries'
// Huyết mạch (docs/rules/bloodline.md): script mô phỏng đo độ thuần, UI hiển thị.
export { bloodlineGroupsOf, mainBloodline } from '../registries'
export { monsterWeightKg, speciesWeightKg } from '../registries'
// Bộ trang bị (docs/rules/equipment-sets.md): UI và script mô phỏng đếm bộ đang có.
export { equipmentSetStates, type EquipmentSetState } from '../registries'
export {
  MONSTER_SIZES,
  hasPartyRoom,
  isLargeMonster,
  monsterSize,
  partySlotsOf,
  partySlotsUsed,
  speciesSize,
  type MonsterSize
} from '../registries'

export type MonsterLocation = 'party' | 'storage'

/** Chỗ của quái khi dựng MonsterView: đội / kho, vị trí, số ô trang bị của người chơi. */
export interface MonsterPlace {
  location: MonsterLocation
  /** Vị trí trong đội hoặc trong kho. */
  index: number
  /** equipmentSlotCount của người chơi (mục "Trang bị và đồ cầm"). */
  equipmentSlots: number
  /** Hoàn cảnh xét tiến hóa (đội, nơi đang ở) cho `evolutions`. */
  scene: EvolutionScene
  /** Tầng cao nhất đang mở (giá theo tầng: Thầy thuốc, docs/rules/marks.md). */
  highestFloor: number
}

export interface MonsterView {
  id: string
  /** Biệt danh; tên hiển thị lấy bằng monsterName (chữ theo ngôn ngữ, mục "Đa ngôn ngữ"). */
  nickname: string | null
  locked: boolean
  favorite: boolean
  speciesId: string
  /** Loài cung cấp chỉ số gốc (khác speciesId với quái fuse). */
  baseSpeciesId: string
  location: MonsterLocation
  /** Vị trí trong đội hoặc trong kho. */
  index: number
  level: number
  exp: Decimal
  /** Tổng EXP cần để lên level kế tiếp, và phần còn thiếu. */
  expForNextLevel: Decimal
  expToNextLevel: Decimal
  gender: Gender
  /** Kích cỡ (docs/rules/monster-size.md): quái lớn chiếm 2 ô sân, partySlots ô đội. */
  size: MonsterSize
  partySlots: number
  raceId: string
  elementIds: string[]
  hp: Decimal
  maxHp: Decimal
  fainted: boolean
  /** Chỉ số ngoài trận (đã áp trait, không có bậc trận). */
  stats: BigStats
  totalStats: Decimal
  genes: BigStats
  fusingBonusStats: BigStats
  traits: { id: string; kind: TraitKind; level: number; usesSlot: boolean }[]
  /** Trait race (suy ra từ race, luôn cấp 1, không chiếm ô), hiển thị riêng với `traits`. */
  raceTraitIds: string[]
  traitSlotsUsed: number
  traitSlotsMax: number
  skills: {
    id: string
    elementId: string
    category: SkillCategory
    power: number
    /** Thuần thục của skill (docs/rules/skill-mastery.md). */
    mastery: SkillMasteryView
  }[]
  shinyStacks: number
  /** Hệ số thưởng EXP / tiền từ shiny = shinyMultiplier^shinyStacks (không nhân vào chỉ số). */
  shinyRewardMultiplier: Decimal
  bossMultiplier: number
  fused: boolean
  /** Các loài đã góp vào quái fuse. */
  lineage: string[]
  /** Skill chờ học (đủ ô lúc được học). */
  pendingSkillIds: string[]
  /** Hướng tiến hóa chờ người chơi chọn. */
  pendingEvolutionIds: string[]
  /** Mọi hướng tiến hóa của loài hiện tại (rỗng nếu đã fuse hoặc dạng cuối). */
  evolutions: EvolutionInfo[]
  /** Loài trước khi thoái hóa (lần tự tiến hóa sau luôn hỏi, bỏ qua được); null nếu không. */
  devolvedFromSpeciesId: string | null
  /** Dạng trước trực tiếp thoái hóa về được (rỗng nếu đã fuse hoặc dạng đầu) và giá thoái hóa. */
  devolveTargetIds: string[]
  devolutionCost: Decimal
  /** Trạng thái bất thường đang có (tên tra bằng contentName 'statuses'). */
  statuses: StatusInstance[]
  /** Món đang lắp theo thứ tự ô, và số ô của người chơi (mục "Trang bị và đồ cầm"). */
  equipment: EquippedItem[]
  equipmentSlots: number
  /** Bộ trang bị đang có ít nhất một món: số món đếm được, số lần kích hoạt / số mốc (equipment-sets.md). */
  equipmentSets: EquipmentSetState[]
  /** % chỉ số cộng ở bước áp trait, theo từng nguồn (trait, trang bị, trạng thái...). */
  statPercents: Record<StatPercentSourceId, Stats>
  /** Hệ Tera (id hệ hoặc Stellar), Gmax Factor, cấp Dynamax (mục "Biến hình trong trận"). */
  teraElementId: string
  gmaxFactor: boolean
  dynamaxLevel: number
  /** Dạng Mega dùng được với đá / skill hiện có (kể cả dạng tự biến kiểu Primal). */
  megaFormIds: string[]
  /** Tuổi và thọ nguyên; null khi tắt thọ nguyên (UI ẩn phần tuổi). */
  life: MonsterLifeView | null
  /**
   * Lý lịch (monster-history.md): nguồn gốc, lúc gặp, cột mốc; chỉ id, chữ do UI dịch.
   * Quái của người chơi luôn có.
   */
  history: MonsterHistory | null
  /** Độ thân mật và id mức đang có (hiệu ứng của mức tra ở data.affinityTiers; affinity.md). */
  affinity: number
  affinityTierId: string | null
  /**
   * Kỹ năng đồng hành của quái và sức mạnh theo thân mật (có tác dụng khi đứng đầu đội, còn sống;
   * docs/rules/partner-skills.md).
   */
  partnerSkillId: string
  partnerStrength: number
  /** Thức tỉnh (docs/rules/awakening.md). */
  awakening: AwakeningView
  /** Hóa hình (docs/rules/human-form.md). */
  humanForm: HumanFormView
  /** Cảnh giới khế ước (tamer.md); null = chưa khế ước. */
  contractRealm: number | null
  /** Bản mệnh thú của ngự thú sư (docs/rules/tamer.md mục "Bản mệnh thú"). */
  isBond: boolean
  /** Số boss đã hạ (điều kiện tiến hóa bossDefeats). */
  bossDefeats: number
  /** Dưỡng dục (imprinting.md); null = chưa từng dưỡng dục. */
  imprint: MonsterImprintView | null
  /** Tính cách và chỉ số tăng / giảm (null = trung tính; docs/rules/natures.md). */
  nature: NatureView
  /** Khả năng làm việc ở động phủ: thiên phú, tốc độ, sức theo loại việc, trait (dwelling.md). */
  work: WorkView
  /** Tư chất so với tầng mốc (docs/rules/aptitude.md); tên bậc tra contentName 'aptitudeTiers'. */
  aptitude: AptitudeView
  /** Phẩm cấp loài (docs/rules/species-rank.md); tên bậc tra contentName 'speciesRanks'. */
  speciesRankId: string
  /** Hồn tinh theo chỉ số: cấp, % đang cộng, giá cấp tiếp theo (docs/rules/soul-levels.md). */
  soulLevels: SoulLevelView
  /** Điểm nỗ lực theo chỉ số, trần, điểm loài cho khi bị hạ (docs/rules/effort-values.md). */
  effort: EffortView
  /** Ô ability và id trait ability (null = loài không có ability; docs/rules/abilities.md). */
  ability: { slot: AbilitySlot; traitId: string | null }
  /** Thiên phú: điểm, cấp và giá từng nút của nhánh đang mở (docs/rules/monster-talents.md). */
  talents: TalentView
  /** Linh dịch: đang nhiễm (số ngày còn) / miễn dịch / null (docs/rules/spirit-virus.md). */
  spiritVirus: SpiritVirus | null
  /** Huyết mạch: chính (có hiệu lực) và các nhóm khác chỉ tích lũy (docs/rules/bloodline.md). */
  bloodline: BloodlineView
  /** Âm / Dương: cực, trait cực tính, % chỉ số đang cộng; null = không cực (docs/rules/polarity.md). */
  polarity: PolarityView | null
  /** Hiến tế: số stack và % mọi chỉ số đang được cộng (docs/rules/sacrifice.md). */
  sacrifice: { stacks: number; statPercent: number }
  /** Bậc sao: số sao, số bản, bản còn thiếu, % mọi chỉ số, giá sao kế (docs/rules/star-rank.md). */
  stars: StarRankView
  /** Luân hồi: số lần, % mọi chỉ số đang cộng, điều kiện lần sau (docs/rules/rebirth.md). */
  rebirth: { count: number; statPercent: number; next: RebirthRequirements }
  /** Cấy ghép: tổng đã cấy, tỉ lệ lần tới, số lần thất bại / tối đa (docs/rules/implant.md). */
  implant: ImplantView
  /** Dấu ấn theo thứ tự nhận (docs/rules/marks.md). */
  marks: MarkView[]
}

/** Một dấu ấn của quái cho UI. */
export interface MarkView {
  markId: string
  kind: MarkKind
  targetId?: string
  /** Bộ phận (sẹo, đột biến, sẹo chiến); dấu không theo bộ phận thì không có. */
  partId?: string
  level: number
  maxLevel: number | null
  /** Dấu có tác dụng (bộ phận còn trên quái). */
  active: boolean
  origin: MarkOrigin
  /** Sẹo: số trận thắng đã ra sân / số trận để bắt đầu có cơ hội chai thành sẹo chiến. */
  harden?: { battles: number; need: number }
  /** Ám ảnh: số lần đã hạ đúng đối tượng / số lần cần để vượt qua. */
  resolve?: { count: number; need: number }
  /** Giá Thầy thuốc bỏ dấu; loại không bỏ được = null. */
  treatCost: Decimal | null
}

/** Cấy ghép cho MonsterView. */
export interface ImplantView {
  bonusStats: BigStats
  /** Cấp hiệu ứng cấy theo id (âm = hiệu ứng ngược). */
  effects: Record<string, number>
  attempts: number
  /** Tỉ lệ (%) lần cấy tiếp theo thành công. */
  nextChance: number
  fails: number
  /** Thất bại lần thứ maxFails thì mất quái. */
  maxFails: number
}

/** Âm / Dương cho MonsterView. */
export interface PolarityView {
  pole: Pole
  traitId: string
  statPercents: PartialStats
}

/** Huyết mạch cho MonsterView. */
export interface BloodlineView {
  /** Huyết mạch chính; null = chưa có độ thuần ở nhóm nào. */
  main: {
    groupId: string
    purity: number
    /** Cấp trait huyết mạch (0 = chưa đạt mốc nào) và id trait. */
    traitLevel: number
    traitId: string
    /** Loài tổ chọn được khi phản tổ (đủ 100% và không fuse); rỗng nếu chưa phản tổ được. */
    atavizeOptions: string[]
  } | null
  /** Các nhóm khác (đúng thứ tự bloodlines.json). */
  others: BloodlinePurity[]
  /** Mọi nhóm loài gốc thuộc (kể cả nhóm độ thuần 0). */
  groupIds: string[]
}

/** Tư chất cho MonsterView: tỉ lệ gen và id bậc. */
export interface AptitudeView {
  ratio: Decimal
  tierId: string
}

/** Một loại việc của MonsterView: chỉ số làm việc (0 = không có), tốc độ (%), sức làm việc. */
export interface WorkTypeView {
  stat: number
  speedPercent: number
  power: number
}

/**
 * Khả năng làm việc: trait làm việc (tên tra contentName 'workTraits'), từng loại việc, no / tinh
 * thần và % sức theo tình trạng (docs/rules/dwelling.md mục "Đói và tinh thần").
 */
export interface WorkView {
  traitIds: string[]
  types: Record<WorkType, WorkTypeView>
  fullness: number
  sanity: number
  /** Bệnh đang mắc (tên tra contentName 'ailments'); null = khỏe. */
  ailmentId: string | null
  conditionPercent: number
}

/** Tính cách cho MonsterView: id (tên tra contentName 'natures'), chỉ số tăng / giảm và %. */
export interface NatureView {
  id: string
  up: Exclude<StatName, 'hp'> | null
  down: Exclude<StatName, 'hp'> | null
  percent: number
}

/**
 * Thuần thục một skill: cấp, tổng exp, tổng exp của cấp kế tiếp và phần còn thiếu (như EXP của quái),
 * mốc kế tiếp (null = đã qua hết).
 */
export interface SkillMasteryView {
  level: number
  exp: Decimal
  expForNextLevel: Decimal
  expToNextLevel: Decimal
  nextMilestone: MasteryMilestone | null
}

/** Thuần thục của một skill cho MonsterView. */
function masteryView(data: GameData, monster: Monster, skillId: string): SkillMasteryView {
  const { level, exp } = masteryOf(monster, skillId)
  const next = nextMasteryMilestone(data, level)
  const expForNextLevel = masteryExpForLevel(data, level + 1)
  return {
    level,
    exp,
    expForNextLevel,
    expToNextLevel: maxBig(0, expForNextLevel.minus(exp)),
    nextMilestone: next && { ...next }
  }
}

/** Phần dưỡng dục của MonsterView. */
export interface MonsterImprintView {
  /** 'active' = đang dưỡng dục, 'done' = đã chốt buff. */
  phase: 'active' | 'done'
  /** % dưỡng dục hiện tại (0–100). */
  percent: number
  /** Buff % mọi chỉ số: đang dưỡng dục thì là buff dự kiến nếu kết thúc với % hiện tại. */
  statPercent: number
  /** Yêu cầu hiện tại kèm hạn (đã xong thì done = true); null khi đã chốt. */
  request: ImprintRequest | null
  /** Ngày kết thúc dưỡng dục; null khi đã chốt. */
  endDay: number | null
}

/** Phần tuổi của MonsterView (mục "Tuổi và thọ nguyên"). */
export interface MonsterLifeView {
  /** Tuổi (năm, làm tròn xuống). */
  ageYears: Decimal
  /** Thọ nguyên (năm, có phần lẻ). */
  lifespanYears: Decimal
  /** % thọ nguyên đã sống. */
  percentLived: number
  stage: AgeStage
  yearsLeft: Decimal
  /** Đã vượt mốc cảnh báo sắp thọ tận (config.lifespan.warnPercent). */
  nearingEnd: boolean
}

/** Phần tuổi của quái; null khi quái không già đi (tắt thọ nguyên). */
function lifeView(data: GameData, monster: Monster): MonsterLifeView | null {
  const stage = ageStage(data, monster)
  if (stage === null) return null
  const percentLived = lifePercent(data, monster)
  return {
    ageYears: ageYears(data, monster).floor(),
    lifespanYears: lifespanYears(data, monster),
    percentLived,
    stage,
    yearsLeft: yearsLeft(data, monster),
    nearingEnd: percentLived >= data.config.lifespan.warnPercent
  }
}

function imprintView(data: GameData, monster: Monster): MonsterImprintView | null {
  const { imprint } = monster
  if (!imprint) return null
  const percent = imprintPercent(imprint)
  const active = imprint.phase === 'active'
  return {
    phase: imprint.phase,
    percent,
    statPercent: (data.config.imprint.maxStatPercent * percent) / 100,
    request: active ? { ...imprint.request } : null,
    endDay: active ? imprint.endDay : null
  }
}

/** Tên hiển thị của quái: biệt danh nếu có, không thì tên loài theo ngôn ngữ. */
export function monsterName(
  data: GameData,
  language: LanguageCode,
  monster: Pick<MonsterView, 'nickname' | 'speciesId'>
): string {
  return monster.nickname ?? contentName(data, language, 'species', monster.speciesId)
}

function findOwned(
  state: GameState,
  monsterId: string
): { monster: Monster; location: MonsterLocation; index: number } | null {
  const partyIndex = state.party.findIndex((m) => m.id === monsterId)
  if (partyIndex >= 0) {
    return { monster: state.party[partyIndex], location: 'party', index: partyIndex }
  }
  const storageIndex = state.storage.findIndex((m) => m.id === monsterId)
  if (storageIndex >= 0) {
    return { monster: state.storage[storageIndex], location: 'storage', index: storageIndex }
  }
  return null
}

export interface AwakeningView {
  tier: number
  /** Hệ số chỉ số của tầng (bước gốc). */
  statMultiplier: Decimal
  /** Trần ô trait hiện tại (theo mốc ô trait đã đạt). */
  traitSlotCap: number
  /** Tầng mốc kế tiếp và phần thưởng; null nếu không còn mốc. */
  nextMilestone: AwakeningMilestone | null
  /** Điều kiện lên tầng kế tiếp. */
  next: AwakeningRequirements
  tribulationFailures: number
  /** Số lần còn được thua trước khi lần thua kế tiếp làm quái chết hẳn (0 = lần này thua là chết). */
  failuresLeft: number
  injuryBattlesLeft: number
}

export interface HumanFormView {
  state: HumanFormState
  /** Race có hóa hình được không. */
  raceAllows: boolean
  /** Lý do chưa hóa hình được (ngoài đan / tiền / nơi; đã hóa hình: `alreadyTaken`); null = được. */
  blocker: HumanFormBlocker | null
  /** Tiền hóa hình; cần thêm 1 viên `pillItemId`. */
  cost: Decimal
  pillItemId: string
  /** % chỉ số khi ở nhân hình (config), và % mọi chỉ số trừ HP khi Hiện nguyên hình ở tầng hiện tại. */
  statPercents: PartialStats
  trueFormPercent: number
  /** Sức chứa skill và skill ở ô nhân hình đang khóa. */
  skillCapacity: number
  lockedSkillIds: readonly string[]
}

function humanFormView(data: GameData, monster: Monster): HumanFormView {
  const config = data.config.humanForm
  return {
    state: monster.humanForm,
    raceAllows: data.races[monster.raceId].humanForm,
    blocker: humanFormBlocker(data, monster),
    cost: humanFormCost(data, monster),
    pillItemId: config.pillItemId,
    statPercents: { ...config.statPercents },
    trueFormPercent:
      config.trueForm.statPercentBase + config.trueForm.statPercentPerAwakening * monster.awakening,
    skillCapacity: skillCapacity(data, monster),
    lockedSkillIds: lockedSkillIds(data, monster)
  }
}

function awakeningView(data: GameData, monster: Monster): AwakeningView {
  const config = data.config.awakening
  return {
    tier: monster.awakening,
    statMultiplier: awakeningStatMultiplier(config, monster.awakening),
    traitSlotCap: traitSlotCap(data, monster),
    nextMilestone: nextAwakeningMilestone(config, monster.awakening),
    next: awakeningRequirements(config, monster.awakening),
    tribulationFailures: monster.tribulationFailures,
    failuresLeft: config.maxFailures - monster.tribulationFailures,
    injuryBattlesLeft: monster.injuryBattlesLeft
  }
}

export function buildMonsterView(
  data: GameData,
  monster: Monster,
  { location, index, equipmentSlots, scene, highestFloor }: MonsterPlace
): MonsterView {
  const breakdown = computeStats(data, monster)
  const stats = breakdown.final
  const traits = monster.traits.map(({ id, level }) => {
    const trait = data.traits[id]
    return {
      id,
      kind: trait.kind,
      level,
      usesSlot: usesTraitSlot(trait.kind)
    }
  })
  const expForNextLevel = monsterExpForLevel(data, monster, monster.level + 1)
  return {
    id: monster.id,
    nickname: monster.nickname,
    locked: monster.locked,
    favorite: monster.favorite,
    speciesId: monster.speciesId,
    baseSpeciesId: monster.baseSpeciesId,
    location,
    index,
    level: monster.level,
    exp: monster.exp,
    expForNextLevel,
    expToNextLevel: maxBig(0, expForNextLevel.minus(monster.exp)),
    gender: monster.gender,
    size: monsterSize(data, monster),
    partySlots: partySlotsOf(data, monster),
    raceId: monster.raceId,
    elementIds: [...monster.elementIds],
    hp: maxBig(0, stats.hp.minus(monster.damageTaken)),
    maxHp: stats.hp,
    fainted: stats.hp.lte(monster.damageTaken),
    stats,
    totalStats: STAT_NAMES.reduce((sum, stat) => sum.plus(stats[stat]), BIG_ZERO),
    genes: { ...monster.genes },
    fusingBonusStats: { ...monster.fusingBonusStats },
    traits,
    raceTraitIds: [...raceTraitIds(data, monster)],
    traitSlotsUsed: traits.filter((t) => t.usesSlot).length,
    traitSlotsMax: monster.traitSlots,
    skills: monster.skillIds.map((id) => {
      const skill = data.skills[id]
      return {
        id,
        elementId: skill.elementId,
        category: skill.category,
        power: skill.power,
        mastery: masteryView(data, monster, id)
      }
    }),
    shinyStacks: monster.shinyStacks,
    shinyRewardMultiplier: shinyFactor(data, monster),
    bossMultiplier: monster.bossMultiplier,
    fused: monster.fused,
    lineage: [...monster.lineage],
    pendingSkillIds: [...monster.pendingSkillIds],
    pendingEvolutionIds: [...monster.pendingEvolutionIds],
    evolutions: evolutionInfo(data, monster, scene),
    devolvedFromSpeciesId: monster.devolvedFromSpeciesId,
    devolveTargetIds: monster.fused ? [] : [...preEvolutionsOf(data, monster.speciesId)],
    devolutionCost: devolutionCost(data, monster.level),
    statuses: monster.statuses.map((status) => ({ ...status })),
    equipment: monster.equipment.map((entry) => cloneData(entry)),
    equipmentSlots,
    equipmentSets: equipmentSetStates(data, monster.equipment),
    statPercents: breakdown.percentBySource,
    teraElementId: monster.teraElementId,
    gmaxFactor: monster.gmaxFactor,
    dynamaxLevel: monster.dynamaxLevel,
    megaFormIds: [
      ...megaFormsByStone(data, monster),
      ...[autoMegaForm(data, monster)].filter((formId): formId is string => formId !== undefined)
    ],
    life: lifeView(data, monster),
    history: cloneData(monster.history),
    affinity: monster.affinity,
    affinityTierId: affinityTierOf(data, monster.affinity)?.id ?? null,
    partnerSkillId: partnerSkillIdOf(data, monster),
    partnerStrength: partnerStrength(data, monster),
    awakening: awakeningView(data, monster),
    humanForm: humanFormView(data, monster),
    contractRealm: monster.contractRealm,
    isBond: monster.bond,
    bossDefeats: monster.bossDefeats,
    imprint: imprintView(data, monster),
    nature: natureView(data, monster),
    work: workView(data, monster),
    aptitude: aptitudeView(data, monster, scene.aptitudeFloor),
    speciesRankId: monsterSpeciesRankOf(data, monster).id,
    soulLevels: soulLevelView(data, monster),
    effort: effortView(data, monster),
    ability: { slot: monster.abilitySlot, traitId: abilityTraitId(data, monster) },
    talents: talentView(data, monster),
    spiritVirus: monster.spiritVirus,
    bloodline: bloodlineView(data, monster),
    polarity: monster.polarity
      ? { ...monster.polarity, statPercents: polarityStatPercent(data, monster) }
      : null,
    sacrifice: {
      stacks: monster.sacrificeStacks,
      statPercent: sacrificeStatPercent(data, monster)
    },
    stars: starRankView(data, monster),
    rebirth: {
      count: monster.rebirths,
      statPercent: rebirthStatPercent(data, monster),
      next: rebirthRequirements(data.config.rebirth, monster.rebirths)
    },
    implant: {
      bonusStats: { ...monster.implantBonusStats },
      effects: { ...monster.implantEffects },
      attempts: monster.implantAttempts,
      nextChance: implantChance(data, monster),
      fails: monster.implantFails,
      maxFails: data.config.implant.maxFails
    },
    marks: markViews(data, monster, highestFloor)
  }
}

/** Dấu ấn của quái cho UI (dấu không còn mục dữ liệu bị bỏ qua). */
function markViews(data: GameData, monster: Monster, highestFloor: number): MarkView[] {
  const { scarHardenBattles, resolveThreshold } = data.config.marks
  return monster.marks.flatMap((mark): MarkView[] => {
    const def = findMarkDef(data, mark.markId)
    if (!def) return []
    const partId = markPartId(def)
    return [
      {
        markId: mark.markId,
        kind: def.kind,
        ...(mark.targetId === undefined ? {} : { targetId: mark.targetId }),
        ...(partId === undefined ? {} : { partId }),
        level: mark.level,
        maxLevel: def.maxLevel ?? null,
        active: isMarkActive(data, monster, mark),
        origin: { ...mark.origin },
        ...(def.kind === 'scar'
          ? { harden: { battles: mark.winBattles ?? 0, need: scarHardenBattles } }
          : {}),
        ...(def.kind === 'trauma'
          ? { resolve: { count: mark.resolveCount ?? 0, need: resolveThreshold } }
          : {}),
        treatCost: isMarkTreatable(def) ? treatMarkCost(data, mark.level, highestFloor) : null
      }
    ]
  })
}

function bloodlineView(data: GameData, monster: Monster): BloodlineView {
  const main = mainBloodline(monster)
  const groupIds = [...bloodlineGroupsOf(data, monster.baseSpeciesId)]
  if (!main) return { main: null, others: [], groupIds }
  const canAtavize = !monster.fused && main.purity >= MAX_PURITY
  return {
    main: {
      ...main,
      traitLevel: bloodlineTraitLevel(data, main.purity),
      traitId: data.bloodlines[main.groupId].traitId,
      atavizeOptions: canAtavize ? [...data.bloodlines[main.groupId].ancestorSpeciesIds] : []
    },
    others: monster.bloodlines.filter((entry) => entry.groupId !== main.groupId),
    groupIds
  }
}

function aptitudeView(data: GameData, monster: Monster, floor: number): AptitudeView {
  const { ratio, tier } = aptitudeOf(data, monster, floor)
  return { ratio, tierId: tier.id }
}

function workView(data: GameData, monster: Monster): WorkView {
  const stats = workStats(data, monster)
  const types = Object.fromEntries(
    WORK_TYPES.map((type) => [
      type,
      {
        stat: stats[type] ?? 0,
        speedPercent: workSpeedPercent(data, monster, type),
        power: workerPower(data, monster, type)
      }
    ])
  ) as Record<WorkType, WorkTypeView>
  return {
    traitIds: [...monster.workTraits],
    types,
    fullness: monster.fullness,
    sanity: monster.sanity,
    ailmentId: monster.ailment?.id ?? null,
    conditionPercent: workConditionPercent(data, monster)
  }
}

function natureView(data: GameData, monster: Monster): NatureView {
  const { id, up, down } = data.natures[monster.natureId]
  return { id, up: up ?? null, down: down ?? null, percent: data.config.nature.percent }
}

/** Thông tin hiển thị của một quái trong đội hoặc kho; null nếu không sở hữu. */
export function getMonsterView(
  data: GameData,
  state: GameState,
  monsterId: string
): MonsterView | null {
  const owned = findOwned(state, monsterId)
  if (!owned) return null
  const { location, index } = owned
  const equipmentSlots = equipmentSlotCount(data, state)
  const scene = evolutionScene(data, state)
  return buildMonsterView(data, owned.monster, {
    location,
    index,
    equipmentSlots,
    scene,
    highestFloor: state.highestFloor
  })
}

export type MonsterSortKey =
  | 'default'
  | 'level'
  | 'favorite'
  | 'totalStats'
  | 'aptitude'
  | 'speciesRank'
  | 'name'
  | 'species'
  | StatName

export interface MonsterQuery {
  /** Mặc định 'all'. */
  location?: MonsterLocation | 'all'
  speciesId?: string
  raceId?: string
  elementId?: string
  traitId?: string
  shiny?: boolean
  boss?: boolean
  fused?: boolean
  fainted?: boolean
  locked?: boolean
  favorite?: boolean
  /** Chỉ quái có tư chất từ bậc này trở lên (id bậc tư chất). */
  minAptitudeTierId?: string
  /** Chỉ quái có phẩm cấp loài từ bậc này trở lên (id phẩm cấp loài). */
  minSpeciesRankId?: string
  /**
   * Mặc định: đội theo thứ tự đội, rồi kho theo thứ tự vào kho. Sắp theo tên (`name`, `species`)
   * dùng chữ của `language` (mặc định: ngôn ngữ mặc định của dữ liệu).
   */
  sort?: { by: MonsterSortKey; order?: 'asc' | 'desc'; language?: LanguageCode }
}

function matches(data: GameData, view: MonsterView, query: MonsterQuery): boolean {
  const flag = (wanted: boolean | undefined, actual: boolean): boolean =>
    wanted === undefined || wanted === actual
  return (
    (query.speciesId === undefined || view.speciesId === query.speciesId) &&
    (query.raceId === undefined || view.raceId === query.raceId) &&
    (query.elementId === undefined || view.elementIds.includes(query.elementId)) &&
    (query.traitId === undefined || view.traits.some((t) => t.id === query.traitId)) &&
    flag(query.shiny, view.shinyStacks > 0) &&
    flag(query.boss, view.bossMultiplier > 1) &&
    flag(query.fused, view.fused) &&
    flag(query.fainted, view.fainted) &&
    flag(query.locked, view.locked) &&
    flag(query.favorite, view.favorite) &&
    (query.minAptitudeTierId === undefined ||
      aptitudeTierRank(data, view.aptitude.tierId) >=
        aptitudeTierRank(data, query.minAptitudeTierId)) &&
    (query.minSpeciesRankId === undefined ||
      speciesRankIndex(data, view.speciesRankId) >= speciesRankIndex(data, query.minSpeciesRankId))
  )
}

/** Hàm so sánh theo khóa sắp xếp; tên so theo quy tắc chữ của ngôn ngữ. */
function comparator(
  data: GameData,
  language: LanguageCode,
  by: MonsterSortKey
): (a: MonsterView, b: MonsterView) => number {
  const byText = (text: (view: MonsterView) => string) => (a: MonsterView, b: MonsterView) =>
    text(a).localeCompare(text(b), language)
  switch (by) {
    case 'name':
      return byText((view) => monsterName(data, language, view))
    case 'species':
      return byText((view) => contentName(data, language, 'species', view.speciesId))
    case 'speciesRank':
      return (a, b) =>
        speciesRankIndex(data, a.speciesRankId) - speciesRankIndex(data, b.speciesRankId)
    default:
      return (a, b) => compare(a, b, by)
  }
}

function compare(
  a: MonsterView,
  b: MonsterView,
  by: Exclude<MonsterSortKey, 'name' | 'species' | 'speciesRank'>
): number {
  switch (by) {
    case 'default':
      return 0
    case 'level':
      return a.level - b.level
    case 'favorite':
      return Number(a.favorite) - Number(b.favorite)
    case 'totalStats':
      return a.totalStats.cmp(b.totalStats)
    case 'aptitude':
      return a.aptitude.ratio.cmp(b.aptitude.ratio)
    default:
      return a.stats[by].cmp(b.stats[by])
  }
}

/** Trứng đang ấp, theo thứ tự nhận. Không lộ quái bên trong (để UI giữ bất ngờ). */
export function listEggs(state: GameState): { id: string; battlesLeft: number }[] {
  return state.eggs.map((egg) => ({ id: egg.id, battlesLeft: egg.battlesLeft }))
}

/** Danh sách quái sở hữu theo bộ lọc và cách sắp xếp. Bằng nhau thì giữ thứ tự mặc định. */
export function listMonsters(
  data: GameData,
  state: GameState,
  query: MonsterQuery = {}
): MonsterView[] {
  const location = query.location ?? 'all'
  const views: MonsterView[] = []
  const equipmentSlots = equipmentSlotCount(data, state)
  const scene = evolutionScene(data, state)
  const { highestFloor } = state
  if (location !== 'storage') {
    state.party.forEach((m, index) =>
      views.push(
        buildMonsterView(data, m, { location: 'party', index, equipmentSlots, scene, highestFloor })
      )
    )
  }
  if (location !== 'party') {
    state.storage.forEach((m, index) =>
      views.push(
        buildMonsterView(data, m, {
          location: 'storage',
          index,
          equipmentSlots,
          scene,
          highestFloor
        })
      )
    )
  }
  const filtered = views.filter((view) => matches(data, view, query))
  const { by = 'default', order = 'asc', language = data.text.defaultLanguage } = query.sort ?? {}
  const direction = order === 'desc' ? -1 : 1
  const compareViews = comparator(data, language, by)
  // Array.prototype.sort ổn định: phần bằng nhau giữ thứ tự mặc định.
  return filtered.sort((a, b) => direction * compareViews(a, b))
}
