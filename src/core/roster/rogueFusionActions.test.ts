// Action ngoài trận của Rogue Fusion (docs/rules/rogue-fusion.md): Ritual Candle, Hacking Glove, đổi
// Fused Material, quà nhà Bootleg, quà bảng nhiệm vụ; Bootleg của boss (2% như trận tĩnh của gốc).

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import { floorSite, generateFloorBoss } from '../world'
import { createRng } from '../shared'
import {
  expectActionError,
  makeData,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { GameAction, GameState } from '../model'

const data = makeData()

function townState(stacks: Record<string, number> = {}): GameState {
  const base = makeGameState({
    seed: 2,
    party: [
      makeMonster({ id: 'a' }),
      makeMonster({ id: 'b', speciesId: 'twig', baseSpeciesId: 'twig' })
    ]
  })
  return { ...base, inventory: { ...base.inventory, stacks } }
}

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

describe('Ritual Candle', () => {
  it('hiến quái: quái rời đội, nến mất, điềm báo ghi loài + hệ đầu', () => {
    const after = act(townState({ ritualCandle: 1 }), { type: 'lightRitualCandle', monsterId: 'b' })
    expect(after.party.map((m) => m.id)).toEqual(['a'])
    expect(after.inventory.stacks.ritualCandle).toBeUndefined()
    expect(after.rogueFusion.omen.candle).toEqual({ speciesId: 'twig', elementId: 'grass' })
  })

  it('lỗi: không có nến, nến đang có hiệu lực, trong trận', () => {
    expectActionError(
      () => act(townState(), { type: 'lightRitualCandle', monsterId: 'b' }),
      'notEnoughItem'
    )
    const lit = act(townState({ ritualCandle: 2 }), { type: 'lightRitualCandle', monsterId: 'b' })
    expectActionError(() => act(lit, { type: 'lightRitualCandle', monsterId: 'a' }), 'omenActive')
  })
})

describe('Hacking Glove', () => {
  it('tốn 1 Cyber Material, cần găng; đang hack thì báo lỗi', () => {
    const state = townState({ hackingGlove: 1, cyberMaterial: 2 })
    const hacked = act(state, { type: 'hackRogueFusion' })
    expect(hacked.rogueFusion.omen.hack).toBe(true)
    expect(hacked.inventory.stacks.cyberMaterial).toBe(1)
    expectActionError(() => act(hacked, { type: 'hackRogueFusion' }), 'omenActive')
    expectActionError(
      () => act(townState({ cyberMaterial: 2 }), { type: 'hackRogueFusion' }),
      'notEnoughItem'
    )
    expectActionError(
      () => act(townState({ hackingGlove: 1 }), { type: 'hackRogueFusion' }),
      'notEnoughItem'
    )
  })
})

describe('đổi Fused Material', () => {
  it('đổi nến 50 vật liệu mỗi cái; vật phẩm lạ / thiếu vật liệu / count sai báo lỗi', () => {
    const after = act(townState({ fusedMaterial: 120 }), {
      type: 'exchangeFusedMaterial',
      itemId: 'ritualCandle',
      count: 2
    })
    expect(after.inventory.stacks.fusedMaterial).toBe(20)
    expect(after.inventory.stacks.ritualCandle).toBe(2)
    const rich = townState({ fusedMaterial: 1000 })
    expectActionError(
      () => act(rich, { type: 'exchangeFusedMaterial', itemId: 'ball', count: 1 }),
      'notExchangeable'
    )
    expectActionError(
      () =>
        act(townState({ fusedMaterial: 10 }), {
          type: 'exchangeFusedMaterial',
          itemId: 'ritualCandle',
          count: 1
        }),
      'notEnoughItem'
    )
    expectActionError(
      () => act(rich, { type: 'exchangeFusedMaterial', itemId: 'ritualCandle', count: 0 }),
      'malformedAction'
    )
  })
})

describe('quà Bootleg', () => {
  it('nhà Bootleg: một lần, quái Bootleg của map đã mở, có lý lịch quà', () => {
    const after = act(townState(), { type: 'claimBootlegHouseGift' })
    const gift = after.party[2]
    expect(gift.bootlegElementId).not.toBeNull()
    expect(gift.level).toBe(data.config.rogueFusion.houseGiftLevel)
    expect(gift.history?.origin).toEqual({ kind: 'bootlegGift', gift: 'house' })
    expectActionError(() => act(after, { type: 'claimBootlegHouseGift' }), 'giftClaimed')
  })

  it('bảng nhiệm vụ: cần đủ nhiệm vụ đã hoàn thành; loài khởi đầu không chọn', () => {
    const base = townState()
    expectActionError(() => act(base, { type: 'claimQuestBootlegGift' }), 'giftLocked')
    const ready: GameState = {
      ...base,
      stats: { ...base.stats, questsCompleted: 2 },
      rogueFusion: { ...base.rogueFusion, starterAlternatives: ['twig'] }
    }
    const after = act(ready, { type: 'claimQuestBootlegGift' })
    const gift = after.party[2]
    expect(gift.speciesId).toBe('twig')
    expect(gift.bootlegElementId).not.toBeNull()
    expectActionError(() => act(after, { type: 'claimQuestBootlegGift' }), 'giftClaimed')
  })

  it('ngoài thị trấn báo notInTown', () => {
    const away = { ...townState(), location: { type: 'floor' as const, floor: 1 } }
    expectActionError(() => act(away, { type: 'claimBootlegHouseGift' }), 'notInTown')
  })
})

describe('Bootleg của boss', () => {
  it('staticChance 100: boss tầng là Bootleg', () => {
    const raw = makeRawData()
    raw.config.bootleg = { ...raw.config.bootleg, staticChance: 100 }
    const sure = createGameData(withFixtureText(raw))
    const state = makeGameState({ seed: 1, location: { type: 'floor', floor: 1 } })
    const site = floorSite(sure, state, 1)
    const [boss] = generateFloorBoss(sure, createRng(1), site, 'm9')
    expect(boss.bootlegElementId).not.toBeNull()
  })
})
