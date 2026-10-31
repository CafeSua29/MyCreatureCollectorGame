import { describe, expect, it } from 'vitest'
import { addItems, createGameData, expForLevel } from '@core'
import {
  FIXTURE_TRIAL_TOKEN_ID,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '@core/testing'
import { runTrials } from './trials'

const data = createGameData(withFixtureText(makeRawData()))
const limits = { maxTurns: 50, maxTurnsBoss: 50 }

const hero = makeMonster({
  id: 'h',
  level: 80,
  exp: expForLevel(80, 'mediumFast'),
  genes: uniformStats(500),
  skillIds: ['strike']
})

describe('runTrials', () => {
  it('có lệnh thì đi hết bí cảnh, rồi leo tháp đủ số tầng; về thị trấn ngoài bí cảnh', () => {
    const base = makeGameState({ seed: 1, party: [hero], highestFloor: 2 })
    const state = { ...base, inventory: addItems(base.inventory, FIXTURE_TRIAL_TOKEN_ID, 1) }
    const result = runTrials(data, state, { limits, towerAttempts: 2 })
    expect(result.entered).toBe(1)
    expect(result.completed).toBe(1)
    expect(result.realmBattles).toBe(3)
    expect(result.towerWins).toBe(2)
    expect(result.state.tower.highest).toBe(2)
    expect(result.state.trial).toBeNull()
    expect(result.state.battle).toBeNull()
    // Hết lệnh: lần sau chỉ leo tháp.
    expect(runTrials(data, result.state, { limits, towerAttempts: 1 }).entered).toBe(0)
  })

  it('quái yếu: thua trận bí cảnh đầu, bí cảnh kết thúc; thua tầng tháp đầu', () => {
    const weak = makeMonster({ id: 'w', genes: uniformStats(1) })
    const base = makeGameState({ seed: 1, party: [weak], highestFloor: 30 })
    const state = { ...base, inventory: addItems(base.inventory, FIXTURE_TRIAL_TOKEN_ID, 1) }
    const result = runTrials(
      data,
      { ...state, tower: { highest: 30 } },
      { limits, towerAttempts: 3 }
    )
    expect(result.completed).toBe(0)
    expect(result.state.trial).toBeNull()
    expect(result.towerWins).toBe(0)
    expect(result.towerBattles).toBe(1)
  })
})
