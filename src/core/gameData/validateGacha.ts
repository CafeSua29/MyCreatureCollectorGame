// Kiểm tra dữ liệu Cây thần (docs/rules/gacha.md): config.gacha, trường gachaWeight của loài.

import { preEvolutionsOf } from '../inventory'
import { BATTLE_FORM_KINDS, TRAIT_KINDS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'
import { checkTraitKindWeights } from './validateConfig'

const CONFIG_FIELDS = [
  'costBase',
  'pullOptions',
  'rankWeights',
  'traitKindWeights',
  'traitKindFloorGrowth',
  'traitKindFloorFalloff'
]

function checkPullOptions(value: unknown, issues: string[]): void {
  const at = 'config.gacha.pullOptions'
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${at} phải là danh sách không rỗng`)
    return
  }
  const counts = new Set<unknown>()
  value.forEach((entry: unknown, i) => {
    const option = asObject(entry)
    if (!option) {
      issues.push(`${at}[${i}] phải là object`)
      return
    }
    checkKnownFields(option, ['count', 'costMultiplier'], `${at}[${i}]`, 'config', issues)
    issues.push(...checkInteger(option.count, `${at}[${i}].count`, 1))
    issues.push(...checkNumber(option.costMultiplier, `${at}[${i}].costMultiplier`, 0))
    if (counts.has(option.count)) issues.push(`${at}: trùng count ${String(option.count)}`)
    counts.add(option.count)
  })
}

/** Hệ số theo tầng: khóa là loại trait, số ≥ 0. */
function checkFloorScaling(value: unknown, at: string, issues: string[]): void {
  const scaling = asObject(value)
  if (!scaling) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(scaling, [...TRAIT_KINDS], at, 'config', issues)
  for (const [kind, amount] of Object.entries(scaling)) {
    issues.push(...checkNumber(amount, `${at}.${kind}`, 0))
  }
}

/** gachaWeight là số ≥ 0; trọng số > 0 chỉ ở dạng đầu (trứng luôn nở ra dạng đầu). */
function checkSpeciesWeights(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.gachaWeight === undefined) continue
    const where = `Loài "${species.id}"`
    issues.push(...checkNumber(species.gachaWeight, `${where}: gachaWeight`, 0))
    if (!(species.gachaWeight > 0)) continue
    const isBattleForm = BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')
    if (isBattleForm || preEvolutionsOf(data, species.id).length > 0) {
      issues.push(`${where}: gachaWeight > 0 chỉ dành cho loài dạng đầu`)
    }
  }
}

/** Kiểm tra config.gacha và gachaWeight của loài. */
export function checkGachaData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.gacha)
  if (!config) {
    issues.push('config.gacha phải là object')
    return
  }
  const at = (field: string): string => `config.gacha.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.gacha', 'config', issues)
  issues.push(...checkNumber(config.costBase, at('costBase'), 0))
  checkPullOptions(config.pullOptions, issues)
  const ranks = config.rankWeights
  if (
    !Array.isArray(ranks) ||
    ranks.length === 0 ||
    ranks.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0)
  ) {
    issues.push(`${at('rankWeights')} phải là danh sách số ≥ 0 không rỗng`)
  }
  issues.push(...checkTraitKindWeights(config.traitKindWeights, at('traitKindWeights')))
  checkFloorScaling(config.traitKindFloorGrowth, at('traitKindFloorGrowth'), issues)
  checkFloorScaling(config.traitKindFloorFalloff, at('traitKindFloorFalloff'), issues)
  checkSpeciesWeights(data, issues)
}
