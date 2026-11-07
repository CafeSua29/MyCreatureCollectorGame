// Hiệu lực sticker skill trong trận (docs/rules/skill-stickers.md): phần chạy theo lần dùng skill
// (nhắm cả phe, dùng lại, lan sát thương, hồi máu, dựng tường, hoàn thể lực). Phần nằm trong công
// thức (power, chí mạng, chỉ số công, chính xác) ở damage.ts / environment.ts.

import { percentOfMaxHp, getMaxHp, isFainted } from '../monster'
import { stickerSkillBonus } from '../registries'
import { rollPercent, type Decimal } from '../shared'
import type { GameData, Monster, Skill, StickerSkillBonus } from '../model'
import { Draft, aliveOnField, log, sideOf } from './draft'
import { heal, loseHp } from './hpChanges'
import { raiseWall } from './walls'
import { changeStamina, staminaCostOf } from './stamina'

/** Hiệu lực sticker của quái dùng lên skill này. */
export const stickerBonusOf = (data: GameData, user: Monster, skill: Skill): StickerSkillBonus =>
  stickerSkillBonus(data, user, skill.id)

/** Tung `chance` % bằng RNG của trận (0 / 100 không tốn RNG). */
function rollChance(d: Draft, chance: number): boolean {
  let hit: boolean
  ;[hit, d.rng] = rollPercent(d.rng, chance)
  return hit
}

/** Multitarget: skill nhắm một quái thành nhắm cả phe đó (đủ sát thương mỗi quái như gốc). */
export function stickerSpread(data: GameData, d: Draft, user: Monster, skill: Skill): Skill {
  const chance = stickerBonusOf(data, user, skill).multitargetChance
  if (chance <= 0) return skill
  if (skill.target !== 'enemy' && skill.target !== 'ally' && skill.target !== 'foesOrAlly') {
    return skill
  }
  if (!rollChance(d, chance)) return skill
  log(d, { type: 'stickerTriggered', monsterId: user.id, skillId: skill.id, effect: 'multitarget' })
  return {
    ...skill,
    target: skill.target === 'ally' ? 'allAllies' : 'allEnemies',
    fullSpread: true
  }
}

/** Use Again: thêm một lần dùng (100% hiệu quả) vào số lần lặp của trait. */
export function stickerRepeats(
  data: GameData,
  d: Draft,
  { user, skill }: { user: Monster; skill: Skill },
  repeats: { extra: number; percent: number }
): { extra: number; percent: number } {
  const chance = stickerBonusOf(data, user, skill).repeatChance
  if (chance <= 0 || !rollChance(d, chance)) return repeats
  log(d, { type: 'stickerTriggered', monsterId: user.id, skillId: skill.id, effect: 'repeat' })
  return { ...repeats, extra: repeats.extra + 1 }
}

/** Splash Damage: % sát thương đòn lan sang các đồng đội còn trên sân của mục tiêu phe địch. */
export function stickerSplash(
  data: GameData,
  d: Draft,
  { user, target, skill, dealt }: { user: Monster; target: Monster; skill: Skill; dealt: Decimal }
): void {
  const percent = stickerBonusOf(data, user, skill).splashPercent
  if (percent <= 0 || dealt.lte(0)) return
  const side = sideOf(d, target.id)
  if (side === sideOf(d, user.id)) return
  const amount = dealt.times(percent).div(100).ceil()
  for (const { monster } of aliveOnField(data, d, side)) {
    if (monster.id === target.id) continue
    loseHp(
      data,
      d,
      monster,
      amount,
      (lost) => ({ type: 'splashDamage', monsterId: monster.id, sourceId: user.id, amount: lost }),
      { kind: 'indirect', source: user, skill }
    )
  }
}

/** Sau khi dùng skill: Heal (hồi % max HP) và Buff User Wall (tường theo hệ skill). */
export function afterStickerUse(data: GameData, d: Draft, user: Monster, skill: Skill): void {
  if (isFainted(data, user)) return
  const bonus = stickerBonusOf(data, user, skill)
  if (bonus.healPercent > 0) {
    heal(data, d, user, percentOfMaxHp(getMaxHp(data, user), bonus.healPercent), user)
  }
  if (bonus.wallChance > 0 && rollChance(d, bonus.wallChance)) {
    const statusId = wallStatusFor(data, skill.elementId)
    if (statusId) raiseWall(data, d, { user, monsterId: user.id, statusId, skillId: null })
  }
}

/** Trạng thái tường thường (không đặc biệt) của hệ; null nếu hệ không có tường. */
function wallStatusFor(data: GameData, elementId: string): string | null {
  for (const status of Object.values(data.statuses)) {
    if (status.wall?.elementId === elementId && status.wall.special !== true) return status.id
  }
  return null
}

/** AP Refund: sau khi trả giá skill, tung từng mục hoàn `amount` thể lực hoặc toàn bộ giá. */
export function refundStickerStamina(data: GameData, d: Draft, user: Monster, skill: Skill): void {
  for (const refund of stickerBonusOf(data, user, skill).staminaRefunds) {
    if (refund.chance <= 0 || !rollChance(d, refund.chance)) continue
    const amount = refund.amount === 'all' ? staminaCostOf(data, d, user, skill) : refund.amount
    changeStamina(data, d, user, amount)
    log(d, { type: 'stickerTriggered', monsterId: user.id, skillId: skill.id, effect: 'refund' })
  }
}
