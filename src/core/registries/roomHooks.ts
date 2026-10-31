// Hook chỉ dùng cho hiệu ứng toàn sân đặc biệt (lớp room, mục "Môi trường" ở battle-environment.md): đảo thứ
// tự tốc độ (Trick Room), đổi thủ ↔ thủ đặc biệt (Wonder Room), ép đứng trên mặt đất và cấm chiêu
// bay (Gravity), vô hiệu đồ cầm (Magic Room), đổi hệ skill (Ion Deluge), chặn đổi
// quái / chạy trốn (Fairy Lock). Gộp vào registry FIELD_HOOKS ở
// fieldHooks.ts; accuracy của Gravity dùng lại accuracyMultiplier. Tra cứu tổng hợp ở
// roomQueries.ts.
//
// Các hook này cần so hai phe nên AI chấm bằng `teamBenefit` (aiBenefit từng quái luôn 0).

import { asObject, checkEnumList, type Decimal } from '../shared'
import { computeStats, isGrounded } from '../monster'
import type { Monster, SkillCategory } from '../model'
import { battleSkillIds } from '../model'
import { validateEmptyParams } from './traitHookUtils'
import {
  ROOM_ONLY,
  checkElements,
  type FieldHookHandler,
  type FieldTeamContext
} from './fieldHookUtils'

/** Chỉ số ngoài trận (AI chỉ cần so tương đối giữa các quái). */
const statOf = (
  ctx: FieldTeamContext,
  monster: Monster,
  stat: 'speed' | 'defense' | 'spDefense'
): Decimal => computeStats(ctx.data, monster).final[stat]

// ---------- reverseSpeedOrder: quái chậm đi trước trong cùng mức priority (Trick Room) ----------

const reverseSpeedOrder: FieldHookHandler = {
  scopes: ROOM_ONLY,
  validateParams: validateEmptyParams,
  reversesSpeedOrder: () => true,
  aiBenefit: () => 0,
  // Mỗi cặp (quái ta, quái địch): quái ta chậm hơn thì được đi trước (+1), nhanh hơn thì mất lượt
  // đi trước (−1). Chia số quái địch để cùng thang với điểm từng quái.
  teamBenefit(_params, ctx) {
    let benefit = 0
    for (const ally of ctx.allies) {
      const allySpeed = statOf(ctx, ally, 'speed')
      for (const foe of ctx.foes) benefit += statOf(ctx, foe, 'speed').cmp(allySpeed)
    }
    return benefit / Math.max(1, ctx.foes.length)
  }
}

// ---------- swapDefenses: đổi thủ ↔ thủ đặc biệt (Wonder Room) ----------

/** Hiệu số skill gây sát thương vật lý − đặc biệt của các quái (đòn mà phe kia sẽ nhận). */
function physicalLean(ctx: FieldTeamContext, attackers: readonly Monster[]): number {
  const count = (category: SkillCategory): number =>
    attackers.reduce(
      (sum, monster) =>
        sum +
        battleSkillIds(monster).filter((skillId) => {
          const skill = ctx.data.skills[skillId]
          return skill.power > 0 && skill.category === category
        }).length,
      0
    )
  return count('physical') - count('special')
}

/**
 * Lợi của việc đổi thủ với các quái bị đánh: đòn vật lý chiếm đa số thì có lợi khi thủ đặc biệt
 * cao hơn thủ (đòn vật lý giờ đánh vào thủ đặc biệt), và ngược lại.
 */
function swapGain(ctx: FieldTeamContext, defenders: readonly Monster[], lean: number): number {
  return defenders.reduce(
    (sum, monster) =>
      sum +
      statOf(ctx, monster, 'spDefense').cmp(statOf(ctx, monster, 'defense')) * Math.sign(lean),
    0
  )
}

const swapDefenses: FieldHookHandler = {
  scopes: ROOM_ONLY,
  validateParams: validateEmptyParams,
  swapsDefenses: () => true,
  aiBenefit: () => 0,
  teamBenefit: (_params, ctx) =>
    swapGain(ctx, ctx.allies, physicalLean(ctx, ctx.foes)) -
    swapGain(ctx, ctx.foes, physicalLean(ctx, ctx.allies))
}

// ---------- forceGrounded: mọi quái đứng trên mặt đất (Gravity) ----------

interface ForceGroundedParams {
  /** Hệ của skill đánh trúng quái đang bay (hệ số 0 lên hệ bay và trait miễn nhiễm mất tác dụng). */
  removesImmunityFromElementIds: string[]
}

