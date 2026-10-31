// Kiểm tra dữ liệu bước 3.4: trường lạ, hits, formOf / formKind, origin / source, genderless,
// bảng hitCountWeights, config.ai.

import { describe, expect, it } from 'vitest'
import { dataIssues, dataIssuesAfter, defined, makeRawData } from '../testing'
import type { NormalSpecies, RawGameData, Skill } from '../model'

/** Sửa dữ liệu fixture (tạo lại chữ) rồi trả về danh sách lỗi. */
const issuesAfter = (edit: (raw: RawGameData) => void): string[] =>
  dataIssuesAfter(edit, { regenerateText: true })

function species(raw: RawGameData, id: string): NormalSpecies {
  const found = raw.species.find((entry) => entry.id === id)
  if (found?.kind !== 'normal') throw new Error(`fixture: "${id}" không phải loài thường`)
  return found
}

const skill = (raw: RawGameData, id: string): Skill =>
  defined(raw.skills.find((entry) => entry.id === id))

/** Ghi một trường bất kỳ (kể cả trường lạ / sai kiểu) vào object dữ liệu thô. */
function setField(target: object, field: string, value: unknown): void {
  Object.assign(target, { [field]: value })
}

describe('trường lạ trong dữ liệu', () => {
  it('fixture không có trường lạ', () => {
    expect(dataIssues(makeRawData())).toEqual([])
  })

  it('báo trường lạ của loài, loài fused, skill, hits, hệ, race, trait, biome', () => {
    const issues = issuesAfter((raw) => {
      setField(species(raw, 'weakling'), 'name', 'Yếu')
      setField(defined(raw.species.find((s) => s.kind === 'fused')), 'raceId', 'neutral')
      setField(skill(raw, 'strike'), 'hit', { min: 2, max: 3 })
      setField(defined(skill(raw, 'flurry').hits), 'avg', 3)
      setField(raw.elements[0], 'color', 'red')
      setField(raw.races[0], 'name', 'x')
      setField(raw.traits[0], 'level', 1)
      setField(raw.biomes[0], 'levelMin', 1)
    }).join('\n')
    expect(issues).toContain('Loài "weakling": trường "name" không thuộc loài')
    expect(issues).toContain('Loài "fused": trường "raceId" không thuộc loài fused')
    expect(issues).toContain('Skill "strike": trường "hit" không thuộc skill')
    expect(issues).toContain('Skill "flurry".hits: trường "avg" không thuộc hits')
    expect(issues).toContain('Hệ "normal": trường "color" không thuộc hệ')
    expect(issues).toContain('Race "neutral": trường "name" không thuộc race')
    expect(issues).toContain('Trait "fast": trường "level" không thuộc trait')
    expect(issues).toContain('Biome "field": trường "levelMin" không thuộc biome')
  })

  it('báo trường lạ trong tiến hóa, learnset, boss của biome', () => {
    const issues = issuesAfter((raw) => {
      setField(species(raw, 'weakling').evolutions[0], 'stone', 'fireStone')
      setField(species(raw, 'weakling').learnset[0], 'tm', true)
      setField(raw.biomes[0].bosses[0], 'level', 5)
    }).join('\n')
    expect(issues).toContain('Loài "weakling".evolutions[0]: trường "stone" không thuộc tiến hóa')
    expect(issues).toContain('Loài "weakling".learnset[0]: trường "tm" không thuộc learnset')
    expect(issues).toContain('Biome "field".bosses[0]: trường "level" không thuộc boss của biome')
  })

  it('vật phẩm vẫn báo trường lạ theo category', () => {
    const issues = issuesAfter((raw) => setField(raw.items[0], 'name', 'Thuốc'))
    expect(issues).toContain('Vật phẩm "potion": trường "name" không thuộc category "consumable"')
  })
})

