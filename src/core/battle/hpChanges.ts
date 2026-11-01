// Mất / hồi máu trong trận: điểm duy nhất trừ và hồi máu (mục "HP, hồi máu" và "Buff và debuff" ở
// battle.md). Sát thương từ quái khác (skill, gián tiếp) đi qua bước giảm trừ: Shelled chặn đòn,
// bỏ qua sát thương theo tỉ lệ (Repelling, trait), sát thương gián tiếp theo trait, đồng đội gánh
// thay, giới hạn mỗi lần mất máu, sàn máu, Barrier hút. Gục: mất trạng thái, ghi bản ghi trận, rồi
// Rebirth hoặc trait hồi sinh. Mọi lần mất / hồi máu xếp sự kiện cho trait (eventQueue.ts).

import { getCurrentHp, getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import {
  STATUS_HOOKS,
  changeAffinity,
  findStatusHook,
  fieldHealMultiplier,
  forEachTraitHook,
  traitNegateChance,
  traitRevive,
  type DslView,
  type TraitHookHandler
} from '../registries'
import { BIG_ZERO, maxBig, minBig, rollPercent, type Decimal } from '../shared'
import type { BattleEvent, GameData, Monster, Skill } from '../model'
import {
  currentTurnLog,
  Draft,
  aliveOnField,
  hasUsedOnce,
  log,
  markUsedOnce,
  monsterBattleContext,
  recordOf,
  sideOf,
  effectiveField
} from './draft'
import { emitTraitEvent } from './eventQueue'
import { activeProtect } from './volatiles'
import { punishTurnStartContact, storeBideDamage } from './multiTurnMoves'
import { partnerTeamBonus } from '../tamer'

/**
 * Loại mất máu: skill (đòn của quái), indirect (trạng thái, môi trường, bẫy, trait của quái khác),
 * cost (tự mất máu để dùng hiệu ứng, Perish Song, hạ ngay: không qua bước giảm trừ).
 */
export type DamageKind = 'skill' | 'indirect' | 'cost'

export interface DamageInfo {
  kind: DamageKind
  /** Quái gây ra (bỏ trống = môi trường / không ai). */
  source?: Monster
  skill?: Skill
  /** Trạng thái gây ra (sát thương trạng thái). */
  statusId?: string
  /** Đòn do trait / minion gây ra. */
  reactive?: boolean
  /** Hệ số khắc chế của đòn skill (điều kiện trigger kiểu Weakness Policy). */
  effectiveness?: number
  /** Đòn skill chí mạng (Anger Point). */
  critical?: boolean
}

const COST: DamageInfo = { kind: 'cost' }

const isFoeOf = (d: Draft, a: Monster, b: Monster): boolean => sideOf(d, a.id) !== sideOf(d, b.id)

/** Góc nhìn điều kiện của quái nhận sát thương. */
function intakeView(data: GameData, d: Draft, target: Monster, info: DamageInfo): DslView {
  const source = info.source
  return {
    data,
    self: target,
    selfCtx: monsterBattleContext(data, d, target),
    attacker: source,
    attackerCtx: source && monsterBattleContext(data, d, source),
    other: source,
    otherCtx: source && monsterBattleContext(data, d, source),
    skill: info.skill,
    reactive: info.reactive
  }
}

/** Tổng % một pha số trên mọi hook có tác dụng lên quái. */
function sumHook(
  data: GameData,
  d: Draft,
  monster: Monster,
  read: (handler: TraitHookHandler, params: unknown, scale: number) => number | undefined
): number {
  let total = 0
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      total += read(handler, params, scale) ?? 0
    },
    monsterBattleContext(data, d, monster)
  )
  return total
}

/** Shelled chặn hoàn toàn đòn skill của địch rồi hết. */
function blockedByShell(data: GameData, d: Draft, target: Monster, info: DamageInfo): boolean {
  if (info.kind !== 'skill' || !info.source || !isFoeOf(d, info.source, target)) return false
  const shell = findStatusHook(
    data,
    target,
    (handler, params) => handler.blocksNextHit?.(params) || undefined
  )
  if (!shell) return false
  removeStatus(d, target, shell.statusId)
  log(d, { type: 'shellBlocked', monsterId: target.id })
  return true
}

