// Kiểm tra dữ liệu bảng nhiệm vụ (docs/rules/quests.md): quests.json, config.quests.

import { QUEST_TYPES } from '../quests'
import { itemStorage } from '../inventory'
import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const TEMPLATE_FIELDS = ['id', 'type', 'params', 'countMin', 'countMax', 'weight', 'reward']

function checkReward(data: GameData, value: unknown, where: string, issues: string[]): void {
  const reward = asObject(value)
  if (!reward) {
    issues.push(`${where}: reward phải là object`)
    return
  }
  checkKnownFields(reward, ['moneyPerFloor', 'items'], `${where}: reward`, 'thưởng', issues)
  issues.push(...checkNumber(reward.moneyPerFloor, `${where}: reward.moneyPerFloor`, 0))
  if (!Array.isArray(reward.items)) {
    issues.push(`${where}: reward.items phải là danh sách`)
    return
  }
  reward.items.forEach((entry: unknown, i: number) => {
    const item = asObject(entry)
    const itemId = item?.itemId
    const def = typeof itemId === 'string' ? data.items[itemId] : undefined
    if (!def || itemStorage(def.category) !== 'stack') {
      issues.push(`${where}: reward.items[${i}].itemId phải là vật phẩm gộp chồng`)
    }
    issues.push(...checkInteger(item?.count, `${where}: reward.items[${i}].count`, 1))
  })
}

/** Kiểm tra mẫu nhiệm vụ và config.quests. */
export function checkQuestData(data: GameData, issues: string[]): void {
  for (const template of Object.values(data.quests)) {
    const where = `Nhiệm vụ "${template.id}"`
    checkKnownFields(template, TEMPLATE_FIELDS, where, 'nhiệm vụ', issues)
    const handler = Object.hasOwn(QUEST_TYPES, template.type) ? QUEST_TYPES[template.type] : null
    if (!handler) issues.push(`${where}: loại "${String(template.type)}" chưa có trong registry`)
    else {
      for (const problem of handler.validateParams(template.params, data)) {
        issues.push(`${where}: ${problem}`)
      }
    }
    issues.push(...checkInteger(template.countMin, `${where}: countMin`, 1))
    issues.push(...checkInteger(template.countMax, `${where}: countMax`, 1))
    if (template.countMax < template.countMin) issues.push(`${where}: countMax phải ≥ countMin`)
    issues.push(...checkNumber(template.weight, `${where}: weight`, Number.MIN_VALUE))
    checkReward(data, template.reward, where, issues)
  }
  const config = asObject(data.config.quests)
  if (!config) {
    issues.push('config.quests phải là object')
    return
  }
  checkKnownFields(config, ['boardSize', 'maxActive'], 'config.quests', 'config', issues)
  issues.push(...checkInteger(config.boardSize, 'config.quests.boardSize', 1))
  issues.push(...checkInteger(config.maxActive, 'config.quests.maxActive', 1))
}
