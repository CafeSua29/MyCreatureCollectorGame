// Một lượt đấu: lệnh của quái địch (AI chung, ai.ts), thứ tự hành động (priority, Stall theo trait,
// Snared, Timeline của Siralim: đầu / cuối, chỉ số dùng để xếp thứ tự, vị trí lượt đầu, thế mạnh /
// nhanh: priority và tốc độ lượt sau ở moveStyles.ts), hành động
// thêm do trait (actionQueue.ts), mất lượt do trait / trạng thái, skill ngẫu nhiên do trait
// (actionTraits.ts), phòng thủ / khiêu khích, sự kiện trait sau mỗi hành động (traitEvents.ts),
// cuối lượt (trait ở turnEndTraits.ts → sự kiện cuối lượt → môi trường → trạng thái → minion →
// Perish Song → tự bỏ chạy ở fleeTraits.ts → biến hình → ngự thú sư → cuồng bạo ở frenzy.ts), phân
// thắng thua / chờ thay quái. Quái người chơi cuồng bạo: lệnh do AI chọn (frenzy.ts).

import { isFainted } from '../monster'
import { findStatusHook, forEachTraitHook, skillPriority, traitActsLast } from '../registries'
import { BIG_ZERO, nextFloat, rollPercent } from '../shared'
import type {
  BattleCommand,
  BattleSide,
  GameData,
  Monster,
  NonHpStat,
  TamerCommand
} from '../model'
import {
  Draft,
  ITEM_PRIORITY,
  aliveOnField,
  fillableSlot,
  findMonster,
  monsterBattleContext,
  occupantIds,
  recordOf,
  removeFromField,
  replacementOptions,
  slotsOf,
  battleStats,
  clearOnFieldState,
  log,
  teamOf
} from './draft'
import {
  endUnsustainedPrimalFields,
  enterField,
  enterFieldTogether,
  fieldAtTurnEnd
} from './environment'
import { chooseReplacements, withAiSwitches } from './trainerAi'
import { compareSpeed } from './rooms'
import { styleSpeedMultiplier, styledSkill } from './moveStyles'
import { executeSkill, resolveDelayedAttacks, skillOrStruggle } from './executeSkill'
import { chargeAtTurnStart, consumeRecharge, withForcedCommands } from './multiTurnMoves'
import { zMoveFor } from './zMoves'
import { throwBall, throwItem, applyItemToAlly } from './battleItems'
import { cureUserBeforeSkill, rollSelfHit, rollSkipTurn, statusesAtTurnEnd } from './statuses'
import { applyWin, applyLoss, finish } from './outcome'
import { isTribulationTimeUp, settleTribulation } from './tribulation'
import { isSpecialTimeUp } from './specialBattles'
import { perishAtTurnEnd } from './volatiles'
import { passivesAtTurnEnd } from './passiveSkills'
import { isExhausted, restStamina, staminaAtTurnEnd } from './stamina'
import { wallAttacksOnAction } from './walls'
import { boobyTrapsAtTurnEnd } from './boobyTraps'
import { coatingsAtTurnEnd } from './coatings'
import { traitsAtTurnEnd } from './turnEndTraits'
import { cudChewAtTurnEnd } from './heldItems'
import { chooseAiCommands } from './ai'
import { chooseSkillWithTraits, rollActsFirst, traitSkipsTurn } from './actionTraits'
import { fleesAtTurnEnd } from './fleeTraits'
import { failUnfinishedCombos, runComboCommand } from './combos'
import { runTamerStep, tamersAtTurnEnd } from './tamerSkills'
import { minionsAtTurnEnd } from './minions'
import { frenziedPlayerSlots, frenzyAtTurnEnd, isFrenzied, rollFrenzyExtraAction } from './frenzy'
import { disobeyChance, playerContractLevelLimit } from '../tamer'
import { emitTraitEvent } from './eventQueue'
import { flushTraitEvents } from './traitEvents'
import { guard } from './traitEffects'
import {
  battleSkill,
  runTransformStep,
  transformsAtTurnEnd,
  type TransformRequest
} from './transform'
import {
  clearPendingActions,
  nextPendingAction,
  setPendingActions,
  type TurnAction
} from './actionQueue'

