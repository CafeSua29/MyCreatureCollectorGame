import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { cloneData, toBig } from '../shared'
import { getMonsterView, listMonsters, monsterName } from './roster'
import { createGameData } from '../gameData'
import { computeStats } from '../monster'
import {
  defined,
  makeData,
  makeMonster,
  makeRaceTraitData,
  makeRawData,
  uniformStats,
  makeGameState,
  NEUTRAL_RACE_TRAIT_IDS
} from '../testing'
import type { GameState, Monster } from '../model'

const data = makeData()

const strong = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    speciesId: 'strongling',
    baseSpeciesId: 'strongling',
    elementIds: ['fire'],
    skillIds: ['strike', 'wave'],
    ...overrides
  })

function stateWith(party: Monster[], storage: Monster[] = []): GameState {
  return { ...makeGameState({ seed: 1, party }), storage }
}

describe('getMonsterView', () => {
  it('tính lại mọi thông tin hiển thị từ nguyên liệu của quái', () => {
    const monster = makeMonster({
      id: 'a',
      level: 3,
      exp: 30,
      damageTaken: 10,
      shinyStacks: 1,
      traits: [
        { id: 'fast', level: 2 },
        { id: 'shiny', level: 1 }
      ],
      skillIds: ['strike', 'growl']
    })
    const view = defined(getMonsterView(data, stateWith([monster]), 'a'))
    const stats = computeStats(data, monster).final
    expect(view).toMatchObject({
      id: 'a',
      nickname: null,
      speciesId: 'weakling',
      baseSpeciesId: 'weakling',
      location: 'party',
      index: 0,
      level: 3,
      exp: 30,
      expForNextLevel: 64,
      expToNextLevel: 34,
      raceId: 'neutral',
      elementIds: ['grass'],
      maxHp: stats.hp,
      hp: stats.hp.minus(10),
      fainted: false,
      stats,
      shinyStacks: 1,
      shinyRewardMultiplier: 1.5,
      traitSlotsUsed: 1, // trait shiny không chiếm ô
      traitSlotsMax: 3
    })
    expect(view.totalStats).toEqual(Object.values(stats).reduce((a, b) => a.plus(b)))
    expect(view.traits.map((t) => [t.id, t.level, t.usesSlot])).toEqual([
      ['fast', 2, true],
      ['shiny', 1, false]
    ])
    // Trait race hiển thị riêng, không nằm trong traits, không chiếm ô.
    expect(view.raceTraitIds).toEqual(['raceMark'])
    expect(view.skills.map((s) => s.id)).toEqual(['strike', 'growl'])
    // Không có chữ hiển thị trong view: tên tra theo id (mục "Đa ngôn ngữ").
    expect(JSON.stringify(view)).not.toMatch(/"name"/)
  })

  it('quái fuse: loài chung, chỉ số từ loài gốc, lineage là danh sách loài, 6 ô trait', () => {
    const fused = makeMonster({
      id: 'f',
      speciesId: 'fused',
      baseSpeciesId: 'strongling',
      fused: true,
      lineage: ['weakling'],
      traitSlots: 6,
      elementIds: ['fire']
    })
    const view = defined(getMonsterView(data, stateWith([fused]), 'f'))
    expect(view.speciesId).toBe('fused')
    expect(view.baseSpeciesId).toBe('strongling')
    expect(view.lineage).toEqual(['weakling'])
    expect(view.traitSlotsMax).toEqual(6)
  })

  it('dùng biệt danh làm tên hiển thị; tìm được quái trong kho; null nếu không sở hữu', () => {
    const state = stateWith(
      [makeMonster({ id: 'a' })],
      [makeMonster({ id: 'b', nickname: 'Bé Na' })]
    )
    const view = defined(getMonsterView(data, state, 'b'))
    expect(monsterName(data, 'vi', view)).toBe('Bé Na')
    const plain = defined(getMonsterView(data, state, 'a'))
    expect(monsterName(data, 'vi', plain)).toBe('weakling')
    expect(monsterName(data, 'en', plain)).toBe('weakling-en')
    expect(view.location).toBe('storage')
    expect(getMonsterView(data, state, 'zz')).toBeNull()
  })

  it('quái gục: hp 0, fainted', () => {
    const view = defined(
      getMonsterView(data, stateWith([makeMonster({ id: 'a', damageTaken: 999 })]), 'a')
    )
    expect(view.hp).toEqual(0)
    expect(view.fainted).toBe(true)
  })

  it('trạng thái bất thường: có trong view (bản sao), chỉ số đã áp (tê liệt giảm tốc độ)', () => {
    const statuses = [{ statusId: 'paralysis', turnsLeft: 2 }]
    const monster = makeMonster({ id: 'a', statuses })
    const view = defined(getMonsterView(data, stateWith([monster]), 'a'))
    expect(view.statuses).toEqual(statuses)
    expect(view.statuses).not.toBe(monster.statuses)
    expect(view.stats.speed.toNumber()).toBe(25)
  })
})

