// Khế ước (docs/rules/tamer.md mục "Khế ước"): bước riêng ở thị trấn; thành công (cảnh giới, mốc lý
// lịch), thất bại (mất thân mật, phản phệ, bỏ trốn), giới hạn level, số ô, đang bị thương, giải trừ,
// bản mệnh cần khế ước.

import { describe, expect, it } from 'vitest'
import { gameReducer, validateGameState } from '../game'
import { createGameData } from '../gameData'
import { toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeGameState,
  makeMonster,
  makeRawData,
  type MonsterOverrides
} from '../testing'
import type { ContractConfig, GameData, GameState, Monster } from '../model'
import { contractOutcome } from './contractActions'

/** Dữ liệu fixture với tỉ lệ khế ước cố định `chance` (min = max) và % bỏ trốn `escape`. */
function contractData(chance: number, escape = 0, extra: Partial<ContractConfig> = {}): GameData {
  const raw = makeRawData()
  const contract = raw.config.tamer.contract
  raw.config.tamer.contract = {
    ...contract,
    ...extra,
    chance: { ...contract.chance, min: chance, max: chance },
    failure: { ...contract.failure, escapeChance: escape }
  }
  return createGameData(raw)
}

const sure = contractData(100)
const fail = contractData(0)
const flee = contractData(0, 100)

const fresh = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    contractRealm: null,
    history: {
      origin: { kind: 'wild', ballItemId: 'ball' },
      metDay: 0,
      metFloor: 1,
      metLevel: 1,
      milestones: []
    },
    ...overrides
  })

/** Thị trấn, ngày 2 (giờ 54), đội: quái khởi đầu đã khế ước + quái mới bắt chưa khế ước. */
const town = (extra: Monster[] = [fresh('b')], overrides: Partial<GameState> = {}): GameState => ({
  // createGameState khế ước cả đội, nên đặt quái chưa khế ước sau khi tạo state.
  ...makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })], nextMonsterId: 100, time: 54 }),
  ...overrides,
  party: [makeMonster({ id: 'a' }), ...extra]
})

const contract = (data: GameData, state: GameState, monsterId = 'b'): GameState =>
  gameReducer(data, state, { type: 'formContract', monsterId })

const find = (state: GameState, id: string): Monster | undefined =>
  [...state.party, ...state.storage].find((m) => m.id === id)

describe('khế ước thành công', () => {
  it('cảnh giới khế ước = cảnh giới ngự thú sư, mốc lý lịch contracted; save hợp lệ', () => {
    const state = { ...town(), tamer: { ...town().tamer, realm: 2 } }
    const after = contract(sure, state)
    const monster = defined(find(after, 'b'))
    expect(monster.contractRealm).toBe(2)
    expect(monster.history?.milestones.at(-1)).toEqual({ day: 2, kind: 'contracted', realm: 2 })
    expect(contractOutcome(state, after, 'b')).toBe('success')
    expect(validateGameState(sure, after)).toEqual([])
  })

  it('quái trong kho khế ước được; cùng state cho cùng kết quả', () => {
    const state = { ...town([]), storage: [fresh('s')] }
    expect(defined(find(contract(sure, state, 's'), 's')).contractRealm).toBe(0)
    const random = contractData(50)
    expect(contract(random, town())).toEqual(contract(random, town()))
  })
})

describe('khế ước thất bại (phản phệ)', () => {
  it('quái − 30 thân mật, ngự thú sư bị thương 3 ngày (tới hết ngày 4), quái ở lại', () => {
    const state = town([fresh('b', { affinity: 100 })])
    const after = contract(fail, state)
    expect(defined(find(after, 'b'))).toMatchObject({ contractRealm: null, affinity: 70 })
    expect(after.tamer.woundUntilDay).toBe(4)
    expect(contractOutcome(state, after, 'b')).toBe('failed')
    // Đang bị thương: không khế ước được, không đột phá được.
    expectActionError(() => contract(sure, after), 'tamerWounded', { untilDay: 4 })
    expect(contract(sure, { ...after, time: 5 * 24 }).party[1].contractRealm).toBe(0)
  })

  it('vết thương cũ dài hơn không bị rút ngắn', () => {
    const state = town()
    const wounded = { ...state, tamer: { ...state.tamer, woundUntilDay: 30 } }
    // Đang bị thương thì không khế ước được; thử với vết thương đã hết hôm qua.
    expectActionError(() => contract(fail, wounded), 'tamerWounded')
    const healed = { ...state, tamer: { ...state.tamer, woundUntilDay: 1 } }
    expect(contract(fail, healed).tamer.woundUntilDay).toBe(4)
  })

  it('bỏ trốn: rời đội, trả đồ đang lắp về túi', () => {
    const state = town([fresh('b', { equipment: [{ storage: 'stack', itemId: 'ball' }] })])
    const after = contract(flee, state)
    expect(find(after, 'b')).toBeUndefined()
    expect(after.inventory.stacks.ball).toBe(1)
    expect(contractOutcome(state, after, 'b')).toBe('escaped')
  })

  it('quái duy nhất trong đội không bỏ trốn; thân mật tối đa không bỏ trốn', () => {
    const alone = { ...town([]), party: [fresh('b')] }
    expect(find(contract(flee, alone), 'b')).toBeDefined()
    const loyal = town([fresh('b', { affinity: 255 })])
    expect(find(contract(flee, loyal), 'b')).toBeDefined()
  })
})

