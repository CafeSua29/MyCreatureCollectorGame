// "Ngôn ngữ" chung mô tả trait theo sự kiện / điều kiện (mục "Trait Siralim" ở battle.md): bộ đếm,
// điều kiện, lượng, mục tiêu, hiệu ứng, sự kiện. Dùng chung cho trait, trạng thái (traitHooks) và
// minion. File này chỉ có kiểu và hàm kiểm tra dữ liệu; tính điều kiện / bộ đếm ở
// traitConditions.ts, chạy hiệu ứng ở battle/traitEffects.ts.

import { raceRefIds } from './races'
import { asObject, checkInteger, checkNumber } from '../shared'
import {
  GLOBAL_FIELD_LAYERS,
  MOVE_FLAGS,
  NON_HP_STATS,
  SKILL_CATEGORIES,
  SKILL_TAGS,
  SKILL_TARGETS,
  STATUS_KINDS,
  TRANSFORM_KINDS,
  type GameData,
  type GlobalFieldLayer,
  type NonHpStat,
  type SkillCategory,
  type SkillTag,
  type SkillTarget,
  type StageStat,
  type StatusKind,
  type TransformKind
} from '../model'
import { checkFormMap, checkIdList, isBattleStageStat, isStageStat } from './paramChecks'

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  (list as readonly unknown[]).includes(value)

const listMessage = (field: string, list: readonly string[]): string =>
  `${field} phải là một trong ${list.join(' / ')}`

/** Kiểm tra một giá trị thuộc danh sách; trả về danh sách lỗi. */
function checkOneOf(list: readonly string[], value: unknown, field: string): string[] {
  return oneOf(list, value) ? [] : [listMessage(field, list)]
}

// ---------- Quái được nhắc tới trong điều kiện / lượng ----------

/**
 * self: quái mang trait; subject: quái mà sự kiện xảy ra với nó (bị đánh, gục...); other: quái
 * phía bên kia của sự kiện (kẻ đánh khi bị đánh, mục tiêu khi đánh); target: mục tiêu đòn (pha
 * sát thương: bên nhận).
 */
export const DSL_WHOS = ['self', 'subject', 'other', 'target', 'attacker'] as const

export type DslWho = (typeof DSL_WHOS)[number]

// ---------- Bộ đếm ----------

export const COUNTER_NAMES = [
  'turnsOnField',
  'turnsTaken',
  'missingHpPercent',
  'hpPercent',
  'alliesOnField',
  'livingAllies',
  'livingFoes',
  'livingDiff',
  'faintedAllies',
  'faintedFoes',
  'faintedDiff',
  'deathsTotal',
  'knockouts',
  'timesDamaged',
  'attacks',
  'casts',
  'defends',
  'provokes',
  'revivals',
  'deaths',
  'buffs',
  'debuffs',
  'statuses',
  'minionStacks',
  'minionTypes',
  'traitsGained',
  'sideCasts',
  'totalCasts',
  'foesWithStatus',
  'foesWithDebuffs',
  'raceOnSide',
  'sameRaceOnSide',
  'traitOnSide',
  'sameElementOnSide',
  'elementOnSide',
  'distinctElementsOnSide',
  'damageTakenPercent',
  'damageDealtPercent',
  'healingReceivedPercent',
  'stageTotal',
  'sealedSkills',
  'foeBuffs',
  'equipmentStatLines',
  'equipmentStatPercent',
  'skillStreak',
  'berriesEaten',
  'stockpile',
  'skillUses',
  'fieldStreak'
] as const

export type CounterName = (typeof COUNTER_NAMES)[number]

/**
 * Bộ đếm có tham số: `who` = quái được đếm (mặc định self), `statusIds` (foesWithStatus,
 * statuses), `raceIds` (raceOnSide), `elementIds` (elementOnSide), `kind` (statuses), `traitId`
 * (traitOnSide: đồng đội trên sân mang trait này, không gồm quái được xét).
 */
export interface CounterSpec {
  of: CounterName
  who?: DslWho
  statusIds?: string[]
  raceIds?: string[]
  elementIds?: string[]
  traitId?: string
  /** Cộng thêm vào kết quả (trait kiểu "act as if 2 more"). */
  bonus?: number
  /** Giới hạn trên của kết quả (trait kiểu "tối đa 50%"). */
  max?: number
  /** Chia rồi làm tròn xuống trước khi cộng bonus (kiểu "mỗi 3 stack"). */
  divisor?: number
  /** Chỉ số của bộ đếm theo trang bị (equipmentStatLines, equipmentStatPercent). */
  stat?: NonHpStat
}

export function checkCounter(value: unknown, field: string, data: GameData): string[] {
  const obj = asObject(value)
  if (!obj) return [`${field} phải là object`]
  const issues = checkOneOf(COUNTER_NAMES, obj.of, `${field}.of`)
  if (obj.who !== undefined) issues.push(...checkOneOf(DSL_WHOS, obj.who, `${field}.who`))
  if (obj.statusIds !== undefined) {
    issues.push(
      ...checkIdList(obj.statusIds, `${field}.statusIds`, data.statuses, { label: 'trạng thái' })
    )
  }
  if (obj.raceIds !== undefined) {
    issues.push(
      ...checkIdList(obj.raceIds, `${field}.raceIds`, raceRefIds(data), { label: 'race' })
    )
  }
  if (obj.elementIds !== undefined) {
    issues.push(
      ...checkIdList(obj.elementIds, `${field}.elementIds`, data.elements, { label: 'hệ' })
    )
  }
  if (obj.of === 'foesWithStatus' && obj.statusIds === undefined) {
    issues.push(`${field}: foesWithStatus cần statusIds`)
  }
  if (obj.of === 'raceOnSide' && obj.raceIds === undefined) {
    issues.push(`${field}: raceOnSide cần raceIds`)
  }
  if (obj.traitId !== undefined) {
    issues.push(...checkIdList([obj.traitId], `${field}.traitId`, data.traits, { label: 'trait' }))
  }
  if (obj.of === 'traitOnSide' && obj.traitId === undefined) {
    issues.push(`${field}: traitOnSide cần traitId`)
  }
  if (obj.of === 'elementOnSide' && obj.elementIds === undefined) {
    issues.push(`${field}: elementOnSide cần elementIds`)
  }
  const needsStat = obj.of === 'equipmentStatLines' || obj.of === 'equipmentStatPercent'
  if (needsStat && !(NON_HP_STATS as readonly unknown[]).includes(obj.stat)) {
    issues.push(`${field}: ${String(obj.of)} cần stat là chỉ số khác hp`)
  }
  if (obj.bonus !== undefined) issues.push(...checkNumber(obj.bonus, `${field}.bonus`))
  if (obj.max !== undefined) issues.push(...checkNumber(obj.max, `${field}.max`))
  if (obj.divisor !== undefined) issues.push(...checkInteger(obj.divisor, `${field}.divisor`, 1))
  return issues
}

// ---------- Điều kiện ----------

