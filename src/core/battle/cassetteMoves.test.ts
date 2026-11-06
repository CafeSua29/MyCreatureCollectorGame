// Chiêu Cassette Beasts cần cơ chế riêng (docs/rules/cassette-mechanics.md): Apple Tree (kết quả khi
// tường chặn, hồi theo máu hiện tại), Crossfade (rút về, quái vào thay giữ hệ bằng lớp phủ), Paint
// Swipe (cần lớp phủ, chuyển lớp phủ), sách theo hệ (`bookForElement`), hiệu ứng thể lực của trait.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { getCurrentHp, getMaxHp } from '../monster'
import { elementBookSkillIds, learnsetSkillIds, skillLearnerCount } from '../inventory'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { BattleEvent, Monster, Skill, StatusDef } from '../model'
import { staminaOf, type TraitEffect } from '../registries'
import { cloneDraft, emptyRecord, monsterBattleContext, type Draft } from './draft'
import { executeSkill, isSkillBlocked } from './executeSkill'
import { runTraitEffects } from './traitEffects'
import { currentStamina } from './stamina'

const raw = makeRawData()
const base = { priority: 0, accuracy: 100, effects: [] }
const skills: Skill[] = [
  {
    ...base,
    id: 'tempt',
    elementId: 'grass',
    category: 'status',
    power: 0,
    target: 'self',
    effects: [{ type: 'wall', params: { statusId: 'apple', hpCostPercent: 10 } }],
    bookForElement: true
  },
  { ...base, id: 'jab', elementId: 'normal', category: 'physical', power: 40, target: 'enemy' },
  {
    ...base,
    id: 'fade',
    elementId: 'normal',
    category: 'status',
    power: 0,
    target: 'self',
    typeless: true,
    priority: 5,
    effects: [{ type: 'switchOut', params: { coatIncomingTurns: 3 } }]
  },
  {
    ...base,
    id: 'swipe',
    elementId: 'normal',
    category: 'physical',
    power: 90,
    target: 'enemy',
    elementFromUser: 'first',
    requiresCoating: true,
    priority: -7,
    effects: [{ type: 'transferCoating', params: {} }]
  },
  {
    ...base,
    id: 'coatGhost',
    elementId: 'ghost',
    category: 'status',
    power: 0,
    target: 'self',
    effects: [{ type: 'transmute', params: { elementId: 'ghost', turns: 3 } }]
  }
]
raw.skills.push(...skills)
const apple = (onBlocked: NonNullable<StatusDef['wall']>['onBlocked']): StatusDef => ({
  id: 'apple',
  kind: 'buff',
  duration: { min: 3, max: 3 },
  hooks: [],
  battleOnly: true,
  endsOnLeave: true,
  wall: { elementId: 'grass', hits: 3, special: true, onBlocked }
})
raw.statuses.push(
  apple([
    { weight: 1, effects: [{ type: 'applyStatus', params: { statusId: 'poison' } }] },
    {
      weight: 2,
      effects: [{ type: 'heal', params: { percent: 10, who: 'target', basis: 'current' } }]
    }
  ])
)
Object.assign(raw.config.ai.statusWeights, { apple: 0.1 })
const data = createGameData(withFixtureText(raw))

const player = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id: 'a', skillIds: ['jab'], level: 50, ...fields })
const foe = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id: 'e', skillIds: ['tempt'], level: 50, ...fields })

function cast(d: Draft, userId: string, skillId: string, fields: { reactive?: true } = {}): void {
  const side = d.party.some((m) => m.id === userId) ? 'player' : 'enemy'
  const user = defined(
    [...d.party, ...d.battle.enemies].find((m) => m.id === userId),
    userId
  )
  const slots = side === 'player' ? d.battle.playerSlots : d.battle.enemySlots
  executeSkill(data, d, {
    side,
    slot: slots.indexOf(userId),
    user,
    skill: data.skills[skillId],
    targetSlot: 0,
    ...fields
  })
}

const eventsOf = (d: Draft, type: BattleEvent['type']): BattleEvent[] =>
  d.battle.log.filter((event) => event.type === type)

