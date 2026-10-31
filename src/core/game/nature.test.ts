// Tính cách (docs/rules/natures.md): hệ số chỉ số, sinh random, breeding có / không Bất Biến Thạch,
// Bạc Hà Tính Cách, fuse / tiến hóa giữ, kiểm tra dữ liệu / quái, MonsterView, đồ rơi boss, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'
import { getItemCount } from '../inventory'
import { createGameData } from '../gameData'
import { computeStats, getMaxHp, uniformBigStats, validateMonster } from '../monster'
import { evolveMonster, fuseMonsters, makeOffspring } from '../progression'
import { getMonsterView } from '../roster'
import { rollMonster } from '../world'
import { createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BigStats, GameData, GameState, Monster } from '../model'

// Fixture: hardy (trung tính), brave (+công −tốc), modest (+đặc công −công); percent 10.
const data = makeData()

const withTraitsOf = (monster: Monster, game: GameData = data): BigStats =>
  computeStats(game, monster).withTraits

describe('chỉ số theo tính cách', () => {
  it('up +10%, down −10% ở bước áp trait; chỉ số khác và HP không đổi; nguồn % "nature"', () => {
    const neutral = withTraitsOf(makeMonster({ natureId: 'hardy' }))
    const breakdown = computeStats(data, makeMonster({ natureId: 'brave' }))
    expect(breakdown.withTraits.attack.toNumber()).toBeCloseTo(neutral.attack.toNumber() * 1.1)
    expect(breakdown.withTraits.speed.toNumber()).toBeCloseTo(neutral.speed.toNumber() * 0.9)
    for (const stat of ['hp', 'defense', 'spAttack', 'spDefense'] as const) {
      expect(breakdown.withTraits[stat]).toEqual(neutral[stat])
    }
    expect(breakdown.percentBySource.nature).toEqual({
      hp: 0,
      attack: 10,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: -10
    })
  })

  it('tính cách trung tính: không có % nào', () => {
    const breakdown = computeStats(data, makeMonster({ natureId: 'hardy' }))
    expect(Object.values(breakdown.percentBySource.nature).every((p) => p === 0)).toBe(true)
  })

  it('cộng chung tổng % với nguồn khác (không nhân): trait −10% công + modest −10% = −20%', () => {
    const raw = makeRawData()
    raw.traits.push({
      id: 'weakArm',
      kind: 'negative',
      hooks: [{ type: 'statModifier', params: { percent: { attack: -10 } } }]
    })
    const game = createGameData(withFixtureText(raw))
    const neutral = withTraitsOf(makeMonster({ natureId: 'hardy' }), game)
    const both = withTraitsOf(
      makeMonster({ natureId: 'modest', traits: [{ id: 'weakArm', level: 1 }] }),
      game
    )
    expect(both.attack.toNumber()).toBeCloseTo(neutral.attack.toNumber() * 0.8)
  })

  it('biên: percent 0 không đổi; percent 100 hạ chỉ số down về tối thiểu 1; số cực lớn', () => {
    const at = (percent: number): GameData => {
      const raw = makeRawData()
      raw.config.nature.percent = percent
      return createGameData(raw)
    }
    const brave = makeMonster({ natureId: 'brave' })
    expect(withTraitsOf(brave, at(0))).toEqual(withTraitsOf(makeMonster({ natureId: 'hardy' })))
    expect(computeStats(at(100), brave).final.speed).toEqual(toBig(1))
    const huge = makeMonster({ natureId: 'brave', genes: uniformBigStats('1e300') })
    const hugeNeutral = { ...huge, natureId: 'hardy' }
    const ratio = withTraitsOf(huge).attack.div(withTraitsOf(hugeNeutral).attack)
    expect(ratio.toNumber()).toBeCloseTo(1.1)
    expect(withTraitsOf(huge).speed.isFinite()).toBe(true)
  })
})

describe('sinh quái random tính cách', () => {
  const spec = {
    encounters: [{ speciesId: 'weakling', weight: 1 }],
    levelMin: 1,
    levelMax: 5,
    geneMultiplier: toBig(1),
    shinyChance: 0,
    aging: false
  }

  it('rollMonster tung đều trong natures.json: đủ mọi tính cách qua nhiều seed, tất định', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const [monster] = rollMonster(data, createRng(seed), spec, 'w')
      expect(monster.natureId in data.natures).toBe(true)
      seen.add(monster.natureId)
      expect(rollMonster(data, createRng(seed), spec, 'w')[0].natureId).toBe(monster.natureId)
    }
    expect([...seen].sort()).toEqual(Object.keys(data.natures).sort())
  })

  it('tung tính cách sau cùng: các giá trị random phía trước không đổi khi bỏ tính cách', () => {
    const raw = makeRawData()
    raw.natures = [{ id: 'hardy' }]
    raw.items = raw.items.filter((item) => item.id !== 'mintBrave')
    const single = createGameData(withFixtureText(raw))
    const [a] = rollMonster(data, createRng(7), spec, 'w')
    const [b] = rollMonster(single, createRng(7), spec, 'w')
    expect({ ...a, natureId: 'x' }).toEqual({ ...b, natureId: 'x' })
  })
})

