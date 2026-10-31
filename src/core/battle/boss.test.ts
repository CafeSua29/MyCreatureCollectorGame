import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { rawGameData } from '@data'
import { createGameData } from '../gameData'
import { validateMonster } from '../monster'
import { createBossEgg, tickEggs } from '../progression'
import { generateBoss, generateEncounter, generateFloorBoss } from '../world'
import { expReward, moneyReward } from '../monster'
import { getMaxHp } from '../monster'
import { createRng, DataError } from '../shared'
import { listEggs } from '../roster'
import { gameReducer } from '../game'
import {
  atFloor,
  defined,
  makeBattleState,
  makeData,
  makeMonster,
  makeRawData,
  makeInventory,
  makeGameState,
  fixtureSite
} from '../testing'
import type { BattleEvent, Egg, GameAction, GameData, GameState, Monster } from '../model'

// Fixture: biome "lair" (tầng 2) luôn ra boss ngẫu nhiên strongling level 3, bossMultiplier 3;
// boss strongling rơi masterBall 100%; tỉ lệ rơi trứng 100%. Biome "field" (tầng 1) không có boss
// ngẫu nhiên. Trait boss: "bossBlood". Boss tầng, mở tầng: battle/floors.test.ts.
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

/** Boss strongling level 4 ×3 chỉ biết idle; còn `hpLeft` máu. */
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

const bossBattle = (party: Monster[], enemy: Monster): GameState =>
  makeBattleState(party, [enemy], { floor: 2, isBoss: true })

const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const

describe('gặp boss', () => {
  it('biome có boss ngẫu nhiên và trúng tỉ lệ: một boss đánh một mình, chưa mang trait boss', () => {
    const encounter = generateEncounter(data, createRng(1), fixtureSite(data, 2), 10)
    expect(encounter.isBoss).toBe(true)
    expect(encounter.enemies).toHaveLength(1)
    const [enemy] = encounter.enemies
    // Boss ngẫu nhiên level như quái thường của tầng 2 (level 3 trong fixture).
    expect(enemy).toMatchObject({ id: 'm10', speciesId: 'strongling', level: 3, bossMultiplier: 3 })
    expect(enemy.traits.some((t) => t.id === 'bossBlood')).toBe(false)
    expect(encounter.nextMonsterId).toEqual(11)
  })

  it('biome không có boss ngẫu nhiên: không tung tỉ lệ boss (không tốn RNG), trận thường', () => {
    const custom = dataWith((raw) => (raw.config.boss.chance = 50))
    const encounter = generateEncounter(custom, createRng(1), fixtureSite(custom, 1), 10)
    expect(encounter.isBoss).toBe(false)
    expect(encounter).toEqual(generateEncounter(data, createRng(1), fixtureSite(data, 1), 10))
  })

  it('biome không ghi đè tỉ lệ thì dùng tỉ lệ chung; bossMultiplier là số nguyên trong khoảng', () => {
    const custom = dataWith((raw) => {
      raw.config.boss.chance = 100
      raw.biomes[0].bosses = [{ speciesId: 'weakling', weight: 1, drops: [] }]
      raw.biomes[0].floorBossSpeciesId = 'weakling'
    })
    let rng = createRng(9)
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const encounter = generateEncounter(custom, rng, fixtureSite(custom, 1), 1)
      rng = encounter.rng
      expect(encounter.isBoss).toBe(true)
      seen.add(encounter.enemies[0].bossMultiplier)
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5])
  })

  it('vào trận boss: battle.isBoss và log bossAppeared', () => {
    const state = atFloor(makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] }), 2)
    const battle = defined(run(state, { type: 'startWildBattle' }).battle)
    expect(battle.isBoss).toBe(true)
    expect(battle.log).toContainEqual({ type: 'bossAppeared', monsterId: battle.enemies[0].id })
  })

  it('boss của dữ liệu thật hợp lệ', () => {
    const real = createGameData(rawGameData)
    let rng = createRng(2024)
    Object.values(real.biomes).forEach((biome, i) => {
      const site = { floor: i + 1, biome, aging: true, time: 0 }
      const hasRandomBoss = biome.bosses.some((b) => b.weight !== undefined)
      for (let j = 0; j < 5; j++) {
        let monster: Monster
        ;[monster, rng] = hasRandomBoss
          ? generateBoss(real, rng, site, 'b1')
          : generateFloorBoss(real, rng, site, 'b1')
        expect(validateMonster(real, monster)).toEqual([])
        expect(monster.bossMultiplier).toBeGreaterThanOrEqual(2)
        ;[monster, rng] = generateFloorBoss(real, rng, site, 'b2')
        expect(validateMonster(real, monster)).toEqual([])
      }
    })
  })
})

