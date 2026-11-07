// Thoái hóa (docs/rules/evolution-skills.md mục "Thoái hóa"): về dạng trước, lần tiến hóa sau luôn
// hỏi, bỏ qua tiến hóa, lỗi, máu, ô đội, MonsterView, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { createGameData } from '../gameData'
import { getMaxHp, isFainted, validateMonster } from '../monster'
import { getMonsterView } from '../roster'
import { createRng, toBig } from '../shared'
import {
  atFloor,
  defined,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster,
  makeRawData,
  type MonsterOverrides
} from '../testing'
import type { GameAction, GameData, GameState, Monster } from '../model'
import { autoEvolve } from './evolution'

// Fixture: weakling → strongling ở level 10 (một hướng); devolutionCostPerLevel 50.
const data = makeData()
const scene = { party: [], place: null, aptitudeFloor: 1, time: 0 }

const strong = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'a',
    speciesId: 'strongling',
    baseSpeciesId: 'strongling',
    elementIds: ['fire'],
    level: 10,
    exp: 1000,
    skillIds: ['strike', 'wave'],
    ...overrides
  })

const townState = (party: Monster[], money = 1e6, storage: Monster[] = []): GameState => ({
  ...makeGameState({ seed: 4, party }),
  storage,
  money: toBig(money)
})

const run = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)
const devolve = (state: GameState, speciesId = 'weakling', gameData: GameData = data): GameState =>
  run(state, { type: 'devolve', monsterId: 'a', speciesId }, gameData)
const ownedA = (state: GameState): Monster =>
  defined([...state.party, ...state.storage].find((m) => m.id === 'a'))

