// Hợp kích kỹ (docs/rules/team.md): hai quái cùng phe trên sân cùng ra lệnh `combo`, tốn lượt của
// cả hai. Quái tới lượt trước (nhanh hơn) chỉ sẵn sàng; quái tới lượt sau (chậm hơn) tung chiêu
// cùng đồng đội, như Pledge của Pokémon. Một trong hai gục / rời sân / mất lượt trước đó thì hủy.
// Quái đã sẵn sàng ghi theo bản nháp (WeakMap, như hàng chờ hành động): không vào state.

import { ActionError, malformedAction, type ComboBlocker } from '../shared'
import { matchesMonsterCondition } from '../registries'
import type { BattleCommand, BattleSide, BattleState, GameData, Monster } from '../model'
import { Draft, SLOT_COUNT, aliveOnField, findMonster, log } from './draft'
import { executeSkill } from './executeSkill'
import { rollSelfHit, rollSkipTurn } from './statuses'
import { traitSkipsTurn } from './actionTraits'
import type { TurnAction } from './actionQueue'

type ComboCommand = Extract<BattleCommand, { kind: 'combo' }>

/** Quái đã sẵn sàng hợp kích trong lượt đang xử lý: id quái → id hợp kích kỹ. */
const readied = new WeakMap<object, Map<string, string>>()

const readiedOf = (d: Draft): Map<string, string> => {
  let map = readied.get(d)
  if (!map) {
    map = new Map()
    readied.set(d, map)
  }
  return map
}

/** Hai quái (theo bất kỳ thứ tự nào) thỏa cặp điều kiện của hợp kích kỹ. */
function matchesPair(
  data: GameData,
  comboId: string,
  [a, b]: readonly [Monster, Monster]
): boolean {
  const [first, second] = data.comboSkills[comboId].pair
  const fits = (x: Monster, y: Monster): boolean =>
    matchesMonsterCondition(data, first, x) && matchesMonsterCondition(data, second, y)
  return fits(a, b) || fits(b, a)
}

/**
 * Lý do hai quái cùng phe không dùng được hợp kích kỹ; null = dùng được. Phe không có ngự thú sư
 * (quái hoang, boss) không dùng được; thân mật chỉ xét với phe người chơi (ngự thú sư NPC bỏ qua).
 */
export function comboBlocker(
  data: GameData,
  battle: BattleState,
  { side, comboId, pair }: { side: BattleSide; comboId: string; pair: readonly [Monster, Monster] }
): ComboBlocker | null {
  if (battle.tamers[side] === null) return 'noTamer'
  if (!matchesPair(data, comboId, pair)) return 'pairMismatch'
  const { minAffinity } = data.config.combo
  if (side === 'player' && pair.some((monster) => monster.affinity < minAffinity)) {
    return 'affinityTooLow'
  }
  return null
}

/**
 * Hợp kích kỹ hai quái còn sống trên sân của một phe dùng được lúc này; rỗng nếu phe không có đủ
 * hai quái. Dùng cho AI.
 */
export function usableCombos(
  data: GameData,
  d: Draft,
  side: BattleSide
): { comboId: string; pair: [Monster, Monster] }[] {
  const onField = aliveOnField(data, d, side)
  if (onField.length !== 2) return []
  const pair: [Monster, Monster] = [onField[0].monster, onField[1].monster]
  return Object.keys(data.comboSkills)
    .filter((comboId) => comboBlocker(data, d.battle, { side, comboId, pair }) === null)
    .map((comboId) => ({ comboId, pair }))
}

/**
 * Kiểm tra lệnh hợp kích của phe người chơi (submitTurn): id có thật, ô mục tiêu hợp lệ, ô còn lại
 * cũng ra đúng lệnh này (cùng comboId và target), cặp quái dùng được. Ném lỗi, không đổi state.
 */
