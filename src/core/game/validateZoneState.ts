// Kiểm tra phần hiểm địa trong save (docs/rules/zones.md): GameState.zones và trận hiểm địa
// (BattleState.special kind 'zone'). Gọi từ validateGameState / checkBattleSpecial.

import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'

type Raw = Record<string, unknown>

/** Cổng thế giới đang mở (mục "Cổng thế giới" ở zones.md): mẫu cổng tồn tại, số nguyên hợp lệ, id không trùng. */
function validatePortals(data: GameData, zones: Raw): string[] {
  const issues = checkInteger(zones.nextPortalId, 'zones.nextPortalId', 1)
  if (!Array.isArray(zones.portals)) return [...issues, 'zones.portals phải là danh sách']
  const ids = new Set<unknown>()
  zones.portals.forEach((value, index) => {
    const where = `zones.portals[${index}]`
    const portal = asObject(value)
    if (!portal) {
      issues.push(`${where} phải là object`)
      return
    }
    if (typeof portal.id !== 'string' || ids.has(portal.id)) issues.push(`${where}.id không hợp lệ`)
    ids.add(portal.id)
    if (typeof portal.zoneId !== 'string' || data.zones[portal.zoneId]?.portal !== true) {
      issues.push(`${where}.zoneId: không phải mẫu cổng "${String(portal.zoneId)}"`)
    }
    issues.push(
      ...checkInteger(portal.hostility, `${where}.hostility`, 1),
      ...checkInteger(portal.steps, `${where}.steps`, 1),
      ...checkInteger(portal.stepsTaken, `${where}.stepsTaken`, 0),
      ...checkInteger(portal.hives, `${where}.hives`, 0),
      ...checkInteger(portal.closesDay, `${where}.closesDay`, 0),
      ...checkInteger(portal.stabilizations, `${where}.stabilizations`, 0)
    )
  })
  return issues
}

/**
 * zones: { visit, reopenDay, portals, nextPortalId }; reopenDay theo id hiểm địa tồn tại, ngày nguyên ≥ 0. Lượt vào: hiểm
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
  issues.push(...validatePortals(data, zones))
  if (zones.visit === null) return issues
  const visit = asObject(zones.visit)
  if (!visit) return [...issues, 'zones.visit phải là null hoặc lượt vào hiểm địa']
  if (typeof visit.zoneId !== 'string' || !Object.hasOwn(data.zones, visit.zoneId)) {
    issues.push(`zones.visit.zoneId: hiểm địa không tồn tại "${String(visit.zoneId)}"`)
  }
  issues.push(...checkInteger(visit.floor, 'zones.visit.floor', 1))
  issues.push(...checkInteger(visit.steps, 'zones.visit.steps', 1))
  issues.push(...checkInteger(visit.stepsTaken, 'zones.visit.stepsTaken', 0))
  if (visit.portalId !== undefined) {
    const portals = Array.isArray(zones.portals) ? zones.portals : []
    if (!portals.some((portal) => asObject(portal)?.id === visit.portalId)) {
      issues.push(`zones.visit.portalId: cổng không tồn tại "${String(visit.portalId)}"`)
    }
  }
  if (Number(visit.stepsTaken) >= Number(visit.steps)) {
    issues.push('zones.visit.stepsTaken phải nhỏ hơn steps')
  }
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
