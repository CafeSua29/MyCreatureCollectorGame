// Chạy hiệu ứng skill (registry SKILL_EFFECTS) lên một mục tiêu rồi áp kết quả vào trận: bậc trận,
// hồi máu, trạng thái, môi trường, trạng thái tạm (Perish Song, thế thân, lượt chờ hold), rút về. Dùng cho skill
// (executeSkill.ts) và vật phẩm ném (battleItems.ts).

import { SKILL_EFFECTS, hasAbilityFlag, type SkillEffectResult } from '../registries'
import type { Decimal } from '../shared'
import type { EffectDef, GameData, Monster } from '../model'
import {
  Draft,
  aliveOnField,
  findMonster,
  log,
  monsterBattleContext,
  opponentOf,
  reservesOnSide,
  sideOf,
  effectiveField
} from './draft'
import { heal, loseHp } from './hpChanges'
import { clearGlobalField, placeField } from './environment'
import { placeRoom } from './rooms'
import { placeSideField, removeSideFields, swapSideFields } from './sideFields'
import { applyStageChange, stageCause } from './stageChanges'
import { cureAllStatuses, inflictStatus } from './statuses'
import { createSubstitute, raiseProtect, reduceHold, startPerish } from './volatiles'
import { eatHeldItems } from './heldItems'
import { forceSwitchOut } from './forceSwitch'

/** Xóa mọi bậc trận của quái (kiểu Haze); quái chưa đổi bậc nào thì không log. */
function resetStages(d: Draft, monsterId: string): void {
  if (d.battle.stages[monsterId] === undefined) return
  delete d.battle.stages[monsterId]
  log(d, { type: 'stagesReset', monsterId })
}

/** Quái còn sống trên sân của cả hai phe và mọi quái còn sống của phe `user` (kể cả dự bị). */
function effectScope(
  data: GameData,
  d: Draft,
  user: Monster
): { onField: Monster[]; team: Monster[] } {
  const side = sideOf(d, user.id)
  const allies = aliveOnField(data, d, side).map((entry) => entry.monster)
  const foes = aliveOnField(data, d, opponentOf(side)).map((entry) => entry.monster)
  return { onField: [...allies, ...foes], team: [...allies, ...reservesOnSide(data, d, side)] }
}

/** Áp thay đổi lên quái (bậc, hồi máu, trạng thái, chữa, Perish Song). */
function applyMonsterChanges(
  data: GameData,
  d: Draft,
  { user, statusTurnsBonus }: Pick<EffectRun, 'user' | 'statusTurnsBonus'>,
  result: SkillEffectResult
): void {
  for (const { monsterId, stat, delta } of result.stageChanges) {
    const cause = stageCause(d, user.id, monsterId)
    applyStageChange(data, d, { targetId: monsterId, stat, delta, cause, sourceId: user.id })
  }
  for (const { monsterId, amount, drainedFrom } of result.heals) {
    const receiver = findMonster(d, monsterId)
    // Liquid Ooze: hút máu của quái mang thì mất máu thay vì hồi.
    const source = drainedFrom ? findMonster(d, drainedFrom) : undefined
    if (
      source &&
      hasAbilityFlag(data, source, 'drainHurts', monsterBattleContext(data, d, source))
    ) {
      loseHp(data, d, receiver, amount.ceil(), (dealt) => ({
        type: 'traitDamage',
        monsterId: receiver.id,
        amount: dealt
      }))
      continue
    }
    heal(data, d, receiver, amount, user)
  }
  for (const { monsterId, statusId, turns } of result.statusChanges) {
    inflictStatus(data, d, findMonster(d, monsterId), statusId, {
      source: user,
      ...(turns ? { turns } : {}),
      turnsBonus: statusTurnsBonus
    })
  }
  for (const monsterId of result.statusCures) cureAllStatuses(data, d, findMonster(d, monsterId))
  for (const monsterId of result.stageResets) resetStages(d, monsterId)
  for (const { monsterId, turns } of result.perishStarts) startPerish(data, d, monsterId, turns)
  for (const monsterId of result.forceSwitches) forceSwitchOut(data, d, monsterId)
  for (const { monsterId, turns } of result.holdReductions) {
    reduceHold(data, d, findMonster(d, monsterId), turns)
  }
  for (const { monsterId, tags } of result.heldItemEats) {
    eatHeldItems(data, d, findMonster(d, monsterId), tags)
  }
}

