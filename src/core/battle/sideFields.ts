// Hiệu ứng theo phe trong trận (mục "Môi trường" ở battle-environment.md): đặt / cộng tầng / làm mới
// (setSideField), dọn / đổi phe (Defog, Court Change), bẫy khi quái vào sân giữa trận, giảm thời
// hạn cuối lượt. Hệ số chỉ số, màn chắn,
// chặn trạng thái / hạ bậc tra qua registries/fieldQueries.ts.

import { getMaxHp, isFainted } from '../monster'
import {
  FIELD_HOOKS,
  fieldMonsterContext,
  isEntryHazard,
  isGlobalFieldActive,
  isIndirectDamageImmune,
  type FieldEntryEffect,
  type SideFieldClear
} from '../registries'
import { maxBig } from '../shared'
import type { BattleSide, GameData, Monster, SideFieldPlacement } from '../model'
import { elementEffectiveness } from './damage'
import { Draft, heldFieldTurns, log, opponentOf, sideOf } from './draft'
import { loseHp } from './hpChanges'
import { applyStageChange } from './stageChanges'
import { hazardDamageFactor, inflictStatus } from './statuses'

/** Thời hạn dài hơn; null (cả trận) là dài nhất. */
export const longerTurns = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : Math.max(a, b)

/**
 * Đặt hiệu ứng theo phe (setSideField) do quái `user` dùng: chưa có thì thêm (1 tầng); đã có thì
 * cộng tầng (nếu còn cộng được) và làm mới thời hạn, lấy thời hạn dài hơn. Đủ tầng hoặc thiếu môi
 * trường yêu cầu thì không đặt được.
 */
export function placeSideField(
  data: GameData,
  d: Draft,
  placement: SideFieldPlacement,
  user: Monster
): void {
  const { fieldId, turns, requiresFieldId } = placement
  const userSide = sideOf(d, user.id)
  const side = placement.side === 'own' ? userSide : opponentOf(userSide)
  const fail = (reason: 'maxLayers' | 'requiresField'): void =>
    log(d, { type: 'sideFieldFailed', side, fieldId, monsterId: user.id, reason })

  if (
    requiresFieldId !== undefined &&
    !isGlobalFieldActive(data, d.battle.field, requiresFieldId)
  ) {
    return fail('requiresField')
  }
  const effect = data.fieldEffects[fieldId]
  // Bỏ trống turns và duration = cả trận (bẫy).
  const placedTurns =
    turns ?? heldFieldTurns(data, d, { monsterId: user.id, fieldId }) ?? effect.duration ?? null
  const list = d.battle.field.sides[side]
  const index = list.findIndex((entry) => entry.id === fieldId)
  if (index < 0) {
    list.push({ id: fieldId, turnsLeft: placedTurns, layers: 1 })
  } else {
    const current = list[index]
    const maxLayers = effect.maxLayers ?? 1
    if (maxLayers > 1 && current.layers >= maxLayers) return fail('maxLayers')
    list[index] = {
      id: fieldId,
      turnsLeft: longerTurns(current.turnsLeft, placedTurns),
      layers: Math.min(maxLayers, current.layers + 1)
    }
  }
  const placed = list[index < 0 ? list.length - 1 : index]
  log(d, {
    type: 'sideFieldSet',
    side,
    fieldId,
    layers: placed.layers,
    turnsLeft: placed.turnsLeft,
    monsterId: user.id
  })
}

/** Áp một tác động bẫy lên quái vừa vào sân. Trả về true nếu quái hút mất bẫy. */
function applyEntryEffect(
  data: GameData,
  d: Draft,
  { side, monster, fieldId }: { side: BattleSide; monster: Monster; fieldId: string },
  effect: FieldEntryEffect
): boolean {
  switch (effect.kind) {
    case 'damage': {
      const effectiveness =
        effect.elementId === undefined
          ? 1
          : elementEffectiveness(data, effect.elementId, monster.elementIds)
      if (effectiveness === 0 || isIndirectDamageImmune(data, monster)) return false
      const amount = maxBig(
        1,
        getMaxHp(data, monster)
          .times(effect.percent)
          .times(effectiveness)
          .times(hazardDamageFactor(data, d, side))
          .div(100)
          .ceil()
      )
      loseHp(
        data,
        d,
        monster,
        amount,
        (dealt) => ({
          type: 'fieldDamage',
          monsterId: monster.id,
          fieldId,
          amount: dealt
        }),
        { kind: 'indirect' }
      )
      return false
    }
    case 'status':
      inflictStatus(data, d, monster, effect.statusId)
      return false
    case 'stage':
      applyStageChange(data, d, {
        targetId: monster.id,
        stat: effect.stat,
        delta: effect.delta,
        cause: 'hazard'
      })
      return false
    case 'absorb':
      return true
  }
}

