// Kiểm tra dữ liệu ngày đêm và mùa (docs/rules/calendar.md): config.calendar và `activeTime` của
// loài.

import { ACTIVE_TIMES, DAY_PHASES, SEASONS, type GameData } from '../model'
import { checkFieldIdList, checkHourOfDay, raceRefIds } from '../registries'
import { asObject, checkNumber } from '../shared'

const AT = 'config.calendar'

/** Hệ số nhân trọng số: số hữu hạn > 0 (0 thì loài / thời tiết biến mất hẳn, không phải hệ số). */
function checkMultiplier(value: unknown, field: string, issues: string[]): void {
  if (typeof value === 'number' && value > 0 && Number.isFinite(value)) return
  issues.push(...checkNumber(value, field, Number.MIN_VALUE))
}

function checkPhaseStartHours(value: unknown, issues: string[]): void {
  const hours = asObject(value) ?? {}
  const seen = new Map<unknown, string>()
  for (const phase of DAY_PHASES) {
    const hour = hours[phase]
    const field = `${AT}.phaseStartHours.${phase}`
    const problems = checkHourOfDay(hour, field)
    if (problems.length > 0) {
      issues.push(...problems)
      continue
    }
    const other = seen.get(hour)
    if (other !== undefined) issues.push(`${field} trùng giờ bắt đầu với ${other}`)
    seen.set(hour, phase)
  }
}

/** Bảng id → giờ hoạt động: id thuộc `known`, giờ hoạt động thuộc ACTIVE_TIMES. */
function checkActiveTimeMap(
  value: unknown,
  {
    field,
    known,
    label
  }: { field: string; known: Readonly<Record<string, unknown>>; label: string },
  issues: string[]
): void {
  const map = asObject(value)
  if (!map) {
    issues.push(`${field} phải là object`)
    return
  }
  for (const [id, activeTime] of Object.entries(map)) {
    if (!Object.hasOwn(known, id)) issues.push(`${field}: ${label} không tồn tại "${id}"`)
    if (!(ACTIVE_TIMES as readonly unknown[]).includes(activeTime)) {
      issues.push(
        `${field}.${id} phải là ${ACTIVE_TIMES.join(' / ')}, nhận "${String(activeTime)}"`
      )
    }
  }
}

function checkSeasonWeather(data: GameData, value: unknown, issues: string[]): void {
  const bySeason = asObject(value) ?? {}
  for (const season of SEASONS) {
    const field = `${AT}.seasonWeatherMultipliers.${season}`
    const multipliers = asObject(bySeason[season])
    if (!multipliers) {
      issues.push(`${field} phải là object`)
      continue
    }
    const weatherIds = Object.keys(multipliers)
    // Mùa không có hệ số nào (object rỗng) là hợp lệ: thời tiết như trọng số của map.
    if (weatherIds.length > 0) issues.push(...checkFieldIdList(data, weatherIds, field, 'weather'))
    for (const [weatherId, multiplier] of Object.entries(multipliers)) {
      checkMultiplier(multiplier, `${field}.${weatherId}`, issues)
    }
  }
}

function checkCalendarConfig(data: GameData, issues: string[]): void {
  const calendar = asObject(data.config.calendar)
  if (!calendar) {
    issues.push(`${AT} phải là object`)
    return
  }
  checkPhaseStartHours(calendar.phaseStartHours, issues)
  const multipliers = asObject(calendar.activeTimeMultipliers) ?? {}
  for (const activeTime of ACTIVE_TIMES) {
    const byPhase = asObject(multipliers[activeTime]) ?? {}
    for (const phase of DAY_PHASES) {
      checkMultiplier(byPhase[phase], `${AT}.activeTimeMultipliers.${activeTime}.${phase}`, issues)
    }
  }
  checkActiveTimeMap(
    calendar.activeTimeByRace,
    { field: `${AT}.activeTimeByRace`, known: raceRefIds(data), label: 'race' },
    issues
  )
  checkActiveTimeMap(
    calendar.activeTimeByElement,
    { field: `${AT}.activeTimeByElement`, known: data.elements, label: 'hệ' },
    issues
  )
  checkSeasonWeather(data, calendar.seasonWeatherMultipliers, issues)
}

function checkSpeciesActiveTimes(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.activeTime === undefined) continue
    if (!(ACTIVE_TIMES as readonly unknown[]).includes(species.activeTime)) {
      issues.push(
        `Loài "${species.id}": activeTime phải là ${ACTIVE_TIMES.join(' / ')}, nhận "${String(species.activeTime)}"`
      )
    }
  }
}

/** Kiểm tra mọi dữ liệu của ngày đêm và mùa. */
export function checkCalendarData(data: GameData, issues: string[]): void {
  checkCalendarConfig(data, issues)
  checkSpeciesActiveTimes(data, issues)
}
