// Điểm nỗ lực (docs/rules/effort-values.md): điểm loài (ghi sẵn / suy từ chỉ số gốc), trần mỗi chỉ
// số và trần tổng, % chỉ số, nhận khi thắng trận, đồ cầm Power / Macho, vitamin / quả mọng / bánh
// tẩy, breed / tiến hóa / fuse, view, kiểm tra dữ liệu / quái, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { autoEvolve, fuseMonsters, makeOffspring } from '../progression'
import { getMonsterView } from '../roster'
import { createRng, type Decimal } from '../shared'
import {
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
  BattleCommand,
  GameData,
  GameState,
  Item,
  Monster,
  NormalSpecies,
  RawGameData,
  Stats
} from '../model'
import {
  addEffortValues,
  battleEffortGain,
  computeStats,
  effortTotal,
  getMaxHp,
  speciesEffortYield,
  validateMonster
} from '.'

const points = (partial: Partial<Stats>): Stats => ({
  hp: 0,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
  ...partial
})

/** Fixture có thêm vitamin, quả mọng, bánh tẩy, đồ cầm Power / Macho như dữ liệu thật. */
const EFFORT_ITEMS: Item[] = [
  {
    id: 'protein',
    category: 'consumable',
    price: 1000,
    use: 'field',
    target: 'ally',
    effects: [{ type: 'addEffort', params: { stat: 'attack', amount: 10 } }]
  },
  {
    id: 'pomegBerry',
    category: 'consumable',
    price: 200,
    use: 'field',
    target: 'ally',
    effects: [
      { type: 'addEffort', params: { stat: 'hp', amount: -10 } },
      { type: 'addAffinity', params: { amount: 2 } }
    ]
  },
  {
    id: 'freshStartMochi',
    category: 'consumable',
    price: 3000,
    use: 'field',
    target: 'ally',
    effects: [{ type: 'resetEffort', params: {} }]
  },
  {
    id: 'powerBracer',
    category: 'held',
    price: 3000,
    hooks: [
      { type: 'effortGainBonus', params: { stat: 'attack', amount: 8 } },
      { type: 'statModifier', params: { percent: { speed: -50 } } }
    ],
    persistent: true
  },
  {
    id: 'machoBrace',
    category: 'held',
    price: 3000,
    hooks: [
      { type: 'effortGainModifier', params: { percent: 100 } },
      { type: 'statModifier', params: { percent: { speed: -50 } } }
    ],
    persistent: true
  }
]

function effortRaw(): RawGameData {
  const raw = makeRawData()
  raw.items.push(...EFFORT_ITEMS)
  return withFixtureText(raw)
}

const data: GameData = createGameData(effortRaw())

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 20, skillIds: ['strike'], ...overrides })

const holding = (itemId: string, overrides: MonsterOverrides = {}): Monster =>
  hero({ equipment: [{ storage: 'stack', itemId }], ...overrides })

const weakling = (): NormalSpecies => {
  const species = data.species.weakling
  if (species?.kind !== 'normal') throw new Error('fixture thiếu weakling')
  return species
}

const speciesWith = (baseStats: Stats, effortYield?: Partial<Stats>): NormalSpecies => ({
  ...weakling(),
  baseStats,
  ...(effortYield ? { effortYield } : {})
})

