import { describe, expect, it } from 'vitest'
import { makeOffspring } from './breeding'
import { levelEvolutionOptions } from './evolution'
import { fuseMonsters, pickFusionTraits, previewFusion } from './fusion'
import { computeStats, getMaxHp, uniformBigStats, validateMonster } from '../monster'
import { SAVE_VERSION, gameReducer, migrateState } from '../game'
import { ActionError, cloneData, createRng, toBig } from '../shared'
import {
  makeBattleState,
  makeData,
  makeMonster,
  makeRaceTraitData,
  uniformStats,
  expectActionError,
  makeGameState,
  NEUTRAL_RACE_TRAIT_IDS
} from '../testing'
import { raceTraitIds } from '../registries'
import type { GameState, Monster, TraitInstance } from '../model'

// Fixture: quái mẫu weakling level 1 gen 10 có mọi chỉ số 50. Giá fuse 50 × tổng level.
// Ô trait: ban đầu 3, tối đa 6.
const data = makeData()

const fuseOnce = (base: Monster, sub: Monster, seed = 1): Monster =>
  fuseMonsters(data, createRng(seed), base, sub)[0]

const byId = (traits: TraitInstance[]): TraitInstance[] =>
  [...traits].sort((a, b) => a.id.localeCompare(b.id))

describe('fuseMonsters — chỉ số, loài, lineage', () => {
  it('quái gốc nhận ½ chỉ số của quái phụ, thành quái fuse, giữ phần của mình', () => {
    const base = makeMonster({
      id: 'a',
      level: 5,
      exp: 125,
      nickname: 'Gốc',
      damageTaken: 10,
      skillIds: ['strike', 'growl']
    })
    const fused = fuseOnce(base, makeMonster({ id: 'b', gender: 'male' }))
    expect(fused).toMatchObject({
      id: 'a',
      speciesId: 'fused',
      baseSpeciesId: 'weakling',
      fused: true,
      lineage: ['weakling'],
      fusingBonusStats: uniformStats(25),
      traitSlots: 4,
      level: 5,
      exp: 125,
      nickname: 'Gốc',
      damageTaken: 10,
      gender: 'female',
      raceId: 'neutral',
      elementIds: ['grass'],
      skillIds: ['strike', 'growl']
    })
    expect(getMaxHp(data, fused).gt(getMaxHp(data, base))).toBe(true)
    expect(validateMonster(data, fused)).toEqual([])
  })

  it('lấy chỉ số quái phụ ở bước withFusingBonus: tính cả bonus của nó, không tính trait', () => {
    const sub = makeMonster({
      id: 'b',
      fusingBonusStats: uniformStats(100),
      traits: [{ id: 'mighty', level: 3 }]
    })
    expect(computeStats(data, sub).withFusingBonus.attack).toEqual(150)
    expect(fuseOnce(makeMonster({ id: 'a' }), sub).fusingBonusStats).toEqual(uniformStats(75))
  })

  it('cộng dồn vô hạn qua nhiều lần fuse; ô trait +1 mỗi lần, tối đa 6', () => {
    let base = makeMonster({ id: 'a' })
    for (let i = 0; i < 5; i++) base = fuseOnce(base, makeMonster({ id: `s${i}` }), i)
    expect(base.fusingBonusStats).toEqual(uniformStats(125))
    expect(base.traitSlots).toEqual(6)
    expect(validateMonster(data, base)).toEqual([])
  })

  it('lineage thêm loài gốc và lineage của quái phụ, không lặp', () => {
    const sub = makeMonster({
      id: 'b',
      speciesId: 'fused',
      baseSpeciesId: 'strongling',
      fused: true,
      lineage: ['twig', 'weakling'],
      elementIds: ['fire']
    })
    const base = makeMonster({
      id: 'a',
      speciesId: 'fused',
      baseSpeciesId: 'weakling',
      fused: true,
      lineage: ['weakling'],
      traitSlots: 4
    })
    expect(fuseOnce(base, sub).lineage).toEqual(['weakling', 'strongling', 'twig'])
  })

  it('quái fuse không tiến hóa; xóa hướng tiến hóa đang chờ', () => {
    const base = makeMonster({
      id: 'a',
      speciesId: 'twig',
      baseSpeciesId: 'twig',
      level: 20,
      exp: 8000,
      pendingEvolutionIds: ['oak', 'pine']
    })
    const fused = fuseOnce(base, makeMonster({ id: 'b' }))
    expect(fused.pendingEvolutionIds).toEqual([])
    expect(
      levelEvolutionOptions(data, fused, { party: [], place: null, aptitudeFloor: 1, time: 0 })
    ).toEqual([])
  })
})

