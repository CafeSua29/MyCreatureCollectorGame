// "Người chơi" hiến tế ở NPC fusing (mục "Hiến tế" ở simulation-features.md, docs/rules/sacrifice.md):
// quái bắt về trong kho, trừ keepFuseFodder nguyên liệu fuse tốt nhất (fuse mạnh hơn nhiều), hiến tế
// hàng loạt vào quái đội mẫu cùng race, cùng lineage thay vì để kho đầy / thả; quái đội mẫu ít stack
// hơn nhận trước. Chỉ làm khi giá ≤ spendFraction tiền; nguyên liệu hết dùng còn lại thả như cũ
// (releaseStaleFodder).

import { canSacrificeTo, sacrificeCost, type GameData, type GameState, type Monster } from '@core'
import { simAct } from './events'
import { spareFodder } from './growth'

export const SACRIFICE_POLICY = {
  /** Chỉ hiến tế khi tổng giá ≤ phần này của tiền. */
  spendFraction: 0.2,
  /** Giữ lại số nguyên liệu fuse tốt nhất này (chờ fuse), không đem hiến tế. */
  keepFuseFodder: 2
} as const

/** Quái đội mẫu (đội / kho, rảnh), ít stack hiến tế trước. */
function teamByStacks(state: GameState, teamIds: ReadonlySet<string>): Monster[] {
  return [...state.party, ...state.storage]
    .filter((m) => teamIds.has(m.id) && m.assignment === null)
    .sort((a, b) => a.sacrificeStacks - b.sacrificeStacks)
}

/** Quái bắt về đem hiến tế được: mọi quái hết dùng + nguyên liệu fuse ngoài số giữ lại. */
function offerable(data: GameData, state: GameState, teamIds: ReadonlySet<string>): Monster[] {
  const { fuse, stale } = spareFodder(data, state, teamIds)
  return [...stale, ...fuse.slice(SACRIFICE_POLICY.keepFuseFodder)]
}

/** Ở thị trấn: hiến tế quái bắt về dư vào quái đội mẫu nhận được. Trả state và số quái phụ. */
export function sacrificeSpareFodder(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; sacrificed: number } {
  let sacrificed = 0
  if (state.location.type !== 'town' || state.battle) return { state, sacrificed }
  for (const base of teamByStacks(state, teamIds)) {
    const subs = offerable(data, state, teamIds).filter((m) => canSacrificeTo(base, m))
    if (subs.length === 0) continue
    const cost = sacrificeCost(data, base, subs)
    if (cost.gt(state.money.times(SACRIFICE_POLICY.spendFraction))) continue
    state = simAct(data, state, {
      type: 'sacrifice',
      baseId: base.id,
      subIds: subs.map((m) => m.id)
    })
    sacrificed += subs.length
  }
  return { state, sacrificed }
}