export type DslCondition =
  | { if: 'hpBelow' | 'hpAbove'; who: DslWho; percent: number }
  | { if: 'hasStatus'; who: DslWho; statusIds: string[]; all?: true }
  | { if: 'lacksStatus'; who: DslWho; statusIds: string[] }
  | { if: 'statusCount'; who: DslWho; kind?: StatusKind; min: number }
  | { if: 'noStatus'; who: DslWho; kind?: StatusKind }
  | { if: 'category'; categories: SkillCategory[] }
  | { if: 'singleTarget' }
  | { if: 'defending' | 'provoking'; who: DslWho }
  | { if: 'counterAtLeast'; counter: CounterSpec; min: number }
  | { if: 'counterBelow'; counter: CounterSpec; max: number }
  | { if: 'race'; who: DslWho; raceIds: string[] }
  | { if: 'sameRace'; who: DslWho }
  | { if: 'element'; who: DslWho; elementIds: string[] }
  | { if: 'sameElement'; who: DslWho }
  | { if: 'isSelf'; who: DslWho }
  | { if: 'notSelf'; who: DslWho }
  | { if: 'selfDead' }
  | {
      if: 'damageAbove'
      /** % max HP của quái được xét; hoặc `percentOfLowestStat`: % chỉ số thấp nhất (khác hp). */
      percentOfMaxHp?: number
      percentOfLowestStat?: number
      who?: DslWho
    }
  | { if: 'sameSide'; who: DslWho }
  | { if: 'statHigher' | 'statLower'; stat: NonHpStat; than: 'anyFoe' | 'allFoes' | 'target' }
  | { if: 'reactive'; value: boolean }
  | { if: 'noDamageSinceTurnEnd' }
  | { if: 'partyAllRace' }
  | { if: 'bossBattle'; value: boolean }
  | { if: 'levelOdd'; value: boolean }
  /** Chưa tăng / giảm chỉ số nào trong `stats` (bỏ trống = mọi chỉ số khác hp). */
  | { if: 'noGainedStats'; stats?: NonHpStat[] }
  | { if: 'critical' }
  /** Đòn của sự kiện khắc hệ (hệ số > 1; kiểu Weakness Policy). */
  | { if: 'superEffective' }
  | { if: 'skillTag'; tags: SkillTag[] }
  | { if: 'skillTarget'; targets: SkillTarget[] }
  | { if: 'skill'; skillIds: string[] }
  | { if: 'skillElement'; elementIds: string[] }
  /** Skill có một trong các cờ loại chiêu (`moveFlags`), hoặc `contact` / `recoil` (Reckless). */
  | { if: 'moveFlag'; flags: MoveFlagCondition[] }
  | { if: 'skillSameElement'; value: boolean }
  /**
   * Lớp toàn sân không ở môi trường mặc định (`fieldIds`: đang là một trong các môi trường này;
   * Steel Roller: có địa hình, Rising Voltage: địa hình điện).
   */
  | { if: 'fieldActive'; layer: GlobalFieldLayer; fieldIds?: string[] }
  /** Đang có một trong các room này (Room Service: Trick Room). */
  | { if: 'roomActive'; fieldIds: string[] }
  /** Quái đứng trên mặt đất (tính cả room kiểu Gravity). */
  | { if: 'grounded'; who: DslWho; value: boolean }
  /** Quái đang lắp ít nhất một món (trang bị / đồ cầm; Acrobatics, Poltergeist, Knock Off). */
  | {
      if: 'holdsItem'
      who: DslWho
      value: boolean
      tags?: string[]
      /** Chỉ tính món có tác dụng (không bị Magic Room / Embargo / Klutz tắt): Fling, Natural Gift. */
      usable?: true
    }
  /** Quái đang biến hình (`kinds`: một trong các loại; Behemoth Blade lên quái Dynamax). */
  | { if: 'transformed'; who: DslWho; kinds?: TransformKind[] }
  /** Quái đã / chưa dùng skill bằng lệnh của nó trong lượt này (Payback: đã, Bolt Beak: chưa). */
  | { if: 'actedThisTurn'; who: DslWho; value: boolean }
  /** Bậc trận của quái đã tăng / giảm thật trong lượt này (Burning Jealousy, Lash Out). */
  | { if: 'statsChangedThisTurn'; who: DslWho; direction: 'raised' | 'lowered' }
  /**
   * Quái đã (value true, mặc định) / chưa trúng đòn skill gây sát thương trong lượt này (`by`: do
   * quái đó ra đòn; `categories`: loại đòn; Assurance, Avalanche, Focus Punch, Shell Trap).
   */
  | { if: 'hitThisTurn'; who: DslWho; by?: DslWho; categories?: SkillCategory[]; value?: boolean }
  /** Lần dùng skill gần nhất bằng lệnh của quái thất bại / trượt hết (Stomping Tantrum). */
  | { if: 'lastSkillFailed'; who: DslWho }
  /**
   * Quái đã chọn skill mà chưa dùng trong lượt (`categories` của skill, `minPriority`: priority
   * thật tối thiểu; Sucker Punch: skill gây sát thương, Upper Hand: priority ≥ 1).
   */
  | { if: 'pendingSkill'; who: DslWho; categories?: SkillCategory[]; minPriority?: number }
  /**
   * Skill dùng ngay trước trong lượt là một trong `skillIds` (`sameSide`: do phe của quái mang trait /
   * quái dùng; Round: đồng đội vừa dùng Round, Fusion Flare: vừa có Fusion Bolt).
   */
  | { if: 'previousSkillThisTurn'; skillIds: string[]; sameSide?: boolean }
  /** Phủ định điều kiện bên trong. */
  | { if: 'not'; condition: DslCondition }
  /** Quái `who` khác giới với chủ (cả hai có giới tính; Attract). */
  | { if: 'oppositeGender'; who: DslWho }
  /** Quái `who` có ability (trong trận) là một trong `abilityIds` (Gear Up: Plus / Minus). */
  | { if: 'hasAbility'; who: DslWho; abilityIds: string[] }
  /** Quái `who` đã gục (Fell Stinger: mục tiêu gục vì đòn). */
  | { if: 'fainted'; who: DslWho }
  /** Quái `who` đã tiêu hao đồ cầm trong trận và giờ không cầm gì (Unburden). */
  | { if: 'consumedItem'; who: DslWho }
  /** Phe của quái `who` có quái gục ở lượt trước (Retaliate). */
  | { if: 'allyFaintedLastTurn'; who: DslWho }
  /** Quái `who` biết ≥ 2 skill và đã dùng mọi skill khác skill đang xét trong trận (Last Resort). */
  | { if: 'usedOtherSkills'; who: DslWho }
  /**
   * Quái `who` đang ở dạng trong trận (battle-forms.md): một trong `speciesIds`; bỏ trống = dạng
   * trong trận bất kỳ.
   */
  | { if: 'inForm'; who: DslWho; speciesIds?: string[] }
  /** Đòn của sự kiện làm máu quái `who` tụt từ trên xuống ≤ `percent`% (Wimp Out, Emergency Exit). */
  | { if: 'hpFellBelow'; who: DslWho; percent: number }
  /** Tổng chỉ số `stat` của mọi địch trên sân thấp hơn tổng chỉ số `than` của chúng (Download). */
  | { if: 'foeStatSumLower'; stat: NonHpStat; than: NonHpStat }
  /** Level của quái `who` ≥ `level` (Schooling: từ level 20). */
  | { if: 'levelAtLeast'; who: DslWho; level: number }
  /**
   * Quái `who` đang được đồng đội chỉ huy (Commander; Order Up); `speciesIds`: quái chỉ huy là một
   * trong các loài này (dạng của Tatsugiri quyết định chỉ số Order Up tăng).
   */
  | { if: 'commanded'; who: DslWho; speciesIds?: string[] }
  /** Có quái trên sân (mọi phe, kể cả chủ) mang một trong các ability này (Aura Break). */
  | { if: 'abilityOnField'; abilityIds: string[] }

/**
 * Cờ chiêu dùng trong điều kiện moveFlag: cờ `moveFlags` cộng contact, recoil (phản lực) và
 * secondary (có hiệu ứng skill theo tỉ lệ `chance` < 100: Sheer Force).
 */
export const MOVE_FLAG_CONDITIONS = [...MOVE_FLAGS, 'contact', 'recoil', 'secondary'] as const

export type MoveFlagCondition = (typeof MOVE_FLAG_CONDITIONS)[number]

export const CONDITION_TYPES = [
  'hpBelow',
  'hpAbove',
  'hasStatus',
  'lacksStatus',
  'statusCount',
  'noStatus',
  'category',
  'singleTarget',
  'defending',
  'provoking',
  'counterAtLeast',
  'counterBelow',
  'race',
  'sameRace',
  'element',
  'sameElement',
  'isSelf',
  'notSelf',
  'selfDead',
  'damageAbove',
  'sameSide',
  'statHigher',
  'statLower',
  'reactive',
  'noDamageSinceTurnEnd',
  'partyAllRace',
  'bossBattle',
  'levelOdd',
  'noGainedStats',
  'critical',
  'superEffective',
  'skillTag',
  'skillTarget',
  'skill',
  'skillElement',
  'moveFlag',
  'skillSameElement',
  'fieldActive',
  'roomActive',
  'grounded',
  'holdsItem',
  'transformed',
  'actedThisTurn',
  'statsChangedThisTurn',
  'hitThisTurn',
  'lastSkillFailed',
  'pendingSkill',
  'previousSkillThisTurn',
  'not',
  'oppositeGender',
  'hasAbility',
  'fainted',
  'consumedItem',
  'allyFaintedLastTurn',
  'usedOtherSkills',
  'inForm',
  'abilityOnField',
  'foeStatSumLower',
  'hpFellBelow',
  'commanded',
  'levelAtLeast'
] as const satisfies readonly DslCondition['if'][]

type ConditionChecker = (obj: Record<string, unknown>, field: string, data: GameData) => string[]

const whoCheck: ConditionChecker = (obj, field) => checkOneOf(DSL_WHOS, obj.who, `${field}.who`)
const statusIdsCheck: ConditionChecker = (obj, field, data) => [
  ...whoCheck(obj, field, data),
  ...checkIdList(obj.statusIds, `${field}.statusIds`, data.statuses, { label: 'trạng thái' })
]
const optionalKind = (obj: Record<string, unknown>, field: string): string[] =>
  obj.kind === undefined ? [] : checkOneOf(STATUS_KINDS, obj.kind, `${field}.kind`)
const boolValue: ConditionChecker = (obj, field) =>
  typeof obj.value === 'boolean' ? [] : [`${field}.value phải là true / false`]
const none: ConditionChecker = () => []

