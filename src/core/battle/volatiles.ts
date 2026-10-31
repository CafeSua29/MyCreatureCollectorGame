// Trạng thái tạm của quái đang trên sân (mục "Skill" ở battle.md): lượt đầu trên sân (skill
// firstTurnOnly), thế thân (Substitute), đếm ngược gục (Perish Song), truyền cho quái vào thay khi
// rút về (Baton Pass, Shed Tail), lượt chờ của skill có hold. Mất khi rời sân (clearOnFieldState ở
// draft.ts).

import {
  activeTransform,
  getCurrentHp,
  getMaxHp,
  heldSkills,
  isFainted,
  percentOfMaxHp
} from '../monster'
import { BIG_ZERO, minBig, rollPercent, type Decimal } from '../shared'
import type { BattleStages, GameData, Monster, Skill, VolatileState } from '../model'
import { hasAbilityFlag, type PassOn, type ProtectParams } from '../registries'
import { Draft, aliveOnField, findMonster, log, sideOf } from './draft'
import { loseHp } from './hpChanges'

/** Skill chỉ dùng được ở lượt đầu trên sân mà quái không còn ở lượt đầu. */
export function failsFirstTurnRule(d: Draft, user: Monster, skill: Skill): boolean {
  return skill.firstTurnOnly === true && d.battle.volatiles[user.id]?.firstTurn !== d.battle.turn
}

// ---------- Việc trong lượt ----------

/** Ghi kết quả lần dùng skill bằng lệnh của quái: thất bại / trượt hết thì nhớ cho lần sau. */
export function recordSkillOutcome(d: Draft, user: Monster, landed: boolean): void {
  const volatile = d.battle.volatiles[user.id]
  if (!volatile) return
  if (landed) delete volatile.lastSkillFailed
  else volatile.lastSkillFailed = true
}

// ---------- Hold ----------

/**
 * Quái vừa dùng skill có hold bằng lệnh của nó: chờ lại `hold` lượt kể từ lượt sau. Đang Dynamax
 * (dùng thành chiêu Max) hoặc đã rời sân thì không.
 */
export function startHold(d: Draft, user: Monster, skill: Skill): void {
  const volatile = d.battle.volatiles[user.id]
  if (skill.hold === undefined || !volatile || activeTransform(user)?.kind === 'dynamax') return
  volatile.holdReadyTurns = {
    ...volatile.holdReadyTurns,
    [skill.id]: d.battle.turn + skill.hold + 1
  }
}

/**
 * Giảm `turns` lượt chờ của mọi skill đang chờ của quái (kiểu Tĩnh Tâm Chú); có tác dụng thì log
 * holdReduced với tổng số lượt thực giảm.
 */
export function reduceHold(data: GameData, d: Draft, monster: Monster, turns: number): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile) return
  let reduced = 0
  for (const { skillId, turnsLeft } of heldSkills(data, d.battle, monster)) {
    const cut = Math.min(turnsLeft, turns)
    volatile.holdReadyTurns = {
      ...volatile.holdReadyTurns,
      [skillId]: d.battle.turn + turnsLeft - cut
    }
    reduced += cut
  }
  if (reduced > 0) log(d, { type: 'holdReduced', monsterId: monster.id, turns: reduced })
}

// ---------- Max Guard (hiệu ứng protect) ----------

/**
 * Bật bảo vệ tới hết lượt: dùng thành công ở lượt ngay trước thì tỉ lệ ÷ divisor mỗi lần liên tiếp
 * (như Protect của Pokémon); thất bại thì chuỗi liên tiếp về 0.
 */
export function raiseProtect(
  d: Draft,
  {
    user,
    consecutiveChanceDivisor,
    skillId
  }: { user: Monster; consecutiveChanceDivisor: number; skillId: string }
): void {
  const volatile = d.battle.volatiles[user.id]
  if (!volatile) return
  const previous = volatile.protect
  const streak = previous && previous.turn === d.battle.turn - 1 ? previous.streak + 1 : 0
  let success: boolean
  ;[success, d.rng] = rollPercent(d.rng, 100 / consecutiveChanceDivisor ** streak)
  if (!success) {
    delete volatile.protect
    log(d, { type: 'skillFailed', monsterId: user.id, skillId, reason: 'protectFailed' })
    return
  }
  volatile.protect = { turn: d.battle.turn, streak, skillId }
}