/**
 * Bẫy của phe lên quái vừa vào sân giữa trận (đổi quái, rút về, thay quái gục; không chạy lúc mở
 * trận), theo thứ tự đặt rồi thứ tự hook. Gục thì dừng. Quái hút bẫy thì bẫy mất khỏi phe.
 */
export function applyEntryHazards(data: GameData, d: Draft, monster: Monster): void {
  const side = sideOf(d, monster.id)
  const ctx = fieldMonsterContext(data, monster, d.battle.field)
  for (const active of [...d.battle.field.sides[side]]) {
    let absorbed = false
    for (const hook of data.fieldEffects[active.id].hooks) {
      if (isFainted(data, monster) || absorbed) break
      const effect = FIELD_HOOKS[hook.type].entryEffect?.(hook.params, {
        ...ctx,
        layers: active.layers
      })
      if (!effect) continue
      absorbed = applyEntryEffect(data, d, { side, monster, fieldId: active.id }, effect)
    }
    if (absorbed) {
      d.battle.field.sides[side] = d.battle.field.sides[side].filter((e) => e.id !== active.id)
      log(d, { type: 'sideFieldAbsorbed', side, fieldId: active.id, monsterId: monster.id })
    }
    if (isFainted(data, monster)) return
  }
}

/** Dọn hiệu ứng theo phe (skill kiểu Defog, Rapid Spin): phe tính từ quái dùng skill. */
export function removeSideFields(
  data: GameData,
  d: Draft,
  { side, hazardsOnly }: SideFieldClear,
  user: Monster
): void {
  const userSide = sideOf(d, user.id)
  const placedSide = side === 'own' ? userSide : opponentOf(userSide)
  d.battle.field.sides[placedSide] = d.battle.field.sides[placedSide].filter((entry) => {
    if (hazardsOnly && !isEntryHazard(data, entry.id)) return true
    log(d, { type: 'sideFieldRemoved', side: placedSide, fieldId: entry.id, monsterId: user.id })
    return false
  })
}

/**
 * Phá màn chắn (hiệu ứng theo phe có hook giảm sát thương nhận: Reflect, Light Screen, Aurora Veil)
 * của phe mục tiêu (Brick Break, Psychic Fangs, Raging Bull).
 */
export function breakScreens(
  data: GameData,
  d: Draft,
  { user, target }: { user: Monster; target: Monster }
): void {
  clearScreens(data, d, sideOf(d, target.id), user)
}

/** Bỏ mọi màn chắn của phe `side` (Brick Break; Screen Cleaner cho cả hai phe). */
export function clearScreens(data: GameData, d: Draft, side: BattleSide, user: Monster): void {
  d.battle.field.sides[side] = d.battle.field.sides[side].filter((entry) => {
    const isScreen = data.fieldEffects[entry.id].hooks.some(
      (hook) => FIELD_HOOKS[hook.type].damageTakenMultiplier !== undefined
    )
    if (!isScreen) return true
    log(d, { type: 'sideFieldRemoved', side, fieldId: entry.id, monsterId: user.id })
    return false
  })
}

/** Đổi hiệu ứng theo phe của hai phe (skill kiểu Court Change), giữ tầng và thời hạn. */
export function swapSideFields(d: Draft, user: Monster): void {
  const { sides } = d.battle.field
  d.battle.field.sides = { player: sides.enemy, enemy: sides.player }
  log(d, { type: 'sideFieldsSwapped', monsterId: user.id })
}

/** Giảm thời hạn hiệu ứng theo phe (trừ loại cả trận); về 0 thì mất, log sideFieldEnded. */
export function tickSideFields(d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    d.battle.field.sides[side] = d.battle.field.sides[side].flatMap((active) => {
      if (active.turnsLeft === null) return [active]
      if (active.turnsLeft > 1) return [{ ...active, turnsLeft: active.turnsLeft - 1 }]
      log(d, { type: 'sideFieldEnded', side, fieldId: active.id })
      return []
    })
  }
}