const CONDITION_CHECKS: Readonly<Record<DslCondition['if'], ConditionChecker>> = {
  hpBelow: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...checkNumber(obj.percent, `${field}.percent`, 0, 100)
  ],
  hpAbove: (obj, field, data) => CONDITION_CHECKS.hpBelow(obj, field, data),
  hasStatus: statusIdsCheck,
  lacksStatus: statusIdsCheck,
  statusCount: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...optionalKind(obj, field),
    ...checkInteger(obj.min, `${field}.min`, 1)
  ],
  noStatus: (obj, field, data) => [...whoCheck(obj, field, data), ...optionalKind(obj, field)],
  category: (obj, field) =>
    Array.isArray(obj.categories) && obj.categories.length > 0
      ? obj.categories.flatMap((c) => checkOneOf(SKILL_CATEGORIES, c, `${field}.categories`))
      : [`${field}.categories phải là danh sách không rỗng`],
  singleTarget: none,
  defending: whoCheck,
  provoking: whoCheck,
  counterAtLeast: (obj, field, data) => [
    ...checkCounter(obj.counter, `${field}.counter`, data),
    ...checkNumber(obj.min, `${field}.min`)
  ],
  counterBelow: (obj, field, data) => [
    ...checkCounter(obj.counter, `${field}.counter`, data),
    ...checkNumber(obj.max, `${field}.max`)
  ],
  race: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...checkIdList(obj.raceIds, `${field}.raceIds`, raceRefIds(data), { label: 'race' })
  ],
  sameRace: whoCheck,
  element: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...checkIdList(obj.elementIds, `${field}.elementIds`, data.elements, { label: 'hệ' })
  ],
  sameElement: whoCheck,
  isSelf: whoCheck,
  notSelf: whoCheck,
  selfDead: none,
  damageAbove: (obj, field, data) => [
    ...((obj.percentOfMaxHp === undefined) === (obj.percentOfLowestStat === undefined)
      ? [`${field} cần đúng một trong percentOfMaxHp / percentOfLowestStat`]
      : obj.percentOfMaxHp === undefined
        ? checkNumber(obj.percentOfLowestStat, `${field}.percentOfLowestStat`, 0)
        : checkNumber(obj.percentOfMaxHp, `${field}.percentOfMaxHp`, 0)),
    ...(obj.who === undefined ? [] : whoCheck(obj, field, data))
  ],
  sameSide: whoCheck,
  statHigher: (obj, field) => [
    ...(isStageStat(obj.stat) ? [] : [`${field}.stat phải là chỉ số khác hp`]),
    ...checkOneOf(['anyFoe', 'allFoes', 'target'], obj.than, `${field}.than`)
  ],
  statLower: (obj, field, data) => CONDITION_CHECKS.statHigher(obj, field, data),
  reactive: boolValue,
  noDamageSinceTurnEnd: none,
  partyAllRace: none,
  bossBattle: boolValue,
  levelOdd: boolValue,
  noGainedStats: (obj, field) => {
    if (obj.stats === undefined) return []
    if (!Array.isArray(obj.stats)) return [`${field}.stats phải là danh sách chỉ số`]
    return checkStatSelector(obj.stats, `${field}.stats`)
  },
  critical: none,
  superEffective: none,
  skillSameElement: boolValue,
  moveFlag: (obj, field) =>
    Array.isArray(obj.flags) && obj.flags.length > 0
      ? obj.flags.flatMap((flag) => checkOneOf(MOVE_FLAG_CONDITIONS, flag, `${field}.flags`))
      : [`${field}.flags phải là danh sách cờ chiêu`],
  skillElement: (obj, field, data) =>
    checkIdList(obj.elementIds, `${field}.elementIds`, data.elements, { label: 'hệ' }),
  skill: (obj, field, data) =>
    checkIdList(obj.skillIds, `${field}.skillIds`, data.skills, { label: 'skill' }),
  skillTarget: (obj, field) =>
    Array.isArray(obj.targets) && obj.targets.length > 0
      ? obj.targets.flatMap((target) => checkOneOf(SKILL_TARGETS, target, `${field}.targets`))
      : [`${field}.targets phải là danh sách không rỗng`],
  skillTag: (obj, field) =>
    Array.isArray(obj.tags) && obj.tags.length > 0
      ? obj.tags.flatMap((tag) => checkOneOf(SKILL_TAGS, tag, `${field}.tags`))
      : [`${field}.tags phải là danh sách không rỗng`],
  roomActive: (obj, field, data) => {
    const issues = checkIdList(obj.fieldIds, `${field}.fieldIds`, data.fieldEffects, {
      label: 'môi trường'
    })
    if (issues.length > 0 || !Array.isArray(obj.fieldIds)) return issues
    return obj.fieldIds
      .filter((id) => data.fieldEffects[id as string].layer !== 'room')
      .map((id) => `${field}.fieldIds: "${String(id)}" không thuộc lớp room`)
  },
  fieldActive: (obj, field, data) => {
    const issues = checkOneOf(GLOBAL_FIELD_LAYERS, obj.layer, `${field}.layer`)
    if (obj.fieldIds === undefined || issues.length > 0) return issues
    issues.push(
      ...checkIdList(obj.fieldIds, `${field}.fieldIds`, data.fieldEffects, { label: 'môi trường' })
    )
    if (issues.length > 0 || !Array.isArray(obj.fieldIds)) return issues
    return obj.fieldIds
      .filter((id) => data.fieldEffects[id as string].layer !== obj.layer)
      .map((id) => `${field}.fieldIds: "${String(id)}" không thuộc lớp ${String(obj.layer)}`)
  },
  grounded: (obj, field, data) => [...whoCheck(obj, field, data), ...boolValue(obj, field, data)],
  holdsItem: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...boolValue(obj, field, data),
    ...(obj.tags === undefined || (Array.isArray(obj.tags) && obj.tags.length > 0)
      ? []
      : [`${field}.tags phải là danh sách không rỗng`]),
    ...(obj.usable === undefined || obj.usable === true ? [] : [`${field}.usable chỉ được là true`])
  ],
  transformed: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...(obj.kinds === undefined
      ? []
      : Array.isArray(obj.kinds) && obj.kinds.length > 0
        ? obj.kinds.flatMap((kind) => checkOneOf(TRANSFORM_KINDS, kind, `${field}.kinds`))
        : [`${field}.kinds phải là danh sách không rỗng`])
  ],
  actedThisTurn: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...boolValue(obj, field, data)
  ],
  statsChangedThisTurn: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...checkOneOf(['raised', 'lowered'], obj.direction, `${field}.direction`)
  ],
  hitThisTurn: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...(obj.by === undefined ? [] : checkOneOf(DSL_WHOS, obj.by, `${field}.by`)),
    ...(obj.categories === undefined ? [] : CONDITION_CHECKS.category(obj, field, data)),
    ...(obj.value === undefined ? [] : boolValue(obj, field, data))
  ],
  lastSkillFailed: whoCheck,
  not: (obj, field, data) => checkConditions([obj.condition], `${field}.condition`, data),
  oppositeGender: whoCheck,
  fainted: whoCheck,
  consumedItem: whoCheck,
  allyFaintedLastTurn: whoCheck,
  usedOtherSkills: whoCheck,
  hpFellBelow: (obj, field, data) => CONDITION_CHECKS.hpBelow(obj, field, data),
  commanded: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...(obj.speciesIds === undefined
      ? []
      : checkIdList(obj.speciesIds, `${field}.speciesIds`, data.species, { label: 'loài' }))
  ],
  levelAtLeast: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...checkInteger(obj.level, `${field}.level`, 1)
  ],
  foeStatSumLower: (obj, field) => [
    ...(isStageStat(obj.stat) ? [] : [`${field}.stat phải là chỉ số khác hp`]),
    ...(isStageStat(obj.than) ? [] : [`${field}.than phải là chỉ số khác hp`])
  ],
  abilityOnField: (obj, field, data) =>
    checkIdList(obj.abilityIds, `${field}.abilityIds`, data.traits, { label: 'trait' }),
  inForm: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...(obj.speciesIds === undefined
      ? []
      : checkIdList(obj.speciesIds, `${field}.speciesIds`, data.species, { label: 'loài' }))
  ],
  hasAbility: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...checkIdList(obj.abilityIds, `${field}.abilityIds`, data.traits, { label: 'trait' })
  ],
  previousSkillThisTurn: (obj, field, data) => [
    ...checkIdList(obj.skillIds, `${field}.skillIds`, data.skills, { label: 'skill' }),
    ...(obj.sameSide === undefined || typeof obj.sameSide === 'boolean'
      ? []
      : [`${field}.sameSide phải là true / false`])
  ],
  pendingSkill: (obj, field, data) => [
    ...whoCheck(obj, field, data),
    ...(obj.categories === undefined ? [] : CONDITION_CHECKS.category(obj, field, data)),
    ...(obj.minPriority === undefined ? [] : checkInteger(obj.minPriority, `${field}.minPriority`))
  ]
}

export function checkConditions(value: unknown, field: string, data: GameData): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) return [`${field} phải là danh sách điều kiện`]
  return value.flatMap((entry, i) => {
    const obj = asObject(entry)
    const where = `${field}[${i}]`
    if (!obj) return [`${where} phải là object`]
    if (!oneOf(CONDITION_TYPES, obj.if)) return [listMessage(`${where}.if`, CONDITION_TYPES)]
    return CONDITION_CHECKS[obj.if](obj, where, data)
  })
}

// ---------- Lượng ----------

/** Chỉ số dùng để tính lượng: chỉ số thường, cao nhất / thấp nhất (không gồm hp). */
export const AMOUNT_STATS = [
  'attack',
  'spAttack',
  'defense',
  'spDefense',
  'speed',
  'highest',
  'lowest'
] as const

export type AmountStat = (typeof AMOUNT_STATS)[number]

/**
 * Lượng của hiệu ứng (mục "Trait Siralim": quy đổi sát thương):
 * - stat: theo chỉ số của quái `of`; sát thương thì tính bằng công thức chung (chỉ số đó / thủ của
 *   mục tiêu, sức mạnh = percent), chỉ số / máu thì lấy thẳng percent % chỉ số.
 * - hp: theo máu hiện tại / max / đã mất của quái `of` (lượng thẳng).
 * - event: theo lượng của sự kiện (sát thương vừa gây / nhận, máu vừa hồi).
 * - flat: số cố định.
 */
