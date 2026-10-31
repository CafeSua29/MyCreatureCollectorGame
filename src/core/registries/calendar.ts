// Ngày đêm và mùa (docs/rules/calendar.md): điểm duy nhất suy thời khắc, mùa, tuần trăng từ
// GameState.time (không lưu thêm gì) và các hệ số theo lịch (gặp loài, thời tiết tự nhiên).

import {
  DAY_PHASES,
  HOURS_PER_DAY,
  MOON_PHASES,
  SEASONS,
  dayOf,
  hourOf,
  type ActiveTime,
  type DayPhase,
  type GameData,
  type MoonPhase,
  type NormalSpecies,
  type Season
} from '../model'

/** Trả về [] nếu value là giờ nguyên trong ngày (0–23), ngược lại một thông báo lỗi. */
export function checkHourOfDay(value: unknown, field: string): string[] {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < HOURS_PER_DAY
    ? []
    : [`${field} phải là giờ nguyên 0–${HOURS_PER_DAY - 1}, nhận ${String(value)}`]
}

/** Thời khắc của một mốc giờ: thời khắc có giờ bắt đầu gần nhất về trước (qua nửa đêm thì vòng lại). */
export function dayPhaseOf(data: GameData, time: number): DayPhase {
  const hour = hourOf(time)
  const starts = data.config.calendar.phaseStartHours
  let best: DayPhase = DAY_PHASES[0]
  // Khoảng cách lùi từ giờ hiện tại về giờ bắt đầu (0–23); nhỏ nhất là thời khắc đang diễn ra.
  let bestBack = Infinity
  for (const phase of DAY_PHASES) {
    const back = (hour - starts[phase] + HOURS_PER_DAY) % HOURS_PER_DAY
    if (back < bestBack) {
      best = phase
      bestBack = back
    }
  }
  return best
}

/** Mùa của một mốc giờ: năm (lifespan.daysPerYear ngày) chia đều 4 mùa, tính bằng số nguyên. */
export function seasonOf(data: GameData, time: number): Season {
  const { daysPerYear } = data.config.lifespan
  const dayOfYear = dayOf(time) % daysPerYear
  return SEASONS[Math.floor((dayOfYear * SEASONS.length) / daysPerYear)]
}

/** Tuần trăng của một mốc giờ: mỗi ngày một pha, ngày 0 là trăng non. */
export const moonPhaseOf = (time: number): MoonPhase =>
  MOON_PHASES[dayOf(time) % MOON_PHASES.length]

/** Giờ hoạt động suy theo hệ: mọi hệ có ghi phải cùng một giờ, lệch nhau thì không có. */
function elementActiveTime(data: GameData, elementIds: readonly string[]): ActiveTime | null {
  const found = new Set<ActiveTime>()
  for (const elementId of elementIds) {
    const activeTime = data.config.calendar.activeTimeByElement[elementId]
    if (activeTime !== undefined) found.add(activeTime)
  }
  return found.size === 1 ? [...found][0] : null
}

/**
 * Giờ hoạt động của loài: `activeTime` của loài, không thì theo race (id race trước nhóm race),
 * không thì theo hệ; null = gặp như nhau mọi giờ.
 */
export function speciesActiveTime(data: GameData, species: NormalSpecies): ActiveTime | null {
  if (species.activeTime !== undefined) return species.activeTime
  const byRace = data.config.calendar.activeTimeByRace
  const groupId = data.races[species.raceId]?.groupId
  const raceTime = byRace[species.raceId] ?? (groupId === undefined ? undefined : byRace[groupId])
  return raceTime ?? elementActiveTime(data, species.elementIds)
}

/** Hệ số trọng số gặp loài vào lúc `time` (1 khi loài không có giờ hoạt động). */
export function activeTimeMultiplier(data: GameData, species: NormalSpecies, time: number): number {
  const activeTime = speciesActiveTime(data, species)
  if (activeTime === null) return 1
  return data.config.calendar.activeTimeMultipliers[activeTime][dayPhaseOf(data, time)]
}

/** Hệ số trọng số của thời tiết tự nhiên `weatherId` vào mùa của `time` (thiếu = 1). */
export const seasonWeatherMultiplier = (data: GameData, weatherId: string, time: number): number =>
  data.config.calendar.seasonWeatherMultipliers[seasonOf(data, time)][weatherId] ?? 1
