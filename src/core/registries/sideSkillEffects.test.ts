// Hiệu ứng skill lên cả một phe trên sân (sideStatStage, sideHeal, sideCureStatus,
// sideApplyStatus): chọn đúng phe, dùng được trên chiêu tấn công, kiểm tra params, AI.

import { describe, expect, it } from 'vitest'
import { BIG_ZERO, createRng } from '../shared'
import { dataIssuesAfter, makeData, makeField, makeMonster } from '../testing'
import { SKILL_EFFECTS } from './skillEffects'
import type {
  SkillEffectAiContext,
  SkillEffectContext,
  SkillEffectResult
} from './skillEffectTypes'

const data = makeData()
const user = makeMonster({ id: 'a', damageTaken: 20 })
const ally = makeMonster({
  id: 'b',
  damageTaken: 40,
  statuses: [{ statusId: 'burn', turnsLeft: 3 }]
})
const foeA = makeMonster({ id: 'x', elementIds: ['normal'] })
const foeB = makeMonster({ id: 'y', elementIds: ['normal'] })

const ctx = (overrides: Partial<SkillEffectContext> = {}): SkillEffectContext => ({
  data,
  user,
  target: foeA,
  damageDealt: BIG_ZERO,
  rng: createRng(1),
  field: makeField(),
  onField: [user, ally, foeA, foeB],
  team: [user, ally],
  ...overrides
})

const aiCtx = (overrides: Partial<SkillEffectAiContext> = {}): SkillEffectAiContext => ({
  data,
  user,
  target: foeA,
  targetIsAlly: false,
  stages: {},
  field: makeField(),
  side: 'player',
  allies: [user, ally],
  foes: [foeA, foeB],
  allyReserves: [],
  foeReserves: [],
  expectedDamage: BIG_ZERO,
  ...overrides
})

const apply = (type: string, params: unknown): SkillEffectResult =>
  SKILL_EFFECTS[type].apply(params, ctx())
const ids = (monsters: { monsterId: string }[]): string[] => monsters.map((m) => m.monsterId)

describe('hiệu ứng lên cả phe', () => {
  it('sideStatStage: ally = quái dùng + đồng đội, foe = mọi địch trên sân', () => {
    const params = (side: string): unknown => ({ side, stats: ['speed'], delta: -1 })
    expect(ids(apply('sideStatStage', params('ally')).stageChanges)).toEqual(['a', 'b'])
    expect(ids(apply('sideStatStage', params('foe')).stageChanges)).toEqual(['x', 'y'])
  })

  it('sideHeal hồi % max HP từng quái phe mình (dùng được trên chiêu tấn công)', () => {
    const result = apply('sideHeal', { side: 'ally', percent: 20 })
    expect(result.heals.map((h) => [h.monsterId, h.amount.toNumber()])).toEqual([
      ['a', 10],
      ['b', 10]
    ])
    expect(SKILL_EFFECTS.sideHeal.aiValue({ side: 'ally', percent: 20 }, aiCtx())).toBeCloseTo(0.4)
  })

  it('sideCureStatus chữa quái phe mình đang có trạng thái', () => {
    expect(apply('sideCureStatus', { side: 'ally' }).statusCures).toEqual(['b'])
    expect(SKILL_EFFECTS.sideCureStatus.aiValue({ side: 'ally' }, aiCtx())).toBe(
      data.config.ai.statusWeights.burn
    )
  })

  it('sideApplyStatus: mỗi quái phe địch tung một trạng thái trong danh sách', () => {
    const one = apply('sideApplyStatus', { side: 'foe', statusIds: ['poison'] })
    expect(one.statusChanges).toEqual([
      { monsterId: 'x', statusId: 'poison' },
      { monsterId: 'y', statusId: 'poison' }
    ])
    const random = apply('sideApplyStatus', { side: 'foe', statusIds: ['poison', 'sleep'] })
    for (const change of random.statusChanges) {
      expect(['poison', 'sleep']).toContain(change.statusId)
    }
    const never = apply('sideApplyStatus', { side: 'foe', statusIds: ['poison'], chance: 0 })
    expect(never.statusChanges).toEqual([])
    const value = SKILL_EFFECTS.sideApplyStatus.aiValue(
      { side: 'foe', statusIds: ['poison'] },
      aiCtx()
    )
    expect(value).toBeCloseTo(2 * data.config.ai.statusWeights.poison)
  })

  it('kiểm tra params: phe sai, hồi / chữa cho địch, trạng thái lạ', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        const add = (id: string, type: string, params: unknown): void => {
          raw.skills.push({
            id,
            elementId: 'normal',
            category: 'physical',
            power: 50,
            accuracy: 100,
            priority: 0,
            target: 'enemy',
            effects: [{ type, params }]
          })
        }
        add('badSide', 'sideStatStage', { side: 'both', stats: ['speed'], delta: 1 })
        add('healFoe', 'sideHeal', { side: 'foe', percent: 10 })
        add('cureFoe', 'sideCureStatus', { side: 'foe' })
        add('weird', 'sideApplyStatus', { side: 'foe', statusIds: ['nope'] })
      },
      { regenerateText: true }
    )
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('side phải là "ally" hoặc "foe"'),
        expect.stringContaining('side chỉ được là "ally"'),
        expect.stringContaining('trạng thái không tồn tại "nope"')
      ])
    )
  })
})
