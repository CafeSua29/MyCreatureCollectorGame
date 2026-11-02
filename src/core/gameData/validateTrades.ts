// Kiểm tra dữ liệu trao đổi với NPC (docs/rules/trades.md): config.trades.

import { TRADE_WANT_KINDS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const CONFIG_FIELDS = [
  'refreshDays',
  'offerCount',
  'wantWeights',
  'giveWeights',
  'wantLevelPercent',
  'giveRankWeights',
  'giveLevelOffset',
  'giveGeneMultiplier',
  'giveShinyMultiplier',
  'itemWeightPower',
  'expBonusPercent'
]

/** Bảng trọng số theo đúng danh sách khóa: số ≥ 0, không khóa lạ. */
function checkWeights(
  value: unknown,
  { at, keys }: { at: string; keys: readonly string[] },
  issues: string[]
): void {
  const weights = asObject(value)
  if (!weights) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(weights, [...keys], at, 'config', issues)
  for (const key of keys) issues.push(...checkNumber(weights[key], `${at}.${key}`, 0))
}

/** Kiểm tra config.teamPresets (đội hình mẫu, docs/rules/roster.md). */
export function checkTeamPresetData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.teamPresets)
  if (!config) {
    issues.push('config.teamPresets phải là object')
    return
  }
  checkKnownFields(config, ['slots'], 'config.teamPresets', 'config', issues)
  issues.push(...checkInteger(config.slots, 'config.teamPresets.slots', 1))
}

/** Kiểm tra config.trades. */
export function checkTradeData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.trades)
  if (!config) {
    issues.push('config.trades phải là object')
    return
  }
  const at = (field: string): string => `config.trades.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.trades', 'config', issues)
  issues.push(...checkInteger(config.refreshDays, at('refreshDays'), 1))
  const count = asObject(config.offerCount)
  if (!count) issues.push(`${at('offerCount')} phải là object { min, max }`)
  else {
    issues.push(...checkInteger(count.min, `${at('offerCount')}.min`, 0))
    issues.push(...checkInteger(count.max, `${at('offerCount')}.max`, 0))
    if (typeof count.min === 'number' && typeof count.max === 'number' && count.min > count.max) {
      issues.push(`${at('offerCount')}: min > max`)
    }
  }
  checkWeights(config.wantWeights, { at: at('wantWeights'), keys: TRADE_WANT_KINDS }, issues)
  checkWeights(config.giveWeights, { at: at('giveWeights'), keys: ['monster', 'item'] }, issues)
  issues.push(...checkNumber(config.wantLevelPercent, at('wantLevelPercent'), 0))
  const ranks = config.giveRankWeights
  if (
    !Array.isArray(ranks) ||
    ranks.length === 0 ||
    ranks.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0)
  ) {
    issues.push(`${at('giveRankWeights')} phải là danh sách số ≥ 0 không rỗng`)
  }
  issues.push(...checkInteger(config.giveLevelOffset, at('giveLevelOffset')))
  issues.push(...checkNumber(config.giveGeneMultiplier, at('giveGeneMultiplier'), 0))
  issues.push(...checkNumber(config.giveShinyMultiplier, at('giveShinyMultiplier'), 0))
  issues.push(...checkNumber(config.expBonusPercent, at('expBonusPercent'), -100))
  issues.push(...checkNumber(config.itemWeightPower, at('itemWeightPower'), 0))
}
