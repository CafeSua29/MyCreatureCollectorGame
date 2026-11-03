// Phòng Thí Nghiệm: cấy ghép (docs/rules/implant.md). NPC ở thị trấn bán huyết thanh (đổi hàng mỗi
// restockDays ngày); cấy vào quái để cộng thẳng vào chỉ số gốc (cùng chỗ với gen) hoặc nhận hiệu ứng.
// Thất bại trừ đúng lượng định cộng / thành hiệu ứng ngược; thất bại lần thứ maxFails thì quái chết
// hẳn (để lại hồn phách).

import {
  aptitudeFloor,
  applySerumEffect,
  assertOverflowConfirmed,
  returnEquipmentWithinCapacity,
  rollSerumEffects,
  type ImplantSign
} from '../registries'
import {
  ActionError,
  malformedAction,
  nextInt,
  pickWeighted,
  rollPercent,
  spendMoney,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import { addMilestone, assertNotBusy, assertNotLocked, dieForever, implantChance } from '../monster'
import { woundIfBondDied } from '../tamer'
import { locateOwned } from '../roster'
import {
  type GameLogEntry,
  appendLog,
  dayOf,
  type DayEvent,
  type GameData,
  type GameState,
  type LabState,
  type Monster,
  type Serum,
  type SerumTierConfig
} from '../model'

/** Phòng Thí Nghiệm chưa có hàng: đổi hàng ngay lần qua ngày đầu tiên (game mới tự đổi hàng). */
export const newLabState = (): LabState => ({ stock: [], restockDay: 0 })

/** Bậc huyết thanh theo id; không có thì DataError ở kiểm tra dữ liệu / save, ở đây ném lỗi. */
export function serumTier(data: GameData, tierId: string): SerumTierConfig {
  const tier = data.config.implant.tiers.find((entry) => entry.id === tierId)
  if (!tier) throw new RangeError(`Bậc huyết thanh không tồn tại "${tierId}"`)
  return tier
}

/** Một huyết thanh: bậc theo trọng số, hiệu ứng theo loại của bậc (SERUM_EFFECTS). */
export function rollSerum(data: GameData, rng: RngState, highestFloor: number): [Serum, RngState] {
  let tier: SerumTierConfig
  ;[tier, rng] = pickWeighted(rng, data.config.implant.tiers, (entry) => entry.weight)
  const [effects, next] = rollSerumEffects(data, rng, tier, highestFloor)
  return [{ tierId: tier.id, effects }, next]
}

/** Danh sách hàng mới: số huyết thanh nguyên trong [stockMin, stockMax]. */
export function rollLabStock(
  data: GameData,
  rng: RngState,
  highestFloor: number
): [Serum[], RngState] {
  const { stockMin, stockMax } = data.config.implant
  let count: number
  ;[count, rng] = nextInt(rng, stockMin, stockMax)
  const stock: Serum[] = []
  for (let i = 0; i < count; i++) {
    let serum: Serum
    ;[serum, rng] = rollSerum(data, rng, highestFloor)
    stock.push(serum)
  }
  return [stock, rng]
}

/** Tới ngày đổi hàng (`day` ≥ restockDay) thì random hàng mới, đổi tiếp sau restockDays ngày. */
export function restockLab(data: GameData, state: GameState, day: number): GameState {
  if (day < state.lab.restockDay) return state
  const [stock, rng] = rollLabStock(data, state.rng, state.highestFloor)
  return { ...state, rng, lab: { stock, restockDay: day + data.config.implant.restockDays } }
}

/** Việc theo ngày (DAILY_TASKS): đổi hàng Phòng Thí Nghiệm khi tới ngày. */
export const labDailyTask = (
  data: GameData,
  state: GameState,
  _events: DayEvent[],
  day: number
): GameState => restockLab(data, state, day)

/** Giá cấy một lần = giá gốc của bậc × highestFloor (không tăng theo số lần đã cấy). */
export function implantCost(data: GameData, highestFloor: number, serum: Serum): Decimal {
  return toBig(serumTier(data, serum.tierId).price).times(highestFloor).ceil()
}

/** Cấy mọi hiệu ứng của huyết thanh: cộng (thành công) hoặc trừ / hiệu ứng ngược (thất bại). */
function applySerum(monster: Monster, serum: Serum, sign: ImplantSign): Monster {
  return serum.effects.reduce((result, effect) => applySerumEffect(result, effect, sign), monster)
}

function findSerum(state: GameState, serumIndex: number): Serum {
  if (!Number.isSafeInteger(serumIndex)) throw malformedAction('serumIndex phải là số nguyên')
  const serum = state.lab.stock[serumIndex]
  if (!serum) throw new ActionError('serumNotFound', { serumIndex })
  return serum
}

/** Lệnh cấy: quái và vị trí huyết thanh trong danh sách hàng. */
export interface ImplantOrder {
  monsterId: string
  serumIndex: number
  /** Xác nhận bỏ món đang lắp không đủ chỗ về túi nếu lần cấy này làm mất quái (capacity.md). */
  discardOverflow?: boolean
}

/**
 * Phòng Thí Nghiệm ở thị trấn: cấy một huyết thanh vào quái (đội / kho, không đang làm việc). Mất
 * tiền cả khi thất bại. Thất bại lần cuối: quái chết hẳn (hồn phách, đồ về túi, bản mệnh thì đạo
 * thương); đội phải còn quái nếu mất con này nên kiểm tra trước khi cấy.
 */
export function implant(data: GameData, state: GameState, order: ImplantOrder): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const serum = findSerum(state, order.serumIndex)
  const { monster, replace } = locateOwned(state, order.monsterId)
  assertNotBusy(monster)
  const { maxFails } = data.config.implant
  const canDie = monster.implantFails + 1 >= maxFails
  if (canDie) assertNotLocked(monster)
  if (canDie && state.party.every((m) => m.id === monster.id)) {
    throw new ActionError('partyWouldBeEmpty')
  }
  // Có thể mất quái: món đang lắp không đủ chỗ về túi thì phải xác nhận trước khi cấy.
  if (canDie) {
    assertOverflowConfirmed(data, state, {
      monsters: [monster],
      discardOverflow: order.discardOverflow
    })
  }

  const paid = spendMoney(state, implantCost(data, state.highestFloor, serum))
  const [succeeded, rng] = rollPercent(paid.rng, implantChance(data, monster))
  const day = dayOf(state.time)
  const attempted = { ...monster, implantAttempts: monster.implantAttempts + 1 }
  const logBase = { type: 'implanted', monsterId: monster.id, tierId: serum.tierId } as const
  if (succeeded) {
    const implanted = addMilestone(data, applySerum(attempted, serum, 1), {
      day,
      kind: 'implanted',
      tierId: serum.tierId
    })
    const done = { ...replace(implanted), money: paid.money, rng }
    return appendLog(done, { ...logBase, success: true, fails: monster.implantFails, died: false })
  }
  const fails = monster.implantFails + 1
  const failed = addMilestone(data, applySerum({ ...attempted, implantFails: fails }, serum, -1), {
    day,
    kind: 'implantFailed',
    tierId: serum.tierId,
    fails
  })
  const died = fails >= maxFails
  const failedLog: GameLogEntry = { ...logBase, success: false, fails, died }
  if (!died) return appendLog({ ...replace(failed), money: paid.money, rng }, failedLog)
  return loseMonster(data, appendLog({ ...paid, rng }, failedLog), failed)
}

/** Thất bại lần cuối: quái chết hẳn, rời đội / kho; bản mệnh thì ngự thú sư bị đạo thương. */
function loseMonster(data: GameData, state: GameState, monster: Monster): GameState {
  // Món đang lắp về túi trong giới hạn sức chứa (phần thừa đã được xác nhận bỏ), hồn phách luôn giữ.
  const returned = returnEquipmentWithinCapacity(data, state, state.inventory, monster)
  const inventory = dieForever(
    data,
    returned,
    { ...monster, equipment: [] },
    {
      aptitudeFloor: aptitudeFloor(state),
      day: dayOf(state.time),
      cause: 'implant'
    }
  )
  // Bản mệnh chết hẳn (docs/rules/tamer.md mục "Bản mệnh thú"): đạo thương, log bondBroken.
  const { tamer, bondId, woundUntilDay } = woundIfBondDied(data, state, [monster])
  const without = (list: Monster[]): Monster[] => list.filter((m) => m.id !== monster.id)
  const lost = {
    ...state,
    inventory,
    tamer,
    party: without(state.party),
    storage: without(state.storage)
  }
  return bondId === null
    ? lost
    : appendLog(lost, { type: 'bondBroken', monsterId: bondId, woundUntilDay })
}
