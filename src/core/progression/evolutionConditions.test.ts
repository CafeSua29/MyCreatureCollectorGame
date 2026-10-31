// Tiến hóa có điều kiện và tiến hóa dị biến (mục "Tiến hóa có điều kiện" ở evolution-skills.md).

import { describe, expect, it } from 'vitest'
import { getMaxHp, validateMonster } from '../monster'
import { getMonsterView } from '../roster'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { createRng } from '../shared'
import {
  dataIssues,
  defined,
  expectActionError,
  makeBattleState,
  makeEquipment,
  makeEquipmentData,
  makeField,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  uniformStats,
  withEquipmentFixtures,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleEvent,
  EffectDef,
  Evolution,
  GameAction,
  GameData,
  GameState,
  Monster,
  NormalSpecies,
  RawGameData
} from '../model'
import type { MonsterView } from '../roster'
import {
  autoEvolve,
  evolveVia,
  levelEvolutionOptions,
  stoneEvolution,
  type EvolutionResult
} from './evolution'
import { makeOffspring } from './breeding'
import { fuseMonsters } from './fusion'

// Loài dị biến mẫu (cùng race neutral với weakling, chưa là đích tiến hóa của loài nào).
const MUTANT = 'mutantling'

/** Sửa raw: weakling có các hướng tiến hóa cho trước, thêm loài dị biến mẫu. */
function editEvolutions(raw: RawGameData, evolutions: Evolution[]): void {
  const species = raw.species.filter((s): s is NormalSpecies => s.kind === 'normal')
  const weakling = defined(
    species.find((s) => s.id === 'weakling'),
    'weakling'
  )
  const strongling = defined(
    species.find((s) => s.id === 'strongling'),
    'strongling'
  )
  weakling.evolutions = evolutions
  raw.species.push({ ...strongling, id: MUTANT, elementIds: ['ghost'] })
}

/** Dữ liệu fixture (kèm đồ cầm mẫu) với weakling tiến hóa theo `evolutions`. */
const dataWith = (evolutions: Evolution[]): GameData =>
  makeEquipmentData((raw) => editEvolutions(raw, evolutions))

/** weakling → strongling ở level 10 với các điều kiện cho trước. */
const conditional = (...conditions: EffectDef[]): GameData =>
  dataWith([{ speciesId: 'strongling', level: 10, conditions }])

const weakling = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ level: 10, exp: 1000, ...overrides })

const noScene = { party: [], place: null, aptitudeFloor: 1, time: 0 }
const rainyField = { biomeId: 'field', weatherIds: ['rain'], terrainIds: ['none'] }

const held = (itemId: string): Monster['equipment'][number] => ({ storage: 'stack', itemId })

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

