// Luyện khí ở Thợ rèn (docs/rules/equipment-forge.md, alchemy.md): cấp luyện khí riêng, công thức
// luyện khí, cường hóa cấp cao cần yêu đan, đúc trang bị (bậc theo số yêu đan / cấp), lỗi, save.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { castRarityWeights, enhanceCost, getItemCount, imbuedElementId } from '../inventory'
import { craftExpForLevel, craftLevelFromExp, craftableTimes } from '../progression'
import { toBig } from '../shared'
import {
  FIXTURE_CORE_GROUP_ID as GROUP,
  FIXTURE_CORE_IDS,
  FIXTURE_ENHANCE_STONE_ID as ENHANCE,
  FIXTURE_REFINING_STONE_ID as REFINING,
  dataIssuesAfter,
  defined,
  equipped,
  expectActionError,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { EquipmentInstance, GameAction, GameState } from '../model'

const [FIRE, WATER] = FIXTURE_CORE_IDS

const data = makeEquipmentData((raw) => {
  raw.recipes.push(
    {
      id: 'smithStone',
      station: 'smithing',
      output: { itemId: ENHANCE, count: 5 },
      inputs: [{ groupId: GROUP, count: 1 }],
      money: 0,
      minLevel: 1,
      successChance: 100,
      exp: 30
    },
    {
      id: 'smithHard',
      station: 'smithing',
      output: { itemId: REFINING, count: 1 },
      inputs: [{ groupId: GROUP, count: 2 }],
      money: 0,
      minLevel: 3,
      successChance: 50,
      exp: 1
    },
    {
      id: 'smithSame',
      station: 'smithing',
      output: { itemId: ENHANCE, count: 1 },
      inputs: [{ groupId: GROUP, count: 3, sameItem: true }],
      money: 0,
      minLevel: 1,
      successChance: 100,
      exp: 1
    }
  )
  // Phụ linh / đúc: yêu đan hệ lửa / nước của fixture, dòng linh hệ trọng số 0 (rare cố định 11).
  raw.config.treasures.demonCoreItemIds = { fire: FIRE, water: WATER }
  const ranges = {
    common: { min: 4, max: 6 },
    uncommon: { min: 6, max: 9 },
    rare: { min: 11, max: 11 },
    epic: { min: 13, max: 18 },
    legendary: { min: 18, max: 24 },
    unique: { min: 22, max: 30 }
  }
  for (const [elementId, lineId] of [
    ['fire', 'imbueFire'],
    ['water', 'imbueWater']
  ]) {
    raw.equipmentAffixes.push({
      id: lineId,
      weight: 0,
      hook: { type: 'elementDamageDealt', params: { elementIds: [elementId] } },
      valueParam: 'percent',
      ranges
    })
  }
  raw.config.forge.imbue.lineIds = { fire: 'imbueFire', water: 'imbueWater' }
})

function townState({
  stacks = {},
  equipment = [],
  money = 1e9,
  seed = 11
}: {
  stacks?: Record<string, number>
  equipment?: EquipmentInstance[]
  money?: number
  seed?: number
} = {}): GameState {
  return {
    ...makeGameState({ seed, party: [makeMonster({ id: 'a' })] }),
    nextItemId: 100,
    money: toBig(money),
    inventory: makeInventory(stacks, [], equipment)
  }
}

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)
const withSmithing = (state: GameState, level: number): GameState => ({
  ...state,
  smithing: { level, exp: craftExpForLevel(data, 'smithing', level), lastCraft: null }
})

