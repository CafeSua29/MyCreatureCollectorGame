// Công thức bắt kiểu Pokémon (mục "Bắt quái" ở battle.md): hệ số trạng thái, điều kiện bóng
// (BALL_BONUSES), Master Ball, lắc bóng và bắt chí mạng (rollCapture).

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import {
  ballBonusMultiplier,
  ballCatchRateBonus,
  monsterWeightKg,
  type BallContext
} from '../registries'
import { createRng } from '../shared'
import { dataIssuesAfter, makeData, makeMonster, makeRawData } from '../testing'
import type { BallItem, EffectDef, GameData, Monster } from '../model'
import { catchChance, rollCapture, statusCatchFactor } from './capture'

/** Fixture có hệ số bắt cho ngủ (2,5) / tê liệt (1,5) và số lắc / chí mạng tùy chọn. */
function captureData(capture: { shakeChecks?: number; criticalDivisor?: number } = {}): GameData {
  const raw = makeRawData()
  raw.config.capture = { ...raw.config.capture, ...capture }
  raw.statuses = raw.statuses.map((status) =>
    status.id === 'sleep'
      ? { ...status, catchMultiplier: 2.5 }
      : status.id === 'paralysis'
        ? { ...status, catchMultiplier: 1.5 }
        : status
  )
  return createGameData(raw)
}

const data = captureData()
const ball = (bonuses: EffectDef[] = [], extra: Partial<BallItem> = {}): BallItem => ({
  id: 'testBall',
  category: 'ball',
  price: 1,
  catchMultiplier: 1,
  bonuses,
  ...extra
})

const ctx = (overrides: Partial<BallContext> = {}): BallContext => ({
  data,
  target: makeMonster(),
  turn: 1,
  hour: 12,
  ownedSpeciesIds: new Set(),
  userLevel: 1,
  ...overrides
})

describe('hệ số trạng thái', () => {
  const withStatus = (...ids: string[]): Monster =>
    makeMonster({ statuses: ids.map((statusId) => ({ statusId, turnsLeft: 3 })) })

  it('ngủ × 2,5, tê liệt × 1,5, nhiều trạng thái lấy số lớn nhất, không có = 1', () => {
    expect(statusCatchFactor(data, makeMonster())).toBe(1)
    expect(statusCatchFactor(data, withStatus('sleep'))).toBe(2.5)
    expect(statusCatchFactor(data, withStatus('paralysis'))).toBe(1.5)
    expect(statusCatchFactor(data, withStatus('paralysis', 'sleep'))).toBe(2.5)
    // weakling catchRate 50, đầy máu ×0,1 → 5%; ngủ → 12,5%.
    expect(catchChance(data, withStatus('sleep'), ball())).toBeCloseTo(12.5)
  })
})

