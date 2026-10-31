// Sách kỹ năng ở mức game (docs/rules/skill-books.md): kệ sách cửa hàng, mua / bán theo thị trường,
// vứt, không lắp được, boss rơi sách, kiểm tra dữ liệu, migrate v36 → v37.

import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'
import { createGameData } from '../gameData'
import { getBookCount, isSkillBookCompatible, skillLearnerCount } from '../inventory'
import { getMaxHp } from '../monster'
import { rollShopStock } from '../shop'
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
  makeRawData
} from '../testing'
import type { GameData, GameState, ItemRef, RawGameData, SkillBookConfig } from '../model'

const data = makeData()

function withSkillBook(config: Partial<SkillBookConfig>): GameData {
  const raw: RawGameData = makeRawData()
  raw.config.skillBook = { ...raw.config.skillBook, ...config }
  return createGameData(raw)
}

const strikeRef: ItemRef = { storage: 'book', skillId: 'strike', reusable: false }

function townWithBooks(count: number): GameState {
  const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
  return {
    ...state,
    money: toBig(100_000),
    inventory: makeInventory({}, [], [], [{ skillId: 'strike', reusable: false, count }])
  }
}

describe('kệ sách của cửa hàng', () => {
  const shelfData = withSkillBook({ shopMin: 2, shopMax: 2 })
  const roll = (game: GameData, seed: number): ReturnType<typeof rollShopStock> =>
    rollShopStock(game, createRng(seed), {
      highestFloor: 1,
      nextItemId: 1,
      inventory: makeInventory(),
      options: { lifespanEnabled: false }
    })

  it('shopMax = 0: không có sách, RNG như khi chưa có kệ sách', () => {
    const { stock } = roll(data, 1)
    expect(stock.some((entry) => entry.storage === 'book')).toBe(false)
  })

  it('thêm đúng số Bí kíp sau hàng thường, không trùng, power ≤ shopMaxPower, có loài học', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { stock } = roll(shelfData, seed)
      const books = stock.filter((entry) => entry.storage === 'book')
      expect(books).toHaveLength(2)
      expect(stock.slice(-2)).toEqual(books)
      const ids = books.map((entry) => (entry.storage === 'book' ? entry.skillId : ''))
      expect(new Set(ids).size).toBe(2)
      for (const entry of books) {
        if (entry.storage !== 'book') continue
        expect(entry.reusable).toBe(false)
        expect(shelfData.skills[entry.skillId].power).toBeLessThanOrEqual(80)
        expect(skillLearnerCount(shelfData, entry.skillId)).toBeGreaterThan(0)
      }
    }
  })

  it('trọng số bậc 0 thì không bán sách của bậc đó', () => {
    const commonOnly = withSkillBook({
      shopMin: 3,
      shopMax: 3,
      rarities: [
        { id: 'common', minLearners: 3, priceMultiplier: 1, shopWeight: 1 },
        { id: 'rare', minLearners: 0, priceMultiplier: 2, shopWeight: 0 }
      ]
    })
    for (let seed = 1; seed <= 20; seed++) {
      for (const entry of roll(commonOnly, seed).stock) {
        if (entry.storage === 'book') {
          expect(skillLearnerCount(commonOnly, entry.skillId)).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  it('ưu tiên sách quái trong đội học được mà chưa biết (partyMultiplier)', () => {
    const biased = withSkillBook({ shopMin: 1, shopMax: 1, partyMultiplier: 1e9 })
    // pine (cỏ) biết strike: kệ chỉ ra sách hệ thường / cỏ khác strike, không ra blast (lửa).
    const pine = makeMonster({ speciesId: 'pine', baseSpeciesId: 'pine' })
    for (let seed = 1; seed <= 30; seed++) {
      const { stock } = rollShopStock(biased, createRng(seed), {
        highestFloor: 1,
        nextItemId: 1,
        inventory: makeInventory(),
        options: { lifespanEnabled: false },
        party: [pine]
      })
      const [entry] = stock.filter((candidate) => candidate.storage === 'book')
      if (entry?.storage !== 'book') throw new Error('kệ sách phải có một cuốn')
      expect(entry.skillId).not.toBe('strike')
      expect(isSkillBookCompatible(biased, pine, entry.skillId)).toBe(true)
    }
  })

  it('mua sách trong danh sách hàng: trả giá gốc, vào túi', () => {
    const state = {
      ...townWithBooks(1),
      inventory: makeInventory(),
      shop: { stock: [strikeRef] }
    }
    const next = gameReducer(data, state, { type: 'buyItem', item: strikeRef, count: 2 })
    expect(getBookCount(next.inventory, { skillId: 'strike', reusable: false })).toBe(2)
    expect(next.money).toEqual(toBig(100_000 - 900))
  })
})

describe('bán, vứt, lắp sách', () => {
  it('bán theo thị trường: key book:<skillId> chung cho Bí kíp và Chân kinh', () => {
    const next = gameReducer(data, townWithBooks(3), {
      type: 'sellItem',
      item: strikeRef,
      count: 2
    })
    expect(getBookCount(next.inventory, { skillId: 'strike', reusable: false })).toBe(1)
    expect(next.money).toEqual(toBig(100_000 + 2 * 225))
    expect(next.market.saturation).toEqual({ 'book:strike': 2 })
  })

  it('vứt được; không lắp được (notEquippable)', () => {
    const discarded = gameReducer(data, townWithBooks(1), {
      type: 'discardItem',
      item: strikeRef,
      count: 1
    })
    expect(discarded.inventory.books).toEqual([])
    expectActionError(
      () =>
        gameReducer(data, townWithBooks(1), { type: 'equipItem', monsterId: 'a', item: strikeRef }),
      'notEquippable',
      { itemId: 'skillBook' }
    )
  })
})

describe('boss rơi sách', () => {
  const win = (game: GameData, isBoss: boolean): GameState => {
    const base = makeMonster({ id: 'e', history: null, skillIds: ['idle'] })
    const enemy = { ...base, damageTaken: getMaxHp(game, base).minus(1) }
    const state = makeBattleState([makeMonster({ id: 'a' })], [enemy], { isBoss })
    return gameReducer(game, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
    })
  }

  it('100%: một cuốn, skill trong learnset loài gốc của boss, có log; trận thường không rơi', () => {
    const dropData = withSkillBook({ bossDropChance: 100, reusableDropChance: 0 })
    const boss = win(dropData, true)
    expect(defined(boss.battle).outcome).toBe('won')
    expect(boss.inventory.books).toHaveLength(1)
    const [dropped] = boss.inventory.books
    const learnset = ['strike', 'growl', 'blast', 'pumpUp', 'sap']
    expect(learnset).toContain(dropped.skillId)
    expect(dropped).toMatchObject({ reusable: false, count: 1 })
    expect(defined(boss.battle).log).toContainEqual({
      type: 'skillBookDropped',
      skillId: dropped.skillId,
      reusable: false
    })
    expect(win(dropData, false).inventory.books).toEqual([])
  })

  it('ưu tiên skill quái trong đội học được mà chưa biết (partyMultiplier)', () => {
    // Quái a (weakling) biết strike: boss weakling rơi sách khác strike.
    const biased = withSkillBook({ bossDropChance: 100, partyMultiplier: 1e9 })
    expect(win(biased, true).inventory.books[0].skillId).not.toBe('strike')
  })

  it('skill học qua sách của loài boss (bookSkillIds, TM của game gốc) cũng rơi được', () => {
    // Boss weakling: learnset chỉ có strike (đội đã biết) → ưu tiên tuyệt đối skill trong bookSkillIds.
    const raw: RawGameData = makeRawData()
    raw.config.skillBook = { ...raw.config.skillBook, bossDropChance: 100, partyMultiplier: 1e9 }
    const weakling = defined(raw.species.find((s) => s.id === 'weakling'))
    if (weakling.kind !== 'normal') throw new Error('weakling phải là loài thường')
    weakling.learnset = [{ level: 1, skillId: 'strike' }]
    weakling.bookSkillIds = ['blast']
    expect(win(createGameData(raw), true).inventory.books[0].skillId).toBe('blast')
  })

  it('reusableDropChance 100: sách rơi là Chân kinh; bossDropChance 0: không rơi', () => {
    const always = withSkillBook({ bossDropChance: 100, reusableDropChance: 100 })
    expect(win(always, true).inventory.books[0].reusable).toBe(true)
    expect(win(data, true).inventory.books).toEqual([])
  })
})

describe('số loài học được (độ hiếm sách)', () => {
  it('tính cả bookSkillIds, mỗi loài một lần; chiêu trứng không tính', () => {
    const before = skillLearnerCount(data, 'blast')
    const raw: RawGameData = makeRawData()
    const pine = defined(raw.species.find((s) => s.id === 'pine'))
    const oak = defined(raw.species.find((s) => s.id === 'oak'))
    Object.assign(pine, { bookSkillIds: ['blast'] })
    Object.assign(oak, { eggSkillIds: ['blast'] })
    const learnsBlast = (id: string): boolean => {
      const entry = defined(raw.species.find((s) => s.id === id))
      return entry.kind === 'normal' && entry.learnset.some((e) => e.skillId === 'blast')
    }
    const counted = createGameData(raw)
    expect(skillLearnerCount(counted, 'blast')).toBe(before + (learnsBlast('pine') ? 0 : 1))
  })
})

describe('kiểm tra dữ liệu', () => {
  it('fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('config.skillBook sai: số âm, bậc không giảm dần, mốc power không tăng, hệ lạ, trường lạ', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.skillBook = {
        ...raw.config.skillBook,
        priceBase: -1,
        bossDropChance: 101,
        shopMin: 3,
        shopMax: 2,
        universalElementIds: ['zz'],
        rarities: [
          { id: 'a', minLearners: 1, priceMultiplier: 0, shopWeight: 1 },
          { id: 'a', minLearners: 2, priceMultiplier: 1, shopWeight: -1 }
        ],
        rarityPowerSteps: [100, 50],
        // Ép kiểu để thử trường lạ (JSON có thể ghi bất kỳ trường nào).
        ...({ extra: 1 } as object)
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/priceBase/),
        expect.stringMatching(/bossDropChance/),
        expect.stringMatching(/shopMax/),
        expect.stringMatching(/hệ không tồn tại "zz"/),
        expect.stringMatching(/rarities\[0\]\.priceMultiplier/),
        expect.stringMatching(/rarities\[1\]\.id thiếu hoặc trùng/),
        expect.stringMatching(/rarities\[1\]\.minLearners phải giảm dần/),
        expect.stringMatching(/rarities\[1\]\.shopWeight/),
        expect.stringMatching(/rarityPowerSteps\[1\] phải tăng dần/),
        expect.stringMatching(/"extra"/)
      ])
    )
  })

  it('bookSkillIds: skill không tồn tại, chiêu Max, trùng; cần đúng một item skillBook', () => {
    const issues = dataIssuesAfter((raw) => {
      const pine = defined(raw.species.find((s) => s.id === 'pine'))
      Object.assign(pine, { bookSkillIds: ['zz', 'maxStrike', 'blast', 'blast'] })
      raw.items = raw.items.filter((item) => item.category !== 'skillBook')
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Loài "pine".bookSkillIds: skill bị lặp',
        'Loài "pine".bookSkillIds: skill không tồn tại "zz"',
        'Loài "pine".bookSkillIds: "maxStrike" không có sách',
        'Vật phẩm: cần đúng một vật phẩm category "skillBook", có 0'
      ])
    )
  })

  it('eggSkillIds: không phải danh sách, skill không tồn tại, chiêu Max, trùng', () => {
    const issues = dataIssuesAfter((raw) => {
      const pine = defined(raw.species.find((s) => s.id === 'pine'))
      const oak = defined(raw.species.find((s) => s.id === 'oak'))
      Object.assign(pine, { eggSkillIds: ['zz', 'maxStrike', 'sap', 'sap'] })
      Object.assign(oak, { eggSkillIds: 'sap' })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Loài "pine".eggSkillIds: skill bị lặp',
        'Loài "pine".eggSkillIds: skill không tồn tại "zz"',
        'Loài "pine".eggSkillIds: "maxStrike" không có sách',
        'Loài "oak".eggSkillIds phải là danh sách'
      ])
    )
  })
})

