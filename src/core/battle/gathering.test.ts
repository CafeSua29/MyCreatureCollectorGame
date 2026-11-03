// Câu cá và khai thác (docs/rules/gathering.md): điều kiện map / dụng cụ, bảng kết quả theo cấp dụng
// cụ, mồi câu, phục kích, thu phục, đồng hồ, mua dụng cụ theo tầng, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { addItems, getItemCount } from '../inventory'
import { expForLevel } from '../monster'
import {
  FIXTURE_ENHANCE_STONE_ID,
  FIXTURE_GATHERING_ITEM_IDS,
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  findLog,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type { GameAction, GameData, GameLogEntry, GameState, Monster, RawGameData } from '../model'
import { suggestBattleCommands } from './ai'
import { gather } from './gathering'
import { isRecruitBattle } from './recruit'

const ids = FIXTURE_GATHERING_ITEM_IDS

/** Kết quả thu thập trong log của action vừa làm, bỏ trường type (không có thì null). */
function gatheredOf(
  state: GameState
): Omit<Extract<GameLogEntry, { type: 'gathered' }>, 'type'> | null {
  const entry = findLog(state, 'gathered')
  if (!entry) return null
  const { type: _type, ...result } = entry
  return result
}

function makeGatheringData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeGatheringData()

/** Tỉ lệ ra trận cố định (0 = luôn vật phẩm, 100 = luôn trận). */
const withBattleChance = (chance: number, edit: (raw: RawGameData) => void = () => {}): GameData =>
  makeGatheringData((raw) => {
    raw.config.gathering.fishing.battleChance = chance
    raw.config.gathering.mining.battleChance = chance
    edit(raw)
  })

/** Map tầng 1 có loài thường weakling (99) và loài hiếm strongling (1). */
const withRareSpecies = (raw: RawGameData): void => {
  defined(raw.biomes[0], 'map field').encounters = [
    { speciesId: 'weakling', weight: 99 },
    { speciesId: 'strongling', weight: 1 }
  ]
}

const hero = (): Monster =>
  makeMonster({
    id: 'h',
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    elementIds: ['grass'],
    skillIds: ['strike']
  })

/** Đứng ở tầng 1 (map field) với các vật phẩm cho trước. */
function floorState(items: Readonly<Record<string, number>> = {}, seed = 3): GameState {
  const base = atFloor(makeGameState({ seed, party: [hero()], money: 100000 }), 1)
  const inventory = Object.entries(items).reduce(
    (inv, [itemId, count]) => addItems(inv, itemId, count),
    base.inventory
  )
  return { ...base, inventory }
}

const fish = (gameData: GameData, state: GameState, lureItemId?: string): GameState =>
  gameReducer(gameData, state, { type: 'fish', ...(lureItemId ? { lureItemId } : {}) })

const mine = (gameData: GameData, state: GameState): GameState =>
  gameReducer(gameData, state, { type: 'mine' })

/** Chạy action với nhiều seed, trả về các state kết quả. */
function runSeeds(count: number, run: (seed: number) => GameState): GameState[] {
  return Array.from({ length: count }, (_, seed) => run(seed + 1))
}

/** Loài của quái địch trong trận (trận thu thập luôn một quái). */
const enemySpecies = (state: GameState): string =>
  defined(defined(state.battle, 'trận').enemies[0], 'quái địch').speciesId

describe('câu cá', () => {
  it('cần map có chỗ câu, cần câu, đứng ở tầng, ngoài trận', () => {
    const noRod = floorState()
    expectActionError(() => fish(data, noRod), 'gatheringToolMissing', { method: 'fishing' })
    const town = { ...floorState({ [ids.oldRod]: 1 }), location: { type: 'town' as const } }
    expectActionError(() => fish(data, town), 'notOnFloor')
    // Tầng 2 là map lair: không có chỗ câu.
    const lair = atFloor(floorState({ [ids.oldRod]: 1 }), 2)
    expectActionError(() => fish(data, lair), 'gatheringUnavailable', {
      method: 'fishing',
      biomeId: 'lair'
    })
    const fighting = fish(withBattleChance(100), floorState({ [ids.oldRod]: 1 }))
    expectActionError(() => fish(data, fighting), 'inBattle')
  })

  it('không ra trận: món của bảng theo cấp vào túi, tốn clock.hours.fishing giờ', () => {
    const itemsOnly = withBattleChance(0)
    const start = floorState({ [ids.oldRod]: 1 })
    const after = fish(itemsOnly, start)
    expect(after.battle).toBeNull()
    expect(after.time).toBe(start.time + itemsOnly.config.clock.hours.fishing)
    expect(gatheredOf(after)).toEqual({
      method: 'fishing',
      tier: 1,
      lureItemId: null,
      items: [{ itemId: 'potion', count: 1 }],
      encounter: 'none'
    })
    expect(getItemCount(after.inventory, 'potion')).toBe(
      getItemCount(start.inventory, 'potion') + 1
    )
    expect(getItemCount(after.inventory, ids.oldRod)).toBe(1)
  })

  it('cấp 1 không ra món minTier 3 / món của map hệ khác; cấp 3 ra được, tung itemRolls lượt', () => {
    const itemsOnly = withBattleChance(0)
    const low = runSeeds(60, (seed) => fish(itemsOnly, floorState({ [ids.oldRod]: 1 }, seed)))
    const lowItems = low.flatMap((s) => defined(gatheredOf(s), 'kết quả').items)
    expect(lowItems.every((item) => item.itemId === 'potion')).toBe(true)
    const high = runSeeds(60, (seed) => fish(itemsOnly, floorState({ [ids.superRod]: 1 }, seed)))
    for (const state of high) {
      const result = defined(gatheredOf(state), 'kết quả')
      expect(result.tier).toBe(3)
      expect(result.items).toHaveLength(itemsOnly.config.gathering.fishing.tiers[2].itemRolls)
      // Món theo hệ nước của map không bao giờ ra ở map field (không có hệ chủ đạo nước).
      expect(result.items.some((item) => item.itemId === 'revive')).toBe(false)
    }
    const highItems = high.flatMap((s) => defined(gatheredOf(s), 'kết quả').items)
    expect(highItems.some((item) => item.itemId === 'masterBall')).toBe(true)
  })

  it('món theo hệ của map chỉ ra ở map có hệ chủ đạo đó', () => {
    const watery = withBattleChance(0, (raw) => {
      defined(raw.biomes[0], 'map field').elementIds = ['water']
    })
    const results = runSeeds(40, (seed) => fish(watery, floorState({ [ids.oldRod]: 1 }, seed)))
    const items = results.flatMap((s) => defined(gatheredOf(s), 'kết quả').items)
    expect(items.some((item) => item.itemId === 'revive')).toBe(true)
  })

  it('cá cắn câu: trận thường của quái map hợp cách câu, level theo cấp cần câu, chạy được', () => {
    const always = withBattleChance(100)
    const start = floorState({ [ids.oldRod]: 1 })
    const biting = fish(always, start)
    const battle = defined(biting.battle, 'trận')
    expect(battle.special).toEqual({ kind: 'gathering', method: 'fishing', ambush: false })
    expect(battle.isBoss).toBe(false)
    expect(battle.enemies).toHaveLength(1)
    // Tầng 1 level 1, cần câu thường −2 → tối thiểu 1.
    expect(defined(battle.enemies[0], 'quái').level).toBe(1)
    expect(gatheredOf(biting)?.encounter).toBe('bite')
    expect(gatheredOf(biting)?.items).toEqual([])
    expect(biting.time).toBe(start.time)
    expect(isRecruitBattle(battle)).toBe(true)
    const fled = gameReducer(always, biting, { type: 'flee' })
    expect(defined(fled.battle, 'trận').outcome).toBe('fled')
    const left = gameReducer(always, fled, { type: 'leaveBattle' })
    expect(left.time).toBe(start.time + always.config.clock.hours.wildBattle)
    // Cần câu siêu +3 level.
    const strong = fish(always, floorState({ [ids.superRod]: 1 }))
    const floorLevel = defined(defined(biting.battle, 'trận').enemies[0], 'quái').level
    expect(defined(defined(strong.battle, 'trận').enemies[0], 'quái').level).toBeGreaterThan(
      floorLevel
    )
  })

  it('cần câu tốt hơn → loài hiếm dễ cắn câu hơn (trọng số ^ số mũ của cấp)', () => {
    const rare = withBattleChance(100, withRareSpecies)
    const count = (rod: string): number =>
      runSeeds(200, (seed) => fish(rare, floorState({ [rod]: 1 }, seed))).filter(
        (state) => enemySpecies(state) === 'strongling'
      ).length
    const low = count(ids.oldRod)
    const high = count(ids.superRod)
    expect(low).toBeLessThan(15)
    // Số mũ 0: hai loài đều nhau (~50%).
    expect(high).toBeGreaterThan(70)
  })

  it('mồi câu: mất một cái, số mũ × rarityFactor (0 = san đều), ghi vào kết quả', () => {
    const rare = withBattleChance(100, withRareSpecies)
    const lured = runSeeds(200, (seed) =>
      fish(rare, floorState({ [ids.oldRod]: 1, [ids.lure]: 2 }, seed), ids.lure)
    )
    for (const state of lured) {
      expect(getItemCount(state.inventory, ids.lure)).toBe(1)
      expect(gatheredOf(state)?.lureItemId).toBe(ids.lure)
    }
    expect(lured.filter((s) => enemySpecies(s) === 'strongling').length).toBeGreaterThan(70)
  })

  it('mồi câu sai: không phải mồi, không có, không tồn tại, dùng cho khai thác; state giữ nguyên', () => {
    const start = floorState({ [ids.oldRod]: 1, [ids.pickaxe]: 1, potion: 1 })
    expectActionError(() => fish(data, start, 'potion'), 'notFishingLure', { itemId: 'potion' })
    expectActionError(() => fish(data, start, ids.lure), 'notEnoughItem', { need: 1, have: 0 })
    expectActionError(() => fish(data, start, 'nope'), 'unknownItem', { itemId: 'nope' })
    expectActionError(
      () => gather(data, start, { method: 'mining', lureItemId: ids.lure }),
      'malformedAction'
    )
    // Ép kiểu: mô phỏng action sai kiểu từ renderer.
    const bad = { type: 'fish', lureItemId: 5 } as unknown as GameAction
    expectActionError(() => gameReducer(data, start, bad), 'malformedAction')
    expect(start.inventory.stacks.potion).toBe(1)
  })

  it('tất định: cùng state + cùng action cho cùng kết quả', () => {
    const start = floorState({ [ids.superRod]: 1 })
    expect(fish(data, start)).toEqual(fish(data, start))
  })
})

describe('khai thác', () => {
  it('cần cuốc', () => {
    expectActionError(() => mine(data, floorState()), 'gatheringToolMissing', { method: 'mining' })
  })

  it('luôn đào ra khoáng; không bị phục kích thì tốn clock.hours.mining giờ', () => {
    const calm = withBattleChance(0)
    const start = floorState({ [ids.pickaxe]: 1 })
    const after = mine(calm, start)
    expect(after.battle).toBeNull()
    expect(after.time).toBe(start.time + calm.config.clock.hours.mining)
    expect(getItemCount(after.inventory, FIXTURE_ENHANCE_STONE_ID)).toBe(2)
    expect(gatheredOf(after)?.encounter).toBe('none')
  })

  it('phục kích: vẫn nhận khoáng, quái hợp cách khai thác, không chạy được ở lượt đầu', () => {
    const ambushed = withBattleChance(100)
    const fighting = mine(ambushed, floorState({ [ids.pickaxe]: 1 }))
    const battle = defined(fighting.battle, 'trận')
    expect(battle.special).toEqual({ kind: 'gathering', method: 'mining', ambush: true })
    expect(enemySpecies(fighting)).toBe('weakling')
    expect(getItemCount(fighting.inventory, FIXTURE_ENHANCE_STONE_ID)).toBe(2)
    expect(gatheredOf(fighting)?.encounter).toBe('ambush')
    expectActionError(
      () => gameReducer(ambushed, fighting, { type: 'flee' }),
      'specialBattleRestricted',
      {
        command: 'flee'
      }
    )
    // Sang lượt 2 thì được thử chạy (ép lượt để không phụ thuộc kết quả đánh; chạy có thể trượt).
    const turnTwo = { ...fighting, battle: { ...battle, turn: 2 } }
    expect(() => gameReducer(ambushed, turnTwo, { type: 'flee' })).not.toThrow()
  })

  it('thắng trận phục kích như trận quái hoang thường', () => {
    const ambushed = withBattleChance(100)
    let state = mine(ambushed, floorState({ [ids.pickaxe]: 1 }))
    for (let i = 0; i < 20 && state.battle?.phase === 'chooseActions'; i++) {
      state = gameReducer(ambushed, state, {
        type: 'submitTurn',
        commands: suggestBattleCommands(ambushed, state, { transforms: false })
      })
    }
    expect(state.battle?.outcome).toBe('won')
    expect(validateGameState(ambushed, state)).toEqual([])
  })
})

describe('mua dụng cụ', () => {
  it('bùa có townMinFloor chỉ bán khi đã mở tới tầng đó', () => {
    const town = makeGameState({ seed: 1, party: [hero()], money: 100000, highestFloor: 2 })
    expectActionError(
      () => gameReducer(data, town, { type: 'buyCharm', itemId: ids.superRod }),
      'charmFloorLocked',
      { itemId: ids.superRod, minFloor: 3 }
    )
    const higher = makeGameState({ seed: 1, party: [hero()], money: 100000, highestFloor: 3 })
    const bought = gameReducer(data, higher, { type: 'buyCharm', itemId: ids.superRod })
    expect(getItemCount(bought.inventory, ids.superRod)).toBe(1)
    expect(bought.money.eq(higher.money.minus(1000))).toBe(true)
  })
})

describe('kiểm tra dữ liệu', () => {
  it('dữ liệu mẫu hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('báo lỗi cờ map, map không có loài hợp cách, hiểm địa có gathering', () => {
    const issues = dataIssuesAfter((raw) => {
      const lair = defined(raw.biomes[1], 'map lair')
      // Ép kiểu: dữ liệu sai cố ý.
      lair.gathering = { fishing: 'yes' } as unknown as typeof lair.gathering
      defined(raw.biomes[2], 'map pairs').gathering = { mining: true }
      raw.config.gathering.mining.elementIds = ['water']
      const zoneMap = defined(raw.zones[0], 'hiểm địa').map
      Object.assign(zoneMap, { gathering: { fishing: true } })
    })
    expect(issues).toContain(
      'Biome "lair": gathering.fishing chỉ được ghi true (bỏ trống = không có)'
    )
    expect(issues).toContain(
      'Biome "pairs": gathering.mining: map không có loài nào hợp config.gathering.mining'
    )
    expect(issues.some((i) => i.includes('map không có gathering (chỉ map của tầng)'))).toBe(true)
  })

  it('báo lỗi config: minTier vượt số cấp, hệ lạ, cấp sai, bùa cấp vượt config, mồi âm', () => {
    const issues = dataIssuesAfter((raw) => {
      const fishing = raw.config.gathering.fishing
      fishing.items.push({ itemId: 'potion', weight: 1, min: 1, max: 1, minTier: 9 })
      fishing.items.push({ itemId: 'potion', weight: 1, min: 1, max: 1, mapElementId: 'lava' })
      fishing.raceGroupIds = ['nope']
      fishing.battleChance = 101
      raw.config.gathering.mining.tiers = [{ rarityExponent: -1, levelOffset: 0.5, itemRolls: 0 }]
      raw.items.push({
        id: 'megaRod',
        category: 'charm',
        effects: [{ type: 'fishingRodTier', value: 4 }]
      })
      raw.items.push({ id: 'badLure', category: 'fishingLure', price: 1, rarityFactor: -1 })
    })
    const text = issues.join('\n')
    expect(text).toMatch(
      /config\.gathering\.fishing\.items\[\d+\]\.minTier vượt số cấp dụng cụ \(3\)/
    )
    expect(text).toMatch(/mapElementId: hệ không tồn tại "lava"/)
    expect(text).toMatch(/raceGroupIds: nhóm race không tồn tại "nope"/)
    expect(text).toMatch(/fishing\.battleChance/)
    expect(text).toMatch(/mining\.tiers\[0\]\.rarityExponent/)
    expect(text).toMatch(/mining\.tiers\[0\]\.levelOffset/)
    expect(text).toMatch(/mining\.tiers\[0\]\.itemRolls/)
    expect(text).toMatch(/"megaRod": fishingRodTier 4 vượt số cấp/)
    expect(text).toMatch(/"badLure": rarityFactor/)
  })

  it('báo lỗi bùa: townMinFloor không có townPrice / không nguyên dương', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.items.push({
        id: 'freeRod',
        category: 'charm',
        effects: [{ type: 'fishingRodTier', value: 1 }],
        townMinFloor: 2
      })
      raw.items.push({
        id: 'zeroRod',
        category: 'charm',
        effects: [{ type: 'fishingRodTier', value: 1 }],
        townPrice: 5,
        townMinFloor: 0
      })
    })
    expect(issues.join('\n')).toMatch(/"freeRod".*townMinFloor chỉ dùng khi có townPrice/)
    expect(issues.join('\n')).toMatch(/"zeroRod".*townMinFloor/)
  })
})

