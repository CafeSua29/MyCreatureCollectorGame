// Lý lịch quái (monster-history.md): tạo lý lịch khi quái về tay người chơi, thêm cột
// mốc, kiểm tra lý lịch trong save. Mỗi tính năng có mốc tự gọi addMilestone.

import { asObject, checkInteger } from '../shared'
import {
  DEATH_CAUSES,
  RECRUIT_METHODS,
  type GameData,
  type HistoryOrigin,
  type HistoryOriginKind,
  type Milestone,
  type MilestoneKind,
  type Monster,
  type MonsterHistory
} from '../model'

/** Lúc quái về tay người chơi: ngày game, tầng (null = thị trấn), level. */
export interface MetInfo {
  day: number
  floor: number | null
  level: number
}

/** Gắn lý lịch mới cho quái vừa về tay người chơi (thay lý lịch cũ nếu có). */
export function startHistory(monster: Monster, origin: HistoryOrigin, met: MetInfo): Monster {
  const history: MonsterHistory = {
    origin,
    metDay: met.day,
    metFloor: met.floor,
    metLevel: met.level,
    milestones: []
  }
  return { ...monster, history }
}

/**
 * Thêm một cột mốc vào cuối lý lịch; quá config.history.maxMilestones thì bỏ mốc cũ nhất. Quái
 * chưa có lý lịch (quái hoang) giữ nguyên.
 */
export function addMilestone(data: GameData, monster: Monster, milestone: Milestone): Monster {
  if (!monster.history) return monster
  const milestones = [...monster.history.milestones, milestone].slice(
    -data.config.history.maxMilestones
  )
  return { ...monster, history: { ...monster.history, milestones } }
}

// ---------- Kiểm tra save ----------

type FieldCheck = (data: GameData, value: unknown, where: string) => string[]

const speciesField: FieldCheck = (data, value, where) =>
  typeof value === 'string' && data.species[value]?.kind === 'normal'
    ? []
    : [`${where}: loài không hợp lệ "${String(value)}"`]

const ballField: FieldCheck = (data, value, where) =>
  typeof value === 'string' && data.items[value]?.category === 'ball'
    ? []
    : [`${where}: bóng không hợp lệ "${String(value)}"`]

const expeditionField: FieldCheck = (data, value, where) =>
  typeof value === 'string' && Object.hasOwn(data.expeditions, value)
    ? []
    : [`${where}: mẫu thám hiểm không tồn tại "${String(value)}"`]

const npcNameField: FieldCheck = (data, value, where) =>
  typeof value === 'string' && Object.hasOwn(data.npcNames, value)
    ? []
    : [`${where}: tên NPC không tồn tại "${String(value)}"`]

const eventField: FieldCheck = (data, value, where) =>
  typeof value === 'string' && Object.hasOwn(data.events, value)
    ? []
    : [`${where}: event không tồn tại "${String(value)}"`]

const deathCauseField: FieldCheck = (_data, value, where) =>
  DEATH_CAUSES.some((cause) => cause === value)
    ? []
    : [`${where}: kiểu chết không hợp lệ "${String(value)}"`]

const recruitMethodField: FieldCheck = (_data, value, where) =>
  RECRUIT_METHODS.some((method) => method === value)
    ? []
    : [`${where}: cách thu phục không hợp lệ "${String(value)}"`]

const serumTierField: FieldCheck = (data, value, where) =>
  data.config.implant.tiers.some((tier) => tier.id === value)
    ? []
    : [`${where}: bậc huyết thanh không tồn tại "${String(value)}"`]

const positiveInteger: FieldCheck = (_data, value, where) => checkInteger(value, where, 1)
const nonNegativeInteger: FieldCheck = (_data, value, where) => checkInteger(value, where, 0)

/** Trường của từng loại (ngoài `kind`, và `day` của mốc) và cách kiểm tra. */
type FieldRules = Readonly<Record<string, FieldCheck>>

const SPECIES_CHANGE: FieldRules = { fromSpeciesId: speciesField, toSpeciesId: speciesField }

const ORIGIN_RULES: Record<HistoryOriginKind, FieldRules> = {
  starter: {},
  wild: { ballItemId: ballField },
  boss: { ballItemId: ballField },
  egg: { fatherSpeciesId: speciesField, motherSpeciesId: speciesField },
  bossEgg: { bossSpeciesId: speciesField },
  expeditionEgg: { expeditionId: expeditionField },
  event: { eventId: eventField },
  beastTide: {},
  legacy: { parentSpeciesId: speciesField },
  recruit: { method: recruitMethodField },
  safari: {},
  trade: { npcNameId: npcNameField },
  gacha: {},
  auction: {},
  unknown: {}
}

