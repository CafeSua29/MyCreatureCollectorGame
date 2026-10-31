// Tra cứu tổng hợp trên môi trường đang có của trận (mục "Môi trường" ở battle-environment.md): duyệt hook
// (toàn sân, rồi hiệu ứng theo phe của phe quái), hệ số chỉ số / sát thương / accuracy, màn chắn,
// môi trường chặn trạng thái / hạ bậc / chí mạng / skill của địch (guard), hệ số tiền thưởng,
// fieldModifiers và đổi hệ của skill, bẫy, điểm lợi cho AI. Handler của
// từng hook ở fieldHooks.ts / sideFieldHooks.ts.

import { isGrounded } from '../monster'
import {
  battleSkillIds,
  GLOBAL_FIELD_LAYERS,
  STAT_NAMES,
  type BattleField,
  type BattleSide,
  type GameData,
  type Monster,
  type Skill,
  type SkillFieldModifier,
  type Stats
} from '../model'
import { skillPriority } from './actionTraitQueries'
import { fieldIdMatches, fieldIdsCountedAs } from './fieldIds'
import { FIELD_HOOKS } from './fieldHooks'
import type { FieldDamageContext, FieldHookHandler, FieldMonsterContext } from './fieldHookUtils'
import { forEachTraitHook, hasTraitFlag } from './traitHooks'

/** Gọi fn với mọi hook của một môi trường. */
function forEachHookOf(
  data: GameData,
  fieldId: string,
  layers: number,
  fn: (handler: FieldHookHandler, params: unknown, fieldId: string, layers: number) => void
): void {
  for (const hook of data.fieldEffects[fieldId].hooks) {
    fn(FIELD_HOOKS[hook.type], hook.params, fieldId, layers)
  }
}

/**
 * Gọi fn với mọi hook của các môi trường đang có: toàn sân theo thứ tự lớp (thời tiết rồi địa
 * hình), room (theo thứ tự đặt), rồi hiệu ứng theo phe của `side` (theo thứ tự đặt) nếu có.
 * `layers` = số tầng (toàn sân, room: 1).
 */
export function forEachFieldHook(
  data: GameData,
  field: BattleField,
  fn: (handler: FieldHookHandler, params: unknown, fieldId: string, layers: number) => void,
  side?: BattleSide
): void {
  for (const layer of GLOBAL_FIELD_LAYERS) forEachHookOf(data, field[layer].id, 1, fn)
  for (const { id } of field.rooms) forEachHookOf(data, id, 1, fn)
  if (side === undefined) return
  for (const { id, layers } of field.sides[side]) forEachHookOf(data, id, layers, fn)
}

/**
 * Ngữ cảnh của một quái trên sân (cờ grounded, miễn sát thương môi trường đã tính sẵn). `field`:
 * môi trường của trận (Gravity ép đứng trên mặt đất); bỏ trống khi AI chấm môi trường giả định.
 */
export function fieldMonsterContext(
  data: GameData,
  monster: Monster,
  field?: BattleField
): FieldMonsterContext {
  return {
    data,
    monster,
    grounded: isGrounded(data, monster, field),
    // Miễn sát thương gián tiếp (kiểu Magic Guard) gồm cả sát thương môi trường.
    immuneToFieldDamage: hasTraitFlag(
      data,
      monster,
      (handler, params) =>
        handler.immuneToFieldDamage?.(params) || handler.immuneToIndirectDamage?.(params)
    )
  }
}

/**
 * Hệ số nhân từng chỉ số từ môi trường (bước môi trường của computeStats; không có thì 1): toàn
 * sân và hiệu ứng theo phe của quái (`side`, bỏ trống = chỉ toàn sân).
 */
export function fieldStatMultipliers(
  data: GameData,
  field: BattleField,
  monster: Monster,
  side?: BattleSide
): Stats {
  const result = {} as Stats
  for (const stat of STAT_NAMES) result[stat] = 1
  const ctx = fieldMonsterContext(data, monster, field)
  forEachFieldHook(
    data,
    field,
    (handler, params) => {
      const modifier = handler.statMultiplier?.(params, ctx)
      if (modifier) result[modifier.stat] *= modifier.multiplier
    },
    side
  )
  return result
}

/**
 * Tích hệ số hồi máu của môi trường lên quái (toàn sân và hiệu ứng theo phe của quái); áp cho mọi
 * nguồn hồi máu trong trận trừ vật phẩm (mục "Môi trường").
 */
