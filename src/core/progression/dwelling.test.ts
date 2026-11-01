// Động phủ (docs/rules/dwelling.md): xây / nâng cấp, giao việc (chỉ kho, khóa quái), sức làm việc
// theo thiên phú / level / cấp / Linh mạch, sản xuất vào kho động phủ, lấy về túi, Linh tuyền, Thú
// lan, Tàng thư các, cộng % luyện, thân mật quái làm việc, quái rời kho, kiểm tra dữ liệu / save,
// migrate; linh điền (công trình garden).

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import {
  HOURS_PER_DAY,
  type Egg,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData
} from '../model'
import { toBig } from '../shared'
import {
  FIXTURE_GARDEN_BUILDING_ID,
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
import {
  buildingPowers,
  buildingUpgradeCost,
  cropGrowthPercent,
  dwellingCraftBonus,
  newDwellingState,
  workerPower
} from './dwelling'
import { cropDaysLeft } from './garden'
import { advanceTime } from './time'

const FIELD = FIXTURE_GARDEN_BUILDING_ID

function makeDwellingData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.items.push(
    { id: 'ore', category: 'material', price: 1 },
    { id: 'herb', category: 'material', price: 10 },
    {
      id: 'seedHerb',
      category: 'seed',
      price: 20,
      growDays: 4,
      harvest: [{ itemId: 'herb', min: 1, max: 3 }]
    }
  )
  const building = (
    id: string,
    workType: RawGameData['buildings'][number]['workType'],
    effect: RawGameData['buildings'][number]['effect']
  ): RawGameData['buildings'][number] => ({
    id,
    workType,
    startLevel: 0,
    slotsPerLevel: 2,
    cost: { money: 100, moneyGrowth: 2, items: [{ itemId: 'ore', count: 1 }] },
    effect
  })
  raw.buildings.push(
    building('forge', 'kindling', { type: 'produce', drops: [{ itemId: 'ore', perDay: 0.5 }] }),
    building('spring', 'watering', { type: 'cropGrowth', percentPerPower: 12.5 }),
    building('vein', 'generating', { type: 'outputBoost', percentPerPower: 12.5 }),
    building('pen', 'caring', { type: 'nurture', affinityPerPower: 1, eggStepsPerPower: 0.5 }),
    building('lab', 'kindling', {
      type: 'craftBonus',
      percentPerPower: 1,
      stations: ['alchemy']
    }),
    building('library', 'research', { type: 'research', booksPerPower: 1, reusableChance: 0 }),
    { ...building('hut', 'mining', { type: 'cropGrowth', percentPerPower: 1 }), maxLevel: 1 }
  )
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeDwellingData()

/** Quái level 16: level ^ 0,5 = 4. Fixture: lửa luyện bậc 2, nước tưới bậc 2, bay vận chuyển bậc 2. */
const worker = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, level: 16, ...overrides })

function townState(
  storage: Monster[] = [],
  { money = 100000, stacks = { ore: 50 } }: { money?: number; stacks?: Record<string, number> } = {}
): GameState {
  const base = makeGameState({ seed: 3, party: [makeMonster({ id: 'p' })] })
  return {
    ...base,
    storage,
    money: toBig(money),
    inventory: makeInventory(stacks),
    dwelling: newDwellingState(data)
  }
}

const act = (state: GameState, action: Parameters<typeof gameReducer>[2]): GameState =>
  gameReducer(data, state, action)
const build = (state: GameState, buildingId: string, times = 1): GameState =>
  Array.from({ length: times }).reduce<GameState>(
    (current) => act(current, { type: 'upgradeBuilding', buildingId }),
    state
  )
const assign = (state: GameState, buildingId: string, monsterId: string): GameState =>
  act(state, { type: 'assignWorker', buildingId, monsterId })
const days = (state: GameState, count: number, gameData = data): GameState =>
  advanceTime(gameData, state, count * HOURS_PER_DAY)
const storageOf = (state: GameState, id: string): Monster =>
  defined(state.storage.find((m) => m.id === id))