export type { TurnAction }

/** Quái bị Snared (kẹt cuối Timeline) hoặc có trait kiểu Stall. */
function actsLastOf(data: GameData, d: Draft, monster: Monster): boolean {
  if (findStatusHook(data, monster, (handler, params) => handler.stuckAtBottom?.(params)))
    return true
  return traitActsLast(data, monster, monsterBattleContext(data, d, monster))
}

/** Chỉ số dùng để xếp thứ tự (trait kiểu Covert: theo công thay tốc độ). */
function orderStat(data: GameData, d: Draft, monster: Monster): NonHpStat {
  let stat: NonHpStat = 'speed'
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      stat = handler.turnOrderStat?.(params) ?? stat
    },
    monsterBattleContext(data, d, monster)
  )
  return stat
}

/**
 * Vị trí Timeline của quái trong lượt: lượt sau đã được đưa lên đầu / xuống cuối (trait), hoặc
 * lượt đầu trận theo trait vị trí khởi đầu (tung tỉ lệ). 1 = đầu, −1 = cuối, 0 = bình thường.
 */
function timelinePosition(data: GameData, d: Draft, monster: Monster): number {
  const volatile = d.battle.volatiles[monster.id]
  if (volatile?.timeline) {
    const position = volatile.timeline
    delete volatile.timeline
    return position === 'top' ? 1 : -1
  }
  if (d.battle.turn !== 1) return 0
  let position = 0
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      const start = handler.startPosition?.(params, scale)
      if (!start || position !== 0) return
      let hit: boolean
      ;[hit, d.rng] = rollPercent(d.rng, start.chance)
      if (hit) position = start.position === 'top' ? 1 : -1
    },
    monsterBattleContext(data, d, monster)
  )
  return position
}

/** Priority của lệnh: đổi quái trước, rồi vật phẩm, phòng thủ / khiêu khích, rồi skill. */
function commandPriority(
  data: GameData,
  d: Draft,
  monster: Monster,
  command: BattleCommand
): number {
  switch (command.kind) {
    case 'switch':
      return Infinity
    case 'item':
      return ITEM_PRIORITY
    case 'defend':
      return data.config.battle.defend.priority
    case 'provoke':
      return data.config.battle.provoke.priority
    case 'rest':
      return 0
    case 'skill': {
      // Priority của skill thật (đang Dynamax: chiêu Max priority 0, Max Guard +4; Z-Move gây sát
      // thương priority 0), cộng theo thế.
      const chosen = data.skills[command.skillId]
      const zSkill = command.zMove ? zMoveFor(data, monster, chosen) : null
      const actual = zSkill ?? battleSkill(data, d, monster, chosen)
      return skillPriority(
        data,
        monster,
        styledSkill(data, actual, command.style),
        monsterBattleContext(data, d, monster)
      )
    }
    case 'combo':
      return skillPriority(
        data,
        monster,
        data.skills[command.comboId],
        monsterBattleContext(data, d, monster)
      )
  }
}

interface OrderedAction extends TurnAction {
  timeline: number
  /** Đi trước mọi quái cùng mức priority lượt này (kiểu Quick Claw). */
  actsFirst: boolean
}

/** Lệnh xét đi trước kiểu Quick Claw: lệnh của pha skill (đổi quái, vật phẩm đã đi trước). */
const canActFirst = (command: BattleCommand): boolean =>
  command.kind === 'skill' ||
  command.kind === 'combo' ||
  command.kind === 'defend' ||
  command.kind === 'provoke' ||
  command.kind === 'rest'

/**
 * Đổi quái đi trước, rồi dùng vật phẩm / ném bóng, rồi phòng thủ / khiêu khích, rồi skill theo
 * priority (đã cộng trait kiểu Prankster); cùng mức thì quái được đi trước (kiểu Quick Claw), rồi
 * vị trí Timeline (lên đầu / xuống cuối), rồi
 * quái mang trait kiểu Stall hoặc bị Snared đi sau (kể cả Trick Room), rồi chỉ số xếp thứ tự (tốc
 * độ, hoặc chỉ số khác theo trait) cao trước (room đảo thứ tự như Trick Room: thấp trước), hòa thì
 * random.
 */
