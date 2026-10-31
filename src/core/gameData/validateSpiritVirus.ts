// Kiểm tra config linh dịch (docs/rules/spirit-virus.md).

import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const AT = 'config.spiritVirus'

const FIELDS = [
  'infectPercent',
  'spreadPercent',
  'minDays',
  'maxDays',
  'infectedExpPercent',
  'immuneExpPercent',
  'effortMultiplier',
  'genesPerWin'
]

/** Kiểm tra config.spiritVirus: tỉ lệ % trong [0, 100], số ngày nguyên ≥ 1 và min ≤ max. */
export function checkSpiritVirusConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.spiritVirus)
  if (!config) {
    issues.push(`${AT} phải là object`)
    return
  }
  checkKnownFields(config, FIELDS, AT, 'config', issues)
  for (const field of ['infectPercent', 'spreadPercent']) {
    issues.push(...checkNumber(config[field], `${AT}.${field}`, 0, 100))
  }
  issues.push(...checkInteger(config.minDays, `${AT}.minDays`, 1))
  issues.push(...checkInteger(config.maxDays, `${AT}.maxDays`, 1))
  const { minDays, maxDays } = config
  if (typeof minDays === 'number' && typeof maxDays === 'number' && minDays > maxDays) {
    issues.push(`${AT}.minDays (${minDays}) không được lớn hơn maxDays (${maxDays})`)
  }
  issues.push(...checkNumber(config.infectedExpPercent, `${AT}.infectedExpPercent`, -100))
  issues.push(...checkNumber(config.immuneExpPercent, `${AT}.immuneExpPercent`, -100))
  issues.push(...checkNumber(config.effortMultiplier, `${AT}.effortMultiplier`, 0))
  issues.push(...checkNumber(config.genesPerWin, `${AT}.genesPerWin`, 0))
}
