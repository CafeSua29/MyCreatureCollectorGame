// Kiểm tra dữ liệu bí cảnh / tháp thí luyện (docs/rules/trials.md): trialRules.json, config.trials.

import { NORMAL_RARITIES, TRIAL_RULE_TYPES, type GameData, type TrialRuleDef } from '../model'
import { TRIAL_RULES } from '../registries'
import { asObject, checkInteger, checkNumber } from '../shared'
import {
  checkChestItems,
  checkDrops,
  checkIntRange,
  checkItemRewards,
  checkKnownFields,
  checkStackItemId,
  fieldList
} from './checks'

const RULE_FIELDS = fieldList<TrialRuleDef>({ id: true, type: true, params: true, weight: true })

function checkTrialRule(data: GameData, rule: TrialRuleDef, issues: string[]): void {
  const where = `Luật bí cảnh "${rule.id}"`
  checkKnownFields(rule, RULE_FIELDS, where, 'luật bí cảnh', issues)
  issues.push(...checkNumber(rule.weight, `${where}: weight`, 0))
  if (!(TRIAL_RULE_TYPES as readonly unknown[]).includes(rule.type)) {
    issues.push(`${where}: type phải là một trong ${TRIAL_RULE_TYPES.join(', ')}`)
    return
  }
  const params = asObject(rule.params)
  if (!params) {
    issues.push(`${where}: params phải là object`)
    return
  }
  const handler = TRIAL_RULES[rule.type]
  checkKnownFields(params, handler.fields, `${where}: params`, `luật ${rule.type}`, issues)
  for (const issue of handler.validateParams(params, data)) issues.push(`${where}: ${issue}`)
}

/** config.trials.realm.chest: món theo trọng số, trang bị (bậc thường), sách. */
function checkChest(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.trials.realm.chest'
  const chest = asObject(value)
  if (!chest) {
    issues.push(`${at} phải là object`)
    return
  }
  issues.push(...checkInteger(chest.itemRolls, `${at}.itemRolls`, 0))
  issues.push(...checkInteger(chest.itemRollsPerBattle, `${at}.itemRollsPerBattle`, 0))
  checkChestItems(data, chest.items, `${at}.items`, issues)
  issues.push(...checkInteger(chest.equipmentCount, `${at}.equipmentCount`, 0))
  const weights = asObject(chest.equipmentRarityWeights)
  if (!weights || Object.keys(weights).length === 0) {
    issues.push(`${at}.equipmentRarityWeights phải là object không rỗng`)
  } else {
    for (const [rarity, weight] of Object.entries(weights)) {
      if (!(NORMAL_RARITIES as readonly string[]).includes(rarity)) {
        issues.push(`${at}.equipmentRarityWeights: bậc lạ "${rarity}"`)
      }
      issues.push(...checkNumber(weight, `${at}.equipmentRarityWeights.${rarity}`, 0))
    }
  }
  issues.push(...checkInteger(chest.skillBookCount, `${at}.skillBookCount`, 0))
  issues.push(...checkNumber(chest.reusableBookChance, `${at}.reusableBookChance`, 0, 100))
}

function checkRealmConfig(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.trials.realm'
  const realm = asObject(value)
  if (!realm) {
    issues.push(`${at} phải là object`)
    return
  }
  issues.push(...checkInteger(realm.floorOffset, `${at}.floorOffset`))
  checkIntRange(realm.battleCount, `${at}.battleCount`, 1, issues)
  checkIntRange(realm.ruleCount, `${at}.ruleCount`, 0, issues)
  issues.push(...checkNumber(realm.trainerChance, `${at}.trainerChance`, 0, 100))
  issues.push(...checkNumber(realm.healPercent, `${at}.healPercent`, 0, 100))
  checkChest(data, realm.chest, issues)
}

function checkTowerConfig(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.trials.tower'
  const tower = asObject(value)
  if (!tower) {
    issues.push(`${at} phải là object`)
    return
  }
  checkIntRange(tower.ruleCount, `${at}.ruleCount`, 0, issues)
  issues.push(...checkNumber(tower.floorScale, `${at}.floorScale`, 0))
  if (typeof tower.floorScale === 'number' && tower.floorScale <= 0) {
    issues.push(`${at}.floorScale phải > 0`)
  }
  issues.push(...checkInteger(tower.levelOffset, `${at}.levelOffset`))
  issues.push(...checkInteger(tower.bossEvery, `${at}.bossEvery`, 1))
  checkItemRewards(data, tower.floorRewards, `${at}.floorRewards`, issues)
  issues.push(...checkInteger(tower.milestoneEvery, `${at}.milestoneEvery`, 1))
  checkItemRewards(data, tower.milestoneRewards, `${at}.milestoneRewards`, issues)
}

/** Kiểm tra luật bí cảnh và config.trials. */
export function checkTrialData(data: GameData, issues: string[]): void {
  for (const rule of Object.values(data.trialRules)) checkTrialRule(data, rule, issues)
  const config = asObject(data.config.trials)
  if (!config) {
    issues.push('config.trials phải là object')
    return
  }
  checkKnownFields(
    config,
    ['tokenItemId', 'tokenBossDrops', 'realm', 'tower'],
    'config.trials',
    'config',
    issues
  )
  issues.push(
    ...checkStackItemId(
      data,
      String(config.tokenItemId),
      'config.trials.tokenItemId',
      'Bí Cảnh Lệnh'
    )
  )
  if (!Array.isArray(config.tokenBossDrops)) {
    issues.push('config.trials.tokenBossDrops phải là danh sách')
  } else checkDrops(data, config.tokenBossDrops, 'config.trials.tokenBossDrops', issues)
  checkRealmConfig(data, config.realm, issues)
  checkTowerConfig(data, config.tower, issues)
}
