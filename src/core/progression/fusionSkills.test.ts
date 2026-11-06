import { describe, expect, it } from 'vitest'
import { fuseMonsters, previewFusion } from './fusion'
import { inheritableSkillIds, parseSkillInheritance, type SkillInheritance } from './fusionSkills'
import { masteryExpForLevel, relearnableSkills, validateMonster } from '../monster'
import { gameReducer } from '../game'
import { cloneData, createRng, toBig } from '../shared'
import { createInventory } from '../inventory'
import {
  dataIssuesAfter,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster
} from '../testing'
import type { GameState, Monster, SkillMastery } from '../model'

// Fixture: tối đa 4 skill, kế thừa tối đa 2 (config.fusion.inheritSkills), fuse luôn thành công.
const data = makeData()

const mastery = (level: number): SkillMastery => ({ level, exp: masteryExpForLevel(data, level) })

const sub = makeMonster({
  id: 'b',
  speciesId: 'twig',
  baseSpeciesId: 'twig',
  skillIds: ['strike', 'blast', 'wave', 'flurry'],
  skillMastery: { blast: mastery(7), wave: mastery(1), flurry: mastery(2) }
})

const fuseWith = (
  base: Monster,
  inheritSkillIds: string[],
  forgetSkillIds: string[] = []
): Monster =>
  fuseMonsters(data, createRng(1), base, sub, {
    inheritance: parseSkillInheritance(data, base, sub, { inheritSkillIds, forgetSkillIds })
  })[0]

describe('kế thừa skill khi fuse — học ngay / chờ học', () => {
  it('còn ô: học ngay, ghi extraSkillIds, quái hợp lệ', () => {
    const base = makeMonster({ id: 'a', skillIds: ['strike', 'quick'] })
    const fused = fuseWith(base, ['blast', 'wave'])
    expect(fused.skillIds).toEqual(['strike', 'quick', 'blast', 'wave'])
    expect(fused.extraSkillIds).toEqual(['blast', 'wave'])
    expect(fused.pendingSkillIds).toEqual([])
    expect(validateMonster(data, fused)).toEqual([])
  })

  it('còn 1 ô: skill đầu học ngay, skill sau vào chờ học', () => {
    const base = makeMonster({ id: 'a', skillIds: ['strike', 'quick', 'shaky'] })
    const fused = fuseWith(base, ['blast', 'wave'])
    expect(fused.skillIds).toEqual(['strike', 'quick', 'shaky', 'blast'])
    expect(fused.pendingSkillIds).toEqual(['wave'])
    expect(fused.extraSkillIds).toEqual(['blast', 'wave'])
  })

  it('đủ ô + forgetSkillIds: thay lần lượt; thiếu forget thì phần còn lại vào chờ học', () => {
    const base = makeMonster({ id: 'a', skillIds: ['strike', 'quick', 'shaky', 'idle'] })
    expect(fuseWith(base, ['blast', 'wave'], ['quick', 'idle']).skillIds).toEqual([
      'strike',
      'blast',
      'shaky',
      'wave'
    ])
    const partial = fuseWith(base, ['blast', 'wave'], ['shaky'])
    expect(partial.skillIds).toEqual(['strike', 'quick', 'blast', 'idle'])
    expect(partial.pendingSkillIds).toEqual(['wave'])
  })

  it('skill đang chờ học được kế thừa và học ngay thì rời danh sách chờ; không chọn gì thì không đổi', () => {
    const base = makeMonster({ id: 'a', skillIds: ['strike'], pendingSkillIds: ['blast'] })
    const fused = fuseWith(base, ['blast'])
    expect(fused.skillIds).toEqual(['strike', 'blast'])
    expect(fused.pendingSkillIds).toEqual([])
    const plain = fuseWith(base, [])
    expect(plain.skillIds).toEqual(['strike'])
    expect(plain.extraSkillIds).toEqual([])
  })

  it('NPC học lại được skill kế thừa sau khi quên (mọi level)', () => {
    const base = makeMonster({ id: 'a', level: 1, skillIds: ['strike', 'quick', 'shaky', 'idle'] })
    const fused = fuseWith(base, ['wave'], ['idle'])
    const forgotten = {
      ...fused,
      skillIds: fused.skillIds.map((id) => (id === 'wave' ? 'idle' : id))
    }
    expect(relearnableSkills(data, forgotten)).toContain('wave')
  })
})

describe('kế thừa skill khi fuse — thuần thục ½', () => {
  const base = makeMonster({ id: 'a', skillIds: ['strike'] })

  it('½ cấp làm tròn xuống (7 → 3), tối thiểu 1 (cấp 1 / 2 không tạo mục)', () => {
    const fused = fuseWith(base, ['blast', 'flurry'])
    expect(fused.skillMastery.blast).toEqual(mastery(3))
    expect(fused.skillMastery).not.toHaveProperty('flurry')
    expect(fuseWith(base, ['wave']).skillMastery).not.toHaveProperty('wave')
  })

  it('quái gốc từng có cấp cao hơn thì giữ của mình; thấp hơn thì nâng, exp không tụt', () => {
    const high = { ...base, skillMastery: { blast: mastery(5) } }
    expect(fuseWith(high, ['blast']).skillMastery.blast).toEqual(mastery(5))
    const low = { ...base, skillMastery: { blast: { level: 2, exp: toBig(5) } } }
    expect(fuseWith(low, ['blast']).skillMastery.blast).toEqual(mastery(3))
  })

  it('số cực lớn: cấp thuần thục rất cao vẫn hữu hạn, khớp tổng exp', () => {
    const bigSub = { ...sub, skillMastery: { blast: mastery(2_000_001) } }
    const inheritance = parseSkillInheritance(data, base, bigSub, { inheritSkillIds: ['blast'] })
    const fused = fuseMonsters(data, createRng(1), base, bigSub, { inheritance })[0]
    expect(fused.skillMastery.blast.level).toBe(1_000_000)
    expect(fused.skillMastery.blast.exp.isFinite()).toBe(true)
    expect(fused.skillMastery.blast.exp).toEqual(masteryExpForLevel(data, 1_000_000))
  })
})

