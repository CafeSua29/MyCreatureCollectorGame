import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { createGameData } from '../gameData'
import { getMaxHp, validateMonster } from '../monster'
import { ActionError, toBig } from '../shared'
import { gameReducer } from '../game'
import {
  atFloor,
  defined,
  makeBattleState,
  makeData,
  makeInventory,
  makeMonster,
  makeRawData,
  expectActionError,
  makeGameState,
  fixtureFloorBiomeIds
} from '../testing'
import type { BattleEvent, GameAction, GameData, GameState, Monster } from '../model'

// Fixture: levelPerFloor 2. Tầng 1 "field" (boss tầng strongling, không có boss ngẫu nhiên),
// tầng 2 "lair" (boss tầng strongling, luôn gặp boss ngẫu nhiên strongling ×3), tầng 3 "pairs"
// (boss tầng weakling). Boss strongling rơi masterBall 100%, trứng 100%.
const data = makeData()

const run = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

function dataWith(edit: (raw: ReturnType<typeof makeRawData>) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const
const throwMasterBall = {
  slot: 0,
  kind: 'item',
  itemId: 'masterBall',
  targetId: 'boss'
} as const

/** Boss chỉ biết idle, còn `hpLeft` máu (mặc định strongling). */
function boss(hpLeft: number, overrides: MonsterOverrides = {}): Monster {
  const base = makeMonster({
    id: 'boss',
    speciesId: 'strongling',
    baseSpeciesId: 'strongling',
    elementIds: ['fire'],
    level: 4,
    exp: 64,
    bossMultiplier: 3,
    skillIds: ['idle'],
    ...overrides
  })
  return { ...base, damageTaken: getMaxHp(data, base).minus(hpLeft) }
}

/** Trận boss ở `floor` với highestFloor cho trước. */
function bossBattleAt(floor: number, highestFloor: number, enemy: Monster = boss(1)): GameState {
  const state = makeBattleState([makeMonster({ id: 'a' })], [enemy], { floor, isBoss: true })
  return {
    ...state,
    highestFloor,
    floorBiomeIds: fixtureFloorBiomeIds(highestFloor),
    inventory: makeInventory({ masterBall: 1 })
  }
}

describe('challengeBoss', () => {
  const party = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })]
  const onFloor = (floor: number): GameState =>
    atFloor(makeGameState({ seed: 3, party, nextMonsterId: 10 }), floor)

  it('gọi boss tầng: một boss level cố định, bossMultiplier random, log bossAppeared', () => {
    const next = run(onFloor(1), { type: 'challengeBoss' })
    const battle = defined(next.battle)
    expect(battle).toMatchObject({ floor: 1, isBoss: true, phase: 'chooseActions' })
    expect(battle.enemies).toHaveLength(1)
    const [enemy] = battle.enemies
    // Tầng 1, levelPerFloor 2: boss tầng level 2.
    expect(enemy).toMatchObject({ id: 'm10', speciesId: 'strongling', level: 2 })
    expect(enemy.bossMultiplier).toBeGreaterThanOrEqual(2)
    expect(enemy.bossMultiplier).toBeLessThanOrEqual(5)
    expect(validateMonster(data, enemy)).toEqual([])
    expect(battle.log).toContainEqual({ type: 'bossAppeared', monsterId: 'm10' })
    expect(battle.playerSlots).toEqual(['a', 'b'])
    expect(next.nextMonsterId).toBe(11)
  })

  it('dùng ghi đè bossMultiplier của biome; boss tầng ở vòng biome sau level cao hơn', () => {
    const lair = defined(run(onFloor(2), { type: 'challengeBoss' }).battle).enemies[0]
    expect(lair).toMatchObject({ speciesId: 'strongling', level: 4, bossMultiplier: 3 })
    // Tầng 4 quay lại biome "field".
    const high = defined(run(onFloor(4), { type: 'challengeBoss' }).battle).enemies[0]
    expect(high).toMatchObject({ speciesId: 'strongling', level: 8 })
  })

  it('miễn phí, gọi lại được nhiều lần; tất định theo RNG', () => {
    const state = { ...onFloor(1), money: toBig(7) }
    const first = run(state, { type: 'challengeBoss' })
    expect(first.money).toEqual(7)
    expect(run(state, { type: 'challengeBoss' })).toEqual(first)
    const fled = { ...first, battle: { ...defined(first.battle), phase: 'ended' as const } }
    const again = run(run(fled, { type: 'leaveBattle' }), { type: 'challengeBoss' })
    expect(defined(again.battle).isBoss).toBe(true)
  })

  it('báo lỗi, state giữ nguyên: ở thị trấn, đang trong trận, cả đội đã gục', () => {
    const town = makeGameState({ seed: 3, party })
    expectActionError(() => run(town, { type: 'challengeBoss' }), 'notOnFloor')
    const inBattle = run(onFloor(1), { type: 'challengeBoss' })
    expectActionError(() => run(inBattle, { type: 'challengeBoss' }), 'inBattle')
    const fainted = makeMonster({ id: 'a', damageTaken: 1000 })
    const wiped = atFloor(makeGameState({ seed: 3, party: [fainted] }), 1)
    expect(() => run(wiped, { type: 'challengeBoss' })).toThrow(ActionError)
    expect(wiped.battle).toBeNull()
  })
})