describe('fuseMonsters — shiny, boss', () => {
  it('shinyStacks cộng dồn, trait shiny cấp = tổng', () => {
    const fused = fuseOnce(
      makeMonster({ id: 'a', shinyStacks: 1 }),
      makeMonster({ id: 'b', shinyStacks: 2 })
    )
    expect(fused.shinyStacks).toEqual(3)
    expect(fused.traits).toContainEqual({ id: 'shiny', level: 3 })
    expect(validateMonster(data, fused)).toEqual([])
  })

  it('bossMultiplier lấy cao nhất; trait boss gộp cấp', () => {
    const fused = fuseOnce(
      makeMonster({ id: 'a', traits: [{ id: 'bossBlood', level: 1 }] }),
      makeMonster({ id: 'b', bossMultiplier: 4, traits: [{ id: 'bossBlood', level: 2 }] })
    )
    expect(fused.bossMultiplier).toEqual(4)
    expect(fused.traits).toContainEqual({ id: 'bossBlood', level: 3 })
    // ½ chỉ số boss ×4: 50 × 4 / 2 = 100
    expect(fused.fusingBonusStats.hp).toEqual(100)
  })
})

describe('fuseMonsters — trạng thái bất thường', () => {
  it('quái fuse giữ trạng thái của quái gốc, trạng thái của quái phụ mất theo nó', () => {
    const fused = fuseOnce(
      makeMonster({ id: 'a', statuses: [{ statusId: 'burn', turnsLeft: 2 }] }),
      makeMonster({ id: 'b', statuses: [{ statusId: 'sleep', turnsLeft: 3 }] })
    )
    expect(fused.statuses).toEqual([{ statusId: 'burn', turnsLeft: 2 }])
    expect(fuseOnce(makeMonster({ id: 'a' }), makeMonster({ id: 'b' })).statuses).toEqual([])
  })
})

