// Kiểm tra dữ liệu Z-Move (docs/rules/z-moves.md): config, skill Z-Move, zPower, zEffects, Z-Crystal,
// learnset.

import { describe, expect, it } from 'vitest'
import { createGameData } from './gameData'
import { DataError } from '../shared'
import { defined, makeZMoveRawData, withFixtureText } from '../testing'
import type { RawGameData, Skill } from '../model'

/** Lỗi kiểm tra dữ liệu sau khi sửa dữ liệu Z-Move mẫu (chữ tạo lại để chỉ thấy lỗi cần xem). */
function issuesAfter(edit: (raw: RawGameData) => void): string[] {
  const raw = makeZMoveRawData()
  edit(raw)
  try {
    createGameData(withFixtureText(raw))
    return []
  } catch (error) {
    if (error instanceof DataError) return error.issues
    throw error
  }
}

const skillOf = (raw: RawGameData, id: string): Skill =>
  defined(
    raw.skills.find((skill) => skill.id === id),
    id
  )

const itemOf = (raw: RawGameData, id: string): Record<string, unknown> =>
  defined(
    raw.items.find((item) => item.id === id),
    id
  ) as unknown as Record<string, unknown>

describe('kiểm tra dữ liệu Z-Move', () => {
  it('dữ liệu mẫu hợp lệ', () => {
    expect(issuesAfter(() => {})).toEqual([])
  })

  it('config: Vòng Z phải là vật phẩm chìa khóa, số trong khoảng', () => {
    const issues = issuesAfter((raw) => {
      const zMove = raw.config.transform.zMove
      zMove.keyItemId = 'strike'
      zMove.protectDamagePercent = 101
      zMove.crystalDropChance = -1
      zMove.variableHitsPowerFactor = 0
      zMove.powerTable = { steps: [], top: 200 }
    })
    for (const field of [
      'keyItemId',
      'protectDamagePercent',
      'crystalDropChance',
      'variableHitsPowerFactor',
      'powerTable'
    ]) {
      expect(issues).toEqual(
        expect.arrayContaining([expect.stringContaining(`config.transform.zMove.${field}`)])
      )
    }
  })

  it('skill Z-Move: loại lạ, vừa là chiêu Max, Z-Move theo hệ không gây sát thương, có zPower', () => {
    const issues = issuesAfter((raw) => {
      Object.assign(skillOf(raw, 'weaklingCrash'), { zMove: 'mega' })
      Object.assign(skillOf(raw, 'breakneckBlitz'), { maxMove: 'max' })
      Object.assign(skillOf(raw, 'infernoOverdrive'), { power: 0, category: 'status', zPower: 5 })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Skill "weaklingCrash": zMove phải là một trong z, signature',
        'Skill "breakneckBlitz": không vừa là chiêu Max vừa là Z-Move',
        'Skill "infernoOverdrive": Z-Move theo hệ phải gây sát thương',
        'Skill "infernoOverdrive": Z-Move không có zPower / zEffects'
      ])
    )
  })

  it('mỗi hệ tối đa một Z-Move theo hệ', () => {
    const issues = issuesAfter((raw) => {
      raw.skills.push({ ...skillOf(raw, 'breakneckBlitz'), id: 'breakneckBlitz2' })
    })
    expect(issues).toContain('Z-Move: hệ "normal" có 2 Z-Move theo hệ (tối đa 1)')
  })

  it('zPower nguyên > 0 chỉ ở skill gây sát thương; zEffects chỉ ở skill trạng thái, đúng ngôn ngữ', () => {
    const issues = issuesAfter((raw) => {
      Object.assign(skillOf(raw, 'gigaSwing'), { zPower: 1.5 })
      Object.assign(skillOf(raw, 'idle'), { zPower: 100 })
      Object.assign(skillOf(raw, 'strike'), {
        zEffects: [{ do: 'heal', to: 'self', amount: { flat: 1 } }]
      })
      Object.assign(skillOf(raw, 'zPumpUp'), { zEffects: [{ do: 'nope', to: 'self' }] })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skill "gigaSwing": zPower'),
        'Skill "idle": zPower chỉ dùng cho skill gây sát thương',
        'Skill "strike": zEffects chỉ dùng cho skill trạng thái',
        expect.stringContaining('Skill "zPumpUp": zEffects')
      ])
    )
  })

  it('Z-Crystal hệ: hệ phải có Z-Move, không kèm trường của crystal loài', () => {
    const issues = issuesAfter((raw) => {
      Object.assign(itemOf(raw, 'fireZCrystal'), { elementId: 'ghost' })
      Object.assign(itemOf(raw, 'normalZCrystal'), { zSkillId: 'weaklingCrash' })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('elementId phải là hệ có Z-Move'),
        expect.stringContaining('crystal hệ không có zSkillId')
      ])
    )
  })

  it('Z-Crystal loài: skill gốc học được, zSkillId là Z-Move riêng, loài tồn tại, không lặp', () => {
    const issues = issuesAfter((raw) => {
      Object.assign(itemOf(raw, 'weaklingZCrystal'), {
        baseSkillId: 'maxStrike',
        zSkillId: 'breakneckBlitz',
        speciesIds: ['weakling', 'nope', 'weakling']
      })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('baseSkillId phải là skill học được'),
        expect.stringContaining('zSkillId phải là Z-Move riêng'),
        expect.stringContaining('loài không tồn tại "nope"'),
        expect.stringContaining('speciesIds bị lặp')
      ])
    )
  })

  it('learnset không có Z-Move', () => {
    const issues = issuesAfter((raw) => {
      const species = defined(
        raw.species.find((entry) => entry.id === 'weakling'),
        'weakling'
      )
      if (species.kind === 'normal') species.learnset.push({ level: 1, skillId: 'breakneckBlitz' })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Loài "weakling": learnset không được có chiêu Max / Z-Move "breakneckBlitz"'
      ])
    )
  })
})
