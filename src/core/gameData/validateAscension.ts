// Kiểm tra dữ liệu phi thăng và thiên mệnh (docs/rules/ascension.md): config.ascension,
// ascensionUpgrades.json, destinies.json.

import { DESTINY_RARITIES, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'
import { checkRankedNode } from './validateTalents'
import { checkTamerBonusEffects } from './validateTamerTalents'

const CONFIG_FIELDS = [
  'minFloor',
  'essenceBase',
  'startFloorMaxPercent',
  'keepMoneyMaxPercent',
  'destiny'
]
const DESTINY_CONFIG_FIELDS = ['baseSlots', 'choiceCount', 'rarityWeights']
const UPGRADE_FIELDS = ['id', 'requires', 'maxRank', 'costPerRank', 'effects']
const DESTINY_FIELDS = ['id', 'rarity', 'effects']

function checkDestinyConfig(value: unknown, issues: string[]): void {
  const at = 'config.ascension.destiny'
  const config = asObject(value)
  if (!config) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(config, DESTINY_CONFIG_FIELDS, at, 'config', issues)
  issues.push(...checkInteger(config.baseSlots, `${at}.baseSlots`, 1))
  issues.push(...checkInteger(config.choiceCount, `${at}.choiceCount`, 1))
  const weights = asObject(config.rarityWeights)
  if (!weights) {
    issues.push(`${at}.rarityWeights phải là object`)
    return
  }
  checkKnownFields(weights, DESTINY_RARITIES, `${at}.rarityWeights`, 'độ hiếm', issues)
  // Mọi độ hiếm đều phải có cơ hội (luật "Mọi kết quả hợp lệ đều có cơ hội").
  for (const rarity of DESTINY_RARITIES) {
    issues.push(...checkNumber(weights[rarity], `${at}.rarityWeights.${rarity}`, 0))
    if (weights[rarity] === 0) issues.push(`${at}.rarityWeights.${rarity} phải > 0`)
  }
}

function checkConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.ascension)
  if (!config) {
    issues.push('config.ascension phải là object')
    return
  }
  checkKnownFields(config, CONFIG_FIELDS, 'config.ascension', 'config', issues)
  issues.push(...checkInteger(config.minFloor, 'config.ascension.minFloor', 1))
  issues.push(...checkNumber(config.essenceBase, 'config.ascension.essenceBase', 0))
  for (const field of ['startFloorMaxPercent', 'keepMoneyMaxPercent']) {
    issues.push(...checkNumber(config[field], `config.ascension.${field}`, 0, 100))
  }
  checkDestinyConfig(config.destiny, issues)
}

/** Kiểm tra mọi dữ liệu phi thăng và thiên mệnh. */
export function checkAscensionData(data: GameData, issues: string[]): void {
  checkConfig(data, issues)
  for (const upgrade of Object.values(data.ascensionUpgrades)) {
    const where = `Nâng cấp Tiên giới "${upgrade.id}"`
    checkKnownFields(upgrade, UPGRADE_FIELDS, where, 'nâng cấp', issues)
    issues.push(...checkRankedNode(data.ascensionUpgrades, upgrade, where))
    checkTamerBonusEffects(upgrade.effects, where, issues)
  }
  for (const destiny of Object.values(data.destinies)) {
    const where = `Thiên mệnh "${destiny.id}"`
    checkKnownFields(destiny, DESTINY_FIELDS, where, 'thiên mệnh', issues)
    if (!DESTINY_RARITIES.includes(destiny.rarity)) {
      issues.push(`${where}: độ hiếm lạ "${String(destiny.rarity)}"`)
    }
    checkTamerBonusEffects(destiny.effects, where, issues)
  }
}
