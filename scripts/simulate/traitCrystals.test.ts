import { describe, expect, it } from 'vitest'
import { addCrystals, getCrystalCount, toBig, type GameState, type Monster } from '@core'
import { atFloor, makeData, makeGameState, makeMonster } from '@core/testing'
import { tuneTeamTraits } from './traitCrystals'

const data = makeData()

function town(party: Monster[], overrides: Partial<GameState> = {}): GameState {
  return { ...makeGameState({ seed: 1, party }), money: toBig(1e6), ...overrides }
}

const team = new Set(['a'])

describe('tuneTeamTraits', () => {
  it('gỡ trait xấu của đội mẫu (extract rồi bán), không đụng quái ngoài đội mẫu', () => {
    const state = town([
      makeMonster({ id: 'a', traits: [{ id: 'cursed', level: 1 }] }),
      makeMonster({ id: 'b', traits: [{ id: 'cursed', level: 1 }] })
    ])
    const { state: next, count } = tuneTeamTraits(data, state, team)
    expect(next.party[0].traits).toEqual([])
    expect(next.party[1].traits).toEqual([{ id: 'cursed', level: 1 }])
    expect(getCrystalCount(next.inventory, { traitId: 'cursed', level: 1 })).toBe(0)
    expect(count.extracted).toBe(1)
  })

  it('cửa hàng đóng (thú triều): vẫn gỡ trait xấu, giữ tinh thể trong túi thay vì bán', () => {
    const base = town([makeMonster({ id: 'a', traits: [{ id: 'cursed', level: 1 }] })])
    const state = { ...base, events: { ...base.events, shopClosedUntilDay: 99 } }
    const { state: next } = tuneTeamTraits(data, state, team)
    expect(next.party[0].traits).toEqual([])
    expect(getCrystalCount(next.inventory, { traitId: 'cursed', level: 1 })).toBe(1)
  })

  it('inject tinh thể tốt trong túi: gộp cấp hoặc ô trống, bỏ qua tinh thể loại trừ', () => {
    let inventory = addCrystals(town([]).inventory, { traitId: 'regen', level: 2 }, 1)
    inventory = addCrystals(inventory, { traitId: 'fast', level: 1 }, 1)
    const monster = makeMonster({ id: 'a', traits: [{ id: 'slow', level: 1 }] })
    const { state: next, count } = tuneTeamTraits(data, town([monster], { inventory }), team)
    // slow bị gỡ trước (trait xấu) nên fast không còn loại trừ.
    expect(next.party[0].traits).toEqual([
      { id: 'regen', level: 2 },
      { id: 'fast', level: 1 }
    ])
    expect(count).toEqual({ extracted: 1, injected: 2, bought: 0 })
  })

  it('mua tinh thể tốt ở cửa hàng rồi inject khi đủ tiền; thiếu tiền thì bỏ qua', () => {
    const shop = { stock: [{ storage: 'crystal' as const, traitId: 'mighty', level: 1 }] }
    const monster = makeMonster({ id: 'a', traits: [] })
    const { state: next, count } = tuneTeamTraits(data, town([monster], { shop }), team)
    expect(next.party[0].traits).toEqual([{ id: 'mighty', level: 1 }])
    expect(count.bought).toBe(1)
    const poor = town([monster], { shop, money: toBig(10) })
    expect(tuneTeamTraits(data, poor, team).state).toBe(poor)
  })

  it('ngoài thị trấn: không làm gì', () => {
    const state = atFloor(town([makeMonster({ id: 'a', traits: [{ id: 'cursed', level: 1 }] })]), 1)
    expect(tuneTeamTraits(data, state, team).state).toBe(state)
  })
})
