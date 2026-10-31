// Kiểm tra dữ liệu huyết mạch (docs/rules/bloodline.md): bloodlines.json, trait loại `bloodline`,
// Tinh huyết, config.bloodline. Danh sách / id trùng đã kiểm ở indexById (createGameData).

import { BATTLE_FORM_KINDS, type BloodlineDef, type GameData } from '../model'
import { checkIdList, raceRefIds } from '../registries'
import { asObject, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const AT = 'config.bloodline'

/** Điểm độ thuần nguyên trong [0, 100]. */
const checkPoint = (value: unknown, field: string): string[] =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100
    ? []
    : [`${field} phải là số nguyên 0–100, nhận ${String(value)}`]

const GROUP_FIELDS = [
  'id',
  'ancestorSpeciesIds',
  'raceIds',
  'elementIds',
  'speciesIds',
  'excludeSpeciesIds',
  'traitId',
  'essenceItemId',
  'scrollItemId'
]

/** Danh sách id tùy chọn: bỏ trống được, có thì không rỗng, id tồn tại, không lặp. */
function checkOptionalIds(
  value: unknown,
  field: string,
  known: Readonly<Record<string, unknown>>,
  label: string
): string[] {
  return value === undefined ? [] : checkIdList(value, field, known, { label })
}

/** Loài tổ: ít nhất một, loài thường tồn tại, không phải dạng chỉ có trong trận, không lặp. */
function checkAncestors(data: GameData, group: BloodlineDef, where: string): string[] {
  const issues = checkIdList(
    group.ancestorSpeciesIds,
    `${where}.ancestorSpeciesIds`,
    data.species,
    {
      label: 'loài'
    }
  )
  if (issues.length > 0) return issues
  for (const id of group.ancestorSpeciesIds) {
    const species = data.species[id]
    if (species.kind !== 'normal' || BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')) {
      issues.push(`${where}: loài tổ "${id}" phải là loài thường, không phải dạng trong trận`)
    }
  }
  return issues
}

/** Trait loại bloodline và Tinh huyết (tiêu hao, có addPurity đúng nhóm). */
function checkGroupLinks(data: GameData, group: BloodlineDef, where: string): string[] {
  const issues: string[] = []
  if (data.traits[group.traitId]?.kind !== 'bloodline') {
    issues.push(`${where}: traitId "${String(group.traitId)}" phải là trait loại bloodline`)
  }
  const essence = data.items[group.essenceItemId]
  const isEssence =
    essence?.category === 'consumable' &&
    essence.effects.some(
      (effect) => effect.type === 'addPurity' && asObject(effect.params)?.groupId === group.id
    )
  if (
    group.scrollItemId !== undefined &&
    data.items[group.scrollItemId]?.category !== 'formationScroll'
  ) {
    issues.push(`${where}: scrollItemId "${String(group.scrollItemId)}" phải là trận đồ`)
  }
  if (!isEssence) {
    issues.push(
      `${where}: essenceItemId "${String(group.essenceItemId)}" phải là vật phẩm tiêu hao có addPurity của nhóm`
    )
  }
  return issues
}

function checkGroup(data: GameData, group: BloodlineDef, issues: string[]): void {
  const where = `Huyết mạch "${group.id}"`
  checkKnownFields(group, GROUP_FIELDS, where, 'nhóm huyết mạch', issues)
  issues.push(...checkAncestors(data, group, where))
  if (!group.raceIds && !group.elementIds && !group.speciesIds) {
    issues.push(`${where}: cần ít nhất một trong raceIds / elementIds / speciesIds`)
  }
  issues.push(...checkOptionalIds(group.raceIds, `${where}.raceIds`, raceRefIds(data), 'race'))
  issues.push(...checkOptionalIds(group.elementIds, `${where}.elementIds`, data.elements, 'hệ'))
  issues.push(...checkOptionalIds(group.speciesIds, `${where}.speciesIds`, data.species, 'loài'))
  issues.push(
    ...checkOptionalIds(group.excludeSpeciesIds, `${where}.excludeSpeciesIds`, data.species, 'loài')
  )
  issues.push(...checkGroupLinks(data, group, where))
}

/** Mỗi trait loại bloodline phải đúng một nhóm dùng (trait không chiếm ô, không có nhóm loại trừ). */
function checkBloodlineTraits(data: GameData, issues: string[]): void {
  for (const trait of Object.values(data.traits)) {
    if (trait.kind !== 'bloodline') continue
    const users = Object.values(data.bloodlines).filter((group) => group.traitId === trait.id)
    if (users.length !== 1) {
      issues.push(
        `Trait "${trait.id}": trait huyết mạch phải đúng một nhóm dùng, có ${users.length}`
      )
    }
    if (trait.exclusiveGroup !== undefined) {
      issues.push(`Trait "${trait.id}": trait huyết mạch không được có exclusiveGroup`)
    }
  }
}

/** Trọng số độ thuần quái hoang: khoảng nguyên 0 ≤ min ≤ max ≤ 100, trọng số ≥ 0, tổng > 0. */
function checkPurityWeights(value: unknown, issues: string[]): void {
  const where = `${AT}.wildPurityWeights`
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} phải là danh sách không rỗng`)
    return
  }
  let total = 0
  value.forEach((raw: unknown, i) => {
    const tier = asObject(raw)
    const at = `${where}[${i}]`
    if (!tier) {
      issues.push(`${at} phải là object`)
      return
    }
    checkKnownFields(tier, ['min', 'max', 'weight'], at, 'khoảng độ thuần', issues)
    issues.push(...checkPoint(tier.min, `${at}.min`))
    issues.push(...checkPoint(tier.max, `${at}.max`))
    if (typeof tier.min === 'number' && typeof tier.max === 'number' && tier.min > tier.max) {
      issues.push(`${at}: min (${tier.min}) không được lớn hơn max (${tier.max})`)
    }
    issues.push(...checkNumber(tier.weight, `${at}.weight`, 0))
    if (typeof tier.weight === 'number') total += tier.weight
  })
  if (!(total > 0)) issues.push(`${where}: tổng trọng số phải > 0`)
}

/** Mốc độ thuần: không rỗng, tăng dần ngặt trong (0, 100]. */
function checkMilestones(value: unknown, issues: string[]): void {
  const where = `${AT}.milestones`
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} phải là danh sách không rỗng`)
    return
  }
  value.forEach((milestone: unknown, i) => {
    issues.push(...checkNumber(milestone, `${where}[${i}]`, Number.MIN_VALUE, 100))
    const previous: unknown = value[i - 1]
    if (i > 0 && typeof milestone === 'number' && typeof previous === 'number') {
      if (milestone <= previous) issues.push(`${where} phải tăng dần ngặt`)
    }
  })
}

