// Ngự thú sư trong save (docs/rules/tamer.md): migrate v26 → v27, kiểm tra tamer, battle.tamers,
// contractRealm của quái người chơi / quái hoang, đọc / ghi EXP Decimal.

import { describe, expect, it } from 'vitest'
import { toBig } from '../shared'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { SAVE_VERSION } from './reducer'
import { validateGameState } from './validateGameState'
import { defined, makeBattleState, makeData, makeGameState, makeMonster } from '../testing'
import type { GameState } from '../model'

const data = makeData()

/** Save v26 dựng từ state hiện tại: bỏ tamer, contractRealm, battle.tamers. */
function asV26(state: GameState): Record<string, unknown> {
  // serializeState trả về giá trị JSON (object) của state.
  const raw = serializeState(state) as Record<string, unknown>
  const strip = (m: Record<string, unknown>): Record<string, unknown> => {
    const { contractRealm: _contractRealm, ...rest } = m
    return rest
  }
  const list = (value: unknown): Record<string, unknown>[] =>
    (value as Record<string, unknown>[]).map(strip)
  const { tamer: _tamer, ...withoutTamer } = raw
  const battle = raw.battle as Record<string, unknown> | null
  const { tamers: _tamers, ...battleRest } = battle ?? {}
  return {
    ...withoutTamer,
    version: 26,
    party: list(raw.party),
    storage: list(raw.storage),
    eggs: (raw.eggs as Record<string, unknown>[]).map((egg) => ({
      ...egg,
      monster: strip(egg.monster as Record<string, unknown>)
    })),
    battle: battle
      ? { ...battleRest, enemies: list(battle.enemies), captured: list(battle.captured) }
      : null
  }
}

describe('migrate v26 → v27', () => {
  it('cảnh giới = ⌊(highestFloor − 1) / 10⌋, EXP 0, quái người chơi khế ước theo cảnh giới', () => {
    const base = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })], highestFloor: 25 })
    const egg = { id: 'm9', monster: makeMonster({ id: 'm9' }), battlesLeft: 2, infusions: [] }
    const state = { ...base, storage: [makeMonster({ id: 'b' })], eggs: [egg], nextMonsterId: 10 }
    const migrated = migrateState(asV26(state), data) as GameState
    expect(migrated.version).toBe(SAVE_VERSION)
    // Đi tiếp tới v50: chưa kết bản mệnh, không đạo thương.
    expect(migrated.tamer).toEqual({ realm: 2, exp: toBig(0), bondDay: null, woundUntilDay: null })
    expect(migrated.party[0].contractRealm).toBe(2)
    expect(migrated.storage[0].contractRealm).toBe(2)
    expect(migrated.eggs[0].monster.contractRealm).toBe(2)
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('trận đang diễn ra: quái hoang null, ngự thú sư người chơi linh lực đầy', () => {
    const battleState = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const migrated = migrateState(asV26(battleState), data) as GameState
    const battle = defined(migrated.battle, 'trận')
    expect(battle.enemies[0].contractRealm).toBeNull()
    expect(battle.tamers).toEqual({
      player: { realm: 0, mana: 50, cooldowns: {}, uses: {}, skillIds: null },
      enemy: null
    })
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('highestFloor hỏng: cảnh giới 0 (validateGameState báo lỗi tầng)', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    const raw = { ...asV26(state), highestFloor: 'x' }
    const migrated = migrateState(raw, data) as GameState
    expect(migrated.tamer.realm).toBe(0)
  })
})

describe('kiểm tra save', () => {
  const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })

  it('state hợp lệ; EXP Decimal lớn ghi / đọc lại đúng', () => {
    const big = {
      ...state,
      tamer: { bondDay: null, woundUntilDay: null, realm: 3, exp: toBig(10).pow(500) }
    }
    expect(validateGameState(data, big)).toEqual([])
    const loaded = migrateState(JSON.parse(JSON.stringify(serializeState(big))), data)
    expect(loaded.tamer.exp.eq(toBig(10).pow(500))).toBe(true)
  })

  it('tamer sai: cảnh giới âm / lẻ, EXP âm, thiếu hẳn', () => {
    // Hai trường bản mệnh (v50) đúng sẵn để chỉ đo trường đang thử.
    const issues = (tamer: unknown): string[] =>
      validateGameState(data, {
        ...state,
        tamer: tamer && { bondDay: null, woundUntilDay: null, ...(tamer as object) }
      })
    expect(issues({ realm: -1, exp: toBig(0) })).toEqual([
      'tamer.realm phải là số nguyên ≥ 0, nhận -1'
    ])
    expect(issues({ realm: 1.5, exp: toBig(0) })).toHaveLength(1)
    expect(issues({ realm: 0, exp: toBig(-1) })).toHaveLength(1)
    expect(issues(undefined)).toEqual([
      'tamer phải là object { realm, exp, bondDay, woundUntilDay }'
    ])
    expect(issues({ realm: 0, exp: toBig(0), bondDay: -1, woundUntilDay: 1.5 })).toHaveLength(2)
  })

  it('quái người chơi chưa khế ước hợp lệ; quái hoang có khế ước, khế ước âm báo lỗi', () => {
    const owned = { ...state, party: [makeMonster({ id: 'a', contractRealm: null })] }
    expect(validateGameState(data, owned)).toEqual([])
    const negative = { ...state, party: [makeMonster({ id: 'a', contractRealm: -1 })] }
    expect(validateGameState(data, negative)).toEqual([
      'party[0].contractRealm phải là số nguyên ≥ 0, nhận -1'
    ])
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const tagged = {
      ...battle,
      battle: {
        ...defined(battle.battle, 'trận'),
        enemies: [makeMonster({ id: 'e', history: null, contractRealm: 1 })]
      }
    }
    expect(validateGameState(data, tagged)).toEqual([
      'battle.enemies[0].contractRealm: quái hoang chưa bắt phải là null'
    ])
  })

  it('battle.tamers sai: linh lực âm, kỹ năng lạ, hồi chiêu 0, thiếu hẳn', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const withTamers = (tamers: unknown): string[] =>
      validateGameState(data, {
        ...battle,
        battle: { ...defined(battle.battle, 'trận'), tamers }
      })
    expect(
      withTamers({
        player: { realm: 0, mana: -1, cooldowns: {}, uses: {}, skillIds: null },
        enemy: null
      })
    ).toEqual(['battle.tamers.player.mana phải là số nguyên ≥ 0, nhận -1'])
    expect(
      withTamers({
        player: { realm: 0, mana: 0, cooldowns: { nope: 1, mend: 0 }, uses: {}, skillIds: null },
        enemy: null
      })
    ).toEqual([
      'battle.tamers.player.cooldowns: kỹ năng ngự thú sư không tồn tại "nope"',
      'battle.tamers.player.cooldowns.mend phải là số nguyên ≥ 1, nhận 0'
    ])
    expect(
      withTamers({
        player: { realm: 0, mana: 0, cooldowns: {}, uses: {}, skillIds: ['nope'] },
        enemy: null
      })
    ).toEqual(['battle.tamers.player.skillIds phải là null hoặc danh sách id kỹ năng ngự thú sư'])
    expect(withTamers(undefined)).toEqual(['battle.tamers phải là object { player, enemy }'])
  })
})