describe('điều kiện bóng (BALL_BONUSES)', () => {
  it('firstTurn: chỉ lượt đầu', () => {
    const quick = ball([{ type: 'firstTurn', params: { multiplier: 5 } }])
    expect(ballBonusMultiplier(quick, ctx({ turn: 1 }))).toBe(5)
    expect(ballBonusMultiplier(quick, ctx({ turn: 2 }))).toBe(1)
  })

  it('turnScaling: 1 + perTurn × (lượt − 1), tối đa max', () => {
    const timer = ball([{ type: 'turnScaling', params: { perTurn: 0.3, max: 4 } }])
    expect(ballBonusMultiplier(timer, ctx({ turn: 1 }))).toBe(1)
    expect(ballBonusMultiplier(timer, ctx({ turn: 5 }))).toBeCloseTo(2.2)
    expect(ballBonusMultiplier(timer, ctx({ turn: 1_000_000 }))).toBe(4)
  })

  it('targetElement / targetRace: đúng hệ / race của quái', () => {
    const net = ball([
      { type: 'targetElement', params: { elementIds: ['grass'], multiplier: 3.5 } }
    ])
    expect(ballBonusMultiplier(net, ctx())).toBe(3.5) // weakling hệ cỏ
    expect(ballBonusMultiplier(net, ctx({ target: makeMonster({ elementIds: ['fire'] }) }))).toBe(1)
    const race = ball([{ type: 'targetRace', params: { raceIds: ['neutral'], multiplier: 2 } }])
    expect(ballBonusMultiplier(race, ctx())).toBe(2)
  })

  it('hours: trong khung giờ, kể cả qua nửa đêm', () => {
    const dusk = ball([{ type: 'hours', params: { fromHour: 18, toHour: 6, multiplier: 3 } }])
    expect(ballBonusMultiplier(dusk, ctx({ hour: 20 }))).toBe(3)
    expect(ballBonusMultiplier(dusk, ctx({ hour: 3 }))).toBe(3)
    expect(ballBonusMultiplier(dusk, ctx({ hour: 6 }))).toBe(1)
    expect(ballBonusMultiplier(dusk, ctx({ hour: 12 }))).toBe(1)
    const day = ball([{ type: 'hours', params: { fromHour: 6, toHour: 18, multiplier: 2 } }])
    expect(ballBonusMultiplier(day, ctx({ hour: 12 }))).toBe(2)
  })

  it('ownedSpecies: đã sở hữu loài gốc', () => {
    const repeat = ball([{ type: 'ownedSpecies', params: { multiplier: 3.5 } }])
    expect(ballBonusMultiplier(repeat, ctx())).toBe(1)
    expect(ballBonusMultiplier(repeat, ctx({ ownedSpeciesIds: new Set(['weakling']) }))).toBe(3.5)
  })

  it('levelAdvantage: các mốc nhân dồn như Level Ball (×2 / ×4 / ×8)', () => {
    const level = ball([
      { type: 'levelAdvantage', params: { ratio: 1, multiplier: 2 } },
      { type: 'levelAdvantage', params: { ratio: 2, multiplier: 2 } },
      { type: 'levelAdvantage', params: { ratio: 4, multiplier: 2 } }
    ])
    const target = makeMonster({ level: 10 })
    expect(ballBonusMultiplier(level, ctx({ target, userLevel: 9 }))).toBe(1)
    expect(ballBonusMultiplier(level, ctx({ target, userLevel: 10 }))).toBe(2)
    expect(ballBonusMultiplier(level, ctx({ target, userLevel: 25 }))).toBe(4)
    expect(ballBonusMultiplier(level, ctx({ target, userLevel: 40 }))).toBe(8)
  })

  it('Master Ball (alwaysCatch): 100% kể cả boss cực mạnh', () => {
    const master = ball([], { alwaysCatch: true })
    expect(catchChance(data, makeMonster({ bossMultiplier: 1e12 }), master)).toBe(100)
  })

  it('kiểm tra dữ liệu: điều kiện lạ / params sai, cờ khác true, hệ số trạng thái ≤ 0', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.items.push(
        {
          id: 'b1',
          category: 'ball',
          price: 1,
          catchMultiplier: 1,
          bonuses: [{ type: 'zz', params: {} }]
        },
        {
          id: 'b2',
          category: 'ball',
          price: 1,
          catchMultiplier: 1,
          bonuses: [{ type: 'hours', params: { fromHour: 25, toHour: 1, multiplier: 2 } }],
          // Dữ liệu sai cố ý (cờ phải là true).
          ...({ alwaysCatch: false } as object)
        }
      )
      raw.statuses = raw.statuses.map((s) => (s.id === 'sleep' ? { ...s, catchMultiplier: 0 } : s))
    })
    expect(issues.some((issue) => issue.includes('b1') && issue.includes('zz'))).toBe(true)
    expect(issues.some((issue) => issue.includes('b2') && issue.includes('giờ phải < 24'))).toBe(
      true
    )
    expect(issues).toContain('Vật phẩm "b2": alwaysCatch chỉ được là true')
    expect(
      issues.some((issue) => issue.includes('sleep') && issue.includes('catchMultiplier'))
    ).toBe(true)
  })
})