/**
 * Số quái vốn đang bay trong `defenders` bị phe `attackers` đánh trúng nhờ mất miễn nhiễm (phe
 * kia có skill gây sát thương thuộc hệ được gỡ miễn nhiễm).
 */
function exposedCount(
  ctx: FieldTeamContext,
  elementIds: readonly string[],
  { attackers, defenders }: { attackers: readonly Monster[]; defenders: readonly Monster[] }
): number {
  const canExploit = attackers.some((monster) =>
    battleSkillIds(monster).some((skillId) => {
      const skill = ctx.data.skills[skillId]
      return skill.power > 0 && elementIds.includes(skill.elementId)
    })
  )
  if (!canExploit) return 0
  return defenders.filter((monster) => !isGrounded(ctx.data, monster)).length
}

const forceGrounded: FieldHookHandler = {
  scopes: ROOM_ONLY,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return checkElements(data, obj.removesImmunityFromElementIds, 'removesImmunityFromElementIds')
  },
  forcesGrounded: () => true,
  removesImmunityFrom: (params, elementId) =>
    (params as ForceGroundedParams).removesImmunityFromElementIds.includes(elementId),
  aiBenefit: () => 0,
  teamBenefit(params, ctx) {
    const { removesImmunityFromElementIds: elementIds } = params as ForceGroundedParams
    return (
      exposedCount(ctx, elementIds, { attackers: ctx.allies, defenders: ctx.foes }) -
      exposedCount(ctx, elementIds, { attackers: ctx.foes, defenders: ctx.allies })
    )
  }
}

// ---------- disableHeldItems: vô hiệu đồ cầm (Magic Room) ----------

// Như Pokémon: mọi món trong ô của quái trên sân (trang bị lẫn đồ cầm) không tác dụng (chủ project
// chốt 2026-10-23). AI: phe có ít quái đang lắp đồ hơn có lợi.
const disableHeldItems: FieldHookHandler = {
  scopes: ROOM_ONLY,
  validateParams: validateEmptyParams,
  disablesItems: () => true,
  aiBenefit: () => 0,
  teamBenefit(_params, ctx) {
    const equipped = (monsters: readonly Monster[]): number =>
      monsters.filter((monster) => monster.equipment.length > 0).length
    return equipped(ctx.foes) - equipped(ctx.allies)
  }
}

// ---------- banSkills: cấm dùng skill (Gravity: Fly, Bounce, High Jump Kick...) ----------

interface BanSkillsParams {
  skillIds: string[]
}

// Như Pokémon: quái chọn skill bị cấm thì thất bại (skillBlocked), AI không chọn. Lợi / hại tùy skill
// của từng phe nên không cộng điểm AI.
const banSkills: FieldHookHandler = {
  scopes: ROOM_ONLY,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return checkEnumList(obj.skillIds, 'skillIds', Object.keys(data.skills))
  },
  bansSkill: (params, skillId) => (params as BanSkillsParams).skillIds.includes(skillId),
  aiBenefit: () => 0
}

// ---------- convertElement: đổi hệ skill (Ion Deluge: thường → điện) ----------

interface ConvertElementParams {
  fromElementIds: string[]
  elementId: string
}

const convertElement: FieldHookHandler = {
  scopes: ROOM_ONLY,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkElements(data, obj.fromElementIds, 'fromElementIds'),
      ...checkElements(data, [obj.elementId], 'elementId')
    ]
  },
  convertsElement(params, elementId) {
    const { fromElementIds, elementId: converted } = params as ConvertElementParams
    return fromElementIds.includes(elementId) ? converted : null
  },
  // Chỉ kéo dài trong lượt dùng, lợi / hại tùy hệ của từng đòn: không cộng điểm.
  aiBenefit: () => 0
}

// ---------- preventEscape: không đổi quái, không chạy trốn (Fairy Lock) ----------

const preventEscape: FieldHookHandler = {
  scopes: ROOM_ONLY,
  validateParams: validateEmptyParams,
  preventsEscape: () => true,
  // AI không đổi quái, không chạy trốn: không cộng điểm.
  aiBenefit: () => 0
}

export const ROOM_HOOKS: Readonly<Record<string, FieldHookHandler>> = {
  reverseSpeedOrder,
  swapDefenses,
  forceGrounded,
  banSkills,
  disableHeldItems,
  convertElement,
  preventEscape
}