describe('kế thừa skill khi fuse — kiểm tra lựa chọn', () => {
  const base = makeMonster({ id: 'a', skillIds: ['strike', 'quick'] })
  const parse = (
    order: { inheritSkillIds?: unknown; forgetSkillIds?: unknown },
    on = sub
  ): SkillInheritance => parseSkillInheritance(data, base, on, order)

  it('giới hạn số skill: 0, đúng tối đa thì được, vượt thì lỗi', () => {
    expect(parse({})).toEqual({ inheritSkillIds: [], forgetSkillIds: [] })
    expect(parse({ inheritSkillIds: ['blast', 'wave'] }).inheritSkillIds).toEqual(['blast', 'wave'])
    expectActionError(
      () => parse({ inheritSkillIds: ['blast', 'wave', 'flurry'] }),
      'tooManyInheritedSkills',
      {
        max: 2
      }
    )
  })

  it('skill phải của quái phụ, quái gốc chưa biết, loại kế thừa được', () => {
    expectActionError(() => parse({ inheritSkillIds: ['shaky'] }), 'cannotInheritSkill', {
      skillId: 'shaky',
      reason: 'notKnownBySub'
    })
    expectActionError(() => parse({ inheritSkillIds: ['strike'] }), 'cannotInheritSkill', {
      reason: 'known'
    })
    const maxSub = { ...sub, skillIds: ['maxFlare'] }
    expectActionError(
      () => parse({ inheritSkillIds: ['maxFlare'] }, maxSub),
      'cannotInheritSkill',
      {
        reason: 'notInheritable'
      }
    )
  })

  it('forgetSkillIds: phải là skill quái gốc biết, không quá số skill thiếu ô', () => {
    expectActionError(
      () => parse({ inheritSkillIds: ['blast'], forgetSkillIds: ['quick'] }),
      'skillSlotFree'
    )
    const full = { ...base, skillIds: ['strike', 'quick', 'shaky', 'idle'] }
    const order = { inheritSkillIds: ['blast'], forgetSkillIds: ['wave'] }
    expectActionError(() => parseSkillInheritance(data, full, sub, order), 'skillNotKnown', {
      skillId: 'wave'
    })
  })

  it('sai dạng: không phải mảng chuỗi, bị trùng', () => {
    expectActionError(() => parse({ inheritSkillIds: 'blast' }), 'malformedAction')
    expectActionError(() => parse({ inheritSkillIds: ['blast', 'blast'] }), 'malformedAction')
    expectActionError(() => parse({ forgetSkillIds: [1] }), 'malformedAction')
  })

  it('preview và inheritableSkillIds: skill quái phụ biết mà quái gốc chưa biết, bỏ chiêu Max', () => {
    expect(previewFusion(data, base, sub).inheritableSkillIds).toEqual(['blast', 'wave', 'flurry'])
    expect(inheritableSkillIds(data, base, { ...sub, skillIds: ['maxFlare', 'blast'] })).toEqual([
      'blast'
    ])
  })
})

describe('action fuse — kế thừa skill', () => {
  const state: GameState = {
    ...makeGameState({
      seed: 4,
      party: [makeMonster({ id: 'a', skillIds: ['strike'] }), makeMonster({ id: 'p' })],
      money: toBig(10_000)
    }),
    storage: [sub],
    inventory: createInventory({ fusionAmulet: 1 })
  }
  const action = { type: 'fuse', baseId: 'a', subId: 'b', inheritSkillIds: ['blast'] } as const

  it('thành công: quái gốc nhận skill kế thừa', () => {
    const fused = gameReducer(data, state, action).party[0]
    expect(fused.skillIds).toEqual(['strike', 'blast'])
    expect(fused.extraSkillIds).toEqual(['blast'])
  })

  it('thất bại có Bùa Hộ Mệnh: không kế thừa gì', () => {
    const failData = cloneData(data)
    failData.config.fuseChance.raceChances = { same: 0, breedable: 0, other: 0 }
    const next = gameReducer(failData, state, { ...action, protectItemId: 'fusionAmulet' })
    expect(next.party[0].skillIds).toEqual(['strike'])
    expect(next.party[0].extraSkillIds).toEqual([])
  })

  it('lựa chọn sai thì báo lỗi trước khi tung, state giữ nguyên (không mất tiền)', () => {
    expectActionError(
      () => gameReducer(data, state, { ...action, inheritSkillIds: ['shaky'] }),
      'cannotInheritSkill'
    )
  })
})

describe('config.fusion', () => {
  it('inheritSkills nguyên ≥ 0 (0 = tắt kế thừa); sai thì báo lỗi dữ liệu', () => {
    expect(
      dataIssuesAfter((raw) => (raw.config.fusion = { inheritSkills: 0, keptTraitPercent: 50 }))
    ).toEqual([])
    for (const inheritSkills of [-1, 1.5]) {
      const issues = dataIssuesAfter(
        (raw) => (raw.config.fusion = { inheritSkills, keptTraitPercent: 50 })
      )
      expect(issues.join(' | ')).toMatch(/config\.fusion\.inheritSkills/)
    }
  })
})
