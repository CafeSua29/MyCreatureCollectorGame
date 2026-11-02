// Cây thần trong chơi liên tục (mục "Cây thần" ở simulation-features.md, docs/rules/gacha.md): mỗi ngày
// ở thị trấn "người chơi" quay ×10 khi tiền dư gấp SPARE_MONEY_RATIO lần giá và kho còn đủ chỗ cho
// trứng đang ấp lẫn trứng mới (không để gacha chặn bắt quái vì đầy kho).

import { capacityOf, gachaCost, type GameData, type GameState } from '@core'
import { simAct } from './events'

const PULL_COUNT = 10
const SPARE_MONEY_RATIO = 3

/** Quay nếu dư tiền và còn chỗ; trả state mới và số trứng nhận. */
export function runGacha(data: GameData, state: GameState): { state: GameState; eggs: number } {
  if (state.battle || state.location.type !== 'town') return { state, eggs: 0 }
  const cost = gachaCost(data, state.highestFloor, PULL_COUNT)
  if (state.money.lt(cost.times(SPARE_MONEY_RATIO))) return { state, eggs: 0 }
  const incoming = state.storage.length + state.eggs.length + PULL_COUNT
  if (incoming > capacityOf(data, state, 'storage')) return { state, eggs: 0 }
  return {
    state: simAct(data, state, { type: 'pullGacha', count: PULL_COUNT }),
    eggs: PULL_COUNT
  }
}
