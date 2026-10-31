// Kiểm tra dữ liệu tính cách (docs/rules/natures.md): natures.json, config.nature.

import { NON_HP_STATS, type GameData } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkDrops, checkKnownFields } from './checks'

function checkNatureConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.nature)
  if (!config) {
    issues.push('config.nature phải là object')
    return
  }
  checkKnownFields(config, ['percent', 'bossDrops'], 'config.nature', 'config', issues)
  issues.push(...checkNumber(config.percent, 'config.nature.percent', 0))
  if (!Array.isArray(config.bossDrops)) issues.push('config.nature.bossDrops phải là danh sách')
  else checkDrops(data, config.bossDrops, 'config.nature.bossDrops', issues)
}

/** Ít nhất một tính cách (sinh quái tung trong danh sách); up / down đủ cả hai, không phải hp. */
function checkNatureList(data: GameData, issues: string[]): void {
  const natures = Object.values(data.natures)
  if (natures.length === 0) issues.push('natures: cần ít nhất một tính cách')
  for (const nature of natures) {
    const where = `Tính cách "${nature.id}"`
    checkKnownFields(nature, ['id', 'up', 'down'], where, 'tính cách', issues)
    if ((nature.up === undefined) !== (nature.down === undefined)) {
      issues.push(`${where}: up và down phải cùng có hoặc cùng bỏ trống`)
    }
    for (const key of ['up', 'down'] as const) {
      const stat = nature[key]
      if (stat !== undefined && !(NON_HP_STATS as readonly string[]).includes(stat)) {
        issues.push(`${where}: ${key} phải là chỉ số khác hp, nhận "${String(stat)}"`)
      }
    }
  }
}

/** Kiểm tra mọi dữ liệu tính cách. */
export function checkNatureData(data: GameData, issues: string[]): void {
  checkNatureConfig(data, issues)
  checkNatureList(data, issues)
}
