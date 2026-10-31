// Hook trait sống sót (registries/survivalTraitHooks.ts): trụ lại 1 máu trước đòn skill
// (surviveLethal: đầy máu kiểu Sturdy, hoặc theo tỉ lệ một lần mỗi trận) và hồi sinh một lần mỗi
// trận (reviveOnce, trong loseHp); không tính hạ gục; AI; save v19.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { SAVE_VERSION, deserializeState, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { getCurrentHp, getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  TraitDef
} from '../model'
import { cloneDraft } from './draft'
import { knockoutValueFactor } from './hitTraitScore'

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'rare', hooks: [{ type, params }] }
}

const TRAITS: TraitDef[] = [
  trait('lastStand', 'surviveLethal', { fromFullHp: true }),
  trait('tooHorrible', 'surviveLethal', { fromFullHp: false, chance: 30 }),
  trait('rebirth', 'reviveOnce', { hpPercent: 30 }),
  trait('moxie', 'stageOnKnockout', { stat: 'attack', stages: 1 })
]

const data: GameData = (() => {
  const raw = makeRawData()
  raw.traits.push(...TRAITS)
  return createGameData(withFixtureText(raw))
})()

type TraitList = (string | [string, number])[]

/** Quái mẫu mọi chỉ số 50 (HP 50), hệ ma, trait cấp 1 (hoặc cấp cho trước). */
const fighter = (id: string, traits: TraitList = [], extra: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['idle', 'strike', 'scaleShot'],
    traits: traits.map((entry) =>
      typeof entry === 'string' ? { id: entry, level: 1 } : { id: entry[0], level: entry[1] }
    ),
    ...extra
  })

/** Quái ta công cực lớn: strike luôn đủ hạ mọi quái mẫu. */
const smasher = (id: string, traits: TraitList = []): Monster =>
  fighter(id, traits, { genes: toBigStats({ ...uniformStats(10), attack: '1e6' }) })

/** Quái địch hệ nước, chỉ biết idle. */
const foe = (id: string, traits: TraitList = [], extra: MonsterOverrides = {}): Monster =>
  fighter(id, traits, { skillIds: ['idle'], elementIds: ['water'], ...extra })

const run = (state: GameState, commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })
const cast = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = (state: GameState, type: BattleEvent['type']): BattleEvent[] =>
  battleOf(state).log.filter((event) => event.type === type)
const monsterIn = (state: GameState, id: string): Monster =>
  defined(
    [...state.party, ...battleOf(state).enemies].find((monster) => monster.id === id),
    `quái ${id}`
  )
const hpOf = (state: GameState, id: string): number =>
  getCurrentHp(data, monsterIn(state, id)).toNumber()

/** Đặt máu đã mất của quái trong state (giữa hai lượt). */
function withDamage(state: GameState, id: string, damageTaken: number): GameState {
  const next = cloneDraft(state)
  const monster = defined(
    [...next.party, ...next.battle.enemies].find((entry) => entry.id === id),
    id
  )
  monster.damageTaken = toBig(damageTaken)
  return next
}

