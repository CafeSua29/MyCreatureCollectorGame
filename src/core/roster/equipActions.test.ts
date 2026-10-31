import { describe, expect, it } from 'vitest'
import { toBig } from '../shared'
import { gameReducer } from '../game'
import {
  equipped,
  expectActionError,
  makeBattleState,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { GameState, Monster } from '../model'
import { unequipIneligible } from './equipActions'

const data = makeEquipmentData()
const sword = makeEquipment({ id: 'e1' })
const crown = makeEquipment({
  id: 'e2',
  baseItemId: 'stronglingCrown',
  rarity: 'unique',
  rolls: [
    { lineId: 'main', value: 15 },
    { lineId: 'crownSpeed', value: 25 }
  ]
})
const brute = (): Monster =>
  makeMonster({ id: 'b', speciesId: 'brawler', baseSpeciesId: 'brawler', raceId: 'brute' })

/** Đội 2 quái (a: neutral, b: brute), túi có kiếm, vương miện unique và thuốc. */
function bagState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' }), brute()] }),
    inventory: makeInventory({ potion: 2 }, [], [sword, crown]),
    nextItemId: 3,
    ...overrides
  }
}

const equip = (state: GameState, monsterId: string, instanceId: string): GameState =>
  gameReducer(data, state, {
    type: 'equipItem',
    monsterId,
    item: { storage: 'instance', instanceId }
  })

describe('equipItem / unequipItem', () => {
  it('lắp món trong túi vào ô kế tiếp, tháo về túi; state cũ không đổi', () => {
    const state = bagState()
    const worn = equip(state, 'a', 'e1')
    expect(worn.party[0].equipment).toEqual([equipped(sword)])
    expect(worn.inventory.equipment).toEqual([crown])
    expect(state.inventory.equipment).toEqual([sword, crown])
    const back = gameReducer(data, worn, { type: 'unequipItem', monsterId: 'a', slotIndex: 0 })
    expect(back.party[0].equipment).toEqual([])
    expect(back.inventory.equipment).toEqual([crown, sword])
  })

  it('lắp được cho quái trong kho; trùng loại món được', () => {
    const second = makeEquipment({ id: 'e3' })
    const state = {
      ...bagState({ inventory: makeInventory({}, [], [sword, second]) }),
      storage: [makeMonster({ id: 's' })]
    }
    const next = equip(equip(state, 's', 'e1'), 's', 'e3')
    expect(next.storage[0].equipment).toEqual([equipped(sword), equipped(second)])
  })

  it('đủ ô (3 ở tầng 1, 4 từ tầng 20): equipmentSlotsFull', () => {
    const full = makeMonster({
      id: 'a',
      equipment: [1, 2, 3].map((n) => equipped(makeEquipment({ id: `e${n + 10}` })))
    })
    const state = bagState({ party: [full], nextItemId: 20 })
    expectActionError(() => equip(state, 'a', 'e1'), 'equipmentSlotsFull', { slots: 3 })
    const floor20 = { ...state, highestFloor: 20, floorBiomeIds: Array(20).fill('field') }
    expect(equip(floor20, 'a', 'e1').party[0].equipment).toHaveLength(4)
  })

  it('món unique: chỉ quái cùng race với boss (hoặc race đó trong lineage)', () => {
    const state = bagState()
    expectActionError(() => equip(state, 'b', 'e2'), 'equipmentRaceLocked', {
      itemId: 'stronglingCrown',
      raceId: 'neutral'
    })
    expect(equip(state, 'a', 'e2').party[0].equipment).toEqual([equipped(crown)])
  })

  it('lỗi: không có món, item không lắp được, tinh thể, trong trận, quái không sở hữu', () => {
    const state = bagState()
    expectActionError(() => equip(state, 'a', 'e99'), 'equipmentNotFound', { instanceId: 'e99' })
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'equipItem',
          monsterId: 'a',
          item: { storage: 'stack', itemId: 'potion' }
        }),
      'notEquippable',
      { itemId: 'potion' }
    )
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'equipItem',
          monsterId: 'a',
          item: { storage: 'crystal', traitId: 'fast', level: 1 }
        }),
      'notEquippable'
    )
    expectActionError(() => equip(state, 'zzz', 'e1'), 'monsterNotOwned')
    const inBattle = {
      ...state,
      battle: makeBattleState(state.party, [makeMonster({ id: 'w' })]).battle
    }
    expectActionError(() => equip(inBattle, 'a', 'e1'), 'inBattle')
    expectActionError(
      () => gameReducer(data, inBattle, { type: 'unequipItem', monsterId: 'a', slotIndex: 0 }),
      'inBattle'
    )
  })

  it('tháo ô không có món / chỉ số sai dạng: malformedAction', () => {
    const state = equip(bagState(), 'a', 'e1')
    for (const slotIndex of [1, -1, 0.5, Number.NaN, '0' as never]) {
      expectActionError(
        () => gameReducer(data, state, { type: 'unequipItem', monsterId: 'a', slotIndex }),
        'malformedAction'
      )
    }
  })
})