export type AmountSpec = (
  | { stat: AmountStat; of: DslWho; percent: number }
  | { hp: 'current' | 'max' | 'missing'; of: DslWho; percent: number }
  | { event: true; percent: number }
  | { flat: number }
  | { record: RecordAmount; of: DslWho; percent: number; side?: true }
) & {
  /** Nhân lượng với giá trị bộ đếm (trait kiểu "mỗi minion / mỗi đồng đội cùng race"). */
  per?: CounterSpec
}

/** Lượng theo bản ghi trận: tổng sát thương đã gây / đã nhận, máu đã được hồi trong trận. */
export const RECORD_AMOUNTS = ['damageDealt', 'damageTaken', 'healingReceived'] as const

export type RecordAmount = (typeof RECORD_AMOUNTS)[number]

export function checkAmount(value: unknown, field: string, data?: GameData): string[] {
  const obj = asObject(value)
  if (!obj) return [`${field} phải là object`]
  const perIssues = obj.per !== undefined && data ? checkCounter(obj.per, `${field}.per`, data) : []
  if (obj.flat !== undefined) return [...perIssues, ...checkNumber(obj.flat, `${field}.flat`, 0)]
  const issues = [...perIssues, ...checkNumber(obj.percent, `${field}.percent`, 0)]
  if (obj.event !== undefined) {
    if (obj.event !== true) issues.push(`${field}.event chỉ được là true`)
    return issues
  }
  if (obj.record !== undefined) {
    issues.push(...checkOneOf(RECORD_AMOUNTS, obj.record, `${field}.record`))
    if (obj.side !== undefined && obj.side !== true) issues.push(`${field}.side chỉ được là true`)
  } else if (obj.stat !== undefined) {
    issues.push(...checkOneOf(AMOUNT_STATS, obj.stat, `${field}.stat`))
  } else {
    issues.push(...checkOneOf(['current', 'max', 'missing'], obj.hp, `${field}.hp`))
  }
  issues.push(...checkOneOf(DSL_WHOS, obj.of, `${field}.of`))
  return issues
}

// ---------- Mục tiêu của hiệu ứng ----------

/**
 * self, subject, other: như DslWho. allies: đồng đội trên sân (không gồm self); side: self và
 * đồng đội; foes: mọi địch trên sân; randomFoe / randomAlly: một quái ngẫu nhiên; otherFoes: địch
 * trừ `other`; subjectAllies: đồng đội trên sân của `subject` (không gồm nó); faintedAlly /
 * faintedAllies: quái phe mình đã gục (hồi sinh); lowestHpAlly: quái phe mình trên sân ít máu nhất.
 */
export const EFFECT_TARGETS = [
  'self',
  'subject',
  'other',
  'allies',
  'side',
  'foes',
  'randomFoe',
  'randomAlly',
  'otherFoes',
  'subjectAllies',
  'faintedAlly',
  'faintedAllies',
  'lowestHpAlly',
  'lowestHpFoe',
  'leftAlly'
] as const

export type EffectTarget = (typeof EFFECT_TARGETS)[number]

// ---------- Hiệu ứng ----------

/**
 * Chỉ số được đổi: danh sách, mọi chỉ số (khác hp; không gồm chính xác / né), cao nhất, thấp nhất
 * hoặc ngẫu nhiên. Danh sách của `stage` được có chính xác / né (StageSelector).
 */
export type StatSelector = NonHpStat[] | 'all' | 'highest' | 'lowest' | 'random'

/** Bộ chọn chỉ số của hiệu ứng đổi bậc trận: như StatSelector, danh sách được có chính xác / né. */
export type StageSelector = StageStat[] | Exclude<StatSelector, NonHpStat[]>

/** Nguồn skill cho hiệu ứng cast. */
export const CAST_POOLS = ['own', 'ownSpell', 'global', 'party'] as const

export type CastPool = (typeof CAST_POOLS)[number]

/** Phần chung của mọi hiệu ứng: chỉ áp lên mục tiêu thỏa điều kiện (`target` = từng mục tiêu). */
export interface EffectCommon {
  if?: DslCondition[]
  /** % áp lên từng mục tiêu (kiểu "mỗi địch 50% bị Frozen"); bỏ trống = luôn áp. */
  chance?: number
}

