import { describe, expect, it } from 'vitest'
import { DataError, Decimal, hashToUnit } from '../shared'
import { deserializeState, migrateState } from './migrate'
import { mapBigFieldsInPlace } from './bigFields'
import { SAVE_VERSION, gameReducer } from './reducer'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'
import {
  LEGACY_BIOME_IDS,
  defined,
  fixtureFloorBiomeIds,
  makeBattleState,
  makeGameState,
  makeLegacyData,
  makeMonster,
  uniformStats,
  type GameStateOptions
} from '../testing'
import { ageDaysAtPercent, isDexSpecies } from '../registries'
import type { GameState, Monster } from '../model'
import { defaultGameOptions } from '../progression'

/** Dữ liệu game cho migrate (bước v24 cần thọ nguyên theo loài). */
const migrateData = makeLegacyData()

/** Lý lịch của quái người chơi sau bước v24 → v25. */
const UNKNOWN_HISTORY: Monster['history'] = {
  origin: { kind: 'unknown' },
  metDay: null,
  metFloor: null,
  metLevel: null,
  milestones: []
}

/** Tính cách sau bước v35 → v36: theo băm của id quái (như addNatures). */
const hashedNatureId = (monsterId: string): string => {
  const natureIds = Object.keys(migrateData.natures)
  return natureIds[Math.floor(hashToUnit('nature', monsterId) * natureIds.length)]
}

/**
 * Quái người chơi sau bước v23 → v24 (già đi, tuổi 20% thọ nguyên), v24 → v25 (lý lịch
 * "unknown"), v27 → v28 (thân mật 70) và v35 → v36 (tính cách theo băm id).
 */
const lifeMigratedMonster = (monster: Monster): Monster => ({
  ...monster,
  aging: true,
  ageDays: ageDaysAtPercent(migrateData, monster, 20),
  history: UNKNOWN_HISTORY,
  affinity: 70,
  natureId: hashedNatureId(monster.id)
})

/**
 * State hiện tại như sau bước v23 → v24 (test dựng save cũ từ state hiện tại): đồng hồ về giờ bắt
 * đầu, bật thọ nguyên, quái 20% thọ nguyên, quái trong trứng tuổi 0.
 */
function lifeMigrated(state: GameState): GameState {
  const battle = state.battle && {
    ...state.battle,
    enemies: state.battle.enemies.map((m) => ({
      ...lifeMigratedMonster(m),
      history: null,
      affinity: 0
    })),
    captured: state.battle.captured.map(lifeMigratedMonster)
  }
  const dex = dexFromOwned([...state.party, ...state.storage])
  return {
    ...state,
    time: migrateData.config.clock.startHour,
    options: defaultGameOptions({ lifespanEnabled: true, permadeathEnabled: false }),
    log: [],
    party: state.party.map(lifeMigratedMonster),
    storage: state.storage.map(lifeMigratedMonster),
    eggs: state.eggs.map((egg) => ({
      ...egg,
      monster: {
        ...egg.monster,
        aging: true,
        ageDays: 0,
        history: UNKNOWN_HISTORY,
        affinity: 70,
        natureId: hashedNatureId(egg.monster.id)
      }
    })),
    battle,
    // v55 → v56: Dex điền từ loài hiện tại / loài gốc của đội và kho (docs/rules/dex.md).
    dex,
    // v86 → v87: loài đã sở hữu tính như đã bắt 1 lần (docs/rules/species-research.md).
    research: Object.fromEntries(
      dex.owned.map((id) => [id, { counters: { caught: 1 }, claimedLevel: 0 }])
    )
  }
}

/** Dex như bước v55 → v56 dựng từ danh sách quái sở hữu. */
function dexFromOwned(monsters: readonly Monster[]): GameState['dex'] {
  const owned: string[] = []
  const shinyOwned: string[] = []
  for (const monster of monsters) {
    for (const id of [monster.speciesId, monster.baseSpeciesId]) {
      if (!isDexSpecies(migrateData.species[id])) continue
      if (!owned.includes(id)) owned.push(id)
      if (monster.shinyStacks > 0 && !shinyOwned.includes(id)) shinyOwned.push(id)
    }
  }
  return {
    seen: [...owned],
    owned,
    shinyOwned,
    claimedMilestones: [],
    claimedRegions: [],
    hitParts: {}
  }
}

