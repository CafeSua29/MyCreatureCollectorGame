import { describe, expect, it } from 'vitest'
import { expForLevel, type Monster } from '@core'
import { makeData, makeGameState, makeMonster, uniformStats } from '@core/testing'
import { runSectActivities } from './sects'

const data = makeData()

const hero = (): Monster =>
  makeMonster({
    id: 'h',
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

describe('runSectActivities', () => {
  it('gia nhập tông gia nhập được có buff tốt nhất, luận võ, dự tông chiến khi mở', () => {
    const state = makeGameState({ seed: 3, party: [hero()] })
    const result = runSectActivities(data, state, { maxTurns: 50 })
    // Tông beast cần cảnh giới 2: chỉ vào được sword.
    expect(result.state.sect.sectId).toBe('sword')
    // 2 trận luận võ + 2 vòng tông chiến (đội rất mạnh thắng hết).
    expect(result.battles).toBe(4)
    expect(result.warsWon).toBe(1)
    expect(result.state.sect.war.round).toBeNull()
    expect(result.state.battle).toBeNull()
  })

  it('chưa đủ cảnh giới cho tông nào thì không làm gì', () => {
    const raw = makeData()
    for (const sect of Object.values(raw.sects)) sect.minRealm = 5
    const state = makeGameState({ seed: 3, party: [hero()] })
    const result = runSectActivities(raw, state, { maxTurns: 50 })
    expect(result.state.sect.sectId).toBeNull()
    expect(result.battles).toBe(0)
  })
})
