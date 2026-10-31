import { describe, expect, it } from 'vitest'
import { equipmentSlotCount, toBig, type GameState } from '@core'
import {
  FIXTURE_CORE_IDS,
  FIXTURE_ENHANCE_STONE_ID,
  equipped,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster
} from '@core/testing'
import {
  FORGE_POLICY,
  castWithCores,
  enhanceTeamGear,
  imbueTeamGear,
  salvageSurplus
} from './forge'

const CORE = FIXTURE_CORE_IDS[0]
const ELEMENTS = ['normal', 'fire', 'grass', 'ghost', 'water', 'flying']

// Mọi hệ của fixture phụ linh được bằng cùng một yêu đan, mỗi hệ một dòng linh hệ.
const data = makeEquipmentData((raw) => {
  raw.config.treasures.demonCoreItemIds = Object.fromEntries(ELEMENTS.map((e) => [e, CORE]))
  const range = { min: 5, max: 5 }
  for (const elementId of ELEMENTS) {
    raw.equipmentAffixes.push({
      id: `imbue_${elementId}`,
      weight: 0,
      hook: { type: 'elementDamageDealt', params: { elementIds: [elementId] } },
      valueParam: 'percent',
      ranges: {
        common: range,
        uncommon: range,
        rare: range,
        epic: range,
        legendary: range,
        unique: range
      }
    })
  }
  raw.config.forge.imbue.lineIds = Object.fromEntries(ELEMENTS.map((e) => [e, `imbue_${e}`]))
})

const townState = (stones: number, money: number): GameState => ({
  ...makeGameState({
    seed: 1,
    party: [
      makeMonster({ id: 'a', equipment: [equipped(makeEquipment({ id: 'e1' }))] }),
      makeMonster({ id: 'b', equipment: [equipped(makeEquipment({ id: 'e2' }))] })
    ]
  }),
  nextItemId: 10,
  money: toBig(money),
  inventory: makeInventory(
    { [FIXTURE_ENHANCE_STONE_ID]: stones },
    [],
    [makeEquipment({ id: 'e3', rarity: 'rare' }), makeEquipment({ id: 'e4', rarity: 'common' })]
  )
})

const levelOf = (state: GameState, index: number): number => {
  const entry = state.party[index].equipment[0]
  return entry.storage === 'instance' ? entry.instance.level : 0
}

describe('forge (mô phỏng)', () => {
  it('cường hóa món cấp thấp nhất của đội mẫu tới khi hết đá', () => {
    const { state, enhances } = enhanceTeamGear(data, townState(3, 1e9), new Set(['a']))
    // Cấp 1 → 2 (1 đá), 2 → 3 (2 đá); còn 0 đá thì dừng.
    expect(enhances).toBe(2)
    expect(levelOf(state, 0)).toBe(3)
    expect(levelOf(state, 1)).toBe(1)
  })

  it('hết tiền thì dừng, không lỗi', () => {
    const { enhances } = enhanceTeamGear(data, townState(10, 60), new Set(['a', 'b']))
    expect(enhances).toBe(1)
  })

  it('phân giải đồ trong túi bậc từ rare, giữ đồ bậc thấp để bán', () => {
    const { state, salvaged } = salvageSurplus(data, townState(0, 0))
    expect(salvaged).toBe(1)
    expect(state.inventory.equipment.map((instance) => instance.id)).toEqual(['e4'])
  })

  it('đúc theo lô castCores yêu đan tới khi thiếu; món gốc là món kém nhất đang lắp khi đủ ô', () => {
    const cores = FORGE_POLICY.castCores * 2 + 1
    const base = townState(0, 1e9)
    const full = equipmentSlotCount(data, base)
    // Đủ ô: lắp thêm món cho tới khi kín ô để chọn món kém nhất đang lắp.
    const filler = Array.from({ length: full - 1 }, (_, i) =>
      equipped(makeEquipment({ id: `f${i}`, baseItemId: 'staff', rarity: 'epic' }))
    )
    const state: GameState = {
      ...base,
      party: base.party.map((monster) => ({
        ...monster,
        equipment: [...monster.equipment, ...filler]
      })),
      inventory: makeInventory({ [CORE]: cores })
    }
    const result = castWithCores(data, state, new Set(['a']))
    expect(result.casts).toBe(2)
    expect(result.state.inventory.equipment.map((instance) => instance.baseItemId)).toEqual([
      'sword',
      'sword'
    ])
    expect(result.state.inventory.stacks[CORE]).toBe(1)
  })

  it('còn ô trống thì đúc món thường giá gốc cao nhất; thiếu yêu đan thì không đúc', () => {
    const state = { ...townState(0, 1e9), inventory: makeInventory({ [CORE]: 3 }) }
    const result = castWithCores(data, state, new Set(['a']))
    expect(result.casts).toBe(1)
    expect(result.state.inventory.equipment[0]?.baseItemId).toBe('staff')
    expect(castWithCores(data, townState(0, 1e9), new Set(['a'])).casts).toBe(0)
  })

  it('phụ linh đồ đang lắp chưa có dòng linh hệ bằng yêu đan hệ đầu của quái; thiếu thì bỏ qua', () => {
    const state = { ...townState(0, 1e9), inventory: makeInventory({ [CORE]: 1 }) }
    const result = imbueTeamGear(data, state, new Set(['a', 'b']))
    // Mỗi món common cần 1 yêu đan: chỉ đủ cho món đầu.
    expect(result.imbues).toBe(1)
    const lines = (index: number): string[] => {
      const entry = result.state.party[index].equipment[0]
      return entry.storage === 'instance' ? entry.instance.rolls.map((roll) => roll.lineId) : []
    }
    expect(lines(0).some((id) => id.startsWith('imbue_'))).toBe(true)
    expect(lines(1).some((id) => id.startsWith('imbue_'))).toBe(false)
    // Đã phụ linh thì không làm lại.
    const again = imbueTeamGear(
      data,
      { ...result.state, inventory: makeInventory({ [CORE]: 9 }) },
      new Set(['a'])
    )
    expect(again.imbues).toBe(0)
  })
})
