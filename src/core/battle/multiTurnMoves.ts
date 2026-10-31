// Chiêu nhiều lượt kiểu Pokémon (docs/rules/pokemon-moves.md mục "Chiêu nhiều lượt"): nạp lượt (Fly,
// Solar Beam; bán vô hình), nghỉ sau Hyper Beam, khóa chiêu (Outrage, Rollout, Uproar), dùng liên tiếp
// (skillStreak), đòn đến muộn (Future Sight), nạp đầu lượt (Beak Blast, Shell Trap), và lệnh bị ép
// thay lệnh người chơi / AI ở đầu lượt.

import { activeTransform, isFainted } from '../monster'
import { BIG_ZERO, nextInt, type Decimal } from '../shared'
import type {
  BattleCommand,
  BattleSide,
  GameData,
  InvulnerableKind,
  Monster,
  Skill,
  VolatileState
} from '../model'
import { battleSkillIds, GLOBAL_FIELD_LAYERS } from '../model'
import {
  hasTraitFlag,
  isLayerFieldIn,
  monsterWeightKg,
  type DslView,
  type TraitEffect
} from '../registries'
import { consumeHeldWhere } from './heldItems'
import {
  Draft,
  findMonster,
  log,
  monsterBattleContext,
  opponentOf,
  sideOf,
  slotsOf,
  userField
} from './draft'
import { runTraitEffects } from './traitEffects'
import { inflictStatus } from './statuses'

const volatileOf = (d: Draft, monster: Monster): VolatileState | undefined =>
  d.battle.volatiles[monster.id]

/** Chạy hiệu ứng ngôn ngữ trait với quái dùng là chủ (self), `other` cho trước. */
function runSelfEffects(
  data: GameData,
  d: Draft,
  { owner, other, skill }: { owner: Monster; other: Monster; skill: Skill },
  effects: readonly TraitEffect[]
): void {
  if (effects.length === 0) return
  const view: DslView = {
    data,
    self: owner,
    selfCtx: monsterBattleContext(data, d, owner),
    other,
    otherCtx: monsterBattleContext(data, d, other),
    subject: other,
    subjectCtx: monsterBattleContext(data, d, other),
    skill
  }
  runTraitEffects(
    data,
    d,
    { owner, scale: 1, subject: other, other, skillId: skill.id, view },
    effects
  )
}

// ---------- Lệnh bị ép đầu lượt ----------

/** Skill quái bị ép dùng lượt này (đang nạp, khóa chiêu, phải nghỉ); null = tự do. */
function forcedSkill(d: Draft, monster: Monster): { skillId: string; targetId?: string } | null {
  const volatile = volatileOf(d, monster)
  if (!volatile) return null
  if (volatile.charging) return volatile.charging
  if (volatile.bide) return { skillId: volatile.bide.skillId }
  if (volatile.lockedMove && volatile.lockedMove.turnsLeft > 0) return volatile.lockedMove
  if (volatile.mustRecharge === d.battle.turn) {
    // Lượt nghỉ: lệnh skill bất kỳ, runSkillCommand bỏ lượt (đổi quái cũng không được, như Pokémon).
    const skillId = battleSkillIds(monster)[0]
    return skillId ? { skillId } : null
  }
  return null
}

/**
 * Thay lệnh của quái đang bị ép hành động bằng lệnh skill bị ép (nhắm lại mục tiêu cũ nếu còn trên
 * sân), như Pokémon không cho đổi lệnh khi đang nạp / khóa chiêu / phải nghỉ.
 */