/** Gỡ một trạng thái khỏi quái (hết theo điều kiện riêng), log và xếp sự kiện statusEnded. */
export function removeStatus(d: Draft, monster: Monster, statusId: string): void {
  if (!monster.statuses.some((s) => s.statusId === statusId)) return
  monster.statuses = monster.statuses.filter((s) => s.statusId !== statusId)
  log(d, { type: 'statusEnded', monsterId: monster.id, statusId })
  emitTraitEvent(d, { type: 'statusEnded', subjectId: monster.id, statusId })
}

/** Đồng đội có trait gánh sát thương nhận thay một phần đòn skill (kiểu Savior). */
function shareWithGuardians(data: GameData, d: Draft, target: Monster, amount: Decimal): Decimal {
  let remaining = amount
  for (const { monster: ally } of aliveOnField(data, d, sideOf(d, target.id))) {
    if (ally.id === target.id) continue
    const percent = Math.min(
      100,
      sumHook(data, d, ally, (h, p, s) => h.damageSharePercent?.(p, s))
    )
    if (percent <= 0) continue
    const shared = remaining.times(percent).div(100).ceil()
    remaining = remaining.minus(shared)
    loseHp(data, d, ally, shared, (dealt) => ({
      type: 'traitDamage',
      monsterId: ally.id,
      amount: dealt
    }))
  }
  return maxBig(0, remaining)
}

/** Giới hạn mỗi lần mất máu (% max HP nhỏ nhất) và sàn máu (trừ khi đòn lớn hơn max HP). */
function capAndFloor(data: GameData, target: Monster, amount: Decimal, view: DslView): Decimal {
  const maxHp = getMaxHp(data, target)
  let result = amount
  let capPercent = Infinity
  let floorPercent = 0
  forEachTraitHook(
    data,
    target,
    (handler, params, scale) => {
      const cap = handler.damageCapPercent?.(params, scale)
      if (cap !== undefined) capPercent = Math.min(capPercent, cap)
      floorPercent = Math.max(floorPercent, handler.hpFloorPercent?.(params, scale, view) ?? 0)
    },
    view.selfCtx
  )
  if (capPercent < Infinity) result = minBig(result, maxHp.times(capPercent).div(100).ceil())
  const current = getCurrentHp(data, target)
  if (floorPercent > 0 && result.lte(maxHp)) {
    const floorHp = maxBig(1, maxHp.times(floorPercent).div(100).floor())
    if (current.minus(result).lt(floorHp)) result = maxBig(0, current.minus(floorHp))
  }
  return result
}

/** Barrier hút sát thương; hết lượng thì mất buff. Trả về sát thương còn lại. */
function absorbByBarrier(data: GameData, d: Draft, target: Monster, amount: Decimal): Decimal {
  const barrier = target.statuses.find(
    (s) => s.amount !== undefined && findBarrierCap(data, s.statusId) !== undefined
  )
  if (!barrier?.amount || amount.lte(0)) return amount
  const absorbed = minBig(amount, barrier.amount)
  barrier.amount = barrier.amount.minus(absorbed)
  log(d, { type: 'barrierAbsorbed', monsterId: target.id, amount: absorbed })
  if (barrier.amount.lte(0)) removeStatus(d, target, barrier.statusId)
  return amount.minus(absorbed)
}

const findBarrierCap = (data: GameData, statusId: string): number | undefined => {
  for (const hook of data.statuses[statusId].hooks) {
    if (hook.type === 'barrier') return (hook.params as { capPercent: number }).capPercent
  }
  return undefined
}

