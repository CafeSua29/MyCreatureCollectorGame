import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { breedBlocker, breedCost, canBreed, inheritedEggSkills, makeOffspring } from './breeding'
import { createGameData } from '../gameData'
import { validateMonster } from '../monster'
import { DataError, toBig } from '../shared'
import { createRng } from '../shared'
import { gameReducer } from '../game'
import {
  makeBattleState,
  makeData,
  makeMonster,
  makeRaceTraitData,
  makeRawData,
  uniformStats,
  expectActionError,
  makeGameState,
  NEUTRAL_RACE_TRAIT_IDS
} from '../testing'
import { raceTraitIds } from '../registries'
import type { GameData, GameState, Monster } from '../model'

// Fixture: race neutral breedsWith [neutral]; brute breedsWith [neutral].
// weakling → strongling (neutral); twig → oak / pine / cinder (neutral); brawler (brute).
// breeding: giá 20 × tổng level, gen −10%..+15%, shiny / đột biến mặc định 0%.
const data = makeData()

function dataWith(edit: (raw: ReturnType<typeof makeRawData>) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

const male = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, gender: 'male', ...overrides })
const female = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, gender: 'female', ...overrides })
const species = (
  speciesId: string,
  raceId = 'neutral',
  elementIds = ['grass']
): MonsterOverrides => ({
  speciesId,
  baseSpeciesId: speciesId,
  raceId,
  elementIds
})

const child = (father: Monster, mother: Monster, gameData = data, seed = 1): Monster =>
  makeOffspring(gameData, createRng(seed), father, mother, 'kid')[0]

describe('canBreed', () => {
  it('cần một đực một cái, không phải cùng một con', () => {
    expect(canBreed(data, male('a'), female('b'))).toBe(true)
    expect(breedBlocker(data, female('a'), female('b'))).toBe('breedSameGender')
    expect(breedBlocker(data, male('a'), male('a'))).toBe('breedSameMonster')
  })

  it('khác loài: breed được nếu race tương thích (xét cả hai chiều)', () => {
    const strong = female('s', species('strongling', 'neutral', ['fire']))
    expect(canBreed(data, male('w'), strong)).toBe(true) // neutral ↔ neutral
    const brawler = female('c', species('brawler', 'brute', ['fire']))
    expect(canBreed(data, male('w'), brawler)).toBe(true) // brute liệt kê neutral
  })

  it('race không tương thích thì không breed được, trừ khi loài nằm trong lineage', () => {
    const strict = dataWith((raw) => {
      for (const race of raw.races) race.breedsWith = []
    })
    // Khác nhóm race và không race nào ghi breedsWith: không breed được.
    const strong = female('s', species('strongling', 'brute', ['fire']))
    expect(breedBlocker(strict, male('w'), strong)).toBe('breedIncompatible')
    const fusedWithStrong = male('f', {
      speciesId: 'fused',
      baseSpeciesId: 'twig',
      fused: true,
      lineage: ['strongling']
    })
    expect(canBreed(strict, fusedWithStrong, strong)).toBe(true)
  })
})