describe('thoái hóa', () => {
  it('về dạng trước: đổi loài / hệ, giữ level, EXP, gen, trait, skill dạng sau; trả tiền; lý lịch', () => {
    const state = townState([strong({ traits: [{ id: 'fast', level: 2 }] })])
    const next = devolve(state)
    const a = ownedA(next)
    expect(a).toMatchObject({
      speciesId: 'weakling',
      baseSpeciesId: 'weakling',
      raceId: 'neutral',
      elementIds: ['grass'],
      level: 10,
      exp: toBig(1000),
      traits: [{ id: 'fast', level: 2 }],
      devolvedFromSpeciesId: 'strongling',
      pendingEvolutionIds: []
    })
    expect(a.genes).toEqual(state.party[0].genes)
    // Giữ skill của dạng sau (wave), học thêm skill của dạng trước ở level ≤ 10.
    expect(a.skillIds.slice(0, 2)).toEqual(['strike', 'wave'])
    expect(a.skillIds).toContain('growl')
    // 50 × level 10.
    expect(state.money.minus(next.money).toString()).toBe('500')
    expect(a.history?.milestones.at(-1)).toEqual({
      day: 0,
      kind: 'devolved',
      fromSpeciesId: 'strongling',
      toSpeciesId: 'weakling'
    })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('quái trong kho, quái khóa cũng thoái hóa được; Dex vẫn ghi đã sở hữu dạng sau', () => {
    const state = townState([makeMonster({ id: 'p' })], 1e6, [strong()])
    // Khóa quái là action có đổi state nên Dex ghi đã sở hữu strongling.
    const locked = run(state, { type: 'setMonsterLocked', monsterId: 'a', locked: true })
    expect(locked.dex.owned).toContain('strongling')
    const next = devolve(locked)
    expect(ownedA(next).speciesId).toBe('weakling')
    expect(next.dex.owned).toContain('strongling')
  })

  it('Bootleg giữ hệ Bootleg', () => {
    const next = devolve(townState([strong({ bootlegElementId: 'water', elementIds: ['water'] })]))
    expect(ownedA(next)).toMatchObject({ bootlegElementId: 'water', elementIds: ['water'] })
  })

  it('máu đã mất giữ nguyên; max HP tụt thì quái còn sống vẫn còn ít nhất 1 máu', () => {
    const hurt = strong({ damageTaken: toBig(5) })
    expect(ownedA(devolve(townState([hurt]))).damageTaken.eq(5)).toBe(true)
    const nearDead = strong()
    const almost = { ...nearDead, damageTaken: getMaxHp(data, nearDead).minus(1) }
    const a = ownedA(devolve(townState([almost])))
    expect(getMaxHp(data, a).lt(getMaxHp(data, almost))).toBe(true)
    expect(isFainted(data, a)).toBe(false)
    expect(a.damageTaken.eq(getMaxHp(data, a).minus(1))).toBe(true)
    // Đã gục thì vẫn gục (không hồi máu).
    const fainted = { ...nearDead, damageTaken: toBig('1e30') }
    expect(isFainted(data, ownedA(devolve(townState([fainted]))))).toBe(true)
  })

  it('level cực lớn: giá Decimal không tràn', () => {
    const state = townState([strong({ level: 1e15 })], 0)
    const rich = { ...state, money: toBig('1e20') }
    const next = devolve(rich)
    expect(rich.money.minus(next.money).eq(toBig('5e16'))).toBe(true)
  })

  it('báo lỗi, state giữ nguyên', () => {
    const state = townState([strong()])
    const snapshot = serializeState(state)
    expectActionError(() => devolve(state, 'twig'), 'notPreEvolution', {
      monsterId: 'a',
      speciesId: 'twig'
    })
    expectActionError(() => devolve(state, 'strongling'), 'notPreEvolution')
    // Dạng đầu không có dạng trước.
    expectActionError(
      () => devolve(townState([strong({ speciesId: 'weakling', baseSpeciesId: 'weakling' })])),
      'notPreEvolution'
    )
    expectActionError(() => devolve(townState([strong({ fused: true })])), 'fusedCannotDevolve')
    expectActionError(
      () => devolve(townState([strong({ assignment: { kind: 'expedition', id: 'x' } })])),
      'monsterBusy'
    )
    expectActionError(() => devolve(townState([strong()], 499)), 'notEnoughMoney')
    expectActionError(() => devolve(atFloor(state, 1)), 'notInTown')
    expectActionError(
      () => run(state, { type: 'devolve', monsterId: 'zz', speciesId: 'weakling' }),
      'monsterNotOwned'
    )
    expect(serializeState(state)).toEqual(snapshot)
  })

  it('dạng trước là quái lớn: quái trong đội cần đủ ô, quái trong kho không cần', () => {
    const raw = makeRawData()
    const weakling = raw.species.find((s) => s.id === 'weakling')
    if (weakling?.kind !== 'normal') throw new Error('fixture sai')
    weakling.weightKg = 5000
    const heavy = createGameData(raw)
    const others = Array.from({ length: 5 }, (_, i) => makeMonster({ id: `o${i}` }))
    // Đội 6 ô: 5 quái thường + quái thoái hóa thành quái lớn (2 ô) = 7.
    expectActionError(
      () => devolve(townState([...others, strong()]), 'weakling', heavy),
      'partyFull'
    )
    const inStorage = townState(others, 1e6, [strong()])
    expect(ownedA(devolve(inStorage, 'weakling', heavy)).speciesId).toBe('weakling')
  })
})

describe('tiến hóa lại sau thoái hóa', () => {
  const devolved = ownedA(devolve(townState([strong()])))

  it('lần tự tiến hóa kế tiếp luôn hỏi kể cả khi chỉ một hướng', () => {
    const { monster, events } = autoEvolve(data, devolved, { rng: createRng(1), day: 0, scene })
    expect(monster.speciesId).toBe('weakling')
    expect(monster.pendingEvolutionIds).toEqual(['strongling'])
    expect(events).toEqual([{ type: 'evolutionChoice', monsterId: 'a', options: ['strongling'] }])
  })

  it('bỏ qua: xóa danh sách chờ, giữ cờ (trận sau lại hỏi); chọn thì tiến hóa và mất cờ', () => {
    const pending = { ...devolved, pendingEvolutionIds: ['strongling'] }
    const state = townState([pending])
    const skipped = ownedA(run(state, { type: 'skipEvolution', monsterId: 'a' }))
    expect(skipped).toMatchObject({ pendingEvolutionIds: [], devolvedFromSpeciesId: 'strongling' })
    const again = autoEvolve(data, skipped, { rng: createRng(1), day: 0, scene })
    expect(again.monster.pendingEvolutionIds).toEqual(['strongling'])
    const chosen = ownedA(
      run(state, { type: 'chooseEvolution', monsterId: 'a', speciesId: 'strongling' })
    )
    expect(chosen).toMatchObject({ speciesId: 'strongling', devolvedFromSpeciesId: null })
  })

  it('bỏ qua báo lỗi khi không có hướng chờ hoặc quái không vừa thoái hóa', () => {
    expectActionError(
      () => run(townState([devolved]), { type: 'skipEvolution', monsterId: 'a' }),
      'noPendingEvolution',
      { monsterId: 'a' }
    )
    const normal = makeMonster({ id: 'a', speciesId: 'twig', pendingEvolutionIds: ['oak', 'pine'] })
    expectActionError(
      () => run(townState([normal]), { type: 'skipEvolution', monsterId: 'a' }),
      'evolutionNotSkippable'
    )
  })
})

describe('MonsterView, kiểm tra save, migrate', () => {
  it('MonsterView có dạng trước, giá và cờ vừa thoái hóa', () => {
    const view = defined(getMonsterView(data, townState([strong()]), 'a'))
    expect(view.devolveTargetIds).toEqual(['weakling'])
    expect(view.devolutionCost.eq(500)).toBe(true)
    expect(view.devolvedFromSpeciesId).toBeNull()
  })

  it('validateMonster báo cờ trỏ tới loài không tồn tại', () => {
    const bad = { ...strong(), devolvedFromSpeciesId: 'ghost' }
    expect(validateMonster(data, bad).join()).toContain('devolvedFromSpeciesId')
  })

  it('save v113: mọi quái chưa thoái hóa', () => {
    const state = townState([strong()])
    const raw = JSON.parse(JSON.stringify(serializeState(state))) as Record<string, unknown>
    const party = (raw.party as Record<string, unknown>[]).map(
      ({ devolvedFromSpeciesId: _d, ...rest }) => rest
    )
    const migrated = migrateState({ ...raw, version: 113, party }, data)
    expect(migrated.party[0].devolvedFromSpeciesId).toBeNull()
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
