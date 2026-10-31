// Cụm 5 (docs/rules/pokemon-moves.md mục "Bảo vệ và đòn trả"): họ Protect (chặn mọi đòn / chỉ đòn
// gây sát thương, hiệu ứng lên kẻ đánh tiếp xúc), Endure, Feint phá bảo vệ, đòn trả (Counter tự nhắm
// kẻ vừa đánh, sát thương theo đòn cuối đúng loại), kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { SKILL_EFFECTS, type SkillEffectAiContext } from '../registries'
import { BIG_ZERO } from '../shared'
import { expectedDamage } from './damage'
import { getCurrentHp } from '../monster'
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
import type { BattleCommand, BattleEvent, GameState, Monster, Skill } from '../model'

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
const guard = (id: string, params: Record<string, unknown> = {}): Skill =>
  skill(id, {
    category: 'status',
    power: 0,
    target: 'self',
    priority: 4,
    effects: [{ type: 'protect', params: { consecutiveChanceDivisor: 3, ...params } }]
  })

const SKILLS: Skill[] = [
  guard('guard'),
  guard('shield', {
    blocks: 'damaging',
    onContact: [{ do: 'stage', to: 'other', stats: ['attack'], delta: -1 }]
  }),
  guard('hold', { mode: 'endure' }),
  skill('tackle', { contact: true }),
  skill('ray', { category: 'special' }),
  skill('feint', { breaksProtect: true, priority: 2 }),
  skill('growl2', {
    category: 'status',
    power: 0,
    effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }]
  }),
  skill('smash', { power: 250, contact: true }),
  skill('counter', {
    priority: -5,
    targetsLastAttacker: { categories: ['physical'] },
    fixedDamage: { kind: 'counter', multiplier: 2, categories: ['physical'] }
  })
]

const raw = makeRawData()
raw.skills.push(...SKILLS)
raw.config.ai.defendWeight = 0.15
const data = createGameData(withFixtureText(raw))

const fighter = (id: string, skillIds: string[], speed = 10, hp = '1e6'): Monster =>
  makeMonster({ id, skillIds, genes: toBigStats({ ...uniformStats(20), hp, speed }) })

const cast = (skillId: string): BattleCommand => ({ slot: 0, kind: 'skill', skillId, target: 0 })

function turn(state: GameState, skillId: string): { state: GameState; log: BattleEvent[] } {
  const after = gameReducer(data, state, { type: 'submitTurn', commands: [cast(skillId)] })
  const log = defined(after.battle).log.slice(defined(state.battle).log.length)
  return { state: after, log }
}

const damageTo = (log: BattleEvent[], id: string): number =>
  log.reduce(
    (sum, e) => (e.type === 'damage' && e.targetId === id ? sum + e.amount.toNumber() : sum),
    0
  )

describe('họ Protect', () => {
  it('chặn mọi đòn; dùng liên tiếp có thể thất bại', () => {
    const state = makeBattleState([fighter('a', ['guard'])], [fighter('e', ['tackle'])])
    const first = turn(state, 'guard')
    expect(first.log.some((e) => e.type === 'protected')).toBe(true)
    expect(damageTo(first.log, 'a')).toBe(0)
  })

  it("chỉ chặn đòn gây sát thương (King's Shield); đòn tiếp xúc bị trừ công", () => {
    const contact = makeBattleState([fighter('a', ['shield'])], [fighter('e', ['tackle'])])
    const blocked = turn(contact, 'shield')
    expect(damageTo(blocked.log, 'a')).toBe(0)
    expect(defined(blocked.state.battle).stages.e).toEqual({ attack: -1 })
    const status = makeBattleState([fighter('a', ['shield'])], [fighter('e', ['growl2'])])
    expect(defined(turn(status, 'shield').state.battle).stages.a).toEqual({ attack: -1 })
    const special = makeBattleState([fighter('a', ['shield'])], [fighter('e', ['ray'])])
    const noContact = turn(special, 'shield')
    expect(noContact.log.some((e) => e.type === 'protected')).toBe(true)
    expect(defined(noContact.state.battle).stages.e).toBeUndefined()
  })

  it('Endure: trụ lại 1 máu trước đòn trong lượt', () => {
    const state = makeBattleState([fighter('a', ['hold'], 10, '1')], [fighter('e', ['smash'])])
    const after = turn(state, 'hold')
    expect(after.log).toContainEqual({ type: 'endured', monsterId: 'a' })
    expect(getCurrentHp(data, defined(after.state.party[0])).toNumber()).toBe(1)
  })

  it('Feint phá bảo vệ rồi đánh như thường', () => {
    const state = makeBattleState([fighter('a', ['feint'])], [fighter('e', ['guard'])])
    const after = turn(state, 'feint')
    expect(after.log).toContainEqual({ type: 'protectBroken', monsterId: 'e', userId: 'a' })
    expect(damageTo(after.log, 'e')).toBeGreaterThan(0)
  })
})

