// Kiểm tra phần thu phục trong save (docs/rules/recruit.md): mồi dụ đang dùng, quái xin theo của
// trận vừa thắng.

import { asObject, checkInteger } from '../shared'
import type { GameData } from '../model'
import { checkKnownFields } from '../gameData'

function checkBait(data: GameData, value: unknown, issues: string[]): void {
  if (value === null) return
  const bait = asObject(value)
  if (!bait) {
    issues.push('recruit.bait phải là object hoặc null')
    return
  }
  checkKnownFields(bait, ['itemId', 'battlesLeft'], 'recruit.bait', 'mồi dụ', issues)
  if (typeof bait.itemId !== 'string' || data.items[bait.itemId]?.category !== 'bait') {
    issues.push(`recruit.bait.itemId: không phải mồi dụ "${String(bait.itemId)}"`)
  }
  issues.push(...checkInteger(bait.battlesLeft, 'recruit.bait.battlesLeft', 1))
}

/** Quái xin theo: null, hoặc một quái địch của trận đã thắng (phase ended). */
function checkRecruitOffer(battleValue: unknown, issues: string[]): void {
  const battle = asObject(battleValue)
  if (!battle || battle.recruitOfferId === null) return
  const offerId = battle.recruitOfferId
  if (typeof offerId !== 'string') {
    issues.push('battle.recruitOfferId phải là id quái hoặc null')
    return
  }
  if (battle.phase !== 'ended' || battle.outcome !== 'won') {
    issues.push('battle.recruitOfferId: chỉ có sau trận thắng')
  }
  const enemies = Array.isArray(battle.enemies) ? battle.enemies : []
  if (!enemies.some((enemy) => asObject(enemy)?.id === offerId)) {
    issues.push(`battle.recruitOfferId: không có quái địch "${offerId}"`)
  }
}

/** Kiểm tra recruit và battle.recruitOfferId. */
export function validateRecruitState(data: GameData, state: Record<string, unknown>): string[] {
  const issues: string[] = []
  const recruit = asObject(state.recruit)
  if (!recruit) return ['recruit phải là object']
  checkKnownFields(recruit, ['bait'], 'recruit', 'thu phục', issues)
  checkBait(data, recruit.bait, issues)
  checkRecruitOffer(state.battle, issues)
  return issues
}
