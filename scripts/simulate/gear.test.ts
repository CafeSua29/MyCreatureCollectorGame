import { describe, expect, it } from 'vitest'
import {
  equipped,
  makeEquipment,
  makeEquipmentData,
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