export type TraitEffect = EffectCommon &
  (
    | { do: 'damage'; to: EffectTarget; amount: AmountSpec; times?: number }
    | { do: 'heal'; to: EffectTarget; amount: AmountSpec }
    | { do: 'stage'; to: EffectTarget; stats: StageSelector; delta: number }
    | {
        do: 'flatStat'
        to: EffectTarget
        stats: StatSelector
        amount: AmountSpec
        from?: EffectTarget
        /** Trừ chỉ số thay vì cộng (giảm theo lượng). */
        lose?: true
      }
    | {
        do: 'status'
        to: EffectTarget
        statusId?: string
        random?: StatusKind
        count?: number
        turns?: number
        /** Lượng của trạng thái theo lượng (Barrier: sát thương hút được). */
        amount?: AmountSpec
        /** Số lần nhân với hệ số của nguồn (minion: mỗi stack gây một lần). */
        perStack?: true
        /** Số lần nhân với bộ đếm (kiểu "mỗi buff của mục tiêu một debuff"); 0 thì không gây. */
        countPer?: CounterSpec
      }
    | { do: 'cure'; to: EffectTarget; kind: StatusKind; count?: number; statusIds?: string[] }
    | { do: 'moveStatuses'; from: EffectTarget; to: EffectTarget; kind: StatusKind; copy?: true }
    | { do: 'statusPotency'; to: EffectTarget; statusIds: string[]; percent: number }
    | { do: 'statusBurst'; to: EffectTarget; statusIds: string[]; turns: number; remove?: true }
    | {
        do: 'attack'
        to: EffectTarget
        damagePercent: number
        times?: number
        /** Số lần nhân với bộ đếm (kiểu "mỗi lượt đã qua một đòn"). */
        timesPer?: CounterSpec
        /** Quái ra đòn (bỏ trống = chủ trait): ép quái của sự kiện đánh (kiểu Etta's Coercion). */
        by?: EffectTarget
      }
    | {
        do: 'cast'
        to?: EffectTarget
        skillId?: string
        pool?: CastPool
        sameElement?: true
        categories?: SkillCategory[]
        times?: number
        timesPer?: CounterSpec
        /** Dùng lại skill của sự kiện (kiểu Belphegor) thay cho skillId / pool. */
        sameSkill?: true
        /** Dùng lại skill special / status dùng gần nhất trong trận (kiểu Satanachia). */
        lastCast?: true
        /** Chỉ skill thuộc họ này (pool own / ownSpell / global). */
        tags?: SkillTag[]
        /** Chỉ skill thuộc các hệ này (spell theo class của Siralim). */
        elementIds?: string[]
        /** Chọn ngẫu nhiên trong danh sách skill này (Metronome). */
        skillIds?: string[]
        /** Bỏ các skill này khỏi lựa chọn (Sleep Talk, Assist không gọi được một số chiêu). */
        excludeSkillIds?: string[]
        /** Bỏ chiêu nạp lượt khỏi lựa chọn (Sleep Talk). */
        excludeCharge?: true
        /** Skill dùng gần nhất của quái `other` (Mirror Move) / của cả trận (Copycat). */
        lastOf?: 'other' | 'battle'
        /** Skill quái `other` đã chọn mà chưa dùng trong lượt (Me First). */
        pendingOf?: 'other'
        /** Quái dùng skill thay cho chủ hiệu ứng (Instruct: mục tiêu dùng lại chiêu của nó). */
        by?: EffectTarget
        /** Chọn skill theo môi trường đang có (Nature Power); không khớp thì `skillId`. */
        byField?: Record<string, string>
        /** % sát thương của lần dùng (Me First: 150). */
        damagePercent?: number
      }
    | { do: 'revive'; to: EffectTarget; hpPercent: number }
    | { do: 'kill'; to: EffectTarget; belowHpPercent?: number }
    | { do: 'extraTurn'; to: EffectTarget }
    | { do: 'timeline'; to: EffectTarget; position: 'top' | 'bottom' }
    | {
        do: 'minion'
        to: EffectTarget
        minionId?: string
        pool?: string[]
        stacks: number
        /** Cộng stack cho mọi minion đang có thay vì thêm minion mới (kiểu Minion Master). */
        existing?: true
        /** Số minion ngẫu nhiên thêm (mỗi con tung riêng); chỉ khi không có minionId / existing. */
        count?: number
      }
    | { do: 'removeMinions'; to: EffectTarget; minionId?: string }
    | {
        do: 'gainTrait'
        to: EffectTarget
        traitId?: string
        copyFrom?: EffectTarget
        count?: number
      }
    | { do: 'seal'; to: EffectTarget; count: number }
    | { do: 'maxHp'; to: EffectTarget; amount: AmountSpec; lose?: true }
    | { do: 'maxHpToCurrent'; to: EffectTarget }
    /** Bậc trận đang âm về 0 (kiểu White Herb); bậc dương giữ nguyên. */
    /** Xóa bậc bị hạ của `to`; `all`: xóa mọi bậc (Clear Smog, Haze). */
    | { do: 'restoreStages'; to: EffectTarget; all?: true }
    /**
     * Lấy món đang lắp của `from` (lọc `tags`; bỏ trống = mọi món): có `to` thì chuyển sang `to`
     * (Thief, Covet), không thì bỏ (Knock Off, Incinerate, Corrosive Gas). Hết trận trả lại.
     */
    | {
        do: 'takeItems'
        from: EffectTarget
        to?: EffectTarget
        tags?: string[]
        consume?: true
        /** Chỉ lấy món đầu tiên có số này (Fling: flingPower; Natural Gift: naturalGift). */
        firstWith?: 'flingPower' | 'naturalGift'
        /** Món lấy được có `flingStatusId` thì gây trạng thái đó lên quái này (Fling). */
        flingTo?: EffectTarget
      }
    /** Tráo toàn bộ món đang lắp giữa chủ hiệu ứng và `with` (Trick, Switcheroo, Bestow). */
    | { do: 'swapItems'; with: EffectTarget }
    /** Chủ hiệu ứng ăn đồ cầm có nhãn `tags` của `from` và nhận hiệu ứng (Bug Bite, Pluck). */
    | { do: 'eatItems'; from: EffectTarget; tags: string[] }
    /** Lắp lại đồ cầm tiêu hao gần nhất của quái trong trận (Recycle). */
    | { do: 'recycleItem'; to: EffectTarget }
    /** Chia đều máu hiện tại giữa chủ hiệu ứng và `with` (Pain Split). */
    | { do: 'shareHp'; with: EffectTarget }
    /** Chép bậc trận của `from` sang `to` (Psych Up). */
    | { do: 'copyStages'; to: EffectTarget; from: EffectTarget }
    /** Tráo bậc trận giữa chủ hiệu ứng và `with` (`stats` bỏ trống = mọi bậc; Heart / Guard / Power Swap). */
    | { do: 'swapStages'; with: EffectTarget; stats?: StageStat[] }
    /** Đảo dấu mọi bậc trận (Topsy-Turvy). */
    | { do: 'invertStages'; to: EffectTarget }
    /** Chỉ số của chủ hiệu ứng và `with` về trung bình (Guard Split, Power Split). */
    | { do: 'averageStats'; with: EffectTarget; stats: NonHpStat[] }
    /** Tráo chỉ số giữa chủ hiệu ứng và `with` (Speed Swap). */
    | { do: 'swapStats'; with: EffectTarget; stats: NonHpStat[] }
    /** Tráo hai chỉ số của chính quái (Power Trick: công ↔ thủ). */
    | { do: 'swapOwnStats'; to: EffectTarget; stats: [NonHpStat, NonHpStat] }
    /** +`delta` bậc một chỉ số ngẫu nhiên chưa tối đa trong `stats` (Acupressure: mọi chỉ số). */
    | { do: 'randomStage'; to: EffectTarget; stats: StageStat[]; delta: number }
    /**
     * Đổi ability trong trận của `to` thành `abilityId` hoặc ability hiện tại của `from` (Entrainment,
     * Role Play, Simple Beam, Worry Seed, Doodle).
     */
    | { do: 'setAbility'; to: EffectTarget; abilityId?: string; from?: EffectTarget }
    /** Tráo ability trong trận giữa chủ hiệu ứng và `with` (Skill Swap). */
    | { do: 'swapAbilities'; with: EffectTarget }
    /** Vô hiệu ability theo loài tới khi rời sân (Gastro Acid, Core Enforcer). */
    | { do: 'suppressAbility'; to: EffectTarget }
    /** Khóa skill dùng gần nhất của `to` trong `turns` lượt (Disable 4; Spite 2, quy đổi PP). */
    | { do: 'disableSkill'; to: EffectTarget; turns: number }
    /** Ép `to` dùng lại skill gần nhất trong `turns` lượt (Encore). */
    | { do: 'encore'; to: EffectTarget; turns: number }
    /** Tích trữ (Stockpile: tối đa 3 lần) hoặc xả (Spit Up / Swallow: về 0, bỏ bậc thủ đã cộng). */
    | { do: 'stockpile'; to: EffectTarget; change: 'add' | 'reset'; max?: number }
    /**
     * Học skill dùng gần nhất của `other` thay skill đang dùng: `permanent` mãi mãi (Sketch), không thì
     * tới khi rời sân (Mimic).
     */
    | { do: 'learnSkill'; to: EffectTarget; permanent?: true }
    /** Biến thành `from` trong trận: hệ, ability, bậc trận, skill, chỉ số trừ HP (Transform). */
    | { do: 'transformInto'; to: EffectTarget; from: EffectTarget }
    /** Đổi ô sân với `with` cùng phe (Ally Switch). */
    | { do: 'swapPositions'; with: EffectTarget }
    /** Đánh dấu trạng thái tạm của chủ hiệu ứng (Destiny Bond, Grudge, Magic Coat, Snatch). */
    | { do: 'markVolatile'; mark: VolatileMark }
    | { do: 'setHp'; to: EffectTarget; percent: number }
    /** Đặt hiệu ứng theo phe lên phe mình / phe địch của chủ hiệu ứng (Pledge kết hợp). */
    | { do: 'placeSideField'; side: 'own' | 'foe'; fieldId: string }
    /** Đặt thời tiết / địa hình (Sand Spit: bão cát; Seed Sower: địa hình cỏ). */
    | { do: 'placeField'; fieldId: string }
    /** Dọn các lớp toàn sân về mặc định (Teraform Zero: thời tiết và địa hình). */
    | { do: 'clearFields'; layers: GlobalFieldLayer[] }
    /** Bỏ màn chắn của cả hai phe (Screen Cleaner). */
    | { do: 'clearScreens' }
    /** `to` tự rời sân: quái hoang bỏ chạy, quái có chủ rút về dự bị (Wimp Out, Emergency Exit). */
    | { do: 'retreat'; to: EffectTarget }
    /**
     * Commander: chủ hiệu ứng vào miệng đồng đội trên sân thuộc `partnerSpeciesIds` (chưa được chỉ
     * huy): chủ không bị nhắm / không hành động, đồng đội +`stages` mọi chỉ số, cả hai không rời sân.
     */
    | { do: 'command'; partnerSpeciesIds: string[]; stages: number }
    /** Illusion: chủ hiện ra như quái còn sống cuối cùng trong đội (`end`: lộ nguyên hình). */
    | { do: 'illusion'; end?: true }
    /** Bắt đầu đếm ngược gục `turns` lượt cho `to` chưa đếm (Perish Body; như Perish Song). */
    | { do: 'perish'; to: EffectTarget; turns: number }
    /**
     * Đổi dạng trong trận (battle-forms.md): `forms` loài → dạng (loài không có trong bảng thì thôi),
     * `revert` về dạng thường, `toggle` đang ở dạng thì về thường, không thì đổi (Hunger Switch).
     * `untilLeave`: về dạng thường khi rời sân.
     */
    | {
        do: 'changeForm'
        to: EffectTarget
        forms?: Record<string, string>
        revert?: true
        toggle?: true
        untilLeave?: true
      }
    | { do: 'defend'; to: EffectTarget }
    | { do: 'provoke'; to: EffectTarget }
    /** Quái vào thay ô của quái `to` (lần tới nó rời ô) được hồi đầy máu (Z-Memento; z-moves.md). */
    | { do: 'healReplacement'; to: EffectTarget }
    /**
     * +`stages` bậc chí mạng tới khi rời sân (Focus Energy +2, Dragon Cheer); quái đã có thì không
     * có tác dụng (như Pokémon).
     */
    | { do: 'focus'; to: EffectTarget; stages: number }
    | {
        do: 'identity'
        to: EffectTarget
        elementFrom?: EffectTarget
        raceFrom?: EffectTarget
        /** Đổi sang hệ cố định (kiểu Morph Chaos); không dùng cùng elementFrom. */
        elementIds?: string[]
        /** Thêm hệ vào hệ đang có (Forest's Curse: Cỏ; Trick-or-Treat: Ma). */
        addElementIds?: string[]
        /** Bỏ các hệ này khỏi hệ đang có (Burn Up: Lửa; Double Shock: Điện); có thể thành không hệ. */
        removeElementIds?: string[]
        /** Hệ theo skill đầu tiên của quái (Conversion). */
        elementFromFirstSkill?: true
        /** Hệ ngẫu nhiên kháng hệ skill dùng gần nhất của `other` (Conversion 2). */
        resistLastSkillOfOther?: true
        /** Hệ theo skill vừa dùng của sự kiện (Protean, Libero). */
        elementFromSkill?: true
        /** Về lại hệ trước lần đổi hệ đầu tiên trong trận (Mimicry khi hết địa hình). */
        restoreElements?: true
      }
    /** Quái `to` dùng spell trong ô spell của chính nó (by: self = chủ hiệu ứng dùng spell đó). */
    | { do: 'castSpellSlot'; to: EffectTarget; by?: 'self' }
    /** Quái `to` có thêm (tới hết trận) bản sao ô spell của quái `from`. */
    | { do: 'copySpellSlot'; to: EffectTarget; from: EffectTarget }
    /** Ô spell của quái `to` luôn kích hoạt tới hết trận. */
    | { do: 'guaranteeSpellSlot'; to: EffectTarget }
    /** Quái `to` có thêm (tới hết trận) các trait từ trang bị của chủ hiệu ứng. */
    | { do: 'shareEquipmentTraits'; to: EffectTarget }
    | {
        do: 'tempSkill'
        to: EffectTarget
        /** Skill cố định, hoặc ngẫu nhiên theo họ (`tags`) / theo hệ của quái (`sameElement`). */
        skillId?: string
        tags?: SkillTag[]
        elementIds?: string[]
        sameElement?: true
        count?: number
      }
  )

