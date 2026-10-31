// Kiểm tra dữ liệu ngự thú sư (docs/rules/tamer.md): config.tamer, tamerSkills.json, tamerRealms.json.

import { ITEM_EFFECTS, SKILL_EFFECTS } from '../registries'
import {
  TAMER_SKILL_TARGETS,
  type EffectDef,
  type EffectTamerSkill,
  type GameData,
  type TamerSkill
} from '../model'
import { asObject, checkInteger, checkMilestones, checkNumber } from '../shared'
import { checkDrops, checkEffects, checkEffectTargets, checkKnownFields } from './checks'

const BASE_FIELDS: readonly string[] = [
  'id',
  'unlockRealm',
  'manaCost',
  'cooldown',
  'usesPerBattle',
  'target'
]

/**
 * Thị Uy (`wildFoe`, docs/rules/recruit.md) và hợp thể (`merge`, docs/rules/battle-merge.md) không có
 * `effects`: số ở config.
 */
const hasNoEffects = (target: TamerSkill['target']): boolean =>
  target === 'wildFoe' || target === 'merge'

const fieldsOf = (target: TamerSkill['target']): readonly string[] =>
  hasNoEffects(target) ? BASE_FIELDS : [...BASE_FIELDS, 'effects']

/**
 * Hiệu ứng skill dùng cho kỹ năng ngự thú sư: không rút về (không có lượt của quái); mục tiêu
 * `field` chỉ nhận hiệu ứng perSkill (một lần cho cả lượt dùng, theo phe / cả phe).
 */
function checkSkillEffectUse(skill: EffectTamerSkill, where: string, issues: string[]): void {
  const effects: readonly EffectDef[] = Array.isArray(skill.effects) ? skill.effects : []
  // Quái dùng skill là chính mục tiêu (allyOnField) hoặc một quái ta trên sân (field).
  checkEffectTargets(effects, 'self', where, issues)
  for (const effect of effects) {
    const handler = SKILL_EFFECTS[effect.type]
    if (!handler) continue
    if (handler.switchesUserOut) {
      issues.push(`${where}: hiệu ứng "${effect.type}" không dùng cho kỹ năng ngự thú sư`)
    }
    if (skill.target === 'field' && handler.timing !== 'perSkill') {
      issues.push(
        `${where}: mục tiêu "field" chỉ nhận hiệu ứng perSkill, "${effect.type}" không phải`
      )
    }
  }
}

function checkTamerSkill(data: GameData, skill: TamerSkill, issues: string[]): void {
  const where = `Kỹ năng ngự thú sư "${skill.id}"`
  const knownTarget = TAMER_SKILL_TARGETS.includes(skill.target)
  checkKnownFields(
    skill,
    knownTarget ? fieldsOf(skill.target) : [...BASE_FIELDS, 'effects'],
    where,
    'kỹ năng ngự thú sư',
    issues
  )
  issues.push(...checkInteger(skill.unlockRealm, `${where}: unlockRealm`, 0))
  issues.push(...checkInteger(skill.manaCost, `${where}: manaCost`, 0))
  issues.push(...checkInteger(skill.cooldown, `${where}: cooldown`, 0))
  if (skill.usesPerBattle !== undefined) {
    issues.push(...checkInteger(skill.usesPerBattle, `${where}: usesPerBattle`, 1))
  }
  if (!knownTarget) {
    issues.push(`${where}: target phải là một trong ${TAMER_SKILL_TARGETS.join(', ')}`)
    return
  }
  if (skill.target === 'wildFoe' || skill.target === 'merge') return
  const usesItemEffects = skill.target === 'ally'
  checkEffects(usesItemEffects ? ITEM_EFFECTS : SKILL_EFFECTS, skill.effects, where, data, issues)
  if (Array.isArray(skill.effects) && skill.effects.length === 0) {
    issues.push(`${where}: cần ít nhất một hiệu ứng`)
  }
  if (!usesItemEffects) checkSkillEffectUse(skill, where, issues)
}

function checkTamerConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.tamer)
  if (!config) {
    issues.push('config.tamer phải là object')
    return
  }
  const at = (field: string): string => `config.tamer.${field}`
  const push = (problems: string[]): void => void issues.push(...problems)
  push(checkNumber(config.expShare, at('expShare'), 0))
  push(checkNumber(config.floorUnlockExpPercent, at('floorUnlockExpPercent'), 0))
  push(checkNumber(config.expBase, at('expBase'), Number.MIN_VALUE))
  push(checkNumber(config.expPower, at('expPower'), 0))
  const breakthrough = asObject(config.breakthrough)
  push(checkNumber(breakthrough?.costBase, at('breakthrough.costBase'), 0))
  const itemId = breakthrough?.itemId
  if (typeof itemId !== 'string' || data.items[itemId]?.category !== 'material') {
    issues.push(
      `${at('breakthrough.itemId')} phải là vật phẩm category "material", nhận "${String(itemId)}"`
    )
  }
  push(checkNumber(breakthrough?.minChance, at('breakthrough.minChance'), 0, 100))
  push(checkNumber(breakthrough?.baseChance, at('breakthrough.baseChance'), 0, 100))
  push(checkNumber(breakthrough?.chanceStep, at('breakthrough.chanceStep'), 0))
  push(checkNumber(config.statPercentPerRealm, at('statPercentPerRealm'), 0))
  push(checkNumber(config.lifespanPercentPerRealm, at('lifespanPercentPerRealm'), 0))
  checkContractConfig(config.contract, at('contract'), issues)
  push(checkInteger(config.manaBase, at('manaBase'), 0))
  push(checkInteger(config.manaPerRealm, at('manaPerRealm'), 0))
  push(checkMilestones(config.realmMilestones, at('realmMilestones'), 1))
  if (!Array.isArray(config.floorBossDrops))
    issues.push(`${at('floorBossDrops')} phải là danh sách`)
  else checkDrops(data, config.floorBossDrops, at('floorBossDrops'), issues)
}

/** Mức tâm linh tương thông: id không trùng, số ngày nguyên ≥ 1 tăng dần, thân mật ≥ 0, % trong khoảng. */
function checkSoulLinkTiers(value: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  const ids = new Set<string>()
  let lastDays = 0
  value.forEach((entry, i) => {
    const at = `${where}[${i}]`
    const tier = asObject(entry)
    if (!tier) {
      issues.push(`${at} phải là object`)
      return
    }
    checkKnownFields(
      tier,
      ['id', 'days', 'minAffinity', 'statPercent', 'manaCostReduction'],
      at,
      'mức',
      issues
    )
    if (typeof tier.id !== 'string' || tier.id === '' || ids.has(tier.id)) {
      issues.push(`${at}.id phải là chuỗi không rỗng, không trùng`)
    } else ids.add(tier.id)
    issues.push(...checkInteger(tier.days, `${at}.days`, lastDays + 1))
    if (typeof tier.days === 'number') lastDays = tier.days
    issues.push(...checkInteger(tier.minAffinity, `${at}.minAffinity`, 0))
    issues.push(...checkNumber(tier.statPercent, `${at}.statPercent`, 0))
    issues.push(...checkNumber(tier.manaCostReduction, `${at}.manaCostReduction`, 0, 100))
  })
}