describe('cấp luyện khí', () => {
  it('đường cong riêng (config.forge), không trần', () => {
    expect(craftExpForLevel(data, 'smithing', 3).toString()).toBe('40')
    expect(craftLevelFromExp(data, 'smithing', toBig(39))).toBe(2)
    expect(craftLevelFromExp(data, 'smithing', toBig('1e20'))).toBe(3162277661)
  })

  it('công thức luyện khí cộng exp luyện khí, không đụng cấp luyện đan', () => {
    const state = townState({ stacks: { [FIRE]: 2 } })
    const next = act(state, { type: 'craft', recipeId: 'smithStone', times: 2 })
    expect(getItemCount(next.inventory, ENHANCE)).toBe(10)
    expect(getItemCount(next.inventory, FIRE)).toBe(0)
    expect(next.smithing.exp.eq(60)).toBe(true)
    expect(next.smithing.level).toBe(3)
    expect(next.smithing.lastCraft).toEqual({ recipeId: 'smithStone', successes: 2, failures: 0 })
    expect(next.alchemy).toEqual(state.alchemy)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('lỗi: thiếu cấp luyện khí / thiếu yêu đan (state giữ nguyên)', () => {
    const state = townState({ stacks: { [FIRE]: 1 } })
    expectActionError(
      () => act(state, { type: 'craft', recipeId: 'smithHard', times: 1 }),
      'smithingLevelTooLow',
      { need: 3, have: 1 }
    )
    expectActionError(
      () => act(withSmithing(state, 3), { type: 'craft', recipeId: 'smithHard', times: 1 }),
      'notEnoughGroupItem',
      { groupId: GROUP, have: 1, need: 2 }
    )
  })
})

describe('cường hóa cấp cao', () => {
  it('từ cấp 10: ⌊(cấp − 10) / 10⌋ + 1 yêu đan; cấp cực lớn vẫn hữu hạn', () => {
    expect(enhanceCost(data, makeEquipment({ level: 9 })).cores).toBe(0)
    expect(enhanceCost(data, makeEquipment({ level: 10 })).cores).toBe(1)
    expect(enhanceCost(data, makeEquipment({ level: 19 })).cores).toBe(1)
    expect(enhanceCost(data, makeEquipment({ level: 20 })).cores).toBe(2)
    expect(enhanceCost(data, makeEquipment({ level: 1e15 })).cores).toBe(1e14)
  })

  it('trừ yêu đan bất kỳ (chồng nhiều trước) và cộng exp luyện khí', () => {
    const state = townState({
      stacks: { [ENHANCE]: 20, [FIRE]: 1, [WATER]: 2 },
      equipment: [makeEquipment({ level: 10 })]
    })
    const next = act(state, { type: 'enhanceEquipment', instanceId: 'e1' })
    expect(defined(next.inventory.equipment[0]).level).toBe(11)
    expect(getItemCount(next.inventory, WATER)).toBe(1)
    expect(getItemCount(next.inventory, FIRE)).toBe(1)
    expect(next.smithing.exp.eq(1)).toBe(true)
  })

  it('cấp thấp không cần yêu đan; thiếu yêu đan thì lỗi', () => {
    const low = townState({ stacks: { [ENHANCE]: 5 }, equipment: [makeEquipment()] })
    expect(act(low, { type: 'enhanceEquipment', instanceId: 'e1' }).inventory.stacks[ENHANCE]).toBe(
      4
    )
    const high = townState({ stacks: { [ENHANCE]: 20 }, equipment: [makeEquipment({ level: 10 })] })
    expectActionError(
      () => act(high, { type: 'enhanceEquipment', instanceId: 'e1' }),
      'notEnoughGroupItem',
      { groupId: GROUP, have: 0, need: 1 }
    )
  })
})

describe('đúc trang bị', () => {
  const cast = (
    state: GameState,
    itemId: unknown,
    cores: unknown,
    elementId: unknown = 'fire'
  ): GameState =>
    // Ép kiểu: test gửi cả giá trị sai dạng như renderer có thể gửi.
    act(state, { type: 'castEquipment', itemId, elementId, cores } as GameAction)

  it('tạo món mới cấp 1 mang dòng linh hệ, trừ yêu đan cùng hệ + tiền × tầng cao nhất, + exp', () => {
    const base = townState({ stacks: { [FIRE]: 3, [WATER]: 5 }, money: 1000 })
    const floors = [...base.floorBiomeIds, ...base.floorBiomeIds]
    const state = { ...base, highestFloor: floors.length, floorBiomeIds: floors }
    const next = cast(state, 'sword', 3)
    const made = defined(next.inventory.equipment[0])
    expect(made).toMatchObject({ id: 'e100', baseItemId: 'sword', level: 1 })
    expect(imbuedElementId(data, made)).toBe('fire')
    expect(made.rolls.at(-1)?.lineId).toBe('imbueFire')
    expect(next.nextItemId).toBe(101)
    // Bộ đếm thành tựu (docs/rules/achievements.md): đúc tính một món luyện khí.
    expect(next.stats.itemsForged).toBe(1)
    expect(getItemCount(next.inventory, FIRE)).toBe(0)
    expect(getItemCount(next.inventory, WATER)).toBe(5)
    expect(next.money.eq(1000 - 200 * floors.length)).toBe(true)
    expect(next.smithing.exp.eq(10)).toBe(true)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('nhiều yêu đan / cấp cao: bậc hiếm nặng hơn; tung nhiều lần ra bậc hiếm nhiều hơn', () => {
    const one = castRarityWeights(data, { cores: 1, level: 1 })
    const ten = castRarityWeights(data, { cores: 10, level: 1 })
    expect(one).toEqual({ common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 1 })
    expect(ten.common).toBe(50)
    expect(ten.rare).toBeCloseTo(15 * 3.7)
    expect(castRarityWeights(data, { cores: 1, level: 21 }).legendary).toBeCloseTo(2)
    const rareCount = (cores: number): number => {
      let count = 0
      for (let seed = 1; seed <= 200; seed++) {
        const state = townState({ stacks: { [FIRE]: cores }, seed })
        const made = defined(cast(state, 'sword', cores).inventory.equipment[0])
        if (['rare', 'epic', 'legendary'].includes(made.rarity)) count++
      }
      return count
    }
    expect(rareCount(10)).toBeGreaterThan(rareCount(1))
  })

  it('lỗi: món không đúc được, hệ không phụ linh được, số yêu đan sai, thiếu yêu đan cùng hệ / tiền', () => {
    const state = townState({ stacks: { [FIRE]: 2, [WATER]: 9 }, money: 1000 })
    expectActionError(() => cast(state, 'stronglingCrown', 1), 'notCastable', {
      itemId: 'stronglingCrown'
    })
    expectActionError(() => cast(state, 'potion', 1), 'notCastable', { itemId: 'potion' })
    expectActionError(() => cast(state, 'ghost', 1), 'notCastable')
    for (const cores of [0, 11, 1.5, '2']) {
      expectActionError(() => cast(state, 'sword', cores), 'malformedAction')
    }
    expectActionError(() => cast(state, 7, 1), 'malformedAction')
    expectActionError(() => cast(state, 'sword', 1, 7), 'malformedAction')
    expectActionError(() => cast(state, 'sword', 1, 'grass'), 'elementNotImbuable', {
      elementId: 'grass'
    })
    // Yêu đan hệ khác không thay được.
    expectActionError(() => cast(state, 'sword', 3), 'notEnoughItem', {
      itemId: FIRE,
      have: 2,
      need: 3
    })
    expectActionError(() => cast({ ...state, money: toBig(0) }, 'sword', 1), 'notEnoughMoney')
    expectActionError(
      () => cast({ ...state, location: { type: 'floor', floor: 1 } }, 'sword', 1),
      'notInTown'
    )
  })
})

describe('phụ linh', () => {
  const imbue = (state: GameState, elementId: unknown, instanceId: unknown = 'e1'): GameState =>
    // Ép kiểu: test gửi cả giá trị sai dạng.
    act(state, { type: 'imbueEquipment', instanceId, elementId } as GameAction)

  it('gắn dòng linh hệ lên món trong túi: yêu đan theo bậc + tiền × tầng, + exp luyện khí', () => {
    const state = townState({
      stacks: { [WATER]: 5 },
      equipment: [makeEquipment({ rarity: 'rare' })],
      money: 1000
    })
    const next = imbue(state, 'water')
    const item = defined(next.inventory.equipment[0])
    expect(imbuedElementId(data, item)).toBe('water')
    expect(item.rolls).toHaveLength(2)
    expect(defined(item.rolls[1]).value).toBe(11)
    expect(getItemCount(next.inventory, WATER)).toBe(2)
    expect(next.money.eq(1000 - 300)).toBe(true)
    expect(next.smithing.exp.eq(5)).toBe(true)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('phụ linh lại thay dòng cũ (tối đa một dòng linh hệ); món đang lắp vẫn ở trên quái', () => {
    const worn = makeMonster({ id: 'b', equipment: [equipped(makeEquipment())] })
    const state = { ...townState({ stacks: { [FIRE]: 1, [WATER]: 1 } }), storage: [worn] }
    const once = imbue(state, 'fire')
    const twice = imbue(once, 'water')
    const entry = defined(twice.storage[0].equipment[0])
    const instance = entry.storage === 'instance' ? entry.instance : null
    expect(instance && imbuedElementId(data, instance)).toBe('water')
    expect(instance?.rolls.map((roll) => roll.lineId)).toEqual(['main', 'imbueWater'])
  })

  it('dòng linh hệ không tẩy luyện / khóa được', () => {
    const imbued = makeEquipment({
      rarity: 'rare',
      rolls: [
        { lineId: 'main', value: 10 },
        { lineId: 'imbueFire', value: 10 }
      ]
    })
    const state = townState({ stacks: { [REFINING]: 9 }, equipment: [imbued] })
    expectActionError(
      () => act(state, { type: 'rerollEquipmentAffixes', instanceId: 'e1' }),
      'nothingToReroll'
    )
    expectActionError(
      () =>
        act(state, { type: 'rerollEquipmentAffixes', instanceId: 'e1', lockedLineIndexes: [1] }),
      'lineNotRerollable'
    )
  })

  it('lỗi: hệ sai, thiếu yêu đan cùng hệ / tiền, không có món, ngoài thị trấn', () => {
    const state = townState({ stacks: { [FIRE]: 9 }, equipment: [makeEquipment()], money: 1000 })
    expectActionError(() => imbue(state, 'water'), 'notEnoughItem', { itemId: WATER, need: 1 })
    expectActionError(() => imbue(state, 'ghost'), 'elementNotImbuable')
    expectActionError(() => imbue(state, 3), 'malformedAction')
    expectActionError(() => imbue(state, 'fire', 'e9'), 'equipmentNotFound')
    expectActionError(() => imbue({ ...state, money: toBig(0) }, 'fire'), 'notEnoughMoney')
    expectActionError(
      () => imbue({ ...state, location: { type: 'floor', floor: 1 } }, 'fire'),
      'notInTown'
    )
  })
})

describe('nguyên liệu yêu đan cùng hệ', () => {
  it('sameItem: mọi viên lấy từ một loại (chồng nhiều nhất); các loại cộng lại không tính', () => {
    const state = townState({ stacks: { [FIRE]: 2, [WATER]: 3 } })
    const next = act(state, { type: 'craft', recipeId: 'smithSame', times: 1 })
    expect(getItemCount(next.inventory, WATER)).toBe(0)
    expect(getItemCount(next.inventory, FIRE)).toBe(2)
    expect(
      craftableTimes(
        data,
        townState({ stacks: { [FIRE]: 2, [WATER]: 2 } }),
        defined(data.recipes.smithSame)
      )
    ).toBe(0)
    expectActionError(
      () =>
        act(townState({ stacks: { [FIRE]: 2, [WATER]: 2 } }), {
          type: 'craft',
          recipeId: 'smithSame',
          times: 1
        }),
      'notEnoughGroupItem',
      { groupId: GROUP, have: 2, need: 3 }
    )
    // Luyện nhiều lần: cả 6 viên từ một loại.
    const twice = act(townState({ stacks: { [FIRE]: 6, [WATER]: 5 } }), {
      type: 'craft',
      recipeId: 'smithSame',
      times: 2
    })
    expect(getItemCount(twice.inventory, FIRE)).toBe(0)
    expect(getItemCount(twice.inventory, WATER)).toBe(5)
  })
})

describe('dữ liệu và save', () => {
  it('kiểm tra dữ liệu: nhóm lạ, station lạ, công thức luyện khí có scroll, config luyện khí sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.recipes.push({
          id: 'bad',
          // Ép kiểu: dữ liệu sai cố ý.
          station: 'kitchen' as 'smithing',
          output: { itemId: 'potion', count: 1 },
          inputs: [{ groupId: 'ghost', count: 0 }],
          money: 0,
          minLevel: 1,
          successChance: 50,
          exp: 1
        })
        raw.recipes.push({
          id: 'badScroll',
          station: 'smithing',
          output: { itemId: 'potion', count: 1 },
          inputs: [{ itemId: 'potion', count: 1 }],
          money: 0,
          minLevel: 1,
          successChance: 50,
          exp: 1,
          scroll: true
        })
        raw.config.forge = {
          ...raw.config.forge,
          expBase: 0,
          coreEnhance: { groupId: 'ghost', fromLevel: 0, step: 0 },
          // Ép kiểu: bậc unique trong bảng bậc thường là dữ liệu sai cố ý.
          cast: {
            ...raw.config.forge.cast,
            maxCores: 0,
            rarityWeights: { unique: 1 } as Record<string, number>
          }
        }
      },
      { regenerateText: true }
    ).join('\n')
    for (const fragment of [
      'station lạ "kitchen"',
      'nhóm vật phẩm không tồn tại "ghost"',
      'inputs[0].count',
      'chưa hỗ trợ scroll',
      'config.forge.expBase',
      'config.forge.coreEnhance.fromLevel',
      'config.forge.coreEnhance.step',
      'config.forge.cast.maxCores',
      'config.forge.cast.rarityWeights'
    ]) {
      expect(issues, fragment).toContain(fragment)
    }
  })

  it('save: cấp luyện khí lệch exp, lastCraft là công thức luyện đan', () => {
    const issues = validateGameState(data, {
      ...townState(),
      smithing: {
        level: 4,
        exp: toBig(0),
        lastCraft: { recipeId: 'ghost', successes: 1, failures: 0 }
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('smithing.level'),
        expect.stringContaining('smithing.lastCraft')
      ])
    )
  })

  it('migrate v59 → v60: luyện khí cấp 1; state hợp lệ', () => {
    const raw = serializeState(townState()) as Record<string, unknown>
    const { smithing: _smithing, ...old } = raw
    const migrated = migrateState({ ...old, version: 59 }, data)
    expect(migrated.smithing).toEqual({ level: 1, exp: toBig(0), lastCraft: null })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