export function withForcedCommands<T extends { side: BattleSide; command: BattleCommand }>(
  data: GameData,
  d: Draft,
  entries: readonly T[]
): T[] {
  return entries.map((entry) => {
    const monsterId = slotsOf(d.battle, entry.side)[entry.command.slot]
    if (!monsterId) return entry
    const monster = findMonster(d, monsterId)
    const forced = isFainted(data, monster) ? null : forcedSkill(d, monster)
    if (!forced) return entry
    const foeSlots = slotsOf(d.battle, opponentOf(entry.side))
    const target = forced.targetId ? Math.max(0, foeSlots.indexOf(forced.targetId)) : 0
    const command: BattleCommand = {
      slot: entry.command.slot,
      kind: 'skill',
      skillId: forced.skillId,
      target
    }
    return { ...entry, command }
  })
}

/** Lượt nghỉ sau Hyper Beam: bỏ lượt (log recharging). Trả về true nếu nghỉ. */
export function consumeRecharge(d: Draft, user: Monster): boolean {
  const volatile = volatileOf(d, user)
  if (volatile?.mustRecharge !== d.battle.turn) return false
  delete volatile.mustRecharge
  log(d, { type: 'recharging', monsterId: user.id })
  return true
}

// ---------- Nạp lượt ----------

/** Môi trường đang có làm skill đánh ngay không cần nạp (Solar Beam trong nắng). */
const chargeSkipped = (data: GameData, d: Draft, user: Monster, skill: Skill): boolean => {
  const field = userField(data, d, user)
  const skipIds = skill.charge?.skipInFieldIds ?? []
  return GLOBAL_FIELD_LAYERS.some((layer) => isLayerFieldIn(data, field, layer, skipIds))
}

/**
 * Lượt nạp của chiêu hai lượt: chạy `onCharge`; nạp xong (không bỏ qua) thì ghi trạng thái nạp và
 * trả về true (không đánh lượt này). Lượt sau (đang nạp đúng skill này) thì bỏ trạng thái nạp, trả
 * về false để đánh như thường.
 */
export function startChargeIfNeeded(
  data: GameData,
  d: Draft,
  { user, skill, targetId }: { user: Monster; skill: Skill; targetId?: string }
): boolean {
  const charge = skill.charge
  const volatile = volatileOf(d, user)
  if (!charge || !volatile) return false
  if (volatile.charging?.skillId === skill.id) {
    delete volatile.charging
    return false
  }
  // Sky Drop: nhấc mục tiêu lên cùng; không nhấc được thì thất bại (mất lượt, không nạp).
  if (skill.carriesTarget && !liftTarget(data, d, { user, skill, targetId })) {
    log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
    return true
  }
  log(d, { type: 'charging', monsterId: user.id, skillId: skill.id })
  runSelfEffects(
    data,
    d,
    { owner: user, other: user, skill },
    (charge.onCharge ?? []) as TraitEffect[]
  )
  if (chargeSkipped(data, d, user, skill)) return false
  if (usesPowerHerb(data, d, user)) return false
  volatile.charging = {
    skillId: skill.id,
    ...(targetId ? { targetId } : {}),
    ...(charge.invulnerable ? { invulnerable: charge.invulnerable } : {})
  }
  return true
}

/**
 * Sky Drop nhấc mục tiêu (phe địch, còn sống, nhẹ hơn `maxWeightKg`, không Dynamax, không núp sau
 * thế thân, chưa bị nhấc): mục tiêu bán vô hình trên không và mất lượt tới khi quái dùng đánh xuống.
 */
function liftTarget(
  data: GameData,
  d: Draft,
  { user, skill, targetId }: { user: Monster; skill: Skill; targetId?: string }
): boolean {
  const carry = skill.carriesTarget
  const target = targetId ? findMonster(d, targetId) : undefined
  if (!carry || !target || isFainted(data, target)) return false
  const volatile = volatileOf(d, target)
  if (!volatile || volatile.carriedBy || volatile.substituteHp !== undefined) return false
  if (sideOf(d, target.id) === sideOf(d, user.id)) return false
  if (activeTransform(target)?.kind === 'dynamax') return false
  if (monsterWeightKg(data, target) >= carry.maxWeightKg) return false
  volatile.carriedBy = user.id
  log(d, { type: 'carried', monsterId: target.id, userId: user.id })
  return true
}