describe('mở tầng', () => {
  it('hạ boss tầng ở tầng highestFloor: mở tầng tiếp theo, log floorUnlocked', () => {
    const next = run(bossBattleAt(2, 2), { type: 'submitTurn', commands: [strike] })
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.highestFloor).toBe(3)
    const biomeId = next.floorBiomeIds[2]
    expect(eventsOf(next, 'floorUnlocked')).toEqual([{ type: 'floorUnlocked', floor: 3, biomeId }])
    // Tầng mới được tung map (một trong các biome), các tầng cũ giữ nguyên.
    expect(['field', 'lair', 'pairs']).toContain(biomeId)
    expect(next.floorBiomeIds.slice(0, 2)).toEqual(bossBattleAt(2, 2).floorBiomeIds)
  })

  it('bắt boss tầng cũng mở tầng', () => {
    const next = run(bossBattleAt(1, 1), { type: 'submitTurn', commands: [throwMasterBall] })
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.party.some((m) => m.id === 'boss')).toBe(true)
    expect(next.highestFloor).toBe(2)
  })

  it('boss tầng gặp ngẫu nhiên (startWildBattle) mà hạ được thì cũng mở tầng', () => {
    const start = atFloor(makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] }), 2)
    const battle = run(start, { type: 'startWildBattle' })
    const enemy = defined(battle.battle).enemies[0]
    expect(enemy.speciesId).toBe('strongling')
    // Cho boss còn 1 máu và chỉ biết idle để một đòn là hạ.
    const weakened = {
      ...battle,
      battle: {
        ...defined(battle.battle),
        enemies: [{ ...enemy, skillIds: ['idle'], damageTaken: getMaxHp(data, enemy).minus(1) }]
      }
    }
    const next = run(weakened, { type: 'submitTurn', commands: [strike] })
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.highestFloor).toBe(3)
  })

  it('không mở: hạ boss tầng ở tầng thấp hơn highestFloor', () => {
    const next = run(bossBattleAt(1, 3), { type: 'submitTurn', commands: [strike] })
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.highestFloor).toBe(3)
    expect(eventsOf(next, 'floorUnlocked')).toEqual([])
  })

  it('không mở: boss ngẫu nhiên khác loài boss tầng', () => {
    const custom = dataWith((raw) => {
      raw.biomes[1].bosses.push({ speciesId: 'twig', weight: 1, drops: [] })
    })
    const twig = boss(1, { speciesId: 'twig', baseSpeciesId: 'twig', elementIds: ['grass'] })
    const next = run(bossBattleAt(2, 2, twig), { type: 'submitTurn', commands: [strike] }, custom)
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.highestFloor).toBe(2)
  })

  it('không mở: trận thường có quái cùng loài boss tầng (không phải trận boss)', () => {
    const state = {
      ...makeBattleState([makeMonster({ id: 'a' })], [boss(1, { bossMultiplier: 1 })]),
      highestFloor: 1
    }
    const next = run(state, { type: 'submitTurn', commands: [strike] })
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.highestFloor).toBe(1)
  })

  it('không mở: chạy trốn hoặc thua', () => {
    const always = dataWith((raw) => (raw.config.battle.fleeChance = 100))
    const fled = run(bossBattleAt(2, 2), { type: 'flee' }, always)
    expect(defined(fled.battle).outcome).toBe('fled')
    expect(fled.highestFloor).toBe(2)

    const hitter = boss(1000, { skillIds: ['strike'], level: 50, exp: 125000 })
    const weak = makeMonster({
      id: 'a',
      skillIds: ['idle'],
      damageTaken: getMaxHp(data, makeMonster()).minus(1)
    })
    const losing = { ...bossBattleAt(2, 2, hitter), party: [weak] }
    const idle = { slot: 0, kind: 'skill', skillId: 'idle' } as const
    const lost = run(losing, { type: 'submitTurn', commands: [idle] })
    expect(defined(lost.battle).outcome).toBe('lost')
    expect(lost.highestFloor).toBe(2)
  })

  it('tầng rất cao vẫn mở tiếp được', () => {
    const floor = 1_000_000
    const next = run(bossBattleAt(floor, floor), { type: 'submitTurn', commands: [strike] })
    expect(next.highestFloor).toBe(floor + 1)
  })
})

