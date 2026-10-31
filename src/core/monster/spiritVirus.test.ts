// Linh dịch (docs/rules/spirit-virus.md): nhiễm theo seed, lây sang quái kề, hết hạn → miễn dịch,
// kho dừng đếm, hiệu ứng EXP / gen / điểm nỗ lực, fuse / breed, view, kiểm tra config / quái, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { advanceTime, fuseMonsters, makeOffspring } from '../progression'
import { getMonsterView } from '../roster'
import { createRng } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, GameData, GameState, Monster, SpiritVirus } from '../model'
import {
  battleEffortGain,
  betterSpiritVirus,
  getMaxHp,
  spiritVirusWinGenes,
  spreadSpiritVirusAfterBattle,
  tickSpiritVirusDay,
  validateMonster
} from '.'

const base: GameData = createGameData(makeRawData())

/** Dữ liệu với tỉ lệ nhiễm / lây đổi (fixture mặc định 0 để test cũ không đổi RNG). */
const withChances = (infectPercent: number, spreadPercent: number): GameData => ({
  ...base,
  config: {
    ...base.config,
    spiritVirus: { ...base.config.spiritVirus, infectPercent, spreadPercent }
  }
})

const infected = (daysLeft: number): SpiritVirus => ({ state: 'infected', daysLeft })
const immune: SpiritVirus = { state: 'immune' }

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 20, skillIds: ['strike'], ...overrides })

const viruses = (party: readonly Monster[]): (SpiritVirus | null)[] =>
  party.map((monster) => monster.spiritVirus)

describe('nhiễm và lây sau trận', () => {
  it('nhiễm: tất định theo seed, số ngày trong [minDays, maxDays]', () => {
    const data = withChances(100, 0)
    const party = [hero()]
    const [first] = spreadSpiritVirusAfterBattle(data, createRng(7), party)
    const [again] = spreadSpiritVirusAfterBattle(data, createRng(7), party)
    expect(viruses(first)).toEqual(viruses(again))
    const virus = defined(first[0].spiritVirus)
    expect(virus.state).toBe('infected')
    if (virus.state === 'infected') {
      expect(virus.daysLeft).toBeGreaterThanOrEqual(1)
      expect(virus.daysLeft).toBeLessThanOrEqual(4)
    }
    // Đầu vào không bị sửa.
    expect(party[0].spiritVirus).toBeNull()
  })

  it('quái đã từng nhiễm (miễn dịch) không nhiễm lại; đội trống không lỗi', () => {
    const data = withChances(100, 100)
    const [party] = spreadSpiritVirusAfterBattle(data, createRng(1), [
      hero({ spiritVirus: immune })
    ])
    expect(viruses(party)).toEqual([immune])
    expect(spreadSpiritVirusAfterBattle(data, createRng(1), [])[0]).toEqual([])
  })

  it('tỉ lệ 0 không tốn RNG', () => {
    const rng = createRng(3)
    const party = [hero(), hero({ id: 'b', spiritVirus: infected(2) })]
    const [after, next] = spreadSpiritVirusAfterBattle(base, rng, party)
    expect(next).toBe(rng)
    expect(viruses(after)).toEqual([null, infected(2)])
  })

  it('lây sang hai quái kề cùng số ngày; quái vừa được lây không lây tiếp; miễn dịch không bị lây', () => {
    const data = withChances(0, 100)
    const party = [
      hero({ id: 'p0' }),
      hero({ id: 'p1', spiritVirus: infected(3) }),
      hero({ id: 'p2' }),
      hero({ id: 'p3', spiritVirus: immune }),
      hero({ id: 'p4' })
    ]
    const [after] = spreadSpiritVirusAfterBattle(data, createRng(1), party)
    expect(viruses(after)).toEqual([infected(3), infected(3), infected(3), immune, null])
  })

  it('cả trận: quái trong đội nhiễm sau khi trận kết thúc (kể cả thua / chạy)', () => {
    const data = withChances(100, 0)
    const state = makeBattleState([hero()], [makeMonster({ id: 'foe', skillIds: ['idle'] })])
    const fled = gameReducer(data, state, { type: 'flee' })
    expect(fled.battle?.outcome).toBe('fled')
    expect(defined(fled.party[0].spiritVirus).state).toBe('infected')
  })
})