describe('rollCapture (lắc bóng, bắt chí mạng)', () => {
  it('tỉ lệ 0 / 100: không tốn RNG', () => {
    const shaky = captureData({ shakeChecks: 4 })
    const rng = createRng(1)
    expect(rollCapture(shaky, rng, { chance: 0, criticalMultiplier: 2.5 })).toEqual({
      caught: false,
      critical: false,
      shakes: 0,
      rng
    })
    expect(rollCapture(shaky, rng, { chance: 100, criticalMultiplier: 2.5 }).caught).toBe(true)
  })

  it('4 lần kiểm: tổng xác suất bắt vẫn ≈ tỉ lệ; số lắc 0–3', () => {
    const shaky = captureData({ shakeChecks: 4 })
    let rng = createRng(7)
    let caught = 0
    const trials = 20_000
    for (let i = 0; i < trials; i++) {
      const roll = rollCapture(shaky, rng, { chance: 30, criticalMultiplier: 0 })
      rng = roll.rng
      if (roll.caught) caught++
      expect(roll.shakes).toBeGreaterThanOrEqual(0)
      expect(roll.shakes).toBeLessThanOrEqual(3)
      expect(roll.critical).toBe(false)
    }
    expect(caught / trials).toBeGreaterThan(0.28)
    expect(caught / trials).toBeLessThan(0.32)
  })

  it('chí mạng: một lần kiểm, một lần lắc; tỉ lệ bắt tổng cao hơn một chút', () => {
    const critical = captureData({ shakeChecks: 4, criticalDivisor: 1 })
    let rng = createRng(3)
    let caught = 0
    for (let i = 0; i < 5000; i++) {
      const roll = rollCapture(critical, rng, { chance: 30, criticalMultiplier: 1 })
      rng = roll.rng
      if (roll.critical) expect(roll.shakes).toBeLessThanOrEqual(1)
      if (roll.caught) caught++
    }
    expect(caught / 5000).toBeGreaterThan(0.3)
  })

  it('cùng RNG cho cùng kết quả', () => {
    const shaky = captureData({ shakeChecks: 4 })
    expect(rollCapture(shaky, createRng(5), { chance: 40, criticalMultiplier: 2.5 })).toEqual(
      rollCapture(shaky, createRng(5), { chance: 40, criticalMultiplier: 2.5 })
    )
  })
})

describe('mặc định fixture', () => {
  it('fixture: 1 lần kiểm, không chí mạng (RNG của test cũ không đổi)', () => {
    const fixture = makeData()
    expect(fixture.config.capture).toMatchObject({ shakeChecks: 1, criticalTiers: [] })
  })
})

describe('cân nặng và Heavy Ball', () => {
  const heavyData = (raceKg?: number, speciesKg?: number): GameData => {
    const raw = makeRawData()
    raw.races = raw.races.map((race) =>
      race.id === 'neutral' ? { ...race, weightKg: raceKg } : race
    )
    raw.species = raw.species.map((s) =>
      s.id === 'weakling' && s.kind === 'normal' ? { ...s, weightKg: speciesKg } : s
    )
    return createGameData(raw)
  }
  const heavy = ball([
    {
      type: 'weightTiers',
      params: {
        tiers: [
          { fromKg: 0, catchRateAdd: -8 },
          { fromKg: 100, catchRateAdd: 0 },
          { fromKg: 200, catchRateAdd: 8 },
          { fromKg: 300, catchRateAdd: 12 }
        ]
      }
    }
  ])

  it('loài ghi weightKg dùng số đó; không thì race × (tổng chỉ số / chuẩn)^mũ', () => {
    const exact = heavyData(10, 250)
    expect(monsterWeightKg(exact, makeMonster())).toBe(250)
    // weakling tổng 180 = chuẩn fixture 180 → đúng cân nặng race.
    expect(monsterWeightKg(heavyData(40), makeMonster())).toBeCloseTo(40)
    // Race không ghi: config.weight.defaultRaceKg (50).
    expect(monsterWeightKg(heavyData(), makeMonster())).toBeCloseTo(50)
  })

  it('Heavy Ball cộng thẳng vào catchRate theo mốc cân nặng, tối thiểu 1', () => {
    const at = (kg: number): number => {
      const d = heavyData(undefined, kg)
      const target = makeMonster()
      const c = { ...ctx({ target }), data: d }
      return catchChance(d, target, heavy, { catchRateBonus: ballCatchRateBonus(heavy, c) })
    }
    // weakling catchRate 50, đầy máu × 0,1.
    expect(at(50)).toBeCloseTo((50 - 8) * 0.1)
    expect(at(150)).toBeCloseTo(50 * 0.1)
    expect(at(250)).toBeCloseTo((50 + 8) * 0.1)
    expect(at(1e9)).toBeCloseTo((50 + 12) * 0.1)
    expect(catchChance(data, makeMonster(), ball(), { catchRateBonus: -1000 })).toBeCloseTo(0.1)
  })

  it('kiểm tra dữ liệu: weightKg ≤ 0, mốc không tăng dần', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.races[0] = { ...raw.races[0], weightKg: 0 }
      raw.items.push({
        id: 'hb',
        category: 'ball',
        price: 1,
        catchMultiplier: 1,
        bonuses: [
          {
            type: 'weightTiers',
            params: {
              tiers: [
                { fromKg: 100, catchRateAdd: 1 },
                { fromKg: 50, catchRateAdd: 2 }
              ]
            }
          }
        ]
      })
    })
    expect(issues.some((i) => i.includes('weightKg phải là số > 0'))).toBe(true)
    expect(issues.some((i) => i.includes('hb') && i.includes('tăng dần'))).toBe(true)
  })
})
