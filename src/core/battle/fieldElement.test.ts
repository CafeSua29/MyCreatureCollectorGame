// Skill đổi hệ theo môi trường (elementId của fieldModifiers, kiểu Weather Ball / Terrain Pulse;
// mục "Môi trường" ở battle-environment.md): hệ mới dùng cho STAB, khắc chế, miễn nhiễm, hook theo hệ, AI,
// log; mục cần quái dùng đứng trên mặt đất; kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { fieldBenefit } from '../registries'
import { createRng } from '../shared'
import {
  dataIssues,
  defined,
  makeArena,
  makeBattleState,
  makeEnvironmentRawData,
  makeField,
  makeMonster,
  withFixtureText
} from '../testing'
import type { BattleField, GameData, Monster, Skill } from '../model'
import { computeDamage, expectedDamage, type DamageInput } from './damage'

const special = (overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill => ({
  elementId: 'normal',
  category: 'special',
  power: 50,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...overrides
})

function elementRaw(): ReturnType<typeof makeEnvironmentRawData> {
  const raw = makeEnvironmentRawData()
  raw.skills.push(
    // Kiểu Weather Ball: có thời tiết thì power 100 và đổi hệ; sương mù giữ hệ thường.
    special({
      id: 'weatherBall',
      fieldModifiers: [
        { fieldId: 'rain', power: 100, elementId: 'water' },
        { fieldId: 'storm', power: 100, elementId: 'fire' },
        { fieldId: 'fog', power: 100 }
      ]
    }),
    // Kiểu Terrain Pulse: chỉ khi quái dùng đứng trên mặt đất.
    special({
      id: 'terrainPulse',
      fieldModifiers: [
        { fieldId: 'grassy', power: 100, elementId: 'grass', requiresGroundedUser: true }
      ]
    })
  )
  return withFixtureText(raw)
}

const data: GameData = createGameData(elementRaw())
const rain = makeField({ weather: 'rain' })

// Quái mẫu: mọi chỉ số 50, hệ cỏ. Đặc biệt 50 không STAB lên quái mẫu: 7,5.
function damage(overrides: Partial<DamageInput>, field?: BattleField): number {
  return computeDamage({
    data,
    attacker: makeMonster({ id: 'atk', elementIds: ['ghost'] }),
    defender: makeMonster({ id: 'def' }),
    skill: data.skills.weatherBall,
    spread: false,
    rng: createRng(1),
    arena: field && makeArena(field),
    ...overrides
  }).damage.toNumber()
}

const flyer = (id = 'atk'): Monster => makeMonster({ id, elementIds: ['grass', 'flying'] })

describe('đổi hệ theo môi trường', () => {
  it('không có môi trường thì giữ hệ và sức mạnh gốc; ngoài trận cũng vậy', () => {
    expect(damage({}, makeField())).toBe(7)
    expect(damage({})).toBe(7)
  })

  it('mưa: hệ nước power 100, hook theo hệ của môi trường áp theo hệ mới', () => {
    // 15 × mưa (nước × 1,5) = 22,5.
    expect(damage({}, rain)).toBe(22)
  })

  it('khắc chế theo hệ mới (bão → lửa, lửa đánh cỏ × 2)', () => {
    expect(damage({}, makeField({ weather: 'storm' }))).toBe(30)
  })

  it('mục không có elementId chỉ đổi sức mạnh (sương mù: hệ thường 100)', () => {
    expect(damage({}, makeField({ weather: 'fog' }))).toBe(15)
  })

  it('STAB theo hệ mới: quái hệ nước được, quái hệ thường mất', () => {
    const water = makeMonster({ id: 'atk', elementIds: ['water'] })
    expect(damage({ attacker: water }, rain)).toBe(33) // 15 × 1,5 × 1,5
    const normal = makeMonster({ id: 'atk', elementIds: ['normal'] })
    expect(damage({ attacker: normal }, makeField())).toBe(11) // STAB hệ gốc
    expect(damage({ attacker: normal }, rain)).toBe(22)
  })

  it('miễn nhiễm theo hệ mới: hệ ma miễn hệ thường nhưng trúng hệ nước; trait cũng vậy', () => {
    const ghost = makeMonster({ id: 'def', elementIds: ['ghost'] })
    expect(damage({ defender: ghost }, makeField())).toBe(0)
    expect(damage({ defender: ghost }, rain)).toBe(22)
    const floater = makeMonster({ id: 'def', traits: [{ id: 'floater', level: 1 }] })
    expect(damage({ defender: floater }, makeField())).toBe(0)
    expect(damage({ defender: floater }, rain)).toBe(22)
  })

  it('cần đứng trên mặt đất: quái bay không đổi hệ / sức mạnh', () => {
    const grassy = makeField({ terrain: 'grassy' })
    const pulse = data.skills.terrainPulse
    // Đứng trên đất: hệ cỏ 100, STAB (quái cỏ) 1,5, địa hình cỏ × 1,5 → 33,75.
    expect(damage({ skill: pulse, attacker: makeMonster({ id: 'atk' }) }, grassy)).toBe(33)
    // Quái bay: hệ thường 50, không STAB.
    expect(damage({ skill: pulse, attacker: flyer() }, grassy)).toBe(7)
  })

  it('AI dự đoán theo hệ mới', () => {
    const base = {
      data,
      attacker: makeMonster({ id: 'atk', elementIds: ['ghost'] }),
      defender: makeMonster({ id: 'def', elementIds: ['ghost'] }),
      skill: data.skills.weatherBall,
      spread: false
    }
    expect(expectedDamage({ ...base, arena: makeArena(makeField()) }).toNumber()).toBe(0)
    expect(expectedDamage({ ...base, arena: makeArena(rain) }).toNumber()).toBeGreaterThan(20)
  })

  it('AI chấm môi trường: mục cần đứng trên đất không có lợi cho quái bay', () => {
    const grounded = makeMonster({ skillIds: ['terrainPulse'] })
    const flying = makeMonster({ elementIds: ['grass', 'flying'], skillIds: ['terrainPulse'] })
    // grassy: +1 tăng hệ cỏ (quái cỏ không có skill cỏ thì 0), +1 hồi máu cuối lượt, +1 skill.
    expect(fieldBenefit(data, grounded, 'grassy') - fieldBenefit(data, flying, 'grassy')).toBe(2)
  })

  it('log useSkill ghi hệ thật khi bị đổi, không ghi khi giữ hệ gốc', () => {
    const user = makeMonster({ id: 'a', skillIds: ['weatherBall'] })
    const ally = makeMonster({ id: 'b', skillIds: ['idle'] })
    const foe = makeMonster({ id: 'e1', skillIds: ['idle'] })
    const commands = [
      { slot: 0, kind: 'skill' as const, skillId: 'weatherBall', target: 0 },
      { slot: 1, kind: 'skill' as const, skillId: 'idle', target: 0 }
    ]
    const run = (field: BattleField): unknown[] => {
      const state = makeBattleState([user, ally], [foe], { field })
      const after = gameReducer(data, state, { type: 'submitTurn', commands })
      return defined(after.battle, 'trận').log.filter(
        (e) => e.type === 'useSkill' && e.monsterId === 'a'
      )
    }
    expect(run(rain)).toEqual([
      { type: 'useSkill', monsterId: 'a', skillId: 'weatherBall', elementId: 'water' }
    ])
    expect(run(makeField())).toEqual([{ type: 'useSkill', monsterId: 'a', skillId: 'weatherBall' }])
  })
})

describe('dữ liệu fieldModifiers', () => {
  it('elementId phải là hệ tồn tại; requiresGroundedUser chỉ là true; chỉ có cờ thì thiếu thay đổi', () => {
    const raw = elementRaw()
    raw.skills.push(
      special({ id: 'badElement', fieldModifiers: [{ fieldId: 'rain', elementId: 'lava' }] }),
      {
        ...special({ id: 'badFlag' }),
        fieldModifiers: [
          { fieldId: 'rain', elementId: 'water', requiresGroundedUser: false as unknown as true }
        ]
      },
      special({
        id: 'flagOnly',
        fieldModifiers: [{ fieldId: 'rain', requiresGroundedUser: true }]
      }),
      special({ id: 'elementOnly', fieldModifiers: [{ fieldId: 'rain', elementId: 'water' }] })
    )
    const issues = dataIssues(withFixtureText(raw)).join('\n')
    expect(issues).toMatch(/"badElement".*hệ không tồn tại "lava"/)
    expect(issues).toMatch(/"badFlag".*requiresGroundedUser chỉ được là true/)
    expect(issues).toMatch(/"flagOnly".*cần ít nhất/)
    expect(issues).not.toMatch(/elementOnly|"weatherBall"|"terrainPulse"/)
  })
})
