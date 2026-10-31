// Sách kỹ năng (docs/rules/skill-books.md): tương thích từng điều kiện, Bí kíp mất / Chân kinh giữ,
// đủ ô → chờ học, skill không có sách, học lại ở NPC, giữ / không giữ khi tiến hóa / fuse / breed,
// kiểm tra quái.
// Fixture: weakling (cỏ) → strongling (lửa); twig (cỏ) → oak / pine (cỏ) / cinder (lửa); blast
// (lửa) có trong learnset của weakling, oak, cinder; sap (cỏ); strike / flurry (thường).

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { evolutionLineOf, getBookCount, isSkillBookCompatible } from '../inventory'
import { evolveMonster, fuseMonsters, makeOffspring } from '../progression'
import { createRng, toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  type MonsterOverrides
} from '../testing'
import { createGameData } from '../gameData'
import type { BookStack, GameData, GameState, ItemRef, Monster } from '../model'
import { relearnableSkills } from './skills'
import { validateMonster } from './validateMonster'

const data = makeData()

const book = (skillId: string, reusable = false): ItemRef => ({
  storage: 'book',
  skillId,
  reusable
})

const monsterA = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', ...overrides })

/** Thị trấn, quái a trong đội, túi có các chồng sách. */
function stateWith(monster: Monster, books: BookStack[], game: GameState | null = null): GameState {
  const base = game ?? makeGameState({ seed: 1, party: [monster] })
  return { ...base, inventory: makeInventory({}, [], [], books), money: toBig(10_000) }
}

const useBook = (
  state: GameState,
  item: unknown,
  monsterId = 'a',
  game: GameData = data
): GameState =>
  // Ép kiểu: test cố ý gửi cả định danh sai dạng như renderer có thể gửi lúc chạy.
  gameReducer(game, state, { type: 'useSkillBook', monsterId, item: item as ItemRef })

describe('chuỗi tiến hóa', () => {
  it('gồm dạng trước và dạng sau, không gồm nhánh anh em', () => {
    expect(evolutionLineOf(data, 'pine').sort()).toEqual(['pine', 'twig'])
    expect(evolutionLineOf(data, 'twig').sort()).toEqual(['cinder', 'oak', 'pine', 'twig'])
    expect(evolutionLineOf(data, 'strongling').sort()).toEqual(['strongling', 'weakling'])
    expect(evolutionLineOf(data, 'brawler')).toEqual(['brawler'])
  })
})

describe('tương thích', () => {
  const pine = monsterA({ speciesId: 'pine', baseSpeciesId: 'pine', elementIds: ['grass'] })

  it('cùng hệ với quái, hoặc hệ thường', () => {
    expect(isSkillBookCompatible(data, pine, 'sap')).toBe(true)
    expect(isSkillBookCompatible(data, pine, 'flurry')).toBe(true)
  })

  it('learnset của dạng sau (twig → oak học blast) và dạng trước (strongling ← weakling học sap)', () => {
    const twig = monsterA({ speciesId: 'twig', baseSpeciesId: 'twig' })
    const strongling = monsterA({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire']
    })
    expect(isSkillBookCompatible(data, twig, 'blast')).toBe(true)
    expect(isSkillBookCompatible(data, strongling, 'sap')).toBe(true)
  })

  it('không tương thích: khác hệ, chỉ nhánh anh em học được (pine không học blast)', () => {
    expect(isSkillBookCompatible(data, pine, 'blast')).toBe(false)
    expect(isSkillBookCompatible(data, pine, 'missing')).toBe(false)
  })

  it('bookSkillIds của loài trong chuỗi mở thêm skill (kiểu Arceus với Draco Meteor)', () => {
    const raw = makeRawData()
    const species = defined(raw.species.find((s) => s.id === 'twig'))
    Object.assign(species, { bookSkillIds: ['blast'] })
    expect(isSkillBookCompatible(createGameData(raw), pine, 'blast')).toBe(true)
  })

  it('quái fuse xét theo loài gốc và hệ của quái', () => {
    const fused = monsterA({
      speciesId: 'fused',
      baseSpeciesId: 'pine',
      fused: true,
      lineage: ['oak']
    })
    expect(isSkillBookCompatible(data, fused, 'blast')).toBe(false)
    expect(isSkillBookCompatible(data, fused, 'sap')).toBe(true)
  })
})

