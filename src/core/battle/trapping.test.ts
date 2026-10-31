// Cụm 7 (docs/rules/pokemon-moves.md mục "Trói và giữ chân"): hook `trapped` chặn đổi quái / chạy
// trốn (ActionError monsterTrapped), hệ trapImmune miễn, trạng thái mất khi quái gây ra rời sân
// (endsWhenSourceLeaves), kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { ActionError } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type { GameState, Monster, Skill, StatusInstance } from '../model'

const raw = makeRawData()
raw.statuses.push({
  id: 'held',
  kind: 'debuff',
  battleOnly: true,
  endsOnLeave: true,
  endsWhenSourceLeaves: true,
  hooks: [],
  traitHooks: [{ type: 'trapped', params: {} }]
})
raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, held: 0.1 }
const index = raw.elements.findIndex((element) => element.id === 'ghost')
raw.elements[index] = { ...raw.elements[index], trapImmune: true }
const lookSkill: Skill = {
  id: 'look',
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [{ type: 'applyStatus', params: { statusId: 'held' } }]
}
raw.skills.push(lookSkill)
const data = createGameData(withFixtureText(raw))

const fighter = (id: string, fields: Partial<Monster> = {}): Monster =>
  makeMonster({
    id,
    skillIds: ['idle', 'look'],
    genes: toBigStats({ ...uniformStats(20), hp: '1e6' }),
    ...fields
  })

const heldBy = (sourceId: string): StatusInstance => ({
  statusId: 'held',
  turnsLeft: null,
  sourceId
})

describe('giữ chân', () => {
  const state = (player: Monster): GameState =>
    makeBattleState([player, fighter('c'), fighter('b')], [fighter('e', { skillIds: ['idle'] })])

  it('quái bị giữ chân không đổi ra được (ActionError monsterTrapped), state giữ nguyên', () => {
    const trapped = state(fighter('a', { statuses: [heldBy('e')] }))
    expect(() =>
      gameReducer(data, trapped, {
        type: 'submitTurn',
        commands: [
          { slot: 0, kind: 'switch', monsterId: 'b' },
          { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
        ]
      })
    ).toThrow(ActionError)
    expect(() => gameReducer(data, trapped, { type: 'flee' })).toThrow(/giữ chân/)
  })

  it('hệ miễn giữ chân (hệ Ma) đổi ra được', () => {
    const ghost = state(fighter('a', { elementIds: ['ghost'], statuses: [heldBy('e')] }))
    const after = gameReducer(data, ghost, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'switch', monsterId: 'b' },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    expect(defined(after.battle).playerSlots[0]).toBe('b')
  })

  it('trạng thái mất khi quái gây ra rời sân; ghi sourceId khi gây', () => {
    const start = makeBattleState(
      [fighter('a'), fighter('c'), fighter('b')],
      [fighter('e', { skillIds: ['idle'] })]
    )
    const after = gameReducer(data, start, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'look', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    const enemy = defined(defined(after.battle).enemies[0])
    expect(enemy.statuses.find((status) => status.statusId === 'held')?.sourceId).toBe('a')
    const switched = gameReducer(data, after, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'switch', monsterId: 'b' },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    expect(defined(defined(switched.battle).enemies[0]).statuses).toEqual([])
  })
})

describe('kiểm tra dữ liệu', () => {
  it('cờ endsWhenSourceLeaves chỉ được là true; hook trapped không có params', () => {
    const issues = dataIssuesAfter((r) => {
      r.statuses.push({
        id: 'badHold',
        kind: 'debuff',
        endsWhenSourceLeaves: false as unknown as true,
        hooks: [],
        traitHooks: [{ type: 'trapped', params: { extra: 1 } }]
      })
      r.config.ai.statusWeights = { ...r.config.ai.statusWeights, badHold: 0.1 }
    }).join('\n')
    expect(issues).toMatch(/endsWhenSourceLeaves chỉ được là true/)
    expect(issues).toMatch(/trapped/)
  })
})
