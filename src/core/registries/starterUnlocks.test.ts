import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { createNewGame } from '../game'
import type { GameState, StarterUnlock } from '../model'
import { makeRawData } from '../testing'
import { newStarterUnlocks, reachedStarterUnlocks } from './starterUnlocks'

// Fixture: dạng đầu có tiến hóa weakling (→ strongling), twig, pebble (→ boulder), nymph (→ husk).
const dataWith = (
  unlocks: StarterUnlock[],
  unlockOwnedLines = false
): ReturnType<typeof createGameData> => {
  const raw = makeRawData()
  raw.config.starter.unlocks = unlocks
  raw.config.starter.unlockOwnedLines = unlockOwnedLines
  return createGameData(raw)
}

const stateOf = (
  data: ReturnType<typeof createGameData>,
  edit: Partial<GameState> = {}
): GameState => ({
  ...createNewGame(data, { seed: 1, starterSpeciesId: 'weakling', gender: 'male', nickname: null }),
  ...edit
})

const floorUnlock: StarterUnlock = {
  speciesIds: ['pebble', 'nymph'],
  condition: { type: 'highestFloor' },
  value: 10
}

describe('reachedStarterUnlocks', () => {
  it('mở khi tiến độ điều kiện đạt value (biên: đúng bằng value)', () => {
    const data = dataWith([floorUnlock])
    expect(reachedStarterUnlocks(data, stateOf(data, { highestFloor: 9 }))).toEqual([])
    expect(reachedStarterUnlocks(data, stateOf(data, { highestFloor: 10 }))).toEqual([
      'pebble',
      'nymph'
    ])
    expect(
      reachedStarterUnlocks(data, stateOf(data, { highestFloor: Number.MAX_SAFE_INTEGER }))
    ).toEqual(['pebble', 'nymph'])
  })

  it('điều kiện Dex: số loài đã sở hữu', () => {
    const data = dataWith([{ speciesIds: ['twig'], condition: { type: 'dexOwned' }, value: 2 }])
    const state = stateOf(data)
    expect(reachedStarterUnlocks(data, state)).toEqual([])
    const more = { ...state, dex: { ...state.dex, owned: [...state.dex.owned, 'brawler'] } }
    expect(reachedStarterUnlocks(data, more)).toEqual(['twig'])
  })

  it('unlockOwnedLines: sở hữu dạng sau mở dạng đầu của chuỗi; tắt thì không', () => {
    const state = (data: ReturnType<typeof createGameData>): GameState => {
      const base = stateOf(data)
      return { ...base, dex: { ...base.dex, owned: ['boulder', 'brawler'] } }
    }
    const on = dataWith([], true)
    // boulder → dạng đầu pebble; brawler không tiến hóa nên không mở gì.
    expect(reachedStarterUnlocks(on, state(on))).toEqual(['pebble'])
    const off = dataWith([], false)
    expect(reachedStarterUnlocks(off, state(off))).toEqual([])
  })

  it('không trùng khi nhiều nguồn cùng mở một loài', () => {
    const data = dataWith([floorUnlock, { ...floorUnlock, value: 1 }], true)
    const base = stateOf(data, { highestFloor: 10 })
    const state = { ...base, dex: { ...base.dex, owned: ['boulder'] } }
    expect(reachedStarterUnlocks(data, state)).toEqual(['pebble', 'nymph'])
  })
})

describe('newStarterUnlocks', () => {
  it('bỏ loài đã mở', () => {
    const data = dataWith([floorUnlock])
    const state = stateOf(data, { highestFloor: 10 })
    expect(newStarterUnlocks(data, state, ['pebble'])).toEqual(['nymph'])
    expect(newStarterUnlocks(data, state, ['pebble', 'nymph'])).toEqual([])
  })
})
