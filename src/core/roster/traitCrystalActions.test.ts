// Extract / inject trait ở NPC thị trấn (docs/rules/trait-crystals.md).

import { describe, expect, it } from 'vitest'
import { gameReducer, validateGameState } from '../game'
import { addCrystals, getCrystalCount } from '../inventory'
import { toBig } from '../shared'
import {
  atFloor,
  defined,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster,
  makeBattleState,
  type MonsterOverrides
} from '../testing'
import type { GameAction, GameState, Monster, TraitInstance } from '../model'

const data = makeData()

const hero = (traits: TraitInstance[], overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 10, traits, ...overrides })

function townState(party: Monster[], money = 1e6): GameState {
  return { ...makeGameState({ seed: 1, party }), money: toBig(money) }
}

const withCrystal = (state: GameState, traitId: string, level: number, count = 1): GameState => ({
  ...state,
  inventory: addCrystals(state.inventory, { traitId, level }, count)
})

const extract = (state: GameState, traitId: string, monsterId = 'a'): GameState =>
  gameReducer(data, state, { type: 'extractTrait', monsterId, traitId })
const inject = (state: GameState, traitId: string, level: number, monsterId = 'a'): GameState =>
  gameReducer(data, state, {
    type: 'injectTrait',
    monsterId,
    item: { storage: 'crystal', traitId, level }
  })
const heroOf = (state: GameState): Monster =>
  defined([...state.party, ...state.storage].find((m) => m.id === 'a'))