const PERCENT_FIELDS = [
  'atavismMutationChance',
  'ancestorBirthChance',
  'ancestorBirthMinPurity',
  'essenceDropChance',
  'scrollDropChance',
  'fusePurityPercent',
  'sacrificePurityPercent'
]
const POINT_FIELDS = [
  'bossPurityBonus',
  'atavismMutationPoints',
  'bossKillPurity',
  'ancestorKillPurity'
]

function checkBloodlineConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.bloodline)
  if (!config) {
    issues.push(`${AT} phải là object`)
    return
  }
  const fields = [
    'wildPurityWeights',
    'breedDownPoints',
    'breedUpPoints',
    'mixAtFullPurity',
    'milestones',
    'atavismCostPerLevel',
    ...PERCENT_FIELDS,
    ...POINT_FIELDS
  ]
  checkKnownFields(config, fields, AT, 'config', issues)
  checkPurityWeights(config.wildPurityWeights, issues)
  for (const field of PERCENT_FIELDS) {
    issues.push(...checkNumber(config[field], `${AT}.${field}`, 0, 100))
  }
  for (const field of POINT_FIELDS)
    issues.push(...checkNumber(config[field], `${AT}.${field}`, 0, 100))
  // Độ lệch khi breed là số nguyên (tung nextInt).
  issues.push(...checkPoint(config.breedDownPoints, `${AT}.breedDownPoints`))
  issues.push(...checkPoint(config.breedUpPoints, `${AT}.breedUpPoints`))
  issues.push(...checkNumber(config.mixAtFullPurity, `${AT}.mixAtFullPurity`, 0))
  checkMilestones(config.milestones, issues)
  issues.push(...checkNumber(config.atavismCostPerLevel, `${AT}.atavismCostPerLevel`, 0))
}

/** Kiểm tra toàn bộ dữ liệu huyết mạch. */
export function checkBloodlineData(data: GameData, issues: string[]): void {
  checkBloodlineConfig(data, issues)
  for (const group of Object.values(data.bloodlines)) checkGroup(data, group, issues)
  checkBloodlineTraits(data, issues)
}