/** Thông số bảo vệ đang có tác dụng của quái trong lượt này (null = không). */
export function activeProtect(data: GameData, d: Draft, monster: Monster): ProtectParams | null {
  const protect = d.battle.volatiles[monster.id]?.protect
  if (protect?.turn !== d.battle.turn) return null
  const skill = protect.skillId === undefined ? undefined : data.skills[protect.skillId]
  const effect = skill?.effects.find((entry) => entry.type === 'protect')
  // Save cũ / Max Guard không ghi skill: bảo vệ mọi skill như trước.
  return effect ? (effect.params as ProtectParams) : { consecutiveChanceDivisor: 3 }
}

/**
 * Skill của `user` nhắm vào `target` gặp Max Guard của target (lượt này, không phải chính nó, skill
 * không xuyên bảo vệ): `blocked` = bị chặn; `pierced` = Z-Move gây sát thương xuyên qua, chỉ gây một
 * phần sát thương (docs/rules/z-moves.md); `none` = không bị bảo vệ. Gặp bảo vệ thì ghi log.
 */
export function protectionAgainst(
  data: GameData,
  d: Draft,
  { user, target, skill }: { user: Monster; target: Monster; skill: Skill }
): 'none' | 'blocked' | 'pierced' {
  if (user.id === target.id || skill.ignoresProtect) return 'none'
  // Unseen Fist: đòn tiếp xúc không bị bảo vệ chặn.
  if (skill.contact && hasAbilityFlag(data, user, 'contactIgnoresProtect')) return 'none'
  const protect = activeProtect(data, d, target)
  if (!protect || protect.mode === 'endure') return 'none'
  if (protect.blocks === 'damaging' && skill.power <= 0) return 'none'
  // Feint, Shadow Force: phá bảo vệ của mục tiêu rồi đánh như thường.
  if (skill.breaksProtect) {
    delete d.battle.volatiles[target.id]?.protect
    log(d, { type: 'protectBroken', monsterId: target.id, userId: user.id })
    return 'none'
  }
  // Z-Move, đòn tiếp xúc của Piercing Drill: xuyên bảo vệ, chỉ gây một phần sát thương.
  const piercing =
    skill.zMove !== undefined ||
    (skill.contact === true && hasAbilityFlag(data, user, 'contactPiercesProtect'))
  if (piercing && skill.power > 0) {
    log(d, { type: 'protectPierced', monsterId: target.id, userId: user.id })
    return 'pierced'
  }
  log(d, { type: 'protected', monsterId: target.id, userId: user.id })
  return 'blocked'
}

// ---------- Thế thân ----------

/** Quái `target` đang núp sau thế thân trước đòn / hiệu ứng của quái phe địch `user`. */
export function isShielded(d: Draft, user: Monster, target: Monster): boolean {
  return (
    d.battle.volatiles[target.id]?.substituteHp !== undefined &&
    sideOf(d, user.id) !== sideOf(d, target.id)
  )
}

/**
 * Tạo thế thân: mất `hpCostPercent`% max HP (làm tròn lên), thế thân có đúng lượng máu đó. Đã có
 * thế thân, hoặc máu còn lại không lớn hơn lượng phải mất, thì không có tác dụng.
 */
export function createSubstitute(
  data: GameData,
  d: Draft,
  { user, hpCostPercent, skillId }: { user: Monster; hpCostPercent: number; skillId: string }
): void {
  const volatile = d.battle.volatiles[user.id]
  if (!volatile) return
  if (volatile.substituteHp !== undefined) {
    log(d, { type: 'skillFailed', monsterId: user.id, skillId, reason: 'alreadyActive' })
    return
  }
  const cost = percentOfMaxHp(getMaxHp(data, user), hpCostPercent)
  if (getCurrentHp(data, user).lte(cost)) {
    log(d, { type: 'skillFailed', monsterId: user.id, skillId, reason: 'notEnoughHp' })
    return
  }
  // Còn nhiều máu hơn lượng mất nên không gục.
  loseHp(data, d, user, cost, (hp) => ({ type: 'substituteCreated', monsterId: user.id, hp }))
  volatile.substituteHp = cost
}

