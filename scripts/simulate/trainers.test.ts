import { describe, expect, it } from 'vitest'
import { createGameData, expForLevel } from '@core'
import {
  makeGameState,
  makeMonster,
  uniformStats,
  makeRawData,
  withFixtureText
} from '@core/testing'
import { runTrainerChallenges } from './trainers'

const data = createGameData(withFixtureText(makeRawData()))

const hero = makeMonster({
  id: 'h',
  level: 80,
  exp: expForLevel(80, 'mediumFast'),
  genes: uniformStats(500),
  skillIds: ['strike']
})

describe('runTrainerChallenges', () => {
  it('dự giải đang mở tới vô địch, đánh đấu trường, thách đạo quán chưa có huy hiệu', () => {
    const base = makeGameState({ seed: 1, party: [hero], highestFloor: 10 })
    const gym = { floor: 10, elementId: 'grass', trainerCount: 2, progress: 0, wins: 0 }
    const state = { ...base, trainers: { ...base.trainers, gyms: [gym] } }
    const result = runTrainerChallenges(data, state, { maxTurns: 50 })
    expect(result.tournamentsWon).toBe(1)
    expect(result.badges).toBe(1)
    // 3 vòng giải + 1 đấu trường + 2 NPC + quán chủ.
    expect(result.battles).toBe(7)
    expect(result.wins).toBe(7)
    expect(result.state.trainers.arenaRank).toBe(1)
    expect(result.state.location).toEqual({ type: 'town' })
    // Đã có huy hiệu, giải kỳ này đã dự: lần sau chỉ đánh đấu trường.
    expect(runTrainerChallenges(data, result.state, { maxTurns: 50 }).battles).toBe(1)
  })
})
