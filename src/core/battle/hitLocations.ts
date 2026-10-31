// Vị trí ra đòn (docs/rules/hit-locations.md): lệnh skill nhắm một bộ phận của địch (`aim`): accuracy /
// sát thương / bậc chí mạng đổi theo bộ phận, trúng điểm yếu thì sát thương và tỉ lệ hiệu ứng tăng,
// sát thương dồn vào bộ phận đủ ngưỡng thì phá bộ phận (hiệu ứng phá, đồ rơi tăng), hạ gục bằng đòn
// vào đầu thì yêu đan dễ vỡ. Đòn nhắm trúng ghi bộ phận vào Dex (khám phá điểm yếu); trúng điểm yếu
// làm mục tiêu mất thế, nhắm mà trượt / bị kháng hệ thì quái dùng mất thế. AI chọn bộ phận theo hệ số
// kỳ vọng (chooseAim), phe người chơi chỉ biết điểm yếu đã khám phá.

import { getMaxHp, isFainted } from '../monster'
import { BIG_ZERO, type Decimal } from '../shared'
import { dexBodySpeciesId, monsterBodyPlan } from '../registries'
import {
  isBattleOnlyMove,
  type BattleRecord,
  type BodyPartDef,
  type GameData,
  type Monster,
  type OffBalanceCause,
  type Skill
} from '../model'
import { Draft, log, recordOf, sideOf } from './draft'
import { runSkillEffects } from './skillResults'

/** Bộ phận đang bị nhắm của một mục tiêu, có phải điểm yếu của nó không. */
export interface AimedPart {
  part: BodyPartDef
  weak: boolean
}

/** Skill nhắm bộ phận được: gây sát thương, nhắm một địch. */
export const canAim = (skill: Skill): boolean => skill.power > 0 && skill.target === 'enemy'

/**
 * Bộ phận được nhắm trên mục tiêu: null nếu lệnh không nhắm, skill không nhắm được hoặc mục tiêu
 * (kể cả mục tiêu đổi giữa lượt) không có bộ phận đó.
 */
export function aimedPartOn(
  data: GameData,
  { skill, target, aim }: { skill: Skill; target: Monster; aim?: string }
): AimedPart | null {
  if (aim === undefined || !canAim(skill)) return null
  const plan = monsterBodyPlan(data, target)
  if (!plan.parts.includes(aim)) return null
  return { part: data.bodyParts[aim], weak: plan.weakPoints.includes(aim) }
}

/**
 * Hệ số accuracy khi nhắm (× (100 + accuracyPercent) / 100). Skill luôn trúng (alwaysHits, chiêu
 * Max / Z-Move) không bị trừ: đòn tự tìm mục tiêu nên nhắm chính xác.
 */
export function aimAccuracyFactor(skill: Skill, aimed: AimedPart | null): number {
  if (!aimed || skill.alwaysHits || isBattleOnlyMove(skill)) return 1
  return Math.max(0, 100 + aimed.part.accuracyPercent) / 100
}

/** Hệ số sát thương khi nhắm: bộ phận, rồi điểm yếu (+ weakPointDamagePercent). */
export function aimDamageFactor(data: GameData, aimed: AimedPart | null): number {
  if (!aimed) return 1
  const part = Math.max(0, 100 + aimed.part.damagePercent) / 100
  const weak = aimed.weak ? (100 + data.config.hitLocations.weakPointDamagePercent) / 100 : 1
  return part * Math.max(0, weak)
}

/** Hệ số tỉ lệ hiệu ứng khi trúng bộ phận (điểm yếu × weakPointChanceMultiplier). */
export const aimChanceMultiplier = (data: GameData, aimed: AimedPart): number =>
  aimed.weak ? data.config.hitLocations.weakPointChanceMultiplier : 1

/** % ngưỡng phá mà một đòn vào bộ phận tính được (điểm yếu × weakPointBreakMultiplier). */
const breakMultiplier = (data: GameData, aimed: AimedPart): number =>
  aimed.weak ? data.config.hitLocations.weakPointBreakMultiplier : 1

/** Skill ra chiêu bằng bộ phận đã bị phá của quái dùng (hit-locations.md mục "Phá bộ phận"). */
export function usesBrokenPart(d: Draft, user: Monster, skill: Skill): boolean {
  if (skill.bodyPart === undefined) return false
  return (d.battle.records[user.id]?.brokenParts ?? []).includes(skill.bodyPart)
}

