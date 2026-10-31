// Kiểm tra dữ liệu độ thân mật (docs/rules/affinity.md): config.affinity, affinityTiers.json,
// startAffinity của bóng, hook surviveLethal exceptFullHp.

import { describe, expect, it } from 'vitest'
import { dataIssuesAfter } from '../testing'
import type { Item } from '../model'

describe('affinityTiers.json', () => {
  it('fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('mức đầu phải từ 0, from tăng dần, không quá max, hook hợp lệ', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.affinityTiers = [
          { id: 'a', from: 5, hooks: [] },
          { id: 'b', from: 5, hooks: [{ type: 'nope', params: {} }] },
          { id: 'c', from: 300, hooks: [] }
        ]
      },
      { regenerateText: true }
    )
    expect(issues).toEqual([
      'Mức thân mật "a": mức đầu phải có from 0',
      'Mức thân mật "b": from phải tăng dần',
      'Mức thân mật "b": hook "nope" chưa có trong registry',
      'Mức thân mật "c": from tối đa 255, nhận 300'
    ])
  })

  it('không có mức nào', () => {
    const issues = dataIssuesAfter((raw) => (raw.affinityTiers = []), { regenerateText: true })
    expect(issues).toEqual(['affinityTiers: cần ít nhất một mức'])
  })
})

describe('config.affinity và bóng', () => {
  it('số sai: max, khởi đầu quá max, lượng âm', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.affinity.start.egg = 300
      raw.config.affinity.gain.win = -1
    })
    expect(issues).toEqual([
      'config.affinity.start.egg tối đa 255, nhận 300',
      'config.affinity.gain.win phải là số nguyên ≥ 0, nhận -1'
    ])
  })

  it('startAffinity của bóng: nguyên 0–max', () => {
    const ball = (startAffinity: number): Item =>
      ({ id: 'odd', category: 'ball', price: 1, catchMultiplier: 1, startAffinity }) as Item
    const issuesWith = (value: number): string[] =>
      dataIssuesAfter((raw) => raw.items.push(ball(value)), { regenerateText: true })
    expect(issuesWith(150)).toEqual([])
    expect(issuesWith(256)).toEqual(['Vật phẩm "odd": startAffinity tối đa 255, nhận 256'])
    expect(issuesWith(-1)).toEqual(['Vật phẩm "odd": startAffinity phải là số nguyên ≥ 0, nhận -1'])
  })

  it('surviveLethal: exceptFullHp chỉ ghi true, cùng fromFullHp = false', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.affinityTiers[1].hooks = [
        { type: 'surviveLethal', params: { fromFullHp: true, exceptFullHp: true } }
      ]
    })
    expect(issues).toEqual([
      'Mức thân mật "familiar": hook "surviveLethal": exceptFullHp chỉ được ghi true, cùng fromFullHp = false'
    ])
  })
})