describe('từng loại điều kiện', () => {
  const cases: {
    name: string
    condition: EffectDef
    met: MonsterOverrides
    unmet: MonsterOverrides
  }[] = [
    {
      name: 'affinity: thân mật ≥ min',
      condition: { type: 'affinity', params: { min: 160 } },
      met: { affinity: 160 },
      unmet: { affinity: 159 }
    },
    {
      name: 'knowsSkill: đang biết skill',
      condition: { type: 'knowsSkill', params: { skillId: 'growl' } },
      met: { skillIds: ['strike', 'growl'] },
      unmet: { skillIds: ['strike'] }
    },
    {
      name: 'hasTrait: có trait, đủ cấp',
      condition: { type: 'hasTrait', params: { traitId: 'fast', minLevel: 2 } },
      met: { traits: [{ id: 'fast', level: 2 }] },
      unmet: { traits: [{ id: 'fast', level: 1 }] }
    },
    {
      name: 'gender: đúng giới tính',
      condition: { type: 'gender', params: { gender: 'male' } },
      met: { gender: 'male' },
      unmet: { gender: 'female' }
    },
    {
      name: 'nature: tính cách trong danh sách (Toxel → Toxtricity)',
      condition: { type: 'nature', params: { natureIds: ['brave', 'hardy'] } },
      met: { natureId: 'brave' },
      unmet: { natureId: 'modest' }
    },
    {
      name: 'heldItem: đang lắp món',
      condition: { type: 'heldItem', params: { itemId: 'focusSash' } },
      met: { equipment: [held('focusSash')] },
      unmet: { equipment: [held('normalGem')] }
    },
    {
      name: 'heldItem: trang bị (món riêng) theo vật phẩm gốc',
      condition: { type: 'heldItem', params: { itemId: 'sword' } },
      met: { equipment: [{ storage: 'instance', instance: makeEquipment() }] },
      unmet: { equipment: [held('focusSash')] }
    },
    {
      name: 'knowsElementSkill: biết skill của hệ',
      condition: { type: 'knowsElementSkill', params: { elementId: 'fire' } },
      met: { skillIds: ['strike', 'blast'] },
      unmet: { skillIds: ['strike', 'growl'] }
    },
    {
      name: 'bossDefeats: đã hạ đủ boss',
      condition: { type: 'bossDefeats', params: { min: 3 } },
      met: { bossDefeats: 3 },
      unmet: { bossDefeats: 2 }
    },
    {
      // Thọ nguyên 100 năm (fixture): 1 ngày tuổi là ấu niên, 10⁶ ngày đã quá thành niên.
      name: 'ageStage: đúng giai đoạn tuổi',
      condition: { type: 'ageStage', params: { stage: 'young' } },
      met: { aging: true, ageDays: 1 },
      unmet: { aging: true, ageDays: 1_000_000 }
    },
    {
      name: 'ageStage: tắt thọ nguyên (không có giai đoạn tuổi) thì coi như đủ',
      condition: { type: 'ageStage', params: { stage: 'old' } },
      met: { aging: false, ageDays: 1 },
      unmet: { aging: true, ageDays: 1 }
    },
    {
      name: 'affinityMax: thân mật ≤ max',
      condition: { type: 'affinityMax', params: { max: 50 } },
      met: { affinity: 50 },
      unmet: { affinity: 51 }
    },
    {
      // Fixture: gen tối đa quái hoang tầng 1 là 10 mỗi chỉ số; refined từ tỉ lệ 0,9.
      name: 'aptitude: tư chất từ bậc min trở lên (so với tầng mốc)',
      condition: { type: 'aptitude', params: { min: 'refined' } },
      met: { genes: uniformStats(9) },
      unmet: { genes: uniformStats(8) }
    }
  ]

  for (const { name, condition, met, unmet } of cases) {
    it(name, () => {
      const data = conditional(condition)
      expect(levelEvolutionOptions(data, weakling(met), noScene)).toEqual(['strongling'])
      expect(levelEvolutionOptions(data, weakling(unmet), noScene)).toEqual([])
    })
  }

  it('aptitude: tầng mốc cao hơn (gen quái hoang tăng theo tầng) thì tụt bậc, không đủ nữa', () => {
    const data = dataWith([
      {
        speciesId: 'strongling',
        level: 10,
        conditions: [{ type: 'aptitude', params: { min: 'refined' } }]
      }
    ])
    const growing = { ...data, config: { ...data.config, floors: { ...data.config.floors } } }
    growing.config.floors.geneGrowthPerFloor = 2
    const monster = weakling({ genes: uniformStats(10) })
    expect(levelEvolutionOptions(growing, monster, noScene)).toEqual(['strongling'])
    expect(levelEvolutionOptions(growing, monster, { ...noScene, aptitudeFloor: 2 })).toEqual([])
  })

  it('partnerInParty: quái khác trong đội thỏa (loài / race / hệ), không tính chính nó', () => {
    const self = weakling()
    const brawler = makeMonster({
      id: 'p',
      speciesId: 'brawler',
      baseSpeciesId: 'brawler',
      raceId: 'brute'
    })
    for (const params of [{ speciesId: 'brawler' }, { raceId: 'brute' }, { elementId: 'grass' }]) {
      const data = conditional({ type: 'partnerInParty', params })
      const partner = params.elementId ? makeMonster({ id: 'g' }) : brawler
      const scene = { party: [self, partner], place: null, aptitudeFloor: 1, time: 0 }
      expect(levelEvolutionOptions(data, self, scene)).toEqual(['strongling'])
      // Chỉ có chính nó (hệ grass) trong đội: chưa đủ.
      expect(
        levelEvolutionOptions(data, self, { party: [self], place: null, aptitudeFloor: 1, time: 0 })
      ).toEqual([])
    }
  })

  it('biome / weather / terrain: đủ khi nơi quái đang ở đúng map và có môi trường đó', () => {
    const data = conditional(
      { type: 'biome', params: { biomeIds: ['field'] } },
      { type: 'weather', params: { weatherIds: ['rain', 'storm'] } },
      { type: 'terrain', params: { terrainIds: ['none'] } }
    )
    const at = (place: typeof rainyField | null): string[] =>
      levelEvolutionOptions(data, weakling(), { party: [], place, aptitudeFloor: 1, time: 0 })
    expect(at(rainyField)).toEqual(['strongling'])
    expect(at({ ...rainyField, biomeId: 'lair' })).toEqual([])
    expect(at({ ...rainyField, weatherIds: ['clear'] })).toEqual([])
    // Ngoài trận: mọi môi trường tự nhiên của map; có một cái khớp là đủ.
    expect(at({ ...rainyField, weatherIds: ['clear', 'storm'] })).toEqual(['strongling'])
    expect(at({ ...rainyField, terrainIds: ['grassy'] })).toEqual([])
    // Thị trấn: không có nơi, chưa đủ.
    expect(at(null)).toEqual([])
  })
})