export const TRAIT_EFFECT_TYPES = [
  'damage',
  'heal',
  'stage',
  'flatStat',
  'status',
  'cure',
  'moveStatuses',
  'statusPotency',
  'statusBurst',
  'attack',
  'cast',
  'revive',
  'kill',
  'extraTurn',
  'timeline',
  'minion',
  'removeMinions',
  'gainTrait',
  'seal',
  'maxHp',
  'maxHpToCurrent',
  'restoreStages',
  'takeItems',
  'swapItems',
  'eatItems',
  'recycleItem',
  'shareHp',
  'copyStages',
  'swapStages',
  'invertStages',
  'averageStats',
  'swapStats',
  'swapOwnStats',
  'randomStage',
  'setAbility',
  'swapAbilities',
  'suppressAbility',
  'disableSkill',
  'encore',
  'stockpile',
  'learnSkill',
  'transformInto',
  'swapPositions',
  'markVolatile',
  'setHp',
  'placeSideField',
  'placeField',
  'clearFields',
  'clearScreens',
  'retreat',
  'command',
  'illusion',
  'perish',
  'changeForm',
  'defend',
  'provoke',
  'healReplacement',
  'focus',
  'identity',
  'tempSkill',
  'castSpellSlot',
  'copySpellSlot',
  'guaranteeSpellSlot',
  'shareEquipmentTraits'
] as const satisfies readonly TraitEffect['do'][]

export type TraitEffectType = (typeof TRAIT_EFFECT_TYPES)[number]

function checkTarget(value: unknown, field: string): string[] {
  return checkOneOf(EFFECT_TARGETS, value, field)
}

/** Bộ chọn chỉ số; `stages`: danh sách được có chính xác / né (bậc trận, hiệu ứng `stage`). */
function checkStatSelector(value: unknown, field: string, stages = false): string[] {
  if (value === 'all' || value === 'highest' || value === 'lowest' || value === 'random') return []
  if (!Array.isArray(value) || value.length === 0) {
    return [`${field} phải là danh sách chỉ số hoặc all / highest / lowest / random`]
  }
  const valid = stages ? isBattleStageStat : isStageStat
  return value.flatMap((stat) => (valid(stat) ? [] : [`${field}: chỉ số không hợp lệ`]))
}

const optionalTimes = (value: unknown, field: string): string[] =>
  value === undefined ? [] : checkInteger(value, field, 1)

type EffectChecker = (obj: Record<string, unknown>, field: string, data: GameData) => string[]

const targetOnly: EffectChecker = (obj, field) => checkTarget(obj.to, `${field}.to`)

/** Đánh dấu trạng thái tạm (markVolatile). */
export const VOLATILE_MARKS = ['destinyBond', 'grudge', 'magicCoat', 'snatch', 'cudChew'] as const

export type VolatileMark = (typeof VOLATILE_MARKS)[number]

const STAGE_LIST = ['attack', 'defense', 'spAttack', 'spDefense', 'speed', 'accuracy', 'evasion']

function checkStageList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((stat) => checkOneOf(STAGE_LIST, stat, field))
}

function checkNonHpList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((stat) => checkOneOf(NON_HP_STATS, stat, field))
}

