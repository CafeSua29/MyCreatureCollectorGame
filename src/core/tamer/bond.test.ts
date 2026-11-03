// Bản mệnh thú (docs/rules/tamer.md mục "Bản mệnh thú"): kết / đổi (điều kiện, giá, thân mật, hồi
// chiêu), lợi ích (cộng hưởng ×3, thọ nguyên ×2, ½ linh lực khi trên sân, không mất thân mật khi
// gục), chặn thả / làm quái phụ fuse, đạo thương khi chết hẳn (chặn đột phá, giảm linh lực), kiểm
// tra save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { computeStats, getMaxHp } from '../monster'
import { lifespanYears } from '../registries'
import { advanceTime, defaultGameOptions } from '../progression'
import { toBig } from '../shared'
import {
  atFloor,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster
} from '../testing'
import { HOURS_PER_DAY, type GameState, type Monster } from '../model'
import { woundIfBondDied } from './bond'

const data = makeData()

const friend = (id = 'a', affinity = 200): Monster =>
  makeMonster({
    id,
    affinity,
    contractRealm: 2,
    genes: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 }
  })

const town = (party: Monster[] = [friend(), friend('b')], money = 1_000_000): GameState =>
  makeGameState({ seed: 1, party, money, tamerRealm: 2 })

const bind = (state: GameState, monsterId: string): GameState =>
  gameReducer(data, state, { type: 'bindBond', monsterId })

describe('kết bản mệnh', () => {
  it('lần đầu miễn phí khi thân mật đủ; ghi ngày kết', () => {
    const state = town()
    const bound = bind(state, 'a')
    expect(bound.party.find((m) => m.id === 'a')?.bond).toBe(true)
    expect(bound.money.eq(state.money)).toBe(true)
    expect(bound.tamer.bondDay).toBe(0)
    expect(validateGameState(data, bound)).toEqual([])
  })

  it('lỗi: thân mật thấp, ngoài thị trấn, trong trận, đã là bản mệnh, quái không có', () => {
    expectActionError(() => bind(town([friend('a', 199)]), 'a'), 'bondAffinityTooLow', {
      need: 200,
      have: 199
    })
    expectActionError(() => bind(atFloor(town(), 1), 'a'), 'notInTown')
    expectActionError(
      () => bind(makeBattleState([friend()], [makeMonster({ id: 'e' })]), 'a'),
      'inBattle'
    )
    expectActionError(() => bind(bind(town(), 'a'), 'a'), 'bondAlreadyBound')
    expectActionError(() => bind(town(), 'zz'), 'monsterNotOwned')
  })

  it('đổi bản mệnh: chờ đủ ngày, tốn tiền theo cảnh giới, bản mệnh cũ −100 thân mật', () => {
    const first = bind(town(), 'a')
    expectActionError(() => bind(first, 'b'), 'bondCooldown', { readyDay: 30 })
    const later = { ...first, time: 30 * HOURS_PER_DAY }
    const second = bind(later, 'b')
    const old = defined(
      second.party.find((m) => m.id === 'a'),
      'bản mệnh cũ'
    )
    expect(old.bond).toBe(false)
    expect(old.affinity).toBe(100)
    expect(second.party.find((m) => m.id === 'b')?.bond).toBe(true)
    // 5000 × (cảnh giới 2 + 1).
    expect(later.money.minus(second.money).eq(15_000)).toBe(true)
    expectActionError(() => bind({ ...later, money: toBig(0) }, 'b'), 'notEnoughMoney')
  })
})

describe('lợi ích của bản mệnh', () => {
  it('cộng hưởng khế ước × 3 và thọ nguyên × 2', () => {
    const plain = friend()
    const bond = { ...plain, bond: true }
    const contract = (m: Monster): number => computeStats(data, m).percentBySource.contract.attack
    expect(contract(bond)).toBeCloseTo(contract(plain) * 3, 6)
    expect(lifespanYears(data, bond).eq(lifespanYears(data, plain).times(2))).toBe(true)
  })

  it('bản mệnh còn sống trên sân: kỹ năng ngự thú sư tốn ½ linh lực (làm tròn lên)', () => {
    const hurt = (m: Monster): Monster => ({ ...m, damageTaken: getMaxHp(data, m).div(2).floor() })
    const run = (bond: boolean): number => {
      const ally = { ...hurt(friend()), bond, skillIds: ['idle'] }
      const state = makeBattleState([ally], [makeMonster({ id: 'e', skillIds: ['idle'] })])
      const after = gameReducer(data, state, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }],
        tamer: { skillId: 'mend', targetId: 'a' }
      })
      return defined(after.battle?.tamers.player, 'ngự thú sư').mana
    }
    // Linh lực đầu trận 50 (fixture), mend 20.
    expect(run(false)).toBe(30)
    expect(run(true)).toBe(40)
  })

  it('bản mệnh không giảm thân mật khi gục', () => {
    const weak = (bond: boolean): Monster => ({
      ...makeMonster({ id: 'a', affinity: 210, skillIds: ['idle'] }),
      bond,
      damageTaken: toBig(0)
    })
    const strongFoe = makeMonster({
      id: 'e',
      level: 80,
      genes: { hp: 500, attack: 500, defense: 500, spAttack: 500, spDefense: 500, speed: 500 },
      skillIds: ['strike']
    })
    const afterFaint = (bond: boolean): number => {
      let state = makeBattleState([weak(bond)], [strongFoe])
      for (let i = 0; i < 20 && state.battle?.phase === 'chooseActions'; i++) {
        state = gameReducer(data, state, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
        })
      }
      return defined(
        state.party.find((m) => m.id === 'a'),
        'quái'
      ).affinity
    }
    expect(afterFaint(false)).toBeLessThan(210)
    expect(afterFaint(true)).toBe(210)
  })
})

