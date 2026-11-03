// Khí Linh Các (docs/rules/artifact-spirits.md): triệu khí linh, di dời (giá, ô đầy, dã linh), gộp,
// nuôi (yêu đan, hồn phách), phối linh theo ngày, phân giải trả khí linh về kho, sức chứa túi, lỗi
// (state giữ nguyên).

import { describe, expect, it } from 'vitest'
import { gameReducer, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import { toBig } from '../shared'
import {
  FIXTURE_CORE_IDS,
  FIXTURE_SPIRIT_IDS,
  FIXTURE_SPIRIT_ORB_ID as ORB,
  defined,
  equipped,
  expectActionError,
  makeBattleState,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import { createSoul } from '../monster'
import type {
  ArtifactSpirit,
  EquipmentInstance,
  GameAction,
  GameState,
  SpiritLocation
} from '../model'
import { HOURS_PER_DAY } from '../model'

const data = makeEquipmentData()
const [SWORD, GUARD] = FIXTURE_SPIRIT_IDS

const spirit = (value: number, typeId: string = SWORD, subdued = true): ArtifactSpirit => ({
  typeIds: [typeId],
  value,
  subdued
})

function townState({
  stacks = {},
  equipment = [],
  spirits = [],
  money = 1e9
}: {
  stacks?: Record<string, number>
  equipment?: EquipmentInstance[]
  spirits?: ArtifactSpirit[]
  money?: number
} = {}): GameState {
  const state = makeGameState({ seed: 7, party: [makeMonster({ id: 'a' })] })
  return {
    ...state,
    nextItemId: 100,
    money: toBig(money),
    inventory: { ...makeInventory(stacks, [], equipment), spirits }
  }
}

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)
const inStorage = (index: number): SpiritLocation => ({ kind: 'storage', index })
const onItem = (index: number, instanceId = 'e1'): SpiritLocation => ({
  kind: 'equipment',
  instanceId,
  index
})
const bagItem = (state: GameState, id = 'e1'): EquipmentInstance =>
  defined(state.inventory.equipment.find((entry) => entry.id === id))

describe('triệu khí linh', () => {
  it('tiêu một Dẫn Hồn Châu, khí linh đã thu phục vào kho', () => {
    const next = act(townState({ stacks: { [ORB]: 2 } }), { type: 'summonSpirit' })
    expect(getItemCount(next.inventory, ORB)).toBe(1)
    const [summoned] = next.inventory.spirits
    expect(summoned.subdued).toBe(true)
    expect(summoned.value).toBeGreaterThanOrEqual(1)
    expect(summoned.value).toBeLessThanOrEqual(3)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('lỗi: thiếu châu, túi đầy, ngoài thị trấn, trong trận', () => {
    const state = townState({ stacks: { [ORB]: 1 } })
    expectActionError(() => act(townState(), { type: 'summonSpirit' }), 'notEnoughItem')
    const full = { ...state, capacity: { ...state.capacity, bag: -10 } }
    expectActionError(() => act(full, { type: 'summonSpirit' }), 'bagFull')
    expectActionError(
      () => act({ ...state, location: { type: 'floor', floor: 1 } }, { type: 'summonSpirit' }),
      'notInTown'
    )
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'x' })])
    expectActionError(() => act(battle, { type: 'summonSpirit' }), 'inBattle')
  })
})