describe('migrate v36 → v37', () => {
  it('túi thêm books rỗng, mọi quái (đội, trứng, quái hoang) có extraSkillIds rỗng; hợp lệ', () => {
    const strip = (monster: unknown): unknown => {
      const { extraSkillIds: _extra, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const state = makeBattleState(
      [makeMonster({ id: 'a' })],
      [makeMonster({ id: 'e', history: null, contractRealm: null })]
    )
    const raw = serializeState({
      ...state,
      eggs: [{ id: 'g', monster: makeMonster({ id: 'g' }), battlesLeft: 3 }]
    }) as Record<string, unknown>
    const { books: _books, ...inventory } = raw.inventory as Record<string, unknown>
    const battle = raw.battle as Record<string, unknown>
    const old = {
      ...raw,
      version: 36,
      inventory,
      party: (raw.party as unknown[]).map(strip),
      eggs: (raw.eggs as Record<string, unknown>[]).map((egg) => ({
        ...egg,
        monster: strip(egg.monster)
      })),
      battle: { ...battle, enemies: (battle.enemies as unknown[]).map(strip) }
    }
    const migrated = migrateState(old, data)
    expect(migrated.inventory.books).toEqual([])
    expect(migrated.party[0].extraSkillIds).toEqual([])
    expect(defined(migrated.eggs[0]).monster.extraSkillIds).toEqual([])
    expect(defined(migrated.battle).enemies[0].extraSkillIds).toEqual([])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