describe('đồ trên quái tự về túi', () => {
  it('thả quái (đội hoặc kho): mọi món về túi', () => {
    const wearer = makeMonster({ id: 'a', equipment: [equipped(sword)] })
    const state = {
      ...bagState({ party: [wearer, brute()], inventory: makeInventory() }),
      storage: [makeMonster({ id: 's', equipment: [equipped(crown)] })]
    }
    const released = gameReducer(data, state, { type: 'releaseMonster', monsterId: 'a' })
    expect(released.inventory.equipment).toEqual([sword])
    const again = gameReducer(data, released, { type: 'releaseMonster', monsterId: 's' })
    expect(again.inventory.equipment).toEqual([sword, crown])
  })

  it('fuse thành công: món của quái phụ về túi, quái gốc giữ món của nó', () => {
    const base = makeMonster({ id: 'a', level: 5, exp: 125, equipment: [equipped(crown)] })
    const sub = makeMonster({
      id: 's',
      speciesId: 'twig',
      baseSpeciesId: 'twig',
      equipment: [equipped(sword)]
    })
    const state = {
      ...bagState({ party: [base, brute()], inventory: makeInventory(), money: toBig(10_000) }),
      storage: [sub]
    }
    const next = gameReducer(data, state, { type: 'fuse', baseId: 'a', subId: 's' })
    expect(next.party[0].fused).toBe(true)
    expect(next.party[0].equipment).toEqual([equipped(crown)])
    expect(next.inventory.equipment).toEqual([sword])
  })

  it('fuse thất bại: món trên cả hai quái về túi', () => {
    const failing = makeEquipmentData((raw) => {
      raw.config.fuseChance = { raceChances: { same: 0, breedable: 0, other: 0 }, lineageFactor: 1 }
    })
    const base = makeMonster({ id: 'a', equipment: [equipped(crown)] })
    const sub = makeMonster({
      id: 's',
      speciesId: 'twig',
      baseSpeciesId: 'twig',
      equipment: [equipped(sword)]
    })
    const state = {
      ...bagState({ party: [base, brute()], inventory: makeInventory(), money: toBig(10_000) }),
      storage: [sub]
    }
    const next = gameReducer(failing, state, { type: 'fuse', baseId: 'a', subId: 's' })
    expect(next.party.map((m) => m.id)).toEqual(['b'])
    expect(next.inventory.equipment).toEqual([sword, crown])
  })
})

describe('unequipIneligible', () => {
  it('tháo món unique quái không còn lắp được về túi, trả danh sách; còn lại giữ nguyên', () => {
    const wrong = { ...brute(), equipment: [equipped(crown), equipped(sword)] }
    const ok = makeMonster({
      id: 'a',
      equipment: [equipped({ ...crown, id: 'e7' })]
    })
    const state = bagState({ party: [ok, wrong], inventory: makeInventory() })
    const { state: next, removed } = unequipIneligible(data, state)
    expect(removed).toEqual([{ monsterId: 'b', instanceId: 'e2', itemId: 'stronglingCrown' }])
    expect(next.party[1].equipment).toEqual([equipped(sword)])
    expect(next.party[0]).toBe(ok)
    expect(next.inventory.equipment).toEqual([crown])
  })

  it('không có gì để tháo: trả lại đúng state cũ', () => {
    const state = bagState()
    expect(unequipIneligible(data, state)).toEqual({ state, removed: [] })
  })
})
