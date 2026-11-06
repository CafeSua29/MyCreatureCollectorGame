// Kiểm tra trạng thái bất thường (statuses.json) và miễn nhiễm theo hệ (elements.json).

import { SKILL_EFFECTS, STATUS_HOOKS, TRAIT_HOOKS } from '../registries'
import { MOVE_FLAGS, STATUS_KINDS, type EffectDef, type GameData, type StatusDef } from '../model'
import { asObject, checkEnumList, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { checkEffects } from './checks'

/**
 * Loại buff / debuff; thời hạn (nếu có): số nguyên 1 ≤ min ≤ max (cố định nếu có hook cần đếm
 * lượt, như độc nặng); hook có trong registry (hooks: registry trạng thái, traitHooks: registry
 * trait), ít nhất một hook; nhóm loại trừ (nếu có) là chuỗi không rỗng; overwritesGroup cần nhóm.
 */
/** Trường `wall` của trạng thái (docs/rules/cassette-mechanics.md). */
function checkWallDef(data: GameData, status: StatusDef, where: string, issues: string[]): void {
  const wall = asObject(status.wall)
  const at = `${where}: wall`
  if (!wall) {
    issues.push(`${at} phải là object`)
    return
  }
  if (typeof wall.elementId !== 'string' || !Object.hasOwn(data.elements, wall.elementId)) {
    issues.push(`${at}: hệ không tồn tại "${String(wall.elementId)}"`)
  }
  issues.push(...checkInteger(wall.hits, `${at}.hits`, 1))
  if (wall.special !== undefined && wall.special !== true) {
    issues.push(`${at}.special chỉ được là true`)
  }
  const attack = wall.attackSkillId
  if (attack !== undefined && (typeof attack !== 'string' || !data.skills[attack])) {
    issues.push(`${at}.attackSkillId: skill không tồn tại "${String(attack)}"`)
  }
  if (wall.onBlocked !== undefined) {
    if (!Array.isArray(wall.onBlocked) || wall.onBlocked.length === 0) {
      issues.push(`${at}.onBlocked phải là danh sách không rỗng`)
    } else {
      wall.onBlocked.forEach((entry: unknown, i) => {
        const outcome = asObject(entry)
        issues.push(
          ...checkNumber(outcome?.weight, `${at}.onBlocked[${i}].weight`, Number.MIN_VALUE)
        )
        checkEffects(
          SKILL_EFFECTS,
          outcome?.effects as EffectDef[],
          `${at}.onBlocked[${i}]`,
          data,
          issues
        )
      })
    }
  }
}

/** Trường trạng thái của phản ứng hệ (docs/rules/element-reactions.md). */
function checkReactionStatusFields(
  data: GameData,
  status: StatusDef,
  where: string,
  issues: string[]
): void {
  const { skillTargetOverride: override, conductsElement } = status
  if (override !== undefined && override !== 'allEnemies' && override !== 'enemy') {
    issues.push(`${where}: skillTargetOverride phải là allEnemies / enemy`)
  }
  if (status.wall !== undefined) checkWallDef(data, status, where, issues)
  if (status.staminaPerTurn !== undefined && !isFiniteNumber(status.staminaPerTurn)) {
    issues.push(`${where}: staminaPerTurn phải là số`)
  }
  for (const flag of ['seeThroughWall', 'meleeAsRanged'] as const) {
    if (status[flag] !== undefined && status[flag] !== true) {
      issues.push(`${where}: ${flag} chỉ được là true`)
    }
  }
  if (status.damageOnTransform !== undefined) {
    issues.push(
      ...checkNumber(status.damageOnTransform, 'damageOnTransform', Number.MIN_VALUE, 100).map(
        (problem) => `${where}: ${problem}`
      )
    )
  }
  if (conductsElement === undefined) return
  const rule = asObject(conductsElement)
  if (typeof rule?.elementId !== 'string' || !Object.hasOwn(data.elements, rule.elementId)) {
    issues.push(`${where}: conductsElement: hệ không tồn tại "${String(rule?.elementId)}"`)
  }
  issues.push(
    ...checkNumber(rule?.percent, 'percent', Number.MIN_VALUE).map(
      (problem) => `${where}: conductsElement: ${problem}`
    )
  )
}

export function checkStatuses(data: GameData, issues: string[]): void {
  for (const status of Object.values(data.statuses)) {
    const where = `Trạng thái "${status.id}"`
    if (!STATUS_KINDS.includes(status.kind)) issues.push(`${where}: kind phải là buff / debuff`)
    checkDuration(status.duration, where, issues)
    const traitHooks = status.traitHooks ?? []
    // Trạng thái có hành vi riêng qua cờ (Embargo: disablesItems) thì không cần hook.
    const hasBehavior =
      status.disablesItems === true ||
      status.forcesSpecialDamage === true ||
      status.blocksRepeatSkill === true ||
      status.imprisons === true ||
      status.blocksHealing === true ||
      status.blocksSoundSkills === true ||
      status.onEndStatusId !== undefined ||
      status.skillElementOverride !== undefined ||
      status.skillTargetOverride !== undefined ||
      status.conductsElement !== undefined ||
      status.wall !== undefined ||
      status.staminaPerTurn !== undefined ||
      status.seeThroughWall === true ||
      status.meleeAsRanged === true ||
      status.damageOnTransform !== undefined ||
      status.explodesOnElement !== undefined ||
      status.marker === true
    if (
      Array.isArray(status.hooks) &&
      status.hooks.length === 0 &&
      traitHooks.length === 0 &&
      !hasBehavior
    ) {
      issues.push(`${where}: cần ít nhất một hook (hooks, traitHooks hoặc cờ disablesItems)`)
    }
    checkEffects(STATUS_HOOKS, status.hooks, where, data, issues)
    if (status.traitHooks !== undefined) {
      checkEffects(TRAIT_HOOKS, status.traitHooks, `${where}.traitHooks`, data, issues)
    }
    const group: unknown = status.exclusiveGroup
    if (group !== undefined && (typeof group !== 'string' || group === '')) {
      issues.push(`${where}: exclusiveGroup phải là chuỗi không rỗng`)
    }
    for (const flag of [
      'overwritesGroup',
      'battleOnly',
      'endsOnLeave',
      'resetsOnLeave',
      'endsWhenSourceLeaves',
      'disablesItems',
      'blocksRepeatSkill',
      'imprisons',
      'blocksHealing',
      'blocksSoundSkills',
      'drainsToSource',
      'marker',
      'excludeFromRandom'
    ] as const) {
      if (status[flag] !== undefined && status[flag] !== true)
        issues.push(`${where}: ${flag} chỉ được là true`)
    }
    if (status.overwritesGroup && group === undefined) {
      issues.push(`${where}: overwritesGroup cần exclusiveGroup`)
    }
    for (const key of ['onEndStatusId', 'requiresStatusId'] as const) {
      const ref = status[key]
      if (ref !== undefined && (typeof ref !== 'string' || !Object.hasOwn(data.statuses, ref))) {
        issues.push(`${where}: ${key}: trạng thái không tồn tại "${String(ref)}"`)
      }
    }
    const override = status.skillElementOverride
    if (
      override !== undefined &&
      (typeof override !== 'string' || !Object.hasOwn(data.elements, override))
    ) {
      issues.push(`${where}: skillElementOverride: hệ không tồn tại "${String(override)}"`)
    }
    checkReactionStatusFields(data, status, where, issues)
    if (status.explodesOnElement !== undefined) {
      const rule = asObject(status.explodesOnElement)
      const ids = rule?.elementIds
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.some((id) => !Object.hasOwn(data.elements, id))
      ) {
        issues.push(`${where}: explodesOnElement.elementIds phải là danh sách hệ tồn tại`)
      }
      issues.push(
        ...checkNumber(rule?.percent, `${where}: explodesOnElement.percent`, Number.MIN_VALUE, 100)
      )
    }
    // Trạng thái chỉ có hành vi qua cờ (Torment, Imprison, Heal Block, Yawn, Electrify, Powder).
    checkFixedDuration(status, where, issues)
    // Hệ số bắt khi quái hoang mang trạng thái (mục "Bắt quái" ở battle.md).
    if (status.catchMultiplier !== undefined) {
      issues.push(
        ...checkNumber(status.catchMultiplier, `${where}: catchMultiplier`, Number.MIN_VALUE)
      )
    }
  }
}