export function fieldHealMultiplier(
  data: GameData,
  field: BattleField,
  { monster, side }: { monster: Monster; side: BattleSide }
): number {
  const ctx = fieldMonsterContext(data, monster, field)
  let multiplier = 1
  forEachFieldHook(
    data,
    field,
    (handler, params) => {
      if (handler.healMultiplier) multiplier *= handler.healMultiplier(params, ctx)
    },
    side
  )
  return multiplier
}

/**
 * Hệ số màn chắn của phe bên nhận (damageTakenMultiplier). Các màn chắn không nhân dồn: lấy hệ số
 * nhỏ nhất (Reflect cùng Aurora Veil vẫn × 0,5). Chí mạng bỏ qua hệ số này (nơi gọi xử lý).
 */
export function sideDamageTakenMultiplier(
  data: GameData,
  field: BattleField,
  { side, skill, defenderSideCount }: { side: BattleSide; skill: Skill; defenderSideCount: number }
): number {
  let multiplier = 1
  for (const { id } of field.sides[side]) {
    forEachHookOf(data, id, 1, (handler, params) => {
      const value = handler.damageTakenMultiplier?.(params, { skill, defenderSideCount })
      if (value !== undefined) multiplier = Math.min(multiplier, value)
    })
  }
  return multiplier
}

/** Hiệu ứng theo phe chặn quái khác hạ bậc chỉ số của phe này (id đầu tiên), hoặc null. */
export function statLowerBlockingField(
  data: GameData,
  field: BattleField,
  side: BattleSide
): string | null {
  for (const { id } of field.sides[side]) {
    let blocks = false
    forEachHookOf(data, id, 1, (handler, params) => {
      blocks ||= handler.blocksStatLower?.(params) ?? false
    })
    if (blocks) return id
  }
  return null
}

/** Tích hệ số sát thương của môi trường lên một đòn. */
export function fieldDamageMultiplier(
  data: GameData,
  field: BattleField,
  { attacker, defender, skill }: { attacker: Monster; defender: Monster; skill: Skill }
): number {
  const ctx: FieldDamageContext = {
    skill,
    attackerGrounded: isGrounded(data, attacker, field),
    defenderGrounded: isGrounded(data, defender, field)
  }
  let multiplier = 1
  forEachFieldHook(data, field, (handler, params) => {
    if (handler.damageMultiplier) multiplier *= handler.damageMultiplier(params, ctx)
  })
  return multiplier
}

/** Tích hệ số accuracy của môi trường lên skill. */
export function fieldAccuracyMultiplier(data: GameData, field: BattleField, skill: Skill): number {
  let multiplier = 1
  forEachFieldHook(data, field, (handler, params) => {
    if (handler.accuracyMultiplier) multiplier *= handler.accuracyMultiplier(params, skill)
  })
  return multiplier
}

/**
 * Môi trường chặn quái dính trạng thái này (id môi trường đầu tiên chặn), hoặc null. `side`: phe
 * của quái, để xét cả hiệu ứng theo phe (Safeguard).
 */
export function statusBlockingField(
  data: GameData,
  field: BattleField,
  { monster, side }: { monster: Monster; side: BattleSide },
  statusId: string
): string | null {
  const ctx = fieldMonsterContext(data, monster, field)
  let blocking: string | null = null
  forEachFieldHook(
    data,
    field,
    (handler, params, fieldId) => {
      if (blocking === null && handler.blocksStatus?.(params, ctx, statusId)) blocking = fieldId
    },
    side
  )
  return blocking
}

/** Môi trường toàn sân `fieldId` đang có (ở lớp của nó, kể cả qua actsAs). */
export function isGlobalFieldActive(data: GameData, field: BattleField, fieldId: string): boolean {
  return GLOBAL_FIELD_LAYERS.some((layer) => fieldIdMatches(data, field[layer].id, [fieldId]))
}

/**
 * Môi trường toàn sân đang có làm skill (đã đổi hệ theo môi trường, skillInField) thất bại (Heavy
 * Rain: chiêu gây sát thương hệ Lửa); trả về id môi trường chặn, không có thì null.
 */
export function fieldBlockingSkill(
  data: GameData,
  field: BattleField,
  skill: Skill
): string | null {
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const fieldId = field[layer].id
    const blocks = data.fieldEffects[fieldId].hooks.some(
      (hook) => FIELD_HOOKS[hook.type].blocksSkill?.(hook.params, skill) ?? false
    )
    if (blocks) return fieldId
  }
  return null
}

