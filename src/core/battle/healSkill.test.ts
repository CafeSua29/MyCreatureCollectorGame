// Hiệu ứng skill heal (mục "Skill" và "HP, hồi máu, thua trận" ở battle.md): hồi % max HP của quái
// được hồi, làm tròn lên, kẹp max HP, đầy máu vẫn mất lượt, hồi đồng đội, số cực lớn, AI, dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import { SKILL_EFFECTS } from '../registries'
import { toBig } from '../shared'
import {
  dataIssues,
  defined,
  makeBattleState,
  makeField,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, BattleEvent, GameData, GameState, Monster, Skill } from '../model'

const statusSkill = (overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill => ({
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: 0,
  target: 'self',
  effects: [],
  ...overrides
})

function healRaw(): ReturnType<typeof makeRawData> {
  const raw = makeRawData()
  raw.skills.push(
    statusSkill({ id: 'recover', effects: [{ type: 'heal', params: { percent: 25 } }] }),
    statusSkill({ id: 'oddHeal', effects: [{ type: 'heal', params: { percent: 33 } }] }),
    statusSkill({
      id: 'healPulse',
      target: 'ally',
      effects: [{ type: 'heal', params: { percent: 50, who: 'target' } }]
    })
  )
  return withFixtureText(raw)
}

const data: GameData = createGameData(healRaw())

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const use = (slot: number, skillId: string): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0
})

// Quái mẫu: HP 50. Địch chỉ biết idle để không làm lệch máu quái ta.
const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['recover', 'oddHeal', 'healPulse', 'idle'], ...overrides })
const foe = (id: string): Monster => makeMonster({ id, skillIds: ['idle'] })

const member = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    `quái ${id}`
  )

const healEvents = (state: GameState): Extract<BattleEvent, { type: 'heal' }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: 'heal' }> => {
    return e.type === 'heal'
  })

describe('hiệu ứng heal', () => {
  it('hồi đúng % max HP của quái dùng (25% của 50 → 12,5 làm tròn lên 13)', () => {
    const state = makeBattleState([ally('a', { damageTaken: 30 }), ally('b')], [foe('e1')])
    const after = turn(state, use(0, 'recover'), use(1, 'idle'))
    expect(member(after, 'a').damageTaken.toNumber()).toBe(17)
    expect(healEvents(after)).toEqual([{ type: 'heal', monsterId: 'a', amount: toBig(13) }])
  })

  it('làm tròn lên với % lẻ (33% của 50 = 16,5 → 17)', () => {
    const state = makeBattleState([ally('a', { damageTaken: 40 }), ally('b')], [foe('e1')])
    const after = turn(state, use(0, 'oddHeal'), use(1, 'idle'))
    expect(member(after, 'a').damageTaken.toNumber()).toBe(23)
  })

  it('không vượt max HP; đầy máu thì không hồi, không log nhưng vẫn dùng lượt', () => {
    const scratched = makeBattleState([ally('a', { damageTaken: 5 }), ally('b')], [foe('e1')])
    const healed = turn(scratched, use(0, 'recover'), use(1, 'idle'))
    expect(member(healed, 'a').damageTaken.toNumber()).toBe(0)
    expect(healEvents(healed)[0].amount.toNumber()).toBe(5)

    const full = makeBattleState([ally('a'), ally('b')], [foe('e1')])
    const after = turn(full, use(0, 'recover'), use(1, 'idle'))
    expect(healEvents(after)).toEqual([])
    expect(after.battle?.log).toContainEqual({
      type: 'useSkill',
      monsterId: 'a',
      skillId: 'recover'
    })
  })

  it('who "target" hồi đồng đội; đồng đội gục thì không có mục tiêu', () => {
    const state = makeBattleState([ally('a'), ally('b', { damageTaken: 40 })], [foe('e1')])
    const after = turn(state, use(0, 'healPulse'), use(1, 'idle'))
    expect(member(after, 'b').damageTaken.toNumber()).toBe(15)
    expect(member(after, 'a').damageTaken.toNumber()).toBe(0)

    // b gục (damageTaken ≥ max HP): skill nhắm ally không có mục tiêu, b vẫn gục.
    const fainted = makeBattleState(
      [ally('a'), ally('b', { damageTaken: 50 }), ally('c')],
      [foe('e1')]
    )
    const noTarget = turn(fainted, use(0, 'healPulse'))
    expect(noTarget.battle?.log).toContainEqual({ type: 'noTarget', monsterId: 'a' })
    expect(member(noTarget, 'b').damageTaken.toNumber()).toBe(50)
  })

  it('số cực lớn: hồi đúng, không ra NaN / Infinity', () => {
    const huge: MonsterOverrides = { genes: { ...makeMonster().genes, hp: toBig('1e300') } }
    const big = ally('a', huge)
    const maxHp = getMaxHp(data, big)
    const state = makeBattleState(
      [{ ...big, damageTaken: maxHp.times(0.9) }, ally('b')],
      [foe('e1')]
    )
    const after = turn(state, use(0, 'recover'), use(1, 'idle'))
    const left = member(after, 'a').damageTaken
    expect(left.isFinite()).toBe(true)
    expect(left.eq(maxHp.times(0.9).minus(maxHp.times(25).div(100).ceil()))).toBe(true)
  })
})