describe('Apple Tree', () => {
  it('quái dùng mất 10% HP; mỗi lần chặn, kẻ đánh bị độc hoặc hồi 10% máu hiện tại', () => {
    let poisoned = 0
    let healed = 0
    for (let seed = 1; seed <= 30; seed++) {
      // Kẻ đánh hệ thường (fixture: hệ cỏ miễn độc).
      const d = cloneDraft({
        ...makeBattleState([player({ elementIds: ['normal'] })], [foe()]),
        rng: seed
      })
      cast(d, 'e', 'tempt')
      const owner = d.battle.enemies[0]
      expect(owner.damageTaken.eq(getMaxHp(data, owner).times(10).div(100).ceil())).toBe(true)
      const attacker = d.party[0]
      attacker.damageTaken = getMaxHp(data, attacker).div(2).floor()
      const before = getCurrentHp(data, attacker)
      cast(d, 'a', 'jab')
      expect(owner.damageTaken.eq(getMaxHp(data, owner).times(10).div(100).ceil())).toBe(true)
      if (attacker.statuses.some((s) => s.statusId === 'poison')) poisoned++
      else {
        healed++
        const expected = before.times(10).div(100).ceil()
        expect(getCurrentHp(data, attacker).minus(before).toString()).toBe(expected.toString())
      }
    }
    expect(poisoned).toBeGreaterThan(0)
    expect(healed).toBeGreaterThan(poisoned)
  })

  it('kiểm tra dữ liệu: onBlocked rỗng, trọng số sai, hiệu ứng không có', () => {
    const issues = dataIssuesAfter(
      (rawData) => {
        rawData.statuses.push(
          { ...apple([]), id: 'emptyApple' },
          { ...apple([{ weight: 0, effects: [{ type: 'nope', params: {} }] }]), id: 'badApple' }
        )
        Object.assign(rawData.config.ai.statusWeights, { emptyApple: 0, badApple: 0 })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('onBlocked phải là danh sách không rỗng')
    expect(issues).toContain('onBlocked[0].weight')
    expect(issues).toContain('hook "nope" chưa có trong registry')
  })
})

describe('Crossfade', () => {
  const party = (): Monster[] => [
    player({ skillIds: ['fade'], elementIds: ['fire'] }),
    makeMonster({ id: 'r', skillIds: ['jab'], level: 50, elementIds: ['water'] })
  ]

  it('rút về, quái vào thay giữ hệ của quái rút về bằng lớp phủ 3 lượt', () => {
    const d = cloneDraft(makeBattleState(party(), [foe()], { playerSlots: ['a', null] }))
    cast(d, 'a', 'fade')
    expect(d.battle.playerSlots[0]).toBe('r')
    const incoming = defined(
      d.party.find((m) => m.id === 'r'),
      'r'
    )
    expect(incoming.elementIds).toEqual(['fire'])
    expect(d.battle.volatiles.r.coatingTurnsLeft).toBe(3)
    expect(d.party[0].elementIds).toEqual(['fire'])
  })

  it('bị trait / chiêu khác gọi thì không có tác dụng', () => {
    const d = cloneDraft(makeBattleState(party(), [foe()], { playerSlots: ['a', null] }))
    cast(d, 'a', 'fade', { reactive: true })
    expect(d.battle.playerSlots[0]).toBe('a')
  })
})

describe('Paint Swipe', () => {
  it('không có lớp phủ thì bị chặn', () => {
    const d = cloneDraft(makeBattleState([player({ skillIds: ['swipe'] })], [foe()]))
    expect(isSkillBlocked(data, d, { user: d.party[0], skill: data.skills.swipe })).toBe(true)
  })

  it('đánh theo hệ lớp phủ, chuyển lớp phủ (còn nguyên lượt) sang mục tiêu, quái dùng trở lại hệ gốc', () => {
    const d = cloneDraft(
      makeBattleState(
        [player({ skillIds: ['coatGhost', 'swipe'], elementIds: ['fire'] })],
        [foe({ elementIds: ['water'] })]
      )
    )
    cast(d, 'a', 'coatGhost')
    expect(d.party[0].elementIds).toEqual(['ghost'])
    expect(isSkillBlocked(data, d, { user: d.party[0], skill: data.skills.swipe })).toBe(false)
    cast(d, 'a', 'swipe')
    expect(d.battle.log.some((e) => e.type === 'damage' && e.targetId === 'e')).toBe(true)
    expect(d.battle.enemies[0].elementIds).toEqual(['ghost'])
    expect(d.battle.volatiles.e.coatingTurnsLeft).toBe(3)
    expect(d.party[0].elementIds).toEqual(['fire'])
    expect(d.battle.volatiles.a.coatingTurnsLeft).toBeUndefined()
    expect(eventsOf(d, 'identityChanged').length).toBeGreaterThan(1)
  })
})

describe('sách theo hệ và thể lực của trait', () => {
  it('bookForElement: mọi loài cùng hệ tính là học được, có trong sách rơi theo loài', () => {
    expect(elementBookSkillIds(data, 'grass')).toEqual(['tempt'])
    const grassSpecies = Object.values(data.species).filter(
      (species) => species.kind === 'normal' && species.elementIds.includes('grass')
    )
    expect(skillLearnerCount(data, 'tempt')).toBe(grassSpecies.length)
    expect(learnsetSkillIds(data, [grassSpecies[0].id])).toContain('tempt')
  })

  it('hiệu ứng stamina của ngôn ngữ trait: hồi / mất, kẹp trong khoảng', () => {
    const d = cloneDraft(makeBattleState([player()], [foe()]))
    d.battle.records.a = { ...emptyRecord(), staminaUsed: 50 }
    const owner = d.party[0]
    runTraitEffects(data, d, { owner, scale: 1, subject: owner, other: owner }, [
      { do: 'stamina', to: 'self', amount: 20 }
    ])
    expect(currentStamina(data, d, owner)).toBe(70)
    runTraitEffects(data, d, { owner, scale: 1, subject: owner, other: owner }, [
      { do: 'stamina', to: 'self', amount: -1000 }
    ])
    expect(currentStamina(data, d, owner)).toBe(0)
    expect(toBig(currentStamina(data, d, owner)).isFinite()).toBe(true)
  })

  const runOn = (d: Draft, effects: TraitEffect[]): void => {
    const owner = d.party[0]
    // Như đường kích hoạt thật (traitEvents.ts): góc nhìn điều kiện có bối cảnh trận của quái.
    const view = { data, self: owner, selfCtx: monsterBattleContext(data, d, owner) }
    const other = d.battle.enemies[0]
    runTraitEffects(data, d, { owner, scale: 1, subject: owner, other, view }, effects)
  }

  it('stamina theo % tối đa và mức tối thiểu', () => {
    const d = cloneDraft(makeBattleState([player()], [foe()]))
    runOn(d, [{ do: 'stamina', to: 'self', percent: -90 }])
    expect(currentStamina(data, d, d.party[0])).toBe(10)
    runOn(d, [{ do: 'stamina', to: 'self', atLeastPercent: 25 }])
    expect(currentStamina(data, d, d.party[0])).toBe(25)
    // Đã trên mức tối thiểu thì không đổi.
    runOn(d, [{ do: 'stamina', to: 'self', atLeastPercent: 20 }])
    expect(currentStamina(data, d, d.party[0])).toBe(25)
    runOn(d, [{ do: 'stamina', to: 'self', percent: 1e9 }])
    expect(currentStamina(data, d, d.party[0])).toBe(100)
  })

  it('hút thể lực: không quá phần quái cho còn, không quá phần quái nhận thiếu', () => {
    const d = cloneDraft(makeBattleState([player()], [foe()]))
    d.battle.records.a = { ...emptyRecord(), staminaUsed: 30 }
    d.battle.records.e = { ...emptyRecord(), staminaUsed: 80 }
    runOn(d, [{ do: 'stamina', to: 'self', from: 'other', amount: 1000 }])
    expect(currentStamina(data, d, d.party[0])).toBe(90)
    expect(currentStamina(data, d, d.battle.enemies[0])).toBe(0)
    // Quái cho hết thể lực thì không hút được nữa.
    runOn(d, [{ do: 'stamina', to: 'self', from: 'other', amount: 5 }])
    expect(currentStamina(data, d, d.party[0])).toBe(90)
  })

  it('bộ đếm stamina: thể lực hiện tại trong trận, đầy ngoài trận', () => {
    const d = cloneDraft(makeBattleState([player()], [foe()]))
    d.battle.records.a = { ...emptyRecord(), staminaUsed: 95 }
    const owner = d.party[0]
    runOn(d, [
      {
        do: 'heal',
        to: 'self',
        amount: { flat: 1 },
        if: [{ if: 'counterAtLeast', counter: { of: 'stamina' }, min: 10 }]
      }
    ])
    owner.damageTaken = toBig(10)
    runOn(d, [
      {
        do: 'heal',
        to: 'self',
        amount: { flat: 5 },
        if: [{ if: 'counterAtLeast', counter: { of: 'stamina' }, min: 10 }]
      }
    ])
    expect(owner.damageTaken.toString()).toBe('10')
    runOn(d, [
      {
        do: 'heal',
        to: 'self',
        amount: { flat: 5 },
        if: [{ if: 'counterAtLeast', counter: { of: 'stamina' }, min: 5 }]
      }
    ])
    expect(owner.damageTaken.toString()).toBe('5')
    expect(staminaOf(data, owner)).toBe(100)
  })

  it('kiểm tra dữ liệu hiệu ứng stamina', () => {
    const effect = (fields: Record<string, unknown>): Record<string, unknown> => ({
      do: 'stamina',
      to: 'self',
      ...fields
    })
    const bad = [
      effect({}),
      effect({ amount: 5, percent: 5 }),
      effect({ amount: 0 }),
      effect({ atLeastPercent: 150 }),
      effect({ percent: 10, from: 'other' }),
      effect({ amount: -5, from: 'other' })
    ]
    const issues = dataIssuesAfter(
      (rawData) => {
        bad.forEach((one, i) =>
          rawData.traits.push({
            id: `badStamina${i}`,
            kind: 'rare',
            hooks: [{ type: 'trigger', params: { on: 'entry', scope: 'self', effects: [one] } }]
          })
        )
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('phải có đúng một trong amount / percent / atLeastPercent')
    expect(issues).toContain('amount phải là số khác 0')
    expect(issues).toContain('atLeastPercent phải trong (0, 100]')
    expect(issues.match(/from chỉ dùng với amount dương/g)).toHaveLength(2)
  })
})
