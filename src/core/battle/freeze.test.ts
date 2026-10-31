// Đông lạnh kiểu Pokémon (docs/rules/battle-statuses.md): mất lượt, tan theo tỉ lệ lúc tới lượt rồi
// hành động luôn (endBeforeMove), tan khi trúng đòn hệ Lửa (endsOnElementHit), skill rã đông quái
// dùng (curesUserStatuses) / mục tiêu (curesTargetStatuses), kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { SKILL_EFFECTS } from '../registries'
import { createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeField,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type { BattleCommand, BattleEvent, GameData, GameState, Monster, Skill } from '../model'

const attack = (id: string, fields: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...fields
})

function makeFreezeData(thawChance: number): GameData {
  const raw = makeRawData()
  raw.statuses.push({
    id: 'freeze',
    kind: 'debuff',
    hooks: [
      { type: 'skipTurn', params: { chance: 100 } },
      // Không tan lúc tới lượt: bỏ hook (tỉ lệ 0 không hợp lệ).
      ...(thawChance > 0 ? [{ type: 'endBeforeMove', params: { chance: thawChance } }] : []),
      { type: 'endsOnElementHit', params: { elementIds: ['fire'] } }
    ]
  })
  raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, freeze: 0.4 }
  raw.skills.push(
    attack('flameWheel', { elementId: 'fire', curesUserStatuses: ['freeze'] }),
    attack('scald', { elementId: 'water', curesTargetStatuses: ['freeze'] })
  )
  return createGameData(withFixtureText(raw))
}

const frozen = { statusId: 'freeze', turnsLeft: null }

const fighter = (id: string, skillIds: string[], speed: number, statuses = [frozen]): Monster =>
  makeMonster({
    id,
    skillIds,
    statuses,
    genes: toBigStats({ ...uniformStats(10), hp: '1e9', speed })
  })

const cast = (skillId: string): BattleCommand => ({ slot: 0, kind: 'skill', skillId, target: 0 })

function turn(data: GameData, state: GameState, skillId: string): BattleEvent[] {
  const after = gameReducer(data, state, { type: 'submitTurn', commands: [cast(skillId)] })
  return defined(after.battle, 'trận').log
}

const usedSkills = (log: BattleEvent[]): string[] =>
  log.flatMap((e) => (e.type === 'useSkill' ? [`${e.monsterId}:${e.skillId}`] : []))

describe('đông lạnh', () => {
  it('không tan: mất lượt, không dùng skill', () => {
    const data = makeFreezeData(0)
    const state = makeBattleState([fighter('a', ['strike'], 100)], [fighter('e', ['idle'], 1, [])])
    const log = turn(data, state, 'strike')
    expect(log.some((e) => e.type === 'statusSkipTurn' && e.statusId === 'freeze')).toBe(true)
    expect(usedSkills(log)).not.toContain('a:strike')
  })

  it('tan lúc tới lượt (100%) thì hành động luôn trong lượt đó', () => {
    const data = makeFreezeData(100)
    const state = makeBattleState([fighter('a', ['strike'], 100)], [fighter('e', ['idle'], 1, [])])
    const log = turn(data, state, 'strike')
    expect(log).toContainEqual({ type: 'statusEnded', monsterId: 'a', statusId: 'freeze' })
    expect(usedSkills(log)).toContain('a:strike')
  })

  it('trúng đòn hệ Lửa thì tan; hệ khác thì không', () => {
    const data = makeFreezeData(0)
    const target = fighter('e', ['idle'], 1)
    const fire = makeBattleState([fighter('a', ['flameWheel'], 100, [])], [target])
    expect(turn(data, fire, 'flameWheel')).toContainEqual({
      type: 'statusEnded',
      monsterId: 'e',
      statusId: 'freeze'
    })
    const plain = makeBattleState([fighter('a', ['strike'], 100, [])], [target])
    expect(turn(data, plain, 'strike').some((e) => e.type === 'statusEnded')).toBe(false)
  })

  it('skill rã đông quái dùng (Flame Wheel) và mục tiêu (Scald)', () => {
    const data = makeFreezeData(0)
    const self = makeBattleState(
      [fighter('a', ['flameWheel'], 100)],
      [fighter('e', ['idle'], 1, [])]
    )
    expect(usedSkills(turn(data, self, 'flameWheel'))).toContain('a:flameWheel')
    const target = makeBattleState([fighter('a', ['scald'], 100, [])], [fighter('e', ['idle'], 1)])
    expect(turn(data, target, 'scald')).toContainEqual({
      type: 'statusEnded',
      monsterId: 'e',
      statusId: 'freeze'
    })
  })
})

