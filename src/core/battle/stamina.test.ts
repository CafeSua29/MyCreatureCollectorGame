// Thể lực cho skill (docs/rules/stamina.md): tốn giá, suy theo power, hồi cuối lượt, Nghỉ, quá sức
// (mất máu theo phần thiếu, mất lượt, gục), skill do trait không tốn, trạng thái đổi thể lực, hook,
// AI, số cực lớn, kiểm tra dữ liệu / save.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { validateGameState } from '../game/validateGameState'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { GameState, Monster, Skill, StatusDef } from '../model'
import { suggestBattleCommands } from './ai'
import { cloneDraft, emptyRecord, type Draft } from './draft'
import { executeSkill } from './executeSkill'
import { currentStamina, maxStamina, staminaCostOf } from './stamina'

const raw = makeRawData()
Object.assign(raw.config.stamina, {
  costByPower: [
    { upToPower: 40, cost: 10 },
    { upToPower: 100, cost: 40 }
  ],
  statusCost: 5,
  restWeight: 0.6
})
const base = { elementId: 'normal', priority: 0, accuracy: 100, effects: [], target: 'enemy' }
const skills: Skill[] = [
  { ...base, id: 'lightHit', category: 'special', power: 30 } as Skill,
  { ...base, id: 'heavyHit', category: 'special', power: 90 } as Skill,
  { ...base, id: 'pricey', category: 'special', power: 30, staminaCost: 70 } as Skill,
  { ...base, id: 'freeHit', category: 'special', power: 30, staminaCost: 0 } as Skill
]
raw.skills.push(...skills)
const statuses: StatusDef[] = [
  { id: 'apUp', kind: 'buff', hooks: [], battleOnly: true, staminaPerTurn: 10 },
  { id: 'apDown', kind: 'debuff', hooks: [], battleOnly: true, staminaPerTurn: -10 }
]
raw.statuses.push(...statuses)
Object.assign(raw.config.ai.statusWeights, { apUp: 0.1, apDown: 0.1 })
raw.traits.push(
  {
    id: 'bigLungs',
    kind: 'positive',
    hooks: [{ type: 'staminaMaxPercent', params: { percent: 50 } }]
  },
  {
    id: 'thrifty',
    kind: 'positive',
    hooks: [{ type: 'staminaCostPercent', params: { percent: -50 } }]
  }
)
const data = createGameData(withFixtureText(raw))

const user = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id: 'a', skillIds: ['lightHit', 'heavyHit', 'freeHit'], level: 50, ...fields })
const foe = (): Monster => makeMonster({ id: 'e', skillIds: ['idle'], level: 50 })
const stateOf = (fields: Partial<Monster> = {}): GameState =>
  makeBattleState([user(fields)], [foe()])

function cast(d: Draft, skillId: string, reactive = false): void {
  executeSkill(data, d, {
    side: 'player',
    slot: 0,
    user: d.party[0],
    skill: data.skills[skillId],
    targetSlot: 0,
    ...(reactive ? { reactive: true } : {})
  })
}

const turn = (state: GameState, skillId: string): GameState =>
  gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })

describe('giá thể lực', () => {
  it('suy theo power, skill trạng thái một mức, staminaCost ghi đè', () => {
    const d = cloneDraft(stateOf())
    const costOf = (id: string): number => staminaCostOf(data, d, d.party[0], data.skills[id])
    expect(costOf('lightHit')).toBe(10)
    expect(costOf('heavyHit')).toBe(40)
    expect(costOf('idle')).toBe(5)
    expect(costOf('pricey')).toBe(70)
    expect(costOf('freeHit')).toBe(0)
  })

  it('dùng bằng lệnh thì tốn; skill do trait không tốn', () => {
    const d = cloneDraft(stateOf())
    cast(d, 'heavyHit')
    expect(currentStamina(data, d, d.party[0])).toBe(60)
    cast(d, 'heavyHit', true)
    expect(currentStamina(data, d, d.party[0])).toBe(60)
  })

  it('hook tăng thể lực tối đa và giảm giá', () => {
    const d = cloneDraft(
      stateOf({
        traits: [
          { id: 'bigLungs', level: 1 },
          { id: 'thrifty', level: 1 }
        ]
      })
    )
    expect(maxStamina(data, d, d.party[0])).toBe(150)
    expect(staminaCostOf(data, d, d.party[0], data.skills.heavyHit)).toBe(20)
  })
})

describe('hồi thể lực', () => {
  it('cuối lượt hồi 5% + 1; Nghỉ hồi thêm 15%; đầy thì giữ', () => {
    let state = turn(stateOf(), 'heavyHit')
    const staminaNow = (): number => {
      const d = cloneDraft(state)
      return currentStamina(data, d, d.party[0])
    }
    // 100 − 40 + 6.
    expect(staminaNow()).toBe(66)
    state = gameReducer(data, state, { type: 'submitTurn', commands: [{ slot: 0, kind: 'rest' }] })
    // + 15 (Nghỉ) + 6 (cuối lượt).
    expect(staminaNow()).toBe(87)
    expect(defined(state.battle).log.some((e) => e.type === 'rested')).toBe(true)
  })

  it('trạng thái đổi thể lực mỗi cuối lượt, không xuống dưới 0, không vượt tối đa', () => {
    const up = turn(stateOf({ statuses: [{ statusId: 'apUp', turnsLeft: null }] }), 'heavyHit')
    const upDraft = cloneDraft(up)
    expect(currentStamina(data, upDraft, upDraft.party[0])).toBe(76)
    const state = stateOf({ statuses: [{ statusId: 'apDown', turnsLeft: null }] })
    defined(state.battle).records.a = {
      ...emptyRecord(),
      staminaUsed: 100
    }
    const down = turn(state, 'freeHit')
    const downDraft = cloneDraft(down)
    expect(currentStamina(data, downDraft, downDraft.party[0])).toBe(0)
  })

  it('hết trận thể lực về đầy (chỉ lưu trong bản ghi trận)', () => {
    const d = cloneDraft(stateOf())
    cast(d, 'heavyHit')
    expect(JSON.stringify(d.party[0])).not.toContain('stamina')
  })
})

