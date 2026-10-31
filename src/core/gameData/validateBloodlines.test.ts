// Kiểm tra dữ liệu huyết mạch và các điểm nối: điều kiện tiến hóa bloodlinePurity, điều kiện quái
// bloodline (phối hợp đội), tiến hóa giữ huyết mạch, ô khởi đầu bloodline (docs/rules/bloodline.md).

import { describe, expect, it } from 'vitest'
import { evolveMonster, levelEvolutionOptions } from '../progression'
import { matchesMonsterCondition, starterSlotPool } from '../registries'
import { createRng } from '../shared'
import {
  dataIssues,
  makeBloodlineData,
  makeBloodlineRawData,
  makeMonster,
  withFixtureText
} from '../testing'
import type { BloodlinePurity, Monster, RawGameData } from '../model'
import { createGameData } from './gameData'

const issuesAfter = (edit: (raw: RawGameData) => void): string[] => {
  const raw = makeBloodlineRawData()
  edit(raw)
  return dataIssues(withFixtureText(raw))
}

const nymph = (bloodlines: BloodlinePurity[], level = 1): Monster =>
  makeMonster({
    speciesId: 'nymph',
    baseSpeciesId: 'nymph',
    elementIds: ['grass'],
    level,
    bloodlines
  })

describe('bloodlines.json', () => {
  it('fixture huyết mạch hợp lệ', () => {
    expect(dataIssues(makeBloodlineRawData())).toEqual([])
  })

  it('loài tổ, luật thành viên, trait, Tinh huyết, trường lạ', () => {
    const issues = issuesAfter((raw) => {
      raw.bloodlines[0] = {
        id: 'wyrm',
        ancestorSpeciesIds: [],
        traitId: 'fast',
        essenceItemId: 'potion',
        extra: 1
      } as RawGameData['bloodlines'][number]
      raw.bloodlines[1] = {
        ...raw.bloodlines[1],
        ancestorSpeciesIds: ['megaWeakling'],
        raceIds: ['nope'],
        elementIds: ['ice'],
        excludeSpeciesIds: ['ghost']
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Huyết mạch "wyrm": trường "extra" không thuộc nhóm huyết mạch',
        'Huyết mạch "wyrm".ancestorSpeciesIds phải là danh sách không rỗng',
        'Huyết mạch "wyrm": cần ít nhất một trong raceIds / elementIds / speciesIds',
        'Huyết mạch "wyrm": traitId "fast" phải là trait loại bloodline',
        'Huyết mạch "wyrm": essenceItemId "potion" phải là vật phẩm tiêu hao có addPurity của nhóm',
        'Huyết mạch "stone": loài tổ "megaWeakling" phải là loài thường, không phải dạng trong trận',
        'Huyết mạch "stone".raceIds: race không tồn tại "nope"',
        'Huyết mạch "stone".elementIds: hệ không tồn tại "ice"',
        'Huyết mạch "stone".excludeSpeciesIds: loài không tồn tại "ghost"',
        // wyrmBlood không còn nhóm nào dùng.
        'Trait "wyrmBlood": trait huyết mạch phải đúng một nhóm dùng, có 0'
      ])
    )
  })

  it('addPurity của nhóm lạ, Tinh huyết sai nhóm', () => {
    const issues = issuesAfter((raw) => {
      const essence = raw.items.find((item) => item.id === 'stoneEssence')
      if (essence?.category === 'consumable') {
        essence.effects = [{ type: 'addPurity', params: { groupId: 'nope', amount: 0 } }]
      }
    })
    expect(issues.join('\n')).toMatch(/groupId: nhóm huyết mạch không tồn tại "nope"/)
    expect(issues.join('\n')).toMatch(/amount/)
    expect(issues.join('\n')).toMatch(/essenceItemId "stoneEssence"/)
  })
})

