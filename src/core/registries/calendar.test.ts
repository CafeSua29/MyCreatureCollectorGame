// Ngày đêm và mùa (docs/rules/calendar.md): thời khắc, mùa, tuần trăng, giờ hoạt động của loài,
// hệ số theo lịch; trọng số gặp loài khi sinh quái.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { generateWildMonster } from '../world'
import { createRng, type RngState } from '../shared'
import {
  dataIssues,
  defined,
  fixtureSite,
  makeData,
  makeRawData,
  withEventFixtures,
  withFixtureText
} from '../testing'
import type { GameData, Monster, NormalSpecies, RawGameData } from '../model'
import {
  activeTimeMultiplier,
  dayPhaseOf,
  moonPhaseOf,
  seasonOf,
  seasonWeatherMultiplier,
  speciesActiveTime
} from './calendar'

const DAY = 24
const data = makeData()

/** Dữ liệu fixture đã sửa raw (config lịch, loài). */
function dataWith(edit: (raw: RawGameData) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const speciesOf = (gameData: GameData, id: string): NormalSpecies =>
  defined(gameData.species[id], id) as NormalSpecies

describe('thời khắc, mùa, tuần trăng', () => {
  it('thời khắc theo giờ bắt đầu (dawn 6, day 7, dusk 17, night 18), qua nửa đêm vẫn là đêm', () => {
    const phases = [0, 5, 6, 7, 16, 17, 18, 23].map((hour) => dayPhaseOf(data, hour))
    expect(phases).toEqual(['night', 'night', 'dawn', 'day', 'day', 'dusk', 'night', 'night'])
    expect(dayPhaseOf(data, 3 * DAY + 12)).toBe('day')
    // Giờ cực lớn (số nguyên an toàn) vẫn đúng giờ trong ngày.
    const big = Math.floor(Number.MAX_SAFE_INTEGER / DAY) * DAY
    expect(dayPhaseOf(data, big + 6)).toBe('dawn')
  })

  it('giờ bắt đầu không theo thứ tự trong danh sách: thời khắc gần nhất về trước', () => {
    const shifted = dataWith((raw) => {
      raw.config.calendar.phaseStartHours = { dawn: 4, day: 9, dusk: 20, night: 1 }
    })
    const phases = [0, 1, 3, 4, 8, 9, 19, 20, 23].map((hour) => dayPhaseOf(shifted, hour))
    expect(phases).toEqual(['dusk', 'night', 'night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk'])
  })

  it('mùa chia đều năm (10 ngày: xuân 0–2, hạ 3–4, thu 5–7, đông 8–9), năm sau lặp lại', () => {
    const seasons = Array.from({ length: 11 }, (_, day) => seasonOf(data, day * DAY + 23))
    expect(seasons).toEqual([
      'spring',
      'spring',
      'spring',
      'summer',
      'summer',
      'autumn',
      'autumn',
      'autumn',
      'winter',
      'winter',
      'spring'
    ])
  })

  it('năm 1 ngày: luôn mùa xuân; năm rất dài: chia đều không lệch vì số thực', () => {
    const short = dataWith((raw) => void (raw.config.lifespan.daysPerYear = 1))
    expect([0, 1, 99].map((day) => seasonOf(short, day * DAY))).toEqual([
      'spring',
      'spring',
      'spring'
    ])
    const long = dataWith((raw) => void (raw.config.lifespan.daysPerYear = 400))
    expect([99, 100, 299, 300, 399].map((day) => seasonOf(long, day * DAY))).toEqual([
      'spring',
      'summer',
      'autumn',
      'winter',
      'winter'
    ])
  })

  it('tuần trăng: mỗi ngày một pha, 8 ngày một vòng, ngày 0 trăng non', () => {
    expect(moonPhaseOf(0)).toBe('new')
    expect(moonPhaseOf(4 * DAY + 23)).toBe('full')
    expect(moonPhaseOf(12 * DAY)).toBe('full')
    expect(moonPhaseOf(7 * DAY)).toBe('waningCrescent')
  })
})

describe('giờ hoạt động của loài', () => {
  const calendarData = dataWith((raw) => {
    raw.config.calendar.activeTimeByRace = { neutral: 'crepuscular', bruteGroup: 'nocturnal' }
    raw.config.calendar.activeTimeByElement = { grass: 'diurnal', fire: 'nocturnal' }
  })

  it('activeTime của loài thắng; race trước nhóm race; rồi theo hệ', () => {
    const weakling = speciesOf(calendarData, 'weakling')
    expect(speciesActiveTime(calendarData, { ...weakling, activeTime: 'nocturnal' })).toBe(
      'nocturnal'
    )
    // cathemeral ghi rõ (theo nguồn gốc): không suy theo race / hệ, hệ số 1 mọi giờ.
    const always = { ...weakling, activeTime: 'cathemeral' as const }
    expect(speciesActiveTime(calendarData, always)).toBe('cathemeral')
    expect([6, 12, 17, 22].map((time) => activeTimeMultiplier(calendarData, always, time))).toEqual(
      [1, 1, 1, 1]
    )
    // Race neutral có ghi: thắng hệ grass.
    expect(speciesActiveTime(calendarData, weakling)).toBe('crepuscular')
    // Race brute không ghi, nhóm bruteGroup có.
    expect(speciesActiveTime(calendarData, { ...weakling, raceId: 'brute' })).toBe('nocturnal')
  })

  it('theo hệ: các hệ có ghi phải cùng giờ, lệch nhau hoặc không hệ nào ghi thì null', () => {
    const onlyElements = dataWith((raw) => {
      raw.config.calendar.activeTimeByElement = { grass: 'diurnal', fire: 'nocturnal' }
    })
    const weakling = speciesOf(onlyElements, 'weakling')
    expect(speciesActiveTime(onlyElements, weakling)).toBe('diurnal')
    expect(speciesActiveTime(onlyElements, { ...weakling, elementIds: ['grass', 'normal'] })).toBe(
      'diurnal'
    )
    expect(speciesActiveTime(onlyElements, { ...weakling, elementIds: ['grass', 'fire'] })).toBe(
      null
    )
    expect(speciesActiveTime(onlyElements, { ...weakling, elementIds: ['normal'] })).toBe(null)
  })

  it('hệ số gặp theo thời khắc; loài không có giờ hoạt động luôn 1', () => {
    const weakling = { ...speciesOf(data, 'weakling'), activeTime: 'diurnal' as const }
    expect([12, 6, 17, 22].map((time) => activeTimeMultiplier(data, weakling, time))).toEqual([
      2, 1, 1, 0.5
    ])
    expect(activeTimeMultiplier(data, speciesOf(data, 'weakling'), 12)).toBe(1)
  })

  it('hệ số thời tiết theo mùa; thời tiết không ghi = 1', () => {
    const seasonal = dataWith((raw) => {
      raw.config.calendar.seasonWeatherMultipliers.winter = { rain: 3 }
    })
    expect(seasonWeatherMultiplier(seasonal, 'rain', 8 * DAY)).toBe(3)
    expect(seasonWeatherMultiplier(seasonal, 'rain', 0)).toBe(1)
    expect(seasonWeatherMultiplier(seasonal, 'storm', 8 * DAY)).toBe(1)
  })
})

describe('sinh quái theo thời khắc', () => {
  // field: weakling (grass) và strongling (fire) trọng số 1 : 1; strongling hoạt động ban đêm.
  const nightly = dataWith((raw) => {
    raw.biomes[0].encounters = [
      { speciesId: 'weakling', weight: 1 },
      { speciesId: 'strongling', weight: 1 }
    ]
    raw.config.calendar.activeTimeByElement = { fire: 'nocturnal' }
    raw.config.calendar.activeTimeMultipliers.nocturnal = {
      dawn: 1,
      day: 0.01,
      dusk: 1,
      night: 100
    }
  })
  const nightCount = (time: number | null): number => {
    let rng: RngState = createRng(5)
    let count = 0
    for (let i = 0; i < 200; i++) {
      let monster: Monster
      ;[monster, rng] = generateWildMonster(nightly, rng, { ...fixtureSite(nightly, 1), time }, 'w')
      if (monster.speciesId === 'strongling') count++
    }
    return count
  }

  it('loài ban đêm gặp nhiều về đêm, hiếm ban ngày; ngoài lịch (tháp) theo trọng số map', () => {
    expect(nightCount(22)).toBeGreaterThanOrEqual(190)
    expect(nightCount(12)).toBeLessThanOrEqual(10)
    const outside = nightCount(null)
    expect(outside).toBeGreaterThan(70)
    expect(outside).toBeLessThan(130)
  })
})

describe('kiểm tra dữ liệu lịch', () => {
  const issuesAfter = (edit: (raw: RawGameData) => void): string => {
    const raw = makeRawData()
    withEventFixtures(raw)
    edit(raw)
    return dataIssues(withFixtureText(raw)).join('\n')
  }

  it('fixture và cấu hình biên hợp lệ (giờ 0 / 23, hệ số rất nhỏ / rất lớn, mùa rỗng)', () => {
    expect(issuesAfter(() => {})).toBe('')
    const edge = issuesAfter((raw) => {
      raw.config.calendar.phaseStartHours = { dawn: 0, day: 1, dusk: 22, night: 23 }
      raw.config.calendar.activeTimeMultipliers.diurnal.day = 1e300
      raw.config.calendar.activeTimeMultipliers.nocturnal.day = 1e-300
      raw.config.calendar.seasonWeatherMultipliers.winter = { rain: 5 }
    })
    expect(edge).toBe('')
  })

  it('giờ bắt đầu sai / trùng, hệ số ≤ 0, race / hệ / thời tiết lạ, giờ hoạt động lạ', () => {
    const issues = issuesAfter((raw) => {
      const { calendar } = raw.config
      calendar.phaseStartHours = { dawn: 24, day: 7, dusk: 7, night: 1.5 }
      calendar.activeTimeMultipliers.diurnal.day = 0
      calendar.activeTimeMultipliers.crepuscular.dawn = -1
      // Ép kiểu: test cố ý ghi giá trị sai.
      calendar.activeTimeByRace = { nope: 'diurnal', neutral: 'always' as 'diurnal' }
      calendar.activeTimeByElement = { lava: 'nocturnal' }
      calendar.seasonWeatherMultipliers.summer = { grassy: 2, rain: 0 }
      const species = defined(raw.species[0], 'loài') as NormalSpecies
      species.activeTime = 'sometimes' as 'diurnal'
    })
    for (const expected of [
      'phaseStartHours.dawn phải là giờ nguyên',
      'phaseStartHours.dusk trùng giờ bắt đầu với day',
      'phaseStartHours.night phải là giờ nguyên',
      'activeTimeMultipliers.diurnal.day',
      'activeTimeMultipliers.crepuscular.dawn',
      'race không tồn tại "nope"',
      'activeTimeByRace.neutral phải là diurnal / nocturnal / crepuscular / cathemeral',
      'hệ không tồn tại "lava"',
      'không thuộc lớp weather',
      'seasonWeatherMultipliers.summer.rain',
      'activeTime phải là'
    ]) {
      expect(issues).toContain(expected)
    }
  })

  it('config.calendar thiếu thì báo lỗi, không văng', () => {
    // Ép kiểu: test cố ý bỏ config.
    const issues = issuesAfter((raw) => {
      raw.config.calendar = undefined as unknown as RawGameData['config']['calendar']
    })
    expect(issues).toContain('config.calendar phải là object')
  })

  it('event: dayPhases / seasons / moonPhases phải là danh sách không rỗng, đúng giá trị, không trùng', () => {
    const issues = issuesAfter((raw) => {
      const [first, second, third] = raw.events
      // Ép kiểu: test cố ý ghi giá trị sai.
      Object.assign(defined(first, 'event'), { dayPhases: [] })
      Object.assign(defined(second, 'event'), { seasons: ['monsoon'] })
      Object.assign(defined(third, 'event'), { moonPhases: ['full', 'full'] })
    })
    expect(issues).toContain('dayPhases phải là danh sách không rỗng')
    expect(issues).toContain('seasons: "monsoon"')
    expect(issues).toContain('moonPhases có phần tử trùng')
  })
})
