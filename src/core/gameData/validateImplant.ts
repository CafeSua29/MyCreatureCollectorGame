// Kiểm tra dữ liệu cấy ghép (docs/rules/implant.md): config.implant (bậc theo loại hiệu ứng,
// SERUM_EFFECTS), serumEffects.json (hook / hook ngược qua TRAIT_HOOKS).

import {
  SERUM_EFFECT_KINDS,
  type GameData,
  type ImplantConfig,
  type SerumEffectDef
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { SERUM_EFFECTS, TRAIT_HOOKS } from '../registries'
import { checkEffects, checkKnownFields, fieldList } from './checks'

const WHERE = 'config.implant'

const FIELDS = fieldList<ImplantConfig>({
  tiers: true,
  stockMin: true,
  stockMax: true,
  restockDays: true,
  baseChance: true,
  chanceFalloff: true,
  maxFails: true
})

/** Trường chung của mọi bậc (trường riêng theo loại: SERUM_EFFECTS[kind].tierFields). */
const TIER_BASE_FIELDS = ['id', 'kind', 'weight', 'price'] as const

const EFFECT_FIELDS = fieldList<SerumEffectDef>({
  id: true,
  weight: true,
  hooks: true,
  failHooks: true
})

function checkTier(
  data: GameData,
  value: unknown,
  { where, ids, issues }: { where: string; ids: Set<string>; issues: string[] }
): void {
  const tier = asObject(value)
  if (!tier) {
    issues.push(`${where} phải là object`)
    return
  }
  if (typeof tier.id !== 'string' || tier.id === '') issues.push(`${where}.id phải là chuỗi`)
  else if (ids.has(tier.id)) issues.push(`${where}.id bị trùng "${tier.id}"`)
  else ids.add(tier.id)
  // Mọi bậc đều có cơ hội xuất hiện (trọng số > 0).
  issues.push(...checkNumber(tier.weight, `${where}.weight`, Number.MIN_VALUE))
  issues.push(...checkNumber(tier.price, `${where}.price`, 0))
  const kind = SERUM_EFFECT_KINDS.find((entry) => entry === tier.kind)
  if (!kind) {
    issues.push(`${where}.kind không hợp lệ "${String(tier.kind)}"`)
    return
  }
  const handler = SERUM_EFFECTS[kind]
  checkKnownFields(tier, [...TIER_BASE_FIELDS, ...handler.tierFields], where, 'bậc', issues)
  issues.push(...handler.validateTier(data, tier, where))
}

/** serumEffects.json: trọng số > 0, hook và hook ngược khác rỗng, đúng tham số. */
function checkEffectDefs(data: GameData, issues: string[]): void {
  for (const effect of Object.values(data.serumEffects)) {
    const where = `Hiệu ứng cấy "${effect.id}"`
    checkKnownFields(effect, EFFECT_FIELDS, where, 'hiệu ứng cấy', issues)
    issues.push(...checkNumber(effect.weight, `${where}: weight`, Number.MIN_VALUE))
    for (const field of ['hooks', 'failHooks'] as const) {
      const hooks = effect[field]
      if (!Array.isArray(hooks) || hooks.length === 0) {
        issues.push(`${where}: ${field} phải là danh sách hook khác rỗng`)
        continue
      }
      checkEffects(TRAIT_HOOKS, hooks, `${where} (${field})`, data, issues)
    }
  }
}

/** Kiểm tra config.implant. */
export function checkImplantData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.implant)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, FIELDS, WHERE, 'config', issues)
  if (!Array.isArray(config.tiers) || config.tiers.length === 0) {
    issues.push(`${WHERE}.tiers phải là danh sách bậc khác rỗng`)
  } else {
    const ids = new Set<string>()
    config.tiers.forEach((tier, i) =>
      checkTier(data, tier, { where: `${WHERE}.tiers[${i}]`, ids, issues })
    )
  }
  issues.push(...checkInteger(config.stockMin, `${WHERE}.stockMin`, 1))
  issues.push(...checkInteger(config.stockMax, `${WHERE}.stockMax`, 1))
  if (
    typeof config.stockMin === 'number' &&
    typeof config.stockMax === 'number' &&
    config.stockMin > config.stockMax
  ) {
    issues.push(`${WHERE}: stockMin (${config.stockMin}) lớn hơn stockMax (${config.stockMax})`)
  }
  issues.push(...checkInteger(config.restockDays, `${WHERE}.restockDays`, 1))
  issues.push(...checkNumber(config.baseChance, `${WHERE}.baseChance`, 0, 100))
  issues.push(...checkNumber(config.chanceFalloff, `${WHERE}.chanceFalloff`, 0, 1))
  issues.push(...checkInteger(config.maxFails, `${WHERE}.maxFails`, 1))
  checkEffectDefs(data, issues)
}