describe('fuseMonsters — trait thường', () => {
  it('trait trùng gộp cấp', () => {
    const fused = fuseOnce(
      makeMonster({ id: 'a', traits: [{ id: 'fast', level: 1 }] }),
      makeMonster({ id: 'b', traits: [{ id: 'fast', level: 2 }] })
    )
    expect(fused.traits).toEqual([{ id: 'fast', level: 3 }])
  })

  it('đủ ô thì giữ hết trait của cả hai', () => {
    const fused = fuseOnce(
      makeMonster({ id: 'a', traits: [{ id: 'armored', level: 1 }] }),
      makeMonster({ id: 'b', traits: [{ id: 'mighty', level: 2 }] })
    )
    expect(byId(fused.traits)).toEqual([
      { id: 'armored', level: 1 },
      { id: 'mighty', level: 2 }
    ])
  })

  it('cặp loại trừ bị bỏ cả hai', () => {
    const fused = fuseOnce(
      makeMonster({
        id: 'a',
        traits: [
          { id: 'fast', level: 1 },
          { id: 'armored', level: 1 }
        ]
      }),
      makeMonster({ id: 'b', traits: [{ id: 'slow', level: 1 }] })
    )
    expect(fused.traits).toEqual([{ id: 'armored', level: 1 }])
  })

  it('nhiều trait hơn số ô: random, có thể mất trait tốt, không bao giờ vượt ô hay có cặp loại trừ', () => {
    const base = makeMonster({
      id: 'a',
      traits: [
        { id: 'fast', level: 1 },
        { id: 'armored', level: 1 },
        { id: 'mighty', level: 1 }
      ]
    })
    const sub = makeMonster({
      id: 'b',
      traits: [
        { id: 'cursed', level: 1 },
        { id: 'regen', level: 1 },
        { id: 'thickSkin', level: 1 }
      ]
    })
    const kept = new Set<string>()
    for (let seed = 0; seed < 60; seed++) {
      const fused = fuseOnce(base, sub, seed)
      expect(fused.traits).toHaveLength(4)
      expect(validateMonster(data, fused)).toEqual([])
      for (const t of fused.traits) kept.add(t.id)
    }
    // Mọi trait đều có lúc được giữ, nghĩa là cũng có lúc bị mất.
    expect(kept.size).toEqual(6)
  })

  it('pickFusionTraits: bỏ cặp rồi bốc bù; hết thì chấp nhận thiếu ô', () => {
    const pool: TraitInstance[] = [
      { id: 'fast', level: 1 },
      { id: 'slow', level: 1 },
      { id: 'armored', level: 1 },
      { id: 'mighty', level: 1 }
    ]
    for (let seed = 0; seed < 40; seed++) {
      const [picked] = pickFusionTraits(data, createRng(seed), pool, 2)
      const ids = picked.map((t) => t.id)
      expect(ids.includes('fast') && ids.includes('slow')).toBe(false)
      expect(picked.length).toBeLessThanOrEqual(2)
    }
    const [onlyPair] = pickFusionTraits(
      data,
      createRng(1),
      [
        { id: 'fast', level: 1 },
        { id: 'slow', level: 1 }
      ],
      3
    )
    expect(onlyPair).toEqual([])
  })
})

describe('action fuse (NPC ở thị trấn)', () => {
  const state: GameState = {
    ...makeGameState({
      seed: 4,
      party: [makeMonster({ id: 'a', level: 5, exp: 125 }), makeMonster({ id: 'p' })],
      money: toBig(1000)
    }),
    // Quái phụ khác loài với quái gốc (điều kiện fuse theo loài).
    storage: [makeMonster({ id: 'b', speciesId: 'twig', baseSpeciesId: 'twig', level: 3, exp: 27 })]
  }
  const action = { type: 'fuse', baseId: 'a', subId: 'b' } as const

  it('trả tiền, quái phụ mất đi, quái gốc thay tại chỗ', () => {
    const next = gameReducer(data, state, action)
    expect(next.money).toEqual(1000 - 50 * (5 + 3))
    expect(next.storage).toEqual([])
    expect(next.party.map((m) => m.id)).toEqual(['a', 'p'])
    expect(next.party[0].fused).toBe(true)
    expect(state.party[0].fused).toBe(false) // state cũ không đổi
  })

  it('quái gốc trong kho, quái phụ trong đội cũng được (đội còn ít nhất 1 con)', () => {
    const next = gameReducer(data, state, { type: 'fuse', baseId: 'b', subId: 'p' })
    expect(next.party.map((m) => m.id)).toEqual(['a'])
    expect(next.storage[0].fused).toBe(true)
  })

  it('xem trước đúng với kết quả', () => {
    const preview = previewFusion(data, state.party[0], state.storage[0])
    const fused = gameReducer(data, state, action).party[0]
    expect(preview.cost).toEqual(400)
    expect(fused.fusingBonusStats).toEqual(preview.bonusGain)
    expect(fused.traitSlots).toBe(preview.traitSlots)
    expect(fused.shinyStacks).toBe(preview.shinyStacks)
    expect(fused.bossMultiplier).toBe(preview.bossMultiplier)
  })

  it('báo lỗi: ngoài thị trấn, trong trận, cùng một con, không sở hữu, đội trống, thiếu tiền', () => {
    expectActionError(
      () => gameReducer(data, { ...state, location: { type: 'floor', floor: 1 } }, action),
      'notInTown'
    )
    const inBattle = { ...makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })]) }
    expectActionError(() => gameReducer(data, inBattle, action), 'inBattle')
    expectActionError(
      () => gameReducer(data, state, { type: 'fuse', baseId: 'a', subId: 'a' }),
      'fuseSameMonster'
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'fuse', baseId: 'a', subId: 'zz' }),
      'monsterNotOwned'
    )
    const lonely = { ...state, party: [makeMonster({ id: 'p' })] }
    expectActionError(
      () => gameReducer(data, lonely, { type: 'fuse', baseId: 'b', subId: 'p' }),
      'partyWouldBeEmpty'
    )
    expectActionError(
      () => gameReducer(data, { ...state, money: toBig(399) }, action),
      'notEnoughMoney',
      { need: toBig(400) }
    )
  })

  it('tất định', () => {
    expect(gameReducer(data, state, action)).toEqual(gameReducer(data, state, action))
  })
})

