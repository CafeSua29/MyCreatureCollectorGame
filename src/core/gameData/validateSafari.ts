// Kiểm tra dữ liệu khu bảo tồn (docs/rules/safari-zone.md): config.safari.

import { SAFARI_LURES, type GameData, type SafariConfig, type SafariLureConfig } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields, fieldList } from './checks'

const WHERE = 'config.safari'

const FIELDS = fieldList<SafariConfig>({
  entryFeeBase: true,
  balls: true,
  encounters: true,
  ballCatchMultiplier: true,
  rotationDays: true,
  rosterSize: true,
  unmappedChance: true,
  rarityWeightBase: true,
  rarityExponent: true,
  rankFalloff: true,
  fleeBase: true,
  fleeRarity: true,
  lures: true
})

const LURE_FIELDS = fieldList<SafariLureConfig>({
  catchMultiplier: true,
  fleeMultiplier: true,
  turns: true
})

/** Mồi / đá: hệ số ≥ 0, số lượt nguyên ≥ 1. */
function checkLures(value: unknown, issues: string[]): void {
  const lures = asObject(value)
  if (!lures) {
    issues.push(`${WHERE}.lures phải là object`)
    return
  }
  checkKnownFields(lures, SAFARI_LURES, `${WHERE}.lures`, 'loại ném', issues)
  for (const kind of SAFARI_LURES) {
    const where = `${WHERE}.lures.${kind}`
    const lure = asObject(lures[kind])
    if (!lure) {
      issues.push(`${where} phải là object`)
      continue
    }
    checkKnownFields(lure, LURE_FIELDS, where, 'config', issues)
    issues.push(...checkNumber(lure.catchMultiplier, `${where}.catchMultiplier`, 0))
    issues.push(...checkNumber(lure.fleeMultiplier, `${where}.fleeMultiplier`, 0))
    issues.push(...checkInteger(lure.turns, `${where}.turns`, 1))
  }
}

/** Kiểm tra config.safari. */
export function checkSafariData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.safari)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, FIELDS, WHERE, 'config', issues)
  issues.push(...checkNumber(config.entryFeeBase, `${WHERE}.entryFeeBase`, 0))
  issues.push(...checkInteger(config.balls, `${WHERE}.balls`, 1))
  issues.push(...checkInteger(config.encounters, `${WHERE}.encounters`, 1))
  issues.push(...checkNumber(config.ballCatchMultiplier, `${WHERE}.ballCatchMultiplier`, 0))
  issues.push(...checkInteger(config.rotationDays, `${WHERE}.rotationDays`, 1))
  issues.push(...checkInteger(config.rosterSize, `${WHERE}.rosterSize`, 1))
  issues.push(...checkNumber(config.unmappedChance, `${WHERE}.unmappedChance`, 0, 100))
  // Trọng số mọi loài phải > 0 (mọi loài hợp lệ đều có cơ hội vào danh sách).
  issues.push(
    ...checkNumber(config.rarityWeightBase, `${WHERE}.rarityWeightBase`, Number.MIN_VALUE)
  )
  issues.push(...checkNumber(config.rarityExponent, `${WHERE}.rarityExponent`, 0))
  issues.push(...checkNumber(config.rankFalloff, `${WHERE}.rankFalloff`, Number.MIN_VALUE, 1))
  issues.push(...checkNumber(config.fleeBase, `${WHERE}.fleeBase`, 0, 100))
  issues.push(...checkNumber(config.fleeRarity, `${WHERE}.fleeRarity`, 0, 100))
  checkLures(config.lures, issues)
}
