// Thuần thục skill qua save và các luồng quái (docs/rules/skill-mastery.md): migrate v31 → v32,
// lưu / đọc exp Decimal, kiểm tra save, quên rồi học lại giữ cấp, tiến hóa / fuse giữ, breed không
// thừa hưởng, MonsterView, kiểm tra config.mastery.

import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'
import { evolveMonster, fuseMonsters, makeOffspring } from '../progression'
import { getMonsterView } from '../roster'
import { Decimal, createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster
} from '../testing'
import type { Monster, SkillMastery } from '../model'

const data = makeData()

const mastery = (level: number, exp: number | string = 0): SkillMastery => ({
  level,
  exp: toBig(exp)
})

const veteran = (overrides: Partial<Monster> = {}): Monster =>
  makeMonster({
    id: 'a',
    skillMastery: { strike: mastery(12, 5), quick: mastery(3) },
    ...overrides
  })

describe('save', () => {
  it('migrate v31 → v32: mọi quái (đội, kho, trứng, quái hoang, quái vừa bắt) chưa có mục nào', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const state = {
      ...battle,
      storage: [makeMonster({ id: 's' })],
      eggs: [{ id: 'g', monster: makeMonster({ id: 'g' }), battlesLeft: 3, infusions: [] }]
    }
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (m: Record<string, unknown>): Record<string, unknown> => {
      const { skillMastery: _skillMastery, ...rest } = m
      return rest
    }
    const rawBattle = raw.battle as Record<string, unknown>
    const old = {
      ...raw,
      version: 31,
      party: (raw.party as Record<string, unknown>[]).map(strip),
      storage: (raw.storage as Record<string, unknown>[]).map(strip),
      eggs: (raw.eggs as { monster: Record<string, unknown> }[]).map((egg) => ({
        ...egg,
        monster: strip(egg.monster)
      })),
      battle: {
        ...rawBattle,
        enemies: (rawBattle.enemies as Record<string, unknown>[]).map(strip)
      }
    }
    const migrated = migrateState(old, data)
    expect(migrated.party[0].skillMastery).toEqual({})
    expect(migrated.storage[0].skillMastery).toEqual({})
    expect(migrated.eggs[0].monster.skillMastery).toEqual({})
    expect(defined(migrated.battle).enemies[0].skillMastery).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('migrate v32 → v33: exp trong cấp thành tổng exp (tổng của cấp + phần trong cấp)', () => {
    const state = makeGameState({
      seed: 1,
      party: [veteran({ skillMastery: { strike: mastery(3, 5), quick: mastery(1, 2) } })]
    })
    const raw = serializeState(state) as Record<string, unknown>
    const migrated = migrateState({ ...raw, version: 32 }, data)
    // Tổng exp cấp 3 = 23.
    expect(migrated.party[0].skillMastery.strike).toEqual(mastery(3, 28))
    expect(migrated.party[0].skillMastery.quick).toEqual(mastery(1, 2))
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('migrate v32 → v33: mục hỏng giữ nguyên để kiểm tra save báo lỗi', () => {
    const raw = serializeState(makeGameState({ seed: 1, party: [veteran()] })) as {
      party: Record<string, unknown>[]
    }
    raw.party[0].skillMastery = { strike: { level: 0, exp: 'x' } }
    const migrated = migrateState({ ...raw, version: 32 }, data)
    expect(validateGameState(data, migrated).some((issue) => issue.includes('skillMastery'))).toBe(
      true
    )
  })

  it('lưu rồi đọc: exp là Decimal đúng giá trị, kể cả số cực lớn', () => {
    const state = makeGameState({
      seed: 1,
      party: [veteran({ skillMastery: { strike: mastery(10 ** 9, '1e300') } })]
    })
    const loaded = migrateState(serializeState(state), data)
    const entry = loaded.party[0].skillMastery.strike
    expect(entry.level).toBe(10 ** 9)
    expect(Decimal.isDecimal(entry.exp) && entry.exp.eq('1e300')).toBe(true)
  })

  it('kiểm tra save báo skill lạ và cấp sai', () => {
    const state = makeGameState({
      seed: 1,
      party: [veteran({ skillMastery: { nope: mastery(1), strike: mastery(0) } })]
    })
    const issues = validateGameState(data, state)
    expect(issues.some((issue) => issue.includes('skillMastery.nope: skill không tồn tại'))).toBe(
      true
    )
    expect(issues.some((issue) => issue.includes('skillMastery.strike.level'))).toBe(true)
  })
})

describe('giữ / không thừa hưởng', () => {
  it('quên skill vẫn giữ thuần thục; học lại dùng tiếp cấp cũ', () => {
    const monster = veteran({
      level: 8,
      exp: toBig(512),
      skillIds: ['strike', 'growl', 'quick', 'idle'],
      skillMastery: { growl: mastery(3, 2) },
      pendingSkillIds: ['blast']
    })
    const town = { ...makeGameState({ seed: 1, party: [monster] }), money: toBig(1000) }
    const forgot = gameReducer(data, town, {
      type: 'learnPendingSkill',
      monsterId: 'a',
      skillId: 'blast',
      forgetSkillId: 'growl'
    })
    expect(forgot.party[0].skillIds).not.toContain('growl')
    expect(forgot.party[0].skillMastery.growl).toEqual(mastery(3, 2))
    const back = gameReducer(data, forgot, {
      type: 'relearnSkill',
      monsterId: 'a',
      skillId: 'growl',
      forgetSkillId: 'blast'
    })
    expect(back.party[0].skillIds).toContain('growl')
    expect(back.party[0].skillMastery.growl).toEqual(mastery(3, 2))
  })

  it('tiến hóa giữ; fuse: quái gốc giữ của mình; con breeding không thừa hưởng', () => {
    const monster = veteran()
    const evolved = evolveMonster(data, monster, {
      toSpeciesId: 'strongling',
      rng: createRng(1),
      day: 0
    })
    expect(evolved.monster.skillMastery).toEqual(monster.skillMastery)
    const sub = makeMonster({
      id: 's',
      speciesId: 'twig',
      baseSpeciesId: 'twig',
      skillMastery: { wave: mastery(40) }
    })
    const [fused] = fuseMonsters(data, createRng(1), monster, sub)
    expect(fused.skillMastery).toEqual(monster.skillMastery)
    const father = veteran({ id: 'f', gender: 'male', level: 20 })
    const mother = veteran({ id: 'm', gender: 'female', level: 20 })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'c')
    expect(child.skillMastery).toEqual({})
  })
})

describe('MonsterView', () => {
  it('mỗi skill đang biết: cấp, exp, exp cần lên cấp, mốc kế tiếp', () => {
    const state = makeGameState({ seed: 1, party: [veteran({ skillIds: ['strike', 'growl'] })] })
    const view = defined(getMonsterView(data, state, 'a'), 'view')
    const [strike, growl] = view.skills
    expect(strike.mastery.level).toBe(12)
    expect(strike.mastery.exp.toString()).toBe('5')
    // Tổng exp cấp 13 = ⌈4 × 12^2,5⌉ = 1.996; còn thiếu 1.996 − 5.
    expect(strike.mastery.expForNextLevel.toString()).toBe('1996')
    expect(strike.mastery.expToNextLevel.toString()).toBe('1991')
    expect(strike.mastery.nextMilestone).toEqual({ level: 25, secondaryChancePercent: 10 })
    expect(growl.mastery.level).toBe(1)
    expect(growl.mastery.nextMilestone?.level).toBe(10)
  })
})

describe('config.mastery', () => {
  it('dữ liệu fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('báo lỗi: baseExp / expPower ≤ 0, số âm, mốc không tăng dần / không có thưởng / trường lạ', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.mastery = {
        ...raw.config.mastery,
        baseExp: 0,
        expPower: -1,
        useExp: -1,
        milestones: [
          { level: 10, secondaryChancePercent: 10 },
          { level: 10, minHitsBonus: 1.5 },
          { level: 1 },
          { level: 30, extra: 1 } as never
        ]
      }
    })
    expect(issues).toEqual([
      'config.mastery.baseExp phải là số > 0, nhận 0',
      'config.mastery.expPower phải là số > 0, nhận -1',
      'config.mastery.useExp phải là số hữu hạn ≥ 0, nhận -1',
      'config.mastery.milestones[1].level phải tăng dần',
      'config.mastery.milestones[1].minHitsBonus phải là số nguyên ≥ 0, nhận 1.5',
      'config.mastery.milestones[2].level phải là số nguyên ≥ 2, nhận 1',
      'config.mastery.milestones[2].level phải tăng dần',
      'config.mastery.milestones[2] cần ít nhất một thưởng (secondaryChancePercent / minHitsBonus)',
      'config.mastery.milestones[3]: trường "extra" không thuộc mốc thuần thục',
      'config.mastery.milestones[3] cần ít nhất một thưởng (secondaryChancePercent / minHitsBonus)'
    ])
  })
})
