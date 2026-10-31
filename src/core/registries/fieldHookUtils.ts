// Kiểu và hàm nhỏ dùng chung cho handler môi trường (fieldHooks.ts: hook toàn sân và dùng chung,
// sideFieldHooks.ts: hook chỉ của hiệu ứng theo phe, roomHooks.ts: hook chỉ của hiệu ứng toàn
// sân đặc biệt). Registry FIELD_HOOKS ở fieldHooks.ts.

import type { GameData, Monster, Skill, StatName } from '../model'
import { battleSkillIds } from '../model'
import { checkIdList } from './paramChecks'

/**
 * Nơi hook được dùng: lớp toàn sân (thời tiết, địa hình), hiệu ứng theo phe, hoặc hiệu ứng toàn
 * sân đặc biệt (room).
 */
export type FieldScope = 'global' | 'side' | 'room'

/** Quái chịu tác động của môi trường, kèm các cờ đã tính sẵn. */
export interface FieldMonsterContext {
  data: GameData
  monster: Monster
  /** Đứng trên mặt đất (isGrounded): địa hình, phần lớn bẫy chỉ tác dụng lên quái này. */
  grounded: boolean
  /** Có trait miễn sát thương môi trường (fieldDamageImmunity). */
  immuneToFieldDamage: boolean
}

/** Quái vừa vào sân gặp bẫy: thêm số tầng của bẫy. */
export interface FieldEntryContext extends FieldMonsterContext {
  layers: number
}

export interface FieldDamageContext {
  skill: Skill
  attackerGrounded: boolean
  defenderGrounded: boolean
}

/** Đòn đánh vào một phe có hiệu ứng theo phe (màn chắn). */
export interface FieldDamageTakenContext {
  skill: Skill
  /** Số quái còn sống trên sân của phe bên nhận. */
  defenderSideCount: number
}

/** Hai phe trên sân khi AI chấm một room (hook cần so hai phe, kiểu Trick Room so tốc độ). */
export interface FieldTeamContext {
  data: GameData
  /** Quái còn sống trên sân của phe được chấm và phe đối diện. */
  allies: readonly Monster[]
  foes: readonly Monster[]
}

/** Tác động lên quái vừa vào sân (bẫy); trận đấu (battle/environment.ts) áp vào. */
export type FieldEntryEffect =
  /** % max HP; elementId: nhân thêm khắc hệ của hệ này lên quái (kiểu Stealth Rock). */
  | { kind: 'damage'; percent: number; elementId?: string }
  | { kind: 'status'; statusId: string }
  | { kind: 'stage'; stat: Exclude<StatName, 'hp'>; delta: number }
  /** Quái hút mất bẫy: bẫy mất khỏi phe, không tác động. */
  | { kind: 'absorb' }

