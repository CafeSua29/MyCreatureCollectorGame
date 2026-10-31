import { describe, expect, it } from 'vitest'
import { makeData, makeGameState, makeInventory, makeMonster } from '@core/testing'
import { toBig, type BookStack, type GameState, type Monster } from '@core'
import { buySkillBooks, teachSkillBooks } from './books'

// Fixture: strike 50, flurry 20 (thường), blast 50 (lửa), growl 0; pine (cỏ) không học được blast.
const data = makeData()

function withBooks(party: Monster[], books: BookStack[]): GameState {
  return {
    ...makeGameState({ seed: 1, party }),
    inventory: makeInventory({}, [], [], books)
  }
}

describe('teachSkillBooks', () => {
  it('Bí kíp dạy quái đội mẫu đầu tiên hợp lệ; còn ô thì học, quái ngoài đội mẫu bỏ qua', () => {
    const state = withBooks(
      [makeMonster({ id: 'egg' }), makeMonster({ id: 'm1' }), makeMonster({ id: 'm2' })],
      [{ skillId: 'flurry', reusable: false, count: 1 }]
    )
    const { state: next, used } = teachSkillBooks(data, state, new Set(['m1', 'm2']))
    expect(used).toBe(1)
    expect(next.party.map((m) => m.skillIds)).toEqual([
      ['strike'],
      ['strike', 'flurry'],
      ['strike']
    ])
    expect(next.inventory.books).toEqual([])
  })

  it('Chân kinh dạy mọi quái hợp; đủ ô chỉ khi mạnh hơn skill yếu nhất; không tương thích bỏ qua', () => {
    const full = makeMonster({ id: 'full', skillIds: ['strike', 'growl', 'quick', 'idle'] })
    const strong = makeMonster({ id: 'strong', skillIds: ['strike', 'blast', 'sap', 'wave'] })
    const pine = makeMonster({ id: 'pine', speciesId: 'pine', baseSpeciesId: 'pine' })
    const state = withBooks(
      [full, strong, pine],
      [
        { skillId: 'flurry', reusable: true, count: 1 },
        { skillId: 'blast', reusable: true, count: 1 }
      ]
    )
    const { state: next, used } = teachSkillBooks(data, state, new Set(['full', 'strong', 'pine']))
    // flurry (20): full (yếu nhất 0) vào chờ học, strong (yếu nhất 40) bỏ qua, pine còn ô học luôn.
    // blast (50): full chờ học; strong đã biết; pine không tương thích.
    expect(used).toBe(3)
    expect(next.party[0].pendingSkillIds).toEqual(['flurry', 'blast'])
    expect(next.party[1].pendingSkillIds).toEqual([])
    expect(next.party[2].skillIds).toEqual(['strike', 'flurry'])
    expect(next.inventory.books).toHaveLength(2)
  })

  it('không có sách thì giữ nguyên', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'm1' })] })
    expect(teachSkillBooks(data, state, new Set(['m1']))).toEqual({ state, used: 0 })
  })
})

describe('buySkillBooks', () => {
  it('mua Bí kíp trên kệ mà đội mẫu nên học, đủ tiền; bỏ qua sách đã biết / thiếu tiền', () => {
    const base = withBooks([makeMonster({ id: 'm1' })], [])
    const stock: GameState['shop']['stock'] = [
      { storage: 'book', skillId: 'strike', reusable: false },
      { storage: 'book', skillId: 'flurry', reusable: false },
      { storage: 'stack', itemId: 'potion' }
    ]
    // flurry: (200 + 20 × 5) × 5 (legendary) = 1500.
    const rich = { ...base, money: toBig(1500), shop: { stock } }
    const { state, bought } = buySkillBooks(data, rich, new Set(['m1']))
    expect(bought).toBe(1)
    expect(state.inventory.books).toEqual([{ skillId: 'flurry', reusable: false, count: 1 }])
    expect(state.money).toEqual(toBig(0))
    const poor = { ...rich, money: toBig(1499) }
    expect(buySkillBooks(data, poor, new Set(['m1'])).bought).toBe(0)
  })
})
