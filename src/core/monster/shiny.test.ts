import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { validateMonster } from './validateMonster'
import { generateWildMonster } from '../world'
import { DataError } from '../shared'
import { expReward, moneyReward } from './exp'
import { createRng } from '../shared'
import { addShinyStacks, shinyFactor } from './shiny'
import { gameReducer } from '../game'
import {
  atFloor,
  defined,
  makeData,
  makeMonster,
  makeRawData,
  makeGameState,
  fixtureSite
} from '../testing'
import type { GameData, Monster } from '../model'

// Fixture: trait shiny id "shiny", tỉ lệ shiny quái hoang mặc định 0 (test tự bật).
const data = makeData()

function dataWith(edit: (raw: ReturnType<typeof makeRawData>) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

describe('addShinyStacks', () => {
  it('quái thường thành shiny: shinyStacks 1 và trait shiny cấp 1, giữ trait khác', () => {
    const base = makeMonster({ traits: [{ id: 'fast', level: 1 }] })
    const shiny = addShinyStacks(data, base, 1)
    expect(shiny.shinyStacks).toEqual(1)
    expect(shiny.traits).toEqual([
      { id: 'fast', level: 1 },
      { id: 'shiny', level: 1 }
    ])
    expect(validateMonster(data, shiny)).toEqual([])
    expect(base.shinyStacks).toEqual(0) // không sửa đầu vào
  })

  it('cộng dồn: cấp trait shiny luôn bằng shinyStacks', () => {
    const once = addShinyStacks(data, makeMonster(), 1)
    const thrice = addShinyStacks(data, once, 2)
    expect(thrice.shinyStacks).toEqual(3)
    expect(thrice.traits).toEqual([{ id: 'shiny', level: 3 }])
    expect(shinyFactor(data, thrice)).toBeCloseTo(3.375)
  })
})

describe('luật shinyStacks ↔ trait shiny', () => {
  const bare = (overrides: Partial<Monster>): Monster => ({ ...makeMonster(), ...overrides })

  it('báo lỗi khi lệch nhau', () => {
    expect(
      validateMonster(data, bare({ shinyStacks: 2, traits: [{ id: 'shiny', level: 1 }] })).join()
    ).toMatch(/phải có trait "shiny" cấp 2/)
    expect(validateMonster(data, bare({ shinyStacks: 1, traits: [] })).join()).toMatch(
      /phải có trait "shiny" cấp 1/
    )
    expect(
      validateMonster(data, bare({ shinyStacks: 0, traits: [{ id: 'shiny', level: 1 }] })).join()
    ).toMatch(/không shiny không được có trait/)
  })
})

describe('quái hoang shiny', () => {
  it('tỉ lệ 0 thì không bao giờ ra shiny', () => {
    let rng = createRng(1)
    for (let i = 0; i < 300; i++) {
      let monster: Monster
      ;[monster, rng] = generateWildMonster(data, rng, fixtureSite(data, 1), 'm1')
      expect(monster.shinyStacks).toEqual(0)
    }
  })

  it('vùng ghi đè tỉ lệ: 100% thì luôn shiny, mang trait shiny cấp 1', () => {
    const always = dataWith((raw) => (raw.biomes[0].shinyChance = 100))
    const [monster] = generateWildMonster(always, createRng(3), fixtureSite(always, 1), 'm1')
    expect(monster.shinyStacks).toEqual(1)
    expect(monster.traits).toContainEqual({ id: 'shiny', level: 1 })
    expect(validateMonster(always, monster)).toEqual([])
  })

  it('tỉ lệ chung áp cho vùng không ghi đè, xấp xỉ đúng tỉ lệ', () => {
    const half = dataWith((raw) => (raw.config.shiny.wildChance = 50))
    let rng = createRng(7)
    let shinies = 0
    for (let i = 0; i < 2000; i++) {
      let monster: Monster
      ;[monster, rng] = generateWildMonster(half, rng, fixtureSite(half, 1), 'm1')
      if (monster.shinyStacks > 0) shinies++
    }
    expect(shinies).toBeGreaterThan(900)
    expect(shinies).toBeLessThan(1100)
  })

  it('tung shiny sau cùng: shiny hay không thì loài, level, gen, trait khác vẫn như nhau', () => {
    const always = dataWith((raw) => (raw.biomes[0].shinyChance = 100))
    const [normal] = generateWildMonster(data, createRng(42), fixtureSite(data, 1), 'm1')
    const [shiny] = generateWildMonster(always, createRng(42), fixtureSite(always, 1), 'm1')
    expect(shiny.speciesId).toBe(normal.speciesId)
    expect(shiny.level).toBe(normal.level)
    expect(shiny.genes).toEqual(normal.genes)
    expect(shiny.traits.filter((t) => t.id !== 'shiny')).toEqual(normal.traits)
  })

  it('gặp quái shiny: log trận có sự kiện shinyAppeared', () => {
    const always = dataWith((raw) => (raw.biomes[0].shinyChance = 100))
    const state = atFloor(makeGameState({ seed: 5, party: [makeMonster({ id: 'a' })] }), 1)
    const battle = defined(gameReducer(always, state, { type: 'startWildBattle' }).battle)
    expect(battle.log).toContainEqual({ type: 'shinyAppeared', monsterId: battle.enemies[0].id })
  })
})

describe('thưởng khi hạ / bắt quái shiny', () => {
  it('EXP và tiền × hệ số shiny', () => {
    const normal = makeMonster({ level: 4, exp: 64 })
    const shiny = makeMonster({ level: 4, exp: 64, shinyStacks: 1 })
    expect(expReward(data, normal)).toEqual(8)
    expect(expReward(data, shiny)).toEqual(12) // 8 × 1,5
    expect(moneyReward(data, normal)).toEqual(20)
    expect(moneyReward(data, shiny)).toEqual(30)
    const double = makeMonster({ level: 4, exp: 64, shinyStacks: 2 })
    expect(expReward(data, double)).toEqual(18) // 8 × 2,25
  })
})

describe('kiểm tra dữ liệu shiny', () => {
  function issues(edit: (raw: ReturnType<typeof makeRawData>) => void): string {
    try {
      dataWith(edit)
      return ''
    } catch (error) {
      if (error instanceof DataError) return error.issues.join('\n')
      throw error
    }
  }

  it('config.shiny.traitId phải là trait loại shiny; tỉ lệ trong [0, 100]', () => {
    expect(issues((raw) => (raw.config.shiny.traitId = 'fast'))).toMatch(/loại "shiny"/)
    expect(issues((raw) => (raw.config.shiny.wildChance = 120))).toMatch(/shiny\.wildChance/)
    expect(issues((raw) => (raw.biomes[0].shinyChance = -1))).toMatch(/shinyChance/)
  })
})