/** Bước giảm trừ sát thương từ quái khác / gián tiếp (xem đầu file). */
function mitigate(
  data: GameData,
  d: Draft,
  target: Monster,
  amount: Decimal,
  info: DamageInfo
): Decimal {
  if (blockedByShell(data, d, target, info)) return BIG_ZERO
  const view = intakeView(data, d, target, info)
  const negate = traitNegateChance(view)
  if (negate > 0) {
    let negated: boolean
    ;[negated, d.rng] = rollPercent(d.rng, negate)
    if (negated) {
      log(d, { type: 'damageNegated', monsterId: target.id })
      return BIG_ZERO
    }
  }
  let result = amount
  if (info.kind === 'indirect') {
    const percent = sumHook(data, d, target, (h, p, s) => h.indirectDamagePercent?.(p, s))
    result = result.times(Math.max(0, 1 + percent / 100)).ceil()
  }
  if (info.kind === 'skill') result = shareWithGuardians(data, d, target, result)
  result = capAndFloor(data, target, result, view)
  // Endure: trụ lại 1 máu trước đòn skill trong lượt dùng (như Pokémon).
  if (info.kind === 'skill' && activeProtect(data, d, target)?.mode === 'endure') {
    const left = getCurrentHp(data, target).minus(1)
    if (result.gt(left)) {
      result = maxBig(0, left)
      log(d, { type: 'endured', monsterId: target.id })
    }
  }
  // False Swipe / Hold Back: không hạ gục, chừa ít nhất 1 máu.
  if (info.kind === 'skill' && info.skill?.leavesOneHp) {
    result = minBig(result, maxBig(0, getCurrentHp(data, target).minus(1)))
  }
  return absorbByBarrier(data, d, target, result)
}

/** Bản ghi trận và sự kiện sau khi quái mất máu thật vì quái khác / nguồn gián tiếp. */
function recordDamage(
  data: GameData,
  d: Draft,
  target: Monster,
  dealt: Decimal,
  info: DamageInfo
): void {
  const targetRecord = recordOf(d, target.id)
  targetRecord.damageTaken = targetRecord.damageTaken.plus(dealt)
  const source = info.source
  if (info.kind === 'skill' && info.skill && dealt.gt(0)) cureOnHit(data, d, target, info.skill)
  if (info.kind === 'skill' && info.skill && source && dealt.gt(0)) {
    punishTurnStartContact(data, d, { attacker: source, target, skill: info.skill })
  }
  if (info.kind === 'skill' && info.skill && source && dealt.gt(0)) {
    storeBideDamage(d, target, source, dealt)
    const turnLog = currentTurnLog(d, target.id)
    if (turnLog) {
      const hit = { by: source.id, category: info.skill.category, amount: dealt }
      turnLog.hits = [...(turnLog.hits ?? []), hit]
    }
  }
  const fromFoe = source !== undefined && isFoeOf(d, source, target)
  if (fromFoe) {
    targetRecord.timesDamaged++
    const volatile = d.battle.volatiles[target.id]
    if (volatile) volatile.damagedSinceTurnEnd = true
    const sourceRecord = recordOf(d, source.id)
    sourceRecord.damageDealt = sourceRecord.damageDealt.plus(dealt)
  }
  const base = { subjectId: target.id, otherId: source?.id, amount: dealt, reactive: info.reactive }
  emitTraitEvent(d, { ...base, type: 'damagedAny', skillId: info.skill?.id })
  if (info.kind === 'skill' && fromFoe)
    emitTraitEvent(d, {
      ...base,
      type: 'damaged',
      skillId: info.skill?.id,
      effectiveness: info.effectiveness,
      critical: info.critical
    })
  if (info.statusId) emitTraitEvent(d, { ...base, type: 'statusDamage', statusId: info.statusId })
}

/**
 * Gục vì đòn skill của quái phe địch: Destiny Bond kéo quái đánh gục theo, Grudge khóa skill đó của
 * quái đánh tới hết trận (như Pokémon).
 */
