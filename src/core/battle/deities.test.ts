// Thần linh và ân sủng (docs/rules/deities.md): thần của trận, ân sủng theo hoạt động và map, chúc
// phúc chỉ áp trong map của thần, tín vật, Miếu (Hương nến, cửa hàng thần), kiểm tra dữ liệu / save,
// migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { computeStats } from '../monster'
import { favorForRank } from '../registries'
import { toBig, type Decimal } from '../shared'
import { deityRank, incensePrice } from '../world'
import {
  FIXTURE_DEITY_ID,
  FIXTURE_DEITY_TOKEN_ID,
  FIXTURE_INCENSE_ID,
  FIXTURE_ZONE_ID,
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BallItem,
  BattleTrainer,
  BattleCommand,
  BattleEvent,
  BattleState,
  GameAction,
  GameData,
  GameState,
  Monster,
  RawGameData,
  TrainerMode
} from '../model'
import { battleDeityId } from './deities'
import { battleCatchChance } from './battleItems'
import { requireBattleStart } from './battleActions'
import { recruitChance } from './recruit'
import { monsterBattleContext, type Draft } from './draft'

/** Fixture có thần lửa cai quản map `field` (tầng 1); `edit` sửa thêm. */
function deityData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.biomes[0].deityId = FIXTURE_DEITY_ID
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = deityData()
/** Tín vật chắc chắn rơi; xin theo chắc chắn (weakling catchRate 100). */
const generous = deityData((raw) => {
  raw.config.deities.tokenWildChance = 100
  raw.config.recruit = { ...raw.config.recruit, baseChance: 100 }
  raw.species = raw.species.map((species) =>
    species.id === 'weakling' && species.kind === 'normal'
      ? { ...species, catchRate: 100 }
      : species
  )
})

const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })

/** Quái hoang còn 1 máu: một đòn strike là gục. */
const weak = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], damageTaken: toBig(49), ...overrides })

const strike = (slot: number, target: number): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId: 'strike',
  target
})

const act = (gameData: GameData, state: GameState, action: GameAction): GameState =>
  gameReducer(gameData, state, action)

/** Trận 2 đấu 2 ở tầng `floor` (1 = map có thần, 2 = không). */
const twoOnTwo = (overrides: Partial<BattleState> = {}): GameState =>
  makeBattleState([ally('a'), ally('b')], [weak('e1'), weak('e2')], overrides)

const winBattle = (gameData: GameData, state: GameState): GameState =>
  act(gameData, state, { type: 'submitTurn', commands: [strike(0, 0), strike(1, 1)] })

const withFavor = (state: GameState, favor: Decimal | number): GameState => ({
  ...state,
  favor: { [FIXTURE_DEITY_ID]: toBig(favor) }
})

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const favorOf = (state: GameState): number => state.favor[FIXTURE_DEITY_ID]?.toNumber() ?? 0

describe('thần của trận (battleDeityId)', () => {
  const plain = { trial: null, tribulation: null, special: null, trainer: null }
  const state = makeGameState({ seed: 1, highestFloor: 3 })
  const npc = (mode: TrainerMode): BattleTrainer => ({
    classId: 'rookie',
    mode,
    elementId: null,
    rewardMultiplier: 1
  })

  it('map có thần → thần đó; map không có thần → null', () => {
    expect(battleDeityId(data, state, { ...plain, floor: 1 })).toBe(FIXTURE_DEITY_ID)
    expect(battleDeityId(data, state, { ...plain, floor: 2 })).toBeNull()
  })

  it('trận hiểm địa lấy thần của map hiểm địa (bỏ trống = không có thần)', () => {
    const withZoneGod = deityData((raw) => {
      raw.zones[0].map.deityId = FIXTURE_DEITY_ID
    })
    const zoneBattle = {
      ...plain,
      floor: 2,
      special: { kind: 'zone', zoneId: FIXTURE_ZONE_ID, guardian: false } as const
    }
    expect(battleDeityId(withZoneGod, state, zoneBattle)).toBe(FIXTURE_DEITY_ID)
    expect(battleDeityId(data, state, zoneBattle)).toBeNull()
  })

  it('trận không diễn ra trong map (độ kiếp, giải đấu, đấu trường, thú triều) → null', () => {
    const at1 = { ...plain, floor: 1 }
    expect(battleDeityId(data, state, { ...at1, tribulation: { monsterId: 'a', tier: 1 } })).toBe(
      null
    )
    expect(battleDeityId(data, state, { ...at1, trainer: npc('arena') })).toBeNull()
    expect(battleDeityId(data, state, { ...at1, trainer: npc('tournament') })).toBeNull()
    expect(battleDeityId(data, state, { ...at1, trainer: npc('floor') })).toBe(FIXTURE_DEITY_ID)
    expect(battleDeityId(data, state, { ...at1, trainer: npc('gym') })).toBe(FIXTURE_DEITY_ID)
    const tide = { kind: 'beastTide', wave: 1, waves: 3, king: false } as const
    expect(battleDeityId(data, state, { ...at1, special: tide })).toBeNull()
  })
})

