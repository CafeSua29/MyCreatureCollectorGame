// Cơ chế trạng thái lấy từ Temtem (stamina.md, battle-statuses.md): dính lần hai thành trạng thái khác
// (`stacksInto`: Cold → Frozen), hết đếm ngược thì gục (`faintsOnEnd`: Doomed), đòn nhắm quái bỏ qua
// khắc hệ (`neutralTaken`: Nullified), tắt synergy (`blocksSynergy`: Isolated, Loneliness), đồng đội luôn
// khớp hệ synergy (`grantsSynergy`: Superconductivity), sát thương synergy cộng thêm (`synergyBoost`), bớt /
// cộng lượt trạng thái khi nhận (Resistant, Receptive), ưu tiên đặt lại (Gotta Go Fast), sự kiện rời sân
// (`leave`: Contagious), hiệu ứng `exhaust` (Rush); kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import { getMaxHp, isFainted } from '../monster'
import { skillPriority } from '../registries'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { BattleCommand, GameState, Monster, Skill, StatusDef, TraitDef } from '../model'
import { cloneDraft } from './draft'
import { inflictStatus } from './statuses'

const raw = makeRawData()
const statuses: StatusDef[] = [
  {
    id: 'coldT',
    kind: 'debuff',
    duration: { min: 2, max: 2 },
    hooks: [],
    battleOnly: true,
    stacksInto: 'frozenT'
  },
  {
    id: 'frozenT',
    kind: 'debuff',
    duration: { min: 2, max: 2 },
    hooks: [{ type: 'skipTurn', params: { chance: 100 } }],
    battleOnly: true
  },
  { id: 'doomedT', kind: 'debuff', duration: { min: 1, max: 1 }, hooks: [], faintsOnEnd: true },
  {
    id: 'nullifiedT',
    kind: 'debuff',
    duration: { min: 3, max: 3 },
    hooks: [],
    traitHooks: [{ type: 'effectiveness', params: { mode: 'neutralTaken' } }]
  },
  { id: 'shieldT', kind: 'buff', duration: { min: 2, max: 2 }, hooks: [], marker: true },
  {
    id: 'isolatedT',
    kind: 'debuff',
    duration: { min: 3, max: 3 },
    hooks: [],
    traitHooks: [{ type: 'abilityFlag', params: { flag: 'blocksSynergy' } }]
  }
]
raw.statuses.push(...statuses)
Object.assign(
  raw.config.ai.statusWeights,
  Object.fromEntries(statuses.map((status) => [status.id, 0.1]))
)
const base = { priority: 0, accuracy: 100, effects: [], target: 'enemy' }
raw.skills.push(
  { ...base, id: 'splash', elementId: 'water', category: 'special', power: 60 } as Skill,
  {
    ...base,
    id: 'tidalT',
    elementId: 'water',
    category: 'special',
    power: 50,
    synergy: { partnerElementIds: ['fire'], powerBonusPercent: 50 }
  } as Skill
)
const superconductor: TraitDef = {
  id: 'superconductor',
  kind: 'positive',
  hooks: [{ type: 'abilityFlag', params: { flag: 'grantsSynergy' } }]
}
const trait = (id: string, hooks: TraitDef['hooks']): TraitDef => ({ id, kind: 'positive', hooks })
raw.traits.push(
  superconductor,
  trait('synergyMaster', [{ type: 'synergyBoost', params: { percent: 50 } }]),
  trait('resistant', [
    { type: 'statusDurationBonus', params: { turns: -1, on: 'received', statusIds: ['coldT'] } }
  ]),
  trait('receptive', [
    { type: 'statusDurationBonus', params: { turns: 1, on: 'received', kind: 'buff' } }
  ]),
  trait('gottaGoFast', [
    { type: 'conditionalPriority', params: { amount: 0, maxPriority: 0, setTo: 1 } }
  ]),
  trait('contagious', [
    {
      type: 'trigger',
      params: {
        on: 'leave',
        scope: 'foes',
        effects: [{ do: 'status', to: 'subject', statusId: 'coldT', turns: 2 }]
      }
    }
  ])
)
raw.skills.push(
  {
    ...base,
    id: 'rushT',
    elementId: 'normal',
    category: 'physical',
    power: 40,
    spell: { after: [{ do: 'exhaust', to: 'self' }] }
  } as Skill,
  {
    ...base,
    id: 'slowT',
    elementId: 'normal',
    category: 'physical',
    power: 40,
    priority: -2
  } as Skill,
  {
    ...base,
    id: 'quickT',
    elementId: 'normal',
    category: 'physical',
    power: 40,
    priority: 2
  } as Skill
)
const data = createGameData(withFixtureText(raw))