function avengeOnFaint(data: GameData, d: Draft, target: Monster, info: DamageInfo): void {
  const volatile = d.battle.volatiles[target.id]
  const source = info.source
  if (!volatile || !source || info.kind !== 'skill' || !isFoeOf(d, source, target)) return
  if (volatile.grudge && info.skill) {
    const sourceVolatile = d.battle.volatiles[source.id]
    if (sourceVolatile) {
      sourceVolatile.sealedSkillIds = [...(sourceVolatile.sealedSkillIds ?? []), info.skill.id]
      log(d, { type: 'skillSealed', monsterId: source.id, skillId: info.skill.id })
    }
  }
  if (volatile.destinyBond && !isFainted(data, source)) {
    delete volatile.destinyBond
    loseHp(data, d, source, getCurrentHp(data, source), (amount) => ({
      type: 'traitDamage',
      monsterId: source.id,
      amount
    }))
  }
}

/**
 * Trúng đòn skill gây sát thương: trạng thái hết theo hệ của đòn (đông lạnh tan khi trúng đòn hệ Lửa)
 * và skill chữa trạng thái của mục tiêu (Scald rã đông), như Pokémon.
 */
function cureOnHit(data: GameData, d: Draft, target: Monster, skill: Skill): void {
  for (const status of [...target.statuses]) {
    const byElement = data.statuses[status.statusId].hooks.some(
      (hook) => STATUS_HOOKS[hook.type].endsOnElementHit?.(hook.params, skill.elementId) === true
    )
    if (byElement || skill.curesTargetStatuses?.includes(status.statusId)) {
      removeStatus(d, target, status.statusId)
    }
  }
}

/** Trạng thái hết khi bị quái khác làm mất máu (ngủ của Siralim). */
function wakeOnDamage(data: GameData, d: Draft, target: Monster, info: DamageInfo): void {
  if (!info.source || info.source.id === target.id) return
  for (const status of [...target.statuses]) {
    const ends = data.statuses[status.statusId].hooks.some((hook) => hook.type === 'endsOnDamage')
    if (ends) removeStatus(d, target, status.statusId)
  }
}

/**
 * Trừ máu (giới hạn bởi HP còn lại), ghi sự kiện do `event` dựng từ máu thực mất, rồi log gục nếu
 * về 0. Sát thương không phải `cost` qua bước giảm trừ trước. Gục: mất mọi trạng thái, rồi hồi
 * sinh (Rebirth, trait). Trả về máu thực mất.
 */
export function loseHp(
  data: GameData,
  d: Draft,
  target: Monster,
  amount: Decimal,
  event: (dealt: Decimal) => BattleEvent,
  info: DamageInfo = COST
): Decimal {
  if (isFainted(data, target)) return BIG_ZERO
  // HP vô hạn (boss thế giới, docs/rules/world-boss.md): tự mất máu (cost) không có tác dụng; sát
  // thương không bị giới hạn bởi HP còn lại, không trừ HP, không gục, vẫn ghi bản ghi trận.
  if (target.endlessHp && info.kind === 'cost') return BIG_ZERO
  const incoming = info.kind === 'cost' ? amount : mitigate(data, d, target, amount, info)
  const dealt = target.endlessHp
    ? maxBig(0, incoming)
    : maxBig(0, minBig(incoming, getCurrentHp(data, target)))
  if (!target.endlessHp) target.damageTaken = target.damageTaken.plus(dealt)
  log(d, event(dealt))
  if (dealt.gt(0) && info.kind !== 'cost') {
    recordDamage(data, d, target, dealt, info)
    wakeOnDamage(data, d, target, info)
  }
  if (dealt.gt(0) && isFainted(data, target)) faint(data, d, target, info)
  return dealt
}