export function orderActions(
  data: GameData,
  d: Draft,
  commands: { side: BattleSide; command: BattleCommand }[]
): TurnAction[] {
  const actions = commands.map(({ side, command }): OrderedAction => {
    const monsterId = slotsOf(d.battle, side)[command.slot] as string
    const monster = findMonster(d, monsterId)
    let tiebreak: number
    ;[tiebreak, d.rng] = nextFloat(d.rng)
    return {
      side,
      slot: command.slot,
      monsterId,
      command,
      priority: commandPriority(data, d, monster, command),
      actsLast: actsLastOf(data, d, monster),
      // Thế đã dùng ở lượt trước đổi tốc độ xếp thứ tự lượt này (docs/rules/move-styles.md).
      speed: battleStats(data, d, monster)[orderStat(data, d, monster)].times(
        styleSpeedMultiplier(data, d, monster)
      ),
      tiebreak,
      timeline: timelinePosition(data, d, monster),
      actsFirst: canActFirst(command) && rollActsFirst(data, d, monster)
    }
  })
  const bySpeed = compareSpeed(data, d.battle.field)
  return actions
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        Number(b.actsFirst) - Number(a.actsFirst) ||
        b.timeline - a.timeline ||
        Number(a.actsLast) - Number(b.actsLast) ||
        bySpeed(a.speed, b.speed) ||
        a.tiebreak - b.tiebreak
    )
    .map(({ timeline: _timeline, actsFirst: _actsFirst, ...action }) => action)
}

// Quái phụ đang hợp thể không tính riêng (teamOf): thực thể gục là cả hai gục.
export const partyWiped = (data: GameData, d: Draft): boolean =>
  teamOf(data, d, 'player').every((m) => isFainted(data, m))

export const enemiesWiped = (data: GameData, d: Draft): boolean =>
  teamOf(data, d, 'enemy').every((m) => isFainted(data, m))

const battleOver = (data: GameData, d: Draft): boolean =>
  partyWiped(data, d) || enemiesWiped(data, d)

function endTribulation(data: GameData, d: Draft, outcome: 'won' | 'lost'): void {
  finish(data, d, outcome)
  settleTribulation(data, d, outcome)
}

/** Ô sân của hai phe lúc bắt đầu lượt (biết ô nào vừa bị bỏ trống trong lượt). */
export type SideSlots = Record<BattleSide, readonly (string | null)[]>

export const snapshotSlots = (d: Draft): SideSlots => ({
  player: [...d.battle.playerSlots],
  enemy: [...d.battle.enemySlots]
})

/** Phe có ô vừa bị bỏ trống trong lượt (quái lớn rút về, quái hoang bị bắt / bỏ chạy...). */
const hasVacatedSlot = (d: Draft, side: BattleSide, start: SideSlots | undefined): boolean =>
  start !== undefined &&
  slotsOf(d.battle, side).some((id, slot) => id === null && start[side][slot] !== null)

/**
 * Sau mỗi lượt: phân thắng thua, dọn ô của quái gục, hoặc chờ người chơi thay quái. Có ô gục hoặc ô
 * vừa bị bỏ trống trong lượt (`start`: ô lúc đầu lượt) thì mọi ô trống được thay hết mức có thể
 * (docs/rules/monster-size.md: quái lớn rút về để trống ô).
 */