describe('aiValue của heal', () => {
  const user = makeMonster({ id: 'u' })
  const target = makeMonster({ id: 't' })
  const base = {
    data,
    user,
    target,
    targetIsAlly: true,
    stages: {},
    expectedDamage: toBig(0),
    field: makeField(),
    side: 'player' as const,
    allies: [user, target],
    foes: [],
    allyReserves: [],
    foeReserves: []
  }
  const value = (params: unknown, overrides: Partial<typeof base> = {}): number =>
    SKILL_EFFECTS.heal.aiValue(params, { ...base, ...overrides })

  it('đầy máu = 0; theo máu thật hồi được / max HP × healWeight', () => {
    expect(value({ percent: 25 })).toBe(0)
    // Hồi 13 / 50.
    expect(value({ percent: 25 }, { user: makeMonster({ id: 'u', damageTaken: 30 }) })).toBeCloseTo(
      0.26
    )
    // Chỉ hồi được phần đã mất (5).
    expect(value({ percent: 25 }, { user: makeMonster({ id: 'u', damageTaken: 5 }) })).toBeCloseTo(
      0.1
    )
  })

  it('who "target" chấm theo máu của quái được hồi', () => {
    const hurt = makeMonster({ id: 't', damageTaken: 40 })
    expect(value({ percent: 50, who: 'target' }, { target: hurt })).toBeCloseTo(0.5)
    expect(value({ percent: 50 }, { target: hurt })).toBe(0)
  })
})

describe('dữ liệu heal', () => {
  it('percent > 0 và ≤ 100, who hợp lệ, who "target" chỉ cho skill / vật phẩm nhắm phe mình', () => {
    const raw = healRaw()
    raw.skills.push(
      statusSkill({ id: 'zeroHeal', effects: [{ type: 'heal', params: { percent: 0 } }] }),
      statusSkill({ id: 'overHeal', effects: [{ type: 'heal', params: { percent: 150 } }] }),
      statusSkill({
        id: 'badWho',
        effects: [{ type: 'heal', params: { percent: 10, who: 'enemy' } }]
      }),
      statusSkill({
        id: 'healFoe',
        target: 'enemy',
        effects: [{ type: 'heal', params: { percent: 10, who: 'target' } }]
      }),
      // Hồi bản thân trên skill đánh địch thì được.
      {
        ...statusSkill({ id: 'leechHit', target: 'enemy', category: 'special', power: 40 }),
        effects: [{ type: 'heal', params: { percent: 10 } }]
      }
    )
    raw.items.push({
      id: 'healDart',
      category: 'consumable',
      price: 10,
      use: 'battle',
      target: 'enemy',
      effects: [{ type: 'heal', params: { percent: 10, who: 'target' } }]
    })
    const issues = dataIssues(withFixtureText(raw)).join('\n')
    expect(issues).toMatch(/"zeroHeal".*percent/)
    expect(issues).toMatch(/"overHeal".*percent/)
    expect(issues).toMatch(/"badWho".*who phải là/)
    expect(issues).toMatch(/"healFoe".*chỉ dùng cho skill nhắm phe mình/)
    expect(issues).toMatch(/"healDart".*chỉ dùng cho skill nhắm phe mình/)
    expect(issues).not.toMatch(/leechHit/)
    expect(issues).not.toMatch(/"recover"|"healPulse"/)
  })
})