describe('nhiều điều kiện, kết hợp level / đá', () => {
  const data = conditional(
    { type: 'affinity', params: { min: 100 } },
    { type: 'gender', params: { gender: 'female' } }
  )

  it('phải đủ tất cả điều kiện và đủ level', () => {
    expect(levelEvolutionOptions(data, weakling({ affinity: 100 }), noScene)).toEqual([
      'strongling'
    ])
    expect(levelEvolutionOptions(data, weakling({ affinity: 99 }), noScene)).toEqual([])
    const male = weakling({ affinity: 100, gender: 'male' })
    expect(levelEvolutionOptions(data, male, noScene)).toEqual([])
    const young = weakling({ affinity: 100, level: 9, exp: 729 })
    expect(levelEvolutionOptions(data, young, noScene)).toEqual([])
  })

  it('hướng cần đá có điều kiện: thiếu điều kiện thì đá không có tác dụng, không mất đá', () => {
    const stoneData = dataWith([
      {
        speciesId: 'strongling',
        level: 5,
        itemId: 'fireStone',
        conditions: [{ type: 'affinity', params: { min: 100 } }]
      }
    ])
    const close = weakling({ affinity: 100 })
    expect(stoneEvolution(stoneData, close, { itemId: 'fireStone', scene: noScene })).not.toBeNull()
    const state = {
      ...makeGameState({ seed: 1, party: [weakling({ affinity: 99 })] }),
      inventory: makeInventory({ fireStone: 1 })
    }
    const use: GameAction = { type: 'useItem', itemId: 'fireStone', monsterId: 'm1' }
    expectActionError(() => gameReducer(stoneData, state, use), 'itemNoEffect')
    const ready = { ...state, party: [close] }
    const next = gameReducer(stoneData, ready, use)
    expect(next.party[0].speciesId).toBe('strongling')
    expect(next.inventory.stacks).toEqual({})
  })
})

describe('đồ cầm bị tiêu khi tiến hóa', () => {
  it('consume: true thì món mất khỏi ô (một cái), log heldItemConsumed; không có thì giữ', () => {
    const consumed = conditional({
      type: 'heldItem',
      params: { itemId: 'focusSash', consume: true }
    })
    const monster = weakling({
      equipment: [held('focusSash'), held('focusSash'), held('normalGem')]
    })
    const result = autoEvolve(consumed, monster, { rng: createRng(1), day: 0, scene: noScene })
    expect(result.monster.speciesId).toBe('strongling')
    expect(result.monster.equipment).toEqual([held('focusSash'), held('normalGem')])
    expect(result.events[0]).toEqual({
      type: 'heldItemConsumed',
      monsterId: 'm1',
      itemId: 'focusSash'
    })

    const kept = conditional({ type: 'heldItem', params: { itemId: 'focusSash' } })
    const keptResult = autoEvolve(kept, monster, { rng: createRng(1), day: 0, scene: noScene })
    expect(keptResult.monster.equipment).toEqual(monster.equipment)
  })
})