describe('điều kiện fuse theo loài', () => {
  const fusedMonster = (id: string, baseSpeciesId: string, lineage: string[]): Monster =>
    makeMonster({ id, speciesId: 'fused', baseSpeciesId, fused: true, lineage, traitSlots: 6 })
  const normal = (id: string, speciesId: string): Monster =>
    makeMonster({ id, speciesId, baseSpeciesId: speciesId })
  const stateWith = (base: Monster, sub: Monster): GameState => ({
    ...makeGameState({ seed: 1, party: [base, makeMonster({ id: 'p' })], money: toBig(10_000) }),
    storage: [sub]
  })
  const fuseAction = { type: 'fuse', baseId: 'a', subId: 'b' } as const

  it('hợp lệ: khác loài (kể cả cùng race, cùng chuỗi tiến hóa)', () => {
    // weakling → strongling cùng race neutral, cùng chuỗi tiến hóa.
    const base = normal('a', 'weakling')
    const sub = normal('b', 'strongling')
    expect(previewFusion(data, base, sub)).toMatchObject({
      canFuse: true,
      newSpeciesIds: ['strongling']
    })
    expect(gameReducer(data, stateWith(base, sub), fuseAction).party[0].lineage).toEqual([
      'strongling'
    ])
  })

  it('báo lỗi khi quái phụ trùng loài gốc; state giữ nguyên', () => {
    const state = stateWith(normal('a', 'weakling'), normal('b', 'weakling'))
    const before = cloneData(state)
    expect(previewFusion(data, state.party[0], state.storage[0])).toMatchObject({
      canFuse: false,
      newSpeciesIds: []
    })
    expect(() => gameReducer(data, state, fuseAction)).toThrow(ActionError)
    expectActionError(() => gameReducer(data, state, fuseAction), 'fuseNoNewSpecies', {
      speciesIds: ['weakling']
    })
    expect(state).toEqual(before)
  })

  it('báo lỗi khi loài của quái phụ đã nằm trong lineage của quái gốc', () => {
    const state = stateWith(fusedMonster('a', 'weakling', ['twig']), normal('b', 'twig'))
    expectActionError(() => gameReducer(data, state, fuseAction), 'fuseNoNewSpecies')
  })

  it('quái phụ fuse: được khi đóng góp ít nhất 1 loài mới, lỗi khi mọi loài đã có', () => {
    const base = fusedMonster('a', 'weakling', ['twig'])
    const withNew = fusedMonster('b', 'twig', ['weakling', 'oak'])
    expect(previewFusion(data, base, withNew)).toMatchObject({
      canFuse: true,
      newSpeciesIds: ['oak']
    })
    // Luật lineage giữ nguyên: thêm loài của quái phụ chưa có trong lineage (kể cả loài gốc).
    expect(gameReducer(data, stateWith(base, withNew), fuseAction).party[0].lineage).toEqual([
      'twig',
      'weakling',
      'oak'
    ])

    const nothingNew = fusedMonster('b', 'twig', ['weakling'])
    expect(previewFusion(data, base, nothingNew).canFuse).toBe(false)
    expect(() => gameReducer(data, stateWith(base, nothingNew), fuseAction)).toThrow(ActionError)
  })
})

