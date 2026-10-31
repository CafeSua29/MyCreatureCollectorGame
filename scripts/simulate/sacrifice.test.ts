import { describe, expect, it } from 'vitest'
import { toBig, type GameState, type Monster } from '@core'
import { atFloor, makeData, makeGameState, makeMonster } from '@core/testing'
import { sacrificeSpareFodder } from './sacrifice'

const data = makeData()

/** Quái bắt về (lý lịch quái hoang) nên được coi là nguyên liệu. */
const caught = (id: string, overrides: Partial<Monster> = {}): Monster => {
  const monster = makeMonster({ id, level: 5, ...overrides })
  const history = monster.history && {
    ...monster.history,
    origin: { kind: 'wild' as const, ballItemId: 'ball' }
  }
  return { ...monster, history }
}

const town = (party: Monster[], storage: Monster[], money = 1e6): GameState => ({
  ...makeGameState({ seed: 1, party }),
  storage,
  money: toBig(money)
})

const team = new Set(['a'])

describe('sacrificeSpareFodder', () => {
  it('hiến tế hàng loạt quái bắt về hết dùng cùng race / lineage vào quái đội mẫu', () => {
    // Cùng loài weakling: không có loài mới để fuse nên là nguyên liệu hết dùng.
    const state = town([makeMonster({ id: 'a', level: 10 })], [caught('u1'), caught('u2')])
    const { state: next, sacrificed } = sacrificeSpareFodder(data, state, team)
    expect(sacrificed).toBe(2)
    expect(next.storage).toEqual([])
    expect(next.party[0].sacrificeStacks).toBe(2)
  })

  it('giữ keepFuseFodder nguyên liệu fuse tốt nhất, phần dư cùng race thì hiến tế', () => {
    const strong = (id: string, level: number): Monster =>
      caught(id, { speciesId: 'strongling', baseSpeciesId: 'strongling', level })
    const state = town(
      [makeMonster({ id: 'a', level: 10 })],
      [strong('s1', 3), strong('s2', 9), strong('s3', 6)]
    )
    const { state: next, sacrificed } = sacrificeSpareFodder(data, state, team)
    expect(sacrificed).toBe(1)
    expect(next.storage.map((m) => m.id).sort()).toEqual(['s2', 's3'])
  })

  it('bỏ qua khác race, quá đắt, ngoài thị trấn', () => {
    const other = caught('x', { raceId: 'beast' })
    const state = town([makeMonster({ id: 'a', level: 10 })], [other])
    expect(sacrificeSpareFodder(data, state, team).sacrificed).toBe(0)
    const poor = town([makeMonster({ id: 'a', level: 10 })], [caught('u1')], 100)
    expect(sacrificeSpareFodder(data, poor, team).state).toBe(poor)
    const away = atFloor(town([makeMonster({ id: 'a' })], [caught('u1')]), 1)
    expect(sacrificeSpareFodder(data, away, team).state).toBe(away)
  })
})
