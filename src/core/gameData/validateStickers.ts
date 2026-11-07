// Kiểm tra dữ liệu sticker skill (docs/rules/skill-stickers.md): config.stickers và thuộc tính
// (stickerAttributes.json): độ hiếm, trọng số, hiệu ứng theo registry, khoảng giá trị, lựa chọn, điều
// kiện; hook trait của loại `trait` kiểm tra bằng TRAIT_HOOKS với giá trị ở hai đầu khoảng.

import {
  STICKER_EFFECT_TYPES,
  STICKER_RARITIES,
  STICKER_REQUIREMENTS,
  type GameData,
  type StickerAttributeDef,
  type StickerEffectType,
  type StickerRoll
} from '../model'
import { asObject, checkEnumList, checkInteger, checkNumber } from '../shared'
import { STICKER_EFFECTS } from '../inventory'
import { stickerEffectParams, TRAIT_HOOKS } from '../registries'
import { checkKnownFields } from './checks'

const CONFIG_FIELDS = [
  'rarityChances',
  'uncommonCounts',
  'rareCounts',
  'maxAttributes',
  'maxSkillSlots',
  'reroll'
]

const ATTRIBUTE_FIELDS = [
  'id',
  'rarity',
  'weight',
  'effect',
  'valueParam',
  'range',
  'perEmptySlot',
  'choices',
  'elementIds',
  'requires'
]