describe('hạ boss', () => {
  it('EXP và tiền × bossMultiplier; rơi đồ thường + đồ hiếm của boss; rơi trứng', () => {
    const state = bossBattle([makeMonster({ id: 'a' })], boss(1))
    const next = run(state, { type: 'submitTurn', commands: [strike] })
    expect(defined(next.battle).outcome).toBe('won')
    // 0,5 × 4² × 3 = 24 EXP; 5 × 4 × 3 = 60 tiền
    expect(next.party[0].exp).toEqual(1 + 24)
    expect(next.money).toEqual(60)
    expect(next.inventory.stacks).toEqual({ potion: 1, masterBall: 1 })
    expect(next.eggs).toHaveLength(1)
    expect(eventsOf(next, 'eggDropped')).toEqual([{ type: 'eggDropped', eggId: next.eggs[0].id }])
  })

  it('trứng boss: dạng đầu tiên của loài boss, level 1, quái thường kèm trait boss cấp 1', () => {
    const next = run(bossBattle([makeMonster({ id: 'a' })], boss(1)), {
      type: 'submitTurn',
      commands: [strike]
    })
    const egg = next.eggs[0]
    expect(egg.id).toBe('m100') // nextMonsterId của makeBattleState
    expect(next.nextMonsterId).toEqual(101)
    expect(egg.monster).toMatchObject({
      id: egg.id,
      speciesId: 'weakling', // strongling tiến hóa từ weakling
      level: 1,
      bossMultiplier: 1
    })
    expect(egg.monster.traits).toContainEqual({ id: 'bossBlood', level: 1 })
    expect(egg.battlesLeft).toBeGreaterThanOrEqual(5)
    expect(egg.battlesLeft).toBeLessThanOrEqual(10)
    expect(validateMonster(data, egg.monster)).toEqual([])
  })

  it('tỉ lệ rơi trứng theo config', () => {
    const never = dataWith((raw) => (raw.config.boss.eggChance = 0))
    const next = run(
      bossBattle([makeMonster({ id: 'a' })], boss(1)),
      { type: 'submitTurn', commands: [strike] },
      never
    )
    expect(next.eggs).toEqual([])
  })
})

describe('bắt boss', () => {
  it('giữ bossMultiplier, nhận trait boss cấp 1, không rơi trứng; EXP × bossMultiplier', () => {
    const state = {
      ...bossBattle([makeMonster({ id: 'a' })], boss(1)),
      inventory: makeInventory({ masterBall: 1 })
    }
    const next = run(state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'item', itemId: 'masterBall', targetId: 'boss' }]
    })
    expect(defined(next.battle).outcome).toBe('won')
    const caught = defined(next.party.find((m) => m.id === 'boss'))
    expect(caught.bossMultiplier).toEqual(3)
    expect(caught.traits).toContainEqual({ id: 'bossBlood', level: 1 })
    expect(validateMonster(data, caught)).toEqual([])
    expect(next.eggs).toEqual([])
    expect(next.party[0].exp).toEqual(1 + 24)
    expect(next.money).toEqual(0)
  })

  it('quái đã có trait boss bị bắt làm boss lần nữa thì gộp cấp', () => {
    const state = {
      ...bossBattle(
        [makeMonster({ id: 'a' })],
        boss(1, { traits: [{ id: 'bossBlood', level: 1 }] })
      ),
      inventory: makeInventory({ masterBall: 1 })
    }
    const next = run(state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'item', itemId: 'masterBall', targetId: 'boss' }]
    })
    expect(defined(next.party.find((m) => m.id === 'boss')).traits).toContainEqual({
      id: 'bossBlood',
      level: 2
    })
  })

  it('thưởng EXP/tiền nhân cả shiny lẫn boss', () => {
    const shinyBoss = makeMonster({ level: 4, exp: 64, bossMultiplier: 2, shinyStacks: 1 })
    expect(expReward(data, shinyBoss)).toEqual(24) // 8 × 1,5 × 2
    expect(moneyReward(data, shinyBoss)).toEqual(60) // 20 × 1,5 × 2
  })
})