describe('skill đánh nhiều lần (hits)', () => {
  it.each([
    ['min > max', { min: 3, max: 2 }, /hits\.max phải là số nguyên ≥ 3/],
    ['min = 0', { min: 0, max: 2 }, /hits\.min phải là số nguyên ≥ 1/],
    ['không nguyên', { min: 2, max: 2.5 }, /hits\.max phải là số nguyên/],
    ['không phải object', 3, /hits phải là object/]
  ])('%s thì DataError', (_label, hits, pattern) => {
    const issues = issuesAfter((raw) => setField(skill(raw, 'flurry'), 'hits', hits))
    expect(issues.join('\n')).toMatch(pattern)
  })

  it('biên hợp lệ: 1 đòn và số đòn lớn', () => {
    expect(issuesAfter((raw) => (skill(raw, 'flurry').hits = { min: 1, max: 1 }))).toEqual([])
    expect(
      issuesAfter((raw) => (skill(raw, 'flurry').hits = { min: 1, max: Number.MAX_SAFE_INTEGER }))
    ).toEqual([])
  })

  it('chỉ cho skill gây sát thương nhắm "enemy"', () => {
    const expected = 'hits chỉ dùng cho skill gây sát thương nhắm "enemy"'
    const spread = issuesAfter((raw) => (skill(raw, 'wave').hits = { min: 2, max: 2 }))
    expect(spread).toContain(`Skill "wave": ${expected}`)
    const status = issuesAfter((raw) => (skill(raw, 'pumpUp').hits = { min: 2, max: 2 }))
    expect(status).toContain(`Skill "pumpUp": ${expected}`)
  })
})

describe('config.battle.hitCountWeights', () => {
  const issuesWith = (table: unknown): string =>
    issuesAfter((raw) => setField(raw.config.battle, 'hitCountWeights', table)).join('\n')

  it('danh sách rỗng hợp lệ (mọi khoảng chia đều)', () => {
    expect(issuesWith([])).toBe('')
  })

  it('báo lỗi số trọng số sai, trọng số ≤ 0, khoảng sai, khoảng trùng, không phải danh sách', () => {
    expect(issuesWith([{ min: 2, max: 5, weights: [1, 1] }])).toMatch(/weights cần 4 trọng số > 0/)
    expect(issuesWith([{ min: 2, max: 3, weights: [1, 0] }])).toMatch(/weights cần 2 trọng số > 0/)
    expect(issuesWith([{ min: 3, max: 2, weights: [] }])).toMatch(/max phải là số nguyên ≥ 3/)
    const twice = { min: 2, max: 3, weights: [1, 1] }
    expect(issuesWith([twice, twice])).toMatch(/khoảng 2-3 bị khai báo hai lần/)
    expect(issuesWith(undefined)).toMatch(/hitCountWeights phải là danh sách/)
  })
})

describe('config.ai (AI trận đấu)', () => {
  it('trọng số 0 hợp lệ (tắt thành phần đó)', () => {
    const issues = issuesAfter((raw) => {
      raw.config.ai = {
        koBonus: 0,
        lowHpTargetWeight: 0,
        stageValuePerStep: 0,
        healWeight: 0,
        statusWeights: { poison: 0, burn: 0, paralysis: 0, sleep: 0 },
        fieldWeight: 0,
        defendWeight: 0,
        provokeWeight: 0,
        minionWeight: 0,
        spellEffectWeight: 0,
        transformMinGain: 0,
        reviveBonus: 0,
        tamerSkillMinScore: 0,
        holdTurnWeight: 0
      }
    })
    expect(issues).toEqual([])
  })

  it('báo lỗi số âm, không phải số, thiếu cả mục ai', () => {
    const negative = issuesAfter((raw) => (raw.config.ai.koBonus = -1))
    expect(negative.join('\n')).toMatch(/config\.ai\.koBonus/)
    const text = issuesAfter((raw) => setField(raw.config.ai, 'healWeight', '1'))
    expect(text.join('\n')).toMatch(/config\.ai\.healWeight/)
    const missing = issuesAfter((raw) => setField(raw.config, 'ai', undefined)).join('\n')
    for (const field of ['koBonus', 'lowHpTargetWeight', 'stageValuePerStep', 'healWeight']) {
      expect(missing).toContain(`config.ai.${field}`)
    }
  })
})