describe('ân sủng sau trận', () => {
  it('thắng trận trong map của thần: +1, log favorGained; state hợp lệ', () => {
    const won = winBattle(data, twoOnTwo())
    expect(battleOf(won).outcome).toBe('won')
    expect(favorOf(won)).toBe(1)
    expect(eventsOf(won, 'favorGained')).toEqual([
      { type: 'favorGained', deityId: FIXTURE_DEITY_ID, amount: 1, rank: 0 }
    ])
    expect(eventsOf(won, 'blessingRankUp')).toEqual([])
    expect(validateGameState(data, won)).toEqual([])
  })

  it('đủ ngưỡng thì lên bậc (log blessingRankUp)', () => {
    const won = winBattle(data, withFavor(twoOnTwo(), 9))
    expect(favorOf(won)).toBe(10)
    expect(eventsOf(won, 'blessingRankUp')).toEqual([
      { type: 'blessingRankUp', deityId: FIXTURE_DEITY_ID, rank: 1 }
    ])
  })

  it('thắng trận boss: +1 + 10', () => {
    const won = winBattle(data, twoOnTwo({ isBoss: true }))
    expect(favorOf(won)).toBe(11)
  })

  it('quái bắt được: +3 mỗi con, kể cả khi chạy', () => {
    const state = twoOnTwo()
    const caught = { ...state, battle: { ...battleOf(state), captured: [weak('c1'), weak('c2')] } }
    const fled = act(data, caught, { type: 'flee' })
    expect(battleOf(fled).outcome).toBe('fled')
    expect(favorOf(fled)).toBe(6)
  })

  it('map không có thần / chạy không bắt gì: không có ân sủng, không log', () => {
    const elsewhere = winBattle(data, twoOnTwo({ floor: 2 }))
    expect(battleOf(elsewhere).outcome).toBe('won')
    expect(elsewhere.favor).toEqual({})
    expect(eventsOf(elsewhere, 'favorGained')).toEqual([])
    const fled = act(data, twoOnTwo(), { type: 'flee' })
    expect(fled.favor).toEqual({})
  })

  it('nhận quái xin theo trong map của thần: +3', () => {
    const won = winBattle(generous, twoOnTwo())
    expect(battleOf(won).recruitOfferId).not.toBeNull()
    const accepted = act(generous, won, { type: 'acceptRecruit' })
    expect(favorOf(accepted)).toBe(favorOf(won) + 3)
    expect(validateGameState(generous, accepted)).toEqual([])
  })
})