describe('save', () => {
  it('state sau câu cá / trong trận phục kích hợp lệ và đi qua serialize', () => {
    const fished = fish(
      withBattleChance(0),
      floorState({ [ids.oldRod]: 1, [ids.lure]: 1 }),
      ids.lure
    )
    expect(validateGameState(data, fished)).toEqual([])
    expect(migrateState(serializeState(fished), data)).toEqual(fished)
    const ambushed = withBattleChance(100)
    const fighting = mine(ambushed, floorState({ [ids.pickaxe]: 1 }))
    expect(validateGameState(ambushed, fighting)).toEqual([])
  })

  it('báo lỗi save: dòng log thu thập thiếu trường, trận thu thập sai', () => {
    const fished = fish(withBattleChance(0), floorState({ [ids.oldRod]: 1 }))
    const { encounter: _encounter, ...partial } = defined(findLog(fished, 'gathered'), 'kết quả')
    // Ép kiểu: save sai cố ý.
    const brokenLog = { ...fished, log: [partial] } as unknown as GameState
    expect(validateGameState(data, brokenLog).join('\n')).toMatch(/log\[0\]: thiếu encounter/)
    const ambushed = withBattleChance(100)
    const fighting = mine(ambushed, floorState({ [ids.pickaxe]: 1 }))
    const battle = defined(fighting.battle, 'trận')
    const badBattle = {
      ...fighting,
      battle: { ...battle, special: { kind: 'gathering', method: 'x', ambush: 1 } }
    } as unknown as GameState
    const text = validateGameState(ambushed, badBattle).join('\n')
    expect(text).toMatch(/battle\.special\.method/)
    expect(text).toMatch(/battle\.special\.ambush/)
  })

  it('migrate save cũ: gathering.lastResult bỏ, kết quả thu thập ở log ngoài trận', () => {
    const state = floorState()
    const raw = serializeState(state) as Record<string, unknown>
    const { gathering: _gathering, log: _log, ...old } = raw
    const migrated = migrateState({ ...old, version: 80 }, data)
    expect(migrated).not.toHaveProperty('gathering')
    expect(migrated.log).toEqual([])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
