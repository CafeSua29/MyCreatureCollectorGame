// Chết thật (docs/rules/options.md): quái gục trong trận chết hẳn lúc trận kết thúc, hồn phách, bản
// mệnh, đội trống, quái vừa bắt, độ kiếp, tự farm, bật / tắt, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getMaxHp } from '../monster'
import { setGameOption } from '../progression'
import { BIG_ZERO } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { BattleEvent, GameState, Monster } from '../model'
import { cloneDraft, type Draft } from './draft'
import { finish } from './outcome'
import { settleTribulation } from './tribulation'
import { nextAutoFarmStep } from './autoBattle'

const data = makeData()

const fallen = (overrides: MonsterOverrides): Monster => {
  const monster = makeMonster(overrides)
  return { ...monster, damageTaken: getMaxHp(data, monster) }
}

/** Trận đang dở với đội cho trước; `permadeath` bật / tắt chết thật. */
function battleWith(
  party: Monster[],
  { permadeath, ...overrides }: { permadeath: boolean } & Parameters<typeof makeBattleState>[2]
): GameState {
  const state = makeBattleState(party, [makeMonster({ id: 'w1' })], overrides)
  return { ...state, options: { ...state.options, permadeathEnabled: permadeath } }
}

/** Kết thúc trận (chạy trốn) và trả draft sau khi xử lý. */
function ended(state: GameState): Draft {
  const d = cloneDraft(state)
  finish(data, d, 'fled')
  return d
}

const typesOf = (d: Draft): BattleEvent['type'][] => d.battle.log.map((event) => event.type)

describe('chết thật lúc kết thúc trận', () => {
  it('tắt: quái gục vẫn ở đội như cũ', () => {
    const d = ended(
      battleWith([makeMonster({ id: 'a' }), fallen({ id: 'b' })], { permadeath: false })
    )
    expect(d.party.map((m) => m.id)).toEqual(['a', 'b'])
    expect(d.inventory.souls).toEqual([])
  })

  it('bật: quái đã ra sân mà gục chết hẳn, để lại hồn phách; quái gục từ trước trận không tính', () => {
    const state = battleWith([makeMonster({ id: 'a' }), fallen({ id: 'b' }), fallen({ id: 'c' })], {
      permadeath: true
    })
    const d = ended(state)
    expect(d.party.map((m) => m.id)).toEqual(['a', 'c'])
    expect(d.inventory.souls.map((soul) => soul.id)).toEqual(['b'])
    const died = defined(d.inventory.souls[0].history).milestones.at(-1)
    expect(died).toMatchObject({ kind: 'died', cause: 'battle' })
    expect(typesOf(d)).toContain('diedInBattle')
    expect(d.battle.participants).toEqual(['a'])
    expect(d.battle.playerSlots).toEqual(['a', null])
    const left = gameReducer(data, d, { type: 'leaveBattle' })
    expect(validateGameState(data, left)).toEqual([])
  })

  it('bản mệnh chết thật: ngự thú sư bị đạo thương', () => {
    const d = ended(
      battleWith([makeMonster({ id: 'a' }), fallen({ id: 'b', bond: true })], { permadeath: true })
    )
    expect(d.battle.log).toContainEqual(
      expect.objectContaining({ type: 'bondBroken', monsterId: 'b' })
    )
    expect(d.tamer.woundUntilDay).toBeGreaterThan(0)
  })

  it('cả đội chết: quái level cao nhất trong kho vào đội', () => {
    const state = {
      ...battleWith([fallen({ id: 'a' })], { permadeath: true }),
      storage: [makeMonster({ id: 's1', level: 3 }), makeMonster({ id: 's2', level: 9 })]
    }
    const d = ended(state)
    expect(d.party.map((m) => m.id)).toEqual(['s2'])
    expect(d.storage.map((m) => m.id)).toEqual(['s1'])
    expect(d.battle.log.at(-1)).toEqual({ type: 'monsterAutoJoined', monsterId: 's2' })
  })

  it('cả đội chết, kho trống: hồn phách mới nhất nở thành trứng truyền thừa vào đội', () => {
    const d = ended(battleWith([fallen({ id: 'a' }), fallen({ id: 'b' })], { permadeath: true }))
    expect(d.party).toHaveLength(1)
    const hatched = d.party[0]
    expect(d.battle.log.at(-1)).toEqual({ type: 'legacyEggHatched', monsterId: hatched.id })
    expect(d.stats.eggsHatched).toBe(1)
    // Hồn phách của b (mới nhất) đã ấp; còn hồn phách của a.
    expect(d.inventory.souls.map((soul) => soul.id)).toEqual(['a'])
    expect(hatched.damageTaken.eq(BIG_ZERO)).toBe(true)
    const left = gameReducer(data, d, { type: 'leaveBattle' })
    expect(validateGameState(data, left)).toEqual([])
  })

  it('quái vừa bắt vào chỗ của quái đã chết, không cần quái thay', () => {
    const caught = makeMonster({ id: 'w9' })
    const d = ended(battleWith([fallen({ id: 'a' })], { permadeath: true, captured: [caught] }))
    expect(d.party.map((m) => m.id)).toEqual(['w9'])
    expect(typesOf(d)).not.toContain('legacyEggHatched')
  })

  it('độ kiếp: gục khi bật chết thật thì chết hẳn, không tính lần thất bại', () => {
    const state = battleWith([fallen({ id: 'a' })], {
      permadeath: true,
      tribulation: { monsterId: 'a', tier: 1 }
    })
    const d = cloneDraft(state)
    finish(data, d, 'lost')
    settleTribulation(data, d, 'lost')
    // Đội trống: hồn phách của a nở ngay thành trứng truyền thừa.
    expect(typesOf(d)).toEqual(expect.arrayContaining(['diedInBattle', 'legacyEggHatched']))
    expect(typesOf(d)).not.toContain('tribulationFailed')
    expect(d.party.map((m) => m.id)).not.toContain('a')
  })

  it('thua thật qua reducer: quái chết, tự farm dừng vì quái chết', () => {
    const weak = makeMonster({ id: 'a', level: 1, skillIds: ['strike'] })
    const strong = makeMonster({ id: 'w1', level: 100, skillIds: ['strike'] })
    let state: GameState = {
      ...makeBattleState([{ ...weak, damageTaken: getMaxHp(data, weak).minus(1) }], [strong]),
      storage: [makeMonster({ id: 's1' })]
    }
    state = { ...state, options: { ...state.options, permadeathEnabled: true } }
    for (let i = 0; i < 20 && defined(state.battle).phase !== 'ended'; i++) {
      state = gameReducer(data, state, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
      })
    }
    const battle = defined(state.battle)
    expect(battle.outcome).toBe('lost')
    expect(battle.log.map((event) => event.type)).toContain('diedInBattle')
    expect(state.party.map((m) => m.id)).toEqual(['s1'])
    expect(nextAutoFarmStep(data, state, { minHpPercent: 0, autoRest: false })).toEqual({
      kind: 'stop',
      reason: 'monsterDied'
    })
  })
})

