import { describe, expect, it } from 'vitest'
import { createGameData, type GameState } from '@core'
import { makeGameState, makeMonster, makeRawData, withFixtureText } from '@core/testing'
import { sendExpeditions } from './expeditions'

const raw = makeRawData()
raw.expeditions.push({
  id: 'walk',
  kind: 'exploring',
  durationDays: 1,
  requirements: [{ type: 'teamSize', min: 1, max: 2 }],
  powerPerFloor: 1,
  moneyPerFloor: 1,
  drops: [],
  eggChance: 0
})
const data = createGameData(withFixtureText(raw))

describe('sendExpeditions', () => {
  it('phái quái rảnh level cao nhất trong kho, đủ số tối đa; hết ô thì dừng', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'p' })] }),
      storage: [
        makeMonster({ id: 'a', level: 3 }),
        makeMonster({ id: 'b', level: 9 }),
        makeMonster({ id: 'c', level: 5 })
      ],
      expeditions: { board: ['walk'], refreshDay: 7, active: [], nextId: 1 }
    }
    const { state: next, sent } = sendExpeditions(data, state)
    expect(sent).toBe(1)
    expect(next.expeditions.active[0].monsterIds).toEqual(['b', 'c'])
    expect(sendExpeditions(data, next).sent).toBe(0)
  })
})
