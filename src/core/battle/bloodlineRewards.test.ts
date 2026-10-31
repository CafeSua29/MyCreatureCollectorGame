// Phần thưởng huyết mạch khi thắng trận boss (docs/rules/bloodline.md): độ thuần cho quái tham chiến
// cùng nhóm, Tinh huyết rơi theo nhóm của boss, loài tổ chắc chắn rơi.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getItemCount } from '../inventory'
import { getMaxHp } from '../monster'
import { defined, makeBattleState, makeBloodlineRawData, makeMonster } from '../testing'
import type { GameAction, GameData, GameState, Monster } from '../model'

/** Dữ liệu huyết mạch, Tinh huyết rơi theo `essenceChance` %. */
function bloodData(essenceChance: number): GameData {
  const raw = makeBloodlineRawData()
  raw.config.bloodline.essenceDropChance = essenceChance
  return createGameData(raw)
}

const strike: GameAction = {
  type: 'submitTurn',
  commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
}

const hero = (): Monster =>
  makeMonster({
    id: 'a',
    level: 50,
    exp: 125000,
    speciesId: 'nymph',
    baseSpeciesId: 'nymph',
    elementIds: ['grass'],
    bloodlines: [{ groupId: 'stone', purity: 10 }]
  })

/** Boss loài `speciesId` còn 1 máu, chỉ biết idle. */
function boss(data: GameData, speciesId: string): Monster {
  const enemy = makeMonster({
    id: 'e',
    speciesId,
    baseSpeciesId: speciesId,
    gender: 'none',
    elementIds: ['normal'],
    skillIds: ['idle']
  })
  return { ...enemy, damageTaken: getMaxHp(data, enemy).minus(1) }
}

const winAgainst = (data: GameData, enemy: Monster, isBoss = true): GameState =>
  gameReducer(data, makeBattleState([hero()], [enemy], { isBoss }), strike)

describe('thắng trận boss', () => {
  it('boss cùng nhóm: quái tham chiến +1 độ thuần, rơi Tinh huyết của nhóm', () => {
    const data = bloodData(100)
    const won = winAgainst(data, boss(data, 'pebble'))
    expect(defined(won.battle).outcome).toBe('won')
    expect(won.party[0].bloodlines).toEqual([{ groupId: 'stone', purity: 11 }])
    expect(getItemCount(won.inventory, 'stoneEssence')).toBe(1)
    expect(getItemCount(won.inventory, 'wyrmEssence')).toBe(0)
  })

  it('boss là loài tổ: +3 độ thuần, chắc chắn rơi Tinh huyết dù tỉ lệ 0', () => {
    const data = bloodData(0)
    const won = winAgainst(data, boss(data, 'titanStone'))
    expect(won.party[0].bloodlines).toEqual([{ groupId: 'stone', purity: 13 }])
    expect(getItemCount(won.inventory, 'stoneEssence')).toBe(1)
  })

  it('trận thường không cộng, không rơi', () => {
    const data = bloodData(100)
    const won = winAgainst(data, boss(data, 'pebble'), false)
    expect(won.party[0].bloodlines).toEqual([{ groupId: 'stone', purity: 10 }])
    expect(getItemCount(won.inventory, 'stoneEssence')).toBe(0)
  })
})