const EFFECT_CHECKS: Readonly<Record<TraitEffectType, EffectChecker>> = {
  damage: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkAmount(obj.amount, `${field}.amount`, data),
    ...optionalTimes(obj.times, `${field}.times`)
  ],
  heal: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkAmount(obj.amount, `${field}.amount`, data)
  ],
  stage: (obj, field) => {
    const issues = [
      ...checkTarget(obj.to, `${field}.to`),
      ...checkStatSelector(obj.stats, `${field}.stats`, true)
    ]
    if (!Number.isSafeInteger(obj.delta) || obj.delta === 0) {
      issues.push(`${field}.delta phải là số nguyên khác 0`)
    }
    return issues
  },
  flatStat: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkStatSelector(obj.stats, `${field}.stats`),
    ...checkAmount(obj.amount, `${field}.amount`, data),
    ...(obj.from === undefined ? [] : checkTarget(obj.from, `${field}.from`)),
    ...(obj.lose === undefined || obj.lose === true ? [] : [`${field}.lose chỉ được là true`])
  ],
  status: (obj, field, data) => {
    const issues = checkTarget(obj.to, `${field}.to`)
    if ((obj.statusId === undefined) === (obj.random === undefined)) {
      issues.push(`${field}: cần đúng một trong statusId / random`)
    }
    if (obj.statusId !== undefined) {
      issues.push(
        ...checkIdList([obj.statusId], `${field}.statusId`, data.statuses, { label: 'trạng thái' })
      )
    }
    if (obj.random !== undefined)
      issues.push(...checkOneOf(STATUS_KINDS, obj.random, `${field}.random`))
    issues.push(...optionalTimes(obj.count, `${field}.count`))
    issues.push(...optionalTimes(obj.turns, `${field}.turns`))
    if (obj.amount !== undefined) issues.push(...checkAmount(obj.amount, `${field}.amount`, data))
    if (obj.perStack !== undefined && obj.perStack !== true)
      issues.push(`${field}.perStack chỉ được là true`)
    if (obj.countPer !== undefined)
      issues.push(...checkCounter(obj.countPer, `${field}.countPer`, data))
    return issues
  },
  cure: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkOneOf(STATUS_KINDS, obj.kind, `${field}.kind`),
    ...optionalTimes(obj.count, `${field}.count`),
    ...(obj.statusIds === undefined
      ? []
      : checkIdList(obj.statusIds, `${field}.statusIds`, data.statuses, { label: 'trạng thái' }))
  ],
  moveStatuses: (obj, field) => [
    ...checkTarget(obj.from, `${field}.from`),
    ...checkTarget(obj.to, `${field}.to`),
    ...checkOneOf(STATUS_KINDS, obj.kind, `${field}.kind`),
    ...(obj.copy === undefined || obj.copy === true ? [] : [`${field}.copy chỉ được là true`])
  ],
  statusPotency: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkIdList(obj.statusIds, `${field}.statusIds`, data.statuses, { label: 'trạng thái' }),
    ...checkNumber(obj.percent, `${field}.percent`)
  ],
  statusBurst: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkIdList(obj.statusIds, `${field}.statusIds`, data.statuses, { label: 'trạng thái' }),
    ...checkInteger(obj.turns, `${field}.turns`, 1)
  ],
  attack: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkNumber(obj.damagePercent, `${field}.damagePercent`, 0),
    ...optionalTimes(obj.times, `${field}.times`),
    ...(obj.timesPer === undefined ? [] : checkCounter(obj.timesPer, `${field}.timesPer`, data)),
    ...(obj.by === undefined ? [] : checkTarget(obj.by, `${field}.by`))
  ],
  cast: (obj, field, data) => {
    const issues = obj.to === undefined ? [] : checkTarget(obj.to, `${field}.to`)
    // byField đi kèm skillId (skill mặc định khi môi trường không khớp, Nature Power).
    const sources = [
      obj.byField === undefined ? obj.skillId : undefined,
      obj.pool,
      obj.sameSkill,
      obj.lastCast,
      obj.skillIds,
      obj.lastOf,
      obj.pendingOf,
      obj.byField
    ].filter((v) => v !== undefined)
    if (sources.length !== 1) {
      issues.push(
        `${field}: cần đúng một trong skillId / pool / sameSkill / lastCast / skillIds / lastOf / pendingOf / byField`
      )
    }
    for (const flag of ['sameSkill', 'lastCast'] as const) {
      if (obj[flag] !== undefined && obj[flag] !== true)
        issues.push(`${field}.${flag} chỉ được là true`)
    }
    if (obj.skillId !== undefined) {
      issues.push(
        ...checkIdList([obj.skillId], `${field}.skillId`, data.skills, { label: 'skill' })
      )
    }
    if (obj.pool !== undefined) issues.push(...checkOneOf(CAST_POOLS, obj.pool, `${field}.pool`))
    for (const key of ['skillIds', 'excludeSkillIds'] as const) {
      if (obj[key] !== undefined) {
        issues.push(...checkIdList(obj[key], `${field}.${key}`, data.skills, { label: 'skill' }))
      }
    }
    if (obj.lastOf !== undefined)
      issues.push(...checkOneOf(['other', 'battle'], obj.lastOf, `${field}.lastOf`))
    if (obj.pendingOf !== undefined)
      issues.push(...checkOneOf(['other'], obj.pendingOf, `${field}.pendingOf`))
    if (obj.by !== undefined) issues.push(...checkTarget(obj.by, `${field}.by`))
    if (obj.damagePercent !== undefined) {
      issues.push(...checkNumber(obj.damagePercent, `${field}.damagePercent`, Number.MIN_VALUE))
    }
    if (obj.byField !== undefined) {
      const byField = asObject(obj.byField)
      if (!byField) issues.push(`${field}.byField phải là object môi trường → skill`)
      for (const [fieldId, skillId] of Object.entries(byField ?? {})) {
        if (!Object.hasOwn(data.fieldEffects, fieldId))
          issues.push(`${field}.byField: môi trường không tồn tại "${fieldId}"`)
        issues.push(
          ...checkIdList([skillId], `${field}.byField.${fieldId}`, data.skills, { label: 'skill' })
        )
      }
    }
    if (obj.categories !== undefined) {
      issues.push(
        ...(Array.isArray(obj.categories)
          ? obj.categories.flatMap((c) => checkOneOf(SKILL_CATEGORIES, c, `${field}.categories`))
          : [`${field}.categories phải là danh sách`])
      )
    }
    issues.push(...optionalTimes(obj.times, `${field}.times`))
    if (obj.timesPer !== undefined) {
      issues.push(...checkCounter(obj.timesPer, `${field}.timesPer`, data))
    }
    if (obj.elementIds !== undefined) {
      issues.push(
        ...checkIdList(obj.elementIds, `${field}.elementIds`, data.elements, { label: 'hệ' })
      )
    }
    return issues
  },
  revive: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkNumber(obj.hpPercent, `${field}.hpPercent`, Number.MIN_VALUE)
  ],
  kill: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...(obj.belowHpPercent === undefined
      ? []
      : checkNumber(obj.belowHpPercent, `${field}.belowHpPercent`, 0, 100))
  ],
  extraTurn: targetOnly,
  timeline: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkOneOf(['top', 'bottom'], obj.position, `${field}.position`)
  ],
  minion: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...(obj.minionId === undefined
      ? []
      : checkIdList([obj.minionId], `${field}.minionId`, data.minions, { label: 'minion' })),
    ...(obj.pool === undefined
      ? []
      : checkIdList(obj.pool, `${field}.pool`, data.minions, { label: 'minion' })),
    ...checkInteger(obj.stacks, `${field}.stacks`, 1),
    ...(obj.existing === undefined || obj.existing === true
      ? []
      : [`${field}.existing chỉ nhận true`]),
    ...(obj.existing && (obj.minionId !== undefined || obj.pool !== undefined)
      ? [`${field}: existing không dùng cùng minionId / pool`]
      : []),
    ...optionalTimes(obj.count, `${field}.count`),
    ...(obj.count !== undefined && (obj.minionId !== undefined || obj.existing)
      ? [`${field}: count không dùng cùng minionId / existing`]
      : [])
  ],
  removeMinions: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...(obj.minionId === undefined
      ? []
      : checkIdList([obj.minionId], `${field}.minionId`, data.minions, { label: 'minion' }))
  ],
  gainTrait: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...(obj.traitId === undefined
      ? []
      : checkIdList([obj.traitId], `${field}.traitId`, data.traits, { label: 'trait' })),
    ...(obj.copyFrom === undefined ? [] : checkTarget(obj.copyFrom, `${field}.copyFrom`)),
    ...optionalTimes(obj.count, `${field}.count`)
  ],
  seal: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkInteger(obj.count, `${field}.count`, 1)
  ],
  maxHp: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkAmount(obj.amount, `${field}.amount`, data)
  ],
  maxHpToCurrent: targetOnly,
  restoreStages: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...(obj.all === undefined || obj.all === true ? [] : [`${field}.all chỉ được là true`])
  ],
  takeItems: (obj, field) => [
    ...checkTarget(obj.from, `${field}.from`),
    ...(obj.flingTo === undefined ? [] : checkTarget(obj.flingTo, `${field}.flingTo`)),
    ...(obj.firstWith === undefined ||
    obj.firstWith === 'flingPower' ||
    obj.firstWith === 'naturalGift'
      ? []
      : [`${field}.firstWith phải là flingPower / naturalGift`]),
    ...(obj.to === undefined ? [] : checkTarget(obj.to, `${field}.to`)),
    ...(obj.tags === undefined || (Array.isArray(obj.tags) && obj.tags.length > 0)
      ? []
      : [`${field}.tags phải là danh sách không rỗng`])
  ],
  swapItems: (obj, field) => checkTarget(obj.with, `${field}.with`),
  eatItems: (obj, field) => [
    ...checkTarget(obj.from, `${field}.from`),
    ...(Array.isArray(obj.tags) && obj.tags.length > 0
      ? []
      : [`${field}.tags phải là danh sách không rỗng`])
  ],
  recycleItem: targetOnly,
  shareHp: (obj, field) => checkTarget(obj.with, `${field}.with`),
  copyStages: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkTarget(obj.from, `${field}.from`)
  ],
  swapStages: (obj, field) => [
    ...checkTarget(obj.with, `${field}.with`),
    ...(obj.stats === undefined ? [] : checkStageList(obj.stats, `${field}.stats`))
  ],
  invertStages: targetOnly,
  averageStats: (obj, field) => [
    ...checkTarget(obj.with, `${field}.with`),
    ...checkNonHpList(obj.stats, `${field}.stats`)
  ],
  swapStats: (obj, field) => [
    ...checkTarget(obj.with, `${field}.with`),
    ...checkNonHpList(obj.stats, `${field}.stats`)
  ],
  swapOwnStats: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...(Array.isArray(obj.stats) && obj.stats.length === 2
      ? checkNonHpList(obj.stats, `${field}.stats`)
      : [`${field}.stats phải là đúng 2 chỉ số`])
  ],
  randomStage: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkStageList(obj.stats, `${field}.stats`),
    ...checkInteger(obj.delta, `${field}.delta`)
  ],
  setAbility: (obj, field, data) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...((obj.abilityId === undefined) === (obj.from === undefined)
      ? [`${field} cần đúng một trong abilityId / from`]
      : []),
    ...(obj.abilityId === undefined
      ? []
      : checkIdList([obj.abilityId], `${field}.abilityId`, data.traits, { label: 'trait' })),
    ...(obj.from === undefined ? [] : checkTarget(obj.from, `${field}.from`))
  ],
  swapAbilities: (obj, field) => checkTarget(obj.with, `${field}.with`),
  suppressAbility: targetOnly,
  disableSkill: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkInteger(obj.turns, `${field}.turns`, 1)
  ],
  encore: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkInteger(obj.turns, `${field}.turns`, 1)
  ],
  stockpile: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkOneOf(['add', 'reset'], obj.change, `${field}.change`),
    ...(obj.max === undefined ? [] : checkInteger(obj.max, `${field}.max`, 1))
  ],
  learnSkill: targetOnly,
  transformInto: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkTarget(obj.from, `${field}.from`)
  ],
  swapPositions: (obj, field) => checkTarget(obj.with, `${field}.with`),
  markVolatile: (obj, field) => checkOneOf(VOLATILE_MARKS, obj.mark, `${field}.mark`),
  clearScreens: () => [],
  clearFields: (obj, field) =>
    Array.isArray(obj.layers) && obj.layers.length > 0
      ? obj.layers.flatMap((layer) => checkOneOf(GLOBAL_FIELD_LAYERS, layer, `${field}.layers`))
      : [`${field}.layers phải là danh sách không rỗng`],
  retreat: targetOnly,
  command: (obj, field, data) => [
    ...checkIdList(obj.partnerSpeciesIds, `${field}.partnerSpeciesIds`, data.species, {
      label: 'loài'
    }),
    ...checkInteger(obj.stages, `${field}.stages`, 1)
  ],
  illusion: (obj, field) =>
    obj.end === undefined || obj.end === true ? [] : [`${field}.end chỉ được là true`],
  perish: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkInteger(obj.turns, `${field}.turns`, 1)
  ],
  changeForm: (obj, field, data) => {
    const issues = checkTarget(obj.to, `${field}.to`)
    if ((obj.forms === undefined) === (obj.revert === undefined)) {
      issues.push(`${field}: cần đúng một trong forms / revert`)
    }
    if (obj.forms !== undefined) issues.push(...checkFormMap(data, obj.forms, `${field}.forms`))
    for (const flag of ['revert', 'toggle', 'untilLeave'] as const) {
      if (obj[flag] !== undefined && obj[flag] !== true)
        issues.push(`${field}.${flag} chỉ được là true`)
    }
    if (obj.toggle !== undefined && obj.forms === undefined) {
      issues.push(`${field}.toggle cần forms`)
    }
    return issues
  },
  placeField: (obj, field, data) => {
    const layer =
      typeof obj.fieldId === 'string' ? data.fieldEffects[obj.fieldId]?.layer : undefined
    return layer === 'weather' || layer === 'terrain'
      ? []
      : [`${field}.fieldId: thời tiết / địa hình không tồn tại "${String(obj.fieldId)}"`]
  },
  placeSideField: (obj, field, data) => [
    ...checkOneOf(['own', 'foe'], obj.side, `${field}.side`),
    ...(typeof obj.fieldId === 'string' && data.fieldEffects[obj.fieldId]?.layer === 'side'
      ? []
      : [`${field}.fieldId: hiệu ứng theo phe không tồn tại "${String(obj.fieldId)}"`])
  ],
  setHp: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkNumber(obj.percent, `${field}.percent`, Number.MIN_VALUE, 100)
  ],
  defend: targetOnly,
  provoke: targetOnly,
  healReplacement: targetOnly,
  focus: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkInteger(obj.stages, `${field}.stages`, 1)
  ],
  identity: (obj, field, data) => {
    const issues = checkTarget(obj.to, `${field}.to`)
    const sources = [
      obj.elementFrom,
      obj.raceFrom,
      obj.elementIds,
      obj.addElementIds,
      obj.removeElementIds,
      obj.elementFromFirstSkill,
      obj.resistLastSkillOfOther,
      obj.elementFromSkill,
      obj.restoreElements
    ]
    if (sources.every((source) => source === undefined)) {
      issues.push(
        `${field}: cần elementFrom, elementIds, addElementIds, removeElementIds, elementFromFirstSkill, resistLastSkillOfOther, elementFromSkill, restoreElements hoặc raceFrom`
      )
    }
    if (obj.restoreElements !== undefined && obj.restoreElements !== true) {
      issues.push(`${field}.restoreElements chỉ được là true`)
    }
    if (obj.removeElementIds !== undefined) {
      issues.push(
        ...checkIdList(obj.removeElementIds, `${field}.removeElementIds`, data.elements, {
          label: 'hệ'
        })
      )
    }
    if (obj.addElementIds !== undefined) {
      issues.push(
        ...checkIdList(obj.addElementIds, `${field}.addElementIds`, data.elements, { label: 'hệ' })
      )
    }
    if (obj.elementIds !== undefined) {
      issues.push(
        ...checkIdList(obj.elementIds, `${field}.elementIds`, data.elements, { label: 'hệ' })
      )
      if (obj.elementFrom !== undefined) {
        issues.push(`${field}: elementIds không dùng cùng elementFrom`)
      }
    }
    if (obj.elementFrom !== undefined)
      issues.push(...checkTarget(obj.elementFrom, `${field}.elementFrom`))
    if (obj.raceFrom !== undefined) issues.push(...checkTarget(obj.raceFrom, `${field}.raceFrom`))
    return issues
  },
  castSpellSlot: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...(obj.by === undefined || obj.by === 'self' ? [] : [`${field}.by chỉ được là self`])
  ],
  copySpellSlot: (obj, field) => [
    ...checkTarget(obj.to, `${field}.to`),
    ...checkTarget(obj.from, `${field}.from`)
  ],
  guaranteeSpellSlot: targetOnly,
  shareEquipmentTraits: targetOnly,
  tempSkill: (obj, field, data) => {
    const issues = [
      ...checkTarget(obj.to, `${field}.to`),
      ...optionalTimes(obj.count, `${field}.count`)
    ]
    if (obj.skillId !== undefined) {
      issues.push(
        ...checkIdList([obj.skillId], `${field}.skillId`, data.skills, { label: 'skill' })
      )
    }
    if (obj.tags !== undefined) {
      issues.push(
        ...(Array.isArray(obj.tags)
          ? obj.tags.flatMap((tag) => checkOneOf(SKILL_TAGS, tag, `${field}.tags`))
          : [`${field}.tags phải là danh sách`])
      )
    }
    if (obj.elementIds !== undefined) {
      issues.push(
        ...checkIdList(obj.elementIds, `${field}.elementIds`, data.elements, { label: 'hệ' })
      )
    }
    if (
      obj.skillId === undefined &&
      obj.tags === undefined &&
      obj.sameElement === undefined &&
      obj.elementIds === undefined
    ) {
      issues.push(`${field}: cần skillId, tags hoặc sameElement`)
    }
    return issues
  }
}