export interface FieldHookHandler {
  /** Lớp được dùng hook này; dữ liệu dùng sai lớp thì kiểm tra dữ liệu báo lỗi. */
  scopes: readonly FieldScope[]
  /** Trả về danh sách lỗi; rỗng nếu params hợp lệ. Gọi khi kiểm tra dữ liệu lúc khởi động. */
  validateParams(params: unknown, data: GameData): string[]
  /**
   * Số mục theo tầng trong params; phải bằng maxLayers của môi trường (bỏ trống = 1). null khi
   * params sai dạng (validateParams đã báo).
   */
  layerCount?(params: unknown): number | null
  /** Hệ số nhân sát thương skill (trong công thức dùng chung rawDamage). */
  damageMultiplier?(params: unknown, ctx: FieldDamageContext): number
  /** Hệ số nhân sát thương phe có hiệu ứng nhận (màn chắn); chí mạng bỏ qua. */
  damageTakenMultiplier?(params: unknown, ctx: FieldDamageTakenContext): number
  /** Hệ số nhân accuracy của skill (trước khi tung trúng). */
  accuracyMultiplier?(params: unknown, skill: Skill): number
  /** Hệ số nhân một chỉ số của quái (bước môi trường của computeStats); null = không áp. */
  statMultiplier?(
    params: unknown,
    ctx: FieldMonsterContext
  ): { stat: Exclude<StatName, 'hp'>; multiplier: number } | null
  /** Hệ số nhân lượng hồi máu quái nhận (không áp cho vật phẩm); 1 = không đổi. */
  healMultiplier?(params: unknown, ctx: FieldMonsterContext): number
  /** Cuối lượt có tỉ lệ dính trạng thái; null = không tác động quái này. */
  turnEndStatusChance?(
    params: unknown,
    ctx: FieldMonsterContext
  ): { statusId: string; chance: number } | null
  /** % max HP mất cuối lượt (0 = không mất). */
  turnEndDamagePercent?(params: unknown, ctx: FieldMonsterContext): number
  /** % max HP hồi cuối lượt (0 = không hồi). */
  turnEndHealPercent?(params: unknown, ctx: FieldMonsterContext): number
  /** Chặn quái dính trạng thái này. */
  blocksStatus?(params: unknown, ctx: FieldMonsterContext, statusId: string): boolean
  /** Chặn quái khác hạ bậc chỉ số của quái phe này (kiểu Mist). */
  blocksStatLower?(params: unknown): boolean
  /** Đòn đánh vào quái phe này không chí mạng (kiểu Lucky Chant). */
  blocksCritical?(params: unknown): boolean
  /**
   * Chặn skill này của phe địch nhắm quái phe này (kiểu Wide Guard, Quick Guard); `priority`: priority
   * thật của skill khi quái đó dùng (đã cộng trait kiểu Prankster).
   */
  protectsFrom?(params: unknown, skill: Skill, priority: number): boolean
  /** Hệ số tiền thưởng của phe này khi thắng (kiểu Happy Hour); 1 = không đổi. */
  moneyMultiplier?(params: unknown): number
  /** Hệ số tỉ lệ hiệu ứng phụ skill của quái phe này (Rainbow). */
  secondaryChanceMultiplier?(params: unknown): number
  /** Hệ mới của skill hệ `elementId` (kiểu Ion Deluge: thường → điện); null = không đổi. */
  convertsElement?(params: unknown, elementId: string): string | null
  /** Không quái nào đổi quái, không chạy trốn được (kiểu Fairy Lock). */
  preventsEscape?(params: unknown): boolean
  /** Tác động lên quái vào sân giữa trận (bẫy); null = không tác động quái này. */
  entryEffect?(params: unknown, ctx: FieldEntryContext): FieldEntryEffect | null
  /** Đảo thứ tự tốc độ trong cùng mức priority (kiểu Trick Room). */
  reversesSpeedOrder?(params: unknown): boolean
  /** Đổi giá trị thủ ↔ thủ đặc biệt ở bước môi trường của computeStats (kiểu Wonder Room). */
  swapsDefenses?(params: unknown): boolean
  /** Món trong ô của quái (trang bị, đồ cầm) không tác dụng (kiểu Magic Room). */
  disablesItems?(params: unknown): boolean
  /** Mọi quái đứng trên mặt đất (kiểu Gravity). */
  forcesGrounded?(params: unknown): boolean
  /**
   * Skill (đã đổi hệ theo môi trường) thất bại khi môi trường này còn (Heavy Rain: chiêu gây sát
   * thương hệ Lửa).
   */
  blocksSkill?(params: unknown, skill: Skill): boolean
  /** Bảng hệ khắc hệ `elementId` của bên nhận (> 1) thành 1 (Delta Stream: hệ Bay). */
  neutralizesWeaknessOf?(params: unknown, elementId: string): boolean
  /** Skill không dùng được khi room còn (Gravity: chiêu bay / nhảy). */
  bansSkill?(params: unknown, skillId: string): boolean
  /**
   * Skill hệ này mất miễn nhiễm của quái lên quái đang bay (Gravity: chiêu hệ Đất đánh trúng hệ
   * Bay và trait Bay lơ lửng).
   */
  removesImmunityFrom?(params: unknown, elementId: string): boolean
  /**
   * Điểm lợi của hook cho phe `allies` khi so với phe `foes` (aiValue của setRoom). Có thì dùng
   * thay cho tổng aiBenefit từng quái của hai phe.
   */
  teamBenefit?(params: unknown, ctx: FieldTeamContext): number
  /**
   * Điểm lợi (+1) / hại (−1) của hook với quái khi môi trường có mặt (aiValue của setField /
   * setSideField, mục "AI trận đấu"); 0 = không liên quan. Hook có entryEffect chấm trên quái dự
   * bị (quái sẽ vào sân), hook khác chấm trên quái đang ở trên sân.
   */
  aiBenefit(params: unknown, ctx: FieldMonsterContext): number
}