describe('công trình', () => {
  it('game mới: công trình có startLevel (Linh điền cấp 2, 2 ô trống), kho rỗng', () => {
    expect(newDwellingState(data)).toEqual({
      buildings: { [FIELD]: { level: 2, workers: [] } },
      plots: [null, null],
      storage: { stacks: {}, books: [] },
      feedBox: {}
    })
  })

  it('xây rồi nâng cấp: tiền × moneyGrowth ^ n, nguyên liệu × số bậc; trần maxLevel', () => {
    const state = townState()
    // Bậc đầu chỉ tốn tiền.
    expect(buildingUpgradeCost(data, state, 'forge')).toEqual({ money: toBig(100), items: [] })
    const built = build(state, 'forge')
    expect(built.dwelling.buildings.forge).toEqual({ level: 1, workers: [] })
    expect(state.money.minus(built.money).toString()).toBe('100')
    expect(getItemCount(built.inventory, 'ore')).toBe(50)
    const cost = buildingUpgradeCost(data, built, 'forge')
    expect(cost.money.toString()).toBe('200')
    expect(cost.items).toEqual([{ itemId: 'ore', count: 1 }])
    const level2 = build(built, 'forge')
    expect(level2.dwelling.buildings.forge.level).toBe(2)
    expect(getItemCount(level2.inventory, 'ore')).toBe(49)
    expect(buildingUpgradeCost(data, level2, 'forge').items).toEqual([{ itemId: 'ore', count: 2 }])
    const hut = build(state, 'hut')
    expectActionError(() => build(hut, 'hut'), 'buildingMaxLevel', {
      buildingId: 'hut',
      maxLevel: 1
    })
    expect(validateGameState(data, built)).toEqual([])
  })

  it('Linh điền: mỗi cấp thêm một ô trống, giá 5000 × 2^(cấp − startLevel − 1)', () => {
    const state = townState([], { money: 20000 })
    expect(buildingUpgradeCost(data, state, FIELD).money.toString()).toBe('5000')
    const once = build(state, FIELD)
    expect(once.dwelling.plots).toEqual([null, null, null])
    expect(buildingUpgradeCost(data, once, FIELD).money.toString()).toBe('10000')
    const twice = build(once, FIELD)
    expectActionError(() => build(twice, FIELD), 'notEnoughMoney')
  })

  it('lỗi: công trình lạ, thiếu tiền / nguyên liệu, ngoài thị trấn, trong trận (state giữ nguyên)', () => {
    expectActionError(() => build(townState(), 'nope'), 'unknownBuilding', { buildingId: 'nope' })
    expectActionError(() => build(townState([], { money: 99 }), 'forge'), 'notEnoughMoney')
    expectActionError(
      () => build(build(townState([], { stacks: {} }), 'forge'), 'forge'),
      'notEnoughItem'
    )
    expectActionError(() => build(atFloor(townState(), 1), 'forge'), 'notInTown')
  })
})

describe('giao việc', () => {
  it('quái trong kho nhận việc, bị khóa; nghỉ việc thì rảnh', () => {
    const state = assign(build(townState([worker('a')]), 'forge'), 'forge', 'a')
    expect(storageOf(state, 'a').assignment).toEqual({ kind: 'dwelling', id: 'forge' })
    expect(state.dwelling.buildings.forge.workers).toEqual(['a'])
    expect(validateGameState(data, state)).toEqual([])
    expectActionError(() => act(state, { type: 'moveToParty', monsterId: 'a' }), 'monsterBusy')
    expectActionError(() => assign(state, 'forge', 'a'), 'monsterBusy')
    const freed = act(state, { type: 'unassignWorker', monsterId: 'a' })
    expect(storageOf(freed, 'a').assignment).toBeNull()
    expect(freed.dwelling.buildings.forge.workers).toEqual([])
    expect(validateGameState(data, freed)).toEqual([])
  })

  it('lỗi: chưa xây, đủ ô, quái trong đội / đang thám hiểm / gục, nghỉ việc quái không làm', () => {
    const storage = [
      worker('a'),
      worker('b'),
      worker('c'),
      worker('x', { assignment: { kind: 'expedition', id: 'x1' } }),
      worker('f', { damageTaken: toBig('1e9') })
    ]
    const state = build(townState(storage), 'forge')
    expectActionError(() => assign(state, 'spring', 'a'), 'buildingNotBuilt', {
      buildingId: 'spring'
    })
    expectActionError(() => assign(state, 'nope', 'a'), 'unknownBuilding')
    const full = assign(assign(state, 'forge', 'a'), 'forge', 'b')
    expectActionError(() => assign(full, 'forge', 'c'), 'buildingSlotsFull', {
      buildingId: 'forge',
      slots: 2
    })
    expectActionError(() => assign(state, 'forge', 'p'), 'monsterNotInStorage')
    expectActionError(() => assign(state, 'forge', 'x'), 'monsterBusy')
    expectActionError(() => assign(state, 'forge', 'f'), 'monsterFainted')
    expectActionError(
      () => act(state, { type: 'unassignWorker', monsterId: 'x' }),
      'monsterNotWorking'
    )
    expectActionError(() => assign(atFloor(state, 1), 'forge', 'a'), 'notInTown')
  })
})

