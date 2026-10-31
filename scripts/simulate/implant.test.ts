// Mô phỏng cấy ghép (implant.ts): chọn huyết thanh, không liều mạng, tỉ trọng cấy ghép.

import { describe, expect, it } from 'vitest'
import { toBig, type GameState, type Monster, type Serum } from '@core'
import { atFloor, makeData, makeGameState, makeMonster } from '@core/testing'
import { implantSharePercent, implantTeam } from './implant'

const data = makeData()
const withImplant = (changes: Partial<typeof data.config.implant>): typeof data => ({
  ...data,
  config: { ...data.config, implant: { ...data.config.implant, ...changes } }
})

const common: Serum = {
  tierId: 'common',
  effects: [{ kind: 'flatStat', stat: 'hp', amount: toBig(8) }]
}
const rare: Serum = {
  tierId: 'rare',
  effects: [
    { kind: 'flatStat', stat: 'attack', amount: toBig(25) },
    { kind: 'flatStat', stat: 'speed', amount: toBig(20) }
  ]
}
const mutagen: Serum = {
  tierId: 'mutagen',
  effects: [{ kind: 'hookEffect', effectId: 'hardening', levels: 1 }]
}

const town = (party: Monster[], money = 1e6): GameState => ({
  ...makeGameState({ seed: 1, party }),
  money: toBig(money),
  lab: { stock: [common, rare], restockDay: 10 }
})

const team = new Set(['a'])

describe('implantTeam', () => {
  it('cấy huyết thanh tổng cao nhất tới khi tỉ lệ dưới minChance', () => {
    const gameData = withImplant({ baseChance: 100, maxFails: 100 })
    const { state, count } = implantTeam(gameData, town([makeMonster({ id: 'a' })]), team)
    // 100 × 0,9^n ≥ 50 với n = 0..6: 7 lần.
    expect(count.succeeded + count.failed).toBe(7)
    const monster = state.party[0]
    expect(monster.implantAttempts).toBe(7)
    expect(monster.implantBonusStats.attack.toNumber()).toBe(25 * (count.succeeded - count.failed))
    expect(monster.implantBonusStats.hp.toNumber()).toBe(0)
  })

  it('không liều mạng: dừng khi lần thất bại kế tiếp sẽ mất quái', () => {
    const gameData = withImplant({ baseChance: 60, chanceFalloff: 1 })
    const { state, count } = implantTeam(gameData, town([makeMonster({ id: 'a' })]), team)
    expect(count.failed).toBe(2)
    expect(state.party[0].implantFails).toBe(2)
    // Tỉ lệ dưới minChance thì không cấy.
    const low = withImplant({ baseChance: 40 })
    expect(implantTeam(low, town([makeMonster({ id: 'a' })]), team).count).toEqual({
      succeeded: 0,
      failed: 0,
      effectSerums: 0
    })
  })

  it('tỉ trọng: lượng cấy / (gốc loài + gen × geneWeight)', () => {
    const plain = makeMonster({ id: 'a' })
    expect(implantSharePercent(data, town([plain]), team)).toBe(0)
    const implanted = makeMonster({
      id: 'a',
      implantBonusStats: { hp: 6, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }
    })
    expect(implantSharePercent(data, town([implanted]), team)).toBeGreaterThan(0)
  })

  it('ngân sách cả lượt: tổng giá ≤ spendFraction tiền lúc đến; bỏ qua bậc rẻ hơn minTierPrice', () => {
    // 30% của 7.000 = 2.100: một lần rare (2.000), còn 100 không đủ món nào.
    const { state, count } = implantTeam(data, town([makeMonster({ id: 'a' })], 7000), team)
    expect(count.succeeded + count.failed).toBe(1)
    expect(state.money.toNumber()).toBe(5000)
    // 30% của 6.000 = 1.800: không đủ rare; common (giá gốc 300 < minTierPrice) không đáng một lượt cấy.
    const cheap = implantTeam(data, town([makeMonster({ id: 'a' })], 6000), team)
    expect(cheap.count.succeeded + cheap.count.failed).toBe(0)
  })

  it('cấy huyết thanh hiệu ứng trước tới khi đủ effectLevelsWanted cấp dương, rồi cộng chỉ số', () => {
    const gameData = withImplant({ baseChance: 100, chanceFalloff: 1, maxFails: 100 })
    const state = {
      ...town([makeMonster({ id: 'a' })], 1e7),
      lab: { stock: [rare, mutagen], restockDay: 10 }
    }
    const { state: next, count } = implantTeam(gameData, state, team)
    expect(next.party[0].implantEffects).toEqual({ hardening: 3 })
    expect(count.effectSerums).toBe(3)
    expect(next.party[0].implantBonusStats.attack.toNumber()).toBeGreaterThan(0)
  })

  it('bỏ qua khi quá đắt hoặc ngoài thị trấn', () => {
    const poor = town([makeMonster({ id: 'a' })], 100)
    expect(implantTeam(data, poor, team).state).toBe(poor)
    const away = atFloor(town([makeMonster({ id: 'a' })]), 1)
    expect(implantTeam(data, away, team).state).toBe(away)
  })
})
