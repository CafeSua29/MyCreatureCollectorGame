// Kiểm tra dữ liệu hiểm địa (docs/rules/zones.md): zones.json, config.zones. Map của hiểm địa kiểm
// chung với biome (allMaps ở các hàm kiểm tra biome).

import {
  ZONE_REQUIREMENT_TYPES,
  ZONE_STEP_KINDS,
  type GameData,
  type ZoneDef,
  type ZoneRequirementType
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import {
  checkChestItems,
  checkIntRange,
  checkKnownFields,
  checkStackItemId,
  fieldList
} from './checks'

const ZONE_FIELDS = fieldList<ZoneDef>({
  id: true,
  map: true,
  requirements: true,
  treasure: true,
  rareTreasure: true,
  portal: true
})

type Fields = Record<string, unknown>

/** Luật kiểm tra theo loại điều kiện vào: trường được phép, kiểm tra giá trị. */
const REQUIREMENT_CHECKS: {
  [K in ZoneRequirementType]: {
    fields: readonly string[]
    check(data: GameData, req: Fields, where: string): string[]
  }
} = {
  minFloor: {
    fields: ['type', 'floor'],
    check: (_data, req, where) => checkInteger(req.floor, `${where}.floor`, 1)
  },
  partyElement: {
    fields: ['type', 'elementId', 'count'],
    check: (data, req, where) => [
      ...(Object.hasOwn(data.elements, String(req.elementId))
        ? []
        : [`${where}: hệ không tồn tại "${String(req.elementId)}"`]),
      ...checkInteger(req.count, `${where}.count`, 1)
    ]
  },
  partyRace: {
    fields: ['type', 'raceId', 'count'],
    check: (data, req, where) => [
      ...(Object.hasOwn(data.races, String(req.raceId))
        ? []
        : [`${where}: race không tồn tại "${String(req.raceId)}"`]),
      ...checkInteger(req.count, `${where}.count`, 1)
    ]
  },
  partyRaceGroup: {
    fields: ['type', 'raceGroupId', 'count'],
    check: (data, req, where) => [
      ...(Object.hasOwn(data.raceGroups, String(req.raceGroupId))
        ? []
        : [`${where}: nhóm race không tồn tại "${String(req.raceGroupId)}"`]),
      ...checkInteger(req.count, `${where}.count`, 1)
    ]
  },
  partySpecies: {
    fields: ['type', 'speciesId'],
    check: (data, req, where) =>
      Object.hasOwn(data.species, String(req.speciesId))
        ? []
        : [`${where}: loài không tồn tại "${String(req.speciesId)}"`]
  },
  partySpeciesLine: {
    fields: ['type', 'speciesId', 'count'],
    check: (data, req, where) => [
      ...(Object.hasOwn(data.species, String(req.speciesId))
        ? []
        : [`${where}: loài không tồn tại "${String(req.speciesId)}"`]),
      ...checkInteger(req.count, `${where}.count`, 1)
    ]
  },
  item: {
    fields: ['type', 'itemId', 'count', 'consume'],
    check: (data, req, where) => [
      ...checkStackItemId(data, String(req.itemId), where, 'vật phẩm điều kiện'),
      ...checkInteger(req.count, `${where}.count`, 1),
      ...(typeof req.consume === 'boolean' ? [] : [`${where}.consume phải là boolean`])
    ]
  }
}

function isRequirementType(value: unknown): value is ZoneRequirementType {
  return (ZONE_REQUIREMENT_TYPES as readonly unknown[]).includes(value)
}

function checkRequirements(data: GameData, value: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  value.forEach((entry: unknown, i) => {
    const at = `${where}[${i}]`
    const req = asObject(entry)
    if (!req || !isRequirementType(req.type)) {
      issues.push(`${at}.type phải là một trong ${ZONE_REQUIREMENT_TYPES.join(', ')}`)
      return
    }
    const rule = REQUIREMENT_CHECKS[req.type]
    checkKnownFields(req, rule.fields, at, `điều kiện ${req.type}`, issues)
    issues.push(...rule.check(data, req, at))
  })
}

function checkLootTable(data: GameData, value: unknown, where: string, issues: string[]): void {
  const table = asObject(value)
  if (!table) {
    issues.push(`${where} phải là { rolls, items }`)
    return
  }
  checkKnownFields(table, ['rolls', 'items'], where, 'bảng rương', issues)
  issues.push(...checkInteger(table.rolls, `${where}.rolls`, 0))
  checkChestItems(data, table.items, `${where}.items`, issues)
}

function checkZone(data: GameData, zone: ZoneDef, issues: string[]): void {
  const where = `Hiểm địa "${zone.id}"`
  checkKnownFields(zone, ZONE_FIELDS, where, 'hiểm địa', issues)
  // Id map của hiểm địa = id hiểm địa: không được trùng biome (trận tra map theo id).
  if (Object.hasOwn(data.biomes, zone.id)) issues.push(`${where}: id trùng biome "${zone.id}"`)
  checkRequirements(data, zone.requirements, `${where}: requirements`, issues)
  checkLootTable(data, zone.treasure, `${where}: treasure`, issues)
  checkLootTable(data, zone.rareTreasure, `${where}: rareTreasure`, issues)
}

function checkStepWeights(value: unknown, at: string, issues: string[]): void {
  const weights = asObject(value)
  if (!weights) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(weights, ZONE_STEP_KINDS, at, 'loại bước', issues)
  let total = 0
  for (const kind of ZONE_STEP_KINDS) {
    issues.push(...checkNumber(weights[kind], `${at}.${kind}`, 0))
    if (typeof weights[kind] === 'number') total += weights[kind]
  }
  if (total <= 0) issues.push(`${at}: cần ít nhất một loại bước có trọng số > 0`)
}

/** Kiểm tra hiểm địa và config.zones. */
export function checkZoneData(data: GameData, issues: string[]): void {
  for (const zone of Object.values(data.zones)) checkZone(data, zone, issues)
  const at = 'config.zones'
  const config = asObject(data.config.zones)
  if (!config) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(
    config,
    [
      'floorOffset',
      'steps',
      'stepWeights',
      'springHealPercent',
      'guardianRareRolls',
      'cooldownDays',
      'portals'
    ],
    at,
    'config',
    issues
  )
  issues.push(...checkInteger(config.floorOffset, `${at}.floorOffset`))
  checkIntRange(config.steps, `${at}.steps`, 1, issues)
  checkStepWeights(config.stepWeights, `${at}.stepWeights`, issues)
  issues.push(...checkNumber(config.springHealPercent, `${at}.springHealPercent`, 0, 100))
  issues.push(...checkInteger(config.guardianRareRolls, `${at}.guardianRareRolls`, 0))
  issues.push(...checkInteger(config.cooldownDays, `${at}.cooldownDays`, 0))
}
