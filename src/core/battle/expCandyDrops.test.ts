// Kẹo rơi từ boss (mục "Kẹo EXP và Kẹo Hiếm" ở world-items.md) và kiểm tra config.expCandy.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import { gameReducer } from '../game'
import {
  dataIssuesAfter,
  fixtureFloorBiomeIds,
  makeBattleState,
  makeMonster,
  makeRawData
} from '../testing'
import type { GameData, GameState, Monster, RawGameData } from '../model'

// Fixture: tầng 1 "field", tầng 2 "lair" (boss tầng strongling), tầng 3 "pairs" (boss tầng weakling).
// Bậc kẹo: tầng 1–2 rơi expCandyS, từ tầng 3 rơi genderPotion; boss tầng rơi thêm rareCandy.
function candyData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.config.expCandy = {
    bossDropTiers: [
      { fromFloor: 1, drops: [{ itemId: 'expCandyS', chance: 100 }] },
      { fromFloor: 3, drops: [{ itemId: 'genderPotion', chance: 100 }] }
    ],
    floorBossDrops: [{ itemId: 'rareCandy', chance: 100 }]
  }
  edit(raw)
  return createGameData(raw)
}

const data = candyData()
const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const

/** Boss loài speciesId còn 1 máu, chỉ biết idle. */
function boss(speciesId: string): Monster {
  const base = makeMonster({
    id: 'boss',
    speciesId,
    baseSpeciesId: speciesId,
    level: 4,
    exp: 64,
    bossMultiplier: 3,
    skillIds: ['idle']
  })
  return { ...base, damageTaken: getMaxHp(data, base).minus(1) }
}

/** Hạ boss ở tầng `floor`, trả về túi đồ sau trận. */
function stacksAfterBoss(
  floor: number,
  speciesId: string,
  { isBoss = true, gameData = data }: { isBoss?: boolean; gameData?: GameData } = {}
): Record<string, number> {
  const state: GameState = {
    ...makeBattleState([makeMonster({ id: 'a' })], [boss(speciesId)], { floor, isBoss }),
    highestFloor: floor,
    floorBiomeIds: fixtureFloorBiomeIds(floor)
  }
  return gameReducer(gameData, state, { type: 'submitTurn', commands: [strike] }).inventory.stacks
}

describe('kẹo rơi từ boss', () => {
  it('boss tầng: kẹo của bậc tầng + Kẹo Hiếm', () => {
    const stacks = stacksAfterBoss(2, 'strongling')
    expect(stacks.expCandyS).toBe(1)
    expect(stacks.rareCandy).toBe(1)
  })

  it('boss khác loài boss tầng: chỉ kẹo của bậc tầng', () => {
    const stacks = stacksAfterBoss(2, 'twig')
    expect(stacks.expCandyS).toBe(1)
    expect(stacks.rareCandy).toBeUndefined()
  })

  it('bậc theo tầng: từ fromFloor của bậc sau thì đổi bảng (tầng rất cao dùng bậc cuối)', () => {
    const third = stacksAfterBoss(3, 'strongling')
    expect(third.genderPotion).toBe(1)
    expect(third.expCandyS).toBeUndefined()
    // Tầng 3 boss tầng là weakling: có Kẹo Hiếm.
    expect(stacksAfterBoss(3, 'weakling').rareCandy).toBe(1)
    expect(stacksAfterBoss(1_000_000, 'twig').genderPotion).toBe(1)
  })

  it('trận thường không rơi kẹo', () => {
    const stacks = stacksAfterBoss(2, 'strongling', { isBoss: false })
    expect(stacks.expCandyS).toBeUndefined()
    expect(stacks.rareCandy).toBeUndefined()
  })

  it('tỉ lệ 0 thì không rơi', () => {
    const none = candyData((raw) => {
      raw.config.expCandy.bossDropTiers[0].drops[0].chance = 0
      raw.config.expCandy.floorBossDrops[0].chance = 0
    })
    const stacks = stacksAfterBoss(2, 'strongling', { gameData: none })
    expect(stacks.expCandyS).toBeUndefined()
    expect(stacks.rareCandy).toBeUndefined()
  })
})

describe('kiểm tra config.expCandy', () => {
  const issues = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join('\n')

  it('dữ liệu fixture hợp lệ', () => {
    expect(issues(() => {})).toBe('')
  })

  it('bậc: phải có, bậc đầu từ tầng 1, fromFloor tăng dần, trường lạ', () => {
    expect(issues((raw) => (raw.config.expCandy.bossDropTiers = []))).toMatch(
      /bossDropTiers cần ít nhất một bậc/
    )
    const tiers = (fromFloors: number[]) => (raw: RawGameData) => {
      raw.config.expCandy.bossDropTiers = fromFloors.map((fromFloor) => ({ fromFloor, drops: [] }))
    }
    expect(issues(tiers([2]))).toMatch(/bossDropTiers\[0\]\.fromFloor của bậc đầu phải là 1/)
    expect(issues(tiers([1, 5, 5]))).toMatch(/bossDropTiers\[2\]\.fromFloor phải tăng dần/)
    expect(issues(tiers([1, 2.5]))).toMatch(/bossDropTiers\[1\]\.fromFloor phải là số nguyên/)
    expect(
      issues((raw) => Object.assign(raw.config.expCandy.bossDropTiers[0], { chance: 1 }))
    ).toMatch(/trường "chance" không thuộc bậc kẹo rơi/)
  })

  it('đồ rơi: vật phẩm tồn tại, rơi được từ quái, tỉ lệ trong [0, 100]', () => {
    expect(
      issues((raw) => (raw.config.expCandy.floorBossDrops = [{ itemId: 'ghost', chance: 1 }]))
    ).toMatch(/config\.expCandy\.floorBossDrops: vật phẩm rơi không tồn tại "ghost"/)
    expect(
      issues(
        (raw) =>
          (raw.config.expCandy.bossDropTiers[0].drops = [{ itemId: 'expCandyS', chance: 101 }])
      )
    ).toMatch(/bossDropTiers\[0\]\.drops: chance/)
    expect(issues((raw) => Object.assign(raw.config, { expCandy: undefined }))).toMatch(
      /config\.expCandy phải là object/
    )
  })

  it('params hiệu ứng kẹo: baseExp > 0, levels nguyên ≥ 1', () => {
    const effectOf = (itemId: string, params: unknown) => (raw: RawGameData) => {
      const item = raw.items.find((entry) => entry.id === itemId)
      if (item?.category === 'consumable') item.effects[0].params = params
    }
    expect(issues(effectOf('expCandyS', { baseExp: 0 }))).toMatch(/baseExp/)
    expect(issues(effectOf('rareCandy', { levels: 0 }))).toMatch(/levels/)
    expect(issues(effectOf('rareCandy', { levels: 1.5 }))).toMatch(/levels/)
  })
})