export function validateComboCommands(
  data: GameData,
  { battle, party }: { battle: BattleState; party: readonly Monster[] },
  commands: readonly BattleCommand[]
): void {
  for (const command of commands) {
    if (command.kind !== 'combo') continue
    const { comboId, target } = command
    if (!Object.hasOwn(data.comboSkills, comboId)) {
      throw malformedAction(`hợp kích kỹ không tồn tại: ${String(comboId)}`)
    }
    if (target !== undefined && !(target >= 0 && target < SLOT_COUNT)) {
      throw malformedAction(`ô mục tiêu không hợp lệ: ${target}`)
    }
    const partnerCommand = commands.find(
      (other): other is ComboCommand =>
        other.slot !== command.slot && other.kind === 'combo' && other.comboId === comboId
    )
    if (!partnerCommand || partnerCommand.target !== target) {
      throw new ActionError('comboUnavailable', { comboId, reason: 'noPartner' })
    }
    // submitTurn đã kiểm tra mỗi ô có lệnh đều có quái còn sống của đội trên sân.
    const monsterAt = (slot: number): Monster =>
      party.find((m) => m.id === battle.playerSlots[slot]) as Monster
    const pair: [Monster, Monster] = [monsterAt(command.slot), monsterAt(partnerCommand.slot)]
    // Thực thể hợp thể ra lệnh ở hai ô nhưng là một quái: không có đồng đội (battle-merge.md).
    if (pair[0].id === pair[1].id) {
      throw new ActionError('comboUnavailable', { comboId, reason: 'noPartner' })
    }
    const reason = comboBlocker(data, battle, { side: 'player', comboId, pair })
    if (reason !== null) throw new ActionError('comboUnavailable', { comboId, reason })
  }
}

/**
 * Lượt của một quái ra lệnh hợp kích: mất lượt (trait, trạng thái) thì hủy; đồng đội chưa sẵn sàng
 * thì sẵn sàng chờ đồng đội; đồng đội đã sẵn sàng (vẫn còn trên sân) thì tung chiêu cùng nó.
 */
export function runComboCommand(
  data: GameData,
  d: Draft,
  action: TurnAction,
  command: ComboCommand
): void {
  const user = findMonster(d, action.monsterId)
  const { comboId } = command
  const ready = readiedOf(d)
  const partner = aliveOnField(data, d, action.side).find(
    (entry) => entry.monster.id !== user.id && ready.get(entry.monster.id) === comboId
  )?.monster
  if (traitSkipsTurn(data, d, user) || rollSkipTurn(data, d, user) || rollSelfHit(data, d, user)) {
    if (partner) failCombo(d, partner.id, comboId)
    return
  }
  if (!partner) {
    ready.set(user.id, comboId)
    log(d, { type: 'comboReady', monsterId: user.id, comboId })
    return
  }
  ready.delete(partner.id)
  // Hệ / race có thể đã đổi trong lượt (trait Siralim): xét lại cặp điều kiện lúc tung.
  const pair: [Monster, Monster] = [user, partner]
  if (comboBlocker(data, d.battle, { side: action.side, comboId, pair }) !== null) {
    log(d, { type: 'comboFailed', monsterId: user.id, comboId })
    return
  }
  log(d, { type: 'combo', monsterId: user.id, partnerId: partner.id, comboId })
  executeSkill(data, d, {
    side: action.side,
    slot: action.slot,
    user,
    skill: data.skills[comboId],
    targetSlot: command.target,
    partner
  })
}

/** Hủy hợp kích đồng đội đã sẵn sàng (log theo quái đã sẵn sàng). */
function failCombo(d: Draft, monsterId: string, comboId: string): void {
  readiedOf(d).delete(monsterId)
  log(d, { type: 'comboFailed', monsterId, comboId })
}

/**
 * Hết pha hành động của lượt: quái đã sẵn sàng mà đồng đội không tới lượt (gục, rời sân) thì hủy.
 */
export function failUnfinishedCombos(d: Draft): void {
  for (const [monsterId, comboId] of readiedOf(d)) failCombo(d, monsterId, comboId)
  readied.delete(d)
}
