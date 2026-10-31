// Cụm 9 (docs/rules/pokemon-moves.md mục "Ép đổi quái"): Roar đẩy quái hoang khỏi trận, đẩy quái ta
// ra cho quái dự bị ngẫu nhiên vào, không đẩy được boss / quái bám rễ, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
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
import { SKILL_EFFECTS, type SkillEffectAiContext } from '../registries'
import { BIG_ZERO } from '../shared'
import type { BattleEvent, GameState, Monster, Skill } from '../model'

const roar: Skill = {
  id: 'roar2',
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: -6,
  target: 'enemy',
  effects: [{ type: 'forceSwitch', params: {} }]
}
const raw = makeRawData()
raw.skills.push(roar)
raw.statuses.push({
  id: 'rooted',
  kind: 'buff',
  battleOnly: true,
  hooks: [],
  traitHooks: [{ type: 'anchored', params: {} }]
})
raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, rooted: 0.1 }
const data = createGameData(withFixtureText(raw))

const fighter = (id: string, skillIds = ['idle'], fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id, skillIds, genes: toBigStats({ ...uniformStats(20), hp: '1e6' }), ...fields })

const logOf = (before: GameState, after: GameState): BattleEvent[] =>
  defined(after.battle).log.slice(defined(before.battle).log.length)

describe('ép đổi quái', () => {
  it('quái hoang bị đẩy thì bỏ đi khỏi trận', () => {
    const state = makeBattleState([fighter('a', ['roar2'])], [fighter('e')])
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'roar2', target: 0 }]
    })
    const log = logOf(state, after)
    expect(log).toContainEqual({ type: 'forcedOut', monsterId: 'e' })
    expect(log.some((e) => e.type === 'wildFled')).toBe(true)
  })

  it('quái ta bị đẩy: quái dự bị vào thay', () => {
    const state = makeBattleState(
      [fighter('a'), fighter('c'), fighter('b')],
      [fighter('e', ['roar2'])]
    )
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'idle', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    expect(logOf(state, after).some((e) => e.type === 'forcedOut')).toBe(true)
    expect(defined(after.battle).playerSlots).toContain('b')
  })

  it('boss hoang và quái bám rễ không bị đẩy', () => {
    const boss = makeBattleState([fighter('a', ['roar2'])], [fighter('e')], { isBoss: true })
    const bossAfter = gameReducer(data, boss, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'roar2', target: 0 }]
    })
    expect(logOf(boss, bossAfter)).toContainEqual({ type: 'forceSwitchFailed', monsterId: 'e' })
    const rooted = makeBattleState(
      [fighter('a', ['roar2'])],
      [fighter('e', ['idle'], { statuses: [{ statusId: 'rooted', turnsLeft: null }] })]
    )
    const rootedAfter = gameReducer(data, rooted, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'roar2', target: 0 }]
    })
    expect(logOf(rooted, rootedAfter)).toContainEqual({
      type: 'forceSwitchFailed',
      monsterId: 'e'
    })
  })
})

describe('điểm AI', () => {
  const user = makeMonster({ id: 'a' })
  const foe = makeMonster({ id: 'e' })
  const value = (overrides: Partial<SkillEffectAiContext>): number =>
    SKILL_EFFECTS.forceSwitch.aiValue(
      {},
      {
        data,
        user,
        target: foe,
        targetIsAlly: false,
        stages: {},
        expectedDamage: BIG_ZERO,
        field: makeField(),
        side: 'player',
        allies: [user],
        foes: [foe],
        allyReserves: [],
        foeReserves: [makeMonster({ id: 'r' })],
        ...overrides
      }
    )

  it('chỉ có điểm khi địch còn quái dự bị, không phải boss', () => {
    expect(value({})).toBe(data.config.ai.fieldWeight)
    expect(value({ foeReserves: [] })).toBe(0)
    expect(value({ isBoss: true })).toBe(0)
    expect(value({ targetIsAlly: true })).toBe(0)
  })
})

describe('kiểm tra dữ liệu', () => {
  it('forceSwitch không có params', () => {
    const issues = dataIssuesAfter(
      (r) =>
        r.skills.push({
          ...roar,
          id: 'badRoar',
          effects: [{ type: 'forceSwitch', params: { x: 1 } }]
        }),
      { regenerateText: true }
    ).join('\n')
    expect(issues).toMatch(/không có params/)
  })
})
