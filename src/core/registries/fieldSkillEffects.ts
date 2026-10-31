// Hiệu ứng skill đặt / dọn môi trường (mục "Môi trường" ở battle-environment.md): setField (thời tiết / địa
// hình), setSideField (hiệu ứng theo phe), setRoom (hiệu ứng toàn sân đặc biệt), clearField,
// clearSideFields (kiểu Defog), swapSideFields (kiểu Court Change). Gộp vào registry SKILL_EFFECTS
// ở skillEffects.ts.

import { asObject } from '../shared'
import type {
  BattleField,
  BattleSide,
  FieldPlacement,
  GameData,
  GlobalFieldLayer,
  Monster,
  RoomPlacement,
  SideFieldPlacement,
  SideFieldTarget
} from '../model'
import { fieldBenefit, isEntryHazard, isGlobalFieldActive, sideFieldBenefit } from './fieldQueries'
import {
  checkSetFieldParams,
  checkSetRoomParams,
  checkSetSideFieldParams,
  isGlobalFieldLayer
} from './paramChecks'
import { roomBenefit, roomReuse } from './roomQueries'
import { noChanges, otherSide, type SkillEffectHandler } from './skillEffectTypes'
import { validateEmptyParams } from './traitHookUtils'

// ---------- setField: đặt thời tiết / địa hình (kiểu Rain Dance) ----------

/** Tổng điểm lợi của một phe khi môi trường fieldId có mặt. */
const sideBenefit = (data: GameData, monsters: readonly Monster[], fieldId: string): number =>
  monsters.reduce((sum, monster) => sum + fieldBenefit(data, monster, fieldId), 0)

const setField: SkillEffectHandler = {
  // Một lần cho cả chiêu, không phụ thuộc số mục tiêu.
  timing: 'perSkill',
  validateParams(params, data) {
    const obj = asObject(params)
    return obj ? checkSetFieldParams(data, obj) : ['params phải là object']
  },
  apply(params, { rng }) {
    return { ...noChanges(rng), fieldChanges: [params as FieldPlacement] }
  },
  aiValue(params, { data, field, allies, foes }) {
    const { layer, fieldId } = params as FieldPlacement
    const current = field[layer]
    // Thời tiết nguyên thủy đang có: môi trường thường không thay được.
    if (data.fieldEffects[current.id].primal && !data.fieldEffects[fieldId].primal) return 0
    // Môi trường đó đang có và còn ít nhất 2 lượt (hoặc cả trận): đặt lại gần như vô ích.
    if (current.id === fieldId && (current.turnsLeft === null || current.turnsLeft >= 2)) return 0
    const advantage = sideBenefit(data, allies, fieldId) - sideBenefit(data, foes, fieldId)
    return data.config.ai.fieldWeight * advantage
  }
}

// ---------- setSideField: đặt hiệu ứng theo phe (kiểu Reflect, Tailwind, Spikes) ----------

/** Đặt lại gần như vô ích: đủ tầng, hoặc còn ít nhất 2 lượt / cả trận (hiệu ứng không cộng tầng). */
function sideFieldSaturated(
  data: GameData,
  field: BattleField,
  side: BattleSide,
  fieldId: string
): boolean {
  const current = field.sides[side].find((entry) => entry.id === fieldId)
  if (!current) return false
  const maxLayers = data.fieldEffects[fieldId].maxLayers ?? 1
  if (maxLayers > 1) return current.layers >= maxLayers
  return current.turnsLeft === null || current.turnsLeft >= 2
}

const setSideField: SkillEffectHandler = {
  // Một lần cho cả chiêu, không phụ thuộc số mục tiêu.
  timing: 'perSkill',
  validateParams(params, data) {
    const obj = asObject(params)
    return obj ? checkSetSideFieldParams(data, obj) : ['params phải là object']
  },
  apply(params, { rng }) {
    return { ...noChanges(rng), sideFieldChanges: [params as SideFieldPlacement] }
  },
  aiValue(params, ctx) {
    const { side, fieldId, requiresFieldId } = params as SideFieldPlacement
    const own = side === 'own'
    const placedSide = own ? ctx.side : otherSide(ctx.side)
    if (requiresFieldId !== undefined && !isGlobalFieldActive(ctx.data, ctx.field, requiresFieldId))
      return 0
    if (sideFieldSaturated(ctx.data, ctx.field, placedSide, fieldId)) return 0
    const benefit = sideFieldBenefit(
      ctx.data,
      fieldId,
      own
        ? { onField: ctx.allies, reserves: ctx.allyReserves }
        : { onField: ctx.foes, reserves: ctx.foeReserves }
    )
    return ctx.data.config.ai.fieldWeight * (own ? benefit : -benefit)
  }
}

// ---------- setRoom: đặt / tắt hiệu ứng toàn sân đặc biệt (kiểu Trick Room, Gravity) ----------

