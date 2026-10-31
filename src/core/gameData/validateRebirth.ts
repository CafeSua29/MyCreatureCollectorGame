// Kiểm tra dữ liệu luân hồi quái (docs/rules/rebirth.md): config.rebirth.

import type { GameData, RebirthConfig } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkDrops, checkKnownFields, fieldList } from './checks'

const FIELDS = fieldList<RebirthConfig>({
  minLevelBase: true,
  costBase: true,
  pillItemId: true,
  pillsPerRebirth: true,
  statPercentPerRebirth: true,
  genePercent: true,
  floorBossDrops: true
})

/** Kiểm tra config.rebirth: số không âm, Luân Hồi Đan là vật phẩm category "material". */
export function checkRebirthData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.rebirth)
  if (!config) {
    issues.push('config.rebirth phải là object')
    return
  }
  const at = (field: string): string => `config.rebirth.${field}`
  checkKnownFields(config, FIELDS, 'config.rebirth', 'config', issues)
  issues.push(...checkInteger(config.minLevelBase, at('minLevelBase'), 1))
  issues.push(...checkNumber(config.costBase, at('costBase'), 0))
  issues.push(...checkInteger(config.pillsPerRebirth, at('pillsPerRebirth'), 0))
  issues.push(...checkNumber(config.statPercentPerRebirth, at('statPercentPerRebirth'), 0))
  issues.push(...checkNumber(config.genePercent, at('genePercent'), 0))
  const { pillItemId } = config
  if (typeof pillItemId !== 'string' || data.items[pillItemId]?.category !== 'material') {
    issues.push(
      `${at('pillItemId')} phải là vật phẩm category "material", nhận "${String(pillItemId)}"`
    )
  }
  if (!Array.isArray(config.floorBossDrops))
    issues.push(`${at('floorBossDrops')} phải là danh sách`)
  else checkDrops(data, config.floorBossDrops, at('floorBossDrops'), issues)
}
