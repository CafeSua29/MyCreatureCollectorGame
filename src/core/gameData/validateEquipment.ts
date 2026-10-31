// Kiểm tra dữ liệu trang bị (mục "Trang bị và đồ cầm" ở equipment.md): dòng của trang bị gốc,
// món unique, dòng phụ (equipmentAffixes.json), danh sách trang bị rơi của map, config.equipment.
// Dòng là hook trait có giá trị random: hook được kiểm tra bằng validateParams với giá trị ở cả hai
// đầu khoảng của mọi bậc.

import { TRAIT_HOOKS } from '../registries'
import { lineParams, MAIN_LINE_ID } from '../inventory'
import {
  EQUIPMENT_RARITIES,
  NORMAL_RARITIES,
  SKILL_CATEGORIES,
  STAT_NAMES,
  type EquipmentLineDef,
  type EquipmentRarity,
  type GameData,
  allMaps
} from '../model'
import { asObject, checkInteger, checkMilestones, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

/** Item đọc từ JSON, chưa kiểm tra: đọc trường dạng unknown. */
type Raw = Readonly<Record<string, unknown>>

const LINE_FIELDS: readonly string[] = ['hook', 'valueParam', 'ranges', 'tags']
const UNIQUE_FIELDS: readonly string[] = ['bossSpeciesId', 'lines', 'aiHints']
const AI_HINT_FIELDS: readonly string[] = ['effectType', 'category', 'elementId', 'multiplier']

function isRarity(value: string): value is EquipmentRarity {
  return EQUIPMENT_RARITIES.some((rarity) => rarity === value)
}

/** Khoảng theo bậc: khóa là bậc, min ≤ max nguyên; `required` là các bậc bắt buộc có. */
function checkRanges(
  value: unknown,
  where: string,
  required: readonly EquipmentRarity[],
  issues: string[]
): void {
  const ranges = asObject(value)
  if (!ranges) {
    issues.push(`${where}.ranges phải là object bậc → { min, max }`)
    return
  }
  for (const [rarity, entry] of Object.entries(ranges)) {
    const at = `${where}.ranges.${rarity}`
    if (!isRarity(rarity)) {
      issues.push(`${at}: bậc không hợp lệ`)
      continue
    }
    const range = asObject(entry)
    if (!range) {
      issues.push(`${at} phải là { min, max }`)
      continue
    }
    checkKnownFields(range, ['min', 'max'], at, 'khoảng giá trị', issues)
    issues.push(...checkInteger(range.min, `${at}.min`))
    issues.push(...checkInteger(range.max, `${at}.max`, Number(range.min)))
  }
  for (const rarity of required) {
    if (ranges[rarity] === undefined) issues.push(`${where}.ranges thiếu bậc "${rarity}"`)
  }
}

/** Hook của dòng hợp lệ với giá trị ở hai đầu khoảng của mọi bậc khai báo. */
function checkLineHook(line: Raw, where: string, data: GameData, issues: string[]): void {
  const hook = asObject(line.hook)
  if (!hook || typeof hook.type !== 'string') {
    issues.push(`${where}.hook phải là { type, params }`)
    return
  }
  const handler = Object.hasOwn(TRAIT_HOOKS, hook.type) ? TRAIT_HOOKS[hook.type] : undefined
  if (!handler) {
    issues.push(`${where}.hook: hook trait không tồn tại "${hook.type}"`)
    return
  }
  const paths = typeof line.valueParam === 'string' ? [line.valueParam] : line.valueParam
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.some((path) => typeof path !== 'string' || path === '')
  ) {
    issues.push(`${where}.valueParam phải là chuỗi khác rỗng hoặc danh sách chuỗi khác rỗng`)
    return
  }
  const ranges = asObject(line.ranges) ?? {}
  const values = new Set<number>()
  for (const entry of Object.values(ranges)) {
    const range = asObject(entry)
    for (const value of [range?.min, range?.max]) {
      if (Number.isSafeInteger(value)) values.add(value as number)
    }
  }
  // Ép kiểu vì đã kiểm tra hook là { type, params } và valueParam là chuỗi.
  const typed = line as unknown as Pick<EquipmentLineDef, 'hook' | 'valueParam'>
  for (const value of values) {
    for (const problem of handler.validateParams(lineParams(typed, value), data)) {
      issues.push(`${where}.hook (giá trị ${value}): ${problem}`)
    }
  }
}

