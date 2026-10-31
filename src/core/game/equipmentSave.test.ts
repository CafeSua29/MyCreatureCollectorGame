import { describe, expect, it } from 'vitest'
import {
  equipped,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { GameState } from '../model'
import { migrateState } from './migrate'
import { SAVE_VERSION } from './reducer'
import { parseSave, serializeSave, serializeState } from './save'
import { validateGameState } from './validateGameState'

const data = makeEquipmentData()

/** Save JSON (đã serialize) của state, để migrate / kiểm tra như đọc file. */
const asSave = (state: GameState): Record<string, unknown> =>
  JSON.parse(JSON.stringify(serializeState(state)))

function stateWithGear(): GameState {
  return {
    ...makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a', equipment: [equipped(makeEquipment({ id: 'e1' }))] })]
    }),
    storage: [makeMonster({ id: 'b', equipment: [equipped(makeEquipment({ id: 'e4' }))] })],
    inventory: makeInventory({}, [], [makeEquipment({ id: 'e2' })]),
    shop: { stock: [{ storage: 'instance', instance: makeEquipment({ id: 'e3' }) }] },
    nextItemId: 5
  }
}

describe('migrate v21 → v22: trang bị', () => {
  it('mọi quái (cả trong trứng) thêm ô rỗng, túi thêm phần trang bị, nextItemId = 1', () => {
    const save = asSave(makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] }))
    const strip = (monster: Record<string, unknown>): Record<string, unknown> => {
      const { equipment: _equipment, ...rest } = monster
      return rest
    }
    const party = (save.party as Record<string, unknown>[]).map(strip)
    const egg = {
      id: 'm9',
      monster: strip(
        (
          asSave(makeGameState({ seed: 1, party: [makeMonster({ id: 'm9' })] })).party as Record<
            string,
            unknown
          >[]
        )[0]
      ),
      battlesLeft: 3
    }
    const { equipment: _bag, ...inventory } = save.inventory as Record<string, unknown>
    const { nextItemId: _next, ...rest } = save
    const migrated = migrateState(
      {
        ...rest,
        version: 21,
        party,
        eggs: [egg],
        inventory,
        nextMonsterId: 10
      },
      data
    )
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.party[0].equipment).toEqual([])
    expect(migrated.eggs[0].monster.equipment).toEqual([])
    expect(migrated.inventory.equipment).toEqual([])
    expect(migrated.nextItemId).toBe(1)
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('túi hỏng giữ nguyên để kiểm tra báo lỗi', () => {
    const save = asSave(makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] }))
    const migrated = migrateState({ ...save, version: 21, inventory: 'hỏng' }, data)
    expect(validateGameState(data, migrated)).toContain('inventory không hợp lệ')
  })
})

describe('kiểm tra save: trang bị', () => {
  it('lưu / đọc lại giữ nguyên trang bị; state hợp lệ', () => {
    const state = stateWithGear()
    expect(validateGameState(data, state)).toEqual([])
    expect(migrateState(asSave(state), data)).toEqual(state)
  })

  it('id món trùng giữa túi / quái / cửa hàng, nextItemId không lớn hơn id lớn nhất', () => {
    const state = stateWithGear()
    const duplicate = {
      ...state,
      inventory: makeInventory({}, [], [makeEquipment({ id: 'e1' })]),
      nextItemId: 4
    }
    const issues = validateGameState(data, duplicate)
    expect(issues).toContain('id món trang bị bị trùng "e1"')
    expect(issues).toContain('nextItemId phải lớn hơn mọi id món trang bị (hiện có e4)')
  })

  it('quái lắp quá số ô của tầng cao nhất', () => {
    const gear = [1, 2, 3, 4].map((n) => equipped(makeEquipment({ id: `e${n}` })))
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a', equipment: gear })] }),
      nextItemId: 5
    }
    expect(validateGameState(data, state)).toContain('party[0].equipment: lắp 4 món, quá 3 ô')
    const floor20 = { ...state, highestFloor: 20, floorBiomeIds: Array(20).fill('field') }
    expect(validateGameState(data, floor20)).toEqual([])
  })

  it('món hỏng: món gốc lạ, bậc sai, dòng lạ, cấp, item lắp theo id không lắp được', () => {
    const bad = {
      ...makeGameState({
        seed: 1,
        party: [
          makeMonster({
            id: 'a',
            equipment: [
              equipped(makeEquipment({ id: 'e1', rarity: 'unique' })),
              equipped(
                makeEquipment({ id: 'e2', level: 0, rolls: [{ lineId: 'ghost', value: 1 }] })
              ),
              { storage: 'stack', itemId: 'ball' }
            ]
          })
        ]
      }),
      inventory: makeInventory({}, [], [makeEquipment({ id: 'x1', baseItemId: 'potion' })]),
      nextItemId: 3
    }
    const issues = validateGameState(data, bad).join('\n')
    expect(issues).toMatch(/party\[0\].equipment\[0\].instance.rarity: chỉ món unique/)
    expect(issues).toMatch(/party\[0\].equipment\[1\].instance.level/)
    expect(issues).toMatch(
      /party\[0\].equipment\[1\].instance.rolls\[0\].lineId: dòng không tồn tại/
    )
    expect(issues).toMatch(/party\[0\].equipment\[2\].itemId: vật phẩm "ball" \(ball\) không lắp/)
    expect(issues).toMatch(/inventory.equipment\[0\].id phải có dạng "e<số>"/)
    expect(issues).toMatch(/inventory.equipment\[0\].baseItemId: trang bị không tồn tại "potion"/)
  })
})

describe('parseSave: tháo món unique quái không còn lắp được', () => {
  it('món unique trên quái khác race về túi, báo trong unequipped', () => {
    const crown = makeEquipment({
      id: 'e1',
      baseItemId: 'stronglingCrown',
      rarity: 'unique',
      rolls: [
        { lineId: 'main', value: 10 },
        { lineId: 'crownSpeed', value: 25 }
      ]
    })
    const brute = makeMonster({
      id: 'a',
      speciesId: 'brawler',
      baseSpeciesId: 'brawler',
      raceId: 'brute',
      equipment: [equipped(crown)]
    })
    const state = { ...makeGameState({ seed: 1, party: [brute] }), nextItemId: 2 }
    const text = serializeSave(data, {
      gameId: 'g-test',
      kind: 'manual',
      savedAt: '2026-10-23T10:00:00.000Z',
      state
    })
    const parsed = parseSave(data, text)
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'))
    expect(parsed.unequipped).toEqual([
      { monsterId: 'a', instanceId: 'e1', itemId: 'stronglingCrown' }
    ])
    expect(parsed.save.state.party[0].equipment).toEqual([])
    expect(parsed.save.state.inventory.equipment).toEqual([crown])
  })
})