/** State mẫu có map của tầng như save cũ sau migrate. */
const withLegacyFloors = (state: GameState): GameState => ({
  ...state,
  floorBiomeIds: fixtureFloorBiomeIds(state.highestFloor, LEGACY_BIOME_IDS)
})

const legacyGameState = (options: GameStateOptions): GameState =>
  withLegacyFloors(makeGameState(options))

const legacyBattleState = (...args: Parameters<typeof makeBattleState>): GameState =>
  withLegacyFloors(makeBattleState(...args))

const v1Save = (battle: unknown = null): Record<string, unknown> => ({
  version: 1,
  rng: 42,
  money: 100,
  party: [makeMonster()],
  inventory: { potion: 2 },
  nextMonsterId: 5,
  battle
})

describe('migrateState', () => {
  it('v1 → v2: thêm kho rỗng, giữ nguyên phần còn lại', () => {
    const migrated = migrateState(v1Save(), migrateData)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.storage).toEqual([])
    expect(migrated.money).toEqual(100)
    expect(migrated.party).toEqual([lifeMigratedMonster(makeMonster())])
    expect(migrated.inventory).toEqual({
      stacks: { potion: 2 },
      crystals: [],
      books: [],
      equipment: [],
      souls: [],
      spirits: []
    })
  })

  it('v1 đang giữa trận: thêm danh sách quái đã bắt rỗng', () => {
    const migrated = migrateState(v1Save({ zoneId: 'meadow', enemies: [] }), migrateData)
    expect(migrated.battle?.captured).toEqual([])
  })

  it('v2 → v3: thêm biệt danh null cho mọi quái (đội, kho, quái hoang, quái đã bắt)', () => {
    // Quái ở save v2 chưa có trường nickname.
    const oldMonster: Record<string, unknown> = { ...makeMonster() }
    delete oldMonster.nickname
    const v2 = {
      version: 2,
      rng: 1,
      money: 0,
      party: [oldMonster],
      storage: [{ ...oldMonster, id: 's1' }],
      inventory: {},
      nextMonsterId: 9,
      battle: { zoneId: 'meadow', enemies: [{ ...oldMonster, id: 'e1' }], captured: [] }
    }
    const migrated = migrateState(v2, migrateData)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.party[0].nickname).toBeNull()
    expect(migrated.storage[0].nickname).toBeNull()
    expect(defined(migrated.battle).enemies[0].nickname).toBeNull()
  })

  it('v3 → v4: thêm vị trí và danh sách chờ cho mọi quái', () => {
    const v3 = {
      version: 3,
      rng: 1,
      money: 0,
      party: [{ ...makeMonster() }],
      storage: [],
      inventory: {},
      nextMonsterId: 9,
      battle: null
    }
    for (const monster of v3.party as Record<string, unknown>[]) {
      delete monster.pendingSkillIds
      delete monster.pendingEvolutionIds
    }
    const town = migrateState(v3, migrateData)
    expect(town.version).toBe(SAVE_VERSION)
    expect(town.location).toEqual({ type: 'town' })
    expect(town.party[0].pendingSkillIds).toEqual([])
    expect(town.party[0].pendingEvolutionIds).toEqual([])

    // Đang giữa trận thì vị trí là vùng của trận (v9: Núi lửa thành tầng 2).
    const inBattle = migrateState(
      {
        ...v3,
        battle: { zoneId: 'volcano', enemies: [], captured: [] }
      },
      migrateData
    )
    expect(inBattle.location).toEqual({ type: 'floor', floor: 2 })
  })

  it('v4 → v5: thêm danh sách trứng rỗng; trận đang diễn ra là trận thường', () => {
    const v4 = {
      ...legacyGameState({ seed: 1, party: [makeMonster()] }),
      version: 4,
      battle: { zoneId: 'meadow', enemies: [], captured: [] }
    } as Record<string, unknown>
    delete v4.eggs
    const migrated = migrateState(v4, migrateData)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.eggs).toEqual([])
    expect(defined(migrated.battle).isBoss).toBe(false)
  })

  it('save v1 đi qua mọi bước migrate tới version hiện tại', () => {
    const migrated = migrateState(v1Save(), migrateData)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.storage).toEqual([])
    expect(migrated.party[0].nickname).toBeNull()
  })

  it('save ở version hiện tại giữ nguyên', () => {
    const state = legacyGameState({ seed: 1, party: [makeMonster()] })
    expect(migrateState(state, migrateData)).toEqual(state)
  })

  it('không sửa dữ liệu đầu vào', () => {
    const raw = v1Save()
    migrateState(raw, migrateData)
    expect(raw.version).toEqual(1)
    expect('storage' in raw).toBe(false)
  })

  it('báo lỗi save không có version hoặc mới hơn game', () => {
    expect(() => migrateState({}, migrateData)).toThrow(DataError)
    expect(() => migrateState(null, migrateData)).toThrow(DataError)
    expect(() => migrateState({ version: SAVE_VERSION + 1 }, migrateData)).toThrow(/mới hơn game/)
  })
})