describe('config.bloodline', () => {
  it('báo lỗi khoảng độ thuần, mốc, số âm, trường lạ', () => {
    const issues = issuesAfter((raw) => {
      raw.config.bloodline = {
        ...raw.config.bloodline,
        wildPurityWeights: [
          { min: 10, max: 5, weight: 0 },
          { min: 0, max: 101, weight: -1 }
        ],
        milestones: [50, 50],
        breedDownPoints: 1.5,
        essenceDropChance: 101,
        mixAtFullPurity: -1,
        extra: 1
      } as RawGameData['config']['bloodline']
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'config.bloodline: trường "extra" không thuộc config',
        'config.bloodline.wildPurityWeights[0]: min (10) không được lớn hơn max (5)',
        'config.bloodline.wildPurityWeights[1].max phải là số nguyên 0–100, nhận 101',
        'config.bloodline.wildPurityWeights: tổng trọng số phải > 0',
        'config.bloodline.milestones phải tăng dần ngặt',
        'config.bloodline.breedDownPoints phải là số nguyên 0–100, nhận 1.5'
      ])
    )
    expect(issues.join('\n')).toMatch(/essenceDropChance/)
    expect(issues.join('\n')).toMatch(/mixAtFullPurity/)
    expect(issuesAfter((raw) => (raw.config.bloodline.milestones = []))).toContain(
      'config.bloodline.milestones phải là danh sách không rỗng'
    )
  })
})

describe('điểm nối', () => {
  it('điều kiện tiến hóa bloodlinePurity', () => {
    const raw = makeBloodlineRawData()
    const species = raw.species.find((s) => s.id === 'nymph')
    if (species?.kind === 'normal') {
      species.evolutions = [
        {
          speciesId: 'husk',
          level: 10,
          conditions: [{ type: 'bloodlinePurity', params: { groupId: 'wyrm', min: 30 } }]
        }
      ]
    }
    const data = createGameData(raw)
    const scene = { party: [], place: null, aptitudeFloor: 1, time: 0 }
    expect(
      levelEvolutionOptions(data, nymph([{ groupId: 'wyrm', purity: 30 }], 10), scene)
    ).toEqual(['husk'])
    expect(
      levelEvolutionOptions(data, nymph([{ groupId: 'wyrm', purity: 29.9 }], 10), scene)
    ).toEqual([])
    const bad = issuesAfter((r) => {
      const s = r.species.find((x) => x.id === 'nymph')
      if (s?.kind === 'normal') {
        s.evolutions = [
          {
            speciesId: 'husk',
            level: 10,
            conditions: [{ type: 'bloodlinePurity', params: { groupId: 'nope', min: 101 } }]
          }
        ]
      }
    })
    expect(bad.join('\n')).toMatch(/groupId: nhóm huyết mạch không tồn tại "nope"/)
  })

  it('điều kiện quái bloodline: huyết mạch chính thuộc nhóm', () => {
    const data = makeBloodlineData()
    const condition = { type: 'bloodline', groupId: 'stone' }
    expect(matchesMonsterCondition(data, condition, nymph([{ groupId: 'stone', purity: 5 }]))).toBe(
      true
    )
    const wyrmMain = nymph([
      { groupId: 'wyrm', purity: 6 },
      { groupId: 'stone', purity: 5 }
    ])
    expect(matchesMonsterCondition(data, condition, wyrmMain)).toBe(false)
    expect(matchesMonsterCondition(data, condition, nymph([]))).toBe(false)
  })

  it('tiến hóa giữ huyết mạch (cả chuỗi cùng nhóm)', () => {
    const data = makeBloodlineData()
    const bloodlines = [{ groupId: 'wyrm', purity: 40 }]
    const result = evolveMonster(data, nymph(bloodlines, 10), {
      toSpeciesId: 'husk',
      rng: createRng(1),
      day: 0
    })
    expect(result.monster.bloodlines).toEqual(bloodlines)
  })

  it('ô khởi đầu bloodline: chỉ loài dạng đầu thuộc ít nhất một nhóm', () => {
    const data = makeBloodlineData()
    expect(starterSlotPool(data, { conditions: [{ kind: 'bloodline' }] })).toEqual([
      'pebble',
      'nymph'
    ])
  })
})
