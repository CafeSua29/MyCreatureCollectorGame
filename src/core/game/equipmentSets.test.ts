// Bộ trang bị ở tầng game (docs/rules/equipment-sets.md): đổi bộ ở Thợ rèn, MonsterView, save (setId),
// migrate v115 → v116, bộ lọc túi theo bộ, thành tựu gom đủ bộ.

import { describe, expect, it } from 'vitest'
import { achievementProgress } from '../registries'
import { filterBagItems } from '../inventory'
import { buildMonsterView } from '../roster'
import { toBig } from '../shared'
import {
  defined,
  equipped,
  expectActionError,
  makeEquipment,
  makeEquipmentSetData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeSetEquipment
} from '../testing'
import type { EquipmentInstance, GameState } from '../model'
import { migrateState } from './migrate'
import { gameReducer, SAVE_VERSION } from './reducer'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'

const data = makeEquipmentSetData()

function townState(equipment: EquipmentInstance[], money = 1e9): GameState {
  return {
    ...makeGameState({ seed: 7, party: [makeMonster({ id: 'a' })] }),
    nextItemId: 100,
    money: toBig(money),
    inventory: makeInventory({}, [], equipment)
  }
}

const bagItem = (state: GameState): EquipmentInstance => defined(state.inventory.equipment[0])