describe('listMonsters', () => {
  const state = stateWith(
    [
      makeMonster({ id: 'a', level: 5, exp: 125 }),
      strong('b', { level: 2, exp: toBig(8), damageTaken: toBig(999) })
    ],
    [
      makeMonster({ id: 'c', level: 9, exp: 729, shinyStacks: 1, nickname: 'Zeta' }),
      strong('d', { bossMultiplier: 3, traits: [{ id: 'fast', level: 1 }] }),
      makeMonster({ id: 'e', raceId: 'brute', nickname: 'Alpha' })
    ]
  )
  const ids = (query: Parameters<typeof listMonsters>[2]): string[] =>
    listMonsters(data, state, query).map((v) => v.id)

  it('mặc định: đội theo thứ tự đội, rồi kho theo thứ tự vào kho', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids({ location: 'party' })).toEqual(['a', 'b'])
    expect(ids({ location: 'storage' })).toEqual(['c', 'd', 'e'])
  })

  it('lọc theo loài, race, hệ, trait, shiny, boss, fused, đã gục', () => {
    expect(ids({ speciesId: 'strongling' })).toEqual(['b', 'd'])
    expect(ids({ raceId: 'brute' })).toEqual(['e'])
    expect(ids({ elementId: 'fire' })).toEqual(['b', 'd'])
    expect(ids({ traitId: 'fast' })).toEqual(['d'])
    expect(ids({ shiny: true })).toEqual(['c'])
    expect(ids({ boss: true })).toEqual(['d'])
    expect(ids({ boss: false, shiny: false })).toEqual(['a', 'b', 'e'])
    expect(ids({ fused: true })).toEqual([])
    expect(ids({ fainted: true })).toEqual(['b'])
    expect(ids({ location: 'storage', speciesId: 'weakling' })).toEqual(['c', 'e'])
  })

  it('sắp xếp theo level, chỉ số, tổng chỉ số, tên; bằng nhau giữ thứ tự mặc định', () => {
    expect(ids({ sort: { by: 'level', order: 'desc' } })).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(ids({ sort: { by: 'level' } })).toEqual(['d', 'e', 'b', 'a', 'c'])
    // d là boss ×3 nên tổng chỉ số cao nhất
    expect(ids({ sort: { by: 'totalStats', order: 'desc' } })[0]).toBe('d')
    expect(ids({ sort: { by: 'attack', order: 'desc' } })[0]).toBe('d')
    // Tên hiển thị (fixture: tên = id): Alpha, strongling, strongling, weakling, Zeta
    expect(ids({ sort: { by: 'name' } })).toEqual(['e', 'b', 'd', 'a', 'c'])
    expect(ids({ sort: { by: 'species' } })).toEqual(['b', 'd', 'a', 'c', 'e'])
  })

  it('sắp theo tên dùng chữ của ngôn ngữ được chọn', () => {
    const raw = makeRawData()
    raw.text.languages.en.content.species.weakling = 'Aardvark'
    const localized = createGameData(raw)
    const bySpecies = (language?: string): string[] =>
      listMonsters(localized, state, { sort: { by: 'species', language } }).map((v) => v.id)
    // vi (mặc định): strongling < weakling; en: Aardvark < strongling-en
    expect(bySpecies()).toEqual(['b', 'd', 'a', 'c', 'e'])
    expect(bySpecies('en')).toEqual(['a', 'c', 'e', 'b', 'd'])
    // Ngôn ngữ không có thì dùng ngôn ngữ mặc định.
    expect(bySpecies('xx')).toEqual(['b', 'd', 'a', 'c', 'e'])
    const byName = listMonsters(localized, state, { sort: { by: 'name', language: 'en' } })
    expect(byName.map((v) => v.id)).toEqual(['a', 'e', 'b', 'd', 'c'])
  })

  it('không sửa state', () => {
    const before = cloneData(state)
    listMonsters(data, state, { sort: { by: 'level', order: 'desc' } })
    expect(state).toEqual(before)
  })

  it('chỉ số hiển thị không gồm gen hay bậc trận ngoài nguyên liệu', () => {
    const view = listMonsters(
      data,
      stateWith([makeMonster({ id: 'x', genes: uniformStats(20) })])
    )[0]
    expect(view.stats.hp).toEqual(70) // 30 + 20 × 2
    expect(view.genes.hp).toEqual(20)
  })
})