describe('đồ rơi của boss: bảng chung của biome + bảng riêng của từng boss', () => {
  // Biome "lair": mọi boss rơi chung "ball"; hai boss có đồ riêng khác nhau.
  const custom = dataWith((raw) => {
    raw.biomes[1].bossDrops = [{ itemId: 'ball', chance: 100 }]
    raw.biomes[1].bosses.push({
      speciesId: 'twig',
      weight: 1,
      drops: [{ itemId: 'fireStone', chance: 100 }]
    })
  })

  it('hạ boss nào thì rơi đồ thường + đồ chung cho boss + đồ riêng của boss đó', () => {
    // bossBattleAt có sẵn 1 masterBall trong túi.
    const strongling = run(bossBattleAt(2, 2), { type: 'submitTurn', commands: [strike] }, custom)
    expect(strongling.inventory.stacks).toEqual({ potion: 1, ball: 1, masterBall: 2 })
    expect(eventsOf(strongling, 'drop').map((e) => e.itemId)).toEqual([
      'potion',
      'ball',
      'masterBall'
    ])

    const twig = boss(1, { speciesId: 'twig', baseSpeciesId: 'twig', elementIds: ['grass'] })
    const next = run(bossBattleAt(2, 2, twig), { type: 'submitTurn', commands: [strike] }, custom)
    expect(next.inventory.stacks).toEqual({ potion: 1, ball: 1, masterBall: 1, fireStone: 1 })
  })

  it('bảng chung dùng cho cả boss tầng gọi bằng challengeBoss', () => {
    const start = atFloor(makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] }), 2)
    const battle = run(start, { type: 'challengeBoss' }, custom)
    const enemy = defined(battle.battle).enemies[0]
    const weakened = {
      ...battle,
      battle: {
        ...defined(battle.battle),
        enemies: [{ ...enemy, skillIds: ['idle'], damageTaken: getMaxHp(custom, enemy).minus(1) }]
      }
    }
    const next = run(weakened, { type: 'submitTurn', commands: [strike] }, custom)
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.inventory.stacks).toEqual({ potion: 1, ball: 1, masterBall: 1 })
  })

  it('trận thường không tung đồ chung lẫn đồ riêng của boss dù cùng loài', () => {
    const state = makeBattleState([makeMonster({ id: 'a' })], [boss(1, { bossMultiplier: 1 })], {
      floor: 2
    })
    const next = run(state, { type: 'submitTurn', commands: [strike] }, custom)
    expect(next.inventory.stacks).toEqual({ potion: 1 })
  })
})

describe('trứng boss theo tầng', () => {
  it('gen quái trong trứng nhân theo tầng boss rơi trứng', () => {
    const growing = dataWith((raw) => (raw.config.floors.geneGrowthPerFloor = 2))
    // Tầng 3: hệ số 2² = 4, gen fixture 10 → 40.
    const next = run(bossBattleAt(3, 3), { type: 'submitTurn', commands: [strike] }, growing)
    const egg = defined(next.eggs[0])
    expect(Object.values(egg.monster.genes).every((gene) => gene.eq(40))).toBe(true)
    expect(validateMonster(growing, egg.monster)).toEqual([])
  })
})
