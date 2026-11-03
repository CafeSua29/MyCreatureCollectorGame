// Phần event trong save (docs/rules/events.md): lưu / đọc lại đủ (kể cả Decimal trong log), kiểm tra
// từng phần của GameState.events và BattleState.special, migrate v47 → v48.

import { describe, expect, it } from 'vitest'
import { toBig } from '../shared'
import {
  makeEquipment,
  makeEventData,
  makeGameState,
  makeMonster,
  withPendingEvent
} from '../testing'
import type { GameState } from '../model'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'

const data = makeEventData()

const town = (): GameState =>
  makeGameState({ seed: 3, party: [makeMonster({ id: 'h' })], highestFloor: 2 })

/** State có đủ các phần của event. */
function fullState(): GameState {
  const state = town()
  return {
    ...state,
    nextItemId: 10,
    log: [{ type: 'moneyGained', amount: toBig('1e50') }],
    events: {
      ...state.events,
      modifiers: [
        { modifierId: 'lucky', battlesLeft: 2 },
        { modifierId: 'sale', battlesLeft: null }
      ],
      chains: [{ chainId: 'hunt', eventId: 'cave', battlesLeft: 1, floor: 2 }],
      tempShop: {
        stock: [
          { entry: { storage: 'stack', itemId: 'potion' }, remaining: null },
          { entry: { storage: 'instance', instance: makeEquipment({ id: 'e5' }) }, remaining: 1 }
        ],
        priceMultiplier: 2.5,
        floor: null
      },
      beastTide: { phase: 'warned', day: 33 },
      shopClosedUntilDay: 4
    }
  }
}

/** Lỗi save sau khi sửa phần event. */
const issuesWith = (patch: Partial<GameState['events']>, base: GameState = town()): string[] =>
  validateGameState(data, { ...base, events: { ...base.events, ...patch } })