describe('con sinh ra', () => {
  it('loài là dạng đầu tiên của loài mẹ; level 1; skill theo learnset level 1; hợp lệ', () => {
    const mother = female('m', {
      ...species('cinder', 'neutral', ['fire']),
      level: 5,
      exp: toBig(125)
    })
    const kid = child(male('f', { level: 7, exp: toBig(343) }), mother)
    expect(kid).toMatchObject({
      id: 'kid',
      speciesId: 'twig',
      baseSpeciesId: 'twig',
      raceId: 'neutral',
      elementIds: ['grass'],
      level: 1,
      exp: 1,
      fused: false,
      lineage: [],
      bossMultiplier: 1,
      shinyStacks: 0,
      skillIds: ['strike']
    })
    expect(validateMonster(data, kid)).toEqual([])
  })

  it('gen: max(bố, mẹ) × (1 + r), r ∈ [−10%, +15%], luôn lệch ít nhất 1', () => {
    const father = male('f', { genes: uniformStats(10) })
    const mother = female('m', { genes: uniformStats(20) })
    const seen = new Set<number>()
    for (let seed = 0; seed < 200; seed++) {
      for (const gene of Object.values(child(father, mother, data, seed).genes)) {
        expect(gene.toNumber()).toBeGreaterThanOrEqual(18)
        expect(gene.toNumber()).toBeLessThanOrEqual(23)
        expect(gene).not.toEqual(20)
        seen.add(gene.toNumber())
      }
    }
    expect(seen.has(18) && seen.has(23)).toBe(true)
  })

  it('gen scale theo %: gen rất lớn cũng dịch cùng tỉ lệ', () => {
    const kid = child(male('f', { genes: uniformStats(1_000_000) }), female('m'))
    for (const gene of Object.values(kid.genes)) {
      expect(gene.toNumber()).toBeGreaterThanOrEqual(900_000)
      expect(gene.toNumber()).toBeLessThanOrEqual(1_150_000)
    }
  })

  it('gen tối thiểu 1', () => {
    const kid = child(
      male('f', { genes: uniformStats(1) }),
      female('m', { genes: uniformStats(1) })
    )
    for (const gene of Object.values(kid.genes)) expect(gene.toNumber()).toBeGreaterThanOrEqual(1)
  })

  it('đột biến: mọi gen đều tăng', () => {
    const mutant = dataWith((raw) => (raw.config.breeding.mutationChance = 100))
    for (let seed = 0; seed < 50; seed++) {
      const kid = child(male('f'), female('m', { genes: uniformStats(20) }), mutant, seed)
      for (const gene of Object.values(kid.genes)) {
        expect(gene.toNumber()).toBeGreaterThanOrEqual(21)
        expect(gene.toNumber()).toBeLessThanOrEqual(23)
      }
    }
  })

  it('trait: mỗi bên 1 trait, giữ nguyên cấp', () => {
    const kid = child(
      male('f', { traits: [{ id: 'fast', level: 2 }] }),
      female('m', { traits: [{ id: 'armored', level: 3 }] })
    )
    expect(kid.traits).toEqual([
      { id: 'armored', level: 3 },
      { id: 'fast', level: 2 }
    ])
  })

  it('trait trùng thì gộp cấp; loại trừ nhau thì bốc lại trait của bố hoặc bỏ', () => {
    const merged = child(
      male('f', { traits: [{ id: 'mighty', level: 1 }] }),
      female('m', { traits: [{ id: 'mighty', level: 2 }] })
    )
    expect(merged.traits).toEqual([{ id: 'mighty', level: 3 }])

    const repick = child(
      male('f', {
        traits: [
          { id: 'fast', level: 1 },
          { id: 'armored', level: 1 }
        ]
      }),
      female('m', { traits: [{ id: 'slow', level: 1 }] })
    )
    expect(repick.traits).toEqual([
      { id: 'slow', level: 1 },
      { id: 'armored', level: 1 }
    ])

    const dropped = child(
      male('f', { traits: [{ id: 'fast', level: 1 }] }),
      female('m', { traits: [{ id: 'slow', level: 1 }] })
    )
    expect(dropped.traits).toEqual([{ id: 'slow', level: 1 }])
  })

  it('boss: bossMultiplier cao nhất của bố mẹ, trait boss cấp cao nhất', () => {
    const kid = child(
      male('f', { bossMultiplier: 3, traits: [{ id: 'bossBlood', level: 1 }] }),
      female('m', { traits: [{ id: 'bossBlood', level: 2 }] })
    )
    expect(kid.bossMultiplier).toEqual(3)
    expect(kid.traits).toEqual([{ id: 'bossBlood', level: 2 }])
    expect(validateMonster(data, kid)).toEqual([])
  })

  it('shiny: cả hai shiny thì chắc chắn shiny, stack cao nhất của bố mẹ', () => {
    const kid = child(male('f', { shinyStacks: 2 }), female('m', { shinyStacks: 1 }))
    expect(kid.shinyStacks).toEqual(2)
    expect(kid.traits).toEqual([{ id: 'shiny', level: 2 }])
  })

  it('shiny: một bên shiny dùng tỉ lệ riêng; không ai shiny dùng tỉ lệ thường (stack ≥ 1)', () => {
    const oneParent = dataWith((raw) => (raw.config.breeding.shinyChanceOneParent = 100))
    expect(child(male('f', { shinyStacks: 3 }), female('m'), oneParent).shinyStacks).toEqual(3)
    expect(child(male('f', { shinyStacks: 3 }), female('m')).shinyStacks).toEqual(0) // tỉ lệ 0
    const base = dataWith((raw) => (raw.config.breeding.shinyChance = 100))
    expect(child(male('f'), female('m'), base).shinyStacks).toEqual(1)
  })

  it('mẹ fuse: con fuse, lineage của mẹ, fusingBonusStats = max từng chỉ số', () => {
    const mother = female('m', {
      speciesId: 'fused',
      baseSpeciesId: 'strongling',
      fused: true,
      lineage: ['twig'],
      elementIds: ['fire'],
      fusingBonusStats: { ...uniformStats(5), attack: toBig(50) }
    })
    const father = male('f', { fusingBonusStats: { ...uniformStats(10), attack: toBig(1) } })
    const kid = child(father, mother)
    expect(kid).toMatchObject({
      speciesId: 'fused',
      baseSpeciesId: 'strongling', // giữ đúng dạng tiến hóa của mẹ, không về dạng đầu
      fused: true,
      lineage: ['twig'],
      fusingBonusStats: { ...uniformStats(10), attack: 50 }
    })
    expect(validateMonster(data, kid)).toEqual([])
  })

  it('bố fuse, mẹ thường: con không fuse, không có fusingBonusStats', () => {
    const father = male('f', {
      speciesId: 'fused',
      baseSpeciesId: 'weakling',
      fused: true,
      lineage: ['strongling'],
      fusingBonusStats: uniformStats(99)
    })
    const kid = child(father, female('m'))
    expect(kid.fused).toBe(false)
    expect(kid.fusingBonusStats).toEqual(uniformStats(0))
  })

  it('chiêu trứng: con học chiêu trứng của loài mà bố hoặc mẹ đang biết, ghi vào extraSkillIds', () => {
    const eggData = dataWith((raw) => {
      const twig = raw.species.find((s) => s.id === 'twig')
      if (twig?.kind === 'normal') twig.eggSkillIds = ['sap', 'blast', 'growl']
    })
    const father = male('f', { skillIds: ['strike', 'sap'] })
    const mother = female('m', { ...species('cinder', 'neutral', ['fire']), skillIds: ['growl'] })
    const kid = child(father, mother, eggData)
    expect(kid.skillIds).toEqual(['strike', 'sap', 'growl'])
    expect(kid.extraSkillIds).toEqual(['sap', 'growl'])
    expect(validateMonster(eggData, kid)).toEqual([])
    // Không ai biết chiêu trứng: như cũ.
    const plain = child(male('f', { skillIds: ['strike'] }), female('m2', species('twig')), eggData)
    expect(plain.skillIds).toEqual(['strike'])
    expect(plain.extraSkillIds).toEqual([])
  })

  it('chiêu trứng quá số ô: bỏ skill level cũ nhất, chiêu trứng được ưu tiên', () => {
    const eggData = dataWith((raw) => {
      const twig = raw.species.find((s) => s.id === 'twig')
      if (twig?.kind === 'normal') twig.eggSkillIds = ['sap', 'blast', 'growl', 'pumpUp']
    })
    const father = male('f', { skillIds: ['sap', 'blast', 'growl', 'pumpUp'] })
    const kid = child(father, female('m', species('twig')), eggData)
    expect(kid.skillIds).toEqual(['sap', 'blast', 'growl', 'pumpUp'])
    expect(kid.extraSkillIds).toEqual(['sap', 'blast', 'growl', 'pumpUp'])
  })

  it('inheritedEggSkills: theo thứ tự dữ liệu; loài không có chiêu trứng thì rỗng', () => {
    const twig = data.species.twig
    if (twig.kind !== 'normal') throw new Error('twig phải là loài thường')
    expect(inheritedEggSkills(twig, { skillIds: ['sap'] }, { skillIds: [] })).toEqual([])
    const withEggs = { ...twig, eggSkillIds: ['blast', 'sap'] }
    expect(inheritedEggSkills(withEggs, { skillIds: ['sap'] }, { skillIds: ['blast'] })).toEqual([
      'blast',
      'sap'
    ])
  })

  it('tất định theo RNG', () => {
    expect(child(male('f'), female('m'), data, 7)).toEqual(child(male('f'), female('m'), data, 7))
  })
})