/** Thế thân của `target` nhận sát thương thay (giới hạn bởi máu thế thân). Trả về máu thế thân mất. */
export function damageSubstitute(d: Draft, target: Monster, amount: Decimal): Decimal {
  const volatile = d.battle.volatiles[target.id]
  const hp = volatile?.substituteHp
  if (!volatile || hp === undefined) return BIG_ZERO
  const dealt = minBig(amount, hp)
  log(d, { type: 'substituteDamaged', monsterId: target.id, amount: dealt })
  const left = hp.minus(dealt)
  if (left.gt(0)) {
    volatile.substituteHp = left
  } else {
    delete volatile.substituteHp
    log(d, { type: 'substituteBroken', monsterId: target.id })
  }
  return dealt
}

// ---------- Perish Song ----------

/**
 * Bắt đầu đếm ngược gục cho quái còn sống trên sân. Quái đang đếm giữ số cũ; boss hoang không bị
 * (như hệ số môi trường ½ của boss, để không hạ boss chỉ bằng một skill).
 */
export function startPerish(data: GameData, d: Draft, monsterId: string, turns: number): void {
  const volatile = d.battle.volatiles[monsterId]
  if (!volatile || volatile.perishTurns !== undefined) return
  if (d.battle.isBoss && sideOf(d, monsterId) === 'enemy') return
  if (isFainted(data, findMonster(d, monsterId))) return
  volatile.perishTurns = turns
  log(d, { type: 'perishCount', monsterId, turnsLeft: turns })
}

/** Cuối lượt: giảm đếm ngược của quái trên sân; về 0 thì mất hết máu còn lại. */
export function perishAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      const volatile = d.battle.volatiles[monster.id]
      if (volatile?.perishTurns === undefined) continue
      const turnsLeft = volatile.perishTurns - 1
      log(d, { type: 'perishCount', monsterId: monster.id, turnsLeft })
      if (turnsLeft > 0) {
        volatile.perishTurns = turnsLeft
        continue
      }
      delete volatile.perishTurns
      loseHp(data, d, monster, getCurrentHp(data, monster), (amount) => ({
        type: 'perished',
        monsterId: monster.id,
        amount
      }))
    }
  }
}

// ---------- Truyền khi rút về ----------

/** Phần trạng thái tạm của quái rút về cần giữ lại để truyền (lấy trước khi nó rời sân). */
export interface PassedState {
  stages: BattleStages | undefined
  volatile: VolatileState | undefined
}

export const snapshotPassedState = (d: Draft, monsterId: string): PassedState => ({
  stages: d.battle.stages[monsterId],
  volatile: d.battle.volatiles[monsterId]
})

/**
 * Truyền cho quái vừa vào thay: all = bậc trận (cộng với bậc nhận từ bẫy lúc vào, kẹp giới hạn),
 * thế thân, đếm ngược Perish Song; substitute = chỉ thế thân.
 */
export function passOnState(
  data: GameData,
  d: Draft,
  { from, to, mode, passed }: { from: Monster; to: Monster; mode: PassOn; passed: PassedState }
): void {
  const volatile = d.battle.volatiles[to.id]
  if (!volatile || isFainted(data, to)) return
  if (passed.volatile?.substituteHp !== undefined) {
    volatile.substituteHp = passed.volatile.substituteHp
  }
  if (mode === 'all') {
    if (passed.volatile?.perishTurns !== undefined) {
      volatile.perishTurns = passed.volatile.perishTurns
    }
    // Baton Pass truyền cả bậc chí mạng của Focus Energy (như Pokémon).
    if (passed.volatile?.focusStages !== undefined) {
      volatile.focusStages = passed.volatile.focusStages
    }
    const { min, max } = data.config.battleStage
    const stages = (d.battle.stages[to.id] ??= {})
    for (const [stat, step] of Object.entries(passed.stages ?? {}) as [
      keyof BattleStages,
      number
    ][]) {
      stages[stat] = Math.min(max, Math.max(min, (stages[stat] ?? 0) + step))
    }
  }
  log(d, { type: 'passedOn', monsterId: from.id, toMonsterId: to.id })
}
