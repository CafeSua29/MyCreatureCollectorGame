// Hợp kích kỹ (docs/rules/team.md): điều kiện (phe, sân, thân mật, cặp điều kiện), cả hai phải chọn,
// chạy ở lượt quái chậm hơn, hủy khi một quái gục / mất lượt, công thức trung bình, AI.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { computeStats, getMaxHp } from '../monster'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeMonster,
  makeTeamData,
  uniformStats,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, BattleEvent, GameState, Monster } from '../model'
import { expectedDamage } from './damage'
import { chooseAiCommands, suggestBattleCommands } from './ai'
import type { Draft } from './draft'

const data = makeTeamData()

/** Quái lửa nhanh (a), quái cỏ chậm (b), thân mật đủ; địch idle tốc độ ở giữa. */
function pair(overrides: { a?: MonsterOverrides; b?: MonsterOverrides } = {}): Monster[] {
  return [
    makeMonster({
      id: 'a',
      elementIds: ['fire'],
      affinity: 150,
      genes: { ...uniformStats(10), speed: 200 },
      ...overrides.a
    }),
    makeMonster({
      id: 'b',
      elementIds: ['grass'],
      affinity: 150,
      genes: { ...uniformStats(10), speed: 1 },
      ...overrides.b
    })
  ]
}

const enemy = (extra: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'e',
    skillIds: ['idle'],
    level: 5,
    genes: { ...uniformStats(10), speed: 50 },
    ...extra
  })

const combo = (slot: number, comboId = 'comboBlaze', target = 0): BattleCommand => ({
  slot,
  kind: 'combo',
  comboId,
  target
})

