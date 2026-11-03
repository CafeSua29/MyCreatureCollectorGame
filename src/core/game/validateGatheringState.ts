// Kiểm tra trận câu cá / khai thác trong save (docs/rules/gathering.md): BattleState.special kind
// 'gathering'. Gọi từ checkBattleSpecial.

import { GATHERING_METHODS } from '../model'
import { asObject } from '../shared'

type Raw = Record<string, unknown>

const isMethod = (value: unknown): boolean => GATHERING_METHODS.some((method) => method === value)

/** battle.special kind 'gathering': cách thu thập hợp lệ, ambush boolean. */
export function checkGatheringBattle(battle: Raw, issues: string[]): void {
  const special = asObject(battle.special) ?? {}
  if (!isMethod(special.method)) {
    issues.push(`battle.special.method phải là ${GATHERING_METHODS.join(', ')}`)
  }
  if (typeof special.ambush !== 'boolean') issues.push('battle.special.ambush phải là boolean')
}