describe('tiến hóa dị biến', () => {
  const mutating = (mutation: Evolution['mutation']): { data: GameData; evolution: Evolution } => {
    const evolution: Evolution = { speciesId: 'strongling', level: 10, mutation }
    return { data: dataWith([evolution]), evolution }
  }
  const evolve = (
    data: GameData,
    evolution: Evolution,
    monster: Monster,
    seed = 1
  ): EvolutionResult => evolveVia(data, monster, { evolution, rng: createRng(seed), day: 3 })

  it('trúng: thành loài dị biến, log mutatedEvolution, mốc lý lịch mutatedEvolution', () => {
    const { data, evolution } = mutating({ speciesId: MUTANT, chance: 100 })
    const result = evolve(data, evolution, weakling())
    expect(result.monster).toMatchObject({ speciesId: MUTANT, elementIds: ['ghost'] })
    const change = { fromSpeciesId: 'weakling', toSpeciesId: MUTANT }
    expect(result.events[0]).toEqual({ type: 'mutatedEvolution', monsterId: 'm1', ...change })
    expect(result.monster.history?.milestones.at(-1)).toEqual({
      day: 3,
      kind: 'mutatedEvolution',
      ...change
    })
    expect(validateMonster(data, result.monster)).toEqual([])
  })

  it('trượt (chance 0): tiến hóa thường, không tốn RNG', () => {
    const { data, evolution } = mutating({ speciesId: MUTANT, chance: 0 })
    const plain = { ...evolution, mutation: undefined }
    const result = evolve(data, evolution, weakling())
    expect(result.monster.speciesId).toBe('strongling')
    expect(result).toEqual(evolve(data, plain, weakling()))
  })

  it('đang lắp xúc tác: dùng catalystChance, xúc tác bị tiêu khi trúng; trượt thì giữ', () => {
    const catalyst = { speciesId: MUTANT, chance: 0, catalystItemId: 'normalGem' }
    const hit = mutating({ ...catalyst, catalystChance: 100 })
    const holder = weakling({ equipment: [held('normalGem'), held('focusSash')] })
    const result = evolve(hit.data, hit.evolution, holder)
    expect(result.monster.speciesId).toBe(MUTANT)
    expect(result.monster.equipment).toEqual([held('focusSash')])
    // Không lắp xúc tác thì dùng chance (0): tiến hóa thường.
    expect(evolve(hit.data, hit.evolution, weakling()).monster.speciesId).toBe('strongling')

    const miss = mutating({ ...catalyst, chance: 100, catalystChance: 0 })
    const missed = evolve(miss.data, miss.evolution, holder)
    expect(missed.monster.speciesId).toBe('strongling')
    expect(missed.monster.equipment).toEqual(holder.equipment)
  })

  it('xúc tác cũng là món của điều kiện consume: chỉ tiêu một cái', () => {
    const evolution: Evolution = {
      speciesId: 'strongling',
      level: 10,
      conditions: [{ type: 'heldItem', params: { itemId: 'normalGem', consume: true } }],
      mutation: { speciesId: MUTANT, chance: 0, catalystItemId: 'normalGem', catalystChance: 100 }
    }
    const data = dataWith([evolution])
    const holder = weakling({ equipment: [held('normalGem'), held('normalGem')] })
    const result = evolve(data, evolution, holder)
    expect(result.monster.speciesId).toBe(MUTANT)
    expect(result.monster.equipment).toEqual([held('normalGem')])
  })

  it('tất định theo seed; tỉ lệ 50% cho cả hai kết quả qua nhiều seed', () => {
    const { data, evolution } = mutating({ speciesId: MUTANT, chance: 50 })
    expect(evolve(data, evolution, weakling(), 7)).toEqual(evolve(data, evolution, weakling(), 7))
    const outcomes = new Set(
      Array.from(
        { length: 20 },
        (_, seed) => evolve(data, evolution, weakling(), seed).monster.speciesId
      )
    )
    expect(outcomes).toEqual(new Set(['strongling', MUTANT]))
  })

  it('loài dị biến có dạng trước (breeding về dạng đầu)', () => {
    const { data } = mutating({ speciesId: MUTANT, chance: 2 })
    const mother = makeMonster({ id: 'f', speciesId: MUTANT, baseSpeciesId: MUTANT })
    const father = makeMonster({ id: 'd', gender: 'male' })
    expect(makeOffspring(data, createRng(1), father, mother, 'egg')[0].speciesId).toBe('weakling')
  })
})

describe('đếm bossDefeats và điều kiện theo trận thắng', () => {
  /** Địch weakling còn 1 máu, chỉ biết idle: một đòn strike là thắng. */
  const lastHit = (data: GameData): Monster => {
    const enemy = makeMonster({ id: 'e', skillIds: ['idle'] })
    return { ...enemy, damageTaken: getMaxHp(data, enemy).minus(1) }
  }
  const strike: GameAction = {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
  }

  it('thắng trận boss: quái đã ra sân +1 (kể cả đã gục), dự bị không; trận thường không đếm', () => {
    const data = conditional({ type: 'bossDefeats', params: { min: 1 } })
    const party = [
      makeMonster({
        id: 'a',
        level: 50,
        exp: 125000,
        speciesId: 'brawler',
        baseSpeciesId: 'brawler',
        raceId: 'brute',
        elementIds: ['fire']
      }),
      makeMonster({ id: 'b', level: 10, exp: 1000 }),
      // c đã ra sân rồi gục trước đó trong trận.
      makeMonster({ id: 'c', damageTaken: 999 })
    ]
    const won = gameReducer(
      data,
      makeBattleState(party, [lastHit(data)], {
        isBoss: true,
        playerSlots: ['a', null],
        participants: ['a', 'c']
      }),
      strike
    )
    expect(defined(won.battle).outcome).toBe('won')
    expect(won.party.map((m) => m.bossDefeats)).toEqual([1, 0, 1])
    // b chưa ra sân nên chưa hạ boss: chưa tiến hóa.
    expect(won.party[1].speciesId).toBe('weakling')

    const normal = gameReducer(
      data,
      makeBattleState(party, [lastHit(data)], {
        playerSlots: ['a', null],
        participants: ['a', 'c']
      }),
      strike
    )
    expect(normal.party.map((m) => m.bossDefeats)).toEqual([0, 0, 0])
  })

  it('điều kiện map / thời tiết xét theo trận vừa thắng (môi trường lúc kết thúc)', () => {
    const data = conditional(
      { type: 'biome', params: { biomeIds: ['field'] } },
      { type: 'weather', params: { weatherIds: ['rain'] } }
    )
    const battle = (weather: string): GameState =>
      makeBattleState([weakling({ id: 'a' })], [lastHit(data)], {
        field: makeField({ weather })
      })
    const rainy = gameReducer(data, battle('rain'), strike)
    expect(rainy.party[0].speciesId).toBe('strongling')
    expect(eventsOf(rainy, 'evolve')).toHaveLength(1)
    expect(gameReducer(data, battle('clear'), strike).party[0].speciesId).toBe('weakling')
  })
})

