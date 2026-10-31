// Cụm 8 (docs/rules/pokemon-moves.md mục "Đồ cầm"): lấy / bỏ món (Knock Off, Thief) trả lại hết
// trận, tráo món (Trick), ăn berry của mục tiêu (Bug Bite), Recycle, Fling theo flingPower và bỏ món,
// Natural Gift đổi hệ theo berry, Embargo tắt món, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import {
  dataIssuesAfter,
  defined,
  makeArena,
  makeBattleState,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type { BattleCommand, EquippedItem, GameState, Item, Monster, Skill } from '../model'
import { expectedDamage } from './damage'

const skill = (id: string, fields: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...fields
})

const SKILLS: Skill[] = [
  skill('knock', { spell: { onTarget: [{ do: 'takeItems', from: 'other' }] } }),
  skill('steal', {
    spell: {
      onTarget: [
        {
          do: 'takeItems',
          from: 'other',
          to: 'self',
          if: [{ if: 'holdsItem', who: 'self', value: false }]
        }
      ]
    }
  }),
  skill('swap', {
    category: 'status',
    power: 0,
    spell: { after: [{ do: 'swapItems', with: 'other' }] }
  }),
  skill('bite', { spell: { onTarget: [{ do: 'eatItems', from: 'other', tags: ['berry'] }] } }),
  skill('throw', {
    powerFormula: {
      type: 'linear',
      value: { of: 'heldItem', field: 'flingPower', who: 'self' },
      times: 1
    },
    spell: {
      after: [
        { do: 'takeItems', from: 'self', firstWith: 'flingPower', consume: true, flingTo: 'other' }
      ]
    }
  }),
  // Fling thật: cần cầm món có tác dụng (Magic Room / Embargo / Klutz thì thất bại).
  skill('throwUsable', {
    power: 50,
    spell: {
      requires: [{ if: 'holdsItem', who: 'self', value: true, usable: true }],
      after: [{ do: 'takeItems', from: 'self', firstWith: 'flingPower', consume: true }]
    }
  }),
  skill('gift', {
    elementFromHeldItem: true,
    powerFormula: {
      type: 'linear',
      value: { of: 'heldItem', field: 'naturalGiftPower', who: 'self' },
      times: 1
    }
  })
]
const ITEMS: Item[] = [
  { id: 'rock', category: 'held', price: 10, hooks: [], persistent: true, flingPower: 100 },
  { id: 'band', category: 'held', price: 10, hooks: [], persistent: true },
  {
    id: 'flameOrb',
    category: 'held',
    price: 10,
    hooks: [],
    persistent: true,
    flingPower: 30,
    flingStatusId: 'burn'
  },
  {
    id: 'healBerry',
    category: 'held',
    price: 10,
    tags: ['berry'],
    naturalGift: { power: 80, elementId: 'fire' },
    hooks: [
      {
        type: 'trigger',
        params: {
          on: 'turnEnd',
          scope: 'self',
          effects: [{ do: 'heal', to: 'self', amount: { flat: 5 } }]
        }
      }
    ]
  }
]

const raw = makeRawData()
raw.skills.push(...SKILLS)
raw.items.push(...ITEMS)
// Kiểu Embargo: món của quái không tác dụng.
raw.statuses.push({
  id: 'noItems',
  kind: 'debuff',
  battleOnly: true,
  disablesItems: true,
  hooks: []
})
raw.config.ai.statusWeights.noItems = 0.1
const data = createGameData(withFixtureText(raw))

const stack = (itemId: string): EquippedItem => ({ storage: 'stack', itemId })
const fighter = (id: string, equipment: EquippedItem[] = [], skillIds = ['idle']): Monster =>
  makeMonster({
    id,
    equipment,
    skillIds,
    genes: toBigStats({ ...uniformStats(20), hp: '1e6' })
  })
const cast = (skillId: string): BattleCommand => ({ slot: 0, kind: 'skill', skillId, target: 0 })
const run = (state: GameState, skillId: string): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands: [cast(skillId)] })
const enemyOf = (state: GameState): Monster => defined(defined(state.battle).enemies[0])

