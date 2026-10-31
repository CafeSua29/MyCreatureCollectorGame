// Hệ thống event trong chơi liên tục (mục "Event" ở simulation-features.md, docs/rules/events.md):
// mọi action của mô phỏng đi qua simAct, trước action đó "người chơi" giải quyết event đang chờ
// (chọn lựa chọn đầu tiên trả được, đánh trận event tới hết) và thủ thành khi thú triều đang diễn ra
// (thua thì thôi, không thắng được đợt nào thì rút lui). Số liệu đếm vào bảng đếm của lần chơi đang
// chạy (beginEventTally / takeEventTally; mỗi worker chạy tuần tự từng lần chơi).

import {
  BIG_ZERO,
  gameReducer,
  getItemCount,
  getMaxHp,
  isFainted,
  maxBig,
  isShopOpen,
  suggestBattleCommands,
  suggestReplacements,
  suggestTamerCommand,
  type Decimal,
  type GameAction,
  type GameData,
  type GameState,
  type ShopEntry
} from '@core'
import { formatDecimal, formatPercent, type Table } from './report'
import { healWithItems } from './growth'
import { buyFromTempShop, newEconomyCount } from './economy'

/** Số liệu event của một khoảng chơi. */
export interface EventTally {
  /** Event đã gặp (đã chọn lựa chọn), theo id. */
  met: Record<string, number>
  /** Trận event / số thắng. */
  battles: number
  battleWins: number
  /** Tiền nhận / mất từ kết quả event (không tính tiền thắng trận event). */
  moneyGained: Decimal
  moneyLost: Decimal
  /** Thú triều: đã bắt đầu, thắng hết, thất bại (thua đợt hoặc rút lui), số đợt thắng. */
  tides: number
  tidesCleared: number
  tidesFailed: number
  tideWaves: number
  /** Tổng số đợt đã thắng trước khi hạ thú vương (chia tidesCleared = trung bình). */
  kingWavesCleared: number
  /** Số lần thua trận thú vương (trong tidesFailed). */
  kingLosses: number
  /** Số món mua ở cửa hàng tạm của event (economy.ts). */
  tempShopBought: number
  /** Trận event / đợt thú triều chạm trần lượt (bỏ như chưa đánh), theo id event hoặc "beastTide". */
  timeouts: Record<string, number>
}

export const newEventTally = (): EventTally => ({
  met: {},
  battles: 0,
  battleWins: 0,
  moneyGained: BIG_ZERO,
  moneyLost: BIG_ZERO,
  tides: 0,
  tidesCleared: 0,
  tidesFailed: 0,
  tideWaves: 0,
  kingWavesCleared: 0,
  kingLosses: 0,
  tempShopBought: 0,
  timeouts: {}
})

let tally = newEventTally()

/** Bắt đầu đếm cho một lần chơi mới. */
export function beginEventTally(): void {
  tally = newEventTally()
}

/** Lấy số liệu từ lần lấy trước tới giờ rồi đếm lại từ 0. */
export function takeEventTally(): EventTally {
  const taken = tally
  tally = newEventTally()
  return taken
}

/** Máu cả đội tối thiểu để "người chơi" thách đấu thú vương sớm (giả định của mô phỏng). */
const KING_HP_FRACTION = 0.6

/** Trần lượt của trận event / đợt thú triều (trận không chạy được nên phải đánh tới hết). */
const EVENT_BATTLE_TURNS = 400

/** Hàng của cửa hàng thị trấn mua được lúc này (đóng cửa sau thú triều thất bại thì rỗng). */
export const shopStock = (state: GameState): readonly ShopEntry[] =>
  isShopOpen(state) ? state.shop.stock : []

/**
 * Đánh trận đang mở tới hết rồi rời trận. Quá trần lượt (hai bên không hạ được nhau) thì trả null:
 * nơi gọi bỏ trận như chưa đánh (trận không chạy được nên game thật cũng không thoát được; ghi
 * timeouts để xem dữ liệu).
 */
function fightOpenBattle(
  data: GameData,
  state: GameState
): { state: GameState; won: boolean } | null {
  let current = state
  for (let turn = 0; current.battle && current.battle.phase !== 'ended'; turn++) {
    if (turn > EVENT_BATTLE_TURNS) return null
    current =
      current.battle.phase === 'chooseReplacement'
        ? gameReducer(data, current, {
            type: 'replaceFainted',
            replacements: suggestReplacements(data, current)
          })
        : gameReducer(data, current, {
            type: 'submitTurn',
            commands: suggestBattleCommands(data, current),
            tamer: suggestTamerCommand(data, current) ?? undefined
          })
  }
  const won = current.battle?.outcome === 'won'
  return { state: gameReducer(data, current, { type: 'leaveBattle' }), won }
}

