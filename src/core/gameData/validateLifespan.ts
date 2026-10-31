// Kiểm tra dữ liệu của tuổi và thọ nguyên (mục "Tuổi và thọ nguyên" ở lifespan.md): thọ nguyên
// của loài, config.clock, config.lifespan.

import { BATTLE_FORM_KINDS, TIMED_ACTIVITIES, type GameData, type PercentRange } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkHourOfDay } from '../registries'
import { checkDrops } from './checks'

/** `lifespan` bắt buộc với loài thường (kể cả dạng vùng / dạng khác), cấm với dạng chỉ có trong trận. */
function checkSpeciesLifespans(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    const where = `Loài "${species.id}"`
    const battleForm =
      species.formKind !== undefined && BATTLE_FORM_KINDS.includes(species.formKind)
    if (battleForm) {
      if (species.lifespan !== undefined) {
        issues.push(`${where}: dạng ${species.formKind} không có lifespan (theo loài gốc)`)
      }
      continue
    }
    issues.push(...checkInteger(species.lifespan, `${where}: lifespan`, 1))
  }
}

function checkClockConfig(data: GameData, issues: string[]): void {
  const clock = asObject(data.config.clock)
  if (!clock) {
    issues.push('config.clock phải là object')
    return
  }
  for (const field of ['startHour', 'wakeHour'] as const) {
    issues.push(...checkHourOfDay(clock[field], `config.clock.${field}`))
  }
  const hours = asObject(clock.hours) ?? {}
  for (const activity of TIMED_ACTIVITIES) {
    issues.push(...checkInteger(hours[activity], `config.clock.hours.${activity}`, 0))
  }
}

function checkRange(range: PercentRange | undefined, field: string, issues: string[]): void {
  issues.push(...checkNumber(range?.min, `${field}.min`, 0, 100))
  issues.push(...checkNumber(range?.max, `${field}.max`, range?.min ?? 0, 100))
}

function checkLifespanConfig(data: GameData, issues: string[]): void {
  const config = data.config.lifespan
  if (!asObject(config)) {
    issues.push('config.lifespan phải là object')
    return
  }
  const at = (field: string): string => `config.lifespan.${field}`
  const push = (problems: string[]): void => void issues.push(...problems)
  push(checkInteger(config.daysPerYear, at('daysPerYear'), 1))
  push(checkNumber(config.levelPercent, at('levelPercent'), 0))
  push(checkNumber(config.youngBelowPercent, at('youngBelowPercent'), 0, 100))
  // < 100 để mức giảm của lão niên chia được cho (100 − oldFromPercent).
  push(checkNumber(config.oldFromPercent, at('oldFromPercent'), config.youngBelowPercent ?? 0, 99))
  push(checkNumber(config.young?.statPercent, at('young.statPercent'), -99))
  push(checkNumber(config.young?.expPercent, at('young.expPercent'), -100))
  push(checkNumber(config.old?.statPercentAtEnd, at('old.statPercentAtEnd'), -99))
  push(checkNumber(config.old?.expPercent, at('old.expPercent'), -100))
  push(checkNumber(config.warnPercent, at('warnPercent'), 0, 100))
  const spawn = config.spawnAgePercent
  checkRange(spawn?.wild, at('spawnAgePercent.wild'), issues)
  checkRange(spawn?.boss, at('spawnAgePercent.boss'), issues)
  push(checkNumber(spawn?.starter, at('spawnAgePercent.starter'), 0, 100))
  push(checkNumber(config.fuseAbsorbPercent, at('fuseAbsorbPercent'), 0))
  push(checkNumber(config.legacyEgg?.genePercent, at('legacyEgg.genePercent'), 0))
  push(checkNumber(config.pillResistance, at('pillResistance'), 0, 1))
  for (const key of ['bossDrops', 'floorBossDrops'] as const) {
    if (!Array.isArray(config[key])) issues.push(`${at(key)} phải là danh sách`)
    else checkDrops(data, config[key], at(key), issues)
  }
}

/** Kiểm tra mọi dữ liệu của tuổi và thọ nguyên. */
export function checkLifespanData(data: GameData, issues: string[]): void {
  checkSpeciesLifespans(data, issues)
  checkClockConfig(data, issues)
  checkLifespanConfig(data, issues)
}
