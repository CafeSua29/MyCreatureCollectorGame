// Cây thần (docs/rules/gacha.md): giá, trứng nhận được, bảng loài, trọng số trait theo tầng, tất định,
// lỗi giữ nguyên state, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { toBig, type Decimal } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster
} from '../testing'
import type { GameData, GameState, NormalSpecies, Species } from '../model'
import { gachaCost, gachaSpeciesPool, gachaTraitKindWeights, pullGacha } from './gacha'

const data = makeData()

const townState = (overrides: Partial<GameState> = {}): GameState =>
  makeGameState({
    seed: 11,
    party: [makeMonster({ id: 'a' })],
    money: toBig(1_000_000),
    ...overrides
  })

/** Dữ liệu với config.gacha sửa đổi (không dùng lại cache bảng loài của `data`). */
const withGacha = (patch: Partial<GameData['config']['gacha']>): GameData => ({
  ...data,
  config: { ...data.config, gacha: { ...data.config.gacha, ...patch } }
})

describe('gachaCost', () => {
  it('giá theo tầng cao nhất, quay ×10 bằng 9 lần giá ×1', () => {
    expect(gachaCost(data, 1, 1).toString()).toBe('100')
    expect(gachaCost(data, 3, 1).toString()).toBe('300')
    expect(gachaCost(data, 3, 10).toString()).toBe('2700')
  })

  it('tầng cực lớn vẫn tính được bằng Decimal', () => {
    expect(gachaCost(data, 1e15, 10).toString()).toBe(toBig(900).times(1e15).toString())
  })

  it('count không có trong pullOptions thì báo lỗi', () => {
    expectActionError(() => gachaCost(data, 1, 2), 'gachaInvalidCount', { count: 2 })
  })
})

describe('pullGacha', () => {
  it('trừ tiền, nhận đúng số trứng, id từ nextMonsterId, đếm bộ đếm', () => {
    const state = townState({ highestFloor: 2 })
    const next = pullGacha(data, state, 10)
    expect(state.money.minus(next.money).toString()).toBe('1800')
    expect(next.eggs).toHaveLength(10)
    expect(next.eggs.map((egg) => egg.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `m${state.nextMonsterId + i}`)
    )
    expect(next.nextMonsterId).toBe(state.nextMonsterId + 10)
    expect(next.stats.gachaPulls).toBe(10)
    expect(next.log).toEqual([{ type: 'gachaPulled', eggIds: next.eggs.map((egg) => egg.id) }])
    // state cũ không đổi.
    expect(state.eggs).toEqual([])
    expect(state.stats.gachaPulls).toBe(0)
  })

  it('quái trong trứng: level 1, không boss, không đồ, lý lịch gacha ở thị trấn, thân mật trứng', () => {
    const next = pullGacha(data, townState(), 1)
    const egg = defined(next.eggs[0], 'trứng')
    const { hatchBattlesMin, hatchBattlesMax } = data.config.egg
    expect(egg.battlesLeft).toBeGreaterThanOrEqual(hatchBattlesMin)
    expect(egg.battlesLeft).toBeLessThanOrEqual(hatchBattlesMax)
    expect(egg.monster.level).toBe(1)
    expect(egg.monster.bossMultiplier).toBe(1)
    expect(egg.monster.equipment).toEqual([])
    expect(egg.monster.traits.map((t) => t.id)).not.toContain(data.config.boss.traitId)
    expect(egg.monster.affinity).toBe(data.config.affinity.start.egg)
    expect(egg.monster.history?.origin).toEqual({ kind: 'gacha' })
    expect(egg.monster.history?.metFloor).toBeNull()
    expect(validateGameState(data, next)).toEqual([])
  })

  it('cùng state cho cùng kết quả', () => {
    const state = townState()
    expect(serializeState(pullGacha(data, state, 10))).toEqual(
      serializeState(pullGacha(data, state, 10))
    )
  })

  it('đi qua reducer', () => {
    const next = gameReducer(data, townState(), { type: 'pullGacha', count: 1 })
    expect(next.eggs).toHaveLength(1)
  })

  it('gen theo tầng cao nhất, không theo chỗ đang đứng', () => {
    const scaled = withGacha({})
    const growing: GameData = {
      ...scaled,
      config: {
        ...scaled.config,
        floors: { ...scaled.config.floors, geneGrowthPerFloor: 2 }
      }
    }
    const low = pullGacha(growing, townState({ highestFloor: 1 }), 1)
    const high = pullGacha(growing, townState({ highestFloor: 5 }), 1)
    const gene = (state: GameState): Decimal => defined(state.eggs[0], 'trứng').monster.genes.hp
    expect(gene(high).toNumber()).toBe(gene(low).toNumber() * 16)
  })

  it('tỉ lệ shiny 100% thì mọi trứng shiny', () => {
    const shinyData: GameData = {
      ...data,
      config: { ...data.config, shiny: { ...data.config.shiny, wildChance: 100 } }
    }
    const next = pullGacha(shinyData, townState(), 10)
    expect(next.eggs.every((egg) => egg.monster.shinyStacks === 1)).toBe(true)
  })

  it('thiếu tiền / sai count / đang ở tầng / đang trận: báo lỗi', () => {
    expectActionError(
      () => pullGacha(data, townState({ money: toBig(99) }), 1),
      'notEnoughMoney',
      {}
    )
    expectActionError(() => pullGacha(data, townState(), 0), 'gachaInvalidCount', { count: 0 })
    expectActionError(
      () => pullGacha(data, townState({ location: { type: 'floor', floor: 1 } }), 1),
      'notInTown',
      {}
    )
  })

  it('bảng loài rỗng thì báo lỗi, không trừ tiền', () => {
    const state = townState()
    expectActionError(
      () => pullGacha(withGacha({ rankWeights: [0] }), state, 1),
      'gachaPoolEmpty',
      {}
    )
    expect(state.eggs).toEqual([])
  })
})

