// Kiểm tra Phòng Thí Nghiệm trong save (docs/rules/implant.md): huyết thanh đang bán, ngày đổi hàng.

import { asObject, checkInteger } from '../shared'
import type { GameData } from '../model'
import { validateSerumEffects } from '../registries'
import { checkKnownFields } from '../gameData'

/** Một huyết thanh: bậc tồn tại, hiệu ứng đúng theo loại của bậc (SERUM_EFFECTS). */
function checkSerum(data: GameData, value: unknown, path: string, issues: string[]): void {
  const serum = asObject(value)
  if (!serum) {
    issues.push(`${path} phải là object`)
    return
  }
  checkKnownFields(serum, ['tierId', 'effects'], path, 'huyết thanh', issues)
  const tier = data.config.implant.tiers.find((entry) => entry.id === serum.tierId)
  if (!tier) {
    issues.push(`${path}.tierId: bậc huyết thanh không tồn tại "${String(serum.tierId)}"`)
    return
  }
  if (!Array.isArray(serum.effects)) {
    issues.push(`${path}.effects phải là danh sách`)
    return
  }
  issues.push(...validateSerumEffects(data, serum.effects, tier, `${path}.effects`))
}

/** Kiểm tra state.lab. */
export function validateLabState(data: GameData, value: unknown): string[] {
  const lab = asObject(value)
  if (!lab) return ['lab phải là object']
  const issues: string[] = []
  checkKnownFields(lab, ['stock', 'restockDay'], 'lab', 'Phòng Thí Nghiệm', issues)
  if (!Array.isArray(lab.stock)) issues.push('lab.stock phải là danh sách')
  else lab.stock.forEach((serum, i) => checkSerum(data, serum, `lab.stock[${i}]`, issues))
  issues.push(...checkInteger(lab.restockDay, 'lab.restockDay', 0))
  return issues
}