function checkTags(value: unknown, where: string, issues: string[]): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string' || tag === '')) {
    issues.push(`${where}.tags phải là danh sách chuỗi khác rỗng`)
  }
}

/** Một dòng (dòng chính, dòng unique, dòng phụ) với các trường riêng đã cho. */
function checkLine(
  value: unknown,
  where: string,
  {
    data,
    required,
    extraFields
  }: {
    data: GameData
    required: readonly EquipmentRarity[]
    extraFields: readonly string[]
  },
  issues: string[]
): void {
  const line = asObject(value)
  if (!line) {
    issues.push(`${where} phải là object dòng`)
    return
  }
  checkKnownFields(line, [...LINE_FIELDS, ...extraFields], where, 'dòng trang bị', issues)
  checkRanges(line.ranges, where, required, issues)
  checkTags(line.tags, where, issues)
  checkLineHook(line, where, data, issues)
}

function checkAiHints(value: unknown, where: string, data: GameData, issues: string[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push(`${where}.aiHints phải là danh sách`)
    return
  }
  value.forEach((entry: unknown, i) => {
    const at = `${where}.aiHints[${i}]`
    const hint = asObject(entry)
    if (!hint) {
      issues.push(`${at} phải là object`)
      return
    }
    checkKnownFields(hint, AI_HINT_FIELDS, at, 'gợi ý AI', issues)
    issues.push(...checkNumber(hint.multiplier, `${at}.multiplier`, Number.MIN_VALUE))
    if (
      hint.effectType === undefined &&
      hint.category === undefined &&
      hint.elementId === undefined
    ) {
      issues.push(`${at}: cần ít nhất một điều kiện (effectType, category, elementId)`)
    }
    if (hint.category !== undefined && !SKILL_CATEGORIES.some((c) => c === hint.category)) {
      issues.push(`${at}.category không hợp lệ "${String(hint.category)}"`)
    }
    if (hint.elementId !== undefined && !Object.hasOwn(data.elements, String(hint.elementId))) {
      issues.push(`${at}.elementId: hệ không tồn tại "${String(hint.elementId)}"`)
    }
    if (hint.effectType !== undefined && typeof hint.effectType !== 'string') {
      issues.push(`${at}.effectType phải là chuỗi`)
    }
  })
}

/** Phần unique: loài boss là loài thường, dòng unique ≥ 1, id dòng không trùng / không trùng dòng phụ. */
function checkUnique(item: Raw, where: string, data: GameData, issues: string[]): void {
  const unique = asObject(item.unique)
  if (!unique) {
    issues.push(`${where}.unique phải là object`)
    return
  }
  const at = `${where}.unique`
  checkKnownFields(unique, UNIQUE_FIELDS, at, 'trang bị unique', issues)
  const species =
    typeof unique.bossSpeciesId === 'string' ? data.species[unique.bossSpeciesId] : null
  if (species?.kind !== 'normal') {
    issues.push(`${at}.bossSpeciesId: loài thường không tồn tại "${String(unique.bossSpeciesId)}"`)
  }
  if (!Array.isArray(unique.lines) || unique.lines.length === 0) {
    issues.push(`${at}.lines cần ít nhất một dòng unique`)
  } else {
    const seen = new Set<string>()
    unique.lines.forEach((value: unknown, i) => {
      const lineWhere = `${at}.lines[${i}]`
      const id = asObject(value)?.id
      if (typeof id !== 'string' || id === '' || id === MAIN_LINE_ID) {
        issues.push(`${lineWhere}.id phải là chuỗi khác rỗng, khác "${MAIN_LINE_ID}"`)
      } else if (seen.has(id) || Object.hasOwn(data.equipmentAffixes, id)) {
        issues.push(`${lineWhere}.id "${id}" trùng dòng khác của món hoặc dòng phụ`)
      }
      if (typeof id === 'string') seen.add(id)
      checkLine(value, lineWhere, { data, required: ['unique'], extraFields: ['id'] }, issues)
    })
  }
  checkAiHints(unique.aiHints, at, data, issues)
  if (item.shop !== undefined) issues.push(`${where}: trang bị unique không bán ở cửa hàng`)
}