describe('chúc phúc chỉ áp trong map của thần', () => {
  const moneyOf = (state: GameState): number =>
    eventsOf(state, 'won')[0]?.money.toNumber() ?? Number.NaN
  // Bậc 3: tiền +100%, tỉ lệ rơi / bắt +50%, thu phục / shiny +100%; bậc 1, 2: EXP +10%, chỉ số +10%.
  const blessed = (state: GameState): GameState => withFavor(state, favorForRank(data, 3))

  it('tiền thắng ×2 ở map của thần, không đổi ở map khác', () => {
    const base = moneyOf(winBattle(data, twoOnTwo()))
    expect(base).toBeGreaterThan(0)
    expect(moneyOf(winBattle(data, blessed(twoOnTwo())))).toBe(base * 2)
    const other = moneyOf(winBattle(data, twoOnTwo({ floor: 2 })))
    expect(moneyOf(winBattle(data, blessed(twoOnTwo({ floor: 2 }))))).toBe(other)
  })

  it('% chỉ số (nguồn blessing) cho quái ta có hệ của thần; quái khác hệ / quái địch không', () => {
    const fire = ally('a', {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire']
    })
    const state = blessed(makeBattleState([fire, ally('b')], [weak('e1'), weak('e2')])) as Draft
    const statsOf = (monster: Monster): Record<string, number> => {
      const battle = defined(monsterBattleContext(data, state, monster))
      return computeStats(data, monster, { battle }).percentBySource.blessing
    }
    const [a, b] = state.party
    expect(defined(a).elementIds).toContain('fire')
    expect(statsOf(defined(a))).toMatchObject({ hp: 10, attack: 10, speed: 10 })
    expect(statsOf(defined(b))).toMatchObject({ hp: 0, attack: 0 })
    expect(statsOf(defined(state.battle.enemies[0]))).toMatchObject({ hp: 0, attack: 0 })
  })

  it('tỉ lệ bắt ×1,5, tỉ lệ shiny ×2 ở map của thần', () => {
    const ball = data.items.ball as BallItem
    const chanceIn = (state: GameState): number =>
      battleCatchChance(
        data,
        { ...state, battle: battleOf(state) },
        { ball, target: battleOf(state).enemies[0], user: state.party[0] }
      )
    const strong = (id: string): Monster => makeMonster({ id, bossMultiplier: 50 })
    const state = makeBattleState([ally('a')], [strong('e1')])
    const base = chanceIn(state)
    expect(base).toBeGreaterThan(0)
    expect(base).toBeLessThan(50)
    expect(chanceIn(blessed(state))).toBeCloseTo(base * 1.5)
    const town = makeGameState({ seed: 1, party: [ally('a')], highestFloor: 2 })
    const shinyAt = (state: GameState, floor: number): number =>
      requireBattleStart(data, atFloor(state, floor)).odds?.shinyMultiplier ?? Number.NaN
    expect(shinyAt(blessed(town), 1)).toBe(2 * shinyAt(town, 1))
    expect(shinyAt(blessed(town), 2)).toBe(shinyAt(town, 2))
  })

  it('% thu phục cộng vào tỉ lệ xin theo', () => {
    const state = makeGameState({ seed: 1, party: [ally('a')] })
    const enemy = weak('e1')
    const base = recruitChance(generous, state, { enemy, isBoss: false })
    const lower = deityData((raw) => {
      raw.config.recruit = { ...raw.config.recruit, baseChance: 10 }
    })
    const plain = recruitChance(lower, state, { enemy, isBoss: false })
    expect(base).toBe(100)
    expect(recruitChance(lower, state, { enemy, isBoss: false, blessingBonus: 100 })).toBeCloseTo(
      plain * 2
    )
  })
})

describe('tín vật', () => {
  it('mỗi quái bị hạ ở map của thần rơi tín vật (× hệ số rơi); map khác không', () => {
    const won = winBattle(generous, twoOnTwo())
    expect(won.inventory.stacks[FIXTURE_DEITY_TOKEN_ID]).toBe(2)
    const elsewhere = winBattle(generous, twoOnTwo({ floor: 2 }))
    expect(elsewhere.inventory.stacks[FIXTURE_DEITY_TOKEN_ID]).toBeUndefined()
  })
})

describe('Miếu: dâng Hương nến', () => {
  const town = (stacks: Record<string, number> = {}): GameState => ({
    ...makeGameState({ seed: 1, party: [ally('a')] }),
    inventory: makeInventory(stacks)
  })
  const offer = (
    state: GameState,
    count: unknown,
    deityId: unknown = FIXTURE_DEITY_ID
  ): GameState => act(data, state, { type: 'offerIncense', deityId, count } as GameAction)

  it('mỗi nén +200 ân sủng, mất hương; bậc tính lại', () => {
    const offered = offer(town({ [FIXTURE_INCENSE_ID]: 3 }), 2)
    expect(favorOf(offered)).toBe(400)
    expect(offered.inventory.stacks[FIXTURE_INCENSE_ID]).toBe(1)
    expect(deityRank(data, offered, FIXTURE_DEITY_ID)).toBe(6)
    expect(validateGameState(data, offered)).toEqual([])
  })

  it('số rất lớn: ân sủng là Decimal, không mất chính xác', () => {
    const offered = offer(
      town({ [FIXTURE_INCENSE_ID]: Number.MAX_SAFE_INTEGER }),
      Number.MAX_SAFE_INTEGER
    )
    expect(offered.favor[FIXTURE_DEITY_ID].eq(toBig(Number.MAX_SAFE_INTEGER).times(200))).toBe(true)
    expect(deityRank(data, offered, FIXTURE_DEITY_ID)).toBeGreaterThan(1e8)
  })

  it('lỗi: không ở thị trấn, đang trận, thần lạ, thiếu hương, số lượng sai; state giữ nguyên', () => {
    const state = town({ [FIXTURE_INCENSE_ID]: 1 })
    const snapshot = serializeState(state)
    expectActionError(() => offer(atFloor(state, 1), 1), 'notInTown')
    expectActionError(() => offer(twoOnTwo(), 1), 'inBattle')
    expectActionError(() => offer(state, 1, 'ghost'), 'unknownDeity', { deityId: 'ghost' })
    expectActionError(() => offer(state, 2), 'notEnoughItem', {
      itemId: FIXTURE_INCENSE_ID,
      have: 1,
      need: 2
    })
    expectActionError(() => offer(state, 0), 'malformedAction')
    expectActionError(() => offer(state, 1.5), 'malformedAction')
    expect(serializeState(state)).toEqual(snapshot)
  })
})