const setRoom: SkillEffectHandler = {
  // Một lần cho cả chiêu, không phụ thuộc số mục tiêu.
  timing: 'perSkill',
  validateParams(params, data) {
    const obj = asObject(params)
    return obj ? checkSetRoomParams(data, obj) : ['params phải là object']
  },
  apply(params, { rng }) {
    return { ...noChanges(rng), roomChanges: [params as RoomPlacement] }
  },
  // Room đang có: kiểu tắt (Trick Room) thì lợi của việc tắt = hại của room với phe mình; kiểu
  // làm mới (Mud Sport) thì như đặt mới khi sắp hết, còn ít nhất 2 lượt thì gần như vô ích.
  aiValue(params, { data, field, allies, foes }) {
    const { fieldId } = params as RoomPlacement
    const value = data.config.ai.fieldWeight * roomBenefit(data, fieldId, { allies, foes })
    const active = field.rooms.find((room) => room.id === fieldId)
    if (!active) return value
    if (roomReuse(data, fieldId) === 'toggle') return -value
    return active.turnsLeft >= 2 ? 0 : value
  }
}

// ---------- clearField: dọn một lớp toàn sân về mặc định (kiểu Defog, Ice Spinner: địa hình) ----------

const clearField: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const layer = asObject(params)?.layer
    return isGlobalFieldLayer(layer) ? [] : ['layer phải là "weather" hoặc "terrain"']
  },
  apply(params, { rng }) {
    return { ...noChanges(rng), fieldClears: [(params as { layer: GlobalFieldLayer }).layer] }
  },
  // Lợi của việc dọn = hại của môi trường đang có với phe mình.
  aiValue(params, { data, field, allies, foes }) {
    const { layer } = params as { layer: GlobalFieldLayer }
    const fieldId = field[layer].id
    if (fieldId === data.config.field.defaults[layer]) return 0
    const advantage = sideBenefit(data, allies, fieldId) - sideBenefit(data, foes, fieldId)
    return -data.config.ai.fieldWeight * advantage
  }
}

// ---------- clearSideFields: dọn hiệu ứng theo phe (kiểu Defog, Rapid Spin) ----------

/** Các hiệu ứng theo phe bị dọn trên một phe (theo luật SideFieldClear). */
const clearedSideFieldIds = (
  data: GameData,
  field: BattleField,
  side: BattleSide,
  hazardsOnly: boolean
): string[] =>
  field.sides[side]
    .map((entry) => entry.id)
    .filter((fieldId) => !hazardsOnly || isEntryHazard(data, fieldId))

/** Tổng điểm lợi của các hiệu ứng theo phe với một phe (quái trên sân và dự bị). */
const sideFieldsBenefit = (
  data: GameData,
  fieldIds: readonly string[],
  team: { onField: readonly Monster[]; reserves: readonly Monster[] }
): number => fieldIds.reduce((sum, fieldId) => sum + sideFieldBenefit(data, fieldId, team), 0)

const clearSideFields: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues: string[] = []
    if (obj.side !== 'own' && obj.side !== 'foe') issues.push('side phải là "own" hoặc "foe"')
    if (obj.hazardsOnly !== undefined && obj.hazardsOnly !== true) {
      issues.push('hazardsOnly chỉ được là true')
    }
    return issues
  },
  apply(params, { rng }) {
    const { side, hazardsOnly } = params as { side: SideFieldTarget; hazardsOnly?: true }
    return {
      ...noChanges(rng),
      sideFieldClears: [{ side, hazardsOnly: hazardsOnly === true }]
    }
  },
  aiValue(params, ctx) {
    const { side, hazardsOnly } = params as { side: SideFieldTarget; hazardsOnly?: true }
    const own = side === 'own'
    const placedSide = own ? ctx.side : otherSide(ctx.side)
    const removed = clearedSideFieldIds(ctx.data, ctx.field, placedSide, hazardsOnly === true)
    const benefit = sideFieldsBenefit(
      ctx.data,
      removed,
      own
        ? { onField: ctx.allies, reserves: ctx.allyReserves }
        : { onField: ctx.foes, reserves: ctx.foeReserves }
    )
    return ctx.data.config.ai.fieldWeight * (own ? -benefit : benefit)
  }
}

// ---------- swapSideFields: đổi hiệu ứng theo phe của hai phe (kiểu Court Change) ----------

const swapSideFields: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams: validateEmptyParams,
  apply: (_params, { rng }) => ({ ...noChanges(rng), swapSideFields: true }),
  // Lợi của phe mình sau khi đổi trừ trước khi đổi (mỗi phe chấm hiệu ứng nằm trên phe đó).
  aiValue(_params, ctx) {
    const ownIds = ctx.field.sides[ctx.side].map((entry) => entry.id)
    const foeIds = ctx.field.sides[otherSide(ctx.side)].map((entry) => entry.id)
    const allies = { onField: ctx.allies, reserves: ctx.allyReserves }
    const foes = { onField: ctx.foes, reserves: ctx.foeReserves }
    const before =
      sideFieldsBenefit(ctx.data, ownIds, allies) - sideFieldsBenefit(ctx.data, foeIds, foes)
    const after =
      sideFieldsBenefit(ctx.data, foeIds, allies) - sideFieldsBenefit(ctx.data, ownIds, foes)
    return ctx.data.config.ai.fieldWeight * (after - before)
  }
}

export const FIELD_SKILL_EFFECTS: Readonly<Record<string, SkillEffectHandler>> = {
  setField,
  setSideField,
  setRoom,
  clearField,
  clearSideFields,
  swapSideFields
}
