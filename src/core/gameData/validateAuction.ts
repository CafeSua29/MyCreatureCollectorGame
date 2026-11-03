// Kiểm tra dữ liệu Đấu giá hành (docs/rules/auction.md): config.auction.

import { AUCTION_LOT_KINDS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkIntRange, checkKnownFields } from './checks'
import { checkRarityWeights } from './validateEquipment'

const CONFIG_FIELDS = [
  'sessionDays',
  'lotCount',
  'lotWeights',
  'startPercent',
  'npcMinPercent',
  'npcMaxPercent',
  'equipmentRarityWeights',
  'equipmentMinRollPercent',
  'itemCount',
  'bookReusableChance',
  'eggCatchRatePower',
  'eggValuePerFloor',
  'eggRankMultipliers',
  'consignMinPercent',
  'consignMaxPercent',
  'feePercent'
]

/** Cặp % nguyên min ≤ max (≥ 0). */
function checkPercentPair(
  config: Record<string, unknown>,
  [minKey, maxKey]: readonly [string, string],
  issues: string[]
): void {
  const at = (key: string): string => `config.auction.${key}`
  issues.push(...checkInteger(config[minKey], at(minKey), 0))
  issues.push(...checkInteger(config[maxKey], at(maxKey), 0))
  const min = config[minKey]
  const max = config[maxKey]
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    issues.push(`${at(minKey)} phải ≤ ${maxKey}`)
  }
}

/** Kiểm tra config.auction. */
export function checkAuctionData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.auction)
  if (!config) {
    issues.push('config.auction phải là object')
    return
  }
  const at = (field: string): string => `config.auction.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.auction', 'config', issues)
  issues.push(...checkInteger(config.sessionDays, at('sessionDays'), 1))
  checkIntRange(config.lotCount, at('lotCount'), 0, issues)
  const weights = asObject(config.lotWeights)
  if (!weights) issues.push(`${at('lotWeights')} phải là object`)
  else {
    checkKnownFields(weights, [...AUCTION_LOT_KINDS], at('lotWeights'), 'config', issues)
    for (const kind of AUCTION_LOT_KINDS) {
      issues.push(...checkNumber(weights[kind], `${at('lotWeights')}.${kind}`, 0))
    }
  }
  issues.push(...checkNumber(config.startPercent, at('startPercent'), 0))
  checkPercentPair(config, ['npcMinPercent', 'npcMaxPercent'], issues)
  checkRarityWeights(config.equipmentRarityWeights, at('equipmentRarityWeights'), issues)
  issues.push(...checkNumber(config.equipmentMinRollPercent, at('equipmentMinRollPercent'), 0, 100))
  checkIntRange(config.itemCount, at('itemCount'), 1, issues)
  issues.push(...checkNumber(config.bookReusableChance, at('bookReusableChance'), 0, 100))
  issues.push(...checkNumber(config.eggCatchRatePower, at('eggCatchRatePower')))
  issues.push(...checkNumber(config.eggValuePerFloor, at('eggValuePerFloor'), 0))
  const ranks = config.eggRankMultipliers
  if (
    !Array.isArray(ranks) ||
    ranks.length === 0 ||
    ranks.some((m) => typeof m !== 'number' || !Number.isFinite(m) || m < 0)
  ) {
    issues.push(`${at('eggRankMultipliers')} phải là danh sách số ≥ 0 không rỗng`)
  }
  checkPercentPair(config, ['consignMinPercent', 'consignMaxPercent'], issues)
  issues.push(...checkNumber(config.feePercent, at('feePercent'), 0, 100))
}