describe('điểm loài cho khi bị hạ', () => {
  it('loài ghi effortYield thì dùng đúng số đó', () => {
    const species = speciesWith(points({ attack: 100 }), { speed: 2, spAttack: 1 })
    expect(speciesEffortYield(data, species)).toEqual({ speed: 2, spAttack: 1 })
  })

  it('bỏ trống: tổng điểm theo bậc tổng chỉ số gốc, dồn vào chỉ số gốc cao nhất', () => {
    // Tổng 180 → bậc 0 (1 điểm); 6 chỉ số hòa → điểm vào chỉ số đầu (hp).
    expect(speciesEffortYield(data, weakling())).toEqual({ hp: 1 })
    // Tổng 600 → bậc 500 (3 điểm), công cao nhất.
    const strong = speciesWith({
      ...points({}),
      hp: 100,
      attack: 150,
      defense: 90,
      spAttack: 80,
      spDefense: 90,
      speed: 90
    })
    expect(speciesEffortYield(data, strong)).toEqual({ attack: 3 })
  })

  it('biên mốc: đúng mốc thuộc bậc trên; hòa nhiều chỉ số thì chia lần lượt', () => {
    // Tổng đúng 400 → 2 điểm, công và tốc độ hòa cao nhất → mỗi chỉ số 1.
    const tied = speciesWith({
      hp: 50,
      attack: 100,
      defense: 50,
      spAttack: 50,
      spDefense: 50,
      speed: 100
    })
    expect(speciesEffortYield(data, tied)).toEqual({ attack: 1, speed: 1 })
    const below = speciesWith({
      hp: 49,
      attack: 100,
      defense: 50,
      spAttack: 50,
      spDefense: 50,
      speed: 100
    })
    expect(speciesEffortYield(data, below)).toEqual({ attack: 1 })
  })

  it('bậc 0 điểm thì loài không cho điểm nào', () => {
    const raw = effortRaw()
    raw.config.effort.derivedYield = [{ minBaseStatTotal: 0, points: 0 }]
    expect(speciesEffortYield(createGameData(raw), weakling())).toEqual({})
  })
})

describe('cộng / trừ điểm và trần', () => {
  it('cộng thường; trần mỗi chỉ số 252', () => {
    expect(addEffortValues(data, hero(), { attack: 10 }).effortValues).toEqual(
      points({ attack: 10 })
    )
    const near = hero({ effortValues: points({ attack: 250 }) })
    expect(addEffortValues(data, near, { attack: 10 }).effortValues.attack).toBe(252)
  })

  it('trần tổng 510: phần vượt bị bỏ, theo thứ tự chỉ số', () => {
    const full = hero({ effortValues: points({ hp: 252, attack: 252 }) })
    const next = addEffortValues(data, full, { defense: 4, speed: 4 })
    expect(next.effortValues).toEqual(points({ hp: 252, attack: 252, defense: 4, speed: 2 }))
    expect(effortTotal(next.effortValues)).toBe(510)
  })

  it('trừ không xuống dưới 0; không đổi gì thì trả lại đúng object cũ', () => {
    const monster = hero({ effortValues: points({ hp: 5 }) })
    expect(addEffortValues(data, monster, { hp: -10 }).effortValues.hp).toBe(0)
    expect(addEffortValues(data, monster, {})).toBe(monster)
    expect(addEffortValues(data, monster, { attack: 0 })).toBe(monster)
    const capped = hero({ effortValues: points({ speed: 252 }) })
    expect(addEffortValues(data, capped, { speed: 1 })).toBe(capped)
  })

  it('số cực lớn bị kẹp ở trần', () => {
    const next = addEffortValues(data, hero(), { attack: 1e15, hp: -1e15 })
    expect(next.effortValues).toEqual(points({ attack: 252 }))
  })
})

describe('chỉ số', () => {
  it('mỗi điểm +percentPerPoint % chỉ số đó (nguồn % effort), kể cả max HP', () => {
    const trained = hero({ effortValues: points({ attack: 252, hp: 100 }) })
    const stats = computeStats(data, trained)
    expect(stats.percentBySource.effort.attack).toBeCloseTo(25.2)
    expect(stats.percentBySource.effort.hp).toBeCloseTo(10)
    expect(stats.percentBySource.effort.speed).toBe(0)
    expect(stats.final.attack.gt(computeStats(data, hero()).final.attack)).toBe(true)
    expect(getMaxHp(data, trained).gt(getMaxHp(data, hero()))).toBe(true)
  })

  it('max HP tính lại khi điểm HP đổi trên cùng object (bộ nhớ max HP)', () => {
    const monster = hero()
    const before = getMaxHp(data, monster)
    monster.effortValues = points({ hp: 252 })
    expect(getMaxHp(data, monster).gt(before)).toBe(true)
  })
})