/** Đếm tiền nhận / mất của log kết quả event. */
function tallyLog(state: GameState): void {
  for (const entry of state.events.log) {
    if (entry.type === 'moneyGained') tally.moneyGained = tally.moneyGained.plus(entry.amount)
    if (entry.type === 'moneyLost') tally.moneyLost = tally.moneyLost.plus(entry.amount)
  }
}

const countTimeout = (key: string): void => {
  tally.timeouts[key] = (tally.timeouts[key] ?? 0) + 1
}

/**
 * "Người chơi" chọn lựa chọn đầu tiên trả được vật phẩm (dữ liệu xếp lựa chọn chủ động trước). Trận
 * của lựa chọn chạm trần lượt thì bỏ như chưa chọn (giữ RNG đã dùng) và thử lựa chọn kế tiếp; hết
 * lựa chọn thì giữ kết quả trận đó (state trước khi rời trận không dùng được).
 */
function chooseOption(data: GameData, state: GameState): GameState {
  const pending = state.events.pending
  if (!pending) return state
  const event = data.events[pending.eventId]
  const payable = event.options.filter((entry) =>
    (entry.costItems ?? []).every(
      ({ itemId, count }) => getItemCount(state.inventory, itemId) >= count
    )
  )
  tally.met[event.id] = (tally.met[event.id] ?? 0) + 1
  let rng = state.rng
  for (const option of payable.length > 0 ? payable : [event.options[0]]) {
    const chosen = gameReducer(
      data,
      { ...state, rng },
      { type: 'chooseEventOption', optionId: option.id }
    )
    if (!chosen.battle) {
      tallyLog(chosen)
      // Cửa hàng tạm vừa mở (thương nhân, chợ đen): mua món dùng được ngay (economy.ts).
      const shopping = newEconomyCount()
      const bought = buyFromTempShop(data, chosen, shopping)
      tally.tempShopBought += shopping.tempShopBought
      return bought
    }
    const fought = fightOpenBattle(data, chosen)
    if (!fought) {
      countTimeout(event.id)
      rng = chosen.rng
      continue
    }
    tally.battles++
    if (fought.won) tally.battleWins++
    tallyLog(fought.state)
    return fought.state
  }
  throw new Error(`Mô phỏng: mọi lựa chọn của event "${event.id}" đều chạm trần lượt`)
}

/** Phần máu còn lại của cả đội (tổng máu còn / tổng max HP). */
function partyHpFraction(data: GameData, state: GameState): number {
  let left = BIG_ZERO
  let total = BIG_ZERO
  for (const monster of state.party) {
    const maxHp = getMaxHp(data, monster)
    total = total.plus(maxHp)
    left = left.plus(maxBig(BIG_ZERO, maxHp.minus(monster.damageTaken)))
  }
  return total.gt(0) ? left.div(total).toNumber() : 0
}

/**
 * Thủ thành tới khi thú triều kết thúc: đánh đợt thường để lấy thưởng; đã mở thú vương mà máu cả đội
 * còn ≥ KING_HP_FRACTION thì thách đấu thú vương luôn (máu thấp thì đánh tiếp đợt thường để hồi máu
 * giữa đợt; hết đợt thì thú vương bắt buộc). Không còn quái đánh được thì rút lui.
 */
function fightTide(data: GameData, state: GameState): GameState {
  tally.tides++
  let current = state
  while (current.events.beastTide?.phase === 'active') {
    const tide = current.events.beastTide
    if (!current.party.some((m) => !isFainted(data, m))) {
      tally.tidesFailed++
      return gameReducer(data, current, { type: 'retreatBeastTide' })
    }
    // Không hồi ở NPC được trong thú triều: hồi bằng vật phẩm (mua thêm nếu cần) trước mỗi đợt.
    current = healWithItems(data, current)
    const goKing =
      tide.cleared >= tide.kingAfter &&
      tide.cleared < tide.waves &&
      partyHpFraction(data, current) >= KING_HP_FRACTION
    const opened = gameReducer(data, current, {
      type: goKing ? 'challengeBeastKing' : 'defendTown'
    })
    const king = opened.battle?.special?.kind === 'beastTide' && opened.battle.special.king
    const fought = fightOpenBattle(data, opened)
    if (!fought) {
      // Đợt không đánh xong được: bỏ trận như chưa đánh rồi rút lui.
      countTimeout('beastTide')
      tally.tidesFailed++
      return gameReducer(data, { ...current, rng: opened.rng }, { type: 'retreatBeastTide' })
    }
    current = fought.state
    if (!fought.won) {
      tally.tidesFailed++
      if (king) tally.kingLosses++
      return current
    }
    if (king) {
      tally.tidesCleared++
      tally.kingWavesCleared += tide.cleared
      return current
    }
    tally.tideWaves++
  }
  return current
}

/** Còn việc cho NPC hồi máu (mất máu, có trạng thái, Tera Orb hết sạc). */
const needsHealing = (state: GameState): boolean =>
  !state.teraOrbCharged || state.party.some((m) => m.damageTaken.gt(0) || m.statuses.length > 0)