describe('điều kiện theo lúc tiến hóa (docs/rules/calendar.md)', () => {
  // Fixture: dawn 6, day 7, dusk 17, night 18; 10 ngày một năm; tuần trăng 8 ngày.
  const optionsAt = (data: GameData, time: number): string[] =>
    levelEvolutionOptions(data, weakling(), { ...noScene, time })
  const HOUR = 1
  const DAY = 24 * HOUR

  it('timeOfDay: đúng thời khắc theo giờ game, qua nửa đêm vẫn là đêm', () => {
    const data = conditional({ type: 'timeOfDay', params: { phases: ['night'] } })
    expect(optionsAt(data, 18)).toEqual(['strongling'])
    expect(optionsAt(data, 23)).toEqual(['strongling'])
    expect(optionsAt(data, DAY + 5)).toEqual(['strongling'])
    expect(optionsAt(data, 17)).toEqual([])
    expect(optionsAt(data, 6)).toEqual([])
    // Giờ rất lớn (số nguyên an toàn) vẫn tính đúng giờ trong ngày.
    const big = Math.floor(Number.MAX_SAFE_INTEGER / DAY) * DAY
    expect(optionsAt(data, big + 20)).toEqual(['strongling'])
    expect(optionsAt(data, big + 12)).toEqual([])
  })

  it('hourRange: cả hai đầu; fromHour > toHour là qua nửa đêm', () => {
    const night = conditional({ type: 'hourRange', params: { fromHour: 0, toHour: 5 } })
    expect([0, 5, 6, 23].map((hour) => optionsAt(night, hour).length)).toEqual([1, 1, 0, 0])
    const wrap = conditional({ type: 'hourRange', params: { fromHour: 22, toHour: 1 } })
    expect([21, 22, 0, 1, 2].map((hour) => optionsAt(wrap, hour).length)).toEqual([0, 1, 1, 1, 0])
  })

  it('season và moonPhase theo ngày game', () => {
    const winter = conditional({ type: 'season', params: { seasons: ['winter'] } })
    // 10 ngày: xuân 0–2, hạ 3–4, thu 5–7, đông 8–9; năm sau lặp lại.
    expect([7, 8, 9, 10].map((day) => optionsAt(winter, day * DAY).length)).toEqual([0, 1, 1, 0])
    const full = conditional({ type: 'moonPhase', params: { phases: ['full'] } })
    expect([3, 4, 5, 12].map((day) => optionsAt(full, day * DAY).length)).toEqual([0, 1, 0, 1])
  })

  it('chọn hướng chờ: điều kiện theo lúc coi như đã đủ (đủ lúc đặt hướng chờ)', () => {
    const data = dataWith([
      {
        speciesId: 'strongling',
        level: 10,
        conditions: [{ type: 'timeOfDay', params: { phases: ['night'] } }]
      },
      { speciesId: MUTANT, level: 10 }
    ])
    const state = makeGameState({
      seed: 1,
      party: [weakling({ pendingEvolutionIds: ['strongling', MUTANT] })]
    })
    const choose: GameAction = { type: 'chooseEvolution', monsterId: 'm1', speciesId: 'strongling' }
    const next = gameReducer(data, { ...state, time: 12 }, choose)
    expect(next.party[0].speciesId).toBe('strongling')
  })
})