describe('chặn và đạo thương', () => {
  it('không thả / làm quái phụ fuse bản mệnh', () => {
    const bound = bind(town(), 'a')
    expectActionError(
      () => gameReducer(data, bound, { type: 'releaseMonster', monsterId: 'a' }),
      'isBondBeast',
      { monsterId: 'a' }
    )
    expectActionError(
      () => gameReducer(data, bound, { type: 'fuse', baseId: 'b', subId: 'a' }),
      'isBondBeast'
    )
  })

  it('bản mệnh tọa hóa: đạo thương woundDays ngày, chặn đột phá, linh lực trận còn %', () => {
    const old = { ...friend(), bond: true, aging: true, ageDays: 1_000_000 }
    const base = {
      ...town([old, friend('b')]),
      options: defaultGameOptions({ lifespanEnabled: true, permadeathEnabled: false }),
      tamer: { ...town().tamer, bondDay: 0 }
    }
    const state = { ...base, party: base.party.map((m) => ({ ...m, aging: true })) }
    const next = advanceTime(data, state, HOURS_PER_DAY)
    expect(next.party.some((m) => m.id === 'a')).toBe(false)
    expect(next.tamer.woundUntilDay).toBe(1 + 30 - 1)
    expect(next.log).toContainEqual({ type: 'bondBroken', monsterId: 'a', woundUntilDay: 30 })
    expectActionError(
      () => gameReducer(data, next, { type: 'tamerBreakthrough' }),
      'tamerWounded',
      {
        untilDay: 30
      }
    )
    const battle = defined(
      gameReducer(data, atFloor(next, 1), { type: 'startWildBattle' }).battle,
      'trận'
    )
    expect(battle.tamers.player?.mana).toBe(Math.floor((50 + 10 * 2) * 0.5))
    // Hết đạo thương: linh lực đầy lại.
    const healed = { ...next, time: 31 * HOURS_PER_DAY }
    const full = defined(
      gameReducer(data, atFloor(healed, 1), { type: 'startWildBattle' }).battle,
      'trận'
    )
    expect(full.tamers.player?.mana).toBe(70)
  })
})

describe('woundIfBondDied (tọa hóa, độ kiếp thất bại lần cuối)', () => {
  it('có bản mệnh trong danh sách chết thì đạo thương; không có thì giữ nguyên', () => {
    const state = { ...town(), time: 5 * HOURS_PER_DAY }
    const hit = woundIfBondDied(data, state, [friend('x'), { ...friend('a'), bond: true }])
    expect(hit).toMatchObject({ bondId: 'a', woundUntilDay: 34 })
    expect(hit.tamer.woundUntilDay).toBe(34)
    const miss = woundIfBondDied(data, state, [friend('x')])
    expect(miss.bondId).toBeNull()
    expect(miss.tamer).toBe(state.tamer)
  })
})

describe('save', () => {
  it('hai bản mệnh / bản mệnh trong trứng / có bản mệnh mà chưa có ngày kết: báo lỗi', () => {
    const two = town([
      { ...friend(), bond: true },
      { ...friend('b'), bond: true }
    ])
    const withDay = { ...two, tamer: { ...two.tamer, bondDay: 0 } }
    expect(validateGameState(data, withDay)).toEqual([
      expect.stringContaining('chỉ được một bản mệnh')
    ])
    const noDay = town([{ ...friend(), bond: true }])
    expect(validateGameState(data, noDay)).toEqual([expect.stringContaining('tamer.bondDay')])
  })

  it('migrate v49 → v50: không có bản mệnh, chưa từng kết, không đạo thương', () => {
    const raw = serializeState(town()) as Record<string, unknown>
    const tamer = raw.tamer as Record<string, unknown>
    const party = (raw.party as Record<string, unknown>[]).map(({ bond: _bond, ...m }) => m)
    const old = { ...raw, version: 49, party, tamer: { realm: tamer.realm, exp: tamer.exp } }
    const migrated = migrateState(old, data)
    expect(migrated.party.every((m) => m.bond === false)).toBe(true)
    expect(migrated.tamer).toMatchObject({ bondDay: null, woundUntilDay: null })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