type RawSave = Record<string, unknown>

/** Bỏ trường statuses (thêm ở v11) khỏi mọi quái của save: đội, kho, trứng, quái trong trận. */
function withoutStatuses(raw: RawSave): RawSave {
  const strip = (monster: unknown): unknown => {
    const { statuses: _statuses, ...rest } = monster as RawSave
    return rest
  }
  const battle = raw.battle as RawSave | null
  return {
    ...raw,
    party: (raw.party as unknown[]).map(strip),
    storage: (raw.storage as unknown[]).map(strip),
    eggs: (raw.eggs as RawSave[]).map((egg) => ({ ...egg, monster: strip(egg.monster) })),
    battle: battle
      ? {
          ...battle,
          enemies: (battle.enemies as unknown[]).map(strip),
          captured: (battle.captured as unknown[]).map(strip)
        }
      : null
  }
}

/**
 * Đổi save hiện tại về dạng trước v9: vị trí kiểu vùng cũ (tầng 1 = meadow, tầng 2 = volcano),
 * chưa có highestFloor, quái chưa có statuses.
 */
function withLegacyZones(input: RawSave): RawSave {
  const raw = withoutStatuses(input)
  const zoneOf = (floor: unknown): string => (floor === 2 ? 'volcano' : 'meadow')
  const { highestFloor: _highestFloor, ...rest } = raw
  const location = raw.location as { type: string; floor?: number }
  const battle = raw.battle as Record<string, unknown> | null
  const { floor: battleFloor, ...battleRest } = battle ?? {}
  return {
    ...rest,
    location:
      location.type === 'floor' ? { type: 'zone', zoneId: zoneOf(location.floor) } : location,
    battle: battle ? { ...battleRest, zoneId: zoneOf(battleFloor) } : null
  }
}

