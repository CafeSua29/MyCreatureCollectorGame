// Kiểm tra phần hiểm địa trong save (docs/rules/zones.md): GameState.zones và trận hiểm địa
// (BattleState.special kind 'zone'). Gọi từ validateGameState / checkBattleSpecial.

import { ZONE_STEP_KINDS, type GameData } from '../model'
import { asObject, checkInteger } from '../shared'

type Raw = Record<string, unknown>

/** Kết quả bước gần nhất: null hoặc { kind } (rương kèm items, linh tuyền kèm healPercent). */
function checkLastStep(value: unknown, issues: string[]): void {
  if (value === null) return
  const step = asObject(value)
  const kinds: readonly unknown[] = [...ZONE_STEP_KINDS, 'guardian']
  if (!step || !kinds.includes(step.kind)) {
    issues.push('zones.visit.lastStep phải là null hoặc { kind } hợp lệ')
    return
  }
  if ((step.kind === 'treasure' || step.kind === 'rareTreasure') && !Array.isArray(step.items)) {
    issues.push('zones.visit.lastStep.items phải là danh sách')
  }
}

/**
 * zones: { visit, reopenDay }; reopenDay theo id hiểm địa tồn tại, ngày nguyên ≥ 0. Lượt vào: hiểm
 * địa tồn tại, tầng ≥ 1, 0 ≤ stepsTaken < steps (bước cuối là boss canh giữ, thắng thì hết lượt);
 * đang trong hiểm địa thì ở thị trấn, không đồng thời bí cảnh / khu bảo tồn.
 */
export function validateZoneState(data: GameData, state: Raw): string[] {
  const issues: string[] = []
  const zones = asObject(state.zones)
  if (!zones) return ['zones phải là object { visit, reopenDay }']
  const reopen = asObject(zones.reopenDay)
  if (!reopen) issues.push('zones.reopenDay phải là object')
  else {
    for (const [zoneId, day] of Object.entries(reopen)) {
      if (!Object.hasOwn(data.zones, zoneId))
        issues.push(`zones.reopenDay: hiểm địa lạ "${zoneId}"`)
      issues.push(...checkInteger(day, `zones.reopenDay.${zoneId}`, 0))
    }
  }
  if (zones.visit === null) return issues
  const visit = asObject(zones.visit)
  if (!visit) return [...issues, 'zones.visit phải là null hoặc lượt vào hiểm địa']
  if (typeof visit.zoneId !== 'string' || !Object.hasOwn(data.zones, visit.zoneId)) {
    issues.push(`zones.visit.zoneId: hiểm địa không tồn tại "${String(visit.zoneId)}"`)
  }
  issues.push(...checkInteger(visit.floor, 'zones.visit.floor', 1))
  issues.push(...checkInteger(visit.steps, 'zones.visit.steps', 1))
  issues.push(...checkInteger(visit.stepsTaken, 'zones.visit.stepsTaken', 0))
  if (Number(visit.stepsTaken) >= Number(visit.steps)) {
    issues.push('zones.visit.stepsTaken phải nhỏ hơn steps')
  }
  checkLastStep(visit.lastStep, issues)
  if (asObject(state.location)?.type !== 'town') issues.push('zones.visit: phải ở thị trấn')
  if (state.trial !== null) issues.push('zones.visit: không đồng thời đi bí cảnh')
  if (asObject(state.safari)?.visit !== null)
    issues.push('zones.visit: không đồng thời ở khu bảo tồn')
  return issues
}

/**
 * battle.special kind 'zone': hiểm địa tồn tại, guardian boolean; trận chưa kết thúc thì đang có lượt
 * vào đúng hiểm địa đó (boss canh giữ chỉ ở bước cuối).
 */
export function checkZoneBattle(data: GameData, battle: Raw, state: Raw, issues: string[]): void {
  const special = asObject(battle.special) ?? {}
  if (typeof special.zoneId !== 'string' || !Object.hasOwn(data.zones, special.zoneId)) {
    issues.push(`battle.special.zoneId: hiểm địa không tồn tại "${String(special.zoneId)}"`)
  }
  if (typeof special.guardian !== 'boolean') issues.push('battle.special.guardian phải là boolean')
  if (battle.phase === 'ended') return
  const visit = asObject(asObject(state.zones)?.visit)
  if (!visit || visit.zoneId !== special.zoneId) {
    issues.push('battle.special: trận hiểm địa nhưng không có lượt vào hiểm địa đó')
    return
  }
  const isLast = Number(visit.stepsTaken) + 1 >= Number(visit.steps)
  if (special.guardian === true && !isLast) {
    issues.push('battle.special: boss canh giữ chỉ ở bước cuối của lượt vào')
  }
}
