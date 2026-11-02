// Ngự thú sư trong vòng đời trận (docs/rules/tamer.md): linh lực đầy khi vào trận, EXP ngự thú sư
// khi thắng và khi mở tầng, Phá Cảnh Đan rơi từ boss tầng, bắt bằng bóng không theo khế ước.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { expReward, getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  atFloor,
  defined,
  fixtureFloorBiomeIds,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData
} from '../testing'
import type { BattleEvent, GameState, Monster } from '../model'

const data = makeData()

const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const

const tamerExpEvents = (state: GameState): Extract<BattleEvent, { type: 'tamerExpGained' }>[] =>
  (state.battle?.log ?? []).filter(
    (e): e is Extract<BattleEvent, { type: 'tamerExpGained' }> => e.type === 'tamerExpGained'
  )

/** Boss tầng strongling ×3 level 4, còn 1 máu, chỉ biết idle. */
function boss(): Monster {
  const base = makeMonster({
    id: 'boss',
    speciesId: 'strongling',
    baseSpeciesId: 'strongling',
    elementIds: ['fire'],
    level: 4,
    exp: 64,
    bossMultiplier: 3,
    skillIds: ['idle']
  })
  return { ...base, damageTaken: getMaxHp(data, base).minus(1) }
}

function bossBattleAt(floor: number, highestFloor: number): GameState {
  const state = makeBattleState([makeMonster({ id: 'a' })], [boss()], { floor, isBoss: true })
  return { ...state, highestFloor, floorBiomeIds: fixtureFloorBiomeIds(highestFloor) }
}

describe('ngự thú sư khi vào trận', () => {
  it('trận quái hoang: phe người chơi có ngự thú sư linh lực đầy theo cảnh giới, phe địch null', () => {
    const state = atFloor(
      makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })], tamerRealm: 2 }),
      1
    )
    const battle = defined(gameReducer(data, state, { type: 'startWildBattle' }).battle)
    expect(battle.tamers).toEqual({
      player: { realm: 2, mana: 70, cooldowns: {}, uses: {}, skillIds: null },
      enemy: null
    })
  })
})

describe('EXP ngự thú sư', () => {
  it('thắng trận: 10% EXP gốc; hạ boss tầng lần đầu: thêm 100% EXP gốc', () => {
    const exp = expReward(data, boss())
    const won = gameReducer(data, bossBattleAt(2, 2), { type: 'submitTurn', commands: [strike] })
    expect(defined(won.battle).outcome).toBe('won')
    const share = exp.times(10).div(100).floor()
    expect(tamerExpEvents(won).map((e) => e.amount)).toEqual([share, exp])
    expect(won.tamer.exp).toEqual(share.plus(exp))
  })

  it('boss tầng đã mở (không mở tầng mới): chỉ 10%', () => {
    const exp = expReward(data, boss())
    const won = gameReducer(data, bossBattleAt(2, 3), { type: 'submitTurn', commands: [strike] })
    expect(won.tamer.exp).toEqual(exp.times(10).div(100).floor())
  })

  it('trận không có ngự thú sư của người chơi: không nhận EXP', () => {
    const state = bossBattleAt(2, 3)
    const battle = defined(state.battle)
    const none = { ...state, battle: { ...battle, tamers: { player: null, enemy: null } } }
    const won = gameReducer(data, none, { type: 'submitTurn', commands: [strike] })
    expect(won.tamer.exp.toNumber()).toBe(0)
    expect(tamerExpEvents(won)).toEqual([])
  })

  it('EXP cực lớn cộng dồn bằng Decimal, không ra Infinity / NaN', () => {
    const huge = toBig(10).pow(400)
    const state = {
      ...bossBattleAt(2, 3),
      tamer: {
        bondDay: null,
        woundUntilDay: null,
        talentRanks: {},
        bonusTalentPoints: 0,
        realm: 0,
        exp: huge
      }
    }
    const won = gameReducer(data, state, { type: 'submitTurn', commands: [strike] })
    expect(won.tamer.exp.isFinite()).toBe(true)
    expect(won.tamer.exp.gte(huge)).toBe(true)
  })
})

describe('Phá Cảnh Đan rơi từ boss tầng', () => {
  it('bảng rơi config.tamer.floorBossDrops chỉ tung khi hạ boss tầng của map', () => {
    const raw = makeRawData()
    raw.config.tamer.floorBossDrops = [{ itemId: 'breakthroughPill', chance: 100 }]
    const dropData = createGameData(raw)
    const won = gameReducer(dropData, bossBattleAt(2, 3), {
      type: 'submitTurn',
      commands: [strike]
    })
    expect(won.inventory.stacks.breakthroughPill).toBe(1)
  })
})

describe('bắt bằng bóng tách khỏi khế ước (tamer.md mục "Khế ước")', () => {
  const wild = (level: number): Monster => makeMonster({ id: 'w', level, skillIds: ['idle'] })
  const withBall = (state: GameState): GameState => ({
    ...state,
    inventory: makeInventory({ masterBall: 1 })
  })
  const throwBall = { slot: 0, kind: 'item', itemId: 'masterBall', targetId: 'w' } as const

  it('quái level vượt xa giới hạn khế ước vẫn bắt được; quái bắt được chưa khế ước', () => {
    const state = withBall(makeBattleState([makeMonster({ id: 'a' })], [wild(10_000)]))
    const after = gameReducer(data, state, { type: 'submitTurn', commands: [throwBall] })
    const caught = defined(after.party.find((m) => m.id === 'w') ?? after.storage[0], 'quái bắt')
    expect(caught.contractRealm).toBeNull()
  })
})