describe('migrate v6 → v7: trường Decimal lưu bằng chuỗi', () => {
  const data = makeLegacyData()

  /** State sau một lượt đánh (log có damage) với một quả trứng, kho và tiền lẻ. */
  function sampleState(): GameState {
    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const afterTurn = gameReducer(data, battle, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
    })
    return {
      ...afterTurn,
      storage: [makeMonster({ id: 'm5', fusingBonusStats: { ...uniformStats(0), hp: 12.5 } })],
      eggs: [
        { id: 'm6', monster: makeMonster({ id: 'm6', exp: 1 }), battlesLeft: 3, infusions: [] }
      ],
      nextMonsterId: 200
    }
  }

  /** Giả lập file save v6: mọi trường Decimal là number, túi đồ là số lượng theo id (trước v8). */
  function asV6(state: GameState): unknown {
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    mapBigFieldsInPlace(raw, (value) => (typeof value === 'string' ? Number(value) : value))
    return { ...withLegacyZones(raw), version: 6, inventory: raw.inventory.stacks }
  }

  it('save v6 mở được: số cũ thành Decimal đúng giá trị, state hợp lệ', () => {
    const state = sampleState()
    const v6 = asV6(state)
    expect((v6 as { money: unknown }).money).toBe(0)
    const migrated = migrateState(v6, migrateData)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(validateGameState(data, migrated)).toEqual([])
    // Save trước v9 mở sẵn hai tầng; migrate v20 → v21 đặt lại bản ghi trận / bộ đếm của trận dở;
    // v31 → v32 đặt lại thuần thục skill (lượt đánh mẫu đã cộng exp cho skill vừa dùng).
    const battle = defined(state.battle)
    const noMastery = (monster: Monster): Monster => ({ ...monster, skillMastery: {} })
    // Trạng thái tạm thêm sau v6 (skillStreak, chiêu nhiều lượt) không có trong save cũ.
    const volatiles = Object.fromEntries(
      Object.entries(battle.volatiles).map(([id, { skillStreak: _skillStreak, ...rest }]) => [
        id,
        rest
      ])
    )
    const resetBattle = {
      ...battle,
      volatiles,
      enemies: battle.enemies.map(noMastery),
      records: {},
      counters: { casts: { player: 0, enemy: 0 }, lastCastSkillId: null, deaths: 0 }
    }
    const expected = { ...state, party: state.party.map(noMastery), battle: resetBattle }
    expect(migrated).toEqual(lifeMigrated(withLegacyFloors({ ...expected, highestFloor: 2 })))
    expect(Decimal.isDecimal(migrated.party[0].damageTaken)).toBe(true)
    expect(Decimal.isDecimal(migrated.eggs[0].monster.exp)).toBe(true)
    const damage = defined(migrated.battle).log.find((event) => event.type === 'damage')
    expect(damage?.type === 'damage' && Decimal.isDecimal(damage.amount)).toBe(true)
  })

  it('save v6 có số hỏng (null do JSON.stringify(Infinity)): không crash, kiểm tra báo lỗi', () => {
    const v6 = { ...(asV6(sampleState()) as Record<string, unknown>), money: null }
    expect(validateGameState(data, migrateState(v6, migrateData)).join()).toMatch(
      /^money phải là số hữu hạn/
    )
  })

  it('deserializeState: chuỗi số → Decimal, chuỗi không phải số giữ nguyên để báo lỗi', () => {
    const raw = { ...(serializeState(sampleState()) as Record<string, unknown>), money: 'abc' }
    const state = deserializeState(raw) as GameState
    expect(state.money).toBe('abc')
    expect(Decimal.isDecimal(state.party[0].exp)).toBe(true)
    expect(validateGameState(data, state).join()).toMatch(/money phải là số hữu hạn/)
  })
})