describe('dạng của loài (formOf / formKind)', () => {
  it('formOf và formKind phải đi cùng nhau', () => {
    const issues = issuesAfter((raw) => delete species(raw, 'megaWeakling').formKind)
    expect(issues).toContain('Loài "megaWeakling": formOf và formKind phải đi cùng nhau')
    const kindOnly = issuesAfter((raw) => delete species(raw, 'megaWeakling').formOf)
    expect(kindOnly).toContain('Loài "megaWeakling": formOf và formKind phải đi cùng nhau')
  })

  it('formKind phải thuộc FORM_KINDS', () => {
    const issues = issuesAfter((raw) => setField(species(raw, 'megaWeakling'), 'formKind', 'ultra'))
    expect(issues.join('\n')).toMatch(/Loài "megaWeakling": formKind phải là một trong mega/)
  })

  it('formOf phải trỏ tới loài gốc tồn tại, không phải chính nó, cùng race', () => {
    const missing = issuesAfter((raw) => (species(raw, 'megaWeakling').formOf = 'ghost'))
    expect(missing).toContain('Loài "megaWeakling": formOf trỏ tới loài không tồn tại "ghost"')
    const self = issuesAfter((raw) => (species(raw, 'megaWeakling').formOf = 'megaWeakling'))
    expect(self).toContain('Loài "megaWeakling": formOf không được trỏ tới chính nó')
    const fused = issuesAfter((raw) => (species(raw, 'megaWeakling').formOf = 'fused'))
    expect(fused).toContain('Loài "megaWeakling": formOf trỏ tới loài không tồn tại "fused"')
    const race = issuesAfter((raw) => (species(raw, 'megaWeakling').formOf = 'brawler'))
    expect(race).toContain(
      'Loài "megaWeakling": dạng phải cùng race với loài gốc (neutral ≠ brute)'
    )
  })

  it('formOf không được trỏ tới một dạng khác', () => {
    const issues = issuesAfter((raw) => {
      Object.assign(species(raw, 'strongling'), { formOf: 'megaWeakling', formKind: 'alternate' })
    })
    expect(issues).toContain(
      'Loài "strongling": formOf "megaWeakling" là một dạng khác, phải trỏ tới loài gốc'
    )
  })
})

describe('nguồn gốc loài (origin / source)', () => {
  it('origin phải thuộc SPECIES_ORIGINS', () => {
    const issues = issuesAfter((raw) => setField(species(raw, 'nymph'), 'origin', 'alien'))
    expect(issues.join('\n')).toMatch(/Loài "nymph": origin phải là một trong living/)
  })

  it('myth / fantasy / scifi cần source', () => {
    for (const origin of ['myth', 'fantasy', 'scifi'] as const) {
      const issues = issuesAfter((raw) => {
        species(raw, 'pebble').origin = origin
        delete species(raw, 'pebble').source
      })
      expect(issues).toContain(`Loài "pebble": origin "${origin}" cần source`)
    }
  })

  it('living / extinct / cryptid không được có source', () => {
    for (const origin of ['living', 'extinct', 'cryptid'] as const) {
      const issues = issuesAfter((raw) => {
        species(raw, 'nymph').origin = origin
        species(raw, 'nymph').source = 'lore'
      })
      expect(issues).toContain(`Loài "nymph": origin "${origin}" không được có source`)
    }
  })

  it('không có origin thì không có source; source phải là chuỗi không rỗng', () => {
    const noOrigin = issuesAfter((raw) => (species(raw, 'weakling').source = 'lore'))
    expect(noOrigin).toContain('Loài "weakling": không có origin thì không có source')
    const empty = issuesAfter((raw) => (species(raw, 'pebble').source = ''))
    expect(empty).toContain('Loài "pebble": source phải là chuỗi không rỗng')
    const number = issuesAfter((raw) => setField(species(raw, 'pebble'), 'source', 3))
    expect(number).toContain('Loài "pebble": source phải là chuỗi không rỗng')
  })
})

describe('loài không giới tính (genderless)', () => {
  it('chỉ được là true', () => {
    const issues = issuesAfter((raw) => setField(species(raw, 'weakling'), 'genderless', false))
    expect(issues).toContain(
      'Loài "weakling": genderless chỉ được là true (bỏ trống = có giới tính)'
    )
  })
})