describe('số ô trait', () => {
  it('con breeding nhận số ô cao nhất của bố mẹ (kể cả quái thường)', () => {
    const [kid] = makeOffspring(
      data,
      createRng(1),
      makeMonster({ id: 'f', gender: 'male', traitSlots: 5 }),
      makeMonster({ id: 'm' }),
      'kid'
    )
    expect(kid.fused).toBe(false)
    expect(kid.traitSlots).toEqual(5)
    expect(validateMonster(data, kid)).toEqual([])
  })

  it('traitSlots phải trong [3, 6]; số trait thường không vượt traitSlots', () => {
    expect(validateMonster(data, makeMonster({ traitSlots: 7 })).join()).toMatch(/traitSlots/)
    expect(validateMonster(data, makeMonster({ traitSlots: 2 })).join()).toMatch(/traitSlots/)
    const four = [
      { id: 'fast', level: 1 },
      { id: 'armored', level: 1 },
      { id: 'mighty', level: 1 },
      { id: 'cursed', level: 1 }
    ]
    expect(validateMonster(data, makeMonster({ traits: four, traitSlots: 4 }))).toEqual([])
    expect(validateMonster(data, makeMonster({ traits: four })).join()).toMatch(/tối đa 3/)
  })

  it('migrate v5 → v6: quái thường 3 ô, quái fuse 6 ô', () => {
    const plain: Record<string, unknown> = { ...makeMonster({ id: 'a' }) }
    const fused: Record<string, unknown> = {
      ...makeMonster({
        id: 'b',
        speciesId: 'fused',
        baseSpeciesId: 'weakling',
        fused: true,
        lineage: ['strongling']
      })
    }
    delete plain.traitSlots
    delete fused.traitSlots
    const migrated = migrateState(
      {
        ...makeGameState({ seed: 1 }),
        version: 5,
        party: [plain],
        storage: [fused]
      },
      data
    )
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.party[0].traitSlots).toEqual(3)
    expect(migrated.storage[0].traitSlots).toEqual(6)
  })
})

describe('fuse nhiều lần liên tiếp — số cực lớn (Decimal)', () => {
  it('fusingBonusStats cộng dồn vượt giới hạn number vẫn hữu hạn và đúng', () => {
    let base = makeMonster({ id: 'a', traitSlots: 6 })
    const sub = makeMonster({ id: 's', genes: uniformBigStats('1e400') })
    // Mỗi lần nhận ½ chỉ số withFusingBonus của quái phụ: (30 + 2e400) / 2 ≈ 1e400.
    for (let i = 0; i < 30; i++) base = fuseOnce(base, { ...sub, id: `s${i}` }, i)
    for (const value of Object.values(base.fusingBonusStats)) {
      expect(value.isFinite()).toBe(true)
      expect(value.div('3e401').minus(1).abs().lt(1e-30)).toBe(true)
    }
    // 3e401 + 50 vượt 40 chữ số có nghĩa nên bằng đúng 3e401.
    expect(computeStats(data, base).final.attack.gte('3e401')).toBe(true)
  })
})

describe('fuseMonsters — trait race', () => {
  it('quái fuse giữ race và trait race của quái gốc, không nhận trait race của quái phụ', () => {
    const raceData = makeRaceTraitData()
    const base = makeMonster({ id: 'base', traits: [{ id: 'fast', level: 1 }] })
    const sub = makeMonster({
      id: 'sub',
      speciesId: 'brawler',
      baseSpeciesId: 'brawler',
      raceId: 'brute',
      elementIds: ['fire']
    })
    const fused = fuseMonsters(raceData, createRng(1), base, sub)[0]
    expect(fused.raceId).toBe('neutral')
    expect(raceTraitIds(raceData, fused)).toEqual(NEUTRAL_RACE_TRAIT_IDS)
    expect(fused.traits.some((t) => raceData.traits[t.id].kind === 'race')).toBe(false)
    expect(validateMonster(raceData, fused)).toEqual([])
  })
})
