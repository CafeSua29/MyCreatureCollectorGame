// Kiểm tra dữ liệu dấu ấn (docs/rules/marks.md): config.marks, marks.json theo loại, chỗ giữ
// `$target`, điều kiện DSL mới `species` / `skillBodyPart` dùng cho hook theo đối tượng.

import { describe, expect, it } from 'vitest'
import { checkAllConditions } from '../registries'
import type { MarkDef, RawGameData } from '../model'
import { dataIssuesAfter, FIXTURE_MARKS, makeMarkData, makeMonster } from '../testing'

const withMarks = (edit: (marks: MarkDef[], raw: RawGameData) => void): string =>
  dataIssuesAfter(
    (raw) => {
      raw.marks = FIXTURE_MARKS.map((def) => structuredClone(def))
      edit(raw.marks, raw)
    },
    { regenerateText: true }
  ).join('\n')

const find = (marks: MarkDef[], id: string): MarkDef => {
  const def = marks.find((each) => each.id === id)
  if (!def) throw new Error(`thiếu dấu ${id}`)
  return def
}

describe('marks.json', () => {
  it('fixture hợp lệ', () => {
    expect(withMarks(() => {})).toBe('')
  })

  it('bộ phận, trọng số, trạng thái, liên kết sai', () => {
    const issues = withMarks((marks) => {
      Object.assign(find(marks, 'blindEye'), { partId: 'fin', hardensInto: 'bossSlayer' })
      Object.assign(find(marks, 'limp'), { weight: 0 })
      Object.assign(find(marks, 'deepBurn'), { statusIds: ['ghost'] })
      Object.assign(find(marks, 'fearSpecies'), { resolveInto: 'bossSlayer' })
    })
    expect(issues).toContain('"blindEye".partId: bộ phận không tồn tại "fin"')
    expect(issues).toContain('"blindEye".hardensInto: phải là id chiến tích trigger "hardened"')
    expect(issues).toContain('"limp".weight')
    expect(issues).toContain('trạng thái không tồn tại "ghost"')
    expect(issues).toContain('"fearSpecies".resolveInto')
  })

  it('đối tượng: loại sai, targetIds sai loại, chiến tích resolve khác loại với ám ảnh', () => {
    const issues = withMarks((marks) => {
      Object.assign(find(marks, 'elementAdapted'), { target: 'species' })
      Object.assign(find(marks, 'weatherAdapted'), { targetIds: ['grassy'] })
      Object.assign(find(marks, 'conquerSpecies'), { target: 'element' })
    })
    expect(issues).toContain('"elementAdapted".target phải là một trong')
    expect(issues).toContain('targetIds: không phải đối tượng weather "grassy"')
    expect(issues).toContain('chiến tích phải cùng loại đối tượng')
  })

  it('chiến tích: trường theo cách nhận', () => {
    const issues = withMarks((marks) => {
      Object.assign(find(marks, 'bossSlayer'), { target: 'race', threshold: 2 })
      Object.assign(find(marks, 'raceSlayer'), { threshold: 0 })
      Object.assign(find(marks, 'warScarHead'), { partId: undefined })
    })
    expect(issues).toContain('trigger "bossKill" không có target')
    expect(issues).toContain('trigger "bossKill" không có threshold')
    expect(issues).toContain('"raceSlayer".threshold')
    expect(issues).toContain('"warScarHead".partId')
  })

  it('hook: chỗ giữ ở dấu không theo đối tượng, hook sai, trait lạ, trường lạ, maxLevel', () => {
    const issues = withMarks((marks) => {
      find(marks, 'limp').hooks = [
        { type: 'elementDamageTaken', params: { elementIds: ['$target'], percent: -5 } }
      ]
      find(marks, 'chestWound').hooks = [{ type: 'noSuchHook', params: {} }]
      Object.assign(find(marks, 'batWings'), { traitId: 'ghost' })
      Object.assign(find(marks, 'stoneHorn'), { color: 'red', maxLevel: 0 })
      Object.assign(find(marks, 'thirdEye'), { kind: 'tattoo' })
    })
    expect(issues).toContain('"limp": hook dùng $target')
    expect(issues).toContain('"noSuchHook" chưa có trong registry')
    expect(issues).toContain('trait không tồn tại "ghost"')
    expect(issues).toContain('trường "color" không thuộc dấu ấn')
    expect(issues).toContain('"stoneHorn".maxLevel')
    expect(issues).toContain('"thirdEye".kind không hợp lệ')
  })

  it('hook theo đối tượng được kiểm với đối tượng mẫu (tham số khác vẫn bị bắt)', () => {
    const issues = withMarks((marks) => {
      find(marks, 'elementAdapted').hooks = [
        { type: 'elementDamageTaken', params: { elementIds: ['$target'], percent: -500 } }
      ]
    })
    expect(issues).toContain('"elementAdapted".hooks: hook "elementDamageTaken"')
  })
})

