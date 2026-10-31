import { describe, expect, it } from 'vitest'
import { createNewGame } from './newGame'
import {
  SAVE_FORMAT,
  isValidGameId,
  parseSave,
  parseSaveSummary,
  reseedState,
  serializeSave,
  summarizeState
} from './save'
import { validateGameState } from './validateGameState'
import { gameReducer } from './reducer'
import { defined, makeData, makeLegacyData } from '../testing'
import type { GameState } from '../model'

const data = makeData()
const SAVED_AT = '2026-10-18T10:00:00.000Z'

function newGame(): GameState {
  return createNewGame(data, {
    seed: 5,
    starterSpeciesId: 'weakling',
    gender: 'female',
    nickname: 'Bé'
  })
}

const saveText = (state: GameState, gameId = 'g-test'): string =>
  serializeSave(data, { gameId, kind: 'auto', savedAt: SAVED_AT, state })

describe('serializeSave / parseSave', () => {
  it('lưu rồi đọc lại ra đúng state, kèm tóm tắt tính từ state', () => {
    const state = newGame()
    const parsed = parseSave(data, saveText(state))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.save).toMatchObject({
      format: SAVE_FORMAT,
      gameId: 'g-test',
      kind: 'auto',
      savedAt: SAVED_AT
    })
    expect(parsed.save.state).toEqual(state)
    expect(parsed.save.summary).toEqual({
      leaderNickname: 'Bé',
      leaderSpeciesId: 'weakling',
      highestLevel: 5,
      partySize: 1,
      totalMonsters: 1,
      money: '500',
      location: { type: 'town' },
      inBattle: false
    })
  })

  it('file save chỉ chứa nguyên liệu, không có chỉ số đã tính', () => {
    const text = saveText(newGame())
    expect(text).not.toMatch(/"withTraits"|"final"|"maxHp"/)
  })

  it('không tin summary trong file: luôn tính lại', () => {
    const file = JSON.parse(saveText(newGame()))
    file.summary.money = 999999
    const parsed = parseSave(data, JSON.stringify(file))
    // summary.money là chuỗi số (Decimal.toString) từ save v7.
    expect(parsed.ok && parsed.save.summary.money).toBe('500')
  })

  it('save cũ được migrate lên version hiện tại', () => {
    const file = JSON.parse(saveText(newGame()))
    // Giả lập save v5: chưa có traitSlots, statuses (v11), túi đồ là số lượng theo id (trước v8).
    file.state.version = 5
    delete file.state.party[0].traitSlots
    delete file.state.party[0].statuses
    file.state.inventory = file.state.inventory.stacks
    // Save cũ chưa có map của tầng: migrate gán theo luật cũ (save trước v9 mở sẵn 2 tầng: Đồng cỏ,
    // Núi lửa), cần dữ liệu có hai biome đó.
    delete file.state.floorBiomeIds
    const parsed = parseSave(makeLegacyData(), JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.save.state.floorBiomeIds).toEqual(['meadow', 'volcano'])
      expect(parsed.save.state.party[0].traitSlots).toEqual(3)
      expect(parsed.save.state.party[0].statuses).toEqual([])
    }
  })

  it('báo lỗi rõ ràng, không ném: JSON hỏng, sai định dạng, save mới hơn game, state hỏng', () => {
    const issuesOf = (text: string): string => {
      const parsed = parseSave(data, text)
      return parsed.ok ? '' : parsed.issues.join('\n')
    }
    expect(issuesOf('{ hỏng')).toMatch(/không phải JSON/)
    expect(issuesOf(JSON.stringify({ hello: 1 }))).toMatch(/không phải file save/)

    const future = JSON.parse(saveText(newGame()))
    future.state.version = 999
    expect(issuesOf(JSON.stringify(future))).toMatch(/mới hơn game/)

    const broken = JSON.parse(saveText(newGame()))
    broken.state.party[0].speciesId = 'không-có'
    broken.state.inventory = { stacks: { 'không-có': 1 }, crystals: [] }
    const text = issuesOf(JSON.stringify(broken))
    expect(text).toMatch(/party\[0\]: loài không tồn tại/)
    expect(text).toMatch(/inventory\.stacks: vật phẩm không tồn tại/)

    const badId = JSON.parse(saveText(newGame()))
    badId.gameId = '../../etc'
    expect(issuesOf(JSON.stringify(badId))).toMatch(/gameId/)
  })
})