describe('theo ngày', () => {
  it('mỗi ngày bớt một ngày; hết thì miễn dịch vĩnh viễn', () => {
    expect(tickSpiritVirusDay(hero({ spiritVirus: infected(2) })).spiritVirus).toEqual(infected(1))
    expect(tickSpiritVirusDay(hero({ spiritVirus: infected(1) })).spiritVirus).toEqual(immune)
    const plain = hero()
    expect(tickSpiritVirusDay(plain)).toBe(plain)
    expect(tickSpiritVirusDay(hero({ spiritVirus: immune })).spiritVirus).toEqual(immune)
  })

  it('đội đếm ngày, kho đứng yên (như Pokémon trong PC)', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [hero({ spiritVirus: infected(4) })] }),
      storage: [hero({ id: 'boxed', spiritVirus: infected(4) })]
    }
    const later = advanceTime(base, state, 24 * 3)
    expect(later.party[0].spiritVirus).toEqual(infected(1))
    expect(later.storage[0].spiritVirus).toEqual(infected(4))
    expect(advanceTime(base, later, 24).party[0].spiritVirus).toEqual(immune)
  })
})

describe('hiệu ứng', () => {
  const foe = (id: string): Monster =>
    makeMonster({ id, speciesId: 'weakling', skillIds: ['idle'] })

  it('điểm nỗ lực ×2 khi đang nhiễm; miễn dịch không nhân', () => {
    const defeated = [foe('x'), foe('y')]
    expect(battleEffortGain(base, hero(), defeated)).toEqual({ hp: 2 })
    expect(battleEffortGain(base, hero({ spiritVirus: infected(1) }), defeated)).toEqual({ hp: 4 })
    expect(battleEffortGain(base, hero({ spiritVirus: immune }), defeated)).toEqual({ hp: 2 })
  })

  it('gen: đang nhiễm +genesPerWin × hệ số gen tầng cao nhất vào một chỉ số ngẫu nhiên', () => {
    const sick = hero({ spiritVirus: infected(2) })
    const [grown] = spiritVirusWinGenes(base, createRng(5), { monster: sick, highestFloor: 1 })
    const added = Object.keys(sick.genes).filter((stat) => {
      const key = stat as keyof Monster['genes']
      return !grown.genes[key].eq(sick.genes[key])
    })
    expect(added).toHaveLength(1)
    const key = added[0] as keyof Monster['genes']
    expect(grown.genes[key].minus(sick.genes[key]).toNumber()).toBe(1)
    // Tầng rất cao (gen tăng theo tầng): số gen cực lớn vẫn hữu hạn.
    const growing: GameData = {
      ...base,
      config: { ...base.config, floors: { ...base.config.floors, geneGrowthPerFloor: 1.5 } }
    }
    const [far] = spiritVirusWinGenes(growing, createRng(5), { monster: sick, highestFloor: 1e6 })
    expect(far.genes[key].isFinite()).toBe(true)
    expect(far.genes[key].gt(grown.genes[key])).toBe(true)
    // Không nhiễm thì không đổi, không tốn RNG.
    const rng = createRng(5)
    const plain = hero({ spiritVirus: immune })
    expect(spiritVirusWinGenes(base, rng, { monster: plain, highestFloor: 1 })).toEqual([
      plain,
      rng
    ])
  })

  it('thắng trận: EXP +100% khi nhiễm, +25% khi miễn dịch; gen tăng', () => {
    const win = (spiritVirus: SpiritVirus | null): Monster => {
      const target = foe('foe')
      const dying = { ...target, damageTaken: getMaxHp(base, target).minus(1) }
      const state = makeBattleState([hero({ level: 50, spiritVirus })], [dying])
      const command: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
      const won = gameReducer(base, state, { type: 'submitTurn', commands: [command] })
      expect(won.battle?.outcome).toBe('won')
      return won.party[0]
    }
    const startExp = hero({ level: 50 }).exp
    const gained = (monster: Monster): number => monster.exp.minus(startExp).toNumber()
    const plain = gained(win(null))
    expect(plain).toBeGreaterThan(0)
    expect(gained(win(infected(2)))).toBe(plain * 2)
    expect(gained(win(immune))).toBe(Math.floor(plain * 1.25))
    const sick = win(infected(2))
    const genesBefore = hero({ level: 50 }).genes
    const total = (genes: Monster['genes']): number =>
      Object.values(genes).reduce((sum, gene) => sum + gene.toNumber(), 0)
    expect(total(sick.genes)).toBe(total(genesBefore) + 1)
  })
})