describe('migrate v7 → v8: túi đồ chia phần', () => {
  const data = makeLegacyData()

  /** Giả lập file save v7: túi đồ là số lượng theo id. */
  function asV7(state: GameState, inventory: unknown): Record<string, unknown> {
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    return { ...withLegacyZones(raw), version: 7, inventory }
  }

  it('số lượng theo id thành inventory.stacks, thêm tinh thể rỗng, state hợp lệ', () => {
    const state = legacyGameState({ seed: 3, party: [makeMonster()] })
    const migrated = migrateState(
      asV7(state, { potion: 2, ball: Number.MAX_SAFE_INTEGER }),
      migrateData
    )
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.inventory).toEqual({
      stacks: { potion: 2, ball: Number.MAX_SAFE_INTEGER },
      crystals: [],
      books: [],
      equipment: [],
      souls: [],
      spirits: []
    })
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('túi rỗng hoặc thiếu hẳn túi: thành túi rỗng', () => {
    const state = legacyGameState({ seed: 3, party: [makeMonster()] })
    const empty = { stacks: {}, crystals: [], books: [], equipment: [], souls: [], spirits: [] }
    expect(migrateState(asV7(state, {}), migrateData).inventory).toEqual(empty)
    expect(migrateState(asV7(state, undefined), migrateData).inventory).toEqual(empty)
  })

  it('túi v7 hỏng: migrate không crash, kiểm tra báo lỗi đúng đường dẫn', () => {
    const state = legacyGameState({ seed: 3, party: [makeMonster()] })
    const issues = validateGameState(
      data,
      migrateState(asV7(state, { ghost: 0 }), migrateData)
    ).join('\n')
    expect(issues).toMatch(/inventory\.stacks: vật phẩm không tồn tại "ghost"/)
    expect(issues).toMatch(/inventory\.stacks\.ghost phải là số nguyên ≥ 1/)
  })
})

describe('migrate v8 → v9: vùng cố định thành tầng', () => {
  const data = makeLegacyData()

  /** Giả lập file save v8 từ state hiện tại (vị trí kiểu vùng, chưa có highestFloor). */
  function asV8(state: GameState): Record<string, unknown> {
    return { ...withLegacyZones(JSON.parse(JSON.stringify(serializeState(state)))), version: 8 }
  }

  it('thị trấn: giữ nguyên, mở sẵn tầng 1 và 2', () => {
    const state = legacyGameState({ seed: 3, party: [makeMonster()] })
    const migrated = migrateState(asV8(state), migrateData)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.location).toEqual({ type: 'town' })
    expect(migrated.highestFloor).toBe(2)
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('Đồng cỏ → tầng 1, Núi lửa → tầng 2 (cả vị trí lẫn trận đang diễn ra)', () => {
    const v8 = asV8(legacyGameState({ seed: 3, party: [makeMonster()] }))
    const meadow = migrateState(
      { ...v8, location: { type: 'zone', zoneId: 'meadow' } },
      migrateData
    )
    expect(meadow.location).toEqual({ type: 'floor', floor: 1 })
    const volcano = migrateState(
      { ...v8, location: { type: 'zone', zoneId: 'volcano' } },
      migrateData
    )
    expect(volcano.location).toEqual({ type: 'floor', floor: 2 })
    expect(validateGameState(data, volcano)).toEqual([])

    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })], {
      floor: 2
    })
    const inBattle = migrateState(asV8(battle), migrateData)
    expect(defined(inBattle.battle).floor).toBe(2)
    expect('zoneId' in defined(inBattle.battle)).toBe(false)
    expect(inBattle.location).toEqual({ type: 'floor', floor: 2 })
    expect(validateGameState(data, inBattle)).toEqual([])
  })

  it('vùng lạ: migrate không crash, kiểm tra báo lỗi đúng đường dẫn', () => {
    const v8 = asV8(legacyGameState({ seed: 3, party: [makeMonster()] }))
    const migrated = migrateState(
      { ...v8, location: { type: 'zone', zoneId: 'ghost' } },
      migrateData
    )
    expect(validateGameState(data, migrated).join('\n')).toMatch(
      /location\.floor phải là số nguyên/
    )
  })
})