export function settleAfterTurn(data: GameData, d: Draft, start?: SideSlots): void {
  flushTraitEvents(data, d)
  if (d.battle.tribulation) {
    // Độ kiếp: hết lượt mà chưa phân thắng thua là thua (docs/rules/awakening.md).
    if (partyWiped(data, d) || isTribulationTimeUp(data, d)) return endTribulation(data, d, 'lost')
    if (enemiesWiped(data, d)) return endTribulation(data, d, 'won')
  }
  if (partyWiped(data, d)) return applyLoss(data, d)
  if (enemiesWiped(data, d)) return applyWin(data, d)
  // Hết số lượt tối đa của trận đặc biệt (boss thế giới): trận kết thúc, không phần thưởng chung.
  if (isSpecialTimeUp(data, d.battle)) {
    log(d, { type: 'battleTimeUp' })
    return finish(data, d, 'won')
  }

  const enemyFainted = faintedOnField(data, d, 'enemy')
  for (const id of enemyFainted) {
    clearOnFieldState(data, d, id)
    removeFromField(d, 'enemy', id)
  }
  // Phe địch còn dự bị (đội NPC, docs/rules/trainers.md) thì AI đưa quái thay vào ô trống ngay; quái
  // thay có thể gục vì bẫy nên phân lại từ đầu.
  if (enemyFainted.length > 0 || hasVacatedSlot(d, 'enemy', start)) {
    const open = d.battle.enemySlots.flatMap((id, slot) => (id === null ? [slot] : []))
    const enemyEntrants = chooseReplacements(data, d, 'enemy', open)
    if (enemyEntrants.length > 0) {
      enterFieldTogether(data, d, 'enemy', enemyEntrants)
      if (enemyEntrants.some(({ monster }) => isFainted(data, monster)))
        return settleAfterTurn(data, d, start)
    }
  }
  const fainted = faintedOnField(data, d, 'player')
  for (const id of fainted) clearOnFieldState(data, d, id)
  const { reserves, vacantSlots } = replacementOptions(data, d, d.battle)
  if (
    (fainted.length > 0 || hasVacatedSlot(d, 'player', start)) &&
    fillableSlot(data, vacantSlots, reserves) !== null
  ) {
    d.battle.phase = 'chooseReplacement'
  } else {
    for (const id of fainted) removeFromField(d, 'player', id)
    d.battle.phase = 'chooseActions'
  }
}

/** Id quái đã gục còn trong ô sân của phe (mỗi quái một lần). */
const faintedOnField = (data: GameData, d: Draft, side: BattleSide): string[] =>
  occupantIds(slotsOf(d.battle, side)).filter((id) => isFainted(data, findMonster(d, id)))

/**
 * Lệnh do AI chọn cho hành động thêm của quái (cả quái người chơi); không hợp kích (đồng đội không
 * có lượt đi cùng).
 */
function extraCommand(data: GameData, d: Draft, action: TurnAction): BattleCommand | undefined {
  return chooseAiCommands(data, d, action.side, { allowCombos: false }).find(
    (command) => command.slot === action.slot
  )
}

/**
 * Lệnh của quái người chơi đang cuồng bạo (mất điều khiển, docs/rules/frenzy.md): AI chung chọn,
 * không hợp kích.
 */
function frenzyCommands(data: GameData, d: Draft): BattleCommand[] {
  const slots = frenziedPlayerSlots(d.battle)
  if (slots.length === 0) return []
  return chooseAiCommands(data, d, 'player', { allowCombos: false }).filter((command) =>
    slots.includes(command.slot)
  )
}

/**
 * Quái người chơi chưa khế ước không nghe lệnh skill của người chơi (bỏ lượt, log `disobey`). Hành
 * động thêm và lệnh của quái đang cuồng bạo do AI chọn nên không xét. Tỉ lệ 0 thì không tốn RNG.
 */
function rollDisobey(data: GameData, d: Draft, action: TurnAction, user: Monster): boolean {
  if (action.side !== 'player' || !action.command || isFrenzied(d.battle, user.id)) return false
  let disobeys: boolean
  ;[disobeys, d.rng] = rollPercent(
    d.rng,
    disobeyChance(data, user, playerContractLevelLimit(data, d))
  )
  if (disobeys) log(d, { type: 'disobey', monsterId: user.id })
  return disobeys
}

/** Lệnh skill đuổi đánh quái rút về (Pursuit) trong lượt, theo bản nháp; dùng rồi thì bỏ. */
type SkillEntry = { side: BattleSide; command: Extract<BattleCommand, { kind: 'skill' }> }
const pendingPursuits = new WeakMap<object, SkillEntry[]>()

