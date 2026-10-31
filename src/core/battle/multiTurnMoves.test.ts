// Cụm 6 (docs/rules/pokemon-moves.md mục "Chiêu nhiều lượt"): nạp hai lượt (lệnh bị ép, bỏ qua theo
// môi trường), bán vô hình, nghỉ sau Hyper Beam, khóa chiêu (Outrage lú lẫn, Uproar chặn ngủ), dùng
// liên tiếp (Fury Cutter), đòn đến muộn, nạp đầu lượt (Beak Blast, Focus Punch), kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, validateGameState } from '../game'
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
import type { BattleCommand, BattleEvent, BattleField, GameState, Monster, Skill } from '../model'

const skill = (id: string, fields: Partial<Skill> = {}): Skill => ({
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
const streak = { of: 'counter', counter: { of: 'skillStreak' } }

const SKILLS: Skill[] = [
  skill('soar', { charge: { invulnerable: 'air' } }),
  skill('beam', { charge: { skipInFieldIds: ['rain'] } }),
  skill('zap', { hitsInvulnerable: [{ kind: 'air', multiplier: 2 }] }),
  skill('hyperBlast', { recharge: true }),
  skill('rage', {
    lockIn: { kind: 'rampage', turns: { min: 2, max: 2 }, fatigueStatusId: 'confusion' }
  }),
  skill('roar2', {
    lockIn: { kind: 'uproar', turns: { min: 3, max: 3 }, blocksStatusIds: ['sleep'] }
  }),
  skill('lull', {
    category: 'status',
    power: 0,
    effects: [{ type: 'applyStatus', params: { statusId: 'sleep' } }]
  }),
  skill('cutter', {
    powerFormula: {
      type: 'steps',
      value: streak,
      steps: [{ atLeast: 2, power: 80 }],
      otherwise: 40
    }
  }),
  skill('foresee', { category: 'special', delayedTurns: 2 }),
  skill('beak', {
    priority: -3,
    chargeAtTurnStart: { onContactHit: [{ do: 'status', to: 'other', statusId: 'burn' }] }
  }),
  skill('focus', {
    priority: -3,
    chargeAtTurnStart: {},
    spell: { requires: [{ if: 'hitThisTurn', who: 'self', value: false }] }
  }),
  skill('jab', { contact: true })
]

const raw = makeRawData()
raw.skills.push(...SKILLS)
raw.statuses.push({
  id: 'confusion',
  kind: 'debuff',
  battleOnly: true,
  endsOnLeave: true,
  duration: { min: 2, max: 2 },
  hooks: [{ type: 'selfHit', params: { chance: 1, power: 40 } }]
})
raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, confusion: 0.2 }
const data = createGameData(withFixtureText(raw))

const fighter = (id: string, skillIds: string[], speed = 10): Monster =>
  makeMonster({ id, skillIds, genes: toBigStats({ ...uniformStats(20), hp: '1e9', speed }) })

const cast = (skillId: string): BattleCommand => ({ slot: 0, kind: 'skill', skillId, target: 0 })

function play(
  state: GameState,
  ...skillIds: string[]
): { state: GameState; turns: BattleEvent[][] } {
  const turns: BattleEvent[][] = []
  let current = state
  for (const skillId of skillIds) {
    const before = defined(current.battle).log.length
    current = gameReducer(data, current, { type: 'submitTurn', commands: [cast(skillId)] })
    turns.push(defined(current.battle).log.slice(before))
  }
  return { state: current, turns }
}

const scene = (player: Monster, enemy: Monster, field?: BattleField): GameState =>
  makeBattleState([player], [enemy], field ? { field } : {})
const damageTo = (log: BattleEvent[], id: string): number =>
  log.reduce(
    (sum, e) => (e.type === 'damage' && e.targetId === id ? sum + e.amount.toNumber() : sum),
    0
  )
const used = (log: BattleEvent[], id: string): string[] =>
  log.flatMap((e) => (e.type === 'useSkill' && e.monsterId === id ? [e.skillId] : []))

describe('nạp hai lượt', () => {
  it('lượt đầu nạp, lượt sau bị ép đánh dù lệnh khác; save giữa chừng hợp lệ', () => {
    const { turns } = play(
      scene(fighter('a', ['soar', 'jab']), fighter('e', ['idle'])),
      'soar',
      'jab'
    )
    expect(turns[0]).toContainEqual({ type: 'charging', monsterId: 'a', skillId: 'soar' })
    expect(damageTo(defined(turns[0]), 'e')).toBe(0)
    expect(used(defined(turns[1]), 'a')).toEqual(['soar'])
    expect(damageTo(defined(turns[1]), 'e')).toBeGreaterThan(0)
    const mid = play(scene(fighter('a', ['soar']), fighter('e', ['idle'])), 'soar').state
    expect(defined(mid.battle).volatiles.a?.charging?.skillId).toBe('soar')
    expect(validateGameState(data, mid)).toEqual([])
  })

  it('môi trường bỏ qua lượt nạp (Solar Beam trong nắng)', () => {
    const rainy = makeField({ weather: 'rain' })
    const { turns } = play(scene(fighter('a', ['beam']), fighter('e', ['idle']), rainy), 'beam')
    expect(damageTo(defined(turns[0]), 'e')).toBeGreaterThan(0)
  })

  it('bán vô hình: đòn thường trượt, đòn trúng được kiểu đó ×2', () => {
    const flier = fighter('e', ['soar'], 100)
    const plain = play(scene(fighter('a', ['jab'], 1), flier), 'jab')
    expect(damageTo(defined(plain.turns[0]), 'e')).toBe(0)
    const hit = play(scene(fighter('a', ['zap'], 1), flier), 'zap')
    const normal = play(scene(fighter('a', ['zap'], 1), fighter('e', ['idle'], 100)), 'zap')
    expect(damageTo(defined(hit.turns[0]), 'e')).toBe(2 * damageTo(defined(normal.turns[0]), 'e'))
  })
})

describe('nghỉ, khóa chiêu, dùng liên tiếp', () => {
  it('Hyper Beam: trúng thì lượt sau nghỉ', () => {
    const { turns } = play(
      scene(fighter('a', ['hyperBlast', 'jab']), fighter('e', ['idle'])),
      'hyperBlast',
      'jab'
    )
    expect(turns[1]).toContainEqual({ type: 'recharging', monsterId: 'a' })
    expect(used(defined(turns[1]), 'a')).toEqual([])
  })

  it('Outrage: khóa đủ lượt rồi lú lẫn', () => {
    const { state, turns } = play(
      scene(fighter('a', ['rage', 'jab']), fighter('e', ['idle'])),
      'rage',
      'jab'
    )
    expect(used(defined(turns[1]), 'a')).toEqual(['rage'])
    expect(defined(state.party[0]).statuses.map((s) => s.statusId)).toContain('confusion')
  })

  it('Uproar: không ai trên sân ngủ được trong lúc khóa', () => {
    const { turns } = play(scene(fighter('a', ['roar2'], 100), fighter('e', ['lull'], 1)), 'roar2')
    expect(
      defined(turns[0]).some((e) => e.type === 'statusApplied' && e.statusId === 'sleep')
    ).toBe(false)
  })

  it('dùng liên tiếp: lần 2 power ×2 (Fury Cutter); dùng skill khác thì đếm lại', () => {
    const { turns } = play(
      scene(fighter('a', ['cutter', 'jab']), fighter('e', ['idle'])),
      'cutter',
      'cutter',
      'jab',
      'cutter'
    )
    const [first, second, , fourth] = turns.map((log) => damageTo(log, 'e'))
    expect(second).toBe(2 * defined(first))
    expect(fourth).toBe(first)
  })
})

describe('đòn đến muộn và nạp đầu lượt', () => {
  it('Future Sight trúng ô mục tiêu sau 2 lượt', () => {
    const { turns } = play(
      scene(fighter('a', ['foresee', 'idle']), fighter('e', ['idle'])),
      'foresee',
      'idle',
      'idle'
    )
    expect(damageTo(defined(turns[0]), 'e')).toBe(0)
    expect(damageTo(defined(turns[1]), 'e')).toBe(0)
    expect(defined(turns[2]).some((e) => e.type === 'delayedAttackHit')).toBe(true)
    expect(damageTo(defined(turns[2]), 'e')).toBeGreaterThan(0)
  })

  it('Beak Blast: kẻ đánh tiếp xúc trong lượt nạp bị bỏng', () => {
    const { state } = play(scene(fighter('a', ['beak']), fighter('e', ['jab'])), 'beak')
    expect(defined(defined(state.battle).enemies[0]).statuses.map((s) => s.statusId)).toContain(
      'burn'
    )
  })

  it('Focus Punch: bị đánh trước khi dùng thì thất bại', () => {
    const hit = play(scene(fighter('a', ['focus']), fighter('e', ['jab'])), 'focus')
    expect(damageTo(defined(hit.turns[0]), 'e')).toBe(0)
    const calm = play(scene(fighter('a', ['focus']), fighter('e', ['idle'])), 'focus')
    expect(damageTo(defined(calm.turns[0]), 'e')).toBeGreaterThan(0)
  })
})

describe('kiểm tra dữ liệu', () => {
  it('trường sai', () => {
    const issues = dataIssuesAfter(
      (r) =>
        r.skills.push(
          skill('bad', {
            charge: { invulnerable: 'space' as 'air', skipInFieldIds: ['nope'] },
            recharge: false as unknown as true,
            lockIn: { kind: 'spin' as 'rampage', turns: { min: 3, max: 2 } },
            hitsInvulnerable: [],
            delayedTurns: 0
          })
        ),
      { regenerateText: true }
    ).join('\n')
    for (const fragment of [
      'charge.invulnerable',
      'skipInFieldIds',
      'recharge',
      'lockIn.kind',
      'lockIn.turns.min',
      'hitsInvulnerable',
      'delayedTurns'
    ]) {
      expect(issues).toContain(fragment)
    }
  })
})

describe('skill dùng ngay trước trong lượt (Round, Fusion)', () => {
  it('previousSkillThisTurn: ×2 khi đồng đội vừa dùng đúng skill, không tự tính chính nó', () => {
    const round = skill('round2', {
      spell: {
        powerBonus: [
          {
            percent: 100,
            when: [{ if: 'previousSkillThisTurn', skillIds: ['round2'], sameSide: true }]
          }
        ]
      }
    })
    const local = makeRawData()
    local.skills.push(round)
    const roundData = createGameData(withFixtureText(local))
    const pair = makeBattleState(
      [fighter('a', ['round2'], 100), fighter('b', ['round2'], 50)],
      [fighter('e', ['idle'], 1)]
    )
    const after = gameReducer(roundData, pair, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'round2', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'round2', target: 0 }
      ]
    })
    const hits = defined(after.battle).log.flatMap((e) =>
      e.type === 'damage' && e.targetId === 'e' ? [e.amount.toNumber()] : []
    )
    expect(hits).toHaveLength(2)
    expect(hits[1]).toBe(2 * defined(hits[0]))
  })
})