describe('lấy / tráo món, trả lại hết trận', () => {
  it('Knock Off bỏ món của mục tiêu; hết trận (chạy trốn thành công) trả lại', () => {
    const state = makeBattleState([fighter('a', [], ['knock'])], [fighter('e', [stack('rock')])])
    const after = run(state, 'knock')
    expect(enemyOf(after).equipment).toEqual([])
    expect(defined(after.battle).itemLedger?.e).toEqual([stack('rock')])
  })

  it('Thief: quái dùng không cầm gì thì lấy món của mục tiêu', () => {
    const state = makeBattleState([fighter('a', [], ['steal'])], [fighter('e', [stack('rock')])])
    const after = run(state, 'steal')
    expect(defined(after.party[0]).equipment).toEqual([stack('rock')])
    expect(enemyOf(after).equipment).toEqual([])
    const holding = makeBattleState(
      [fighter('a', [stack('healBerry')], ['steal'])],
      [fighter('e', [stack('rock')])]
    )
    expect(enemyOf(run(holding, 'steal')).equipment).toEqual([stack('rock')])
  })

  it('Trick tráo toàn bộ món', () => {
    const state = makeBattleState(
      [fighter('a', [stack('band')], ['swap'])],
      [fighter('e', [stack('rock')])]
    )
    const after = run(state, 'swap')
    expect(defined(after.party[0]).equipment).toEqual([stack('rock')])
    expect(enemyOf(after).equipment).toEqual([stack('band')])
  })

  it('Bug Bite: ăn berry của mục tiêu (mất hẳn), nhận hiệu ứng', () => {
    const state = makeBattleState(
      [fighter('a', [], ['bite'])],
      [fighter('e', [stack('healBerry')])]
    )
    const after = run(state, 'bite')
    expect(enemyOf(after).equipment).toEqual([])
    expect(defined(after.party[0]).equipment).toEqual([])
    // Ăn berry của mục tiêu cũng tính là đã ăn berry (Belch), như Pokémon.
    expect(defined(after.battle).records.a?.berriesEaten).toBe(1)
  })
})

describe('Fling, Natural Gift', () => {
  it('Fling: power = flingPower của món, ném rồi mất (không trả lại)', () => {
    const state = makeBattleState([fighter('a', [stack('rock')], ['throw'])], [fighter('e')])
    const after = run(state, 'throw')
    expect(defined(after.party[0]).equipment).toEqual([])
    expect(defined(after.battle).itemLedger?.a).toBeUndefined()
  })

  it('Natural Gift: hệ và power theo berry', () => {
    const attacker = fighter('a', [stack('healBerry')])
    const grass = makeMonster({
      id: 'd',
      elementIds: ['grass'],
      genes: toBigStats({ ...uniformStats(20), hp: '1e9' })
    })
    const plain = makeMonster({
      id: 'p',
      elementIds: ['normal'],
      genes: toBigStats({ ...uniformStats(20), hp: '1e9' })
    })
    const vs = (defender: Monster): number =>
      expectedDamage({
        data,
        attacker,
        defender,
        skill: data.skills.gift,
        spread: false,
        arena: makeArena()
      }).toNumber()
    // Fixture: lửa khắc cỏ ×2.
    expect(vs(grass)).toBeCloseTo(2 * vs(plain), -1)
  })
})

describe('holdsItem usable: món bị tắt coi như không cầm', () => {
  it('món bị tắt thì skill thất bại, giữ món; món có tác dụng thì ném được', () => {
    const blocked = fighter('a', [stack('rock')], ['throwUsable'])
    blocked.statuses = [{ statusId: 'noItems', turnsLeft: 3 }]
    const failed = run(makeBattleState([blocked], [fighter('e')]), 'throwUsable')
    expect(defined(failed.party[0]).equipment).toEqual([stack('rock')])
    expect(defined(failed.battle).log.some((event) => event.type === 'damage')).toBe(false)
    const free = fighter('a', [stack('rock')], ['throwUsable'])
    const thrown = run(makeBattleState([free], [fighter('e')]), 'throwUsable')
    expect(defined(thrown.party[0]).equipment).toEqual([])
  })
})

describe('Fling: hiệu ứng riêng của món ném', () => {
  it('món có flingStatusId gây trạng thái lên mục tiêu', () => {
    const state = makeBattleState([fighter('a', [stack('flameOrb')], ['throw'])], [fighter('e')])
    const after = run(state, 'throw')
    expect(enemyOf(after).statuses.map((status) => status.statusId)).toContain('burn')
  })
})

describe('kiểm tra dữ liệu', () => {
  it('hiệu ứng / trường món sai', () => {
    const issues = dataIssuesAfter(
      (r) => {
        r.skills.push(
          skill('bad', {
            spell: {
              after: [
                { do: 'takeItems', from: 'other', firstWith: 'gold' },
                { do: 'eatItems', from: 'other', tags: [] }
              ]
            }
          })
        )
        r.items.push({
          id: 'badRock',
          category: 'held',
          price: 1,
          hooks: [],
          flingPower: 0,
          naturalGift: { power: 10, elementId: 'lava' }
        })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toMatch(/firstWith/)
    expect(issues).toMatch(/tags phải là danh sách không rỗng/)
    expect(issues).toMatch(/flingPower/)
    expect(issues).toMatch(/naturalGift\.elementId/)
  })
})