/** Lệnh Pursuit nhắm đúng ô của quái đang rút về (không ghi ô = địch duy nhất trên sân). */
const targetsLeaving = (
  d: Draft,
  entry: SkillEntry,
  side: BattleSide,
  leavingId: string
): boolean =>
  entry.command.target === undefined || slotsOf(d.battle, side)[entry.command.target] === leavingId

/**
 * Pursuit: quái sắp rút về (lệnh đổi quái) bị quái phe địch đã chọn skill `pursuit` **nhắm vào nó**
 * đánh trước khi rời sân (% sát thương của skill), như Pokémon; lệnh đó coi như đã dùng trong lượt.
 */
function pursueBeforeSwitch(data: GameData, d: Draft, leaving: Monster): void {
  const side = slotsOf(d.battle, 'player').includes(leaving.id) ? 'player' : 'enemy'
  const pursuits = pendingPursuits.get(d) ?? []
  for (const entry of [...pursuits]) {
    if (entry.side === side || isFainted(data, leaving)) continue
    if (!targetsLeaving(d, entry, side, leaving.id)) continue
    const monsterId = slotsOf(d.battle, entry.side)[entry.command.slot]
    if (!monsterId || isFainted(data, findMonster(d, monsterId))) continue
    pendingPursuits.set(
      d,
      (pendingPursuits.get(d) ?? []).filter((other) => other !== entry)
    )
    const skill = data.skills[entry.command.skillId]
    const action: TurnAction = {
      side: entry.side,
      slot: entry.command.slot,
      monsterId,
      command: entry.command,
      priority: skill.priority,
      actsLast: false,
      speed: BIG_ZERO,
      tiebreak: 0
    }
    runSkillCommand(data, d, action, entry.command, {
      targetId: leaving.id,
      damagePercent: skill.pursuit?.damagePercent
    })
    flushTraitEvents(data, d)
  }
}

/** Lệnh skill: mất lượt (trait, rồi trạng thái) chỉ chặn skill; skill ngẫu nhiên do trait. */
function runSkillCommand(
  data: GameData,
  d: Draft,
  action: TurnAction,
  command: Extract<BattleCommand, { kind: 'skill' }>,
  pursuit?: { targetId: string; damagePercent?: number }
): void {
  const user = findMonster(d, action.monsterId)
  if (consumeRecharge(d, user)) return
  const chosen = data.skills[command.skillId]
  if (chosen) cureUserBeforeSkill(d, user, chosen)
  if (traitSkipsTurn(data, d, user) || rollSkipTurn(data, d, user, chosen)) return
  if (rollSelfHit(data, d, user)) return
  if (rollDisobey(data, d, action, user)) return
  const choice = chooseSkillWithTraits(data, d, {
    side: action.side,
    user,
    choice: {
      skillId: command.skillId,
      targetSlot: command.target,
      switchTo: command.switchTo,
      style: command.style
    }
  })
  // Trait đổi skill (chọn ngẫu nhiên...) thì không còn là Z-Move của lệnh.
  const zMove = command.zMove === true && choice.skillId === command.skillId
  executeSkill(data, d, {
    side: action.side,
    slot: action.slot,
    user,
    skill: skillOrStruggle(data, d, user, data.skills[choice.skillId]),
    targetSlot: choice.targetSlot,
    switchTo: choice.switchTo,
    style: choice.style,
    ...(zMove ? { zMove: true } : {}),
    ...(command.targetAlly && choice.skillId === command.skillId ? { targetAlly: true } : {}),
    ...(command.targetFoe && choice.skillId === command.skillId ? { targetFoe: true } : {}),
    // Trait đổi skill thì không còn nhắm bộ phận của lệnh.
    ...(command.aim !== undefined && choice.skillId === command.skillId
      ? { aim: command.aim }
      : {}),
    ...(pursuit && choice.skillId === command.skillId ? pursuit : {})
  })
  if (!pursuit) rollFrenzyExtraAction(data, d, action)
}