describe('dùng sách (useSkillBook)', () => {
  it('còn ô: học ngay, ghi extraSkillIds, Bí kíp mất', () => {
    const state = stateWith(monsterA(), [{ skillId: 'flurry', reusable: false, count: 1 }])
    const next = useBook(state, book('flurry'))
    expect(next.party[0].skillIds).toEqual(['strike', 'flurry'])
    expect(next.party[0].extraSkillIds).toEqual(['flurry'])
    expect(next.inventory.books).toEqual([])
  })

  it('Chân kinh không mất, dạy được nhiều quái', () => {
    const b = monsterA({ id: 'b' })
    const state = stateWith(monsterA(), [{ skillId: 'flurry', reusable: true, count: 1 }])
    const withB = { ...state, party: [...state.party, b] }
    const next = useBook(useBook(withB, book('flurry', true)), book('flurry', true), 'b')
    expect(next.party.map((m) => m.skillIds)).toEqual([
      ['strike', 'flurry'],
      ['strike', 'flurry']
    ])
    expect(getBookCount(next.inventory, { skillId: 'flurry', reusable: true })).toBe(1)
  })

  it('đủ ô: vào skill chờ học, Bí kíp vẫn mất, vẫn ghi extraSkillIds', () => {
    const full = monsterA({ skillIds: ['strike', 'growl', 'quick', 'idle'] })
    const state = stateWith(full, [{ skillId: 'flurry', reusable: false, count: 2 }])
    const next = useBook(state, book('flurry'))
    expect(next.party[0].skillIds).toEqual(['strike', 'growl', 'quick', 'idle'])
    expect(next.party[0].pendingSkillIds).toEqual(['flurry'])
    expect(next.party[0].extraSkillIds).toEqual(['flurry'])
    expect(getBookCount(next.inventory, { skillId: 'flurry', reusable: false })).toBe(1)
  })

  it('quái trong kho dùng được, ngoài thị trấn dùng được', () => {
    const base = makeGameState({
      seed: 1,
      party: [monsterA()],
      location: { type: 'floor', floor: 1 }
    })
    const state = stateWith(monsterA(), [{ skillId: 'flurry', reusable: false, count: 1 }], {
      ...base,
      storage: [monsterA({ id: 's' })]
    })
    expect(useBook(state, book('flurry'), 's').storage[0].skillIds).toEqual(['strike', 'flurry'])
  })

  it('không có tác dụng (không mất sách, state giữ nguyên): đã biết, đang chờ, không tương thích', () => {
    const books = [{ skillId: 'strike', reusable: false, count: 1 }]
    expectActionError(
      () => useBook(stateWith(monsterA(), books), book('strike')),
      'skillBookNoEffect',
      {
        reason: 'known'
      }
    )
    const pending = monsterA({
      skillIds: ['strike', 'growl', 'quick', 'idle'],
      pendingSkillIds: ['sap']
    })
    expectActionError(
      () =>
        useBook(stateWith(pending, [{ skillId: 'sap', reusable: false, count: 1 }]), book('sap')),
      'skillBookNoEffect',
      { reason: 'known' }
    )
    const pine = monsterA({ speciesId: 'pine', baseSpeciesId: 'pine' })
    expectActionError(
      () =>
        useBook(stateWith(pine, [{ skillId: 'blast', reusable: false, count: 1 }]), book('blast')),
      'skillBookNoEffect',
      { skillId: 'blast', reason: 'incompatible' }
    )
  })

  it('báo lỗi: không có sách, sai loại sách, quái không sở hữu, đang trong trận', () => {
    const state = stateWith(monsterA(), [{ skillId: 'flurry', reusable: false, count: 1 }])
    expectActionError(() => useBook(state, book('flurry', true)), 'notEnoughBooks', {
      have: 0,
      need: 1
    })
    expectActionError(() => useBook(state, book('flurry'), 'zz'), 'monsterNotOwned')
    const battle = makeBattleState([monsterA()], [makeMonster({ id: 'e' })])
    expectActionError(
      () => useBook({ ...battle, inventory: state.inventory }, book('flurry')),
      'inBattle'
    )
  })

  it('báo lỗi định danh: không phải sách, skill không tồn tại, chiêu Max không có sách', () => {
    const state = stateWith(monsterA(), [])
    expectActionError(
      () => useBook(state, { storage: 'stack', itemId: 'potion' }),
      'malformedAction'
    )
    expectActionError(() => useBook(state, book('missing')), 'unknownSkill', { skillId: 'missing' })
    expectActionError(() => useBook(state, book('maxStrike')), 'malformedAction')
    expectActionError(
      () => useBook(state, { storage: 'book', skillId: 'flurry' }),
      'malformedAction'
    )
  })

  it('số lượng biên: chồng Bí kíp MAX_SAFE_INTEGER bớt còn MAX_SAFE_INTEGER − 1', () => {
    const max = Number.MAX_SAFE_INTEGER
    const state = stateWith(monsterA(), [{ skillId: 'flurry', reusable: false, count: max }])
    const next = useBook(state, book('flurry'))
    expect(getBookCount(next.inventory, { skillId: 'flurry', reusable: false })).toBe(max - 1)
  })
})