describe('nhận điểm khi thắng trận', () => {
  const enemy = (id: string): Monster =>
    makeMonster({ id, speciesId: 'weakling', skillIds: ['idle'] })

  it('mỗi quái bị hạ cho điểm của loài; đồ cầm Power cộng thêm mỗi quái; Macho nhân đôi', () => {
    const defeated = [enemy('x'), enemy('y')]
    expect(battleEffortGain(data, hero(), defeated)).toEqual({ hp: 2 })
    expect(battleEffortGain(data, holding('powerBracer'), defeated)).toEqual({ hp: 2, attack: 16 })
    expect(battleEffortGain(data, holding('machoBrace'), defeated)).toEqual({ hp: 4 })
    const both = hero({
      equipment: [
        { storage: 'stack', itemId: 'powerBracer' },
        { storage: 'stack', itemId: 'machoBrace' }
      ]
    })
    expect(battleEffortGain(data, both, defeated)).toEqual({ hp: 4, attack: 32 })
    expect(battleEffortGain(data, holding('powerBracer'), [])).toEqual({})
  })

  it('thắng trận: quái đã ra sân còn sống nhận điểm, quái không ra sân thì không', () => {
    const dyingFoe = enemy('foe')
    const dying = { ...dyingFoe, damageTaken: getMaxHp(data, dyingFoe).minus(1) }
    const bench = hero({ id: 'bench' })
    const state = makeBattleState(
      [
        hero({ level: 50, equipment: [{ storage: 'stack', itemId: 'powerBracer' }] }),
        hero({ id: 'b' }),
        bench
      ],
      [dying]
    )
    const commands: BattleCommand[] = [0, 1].map((slot) => ({
      slot,
      kind: 'skill',
      skillId: 'strike',
      target: 0
    }))
    const won = gameReducer(data, state, { type: 'submitTurn', commands })
    expect(won.battle?.outcome).toBe('won')
    const find = (id: string): Monster => defined(won.party.find((m) => m.id === id))
    expect(find('a').effortValues).toEqual(points({ hp: 1, attack: 8 }))
    // Quái thứ hai đã ra sân (ô 2) nhận điểm loài; quái trong đội không ra sân thì không.
    expect(find('b').effortValues).toEqual(points({ hp: 1 }))
    expect(find('bench').effortValues).toEqual(points({}))
    // Đồ cầm Power không tiêu hao.
    expect(find('a').equipment).toEqual([{ storage: 'stack', itemId: 'powerBracer' }])
  })

  it('Power / Đai Lực Sĩ giảm ½ tốc độ khi cầm (như Pokémon)', () => {
    const speed = (monster: Monster): Decimal => computeStats(data, monster).final.speed
    expect(speed(holding('powerBracer')).toNumber()).toBeCloseTo(speed(hero()).toNumber() / 2, -1)
    expect(computeStats(data, holding('machoBrace')).percentBySource.equipment.speed).toBe(-50)
  })

  it('quái đã gục không nhận điểm', () => {
    const foe = enemy('foe')
    const dying = { ...foe, damageTaken: getMaxHp(data, foe).minus(1) }
    const fallen = hero({ id: 'b' })
    const knocked = { ...fallen, damageTaken: getMaxHp(data, fallen) }
    const state = makeBattleState([hero({ level: 50 }), knocked], [dying])
    const command: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
    const won = gameReducer(data, state, { type: 'submitTurn', commands: [command] })
    expect(defined(won.party.find((m) => m.id === 'b')).effortValues).toEqual(points({}))
  })
})