describe('khế ước báo lỗi, state giữ nguyên', () => {
  it('đã khế ước, quá giới hạn level (cần cảnh giới), hết ô', () => {
    expectActionError(() => contract(sure, town(), 'a'), 'alreadyContracted', { monsterId: 'a' })
    const high = town([fresh('b', { level: 101 })])
    expectActionError(() => contract(sure, high), 'tamerRealmTooLow', {
      monsterId: 'b',
      needRealm: 1
    })
    // Giới hạn level đúng biên: được.
    expect(
      defined(find(contract(sure, town([fresh('b', { level: 100 })])), 'b')).contractRealm
    ).toBe(0)
    const tight = contractData(100, 0, { slotsBase: 1, slotsPerRealm: 0 })
    expectActionError(() => contract(tight, town()), 'contractSlotsFull', { max: 1 })
  })

  it('cảnh giới cao hơn thì nhiều ô hơn (8 + 4 × cảnh giới)', () => {
    const many = Array.from({ length: 7 }, (_, i) => makeMonster({ id: `c${i}` }))
    const full = { ...town(), storage: many }
    expectActionError(() => contract(sure, full), 'contractSlotsFull', { max: 8 })
    const higher = { ...full, tamer: { ...full.tamer, realm: 1 } }
    expect(defined(find(contract(sure, higher), 'b')).contractRealm).toBe(1)
  })

  it('không ở thị trấn, đang đánh, quái lạ, quái đang bận', () => {
    const state = town()
    expectActionError(
      () => contract(sure, { ...state, location: { type: 'floor', floor: 1 } }),
      'notInTown'
    )
    expectActionError(() => contract(sure, state, 'zz'), 'monsterNotOwned')
    const busy = {
      ...town([]),
      storage: [fresh('s', { assignment: { kind: 'expedition', id: 'x1' } })]
    }
    expectActionError(() => contract(sure, busy, 's'), 'monsterBusy')
  })
})

describe('giải trừ khế ước', () => {
  const dissolve = (state: GameState, monsterId = 'a'): GameState =>
    gameReducer(sure, state, { type: 'dissolveContract', monsterId })

  it('hết khế ước (mất tâm linh tương thông), mất 50 thân mật (không âm), phản phệ 2 ngày', () => {
    const state = town([], { money: toBig(0) })
    const withAffinity = {
      ...state,
      party: [{ ...state.party[0], affinity: 80, contractDays: 40 }]
    }
    const after = dissolve(withAffinity)
    expect(after.party[0]).toMatchObject({ contractRealm: null, contractDays: 0, affinity: 30 })
    // Phản phệ: ngự thú sư bị thương 2 ngày (ngày 2 → hết ngày 3).
    expect(after.tamer.woundUntilDay).toBe(3)
    expect(
      dissolve({ ...state, party: [{ ...state.party[0], affinity: 10 }] }).party[0].affinity
    ).toBe(0)
  })

  it('báo lỗi: chưa khế ước, bản mệnh', () => {
    expectActionError(() => dissolve(town(), 'b'), 'notContracted', { monsterId: 'b' })
    const state = town([])
    const bond = { ...state, party: [{ ...state.party[0], bond: true }] }
    expectActionError(() => dissolve(bond), 'isBondBeast')
  })

  it('kết bản mệnh cần quái đã khế ước', () => {
    const state = town([fresh('b', { affinity: 255 })])
    expectActionError(
      () => gameReducer(sure, state, { type: 'bindBond', monsterId: 'b' }),
      'notContracted'
    )
  })
})