/** Hệ của quái có thuộc danh sách không. */
export const hasElement = (monster: Monster, elementIds: readonly string[]): boolean =>
  monster.elementIds.some((elementId) => elementIds.includes(elementId))

/** Lọc theo hệ: chỉ các hệ `elementIds` (nếu có), trừ các hệ `exceptElementIds` (nếu có). */
export interface ElementFilter {
  elementIds?: string[]
  exceptElementIds?: string[]
}

/** Một hệ (của skill) có qua bộ lọc không. */
export const elementPasses = (
  { elementIds, exceptElementIds }: ElementFilter,
  elementId: string
): boolean =>
  (elementIds === undefined || elementIds.includes(elementId)) &&
  !(exceptElementIds ?? []).includes(elementId)

/** Quái có qua bộ lọc không: có ít nhất một hệ trong elementIds, không có hệ nào bị trừ. */
export const monsterPasses = (
  { elementIds, exceptElementIds }: ElementFilter,
  monster: Monster
): boolean =>
  (elementIds === undefined || hasElement(monster, elementIds)) &&
  !hasElement(monster, exceptElementIds ?? [])

/** elementIds? / exceptElementIds? (không dùng cùng lúc, mỗi danh sách là hệ tồn tại). */
export function checkElementFilter(data: GameData, obj: Record<string, unknown>): string[] {
  const issues: string[] = []
  if (obj.elementIds !== undefined)
    issues.push(...checkElements(data, obj.elementIds, 'elementIds'))
  if (obj.exceptElementIds !== undefined) {
    issues.push(...checkElements(data, obj.exceptElementIds, 'exceptElementIds'))
  }
  if (obj.elementIds !== undefined && obj.exceptElementIds !== undefined) {
    issues.push('chỉ dùng một trong elementIds / exceptElementIds')
  }
  return issues
}

/** Quái có skill thỏa điều kiện không. */
export const hasSkill = (
  data: GameData,
  monster: Monster,
  test: (skill: Skill) => boolean
): boolean => battleSkillIds(monster).some((skillId) => test(data.skills[skillId]))

/** Dấu của hệ số so với 1: tăng = +1, giảm = −1. */
export const multiplierSign = (multiplier: number): number => Math.sign(multiplier - 1)

export const checkElements = (data: GameData, value: unknown, field: string): string[] =>
  checkIdList(value, field, data.elements, { label: 'hệ' })

/** grounded?: true (chỉ quái đứng trên mặt đất). */
export const checkGroundedFlag = (value: unknown): string[] =>
  value === undefined || value === true ? [] : ['grounded chỉ được là true']

/** Hook có cờ grounded mà quái không đứng trên đất thì không tác động. */
export const groundedBlocks = (grounded: true | undefined, ctx: FieldMonsterContext): boolean =>
  grounded === true && !ctx.grounded

export const GLOBAL_ONLY: readonly FieldScope[] = ['global']
export const SIDE_ONLY: readonly FieldScope[] = ['side']
export const ANY_SCOPE: readonly FieldScope[] = ['global', 'side']
export const ROOM_ONLY: readonly FieldScope[] = ['room']
export const GLOBAL_OR_ROOM: readonly FieldScope[] = ['global', 'room']
