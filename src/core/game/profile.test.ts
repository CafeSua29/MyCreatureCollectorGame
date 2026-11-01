import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { makeData, makeRawData } from '../testing'
import { createNewGame } from './newGame'
import {
  PROFILE_VERSION,
  emptyProfile,
  parseProfile,
  recordStarterUnlocks,
  serializeProfile,
  usableUnlockedStarters
} from './profile'

describe('parseProfile', () => {
  it('chưa có file / JSON hỏng / sai cấu trúc: hồ sơ rỗng, không ném lỗi', () => {
    for (const text of [null, '', '{', 'null', '[]', '{"unlockedStarterIds": "twig"}']) {
      expect(parseProfile(text)).toEqual(emptyProfile())
    }
  })

  it('bỏ id không phải chuỗi và id trùng, giữ thứ tự; đọc lại đúng bản đã ghi', () => {
    const text = JSON.stringify({ version: 1, unlockedStarterIds: ['twig', 3, 'pebble', 'twig'] })
    const profile = parseProfile(text)
    expect(profile).toEqual({ version: PROFILE_VERSION, unlockedStarterIds: ['twig', 'pebble'] })
    expect(parseProfile(serializeProfile(profile))).toEqual(profile)
  })
})

describe('recordStarterUnlocks', () => {
  const raw = makeRawData()
  raw.config.starter.unlocks = [
    { speciesIds: ['pebble', 'nymph'], condition: { type: 'highestFloor' }, value: 5 }
  ]
  const data = createGameData(raw)
  const state = createNewGame(data, {
    seed: 1,
    starterSpeciesId: 'weakling',
    gender: 'male',
    nickname: null
  })

  it('chưa đạt: giữ nguyên object hồ sơ', () => {
    const profile = emptyProfile()
    const result = recordStarterUnlocks(data, state, profile)
    expect(result.unlocked).toEqual([])
    expect(result.profile).toBe(profile)
  })

  it('đạt: nối loài mới vào cuối, không trùng loài đã mở', () => {
    const profile = { ...emptyProfile(), unlockedStarterIds: ['nymph'] }
    const result = recordStarterUnlocks(data, { ...state, highestFloor: 5 }, profile)
    expect(result.unlocked).toEqual(['pebble'])
    expect(result.profile.unlockedStarterIds).toEqual(['nymph', 'pebble'])
    expect(profile.unlockedStarterIds).toEqual(['nymph'])
  })
})

describe('usableUnlockedStarters', () => {
  it('chỉ giữ loài còn làm khởi đầu được với dữ liệu hiện tại', () => {
    const profile = { ...emptyProfile(), unlockedStarterIds: ['pebble', 'strongling', 'gone'] }
    expect(usableUnlockedStarters(makeData(), profile)).toEqual(['pebble'])
  })
})