describe('học lại skill từ sách ở NPC', () => {
  it('skill từ sách đã bỏ qua vẫn học lại được (mọi level), cùng giá', () => {
    const monster = monsterA({
      skillIds: ['strike', 'growl', 'quick', 'idle'],
      extraSkillIds: ['flurry']
    })
    expect(relearnableSkills(data, monster)).toContain('flurry')
    const state = stateWith(monster, [])
    const next = gameReducer(data, state, {
      type: 'relearnSkill',
      monsterId: 'a',
      skillId: 'flurry',
      forgetSkillId: 'idle'
    })
    expect(next.party[0].skillIds).toEqual(['strike', 'growl', 'quick', 'flurry'])
    expect(next.money).toEqual(toBig(10_000 - 10))
  })

  it('skill từ sách đang biết thì không học lại', () => {
    const monster = monsterA({ skillIds: ['strike', 'flurry'], extraSkillIds: ['flurry'] })
    expect(relearnableSkills(data, monster)).not.toContain('flurry')
  })
})

describe('giữ skill ngoài learnset', () => {
  it('tiến hóa và fuse (quái gốc) giữ; con breeding không thừa hưởng', () => {
    const monster = makeMonster({ level: 10, extraSkillIds: ['flurry'] })
    const { monster: evolved } = evolveMonster(data, monster, {
      toSpeciesId: 'strongling',
      rng: createRng(1),
      day: 0
    })
    expect(evolved.extraSkillIds).toEqual(['flurry'])
    const sub = makeMonster({
      id: 'sub',
      speciesId: 'brawler',
      baseSpeciesId: 'brawler',
      extraSkillIds: ['sting']
    })
    expect(fuseMonsters(data, createRng(1), monster, sub)[0].extraSkillIds).toEqual(['flurry'])
    const father = makeMonster({ id: 'f', gender: 'male', extraSkillIds: ['flurry'] })
    const mother = makeMonster({ id: 'g', extraSkillIds: ['flurry'] })
    expect(makeOffspring(data, createRng(1), father, mother, 'c')[0].extraSkillIds).toEqual([])
  })
})

describe('kiểm tra quái', () => {
  it('extraSkillIds hợp lệ; báo skill không tồn tại, không có sách, bị lặp', () => {
    expect(validateMonster(data, makeMonster({ extraSkillIds: ['flurry'] }))).toEqual([])
    const issues = validateMonster(
      data,
      makeMonster({ extraSkillIds: ['missing', 'maxStrike', 'flurry', 'flurry'] })
    )
    expect(issues.join('\n')).toMatch(/skill ngoài learnset không tồn tại "missing"/)
    expect(issues.join('\n')).toMatch(/"maxStrike" không dạy được/)
    expect(issues.join('\n')).toMatch(/skill ngoài learnset bị lặp/)
  })
})