describe('sức làm việc', () => {
  it('chỉ số / powerStatUnit × level^0,5; vận chuyển × 0,5; sai việc 12,5%; loài ghi `workStats`', () => {
    expect(workerPower(data, worker('a', { elementIds: ['fire'] }), 'kindling')).toBe(8)
    expect(workerPower(data, worker('a', { elementIds: ['flying'] }), 'kindling')).toBe(4)
    expect(workerPower(data, worker('a', { elementIds: ['grass'] }), 'kindling')).toBe(1)
    const special = makeDwellingData((raw) => {
      const species = defined(raw.species.find((s) => s.id === 'weakling'))
      if (species.kind === 'normal') species.workStats = { kindling: 45 }
    })
    expect(workerPower(special, worker('a', { elementIds: ['grass'] }), 'kindling')).toBe(12)
    expect(workerPower(special, worker('a', { elementIds: ['grass'] }), 'mining')).toBe(1)
    // Level cực lớn: không ra Infinity / NaN.
    expect(Number.isFinite(workerPower(data, worker('a', { level: 1e300 }), 'kindling'))).toBe(true)
  })

  it('sức công trình = cấp × Σ sức quái; Linh mạch cộng % cho công trình khác', () => {
    let state = build(
      townState([worker('a', { elementIds: ['fire'] }), worker('v', { elementIds: ['flying'] })]),
      'forge',
      2
    )
    state = assign(state, 'forge', 'a')
    expect(buildingPowers(data, state).forge).toBe(16)
    state = assign(build(state, 'vein'), 'vein', 'v')
    // Linh mạch: bay sai việc nhưng vận chuyển 2 × 0,5 → sức 4 → +50%.
    expect(buildingPowers(data, state)).toMatchObject({ forge: 24, vein: 4 })
  })
})

