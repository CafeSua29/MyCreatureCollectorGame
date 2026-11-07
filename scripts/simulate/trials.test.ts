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
import { bestTrialBoon, runTrials } from './trials'

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

  it('có ân huệ: chọn sau mỗi trận thắng trừ trận cuối, ân huệ bậc hiếm cao nhất', () => {
    const raw = makeRawData()
    raw.trialBoons = [
      { id: 'plain', rarity: 'common', effects: [{ type: 'heal', percent: 10 }] },
      { id: 'shiny', rarity: 'epic', effects: [{ type: 'chest', rolls: 1 }] }
    ]
    const boonData = createGameData(withFixtureText(raw))
    const base = makeGameState({ seed: 1, party: [hero], highestFloor: 2 })
    const state = { ...base, inventory: addItems(base.inventory, FIXTURE_TRIAL_TOKEN_ID, 1) }
    const result = runTrials(boonData, state, { limits, towerAttempts: 0 })
    expect(result.completed).toBe(1)
    // 3 trận: lựa chọn sau trận 1 và 2.
    expect(result.boonsChosen).toBe(2)
    const realm = {
      kind: 'realm' as const,
      floor: 1,
      biomeId: 'field',
      rules: [],
      battleCount: 3,
      cleared: 1,
      boons: [],
      boonChoices: ['plain', 'shiny']
    }
    expect(bestTrialBoon(boonData, { ...base, trial: realm })).toBe('shiny')
    expect(bestTrialBoon(boonData, base)).toBeNull()
    // Bản đối chứng tắt ân huệ chạy cùng bí cảnh: đội rất mạnh thì cũng hoàn thành.
    expect(result.completedNoBoons).toBe(1)
  })

  it('chọn ân huệ: tránh ấn hệ đội không có và ân huệ tình huống', () => {
    const raw = makeRawData()
    const sigil = (id: string, elementId: string): (typeof raw.trialBoons)[number] => ({
      id,
      rarity: 'rare',
      effects: [
        {
          type: 'hooks',
          hooks: [{ type: 'elementDamageDealt', params: { elementIds: [elementId], percent: 20 } }]
        }
      ]
    })
    raw.trialBoons = [
      sigil('fireSigil', 'fire'),
      sigil('grassSigil', 'grass'),
      { id: 'plain', rarity: 'common', effects: [{ type: 'heal', percent: 10 }] },
      { id: 'bossy', rarity: 'common', effects: [{ type: 'bossWeaken', percent: 5 }] },
      {
        id: 'ward',
        rarity: 'common',
        effects: [
          { type: 'hooks', hooks: [{ type: 'statusImmunity', params: { statusIds: ['burn'] } }] }
        ]
      }
    ]
    const boonData = createGameData(withFixtureText(raw))
    const grassHero = { ...hero, elementIds: ['grass'] }
    const base = makeGameState({ seed: 1, party: [grassHero], highestFloor: 2 })
    const realm = (boonChoices: string[]): typeof base => ({
      ...base,
      trial: {
        kind: 'realm',
        floor: 1,
        biomeId: 'field',
        rules: [],
        battleCount: 3,
        cleared: 1,
        boons: [],
        boonChoices
      }
    })
    expect(bestTrialBoon(boonData, realm(['fireSigil', 'grassSigil']))).toBe('grassSigil')
    expect(bestTrialBoon(boonData, realm(['fireSigil', 'plain']))).toBe('plain')
    expect(bestTrialBoon(boonData, realm(['ward', 'plain']))).toBe('plain')
    expect(bestTrialBoon(boonData, realm(['plain', 'bossy']))).toBe('bossy')
  })
})
