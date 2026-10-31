import { describe, expect, it } from 'vitest'
import { createGameData, refillQuestBoard, type GameState } from '@core'
import { makeGameState, makeMonster, makeRawData, withFixtureText } from '@core/testing'
import { runQuests } from './quests'

const raw = makeRawData()
raw.quests.push({
  id: 'hatchEggs',
  type: 'hatch',
  params: {},
  countMin: 1,
  countMax: 1,
  weight: 1,
  reward: { moneyPerFloor: 100, items: [] }
})
const data = createGameData(withFixtureText(raw))

describe('runQuests', () => {
  it('nhận đủ số tối đa; nhiệm vụ xong thì nhận thưởng rồi nhận tiếp', () => {
    const start = refillQuestBoard(
      data,
      makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    )
    const first = runQuests(data, start)
    expect(first.state.quests.active).toHaveLength(3)
    expect(first.claimed).toBe(0)
    const done: GameState = {
      ...first.state,
      quests: {
        ...first.state.quests,
        active: first.state.quests.active.map((q, i) => (i === 0 ? { ...q, progress: 1 } : q))
      }
    }
    const second = runQuests(data, done)
    expect(second.claimed).toBe(1)
    expect(second.state.quests.active).toHaveLength(3)
    expect(second.state.money.minus(done.money).toString()).toBe('100')
  })
})