/** Quái vừa gục: mất trạng thái (Rebirth xét trước), bản ghi, sự kiện, rồi hồi sinh nếu có. */
function faint(data: GameData, d: Draft, target: Monster, info: DamageInfo): void {
  avengeOnFaint(data, d, target, info)
  const side = sideOf(d, target.id)
  d.battle.counters.faintTurn = { ...d.battle.counters.faintTurn, [side]: d.battle.turn }
  const rebirth = findStatusHook(data, target, (handler, params) =>
    handler.rebirthPercent?.(params)
  )
  target.statuses = []
  // Quái ta gục thì giảm thân mật (docs/rules/affinity.md); sửa tại chỗ như mọi trường trên bản nháp.
  // Bản mệnh thú không giảm thân mật khi gục (docs/rules/tamer.md mục "Bản mệnh thú").
  if (sideOf(d, target.id) === 'player' && !target.bond) {
    target.affinity = changeAffinity(data, target, -data.config.affinity.loss.faint).affinity
  }
  log(d, { type: 'faint', monsterId: target.id })
  recordOf(d, target.id).deaths++
  d.battle.counters.deaths++
  emitTraitEvent(d, { type: 'faint', subjectId: target.id, otherId: info.source?.id })
  if (rebirth) {
    reviveMonster(data, d, target, rebirth.value)
    return
  }
  reviveByTrait(data, d, target)
  refreshPartnerBonus(data, d, target)
}

/**
 * Bật / tắt kỹ năng đồng hành trong trận khi quái đầu đội `changed` vừa gục / hồi sinh
 * (docs/rules/partner-skills.md): tính lại từ đội, quái khác thì không làm gì. Gọi ở mọi chỗ đổi
 * sống / gục của quái ta (gục, hồi sinh, thuốc, kỹ năng ngự thú sư).
 */
export function refreshPartnerBonus(data: GameData, d: Draft, changed: Monster): void {
  // Độ kiếp đánh một mình, không có kỹ năng đồng hành (docs/rules/awakening.md).
  if (changed.id !== d.party[0]?.id || d.battle.tribulation) return
  const others = d.battle.teamBonuses.player.filter((bonus) => bonus.kind !== 'partner')
  const partner = partnerTeamBonus(data, d.party)
  d.battle.teamBonuses.player = partner ? [...others, partner] : others
}

/**
 * Hồi sinh quái đang gục với % max HP (tối thiểu 1): như rời sân rồi về chỗ cũ (mất bậc trận và
 * trạng thái tạm, giữ lượt vào sân). Ghi bản ghi trận, log revived, xếp sự kiện revived.
 */
export function reviveMonster(data: GameData, d: Draft, monster: Monster, hpPercent: number): void {
  if (!isFainted(data, monster)) return
  const maxHp = getMaxHp(data, monster)
  const amount = minBig(maxHp, maxBig(1, percentOfMaxHp(maxHp, hpPercent)))
  monster.damageTaken = maxHp.minus(amount)
  delete d.battle.stages[monster.id]
  const volatile = d.battle.volatiles[monster.id]
  if (volatile) d.battle.volatiles[monster.id] = { firstTurn: volatile.firstTurn }
  recordOf(d, monster.id).revivals++
  log(d, { type: 'revived', monsterId: monster.id, amount })
  emitTraitEvent(d, { type: 'revived', subjectId: monster.id })
  refreshPartnerBonus(data, d, monster)
}

/**
 * Trait hồi sinh một lần mỗi trận (kiểu Phượng hoàng tái sinh), không tính là bị hạ gục (mục
 * "Trait sống sót").
 */
function reviveByTrait(data: GameData, d: Draft, monster: Monster): void {
  if (hasUsedOnce(d, monster.id, 'revive')) return
  const revive = traitRevive(data, monster, monsterBattleContext(data, d, monster))
  if (revive === null) return
  markUsedOnce(d, monster.id, 'revive')
  log(d, { type: 'traitTriggered', monsterId: monster.id, traitId: revive.traitId })
  reviveMonster(data, d, monster, revive.hpPercent)
}

/** Trừ máu do sát thương skill, ghi log `damage`. Trả về máu thực mất. */
export function applyDamage(
  data: GameData,
  d: Draft,
  target: Monster,
  amount: Decimal,
  hit: { effectiveness: number; critical: boolean; info: DamageInfo }
): Decimal {
  return loseHp(
    data,
    d,
    target,
    amount,
    (dealt) => ({
      type: 'damage',
      targetId: target.id,
      amount: dealt,
      effectiveness: hit.effectiveness,
      critical: hit.critical
    }),
    { ...hit.info, effectiveness: hit.effectiveness, critical: hit.critical }
  )
}