describe('extract trait', () => {
  it('lấy nguyên trait đủ cấp thành tinh thể, quái mất trait, trả giá theo cấp² × loại', () => {
    const state = townState([
      hero([
        { id: 'regen', level: 2 },
        { id: 'mighty', level: 1 }
      ])
    ])
    const next = extract(state, 'regen')
    expect(heroOf(next).traits).toEqual([{ id: 'mighty', level: 1 }])
    expect(getCrystalCount(next.inventory, { traitId: 'regen', level: 2 })).toBe(1)
    // 100 × 2² × 3 (rare).
    expect(next.money.toNumber()).toBe(1e6 - 1200)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('extract được trait xấu và quái trong kho; không phụ thuộc level quái', () => {
    const base = townState([makeMonster({ id: 'b' })])
    const state = { ...base, storage: [hero([{ id: 'cursed', level: 1 }], { level: 90 })] }
    const next = extract(state, 'cursed')
    expect(heroOf(next).traits).toEqual([])
    expect(next.money.toNumber()).toBe(1e6 - 100)
  })

  it('lỗi: không có trait, trait không có tinh thể, thiếu tiền, ngoài thị trấn, trong trận', () => {
    const state = townState([hero([{ id: 'mighty', level: 1 }], { shinyStacks: 1 })])
    expectActionError(() => extract(state, 'regen'), 'traitNotOnMonster', { traitId: 'regen' })
    expectActionError(() => extract(state, 'shiny'), 'traitNotExtractable', { kind: 'shiny' })
    expectActionError(() => extract({ ...state, money: toBig(99) }, 'mighty'), 'notEnoughMoney')
    expectActionError(() => extract(atFloor(state, 1), 'mighty'), 'notInTown')
    expectActionError(() => extract(state, 'mighty', 'ghost'), 'monsterNotOwned')
    const inBattle = {
      ...makeBattleState(state.party, [makeMonster({ id: 'w' })]),
      money: state.money
    }
    expectActionError(() => extract(inBattle, 'mighty'), 'inBattle')
  })

  it('quái đang làm việc (thám hiểm) không extract / inject được', () => {
    const busy = hero([{ id: 'mighty', level: 1 }], {
      assignment: { kind: 'expedition', id: 'x1' }
    })
    const state = withCrystal(
      { ...townState([makeMonster({ id: 'b' })]), storage: [busy] },
      'mighty',
      1
    )
    expectActionError(() => extract(state, 'mighty'), 'monsterBusy', { monsterId: 'a' })
    expectActionError(() => inject(state, 'mighty', 1), 'monsterBusy', { monsterId: 'a' })
  })

  it('cấp cực lớn: giá Decimal hữu hạn, tinh thể giữ đúng cấp', () => {
    const level = Number.MAX_SAFE_INTEGER
    const state = { ...townState([hero([{ id: 'fast', level }])]), money: toBig('1e40') }
    const next = extract(state, 'fast')
    expect(getCrystalCount(next.inventory, { traitId: 'fast', level })).toBe(1)
    expect(next.money.isFinite()).toBe(true)
  })
})

describe('inject trait', () => {
  it('quái còn ô: thêm trait ở cấp tinh thể, tiêu tinh thể, trả giá', () => {
    const state = withCrystal(townState([hero([])]), 'mighty', 2, 2)
    const next = inject(state, 'mighty', 2)
    expect(heroOf(next).traits).toEqual([{ id: 'mighty', level: 2 }])
    expect(getCrystalCount(next.inventory, { traitId: 'mighty', level: 2 })).toBe(1)
    expect(next.money.toNumber()).toBe(1e6 - 400)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('đã có trait cùng id: gộp cấp, không cần ô trống, giá theo cấp sau khi gộp', () => {
    const full = [
      { id: 'regen', level: 1 },
      { id: 'mighty', level: 1 },
      { id: 'armored', level: 1 }
    ]
    const state = withCrystal(townState([hero(full, { traitSlots: 3 })]), 'regen', 2)
    const next = inject(state, 'regen', 2)
    expect(heroOf(next).traits[0]).toEqual({ id: 'regen', level: 3 })
    // 100 × 3² × 3.
    expect(next.money.toNumber()).toBe(1e6 - 2700)
  })

  it('loại trừ với trait đang có: bỏ cả hai, vẫn tiêu tinh thể (cách xóa trait xấu)', () => {
    const full = [
      { id: 'slow', level: 4 },
      { id: 'mighty', level: 1 },
      { id: 'armored', level: 1 }
    ]
    const state = withCrystal(townState([hero(full, { traitSlots: 3 })]), 'fast', 1)
    const next = inject(state, 'fast', 1)
    expect(heroOf(next).traits.map((t) => t.id)).toEqual(['mighty', 'armored'])
    expect(getCrystalCount(next.inventory, { traitId: 'fast', level: 1 })).toBe(0)
    expect(next.money.toNumber()).toBe(1e6 - 100)
  })

  it('trait không chiếm ô (shiny) không tính vào ô đã dùng', () => {
    const traits = [
      { id: 'mighty', level: 1 },
      { id: 'armored', level: 1 }
    ]
    const monster = hero(traits, { traitSlots: 3, shinyStacks: 1 })
    const next = inject(withCrystal(townState([monster]), 'cursed', 1), 'cursed', 1)
    expect(heroOf(next).traits.map((t) => t.id)).toContain('cursed')
  })

  it('lỗi: hết ô, không có tinh thể, định danh sai, thiếu tiền; state giữ nguyên', () => {
    const full = [
      { id: 'regen', level: 1 },
      { id: 'mighty', level: 1 },
      { id: 'armored', level: 1 }
    ]
    const state = withCrystal(townState([hero(full, { traitSlots: 3 })]), 'cursed', 1)
    expectActionError(() => inject(state, 'cursed', 1), 'traitSlotsFull', { slots: 3 })
    expectActionError(() => inject(state, 'cursed', 2), 'notEnoughCrystals', { have: 0 })
    expectActionError(() => inject(state, 'nope', 1), 'unknownTrait')
    const potion: GameAction = {
      type: 'injectTrait',
      monsterId: 'a',
      item: { storage: 'stack', itemId: 'potion' }
    }
    expectActionError(() => gameReducer(data, state, potion), 'malformedAction')
    const poor = withCrystal({ ...state, money: toBig(0) }, 'regen', 1)
    expectActionError(() => inject(poor, 'regen', 1), 'notEnoughMoney')
    expect(getCrystalCount(state.inventory, { traitId: 'cursed', level: 1 })).toBe(1)
    expectActionError(() => inject(atFloor(state, 1), 'cursed', 1), 'notInTown')
  })

  it('gộp cấp vượt số nguyên an toàn: traitLevelLimit', () => {
    const level = Number.MAX_SAFE_INTEGER
    const state = withCrystal(townState([hero([{ id: 'fast', level }])]), 'fast', 1)
    expectActionError(() => inject(state, 'fast', 1), 'traitLevelLimit', { traitId: 'fast' })
  })

  it('extract rồi inject sang quái khác: trait chuyển nguyên cấp', () => {
    const other = makeMonster({ id: 'b', traits: [] })
    const state = townState([hero([{ id: 'regen', level: 3 }]), other])
    const moved = inject(extract(state, 'regen'), 'regen', 3, 'b')
    expect(heroOf(moved).traits).toEqual([])
    expect(defined(moved.party.find((m) => m.id === 'b')).traits).toEqual([
      { id: 'regen', level: 3 }
    ])
    expect(validateGameState(data, moved)).toEqual([])
  })
})