describe('di dời', () => {
  it('kho → món: tốn moveMoneyPerValue × value × tầng, khí linh lên món', () => {
    const state = townState({ equipment: [makeEquipment()], spirits: [spirit(5)], money: 1000 })
    const next = act(state, {
      type: 'moveSpirit',
      from: inStorage(0),
      to: { kind: 'equipment', instanceId: 'e1' }
    })
    expect(next.inventory.spirits).toEqual([])
    expect(bagItem(next).spirits).toEqual([spirit(5)])
    expect(next.money.eq(1000 - 20 * 5 * state.highestFloor)).toBe(true)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('món đang lắp → kho', () => {
    const worn = makeEquipment({ spirits: [spirit(4)] })
    const state = {
      ...townState(),
      party: [makeMonster({ id: 'a', equipment: [equipped(worn)] })]
    }
    const next = act(state, { type: 'moveSpirit', from: onItem(0), to: { kind: 'storage' } })
    expect(next.inventory.spirits).toEqual([spirit(4)])
    const entry = defined(next.party[0].equipment[0])
    expect(entry.storage === 'instance' && entry.instance.spirits).toBeUndefined()
  })

  it('lỗi: dã linh, ô món đầy, không có khí linh, cùng nơi, thiếu tiền', () => {
    const wild = makeEquipment({ spirits: [spirit(4, SWORD, false)] })
    const state = townState({ equipment: [wild], spirits: [spirit(2)] })
    expectActionError(
      () => act(state, { type: 'moveSpirit', from: onItem(0), to: { kind: 'storage' } }),
      'spiritNotSubdued',
      { instanceId: 'e1', index: 0 }
    )
    expectActionError(
      () =>
        act(state, {
          type: 'moveSpirit',
          from: inStorage(0),
          to: { kind: 'equipment', instanceId: 'e1' }
        }),
      'spiritSlotsFull',
      { instanceId: 'e1', slots: 1 }
    )
    expectActionError(
      () => act(state, { type: 'moveSpirit', from: inStorage(3), to: { kind: 'storage' } }),
      'spiritNotFound',
      { instanceId: null, index: 3 }
    )
    expectActionError(
      () => act(state, { type: 'moveSpirit', from: inStorage(0), to: { kind: 'storage' } }),
      'malformedAction'
    )
    const poor = townState({ equipment: [makeEquipment()], spirits: [spirit(2)], money: 0 })
    expectActionError(
      () =>
        act(poor, {
          type: 'moveSpirit',
          from: inStorage(0),
          to: { kind: 'equipment', instanceId: 'e1' }
        }),
      'notEnoughMoney'
    )
  })
})

describe('gộp', () => {
  it('cùng loại: value cộng dồn (không trần), khí linh thứ hai mất', () => {
    const state = townState({ spirits: [spirit(3), spirit(1, GUARD), spirit(1e15)] })
    const next = act(state, { type: 'mergeSpirits', first: inStorage(2), second: inStorage(0) })
    expect(next.inventory.spirits).toEqual([spirit(1, GUARD), spirit(1e15 + 3)])
  })

  it('giữa món và kho: khí linh trên món lớn lên, khí linh trong kho mất', () => {
    const state = townState({
      equipment: [makeEquipment({ rarity: 'rare', spirits: [spirit(2, GUARD), spirit(5)] })],
      spirits: [spirit(7)]
    })
    const next = act(state, { type: 'mergeSpirits', first: onItem(1), second: inStorage(0) })
    expect(bagItem(next).spirits).toEqual([spirit(2, GUARD), spirit(12)])
    expect(next.inventory.spirits).toEqual([])
  })

  it('lỗi: khác loại, dã linh, gộp với chính nó', () => {
    const state = townState({
      equipment: [makeEquipment({ spirits: [spirit(2, SWORD, false)] })],
      spirits: [spirit(3), spirit(1, GUARD)]
    })
    expectActionError(
      () => act(state, { type: 'mergeSpirits', first: inStorage(0), second: inStorage(1) }),
      'spiritTypesDiffer'
    )
    expectActionError(
      () => act(state, { type: 'mergeSpirits', first: inStorage(0), second: onItem(0) }),
      'spiritNotSubdued'
    )
    expectActionError(
      () => act(state, { type: 'mergeSpirits', first: inStorage(0), second: inStorage(0) }),
      'malformedAction'
    )
  })
})

describe('di dời / gộp hàng loạt', () => {
  it('di dời nhiều khí linh từ kho lên món trong một action', () => {
    const state = townState({
      equipment: [makeEquipment({ rarity: 'rare' })],
      spirits: [spirit(1), spirit(2, GUARD), spirit(3)]
    })
    const next = act(state, {
      type: 'moveSpirits',
      from: [inStorage(0), inStorage(2)],
      to: { kind: 'equipment', instanceId: 'e1' }
    })
    expect(next.inventory.spirits).toEqual([spirit(2, GUARD)])
    // Xử lý từ vị trí lớn xuống: khí linh ở index 2 tới trước.
    expect(bagItem(next).spirits).toEqual([spirit(3), spirit(1)])
    expect(next.money.eq(1e9 - 20 * 4 * state.highestFloor)).toBe(true)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('di dời từ nhiều món về kho', () => {
    const state = townState({
      equipment: [
        makeEquipment({ spirits: [spirit(4)] }),
        makeEquipment({ id: 'e2', spirits: [spirit(5)] })
      ]
    })
    const next = act(state, {
      type: 'moveSpirits',
      from: [onItem(0), onItem(0, 'e2')],
      to: { kind: 'storage' }
    })
    expect(next.inventory.spirits.map((entry) => entry.value).sort()).toEqual([4, 5])
  })

  it('gộp nhiều khí linh vào một, kể cả khi khí linh giữ lại đứng sau', () => {
    const state = townState({
      spirits: [spirit(1), spirit(2, GUARD), spirit(10), spirit(1e15), spirit(4)]
    })
    const next = act(state, {
      type: 'mergeSpiritsInto',
      first: inStorage(2),
      others: [inStorage(0), inStorage(4), inStorage(3)]
    })
    expect(next.inventory.spirits).toEqual([spirit(2, GUARD), spirit(1e15 + 15)])
  })

  it('lỗi: rỗng, trùng, gộp với chính nó, khác loại, ô món đầy (cả lệnh lỗi)', () => {
    const state = townState({
      equipment: [makeEquipment()],
      spirits: [spirit(1), spirit(2, GUARD), spirit(3), spirit(4)]
    })
    const merge = (others: SpiritLocation[]): GameState =>
      act(state, { type: 'mergeSpiritsInto', first: inStorage(0), others })
    expectActionError(() => merge([]), 'malformedAction')
    expectActionError(() => merge([inStorage(2), inStorage(2)]), 'malformedAction')
    expectActionError(() => merge([inStorage(0)]), 'malformedAction')
    expectActionError(() => merge([inStorage(2), inStorage(1)]), 'spiritTypesDiffer')
    // Món thường có 1 ô: khí linh đầu vào được, khí linh sau báo hết ô.
    expectActionError(
      () =>
        act(state, {
          type: 'moveSpirits',
          from: [inStorage(2), inStorage(3)],
          to: { kind: 'equipment', instanceId: 'e1' }
        }),
      'spiritSlotsFull'
    )
  })
})

describe('nuôi dưỡng', () => {
  it('yêu đan bất kỳ: + coreValue mỗi viên', () => {
    const state = townState({ stacks: { [FIXTURE_CORE_IDS[0]]: 5 }, spirits: [spirit(3)] })
    const next = act(state, {
      type: 'feedSpirit',
      target: inStorage(0),
      food: { kind: 'cores', count: 3 }
    })
    expect(next.inventory.spirits[0].value).toBe(3 + 2 * 3)
    expect(getItemCount(next.inventory, FIXTURE_CORE_IDS[0])).toBe(2)
  })

  it('hồn phách: theo bậc hồn khí của tư chất, hồn phách mất', () => {
    const soul = createSoul(data, makeMonster({ id: 's1' }), {
      aptitudeFloor: 1,
      day: 0,
      cause: 'oldAge'
    })
    const base = townState({ spirits: [spirit(3)] })
    const state = { ...base, inventory: { ...base.inventory, souls: [soul] } }
    const next = act(state, {
      type: 'feedSpirit',
      target: inStorage(0),
      food: { kind: 'soul', soulId: 's1' }
    })
    const rarity = data.config.soulRelic.rarityByAptitude[soul.aptitudeTierId]
    expect(next.inventory.spirits[0].value).toBe(
      3 + data.config.artifactSpirits.feed.soulValue[rarity]
    )
    expect(next.inventory.souls).toEqual([])
  })

  it('lỗi: thiếu yêu đan, không có hồn phách, số lượng sai', () => {
    const state = townState({ spirits: [spirit(3)] })
    const feed = (food: unknown): GameState =>
      act(state, { type: 'feedSpirit', target: inStorage(0), food } as GameAction)
    expectActionError(() => feed({ kind: 'cores', count: 1 }), 'notEnoughGroupItem')
    expectActionError(() => feed({ kind: 'soul', soulId: 'x' }), 'soulNotFound')
    expectActionError(() => feed({ kind: 'cores', count: 0 }), 'malformedAction')
  })
})

describe('phối linh', () => {
  const pair = (): GameState => townState({ spirits: [spirit(10), spirit(30, GUARD), spirit(1)] })

  it('hai loại khác nhau vào Linh trì 7 ngày, xong thì nhận khí linh kép + hai gốc', () => {
    const bred = act(pair(), { type: 'breedSpirits', first: 0, second: 1 })
    expect(bred.inventory.spirits).toEqual([spirit(1)])
    expect(bred.spiritPools).toHaveLength(1)
    expect(validateGameState(data, bred)).toEqual([])
    expectActionError(
      () => act(bred, { type: 'collectSpiritPool', index: 0 }),
      'spiritPoolNotReady',
      { index: 0, readyDay: 7 }
    )
    const later = { ...bred, time: bred.time + 7 * HOURS_PER_DAY }
    const done = act(later, { type: 'collectSpiritPool', index: 0 })
    expect(done.spiritPools).toEqual([])
    expect(done.inventory.spirits).toEqual([
      spirit(1),
      { typeIds: [SWORD, GUARD], value: 20, subdued: true },
      spirit(10),
      spirit(30, GUARD)
    ])
  })

  it('lỗi: cùng loại, khí linh kép, vị trí sai, Linh trì không có cặp, túi không đủ 3 chỗ', () => {
    const state = pair()
    expectActionError(
      () => act(state, { type: 'breedSpirits', first: 0, second: 2 }),
      'spiritNotBreedable'
    )
    expectActionError(
      () => act(state, { type: 'breedSpirits', first: 0, second: 0 }),
      'malformedAction'
    )
    expectActionError(
      () => act(state, { type: 'breedSpirits', first: 0, second: 9 }),
      'spiritNotFound'
    )
    expectActionError(
      () => act(state, { type: 'collectSpiritPool', index: 0 }),
      'spiritPoolNotFound'
    )
    const bred = act(state, { type: 'breedSpirits', first: 0, second: 1 })
    const ready = { ...bred, time: bred.time + 7 * HOURS_PER_DAY }
    const full = { ...ready, capacity: { ...ready.capacity, bag: -10 } }
    expectActionError(() => act(full, { type: 'collectSpiritPool', index: 0 }), 'bagFull')
  })
})

describe('phân giải trả khí linh', () => {
  it('khí linh đã thu phục về kho, dã linh mất', () => {
    const item = makeEquipment({ rarity: 'rare', spirits: [spirit(5), spirit(2, GUARD, false)] })
    const next = act(townState({ equipment: [item] }), {
      type: 'salvageEquipment',
      instanceIds: ['e1']
    })
    expect(next.inventory.equipment).toEqual([])
    expect(next.inventory.spirits).toEqual([spirit(5)])
  })

  it('túi đầy mà khí linh về làm tăng chỗ dùng: bagFull, state giữ nguyên', () => {
    const item = makeEquipment({ rarity: 'rare', spirits: [spirit(5), spirit(2)] })
    const base = townState({ equipment: [item] })
    const full = { ...base, capacity: { ...base.capacity, bag: -10 } }
    expectActionError(() => act(full, { type: 'salvageEquipment', instanceIds: ['e1'] }), 'bagFull')
  })
})

describe('save', () => {
  it('kho khí linh chỉ chứa khí linh đã thu phục, khí linh sai loại / value bị báo', () => {
    const state = townState({
      equipment: [makeEquipment({ spirits: [{ typeIds: ['nope'], value: 0, subdued: false }] })],
      spirits: [spirit(2, SWORD, false)]
    })
    const issues = validateGameState(data, state)
    expect(issues.some((issue) => issue.includes('chỉ chứa khí linh đã thu phục'))).toBe(true)
    expect(issues.some((issue) => issue.includes('loại khí linh không tồn tại "nope"'))).toBe(true)
    expect(issues.some((issue) => issue.includes('spirits[0].value'))).toBe(true)
  })
})
