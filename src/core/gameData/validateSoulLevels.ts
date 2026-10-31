// Kiểm tra dữ liệu hồn tinh (docs/rules/soul-levels.md): config.soulLevels và các loại hồn tinh.

import type { GameData } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkDrops, checkKnownFields } from './checks'

const FIELDS = ['percentPerLevel', 'costBase', 'fuseRefundPercent', 'wildDrops', 'bossDrops']

/** Kiểm tra config.soulLevels; có hồn tinh thì phải có loại 1 điểm (để trả dư / hoàn lại chính xác). */
export function checkSoulLevelData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.soulLevels)
  if (!config) {
    issues.push('config.soulLevels phải là object')
    return
  }
  const at = (field: string): string => `config.soulLevels.${field}`
  checkKnownFields(config, FIELDS, 'config.soulLevels', 'config', issues)
  issues.push(...checkNumber(config.percentPerLevel, at('percentPerLevel'), 0))
  issues.push(...checkNumber(config.costBase, at('costBase'), 0))
  issues.push(...checkNumber(config.fuseRefundPercent, at('fuseRefundPercent'), 0, 100))
  for (const key of ['wildDrops', 'bossDrops'] as const) {
    if (!Array.isArray(config[key])) issues.push(`${at(key)} phải là danh sách`)
    else checkDrops(data, config[key], at(key), issues)
  }
  const crystals = Object.values(data.items).filter((item) => item.category === 'soulCrystal')
  if (crystals.length > 0 && !crystals.some((item) => item.points === 1)) {
    issues.push('Hồn tinh: cần ít nhất một loại 1 điểm (points: 1)')
  }
}