describe('action breed (NPC ở thị trấn)', () => {
  const state: GameState = {
    ...makeGameState({
      seed: 3,
      party: [male('f', { level: 5, exp: toBig(125) })],
      money: toBig(1000),
      nextMonsterId: 50
    }),
    storage: [female('m', { level: 3, exp: toBig(27) })]
  }
  const action = { type: 'breed', fatherId: 'f', motherId: 'm' } as const

  it('trả tiền, nhận trứng (bố mẹ trong đội hoặc kho), bố mẹ giữ nguyên', () => {
    expect(breedCost(data, state.party[0], state.storage[0])).toEqual(160)
    const next = gameReducer(data, state, action)
    expect(next.money).toEqual(840)
    expect(next.eggs).toHaveLength(1)
    expect(next.eggs[0].id).toBe('m50')
    expect(next.eggs[0].monster.id).toBe('m50')
    expect(next.eggs[0].battlesLeft).toBeGreaterThanOrEqual(5)
    expect(next.eggs[0].battlesLeft).toBeLessThanOrEqual(10)
    expect(next.nextMonsterId).toEqual(51)
    expect(next.rng).not.toBe(state.rng)
    expect(next.party).toEqual(state.party)
    expect(next.storage).toEqual(state.storage)
  })

  it('báo lỗi: ngoài thị trấn, trong trận, sai giới tính, thiếu tiền, không tương thích', () => {
    expectActionError(
      () => gameReducer(data, { ...state, location: { type: 'floor', floor: 1 } }, action),
      'notInTown'
    )
    const inBattle = {
      ...makeBattleState([male('f')], [makeMonster({ id: 'e' })]),
      money: toBig(1000)
    }
    expectActionError(() => gameReducer(data, inBattle, action), 'inBattle')
    expectActionError(
      () => gameReducer(data, state, { type: 'breed', fatherId: 'm', motherId: 'f' }),
      'notMale'
    )
    expectActionError(
      () => gameReducer(data, { ...state, money: toBig(159) }, action),
      'notEnoughMoney',
      { need: toBig(160) }
    )
    const strict = dataWith((raw) => {
      for (const race of raw.races) race.breedsWith = []
    })
    const mixed = { ...state, storage: [female('m', species('strongling', 'brute', ['fire']))] }
    expectActionError(() => gameReducer(strict, mixed, action), 'breedIncompatible')
    expectActionError(
      () => gameReducer(data, state, { type: 'breed', fatherId: 'f', motherId: 'zz' }),
      'monsterNotOwned'
    )
  })
})