describe('vật phẩm', () => {
  const town = (monster: Monster, stacks: Record<string, number>): GameState => ({
    ...makeGameState({ seed: 1, party: [monster] }),
    inventory: makeInventory(stacks)
  })
  const use = (state: GameState, itemId: string): GameState =>
    gameReducer(data, state, { type: 'useItem', itemId, monsterId: 'a' })

  it('vitamin +10 tới trần; đã chạm trần thì không có tác dụng, không mất vật phẩm', () => {
    expect(use(town(hero(), { protein: 1 }), 'protein').party[0].effortValues.attack).toBe(10)
    const near = town(hero({ effortValues: points({ attack: 245 }) }), { protein: 2 })
    expect(use(near, 'protein').party[0].effortValues.attack).toBe(252)
    const capped = town(hero({ effortValues: points({ attack: 252 }) }), { protein: 1 })
    expectActionError(() => use(capped, 'protein'), 'itemNoEffect')
  })

  it('quả mọng −10 điểm và + thân mật; 0 điểm vẫn tăng thân mật', () => {
    const trained = use(
      town(hero({ effortValues: points({ hp: 15 }) }), { pomegBerry: 1 }),
      'pomegBerry'
    )
    expect(trained.party[0].effortValues.hp).toBe(5)
    expect(trained.party[0].affinity).toBe(2)
    const untrained = use(town(hero(), { pomegBerry: 1 }), 'pomegBerry')
    expect(untrained.party[0].affinity).toBe(2)
  })

  it('bánh tẩy đưa mọi điểm về 0; chưa có điểm thì không có tác dụng', () => {
    const state = town(hero({ effortValues: points({ hp: 4, speed: 252 }) }), {
      freshStartMochi: 1
    })
    expect(use(state, 'freshStartMochi').party[0].effortValues).toEqual(points({}))
    expectActionError(
      () => use(town(hero(), { freshStartMochi: 1 }), 'freshStartMochi'),
      'itemNoEffect'
    )
  })
})

describe('breed / tiến hóa / fuse / view', () => {
  it('con breeding 0 điểm; tiến hóa giữ; fuse: quái gốc giữ điểm của mình', () => {
    const father = hero({ id: 'f', gender: 'male', effortValues: points({ attack: 50 }) })
    const mother = hero({ id: 'm', gender: 'female', effortValues: points({ speed: 50 }) })
    expect(makeOffspring(data, createRng(1), father, mother, 'egg')[0].effortValues).toEqual(
      points({})
    )
    const before = makeMonster({ level: 10, exp: 1000, effortValues: points({ speed: 7 }) })
    const scene = { party: [], place: null, aptitudeFloor: 1, time: 0 }
    const { monster } = autoEvolve(data, before, { rng: createRng(1), day: 0, scene })
    expect(monster.speciesId).toBe('strongling')
    expect(monster.effortValues.speed).toBe(7)
    const sub = hero({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      effortValues: points({ hp: 9 })
    })
    const [fused] = fuseMonsters(
      data,
      createRng(1),
      hero({ effortValues: points({ defense: 3 }) }),
      sub
    )
    expect(fused.effortValues).toEqual(points({ defense: 3 }))
  })

  it('MonsterView: điểm, tổng, trần và điểm loài cho khi bị hạ', () => {
    const state = makeGameState({
      seed: 1,
      party: [hero({ effortValues: points({ hp: 6, attack: 4 }) })]
    })
    const view = defined(getMonsterView(data, state, 'a'))
    expect(view.effort).toEqual({
      values: points({ hp: 6, attack: 4 }),
      total: 10,
      maxPerStat: 252,
      maxTotal: 510,
      yield: { hp: 1 }
    })
    expect(view.statPercents.effort.hp).toBeCloseTo(0.6)
  })
})

