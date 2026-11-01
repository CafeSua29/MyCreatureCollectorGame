import { describe, expect, it } from 'vitest'
import { rawGameData } from '@data'
import { createGameData } from '../gameData'
import { canHaveGmaxFactor } from '../inventory'
import { validateMonster } from '../monster'
import { newDwellingState } from '../progression'
import { starterSlotPool } from '../registries'
import { ActionError, toBig } from '../shared'
import { rollShopStock } from '../shop'
import { rollFloorBiome } from '../world'
import { migrateState } from './migrate'
import { createNewGame, rollStarters, rollUnlockedStarter } from './newGame'
import { SAVE_VERSION, gameReducer } from './reducer'
import { validateGameState } from './validateGameState'
import { defined, makeData, makeRawData, makeInventory, expectActionError } from '../testing'

// Fixture: quái khởi đầu weakling / twig, level 5, 500 tiền, 5 bóng + 3 thuốc.
const data = makeData()

describe('rollStarters', () => {
  it('một ứng viên mỗi loài khởi đầu, đúng thứ tự, level cố định, hợp lệ', () => {
    const { candidates } = rollStarters(data, 42)
    // Vị trí hiển thị random: so theo tập loài.
    expect(candidates.map((m) => m.speciesId).sort()).toEqual(['twig', 'weakling'])
    for (const monster of candidates) {
      expect(monster.level).toEqual(5)
      expect(monster.exp).toEqual(125)
      expect(validateMonster(data, monster)).toEqual([])
    }
  })

  it('vị trí hiển thị các ô được xáo theo seed (ô nào cũng có thể đứng đầu)', () => {
    const firsts = new Set<string>()
    for (let seed = 1; seed <= 20; seed++)
      firsts.add(rollStarters(data, seed).candidates[0].speciesId)
    expect([...firsts].sort()).toEqual(['twig', 'weakling'])
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

  it('ô random trong danh sách của ô, không trùng loài ô trước, ô hết loài thì bỏ', () => {
    const raw = makeRawData()
    const pool = ['weakling', 'twig', 'pebble']
    raw.config.starter.slots = [
      { conditions: [{ kind: 'species', speciesIds: pool }] },
      { conditions: [{ kind: 'species', speciesIds: pool }] },
      { conditions: [{ kind: 'species', speciesIds: pool }] },
      // Hết loài: cả ba loài đã ra ở ba ô trước.
      { conditions: [{ kind: 'species', speciesIds: pool }] }
    ]
    const custom = createGameData(raw)
    const seen = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const ids = rollStarters(custom, seed).candidates.map((m) => m.speciesId)
      expect([...ids].sort()).toEqual([...pool].sort())
      seen.add(ids[0])
    }
    // Vị trí đầu ra được mọi loài (loài random đều và vị trí cũng xáo).
    expect([...seen].sort()).toEqual([...pool].sort())
    // Loài fixture không mang được Gmax Factor.
    expect(rollStarters(custom, 1).candidates.every((m) => !m.gmaxFactor)).toBe(true)
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
    const preview = defined(
      rollStarters(data, 99).candidates.find((m) => m.speciesId === 'twig'),
      'ứng viên twig'
    )
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
      inventory: { stacks: {}, crystals: [], books: [], equipment: [], souls: [], spirits: [] }
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

  it('dữ liệu thật: mỗi ô một loài dạng đầu khác nhau, đúng danh sách của ô, có Gmax Factor nếu mang được', () => {
    const real = createGameData(rawGameData)
    let hasGmax = false
    for (let seed = 1; seed <= 8; seed++) {
      const { candidates: rolled } = rollStarters(real, seed)
      expect(rolled).toHaveLength(real.config.starter.slots.length)
      expect(new Set(rolled.map((m) => m.speciesId)).size).toBe(rolled.length)
      // Vị trí đã xáo: mỗi ô có đúng ứng viên của mình ở đâu đó trong danh sách.
      for (const slot of real.config.starter.slots) {
        const pool = starterSlotPool(real, slot)
        expect(rolled.some((m) => pool.includes(m.speciesId))).toBe(true)
      }
      for (const monster of rolled) {
        expect(monster.gmaxFactor).toBe(canHaveGmaxFactor(real, monster.speciesId))
        expect(validateMonster(real, monster)).toEqual([])
      }
      hasGmax ||= rolled.some((m) => m.gmaxFactor)
    }
    expect(hasGmax).toBe(true)
    const { candidates } = rollStarters(real, 1)
    // Bảng nhiệm vụ đủ nhiệm vụ ngay từ đầu (docs/rules/quests.md); động phủ theo startLevel của
    // công trình (docs/rules/dwelling.md).
    const state = createNewGame(real, {
      seed: 1,
      starterSpeciesId: candidates[0].speciesId,
      gender: candidates[0].gender,
      nickname: null
    })
    expect(state.quests.board).toHaveLength(real.config.quests.boardSize)
    expect(state.dwelling).toEqual(newDwellingState(real))
    expect(validateGameState(real, state)).toEqual([])
  })
})

describe('quái khởi đầu đã mở khóa', () => {
  const base = { seed: 9, gender: 'male' as const, nickname: null }

  it('nhận loài đã mở (không thuộc ô): đúng con rollUnlockedStarter hiển thị, tất định theo seed', () => {
    const { monster } = rollUnlockedStarter(data, 9, { speciesId: 'pebble' })
    const state = createNewGame(data, {
      ...base,
      gender: monster.gender,
      starterSpeciesId: 'pebble',
      unlockedStarterIds: ['pebble']
    })
    const starter = state.party[0]
    expect(starter.speciesId).toEqual('pebble')
    expect(starter.genes).toEqual(monster.genes)
    expect(starter.level).toEqual(5)
    expect(rollUnlockedStarter(data, 9, { speciesId: 'pebble' })).toEqual(
      rollUnlockedStarter(data, 9, { speciesId: 'pebble' })
    )
    expect(validateGameState(data, state)).toEqual([])
  })

  it('ứng viên của ô không đổi khi có loài đã mở', () => {
    const plain = createNewGame(data, { ...base, starterSpeciesId: 'twig' })
    const withUnlocks = createNewGame(data, {
      ...base,
      starterSpeciesId: 'twig',
      unlockedStarterIds: ['pebble', 'twig']
    })
    expect(withUnlocks).toEqual(plain)
  })

  it('loài chưa mở, hoặc đã mở mà không làm khởi đầu được → notStarter', () => {
    expectActionError(
      () => createNewGame(data, { ...base, starterSpeciesId: 'pebble' }),
      'notStarter',
      { speciesId: 'pebble' }
    )
    expectActionError(
      () =>
        createNewGame(data, {
          ...base,
          starterSpeciesId: 'strongling',
          unlockedStarterIds: ['strongling']
        }),
      'notStarter',
      { speciesId: 'strongling' }
    )
  })
})