describe('migrate v9 → v10: gender thêm giá trị none', () => {
  it('save v9 giữ nguyên dữ liệu, chỉ đổi version, state hợp lệ', () => {
    const data = makeLegacyData()
    const state = legacyGameState({ seed: 3, party: [makeMonster({ gender: 'male' })] })
    const v9 = { ...withoutStatuses(JSON.parse(JSON.stringify(serializeState(state)))), version: 9 }
    const migrated = migrateState(v9, migrateData)
    expect(migrated).toEqual(lifeMigrated({ ...state, version: SAVE_VERSION }))
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('migrate v10 → v11: trạng thái bất thường', () => {
  const data = makeLegacyData()

  /** State có quái ở đội, kho, trứng, quái hoang và quái đã bắt trong trận. */
  function sampleState(): GameState {
    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    return {
      ...battle,
      storage: [makeMonster({ id: 's' })],
      eggs: [{ id: 'm7', monster: makeMonster({ id: 'm7' }), battlesLeft: 2, infusions: [] }],
      battle: { ...defined(battle.battle), captured: [makeMonster({ id: 'c' })] }
    }
  }

  const asV10 = (state: GameState): RawSave => ({
    ...withoutStatuses(JSON.parse(JSON.stringify(serializeState(state)))),
    version: 10
  })

  it('thêm statuses rỗng cho mọi quái (kể cả trong trứng, trong trận), state hợp lệ', () => {
    const state = sampleState()
    const v10 = asV10(state)
    expect('statuses' in (v10.party as RawSave[])[0]).toBe(false)
    const migrated = migrateState(v10, migrateData)
    expect(migrated).toEqual(lifeMigrated({ ...state, version: SAVE_VERSION }))
    expect(migrated.eggs[0].monster.statuses).toEqual([])
    expect(defined(migrated.battle).captured[0].statuses).toEqual([])
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('trứng hỏng giữ nguyên để kiểm tra báo lỗi, migrate không crash', () => {
    const v10 = { ...asV10(sampleState()), eggs: [null, { id: 'x' }] }
    const migrated = migrateState(v10, migrateData)
    expect(validateGameState(data, migrated).join('\n')).toMatch(/eggs\[0\]: không hợp lệ/)
  })
})

describe('migrate v11 → v12: cửa hàng', () => {
  const data = makeLegacyData()

  const asV11 = (state: GameState): RawSave => {
    const { shop: _shop, ...rest } = JSON.parse(JSON.stringify(serializeState(state))) as RawSave
    return { ...rest, version: 11 }
  }

  it('thêm cửa hàng với danh sách hàng rỗng, state hợp lệ', () => {
    const state = legacyGameState({ seed: 5, party: [makeMonster()] })
    const v11 = asV11(state)
    expect('shop' in v11).toBe(false)
    const migrated = migrateState(v11, migrateData)
    expect(migrated.shop).toEqual({ stock: [] })
    expect(migrated).toEqual(lifeMigrated({ ...state, version: SAVE_VERSION }))
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('đang giữa trận cũng migrate được; vào thị trấn lần sau thì có hàng', () => {
    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const migrated = migrateState(asV11(battle), migrateData)
    expect(validateGameState(data, migrated)).toEqual([])
    const fled = gameReducer(
      data,
      { ...migrated, battle: null },
      {
        type: 'travel',
        to: { type: 'town' }
      }
    )
    expect(fled.shop.stock).toHaveLength(3)
  })
})

describe('migrate v12 → v13: môi trường trong trận', () => {
  const data = makeLegacyData()

  const asV12 = (state: GameState): RawSave => {
    const raw = JSON.parse(JSON.stringify(serializeState(state))) as RawSave
    const battle = raw.battle as RawSave | null
    if (battle) delete battle.field
    return { ...raw, version: 12 }
  }

  it('trận đang diễn ra có môi trường mặc định cả trận, state hợp lệ', () => {
    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const v12 = asV12(battle)
    expect('field' in (v12.battle as RawSave)).toBe(false)
    const migrated = migrateState(v12, migrateData)
    // Nâng tiếp lên v15 nên có thêm danh sách hiệu ứng theo phe và room rỗng.
    expect(defined(migrated.battle).field).toEqual({
      weather: { id: 'clear', turnsLeft: null },
      terrain: { id: 'none', turnsLeft: null },
      sides: { player: [], enemy: [] },
      rooms: []
    })
    expect(migrated).toEqual(lifeMigrated({ ...battle, version: SAVE_VERSION }))
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('ngoài trận: chỉ đổi version', () => {
    const state = legacyGameState({ seed: 5, party: [makeMonster()] })
    expect(migrateState(asV12(state), migrateData)).toEqual(
      lifeMigrated({ ...state, version: SAVE_VERSION })
    )
  })
})

describe('migrate v13 → v14: hiệu ứng theo phe', () => {
  const data = makeLegacyData()

  const asV13 = (state: GameState): RawSave => {
    const raw = JSON.parse(JSON.stringify(serializeState(state))) as RawSave
    const field = (raw.battle as RawSave | null)?.field as RawSave | undefined
    if (field) {
      delete field.sides
      delete field.rooms
    }
    return { ...raw, version: 13 }
  }

  it('trận đang diễn ra chưa có hiệu ứng theo phe nào, giữ môi trường toàn sân, state hợp lệ', () => {
    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const v13 = asV13(battle)
    expect('sides' in ((v13.battle as RawSave).field as RawSave)).toBe(false)
    const migrated = migrateState(v13, migrateData)
    expect(defined(migrated.battle).field.sides).toEqual({ player: [], enemy: [] })
    expect(migrated).toEqual(lifeMigrated({ ...battle, version: SAVE_VERSION }))
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('ngoài trận: chỉ đổi version', () => {
    const state = legacyGameState({ seed: 5, party: [makeMonster()] })
    expect(migrateState(asV13(state), migrateData)).toEqual(
      lifeMigrated({ ...state, version: SAVE_VERSION })
    )
  })
})

describe('migrate v14 → v15: hiệu ứng toàn sân đặc biệt (room)', () => {
  const data = makeLegacyData()

  const asV14 = (state: GameState): RawSave => {
    const raw = JSON.parse(JSON.stringify(serializeState(state))) as RawSave
    const field = (raw.battle as RawSave | null)?.field as RawSave | undefined
    if (field) delete field.rooms
    return { ...raw, version: 14 }
  }

  it('trận đang diễn ra chưa có room nào, giữ môi trường khác, state hợp lệ', () => {
    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const v14 = asV14(battle)
    expect('rooms' in ((v14.battle as RawSave).field as RawSave)).toBe(false)
    const migrated = migrateState(v14, migrateData)
    expect(defined(migrated.battle).field.rooms).toEqual([])
    expect(migrated).toEqual(lifeMigrated({ ...battle, version: SAVE_VERSION }))
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('ngoài trận: chỉ đổi version', () => {
    const state = legacyGameState({ seed: 5, party: [makeMonster()] })
    expect(migrateState(asV14(state), migrateData)).toEqual(
      lifeMigrated({ ...state, version: SAVE_VERSION })
    )
  })
})

describe('migrate v15 → v16: map của tầng', () => {
  const data = makeLegacyData()

  const asV15 = (state: GameState): RawSave => {
    const { floorBiomeIds: _floorBiomeIds, ...rest } = JSON.parse(
      JSON.stringify(serializeState(state))
    ) as RawSave
    return { ...rest, version: 15 }
  }

  it('các tầng đã mở lấy map theo luật cũ (Đồng cỏ, Núi lửa xoay vòng), state hợp lệ', () => {
    const state = legacyGameState({ seed: 5, party: [makeMonster()], highestFloor: 5 })
    const migrated = migrateState(asV15(state), migrateData)
    expect(migrated.floorBiomeIds).toEqual(['meadow', 'volcano', 'meadow', 'volcano', 'meadow'])
    expect(migrated).toEqual(lifeMigrated({ ...state, version: SAVE_VERSION }))
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('đang giữa trận ở tầng 2: trận vẫn ở Núi lửa', () => {
    const battle = legacyBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })], {
      floor: 2
    })
    const migrated = migrateState(asV15(battle), migrateData)
    expect(migrated.floorBiomeIds).toEqual(['meadow', 'volcano'])
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('highestFloor hỏng: danh sách rỗng để kiểm tra save báo lỗi; quá lớn: DataError', () => {
    const state = legacyGameState({ seed: 5, party: [makeMonster()] })
    const broken = migrateState({ ...asV15(state), highestFloor: 'x' }, migrateData)
    expect(broken.floorBiomeIds).toEqual([])
    expect(validateGameState(data, broken).join('|')).toMatch(/highestFloor/)
    expect(() => migrateState({ ...asV15(state), highestFloor: 1_000_001 }, migrateData)).toThrow(
      DataError
    )
    expect(() =>
      migrateState({ ...asV15(state), highestFloor: Number.MAX_SAFE_INTEGER }, migrateData)
    ).toThrow(DataError)
  })
})
