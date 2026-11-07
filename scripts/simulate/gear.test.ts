import { describe, expect, it } from 'vitest'
import {
  equipped,
  makeEquipment,
  makeEquipmentData,
  makeEquipmentSetData,
  makeGameState,
  makeInventory,
  makeMonster
} from '@core/testing'
import { autoEquip, averageSourcePercent } from './gear'

const data = makeEquipmentData()
const sword = (id: string, rarity: 'common' | 'rare' | 'epic'): ReturnType<typeof makeEquipment> =>
  makeEquipment({ id, rarity, rolls: [{ lineId: 'main', value: 10 }] })

describe('autoEquip', () => {
  it('lắp món bậc cao trước vào ô trống; đủ ô thì thay món kém nhất bằng món tốt hơn', () => {
    const worn = [1, 2, 3].map((n) => equipped(sword(`e${n}`, 'common')))
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a', equipment: worn })] }),
      inventory: makeInventory({}, [], [sword('e4', 'epic'), sword('e5', 'common')]),
      nextItemId: 6
    }
    const next = autoEquip(data, state, new Set(['a']))
    const rarities = next.party[0].equipment.map((entry) =>
      entry.storage === 'instance' ? entry.instance.rarity : 'stack'
    )
    expect(rarities.sort()).toEqual(['common', 'common', 'epic'])
    expect(next.inventory.equipment.map((item) => item.id).sort()).toEqual(['e1', 'e5'])
  })

  it('bộ trang bị: đủ ô thì thay món không góp bộ để đủ bộ, không đổi qua đổi lại mãi', () => {
    const setData = makeEquipmentSetData()
    const piece = (
      id: string,
      setId: string,
      rarity: 'common' | 'epic' = 'common'
    ): ReturnType<typeof makeEquipment> =>
      makeEquipment({ id, setId, rarity, rolls: [{ lineId: 'main', value: 10 }] })
    // Đang lắp 1 món guard common (chưa đủ bộ 2 món) + 2 món fatal epic (món guard luôn kém nhất);
    // trong túi có món guard common thứ hai: lắp vào không được tháo món guard kia.
    const worn = [
      piece('e1', 'guard'),
      piece('e2', 'fatal', 'epic'),
      piece('e3', 'fatal', 'epic')
    ].map(equipped)
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a', equipment: worn })] }),
      inventory: makeInventory({}, [], [piece('e4', 'guard')]),
      nextItemId: 5
    }
    const next = autoEquip(setData, state, new Set(['a']))
    const ids = next.party[0].equipment.map((entry) =>
      entry.storage === 'instance' ? entry.instance.id : ''
    )
    // Không có cách đổi nào làm đủ bộ mà không bỏ món epic: giữ nguyên (không đổi qua đổi lại).
    expect(ids).toEqual(['e1', 'e2', 'e3'])
    expect(next.inventory.equipment.map((item) => item.id)).toEqual(['e4'])
  })

  it('không lắp món unique sai race, bỏ qua quái ngoài đội mẫu', () => {
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
      id: 'b',
      speciesId: 'brawler',
      baseSpeciesId: 'brawler',
      raceId: 'brute'
    })
    const state = {
      ...makeGameState({ seed: 1, party: [brute, makeMonster({ id: 'c' })] }),
      inventory: makeInventory({}, [], [crown]),
      nextItemId: 2
    }
    expect(autoEquip(data, state, new Set(['b']))).toEqual(state)
  })

  it('averageSourcePercent: trung bình % 6 chỉ số từ trang bị của đội mẫu', () => {
    const state = makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a', equipment: [equipped(sword('e1', 'common'))] })]
    })
    // Kiếm +10% công: trung bình 6 chỉ số = 10 / 6.
    expect(averageSourcePercent(data, state, new Set(['a']), 'equipment')).toBeCloseTo(10 / 6)
    expect(averageSourcePercent(data, state, new Set(), 'equipment')).toBe(0)
  })
})
