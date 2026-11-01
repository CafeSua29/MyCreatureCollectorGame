// Kiểm tra dữ liệu thành tựu và danh hiệu (docs/rules/achievements.md): achievements.json, titles.json.

import {
  ACHIEVEMENT_CONDITIONS,
  TITLE_EFFECTS,
  checkTypedParams,
  isTitleEffectType
} from '../registries'
import type {
  AchievementDef,
  AchievementRepeat,
  AchievementRewards,
  AchievementTier,
  GameData,
  TitleDef
} from '../model'
import { asObject, checkInteger, isFiniteNumber } from '../shared'
import { checkItemRewards, checkKnownFields, fieldList } from './checks'

const ACHIEVEMENT_FIELDS = fieldList<AchievementDef>({
  id: true,
  condition: true,
  tiers: true,
  repeat: true
})
const TIER_FIELDS = fieldList<AchievementTier>({ value: true, rewards: true })
const REPEAT_FIELDS = fieldList<AchievementRepeat>({ factor: true, rewards: true })
const REWARD_FIELDS = fieldList<AchievementRewards>({
  moneyPerFloor: true,
  items: true,
  titleId: true
})
const TITLE_FIELDS = fieldList<TitleDef>({ id: true, effects: true })

/** Thưởng: tiền nguyên ≥ 0, vật phẩm gộp chồng, danh hiệu tồn tại; `allowTitle` = false cấm danh hiệu. */
function checkRewards(
  data: GameData,
  value: unknown,
  { where, allowTitle }: { where: string; allowTitle: boolean },
  issues: string[]
): void {
  const rewards = asObject(value)
  if (!rewards) {
    issues.push(`${where}: rewards phải là object`)
    return
  }
  checkKnownFields(rewards, REWARD_FIELDS, `${where}.rewards`, 'thưởng', issues)
  if (rewards.moneyPerFloor !== undefined) {
    issues.push(...checkInteger(rewards.moneyPerFloor, `${where}.rewards.moneyPerFloor`, 0))
  }
  if (rewards.items !== undefined)
    checkItemRewards(data, rewards.items, `${where}.rewards.items`, issues)
  if (rewards.titleId === undefined) return
  if (!allowTitle) issues.push(`${where}.rewards: bậc lặp không được thưởng danh hiệu`)
  else if (typeof rewards.titleId !== 'string' || !Object.hasOwn(data.titles, rewards.titleId)) {
    issues.push(`${where}.rewards: danh hiệu không tồn tại "${String(rewards.titleId)}"`)
  }
}

/** Bậc: danh sách không rỗng, value số dương tăng ngặt, không vượt tiến độ tối đa của điều kiện. */
function checkTiers(
  data: GameData,
  tiers: unknown,
  { where, maxProgress }: { where: string; maxProgress: number | null },
  issues: string[]
): void {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    issues.push(`${where}: tiers phải là danh sách không rỗng`)
    return
  }
  let previous = 0
  tiers.forEach((tier: unknown, i) => {
    const at = `${where}: tiers[${i}]`
    const obj = asObject(tier)
    if (!obj) {
      issues.push(`${at} phải là object`)
      return
    }
    checkKnownFields(obj, TIER_FIELDS, at, 'bậc thành tựu', issues)
    const { value } = obj
    if (!isFiniteNumber(value) || value <= previous) {
      issues.push(`${at}.value phải là số > ${previous} (tăng dần), nhận ${String(value)}`)
    } else {
      previous = value
      if (maxProgress !== null && value > maxProgress) {
        issues.push(`${at}.value ${value} vượt tiến độ tối đa ${maxProgress}`)
      }
    }
    checkRewards(data, obj.rewards, { where: at, allowTitle: true }, issues)
  })
}

/** Bậc lặp: factor > 1, thưởng không có danh hiệu; điều kiện có trần thì không được có bậc lặp. */
function checkRepeat(
  data: GameData,
  repeat: unknown,
  { where, maxProgress }: { where: string; maxProgress: number | null },
  issues: string[]
): void {
  if (repeat === undefined) return
  const obj = asObject(repeat)
  if (!obj) {
    issues.push(`${where}: repeat phải là object`)
    return
  }
  checkKnownFields(obj, REPEAT_FIELDS, `${where}: repeat`, 'bậc lặp', issues)
  if (maxProgress !== null)
    issues.push(`${where}: điều kiện có trần ${maxProgress}, không có bậc lặp`)
  if (!isFiniteNumber(obj.factor) || obj.factor <= 1) {
    issues.push(`${where}: repeat.factor phải là số > 1, nhận ${String(obj.factor)}`)
  }
  checkRewards(data, obj.rewards, { where: `${where}: repeat`, allowTitle: false }, issues)
}

function checkAchievement(data: GameData, achievement: AchievementDef, issues: string[]): void {
  const where = `Thành tựu "${achievement.id}"`
  checkKnownFields(achievement, ACHIEVEMENT_FIELDS, where, 'thành tựu', issues)
  const conditionIssues = checkTypedParams(
    ACHIEVEMENT_CONDITIONS,
    achievement.condition,
    `${where}: condition`,
    data
  )
  issues.push(...conditionIssues)
  // Điều kiện sai thì không biết trần tiến độ: chỉ kiểm tra bậc như điều kiện không trần.
  const { type, ...params } = achievement.condition ?? {}
  const maxProgress =
    conditionIssues.length === 0 ? ACHIEVEMENT_CONDITIONS[type].maxProgress(params, data) : null
  checkTiers(data, achievement.tiers, { where, maxProgress }, issues)
  checkRepeat(data, achievement.repeat, { where, maxProgress }, issues)
}

function checkTitle(title: TitleDef, issues: string[]): void {
  const where = `Danh hiệu "${title.id}"`
  checkKnownFields(title, TITLE_FIELDS, where, 'danh hiệu', issues)
  if (!Array.isArray(title.effects)) {
    issues.push(`${where}: effects phải là danh sách`)
    return
  }
  title.effects.forEach((effect: unknown, i) => {
    const at = `${where}: effects[${i}]`
    const obj = asObject(effect)
    const type = obj?.type
    if (typeof type !== 'string' || !isTitleEffectType(type)) {
      issues.push(`${at}: loại hiệu ứng lạ "${String(type)}"`)
      return
    }
    checkKnownFields(obj, ['type', 'params'], at, 'hiệu ứng', issues)
    for (const issue of TITLE_EFFECTS[type].validateParams(obj?.params)) {
      issues.push(`${at} (${type}): ${issue}`)
    }
  })
}

/** Kiểm tra thành tựu và danh hiệu. */
export function checkAchievementData(data: GameData, issues: string[]): void {
  for (const title of Object.values(data.titles)) checkTitle(title, issues)
  for (const achievement of Object.values(data.achievements)) {
    checkAchievement(data, achievement, issues)
  }
}
