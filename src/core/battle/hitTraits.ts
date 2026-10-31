// Trait chạy theo từng đòn skill. Trước khi trừ máu: trụ lại 1 máu (mục "Trait sống sót" ở
// battle.md). Sau đòn gây mất máu thật lên quái phe địch (mục "Trait khi trúng đòn / hạ gục"): bên
// đánh hút máu, hạ ngay mục tiêu máu thấp, gây trạng thái; hạ gục: đếm hạ gục, trait đổi bậc, hồi
// máu; bên bị đánh: phản đòn, kẻ đánh dính trạng thái, phản đòn khi bị hạ gục. Hồi sinh xử lý ở
// loseHp (draft.ts) vì áp cho mọi nguyên nhân gục.

import { getCurrentHp, getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import {
  isIndirectDamageImmune,
  traitAttackStatuses,
  traitExecuteThreshold,
  traitHitStatuses,
  traitKnockedOutRetaliation,
  traitKnockoutHeal,
  traitLethalSurvivals,
  traitLifesteal,
  traitRecoil,
  traitRetaliation,
  triggerLogSource,
  type TraitStatusChance
} from '../registries'
import { maxBig, rollPercent, type Decimal } from '../shared'
import type { GameData, Monster, Skill } from '../model'
import { Draft, hasUsedOnce, log, markUsedOnce, monsterBattleContext, sideOf } from './draft'
import { heal, loseHp } from './hpChanges'
import { consumeHeldItem } from './heldItems'
import { triggerStageTraits } from './stageChanges'
import { canInflictStatus, hazardDamageFactor, inflictStatus } from './statuses'

/** Một đòn vừa đánh: quái đánh, mục tiêu, skill. */
export interface Strike {
  user: Monster
  target: Monster
  skill: Skill
}

const logTraits = (d: Draft, monsterId: string, traitIds: readonly string[]): void => {
  for (const traitId of traitIds) log(d, { type: 'traitTriggered', monsterId, traitId })
}

/**
 * Quái `victim` mất `percent`% max HP của nó vì trait của quái khác (phản đòn): boss hoang nhận ít
 * hơn (hazardDamageFactor), làm tròn lên, tối thiểu 1, log `traitDamage`.
 */
function loseHpToTrait(
  data: GameData,
  d: Draft,
  { victim, owner, percent }: { victim: Monster; owner: Monster; percent: number }
): void {
  if (isFainted(data, victim)) return
  const factor = hazardDamageFactor(data, d, sideOf(d, victim.id))
  const amount = maxBig(1, percentOfMaxHp(getMaxHp(data, victim).times(factor), percent))
  loseHp(
    data,
    d,
    victim,
    amount,
    (dealt) => ({ type: 'traitDamage', monsterId: victim.id, amount: dealt }),
    { kind: 'indirect', source: owner }
  )
}

/**
 * Tung trạng thái của trait theo thứ tự (bỏ qua trạng thái `victim` không dính mới được, không tốn
 * RNG); trạng thái đầu tiên trúng thì gây rồi dừng.
 */
function rollTraitStatuses(
  data: GameData,
  d: Draft,
  { owner, victim }: { owner: Monster; victim: Monster },
  chances: readonly TraitStatusChance[]
): void {
  for (const { statusId, chance, traitId } of chances) {
    if (!canInflictStatus(data, d, victim, statusId)) continue
    let hit: boolean
    ;[hit, d.rng] = rollPercent(d.rng, chance)
    if (!hit) continue
    log(d, { type: 'traitTriggered', monsterId: owner.id, traitId })
    inflictStatus(data, d, victim, statusId, { source: owner })
    return
  }
}

/** Mục tiêu còn máu ≤ ngưỡng của trait bên đánh (boss hoang: ngưỡng × hệ số boss) thì gục ngay. */
function executeIfLow(data: GameData, d: Draft, { user, target }: Strike): void {
  const threshold = traitExecuteThreshold(data, user)
  if (threshold === null || isFainted(data, target)) return
  const factor = hazardDamageFactor(data, d, sideOf(d, target.id))
  const remaining = getCurrentHp(data, target)
  const ratio = remaining.div(getMaxHp(data, target)).toNumber()
  if (ratio * 100 > threshold.percent * factor) return
  logTraits(d, user.id, [threshold.traitId])
  loseHp(data, d, target, remaining, (dealt) => ({
    type: 'traitDamage',
    monsterId: target.id,
    amount: dealt
  }))
}

/**
 * Phần máu hiện tại tối thiểu giữ lại khi trụ: Decimal chỉ giữ 40 chữ số nên với máu cực lớn
 * "máu − 1" làm tròn về đúng máu cũ (vẫn gục); giữ max(1, máu × tỉ lệ này) để luôn còn máu.
 */
const MIN_SURVIVING_HP_RATIO = 1e-30

/**
 * Sát thương skill đủ hạ gục mục tiêu còn hơn 1 máu: trait trụ lại (surviveLethal) giữ mục tiêu ở 1
 * máu. Xét cách không giới hạn trước (kiểu Sturdy, cần đầy máu) để không phí lượt một lần mỗi
 * trận; tỉ lệ 100 không tốn RNG. Trả về sát thương sau khi giới hạn.
 */
export function survivableDamage(
  data: GameData,
  d: Draft,
  target: Monster,
  damage: Decimal
): Decimal {
  const current = getCurrentHp(data, target)
  if (damage.lt(current) || current.lte(1)) return damage
  const survivals = traitLethalSurvivals(data, target, { fullHp: target.damageTaken.lte(0) })
  survivals.sort((a, b) => Number(a.oncePerBattle) - Number(b.oncePerBattle))
  for (const { chance, oncePerBattle, traitId, source } of survivals) {
    if (oncePerBattle && hasUsedOnce(d, target.id, 'surviveLethal')) continue
    let survived: boolean
    ;[survived, d.rng] = rollPercent(d.rng, chance)
    if (!survived) continue
    if (oncePerBattle) markUsedOnce(d, target.id, 'surviveLethal')
    const logged = triggerLogSource(source)
    log(d, {
      type: 'traitTriggered',
      monsterId: target.id,
      traitId,
      ...(logged ? { source: logged } : {})
    })
    // Đồ cầm kiểu Focus Sash: dùng một lần.
    if (source === 'held') consumeHeldItem(data, d, target, traitId)
    return current.minus(maxBig(1, current.times(MIN_SURVIVING_HP_RATIO).floor()))
  }
  return damage
}

/**
 * Sau một lần dùng skill gây sát thương: quái dùng tự mất % max HP theo trait / trang bị (kiểu Life
 * Orb), tính như sát thương gián tiếp (Magic Guard miễn, boss hoang ½).
 */
export function applyRecoil(data: GameData, d: Draft, user: Monster): void {
  if (isFainted(data, user) || isIndirectDamageImmune(data, user)) return
  const recoil = traitRecoil(data, user, monsterBattleContext(data, d, user))
  if (recoil.percent <= 0) return
  logTraits(d, user.id, recoil.traitIds)
  loseHpToTrait(data, d, { victim: user, owner: user, percent: recoil.percent })
}

/**
 * Quái hạ gục một quái địch bằng skill: tăng số quái đã hạ trong lần ra sân này (trait
 * statModifierAfterKnockout), chạy trait stageOnKnockout, rồi hồi máu (healOnKnockout).
 */
export function recordKnockout(data: GameData, d: Draft, attacker: Monster): void {
  const volatile = d.battle.volatiles[attacker.id]
  if (volatile) volatile.knockouts = (volatile.knockouts ?? 0) + 1
  triggerStageTraits(data, d, attacker, 'knockout')
  const knockoutHeal = traitKnockoutHeal(data, attacker)
  if (knockoutHeal.percent <= 0 || isFainted(data, attacker)) return
  logTraits(d, attacker.id, knockoutHeal.traitIds)
  heal(data, d, attacker, percentOfMaxHp(getMaxHp(data, attacker), knockoutHeal.percent))
}

/** Trait của bên đánh: hút máu, hạ ngay, gây trạng thái lên mục tiêu (trừ khi núp thế thân). */
function attackerTraits(
  data: GameData,
  d: Draft,
  strike: Strike,
  { dealt, shielded }: { dealt: Decimal; shielded: boolean }
): void {
  const { user, target, skill } = strike
  // Như drain: sát thương vào thế thân cũng được hút.
  const lifesteal = traitLifesteal(data, user)
  if (lifesteal.percent > 0 && !isFainted(data, user)) {
    logTraits(d, user.id, lifesteal.traitIds)
    heal(data, d, user, dealt.times(lifesteal.percent).div(100), user)
  }
  if (shielded) return
  executeIfLow(data, d, strike)
  if (isFainted(data, target)) return
  const chances = traitAttackStatuses(data, user, skill.category)
  rollTraitStatuses(data, d, { owner: user, victim: target }, chances)
}

/**
 * Trait của bên bị đánh (chạy cả khi nó vừa gục, như Rough Skin / Static của Pokémon): phản đòn,
 * kẻ đánh dính trạng thái, phản đòn khi bị hạ gục.
 */
function defenderTraits(data: GameData, d: Draft, { user, target, skill }: Strike): void {
  // Kẻ đánh miễn sát thương gián tiếp (kiểu Magic Guard) thì không mất máu vì phản đòn.
  const canLoseHp = !isIndirectDamageImmune(data, user)
  const retaliation = traitRetaliation(data, target, skill.category)
  if (retaliation.percent > 0 && canLoseHp && !isFainted(data, user)) {
    logTraits(d, target.id, retaliation.traitIds)
    loseHpToTrait(data, d, { victim: user, owner: target, percent: retaliation.percent })
  }
  if (!isFainted(data, user)) {
    const chances = traitHitStatuses(data, target, skill.category)
    rollTraitStatuses(data, d, { owner: target, victim: user }, chances)
  }
  if (!isFainted(data, target)) return
  const onKnockout = traitKnockedOutRetaliation(data, target)
  if (onKnockout.percent > 0 && canLoseHp && !isFainted(data, user)) {
    logTraits(d, target.id, onKnockout.traitIds)
    loseHpToTrait(data, d, { victim: user, owner: target, percent: onKnockout.percent })
  }
}

/**
 * Chạy trait sau một đòn skill: chỉ khi đòn gây mất máu thật (> 0) lên quái phe địch. Thứ tự: trait
 * bên đánh → hạ gục → trait bên bị đánh (đánh vào thế thân thì bên bị đánh không phản ứng).
 */
export function triggerHitTraits(
  data: GameData,
  d: Draft,
  strike: Strike,
  result: { dealt: Decimal; shielded: boolean }
): void {
  const { user, target } = strike
  if (result.dealt.lte(0) || sideOf(d, user.id) === sideOf(d, target.id)) return
  attackerTraits(data, d, strike, result)
  if (result.shielded) return
  if (isFainted(data, target)) recordKnockout(data, d, user)
  defenderTraits(data, d, strike)
}