/**
 * Món gốc hồn khí (docs/rules/soul-relics.md): chỉ số hợp lệ, dòng chính có khoảng cho mọi bậc (bậc
 * theo tư chất), không unique, không bán ở cửa hàng.
 */
function checkSoulRelicItem(item: Raw, where: string, data: GameData, issues: string[]): void {
  if (!STAT_NAMES.some((stat) => stat === item.soulRelicStat)) {
    issues.push(`${where}.soulRelicStat: chỉ số không hợp lệ "${String(item.soulRelicStat)}"`)
  }
  checkLine(
    item.mainLine,
    `${where}.mainLine`,
    { data, required: EQUIPMENT_RARITIES, extraFields: [] },
    issues
  )
  if (item.unique !== undefined) issues.push(`${where}: món gốc hồn khí không có phần unique`)
  if (item.shop !== undefined) issues.push(`${where}: món gốc hồn khí không bán ở cửa hàng`)
}

/**
 * Trang bị gốc (luật của category `equipment`): dòng chính có khoảng cho mọi bậc thường (món thường)
 * hoặc bậc unique (món unique); phần unique nếu có; món gốc hồn khí theo luật riêng.
 */
export function checkEquipmentItem(
  item: Raw,
  where: string,
  data: GameData,
  issues: string[]
): void {
  if (item.soulRelicStat !== undefined) {
    checkSoulRelicItem(item, where, data, issues)
    return
  }
  const isUnique = item.unique !== undefined
  checkLine(
    item.mainLine,
    `${where}.mainLine`,
    { data, required: isUnique ? ['unique'] : NORMAL_RARITIES, extraFields: [] },
    issues
  )
  const ranges = asObject(asObject(item.mainLine)?.ranges) ?? {}
  if (isUnique) {
    checkUnique(item, where, data, issues)
    if (Object.keys(ranges).some((rarity) => rarity !== 'unique')) {
      issues.push(`${where}.mainLine.ranges: món unique chỉ có bậc "unique"`)
    }
  } else if (ranges.unique !== undefined) {
    issues.push(`${where}.mainLine.ranges: bậc "unique" chỉ dùng cho món unique của boss`)
  }
}

/** Dòng phụ: id khác "main", trọng số ≥ 0, khoảng theo bậc (bậc nào không ghi thì không ra). */
export function checkEquipmentAffixes(data: GameData, issues: string[]): void {
  for (const affix of Object.values(data.equipmentAffixes)) {
    const where = `Dòng phụ "${affix.id}"`
    if (affix.id === MAIN_LINE_ID) issues.push(`${where}: id "${MAIN_LINE_ID}" dành cho dòng chính`)
    checkLine(affix, where, { data, required: [], extraFields: ['id', 'weight'] }, issues)
    issues.push(...checkNumber(affix.weight, `${where}: weight`, 0))
  }
}

