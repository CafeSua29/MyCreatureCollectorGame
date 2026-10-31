import { describe, expect, it } from 'vitest'
import { rawGameData } from '@data'
import { createGameData } from '../gameData'
import { validateMonster } from '../monster'
import { ActionError, toBig } from '../shared'
import { rollShopStock } from '../shop'
import { rollFloorBiome } from '../world'
import { migrateState } from './migrate'
import { createNewGame, rollStarters } from './newGame'
import { SAVE_VERSION, gameReducer } from './reducer'
import { validateGameState } from './validateGameState'
import { makeData, makeRawData, makeInventory, expectActionError } from '../testing'

// Fixture: quái khởi đầu weakling / twig, level 5, 500 tiền, 5 bóng + 3 thuốc.
const data = makeData()

describe('rollStarters', () => {
  it('một ứng viên mỗi loài khởi đầu, đúng thứ tự, level cố định, hợp lệ', () => {
    const { candidates } = rollStarters(data, 42)
    expect(candidates.map((m) => m.speciesId)).toEqual(['weakling', 'twig'])
    for (const monster of candidates) {
      expect(monster.level).toEqual(5)
      expect(monster.exp).toEqual(125)
      expect(validateMonster(data, monster)).toEqual([])
    }
  })

  it('cùng seed cùng ứng viên; seed khác thì gen khác', () => {
    expect(rollStarters(data, 7)).toEqual(rollStarters(data, 7))
    const custom = createGameData({
      ...makeRawData(),
      config: {
        ...makeRawData().config,
        wild: { ...makeRawData().config.wild, geneMin: 1, geneMax: 1000 }
      }
    })
    const genesOf = (seed: number): string[] =>
      rollStarters(custom, seed).candidates.flatMap((m) =>
        Object.values(m.genes).map((gene) => gene.toString())
      )
    expect(genesOf(1)).not.toEqual(genesOf(2))
  })

  it('có tỉ lệ shiny như quái hoang (config.shiny.wildChance)', () => {
    const always = createGameData({
      ...makeRawData(),
      config: { ...makeRawData().config, shiny: { traitId: 'shiny', wildChance: 100 } }
    })
    for (const monster of rollStarters(always, 3).candidates) {
      expect(monster.shinyStacks).toEqual(1)
      expect(monster.traits).toContainEqual({ id: 'shiny', level: 1 })
      expect(validateMonster(always, monster)).toEqual([])
    }
    // Fixture mặc định tỉ lệ 0: không ứng viên nào shiny.
    expect(rollStarters(data, 3).candidates.every((m) => m.shinyStacks === 0)).toBe(true)
  })
})

describe('createNewGame', () => {
  const options = {
    seed: 99,
    starterSpeciesId: 'twig',
    gender: 'male' as const,
    nickname: ' Cành '
  }

  it('nhận đúng con đã xem ở màn chọn, áp giới tính và biệt danh', () => {
    const preview = rollStarters(data, 99).candidates[1]
    const state = createNewGame(data, options)
    // Quái khởi đầu nhận lý lịch "starter" lúc vào game (ngày 0, ở thị trấn).
    const history = {
      origin: { kind: 'starter' },
      metDay: 0,
      metFloor: null,
      metLevel: preview.level,
      milestones: []
    }
    expect(preview.history).toBeNull()
    // Khế ước với ngự thú sư cảnh giới 0 lúc vào game (ứng viên chưa khế ước).
    expect(preview.contractRealm).toBeNull()
    expect(state.party).toEqual([
      { ...preview, gender: 'male', nickname: 'Cành', history, contractRealm: 0, affinity: 70 }
    ])
    expect(validateMonster(data, state.party[0])).toEqual([])
  })

  it('state ban đầu: thị trấn, tiền và vật phẩm ban đầu, version hiện tại', () => {
    const state = createNewGame(data, options)
    expect(state).toMatchObject({
      version: SAVE_VERSION,
      location: { type: 'town' },
      money: toBig(500),
      inventory: makeInventory({ ball: 5, potion: 3 }),
      storage: [],
      eggs: [],
      nextMonsterId: 2,
      nextItemId: 1,
      battle: null
    })
    expect(state.party[0].id).toBe('m1')
    // Quái khởi đầu vào Bộ sưu tập ngay (docs/rules/dex.md).
    expect(state.dex.owned).toContain(state.party[0].speciesId)
    expect(state.dex.claimedMilestones).toEqual([])
    // Bắt đầu ở thị trấn: cửa hàng đã có hàng, random sau quái khởi đầu.
    const shop = rollShopStock(data, rollStarters(data, 99).rng, {
      highestFloor: 1,
      nextItemId: 1,
      options: { lifespanEnabled: true, permadeathEnabled: false },
      inventory: { stacks: {}, crystals: [], books: [], equipment: [], souls: [] }
    })
    expect(state.shop.stock).toEqual(shop.stock)
    expect(state.shop.stock).toHaveLength(3)
    // Tầng 1 cũng tung map (sau cửa hàng, nên quái khởi đầu và hàng không đổi).
    expect(state.floorBiomeIds).toEqual([rollFloorBiome(data, shop.rng)[0]])
    expect(state.highestFloor).toBe(1)
    // State hợp lệ: migrate giữ nguyên, chơi tiếp được.
    expect(migrateState(state, data)).toEqual(state)
    const traveled = gameReducer(data, state, {
      type: 'travel',
      to: { type: 'floor', floor: 1 }
    })
    expect(gameReducer(data, traveled, { type: 'startWildBattle' }).battle).not.toBeNull()
  })

  it('map tầng 1 được random trên mọi biome theo seed', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 60; seed++) {
      seen.add(createNewGame(data, { ...options, seed }).floorBiomeIds[0])
    }
    expect([...seen].sort()).toEqual(['field', 'lair', 'pairs'])
  })

  it('biệt danh trống thì không có biệt danh', () => {
    expect(createNewGame(data, { ...options, nickname: '   ' }).party[0].nickname).toBeNull()
    expect(createNewGame(data, { ...options, nickname: null }).party[0].nickname).toBeNull()
  })

  it('báo lỗi loài không phải quái khởi đầu, giới tính sai, biệt danh quá dài', () => {
    expect(() => createNewGame(data, { ...options, starterSpeciesId: 'oak' })).toThrow(ActionError)
    expectActionError(
      () => createNewGame(data, { ...options, gender: 'other' as unknown as 'male' }),
      'malformedAction'
    )
    expectActionError(
      () => createNewGame(data, { ...options, nickname: 'x'.repeat(13) }),
      'nicknameTooLong'
    )
  })

  it('dữ liệu thật: 3 quái khởi đầu Lửa / Cỏ / Nước', () => {
    const real = createGameData(rawGameData)
    const { candidates } = rollStarters(real, 1)
    expect(candidates.map((m) => m.elementIds[0])).toEqual(['fire', 'grass', 'water'])
    // Bảng nhiệm vụ đủ nhiệm vụ ngay từ đầu (docs/rules/quests.md); linh điền theo config.
    const state = createNewGame(real, {
      seed: 1,
      starterSpeciesId: candidates[0].speciesId,
      gender: candidates[0].gender,
      nickname: null
    })
    expect(state.quests.board).toHaveLength(real.config.quests.boardSize)
    expect(state.garden.plots).toHaveLength(real.config.alchemy.initialPlots)
    expect(validateGameState(real, state)).toEqual([])
  })
})