/** Quái `carrierId` thả quái nó đang nhấc (đánh xuống xong, rời sân, gục). */
export function dropCarried(d: Draft, carrierId: string): void {
  for (const volatile of Object.values(d.battle.volatiles)) {
    if (volatile.carriedBy === carrierId) delete volatile.carriedBy
  }
}

/** Kiểu bán vô hình hiện tại của quái: nạp chiêu, bị Sky Drop nhấc (trên không), Commander. */
export function invulnerableKindOf(
  volatile: VolatileState | undefined
): InvulnerableKind | undefined {
  if (!volatile) return undefined
  if (volatile.charging?.invulnerable) return volatile.charging.invulnerable
  if (volatile.carriedBy) return 'air'
  return volatile.commanding ? 'commanding' : undefined
}

/** Power Herb: có hook bỏ lượt nạp thì đánh ngay; đồ cầm mang hook đó tiêu hao. */
function usesPowerHerb(data: GameData, d: Draft, user: Monster): boolean {
  const skips = (
    handler: { skipsChargeTurn?(params: unknown): boolean },
    params: unknown
  ): boolean => handler.skipsChargeTurn?.(params) === true
  if (!hasTraitFlag(data, user, skips, monsterBattleContext(data, d, user))) return false
  consumeHeldWhere(data, d, user, skips)
  return true
}

/**
 * Mục tiêu đang bán vô hình mà skill không đánh trúng được kiểu đó (Fly: chỉ Thunder, Gust... trúng).
 */
export function isOutOfReach(d: Draft, skill: Skill, target: Monster, user?: Monster): boolean {
  const volatile = volatileOf(d, target)
  // Sky Drop: quái nhấc mục tiêu đánh trúng nó (cùng ở trên trời).
  if (user !== undefined && volatile?.carriedBy === user.id) return false
  const kind = invulnerableKindOf(volatile)
  if (!kind) return false
  return !(skill.hitsInvulnerable ?? []).some((entry) => entry.kind === kind)
}

/** Hệ số sát thương lên quái đang bán vô hình (Earthquake ×2 lên quái dưới đất); 1 = không. */
export function invulnerableHitMultiplier(
  skill: Skill,
  target: Monster,
  volatiles: Readonly<Record<string, VolatileState>> | undefined
): number {
  const kind = invulnerableKindOf(volatiles?.[target.id])
  if (!kind) return 1
  return skill.hitsInvulnerable?.find((entry) => entry.kind === kind)?.multiplier ?? 1
}

// ---------- Bide ----------

/**
 * Lượt dùng Bide (skill có `bide`): lượt đầu bắt đầu tích, các lượt sau tích tiếp tới hết `turns`
 * lượt (trả về `store`); lượt kế đó trả đòn lên quái gây sát thương cuối cùng còn trên sân (bỏ trống
 * = mục tiêu theo lệnh), chưa tích được gì thì thất bại (`fail`).
 */
export function bideStep(
  d: Draft,
  { user, skill }: { user: Monster; skill: Skill }
): { kind: 'store' } | { kind: 'fail' } | { kind: 'release'; targetId?: string } {
  const volatile = volatileOf(d, user)
  if (!skill.bide || !volatile) return { kind: 'release' }
  const bide = volatile.bide
  if (bide?.skillId !== skill.id) {
    volatile.bide = { skillId: skill.id, turnsLeft: skill.bide.turns, damage: BIG_ZERO }
    log(d, { type: 'charging', monsterId: user.id, skillId: skill.id })
    return { kind: 'store' }
  }
  if (bide.turnsLeft > 1) {
    bide.turnsLeft--
    log(d, { type: 'charging', monsterId: user.id, skillId: skill.id })
    return { kind: 'store' }
  }
  if (bide.damage.lte(0)) {
    delete volatile.bide
    return { kind: 'fail' }
  }
  const onField = [...d.battle.playerSlots, ...d.battle.enemySlots]
  const targetId = bide.lastAttackerId
  return {
    kind: 'release',
    ...(targetId !== undefined && onField.includes(targetId) ? { targetId } : {})
  }
}