/** Thực hiện một hành động của lượt. */
function runAction(data: GameData, d: Draft, action: TurnAction): void {
  const user = findMonster(d, action.monsterId)
  // Bị Sky Drop nhấc lên, đang ở trong miệng đồng đội (Commander): không hành động được.
  const volatile = d.battle.volatiles[user.id]
  if (volatile?.carriedBy || volatile?.commanding) return
  const command = action.command ?? extraCommand(data, d, action)
  if (!command) return
  recordOf(d, user.id).turnsTaken++
  // Quá sức ở lượt trước: mất lượt này, chỉ được nghỉ (đổi quái / vật phẩm cũng không làm được).
  if (isExhausted(d, user.id)) {
    restStamina(data, d, user)
    return
  }
  // Tường có đòn riêng (Abramacabra) đánh đầu lượt của quái; đòn phản có thể làm quái gục.
  wallAttacksOnAction(data, d, user)
  if (isFainted(data, user)) return
  switch (command.kind) {
    case 'switch': {
      const incoming = findMonster(d, command.monsterId)
      // Quái lớn vào thay cả hai ô (docs/rules/monster-size.md; điều kiện đã kiểm tra ở submitTurn):
      // lệnh đổi còn lại sang chính nó thì nó đã ở trên sân.
      if (slotsOf(d.battle, action.side).includes(incoming.id)) return
      pursueBeforeSwitch(data, d, user)
      // Pursuit hạ gục quái đang rút về: ô chờ thay quái như quái gục.
      if (isFainted(data, user)) return
      enterField(data, d, { side: action.side, slot: action.slot, monster: incoming })
      return
    }
    case 'item': {
      const item = data.items[command.itemId]
      if (item.category === 'ball') {
        throwBall(data, d, user, item, command.targetId)
      } else if (item.category === 'consumable' && item.target === 'enemy') {
        throwItem(data, d, user, item, command.targetId)
      } else {
        applyItemToAlly(data, d, user, item, command.targetId)
      }
      return
    }
    case 'defend':
    case 'provoke':
      guard(d, user, command.kind)
      return
    case 'rest':
      restStamina(data, d, user)
      return
    case 'skill':
      runSkillCommand(data, d, action, command)
      return
    case 'combo':
      runComboCommand(data, d, action, command)
  }
}

/** Sự kiện cuối lượt cho trait Siralim ("đầu / cuối lượt"): mỗi quái còn sống trên sân. */
function emitTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      emitTraitEvent(d, { type: 'turnEnd', subjectId: monster.id })
    }
  }
}

/**
 * Hết lượt: quái trên sân bắt đầu đếm lại "đã mất máu kể từ cuối lượt trước"; nhật ký trong lượt
 * (turnLog) chỉ có nghĩa trong lượt nên bỏ, save không giữ dữ liệu cũ.
 */
function resetDamageFlags(d: Draft): void {
  for (const volatile of Object.values(d.battle.volatiles)) {
    delete volatile.damagedSinceTurnEnd
    delete volatile.turnLog
  }
}

/** Thời hạn của tường, bẫy Booby Trap, lớp phủ hệ (docs/rules/element-reactions.md). */
function cassetteTimersAtTurnEnd(_data: GameData, d: Draft): void {
  boobyTrapsAtTurnEnd(d)
  coatingsAtTurnEnd(d)
}

/** Các bước cuối lượt theo thứ tự; xử lý sự kiện trait sau mỗi bước. */
function endOfTurn(data: GameData, d: Draft): void {
  const steps = [
    resolveDelayedAttacks,
    traitsAtTurnEnd,
    cudChewAtTurnEnd,
    emitTurnEnd,
    fieldAtTurnEnd,
    statusesAtTurnEnd,
    minionsAtTurnEnd,
    perishAtTurnEnd,
    passivesAtTurnEnd,
    cassetteTimersAtTurnEnd,
    staminaAtTurnEnd,
    fleesAtTurnEnd,
    transformsAtTurnEnd,
    tamersAtTurnEnd,
    frenzyAtTurnEnd
  ]
  for (const step of steps) {
    if (battleOver(data, d)) return
    step(data, d)
    flushTraitEvents(data, d)
    // Quái đặt thời tiết nguyên thủy gục cuối lượt thì thời tiết tan ngay.
    endUnsustainedPrimalFields(data, d)
  }
  resetDamageFlags(d)
}

