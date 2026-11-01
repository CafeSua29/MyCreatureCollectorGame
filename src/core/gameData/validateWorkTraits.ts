// Kiểm tra dữ liệu trait làm việc / tốc độ làm việc (docs/rules/dwelling.md mục "Trait làm việc"):
// workTraits.json, config.dwelling (phần tốc độ, cô đặc, workTraits), `workSpeed` của loài.

import { validatePartialStats } from '../registries'
import {
  WORK_TRAIT_EFFECT_TYPES,
  WORK_TYPES,
  type GameData,
  type WorkTraitEffectType
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

type Raw = Readonly<Record<string, unknown>>

/** Luật theo loại hiệu ứng: trường ngoài `type` và kiểm tra tham số. */
const EFFECT_RULES: Record<
  WorkTraitEffectType,
  { fields: readonly string[]; check(effect: Raw, at: string): string[] }
> = {
  workSpeed: {
    fields: ['percent'],
    check: (effect, at) => checkNumber(effect.percent, `${at}.percent`)
  },
  workTypeSpeed: {
    fields: ['workType', 'percent'],
    check: (effect, at) => [
      ...((WORK_TYPES as readonly unknown[]).includes(effect.workType)
        ? []
        : [`${at}.workType phải là ${WORK_TYPES.join(' / ')}`]),
      ...checkNumber(effect.percent, `${at}.percent`)
    ]
  },
  hungerRate: {
    fields: ['percent'],
    check: (effect, at) => checkNumber(effect.percent, `${at}.percent`)
  },
  sanityRate: {
    fields: ['percent'],
    check: (effect, at) => checkNumber(effect.percent, `${at}.percent`)
  },
  nocturnal: { fields: [], check: () => [] },
  statPercent: {
    fields: ['stats'],
    check: (effect, at) =>
      effect.stats === undefined
        ? [`${at}.stats bắt buộc`]
        : validatePartialStats(effect.stats, `${at}.stats`)
  }
}

function checkEffects(value: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where}: effects phải là danh sách không rỗng`)
    return
  }
  value.forEach((entry: unknown, i: number) => {
    const at = `${where}: effects[${i}]`
    const effect = asObject(entry)
    const type = effect?.type
    if (!effect || !(WORK_TRAIT_EFFECT_TYPES as readonly unknown[]).includes(type)) {
      issues.push(`${at}.type phải là ${WORK_TRAIT_EFFECT_TYPES.join(' / ')}`)
      return
    }
    // Ép kiểu: vừa kiểm tra type nằm trong WORK_TRAIT_EFFECT_TYPES.
    const rule = EFFECT_RULES[type as WorkTraitEffectType]
    checkKnownFields(effect, ['type', ...rule.fields], at, `hiệu ứng "${String(type)}"`, issues)
    issues.push(...rule.check(effect, at))
  })
}

function checkTraitConfig(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.dwelling.workTraits'
  const config = asObject(value)
  if (!config) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(
    config,
    ['countWeights', 'inheritChance', 'mutationChance', 'shinyTraitId'],
    at,
    'config',
    issues
  )
  const weights = config.countWeights
  if (
    !Array.isArray(weights) ||
    weights.length === 0 ||
    weights.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0) ||
    !weights.some((w) => (w as number) > 0)
  ) {
    issues.push(`${at}.countWeights phải là danh sách số ≥ 0 không rỗng, ít nhất một số > 0`)
  }
  issues.push(...checkNumber(config.inheritChance, `${at}.inheritChance`, 0, 100))
  issues.push(...checkNumber(config.mutationChance, `${at}.mutationChance`, 0, 100))
  const shiny = config.shinyTraitId
  if (shiny !== null && (typeof shiny !== 'string' || !Object.hasOwn(data.workTraits, shiny))) {
    issues.push(`${at}.shinyTraitId: trait làm việc không tồn tại "${String(shiny)}"`)
  }
}

/** Kiểm tra workTraits.json, phần tốc độ / cô đặc / trait của config.dwelling, `workSpeed` của loài. */
export function checkWorkTraitData(data: GameData, issues: string[]): void {
  for (const def of Object.values(data.workTraits)) {
    const where = `Trait làm việc "${def.id}"`
    checkKnownFields(def, ['id', 'weight', 'group', 'effects'], where, 'trait làm việc', issues)
    issues.push(...checkNumber(def.weight, `${where}: weight`, 0))
    if (def.group !== undefined && (typeof def.group !== 'string' || def.group === '')) {
      issues.push(`${where}: group phải là chuỗi không rỗng`)
    }
    checkEffects(def.effects, where, issues)
  }
  const config = asObject(data.config.dwelling)
  if (!config) return
  const at = (field: string): string => `config.dwelling.${field}`
  issues.push(...checkNumber(config.baseWorkSpeed, at('baseWorkSpeed'), 0))
  issues.push(...checkNumber(config.minWorkSpeed, at('minWorkSpeed'), 0))
  issues.push(...checkInteger(config.condenseStacks, at('condenseStacks'), 1))
  issues.push(...checkInteger(config.condensePercent, at('condensePercent'), 0))
  issues.push(
    ...checkNumber(config.soulWorkSpeedPercentPerLevel, at('soulWorkSpeedPercentPerLevel'), 0)
  )
  checkTraitConfig(data, config.workTraits, issues)
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.workSpeed === undefined) continue
    issues.push(...checkNumber(species.workSpeed, `Loài "${species.id}".workSpeed`, 0))
  }
}