describe('chooseEvolution xét lại điều kiện', () => {
  const data = dataWith([
    {
      speciesId: 'strongling',
      level: 10,
      conditions: [
        { type: 'heldItem', params: { itemId: 'focusSash' } },
        { type: 'weather', params: { weatherIds: ['rain'] } }
      ]
    },
    { speciesId: MUTANT, level: 10 }
  ])
  const pending = (equipment: Monster['equipment']): GameState =>
    makeGameState({
      seed: 1,
      party: [weakling({ equipment, pendingEvolutionIds: ['strongling', MUTANT] })]
    })
  const choose: GameAction = { type: 'chooseEvolution', monsterId: 'm1', speciesId: 'strongling' }

  it('điều kiện lúc thắng trận coi như đã đủ; điều kiện theo quái vẫn phải đủ', () => {
    const next = gameReducer(data, pending([held('focusSash')]), choose)
    expect(next.party[0].speciesId).toBe('strongling')
    const state = pending([])
    expectActionError(() => gameReducer(data, state, choose), 'evolutionConditionsUnmet', {
      speciesId: 'strongling'
    })
  })
})

describe('MonsterView', () => {
  it('liệt kê điều kiện, đủ chưa ở nơi đang ở (thị trấn: điều kiện map chưa đủ); có dị biến', () => {
    const data = dataWith([
      {
        speciesId: 'strongling',
        level: 10,
        conditions: [
          { type: 'affinity', params: { min: 100 } },
          { type: 'biome', params: { biomeIds: ['field'] } }
        ],
        mutation: { speciesId: MUTANT, chance: 2 }
      }
    ])
    const party = [weakling({ affinity: 120, bossDefeats: 2 })]
    const view = (state: GameState): MonsterView => defined(getMonsterView(data, state, 'm1'))
    const inTown = view(makeGameState({ seed: 1, party }))
    expect(inTown.bossDefeats).toBe(2)
    expect(inTown.evolutions).toEqual([
      {
        speciesId: 'strongling',
        level: 10,
        levelReached: true,
        conditions: [
          { type: 'affinity', params: { min: 100 }, met: true },
          { type: 'biome', params: { biomeIds: ['field'] }, met: false }
        ],
        mutation: { speciesId: MUTANT, chance: 2 }
      }
    ])
    // Tầng 1 của fixture là map field.
    const onFloor = view(makeGameState({ seed: 1, party, location: { type: 'floor', floor: 1 } }))
    expect(onFloor.evolutions[0].conditions[1].met).toBe(true)
  })
})

describe('dùng đá / kẹo ngoài trận: xét ở nơi đang đứng (như Pokémon)', () => {
  const data = dataWith([
    {
      speciesId: 'strongling',
      level: 5,
      itemId: 'fireStone',
      conditions: [{ type: 'biome', params: { biomeIds: ['field'] } }]
    }
  ])
  const use: GameAction = { type: 'useItem', itemId: 'fireStone', monsterId: 'm1' }
  const at = (location: GameState['location']): GameState => ({
    ...makeGameState({ seed: 1, party: [weakling()], location }),
    inventory: makeInventory({ fireStone: 1 })
  })

  it('đứng ở map đúng thì tiến hóa; ở thị trấn thì không có tác dụng, không mất đá', () => {
    const onFloor = gameReducer(data, at({ type: 'floor', floor: 1 }), use)
    expect(onFloor.party[0].speciesId).toBe('strongling')
    expectActionError(() => gameReducer(data, at({ type: 'town' }), use), 'itemNoEffect')
  })
})

describe('bossDefeats trên quái', () => {
  const data = conditional({ type: 'bossDefeats', params: { min: 1 } })

  it('con breed 0; fuse giữ của quái gốc', () => {
    const mother = makeMonster({ id: 'f', bossDefeats: 4 })
    const father = makeMonster({ id: 'd', gender: 'male', bossDefeats: 9 })
    expect(makeOffspring(data, createRng(1), father, mother, 'egg')[0].bossDefeats).toBe(0)
    const base = makeMonster({ id: 'a', bossDefeats: 4 })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'brawler',
      baseSpeciesId: 'brawler',
      bossDefeats: 9
    })
    expect(fuseMonsters(data, createRng(1), base, sub)[0].bossDefeats).toBe(4)
  })

  it('validateMonster: số nguyên ≥ 0, số rất lớn vẫn hợp lệ', () => {
    expect(validateMonster(data, weakling({ bossDefeats: -1 })).join()).toMatch(/bossDefeats/)
    expect(validateMonster(data, weakling({ bossDefeats: 1.5 })).join()).toMatch(/bossDefeats/)
    expect(validateMonster(data, weakling({ bossDefeats: Number.MAX_SAFE_INTEGER }))).toEqual([])
  })
})