/** Chạy lần lượt các hành động đang chờ (kể cả hành động thêm chèn vào giữa chừng). */
function runPendingActions(data: GameData, d: Draft): void {
  for (let action = nextPendingAction(d); action; action = nextPendingAction(d)) {
    if (battleOver(data, d)) break
    // Bỏ qua nếu quái đã rời sân hoặc đã gục trước khi tới lượt.
    if (slotsOf(d.battle, action.side)[action.slot] !== action.monsterId) continue
    if (isFainted(data, findMonster(d, action.monsterId))) continue
    runAction(data, d, action)
    flushTraitEvents(data, d)
    // Quái đặt thời tiết nguyên thủy rời sân / gục trong hành động: thời tiết tan (như Pokémon).
    endUnsustainedPrimalFields(data, d)
  }
  failUnfinishedCombos(d)
  clearPendingActions(d)
}

/**
 * Một lượt: đổi quái → kỹ năng ngự thú sư (docs/rules/tamer.md) → biến hình (theo tốc độ; kế hoạch
 * biến hình của boss ở lượt đầu) → các lệnh còn lại (vật phẩm, phòng thủ, skill) xếp thứ tự sau
 * bước biến hình (Mega đổi tốc độ có tác dụng ngay lượt đó, như Pokémon) → cuối lượt.
 */
export function resolveTurn(
  data: GameData,
  d: Draft,
  playerCommands: BattleCommand[],
  {
    transforms = [],
    tamerCommand
  }: { transforms?: readonly TransformRequest[]; tamerCommand?: TamerCommand } = {}
): void {
  const start = snapshotSlots(d)
  // Quái đang nạp / khóa chiêu / phải nghỉ bị ép lệnh (như Pokémon), kể cả lệnh của AI.
  const commands = withForcedCommands(data, d, [
    ...playerCommands.map((command) => ({ side: 'player' as const, command })),
    ...frenzyCommands(data, d).map((command) => ({ side: 'player' as const, command })),
    ...withAiSwitches(data, d, 'enemy', chooseAiCommands(data, d, 'enemy')).map((command) => ({
      side: 'enemy' as const,
      command
    }))
  ])
  const isSwitch = (entry: (typeof commands)[number]): boolean => entry.command.kind === 'switch'
  const pursuits = commands.filter(
    (entry): entry is SkillEntry =>
      entry.command.kind === 'skill' && data.skills[entry.command.skillId]?.pursuit !== undefined
  )
  pendingPursuits.set(d, pursuits)
  setPendingActions(d, orderActions(data, d, commands.filter(isSwitch)))
  runPendingActions(data, d)
  // Lệnh Pursuit đã đánh quái rút về thì không dùng lại.
  const unusedPursuits = pendingPursuits.get(d) ?? []
  pendingPursuits.delete(d)
  const usedPursuit = (entry: (typeof commands)[number]): boolean =>
    pursuits.includes(entry as SkillEntry) && !unusedPursuits.includes(entry as SkillEntry)
  if (!battleOver(data, d)) {
    runTamerStep(data, d, tamerCommand)
    flushTraitEvents(data, d)
  }
  if (!battleOver(data, d)) {
    runTransformStep(data, d, transforms)
    flushTraitEvents(data, d)
  }
  // Beak Blast / Shell Trap nạp trước mọi hành động trong lượt.
  chargeAtTurnStart(data, d, commands)
  setPendingActions(
    d,
    orderActions(
      data,
      d,
      // Ô đã trống (quái hoang theo về vì Thị Uy ở bước ngự thú sư) thì bỏ lệnh của ô đó.
      commands.filter(
        (entry) =>
          !isSwitch(entry) &&
          !usedPursuit(entry) &&
          slotsOf(d.battle, entry.side)[entry.command.slot] !== null
      )
    )
  )
  runPendingActions(data, d)
  endOfTurn(data, d)
  d.battle.turn++
  settleAfterTurn(data, d, start)
}