/** Danh sách { count, weight }: count nguyên ≥ 0, weight ≥ 0, tổng trọng số > 0. */
function checkCountWeights(value: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách { count, weight }`)
    return
  }
  let total = 0
  value.forEach((raw: unknown, i) => {
    const entry = asObject(raw)
    checkKnownFields(entry, ['count', 'weight'], `${where}[${i}]`, 'số thuộc tính', issues)
    issues.push(...checkInteger(entry?.count, `${where}[${i}].count`, 0))
    issues.push(...checkNumber(entry?.weight, `${where}[${i}].weight`, 0))
    if (typeof entry?.weight === 'number') total += entry.weight
  })
  if (value.length > 0 && total <= 0) issues.push(`${where} cần tổng trọng số > 0`)
}

/** Tỉ lệ độ hiếm sticker: mỗi độ hiếm 0–100, tổng ≤ 100 (tỉ lệ tuyệt đối như gốc). */
export function checkRarityChances(value: unknown, where: string): string[] {
  const chances = asObject(value)
  const issues = STICKER_RARITIES.flatMap((rarity) =>
    checkNumber(chances?.[rarity], `${where}.${rarity}`, 0, 100)
  )
  const total = STICKER_RARITIES.reduce((sum, rarity) => {
    const chance = chances?.[rarity]
    return sum + (typeof chance === 'number' ? chance : 0)
  }, 0)
  if (total > 100) issues.push(`${where}: tổng tỉ lệ phải ≤ 100`)
  return issues
}

/** Kiểm tra config.stickers. */
export function checkStickerConfig(data: GameData, issues: string[]): void {
  const where = 'config.stickers'
  const config = asObject(data.config.stickers)
  if (!config) {
    issues.push(`${where} phải là object`)
    return
  }
  checkKnownFields(config, CONFIG_FIELDS, where, 'config sticker', issues)
  const chances = asObject(config.rarityChances)
  const uncommon = asObject(config.uncommonCounts)
  const rare = asObject(config.rareCounts)
  for (const rarity of STICKER_RARITIES) {
    checkCountWeights(uncommon?.[rarity], `${where}.uncommonCounts.${rarity}`, issues)
    issues.push(...checkInteger(rare?.[rarity], `${where}.rareCounts.${rarity}`, 0))
  }
  const reroll = asObject(config.reroll)
  checkKnownFields(
    reroll,
    ['stones', 'moneyPerFloor'],
    `${where}.reroll`,
    'tẩy luyện sticker',
    issues
  )
  for (const rarity of STICKER_RARITIES) {
    issues.push(
      ...checkInteger(asObject(reroll?.stones)?.[rarity], `${where}.reroll.stones.${rarity}`, 0)
    )
    issues.push(
      ...checkNumber(
        asObject(reroll?.moneyPerFloor)?.[rarity],
        `${where}.reroll.moneyPerFloor.${rarity}`,
        0
      )
    )
  }
  issues.push(...checkRarityChances(chances, `${where}.rarityChances`))
  issues.push(...checkInteger(config.maxAttributes, `${where}.maxAttributes`, 1))
  issues.push(
    ...checkInteger(config.maxSkillSlots, `${where}.maxSkillSlots`, data.config.maxSkills + 1)
  )
}

/** Giá trị đại diện để kiểm tra hook: hai đầu khoảng (không khoảng thì không giá trị). */
function sampleRolls(attribute: StickerAttributeDef): StickerRoll[] {
  const choices = attribute.choices ?? [undefined]
  const values = attribute.range ? [attribute.range.min, attribute.range.max] : [undefined]
  return choices.flatMap((choice) =>
    values.map((value) => ({
      attributeId: attribute.id,
      ...(value === undefined ? {} : { value }),
      ...(choice === undefined ? {} : { choice })
    }))
  )
}

/** Hiệu ứng: loại có trong registry, params hợp lệ (và hook trait hợp lệ) ở mọi giá trị mẫu. */
function checkEffect(
  data: GameData,
  attribute: StickerAttributeDef,
  where: string,
  issues: string[]
): void {
  const effect = asObject(attribute.effect)
  const type = effect?.type
  if (typeof type !== 'string' || !(STICKER_EFFECT_TYPES as readonly string[]).includes(type)) {
    issues.push(`${where}.effect.type không hợp lệ "${String(type)}"`)
    return
  }
  // Ép kiểu vì vừa kiểm tra type thuộc danh sách loại hiệu ứng.
  const handler = STICKER_EFFECTS[type as StickerEffectType]
  // Skill mẫu bất kỳ để thay `$skill` (kiểm tra hook cần id skill tồn tại).
  const skillId = Object.keys(data.skills)[0] ?? ''
  for (const roll of sampleRolls(attribute)) {
    const params = stickerEffectParams(attribute, roll, { skillId, emptySlots: 1 })
    for (const problem of handler.validateParams(params)) {
      issues.push(`${where}.effect (giá trị ${String(roll.value)}): ${problem}`)
    }
    for (const hook of handler.traitHooks?.(params) ?? []) {
      const typed = asObject(hook)
      const hookType = typed?.type
      const hookHandler =
        typeof hookType === 'string' && Object.hasOwn(TRAIT_HOOKS, hookType)
          ? TRAIT_HOOKS[hookType]
          : undefined
      if (!hookHandler) {
        issues.push(`${where}.effect: hook trait không tồn tại "${String(hookType)}"`)
        continue
      }
      for (const problem of hookHandler.validateParams(typed?.params, data)) {
        issues.push(`${where}.effect hook "${String(hookType)}": ${problem}`)
      }
    }
  }
}

/** Khoảng và đường dẫn giá trị: có cả hai hoặc không cái nào; khoảng nguyên, min ≤ max. */
function checkValue(attribute: StickerAttributeDef, where: string, issues: string[]): void {
  const hasRange = attribute.range !== undefined
  if (hasRange !== (attribute.valueParam !== undefined)) {
    issues.push(`${where} cần cả range lẫn valueParam (hoặc không cái nào)`)
  }
  if (attribute.perEmptySlot !== undefined && (attribute.perEmptySlot !== true || !hasRange)) {
    issues.push(`${where}.perEmptySlot chỉ được là true và cần range`)
  }
  if (!hasRange) return
  const range = asObject(attribute.range)
  issues.push(...checkInteger(range?.min, `${where}.range.min`, 0))
  issues.push(...checkInteger(range?.max, `${where}.range.max`, 0))
  if (typeof range?.min === 'number' && typeof range.max === 'number' && range.min > range.max) {
    issues.push(`${where}.range.min phải ≤ max`)
  }
}

/** Danh sách id tồn tại trong bảng `table`, khác rỗng, không trùng. */
function checkIds(
  value: unknown,
  where: string,
  table: Readonly<Record<string, unknown>>,
  issues: string[]
): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} phải là danh sách khác rỗng`)
    return
  }
  if (new Set(value).size !== value.length) issues.push(`${where} có id trùng`)
  for (const id of value) {
    if (typeof id !== 'string' || !Object.hasOwn(table, id)) {
      issues.push(`${where}: id không tồn tại "${String(id)}"`)
    }
  }
}

/** Kiểm tra thuộc tính sticker (stickerAttributes.json). */
export function checkStickerAttributes(data: GameData, issues: string[]): void {
  for (const attribute of Object.values(data.stickerAttributes)) {
    const where = `Thuộc tính sticker "${attribute.id}"`
    checkKnownFields(attribute, ATTRIBUTE_FIELDS, where, 'thuộc tính sticker', issues)
    if (!(STICKER_RARITIES as readonly string[]).includes(attribute.rarity)) {
      issues.push(`${where}.rarity không hợp lệ "${String(attribute.rarity)}"`)
    }
    issues.push(...checkNumber(attribute.weight, `${where}.weight`, 0))
    checkValue(attribute, where, issues)
    checkIds(attribute.choices, `${where}.choices`, data.statuses, issues)
    checkIds(attribute.elementIds, `${where}.elementIds`, data.elements, issues)
    if (attribute.requires !== undefined) {
      issues.push(...checkEnumList(attribute.requires, `${where}.requires`, STICKER_REQUIREMENTS))
    }
    checkEffect(data, attribute, where, issues)
  }
}