/**
 * Sau mỗi đòn nhắm trúng quái (không phải thế thân): dồn % max HP vào bộ phận, đủ ngưỡng thì phá
 * (một lần mỗi trận: log `partBroken`, hiệu ứng phá lên quái còn sống); quái gục thì nhớ bộ phận hạ
 * gục. Đòn không nhắm hạ gục thì xóa bộ phận hạ gục cũ.
 */
export function recordPartHit(
  data: GameData,
  d: Draft,
  {
    user,
    target,
    skill,
    aimed,
    dealt
  }: { user: Monster; target: Monster; skill: Skill; aimed: AimedPart | null; dealt: Decimal }
): void {
  const record = recordOf(d, target.id)
  if (!aimed) {
    if (isFainted(data, target)) delete record.knockoutPart
    return
  }
  if (isFainted(data, target)) record.knockoutPart = aimed.part.id
  if (dealt.lte(0)) return
  const { id, breakPercent } = aimed.part
  const multiplier = breakMultiplier(data, aimed)
  // Tỉ lệ theo max HP nên là số nhỏ dù chỉ số lớn cỡ nào (quy tắc 12).
  const percent = dealt
    .div(getMaxHp(data, target))
    .times(100 * multiplier)
    .toNumber()
  const total = (record.partDamagePercent?.[id] ?? 0) + percent
  record.partDamagePercent = { ...record.partDamagePercent, [id]: total }
  const broken = record.brokenParts ?? []
  if (breakPercent === undefined || total < breakPercent || broken.includes(id)) return
  record.brokenParts = [...broken, id]
  log(d, { type: 'partBroken', monsterId: target.id, partId: id })
  if (isFainted(data, target)) return
  runSkillEffects(
    data,
    d,
    { user, target, damageDealt: BIG_ZERO, skillId: skill.id, shielded: false },
    aimed.part.breakEffects
  )
}

/**
 * Đòn nhắm trúng bộ phận: lần đầu trúng bộ phận này của loài thì ghi vào Dex (người chơi biết nó có
 * phải điểm yếu không, như Persona ghi điểm yếu khi đánh trúng) và log `partRevealed`. Mọi đòn trong
 * trận của người chơi đều tính (người chơi chứng kiến cả đòn địch đánh vào quái của mình).
 */
export function revealPart(data: GameData, d: Draft, target: Monster, aimed: AimedPart): void {
  const speciesId = dexBodySpeciesId(data, target)
  if (speciesId === null) return
  const known = d.dex.hitParts[speciesId] ?? []
  if (known.includes(aimed.part.id)) return
  d.dex.hitParts = { ...d.dex.hitParts, [speciesId]: [...known, aimed.part.id] }
  log(d, { type: 'partRevealed', speciesId, partId: aimed.part.id, weakPoint: aimed.weak })
}

/** Quái đang mất thế (còn trong lượt). */
const isOffBalance = (d: Draft, monster: Monster): boolean =>
  (d.battle.volatiles[monster.id]?.offBalanceUntilTurn ?? 0) >= d.battle.turn

/** Bậc chí mạng cộng thêm cho đòn đánh vào `target` (đang mất thế: offBalanceCritStage). */
export const offBalanceCritStage = (data: GameData, d: Draft, target: Monster): number =>
  isOffBalance(d, target) ? data.config.hitLocations.offBalanceCritStage : 0

/**
 * Quái mất thế tới hết lượt hiện tại + offBalanceTurns (không cộng dồn, kéo dài nếu đang mất thế).
 * Thay "thêm / mất lượt" của Press Turn (SMT) bằng sơ hở thực tế: bị đánh trúng điểm yếu thì lảo đảo,
 * dồn sức đánh một chỗ mà hụt / bị dội lại thì lộ sơ hở. Quái đã gục, rời sân thì thôi.
 */
export function markOffBalance(
  data: GameData,
  d: Draft,
  { monster, cause }: { monster: Monster; cause: OffBalanceCause }
): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile || isFainted(data, monster)) return
  const untilTurn = d.battle.turn + data.config.hitLocations.offBalanceTurns
  volatile.offBalanceUntilTurn = Math.max(volatile.offBalanceUntilTurn ?? 0, untilTurn)
  log(d, { type: 'offBalance', monsterId: monster.id, untilTurn, cause })
}

/**
 * Sau một đòn nhắm đã trúng: trúng điểm yếu (có sát thương) thì mục tiêu mất thế; bị kháng hệ (hiệu
 * quả < 1, kể cả miễn nhiễm) thì quái dùng mất thế. Đòn vào quái cùng phe không tính.
 */