/** config.tamer.contract: khế ước (docs/rules/tamer.md mục "Khế ước"). */
function checkContractConfig(value: unknown, where: string, issues: string[]): void {
  const config = asObject(value)
  if (!config) {
    issues.push(`${where} phải là object`)
    return
  }
  const push = (found: string[]): void => {
    issues.push(...found)
  }
  push(checkInteger(config.levelBase, `${where}.levelBase`, 1))
  push(checkInteger(config.levelPerRealm, `${where}.levelPerRealm`, 0))
  push(checkInteger(config.slotsBase, `${where}.slotsBase`, 1))
  push(checkInteger(config.slotsPerRealm, `${where}.slotsPerRealm`, 0))
  push(checkNumber(config.baseStatPercent, `${where}.baseStatPercent`, 0))
  push(checkNumber(config.baseLifespanPercent, `${where}.baseLifespanPercent`, 0))
  const chance = asObject(config.chance)
  if (!chance) issues.push(`${where}.chance phải là object`)
  else {
    for (const key of ['base', 'levelPenalty', 'rankPenalty', 'bossPenalty', 'affinityBonus']) {
      push(checkNumber(chance[key], `${where}.chance.${key}`, 0))
    }
    push(checkNumber(chance.min, `${where}.chance.min`, 0, 100))
    push(checkNumber(chance.max, `${where}.chance.max`, 0, 100))
    if (typeof chance.min === 'number' && typeof chance.max === 'number' && chance.min > chance.max)
      issues.push(`${where}.chance.min phải ≤ max`)
  }
  const failure = asObject(config.failure)
  if (!failure) issues.push(`${where}.failure phải là object`)
  else {
    push(checkInteger(failure.affinityLoss, `${where}.failure.affinityLoss`, 0))
    push(checkInteger(failure.backlashDays, `${where}.failure.backlashDays`, 0))
    push(checkNumber(failure.escapeChance, `${where}.failure.escapeChance`, 0, 100))
  }
  push(checkInteger(config.dissolveAffinityLoss, `${where}.dissolveAffinityLoss`, 0))
  push(checkInteger(config.dissolveBacklashDays, `${where}.dissolveBacklashDays`, 0))
  checkSoulLinkTiers(config.soulLinkTiers, `${where}.soulLinkTiers`, issues)
  const disobey = asObject(config.disobey)
  if (!disobey) issues.push(`${where}.disobey phải là object`)
  else {
    for (const key of ['base', 'levelScale', 'overLimitScale']) {
      push(checkNumber(disobey[key], `${where}.disobey.${key}`, 0))
    }
    push(checkNumber(disobey.max, `${where}.disobey.max`, 0, 100))
    push(checkNumber(disobey.affinityReduction, `${where}.disobey.affinityReduction`, 0, 1))
  }
}

/** Kiểm tra mọi dữ liệu ngự thú sư. */
/** config.bond: bản mệnh thú (docs/rules/tamer.md). */
function checkBondConfig(data: GameData, issues: string[]): void {
  const bond = asObject(data.config.bond)
  if (!bond) {
    issues.push('config.bond phải là object')
    return
  }
  const fields = [
    'minAffinity',
    'resonanceMultiplier',
    'lifespanMultiplier',
    'manaCostPercent',
    'rebindCostPerRealm',
    'rebindAffinityLoss',
    'rebindCooldownDays',
    'woundDays',
    'woundManaPercent'
  ]
  checkKnownFields(bond, fields, 'config.bond', 'config', issues)
  issues.push(...checkNumber(bond.minAffinity, 'config.bond.minAffinity', 0))
  issues.push(...checkNumber(bond.resonanceMultiplier, 'config.bond.resonanceMultiplier', 1))
  issues.push(...checkNumber(bond.lifespanMultiplier, 'config.bond.lifespanMultiplier', 1))
  issues.push(...checkNumber(bond.manaCostPercent, 'config.bond.manaCostPercent', 0, 100))
  issues.push(...checkNumber(bond.rebindCostPerRealm, 'config.bond.rebindCostPerRealm', 0))
  issues.push(...checkNumber(bond.rebindAffinityLoss, 'config.bond.rebindAffinityLoss', 0))
  issues.push(...checkInteger(bond.rebindCooldownDays, 'config.bond.rebindCooldownDays', 0))
  issues.push(...checkInteger(bond.woundDays, 'config.bond.woundDays', 1))
  issues.push(...checkNumber(bond.woundManaPercent, 'config.bond.woundManaPercent', 0, 100))
}

export function checkTamerData(data: GameData, issues: string[]): void {
  checkTamerConfig(data, issues)
  checkBondConfig(data, issues)
  for (const skill of Object.values(data.tamerSkills)) checkTamerSkill(data, skill, issues)
  if (Object.keys(data.tamerRealms).length === 0) {
    issues.push('tamerRealms: cần ít nhất một tên cảnh giới')
  }
  for (const realm of Object.values(data.tamerRealms)) {
    checkKnownFields(realm, ['id'], `Cảnh giới "${realm.id}"`, 'cảnh giới', issues)
  }
}
