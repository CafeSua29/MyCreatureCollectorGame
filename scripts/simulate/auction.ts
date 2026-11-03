// Đấu giá hành trong chơi liên tục (mục "Đấu giá hành" ở simulation-features.md, docs/rules/auction.md):
// mỗi ngày ở thị trấn "người chơi" đặt giá kín cho lô chưa đặt, giá = khởi điểm × BID_PERCENT %
// (giữa khoảng giá trần NPC nên thắng khoảng một nửa), chỉ khi giá ≤ SPEND_FRACTION tiền đang có.
// Không ký gửi: mô phỏng đã bán đồ thừa ở cửa hàng.

import { toBig, type GameData, type GameState } from '@core'
import { simAct } from './events'

const BID_PERCENT = 170
const SPEND_FRACTION = 0.1

/** Đặt giá cho các lô chưa đặt; trả state mới và số lô đã đặt giá. */
export function runAuction(data: GameData, state: GameState): { state: GameState; bids: number } {
  if (state.battle || state.location.type !== 'town') return { state, bids: 0 }
  let next = state
  let bids = 0
  for (const lot of state.auction.lots) {
    if (lot.bid) continue
    const amount = lot.startPrice.times(BID_PERCENT).div(100).floor()
    if (amount.gt(next.money.times(SPEND_FRACTION))) continue
    next = simAct(data, next, { type: 'placeAuctionBid', lotId: lot.id, amount: toBig(amount) })
    bids++
  }
  return { state: next, bids }
}