describe('surviveLethal fromFullHp (kiểu Sturdy)', () => {
  it('đầy máu: đòn đủ hạ thì còn 1 máu, log trait; không đầy máu thì gục', () => {
    const full = run(makeBattleState([smasher('a')], [foe('e1', ['lastStand'])]), [
      cast(0, 'strike')
    ])
    expect(hpOf(full, 'e1')).toBe(1)
    expect(battleOf(full).log).toContainEqual({
      type: 'traitTriggered',
      monsterId: 'e1',
      traitId: 'lastStand'
    })
    // Không giới hạn số lần nên không ghi usedOnce.
    expect(battleOf(full).usedOnce).toEqual({})

    const hurt = run(
      makeBattleState([smasher('a')], [foe('e1', ['lastStand'], { damageTaken: 1 }), foe('e2')]),
      [cast(0, 'strike')]
    )
    expect(hpOf(hurt, 'e1')).toBe(0)
  })

  it('chiêu nhiều đòn: đòn đầu trụ lại, đòn sau hạ', () => {
    const after = run(makeBattleState([smasher('a')], [foe('e1', ['lastStand']), foe('e2')]), [
      cast(0, 'scaleShot')
    ])
    expect(hpOf(after, 'e1')).toBe(0)
    expect(eventsOf(after, 'hitCount')).toEqual([
      { type: 'hitCount', monsterId: 'a', targetId: 'e1', hits: 2 }
    ])
  })

  it('hồi đầy lại thì trụ được lần nữa', () => {
    const first = run(makeBattleState([smasher('a')], [foe('e1', ['lastStand'])]), [
      cast(0, 'strike')
    ])
    const second = run(withDamage(first, 'e1', 0), [cast(0, 'strike')])
    expect(hpOf(second, 'e1')).toBe(1)
  })

  it('không chặn mất máu ngoài đòn skill (Perish Song)', () => {
    const state = makeBattleState([fighter('a')], [foe('e1', ['lastStand']), foe('e2')], {
      volatiles: { a: { firstTurn: 1 }, e1: { firstTurn: 1, perishTurns: 1 } }
    })
    const after = run(state, [cast(0, 'idle')])
    expect(hpOf(after, 'e1')).toBe(0)
  })

  it('số cực lớn: còn một phần rất nhỏ (Decimal 40 chữ số không giữ được "− 1")', () => {
    const giant = foe('e1', ['lastStand'], {
      genes: toBigStats({ ...uniformStats(10), hp: '1e1000' })
    })
    const attacker = fighter('a', [], {
      genes: toBigStats({ ...uniformStats(10), attack: '1e2000' })
    })
    const after = run(makeBattleState([attacker], [giant]), [cast(0, 'strike')])
    const e1 = monsterIn(after, 'e1')
    const left = getCurrentHp(data, e1)
    expect(left.gt(0)).toBe(true)
    expect(left.lte(getMaxHp(data, e1).times(1e-29))).toBe(true)
  })
})

describe('surviveLethal theo tỉ lệ (một lần mỗi trận)', () => {
  // Cấp 13: 30% × 3,4 = 102% → kẹp 100%: luôn trụ, không tốn RNG.
  const sure: [string, number] = ['tooHorrible', 13]

  it('trụ lại cả khi không đầy máu; ghi usedOnce; lần sau trong trận thì gục', () => {
    const state = makeBattleState(
      [smasher('a')],
      [foe('e1', [sure], { damageTaken: 20 }), foe('e2')]
    )
    const first = run(state, [cast(0, 'strike')])
    expect(hpOf(first, 'e1')).toBe(1)
    expect(battleOf(first).usedOnce).toEqual({ e1: ['surviveLethal'] })
    const second = run(withDamage(first, 'e1', 0), [cast(0, 'strike')])
    expect(hpOf(second, 'e1')).toBe(0)
  })

  it('còn 1 máu thì không trụ (không bất tử)', () => {
    const state = makeBattleState(
      [smasher('a')],
      [foe('e1', [sure], { damageTaken: 49 }), foe('e2')]
    )
    expect(hpOf(run(state, [cast(0, 'strike')]), 'e1')).toBe(0)
  })

  it('cấp 1 (30%): có seed trụ, có seed không; cùng seed cùng kết quả', () => {
    const outcomes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => {
      const state = {
        ...makeBattleState([smasher('a')], [foe('e1', ['tooHorrible']), foe('e2')]),
        rng: seed
      }
      const once = hpOf(run(state, [cast(0, 'strike')]), 'e1')
      expect(hpOf(run(state, [cast(0, 'strike')]), 'e1')).toBe(once)
      return once
    })
    expect(outcomes).toContain(0)
    expect(outcomes).toContain(1)
  })
})