/** Thủ thành rồi hồi máu ở NPC (thú triều đã kết thúc nên hồi được) như người chơi thật. */
function defendTide(data: GameData, state: GameState): GameState {
  const after = fightTide(data, state)
  const free = after.events.beastTide?.phase !== 'active' && after.location.type === 'town'
  return free && needsHealing(after) ? gameReducer(data, after, { type: 'healParty' }) : after
}

/** Giải quyết event đang chờ và thú triều đang diễn ra (ngoài trận) cho tới khi không còn. */
export function settleEvents(data: GameData, state: GameState): GameState {
  let current = state
  for (;;) {
    if (current.battle) return current
    if (current.events.pending) current = chooseOption(data, current)
    else if (current.events.beastTide?.phase === 'active') current = defendTide(data, current)
    else return current
  }
}

/** Action của mô phỏng: giải quyết event trước, chạy action, giải quyết event action vừa gây ra. */
export function simAct(data: GameData, state: GameState, action: GameAction): GameState {
  const settled = settleEvents(data, state)
  // Thủ thành xong đã hồi máu ở NPC (ngay lúc này hoặc lúc vào thị trấn): lệnh hồi máu nơi gọi tính
  // từ trước đó không còn việc gì để làm.
  if (action.type === 'healParty' && !needsHealing(settled)) return settled
  const next = gameReducer(data, settled, action)
  // Event mới (event thị trấn, thú triều bắt đầu) giải quyết ngay; event khám phá thay cho trận để
  // runBattle tự xử lý (cần biết trận có mở hay không).
  return action.type === 'startWildBattle' || action.type === 'explore'
    ? next
    : settleEvents(data, next)
}

function mergeCounts(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>
): Record<string, number> {
  const merged = { ...a }
  for (const [id, count] of Object.entries(b)) merged[id] = (merged[id] ?? 0) + count
  return merged
}

/** Cộng hai bảng đếm. */
export function mergeEventTally(a: EventTally, b: EventTally): EventTally {
  return {
    met: mergeCounts(a.met, b.met),
    battles: a.battles + b.battles,
    battleWins: a.battleWins + b.battleWins,
    moneyGained: a.moneyGained.plus(b.moneyGained),
    moneyLost: a.moneyLost.plus(b.moneyLost),
    tides: a.tides + b.tides,
    tidesCleared: a.tidesCleared + b.tidesCleared,
    tidesFailed: a.tidesFailed + b.tidesFailed,
    tideWaves: a.tideWaves + b.tideWaves,
    kingWavesCleared: a.kingWavesCleared + b.kingWavesCleared,
    kingLosses: a.kingLosses + b.kingLosses,
    tempShopBought: a.tempShopBought + b.tempShopBought,
    timeouts: mergeCounts(a.timeouts, b.timeouts)
  }
}

/** Đếm theo id, nhiều trước: "a:3 b:1". */
const formatCounts = (counts: Readonly<Record<string, number>>): string =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => `${id}:${count}`)
    .join(' ')

/** Một dòng bảng event: lần chơi và số liệu event cả lần chơi. */
export interface EventRow {
  teamId: string
  usePills: boolean
  totalBattles: number
  tally: EventTally
}

/**
 * Mỗi lần chơi: số event gặp (tổng, theo id nhiều trước), tỉ lệ thắng trận event, tiền nhận / mất từ
 * kết quả event, thú triều (thắng hết / bắt đầu, thất bại, đợt thắng).
 */
export function eventsTable(rows: readonly EventRow[]): Table {
  return {
    headers: [
      'team',
      'pills',
      'battles',
      'events',
      'byEvent',
      'eventBattleWins',
      'moneyGained',
      'moneyLost',
      'tides',
      'tidesFailed',
      'kingLosses',
      'tideWaves',
      'wavesBeforeKing',
      'tempShopBought',
      'timeouts'
    ],
    rows: rows.map(({ teamId, usePills, totalBattles, tally }) => [
      teamId,
      usePills ? 'yes' : 'no',
      String(totalBattles),
      String(Object.values(tally.met).reduce((sum, count) => sum + count, 0)),
      formatCounts(tally.met),
      `${tally.battleWins}/${tally.battles} (${formatPercent(tally.battleWins, tally.battles)})`,
      formatDecimal(tally.moneyGained),
      formatDecimal(tally.moneyLost),
      `${tally.tidesCleared}/${tally.tides}`,
      String(tally.tidesFailed),
      String(tally.kingLosses),
      String(tally.tideWaves),
      tally.tidesCleared > 0 ? (tally.kingWavesCleared / tally.tidesCleared).toFixed(1) : '-',
      String(tally.tempShopBought),
      formatCounts(tally.timeouts)
    ])
  }
}
