// Hiệu ứng kỹ năng đồng hành (docs/rules/partner-skills.md): buff của quái đứng đầu đội cho ngự thú
// sư. Mỗi loại hiệu ứng một handler: loại "lượng" cộng vào một kênh ngoài trận (tỉ lệ bắt, tiền,
// EXP, đồ rơi...), loại "trong trận" sinh hook trait cho quái ta trên sân (nguồn hook "partner").
// Thêm loại mới = thêm id vào PARTNER_EFFECT_TYPES + một handler; nơi dùng đọc kênh qua
// partnerAmount (tamer/partner.ts), không rẽ nhánh theo id kỹ năng.

import type { EffectDef, TraitHookDef } from '../model'
import { NON_HP_STATS } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'

export const PARTNER_EFFECT_TYPES = [
  'catchRatePercent',
  'moneyPercent',
  'expPercent',
  'dropRatePercent',
  'shinyChancePercent',
  'bossChancePercent',
  'fleeChancePercent',
  'eggStepBonus',
  'teamStatPercent',
  'alchemySuccessPercent',
  'expeditionPowerPercent',
  'eventChancePercent',
  'recruitPercent'
] as const

export type PartnerEffectType = (typeof PARTNER_EFFECT_TYPES)[number]

export type PartnerEffectHandler =
  | {
      /** Lượng cộng vào kênh cùng tên với loại hiệu ứng (đã nhân sức mạnh `strength`). */
      kind: 'amount'
      validateParams(params: unknown): string[]
      amount(params: unknown, strength: number): number
    }
  | {
      /** Hook trait lên quái ta trên sân; hệ số hook = sức mạnh. */
      kind: 'battle'
      validateParams(params: unknown): string[]
      battleHooks(params: unknown): readonly TraitHookDef[]
    }

/** % khác 0 (âm = bớt). */
function validatePercent(params: unknown): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  const issues = checkNumber(obj.percent, 'percent')
  if (obj.percent === 0) issues.push('percent phải khác 0')
  return issues
}

/** Hiệu ứng "+% một tỉ lệ / phần thưởng": % × sức mạnh. */
const percentEffect: PartnerEffectHandler = {
  kind: 'amount',
  validateParams: validatePercent,
  amount: (params, strength) => (params as { percent: number }).percent * strength
}

// Trứng giảm thêm số trận mỗi trận thắng: làm tròn xuống sau khi nhân sức mạnh (số trận nguyên).
const eggStepBonus: PartnerEffectHandler = {
  kind: 'amount',
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.count, 'count', 1) : ['params phải là object']
  },
  amount: (params, strength) => Math.floor((params as { count: number }).count * strength)
}

// % chỉ số cả đội trên sân (không có hp: max HP không phụ thuộc bối cảnh trận, như cộng hưởng đội).
const teamStatPercent: PartnerEffectHandler = {
  kind: 'battle',
  validateParams(params) {
    const percent = asObject(asObject(params)?.percent)
    if (!percent || Object.keys(percent).length === 0) return ['percent phải là object không rỗng']
    const issues: string[] = []
    for (const [stat, amount] of Object.entries(percent)) {
      if (!(NON_HP_STATS as readonly string[]).includes(stat)) {
        issues.push(`percent.${stat} không phải chỉ số khác hp`)
        continue
      }
      issues.push(...checkNumber(amount, `percent.${stat}`))
    }
    return issues
  },
  battleHooks: (params) => [
    { type: 'statModifier', params: { percent: (params as { percent: unknown }).percent } }
  ]
}

export const PARTNER_EFFECTS: Readonly<Record<PartnerEffectType, PartnerEffectHandler>> = {
  catchRatePercent: percentEffect,
  moneyPercent: percentEffect,
  expPercent: percentEffect,
  dropRatePercent: percentEffect,
  shinyChancePercent: percentEffect,
  bossChancePercent: percentEffect,
  fleeChancePercent: percentEffect,
  eggStepBonus,
  teamStatPercent,
  // + điểm % tỉ lệ luyện đan thành công (docs/rules/alchemy.md).
  alchemySuccessPercent: percentEffect,
  // Nhân độ thành công của đội thám hiểm trước khi kẹp (docs/rules/expeditions.md).
  expeditionPowerPercent: percentEffect,
  // Nhân tỉ lệ gặp event khám phá / thị trấn (docs/rules/events.md).
  eventChancePercent: percentEffect,
  // + % thu phục: xin theo, boss quy phục, Thị Uy (docs/rules/recruit.md).
  recruitPercent: percentEffect
}

/** Loại hiệu ứng có trong registry. */
export const isPartnerEffectType = (type: string): type is PartnerEffectType =>
  Object.hasOwn(PARTNER_EFFECTS, type)

/** Hook trait trong trận của các hiệu ứng (loại "battle") trong danh sách. */
export function partnerBattleHooks(effects: readonly EffectDef[]): TraitHookDef[] {
  const hooks: TraitHookDef[] = []
  for (const effect of effects) {
    if (!isPartnerEffectType(effect.type)) continue
    const handler = PARTNER_EFFECTS[effect.type]
    if (handler.kind === 'battle') hooks.push(...handler.battleHooks(effect.params))
  }
  return hooks
}