/** Môi trường toàn sân đang có làm hệ `elementId` của bên nhận hết bị khắc (Delta Stream). */
export function isWeaknessNeutralized(
  data: GameData,
  field: BattleField,
  elementId: string
): boolean {
  return GLOBAL_FIELD_LAYERS.some((layer) =>
    data.fieldEffects[field[layer].id].hooks.some(
      (hook) => FIELD_HOOKS[hook.type].neutralizesWeaknessOf?.(hook.params, elementId) ?? false
    )
  )
}

/** Mục fieldModifiers cần quái dùng đứng trên mặt đất mà quái không đứng trên đất. */
const groundedUserMissing = (
  data: GameData,
  modifier: SkillFieldModifier,
  user: Monster | undefined,
  field?: BattleField
): boolean =>
  modifier.requiresGroundedUser === true && (user === undefined || !isGrounded(data, user, field))

/**
 * Thay đổi của skill theo các môi trường đang có (trường fieldModifiers), theo thứ tự lớp. `user`:
 * quái dùng skill, để xét mục cần đứng trên mặt đất (bỏ trống = bỏ các mục đó).
 */
export function activeSkillFieldModifiers(
  data: GameData,
  field: BattleField,
  skill: Skill,
  user?: Monster
): SkillFieldModifier[] {
  const activeIds = GLOBAL_FIELD_LAYERS.flatMap((layer) => fieldIdsCountedAs(data, field[layer].id))
  return (skill.fieldModifiers ?? []).filter(
    (modifier) =>
      activeIds.includes(modifier.fieldId) && !groundedUserMissing(data, modifier, user, field)
  )
}

/**
 * Sức mạnh của skill theo môi trường đang có (fieldModifiers): sức mạnh thay thế (`power`, nếu
 * có) rồi nhân mọi `powerMultiplier`. Không có môi trường liên quan thì bằng `skill.power`.
 */
export function skillPowerInField(
  data: GameData,
  field: BattleField,
  skill: Skill,
  user?: Monster
): number {
  const modifiers = activeSkillFieldModifiers(data, field, skill, user)
  const base = modifiers.find((modifier) => modifier.power !== undefined)?.power ?? skill.power
  return modifiers.reduce((power, modifier) => power * (modifier.powerMultiplier ?? 1), base)
}

/**
 * Skill với hệ đã đổi theo môi trường đang có: `elementId` của fieldModifiers (mục đầu tiên theo
 * thứ tự lớp), rồi room đổi hệ (kiểu Ion Deluge, theo thứ tự đặt). Không đổi thì trả lại chính
 * skill. Sức mạnh vẫn tính riêng (skillPowerInField).
 */
export function skillInField(
  data: GameData,
  field: BattleField,
  skill: Skill,
  user?: Monster
): Skill {
  let elementId =
    activeSkillFieldModifiers(data, field, skill, user).find(
      (modifier) => modifier.elementId !== undefined
    )?.elementId ?? skill.elementId
  for (const { id } of field.rooms) {
    forEachHookOf(data, id, 1, (handler, params) => {
      elementId = handler.convertsElement?.(params, elementId) ?? elementId
    })
  }
  return elementId === skill.elementId ? skill : { ...skill, elementId }
}

/** Mục tiêu của skill theo môi trường (fieldModifiers.target; Expanding Force). */
export function skillTargetInField(
  data: GameData,
  field: BattleField,
  skill: Skill,
  user?: Monster
): Skill {
  const target = activeSkillFieldModifiers(data, field, skill, user).find(
    (modifier) => modifier.target !== undefined
  )?.target
  return target === undefined || target === skill.target ? skill : { ...skill, target }
}

/** Môi trường là bẫy: có hook tác động lên quái vào sân (kiểu Spikes); skill dọn bẫy dùng. */
export function isEntryHazard(data: GameData, fieldId: string): boolean {
  return data.fieldEffects[fieldId].hooks.some(
    (hook) => FIELD_HOOKS[hook.type].entryEffect !== undefined
  )
}

/** Có hook nào của các hiệu ứng theo phe của `side` thỏa điều kiện; trả về id đầu tiên hoặc null. */
function sideFieldWith(
  data: GameData,
  field: BattleField,
  side: BattleSide,
  test: (handler: FieldHookHandler, params: unknown) => boolean
): string | null {
  const found = field.sides[side].find(({ id }) =>
    data.fieldEffects[id].hooks.some((hook) => test(FIELD_HOOKS[hook.type], hook.params))
  )
  return found?.id ?? null
}