/** Danh sách trang bị rơi của map: món gốc thường tồn tại, không trùng, trọng số > 0. */
export function checkBiomeEquipmentDrops(data: GameData, issues: string[]): void {
  for (const biome of allMaps(data)) {
    if (biome.equipmentDrops === undefined) continue
    const where = `Biome "${biome.id}": equipmentDrops`
    if (!Array.isArray(biome.equipmentDrops)) {
      issues.push(`${where} phải là danh sách`)
      continue
    }
    const seen = new Set<string>()
    for (const entry of biome.equipmentDrops) {
      const item = data.items[entry.itemId]
      if (item?.category !== 'equipment') {
        issues.push(`${where}: trang bị không tồn tại "${entry.itemId}"`)
      } else if (item.unique) {
        issues.push(`${where}: món unique "${entry.itemId}" chỉ rơi từ boss của nó`)
      } else if (item.soulRelicStat !== undefined) {
        issues.push(`${where}: món gốc hồn khí "${entry.itemId}" chỉ có khi luyện hồn khí`)
      }
      if (seen.has(entry.itemId)) issues.push(`${where}: trùng món "${entry.itemId}"`)
      seen.add(entry.itemId)
      issues.push(
        ...checkNumber(entry.weight, `${where}: weight của "${entry.itemId}"`, Number.MIN_VALUE)
      )
    }
  }
}

/** Bảng trọng số bậc: khóa là bậc thường, trọng số ≥ 0, có ít nhất một bậc > 0. */
export function checkRarityWeights(value: unknown, field: string, issues: string[]): void {
  const weights = asObject(value)
  if (!weights) {
    issues.push(`${field} phải là object bậc → trọng số`)
    return
  }
  for (const [rarity, weight] of Object.entries(weights)) {
    if (!NORMAL_RARITIES.some((normal) => normal === rarity)) {
      issues.push(`${field}: "${rarity}" không phải bậc thường`)
    }
    issues.push(...checkNumber(weight, `${field}.${rarity}`, 0))
  }
  if (!Object.values(weights).some((weight) => typeof weight === 'number' && weight > 0)) {
    issues.push(`${field} cần ít nhất một bậc có trọng số > 0`)
  }
}

/** Bảng theo mọi bậc (giá, số dòng phụ, bảng của Thợ rèn). */
export function checkRarityTable(
  value: unknown,
  field: string,
  check: (entry: unknown, at: string) => string[],
  issues: string[]
): void {
  const table = asObject(value)
  if (!table) {
    issues.push(`${field} phải là object bậc → số`)
    return
  }
  for (const rarity of EQUIPMENT_RARITIES)
    issues.push(...check(table[rarity], `${field}.${rarity}`))
  for (const key of Object.keys(table)) {
    if (!isRarity(key)) issues.push(`${field}: "${key}" không phải bậc`)
  }
}

/** config.equipment. */
export function checkEquipmentConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.equipment)
  const field = 'config.equipment'
  if (!config) {
    issues.push(`${field} phải là object`)
    return
  }
  issues.push(...checkInteger(config.baseSlots, `${field}.baseSlots`, 0))
  issues.push(...checkMilestones(config.floorMilestones, `${field}.floorMilestones`, 2))
  for (const key of [
    'dropChance',
    'bossDropChance',
    'uniqueCarriedDropChance',
    'uniquePoolDropChance'
  ]) {
    issues.push(...checkNumber(config[key], `${field}.${key}`, 0, 100))
  }
  checkRarityWeights(config.rarityWeights, `${field}.rarityWeights`, issues)
  checkRarityWeights(config.bossRarityWeights, `${field}.bossRarityWeights`, issues)
  checkRarityWeights(config.shopRarityWeights, `${field}.shopRarityWeights`, issues)
  if (!NORMAL_RARITIES.some((rarity) => rarity === config.floorBoostFrom)) {
    issues.push(`${field}.floorBoostFrom phải là bậc thường`)
  }
  issues.push(...checkNumber(config.floorRarityFactor, `${field}.floorRarityFactor`, 0))
  checkRarityTable(
    config.rarityPriceMultipliers,
    `${field}.rarityPriceMultipliers`,
    (entry, at) => checkNumber(entry, at, 0),
    issues
  )
  checkRarityTable(
    config.affixCounts,
    `${field}.affixCounts`,
    (entry, at) => checkInteger(entry, at, 0),
    issues
  )
}