describe('config.marks', () => {
  it('tỉ lệ 0–100, ngưỡng nguyên ≥ 1, bộ phận tồn tại, trường lạ', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.marks = {
        ...raw.config.marks,
        scarOnBreakPercent: 120,
        traumaThreshold: 0,
        critDefaultPartId: 'fin',
        treatCostPerLevel: -1
      }
      Object.assign(raw.config.marks, { extra: 1 })
    }).join('\n')
    expect(issues).toContain('config.marks.scarOnBreakPercent')
    expect(issues).toContain('config.marks.traumaThreshold')
    expect(issues).toContain('config.marks.critDefaultPartId: bộ phận không tồn tại "fin"')
    expect(issues).toContain('config.marks.treatCostPerLevel')
    expect(issues).toContain('trường "extra"')
  })
})

describe('điều kiện DSL species / skillBodyPart', () => {
  const data = makeMarkData()
  const self = makeMonster({ id: 'a' })
  const other = makeMonster({ id: 'b', speciesId: 'strongling', baseSpeciesId: 'strongling' })

  it('species: theo loài quyết định bộ phận của quái được xét', () => {
    const view = { data, self, other }
    expect(
      checkAllConditions(view, [{ if: 'species', who: 'other', speciesIds: ['strongling'] }])
    ).toBe(true)
    expect(
      checkAllConditions(view, [{ if: 'species', who: 'other', speciesIds: ['weakling'] }])
    ).toBe(false)
    // Không có quái `other` trong góc nhìn: không thỏa.
    expect(
      checkAllConditions({ data, self }, [
        { if: 'species', who: 'other', speciesIds: ['strongling'] }
      ])
    ).toBe(false)
  })

  it('skillBodyPart: skill ra chiêu bằng bộ phận', () => {
    const tail = { ...data.skills.strike, bodyPart: 'tail' }
    expect(
      checkAllConditions({ data, self, skill: tail }, [{ if: 'skillBodyPart', partIds: ['tail'] }])
    ).toBe(true)
    expect(
      checkAllConditions({ data, self, skill: data.skills.strike }, [
        { if: 'skillBodyPart', partIds: ['tail'] }
      ])
    ).toBe(false)
  })

  it('kiểm tra dữ liệu: loài / bộ phận lạ', () => {
    const issues = withMarks((marks) => {
      find(marks, 'fearSpecies').hooks = [
        {
          type: 'damageDealtModifier',
          params: { percent: -5, when: [{ if: 'species', who: 'other', speciesIds: ['ghost'] }] }
        },
        {
          type: 'damageDealtModifier',
          params: { percent: -5, when: [{ if: 'skillBodyPart', partIds: ['fin'] }] }
        }
      ]
    })
    expect(issues).toContain('loài không tồn tại "ghost"')
    expect(issues).toContain('bộ phận không tồn tại "fin"')
  })
})
