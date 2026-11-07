// Tẩy luyện sticker ở Thợ rèn (docs/rules/skill-stickers.md mục "Tẩy luyện"): giá theo độ hiếm và số
// khóa, giữ độ hiếm từng ô, khóa giữ nguyên thuộc tính, sticker đang dán, lỗi (không ở thị trấn, khóa
// hết, thiếu đá / tiền, không có sticker).

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { toBig } from '../shared'
import {
  FIXTURE_REFINING_STONE_ID,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster
} from '../testing'
import type { GameAction, GameState, StickerInstance } from '../model'

const data = makeData()

const rare: StickerInstance = {
  id: 's1',
  skillId: 'strike',
  rarity: 'rare',
  rolls: [
    { attributeId: 'damage', value: 10 },
    { attributeId: 'heal', value: 10 },
    { attributeId: 'useAgain', value: 100 }
  ]
}

function forgeState(overrides: Partial<GameState> = {}): GameState {
  const base = makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] })
  return {
    ...base,
    money: toBig(100_000),
    inventory: {
      ...base.inventory,
      stacks: { [FIXTURE_REFINING_STONE_ID]: 20 },
      stickers: [rare]
    },
    ...overrides
  }
}

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const rarityOf = (attributeId: string): string => data.stickerAttributes[attributeId].rarity

describe('tẩy luyện sticker', () => {
  it('tốn (1 + khóa) × đá và tiền × tầng; ô khóa giữ nguyên, ô rare vẫn rare', () => {
    const state = forgeState()
    const after = act(state, { type: 'rerollSticker', stickerId: 's1', lockedIndexes: [0] })
    // Rare: 2 đá, 300 tiền / tầng (fixture), 1 ô khóa → × 2.
    expect(after.inventory.stacks[FIXTURE_REFINING_STONE_ID]).toBe(16)
    expect(state.money.minus(after.money).toNumber()).toBe(600 * state.highestFloor)
    const [kept, ...rest] = after.inventory.stickers[0].rolls
    expect(kept).toEqual(rare.rolls[0])
    expect(rest.map((roll) => rarityOf(roll.attributeId))).toEqual(['uncommon', 'rare'])
    const ids = after.inventory.stickers[0].rolls.map((roll) => roll.attributeId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sticker đang dán trên quái cũng tẩy được', () => {
    const state = forgeState({
      party: [makeMonster({ id: 'a', skillStickers: { strike: rare } })],
      inventory: { ...forgeState().inventory, stickers: [] }
    })
    const after = act(state, { type: 'rerollSticker', stickerId: 's1' })
    expect(after.party[0].skillStickers.strike.id).toBe('s1')
    expect(after.rng).not.toEqual(state.rng)
  })

  it('lỗi: không ở thị trấn, khóa hết, thiếu đá, không có sticker, khóa sai', () => {
    const away = forgeState({ location: { type: 'floor', floor: 1 } })
    expectActionError(() => act(away, { type: 'rerollSticker', stickerId: 's1' }), 'notInTown')
    expectActionError(
      () => act(forgeState(), { type: 'rerollSticker', stickerId: 's1', lockedIndexes: [0, 1, 2] }),
      'nothingToReroll'
    )
    const poor = forgeState()
    const noStones = { ...poor, inventory: { ...poor.inventory, stacks: {} } }
    expectActionError(
      () => act(noStones, { type: 'rerollSticker', stickerId: 's1' }),
      'notEnoughItem'
    )
    expectActionError(
      () => act(forgeState(), { type: 'rerollSticker', stickerId: 's9' }),
      'stickerNotFound'
    )
    expectActionError(
      () => act(forgeState(), { type: 'rerollSticker', stickerId: 's1', lockedIndexes: [5] }),
      'malformedAction'
    )
  })
})