const idle = (id: string, fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], level: 50, ...fields })
const statusIdsOf = (monster: Monster): string[] => monster.statuses.map((s) => s.statusId)
const submit = (state: GameState, commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

describe('stacksInto / faintsOnEnd', () => {
  it('Cold lần đầu giữ Cold, lần hai thành Frozen (bỏ Cold)', () => {
    const d = cloneDraft(makeBattleState([idle('a')], [idle('e')]))
    const target = d.party[0]
    inflictStatus(data, d, target, 'coldT')
    expect(statusIdsOf(target)).toEqual(['coldT'])
    inflictStatus(data, d, target, 'coldT')
    expect(statusIdsOf(target)).toEqual(['frozenT'])
  })

  it('Doomed hết đếm ngược thì gục; không có trạng thái thì không', () => {
    const doomed = makeBattleState(
      [idle('a', { statuses: [{ statusId: 'doomedT', turnsLeft: 1 }] })],
      [idle('e')]
    )
    const after = submit(doomed, [{ slot: 0, kind: 'skill', skillId: 'idle' }])
    expect(isFainted(data, defined(after.party[0]))).toBe(true)
    expect(defined(after.battle).log.some((e) => e.type === 'perished')).toBe(true)
    const plain = submit(makeBattleState([idle('a')], [idle('e')]), [
      { slot: 0, kind: 'skill', skillId: 'idle' }
    ])
    expect(isFainted(data, defined(plain.party[0]))).toBe(false)
  })

  it('Doomed với HP cực lớn vẫn gục, không ra NaN', () => {
    const state = makeBattleState(
      [idle('a', { level: 1e6, statuses: [{ statusId: 'doomedT', turnsLeft: 1 }] })],
      [idle('e')]
    )
    const monster = defined(submit(state, [{ slot: 0, kind: 'skill', skillId: 'idle' }]).party[0])
    expect(monster.damageTaken.eq(getMaxHp(data, monster))).toBe(true)
  })
})

describe('neutralTaken / blocksSynergy / grantsSynergy', () => {
  /** Sát thương splash lên địch e (hệ `elementIds`, có / không Nullified). */
  function splashDamage(elementIds: string[], nullified: boolean): string {
    const foe = idle('e', {
      elementIds,
      statuses: nullified ? [{ statusId: 'nullifiedT', turnsLeft: 3 }] : []
    })
    const state = makeBattleState([makeMonster({ id: 'a', skillIds: ['splash'] })], [foe])
    const after = submit(state, [{ slot: 0, kind: 'skill', skillId: 'splash', target: 0 }])
    const event = defined(after.battle).log.find((e) => e.type === 'damage' && e.targetId === 'e')
    return event?.type === 'damage' ? event.amount.toString() : ''
  }

  it('Nullified: đòn khắc / bị kháng thành trung tính như hệ thường', () => {
    const neutral = splashDamage(['normal'], false)
    expect(splashDamage(['fire'], false)).not.toBe(neutral)
    expect(splashDamage(['fire'], true)).toBe(neutral)
  })

  function synergyLogged(user: Partial<Monster>, ally: Partial<Monster>): boolean {
    const party = [
      makeMonster({ id: 'a', skillIds: ['tidalT'], ...user }),
      idle('b', { elementIds: ['fire'], ...ally })
    ]
    const after = submit(makeBattleState(party, [idle('e')]), [
      { slot: 0, kind: 'skill', skillId: 'tidalT', target: 0 },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    return defined(after.battle).log.some((e) => e.type === 'synergy')
  }

  it('Isolated ở quái dùng hoặc đồng đội thì tắt synergy', () => {
    const isolated = [{ statusId: 'isolatedT', turnsLeft: 3 }]
    expect(synergyLogged({}, {})).toBe(true)
    expect(synergyLogged({ statuses: isolated }, {})).toBe(false)
    expect(synergyLogged({}, { statuses: isolated })).toBe(false)
  })

  it('grantsSynergy: đồng đội sai hệ vẫn kích hoạt', () => {
    expect(synergyLogged({}, { elementIds: ['normal'] })).toBe(false)
    const traits = [{ id: 'superconductor', level: 1 }]
    expect(synergyLogged({}, { elementIds: ['normal'], traits })).toBe(true)
  })
})

describe('kiểm tra dữ liệu trạng thái Temtem', () => {
  it('báo lỗi stacksInto / faintsOnEnd sai', () => {
    const issues = dataIssuesAfter((rawData) => {
      rawData.statuses.push(
        { id: 'selfStack', kind: 'debuff', hooks: [], stacksInto: 'selfStack' },
        { id: 'ghostStack', kind: 'debuff', hooks: [], stacksInto: 'nope' },
        { id: 'endlessDoom', kind: 'debuff', hooks: [], faintsOnEnd: true },
        { id: 'badDoom', kind: 'debuff', hooks: [], faintsOnEnd: 'yes' as never }
      )
      Object.assign(rawData.config.ai.statusWeights, {
        selfStack: 0,
        ghostStack: 0,
        endlessDoom: 0,
        badDoom: 0
      })
    }).join('\n')
    expect(issues).toContain('stacksInto không được là chính nó')
    expect(issues).toContain('stacksInto: trạng thái không tồn tại "nope"')
    expect(issues).toContain('faintsOnEnd cần duration')
    expect(issues).toContain('faintsOnEnd chỉ được là true')
  })
})

describe('hook trait Temtem khác', () => {
  it('synergyBoost: synergy có tác dụng thì sát thương cao hơn, không có thì như thường', () => {
    const damage = (traitIds: string[], allyElement: string): number => {
      const traits = traitIds.map((id) => ({ id, level: 1 }))
      const party = [
        makeMonster({ id: 'a', skillIds: ['tidalT'], traits }),
        idle('b', { elementIds: [allyElement] })
      ]
      const after = submit(makeBattleState(party, [idle('e')]), [
        { slot: 0, kind: 'skill', skillId: 'tidalT', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'idle' }
      ])
      const event = defined(after.battle).log.find((e) => e.type === 'damage' && e.targetId === 'e')
      return event?.type === 'damage' ? event.amount.toNumber() : 0
    }
    expect(damage(['synergyMaster'], 'fire')).toBeGreaterThan(damage([], 'fire'))
    expect(damage(['synergyMaster'], 'normal')).toBe(damage([], 'normal'))
  })

  it('Resistant: trạng thái 1 lượt không dính, 2 lượt còn 1; Receptive: buff +1 lượt', () => {
    const d = cloneDraft(
      makeBattleState(
        [
          idle('a', { traits: [{ id: 'resistant', level: 1 }] }),
          idle('b', { traits: [{ id: 'receptive', level: 1 }] })
        ],
        [idle('e')]
      )
    )
    const [resistant, receptive] = d.party
    inflictStatus(data, d, resistant, 'coldT', { turns: 1 })
    expect(statusIdsOf(resistant)).toEqual([])
    expect(d.battle.log.some((e) => e.type === 'statusImmune')).toBe(true)
    inflictStatus(data, d, resistant, 'coldT', { turns: 2 })
    expect(resistant.statuses[0]?.turnsLeft).toBe(1)
    inflictStatus(data, d, receptive, 'shieldT', { turns: 2 })
    expect(receptive.statuses[0]?.turnsLeft).toBe(3)
  })

  it('Gotta Go Fast: chiêu ưu tiên ≤ 0 lên 1, chiêu ưu tiên cao giữ nguyên', () => {
    const fast = idle('a', { traits: [{ id: 'gottaGoFast', level: 1 }] })
    expect(skillPriority(data, fast, data.skills.slowT)).toBe(1)
    expect(skillPriority(data, fast, data.skills.quickT)).toBe(2)
    expect(skillPriority(data, idle('b'), data.skills.slowT)).toBe(-2)
  })

  it('sự kiện leave: địch rút về thì quái mang Contagious gây trạng thái lên nó', () => {
    const party = [idle('a'), idle('x'), idle('c')]
    const foe = idle('e', { traits: [{ id: 'contagious', level: 1 }] })
    const after = submit(makeBattleState(party, [foe]), [
      { slot: 0, kind: 'switch', monsterId: 'c' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    const left = defined(after.party.find((monster) => monster.id === 'a'))
    expect(statusIdsOf(left)).toContain('coldT')
  })

  it('exhaust: quái dùng mất lượt kế tiếp', () => {
    const state = makeBattleState([makeMonster({ id: 'a', skillIds: ['rushT'] })], [idle('e')])
    const after = submit(state, [{ slot: 0, kind: 'skill', skillId: 'rushT', target: 0 }])
    expect(defined(after.battle).records.a?.exhaustedTurn).toBe(2)
  })

  it('kiểm tra dữ liệu: statusDurationBonus turns 0, on lạ; conditionalPriority setTo lẻ; statusEffectCost', () => {
    const issues = dataIssuesAfter((rawData) => {
      rawData.traits.push(
        trait('badBonus', [{ type: 'statusDurationBonus', params: { turns: 0, on: 'x' } }]),
        trait('badPriority', [{ type: 'conditionalPriority', params: { amount: 0, setTo: 0.5 } }]),
        trait('badBoost', [{ type: 'synergyBoost', params: { percent: 0 } }])
      )
      rawData.config.stamina.statusEffectCost.perStage = -1
    }).join('\n')
    expect(issues).toContain('turns phải khác 0')
    expect(issues).toContain('on phải là inflicted / received')
    expect(issues).toContain('setTo')
    expect(issues).toContain('badBoost')
    expect(issues).toContain('statusEffectCost.perStage')
  })
})
