// Kiểm tra dữ liệu phối hợp đội (docs/rules/team.md): synergies, formations, trận đồ, comboSkills,
// config.formations / config.combo.

import { describe, expect, it } from 'vitest'
import { dataIssues, makeTeamRawData, withFixtureText } from '../testing'
import type { RawGameData } from '../model'

function issuesAfter(edit: (raw: RawGameData) => void): string[] {
  const raw = makeTeamRawData()
  edit(raw)
  return dataIssues(withFixtureText(raw))
}

describe('dữ liệu phối hợp đội', () => {
  it('fixture hợp lệ; hợp kích kỹ nằm trong chỉ mục skill', () => {
    expect(dataIssues(makeTeamRawData())).toEqual([])
  })

  it('cộng hưởng: điều kiện lạ / trường lạ, count không tăng / vượt đội, hook đổi hp', () => {
    const issues = issuesAfter((raw) => {
      raw.synergies[0].match = { type: 'race', raceId: 'nope', extra: 1 }
      raw.synergies[0].tiers = [
        { count: 3, hooks: [{ type: 'statModifier', params: { percent: { hp: 5 } } }] },
        { count: 3, hooks: [{ type: 'statModifier', params: { percent: { attack: 5 } } }] },
        { count: 7, hooks: [{ type: 'aura', params: {} }] }
      ]
      raw.synergies[1].match = { type: 'luck' }
    })
    expect(issues).toEqual([
      'Cộng hưởng "bruteKin": match: trường "extra" không thuộc loại "race"',
      'Cộng hưởng "bruteKin": match: raceId: race không tồn tại "nope"',
      'Cộng hưởng "bruteKin": tiers[0]: hooks[0]: cộng hưởng không được đổi hp',
      'Cộng hưởng "bruteKin": tiers[1]: count phải tăng dần',
      'Cộng hưởng "bruteKin": tiers[2]: count tối đa bằng số quái trong đội (6)',
      'Cộng hưởng "bruteKin": tiers[2]: hooks[0]: hook "aura" không dùng được trong cộng hưởng',
      'Cộng hưởng "fireAttuned": match: loại "luck" chưa có trong registry'
    ])
  })

  it('trận pháp: requires rỗng / sai, hook rỗng, thiếu hoặc thừa trận đồ', () => {
    const issues = issuesAfter((raw) => {
      raw.formations[0].requires = []
      raw.formations[1].requires = [{ type: 'distinctElements', count: 0 }]
      raw.formations[2].hooks = []
      raw.items = raw.items.filter((item) => item.id !== 'dualityScroll')
      raw.items.push({
        id: 'extraScroll',
        category: 'formationScroll',
        price: 1,
        formationId: 'bruteGate'
      })
    })
    expect(issues).toEqual([
      'Trận pháp "duality": requires phải là danh sách không rỗng',
      'Trận pháp "bruteGate": requires[0]: count phải là số nguyên ≥ 1, nhận 0',
      'Trận pháp "fireGrass": hooks phải là danh sách không rỗng',
      'Trận pháp "duality": cần đúng một trận đồ, có 0',
      'Trận pháp "bruteGate": cần đúng một trận đồ, có 2'
    ])
  })

  it('trận đồ trỏ tới trận pháp lạ', () => {
    const issues = issuesAfter((raw) => {
      raw.items.push({ id: 'badScroll', category: 'formationScroll', price: 1, formationId: 'x' })
    })
    expect(issues).toContain('Vật phẩm "badScroll": formationId phải là trận pháp, nhận "x"')
  })

  it('hợp kích kỹ: pair sai số lượng, trùng id skill thường, nằm trong learnset, là chiêu Max', () => {
    const issues = issuesAfter((raw) => {
      raw.comboSkills[0].pair = [{ type: 'element', elementId: 'fire' }] as never
      raw.comboSkills[1].maxMove = 'max'
      raw.comboSkills.push({ ...raw.comboSkills[1], id: 'strike', maxMove: undefined })
      const weakling = raw.species.find((s) => s.id === 'weakling')
      if (weakling?.kind === 'normal') weakling.learnset.push({ level: 2, skillId: 'comboBlaze' })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'comboSkills: id "strike" trùng skill thường',
        'Hợp kích kỹ "comboBlaze": pair phải là danh sách đúng 2 điều kiện',
        'Hợp kích kỹ "comboTwin": không được là chiêu Max / Z-Move / Tera Blast',
        'Loài "weakling": learnset có hợp kích kỹ "comboBlaze"'
      ])
    )
  })

  it('config: minAffinity vượt affinity.max; trận đồ rơi phải là vật phẩm rơi được', () => {
    const issues = issuesAfter((raw) => {
      raw.config.combo = { minAffinity: 256 }
      raw.config.formations = { floorBossDrops: [{ itemId: 'nope', chance: 5 }] }
    })
    expect(issues).toEqual([
      'config.formations.floorBossDrops: vật phẩm rơi không tồn tại "nope"',
      'config.combo.minAffinity tối đa 255 (affinity.max), nhận 256'
    ])
  })
})