describe('Miếu: mua Hương nến', () => {
  const town = (money: number, stacks: Record<string, number> = {}): GameState => ({
    ...makeGameState({ seed: 1, party: [ally('a')], highestFloor: 3 }),
    money: toBig(money),
    inventory: makeInventory(stacks)
  })
  const buy = (state: GameState, count: unknown): GameState =>
    act(data, state, { type: 'buyIncense', count } as GameAction)

  it('luôn có hàng, giá = price × tầng cao nhất', () => {
    expect(incensePrice(data, town(0)).toNumber()).toBe(300)
    const bought = buy(town(1000), 3)
    expect(bought.inventory.stacks[FIXTURE_INCENSE_ID]).toBe(3)
    expect(bought.money.toNumber()).toBe(100)
    expect(validateGameState(data, bought)).toEqual([])
  })

  it('lỗi: thiếu tiền, vượt chồng, số lượng sai, không ở thị trấn', () => {
    expectActionError(() => buy(town(500), 2), 'notEnoughMoney')
    const full = town(1e9, { [FIXTURE_INCENSE_ID]: Number.MAX_SAFE_INTEGER })
    expectActionError(() => buy(full, 1), 'stackLimitReached')
    expectActionError(() => buy(town(1000), 0), 'malformedAction')
    expectActionError(() => buy(atFloor(town(1000), 1), 1), 'notInTown')
  })
})

describe('Miếu: cửa hàng thần', () => {
  const town = (stacks: Record<string, number>, favor = 0): GameState =>
    withFavor(
      { ...makeGameState({ seed: 1, party: [ally('a')] }), inventory: makeInventory(stacks) },
      favor
    )
  const buy = (state: GameState, itemId: string, count: unknown): GameState =>
    act(data, state, {
      type: 'buyDeityItem',
      deityId: FIXTURE_DEITY_ID,
      itemId,
      count
    } as GameAction)

  it('đổi tín vật lấy món (giá × số lượng)', () => {
    const bought = buy(town({ [FIXTURE_DEITY_TOKEN_ID]: 7 }), 'potion', 3)
    expect(bought.inventory.stacks[FIXTURE_DEITY_TOKEN_ID]).toBe(1)
    expect(bought.inventory.stacks.potion).toBe(3)
    expect(validateGameState(data, bought)).toEqual([])
  })

  it('món mở theo bậc: chưa đủ bậc báo lỗi, đủ bậc thì mua được', () => {
    const low = town({ [FIXTURE_DEITY_TOKEN_ID]: 5 }, 39)
    expectActionError(() => buy(low, 'masterBall', 1), 'blessingRankTooLow', {
      deityId: FIXTURE_DEITY_ID,
      rank: 1,
      need: 2
    })
    const high = town({ [FIXTURE_DEITY_TOKEN_ID]: 5 }, 40)
    expect(buy(high, 'masterBall', 1).inventory.stacks.masterBall).toBe(1)
  })

  it('lỗi: món không bán, thiếu tín vật, vượt chồng, giá tràn số; state giữ nguyên', () => {
    const state = town({ [FIXTURE_DEITY_TOKEN_ID]: 3 })
    expectActionError(() => buy(state, 'ball', 1), 'deityItemNotSold', { itemId: 'ball' })
    expectActionError(() => buy(state, 'potion', 2), 'notEnoughItem', {
      itemId: FIXTURE_DEITY_TOKEN_ID,
      have: 3,
      need: 4
    })
    const full = town({ [FIXTURE_DEITY_TOKEN_ID]: 3, potion: Number.MAX_SAFE_INTEGER })
    expectActionError(() => buy(full, 'potion', 1), 'stackLimitReached')
    expectActionError(() => buy(state, 'potion', Number.MAX_SAFE_INTEGER), 'notEnoughItem')
    expectActionError(() => buy(state, 'potion', -1), 'malformedAction')
    expect(state.inventory.stacks[FIXTURE_DEITY_TOKEN_ID]).toBe(3)
  })
})