describe('event trong save', () => {
  it('state đủ phần event hợp lệ, lưu / đọc lại giữ nguyên (Decimal trong log)', () => {
    const state = fullState()
    expect(validateGameState(data, state)).toEqual([])
    expect(migrateState(serializeState(state), data)).toEqual(state)
  })

  it('event chờ: event tồn tại, chainId chỉ với bước chuỗi, không đồng thời trong trận', () => {
    expect(issuesWith({ pending: { eventId: 'nope', floor: null, chainId: null } })).toEqual([
      expect.stringContaining('event không tồn tại "nope"')
    ])
    expect(issuesWith({ pending: { eventId: 'treasure', floor: null, chainId: 'hunt' } })).toEqual([
      expect.stringContaining('chỉ bước của chuỗi')
    ])
    expect(issuesWith({ pending: { eventId: 'treasure', floor: 9, chainId: null } })).toEqual([
      expect.stringContaining('events.pending.floor phải ≤ tầng cao nhất')
    ])
    expect(validateGameState(data, withPendingEvent(town(), 'cave', { chainId: 'hunt' }))).toEqual(
      []
    )
  })

  it('modifier: tồn tại, không trùng, thời hạn khớp loại', () => {
    expect(
      issuesWith({
        modifiers: [
          { modifierId: 'lucky', battlesLeft: 1 },
          { modifierId: 'lucky', battlesLeft: 1 },
          { modifierId: 'sale', battlesLeft: 3 },
          { modifierId: 'lucky2', battlesLeft: 1 }
        ]
      })
    ).toEqual([
      expect.stringContaining('modifier "lucky" bị trùng'),
      expect.stringContaining('events.modifiers[2].battlesLeft phải là null'),
      expect.stringContaining('modifier không tồn tại "lucky2"')
    ])
    expect(issuesWith({ modifiers: [{ modifierId: 'lucky', battlesLeft: null }] })).toEqual([
      expect.stringContaining('battlesLeft')
    ])
  })

  it('chuỗi, cửa hàng tạm, trận event, thú triều, cửa hàng đóng', () => {
    expect(
      issuesWith({ chains: [{ chainId: 'x', eventId: 'treasure', battlesLeft: -1, floor: 0 }] })
    ).toHaveLength(3)
    expect(
      issuesWith({
        tempShop: {
          stock: [{ entry: { storage: 'stack', itemId: 'potion' }, remaining: 0 }],
          priceMultiplier: -1,
          floor: null
        }
      })
    ).toHaveLength(2)
    expect(
      issuesWith({
        battle: {
          eventId: 'bandits',
          optionId: 'fight',
          outcomeIndex: 0,
          resultIndex: 0,
          chainId: null
        }
      })
    ).toEqual([expect.stringContaining('phải đang trong trận của event đó')])
    expect(
      issuesWith({
        battle: {
          eventId: 'bandits',
          optionId: 'pay',
          outcomeIndex: 0,
          resultIndex: 0,
          chainId: null
        }
      })
    ).toContainEqual(expect.stringContaining('không trỏ tới kết quả startBattle'))
    expect(
      issuesWith({ beastTide: { phase: 'active', cleared: 3, waves: 2, kingAfter: 3 } })
    ).toEqual([
      expect.stringContaining('cleared phải ≤ waves'),
      expect.stringContaining('kingAfter phải ≤ waves')
    ])
    expect(issuesWith({ beastTide: { phase: 'scheduled', day: 40 } })).toEqual([])
    const onFloor = { ...town(), location: { type: 'floor' as const, floor: 1 } }
    expect(
      issuesWith({ beastTide: { phase: 'active', cleared: 0, waves: 2, kingAfter: 1 } }, onFloor)
    ).toEqual([expect.stringContaining('phải ở thị trấn')])
    expect(issuesWith({ shopClosedUntilDay: -1 })).toHaveLength(1)
  })

  it('id món trang bị của cửa hàng tạm không trùng với túi', () => {
    const state = fullState()
    const duplicated = {
      ...state,
      inventory: { ...state.inventory, equipment: [makeEquipment({ id: 'e5' })] }
    }
    expect(validateGameState(data, duplicated)).toContainEqual(expect.stringContaining('"e5"'))
  })

  it('battle.special: trận event / đợt thú triều hợp lệ; đợt phải là đợt kế tiếp', () => {
    const floor = makeGameState({
      seed: 4,
      party: [
        makeMonster({
          id: 'h',
          level: 50,
          genes: { hp: 500, attack: 500, defense: 500, spAttack: 500, spDefense: 500, speed: 500 },
          skillIds: ['strike']
        })
      ],
      location: { type: 'floor', floor: 1 },
      highestFloor: 2
    })
    const opened = gameReducer(data, withPendingEvent(floor, 'bandits', { floor: 1 }), {
      type: 'chooseEventOption',
      optionId: 'fight'
    })
    expect(validateGameState(data, opened)).toEqual([])
    const tide: GameState = {
      ...town(),
      events: {
        ...town().events,
        beastTide: { phase: 'active', cleared: 0, waves: 2, kingAfter: 1 }
      }
    }
    const wave = gameReducer(data, tide, { type: 'defendTown' })
    expect(validateGameState(data, wave)).toEqual([])
    const wrongWave = {
      ...wave,
      battle: wave.battle && {
        ...wave.battle,
        special: { kind: 'beastTide' as const, wave: 2, waves: 2, king: false }
      }
    }
    expect(validateGameState(data, wrongWave)).toEqual([expect.stringContaining('đợt kế tiếp')])
    // Thú vương khi chưa đủ mốc: không khớp tiến độ.
    const earlyKing = {
      ...wave,
      battle: wave.battle && {
        ...wave.battle,
        special: { kind: 'beastTide' as const, wave: 1, waves: 2, king: true }
      }
    }
    expect(validateGameState(data, earlyKing)).toEqual([expect.stringContaining('không khớp')])
  })

  it('migrate v48 → v49: thú triều đang diễn ra có mốc thú vương = số đợt, đợt dở là đợt thường', () => {
    const tide: GameState = {
      ...town(),
      events: {
        ...town().events,
        beastTide: { phase: 'active', cleared: 0, waves: 2, kingAfter: 1 }
      }
    }
    const wave = gameReducer(data, tide, { type: 'defendTown' })
    const raw = serializeState(wave) as Record<string, unknown>
    const events = raw.events as Record<string, unknown>
    const battle = raw.battle as Record<string, unknown>
    const old = {
      ...raw,
      version: 48,
      events: { ...events, beastTide: { phase: 'active', cleared: 0, waves: 2 } },
      battle: { ...battle, special: { kind: 'beastTide', wave: 1, waves: 2 } }
    }
    const migrated = migrateState(old, data)
    expect(migrated.events.beastTide).toEqual({
      phase: 'active',
      cleared: 0,
      waves: 2,
      kingAfter: 2
    })
    expect(migrated.battle?.special).toEqual({ kind: 'beastTide', wave: 1, waves: 2, king: false })
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('migrate v47 → v48: không có gì của event, trận đang dở là trận thường', () => {
    const raw = serializeState(town()) as Record<string, unknown>
    const { events: _events, ...old } = raw
    const migrated = migrateState({ ...old, version: 47 }, data)
    expect(migrated.events).toEqual(town().events)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
