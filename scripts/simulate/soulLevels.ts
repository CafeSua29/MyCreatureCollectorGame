// "Người chơi" nâng hồn tinh (mục "Hồn tinh" ở simulation-features.md, docs/rules/soul-levels.md):
// mỗi lần về thị trấn dùng hết điểm hồn tinh lên quái đội mẫu, mỗi lần nâng chỉ số có cấp thấp nhất
// trong các chỉ số hữu ích (bỏ chỉ số công yếu hơn của quái), hòa thì theo thứ tự đội; hết điểm
// hoặc tiền thì dừng.

import {
  ActionError,
  STAT_NAMES,
  computeStats,
  type GameData,
  type GameState,
  type Monster,
  type StatName
} from '@core'
import { simAct } from './events'

/** Chỉ số đáng nâng: bỏ công vật lý / đặc biệt yếu hơn (quái chỉ dùng một loại là chính). */
function usefulStats(data: GameData, monster: Monster): StatName[] {
  const { attack, spAttack } = computeStats(data, monster).final
  const weaker: StatName = attack.gte(spAttack) ? 'spAttack' : 'attack'
  return STAT_NAMES.filter((stat) => stat !== weaker)
}

/** Lần nâng kế tiếp: (quái, chỉ số) có cấp thấp nhất. */
function nextUpgrade(
  data: GameData,
  team: readonly Monster[]
): { monsterId: string; stat: StatName } | null {
  let best: { monsterId: string; stat: StatName; level: number } | null = null
  for (const monster of team) {
    for (const stat of usefulStats(data, monster)) {
      const level = monster.soulLevels[stat]
      if (best === null || level < best.level) best = { monsterId: monster.id, stat, level }
    }
  }
  return best
}

/** Nâng hồn tinh tới khi hết điểm / tiền; trả state mới và số lần đã nâng. */
export function upgradeSoulLevels(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; upgrades: number } {
  let upgrades = 0
  for (;;) {
    const target = nextUpgrade(
      data,
      state.party.filter((m) => teamIds.has(m.id))
    )
    if (!target) break
    try {
      state = simAct(data, state, { type: 'upgradeSoulLevel', ...target })
      upgrades++
    } catch (error) {
      if (
        error instanceof ActionError &&
        (error.code === 'notEnoughSoulCrystals' || error.code === 'notEnoughMoney')
      ) {
        break
      }
      throw error
    }
  }
  return { state, upgrades }
}