describe('fuse / breed / view', () => {
  it('fuse giữ trạng thái tốt hơn: nhiễm (nhiều ngày) > miễn dịch > chưa nhiễm', () => {
    expect(betterSpiritVirus(null, immune)).toEqual(immune)
    expect(betterSpiritVirus(immune, infected(1))).toEqual(infected(1))
    expect(betterSpiritVirus(infected(3), infected(2))).toEqual(infected(3))
    expect(betterSpiritVirus(null, null)).toBeNull()
    const sub = hero({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      spiritVirus: infected(2)
    })
    const [fused] = fuseMonsters(base, createRng(1), hero({ spiritVirus: immune }), sub)
    expect(fused.spiritVirus).toEqual(infected(2))
  })

  it('con breeding không nhiễm; MonsterView hiện trạng thái', () => {
    const father = hero({ id: 'f', gender: 'male', spiritVirus: infected(2) })
    const mother = hero({ id: 'm', gender: 'female', spiritVirus: immune })
    expect(makeOffspring(base, createRng(1), father, mother, 'egg')[0].spiritVirus).toBeNull()
    const state = makeGameState({ seed: 1, party: [hero({ spiritVirus: infected(3) })] })
    expect(defined(getMonsterView(base, state, 'a')).spiritVirus).toEqual(infected(3))
  })
})

describe('kiểm tra config / quái / migrate', () => {
  it('config.spiritVirus sai bị báo lỗi', () => {
    const issues = (edit: (config: Record<string, unknown>) => void): string =>
      dataIssuesAfter((raw) =>
        edit(raw.config.spiritVirus as unknown as Record<string, unknown>)
      ).join('\n')
    expect(issues(() => undefined)).toBe('')
    expect(issues((c) => (c.infectPercent = 101))).toMatch(/infectPercent/)
    expect(issues((c) => (c.spreadPercent = -1))).toMatch(/spreadPercent/)
    expect(issues((c) => (c.minDays = 0))).toMatch(/minDays/)
    expect(issues((c) => Object.assign(c, { minDays: 5, maxDays: 4 }))).toMatch(/lớn hơn maxDays/)
    expect(issues((c) => (c.effortMultiplier = -1))).toMatch(/effortMultiplier/)
    expect(issues((c) => (c.extra = 1))).toMatch(/extra/)
  })

  it('trạng thái trên quái sai bị báo lỗi', () => {
    expect(validateMonster(base, hero({ spiritVirus: infected(1) }))).toEqual([])
    expect(validateMonster(base, hero({ spiritVirus: immune }))).toEqual([])
    const bad = (spiritVirus: unknown): string =>
      validateMonster(base, { ...hero(), spiritVirus } as Monster).join()
    expect(bad(infected(0))).toMatch(/spiritVirus\.daysLeft/)
    expect(bad(infected(1.5))).toMatch(/spiritVirus\.daysLeft/)
    expect(bad({ state: 'sick' })).toMatch(/spiritVirus/)
    expect(bad({ state: 'immune', daysLeft: 1 })).toMatch(/spiritVirus/)
    expect(bad(undefined)).toMatch(/spiritVirus/)
  })

  it('migrate v69 → v70: mọi quái chưa từng nhiễm', () => {
    const state = makeGameState({ seed: 1, party: [hero({ spiritVirus: immune })] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { spiritVirus: _spiritVirus, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const old = { ...raw, version: 69, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, base)
    expect(migrated.party[0].spiritVirus).toBeNull()
    expect(validateGameState(base, migrated)).toEqual([])
  })
})