describe('breeding', () => {
  const male = (overrides: MonsterOverrides = {}): Monster =>
    makeMonster({ id: 'd', gender: 'male', natureId: 'brave', ...overrides })
  const female = (overrides: MonsterOverrides = {}): Monster =>
    makeMonster({ id: 'm', gender: 'female', natureId: 'modest', ...overrides })
  const stone = { equipment: [{ storage: 'stack' as const, itemId: 'everstone' }] }

  const childNatures = (father: Monster, mother: Monster): Set<string> => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      seen.add(makeOffspring(data, createRng(seed), father, mother, 'c')[0].natureId)
    }
    return seen
  }

  it('không ai lắp Bất Biến Thạch: random đều mọi tính cách', () => {
    expect([...childNatures(male(), female())].sort()).toEqual(Object.keys(data.natures).sort())
  })

  it('bố hoặc mẹ lắp: con nhận tính cách của bên đó', () => {
    expect([...childNatures(male(stone), female())]).toEqual(['brave'])
    expect([...childNatures(male(), female(stone))]).toEqual(['modest'])
  })

  it('cả hai cùng lắp: tung 50/50 giữa hai tính cách', () => {
    expect([...childNatures(male(stone), female(stone))].sort()).toEqual(['brave', 'modest'])
  })

  it('Bất Biến Thạch không tiêu hao khi breed qua NPC', () => {
    const state = makeGameState({
      seed: 3,
      money: 10_000,
      party: [male(stone), female()]
    })
    const bred = gameReducer(data, state, { type: 'breed', fatherId: 'd', motherId: 'm' })
    expect(defined(bred.eggs[0]).monster.natureId).toBe('brave')
    expect(defined(bred.party[0]).equipment).toEqual(stone.equipment)
  })
})

describe('fuse và tiến hóa giữ tính cách', () => {
  it('fuse: quái gốc giữ tính cách của nó', () => {
    const base = makeMonster({ id: 'a', natureId: 'brave' })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'twig',
      baseSpeciesId: 'twig',
      natureId: 'modest'
    })
    expect(fuseMonsters(data, createRng(1), base, sub)[0].natureId).toBe('brave')
  })

  it('tiến hóa: giữ tính cách', () => {
    const monster = makeMonster({ natureId: 'modest', level: 10 })
    const { monster: evolved } = evolveMonster(data, monster, {
      toSpeciesId: 'strongling',
      rng: createRng(1),
      day: 0
    })
    expect(evolved.natureId).toBe('modest')
  })
})

describe('Bạc Hà Tính Cách', () => {
  const withMint = (natureId: string, count = 1): GameState => ({
    ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a', natureId })] }),
    inventory: makeInventory({ mintBrave: count })
  })
  const useMint = { type: 'useItem', itemId: 'mintBrave', monsterId: 'a' } as const

  it('ngoài trận: đặt natureId mới, tiêu một bạc hà', () => {
    const used = gameReducer(data, withMint('hardy', 2), useMint)
    expect(defined(used.party[0]).natureId).toBe('brave')
    expect(getItemCount(used.inventory, 'mintBrave')).toBe(1)
  })

  it('lỗi: đã đúng tính cách (không mất bạc hà), dùng trong trận, không có bạc hà', () => {
    expectActionError(() => gameReducer(data, withMint('brave'), useMint), 'itemNoEffect', {
      itemId: 'mintBrave',
      monsterId: 'a'
    })
    const battle = {
      ...makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e', history: null })]),
      inventory: makeInventory({ mintBrave: 1 })
    }
    expectActionError(
      () =>
        gameReducer(data, battle, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'item', itemId: 'mintBrave', targetId: 'a' }]
        }),
      'itemWrongContext'
    )
    expectActionError(() => gameReducer(data, withMint('hardy', 0), useMint), 'notEnoughItem')
  })
})