describe('save', () => {
  it('favor: object Decimal nguyên ≥ 0 (id thần không cần khớp dữ liệu)', () => {
    const state = makeGameState({ seed: 1, party: [ally('a')] })
    expect(validateGameState(data, { ...state, favor: { oldGod: toBig(5) } })).toEqual([])
    expect(validateGameState(data, { ...state, favor: null })).toEqual(['favor phải là object'])
    expect(validateGameState(data, { ...state, favor: { x: toBig(-1) } })).toHaveLength(1)
    expect(validateGameState(data, { ...state, favor: { x: toBig(1.5) } })).toEqual([
      'favor.x phải là số nguyên'
    ])
  })

  it('lưu / đọc giữ ân sủng cực lớn; migrate v82 → v83 thêm favor rỗng', () => {
    const state = withFavor(makeGameState({ seed: 1 }), toBig('1e300'))
    expect(migrateState(serializeState(state), data)).toEqual(state)
    const old = serializeState(makeGameState({ seed: 1 })) as Record<string, unknown>
    const { favor: _favor, ...rest } = old
    const migrated = migrateState({ ...rest, version: 82 }, data)
    expect(migrated.favor).toEqual({})
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesOf = (edit: (raw: RawGameData) => void): string[] =>
    dataIssuesAfter(edit, { regenerateText: true })
  const deityOf = (raw: RawGameData): RawGameData['deities'][number] => defined(raw.deities[0])

  it('dữ liệu fixture và map trỏ tới thần hợp lệ', () => {
    expect(issuesOf((raw) => (raw.biomes[0].deityId = FIXTURE_DEITY_ID))).toEqual([])
  })

  it('báo lỗi: map trỏ thần lạ, hệ lạ, tín vật sai, chúc phúc rỗng / sai, cửa hàng sai, config sai', () => {
    expect(issuesOf((raw) => (raw.biomes[0].deityId = 'ghost'))).toEqual([
      'Biome "field": thần không tồn tại "ghost"'
    ])
    expect(issuesOf((raw) => (deityOf(raw).elementId = 'void'))).toEqual([
      'Thần "fireGod": hệ không tồn tại "void"'
    ])
    expect(issuesOf((raw) => (deityOf(raw).tokenItemId = 'nothing'))).toHaveLength(1)
    expect(issuesOf((raw) => (deityOf(raw).tokenItemId = 'masterBall'))).toEqual([])
    expect(issuesOf((raw) => (deityOf(raw).blessings = []))).toEqual([
      'Thần "fireGod": blessings phải là danh sách không rỗng'
    ])
    expect(
      issuesOf((raw) => {
        deityOf(raw).blessings = [{ effects: [{ type: 'luck' as 'expPercent', params: {} }] }]
      })
    ).toEqual(['Thần "fireGod": blessings[0].effects[0]: loại hiệu ứng lạ "luck"'])
    expect(
      issuesOf((raw) => {
        deityOf(raw).blessings = [{ effects: [{ type: 'expPercent', params: { percent: 0 } }] }]
      })
    ).toEqual(['Thần "fireGod": blessings[0].effects[0] (expPercent): percent phải khác 0'])
    expect(
      issuesOf((raw) => {
        deityOf(raw).shop = [
          { itemId: 'potion', price: 0, minRank: 0 },
          { itemId: 'potion', price: 1, minRank: -1 }
        ]
      })
    ).toHaveLength(3)
    expect(issuesOf((raw) => (raw.config.deities.rankBase = 0))).toEqual([
      'config.deities.rankBase phải là số dương, nhận 0'
    ])
    expect(issuesOf((raw) => (raw.config.deities.tokenWildChance = 101))).toHaveLength(1)
    expect(issuesOf((raw) => (raw.config.deities.incenseItemId = 'nothing'))).toHaveLength(1)
    expect(issuesOf((raw) => (raw.config.deities.incenseItemId = 'megaRing'))).toEqual([
      'config.deities.incenseItemId: Hương nến "megaRing" phải có price'
    ])
  })
})
