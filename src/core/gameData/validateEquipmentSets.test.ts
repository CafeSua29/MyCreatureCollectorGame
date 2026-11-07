// Kiểm tra dữ liệu bộ trang bị (docs/rules/equipment-sets.md): equipmentSets.json, setId trên món gốc,
// config.equipmentSets.

import { describe, expect, it } from 'vitest'
import {
  dataIssues,
  makeRawData,
  withEquipmentFixtures,
  withEquipmentSetFixtures,
  withFixtureText
} from '../testing'
import type { EquipmentSetDef, RawGameData } from '../model'

/** Lỗi kiểm tra dữ liệu của fixture có bộ mẫu sau khi sửa. */
function issuesAfter(edit: (raw: RawGameData) => void): string {
  const raw = withEquipmentFixtures(makeRawData())
  withEquipmentSetFixtures(raw)
  edit(raw)
  return dataIssues(withFixtureText(raw)).join('\n')
}

const editSet =
  (id: string, change: (set: EquipmentSetDef) => EquipmentSetDef) =>
  (raw: RawGameData): void => {
    raw.equipmentSets = raw.equipmentSets.map((set) => (set.id === id ? change(set) : set))
  }

describe('kiểm tra dữ liệu bộ trang bị', () => {
  it('fixture có bộ mẫu hợp lệ', () => {
    expect(issuesAfter(() => {})).toBe('')
  })

  it('bộ ngẫu nhiên: size < 2, weight âm, hook sai, cờ khác true báo lỗi', () => {
    expect(
      issuesAfter(editSet('guard', (set) => ({ ...set, size: 1 }) as EquipmentSetDef))
    ).toContain('size')
    expect(
      issuesAfter(editSet('guard', (set) => ({ ...set, weight: -1 }) as EquipmentSetDef))
    ).toContain('weight')
    expect(
      issuesAfter(
        editSet(
          'guard',
          (set) => ({ ...set, hooks: [{ type: 'nope', params: {} }] }) as EquipmentSetDef
        )
      )
    ).toContain('nope')
    expect(
      issuesAfter(editSet('guard', (set) => ({ ...set, hooks: [] }) as EquipmentSetDef))
    ).toContain('hooks')
    expect(
      issuesAfter(
        editSet('guard', (set) => ({ ...set, seal: false }) as unknown as EquipmentSetDef)
      )
    ).toContain('seal chỉ được là true')
  })

  it('bộ vô hình không có hook, không seal; kind lạ báo lỗi', () => {
    expect(
      issuesAfter(
        editSet(
          'wild',
          (set) =>
            ({
              ...set,
              hooks: [{ type: 'statModifier', params: { percent: { attack: 1 } } }]
            }) as EquipmentSetDef
        )
      )
    ).toContain('bộ vô hình không có hook')
    expect(
      issuesAfter(
        editSet('wild', (set) => ({ ...set, kind: 'other' }) as unknown as EquipmentSetDef)
      )
    ).toContain('kind')
  })

  it('bộ đặt tên: mốc không tăng dần, vượt số món, dưới 2 món báo lỗi', () => {
    const bonus = { hooks: [{ type: 'statModifier', params: { percent: { attack: 1 } } }] }
    expect(
      issuesAfter(
        editSet('knight', (set) => ({
          ...set,
          bonuses: [
            { pieces: 3, ...bonus },
            { pieces: 2, ...bonus }
          ]
        }))
      )
    ).toContain('tăng dần')
    expect(
      issuesAfter(editSet('knight', (set) => ({ ...set, bonuses: [{ pieces: 4, ...bonus }] })))
    ).toContain('vượt số món')
    expect(
      issuesAfter(editSet('knight', (set) => ({ ...set, bonuses: [{ pieces: 1, ...bonus }] })))
    ).toContain('pieces')
  })

  it('món gốc và bộ không khớp hai chiều báo lỗi', () => {
    // Bộ ghi món không ghi ngược setId.
    expect(
      issuesAfter(
        editSet('twins', (set) =>
          set.kind === 'named' ? { ...set, pieceItemIds: [...set.pieceItemIds, 'sword'] } : set
        )
      )
    ).toContain('không ghi setId "twins"')
    // Món ghi setId bộ đặt tên nhưng bộ không liệt kê món.
    expect(
      issuesAfter(
        editSet('knight', (set) =>
          set.kind === 'named' ? { ...set, pieceItemIds: ['knightHelm', 'knightPlate'] } : set
        )
      )
    ).toContain('không ghi món này')
    // setId tới bộ không tồn tại.
    expect(
      issuesAfter((raw) => {
        raw.items = raw.items.map((item) =>
          item.id === 'sword' ? { ...item, setId: 'missing' } : item
        )
      })
    ).toContain('bộ không tồn tại "missing"')
  })

  it('bậc unique chỉ gồm món unique; món bộ thường chỉ có khoảng bậc của bộ, không bán', () => {
    expect(issuesAfter(editSet('knight', (set) => ({ ...set, rarity: 'unique' })))).toContain(
      'chỉ gồm món unique'
    )
    expect(
      issuesAfter((raw) => {
        raw.items = raw.items.map((item) =>
          item.id === 'twinLeft' ? { ...item, shop: true } : item
        )
      })
    ).toContain('không bán ở cửa hàng')
    expect(issuesAfter(editSet('twins', (set) => ({ ...set, rarity: 'epic' })))).toContain(
      'chỉ có khoảng dòng chính cho bậc "epic"'
    )
  })

  it('danh sách rơi của map không chứa món bộ đặt tên', () => {
    expect(
      issuesAfter((raw) => {
        raw.biomes = raw.biomes.map((biome) => ({
          ...biome,
          equipmentDrops: [{ itemId: 'knightHelm', weight: 1 }]
        }))
      })
    ).toContain('món bộ đặt tên "knightHelm"')
  })

  it('config.equipmentSets: tỉ lệ ngoài [0, 100], reductionMinPieces < 2, thiếu bậc báo lỗi', () => {
    const issues = issuesAfter((raw) => {
      raw.config.equipmentSets = {
        pieceChance: { wild: 101, boss: -1, chest: 0, auction: 100 },
        reductionMinPieces: 1,
        rerollMoney: { common: 1 } as never
      }
    })
    expect(issues).toContain('pieceChance.wild')
    expect(issues).toContain('pieceChance.boss')
    expect(issues).toContain('reductionMinPieces')
    expect(issues).toContain('rerollMoney.legendary')
  })

  it('hook setPieceReduction: value nguyên ≥ 1', () => {
    expect(
      issuesAfter((raw) => {
        raw.items = raw.items.map((item) =>
          item.id === 'signet' && item.category === 'equipment'
            ? { ...item, hooks: [{ type: 'setPieceReduction', params: { value: 0 } }] }
            : item
        )
      })
    ).toContain('value')
  })
})