/** Áp thay đổi môi trường (đặt, dọn, đổi phe). */
function applyFieldChanges(
  data: GameData,
  d: Draft,
  user: Monster,
  result: SkillEffectResult
): void {
  for (const placement of result.fieldChanges) {
    placeField(data, d, placement, { source: 'skill', monsterId: user.id })
  }
  for (const placement of result.sideFieldChanges) placeSideField(data, d, placement, user)
  for (const placement of result.roomChanges) placeRoom(data, d, placement, user)
  for (const layer of result.fieldClears) clearGlobalField(data, d, layer, user)
  for (const clear of result.sideFieldClears) removeSideFields(data, d, clear, user)
  if (result.swapSideFields) swapSideFields(d, user)
}

/** Một lần chạy hiệu ứng lên một mục tiêu. */
export interface EffectRun {
  user: Monster
  target: Monster
  damageDealt: Decimal
  /** Skill đang dùng (log skill không có tác dụng); null với vật phẩm ném. */
  skillId: string | null
  /** Mục tiêu núp sau thế thân: bỏ đổi bậc / trạng thái gây lên mục tiêu. */
  shielded: boolean
  /** Hệ số tỉ lệ hiệu ứng phụ (trait kiểu Serene Grace); bỏ trống = 1 (vật phẩm ném). */
  chanceMultiplier?: number
  /** Số lượt cộng thêm cho trạng thái gây ra (thế mạnh, docs/rules/move-styles.md); bỏ trống = 0. */
  statusTurnsBonus?: number
}

/** Bỏ thay đổi gây lên mục tiêu đang núp sau thế thân (như Pokémon: thế thân chặn hiệu ứng). */
const withoutShielded = (result: SkillEffectResult, targetId: string): SkillEffectResult => ({
  ...result,
  stageChanges: result.stageChanges.filter((change) => change.monsterId !== targetId),
  statusChanges: result.statusChanges.filter((change) => change.monsterId !== targetId)
})

/**
 * Chạy các hiệu ứng lên một mục tiêu rồi áp kết quả vào trận. Trả về yêu cầu rút về của quái dùng
 * (chỉ skill xử lý; kiểm tra dữ liệu chặn hiệu ứng này trên vật phẩm ném), null nếu không có.
 */
export function runSkillEffects(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effects: readonly EffectDef[]
): SkillEffectResult['switchOut'] {
  const { user, target, damageDealt } = run
  let switchOut: SkillEffectResult['switchOut'] = null
  for (const effect of effects) {
    const applied = SKILL_EFFECTS[effect.type].apply(effect.params, {
      data,
      user,
      target,
      damageDealt,
      rng: d.rng,
      field: effectiveField(data, d),
      chanceMultiplier: run.chanceMultiplier,
      ...effectScope(data, d, user)
    })
    d.rng = applied.rng
    const result = run.shielded ? withoutShielded(applied, target.id) : applied
    applyMonsterChanges(data, d, run, result)
    applyFieldChanges(data, d, user, result)
    if (result.substitute && run.skillId !== null) {
      createSubstitute(data, d, { user, ...result.substitute, skillId: run.skillId })
    }
    if (result.protect && run.skillId !== null) {
      raiseProtect(d, { user, ...result.protect, skillId: run.skillId })
    }
    switchOut ??= result.switchOut
  }
  return switchOut
}
