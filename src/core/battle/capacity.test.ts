// Sức chứa trong trận (docs/rules/capacity.md): đội đủ và kho đầy thì bóng / Thị Uy báo lỗi ngay,
// bóng sau trong cùng lượt không ném (không mất bóng), không xin theo, trứng chờ nở; túi đầy thì đồ
// rơi bị mất.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import { cloneData } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeEquipment,
  makeInventory,
  makeMonster,
  makeRawData
} from '../testing'
import type { BattleCommand, BattleEvent, Egg, GameData, GameState, Monster } from '../model'
import { recruitChance } from './recruit'
import { gainEquipment } from './rewards'
import type { Draft } from './draft'

/** Kho chứa `storage` con, túi `bag` món, không cộng theo cảnh giới. */
function capacityData(storage: number, bag = 100): GameData {
  const raw = cloneData(makeRawData())
  raw.config.capacity = {
    storage: { ...raw.config.capacity.storage, base: storage, realmBonus: 0 },
    bag: { ...raw.config.capacity.bag, base: bag, realmBonus: 0 }
  }
  // Boss quy phục chắc chắn để thấy tỉ lệ thu phục bị chặn về 0.
  raw.config.recruit = { ...raw.config.recruit, bossChance: 50 }
  return createGameData(raw)
}

const sixAllies = (): Monster[] =>
  ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeMonster({ id, skillIds: ['strike', 'idle'] }))
const ball = (slot: number, targetId: string): BattleCommand => ({
  slot,
  kind: 'item',
  itemId: 'masterBall',
  targetId
})
const idle = (slot: number): BattleCommand => ({ slot, kind: 'skill', skillId: 'idle' })
const eventsOf = <T extends BattleEvent['type']>(state: GameState, type: T): BattleEvent[] =>
  (state.battle?.log ?? []).filter((event) => event.type === type)

function wildBattle(storage: Monster[]): GameState {
  const state = makeBattleState(sixAllies(), [makeMonster({ id: 'w1' }), makeMonster({ id: 'w2' })])
  return { ...state, storage, inventory: makeInventory({ masterBall: 5 }) }
}

describe('kho quái đầy trong trận', () => {
  it('ném bóng khi đội đủ và kho đầy: báo lỗi ngay, không mất bóng', () => {
    const data = capacityData(1)
    const state = wildBattle([makeMonster({ id: 's1' })])
    expectActionError(
      () => gameReducer(data, state, { type: 'submitTurn', commands: [ball(0, 'w1'), idle(1)] }),
      'rosterFull',
      { capacity: 1 }
    )
  })

  it('hai bóng cùng lượt mà chỉ còn một chỗ: bóng sau không ném, không mất bóng', () => {
    const data = capacityData(1)
    const next = gameReducer(data, wildBattle([]), {
      type: 'submitTurn',
      commands: [ball(0, 'w1'), ball(1, 'w2')]
    })
    expect(defined(next.battle).captured.map((m) => m.id)).toEqual(['w1'])
    expect(eventsOf(next, 'rosterFull')).toHaveLength(1)
    expect(next.inventory.stacks.masterBall).toBe(4)
  })

  it('không xin theo / quy phục khi hết chỗ', () => {
    const enemy = makeMonster({ id: 'w1' })
    const state = { ...wildBattle([makeMonster({ id: 's1' })]) }
    expect(recruitChance(capacityData(1), state, { enemy, isBoss: true })).toBe(0)
    expect(recruitChance(capacityData(5), state, { enemy, isBoss: true })).toBeGreaterThan(0)
  })

  it('trứng tới lúc nở mà hết chỗ: vẫn là trứng (bộ đếm 0), nở khi có chỗ', () => {
    const data = capacityData(0)
    const egg: Egg = { id: 'x', monster: makeMonster({ id: 'x' }), battlesLeft: 1, infusions: [] }
    const party = sixAllies()
    const state: GameState = {
      ...makeBattleState(party, [makeMonster({ id: 'z', damageTaken: 49 })]),
      eggs: [egg]
    }
    const strike: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
    const next = gameReducer(data, state, { type: 'submitTurn', commands: [strike, idle(1)] })
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.eggs).toEqual([{ ...egg, battlesLeft: 0 }])
    expect(eventsOf(next, 'eggWaiting')).toEqual([{ type: 'eggWaiting', eggId: 'x' }])
    // Có chỗ (kho 1) thì nở ở trận thắng sau.
    const later = gameReducer(capacityData(1), state, {
      type: 'submitTurn',
      commands: [strike, idle(1)]
    })
    expect(later.storage.map((m) => m.id)).toEqual(['x'])
  })
})

describe('túi trang bị đầy trong trận', () => {
  it('đồ rơi bị mất, ghi log equipmentLost', () => {
    const data = capacityData(200, 1)
    const base = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'w' })])
    const d = {
      ...base,
      battle: defined(base.battle),
      inventory: { ...base.inventory, equipment: [makeEquipment({ id: 'e1' })] }
    } as Draft
    gainEquipment(data, d, makeEquipment({ id: 'e2' }))
    expect(d.inventory.equipment.map((e) => e.id)).toEqual(['e1'])
    expect(d.battle.log.at(-1)).toEqual({
      type: 'equipmentLost',
      itemId: 'sword',
      rarity: 'common'
    })
  })
})
