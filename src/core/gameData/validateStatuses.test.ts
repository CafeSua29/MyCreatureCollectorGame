// Kiểm tra dữ liệu trạng thái bất thường: statuses.json, miễn nhiễm theo hệ, hook / hiệu ứng mới,
// vật phẩm ném, config.status, config.ai.statusWeights.

import { describe, expect, it } from 'vitest'
import { createGameData } from './gameData'
import { dataIssuesAfter, defined, makeRawData } from '../testing'
import type { ConsumableItem, ElementDef, RawGameData, StatusDef } from '../model'

/** Sửa dữ liệu fixture rồi trả về các lỗi gộp thành một chuỗi (rỗng nếu hợp lệ). */
const issuesAfter = (edit: (raw: RawGameData) => void): string =>
  dataIssuesAfter(edit, { regenerateText: true }).join('\n')

const status = (raw: RawGameData, id: string): StatusDef =>
  defined(
    raw.statuses.find((entry) => entry.id === id),
    `trạng thái ${id}`
  )

describe('statuses.json', () => {
  it('fixture hợp lệ', () => {
    expect(issuesAfter(() => undefined)).toBe('')
  })

  it('thời hạn: số nguyên 1 ≤ min ≤ max; min = max hợp lệ', () => {
    expect(issuesAfter((raw) => (status(raw, 'sleep').duration = { min: 2, max: 2 }))).toBe('')
    expect(issuesAfter((raw) => (status(raw, 'sleep').duration = { min: 0, max: 2 }))).toMatch(
      /Trạng thái "sleep": duration\.min/
    )
    expect(issuesAfter((raw) => (status(raw, 'sleep').duration = { min: 3, max: 2 }))).toMatch(
      /duration\.max phải là số nguyên ≥ 3/
    )
    expect(issuesAfter((raw) => (status(raw, 'sleep').duration = { min: 1.5, max: 2 }))).toMatch(
      /duration\.min/
    )
  })

  it('hook: phải có trong registry, params hợp lệ, ít nhất một hook', () => {
    expect(issuesAfter((raw) => (status(raw, 'poison').hooks = []))).toMatch(/cần ít nhất một hook/)
    expect(
      issuesAfter((raw) => (status(raw, 'poison').hooks = [{ type: 'explode', params: {} }]))
    ).toMatch(/hook "explode" chưa có trong registry/)
    const bad = issuesAfter((raw) => {
      status(raw, 'poison').hooks = [
        { type: 'turnEndDamage', params: { percent: 0 } },
        { type: 'skipTurn', params: { chance: 101 } },
        { type: 'statMultiplier', params: { stat: 'hp', multiplier: 0.5 } },
        { type: 'damageDealtMultiplier', params: { category: 'status', multiplier: -1 } }
      ]
    })
    expect(bad).toMatch(/turnEndDamage.*percent/)
    expect(bad).toMatch(/skipTurn.*chance/)
    expect(bad).toMatch(/stat phải là chỉ số khác hp/)
    expect(bad).toMatch(/category phải là "physical" hoặc "special"/)
    expect(bad).toMatch(/multiplier/)
  })

  it('trường lạ, id trùng, thiếu tên ở i18n', () => {
    expect(issuesAfter((raw) => Object.assign(status(raw, 'burn'), { name: 'Bỏng' }))).toMatch(
      /Trạng thái "burn": trường "name" không thuộc trạng thái/
    )
    expect(
      issuesAfter((raw) => Object.assign(defined(status(raw, 'burn').duration), { avg: 2 }))
    ).toMatch(/duration: trường "avg"/)
    expect(issuesAfter((raw) => raw.statuses.push({ ...status(raw, 'burn') }))).toMatch(
      /statuses: id "burn" bị trùng/
    )
    const raw = makeRawData()
    delete raw.text.languages.en.content.statuses.sleep
    expect(() => createGameData(raw)).toThrow(/Ngôn ngữ "en"\.statuses: thiếu tên cho "sleep"/)
  })
})