describe('reseedState', () => {
  it('đổi rng, giữ nguyên mọi thứ khác; entropy khác cho rng khác', () => {
    const state = newGame()
    const a = reseedState(state, 1)
    const b = reseedState(state, 2)
    expect(a.rng).not.toBe(state.rng)
    expect(a.rng).not.toBe(b.rng)
    expect({ ...a, rng: state.rng }).toEqual(state)
    expect(validateGameState(data, a)).toEqual([])
  })

  it('reroll: load lại rồi làm cùng action ra kết quả khác', () => {
    const state = gameReducer(data, newGame(), {
      type: 'travel',
      to: { type: 'floor', floor: 1 }
    })
    const enemyOf = (s: GameState): string =>
      JSON.stringify(defined(gameReducer(data, s, { type: 'startWildBattle' }).battle).enemies[0])
    // Không đổi seed: cùng state → cùng quái hoang (tất định).
    expect(enemyOf(state)).toBe(enemyOf(state))
    // Đổi seed: quái hoang gặp được khác đi (fixture: gen cố định 10 nhưng gender, trait random).
    const original = enemyOf(state)
    const rerolls = [1, 2, 3, 4, 5, 6, 7, 8].map((entropy) => enemyOf(reseedState(state, entropy)))
    expect(rerolls.some((enemy) => enemy !== original)).toBe(true)
  })
})

describe('gameId', () => {
  it('chỉ chữ thường, số, gạch ngang; chống path traversal', () => {
    expect(isValidGameId('g-lx3k9-ab12')).toBe(true)
    expect(isValidGameId('../x')).toBe(false)
    expect(isValidGameId('A')).toBe(false)
    expect(isValidGameId('')).toBe(false)
  })

  it('summarizeState ghi vị trí theo tầng (kèm id biome, không có chữ hiển thị)', () => {
    const onFloor = gameReducer(data, newGame(), {
      type: 'travel',
      to: { type: 'floor', floor: 1 }
    })
    const floor1 = { type: 'floor', floor: 1, biomeId: onFloor.floorBiomeIds[0] }
    expect(summarizeState(data, onFloor).location).toEqual(floor1)
    // Biome đọc theo map đã tung của tầng (floorBiomeIds), không theo thứ tự file.
    const high = {
      ...onFloor,
      highestFloor: 4,
      floorBiomeIds: ['field', 'field', 'field', 'pairs'],
      location: { type: 'floor' as const, floor: 4 }
    }
    expect(summarizeState(data, high).location).toEqual({
      type: 'floor',
      floor: 4,
      biomeId: 'pairs'
    })
  })

  it('summarizeState: quái đầu đội không có biệt danh thì leaderNickname null', () => {
    const state = createNewGame(data, {
      seed: 5,
      starterSpeciesId: 'twig',
      gender: 'male',
      nickname: ''
    })
    expect(summarizeState(data, state)).toMatchObject({
      leaderNickname: null,
      leaderSpeciesId: 'twig'
    })
  })
})

describe('parseSaveSummary', () => {
  const summary = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(summarizeState(data, newGame())))

  it('đọc lại được summary vừa ghi (cả ở tầng, số cực lớn)', () => {
    expect(parseSaveSummary(summary())).toEqual(summarizeState(data, newGame()))
    const big = { ...summary(), money: '1e+1000', highestLevel: Number.MAX_SAFE_INTEGER }
    expect(parseSaveSummary(big)).toMatchObject({ money: '1e+1000' })
    const floor = { ...summary(), location: { type: 'floor', floor: 7, biomeId: 'lair' } }
    expect(parseSaveSummary(floor)?.location).toEqual({ type: 'floor', floor: 7, biomeId: 'lair' })
  })

  it('summary dạng cũ (có chữ) hoặc sai dạng thì null', () => {
    const old = {
      leaderName: 'Bé',
      leaderSpeciesName: 'Yếu',
      highestLevel: 5,
      partySize: 1,
      totalMonsters: 1,
      money: '500',
      locationName: 'Thị trấn',
      inBattle: false
    }
    expect(parseSaveSummary(old)).toBeNull()
    expect(parseSaveSummary(null)).toBeNull()
    expect(parseSaveSummary('x')).toBeNull()
    expect(parseSaveSummary({ ...summary(), money: 500 })).toBeNull()
    expect(parseSaveSummary({ ...summary(), highestLevel: -1 })).toBeNull()
    expect(parseSaveSummary({ ...summary(), highestLevel: 1.5 })).toBeNull()
    expect(parseSaveSummary({ ...summary(), location: { type: 'floor', floor: 1 } })).toBeNull()
    expect(parseSaveSummary({ ...summary(), location: { type: 'zone' } })).toBeNull()
    expect(parseSaveSummary({ ...summary(), leaderNickname: 3 })).toBeNull()
  })
})
