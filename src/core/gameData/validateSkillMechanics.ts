// Kiểm tra các trường cơ chế chiêu theo gốc của skill (docs/rules/pokemon-moves.md): chỉ số thay thế,
// loại đòn lúc đánh, bỏ qua bậc / ability, khắc hệ đặc biệt.

import { asObject, checkEnumList, checkInteger, checkNumber } from '../shared'
import { checkTraitEffects } from '../registries'
import {
  FIXED_DAMAGE_KINDS,
  INVULNERABLE_KINDS,
  LOCK_IN_KINDS,
  MOVE_FLAGS,
  NON_HP_STATS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_RULES,
  SKILL_REACHES,
  type GameData,
  type Skill
} from '../model'

const isNonHpStat = (value: unknown): boolean =>
  (NON_HP_STATS as readonly unknown[]).includes(value)

function checkTrueFlags(skill: Skill, issues: string[], where: string): void {
  for (const flag of [
    'ignoresTargetStages',
    'ignoresAbility',
    'contact',
    'breaksProtect'
  ] as const) {
    if (skill[flag] !== undefined && skill[flag] !== true)
      issues.push(`${where}: ${flag} chỉ được là true`)
  }
}

function checkEffectiveness(data: GameData, value: unknown, where: string, issues: string[]): void {
  const obj = asObject(value)
  if (!obj) {
    issues.push(`${where}: effectiveness phải là object`)
    return
  }
  for (const key of Object.keys(obj).filter((k) => k !== 'against' && k !== 'extraElementIds')) {
    issues.push(`${where}: effectiveness: trường lạ "${key}"`)
  }
  const against = obj.against === undefined ? {} : asObject(obj.against)
  if (!against) issues.push(`${where}: effectiveness.against phải là object`)
  for (const [elementId, factor] of Object.entries(against ?? {})) {
    if (!Object.hasOwn(data.elements, elementId)) {
      issues.push(`${where}: effectiveness.against: hệ không tồn tại "${elementId}"`)
    }
    issues.push(...checkNumber(factor, `${where}: effectiveness.against.${elementId}`, 0))
  }
  const extra = obj.extraElementIds
  if (extra === undefined) return
  if (!Array.isArray(extra) || extra.length === 0) {
    issues.push(`${where}: effectiveness.extraElementIds phải là danh sách không rỗng`)
    return
  }
  for (const id of extra.filter((entry) => !Object.hasOwn(data.elements, entry))) {
    issues.push(`${where}: effectiveness.extraElementIds: hệ không tồn tại "${String(id)}"`)
  }
}