describe('setGameOption: chết thật', () => {
  it('bật / tắt ngoài trận, không đổi quái', () => {
    const state = makeGameState({ seed: 1, party: [fallen({ id: 'a' })] })
    expect(state.options.permadeathEnabled).toBe(false)
    const on = setGameOption(data, state, 'permadeathEnabled', true)
    expect(on.options.permadeathEnabled).toBe(true)
    expect(on.party).toBe(state.party)
    expect(validateGameState(data, on)).toEqual([])
    const off = gameReducer(data, on, {
      type: 'setGameOption',
      option: 'permadeathEnabled',
      enabled: false
    })
    expect(off.options.permadeathEnabled).toBe(false)
  })

  it('lỗi: trong trận, đã đúng như vậy, tùy chọn lạ', () => {
    const battle = battleWith([makeMonster({ id: 'a' })], { permadeath: false })
    expectActionError(() => setGameOption(data, battle, 'permadeathEnabled', true), 'inBattle')
    const state = makeGameState({ seed: 1, party: [makeMonster()] })
    expectActionError(
      () => setGameOption(data, state, 'permadeathEnabled', false),
      'optionUnchanged',
      { option: 'permadeathEnabled', enabled: false }
    )
    expectActionError(
      () => setGameOption(data, state, 'foo' as unknown as 'permadeathEnabled', true),
      'malformedAction'
    )
  })

  it('migrate v71 → hiện tại: save cũ tắt chết thật', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster()] })
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    const v71 = { ...raw, version: 71, options: { lifespanEnabled: false } }
    const migrated = migrateState(v71, data)
    expect(migrated.options).toEqual({ lifespanEnabled: false, permadeathEnabled: false })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