export function checkTraitEffects(value: unknown, field: string, data: GameData): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((entry, i) => {
    const obj = asObject(entry)
    const where = `${field}[${i}]`
    if (!obj) return [`${where} phải là object`]
    if (!oneOf(TRAIT_EFFECT_TYPES, obj.do)) return [listMessage(`${where}.do`, TRAIT_EFFECT_TYPES)]
    return [
      ...EFFECT_CHECKS[obj.do](obj, where, data),
      ...checkConditions(obj.if, `${where}.if`, data),
      ...(obj.chance === undefined ? [] : checkNumber(obj.chance, `${where}.chance`, 0, 100))
    ]
  })
}

// ---------- Sự kiện ----------

/**
 * Sự kiện kích hoạt trait (mục "Trait Siralim"). subject = quái mà sự kiện xảy ra với nó; other =
 * bên kia (kẻ đánh / mục tiêu / người gây trạng thái...).
 * entry: vào sân. turnEnd: cuối lượt (cả "đầu lượt" của Siralim). attack / cast: dùng skill
 * physical gây sát thương / skill special-status (subject = quái dùng, other = mục tiêu đầu).
 * attacked: bị đòn physical của địch trúng; damaged: mất máu vì skill của địch; damagedAny: mất
 * máu vì bất kỳ nguồn nào. dodged: né được đòn (other = kẻ đánh). crit: gây chí mạng. kill: hạ
 * gục quái (other = quái bị hạ). faint: gục. revived: được hồi sinh. healed: được hồi máu.
 * statusGained: dính buff / debuff (other = người gây). statusInflicted: gây debuff lên địch.
 * statusEnded: trạng thái hết hạn / bị gỡ. statusDamage: mất máu vì trạng thái. statGain /
 * statLoss: tăng / bị giảm chỉ số. defend / provoke. minionGained. timelineTop: bị đưa lên đầu
 * Timeline. spellTargeted: bị địch nhắm bằng skill special / status đơn mục tiêu. maxHpGained.
 */
export const TRAIT_EVENTS = [
  'entry',
  'turnEnd',
  'attack',
  'cast',
  'attacked',
  'damaged',
  'damagedAny',
  'dodged',
  'crit',
  'kill',
  'faint',
  'revived',
  'healed',
  'statusGained',
  'statusInflicted',
  'statusEnded',
  'statusDamage',
  'statGain',
  'statLoss',
  'defend',
  'provoke',
  'minionGained',
  'timelineTop',
  'spellTargeted',
  'maxHpGained',
  'fieldChanged',
  'roomSet',
  'berryEaten',
  'transformed'
] as const

export type TraitEventType = (typeof TRAIT_EVENTS)[number]

/**
 * Sự kiện xảy ra với quái nào thì trait phản ứng: chính nó, đồng đội (không gồm nó), cả phe, địch,
 * bất kỳ quái nào.
 */
export const TRIGGER_SCOPES = ['self', 'allies', 'side', 'foes', 'any'] as const

export type TriggerScope = (typeof TRIGGER_SCOPES)[number]

/** Một trait kích hoạt theo sự kiện (hook `trigger`). */
export interface TriggerDef {
  on: TraitEventType
  scope: TriggerScope
  /** % kích hoạt (nhân hệ số cấp, kẹp 100); bỏ trống = 100. */
  chance?: number
  /** Tỉ lệ nhân với giá trị bộ đếm (kiểu "5% cho mỗi debuff"). */
  chancePer?: CounterSpec
  when?: DslCondition[]
  /** Chỉ kích hoạt tối đa một lần mỗi lượt cho mỗi quái mang trait. */
  oncePerTurn?: true
  /** Chỉ kích hoạt lần đầu tiên trong trận. */
  oncePerBattle?: true
  /** Sau khi chạy, tung lại `repeatChance`% để chạy tiếp (trừ dần `repeatDecay` điểm mỗi lần). */
  repeatChance?: number
  repeatDecay?: number
  /** Trạng thái sự kiện (statusGained / statusInflicted / statusEnded / statusDamage) cần đúng id. */
  statusIds?: string[]
  /** Loại trạng thái của sự kiện; bỏ trống = mọi loại. */
  statusKind?: StatusKind
  effects: TraitEffect[]
}

export function checkTrigger(value: unknown, data: GameData): string[] {
  const obj = asObject(value)
  if (!obj) return ['params phải là object']
  const issues = [
    ...checkOneOf(TRAIT_EVENTS, obj.on, 'on'),
    ...checkOneOf(TRIGGER_SCOPES, obj.scope, 'scope'),
    ...checkConditions(obj.when, 'when', data),
    ...checkTraitEffects(obj.effects, 'effects', data)
  ]
  if (obj.chance !== undefined) issues.push(...checkNumber(obj.chance, 'chance', 0, 100))
  if (obj.chancePer !== undefined) issues.push(...checkCounter(obj.chancePer, 'chancePer', data))
  if (obj.repeatChance !== undefined) {
    issues.push(...checkNumber(obj.repeatChance, 'repeatChance', 0, 100))
  }
  if (obj.repeatDecay !== undefined) issues.push(...checkNumber(obj.repeatDecay, 'repeatDecay', 0))
  for (const flag of ['oncePerTurn', 'oncePerBattle'] as const) {
    if (obj[flag] !== undefined && obj[flag] !== true) issues.push(`${flag} chỉ được là true`)
  }
  if (obj.statusIds !== undefined) {
    issues.push(...checkIdList(obj.statusIds, 'statusIds', data.statuses, { label: 'trạng thái' }))
  }
  if (obj.statusKind !== undefined) {
    issues.push(...checkOneOf(STATUS_KINDS, obj.statusKind, 'statusKind'))
  }
  return issues
}