/** Đòn đánh vào quái phe `side` không chí mạng (kiểu Lucky Chant). */
export function isCriticalBlocked(data: GameData, field: BattleField, side: BattleSide): boolean {
  return (
    sideFieldWith(
      data,
      field,
      side,
      (handler, params) => handler.blocksCritical?.(params) ?? false
    ) !== null
  )
}

/**
 * Hiệu ứng theo phe của `side` chặn skill này của quái phe địch `user` (kiểu Wide Guard): id đầu
 * tiên, hoặc null. Guard theo priority (Quick Guard) xét priority đã cộng trait của `user`.
 */
export function protectingSideField(
  data: GameData,
  field: BattleField,
  side: BattleSide,
  { skill, user }: { skill: Skill; user: Monster }
): string | null {
  const priority = skillPriority(data, user, skill)
  return sideFieldWith(
    data,
    field,
    side,
    (handler, params) => handler.protectsFrom?.(params, skill, priority) ?? false
  )
}

/** Tích hệ số tiền thưởng từ hiệu ứng theo phe của `side` (kiểu Happy Hour). */
export function sideMoneyMultiplier(data: GameData, field: BattleField, side: BattleSide): number {
  let multiplier = 1
  for (const { id } of field.sides[side]) {
    forEachHookOf(data, id, 1, (handler, params) => {
      multiplier *= handler.moneyMultiplier?.(params) ?? 1
    })
  }
  return multiplier
}

/** Hệ số tỉ lệ hiệu ứng phụ skill của quái phe `side` theo hiệu ứng theo phe (Rainbow). */
export function sideSecondaryChanceMultiplier(
  data: GameData,
  field: BattleField,
  side: BattleSide
): number {
  let multiplier = 1
  for (const { id } of field.sides[side]) {
    forEachHookOf(data, id, 1, (handler, params) => {
      multiplier *= handler.secondaryChanceMultiplier?.(params) ?? 1
    })
  }
  return multiplier
}

/** Lợi (+) / hại (−) của fieldModifiers trên skill của quái khi môi trường fieldId có mặt. */
function skillModifierBenefit(
  data: GameData,
  monster: Monster,
  skill: Skill,
  fieldId: string
): number {
  const modifier = skill.fieldModifiers?.find((entry) => entry.fieldId === fieldId)
  if (!modifier || groundedUserMissing(data, modifier, monster)) return 0
  const accuracy = modifier.hitsAlways ? 100 : (modifier.accuracy ?? skill.accuracy)
  const power = (modifier.power ?? skill.power) * (modifier.powerMultiplier ?? 1)
  return Math.sign(power - skill.power) + Math.sign(accuracy - skill.accuracy)
}

/**
 * Điểm lợi của một quái khi môi trường `fieldId` có mặt (aiValue của setField, mục "AI trận
 * đấu"): mỗi hook của môi trường, fieldModifiers của từng skill, trait theo môi trường cộng
 * điểm lợi (+) / hại (−) của mình.
 */
export function fieldBenefit(data: GameData, monster: Monster, fieldId: string): number {
  const ctx = fieldMonsterContext(data, monster)
  let benefit = 0
  for (const hook of data.fieldEffects[fieldId].hooks) {
    benefit += FIELD_HOOKS[hook.type].aiBenefit(hook.params, ctx)
  }
  // Môi trường tính là môi trường khác (actsAs) được cả lợi của môi trường đó.
  for (const countedId of fieldIdsCountedAs(data, fieldId)) {
    for (const skillId of new Set(battleSkillIds(monster))) {
      benefit += skillModifierBenefit(data, monster, data.skills[skillId], countedId)
    }
    forEachTraitHook(data, monster, (handler, params) => {
      benefit += handler.fieldBenefit?.(params, countedId) ?? 0
    })
  }
  return benefit
}

/**
 * Điểm lợi của một phe khi hiệu ứng theo phe `fieldId` có mặt (aiValue của setSideField): hook
 * bẫy (entryEffect) chấm trên quái dự bị còn sống (quái sẽ vào sân), hook khác chấm trên quái còn
 * sống đang ở trên sân.
 */
export function sideFieldBenefit(
  data: GameData,
  fieldId: string,
  { onField, reserves }: { onField: readonly Monster[]; reserves: readonly Monster[] }
): number {
  let benefit = 0
  forEachHookOf(data, fieldId, 1, (handler, params) => {
    const monsters = handler.entryEffect ? reserves : onField
    for (const monster of monsters) {
      benefit += handler.aiBenefit(params, fieldMonsterContext(data, monster))
    }
  })
  return benefit
}