export function afterAimedStrike(
  data: GameData,
  d: Draft,
  {
    user,
    target,
    aimed,
    dealt,
    resisted
  }: { user: Monster; target: Monster; aimed: AimedPart; dealt: Decimal; resisted: boolean }
): void {
  if (sideOf(d, user.id) === sideOf(d, target.id)) return
  if (aimed.weak && dealt.gt(0)) markOffBalance(data, d, { monster: target, cause: 'weakPoint' })
  if (resisted) markOffBalance(data, d, { monster: user, cause: 'resisted' })
}

/** Đồ rơi của quái bị hạ × (1 + tổng breakDropPercent của bộ phận đã bị phá / 100). */
export function brokenPartDropMultiplier(data: GameData, record: BattleRecord | undefined): number {
  const bonus = (record?.brokenParts ?? []).reduce(
    (sum, id) => sum + (data.bodyParts[id]?.breakDropPercent ?? 0),
    0
  )
  return 1 + bonus / 100
}

/** Tỉ lệ rơi yêu đan × (1 + knockoutCorePercent / 100) của bộ phận trúng đòn hạ gục (đầu: vỡ đan). */
export function knockoutCoreMultiplier(data: GameData, record: BattleRecord | undefined): number {
  const partId = record?.knockoutPart
  const percent = partId === undefined ? 0 : (data.bodyParts[partId]?.knockoutCorePercent ?? 0)
  return Math.max(0, 1 + percent / 100)
}

/** Lựa chọn bộ phận của AI: id (undefined = không nhắm) và hệ số accuracy / sát thương. */
export interface AimChoice {
  aim?: string
  accuracyFactor: number
  damageFactor: number
}

/**
 * AI chọn bộ phận (không tốn RNG), chấm như phần sát thương của AI (mục "AI trận đấu" ở battle.md):
 * accuracy × (phần máu còn lại mất đi, tối đa 1, + koBonus nếu đủ hạ gục). Sát thương thừa không có
 * giá trị nên đòn thường đã đủ hạ gục thì không đổi accuracy lấy sát thương. Chỉ nhắm khi hơn hẳn
 * không nhắm. `keepCore`: phe muốn giữ đồ rơi (người chơi) không nhắm bộ phận làm vỡ yêu đan bằng đòn
 * dự kiến hạ gục. `revealed`: bộ phận phe này đã biết có phải điểm yếu không (null = biết hết:
 * ngự thú sư NPC); bộ phận chưa biết chấm theo kỳ vọng, coi là điểm yếu với tỉ lệ aiUnknownWeakPercent.
 */
export function chooseAim(
  data: GameData,
  {
    skill,
    target,
    damage,
    remaining,
    keepCore,
    revealed
  }: {
    skill: Skill
    target: Monster
    damage: Decimal
    remaining: Decimal
    keepCore: boolean
    revealed: readonly string[] | null
  }
): AimChoice {
  const value = (accuracyFactor: number, damageFactor: number): number => {
    const dealt = damage.times(damageFactor)
    const lethal = dealt.gte(remaining)
    const share = lethal ? 1 : dealt.div(remaining).toNumber()
    return accuracyFactor * (share + (lethal ? data.config.ai.koBonus : 0))
  }
  let best: AimChoice = { accuracyFactor: 1, damageFactor: 1 }
  if (!canAim(skill) || remaining.lte(0)) return best
  let bestValue = value(1, 1)
  const weakChance = data.config.hitLocations.aiUnknownWeakPercent / 100
  for (const id of monsterBodyPlan(data, target).parts) {
    const aimed = aimedPartOn(data, { skill, target, aim: id })
    if (!aimed) continue
    const accuracyFactor = aimAccuracyFactor(skill, aimed)
    const known = revealed === null || revealed.includes(id)
    // Phương án (hệ số sát thương, xác suất): biết thì một phương án, chưa biết thì thường / điểm yếu.
    const outcomes: [number, number][] = known
      ? [[aimDamageFactor(data, aimed), 1]]
      : [
          [aimDamageFactor(data, { ...aimed, weak: false }), 1 - weakChance],
          [aimDamageFactor(data, { ...aimed, weak: true }), weakChance]
        ]
    const breaksCore =
      keepCore &&
      aimed.part.knockoutCorePercent < 0 &&
      outcomes.some(([factor, chance]) => chance > 0 && damage.times(factor).gte(remaining))
    if (breaksCore) continue
    const choiceValue = outcomes.reduce(
      (sum, [factor, chance]) => sum + chance * value(accuracyFactor, factor),
      0
    )
    if (choiceValue > bestValue) {
      const damageFactor = outcomes.reduce((sum, [factor, chance]) => sum + chance * factor, 0)
      best = { aim: id, accuracyFactor, damageFactor }
      bestValue = choiceValue
    }
  }
  return best
}