describe('kiểm tra dữ liệu', () => {
  it('hook và trường skill sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.statuses.push({
          id: 'badFreeze',
          kind: 'debuff',
          hooks: [
            { type: 'endBeforeMove', params: { chance: 0 } },
            { type: 'endsOnElementHit', params: { elementIds: ['lava'] } }
          ]
        })
        raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, badFreeze: 0.1 }
        raw.skills.push(attack('badCure', { curesUserStatuses: ['nope'], curesTargetStatuses: [] }))
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toMatch(/endBeforeMove.*chance/)
    expect(issues).toMatch(/elementIds/)
    expect(issues).toMatch(/curesUserStatuses: trạng thái không tồn tại "nope"/)
    expect(issues).toMatch(/curesTargetStatuses phải là danh sách không rỗng/)
  })
})

describe('applyRandomStatus (Tri Attack)', () => {
  const data = makeFreezeData(20)
  const handler = SKILL_EFFECTS.applyRandomStatus
  const ctx = (seed: number, chanceMultiplier = 1): Parameters<typeof handler.apply>[1] => ({
    data,
    user: fighter('a', [], 1, []),
    target: fighter('e', [], 1, []),
    damageDealt: toBig(0),
    rng: createRng(seed),
    field: makeField(),
    onField: [],
    team: [],
    chanceMultiplier
  })

  it('trúng thì chọn một trạng thái trong danh sách, mọi trạng thái đều có cơ hội', () => {
    const params = { statusIds: ['burn', 'paralysis', 'freeze'] }
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const [change] = handler.apply(params, ctx(seed)).statusChanges
      seen.add(defined(change, 'trạng thái').statusId)
    }
    expect([...seen].sort()).toEqual(['burn', 'freeze', 'paralysis'])
  })

  it('tỉ lệ 0 thì không gây; kiểm tra dữ liệu', () => {
    const params = { statusIds: ['burn'], chance: 0 }
    expect(handler.apply(params, ctx(1)).statusChanges).toEqual([])
    expect(handler.validateParams({ statusIds: [] }, data).join()).toMatch(/statusIds/)
    expect(handler.validateParams({ statusIds: ['nope'] }, data).join()).toMatch(/nope/)
    expect(handler.validateParams({ statusIds: ['burn'], chance: 101 }, data).join()).toMatch(
      /chance/
    )
  })
})

describe('độc nặng: bộ đếm về 0 khi rút về (resetsOnLeave)', () => {
  it('rút về thì bỏ turnsElapsed, trạng thái vẫn còn', () => {
    const raw = makeRawData()
    raw.statuses.push({
      id: 'badPoison',
      kind: 'debuff',
      resetsOnLeave: true,
      hooks: [{ type: 'turnEndDamage', params: { percent: 6.25, escalating: true } }]
    })
    raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, badPoison: 0.45 }
    const data = createGameData(withFixtureText(raw))
    const poisoned = fighter('a', ['strike'], 1, [])
    const withCounter: Monster = {
      ...poisoned,
      statuses: [{ statusId: 'badPoison', turnsLeft: null, turnsElapsed: 3 }]
    }
    // Đội 3 quái: a, đồng đội ô 2, quái dự bị b.
    const state = makeBattleState(
      [withCounter, fighter('c', ['idle'], 1, []), fighter('b', ['strike'], 1, [])],
      [fighter('e', ['idle'], 1, [])]
    )
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'switch', monsterId: 'b' },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    const status = defined(after.party.find((m) => m.id === 'a')).statuses[0]
    expect(status?.statusId).toBe('badPoison')
    expect(status?.turnsElapsed).toBeUndefined()
  })
})
