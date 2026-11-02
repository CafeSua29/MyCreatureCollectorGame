// Kiểm tra dữ liệu thiên phú ngự thú sư (docs/rules/tamer-talents.md): config.tamerTalents,
// tamerTalentBranches.json, tamerTalents.json; danh sách kênh thưởng (dùng chung với danh hiệu).

import { TAMER_BONUSES, isTamerBonusType } from '../registries'
import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'
import { checkKnownFields } from './checks'
import { checkRankedNode } from './validateTalents'

const CONFIG_FIELDS = [
  'pointsPerRealm',
  'pointsPerQuest',
  'pointsPerAchievementTier',
  'resetItemId'
]
const BRANCH_FIELDS = ['id']
const NODE_FIELDS = ['id', 'branchId', 'requires', 'maxRank', 'costPerRank', 'effects']

/** Danh sách kênh thưởng ngự thú sư (danh hiệu, nút thiên phú): loại có trong TAMER_BONUSES, params đúng. */
export function checkTamerBonusEffects(effects: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(effects)) {
    issues.push(`${where}: effects phải là danh sách`)
    return
  }
  effects.forEach((effect: unknown, i) => {
    const at = `${where}: effects[${i}]`
    const obj = asObject(effect)
    const type = obj?.type
    if (typeof type !== 'string' || !isTamerBonusType(type)) {
      issues.push(`${at}: loại hiệu ứng lạ "${String(type)}"`)
      return
    }
    checkKnownFields(obj, ['type', 'params'], at, 'hiệu ứng', issues)
    for (const issue of TAMER_BONUSES[type].validateParams(obj?.params)) {
      issues.push(`${at} (${type}): ${issue}`)
    }
  })
}

function checkConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.tamerTalents)
  if (!config) {
    issues.push('config.tamerTalents phải là object')
    return
  }
  const at = (field: string): string => `config.tamerTalents.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.tamerTalents', 'config', issues)
  for (const field of ['pointsPerRealm', 'pointsPerQuest', 'pointsPerAchievementTier']) {
    issues.push(...checkInteger(config[field], at(field), 0))
  }
  if (typeof config.resetItemId !== 'string' || !Object.hasOwn(data.items, config.resetItemId)) {
    issues.push(`${at('resetItemId')}: vật phẩm không tồn tại "${String(config.resetItemId)}"`)
  }
}

/** Kiểm tra mọi dữ liệu thiên phú ngự thú sư. */
export function checkTamerTalentData(data: GameData, issues: string[]): void {
  checkConfig(data, issues)
  for (const branch of Object.values(data.tamerTalentBranches)) {
    checkKnownFields(
      branch,
      BRANCH_FIELDS,
      `Nhánh thiên phú ngự thú sư "${branch.id}"`,
      'nhánh',
      issues
    )
  }
  for (const node of Object.values(data.tamerTalents)) {
    const where = `Thiên phú ngự thú sư "${node.id}"`
    checkKnownFields(node, NODE_FIELDS, where, 'thiên phú ngự thú sư', issues)
    if (!Object.hasOwn(data.tamerTalentBranches, node.branchId)) {
      issues.push(`${where}: nhánh không tồn tại "${String(node.branchId)}"`)
    }
    issues.push(...checkRankedNode(data.tamerTalents, node, where))
    checkTamerBonusEffects(node.effects, where, issues)
  }
}