describe('kiểm tra dữ liệu / quái / migrate', () => {
  it('config.effort sai bị báo lỗi', () => {
    const issues = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join('\n')
    expect(issues((raw) => (raw.config.effort.maxPerStat = -1))).toMatch(/maxPerStat/)
    expect(issues((raw) => (raw.config.effort.percentPerPoint = -0.1))).toMatch(/percentPerPoint/)
    expect(issues((raw) => (raw.config.effort.derivedYield = []))).toMatch(/derivedYield/)
    expect(
      issues((raw) => (raw.config.effort.derivedYield = [{ minBaseStatTotal: 10, points: 1 }]))
    ).toMatch(/bậc đầu phải là 0/)
    expect(
      issues(
        (raw) =>
          (raw.config.effort.derivedYield = [
            { minBaseStatTotal: 0, points: 1 },
            { minBaseStatTotal: 0, points: 2 }
          ])
      )
    ).toMatch(/tăng dần/)
    expect(issues((raw) => Object.assign(raw.config.effort, { extra: 1 }))).toMatch(/extra/)
  })

  it('effortYield của loài: điểm nguyên ≥ 1, chỉ số hợp lệ, không rỗng', () => {
    const withYield = (effortYield: unknown) => (raw: RawGameData) => {
      Object.assign(defined(raw.species.find((s) => s.id === 'weakling')), { effortYield })
    }
    expect(dataIssuesAfter(withYield({ attack: 1 }))).toEqual([])
    expect(dataIssuesAfter(withYield({ attack: 0 })).join()).toMatch(/effortYield\.attack/)
    expect(dataIssuesAfter(withYield({ luck: 1 })).join()).toMatch(/luck/)
    expect(dataIssuesAfter(withYield({})).join()).toMatch(/không rỗng/)
  })

  it('hook đồ cầm sai params bị báo lỗi', () => {
    const withHook = (hooks: unknown) => (raw: RawGameData) => {
      raw.items.push({ id: 'badPower', category: 'held', price: 1, hooks } as Item)
    }
    const text = (hooks: unknown): string =>
      dataIssuesAfter(withHook(hooks), { regenerateText: true }).join('\n')
    expect(text([{ type: 'effortGainBonus', params: { stat: 'luck', amount: 8 } }])).toMatch(/stat/)
    expect(text([{ type: 'effortGainBonus', params: { stat: 'hp', amount: 0 } }])).toMatch(/amount/)
    expect(text([{ type: 'effortGainModifier', params: { percent: 0 } }])).toMatch(/percent/)
    expect(text([{ type: 'effortGainModifier', params: { percent: 100 } }])).toBe('')
  })

  it('điểm âm / lẻ / thiếu chỉ số bị báo lỗi; vượt trần không báo (trần chỉ áp lúc nhận)', () => {
    expect(validateMonster(data, hero({ effortValues: points({ attack: -1 }) })).join()).toMatch(
      /effortValues\.attack/
    )
    expect(validateMonster(data, hero({ effortValues: points({ hp: 0.5 }) })).join()).toMatch(
      /effortValues\.hp/
    )
    const missing = { ...hero(), effortValues: { hp: 0 } as Stats }
    expect(validateMonster(data, missing).join()).toMatch(/effortValues\.speed/)
    expect(validateMonster(data, hero({ effortValues: points({ attack: 1e9 }) }))).toEqual([])
  })

  it('migrate v61 → v62: mọi quái (đội, quái đang gặp ở khu bảo tồn) 0 điểm', () => {
    const state = makeGameState({ seed: 1, party: [hero()] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { effortValues: _effortValues, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const party = raw.party as unknown[]
    const safari = {
      ...(raw.safari as Record<string, unknown>),
      visit: {
        encountersLeft: 1,
        balls: 1,
        encounter: { monster: strip(party[0]), misses: 0, lure: null },
        caught: 0
      }
    }
    const old = { ...raw, version: 61, party: party.map(strip), safari }
    const migrated = migrateState(old, data)
    expect(defined(migrated.party[0]).effortValues).toEqual(points({}))
    expect(migrated.safari.visit?.encounter.monster.effortValues).toEqual(points({}))
    const plain = migrateState({ ...raw, version: 61, party: party.map(strip) }, data)
    expect(validateGameState(data, plain)).toEqual([])
  })
})
