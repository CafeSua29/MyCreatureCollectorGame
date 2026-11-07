// Huyết mạch ở tầng game (docs/rules/bloodline.md): phản tổ, Tinh huyết, MonsterView, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import { toBig } from '../shared'
import {
  atFloor,
  defined,
  expectActionError,
  makeBloodlineData,
  makeGameState,
  makeInventory,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { BloodlinePurity, GameState, Monster } from '../model'
import { getMonsterView } from './roster'

const data = makeBloodlineData()

const hero = (bloodlines: BloodlinePurity[], overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'a',
    speciesId: 'nymph',
    baseSpeciesId: 'nymph',
    elementIds: ['grass'],
    level: 10,
    skillIds: ['strike'],
    bloodlines,
    ...overrides
  })

function townState(party: Monster[], money = 1e6): GameState {
  return {
    ...makeGameState({ seed: 3, party }),
    money: toBig(money),
    inventory: makeInventory({ wyrmEssence: 3 })
  }
}

const atavize = (state: GameState, ancestorSpeciesId = 'elderWyrm'): GameState =>
  gameReducer(data, state, { type: 'atavize', monsterId: 'a', ancestorSpeciesId })
const partyOf = (state: GameState): Monster => defined(state.party.find((m) => m.id === 'a'))

const FULL: BloodlinePurity[] = [
  { groupId: 'wyrm', purity: 100 },
  { groupId: 'stone', purity: 40 }
]

describe('phản tổ', () => {
  it('đổi loài / race / hệ theo loài tổ, trả tiền theo level, giữ phần còn lại, ghi lý lịch', () => {
    const state = townState([hero(FULL)])
    const next = atavize(state)
    const a = partyOf(next)
    expect(a.speciesId).toBe('elderWyrm')
    expect(a.baseSpeciesId).toBe('elderWyrm')
    expect(a.elementIds).toEqual(['fire'])
    expect(a.level).toBe(10)
    expect(a.genes).toEqual(state.party[0].genes)
    // 100 × level 10.
    expect(state.money.minus(next.money).toString()).toBe('1000')
    // Nhóm vừa phản tổ bị xóa; loài tổ không thuộc stone nên stone cũng mất.
    expect(a.bloodlines).toEqual([])
    // Skill của loài tổ có level ≤ 10 (strike đã biết, blast học được), không có skill level 50.
    expect(a.skillIds).toEqual(['strike', 'blast'])
    expect(a.history?.milestones.at(-1)).toEqual({
      day: 0,
      kind: 'atavized',
      fromSpeciesId: 'nymph',
      toSpeciesId: 'elderWyrm'
    })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('đổi loài theo luật chung: Bootleg giữ hệ Bootleg như tiến hóa', () => {
    const bootleg = hero(FULL, { bootlegElementId: 'water', elementIds: ['water'] })
    const a = partyOf(atavize(townState([bootleg])))
    expect(a).toMatchObject({ speciesId: 'elderWyrm', elementIds: ['water'] })
  })

  it('loài tổ không giới tính thì none; quái none sang loài có giới tính thì tung 50/50', () => {
    const toStone = gameReducer(data, townState([hero([{ groupId: 'stone', purity: 100 }])]), {
      type: 'atavize',
      monsterId: 'a',
      ancestorSpeciesId: 'titanStone'
    })
    expect(partyOf(toStone).gender).toBe('none')
    const husk = hero(FULL, { speciesId: 'husk', baseSpeciesId: 'husk', gender: 'none' })
    expect(['male', 'female']).toContain(partyOf(atavize(townState([husk]))).gender)
  })

  it('báo lỗi, state giữ nguyên', () => {
    const state = townState([hero([{ groupId: 'wyrm', purity: 99.9 }])])
    expectActionError(() => atavize(state), 'purityTooLow', {
      monsterId: 'a',
      purity: 99.9,
      required: 100
    })
    expectActionError(() => atavize(townState([hero([])])), 'purityTooLow', { purity: 0 })
    expectActionError(() => atavize(townState([hero(FULL)]), 'titanStone'), 'notAncestor', {
      speciesId: 'titanStone'
    })
    const fused = hero(FULL, { fused: true, speciesId: 'fused', lineage: ['pebble'] })
    expectActionError(() => atavize(townState([fused])), 'fusedCannotAtavize')
    expectActionError(() => atavize(townState([hero(FULL)], 999)), 'notEnoughMoney')
    expectActionError(() => atavize(atFloor(townState([hero(FULL)]), 1)), 'notInTown')
    const before = townState([hero(FULL)], 0)
    const snapshot = serializeState(before)
    expect(() => atavize(before)).toThrow()
    expect(serializeState(before)).toEqual(snapshot)
  })
})

describe('Tinh huyết', () => {
  it('+5 độ thuần nhóm của nó; quái không thuộc nhóm / đã 100% thì không dùng được', () => {
    const state = townState([hero([{ groupId: 'wyrm', purity: 97 }])])
    const used = gameReducer(data, state, {
      type: 'useItem',
      itemId: 'wyrmEssence',
      monsterId: 'a'
    })
    expect(partyOf(used).bloodlines).toEqual([{ groupId: 'wyrm', purity: 100 }])
    expect(getItemCount(used.inventory, 'wyrmEssence')).toBe(2)
    expectActionError(
      () => gameReducer(data, used, { type: 'useItem', itemId: 'wyrmEssence', monsterId: 'a' }),
      'itemNoEffect'
    )
    const pebble = makeMonster({
      id: 'a',
      speciesId: 'pebble',
      baseSpeciesId: 'pebble',
      gender: 'none'
    })
    expectActionError(
      () =>
        gameReducer(data, townState([pebble]), {
          type: 'useItem',
          itemId: 'wyrmEssence',
          monsterId: 'a'
        }),
      'itemNoEffect'
    )
  })
})

describe('MonsterView', () => {
  it('huyết mạch chính, cấp trait, loài tổ chọn được khi 100%, các nhóm khác', () => {
    const view = defined(getMonsterView(data, townState([hero(FULL)]), 'a'))
    expect(view.bloodline).toEqual({
      main: {
        groupId: 'wyrm',
        purity: 100,
        traitLevel: 4,
        traitId: 'wyrmBlood',
        atavizeOptions: ['elderWyrm']
      },
      others: [{ groupId: 'stone', purity: 40 }],
      groupIds: ['wyrm', 'stone']
    })
    const low = defined(
      getMonsterView(data, townState([hero([{ groupId: 'stone', purity: 10 }])]), 'a')
    )
    expect(low.bloodline.main?.atavizeOptions).toEqual([])
    expect(low.bloodline.main?.traitLevel).toBe(0)
    const none = defined(getMonsterView(data, townState([makeMonster({ id: 'a' })]), 'a'))
    expect(none.bloodline).toEqual({ main: null, others: [], groupIds: [] })
  })
})

describe('migrate v72 → v73', () => {
  it('mọi quái (kể cả trứng) có bloodlines rỗng', () => {
    const state = townState([hero([])])
    const raw = JSON.parse(JSON.stringify(serializeState(state))) as Record<string, unknown>
    const party = (raw.party as Record<string, unknown>[]).map(
      ({ bloodlines: _b, ...rest }) => rest
    )
    const old = { ...raw, version: 72, party }
    const migrated = migrateState(old, data)
    expect(migrated.party[0].bloodlines).toEqual([])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
