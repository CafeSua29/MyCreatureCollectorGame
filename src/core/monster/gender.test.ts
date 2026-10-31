// Loài không giới tính (mục "Loài không giới tính" trong docs/rules/world-items.md).
// Fixture: pebble (không giới tính) → boulder (có giới tính) ở level 10;
// nymph (có giới tính) → husk (không giới tính) ở level 10.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { createRng, pick, toBig } from '../shared'
import { genderAfterEvolution, isGenderlessSpecies, rollGender } from './gender'
import { validateMonster } from './validateMonster'
import { rollMonster } from '../world'
import { breedBlocker, evolveMonster, fuse, makeOffspring } from '../progression'
import { createNewGame, gameReducer, rollStarters } from '../game'
import {
  expectActionError,
  makeData,
  makeMonster,
  makeRawData,
  type MonsterOverrides,
  makeGameState
} from '../testing'
import { SEXED_GENDERS, type Monster } from '../model'

const data = makeData()

const pebble = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ speciesId: 'pebble', baseSpeciesId: 'pebble', gender: 'none', ...overrides })

describe('isGenderlessSpecies / rollGender', () => {
  it('chỉ loài thường có genderless: true là không giới tính', () => {
    expect(isGenderlessSpecies(data, 'pebble')).toBe(true)
    expect(isGenderlessSpecies(data, 'weakling')).toBe(false)
    expect(isGenderlessSpecies(data, 'fused')).toBe(false)
    expect(isGenderlessSpecies(data, 'ghost')).toBe(false)
  })

  it('loài không giới tính: none, không tốn RNG', () => {
    const rng = createRng(3)
    expect(rollGender(data, rng, 'pebble')).toEqual(['none', rng])
  })

  it('loài có giới tính: tung đực / cái như trước', () => {
    const rng = createRng(3)
    expect(rollGender(data, rng, 'weakling')).toEqual(pick(rng, SEXED_GENDERS))
  })
})

describe('validateMonster: gender theo loài gốc', () => {
  it('none khi và chỉ khi loài gốc không giới tính', () => {
    expect(validateMonster(data, pebble())).toEqual([])
    expect(validateMonster(data, makeMonster({ gender: 'male' }))).toEqual([])
    expect(validateMonster(data, pebble({ gender: 'female' }))).toEqual([
      'loài "pebble" không giới tính, gender phải là "none"'
    ])
    expect(validateMonster(data, makeMonster({ gender: 'none' }))).toEqual([
      'gender "none" chỉ dành cho loài không giới tính ("weakling")'
    ])
  })

  it('quái fuse xét theo loài gốc (baseSpeciesId)', () => {
    const fused = pebble({
      speciesId: 'fused',
      fused: true,
      lineage: ['weakling'],
      traitSlots: 4
    })
    expect(validateMonster(data, fused)).toEqual([])
  })
})

describe('quái hoang / trứng / boss', () => {
  it('rollMonster loài không giới tính ra none', () => {
    const [monster] = rollMonster(
      data,
      createRng(1),
      {
        encounters: [{ speciesId: 'pebble', weight: 1 }],
        levelMin: 1,
        levelMax: 1,
        geneMultiplier: toBig(1),
        shinyChance: 0,
        aging: false
      },
      'w1'
    )
    expect(monster.gender).toBe('none')
    expect(validateMonster(data, monster)).toEqual([])
  })

  it('con breeding có dạng đầu không giới tính thì ra none', () => {
    // Mẹ boulder (có giới tính) có dạng đầu pebble (không giới tính).
    const father = makeMonster({
      id: 'f',
      gender: 'male',
      speciesId: 'boulder',
      baseSpeciesId: 'boulder'
    })
    const mother = makeMonster({
      id: 'm',
      gender: 'female',
      speciesId: 'boulder',
      baseSpeciesId: 'boulder'
    })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'c')
    expect(child.speciesId).toBe('pebble')
    expect(child.gender).toBe('none')
    expect(validateMonster(data, child)).toEqual([])
  })
})

describe('breeding', () => {
  it('quái không giới tính không breed được', () => {
    const female = makeMonster({ id: 'f', gender: 'female' })
    expect(breedBlocker(data, pebble({ id: 'p' }), female)).toBe('breedGenderless')
    expect(breedBlocker(data, female, pebble({ id: 'p' }))).toBe('breedGenderless')
    expect(breedBlocker(data, pebble({ id: 'p' }), pebble({ id: 'q' }))).toBe('breedGenderless')
  })

  it('action breed báo lỗi, state giữ nguyên', () => {
    const state = makeGameState({
      seed: 1,
      party: [pebble({ id: 'p' }), makeMonster({ id: 'f', gender: 'female' })],
      money: 1e6
    })
    expectActionError(
      () => gameReducer(data, state, { type: 'breed', fatherId: 'p', motherId: 'f' }),
      'notMale',
      { monsterId: 'p' }
    )
  })
})

