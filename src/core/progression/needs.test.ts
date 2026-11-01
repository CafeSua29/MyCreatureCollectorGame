// Đói và tinh thần (docs/rules/dwelling.md mục "Đói và tinh thần"): tiêu hao mỗi ngày làm việc,
// tự ăn từ hộp thức ăn, đói lả / tinh thần thấp giảm sức, bỏ việc ở tinh thần 0, trait đói / tinh
// thần / cú đêm, Ôn tuyền, quái không làm việc hồi dần, hộp thức ăn, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { workConditionPercent, workerPower } from '../registries'
import {
  HOURS_PER_DAY,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData
} from '../model'
import { toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import { newDwellingState } from './dwelling'
import { advanceTime } from './time'

function makeNeedsData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.workTraits.push(
    { id: 'glutton', weight: 1, effects: [{ type: 'hungerRate', percent: 10 }] },
    { id: 'workaholic', weight: 1, effects: [{ type: 'sanityRate', percent: -50 }] },
    { id: 'nocturnal', weight: 1, effects: [{ type: 'nocturnal' }] }
  )
  raw.buildings.push(
    {
      id: 'forge',
      workType: 'kindling',
      startLevel: 0,
      slotsPerLevel: 2,
      cost: { money: 100, moneyGrowth: 2, items: [] },
      effect: { type: 'produce', drops: [{ itemId: 'potion', perDay: 0.5 }] }
    },
    {
      id: 'spa',
      workType: 'watering',
      startLevel: 0,
      slotsPerLevel: 0,
      cost: { money: 100, moneyGrowth: 2, items: [] },
      effect: { type: 'rest', sanityPerLevel: 10 }
    }
  )
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeNeedsData()

/** Quái lửa level 16 (sức 8 ở Lò). */
const worker = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, level: 16, elementIds: ['fire'], ...overrides })

function townState(storage: Monster[], stacks: Record<string, number> = {}): GameState {
  return {
    ...makeGameState({ seed: 3, party: [makeMonster({ id: 'p', fullness: 10, sanity: 10 })] }),
    storage,
    money: toBig(100000),
    inventory: makeInventory(stacks),
    dwelling: newDwellingState(data)
  }
}

const act = (state: GameState, action: Parameters<typeof gameReducer>[2]): GameState =>
  gameReducer(data, state, action)
const working = (storage: Monster[], stacks: Record<string, number> = {}): GameState => {
  const built = act(townState(storage, stacks), { type: 'upgradeBuilding', buildingId: 'forge' })
  return act(built, { type: 'assignWorker', buildingId: 'forge', monsterId: storage[0].id })
}
const days = (state: GameState, count: number): GameState =>
  advanceTime(data, state, count * HOURS_PER_DAY)
const storageOf = (state: GameState, id: string): Monster =>
  defined(state.storage.find((m) => m.id === id))

