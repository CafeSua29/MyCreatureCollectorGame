// Thuần thục skill trong trận (docs/rules/skill-mastery.md): exp khi dùng (trúng, trượt, hạ), lên
// cấp ghi log, power / accuracy / hiệu ứng phụ / số đòn tối thiểu theo cấp, chiêu Max và hợp kích
// kỹ không áp, AI dự đoán theo thuần thục.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  defined,
  makeBattleState,
  makeData,
  makeField,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BattleEvent, GameData, GameState, Monster, SkillMastery } from '../model'
import { expectedDamage } from './damage'
import { skillAccuracy } from './environment'

const data = makeData()

/** Dữ liệu fixture thêm skill gần như luôn trượt (1%) và skill đánh kèm 91% tê liệt. */
function masteryData(): GameData {
  const raw = makeRawData()
  const base = { elementId: 'normal', priority: 0, target: 'enemy' as const }
  raw.skills.push(
    { ...base, id: 'whiff', category: 'physical', power: 50, accuracy: 1, effects: [] },
    {
      ...base,
      id: 'jolt',
      category: 'physical',
      power: 1,
      accuracy: 100,
      effects: [{ type: 'applyStatus', params: { statusId: 'paralysis', chance: 91 } }]
    }
  )
  return createGameData(withFixtureText(raw))
}

const mastered = (skillId: string, level: number): Record<string, SkillMastery> => ({
  [skillId]: { level, exp: toBig(0) }
})

/** Quái địch không làm gì (chỉ có skill idle). */
const idleEnemy = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'e', skillIds: ['idle'], ...overrides })

function castSkill(gameData: GameData, state: GameState, skillId: string): GameState {
  return gameReducer(gameData, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })
}

const logOf = (state: GameState): BattleEvent[] => defined(state.battle).log

describe('exp thuần thục khi dùng skill', () => {
  it('trúng: +1 exp cho skill đã dùng; quái địch dùng skill cũng được exp', () => {
    const state = makeBattleState([makeMonster({ id: 'a' })], [idleEnemy()])
    const after = castSkill(data, state, 'strike')
    expect(after.party[0].skillMastery.strike.exp.toString()).toBe('1')
    expect(defined(after.battle).enemies[0].skillMastery.idle.exp.toString()).toBe('1')
  })

  it('trượt vẫn +1 exp', () => {
    const gameData = masteryData()
    const state = makeBattleState([makeMonster({ id: 'a', skillIds: ['whiff'] })], [idleEnemy()])
    const after = castSkill(gameData, state, 'whiff')
    expect(logOf(after).some((event) => event.type === 'miss')).toBe(true)
    expect(after.party[0].skillMastery.whiff.exp.toString()).toBe('1')
  })

  it('hạ mục tiêu: +1 +2 = 3 exp', () => {
    const enemy = idleEnemy()
    const weak = { ...enemy, damageTaken: getMaxHp(data, enemy).minus(1) }
    const after = castSkill(data, makeBattleState([makeMonster({ id: 'a' })], [weak]), 'strike')
    expect(defined(after.battle).outcome).toBe('won')
    expect(after.party[0].skillMastery.strike.exp.toString()).toBe('3')
  })

  it('đủ exp thì lên cấp, log masteryLevelUp', () => {
    const party = [makeMonster({ id: 'a', skillMastery: { strike: { level: 1, exp: toBig(3) } } })]
    const after = castSkill(data, makeBattleState(party, [idleEnemy()]), 'strike')
    // Tổng exp cấp 2 = 4: 3 + 1 đủ lên cấp.
    expect(after.party[0].skillMastery.strike).toEqual({ level: 2, exp: toBig(4) })
    expect(logOf(after)).toContainEqual({
      type: 'masteryLevelUp',
      monsterId: 'a',
      skillId: 'strike',
      level: 2
    })
  })
})

describe('hiệu lực thuần thục', () => {
  const attacker = (level: number): Monster =>
    makeMonster({ id: 'a', skillMastery: mastered('strike', level) })

  it('power × (1 + 0,05 × (cấp − 1)) trong công thức sát thương (AI dự đoán theo đó)', () => {
    const input = { data, defender: makeMonster({ id: 'e' }), skill: data.skills.strike }
    const base = expectedDamage({ ...input, attacker: attacker(1), spread: false })
    const strong = expectedDamage({ ...input, attacker: attacker(11), spread: false })
    expect(strong.div(base).toNumber()).toBeCloseTo(1.5, 2)
  })

  it('chiêu Max và hợp kích kỹ không áp', () => {
    const defender = makeMonster({ id: 'e' })
    const maxUser = makeMonster({ id: 'a', skillMastery: mastered('maxStrike', 11) })
    const maxInput = { data, defender, skill: data.skills.maxStrike, spread: false }
    expect(
      expectedDamage({ ...maxInput, attacker: maxUser }).eq(
        expectedDamage({ ...maxInput, attacker: makeMonster({ id: 'a' }) })
      )
    ).toBe(true)
    const partner = { monster: makeMonster({ id: 'b' }) }
    const comboInput = { data, defender, skill: data.skills.strike, spread: false, partner }
    expect(
      expectedDamage({ ...comboInput, attacker: attacker(11) }).eq(
        expectedDamage({ ...comboInput, attacker: attacker(1) })
      )
    ).toBe(true)
  })

  it('accuracy +1 mỗi cấp, kẹp 100', () => {
    const field = makeField()
    const shaky = data.skills.shaky
    const user = (level: number): Monster =>
      makeMonster({ id: 'a', skillMastery: mastered('shaky', level) })
    expect(skillAccuracy(data, field, shaky, { user: user(1) })).toBe(50)
    expect(skillAccuracy(data, field, shaky, { user: user(11) })).toBe(60)
    expect(skillAccuracy(data, field, shaky, { user: user(1000) })).toBe(100)
  })

  it('mốc cấp 10: hiệu ứng phụ 91% × 1,1 thành chắc chắn', () => {
    const gameData = masteryData()
    const paralyzed = (level: number, seed: number): boolean => {
      const party = [
        makeMonster({ id: 'a', skillIds: ['jolt'], skillMastery: mastered('jolt', level) })
      ]
      const state = { ...makeBattleState(party, [idleEnemy()]), rng: seed }
      const after = castSkill(gameData, state, 'jolt')
      return defined(after.battle).enemies[0].statuses.some((s) => s.statusId === 'paralysis')
    }
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1)
    expect(seeds.every((seed) => paralyzed(10, seed))).toBe(true)
    expect(seeds.some((seed) => !paralyzed(1, seed))).toBe(true)
  })

  it('mốc cấp 50: skill đánh 2–5 lần không còn ra 2 đòn', () => {
    const hits = (level: number, seed: number): number => {
      const party = [
        makeMonster({ id: 'a', skillIds: ['flurry'], skillMastery: mastered('flurry', level) })
      ]
      const strongEnemy = idleEnemy({
        genes: { hp: 1e6, attack: 10, defense: 1e6, spAttack: 10, spDefense: 10, speed: 1 }
      })
      const state = { ...makeBattleState(party, [strongEnemy]), rng: seed }
      const event = logOf(castSkill(data, state, 'flurry')).find((e) => e.type === 'hitCount')
      return event?.type === 'hitCount' ? event.hits : 0
    }
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1)
    expect(seeds.some((seed) => hits(1, seed) === 2)).toBe(true)
    expect(seeds.every((seed) => hits(50, seed) >= 3)).toBe(true)
  })
})