const submit = (state: GameState, commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const comboEvents = (state: GameState): BattleEvent[] =>
  defined(state.battle).log.filter((e) =>
    ['comboReady', 'combo', 'comboFailed', 'useSkill'].includes(e.type)
  )

describe('dùng hợp kích kỹ', () => {
  it('quái nhanh sẵn sàng, quái chậm tung chiêu cùng đồng đội; tốn lượt cả hai', () => {
    const state = makeBattleState(pair(), [enemy()])
    const next = submit(state, [combo(0), combo(1)])
    expect(comboEvents(next)).toEqual([
      { type: 'comboReady', monsterId: 'a', comboId: 'comboBlaze' },
      { type: 'useSkill', monsterId: 'e', skillId: 'idle' },
      { type: 'combo', monsterId: 'b', partnerId: 'a', comboId: 'comboBlaze' },
      { type: 'useSkill', monsterId: 'b', skillId: 'comboBlaze' }
    ])
    expect(defined(next.battle).log.some((e) => e.type === 'damage' && e.targetId === 'e')).toBe(
      true
    )
    expect(defined(next.battle).records.a.turnsTaken).toBe(1)
  })

  it('quái chậm gục trước lượt của nó: hủy, log comboFailed theo quái đã sẵn sàng', () => {
    // Địch tốc độ giữa hai quái ta, dùng wave hạ quái chậm còn 1 máu.
    const [a, b] = pair()
    const weak = { ...b, damageTaken: getMaxHp(data, b).minus(1) }
    const state = makeBattleState([a, weak], [enemy({ skillIds: ['wave'] })])
    const next = submit(state, [combo(0), combo(1)])
    const events = comboEvents(next).filter((e) => e.type !== 'useSkill')
    expect(events).toEqual([
      { type: 'comboReady', monsterId: 'a', comboId: 'comboBlaze' },
      { type: 'comboFailed', monsterId: 'a', comboId: 'comboBlaze' }
    ])
  })
})

describe('kiểm tra lệnh (state giữ nguyên)', () => {
  const state = makeBattleState(pair(), [enemy()])

  it('chỉ một quái ra lệnh hợp kích / khác mục tiêu / khác hợp kích: noPartner', () => {
    const strike: BattleCommand = { slot: 1, kind: 'skill', skillId: 'strike' }
    expectActionError(() => submit(state, [combo(0), strike]), 'comboUnavailable', {
      reason: 'noPartner'
    })
    expectActionError(
      () => submit(state, [combo(0, 'comboBlaze', 0), combo(1, 'comboBlaze', 1)]),
      'comboUnavailable',
      { reason: 'noPartner' }
    )
    expectActionError(() => submit(state, [combo(0), combo(1, 'comboTwin')]), 'comboUnavailable', {
      reason: 'noPartner'
    })
  })

  it('cặp quái không thỏa cặp điều kiện: pairMismatch', () => {
    const grassy = makeBattleState(pair({ a: { elementIds: ['grass'] } }), [enemy()])
    expectActionError(() => submit(grassy, [combo(0), combo(1)]), 'comboUnavailable', {
      reason: 'pairMismatch'
    })
  })

  it('thân mật dưới minAffinity (biên 149 / 150): affinityTooLow', () => {
    const low = makeBattleState(pair({ b: { affinity: 149 } }), [enemy()])
    expectActionError(() => submit(low, [combo(0), combo(1)]), 'comboUnavailable', {
      reason: 'affinityTooLow'
    })
    expect(() => submit(makeBattleState(pair(), [enemy()]), [combo(0), combo(1)])).not.toThrow()
  })

  it('phe không có ngự thú sư: noTamer', () => {
    const base = makeBattleState(pair(), [enemy()])
    const noTamer = {
      ...base,
      battle: { ...defined(base.battle), tamers: { player: null, enemy: null } }
    }
    expectActionError(() => submit(noTamer, [combo(0), combo(1)]), 'comboUnavailable', {
      reason: 'noTamer'
    })
  })

  it('hợp kích kỹ lạ / ô mục tiêu sai: malformedAction', () => {
    expectActionError(() => submit(state, [combo(0, 'nope'), combo(1, 'nope')]), 'malformedAction')
    expectActionError(
      () => submit(state, [combo(0, 'comboBlaze', 5), combo(1, 'comboBlaze', 5)]),
      'malformedAction'
    )
  })

  it('quái không được giữ hợp kích kỹ như skill riêng (lệnh skill báo skillNotKnown)', () => {
    expectActionError(
      () =>
        submit(state, [
          { slot: 0, kind: 'skill', skillId: 'comboBlaze' },
          { slot: 1, kind: 'skill', skillId: 'strike' }
        ]),
      'skillNotKnown'
    )
  })
})

describe('công thức', () => {
  const [a, b] = pair({
    a: { genes: { ...uniformStats(10), spAttack: 500 }, elementIds: ['normal'] },
    b: { elementIds: ['normal'] }
  })
  const target = enemy()
  const skill = data.skills.comboBlaze
  const base = { data, attacker: b, defender: target, skill, spread: false }

  it('đặc công = trung bình hai quái (sát thương tỉ lệ bình phương công)', () => {
    const own = computeStats(data, b).final.spAttack
    const other = computeStats(data, a).final.spAttack
    const ratio = own.plus(other).div(2).div(own).pow(2)
    const solo = expectedDamage(base)
    const together = expectedDamage({ ...base, partner: { monster: a } })
    expect(together.div(solo).toNumber()).toBeCloseTo(ratio.toNumber(), 9)
  })

  it('STAB nếu một trong hai cùng hệ chiêu', () => {
    const fireA = { ...b, id: 'f', elementIds: ['fire'] }
    const solo = expectedDamage({ ...base, partner: { monster: b } })
    const withStab = expectedDamage({ ...base, partner: { monster: fireA } })
    expect(withStab.div(solo).toNumber()).toBeCloseTo(data.config.battle.stabMultiplier, 9)
  })
})

describe('AI', () => {
  const isCombo = (commands: BattleCommand[]): boolean =>
    commands.length === 2 && commands.every((c) => c.kind === 'combo')

  it('có lúc chọn hợp kích (hai lệnh cùng hợp kích, cùng mục tiêu, hợp lệ cho submitTurn)', () => {
    let picked = 0
    for (let seed = 1; seed <= 30; seed++) {
      const state = { ...makeBattleState(pair(), [enemy()]), rng: seed }
      const commands = suggestBattleCommands(data, state)
      if (!isCombo(commands)) continue
      picked++
      expect(() => submit(state, commands)).not.toThrow()
    }
    expect(picked).toBeGreaterThan(0)
  })

  it('không chọn khi thân mật chưa đủ, hoặc khi tắt hợp kích (hành động thêm)', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const low = { ...makeBattleState(pair({ a: { affinity: 0 } }), [enemy()]), rng: seed }
      expect(isCombo(suggestBattleCommands(data, low))).toBe(false)
      const ok = { ...makeBattleState(pair(), [enemy()]), rng: seed }
      const d = ok as Draft
      expect(isCombo(chooseAiCommands(data, d, 'player', { allowCombos: false }))).toBe(false)
    }
  })

  it('phe quái hoang (không ngự thú sư) không dùng hợp kích', () => {
    const wild = [
      makeMonster({ id: 'x', elementIds: ['fire'], affinity: 255 }),
      makeMonster({ id: 'y', elementIds: ['grass'], affinity: 255 })
    ]
    for (let seed = 1; seed <= 10; seed++) {
      const state = { ...makeBattleState([makeMonster({ id: 'p' })], wild), rng: seed } as Draft
      expect(isCombo(chooseAiCommands(data, state, 'enemy'))).toBe(false)
    }
  })
})