interface MilestoneRule {
  fields: FieldRules
}

const MILESTONE_RULES: Record<MilestoneKind, MilestoneRule> = {
  hatched: { fields: {} },
  evolved: { fields: SPECIES_CHANGE },
  fused: { fields: { subSpeciesId: speciesField } },
  fuseFailed: { fields: { subSpeciesId: speciesField } },
  sacrificed: { fields: { count: positiveInteger } },
  implanted: { fields: { tierId: serumTierField } },
  implantFailed: { fields: { tierId: serumTierField, fails: positiveInteger } },
  floorBossDefeated: { fields: { floor: positiveInteger } },
  awakened: { fields: { tier: positiveInteger } },
  tribulationFailed: { fields: { tier: positiveInteger, failures: positiveInteger } },
  humanFormed: { fields: {} },
  contracted: { fields: { realm: nonNegativeInteger } },
  reborn: { fields: { count: positiveInteger } },
  mutatedEvolution: { fields: SPECIES_CHANGE },
  imprintPerfected: { fields: {} },
  atavized: { fields: SPECIES_CHANGE },
  died: { fields: { cause: deathCauseField } }
}

/** Kiểm tra một object có `kind` theo bảng luật: kind hợp lệ, đủ trường, không trường lạ. */
function checkKinded(
  data: GameData,
  value: unknown,
  where: string,
  rulesOf: (kind: string) => FieldRules | undefined,
  extraKeys: readonly string[]
): string[] {
  const object = asObject(value)
  if (!object) return [`${where} phải là object`]
  const fields = typeof object.kind === 'string' ? rulesOf(object.kind) : undefined
  if (!fields) return [`${where}.kind không hợp lệ "${String(object.kind)}"`]
  const issues: string[] = []
  for (const [field, check] of Object.entries(fields)) {
    issues.push(...check(data, object[field], `${where}.${field}`))
  }
  const allowed = new Set(['kind', ...extraKeys, ...Object.keys(fields)])
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) issues.push(`${where}: trường lạ "${key}"`)
  }
  return issues
}

const ownRule = <K extends string, V>(table: Record<K, V>, kind: string): V | undefined =>
  Object.hasOwn(table, kind) ? table[kind as K] : undefined

function checkMilestone(data: GameData, value: unknown, where: string): string[] {
  const issues = checkKinded(data, value, where, (kind) => ownRule(MILESTONE_RULES, kind)?.fields, [
    'day'
  ])
  if (issues.length > 0) return issues
  // Đã kiểm tra là object có kind hợp lệ ở trên.
  const milestone = value as Milestone
  issues.push(...checkInteger(milestone.day, `${where}.day`, 0))
  return issues
}

/** Trường gặp: cả ba null (save cũ) hoặc cả ba có giá trị. */
function checkMetFields(history: Record<string, unknown>, at: (f: string) => string): string[] {
  const { metDay, metFloor, metLevel } = history
  if (metDay === null && metFloor === null && metLevel === null) return []
  if (metDay === null || metLevel === null) {
    return [`${at('metDay')}, metLevel: phải cùng null (save cũ) hoặc cùng có giá trị`]
  }
  return [
    ...checkInteger(metDay, at('metDay'), 0),
    ...(metFloor === null ? [] : checkInteger(metFloor, at('metFloor'), 1)),
    ...checkInteger(metLevel, at('metLevel'), 1)
  ]
}

/**
 * Kiểm tra lý lịch của quái (null hợp lệ ở đây; quái nào bắt buộc có lý lịch do validateGameState
 * quyết định). `where` là đường dẫn tới trường history.
 */
export function validateHistory(data: GameData, value: unknown, where: string): string[] {
  if (value === null) return []
  const history = asObject(value)
  if (!history) return [`${where} phải là object hoặc null`]
  const at = (field: string): string => `${where}.${field}`
  const issues = [
    ...checkKinded(data, history.origin, at('origin'), (kind) => ownRule(ORIGIN_RULES, kind), []),
    ...checkMetFields(history, at)
  ]
  const { milestones } = history
  if (!Array.isArray(milestones)) return [...issues, `${at('milestones')} phải là danh sách`]
  const { maxMilestones } = data.config.history
  if (milestones.length > maxMilestones) {
    issues.push(`${at('milestones')}: ${milestones.length} mốc, tối đa ${maxMilestones}`)
  }
  milestones.forEach((m, i) => issues.push(...checkMilestone(data, m, at(`milestones[${i}]`))))
  const allowed = new Set(['origin', 'metDay', 'metFloor', 'metLevel', 'milestones'])
  for (const key of Object.keys(history)) {
    if (!allowed.has(key)) issues.push(`${where}: trường lạ "${key}"`)
  }
  return issues
}