describe('reviveOnce (hồi sinh một lần mỗi trận)', () => {
  it('gục vì skill: sống lại 30% max HP ở lại sân, mất bậc trận, không tính hạ gục', () => {
    const state = makeBattleState([smasher('a', ['moxie'])], [foe('e1', ['rebirth'])], {
      stages: { e1: { defense: 2 } },
      volatiles: { a: { firstTurn: 1 }, e1: { firstTurn: 1, knockouts: 2 } }
    })
    const after = run(state, [cast(0, 'strike')])
    expect(hpOf(after, 'e1')).toBe(15)
    expect(battleOf(after).enemySlots[0]).toBe('e1')
    expect(battleOf(after).stages.e1).toBeUndefined()
    // Hồi sinh làm mới trạng thái tạm (mất số hạ gục); skillStreak do lần dùng skill sau đó ghi.
    expect(battleOf(after).volatiles.e1?.firstTurn).toBe(1)
    expect(battleOf(after).volatiles.e1?.knockouts).toBeUndefined()
    expect(battleOf(after).usedOnce).toEqual({ e1: ['revive'] })
    expect(battleOf(after).outcome).toBeNull()
    // Moxie không chạy, không đếm hạ gục.
    expect(battleOf(after).stages.a).toBeUndefined()
    expect(battleOf(after).volatiles.a?.knockouts).toBeUndefined()
    const types = battleOf(after).log.map((event) => event.type)
    const faintAt = types.indexOf('faint')
    expect(types.slice(faintAt, faintAt + 3)).toEqual(['faint', 'traitTriggered', 'revived'])
    expect(eventsOf(after, 'revived')).toEqual([
      { type: 'revived', monsterId: 'e1', amount: toBig(15) }
    ])
  })

  it('lần gục thứ hai trong trận thì gục hẳn, thắng trận', () => {
    const first = run(makeBattleState([smasher('a')], [foe('e1', ['rebirth'])]), [
      cast(0, 'strike')
    ])
    const second = run(first, [cast(0, 'strike')])
    expect(hpOf(second, 'e1')).toBe(0)
    expect(battleOf(second).outcome).toBe('won')
  })

  it('gục vì trạng thái cũng hồi sinh, mất trạng thái, không trừ tiếp', () => {
    const doomed = {
      damageTaken: 49,
      statuses: [
        { statusId: 'poison', turnsLeft: 3 },
        { statusId: 'burn', turnsLeft: 3 }
      ]
    }
    const after = run(makeBattleState([fighter('a')], [foe('e1', ['rebirth'], doomed)]), [
      cast(0, 'idle')
    ])
    expect(hpOf(after, 'e1')).toBe(15)
    expect(monsterIn(after, 'e1').statuses).toEqual([])
    expect(eventsOf(after, 'statusDamage')).toHaveLength(1)
  })

  it('cấp trait nhân % máu, kẹp 100', () => {
    const after = run(makeBattleState([smasher('a')], [foe('e1', [['rebirth', 13]])]), [
      cast(0, 'strike')
    ])
    expect(hpOf(after, 'e1')).toBe(50)
  })

  it('đi cùng trụ lại: trụ trước, chưa dùng hồi sinh', () => {
    const after = run(makeBattleState([smasher('a')], [foe('e1', ['lastStand', 'rebirth'])]), [
      cast(0, 'strike')
    ])
    expect(hpOf(after, 'e1')).toBe(1)
    expect(battleOf(after).usedOnce).toEqual({})
  })
})

