// Kiểm tra dữ liệu ngự thú sư (docs/rules/tamer.md): config.tamer, tamerSkills.json (mục tiêu
// quyết định registry hiệu ứng), tamerRealms.json, category material của Phá Cảnh Đan.

import { describe, expect, it } from 'vitest'
import { dataIssuesAfter } from '../testing'
import type { TamerSkill } from '../model'

const skill = (overrides: Partial<TamerSkill>): TamerSkill => ({
  id: 'probe',
  unlockRealm: 0,
  manaCost: 10,
  cooldown: 0,
  target: 'ally',
  effects: [{ type: 'healPercent', params: { percent: 10 } }],
  ...overrides
})

const issuesWith = (...skills: TamerSkill[]): string[] =>
  dataIssuesAfter((raw) => raw.tamerSkills.push(...skills), { regenerateText: true })

describe('tamerSkills.json', () => {
  it('fixture hợp lệ; mỗi loại mục tiêu dùng đúng registry', () => {
    expect(issuesWith(skill({}))).toEqual([])
    expect(
      issuesWith(
        skill({
          id: 'buff',
          target: 'allyOnField',
          effects: [{ type: 'statStage', params: { who: 'self', stat: 'speed', delta: 1 } }]
        })
      )
    ).toEqual([])
  })

  it('ally không nhận hiệu ứng skill, allyOnField không nhận hiệu ứng vật phẩm', () => {
    expect(
      issuesWith(
        skill({
          effects: [{ type: 'statStage', params: { who: 'self', stat: 'speed', delta: 1 } }]
        })
      )
    ).toEqual(['Kỹ năng ngự thú sư "probe": hook "statStage" chưa có trong registry'])
    expect(issuesWith(skill({ target: 'allyOnField' }))).toEqual([
      'Kỹ năng ngự thú sư "probe": hook "healPercent" chưa có trong registry'
    ])
  })

  it('field chỉ nhận hiệu ứng perSkill; không nhận hiệu ứng rút về', () => {
    expect(
      issuesWith(
        skill({
          target: 'field',
          effects: [{ type: 'statStage', params: { who: 'self', stat: 'speed', delta: 1 } }]
        })
      )
    ).toEqual([
      'Kỹ năng ngự thú sư "probe": mục tiêu "field" chỉ nhận hiệu ứng perSkill, "statStage" không phải'
    ])
    const switchIssues = issuesWith(
      skill({ target: 'allyOnField', effects: [{ type: 'switchOut', params: {} }] })
    )
    expect(switchIssues).toContain(
      'Kỹ năng ngự thú sư "probe": hiệu ứng "switchOut" không dùng cho kỹ năng ngự thú sư'
    )
  })

  it('số sai, mục tiêu lạ, trường lạ, không có hiệu ứng', () => {
    expect(issuesWith(skill({ manaCost: -1, cooldown: 1.5, usesPerBattle: 0 }))).toEqual([
      'Kỹ năng ngự thú sư "probe": manaCost phải là số nguyên ≥ 0, nhận -1',
      'Kỹ năng ngự thú sư "probe": cooldown phải là số nguyên ≥ 0, nhận 1.5',
      'Kỹ năng ngự thú sư "probe": usesPerBattle phải là số nguyên ≥ 1, nhận 0'
    ])
    // Ép kiểu để giả lập JSON sai.
    expect(issuesWith(skill({ target: 'enemy' as TamerSkill['target'] }))).toEqual([
      'Kỹ năng ngự thú sư "probe": target phải là một trong ally, allyOnField, field, wildFoe, merge'
    ])
    // Ép kiểu qua unknown để giả lập JSON có trường lạ.
    expect(issuesWith({ ...skill({}), power: 1 } as unknown as TamerSkill)).toEqual([
      'Kỹ năng ngự thú sư "probe": trường "power" không thuộc kỹ năng ngự thú sư'
    ])
    expect(issuesWith(skill({ effects: [] }))).toEqual([
      'Kỹ năng ngự thú sư "probe": cần ít nhất một hiệu ứng'
    ])
  })

  it('thiếu tên ở i18n: báo lỗi chữ', () => {
    const issues = dataIssuesAfter((raw) => raw.tamerSkills.push(skill({})))
    expect(issues).toContain('Ngôn ngữ "vi".tamerSkills: thiếu tên cho "probe"')
  })
})

describe('config.tamer và tamerRealms', () => {
  it('nguyên liệu đột phá phải là category material', () => {
    const issues = dataIssuesAfter((raw) => (raw.config.tamer.breakthrough.itemId = 'potion'))
    expect(issues).toEqual([
      'config.tamer.breakthrough.itemId phải là vật phẩm category "material", nhận "potion"'
    ])
  })

  it('số sai và mốc cảnh giới không tăng dần', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.tamer.expBase = 0
      raw.config.tamer.contract.levelBase = 0
      raw.config.tamer.realmMilestones = [5, 5]
    })
    expect(issues).toEqual([
      expect.stringContaining('config.tamer.expBase'),
      'config.tamer.contract.levelBase phải là số nguyên ≥ 1, nhận 0',
      'config.tamer.realmMilestones[1] phải là số nguyên ≥ 6, nhận 5'
    ])
  })

  it('cần ít nhất một tên cảnh giới', () => {
    const issues = dataIssuesAfter((raw) => (raw.tamerRealms = []), { regenerateText: true })
    expect(issues).toEqual(['tamerRealms: cần ít nhất một tên cảnh giới'])
  })

  it('material không nhận trường lạ', () => {
    const issues = dataIssuesAfter(
      (raw) =>
        raw.items.push({
          id: 'odd',
          category: 'material',
          price: 1,
          // Ép kiểu để giả lập JSON sai.
          effects: []
        } as unknown as (typeof raw.items)[number]),
      { regenerateText: true }
    )
    expect(issues).toEqual(['Vật phẩm "odd": trường "effects" không thuộc category "material"'])
  })
})