describe('đổi bộ ngẫu nhiên ở Thợ rèn', () => {
  it('món trong túi đổi sang bộ khác, trừ rerollMoney[bậc] × tầng cao nhất, các dòng giữ nguyên', () => {
    const item = makeSetEquipment('guard', { rarity: 'rare' })
    const next = gameReducer(data, townState([item], 10_000), {
      type: 'rerollEquipmentSet',
      instanceId: 'e1'
    })
    expect(bagItem(next).setId).not.toBe('guard')
    expect(bagItem(next).rolls).toEqual(item.rolls)
    expect(next.money.eq(10_000 - 800)).toBe(true)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('món chưa thuộc bộ (món cũ) cũng nhận bộ; món đang lắp đổi tại chỗ', () => {
    const wearer = makeMonster({ id: 'b', equipment: [equipped(makeEquipment())] })
    const state = { ...townState([]), storage: [wearer] }
    const next = gameReducer(data, state, { type: 'rerollEquipmentSet', instanceId: 'e1' })
    const entry = defined(next.storage[0].equipment[0])
    expect(entry.storage === 'instance' && entry.instance.setId).toBeTruthy()
  })

  it('món bộ đặt tên / món gốc ghi bộ cố định: setNotRerollable, state giữ nguyên', () => {
    const named = makeEquipment({ baseItemId: 'knightHelm', rarity: 'rare', setId: 'knight' })
    expectActionError(
      () => gameReducer(data, townState([named]), { type: 'rerollEquipmentSet', instanceId: 'e1' }),
      'setNotRerollable',
      { instanceId: 'e1' }
    )
    const fixed = makeEquipment({ baseItemId: 'guardShield', setId: 'guard' })
    expectActionError(
      () => gameReducer(data, townState([fixed]), { type: 'rerollEquipmentSet', instanceId: 'e1' }),
      'setNotRerollable'
    )
  })

  it('thiếu tiền, không ở thị trấn, không có món: lỗi', () => {
    const item = makeSetEquipment('guard')
    expectActionError(
      () =>
        gameReducer(data, townState([item], 0), { type: 'rerollEquipmentSet', instanceId: 'e1' }),
      'notEnoughMoney'
    )
    expectActionError(
      () => gameReducer(data, townState([]), { type: 'rerollEquipmentSet', instanceId: 'e9' }),
      'equipmentNotFound'
    )
    const away = { ...townState([item]), location: { type: 'floor' as const, floor: 1 } }
    expectActionError(
      () => gameReducer(data, away as GameState, { type: 'rerollEquipmentSet', instanceId: 'e1' }),
      'notInTown'
    )
  })

  it('tầng cực lớn: giá Decimal hữu hạn', () => {
    const item = makeSetEquipment('guard', { rarity: 'unique', baseItemId: 'stronglingCrown' })
    const state = {
      ...townState([item]),
      money: toBig('1e30'),
      highestFloor: Number.MAX_SAFE_INTEGER
    }
    expectActionError(
      () => gameReducer(data, state, { type: 'rerollEquipmentSet', instanceId: 'e1' }),
      'setNotRerollable'
    )
    const normal = { ...state, inventory: makeInventory({}, [], [makeSetEquipment('guard')]) }
    const next = gameReducer(data, normal, { type: 'rerollEquipmentSet', instanceId: 'e1' })
    const cost = toBig(200).times(Number.MAX_SAFE_INTEGER)
    expect(next.money.eq(toBig('1e30').minus(cost))).toBe(true)
  })
})

describe('MonsterView, bộ lọc túi, thành tựu', () => {
  const knight = ['knightHelm', 'knightPlate', 'knightBlade'].map((baseItemId, i) =>
    equipped(
      makeEquipment({ id: `e${10 + i}`, baseItemId, rarity: 'rare', setId: 'knight', rolls: [] })
    )
  )

  it('MonsterView liệt kê bộ đang có', () => {
    const monster = makeMonster({ id: 'a', equipment: knight })
    const view = buildMonsterView(data, monster, {
      location: 'party',
      index: 0,
      equipmentSlots: 3,
      scene: { aptitudeFloor: 0 } as never,
      highestFloor: 1
    })
    expect(view.equipmentSets).toEqual([
      { setId: 'knight', kind: 'named', count: 3, activeBonuses: 2 }
    ])
  })

  it('lọc túi theo bộ: món không thuộc bộ bị loại', () => {
    const inventory = makeInventory(
      {},
      [],
      [
        makeSetEquipment('guard', { id: 'e1' }),
        makeEquipment({ id: 'e2' }),
        makeSetEquipment('fatal', { id: 'e3' })
      ]
    )
    const ids = filterBagItems(data, inventory, { setIds: ['guard', 'fatal'] }).map((line) =>
      line.item.storage === 'instance' ? line.item.instanceId : ''
    )
    expect(ids).toEqual(['e1', 'e3'])
  })

  it('thành tựu đếm số bộ đặt tên khác nhau đang đeo đủ', () => {
    const achievement = {
      id: 'sets',
      condition: { type: 'equipmentSetsCompleted' as const },
      tiers: [{ value: 1, rewards: {} }]
    }
    const partial = makeGameState({
      seed: 1,
      party: [makeMonster({ equipment: knight.slice(0, 2) })]
    })
    expect(achievementProgress(data, partial, achievement)).toBe(0)
    const full = makeGameState({
      seed: 1,
      party: [
        makeMonster({ id: 'a', equipment: knight }),
        makeMonster({ id: 'b', equipment: knight })
      ]
    })
    expect(achievementProgress(data, full, achievement)).toBe(1)
  })
})

describe('save', () => {
  const asSave = (state: GameState): Record<string, unknown> =>
    JSON.parse(JSON.stringify(serializeState(state)))

  it('setId hợp lệ qua kiểm tra; bộ không tồn tại / sai bộ của món gốc báo lỗi', () => {
    expect(validateGameState(data, townState([makeSetEquipment('guard')]))).toEqual([])
    expect(validateGameState(data, townState([makeEquipment()]))).toEqual([])
    const missing = validateGameState(data, townState([makeSetEquipment('nope')]))
    expect(missing.join()).toContain('bộ trang bị không tồn tại "nope"')
    const wrongNamed = validateGameState(data, townState([makeSetEquipment('knight')]))
    expect(wrongNamed.join()).toContain('không thuộc bộ đặt tên "knight"')
    const wrongPiece = validateGameState(
      data,
      townState([makeEquipment({ baseItemId: 'knightHelm', rarity: 'rare', setId: 'guard' })])
    )
    expect(wrongPiece.join()).toContain('thuộc bộ "knight"')
  })

  it('migrate v115 → v116: món cũ giữ nguyên, không thuộc bộ', () => {
    const save = { ...asSave(townState([makeEquipment()])), version: 115 }
    const migrated = migrateState(save, data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.inventory.equipment[0].setId).toBeUndefined()
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