describe('MonsterView — tư chất', () => {
  // Fixture: gen tối đa quái hoang tầng 1 là 10 mỗi chỉ số (tổng 60).
  const state = stateWith(
    [makeMonster({ id: 'a', genes: uniformStats(10) })],
    [
      makeMonster({ id: 'b', genes: uniformStats(2) }),
      makeMonster({ id: 'c', genes: uniformStats(13) }),
      makeMonster({ id: 'd', genes: uniformStats(4) })
    ]
  )
  const ids = (query: Parameters<typeof listMonsters>[2]): string[] =>
    listMonsters(data, state, query).map((v) => v.id)

  it('tỉ lệ và bậc theo tầng cao nhất từng đạt', () => {
    const view = defined(getMonsterView(data, state, 'a'))
    expect(view.aptitude.tierId).toBe('refined')
    expect(view.aptitude.ratio.eq(1)).toBe(true)
    // Tầng mốc cao hơn với gen quái hoang tăng theo tầng: cùng quái tụt bậc.
    const growing = { ...data, config: { ...data.config, floors: { ...data.config.floors } } }
    growing.config.floors.geneGrowthPerFloor = 2
    const higher = { ...state, highestFloor: 2, floorBiomeIds: [...state.floorBiomeIds, 'field'] }
    expect(defined(getMonsterView(growing, higher, 'a')).aptitude.tierId).toBe('good')
  })

  it('lọc theo bậc tối thiểu và sắp xếp theo tỉ lệ', () => {
    expect(ids({ minAptitudeTierId: 'refined' })).toEqual(['a', 'c'])
    expect(ids({ minAptitudeTierId: 'good' })).toEqual(['a', 'c', 'd'])
    expect(ids({ minAptitudeTierId: 'mortal' })).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ sort: { by: 'aptitude', order: 'desc' } })).toEqual(['c', 'a', 'd', 'b'])
  })
})

describe('MonsterView — phẩm cấp loài', () => {
  // Fixture: weakling (tổng 180) bậc G, strongling (tổng 360) bậc E; quái fuse theo loài gốc.
  const state = stateWith(
    [makeMonster({ id: 'a' })],
    [strong('b'), strong('c', { speciesId: 'fused', fused: true, lineage: ['weakling'] })]
  )
  const ids = (query: Parameters<typeof listMonsters>[2]): string[] =>
    listMonsters(data, state, query).map((v) => v.id)

  it('id bậc theo loài cung cấp chỉ số gốc', () => {
    expect(listMonsters(data, state).map((v) => v.speciesRankId)).toEqual(['G', 'E', 'E'])
  })

  it('lọc theo bậc tối thiểu và sắp xếp theo bậc', () => {
    expect(ids({ minSpeciesRankId: 'E' })).toEqual(['b', 'c'])
    expect(ids({ minSpeciesRankId: 'G' })).toEqual(['a', 'b', 'c'])
    expect(ids({ minSpeciesRankId: 'X' })).toEqual([])
    expect(ids({ sort: { by: 'speciesRank', order: 'desc' } })).toEqual(['b', 'c', 'a'])
  })
})

describe('MonsterView — trait race', () => {
  it('trait race theo race của quái, chỉ số đã áp trait race', () => {
    const raceData = makeRaceTraitData()
    const neutral = makeMonster({ id: 'a' })
    const brute = makeMonster({ id: 'b', raceId: 'brute' })
    const state = stateWith([neutral, brute])
    const neutralView = defined(getMonsterView(raceData, state, 'a'))
    expect(neutralView.raceTraitIds).toEqual(NEUTRAL_RACE_TRAIT_IDS)
    expect(neutralView.traits).toEqual([])
    expect(neutralView.traitSlotsUsed).toBe(0)
    expect(neutralView.stats).toEqual(computeStats(raceData, neutral).final)
    expect(defined(getMonsterView(raceData, state, 'b')).raceTraitIds).toEqual(['raceMark'])
  })
})
