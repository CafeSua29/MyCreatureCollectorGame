import { describe, expect, it } from 'vitest'
import { toBig, type GameState, type Monster } from '@core'
import { atFloor, makeData, makeGameState, makeMonster } from '@core/testing'
import { averageTeamStars, starUpSpareFodder } from './starRank'

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

describe('starUpSpareFodder', () => {
  it('ghép quái bắt về cùng chuỗi tiến hóa vào quái đội mẫu, bỏ qua quái khác chuỗi', () => {
    const pebble = caught('p', {
      speciesId: 'pebble',
      baseSpeciesId: 'pebble',
      gender: 'none',
      elementIds: ['normal']
    })
    const state = town([makeMonster({ id: 'a', level: 10 })], [caught('u1'), caught('u2'), pebble])
    const { state: next, fed } = starUpSpareFodder(data, state, team)
    expect(fed).toBe(2)
    expect(next.party[0].starCopies).toBe(2)
    expect(next.storage.map((m) => m.id)).toEqual(['p'])
    expect(averageTeamStars(data, next, team)).toBe(1)
  })

  it('không ghép khi giá quá spendFraction tiền hoặc không ở thị trấn', () => {
    const state = town([makeMonster({ id: 'a', level: 10 })], [caught('u1')], 4999)
    expect(starUpSpareFodder(data, state, team).fed).toBe(0)
    const away = atFloor(town([makeMonster({ id: 'a' })], [caught('u1')]), 1)
    expect(starUpSpareFodder(data, away, team).state).toBe(away)
  })
})
