// Kiểm tra config.forge (Thợ rèn: cường hóa, tẩy luyện, phân giải, luyện khí, đúc trang bị;
// docs/rules/equipment-forge.md).

import { EQUIPMENT_RARITIES, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkDrops, checkKnownFields, checkStackItemId } from './checks'
import { checkRarityTable, checkRarityWeights } from './validateEquipment'
import { checkItemGroupId } from './validateItemGroups'

const FIELDS = [
  'enhanceStoneItemId',
  'refiningStoneItemId',
  'enhanceBase',
  'rerollCost',
  'salvageStones',
  'salvageRefundPercent',
  'salvageRefiningChance',
  'salvageSoulPoints',
  'bossDrops',
  'expBase',
  'expPower',
  'levelBonusPercent',
  'enhanceExp',
  'coreEnhance',
  'cast',
  'imbue'
]

const CORE_ENHANCE_FIELDS = ['groupId', 'fromLevel', 'step']

const CAST_FIELDS = [
  'minLevel',
  'maxCores',
  'money',
  'exp',
  'rarityWeights',
  'coreFactor',
  'levelFactor'
]

/** Cấp luyện khí và exp mỗi lần cường hóa. */
function checkSmithing(config: Record<string, unknown>, field: string, issues: string[]): void {
  issues.push(...checkNumber(config.expBase, `${field}.expBase`, Number.MIN_VALUE))
  issues.push(...checkNumber(config.expPower, `${field}.expPower`, Number.MIN_VALUE))
  issues.push(...checkNumber(config.levelBonusPercent, `${field}.levelBonusPercent`, 0))
  issues.push(...checkNumber(config.enhanceExp, `${field}.enhanceExp`, 0))
}

/** coreEnhance: nhóm tồn tại, fromLevel nguyên ≥ 1, step nguyên ≥ 1. */
function checkCoreEnhance(data: GameData, value: unknown, field: string, issues: string[]): void {
  const config = asObject(value)
  if (!config) {
    issues.push(`${field} phải là object`)
    return
  }
  checkKnownFields(config, CORE_ENHANCE_FIELDS, field, 'config', issues)
  issues.push(...checkItemGroupId(data, config.groupId, field))
  issues.push(...checkInteger(config.fromLevel, `${field}.fromLevel`, 1))
  issues.push(...checkInteger(config.step, `${field}.step`, 1))
}

/** cast: số nguyên ≥ 1, tiền / exp / hệ số ≥ 0, bảng bậc thường. */
function checkCast(value: unknown, field: string, issues: string[]): void {
  const config = asObject(value)
  if (!config) {
    issues.push(`${field} phải là object`)
    return
  }
  checkKnownFields(config, CAST_FIELDS, field, 'config', issues)
  issues.push(...checkInteger(config.minLevel, `${field}.minLevel`, 1))
  issues.push(...checkInteger(config.maxCores, `${field}.maxCores`, 1))
  for (const key of ['money', 'exp', 'coreFactor', 'levelFactor']) {
    issues.push(...checkNumber(config[key], `${field}.${key}`, 0))
  }
  checkRarityWeights(config.rarityWeights, `${field}.rarityWeights`, issues)
}

/** config.forge: id đá gộp chồng, bảng số theo mọi bậc, đồ rơi boss. */
export function checkForgeConfig(data: GameData, issues: string[]): void {
  const field = 'config.forge'
  const config = asObject(data.config.forge)
  if (!config) {
    issues.push(`${field} phải là object`)
    return
  }
  checkKnownFields(config, FIELDS, field, 'config', issues)
  for (const key of ['enhanceStoneItemId', 'refiningStoneItemId']) {
    issues.push(...checkStackItemId(data, String(config[key]), `${field}.${key}`, 'đá'))
  }
  issues.push(...checkNumber(config.enhanceBase, `${field}.enhanceBase`, 0))
  issues.push(...checkNumber(config.salvageRefundPercent, `${field}.salvageRefundPercent`, 0, 100))
  const integer = (entry: unknown, at: string): string[] => checkInteger(entry, at, 0)
  checkRarityTable(config.rerollCost, `${field}.rerollCost`, integer, issues)
  checkRarityTable(config.salvageStones, `${field}.salvageStones`, integer, issues)
  checkRarityTable(config.salvageSoulPoints, `${field}.salvageSoulPoints`, integer, issues)
  checkRarityTable(
    config.salvageRefiningChance,
    `${field}.salvageRefiningChance`,
    (entry, at) => checkNumber(entry, at, 0, 100),
    issues
  )
  if (!Array.isArray(config.bossDrops)) issues.push(`${field}.bossDrops phải là danh sách`)
  else checkDrops(data, config.bossDrops, `${field}.bossDrops`, issues)
  checkSmithing(config, field, issues)
  checkCoreEnhance(data, config.coreEnhance, `${field}.coreEnhance`, issues)
  checkCast(config.cast, `${field}.cast`, issues)
  checkImbue(data, config.imbue, `${field}.imbue`, issues)
}

const IMBUE_FIELDS = ['lineIds', 'cores', 'money', 'exp']

/** Một dòng linh hệ: hệ tồn tại và có yêu đan, dòng phụ tồn tại, weight 0, đủ khoảng mọi bậc. */
function checkImbueLine(
  data: GameData,
  { elementId, lineId, at }: { elementId: string; lineId: unknown; at: string },
  issues: string[]
): void {
  if (!Object.hasOwn(data.elements, elementId)) issues.push(`${at}: hệ không tồn tại`)
  if (!Object.hasOwn(data.config.treasures.demonCoreItemIds, elementId)) {
    issues.push(`${at}: hệ không có yêu đan (config.treasures.demonCoreItemIds)`)
  }
  const affix = typeof lineId === 'string' ? data.equipmentAffixes[lineId] : undefined
  if (!affix) {
    issues.push(`${at}: dòng phụ không tồn tại "${String(lineId)}"`)
    return
  }
  if (affix.weight !== 0)
    issues.push(`${at}: dòng linh hệ phải có weight 0 (không tung ngẫu nhiên)`)
  const missing = EQUIPMENT_RARITIES.filter((rarity) => !affix.ranges[rarity])
  if (missing.length > 0) issues.push(`${at}: thiếu khoảng cho bậc ${missing.join(', ')}`)
}

/** imbue: mỗi hệ một dòng linh hệ hợp lệ; số yêu đan nguyên ≥ 0 cho mọi bậc; tiền / exp ≥ 0. */
function checkImbue(data: GameData, value: unknown, field: string, issues: string[]): void {
  const config = asObject(value)
  if (!config) {
    issues.push(`${field} phải là object`)
    return
  }
  checkKnownFields(config, IMBUE_FIELDS, field, 'config', issues)
  const lineIds = asObject(config.lineIds)
  if (!lineIds) issues.push(`${field}.lineIds phải là object hệ → id dòng`)
  for (const [elementId, lineId] of Object.entries(lineIds ?? {})) {
    checkImbueLine(data, { elementId, lineId, at: `${field}.lineIds.${elementId}` }, issues)
  }
  const integer = (entry: unknown, at: string): string[] => checkInteger(entry, at, 0)
  checkRarityTable(config.cores, `${field}.cores`, integer, issues)
  issues.push(...checkNumber(config.money, `${field}.money`, 0))
  issues.push(...checkNumber(config.exp, `${field}.exp`, 0))
}
