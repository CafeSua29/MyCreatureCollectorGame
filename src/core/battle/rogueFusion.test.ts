// Rogue Fusion (docs/rules/rogue-fusion.md): gặp trên tầng, hợp thể sẵn không hết lượt, tan ra khi bị
// hạ (hồi đầy máu, chùn bước, bắt được thành phần), thưởng Fused Material / Cyber Material / Hacking
// Glove, biến thể Swarm / Orb, thành phần Bootleg, điềm báo Ritual Candle / Hacking Glove, kiểm tra
// save.

import { describe, expect, it } from 'vitest'
import { gameReducer, validateGameState } from '../game'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import {
  defined,
  expectActionError,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { BattleEvent, GameData, GameState, RogueFusionConfig } from '../model'
import { cloneDraft } from './draft'
import { grantRogueFusionRewards } from './rogueFusion'

function rogueData(edit: Partial<RogueFusionConfig> = {}): GameData {
  const raw = makeRawData()
  raw.config.rogueFusion = { ...raw.config.rogueFusion, chance: 100, ...edit }
  return createGameData(withFixtureText(raw))
}

/** Người chơi mạnh ở tầng 1 (một đòn hạ được quái hoang). */
function floorState(overrides: Partial<GameState> = {}): GameState {
  const hero = makeMonster({ id: 'a', level: 50, skillIds: ['strike'] })
  return {
    ...makeGameState({ seed: 5, party: [hero], location: { type: 'floor', floor: 1 } }),
    ...overrides
  }
}

const start = (data: GameData, state: GameState): GameState =>
  gameReducer(data, state, { type: 'startWildBattle' })

const logOf = (state: GameState): BattleEvent[] => defined(state.battle).log

describe('gặp Rogue Fusion', () => {
  it('trận hoang thành hợp thể của hai quái hoang, không hết lượt', () => {
    const data = rogueData()
    const opened = start(data, floorState())
    const battle = defined(opened.battle)
    expect(battle.special).toEqual({
      kind: 'rogueFusion',
      variant: 'standard',
      swarmPending: false
    })
    expect(battle.enemies).toHaveLength(2)
    const [leadId] = battle.enemySlots
    expect(battle.enemySlots).toEqual([leadId, leadId])
    const lead = defined(battle.enemies.find((m) => m.id === leadId))
    expect(lead.battleTransform?.rogue).toBe(true)
    expect(lead.battleTransform?.turnsLeft).toBeUndefined()
    expect(logOf(opened).some((event) => event.type === 'rogueFusionAppeared')).toBe(true)
    expect(validateGameState(data, opened)).toEqual([])
  })

  it('tỉ lệ 0 không tốn RNG: trận hoang thường', () => {
    const data = rogueData({ chance: 0 })
    expect(defined(start(data, floorState()).battle).special).toBeNull()
  })

  it('không bắt được thực thể hợp thể', () => {
    const data = rogueData()
    const opened = start(data, {
      ...floorState(),
      inventory: { ...floorState().inventory, stacks: { ball: 5 } }
    })
    expectActionError(
      () =>
        gameReducer(data, opened, {
          type: 'submitTurn',
          commands: [
            {
              slot: 0,
              kind: 'item',
              itemId: 'ball',
              targetId: defined(defined(opened.battle).enemySlots[0])
            }
          ]
        }),
      'cannotCatchFusion'
    )
  })
})

describe('tan ra và thưởng', () => {
  it('bị hạ: hai thành phần hồi đầy máu về ô của mình, chùn bước', () => {
    const data = rogueData()
    const opened = start(data, floorState())
    const battle = defined(opened.battle)
    const leadId = defined(battle.enemySlots[0])
    // Thực thể còn 1 HP: một đòn là hạ.
    const enemies = battle.enemies.map((m) =>
      m.id === leadId ? { ...m, damageTaken: getMaxHp(data, m).minus(1) } : m
    )
    const weak = { ...opened, battle: { ...battle, enemies } }
    const after = gameReducer(data, weak, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
    })
    const dissolved = logOf(after).find((event) => event.type === 'rogueFusionDissolved')
    expect(dissolved).toBeDefined()
    const next = defined(after.battle)
    expect(new Set(next.enemySlots).size).toBe(2)
    for (const monster of next.enemies) {
      expect(monster.damageTaken.toNumber()).toBe(0)
      expect(monster.statuses.some((s) => s.statusId === 'flinch')).toBe(true)
    }
  })

  it('Orb: quả cầu Barrier; Cyber Material lần đầu tặng Hacking Glove', () => {
    const data = rogueData({ variantWeights: { standard: 0, flood: 0, swarm: 0, orb: 1 } })
    const opened = start(data, floorState())
    const battle = defined(opened.battle)
    const lead = defined(battle.enemies.find((m) => m.id === battle.enemySlots[0]))
    const orb = lead.statuses.find((status) => status.statusId === 'rogueOrb')
    expect(orb?.amount?.gt(0)).toBe(true)
    // Thưởng của Orb: 5 Fused Material, Cyber Material 100% (fixture) và Hacking Glove lần đầu.
    const d = cloneDraft(opened)
    grantRogueFusionRewards(data, d, 'orb')
    expect(d.inventory.stacks.fusedMaterial).toBe(5)
    expect(d.inventory.stacks.cyberMaterial).toBe(1)
    expect(d.inventory.stacks.hackingGlove).toBe(1)
    expect(d.battle.log).toContainEqual({ type: 'hackingGloveGained' })
    // Lần sau không tặng thêm găng.
    grantRogueFusionRewards(data, d, 'orb')
    expect(d.inventory.stacks.hackingGlove).toBe(1)
  })
})