/** Quái đang tích Bide mất máu vì skill của quái khác: cộng vào lượng tích, nhớ quái gây ra. */
export function storeBideDamage(d: Draft, target: Monster, source: Monster, amount: Decimal): void {
  const bide = volatileOf(d, target)?.bide
  if (!bide || source.id === target.id) return
  bide.damage = bide.damage.plus(amount)
  bide.lastAttackerId = source.id
}

/** Bide đã trả đòn: bỏ trạng thái tích. */
export function endBide(d: Draft, user: Monster): void {
  const volatile = volatileOf(d, user)
  if (volatile) delete volatile.bide
}

// ---------- Dùng liên tiếp, khóa chiêu, nghỉ ----------

/** Ghi lần dùng skill bằng lệnh của quái (đếm dùng liên tiếp qua các lượt). */
export function recordStreak(d: Draft, user: Monster, skill: Skill): void {
  const volatile = volatileOf(d, user)
  if (!volatile) return
  const previous = volatile.skillStreak
  const continues = previous?.skillId === skill.id && previous.turn === d.battle.turn - 1
  volatile.skillStreak = {
    skillId: skill.id,
    count: continues ? previous.count + 1 : 1,
    turn: d.battle.turn
  }
}

/**
 * Ghi lần dùng skill bằng lệnh vào chuỗi chung của trận (Echoed Voice: mỗi lượt liên tiếp có quái
 * dùng thì tăng một, dùng nhiều lần trong một lượt chỉ tính một).
 */
export function recordFieldStreak(d: Draft, skill: Skill): void {
  const { turn } = d.battle
  const kept = Object.entries(d.battle.counters.fieldStreaks ?? {}).filter(
    ([, streak]) => streak.turn >= turn - 1
  )
  const streaks = Object.fromEntries(kept)
  const previous = streaks[skill.id]
  if (previous?.turn !== turn) {
    streaks[skill.id] = { turn, count: previous?.turn === turn - 1 ? previous.count + 1 : 1 }
  }
  d.battle.counters.fieldStreaks = streaks
}

/** Bắt đầu khóa chiêu ở lần dùng đầu (tung số lượt). */
export function startLockIn(
  d: Draft,
  { user, skill, targetId }: { user: Monster; skill: Skill; targetId?: string }
): void {
  const lockIn = skill.lockIn
  const volatile = volatileOf(d, user)
  if (!lockIn || !volatile || volatile.lockedMove?.skillId === skill.id) return
  let turns: number
  ;[turns, d.rng] = nextInt(d.rng, lockIn.turns.min, lockIn.turns.max)
  volatile.lockedMove = {
    skillId: skill.id,
    ...(targetId ? { targetId } : {}),
    turnsLeft: turns,
    kind: lockIn.kind
  }
}

/**
 * Sau một lần dùng skill khóa: giảm lượt; hết lượt thì thôi khóa (rampage: lú lẫn vì mệt, như
 * Outrage); trượt / thất bại thì dừng ngay (không lú lẫn).
 */
export function advanceLockIn(data: GameData, d: Draft, user: Monster, landed: boolean): void {
  const volatile = volatileOf(d, user)
  const locked = volatile?.lockedMove
  if (!volatile || !locked) return
  locked.turnsLeft--
  if (!landed) {
    delete volatile.lockedMove
    return
  }
  if (locked.turnsLeft > 0) return
  delete volatile.lockedMove
  const fatigue = data.skills[locked.skillId].lockIn?.fatigueStatusId
  if (fatigue && !isFainted(data, user)) inflictStatus(data, d, user, fatigue)
}