/** Thời hạn (bỏ trống = không theo lượt): object { min, max } nguyên, 1 ≤ min ≤ max. */
function checkDuration(value: unknown, where: string, issues: string[]): void {
  if (value === undefined) return
  const duration = asObject(value)
  if (!duration) {
    issues.push(`${where}: duration phải là object { min, max }`)
    return
  }
  issues.push(...checkInteger(duration.min, `${where}: duration.min`, 1))
  issues.push(
    ...checkInteger(
      duration.max,
      `${where}: duration.max`,
      isFiniteNumber(duration.min) ? duration.min : 1
    )
  )
}

/** Hook cần đếm số lượt đã qua (requiresFixedDuration) thì thời hạn phải cố định. */
function checkFixedDuration(status: StatusDef, where: string, issues: string[]): void {
  if (!Array.isArray(status.hooks) || status.duration?.min === status.duration?.max) return
  // Không theo lượt (không có duration) thì đếm số lượt bằng turnsElapsed, không cần cố định.
  if (status.duration === undefined) return
  const needsFixed = status.hooks.some(
    (hook) => STATUS_HOOKS[hook?.type]?.requiresFixedDuration?.(hook.params) === true
  )
  if (needsFixed) issues.push(`${where}: hook tăng dần cần duration cố định (min = max)`)
}

/** statusImmunities của hệ (nếu có): danh sách trạng thái tồn tại, không lặp. */
export function checkElementStatusImmunities(data: GameData, issues: string[]): void {
  for (const element of Object.values(data.elements)) {
    const immunities: unknown = element.statusImmunities
    if (immunities === undefined) continue
    const where = `Hệ "${element.id}": statusImmunities`
    if (!Array.isArray(immunities)) {
      issues.push(`${where} phải là danh sách`)
      continue
    }
    for (const statusId of immunities) {
      if (typeof statusId !== 'string' || !(statusId in data.statuses)) {
        issues.push(`${where}: trạng thái không tồn tại "${String(statusId)}"`)
      }
    }
    if (new Set(immunities).size !== immunities.length) issues.push(`${where} bị lặp`)
  }
  for (const element of Object.values(data.elements)) {
    if (element.immuneMoveFlags === undefined) continue
    issues.push(
      ...checkEnumList(element.immuneMoveFlags, `Hệ "${element.id}": immuneMoveFlags`, MOVE_FLAGS)
    )
  }
}