describe('kiểm tra dữ liệu breeding', () => {
  it('breedsWith phải tham chiếu race tồn tại; config breeding hợp lệ', () => {
    const issues = (edit: (raw: ReturnType<typeof makeRawData>) => void): string => {
      try {
        dataWith(edit)
        return ''
      } catch (error) {
        if (error instanceof DataError) return error.issues.join('\n')
        throw error
      }
    }
    expect(issues((raw) => (raw.races[0].breedsWith = ['ghost']))).toMatch(
      /breedsWith có race \/ nhóm không tồn tại "ghost"/
    )
    expect(issues((raw) => (raw.config.breeding.mutationChance = 200))).toMatch(
      /breeding\.mutationChance/
    )
  })
})

describe('makeOffspring — trait race', () => {
  it('con không nhận trait race qua breeding; trait race theo race của chính con', () => {
    const raceData = makeRaceTraitData()
    const father = male('f', { ...species('brawler', 'brute', ['fire']) })
    const mother = female('m')
    const kid = child(father, mother, raceData)
    expect(kid.raceId).toBe('neutral')
    expect(kid.traits.some((t) => raceData.traits[t.id].kind === 'race')).toBe(false)
    expect(raceTraitIds(raceData, kid)).toEqual(NEUTRAL_RACE_TRAIT_IDS)
    expect(validateMonster(raceData, kid)).toEqual([])
  })
})