describe('việc theo ngày', () => {
  const forgeWith = (storage: Monster[]): GameState =>
    assign(build(townState(storage), 'forge'), 'forge', storage[0].id)

  it('sản xuất vào kho động phủ theo sức; lấy hết về túi', () => {
    const state = forgeWith([worker('a', { elementIds: ['fire'] })])
    // Sức 8 × 0,5 / ngày = 4 quặng mỗi ngày (số nguyên, không tốn RNG).
    const later = days(state, 2)
    expect(later.dwelling.storage.stacks).toEqual({ ore: 8 })
    expect(validateGameState(data, later)).toEqual([])
    const collected = act(later, { type: 'collectDwelling' })
    expect(getItemCount(collected.inventory, 'ore')).toBe(getItemCount(later.inventory, 'ore') + 8)
    expect(collected.dwelling.storage).toEqual({ stacks: {}, books: [] })
    expect(act(collected, { type: 'collectDwelling' })).toBe(collected)
    expectActionError(() => act(atFloor(later, 1), { type: 'collectDwelling' }), 'notInTown')
  })

  it('quái làm việc + 1 thân mật mỗi 3 ngày; quái rảnh không', () => {
    const state = forgeWith([worker('a', { elementIds: ['fire'] }), worker('b')])
    expect(storageOf(days(state, 2), 'a').affinity).toBe(0)
    const day3 = days(state, 3)
    expect(storageOf(day3, 'a').affinity).toBe(1)
    expect(storageOf(day3, 'b').affinity).toBe(0)
  })

  it('quái rời kho (tọa hóa) bị bỏ khỏi công trình', () => {
    const state = forgeWith([worker('a', { elementIds: ['fire'] })])
    const gone = { ...state, storage: [] }
    expect(validateGameState(data, gone)).toEqual([])
    const next = days(gone, 1)
    expect(next.dwelling.buildings.forge.workers).toEqual([])
    expect(next.dwelling.storage.stacks).toEqual({})
  })

  it('Thú lan: quái trong kho + thân mật, trứng bớt số trận còn lại (không dưới 0)', () => {
    const egg = (id: string, battlesLeft: number): Egg => ({
      id,
      monster: makeMonster({ id }),
      battlesLeft,
      infusions: []
    })
    // Level 64: sai việc 0,25 × 8 = sức 2 → thân mật 2, trứng 1 bước mỗi ngày.
    let state = assign(
      build(townState([worker('c', { level: 64 }), worker('b')]), 'pen'),
      'pen',
      'c'
    )
    state = { ...state, eggs: [egg('e1', 5), egg('e2', 0)], nextMonsterId: 10 }
    const next = days(state, 1)
    expect(storageOf(next, 'b').affinity).toBe(2)
    expect(next.eggs.map((e) => e.battlesLeft)).toEqual([4, 0])
    expect(validateGameState(data, next)).toEqual([])
  })

  it('Linh tuyền: ô linh điền lớn thêm % theo sức (sức 8 × 12,5% = gấp đôi)', () => {
    let state = build(
      townState([worker('w', { elementIds: ['water'] })], { stacks: { ore: 5, seedHerb: 1 } }),
      'spring'
    )
    state = assign(state, 'spring', 'w')
    expect(cropGrowthPercent(data, state)).toBe(100)
    state = act(state, { type: 'plantSeed', plotIndex: 0, itemId: 'seedHerb' })
    expect(cropDaysLeft(data, state, 0)).toBe(4)
    const day1 = days(state, 1)
    expect(cropDaysLeft(data, day1, 0)).toBe(2)
    const day2 = days(day1, 1)
    expect(day2.dayEvents).toContainEqual({
      type: 'cropRipe',
      plotIndex: 0,
      seedItemId: 'seedHerb'
    })
    expect(day2.dwelling.plots[0]).toEqual({ seedItemId: 'seedHerb', growth: 4 })
    expect(validateGameState(data, days(day2, 3))).toEqual([])
  })

  it('Luyện khí phòng: + điểm % thành công chỉ ở nơi luyện được ghi', () => {
    const state = assign(
      build(townState([worker('a', { elementIds: ['fire'] })]), 'lab'),
      'lab',
      'a'
    )
    expect(dwellingCraftBonus(data, state, 'alchemy')).toBe(8)
    expect(dwellingCraftBonus(data, state, 'cooking')).toBe(0)
  })

  it('Tàng thư các: sách kỹ năng theo learnset loài của map tầng cao nhất vào kho động phủ', () => {
    const state = assign(build(townState([worker('r')]), 'library'), 'library', 'r')
    const next = days(state, 1)
    const total = next.dwelling.storage.books.reduce((sum, book) => sum + book.count, 0)
    // Sức 1 × 1 sách / ngày (fixture có skill có sách trong learnset của map).
    expect(total).toBe(1)
    const collected = act(next, { type: 'collectDwelling' })
    expect(collected.inventory.books).toEqual(next.dwelling.storage.books)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('số cực lớn: sản lượng kẹp số nguyên an toàn, save hợp lệ', () => {
    const built = forgeWith([worker('a', { elementIds: ['fire'], level: Number.MAX_SAFE_INTEGER })])
    const state = {
      ...built,
      dwelling: {
        ...built.dwelling,
        storage: { stacks: { ore: Number.MAX_SAFE_INTEGER - 1 }, books: [] }
      }
    }
    const next = days(state, 2)
    expect(next.dwelling.storage.stacks.ore).toBe(Number.MAX_SAFE_INTEGER)
    expect(validateGameState(data, next)).toEqual([])
  })
})

describe('linh điền', () => {
  const plant = (state: GameState, plotIndex = 0): GameState =>
    act(state, { type: 'plantSeed', plotIndex, itemId: 'seedHerb' })
  const reap = (state: GameState, plotIndex = 0): GameState =>
    act(state, { type: 'harvest', plotIndex })

  it('trồng → đủ ngày (báo chín đúng ngày) → thu hoạch số lượng trong khoảng; ô trống lại', () => {
    const planted = plant(townState([], { stacks: { seedHerb: 1 } }))
    expect(planted.dwelling.plots[0]).toEqual({ seedItemId: 'seedHerb', growth: 0 })
    expectActionError(() => reap(planted), 'cropNotReady', { plotIndex: 0, daysLeft: 4 })
    const ripe = days(planted, 5)
    expect(ripe.dayEvents.filter((e) => e.type === 'cropRipe')).toEqual([
      { type: 'cropRipe', plotIndex: 0, seedItemId: 'seedHerb' }
    ])
    const reaped = reap(ripe)
    const herbs = getItemCount(reaped.inventory, 'herb')
    expect(herbs).toBeGreaterThanOrEqual(1)
    expect(herbs).toBeLessThanOrEqual(3)
    expect(reaped.dwelling.plots[0]).toBeNull()
    expect(validateGameState(data, reaped)).toEqual([])
  })

  it('lỗi: ô đang trồng / trống, không phải hạt giống, ô lạ, ngoài thị trấn', () => {
    const planted = plant(townState([], { stacks: { seedHerb: 2, herb: 1 } }))
    expectActionError(() => plant(planted), 'plotOccupied', { plotIndex: 0 })
    expectActionError(() => reap(planted, 1), 'plotEmpty', { plotIndex: 1 })
    expectActionError(
      () => act(planted, { type: 'plantSeed', plotIndex: 1, itemId: 'herb' }),
      'notSeed'
    )
    expectActionError(() => plant(planted, 9), 'malformedAction')
    expectActionError(() => plant(atFloor(planted, 1), 1), 'notInTown')
  })
})

describe('kiểm tra dữ liệu / save, migrate', () => {
  it('dữ liệu sai: loại hiệu ứng, đồ không gộp chồng, thiếu ô quái, giá, config, `work` của loài', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.items.push({ id: 'ore', category: 'material', price: 1 })
        raw.buildings.push(
          {
            id: 'badType',
            workType: 'mining',
            startLevel: 0,
            slotsPerLevel: 1,
            cost: { money: 1, moneyGrowth: 0.5, items: [{ itemId: 'ghost', count: 0 }] },
            effect: { type: 'teleport' } as unknown as RawGameData['buildings'][number]['effect']
          },
          {
            id: 'badDrop',
            workType: 'digging' as 'mining',
            startLevel: 0,
            slotsPerLevel: 0,
            cost: { money: 1, moneyGrowth: 1, items: [] },
            effect: { type: 'produce', drops: [{ itemId: 'skillBook', perDay: -1 }] }
          }
        )
        raw.config.dwelling = {
          ...raw.config.dwelling,
          workStatPercents: {
            elements: { lava: { mining: 100 } },
            races: { neutral: { mining: 1.5 } }
          },
          workerAffinityDays: 0
        }
        const species = defined(raw.species.find((s) => s.id === 'weakling'))
        if (species.kind === 'normal')
          species.workStats = { flying: 100 } as unknown as typeof species.workStats
      },
      { regenerateText: true }
    )
    const text = issues.join('\n')
    for (const fragment of [
      'Công trình "badType": effect.type',
      'cost.moneyGrowth',
      'cost.items[0].itemId',
      'cost.items[0].count',
      'Công trình "badDrop": workType',
      'drops[0].perDay',
      'cần quái làm việc',
      'workStatPercents.elements.lava: không tồn tại',
      'workStatPercents.races.neutral.mining',
      'workerAffinityDays',
      'Loài "weakling".workStats: loại việc "flying"'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save sai: công trình lạ / quá cấp, quái làm việc lệch việc, số ô, ô lớn quá, kho', () => {
    const state = assign(build(townState([worker('a'), worker('b')]), 'forge'), 'forge', 'a')
    const bad = {
      ...state,
      storage: [
        storageOf(state, 'a'),
        { ...storageOf(state, 'b'), assignment: { kind: 'dwelling' as const, id: 'forge' } }
      ],
      dwelling: {
        buildings: {
          ...state.dwelling.buildings,
          ghost: { level: 1, workers: [] },
          hut: { level: 2, workers: [] },
          spring: { level: 1, workers: ['a'] }
        },
        plots: [{ seedItemId: 'seedHerb', growth: 9 }],
        storage: { stacks: { nope: 1 }, books: [] }
      }
    }
    const text = validateGameState(data, bad).join('\n')
    for (const fragment of [
      'dwelling.buildings.ghost: công trình không tồn tại',
      'dwelling.buildings.hut.level tối đa 1',
      'một quái làm việc ở nhiều công trình',
      'quái "b" mang việc động phủ "forge"',
      'dwelling.plots[0].growth',
      'dwelling.storage.stacks: vật phẩm không tồn tại "nope"'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
    const plots = validateGameState(data, { ...state, dwelling: { ...state.dwelling, plots: [] } })
    expect(plots.join('\n')).toContain('dwelling.plots phải có 2 ô')
  })

  it('migrate v87 → v88: linh điền thành công trình đủ cấp, ô đang trồng giữ (số ngày đã lớn)', () => {
    const state = { ...townState(), time: 3 * HOURS_PER_DAY }
    const raw = serializeState(state) as Record<string, unknown>
    const { dwelling: _dwelling, ...old } = raw
    const migrated = migrateState(
      {
        ...old,
        version: 87,
        garden: { plots: [null, { seedItemId: 'seedHerb', plantedDay: 1 }, null] }
      },
      data
    )
    expect(migrated.dwelling).toEqual({
      buildings: { [FIELD]: { level: 3, workers: [] } },
      plots: [null, { seedItemId: 'seedHerb', growth: 2 }, null],
      storage: { stacks: {}, books: [] },
      feedBox: {}
    })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
