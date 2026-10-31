// Trait lượt và hành động khi quái tới lượt dùng skill (mục "Trait lượt và hành động" ở
// battle.md): mất lượt xen kẽ (kiểu Truant) hoặc theo tỉ lệ, dùng skill ngẫu nhiên thay lệnh đã
// chọn, đi trước theo tỉ lệ (Quick Claw). Thứ tự hành động (priority theo trait, Stall) ở
// orderActions (turn.ts).

import { pick, rollPercent } from '../shared'
import { getCurrentHp, getMaxHp } from '../monster'
import {
  alternateSkipTraitId,
  traitActFirstChances,
  traitRandomSkillChances,
  traitSkipTurnChances,
  triggerLogSource,
  type TraitChance
} from '../registries'
import type { BattleSide, GameData, Monster, MoveStyle } from '../model'
import { battleSkillIds } from '../model'
import { Draft, aliveOnField, log, monsterBattleContext, opponentOf } from './draft'
import { consumeHeldItem } from './heldItems'

/** Lệnh skill sẽ thực hiện (sau khi trait có thể đổi skill / mục tiêu). */
export interface SkillChoice {
  skillId: string
  targetSlot?: number
  switchTo?: string
  /** Thế của lệnh; skill ngẫu nhiên do trait thì bỏ (docs/rules/move-styles.md). */
  style?: MoveStyle
}

/** Tung lần lượt các tỉ lệ; trait đầu tiên trúng thì dừng (không tung tiếp). */
function firstTriggered(d: Draft, chances: readonly TraitChance[]): string | null {
  for (const { chance, traitId } of chances) {
    let triggered: boolean
    ;[triggered, d.rng] = rollPercent(d.rng, chance)
    if (triggered) return traitId
  }
  return null
}

/**
 * Mất lượt dùng skill vì trait: lượt xen kẽ kể từ lượt đầu trên sân (Truant: lượt 1 đánh, lượt 2
 * nghỉ...; tính theo firstTurn nên vào sân lại thì đếm lại, không tốn RNG), rồi tung tỉ lệ
 * skipTurnChance. Log traitSkipTurn; trả về true nếu mất lượt.
 */
export function traitSkipsTurn(data: GameData, d: Draft, monster: Monster): boolean {
  const firstTurn = d.battle.volatiles[monster.id]?.firstTurn
  const loafing = firstTurn !== undefined && (d.battle.turn - firstTurn) % 2 === 1
  const traitId =
    (loafing ? alternateSkipTraitId(data, monster) : null) ??
    firstTriggered(d, traitSkipTurnChances(data, monster))
  if (traitId === null) return false
  log(d, { type: 'traitSkipTurn', monsterId: monster.id, traitId })
  return true
}

/**
 * Trait dùng skill ngẫu nhiên (randomSkillChance): trúng thì chọn đều trong mọi skill của quái
 * (kể cả skill đã chọn), mục tiêu một địch chọn đều trong địch còn sống trên sân, skill rút về
 * vào quái dự bị đầu tiên. Không trúng thì giữ lệnh. Log traitRandomSkill.
 */
export function chooseSkillWithTraits(
  data: GameData,
  d: Draft,
  { side, user, choice }: { side: BattleSide; user: Monster; choice: SkillChoice }
): SkillChoice {
  const traitId = firstTriggered(d, traitRandomSkillChances(data, user))
  if (traitId === null) return choice
  let skillId: string
  ;[skillId, d.rng] = pick(d.rng, battleSkillIds(user))
  log(d, { type: 'traitRandomSkill', monsterId: user.id, traitId, skillId })
  const opponents = aliveOnField(data, d, opponentOf(side))
  if (data.skills[skillId].target !== 'enemy' || opponents.length === 0) return { skillId }
  let target: (typeof opponents)[number]
  ;[target, d.rng] = pick(d.rng, opponents)
  return { skillId, targetSlot: target.slot }
}

/**
 * Quái đi trước mọi quái cùng mức priority lượt này không (hook actFirstChance, kiểu Quick Claw):
 * tung lần lượt các tỉ lệ, nguồn đầu tiên trúng thì ghi log traitTriggered.
 */
export function rollActsFirst(data: GameData, d: Draft, monster: Monster): boolean {
  const hpRatio = getCurrentHp(data, monster).div(getMaxHp(data, monster)).toNumber()
  const ctx = monsterBattleContext(data, d, monster)
  for (const { chance, traitId, source } of traitActFirstChances(data, monster, { hpRatio, ctx })) {
    let triggered: boolean
    ;[triggered, d.rng] = rollPercent(d.rng, chance)
    if (!triggered) continue
    const logged = triggerLogSource(source)
    log(d, {
      type: 'traitTriggered',
      monsterId: monster.id,
      traitId,
      ...(logged ? { source: logged } : {})
    })
    // Đồ cầm kiểu Custap Berry: dùng một lần.
    if (source === 'held') consumeHeldItem(data, d, monster, traitId)
    return true
  }
  return false
}