describe('kiểm tra dữ liệu và quái', () => {
  it('dữ liệu thật hợp lệ đủ cơ chế: fixture không báo lỗi', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('báo lỗi: up thiếu down, chỉ số hp / lạ, trường lạ, danh sách rỗng, config sai', () => {
    expect(
      dataIssuesAfter(
        (raw) => {
          raw.natures = [
            { id: 'hardy' },
            { id: 'brave', up: 'attack', down: 'speed' },
            { id: 'half', up: 'attack' },
            // Ép kiểu để thử dữ liệu sai (JSON có thể ghi bất kỳ chuỗi nào).
            { id: 'hpUp', up: 'hp' as 'attack', down: 'speed' },
            { id: 'odd', up: 'attack', down: 'speed', extra: 1 } as never
          ]
        },
        { regenerateText: true }
      )
    ).toEqual([
      'Tính cách "half": up và down phải cùng có hoặc cùng bỏ trống',
      'Tính cách "hpUp": up phải là chỉ số khác hp, nhận "hp"',
      'Tính cách "odd": trường "extra" không thuộc tính cách'
    ])
    expect(
      dataIssuesAfter(
        (raw) => {
          raw.natures = []
        },
        { regenerateText: true }
      )
    ).toContain('natures: cần ít nhất một tính cách')
    expect(
      dataIssuesAfter((raw) => {
        raw.config.nature = { percent: -1, bossDrops: [{ itemId: 'nope', chance: 5 }] }
      })
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/config\.nature\.percent/),
        expect.stringMatching(/config\.nature\.bossDrops.*nope/)
      ])
    )
  })

  it('báo lỗi: Bạc Hà trỏ tính cách không tồn tại; inheritNature có tham số', () => {
    const issues = dataIssuesAfter((raw) => {
      for (const item of raw.items) {
        if (item.id === 'mintBrave' && item.category === 'consumable') {
          item.effects = [{ type: 'setNature', params: { natureId: 'nope' } }]
        }
        if (item.id === 'everstone' && item.category === 'held') {
          item.hooks = [{ type: 'inheritNature', params: { x: 1 } }]
        }
      }
    })
    expect(issues.join('\n')).toMatch(/natureId: tính cách không tồn tại "nope"/)
    expect(issues.join('\n')).toMatch(/inheritNature/)
  })

  it('quái có natureId không tồn tại thì không hợp lệ', () => {
    expect(validateMonster(data, makeMonster({ natureId: 'nope' })).join()).toMatch(/natureId/)
    expect(validateMonster(data, makeMonster({ natureId: 'brave' }))).toEqual([])
  })
})

describe('MonsterView và đồ rơi boss', () => {
  it('MonsterView có tính cách, chỉ số tăng / giảm, % và nguồn % nature', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a', natureId: 'brave' })] })
    const view = defined(getMonsterView(data, state, 'a'))
    expect(view.nature).toEqual({ id: 'brave', up: 'attack', down: 'speed', percent: 10 })
    expect(view.statPercents.nature.attack).toBe(10)
    const neutral = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    expect(defined(getMonsterView(data, neutral, 'a')).nature).toEqual({
      id: 'hardy',
      up: null,
      down: null,
      percent: 10
    })
  })

  it('config.nature.bossDrops tung khi hạ boss, không tung khi hạ quái thường', () => {
    const raw = makeRawData()
    raw.config.nature.bossDrops = [{ itemId: 'mintBrave', chance: 100 }]
    const dropData = createGameData(raw)
    const win = (isBoss: boolean): GameState => {
      const base = makeMonster({ id: 'e', history: null, skillIds: ['idle'] })
      const enemy = { ...base, damageTaken: getMaxHp(dropData, base).minus(1) }
      const state = makeBattleState([makeMonster({ id: 'a' })], [enemy], { isBoss })
      return gameReducer(dropData, state, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
      })
    }
    const boss = win(true)
    expect(defined(boss.battle).outcome).toBe('won')
    expect(getItemCount(boss.inventory, 'mintBrave')).toBe(1)
    expect(getItemCount(win(false).inventory, 'mintBrave')).toBe(0)
  })
})

describe('migrate v35 → v36', () => {
  const stripNature = (monster: unknown): unknown => {
    const { natureId: _natureId, ...rest } = monster as Record<string, unknown>
    return rest
  }

  it('mọi quái (đội, trứng, quái hoang trong trận) nhận tính cách theo băm id: tất định, hợp lệ', () => {
    const state = makeBattleState(
      [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })],
      [makeMonster({ id: 'e', history: null, contractRealm: null })]
    )
    const raw = serializeState({
      ...state,
      eggs: [{ id: 'g', monster: makeMonster({ id: 'g' }), battlesLeft: 3, infusions: [] }]
    }) as Record<string, unknown>
    const battle = raw.battle as Record<string, unknown>
    const old = {
      ...raw,
      version: 35,
      party: (raw.party as unknown[]).map(stripNature),
      eggs: (raw.eggs as Record<string, unknown>[]).map((egg) => ({
        ...egg,
        monster: stripNature(egg.monster)
      })),
      battle: { ...battle, enemies: (battle.enemies as unknown[]).map(stripNature) }
    }
    const migrated = migrateState(old, data)
    const again = migrateState(old, data)
    const natureIds = [
      ...migrated.party.map((m) => m.natureId),
      defined(migrated.eggs[0]).monster.natureId,
      defined(migrated.battle).enemies[0].natureId
    ]
    for (const natureId of natureIds) expect(natureId in data.natures).toBe(true)
    expect(again).toEqual(migrated)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
