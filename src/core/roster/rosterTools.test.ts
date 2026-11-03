// Khóa, yêu thích, đội hình mẫu (docs/rules/roster.md): khóa chặn mọi action làm mất quái, tự khóa
// shiny / boss bắt về, lọc / sắp xếp, lưu / áp đội hình (có / không trang bị, thiếu quái / món), kiểm
// tra save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { autoLockCaught } from '../monster'
import {
  findLog,
  defined,
  expectActionError,
  makeData,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { EquipmentInstance, GameAction, GameState, Monster } from '../model'
import { listMonsters } from './roster'

const data = makeData()

const mon = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, ...overrides })

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const withStorage = (party: Monster[], storage: Monster[]): GameState => ({
  ...makeGameState({ seed: 4, party }),
  storage
})

describe('khóa', () => {
  const locked = mon('l', { locked: true })

  it('bật / tắt ngoài trận, miễn phí; không đổi thì state giữ nguyên; quái lạ / sai kiểu báo lỗi', () => {
    const state = withStorage([mon('a')], [mon('b')])
    const on = act(state, { type: 'setMonsterLocked', monsterId: 'b', locked: true })
    expect(defined(on.storage[0]).locked).toBe(true)
    expect(act(on, { type: 'setMonsterLocked', monsterId: 'b', locked: true })).toBe(on)
    expect(
      defined(act(on, { type: 'setMonsterLocked', monsterId: 'b', locked: false }).storage[0])
        .locked
    ).toBe(false)
    expectActionError(
      () => act(state, { type: 'setMonsterLocked', monsterId: 'z', locked: true }),
      'monsterNotOwned'
    )
    expectActionError(
      () =>
        act(state, { type: 'setMonsterLocked', monsterId: 'a', locked: 1 as unknown as boolean }),
      'malformedAction'
    )
  })

  it('chặn thả, làm quái phụ fuse / hiến tế; mở khóa thì thả được', () => {
    const state = withStorage([mon('a')], [locked])
    expectActionError(
      () => act(state, { type: 'releaseMonster', monsterId: 'l' }),
      'monsterLocked',
      {
        monsterId: 'l'
      }
    )
    expectActionError(() => act(state, { type: 'fuse', baseId: 'a', subId: 'l' }), 'monsterLocked')
    expectActionError(
      () => act(state, { type: 'sacrifice', baseId: 'a', subIds: ['l'] }),
      'monsterLocked'
    )
    const open = act(state, { type: 'setMonsterLocked', monsterId: 'l', locked: false })
    expect(act(open, { type: 'releaseMonster', monsterId: 'l' }).storage).toEqual([])
  })

  it('tự khóa quái shiny / boss bắt về; quái thường thì không', () => {
    expect(autoLockCaught(mon('a')).locked).toBe(false)
    expect(autoLockCaught(mon('a', { shinyStacks: 1 })).locked).toBe(true)
    expect(autoLockCaught(mon('a', { bossMultiplier: 3 })).locked).toBe(true)
  })

  it('lọc theo khóa / yêu thích, sắp xếp yêu thích lên đầu', () => {
    const state = withStorage([mon('a')], [locked, mon('f', { favorite: true })])
    const ids = (query: Parameters<typeof listMonsters>[2]): string[] =>
      listMonsters(data, state, query).map((view) => view.id)
    expect(ids({ locked: true })).toEqual(['l'])
    expect(ids({ favorite: true })).toEqual(['f'])
    expect(ids({ sort: { by: 'favorite', order: 'desc' } })[0]).toBe('f')
    const on = act(state, { type: 'setMonsterFavorite', monsterId: 'a', favorite: true })
    expect(defined(on.party[0]).favorite).toBe(true)
  })

  it('save: locked / favorite phải là boolean; migrate v96 → v97 chưa khóa, chưa có mẫu', () => {
    const bad = mon('a', { locked: 1 as unknown as boolean })
    expect(
      validateGameState(data, makeGameState({ seed: 1, party: [bad] })).length
    ).toBeGreaterThan(0)
    const raw = serializeState(withStorage([mon('a')], [mon('b')])) as Record<string, unknown>
    const strip = ({ locked: _l, favorite: _f, ...rest }: Record<string, unknown>): unknown => rest
    const { teamPresets: _presets, ...old } = raw
    const migrated = migrateState(
      {
        ...old,
        version: 96,
        party: (raw.party as Record<string, unknown>[]).map(strip),
        storage: (raw.storage as Record<string, unknown>[]).map(strip)
      },
      data
    )
    expect(migrated.party[0].locked).toBe(false)
    expect(migrated.storage[0].favorite).toBe(false)
    expect(migrated.teamPresets).toEqual({ presets: [], nextPresetId: 1 })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('đội hình mẫu', () => {
  const save = (state: GameState, name: string | null = 'A', presetId?: string): GameState =>
    act(state, { type: 'saveTeamPreset', name, ...(presetId ? { presetId } : {}) })
  const apply = (state: GameState, withEquipment = false, presetId = 'p1'): GameState =>
    act(state, { type: 'applyTeamPreset', presetId, withEquipment })

  it('lưu: đúng thứ tự ô; ghi đè; đủ ô thì báo lỗi; tên chuẩn hóa; xóa', () => {
    const state = withStorage([mon('a'), mon('b')], [])
    const one = save(state, '  Chủ lực  ')
    expect(one.teamPresets.presets[0]).toMatchObject({
      id: 'p1',
      name: 'Chủ lực',
      monsterIds: ['a', 'b']
    })
    const two = save(one, null)
    expectActionError(() => save(two), 'presetSlotsFull', { max: 2 })
    const reordered = act(one, { type: 'reorderParty', monsterIds: ['b', 'a'] })
    expect(save(reordered, 'B', 'p1').teamPresets.presets[0].monsterIds).toEqual(['b', 'a'])
    expectActionError(() => save(one, 'B', 'p9'), 'presetNotFound', { presetId: 'p9' })
    expect(
      act(two, { type: 'deleteTeamPreset', presetId: 'p1' }).teamPresets.presets.map((p) => p.id)
    ).toEqual(['p2'])
    expect(validateGameState(data, two)).toEqual([])
  })

  it('áp: đúng quái và thứ tự, quái cũ về kho', () => {
    const saved = save(withStorage([mon('a'), mon('b')], [mon('c')]))
    const changed = act(saved, {
      type: 'swapWithStorage',
      partyMonsterId: 'a',
      storageMonsterId: 'c'
    })
    const applied = apply(changed)
    expect(applied.party.map((m) => m.id)).toEqual(['a', 'b'])
    expect(applied.storage.map((m) => m.id)).toEqual(['c'])
    expect(applied.log).toEqual([])
    expect(validateGameState(data, applied)).toEqual([])
  })

  it('thiếu quái: bỏ qua, ghi log presetMissing; không còn quái nào: báo lỗi; quái đang bận bỏ qua', () => {
    const saved = save(withStorage([mon('a'), mon('b')], [mon('c')]))
    const released = act(saved, { type: 'releaseMonster', monsterId: 'b' })
    const applied = apply(released)
    expect(applied.party.map((m) => m.id)).toEqual(['a'])
    expect(applied.log).toEqual([
      { type: 'presetMissing', presetId: 'p1', monsterIds: ['b'], items: [] }
    ])
    expect(validateGameState(data, applied)).toEqual([])
    const gone: GameState = {
      ...saved,
      party: [mon('x')],
      storage: []
    }
    expectActionError(() => apply(gone), 'presetEmpty', { presetId: 'p1' })
    expectActionError(() => apply(saved, false, 'p9'), 'presetNotFound')
  })

  it('có trang bị: lắp lại đúng món, món ở quái khác tháo sang; món mất ghi log presetMissing', () => {
    const blade: EquipmentInstance = makeEquipment({ id: 'e1' })
    const state = {
      ...withStorage(
        [mon('a', { equipment: [{ storage: 'instance', instance: blade }] })],
        [mon('c')]
      ),
      nextItemId: 2
    }
    const saved = save(state)
    // Món chuyển sang quái c ở kho, quái a trống tay.
    const moved: GameState = {
      ...saved,
      party: [mon('a')],
      storage: [mon('c', { equipment: [{ storage: 'instance', instance: blade }] })]
    }
    const applied = apply(moved, true)
    expect(
      defined(applied.party[0]).equipment.map((e) => e.storage === 'instance' && e.instance.id)
    ).toEqual(['e1'])
    expect(defined(applied.storage[0]).equipment).toEqual([])
    expect(findLog(applied, 'presetMissing')).toBeUndefined()
    expect(validateGameState(makeEquipmentData(), applied)).toEqual([])
    // Không trang bị: giữ nguyên món.
    expect(defined(apply(moved, false).storage[0]).equipment).toHaveLength(1)
    // Món đã mất.
    const lost: GameState = { ...saved, party: [mon('a')], storage: [mon('c')] }
    expect(findLog(apply(lost, true), 'presetMissing')).toEqual({
      type: 'presetMissing',
      presetId: 'p1',
      monsterIds: [],
      items: [{ storage: 'instance', instanceId: 'e1' }]
    })
  })

  it('đồ gộp chồng: lấy trong túi; không đủ thì ghi thiếu', () => {
    const held = { storage: 'stack', itemId: 'everstone' } as const
    const saved = save(withStorage([mon('a', { equipment: [held] })], []))
    const inBag: GameState = {
      ...saved,
      party: [mon('a')],
      inventory: makeInventory({ everstone: 1 })
    }
    expect(defined(apply(inBag, true).party[0]).equipment).toEqual([held])
    const none: GameState = { ...saved, party: [mon('a')], inventory: makeInventory({}) }
    expect(findLog(apply(none, true), 'presetMissing')?.items).toEqual([held])
  })

  it('trong trận / đang dự giải: báo lỗi', () => {
    const saved = save(withStorage([mon('a')], []))
    const inTournament = {
      ...saved,
      trainers: { ...saved.trainers, tournament: { lastPeriod: 0, round: 0 } }
    }
    expectActionError(() => apply(inTournament), 'tournamentInProgress')
  })
})
