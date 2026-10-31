// "Người chơi" dùng Kẹo EXP / Kẹo Hiếm (mục "Kẹo EXP" ở simulation.md): sau mỗi trận dùng hết mọi kẹo
// trong túi lên quái đội mẫu level thấp nhất, để đo kẹo có làm lệch nhịp lên level không.

import { type GameData, type GameState, type Monster } from '@core'
import { simAct } from './events'

/** Hiệu ứng của kẹo (cho EXP / level); vật phẩm có hiệu ứng này là kẹo. */
const CANDY_EFFECT_TYPES: readonly string[] = ['addExp', 'levelUp']

/** Vật phẩm là kẹo: tiêu hao dùng ngoài trận có hiệu ứng kẹo. */
export function isCandy(data: GameData, itemId: string): boolean {
  const item = data.items[itemId]
  return (
    item?.category === 'consumable' &&
    item.use !== 'battle' &&
    item.effects.some((effect) => CANDY_EFFECT_TYPES.includes(effect.type))
  )
}

/** Dùng hết kẹo trong túi lên quái đội mẫu level thấp nhất trong đội; trả state mới và số kẹo đã dùng. */
export function feedCandies(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; used: number } {
  let used = 0
  for (const [itemId, count] of Object.entries(state.inventory.stacks)) {
    if (!isCandy(data, itemId)) continue
    const lowest = state.party
      .filter((m) => teamIds.has(m.id))
      .reduce<Monster | null>((low, m) => (low === null || m.level < low.level ? m : low), null)
    if (!lowest) break
    state = simAct(data, state, { type: 'useItem', itemId, monsterId: lowest.id, count })
    used += count
  }
  return { state, used }
}