/** Đánh trúng skill nghỉ (Hyper Beam): lượt sau phải nghỉ. */
export function scheduleRecharge(d: Draft, user: Monster, skill: Skill, landed: boolean): void {
  const volatile = volatileOf(d, user)
  if (skill.recharge && landed && volatile) volatile.mustRecharge = d.battle.turn + 1
}

/** Trạng thái `statusId` bị chặn vì có quái trên sân đang khóa chiêu chặn nó (Uproar: ngủ). */
export function isBlockedByLockIn(data: GameData, d: Draft, statusId: string): boolean {
  return Object.values(d.battle.volatiles).some((volatile) => {
    const skillId = volatile.lockedMove?.skillId
    return (
      skillId !== undefined &&
      (data.skills[skillId].lockIn?.blocksStatusIds ?? []).includes(statusId)
    )
  })
}

// ---------- Đòn đến muộn ----------

/** Đặt đòn đến muộn lên ô mục tiêu; ô đó đã có đòn chờ thì thất bại (như Pokémon). */
export function scheduleDelayedAttack(
  d: Draft,
  { user, skill, target }: { user: Monster; skill: Skill; target: Monster }
): boolean {
  const side = sideOf(d, target.id)
  const slot = slotsOf(d.battle, side).indexOf(target.id)
  const pending = d.battle.delayedAttacks ?? []
  if (slot < 0 || pending.some((entry) => entry.side === side && entry.slot === slot)) return false
  d.battle.delayedAttacks = [
    ...pending,
    {
      userId: user.id,
      skillId: skill.id,
      side,
      slot,
      turn: d.battle.turn + (skill.delayedTurns ?? 0),
      ...(skill.delayedHealPercent ? { healPercent: skill.delayedHealPercent } : {})
    }
  ]
  log(d, { type: 'delayedAttackSet', monsterId: user.id, skillId: skill.id })
  return true
}

/** Đòn đến muộn tới hạn ở cuối lượt này (bỏ khỏi danh sách chờ). */
export function takeDueDelayedAttacks(
  d: Draft
): readonly NonNullable<typeof d.battle.delayedAttacks>[number][] {
  const pending = d.battle.delayedAttacks ?? []
  const due = pending.filter((entry) => entry.turn <= d.battle.turn)
  const rest = pending.filter((entry) => entry.turn > d.battle.turn)
  if (rest.length > 0) d.battle.delayedAttacks = rest
  else delete d.battle.delayedAttacks
  return due
}

// ---------- Nạp đầu lượt (Beak Blast, Shell Trap) ----------

/** Đầu lượt: quái chọn skill nạp đầu lượt bắt đầu nạp (log charging). */
export function chargeAtTurnStart(
  data: GameData,
  d: Draft,
  entries: readonly { side: BattleSide; command: BattleCommand }[]
): void {
  for (const { side, command } of entries) {
    if (command.kind !== 'skill') continue
    const skill = data.skills[command.skillId]
    const monsterId = slotsOf(d.battle, side)[command.slot]
    const volatile = monsterId ? d.battle.volatiles[monsterId] : undefined
    if (!skill?.chargeAtTurnStart || !monsterId || !volatile) continue
    volatile.turnStartCharge = { skillId: skill.id, turn: d.battle.turn }
    log(d, { type: 'charging', monsterId, skillId: skill.id })
  }
}

/** Quái đang nạp đầu lượt bị đòn tiếp xúc: chạy `onContactHit` lên quái đánh (Beak Blast gây bỏng). */
export function punishTurnStartContact(
  data: GameData,
  d: Draft,
  { attacker, target, skill }: { attacker: Monster; target: Monster; skill: Skill }
): void {
  const charge = volatileOf(d, target)?.turnStartCharge
  if (!skill.contact || charge?.turn !== d.battle.turn) return
  const effects = (data.skills[charge.skillId].chargeAtTurnStart?.onContactHit ??
    []) as TraitEffect[]
  runSelfEffects(
    data,
    d,
    { owner: target, other: attacker, skill: data.skills[charge.skillId] },
    effects
  )
}