describe('AI: knockoutValueFactor', () => {
  const factor = (
    target: Monster,
    fullHp: boolean,
    usedOnce: BattleState['usedOnce'] = {}
  ): number => {
    const d = cloneDraft(makeBattleState([fighter('a')], [target], { usedOnce }))
    return knockoutValueFactor(data, d, { target, fullHp })
  }

  it('không trait 1; Sturdy đầy máu 0, không đầy 1; tỉ lệ 0,7; đã dùng 1; hồi sinh 0,7', () => {
    expect(factor(foe('e1'), true)).toBe(1)
    expect(factor(foe('e1', ['lastStand']), true)).toBe(0)
    expect(factor(foe('e1', ['lastStand']), false)).toBe(1)
    expect(factor(foe('e1', ['tooHorrible']), false)).toBeCloseTo(0.7)
    expect(factor(foe('e1', ['tooHorrible']), false, { e1: ['surviveLethal'] })).toBe(1)
    expect(factor(foe('e1', ['rebirth']), false)).toBeCloseTo(0.7)
    expect(factor(foe('e1', ['rebirth']), false, { e1: ['revive'] })).toBe(1)
    expect(factor(foe('e1', ['tooHorrible'], { damageTaken: 49 }), false)).toBe(1)
  })
})

describe('kiểm tra dữ liệu và save v19', () => {
  const issuesFor = (type: string, params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', type, params)), {
      regenerateText: true
    })

  it('params hợp lệ / sai', () => {
    expect(issuesFor('surviveLethal', { fromFullHp: true })).toEqual([])
    expect(issuesFor('surviveLethal', { fromFullHp: true, chance: 50 })).toEqual([])
    expect(issuesFor('reviveOnce', { hpPercent: 100 })).toEqual([])
    const cases: [string, unknown, string][] = [
      ['surviveLethal', { fromFullHp: false }, 'chance'],
      ['surviveLethal', { fromFullHp: 'yes' }, 'fromFullHp'],
      ['surviveLethal', { fromFullHp: false, chance: 0 }, 'chance'],
      ['surviveLethal', { fromFullHp: true, chance: 120 }, 'chance'],
      ['reviveOnce', { hpPercent: 0 }, 'hpPercent'],
      ['reviveOnce', { hpPercent: 101 }, 'hpPercent'],
      ['reviveOnce', null, 'object']
    ]
    for (const [type, params, fragment] of cases) {
      expect(issuesFor(type, params).join('\n'), type).toContain(fragment)
    }
  })

  it('validateGameState kiểm tra usedOnce', () => {
    const state = makeBattleState([fighter('a')], [foe('e1')])
    const withUsed = (usedOnce: unknown): GameState =>
      ({ ...state, battle: { ...battleOf(state), usedOnce } }) as GameState
    expect(validateGameState(data, withUsed({ e1: ['revive', 'surviveLethal'] }))).toEqual([])
    expect(validateGameState(data, withUsed({ ghost: ['revive'] })).join('\n')).toMatch(
      /usedOnce\.ghost/
    )
    expect(validateGameState(data, withUsed({ e1: ['revive', 'revive'] })).join('\n')).toMatch(
      /usedOnce\.e1/
    )
    expect(validateGameState(data, withUsed({ e1: ['fly'] })).join('\n')).toMatch(/usedOnce/)
    expect(validateGameState(data, withUsed(null)).join('\n')).toMatch(/usedOnce/)
  })

  it('lưu / đọc save: amount của traitDamage và revived là Decimal (kể cả số cực lớn)', () => {
    const state = makeBattleState([fighter('a')], [foe('e1')], {
      log: [
        { type: 'traitDamage', monsterId: 'a', amount: toBig('1e1000') },
        { type: 'revived', monsterId: 'e1', amount: toBig(15) }
      ]
    })
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    const loaded = migrateState(deserializeState(raw), data)
    expect(battleOf(loaded).log).toEqual(battleOf(state).log)
    expect(validateGameState(data, loaded)).toEqual([])
  })

  it('migrate v18 → v19: trận đang diễn ra thêm usedOnce rỗng', () => {
    const state = makeBattleState([fighter('a')], [foe('e1')])
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    raw.version = 18
    delete raw.battle.usedOnce
    const migrated = migrateState(deserializeState(raw), data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(battleOf(migrated).usedOnce).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