describe('tiêu hao và ăn', () => {
  it('mỗi ngày làm việc −30 no, −10 tinh thần; quái không làm việc (đội, kho) hồi 50', () => {
    const state = working([worker('a'), worker('b', { fullness: 0, sanity: 20 })])
    const next = days(state, 1)
    expect(storageOf(next, 'a')).toMatchObject({ fullness: 70, sanity: 90 })
    expect(storageOf(next, 'b')).toMatchObject({ fullness: 50, sanity: 70 })
    expect(next.party[0]).toMatchObject({ fullness: 60, sanity: 60 })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('no dưới 70 thì ăn từ hộp (mỗi lần một món) tới đủ 70 hoặc hết món', () => {
    const stocked = act(working([worker('a')], { potion: 3 }), {
      type: 'stockFeedBox',
      itemId: 'potion',
      count: 3
    })
    expect(stocked.dwelling.feedBox).toEqual({ potion: 3 })
    // Ngày 1: 70 (không ăn); ngày 2: 40 → ăn 1 món → 80.
    const day2 = days(stocked, 2)
    expect(storageOf(day2, 'a').fullness).toBe(80)
    expect(day2.dwelling.feedBox).toEqual({ potion: 2 })
    expect(validateGameState(data, day2)).toEqual([])
  })

  it('hết thức ăn: đói lả (no 0) thì − thêm 20 tinh thần, sức × 50%; tinh thần 0 bỏ việc', () => {
    const hungry = worker('a', { fullness: 0, sanity: 100 })
    expect(workConditionPercent(data, hungry)).toBe(50)
    expect(workerPower(data, hungry, 'kindling')).toBe(4)
    expect(workConditionPercent(data, worker('a', { sanity: 20 }))).toBe(70)
    expect(workConditionPercent(data, worker('a', { sanity: 0 }))).toBe(0)
    const state = working([worker('a', { fullness: 10, sanity: 35 })])
    const next = days(state, 1)
    // 35 − 10 − 20 (đói lả) = 5.
    expect(storageOf(next, 'a')).toMatchObject({ fullness: 0, sanity: 5 })
    const broken = days(next, 1)
    expect(storageOf(broken, 'a').sanity).toBe(0)
    // Tinh thần 0 đầu ngày: không làm ra gì.
    const idleDay = days(
      { ...broken, dwelling: { ...broken.dwelling, storage: { stacks: {}, books: [] } } },
      1
    )
    expect(idleDay.dwelling.storage.stacks).toEqual({})
  })
})

describe('trait và công trình', () => {
  it('Phàm ăn +10% đói, Cuồng công việc −50% mệt, cú đêm + 50% sức và + 50% đói / mệt', () => {
    const state = working([worker('a', { workTraits: ['glutton', 'workaholic'] })])
    expect(storageOf(days(state, 1), 'a')).toMatchObject({ fullness: 67, sanity: 95 })
    const owl = worker('n', { workTraits: ['nocturnal'] })
    expect(workerPower(data, owl, 'kindling')).toBe(12)
    expect(storageOf(days(working([owl]), 1), 'n')).toMatchObject({ fullness: 55, sanity: 85 })
  })

  it('Ôn tuyền (rest): quái làm việc + cấp × 10 tinh thần mỗi ngày (bù đúng phần mệt ở cấp 1)', () => {
    const state = act(working([worker('a', { sanity: 50 })]), {
      type: 'upgradeBuilding',
      buildingId: 'spa'
    })
    expect(storageOf(days(state, 1), 'a').sanity).toBe(50)
  })
})

describe('hộp thức ăn', () => {
  it('bỏ vào / lấy ra; lỗi: không phải món ăn, số lượng sai, không đủ, ngoài thị trấn', () => {
    const state = townState([], { potion: 2, herb: 1 })
    const stocked = act(state, { type: 'stockFeedBox', itemId: 'potion', count: 2 })
    expect(stocked.inventory.stacks.potion).toBeUndefined()
    const taken = act(stocked, { type: 'takeFeedBox', itemId: 'potion', count: 1 })
    expect(taken.dwelling.feedBox).toEqual({ potion: 1 })
    expect(taken.inventory.stacks.potion).toBe(1)
    expectActionError(
      () => act(state, { type: 'stockFeedBox', itemId: 'herb', count: 1 }),
      'notFood',
      { itemId: 'herb' }
    )
    expectActionError(
      () => act(state, { type: 'stockFeedBox', itemId: 'potion', count: 0 }),
      'malformedAction'
    )
    expectActionError(
      () => act(state, { type: 'stockFeedBox', itemId: 'potion', count: 5 }),
      'notEnoughItem'
    )
    expectActionError(
      () => act(taken, { type: 'takeFeedBox', itemId: 'potion', count: 2 }),
      'notEnoughItem'
    )
    expectActionError(
      () => act(atFloor(state, 1), { type: 'stockFeedBox', itemId: 'potion', count: 1 }),
      'notInTown'
    )
  })
})

describe('kiểm tra dữ liệu / save, migrate', () => {
  it('dữ liệu sai: needs, món ăn lạ / không gộp chồng, hiệu ứng nghỉ ngơi, trait đói', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.config.dwelling = {
          ...raw.config.dwelling,
          needs: { ...raw.config.dwelling.needs, max: 0, eatBelow: 200 },
          foods: { ghost: { fullness: 1, sanity: 0 }, potion: { fullness: -1, sanity: 0 } }
        }
        raw.workTraits.push({
          id: 'bad',
          weight: 1,
          effects: [{ type: 'hungerRate', percent: 'x' as unknown as number }]
        })
      },
      { regenerateText: true }
    )
    const text = issues.join(' | ')
    for (const fragment of [
      'config.dwelling.needs.max',
      'needs.eatBelow phải ≤ max',
      'foods.ghost: vật phẩm không tồn tại',
      'foods.potion.fullness',
      'Trait làm việc "bad": effects[0].percent'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save sai: no / tinh thần ngoài [0, max], hộp có thứ không phải món ăn', () => {
    const state = townState([worker('a', { fullness: 150, sanity: -1 })])
    const bad = { ...state, dwelling: { ...state.dwelling, feedBox: { herb: 1, potion: 0 } } }
    const text = validateGameState(data, bad).join(' | ')
    for (const fragment of [
      'fullness',
      'sanity',
      '"herb" không phải món ăn',
      'dwelling.feedBox.potion'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('migrate v90 → v91: mọi quái no / tinh thần đầy, hộp thức ăn trống', () => {
    const state = townState([worker('a', { fullness: 5 })])
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (m: Record<string, unknown>): Record<string, unknown> => {
      const { fullness: _f, sanity: _s, ...rest } = m
      return rest
    }
    const { feedBox: _box, ...dwelling } = raw.dwelling as Record<string, unknown>
    const migrated = migrateState(
      {
        ...raw,
        version: 90,
        storage: (raw.storage as Record<string, unknown>[]).map(strip),
        party: (raw.party as Record<string, unknown>[]).map(strip),
        dwelling
      },
      data
    )
    expect(migrated.storage[0]).toMatchObject({ fullness: 100, sanity: 100 })
    expect(migrated.dwelling.feedBox).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