describe('trứng nở', () => {
  const eggOf = (id: string, battlesLeft: number): Egg => ({
    id,
    battlesLeft,
    monster: makeMonster({ id, traits: [{ id: 'bossBlood', level: 1 }] })
  })

  it('tickEggs: giảm bộ đếm, tách trứng đến lúc nở', () => {
    const { eggs, hatched } = tickEggs([eggOf('x', 1), eggOf('y', 3)], 1)
    expect(hatched.map((m) => m.id)).toEqual(['x'])
    expect(eggs).toEqual([{ ...eggOf('y', 3), battlesLeft: 2 }])
  })

  it('mỗi trận thắng quái hoang: trứng đếm ngược, nở vào đội (log eggHatched)', () => {
    const state = {
      ...makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e', damageTaken: 49 })]),
      eggs: [eggOf('x', 1), eggOf('y', 3)]
    }
    const next = run(state, { type: 'submitTurn', commands: [strike] })
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.party.map((m) => m.id)).toEqual(['a', 'x'])
    expect(next.eggs.map((e) => [e.id, e.battlesLeft])).toEqual([['y', 2]])
    expect(eventsOf(next, 'eggHatched')).toEqual([
      { type: 'eggHatched', monsterId: 'x', destination: 'party' }
    ])
  })

  it('đội đầy thì quái nở vào kho', () => {
    const party = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeMonster({ id }))
    const state = {
      ...makeBattleState(party, [makeMonster({ id: 'z', damageTaken: 49 })]),
      eggs: [eggOf('x', 1)]
    }
    const next = run(state, {
      type: 'submitTurn',
      commands: [strike, { slot: 1, kind: 'skill', skillId: 'strike' }]
    })
    expect(next.storage.map((m) => m.id)).toEqual(['x'])
  })

  it('trứng rơi trong chính trận đó chưa bị đếm', () => {
    const state = { ...bossBattle([makeMonster({ id: 'a' })], boss(1)), eggs: [eggOf('x', 1)] }
    const next = run(state, { type: 'submitTurn', commands: [strike] })
    expect(next.party.map((m) => m.id)).toContain('x')
    expect(next.eggs).toHaveLength(1)
    expect(next.eggs[0].battlesLeft).toBeGreaterThanOrEqual(5)
  })

  it('thua hoặc chạy trốn thì trứng không đếm', () => {
    const always = dataWith((raw) => (raw.config.battle.fleeChance = 100))
    const state = {
      ...makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })]),
      eggs: [eggOf('x', 1)]
    }
    const fled = run(state, { type: 'flee' }, always)
    expect(fled.eggs).toEqual(state.eggs)
  })

  it('listEggs chỉ cho biết id và số trận còn lại', () => {
    const state = { ...makeGameState({ seed: 1, party: [makeMonster()] }), eggs: [eggOf('x', 4)] }
    expect(listEggs(state)).toEqual([{ id: 'x', battlesLeft: 4 }])
  })

  it('createBossEgg tất định theo RNG', () => {
    const enemy = boss(1)
    const options = { boss: enemy, id: 'm9', floor: 1, aging: false, day: 0, tamerRealm: 0 }
    expect(createBossEgg(data, createRng(5), options)).toEqual(
      createBossEgg(data, createRng(5), options)
    )
  })
})

describe('kiểm tra dữ liệu boss và trứng', () => {
  function issues(edit: (raw: ReturnType<typeof makeRawData>) => void): string {
    try {
      dataWith(edit)
      return ''
    } catch (error) {
      if (error instanceof DataError) return error.issues.join('\n')
      throw error
    }
  }

  it('báo lỗi config và boss của biome', () => {
    expect(issues((raw) => (raw.config.boss.traitId = 'fast'))).toMatch(/loại "boss"/)
    expect(issues((raw) => (raw.config.boss.multiplierMax = 1))).toMatch(/boss\.multiplierMax/)
    expect(issues((raw) => (raw.config.egg.hatchBattlesMin = 0))).toMatch(/egg\.hatchBattlesMin/)
    expect(
      issues((raw) => {
        const lair = defined(raw.biomes.find((b) => b.id === 'lair'))
        lair.bosses[0].drops = [{ itemId: 'nope', chance: 10 }]
      })
    ).toMatch(/vật phẩm rơi không tồn tại "nope"/)
  })
})