/** Hệ số hồi máu: môi trường × trait / buff của bên nhận × trait của bên hồi (không dưới 0). */
function healMultiplier(data: GameData, d: Draft, monster: Monster, source?: Monster): number {
  const side = sideOf(d, monster.id)
  const field = fieldHealMultiplier(data, effectiveField(data, d), { monster, side })
  const received = sumHook(data, d, monster, (h, p, s) => h.healingReceivedPercent?.(p, s))
  const dealt = source ? sumHook(data, d, source, (h, p, s) => h.healingDealtPercent?.(p, s)) : 0
  return field * Math.max(0, 1 + received / 100) * Math.max(0, 1 + dealt / 100)
}

/**
 * Inverted của bên hồi: hồi máu cho phe mình thành gây sát thương (giảm lượng còn lại của trạng
 * thái, hết thì gỡ). Trả về true nếu đã đổi.
 */
function invertedHeal(
  data: GameData,
  d: Draft,
  monster: Monster,
  amount: Decimal,
  source?: Monster
): boolean {
  if (!source || isFoeOf(d, source, monster)) return false
  const inverted = source.statuses.find((s) =>
    data.statuses[s.statusId].hooks.some((hook) => hook.type === 'invert')
  )
  if (!inverted) return false
  consumeInverted(d, source, inverted.statusId, amount)
  loseHp(
    data,
    d,
    monster,
    amount,
    (dealt) => ({ type: 'traitDamage', monsterId: monster.id, amount: dealt }),
    {
      kind: 'indirect',
      source
    }
  )
  return true
}

/** Trừ lượng còn lại của Inverted; hết thì gỡ trạng thái. */
export function consumeInverted(
  d: Draft,
  monster: Monster,
  statusId: string,
  amount: Decimal
): void {
  const status = monster.statuses.find((s) => s.statusId === statusId)
  if (!status) return
  const left = (status.amount ?? BIG_ZERO).minus(amount)
  if (left.gt(0)) status.amount = left
  else removeStatus(d, monster, statusId)
}

/**
 * Hồi máu cho quái còn sống (làm tròn lên), ghi log lượng thực hồi. Mọi nguồn hồi máu trong trận
 * (skill, trait, môi trường) đi qua đây: nhân hệ số môi trường và trait; Blighted biến hồi máu
 * thành mất máu; Inverted của bên hồi biến hồi phe mình thành gây sát thương. Vật phẩm hồi máu đi
 * đường riêng (battleItems) nên không bị nhân.
 */
export function heal(
  data: GameData,
  d: Draft,
  monster: Monster,
  amount: Decimal,
  source?: Monster
): void {
  if (isFainted(data, monster) || amount.lte(0)) return
  // Heal Block: không hồi được máu (như Pokémon).
  if (monster.statuses.some((s) => data.statuses[s.statusId]?.blocksHealing)) {
    log(d, { type: 'healBlocked', monsterId: monster.id })
    return
  }
  if (invertedHeal(data, d, monster, amount, source)) return
  const blight = findStatusHook(data, monster, (handler, params) =>
    handler.healBlockDamagePercent?.(params)
  )
  if (blight) {
    const hurt = amount.times(blight.value).div(100).ceil()
    loseHp(
      data,
      d,
      monster,
      hurt,
      (dealt) => ({
        type: 'statusDamage',
        monsterId: monster.id,
        statusId: blight.statusId,
        amount: dealt
      }),
      { kind: 'indirect', source, statusId: blight.statusId }
    )
    return
  }
  const healAmount = amount.times(healMultiplier(data, d, monster, source)).ceil()
  if (healAmount.lte(0)) return
  const before = monster.damageTaken
  monster.damageTaken = maxBig(0, before.minus(healAmount))
  const healed = before.minus(monster.damageTaken)
  if (healed.lte(0)) return
  log(d, { type: 'heal', monsterId: monster.id, amount: healed })
  const record = recordOf(d, monster.id)
  record.healingReceived = record.healingReceived.plus(healed)
  emitTraitEvent(d, { type: 'healed', subjectId: monster.id, otherId: source?.id, amount: healed })
}
