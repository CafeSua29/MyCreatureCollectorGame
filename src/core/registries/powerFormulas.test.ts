// Power theo công thức (docs/rules/pokemon-moves.md mục "Power theo công thức"): tuyến tính (kẹp,
// tối thiểu 1, chia 0), bảng mốc, mọi loại giá trị đầu vào, dùng trong công thức sát thương thật,
// kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { toBig, type Decimal } from '../shared'
import {
  dataIssuesAfter,
  makeArena,
  makeBattleContext,
  makeData,
  makeMonster,
  toBigStats,
  uniformStats
} from '../testing'
import type { Monster, NonHpStat, Skill } from '../model'
import { expectedDamage } from '../battle/damage'
import { getMaxHp } from '../monster'
import { formulaPower, type PowerFormula, type PowerFormulaEnv } from './powerFormulas'

const data = makeData()
const user = makeMonster({ id: 'u', affinity: 255 })
const target = makeMonster({ id: 't' })

function env({
  speed = { u: 100, t: 100 },
  hp = { u: 1, t: 1 },
  userStages = {},
  targetStages = {}
}: {
  speed?: Record<string, number>
  hp?: Record<string, number>
  userStages?: Record<string, number>
  targetStages?: Record<string, number>
} = {}): PowerFormulaEnv {
  return {
    view: {
      data,
      self: user,
      selfCtx: makeBattleContext({ stages: userStages }),
      target,
      targetCtx: makeBattleContext({ stages: targetStages })
    },
    readStat: (monster: Monster, stat: NonHpStat): Decimal =>
      toBig(stat === 'speed' ? (speed[monster.id] ?? 0) : 1),
    hpRatio: (monster: Monster): number => hp[monster.id] ?? 1
  }
}

const eruption: PowerFormula = {
  type: 'linear',
  value: { of: 'hpPercent', who: 'self' },
  times: 1.5
}
const gyro: PowerFormula = {
  type: 'linear',
  value: {
    of: 'ratio',
    numerator: { of: 'stat', stat: 'speed', who: 'target' },
    denominator: { of: 'stat', stat: 'speed', who: 'self' }
  },
  times: 25,
  plus: 1,
  max: 150
}
const flail: PowerFormula = {
  type: 'steps',
  value: { of: 'hpPercent', who: 'self' },
  steps: [
    { below: (2 / 48) * 100, power: 200 },
    { below: (5 / 48) * 100, power: 150 },
    { below: (33 / 48) * 100, power: 40 }
  ],
  otherwise: 20
}

describe('tuyến tính', () => {
  it('Eruption: 150 × % máu, làm tròn xuống, tối thiểu 1', () => {
    expect(formulaPower(eruption, env())).toBe(150)
    expect(formulaPower(eruption, env({ hp: { u: 0.5 } }))).toBe(75)
    expect(formulaPower(eruption, env({ hp: { u: 0.333 } }))).toBe(49)
    expect(formulaPower(eruption, env({ hp: { u: 0 } }))).toBe(1)
  })

  it('Gyro Ball: ⌊25 × tốc độ mục tiêu / tốc độ quái dùng⌋ + 1, tối đa 150; chia 0 kẹp max', () => {
    expect(formulaPower(gyro, env({ speed: { u: 100, t: 100 } }))).toBe(26)
    expect(formulaPower(gyro, env({ speed: { u: 10, t: 1000 } }))).toBe(150)
    expect(formulaPower(gyro, env({ speed: { u: 1000, t: 1 } }))).toBe(1)
    expect(formulaPower(gyro, env({ speed: { u: 0, t: 5 } }))).toBe(150)
  })

  it('tổng bậc dương (Stored Power / Punishment), thân mật (Return), bộ đếm', () => {
    const stored: PowerFormula = {
      type: 'linear',
      value: { of: 'positiveStages', who: 'self' },
      times: 20,
      plus: 20
    }
    expect(formulaPower(stored, env({ userStages: { attack: 2, defense: -1, speed: 1 } }))).toBe(80)
    const punishment: PowerFormula = {
      ...stored,
      value: { of: 'positiveStages', who: 'target' },
      plus: 60,
      max: 200
    }
    expect(formulaPower(punishment, env({ targetStages: { attack: 6, speed: 6 } }))).toBe(200)
    const ret: PowerFormula = {
      type: 'linear',
      value: { of: 'affinityPercent', who: 'self' },
      times: 1.02
    }
    expect(formulaPower(ret, env())).toBe(102)
    const turns: PowerFormula = {
      type: 'linear',
      value: { of: 'counter', counter: { of: 'turnsOnField' } },
      times: 10
    }
    expect(formulaPower(turns, env())).toBe(10)
  })
})