describe('quá sức', () => {
  const tired = (fields: Partial<Monster> = {}, staminaUsed = 95): GameState => {
    const state = stateOf(fields)
    defined(state.battle).records.a = {
      ...emptyRecord(),
      staminaUsed
    }
    return state
  }

  it('thiếu thể lực vẫn ra đòn, mất 2% max HP mỗi điểm thiếu, thể lực về 0', () => {
    const d = cloneDraft(tired())
    cast(d, 'heavyHit')
    const monster = d.party[0]
    expect(d.battle.log.some((e) => e.type === 'damage' && e.targetId === 'e')).toBe(true)
    // Có 5, giá 40: thiếu 35 → 70% max HP.
    expect(monster.damageTaken.eq(getMaxHp(data, monster).times(70).div(100).ceil())).toBe(true)
    expect(currentStamina(data, d, monster)).toBe(0)
    const event = d.battle.log.find((e) => e.type === 'overexerted')
    expect(event?.type === 'overexerted' && event.deficit).toBe(35)
  })

  it('lượt kế tiếp mất lượt: lệnh nào cũng thành Nghỉ', () => {
    let state = turn(tired(), 'heavyHit')
    const before = defined(state.party[0]).damageTaken
    state = turn(state, 'lightHit')
    const log = defined(state.battle).log
    expect(log.some((e) => e.type === 'rested')).toBe(true)
    expect(log.some((e) => e.type === 'useSkill' && e.skillId === 'lightHit')).toBe(false)
    expect(defined(state.party[0]).damageTaken.eq(before)).toBe(true)
    // Lượt sau nữa hành động lại bình thường.
    state = turn(state, 'freeHit')
    expect(defined(state.battle).log.some((e) => e.type === 'useSkill')).toBe(true)
  })

  it('quá sức có thể làm quái gục; số cực lớn vẫn đúng tỉ lệ', () => {
    const d = cloneDraft(tired({}, 100))
    d.party[0].damageTaken = getMaxHp(data, d.party[0]).minus(1)
    cast(d, 'heavyHit')
    expect(d.party[0].damageTaken.eq(getMaxHp(data, d.party[0]))).toBe(true)
    const huge = cloneDraft(tired({ level: 1e6 }))
    cast(huge, 'heavyHit')
    expect(huge.party[0].damageTaken.isFinite()).toBe(true)
    expect(huge.party[0].damageTaken.gt(0)).toBe(true)
  })
})

describe('AI và dữ liệu', () => {
  it('AI không tự làm quá sức khi có lựa chọn khác', () => {
    const state = makeBattleState([user({ skillIds: ['freeHit', 'pricey'] })], [foe()])
    defined(state.battle).records.a = {
      ...emptyRecord(),
      staminaUsed: 90
    }
    for (let rng = 1; rng <= 20; rng++) {
      const [command] = suggestBattleCommands(data, { ...state, rng })
      expect(command.kind === 'skill' && command.skillId === 'pricey').toBe(false)
    }
  })

  it('AI có thể Nghỉ khi cạn thể lực, đầy thì không', () => {
    const empty = makeBattleState([user({ skillIds: ['pricey'] })], [foe()])
    defined(empty.battle).records.a = {
      ...emptyRecord(),
      staminaUsed: 100
    }
    const kinds = new Set<string>()
    for (let rng = 1; rng <= 30; rng++) {
      kinds.add(suggestBattleCommands(data, { ...empty, rng })[0].kind)
    }
    expect(kinds.has('rest')).toBe(true)
    const full = makeBattleState([user()], [foe()])
    for (let rng = 1; rng <= 30; rng++) {
      expect(suggestBattleCommands(data, { ...full, rng })[0].kind).not.toBe('rest')
    }
  })

  it('kiểm tra dữ liệu: config, staminaCost, staminaPerTurn', () => {
    const issues = dataIssuesAfter(
      (rawData) => {
        rawData.config.stamina.max = -1
        Object.assign(rawData.config.stamina, { costByPower: 'nope' })
        rawData.skills.push({ ...skills[0], id: 'badCost', staminaCost: 1.5 })
        rawData.statuses.push({
          id: 'badAp',
          kind: 'buff',
          hooks: [],
          staminaPerTurn: 'x' as never
        })
        Object.assign(rawData.config.ai.statusWeights, { badAp: 0 })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('stamina.max')
    expect(issues).toContain('stamina.costByPower')
    expect(issues).toContain('staminaCost')
    expect(issues).toContain('staminaPerTurn')
  })

  it('kiểm tra save: staminaUsed, exhaustedTurn', () => {
    const state = stateOf()
    defined(state.battle).records.a = {
      ...emptyRecord(),
      staminaUsed: -1,
      exhaustedTurn: 0
    }
    const issues = validateGameState(data, state).join('\n')
    expect(issues).toContain('staminaUsed')
    expect(issues).toContain('exhaustedTurn')
  })
})
