// Kiểm tra phần câu cá / khai thác trong save (docs/rules/gathering.md): GameState.gathering và trận
// thu thập (BattleState.special kind 'gathering'). Gọi từ validateGameState / checkBattleSpecial.

import { GATHERING_METHODS, type GameData } from '../model'
import { asObject, checkInteger } from '../shared'

type Raw = Record<string, unknown>

const ENCOUNTERS: readonly unknown[] = ['none', 'bite', 'ambush']

const isMethod = (value: unknown): boolean => GATHERING_METHODS.some((method) => method === value)

/** Kết quả gần nhất: null hoặc { method, tier ≥ 1, lureItemId (mồi câu / null), items, encounter }. */
function checkLastResult(data: GameData, value: unknown, issues: string[]): void {
  if (value === null) return
  const at = 'gathering.lastResult'
  const result = asObject(value)
  if (!result) {
    issues.push(`${at} phải là null hoặc kết quả thu thập`)
    return
  }
  if (!isMethod(result.method)) issues.push(`${at}.method phải là ${GATHERING_METHODS.join(', ')}`)
  issues.push(...checkInteger(result.tier, `${at}.tier`, 1))
  const lure = result.lureItemId
  if (lure !== null && (typeof lure !== 'string' || data.items[lure]?.category !== 'fishingLure')) {
    issues.push(`${at}.lureItemId phải là null hoặc id mồi câu`)
  }
  if (!Array.isArray(result.items)) issues.push(`${at}.items phải là danh sách`)
  else {
    result.items.forEach((raw: unknown, i) => {
      const item = asObject(raw)
      if (typeof item?.itemId !== 'string' || !Object.hasOwn(data.items, item.itemId)) {
        issues.push(`${at}.items[${i}].itemId: vật phẩm không tồn tại`)
      }
      issues.push(...checkInteger(item?.count, `${at}.items[${i}].count`, 1))
    })
  }
  if (!ENCOUNTERS.includes(result.encounter)) {
    issues.push(`${at}.encounter phải là ${ENCOUNTERS.join(', ')}`)
  }
}

/** gathering: { lastResult }. */
export function validateGatheringState(data: GameData, state: Raw): string[] {
  const issues: string[] = []
  const gathering = asObject(state.gathering)
  if (!gathering) return ['gathering phải là object { lastResult }']
  checkLastResult(data, gathering.lastResult, issues)
  return issues
}

/** battle.special kind 'gathering': cách thu thập hợp lệ, ambush boolean. */
export function checkGatheringBattle(battle: Raw, issues: string[]): void {
  const special = asObject(battle.special) ?? {}
  if (!isMethod(special.method)) {
    issues.push(`battle.special.method phải là ${GATHERING_METHODS.join(', ')}`)
  }
  if (typeof special.ambush !== 'boolean') issues.push('battle.special.ambush phải là boolean')
}
