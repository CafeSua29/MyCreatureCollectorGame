// Kiểm tra dữ liệu Âm / Dương (docs/rules/polarity.md): config.polarity, trait loại `polarity`.

import { POLES, type GameData } from '../model'
import { checkIdList, validatePartialStats } from '../registries'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkDrops, checkKnownFields } from './checks'

const AT = 'config.polarity'

const FIELDS = [
  'statPercents',
  'opposeBonus',
  'unlockFloor',
  'wildChance',
  'bossChance',
  'traitIds',
  'bossDrops'
]

/** Object có đúng một mục cho mỗi cực, kiểm từng mục bằng `check`. */
function checkPerPole(
  value: unknown,
  field: string,
  check: (entry: unknown, at: string) => string[]
): string[] {
  const obj = asObject(value)
  if (!obj) return [`${field} phải là object`]
  const issues = Object.keys(obj)
    .filter((key) => !(POLES as readonly string[]).includes(key))
    .map((key) => `${field}.${key}: cực không tồn tại`)
  for (const pole of POLES) issues.push(...check(obj[pole], `${field}.${pole}`))
  return issues
}

/** Pool trait theo cực: không rỗng, trait tồn tại loại polarity, không lặp. */
function checkTraitPool(data: GameData, value: unknown, at: string): string[] {
  const issues = checkIdList(value, at, data.traits, { label: 'trait' })
  if (issues.length > 0) return issues
  return (value as string[])
    .filter((id) => data.traits[id].kind !== 'polarity')
    .map((id) => `${at}: trait "${id}" phải là loại polarity`)
}

/** Trait loại polarity: có trong ít nhất một pool, không có nhóm loại trừ. */
function checkPolarityTraits(data: GameData, issues: string[]): void {
  const pools = asObject(data.config.polarity.traitIds) ?? {}
  const used = new Set(Object.values(pools).flatMap((ids) => (Array.isArray(ids) ? ids : [])))
  for (const trait of Object.values(data.traits)) {
    if (trait.kind !== 'polarity') continue
    if (!used.has(trait.id)) {
      issues.push(`Trait "${trait.id}": trait cực tính phải nằm trong config.polarity.traitIds`)
    }
    if (trait.exclusiveGroup !== undefined) {
      issues.push(`Trait "${trait.id}": trait cực tính không được có exclusiveGroup`)
    }
  }
}

/** Kiểm tra mọi dữ liệu Âm / Dương. */
export function checkPolarityData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.polarity)
  if (!config) {
    issues.push(`${AT} phải là object`)
    return
  }
  checkKnownFields(config, FIELDS, AT, 'config', issues)
  issues.push(...checkPerPole(config.statPercents, `${AT}.statPercents`, validatePartialStats))
  issues.push(...checkNumber(config.opposeBonus, `${AT}.opposeBonus`, 0))
  issues.push(...checkInteger(config.unlockFloor, `${AT}.unlockFloor`, 1))
  for (const field of ['wildChance', 'bossChance']) {
    issues.push(...checkNumber(config[field], `${AT}.${field}`, 0, 100))
  }
  issues.push(
    ...checkPerPole(config.traitIds, `${AT}.traitIds`, (pool, at) => checkTraitPool(data, pool, at))
  )
  if (!Array.isArray(config.bossDrops)) issues.push(`${AT}.bossDrops phải là danh sách`)
  else checkDrops(data, config.bossDrops, `${AT}.bossDrops`, issues)
  checkPolarityTraits(data, issues)
}
