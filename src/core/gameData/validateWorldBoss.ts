// Kiểm tra dữ liệu boss thế giới (docs/rules/world-boss.md): config.worldBoss (chu kỳ, số lượt, level,
// hệ số boss, trọng số phẩm cấp loài, bậc thưởng tăng dần) và vai trò cuồng bạo kích hoạt theo lượt.

import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkItemRewards, checkKnownFields } from './checks'

const WHERE = 'config.worldBoss'

const CONFIG_FIELDS = [
  'everyDays',
  'activeDays',
  'turns',
  'levelOffset',
  'bossMultiplier',
  'rankWeights',
  'largeWeight',
  'tiers'
]

const TIER_FIELDS = ['id', 'minHpMultiple', 'moneyMultiple', 'items', 'skillBooks', 'eggChance']

/** Bậc thưởng: id không trùng, ngưỡng > 0 tăng dần ngặt, số thưởng ≥ 0, tỉ lệ trứng 0–100. */
function checkTiers(data: GameData, value: unknown, issues: string[]): void {
  const at = `${WHERE}.tiers`
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${at} phải là danh sách không rỗng`)
    return
  }
  const ids = new Set<string>()
  let previous = 0
  value.forEach((raw: unknown, i) => {
    const tier = asObject(raw) ?? {}
    const where = `${at}[${i}]`
    checkKnownFields(tier, TIER_FIELDS, where, 'bậc thưởng', issues)
    if (typeof tier.id !== 'string' || tier.id === '') issues.push(`${where}.id phải là chuỗi`)
    else if (ids.has(tier.id)) issues.push(`${where}.id bị trùng "${tier.id}"`)
    else ids.add(tier.id)
    const minHpMultiple = tier.minHpMultiple
    issues.push(...checkNumber(minHpMultiple, `${where}.minHpMultiple`, 0))
    if (typeof minHpMultiple === 'number' && minHpMultiple <= previous) {
      issues.push(`${where}.minHpMultiple phải > 0 và lớn hơn bậc trước (${previous})`)
    }
    if (typeof minHpMultiple === 'number') previous = minHpMultiple
    issues.push(...checkNumber(tier.moneyMultiple, `${where}.moneyMultiple`, 0))
    checkItemRewards(data, tier.items, `${where}.items`, issues)
    issues.push(...checkInteger(tier.skillBooks, `${where}.skillBooks`, 0))
    issues.push(...checkNumber(tier.eggChance, `${where}.eggChance`, 0, 100))
  })
}

/** Kiểm tra config.worldBoss. */
export function checkWorldBossData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.worldBoss)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, CONFIG_FIELDS, WHERE, 'config', issues)
  issues.push(...checkInteger(config.everyDays, `${WHERE}.everyDays`, 1))
  issues.push(...checkInteger(config.activeDays, `${WHERE}.activeDays`, 1))
  if (
    typeof config.everyDays === 'number' &&
    typeof config.activeDays === 'number' &&
    config.activeDays > config.everyDays
  ) {
    issues.push(`${WHERE}.activeDays không được vượt everyDays`)
  }
  issues.push(...checkInteger(config.turns, `${WHERE}.turns`, 1))
  issues.push(...checkInteger(config.levelOffset, `${WHERE}.levelOffset`))
  issues.push(...checkNumber(config.bossMultiplier, `${WHERE}.bossMultiplier`, 1))
  issues.push(...checkNumber(config.largeWeight, `${WHERE}.largeWeight`, 0))
  const ranks = config.rankWeights
  if (
    !Array.isArray(ranks) ||
    ranks.length === 0 ||
    ranks.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0)
  ) {
    issues.push(`${WHERE}.rankWeights phải là danh sách số ≥ 0 không rỗng`)
  }
  checkTiers(data, config.tiers, issues)
}
