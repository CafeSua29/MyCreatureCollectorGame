// Log ngoài trận (docs/rules/game-log.md): gameReducer xóa log trước mỗi action đổi state, action
// không đổi gì giữ log cũ, kiểm tra save, lưu / đọc Decimal, migrate v97 → v98.

import { describe, expect, it } from 'vitest'
import { cloneData, toBig } from '../shared'
import { makeData, makeGameState, makeMonster } from '../testing'
import type { GameLogEntry, GameState } from '../model'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'

const data = makeData()

const oldEntry: GameLogEntry = { type: 'gachaPulled', eggIds: ['m9'] }

const town = (log: GameLogEntry[] = [oldEntry]): GameState => ({
  ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
  log
})

describe('gameReducer', () => {
  it('action đổi state: log cũ bị xóa, chỉ còn log của action này', () => {
    const next = gameReducer(data, town(), { type: 'travel', to: { type: 'floor', floor: 1 } })
    expect(next.location).toEqual({ type: 'floor', floor: 1 })
    expect(next.log).not.toContainEqual(oldEntry)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('action không đổi gì (đi tới chỗ đang đứng): giữ nguyên state, kể cả log', () => {
    const state = town()
    expect(gameReducer(data, state, { type: 'travel', to: { type: 'town' } })).toBe(state)
  })

  it('action lỗi: ném lỗi, state cũ (cả log) không đổi', () => {
    const state = town()
    const before = cloneData(state)
    expect(() => gameReducer(data, state, { type: 'leaveBattle' })).toThrow()
    expect(state).toEqual(before)
  })

  it('log rỗng: không tạo object mới chỉ để xóa log', () => {
    const state = town([])
    expect(gameReducer(data, state, { type: 'travel', to: { type: 'town' } })).toBe(state)
  })
})

describe('save', () => {
  const issues = (log: unknown): string =>
    // Ép kiểu: save sai cố ý.
    validateGameState(data, { ...town(), log } as unknown as GameState).join('\n')

  it('kiểm tra: không phải danh sách, loại lạ, thiếu trường, Decimal sai', () => {
    expect(issues(null)).toMatch(/log phải là danh sách/)
    expect(issues([{ type: 'boom' }])).toMatch(/log\[0\]: loại dòng log lạ "boom"/)
    expect(issues([null])).toMatch(/log\[0\]: loại dòng log lạ/)
    expect(issues([{ type: 'crafted', station: 'alchemy' }])).toMatch(
      /log\[0\]: thiếu recipeId[\s\S]*log\[0\]: thiếu failures/
    )
    expect(issues([{ type: 'moneyGained', amount: 5 }])).toMatch(/log\[0\]\.amount/)
    expect(issues([])).toBe('')
    expect(issues([oldEntry, { type: 'partyHealed' }])).toBe('')
  })

  it('lưu / đọc giữ Decimal cực lớn trong log', () => {
    const state = town([
      { type: 'moneyLost', amount: toBig('1e300') },
      { type: 'beastTideRetreated', moneyLost: toBig('1e9999'), shopClosedUntilDay: 3 }
    ])
    const loaded = migrateState(JSON.parse(JSON.stringify(serializeState(state))), data)
    expect(loaded.log).toEqual(state.log)
    expect(validateGameState(data, loaded)).toEqual([])
  })

  it('migrate v97 → v98: bỏ các chỗ ghi kết quả rời rạc, log rỗng', () => {
    const raw = serializeState(town()) as Record<string, unknown>
    const { log: _log, ...rest } = raw
    const field = (key: string): Record<string, unknown> => ({
      ...(raw[key] as Record<string, unknown>)
    })
    const old = {
      ...rest,
      version: 97,
      dayEvents: [{ type: 'beastTideWarning', day: 3 }],
      gathering: { lastResult: null },
      events: { ...field('events'), log: [{ type: 'partyHealed' }] },
      safari: { ...field('safari'), log: [] },
      teamPresets: { ...field('teamPresets'), lastMissing: null },
      alchemy: { ...field('alchemy'), lastCraft: null },
      smithing: { ...field('smithing'), lastCraft: null },
      cooking: { ...field('cooking'), lastCraft: null }
    }
    const migrated = migrateState(JSON.parse(JSON.stringify(old)), data)
    expect(migrated.log).toEqual([])
    for (const key of ['dayEvents', 'gathering']) expect(migrated).not.toHaveProperty(key)
    expect(migrated.events).not.toHaveProperty('log')
    expect(migrated.safari).not.toHaveProperty('log')
    expect(migrated.teamPresets).not.toHaveProperty('lastMissing')
    for (const station of [migrated.alchemy, migrated.smithing, migrated.cooking]) {
      expect(station).not.toHaveProperty('lastCraft')
    }
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