function checkCategories(value: unknown, field: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${field} phải là danh sách không rỗng`)
    return
  }
  for (const category of value.filter(
    (c) => !(SKILL_CATEGORIES as readonly unknown[]).includes(c)
  )) {
    issues.push(`${field}: "${String(category)}" phải là ${SKILL_CATEGORIES.join(' / ')}`)
  }
}

function checkFixedDamage(data: GameData, value: unknown, where: string, issues: string[]): void {
  const obj = asObject(value)
  const field = `${where}: fixedDamage`
  if (!obj || !(FIXED_DAMAGE_KINDS as readonly unknown[]).includes(obj.kind)) {
    issues.push(`${field}.kind phải là ${FIXED_DAMAGE_KINDS.join(' / ')}`)
    return
  }
  const optionalPercent = (key: string): void => {
    if (obj[key] !== undefined) issues.push(...checkNumber(obj[key], `${field}.${key}`, 0))
  }
  switch (obj.kind) {
    case 'flat':
      issues.push(...checkNumber(obj.amount, `${field}.amount`, 1))
      return
    case 'level':
      optionalPercent('minPercent')
      optionalPercent('maxPercent')
      if (
        typeof obj.minPercent === 'number' &&
        typeof obj.maxPercent === 'number' &&
        obj.minPercent > obj.maxPercent
      ) {
        issues.push(`${field}: minPercent không được lớn hơn maxPercent`)
      }
      return
    case 'counter':
      issues.push(...checkNumber(obj.multiplier, `${field}.multiplier`, Number.MIN_VALUE))
      if (obj.categories !== undefined)
        checkCategories(obj.categories, `${field}.categories`, issues)
      return
    case 'targetHpPercent':
      issues.push(...checkNumber(obj.percent, `${field}.percent`, Number.MIN_VALUE, 100))
      return
    case 'ohko': {
      const immune = obj.immuneElementIds
      if (
        immune !== undefined &&
        (!Array.isArray(immune) || immune.some((id) => !Object.hasOwn(data.elements, id)))
      ) {
        issues.push(`${field}.immuneElementIds phải là danh sách hệ tồn tại`)
      }
      const notElement =
        obj.accuracyIfNotElement === undefined ? undefined : asObject(obj.accuracyIfNotElement)
      if (obj.accuracyIfNotElement !== undefined) {
        if (
          !notElement ||
          typeof notElement.elementId !== 'string' ||
          !Object.hasOwn(data.elements, notElement.elementId)
        ) {
          issues.push(`${field}.accuracyIfNotElement.elementId phải là hệ tồn tại`)
        }
        issues.push(
          ...checkNumber(notElement?.accuracy, `${field}.accuracyIfNotElement.accuracy`, 0, 100)
        )
      }
      return
    }
    default:
      return
  }
}

/** Chi phí tự thân và chừa máu (cụm 4). */
function checkSelfCosts(skill: Skill, where: string, issues: string[]): void {
  if (
    skill.selfFaint !== undefined &&
    skill.selfFaint !== 'always' &&
    skill.selfFaint !== 'onHit'
  ) {
    issues.push(`${where}: selfFaint phải là always / onHit`)
  }
  for (const key of ['crashDamagePercent', 'selfDamagePercent', 'recoilPercent'] as const) {
    if (skill[key] !== undefined) {
      issues.push(...checkNumber(skill[key], `${where}: ${key}`, Number.MIN_VALUE, 100))
    }
  }
  if (skill.leavesOneHp !== undefined && skill.leavesOneHp !== true) {
    issues.push(`${where}: leavesOneHp chỉ được là true`)
  }
}

/** Chiêu nhiều lượt (cụm 6): nạp, nghỉ, khóa, bán vô hình, đòn đến muộn, nạp đầu lượt. */
function checkMultiTurn(data: GameData, skill: Skill, where: string, issues: string[]): void {
  const charge = skill.charge === undefined ? undefined : asObject(skill.charge)
  if (skill.charge !== undefined && !charge) issues.push(`${where}: charge phải là object`)
  if (charge) {
    if (
      charge.invulnerable !== undefined &&
      !(INVULNERABLE_KINDS as readonly unknown[]).includes(charge.invulnerable)
    ) {
      issues.push(`${where}: charge.invulnerable phải là ${INVULNERABLE_KINDS.join(' / ')}`)
    }
    if (charge.onCharge !== undefined)
      issues.push(...checkTraitEffects(charge.onCharge, `${where}: charge.onCharge`, data))
    const skip = charge.skipInFieldIds
    if (
      skip !== undefined &&
      (!Array.isArray(skip) || skip.some((id) => !Object.hasOwn(data.fieldEffects, id)))
    ) {
      issues.push(`${where}: charge.skipInFieldIds phải là danh sách môi trường tồn tại`)
    }
  }
  if (skill.recharge !== undefined && skill.recharge !== true)
    issues.push(`${where}: recharge chỉ được là true`)
  const lockIn = skill.lockIn === undefined ? undefined : asObject(skill.lockIn)
  if (skill.lockIn !== undefined && !lockIn) issues.push(`${where}: lockIn phải là object`)
  if (lockIn) {
    if (!(LOCK_IN_KINDS as readonly unknown[]).includes(lockIn.kind))
      issues.push(`${where}: lockIn.kind phải là ${LOCK_IN_KINDS.join(' / ')}`)
    const turns = asObject(lockIn.turns)
    issues.push(...checkInteger(turns?.min, `${where}: lockIn.turns.min`, 1))
    issues.push(...checkInteger(turns?.max, `${where}: lockIn.turns.max`, 1))
    if (typeof turns?.min === 'number' && typeof turns.max === 'number' && turns.min > turns.max) {
      issues.push(`${where}: lockIn.turns.min không được lớn hơn max`)
    }
    if (
      lockIn.fatigueStatusId !== undefined &&
      !Object.hasOwn(data.statuses, lockIn.fatigueStatusId as string)
    ) {
      issues.push(`${where}: lockIn.fatigueStatusId: trạng thái không tồn tại`)
    }
    const blocks = lockIn.blocksStatusIds
    if (
      blocks !== undefined &&
      (!Array.isArray(blocks) || blocks.some((id) => !Object.hasOwn(data.statuses, id)))
    ) {
      issues.push(`${where}: lockIn.blocksStatusIds phải là danh sách trạng thái tồn tại`)
    }
  }
  const hits = skill.hitsInvulnerable
  if (hits !== undefined) {
    if (!Array.isArray(hits) || hits.length === 0)
      issues.push(`${where}: hitsInvulnerable phải là danh sách không rỗng`)
    else
      for (const [i, entry] of hits.entries()) {
        const obj = asObject(entry)
        if (!(INVULNERABLE_KINDS as readonly unknown[]).includes(obj?.kind))
          issues.push(`${where}: hitsInvulnerable[${i}].kind không hợp lệ`)
        if (obj?.multiplier !== undefined)
          issues.push(
            ...checkNumber(obj.multiplier, `${where}: hitsInvulnerable[${i}].multiplier`, 0)
          )
      }
  }
  if (skill.delayedTurns !== undefined)
    issues.push(...checkInteger(skill.delayedTurns, `${where}: delayedTurns`, 1))
  const start =
    skill.chargeAtTurnStart === undefined ? undefined : asObject(skill.chargeAtTurnStart)
  if (skill.chargeAtTurnStart !== undefined && !start)
    issues.push(`${where}: chargeAtTurnStart phải là object`)
  if (start?.onContactHit !== undefined) {
    issues.push(
      ...checkTraitEffects(start.onContactHit, `${where}: chargeAtTurnStart.onContactHit`, data)
    )
  }
}

/** Trường chiêu trạng thái (cụm 10): dùng khi đang ngủ, phản / cướp, Wish. */
function checkCallFields(data: GameData, skill: Skill, where: string, issues: string[]): void {
  const usable = skill.usableWhileStatusIds
  if (
    usable !== undefined &&
    (!Array.isArray(usable) ||
      usable.length === 0 ||
      usable.some((id) => !Object.hasOwn(data.statuses, id)))
  ) {
    issues.push(`${where}: usableWhileStatusIds phải là danh sách trạng thái tồn tại`)
  }
  for (const flag of [
    'reflectable',
    'snatchable',
    'ignoresStatusPenalty',
    'ignoresRedirect',
    'breaksScreens',
    'stealsBoosts',
    'elementFromGenes',
    'escalatingHits'
  ] as const) {
    if (skill[flag] !== undefined && skill[flag] !== true)
      issues.push(`${where}: ${flag} chỉ được là true`)
  }
  if (skill.elementFromUser !== undefined && !['first', 'last'].includes(skill.elementFromUser)) {
    issues.push(`${where}: elementFromUser phải là first / last`)
  }
  if (skill.randomPower !== undefined) checkRandomPower(skill.randomPower, where, issues)
  if (skill.moveFlags !== undefined) {
    issues.push(...checkEnumList(skill.moveFlags, `${where}: moveFlags`, MOVE_FLAGS))
  }
  if (skill.delayedHealPercent !== undefined) {
    issues.push(
      ...checkNumber(
        skill.delayedHealPercent,
        `${where}: delayedHealPercent`,
        Number.MIN_VALUE,
        100
      )
    )
    if (skill.delayedTurns === undefined)
      issues.push(`${where}: delayedHealPercent cần delayedTurns`)
  }
}

/** Kiểm tra trường cơ chế chiêu của một skill. */
export function checkSkillMechanics(data: GameData, skill: Skill, where: string): string[] {
  const issues: string[] = []
  if (skill.attackFrom !== undefined) {
    const obj = asObject(skill.attackFrom)
    if (!obj || (obj.who !== 'self' && obj.who !== 'target') || !isNonHpStat(obj.stat)) {
      issues.push(`${where}: attackFrom phải là { who: self / target, stat: chỉ số khác hp }`)
    }
  }
  if (skill.defenseStat !== undefined && !isNonHpStat(skill.defenseStat)) {
    issues.push(`${where}: defenseStat phải là chỉ số khác hp`)
  }
  if (
    skill.categoryRule !== undefined &&
    !(SKILL_CATEGORY_RULES as readonly unknown[]).includes(skill.categoryRule)
  ) {
    issues.push(`${where}: categoryRule phải là ${SKILL_CATEGORY_RULES.join(' / ')}`)
  }
  checkTrueFlags(skill, issues, where)
  if (skill.reach !== undefined && !(SKILL_REACHES as readonly unknown[]).includes(skill.reach)) {
    issues.push(`${where}: reach phải là ${SKILL_REACHES.join(' / ')}`)
  }
  if (skill.bodyPart !== undefined && !Object.hasOwn(data.bodyParts, skill.bodyPart)) {
    issues.push(`${where}: bodyPart không tồn tại "${String(skill.bodyPart)}"`)
  }
  if (skill.effectiveness !== undefined)
    checkEffectiveness(data, skill.effectiveness, where, issues)
  if (skill.fixedDamage !== undefined) checkFixedDamage(data, skill.fixedDamage, where, issues)
  checkSelfCosts(skill, where, issues)
  checkMultiTurn(data, skill, where, issues)
  checkCallFields(data, skill, where, issues)
  if (skill.targetsLastAttacker !== undefined) {
    const rule = asObject(skill.targetsLastAttacker)
    if (!rule) issues.push(`${where}: targetsLastAttacker phải là object`)
    else if (rule.categories !== undefined) {
      checkCategories(rule.categories, `${where}: targetsLastAttacker.categories`, issues)
    }
  }
  return issues
}

/** Power ngẫu nhiên: danh sách không rỗng, power ≥ 0, trọng số > 0. */
function checkRandomPower(value: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where}: randomPower phải là danh sách không rỗng`)
    return
  }
  for (const option of value) {
    const obj = asObject(option)
    issues.push(...checkNumber(obj?.power, `${where}: randomPower.power`, 0))
    issues.push(...checkNumber(obj?.weight, `${where}: randomPower.weight`, Number.MIN_VALUE))
  }
}