describe('Swarm', () => {
  it('bầy cùng loài, đủ số bị hạ thì hợp thể xuất hiện', () => {
    const data = rogueData({ variantWeights: { standard: 0, flood: 0, swarm: 1, orb: 0 } })
    const opened = start(data, floorState())
    const battle = defined(opened.battle)
    expect(battle.special).toMatchObject({ variant: 'swarm', swarmPending: true })
    expect(battle.enemies).toHaveLength(3)
    expect(new Set(battle.enemies.map((m) => m.speciesId)).size).toBe(1)
    // Hai quái đầu (trên sân) còn 1 HP: lượt sau hạ cả hai bằng 2 đòn của đồng đội mạnh.
    const enemies = battle.enemies.map((m, i) =>
      i < 2 ? { ...m, damageTaken: getMaxHp(data, m) } : m
    )
    const hero = makeMonster({ id: 'b', level: 50, skillIds: ['strike'] })
    const state = { ...opened, battle: { ...battle, enemies } }
    const after = gameReducer(
      data,
      { ...state, party: [...state.party, hero] },
      {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
      }
    )
    const appeared = logOf(after).find(
      (event) => event.type === 'rogueFusionAppeared' && event.variant === 'swarm'
    )
    expect(appeared).toBeDefined()
    expect(defined(after.battle).special).toMatchObject({ swarmPending: false })
  })
})

describe('Bootleg', () => {
  it('bootlegChances 100: một thành phần là Bootleg', () => {
    const data = rogueData({ bootlegChances: { standard: 100, flood: 0, swarm: 0, orb: 0 } })
    const battle = defined(start(data, floorState()).battle)
    expect(battle.enemies.filter((m) => m.bootlegElementId !== null)).toHaveLength(1)
  })

  it('Hacking Glove: thành phần Bootleg, điềm báo hết; nến vẫn giữ', () => {
    const data = rogueData()
    const base = floorState()
    const omen = { candle: { speciesId: 'twig', elementId: 'grass' }, hack: true }
    const opened = start(data, { ...base, rogueFusion: { ...base.rogueFusion, omen } })
    expect(opened.rogueFusion.omen).toEqual({ candle: omen.candle, hack: false })
    const battle = defined(opened.battle)
    const lead = defined(battle.enemies.find((m) => m.id === battle.enemySlots[0]))
    const partner = defined(lead.battleTransform?.mergePartner?.monster)
    expect([lead, partner].some((m) => m.bootlegElementId !== null)).toBe(true)
  })

  it('Ritual Candle cùng loài: thành phần là loài đã hiến, Bootleg; nến hết', () => {
    const data = rogueData({ candleSpeciesPercent: 100 })
    const base = floorState()
    const omen = { candle: { speciesId: 'twig', elementId: 'grass' }, hack: false }
    const opened = start(data, { ...base, rogueFusion: { ...base.rogueFusion, omen } })
    expect(opened.rogueFusion.omen.candle).toBeNull()
    const battle = defined(opened.battle)
    const twig = battle.enemies.find((m) => m.speciesId === 'twig')
    expect(twig?.bootlegElementId).not.toBeNull()
  })
})

describe('kiểm tra save', () => {
  it('special và state Rogue Fusion sai báo lỗi', () => {
    const data = rogueData()
    const opened = start(data, floorState())
    const battle = defined(opened.battle)
    const badSpecial = {
      ...opened,
      battle: {
        ...battle,
        special: { kind: 'rogueFusion' as const, variant: 'standard' as const, swarmPending: true }
      }
    }
    expect(validateGameState(data, badSpecial).join()).toContain('swarmPending')
    const badState = {
      ...floorState(),
      rogueFusion: { ...floorState().rogueFusion, houseGiftClaimed: 1 }
    }
    expect(validateGameState(data, badState).join()).toContain('houseGiftClaimed')
  })
})