describe('đòn trả', () => {
  it('Counter: 2 × đòn vật lý vừa nhận, nhắm kẻ vừa đánh', () => {
    const state = makeBattleState([fighter('a', ['counter'])], [fighter('e', ['tackle'])])
    const after = turn(state, 'counter')
    expect(damageTo(after.log, 'e')).toBe(2 * damageTo(after.log, 'a'))
    expect(damageTo(after.log, 'a')).toBeGreaterThan(0)
  })

  it('không nhận đòn đúng loại trong lượt thì thất bại', () => {
    const state = makeBattleState([fighter('a', ['counter'])], [fighter('e', ['ray'])])
    const after = turn(state, 'counter')
    expect(after.log).toContainEqual({
      type: 'skillFailed',
      monsterId: 'a',
      skillId: 'counter',
      reason: 'condition'
    })
    expect(damageTo(after.log, 'e')).toBe(0)
  })
})

describe('điểm AI', () => {
  it('bảo vệ: defendWeight × máu đã mất, giảm khi vừa dùng ở lượt trước', () => {
    const healthy = fighter('a', ['guard'])
    const hurt = { ...healthy, damageTaken: healthy.damageTaken.plus('5e5') }
    const ctx = (
      user: Monster,
      protect?: { turn: number; streak: number }
    ): SkillEffectAiContext => ({
      data,
      user,
      target: user,
      targetIsAlly: true,
      stages: {},
      expectedDamage: BIG_ZERO,
      field: makeField(),
      side: 'player',
      allies: [user],
      foes: [],
      allyReserves: [],
      foeReserves: [],
      battleTurn: 5,
      volatiles: protect ? { a: { firstTurn: 1, protect } } : {}
    })
    const params = { consecutiveChanceDivisor: 3 }
    const value = (user: Monster, protect?: { turn: number; streak: number }): number =>
      SKILL_EFFECTS.protect.aiValue(params, ctx(user, protect))
    expect(value(healthy)).toBe(0)
    expect(value(hurt)).toBeGreaterThan(0)
    expect(value(hurt, { turn: 4, streak: 0 })).toBeCloseTo(value(hurt) / 3)
    expect(value(hurt, { turn: 2, streak: 0 })).toBe(value(hurt))
  })

  it('Counter: AI ước lượng = trung bình đòn đúng loại mục tiêu có thể dùng × 2', () => {
    const user = fighter('a', ['counter', 'tackle'])
    const estimate = (foeSkills: string[]): number =>
      expectedDamage({
        data,
        spread: false,
        attacker: user,
        defender: fighter('e', foeSkills),
        skill: data.skills.counter
      }).toNumber()
    const tackle = expectedDamage({
      data,
      spread: false,
      attacker: fighter('e', ['tackle']),
      defender: user,
      skill: data.skills.tackle
    }).toNumber()
    expect(estimate(['tackle'])).toBe(Math.floor(2 * tackle))
    expect(estimate(['tackle', 'ray'])).toBe(Math.floor(tackle))
    expect(estimate(['ray'])).toBe(0)
  })
})

describe('kiểm tra dữ liệu', () => {
  it('params / trường sai', () => {
    const issues = dataIssuesAfter(
      (r) =>
        r.skills.push(
          guard('badGuard', { mode: 'dodge', blocks: 'some', onContact: [{ do: 'nope' }] }),
          skill('badCounter', {
            contact: false as unknown as true,
            targetsLastAttacker: { categories: ['magic' as 'physical'] },
            fixedDamage: { kind: 'counter', multiplier: 0 }
          })
        ),
      { regenerateText: true }
    ).join('\n')
    expect(issues).toMatch(/mode phải là protect \/ endure/)
    expect(issues).toMatch(/blocks phải là all \/ damaging/)
    expect(issues).toMatch(/onContact/)
    expect(issues).toMatch(/contact chỉ được là true/)
    expect(issues).toMatch(/targetsLastAttacker\.categories/)
    expect(issues).toMatch(/multiplier/)
  })
})