describe('trang bị bị tiêu khi tiến hóa', () => {
  it('heldItem consume với trang bị: món riêng mất khỏi ô (không về túi)', () => {
    const data = conditional({ type: 'heldItem', params: { itemId: 'sword', consume: true } })
    const monster = weakling({ equipment: [{ storage: 'instance', instance: makeEquipment() }] })
    const result = autoEvolve(data, monster, { rng: createRng(1), day: 0, scene: noScene })
    expect(result.monster).toMatchObject({ speciesId: 'strongling', equipment: [] })
    expect(result.events[0]).toEqual({ type: 'heldItemConsumed', monsterId: 'm1', itemId: 'sword' })
  })
})

describe('Dị Biến Thạch rơi từ boss (config.evolution)', () => {
  const lastHit = (data: GameData): Monster => {
    const enemy = makeMonster({ id: 'e', skillIds: ['idle'] })
    return { ...enemy, damageTaken: getMaxHp(data, enemy).minus(1) }
  }
  const strike: GameAction = {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
  }
  // Boss weakling không phải boss tầng của map: chỉ bảng bossDrops.
  const data = makeEquipmentData((raw) => {
    raw.config.evolution = {
      bossDrops: [{ itemId: 'focusSash', chance: 100 }],
      floorBossDrops: [{ itemId: 'normalGem', chance: 100 }]
    }
  })

  it('trận boss rơi bossDrops; trận thường không rơi', () => {
    const party = [makeMonster({ id: 'a', level: 50, exp: 125000 })]
    const boss = gameReducer(
      data,
      makeBattleState(party, [lastHit(data)], { isBoss: true }),
      strike
    )
    expect(boss.inventory.stacks.focusSash).toBe(1)
    expect(boss.inventory.stacks.normalGem).toBeUndefined()
    const wild = gameReducer(data, makeBattleState(party, [lastHit(data)]), strike)
    expect(wild.inventory.stacks.focusSash).toBeUndefined()
  })

  it('kiểm tra config: phải là object, bảng rơi đúng, trường lạ báo lỗi', () => {
    const issuesWith = (evolution: unknown): string => {
      const raw = withEquipmentFixtures(makeRawData())
      // Ép kiểu: test cố ý đưa config sai.
      raw.config.evolution = evolution as typeof raw.config.evolution
      return dataIssues(withFixtureText(raw)).join('\n')
    }
    expect(issuesWith(null)).toMatch(/config.evolution phải là object/)
    expect(issuesWith({ bossDrops: 'x', floorBossDrops: [] })).toMatch(
      /bossDrops phải là danh sách/
    )
    expect(issuesWith({ bossDrops: [{ itemId: 'nope', chance: 3 }], floorBossDrops: [] })).toMatch(
      /nope/
    )
    expect(issuesWith({ bossDrops: [], floorBossDrops: [], extra: 1 })).toMatch(/"extra"/)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesWith = (evolutions: Evolution[]): string => {
    const raw = withEquipmentFixtures(makeRawData())
    editEvolutions(raw, evolutions)
    return dataIssues(withFixtureText(raw)).join('\n')
  }
  const withCondition = (condition: EffectDef): string =>
    issuesWith([{ speciesId: 'strongling', level: 10, conditions: [condition] }])

  it('điều kiện theo lúc (calendar.md): danh sách rỗng, giá trị lạ, trùng, giờ ngoài 0–23', () => {
    expect(withCondition({ type: 'timeOfDay', params: { phases: [] } })).toMatch(/không rỗng/)
    expect(withCondition({ type: 'timeOfDay', params: { phases: ['noon'] } })).toMatch(/noon/)
    expect(withCondition({ type: 'season', params: { seasons: ['winter', 'winter'] } })).toMatch(
      /trùng/
    )
    expect(withCondition({ type: 'moonPhase', params: { phases: ['blue'] } })).toMatch(/blue/)
    expect(withCondition({ type: 'hourRange', params: { fromHour: 0, toHour: 24 } })).toMatch(
      /toHour/
    )
    expect(withCondition({ type: 'hourRange', params: { fromHour: -1, toHour: 3 } })).toMatch(
      /fromHour/
    )
    expect(withCondition({ type: 'hourRange', params: { fromHour: 0, toHour: 23 } })).toBe('')
  })

  it('dữ liệu hợp lệ không báo lỗi', () => {
    expect(
      issuesWith([
        {
          speciesId: 'strongling',
          level: 10,
          conditions: [
            { type: 'heldItem', params: { itemId: 'focusSash', consume: true } },
            { type: 'partnerInParty', params: { raceId: 'brute' } }
          ],
          mutation: {
            speciesId: MUTANT,
            chance: 2,
            catalystItemId: 'normalGem',
            catalystChance: 25
          }
        }
      ])
    ).toBe('')
  })

  it('loại điều kiện lạ, tham số sai, id không tồn tại', () => {
    expect(withCondition({ type: 'starAlignment', params: {} })).toMatch(/"starAlignment" chưa có/)
    expect(withCondition({ type: 'affinity', params: { min: 0 } })).toMatch(/min/)
    expect(withCondition({ type: 'affinity', params: { min: 9999 } })).toMatch(/tối đa/)
    expect(withCondition({ type: 'knowsSkill', params: { skillId: 'nope' } })).toMatch(/nope/)
    expect(withCondition({ type: 'hasTrait', params: { traitId: 'fast', minLevel: 0 } })).toMatch(
      /minLevel/
    )
    expect(withCondition({ type: 'gender', params: { gender: 'x' } })).toMatch(/gender/)
    expect(withCondition({ type: 'nature', params: { natureIds: ['grumpy'] } })).toMatch(/grumpy/)
    expect(withCondition({ type: 'nature', params: { natureIds: [] } })).toMatch(/natureIds/)
    expect(withCondition({ type: 'heldItem', params: { itemId: 'potion' } })).toMatch(/held/)
    expect(withCondition({ type: 'knowsElementSkill', params: { elementId: 'x' } })).toMatch(/hệ/)
    expect(withCondition({ type: 'biome', params: { biomeIds: ['nowhere'] } })).toMatch(/nowhere/)
    expect(withCondition({ type: 'weather', params: { weatherIds: ['grassy'] } })).toMatch(
      /không thuộc lớp weather/
    )
    expect(withCondition({ type: 'ageStage', params: { stage: 'ancient' } })).toMatch(/stage/)
    expect(
      withCondition({ type: 'partnerInParty', params: { speciesId: 'pebble', raceId: 'brute' } })
    ).toMatch(/đúng một/)
    expect(withCondition({ type: 'aptitude', params: { min: 'nope' } })).toMatch(/bậc tư chất/)
    expect(withCondition({ type: 'aptitude', params: { min: 'mortal' } })).toMatch(/luôn đủ/)
  })

  it('dị biến: trùng loài thường / tỉ lệ sai / xúc tác sai / trường lạ; khác race thì được', () => {
    const mutation = (value: object): string =>
      issuesWith([
        // Ép kiểu: test cố ý đưa dữ liệu sai.
        { speciesId: 'strongling', level: 10, mutation: value as Evolution['mutation'] }
      ])
    expect(mutation({ speciesId: 'brawler', chance: 2 })).toBe('')
    expect(mutation({ speciesId: 'strongling', chance: 2 })).toMatch(/trùng loài thường/)
    expect(mutation({ speciesId: MUTANT, chance: 101 })).toMatch(/chance/)
    expect(mutation({ speciesId: MUTANT, chance: 2, catalystItemId: 'normalGem' })).toMatch(
      /cùng nhau/
    )
    expect(
      mutation({ speciesId: MUTANT, chance: 2, catalystItemId: 'potion', catalystChance: 25 })
    ).toMatch(/held/)
    expect(mutation({ speciesId: MUTANT, chance: 2, odds: 3 })).toMatch(/"odds"/)
    expect(mutation({ speciesId: 'megaWeakling', chance: 2 })).toMatch(/dạng biến hình|khác race/)
  })

  it('loài dị biến được có thêm dạng trước (oak vốn là dạng sau của twig)', () => {
    expect(
      issuesWith([
        { speciesId: 'strongling', level: 10, mutation: { speciesId: 'oak', chance: 2 } }
      ])
    ).toBe('')
  })
})

describe('migrate v29 → v30', () => {
  it('mọi quái (kể cả trong trứng, quái hoang) bossDefeats 0, state hợp lệ', () => {
    const data = conditional()
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const raw = serializeState({
      ...battle,
      eggs: [{ id: 'egg1', monster: makeMonster({ id: 'egg1' }), battlesLeft: 2 }]
    }) as Record<string, unknown>
    const strip = (m: Record<string, unknown>): Record<string, unknown> => {
      const { bossDefeats: _bossDefeats, ...rest } = m
      return rest
    }
    const rawBattle = raw.battle as Record<string, unknown>
    const v29 = {
      ...raw,
      version: 29,
      party: (raw.party as Record<string, unknown>[]).map(strip),
      eggs: (raw.eggs as Record<string, unknown>[]).map((e) => ({
        ...e,
        monster: strip(e.monster as Record<string, unknown>)
      })),
      battle: { ...rawBattle, enemies: (rawBattle.enemies as Record<string, unknown>[]).map(strip) }
    }
    const migrated = migrateState(v29, data)
    expect(migrated.party[0].bossDefeats).toBe(0)
    expect(migrated.eggs[0].monster.bossDefeats).toBe(0)
    expect(defined(migrated.battle).enemies[0].bossDefeats).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