describe('gachaSpeciesPool', () => {
  const speciesOf = (id: string): NormalSpecies => defined(data.species[id], id) as NormalSpecies

  /** Một loài hoang có dạng sau (trong fixture), để kiểm dạng sau không ra. */
  const evolving = Object.values(data.species).find(
    (species): species is NormalSpecies =>
      species.kind === 'normal' && species.evolutions.length > 0
  )

  it('chỉ có dạng đầu, không có dạng sau', () => {
    const ids = gachaSpeciesPool(data).map((entry) => entry.speciesId)
    expect(ids.length).toBeGreaterThan(0)
    const target = defined(evolving, 'loài có tiến hóa').evolutions[0]
    expect(ids).not.toContain(defined(target, 'hướng tiến hóa').speciesId)
  })

  it('gachaWeight ghi đè: 0 thì không ra, > 0 thì ra kể cả không gặp ở map nào', () => {
    const ids = gachaSpeciesPool(data).map((entry) => entry.speciesId)
    const inPool = defined(ids[0], 'loài trong bảng')
    const outOfPool = {
      ...speciesOf(inPool),
      id: 'onlyGacha',
      gachaWeight: 7
    }
    const edited: GameData = {
      ...data,
      species: {
        ...data.species,
        [inPool]: { ...speciesOf(inPool), gachaWeight: 0 },
        onlyGacha: outOfPool
      }
    }
    const pool = gachaSpeciesPool(edited)
    expect(pool.some((entry) => entry.speciesId === inPool)).toBe(false)
    expect(pool.find((entry) => entry.speciesId === 'onlyGacha')?.weight).toBe(7)
  })

  it('trọng số theo phẩm cấp, vượt danh sách lấy số cuối', () => {
    const pool = gachaSpeciesPool(withGacha({ rankWeights: [3] }))
    expect(pool.every((entry) => entry.weight === 3)).toBe(true)
  })
})

describe('gachaTraitKindWeights', () => {
  const scaled = withGacha({
    traitKindWeights: { positive: 60, negative: 40, rare: 2 },
    traitKindFloorGrowth: { rare: 0.1 },
    traitKindFloorFalloff: { negative: 0.05 }
  })

  it('tầng 1 giữ nguyên, tầng cao rare tăng và negative giảm', () => {
    expect(gachaTraitKindWeights(scaled, 1)).toEqual({ positive: 60, negative: 40, rare: 2 })
    expect(gachaTraitKindWeights(scaled, 21)).toEqual({ positive: 60, negative: 20, rare: 6 })
  })

  it('tầng cực lớn vẫn hữu hạn và > 0', () => {
    const weights = gachaTraitKindWeights(scaled, 1e15)
    for (const weight of Object.values(weights)) {
      expect(Number.isFinite(weight)).toBe(true)
      expect(weight).toBeGreaterThan(0)
    }
  })
})

describe('kiểm tra dữ liệu Cây thần', () => {
  /** Loài có tiến hóa trong dữ liệu thô: dạng đầu của chuỗi và id dạng sau. */
  const evolvingOf = (species: readonly Species[]): NormalSpecies =>
    defined(
      species.find(
        (entry): entry is NormalSpecies => entry.kind === 'normal' && entry.evolutions.length > 0
      ),
      'loài có tiến hóa'
    )

  it('config sai bị báo', () => {
    const issues = dataIssuesAfter((draft) => {
      draft.config.gacha.costBase = -1
      draft.config.gacha.pullOptions = [
        { count: 1, costMultiplier: 1 },
        { count: 1, costMultiplier: 2 }
      ]
      draft.config.gacha.rankWeights = []
      draft.config.gacha.traitKindWeights = { boss: 1 }
      draft.config.gacha.traitKindFloorGrowth = { rare: -1 }
    })
    expect(issues.join('\n')).toContain('config.gacha.costBase')
    expect(issues.join('\n')).toContain('trùng count 1')
    expect(issues.join('\n')).toContain('config.gacha.rankWeights')
    expect(issues.join('\n')).toContain('config.gacha.traitKindWeights')
    expect(issues.join('\n')).toContain('config.gacha.traitKindFloorGrowth.rare')
  })

  it('gachaWeight > 0 ở dạng sau bị báo, ở dạng đầu thì không', () => {
    const issues = dataIssuesAfter((draft) => {
      const targetId = defined(evolvingOf(draft.species).evolutions[0], 'hướng').speciesId
      const target = draft.species.find((entry) => entry.id === targetId)
      if (target?.kind === 'normal') target.gachaWeight = 5
    })
    expect(issues).toContainEqual(
      expect.stringContaining('gachaWeight > 0 chỉ dành cho loài dạng đầu')
    )
    const fine = dataIssuesAfter((draft) => {
      evolvingOf(draft.species).gachaWeight = 5
    })
    expect(fine).not.toContainEqual(expect.stringContaining('gachaWeight'))
  })
})

describe('save', () => {
  it('migrate v95 → v96 thêm bộ đếm gachaPulls', () => {
    const raw = serializeState(townState()) as Record<string, unknown>
    const { gachaPulls: _gachaPulls, ...stats } = raw.stats as Record<string, unknown>
    const migrated = migrateState({ ...raw, version: 95, stats }, data)
    expect(migrated.stats.gachaPulls).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('save có trứng gacha đọc lại hợp lệ', () => {
    const next = pullGacha(data, townState(), 10)
    const reloaded = migrateState(JSON.parse(JSON.stringify(serializeState(next))), data)
    expect(validateGameState(data, reloaded)).toEqual([])
    expect(reloaded.eggs).toHaveLength(10)
  })
})
