// Luật bí cảnh / tháp thí luyện (docs/rules/trials.md): mỗi loại một handler (trường, kiểm tra
// params, có ở tháp không). Nơi áp luật hỏi qua các hàm tra cứu dưới đây, không tự rẽ nhánh theo id.

import { checkNumber, nextInt, pick, pickWeighted, type RngState } from '../shared'
import {
  GLOBAL_FIELD_LAYERS,
  type GameData,
  type GlobalFieldLayer,
  type Monster,
  type TrialRule,
  type TrialRuleType
} from '../model'
import { checkFieldIdList } from './paramChecks'

export interface TrialRuleHandler {
  /** Trường của params. */
  fields: readonly string[]
  validateParams(params: Readonly<Record<string, unknown>>, data: GameData): string[]
  /**
   * Có ở tháp thí luyện không: tầng tháp tất định theo số tầng, luật cần đội người chơi (một hệ)
   * thì có thể chặn mãi một tầng nên không dùng ở tháp.
   */
  inTower: boolean
  /** Luật tung kèm một hệ (trong các hệ của đội lúc vào bí cảnh). */
  needsElement: boolean
}

const flag = (inTower = true): TrialRuleHandler => ({
  fields: [],
  validateParams: () => [],
  inTower,
  needsElement: false
})

/** Luật bí cảnh theo loại; thêm loại = thêm một handler (TypeScript báo khi thiếu). */
export const TRIAL_RULES: Readonly<Record<TrialRuleType, TrialRuleHandler>> = {
  // Không dùng vật phẩm trong trận, không dùng vật phẩm ngoài trận giữa các trận.
  noItems: flag(),
  // Chỉ quái mang hệ của luật vào trận (hệ tung lúc vào bí cảnh).
  monoElement: { ...flag(false), needsElement: true },
  // Thời tiết / địa hình cố định cả trận (lớp không ghi thì theo map).
  fixedField: {
    fields: GLOBAL_FIELD_LAYERS,
    inTower: true,
    needsElement: false,
    validateParams(params, data) {
      const layers = GLOBAL_FIELD_LAYERS.filter((layer) => params[layer] !== undefined)
      if (layers.length === 0) return ['cần ít nhất một lớp weather / terrain']
      return layers.flatMap((layer) => checkFieldIdList(data, [params[layer]], layer, layer))
    }
  },
  // Mọi trận là trận boss.
  bossOnly: flag(),
  // Không phe nào biến hình (kể cả Primal).
  noTransforms: flag(),
  // Không phe nào có ngự thú sư trong trận.
  noTamerSkills: flag(),
  // Chỉ số quái địch × value (nhân vào bossMultiplier).
  enemyMultiplier: {
    fields: ['value'],
    inTower: true,
    needsElement: false,
    validateParams: (params) => checkNumber(params.value, 'value', 1)
  },
  // Không hồi máu sau mỗi trận, không dùng vật phẩm ngoài trận giữa các trận.
  noHealing: flag()
}

const typeOf = (data: GameData, rule: TrialRule): TrialRuleType => data.trialRules[rule.ruleId].type

/** Danh sách luật có luật loại `type` không. */
export const hasTrialRule = (
  data: GameData,
  rules: readonly TrialRule[] | undefined,
  type: TrialRuleType
): boolean => (rules ?? []).some((rule) => typeOf(data, rule) === type)

/** Môi trường cố định của các luật fixedField (luật sau ghi đè lớp của luật trước). */
export function trialFixedField(
  data: GameData,
  rules: readonly TrialRule[]
): Partial<Record<GlobalFieldLayer, string>> {
  const fixed: Partial<Record<GlobalFieldLayer, string>> = {}
  for (const rule of rules) {
    const def = data.trialRules[rule.ruleId]
    if (def.type !== 'fixedField') continue
    for (const layer of GLOBAL_FIELD_LAYERS) {
      const fieldId = def.params[layer]
      if (typeof fieldId === 'string') fixed[layer] = fieldId
    }
  }
  return fixed
}

/** Hệ số chỉ số quái địch: tích value của mọi luật enemyMultiplier (không có = 1). */
export function trialEnemyMultiplier(data: GameData, rules: readonly TrialRule[]): number {
  return rules.reduce((product, rule) => {
    const def = data.trialRules[rule.ruleId]
    return def.type === 'enemyMultiplier' ? product * (def.params.value as number) : product
  }, 1)
}

/** Quái của đội được vào trận theo luật (monoElement: chỉ quái mang hệ của luật). */
export function trialFighters(
  data: GameData,
  party: readonly Monster[],
  rules: readonly TrialRule[]
): Monster[] {
  const elementIds = rules.flatMap((rule) =>
    typeOf(data, rule) === 'monoElement' && rule.elementId !== null ? [rule.elementId] : []
  )
  return party.filter((monster) => elementIds.every((id) => monster.elementIds.includes(id)))
}

/**
 * Tung luật cho bí cảnh / tầng tháp: số luật đều trong `count`, mỗi luật theo trọng số, không trùng
 * loại; luật cần hệ lấy đều trong `elementIds` (rỗng thì bỏ luật đó). Tháp chỉ lấy luật `inTower`.
 */
export function rollTrialRules(
  data: GameData,
  rng: RngState,
  {
    count,
    inTower,
    elementIds
  }: { count: { min: number; max: number }; inTower: boolean; elementIds: readonly string[] }
): [TrialRule[], RngState] {
  let size: number
  ;[size, rng] = nextInt(rng, count.min, count.max)
  let candidates = Object.values(data.trialRules).filter((def) => {
    const handler = TRIAL_RULES[def.type]
    return (
      def.weight > 0 &&
      (!inTower || handler.inTower) &&
      (!handler.needsElement || elementIds.length > 0)
    )
  })
  const rules: TrialRule[] = []
  while (rules.length < size && candidates.length > 0) {
    let def: (typeof candidates)[number]
    ;[def, rng] = pickWeighted(rng, candidates, (candidate) => candidate.weight)
    let elementId: string | null = null
    if (TRIAL_RULES[def.type].needsElement) [elementId, rng] = pick(rng, elementIds)
    rules.push({ ruleId: def.id, elementId })
    candidates = candidates.filter((candidate) => candidate.type !== def.type)
  }
  return [rules, rng]
}