describe('tiến hóa', () => {
  it('có giới tính → không giới tính: thành none, không tốn RNG', () => {
    const rng = createRng(4)
    const nymph = makeMonster({ speciesId: 'nymph', baseSpeciesId: 'nymph', gender: 'male' })
    expect(genderAfterEvolution(data, rng, nymph, 'husk')).toEqual(['none', rng])
    const result = evolveMonster(
      data,
      { ...nymph, level: 10 },
      { toSpeciesId: 'husk', rng, day: 0 }
    )
    expect(result.monster.gender).toBe('none')
    expect(result.rng).toEqual(rng)
    expect(validateMonster(data, result.monster)).toEqual([])
  })

  it('không giới tính → có giới tính: tung 50/50 bằng RNG của core', () => {
    const rng = createRng(4)
    const [expected, after] = pick(rng, SEXED_GENDERS)
    const result = evolveMonster(data, pebble({ level: 10 }), {
      toSpeciesId: 'boulder',
      rng,
      day: 0
    })
    expect(result.monster.gender).toBe(expected)
    expect(result.rng).toEqual(after)
    expect(validateMonster(data, result.monster)).toEqual([])
    // Nhiều seed khác nhau ra cả đực lẫn cái.
    const genders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (seed) =>
          evolveMonster(data, pebble({ level: 10 }), {
            toSpeciesId: 'boulder',
            rng: createRng(seed),
            day: 0
          }).monster.gender
      )
    )
    expect(genders).toEqual(new Set(['male', 'female']))
  })

  it('có giới tính → có giới tính: giữ nguyên, không tốn RNG', () => {
    const rng = createRng(4)
    const result = evolveMonster(data, makeMonster({ gender: 'male', level: 10 }), {
      toSpeciesId: 'strongling',
      rng,
      day: 0
    })
    expect(result.monster.gender).toBe('male')
    expect(result.rng).toEqual(rng)
  })

  it('chooseEvolution lưu RNG mới vào state', () => {
    const state = makeGameState({
      seed: 9,
      party: [pebble({ level: 10, pendingEvolutionIds: ['boulder'] })]
    })
    const next = gameReducer(data, state, {
      type: 'chooseEvolution',
      monsterId: 'm1',
      speciesId: 'boulder'
    })
    const [expected, after] = pick(state.rng, SEXED_GENDERS)
    expect(next.party[0].gender).toBe(expected)
    expect(next.rng).toEqual(after)
  })
})

describe('đá tiến hóa ngoài trận', () => {
  it('không giới tính → có giới tính bằng đá: tung giới tính, lưu RNG mới vào state', () => {
    const raw = makeRawData()
    const stoneData = createGameData({
      ...raw,
      species: raw.species.map((s) =>
        s.id === 'pebble' && s.kind === 'normal'
          ? { ...s, evolutions: [{ speciesId: 'boulder', level: 1, itemId: 'fireStone' }] }
          : s
      )
    })
    const state = {
      ...makeGameState({ seed: 11, party: [pebble()] }),
      inventory: { stacks: { fireStone: 1 }, crystals: [], books: [], equipment: [], souls: [] }
    }
    const next = gameReducer(stoneData, state, {
      type: 'useItem',
      itemId: 'fireStone',
      monsterId: 'm1'
    })
    const [expected, after] = pick(state.rng, SEXED_GENDERS)
    expect(next.party[0].speciesId).toBe('boulder')
    expect(next.party[0].gender).toBe(expected)
    expect(next.rng).toEqual(after)
  })
})

describe('fuse', () => {
  it('quái fuse lấy giới tính của quái gốc (kể cả none)', () => {
    const state = makeGameState({
      seed: 1,
      // Thêm quái thứ ba: đội phải còn ít nhất 1 con kể cả khi fuse thất bại mất cả hai.
      party: [
        pebble({ id: 'p' }),
        makeMonster({ id: 'w', gender: 'male' }),
        makeMonster({ id: 'x' })
      ],
      money: 1e6
    })
    const next = fuse(data, state, { baseId: 'p', subId: 'w' })
    expect(next.party[0].gender).toBe('none')
    expect(validateMonster(data, next.party[0])).toEqual([])
  })
})

describe('thuốc đổi giới tính', () => {
  it('dùng lên quái không giới tính: không có tác dụng, không mất thuốc', () => {
    const state = {
      ...makeGameState({ seed: 1, party: [pebble()] }),
      inventory: { stacks: { genderPotion: 1 }, crystals: [], books: [], equipment: [], souls: [] }
    }
    expectActionError(
      () => gameReducer(data, state, { type: 'useItem', itemId: 'genderPotion', monsterId: 'm1' }),
      'itemNoEffect',
      { itemId: 'genderPotion', monsterId: 'm1' }
    )
  })
})

describe('game mới', () => {
  const genderlessStarter = (() => {
    const raw = makeRawData()
    raw.config.starter.speciesIds = ['pebble', 'weakling']
    return createGameData(raw)
  })()

  it('quái khởi đầu không giới tính: ứng viên none, chỉ nhận gender none', () => {
    const [candidate] = rollStarters(genderlessStarter, 5).candidates
    expect(candidate.gender).toBe('none')
    const options = { seed: 5, starterSpeciesId: 'pebble', nickname: null }
    const state = createNewGame(genderlessStarter, { ...options, gender: 'none' })
    expect(state.party[0].gender).toBe('none')
    expectActionError(
      () => createNewGame(genderlessStarter, { ...options, gender: 'male' }),
      'malformedAction'
    )
  })

  it('quái khởi đầu có giới tính không nhận none', () => {
    expectActionError(
      () =>
        createNewGame(genderlessStarter, {
          seed: 5,
          starterSpeciesId: 'weakling',
          nickname: null,
          gender: 'none'
        }),
      'malformedAction'
    )
  })
})