describe('bảng mốc', () => {
  it('Flail: mốc đầu tiên thỏa, không thỏa thì otherwise; biên đúng mốc', () => {
    expect(formulaPower(flail, env({ hp: { u: 0.01 } }))).toBe(200)
    expect(formulaPower(flail, env({ hp: { u: 2 / 48 } }))).toBe(150)
    expect(formulaPower(flail, env({ hp: { u: 0.5 } }))).toBe(40)
    expect(formulaPower(flail, env({ hp: { u: 1 } }))).toBe(20)
  })

  it('cân nặng mục tiêu (Grass Knot) và tỉ lệ cân nặng (Heavy Slam)', () => {
    const knot: PowerFormula = {
      type: 'steps',
      value: { of: 'weight', who: 'target' },
      steps: [{ atLeast: 1e300, power: 120 }],
      otherwise: 20
    }
    expect(formulaPower(knot, env())).toBe(20)
    const slam: PowerFormula = {
      type: 'steps',
      value: {
        of: 'ratio',
        numerator: { of: 'weight', who: 'self' },
        denominator: { of: 'weight', who: 'target' }
      },
      steps: [{ atLeast: 1, power: 60 }],
      otherwise: 40
    }
    expect(formulaPower(slam, env())).toBe(60)
  })
})

describe('trong công thức sát thương', () => {
  it('sát thương theo power công thức (Eruption khi đầy máu / nửa máu); số cực lớn không tràn', () => {
    const skill: Skill = {
      id: 'erupt',
      elementId: 'normal',
      category: 'special',
      power: 60,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: [],
      powerFormula: eruption
    }
    const attacker = makeMonster({
      id: 'a',
      genes: toBigStats({ ...uniformStats(1000), hp: '1e30' })
    })
    const defender = makeMonster({
      id: 'd',
      genes: toBigStats({ ...uniformStats(10), hp: '1e30' })
    })
    const damage = (a: Monster): Decimal =>
      expectedDamage({ data, attacker: a, defender, skill, spread: false, arena: makeArena() })
    const full = damage(attacker)
    const half = damage({ ...attacker, damageTaken: getMaxHp(data, attacker).div(2) })
    expect(full.isFinite()).toBe(true)
    expect(full.div(half).toNumber()).toBeCloseTo(2, 1)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (fields: Partial<Skill>): string =>
    dataIssuesAfter(
      (raw) =>
        raw.skills.push({
          id: 'bad',
          elementId: 'normal',
          category: 'physical',
          power: 40,
          accuracy: 100,
          priority: 0,
          target: 'enemy',
          effects: [],
          ...fields
        }),
      { regenerateText: true }
    ).join('\n')

  it('hợp lệ / sai', () => {
    expect(issuesFor({ powerFormula: gyro })).toBe('')
    expect(issuesFor({ powerFormula: flail })).toBe('')
    expect(issuesFor({ powerFormula: { ...eruption, type: 'cubic' } })).toMatch(/type/)
    expect(
      issuesFor({ powerFormula: { ...eruption, value: { of: 'mood', who: 'self' } } })
    ).toMatch(/of/)
    expect(
      issuesFor({ powerFormula: { ...eruption, value: { of: 'hpPercent', who: 'ally' } } })
    ).toMatch(/who/)
    expect(
      issuesFor({ powerFormula: { ...eruption, value: { of: 'stat', stat: 'hp', who: 'self' } } })
    ).toMatch(/stat/)
    expect(issuesFor({ powerFormula: { ...flail, steps: [] } })).toMatch(/steps/)
    expect(issuesFor({ powerFormula: { ...flail, steps: [{ power: 5 }] } })).toMatch(
      /atLeast hoặc below/
    )
    expect(issuesFor({ powerFormula: { ...flail, otherwise: 0 } })).toMatch(/otherwise/)
    expect(issuesFor({ powerFormula: eruption, power: 0, category: 'status' })).toMatch(
      /chỉ dùng cho skill gây sát thương/
    )
  })
})