describe('miễn nhiễm theo hệ (statusImmunities)', () => {
  const fire = (raw: RawGameData): ElementDef => defined(raw.elements.find((e) => e.id === 'fire'))

  it('trạng thái phải tồn tại, không lặp, là danh sách', () => {
    expect(issuesAfter((raw) => (fire(raw).statusImmunities = ['curse']))).toMatch(
      /Hệ "fire": statusImmunities: trạng thái không tồn tại "curse"/
    )
    expect(issuesAfter((raw) => (fire(raw).statusImmunities = ['burn', 'burn']))).toMatch(
      /statusImmunities bị lặp/
    )
    expect(issuesAfter((raw) => Object.assign(fire(raw), { statusImmunities: 'burn' }))).toMatch(
      /statusImmunities phải là danh sách/
    )
    expect(issuesAfter((raw) => delete fire(raw).statusImmunities)).toBe('')
  })
})

describe('hook trait, hiệu ứng skill và vật phẩm', () => {
  it('statusImmunity / applyStatus / cureStatus: trạng thái phải tồn tại', () => {
    const issues = issuesAfter((raw) => {
      defined(raw.traits.find((t) => t.id === 'immunity')).hooks = [
        { type: 'statusImmunity', params: { statusIds: ['curse'] } }
      ]
      defined(raw.skills.find((s) => s.id === 'toxin')).effects = [
        { type: 'applyStatus', params: { statusId: 'curse', chance: 150 } }
      ]
      const antidote = defined(raw.items.find((i) => i.id === 'antidote'))
      if (antidote.category === 'consumable') {
        antidote.effects = [{ type: 'cureStatus', params: { statusIds: [] } }]
      }
    })
    expect(issues).toMatch(/Trait "immunity".*statusIds: trạng thái không tồn tại "curse"/)
    expect(issues).toMatch(/Skill "toxin".*trạng thái không tồn tại "curse"/)
    expect(issues).toMatch(/Skill "toxin".*chance/)
    expect(issues).toMatch(/Vật phẩm "antidote".*statusIds phải là danh sách không rỗng/)
  })

  it('vật phẩm: target bắt buộc; vật phẩm ném phải use "battle" và dùng hiệu ứng skill', () => {
    const consumable = (raw: RawGameData, id: string): ConsumableItem => {
      const item = defined(raw.items.find((i) => i.id === id))
      if (item.category !== 'consumable') throw new Error(`fixture: "${id}" không phải consumable`)
      return item
    }
    expect(issuesAfter((raw) => setUnknown(consumable(raw, 'potion'), 'target', 'self'))).toMatch(
      /Vật phẩm "potion": target phải là "ally" hoặc "enemy"/
    )
    expect(issuesAfter((raw) => (consumable(raw, 'poisonBomb').use = 'both'))).toMatch(
      /vật phẩm ném \(target "enemy"\) phải có use "battle"/
    )
    // Hiệu ứng thuốc (registry vật phẩm) không dùng được cho vật phẩm ném và ngược lại.
    expect(issuesAfter((raw) => (consumable(raw, 'potion').target = 'enemy'))).toMatch(
      /hook "healPercent" chưa có trong registry/
    )
    expect(issuesAfter((raw) => (consumable(raw, 'poisonBomb').target = 'ally'))).toMatch(
      /hook "applyStatus" chưa có trong registry/
    )
  })
})

describe('config', () => {
  it('status.bossDamageMultiplier ≥ 0', () => {
    expect(issuesAfter((raw) => (raw.config.status.bossDamageMultiplier = 0))).toBe('')
    expect(issuesAfter((raw) => (raw.config.status.bossDamageMultiplier = -0.5))).toMatch(
      /config\.status\.bossDamageMultiplier/
    )
  })

  it('ai.statusWeights: đủ mọi trạng thái, không thừa, số ≥ 0', () => {
    expect(issuesAfter((raw) => delete raw.config.ai.statusWeights.sleep)).toMatch(
      /config\.ai\.statusWeights: thiếu trọng số cho trạng thái "sleep"/
    )
    expect(issuesAfter((raw) => (raw.config.ai.statusWeights.curse = 1))).toMatch(
      /statusWeights: trạng thái không tồn tại "curse"/
    )
    expect(issuesAfter((raw) => (raw.config.ai.statusWeights.burn = -1))).toMatch(
      /config\.ai\.statusWeights\.burn/
    )
    expect(
      issuesAfter((raw) => Object.assign(raw.config.ai, { statusWeights: undefined }))
    ).toMatch(/config\.ai\.statusWeights phải là object/)
  })
})

/** Ghi một trường bất kỳ (kể cả sai kiểu) vào object dữ liệu thô. */
function setUnknown(target: object, field: string, value: unknown): void {
  Object.assign(target, { [field]: value })
}
