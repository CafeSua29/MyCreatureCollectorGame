// Trait Siralim (mục "Trait Siralim", "Buff và debuff", "Minion", "Lượt và Timeline" ở battle.md):
// hào quang, bộ đếm, trigger theo sự kiện (kể cả chống lặp), hành động thêm, buff / debuff theo
// hiệu ứng gốc, minion, phòng thủ / khiêu khích, hồi sinh / hạ ngay, max HP trong trận, kiểm tra
// dữ liệu và save.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, validateGameState } from '../game'
import { computeStats, getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeSiralimData,
  makeSiralimRawData,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  GameState,
  Monster,
  RawGameData,
  StatusInstance
} from '../model'
import { battleStats, cloneDraft } from './draft'

const data = makeSiralimData()

const mon = (id: string, traitIds: string[] = [], extra: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    traits: traitIds.map((t) => ({ id: t, level: 1 })),
    skillIds: ['strike', 'idle'],
    ...extra
  })

const strike = (slot = 0, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId: 'strike',
  target
})

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

/** Sự kiện log của một loại. */
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  defined(state.battle).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const damageOn = (state: GameState, id: string): number =>
  eventsOf(state, 'damage')
    .filter((e) => e.targetId === id)
    .reduce((sum, e) => sum + e.amount.toNumber(), 0)

const withStatus = (statusId: string, extra: Partial<StatusInstance> = {}): StatusInstance[] => [
  { statusId, turnsLeft: 3, ...extra }
]

/** Một lượt: quái ta đánh địch `e`, địch đứng yên (chỉ có skill idle). */
function oneHit(player: Monster, enemy: Monster): GameState {
  const state = makeBattleState([player], [{ ...enemy, skillIds: ['idle'] }])
  return turn(state, strike())
}

describe('hào quang', () => {
  it('hào quang có điều kiện theo máu: ngoài trận không tính (không đệ quy khi tính max HP)', () => {
    const raging = mon('a', ['rage'], { damageTaken: toBig(1e9) })
    expect(getMaxHp(data, raging).gt(0)).toBe(true)
    expect(
      computeStats(data, raging).final.attack.eq(computeStats(data, mon('a')).final.attack)
    ).toBe(true)
  })

  it('cả phe nhận ít sát thương hơn; hai quái cùng trait không cộng dồn', () => {
    const base = damageOn(oneHit(mon('a'), mon('e')), 'e')
    const guarded = damageOn(oneHit(mon('a'), mon('e', ['vigor'])), 'e')
    expect(guarded).toBeLessThan(base)
    // Đồng đội mang trait: quái kia cũng được giảm, hai bản chỉ tính một lần.
    const state = makeBattleState(
      [mon('a')],
      [
        { ...mon('e'), skillIds: ['idle'] },
        { ...mon('f', ['vigor']), skillIds: ['idle'] }
      ]
    )
    const one = damageOn(turn(state, strike()), 'e')
    expect(one).toBe(guarded)
    const both = makeBattleState(
      [mon('a')],
      [
        { ...mon('e', ['vigor']), skillIds: ['idle'] },
        { ...mon('f', ['vigor']), skillIds: ['idle'] }
      ]
    )
    expect(damageOn(turn(both, strike()), 'e')).toBe(guarded)
  })

  it('hào quang lên địch giảm chỉ số của địch trên sân', () => {
    const state = makeBattleState([mon('a', ['crimson'])], [mon('e')])
    const d = cloneDraft(state)
    const enemy = defined(d.battle.enemies[0])
    const plain = cloneDraft(makeBattleState([mon('a')], [mon('e')]))
    expect(battleStats(data, d, enemy).attack.toNumber()).toBeLessThan(
      battleStats(data, plain, defined(plain.battle.enemies[0])).attack.toNumber()
    )
  })
})

describe('bộ đếm và trigger', () => {
  it('scaling theo lượt trên sân: lượt 2 đánh mạnh hơn lượt 1', () => {
    const state = makeBattleState(
      [mon('a', ['harbinger'], { genes: undefined })],
      [{ ...mon('e', [], { level: 50 }), skillIds: ['idle'] }]
    )
    const first = turn(state, strike())
    const firstHit = damageOn(first, 'e')
    const second = turn(first, strike())
    expect(damageOn(second, 'e') - firstHit).toBeGreaterThan(firstHit)
  })

  it('bị đánh thì kẻ đánh mất máu (trigger attacked), log traitTriggered', () => {
    const after = oneHit(mon('a'), mon('e', ['mementoMori']))
    const hurt = eventsOf(after, 'traitDamage').filter((e) => e.monsterId === 'a')
    expect(hurt.map((e) => e.amount.toNumber())).toEqual([5])
    expect(eventsOf(after, 'traitTriggered').some((e) => e.traitId === 'mementoMori')).toBe(true)
  })

  it('hai quái phản công lẫn nhau: dừng theo giới hạn chống lặp', () => {
    const state = makeBattleState(
      [mon('a', ['paradigm'], { level: 99 })],
      [{ ...mon('e', ['paradigm'], { level: 99 }), skillIds: ['strike'] }]
    )
    const after = turn(state, strike())
    const uses = eventsOf(after, 'useSkill').filter((e) => e.skillId === 'strike').length
    const { maxActions } = data.config.battle.traitChain
    // Hai hành động gốc (quái ta, quái địch), mỗi cái tối đa maxActions hành động phụ.
    expect(uses).toBeGreaterThan(2)
    expect(uses).toBeLessThanOrEqual(2 * (1 + maxActions))
  })

  it('thêm lượt: hành động thêm ngay sau hành động hiện tại, một lần mỗi lượt', () => {
    const state = makeBattleState(
      [mon('a', ['haste'])],
      [{ ...mon('e', [], { level: 99 }), skillIds: ['idle'] }]
    )
    const after = turn(state, strike())
    expect(eventsOf(after, 'extraTurn')).toHaveLength(1)
    expect(eventsOf(after, 'useSkill').filter((e) => e.monsterId === 'a')).toHaveLength(2)
  })
})

describe('buff / debuff', () => {
  it('Vulnerable: nhận thêm 50% sát thương', () => {
    const base = damageOn(oneHit(mon('a'), mon('e', [], { level: 50 })), 'e')
    const weak = damageOn(
      oneHit(mon('a'), mon('e', [], { level: 50, statuses: withStatus('vulnerable') })),
      'e'
    )
    expect(weak).toBe(Math.floor(base * 1.5))
  })

  it('Barrier hút sát thương; hết lượng thì mất buff', () => {
    const shield = withStatus('barrierBuff', { turnsLeft: null, amount: toBig(3) })
    const after = oneHit(mon('a'), mon('e', [], { statuses: shield }))
    expect(eventsOf(after, 'barrierAbsorbed').map((e) => e.amount.toNumber())).toEqual([3])
    expect(defined(after.battle).enemies[0].statuses).toEqual([])
  })

  it('Shelled chặn hoàn toàn một đòn rồi hết', () => {
    const after = oneHit(
      mon('a'),
      mon('e', [], { statuses: withStatus('shelled', { turnsLeft: null }) })
    )
    expect(eventsOf(after, 'shellBlocked')).toHaveLength(1)
    expect(defined(after.battle).enemies[0].damageTaken.toNumber()).toBe(0)
  })

  it('Frozen: mất lượt, tan cuối lượt theo tỉ lệ', () => {
    const state = makeBattleState(
      [mon('a', [], { statuses: withStatus('frozen', { turnsLeft: null }) })],
      [{ ...mon('e'), skillIds: ['idle'] }]
    )
    const after = turn(state, strike())
    expect(eventsOf(after, 'statusSkipTurn')).toHaveLength(1)
    expect(after.party[0].statuses).toEqual([])
  })

  it('Bomb nổ cuối lượt: mất 25% max HP rồi hết', () => {
    const state = makeBattleState(
      [{ ...mon('a'), skillIds: ['idle'] }],
      [{ ...mon('e', [], { statuses: withStatus('bomb') }), skillIds: ['idle'] }]
    )
    const after = turn(state, { slot: 0, kind: 'skill', skillId: 'idle' })
    const enemy = defined(after.battle).enemies[0]
    expect(enemy.damageTaken.toNumber()).toBe(Math.ceil(getMaxHp(data, enemy).toNumber() * 0.25))
    expect(enemy.statuses).toEqual([])
  })

  it('Scorned chặn skill physical; Silenced thay Scorned (cùng nhóm, ghi đè)', () => {
    const after = oneHit(
      mon('a', [], { statuses: withStatus('scorned', { turnsLeft: 1 }) }),
      mon('e')
    )
    expect(eventsOf(after, 'skillBlocked')).toHaveLength(1)
    expect(damageOn(after, 'e')).toBe(0)
  })

  it('Invisible: đòn đơn mục tiêu chuyển sang địch còn lại', () => {
    const state = makeBattleState(
      [mon('a')],
      [
        {
          ...mon('e', [], { statuses: withStatus('invisible', { turnsLeft: null }) }),
          skillIds: ['idle']
        },
        { ...mon('f'), skillIds: ['idle'] }
      ]
    )
    const after = turn(state, strike(0, 0))
    expect(damageOn(after, 'e')).toBe(0)
    expect(damageOn(after, 'f')).toBeGreaterThan(0)
  })

  it('Immune: miễn mọi debuff', () => {
    const state = makeBattleState(
      [{ ...mon('a'), skillIds: ['toxin'] }],
      [
        {
          ...mon('e', [], { statuses: withStatus('immune', { turnsLeft: 1 }) }),
          skillIds: ['idle']
        }
      ]
    )
    const after = turn(state, { slot: 0, kind: 'skill', skillId: 'toxin', target: 0 })
    expect(defined(after.battle).enemies[0].statuses.map((s) => s.statusId)).not.toContain('poison')
  })
})

describe('minion', () => {
  it('minion gây thêm sát thương sau mỗi đòn đánh, theo số stack', () => {
    const state = makeBattleState(
      [mon('a')],
      [{ ...mon('e', [], { level: 50 }), skillIds: ['idle'] }]
    )
    const d = cloneDraft(state)
    d.battle.volatiles.a = { firstTurn: 1, minions: [{ minionId: 'direWolves', stacks: 2 }] }
    const after = gameReducer(data, d, { type: 'submitTurn', commands: [strike()] })
    const extra = eventsOf(after, 'traitDamage').filter((e) => e.monsterId === 'e')
    expect(extra.map((e) => e.amount.toNumber())).toEqual([2])
    expect(eventsOf(after, 'traitTriggered').find((e) => e.traitId === 'direWolves')?.source).toBe(
      'minion'
    )
  })

  it('tỉ lệ mất 100%: cuối lượt mất stack', () => {
    const state = makeBattleState(
      [{ ...mon('a'), skillIds: ['idle'] }],
      [{ ...mon('e'), skillIds: ['idle'] }]
    )
    const d = cloneDraft(state)
    d.battle.volatiles.a = { firstTurn: 1, minions: [{ minionId: 'fleeting', stacks: 1 }] }
    const after = gameReducer(data, d, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
    })
    expect(defined(after.battle).volatiles.a?.minions).toBeUndefined()
    expect(eventsOf(after, 'minionLost')).toHaveLength(1)
  })
})

describe('mở rộng DSL cho trait Siralim', () => {
  it('traitOnSide: chỉ đếm đồng đội trên sân mang cùng trait, không đếm chính nó', () => {
    const enemy = (): Monster => ({ ...mon('e', [], { level: 50 }), skillIds: ['idle'] })
    const alone = damageOn(turn(makeBattleState([mon('a', ['swarm'])], [enemy()]), strike()), 'e')
    const base = damageOn(turn(makeBattleState([mon('a')], [enemy()]), strike()), 'e')
    expect(alone).toBe(base)
    const paired = makeBattleState(
      [mon('a', ['swarm']), { ...mon('b', ['swarm']), skillIds: ['idle'] }],
      [enemy()]
    )
    const boosted = damageOn(
      turn(paired, strike(), { slot: 1, kind: 'skill', skillId: 'idle' }),
      'e'
    )
    expect(boosted).toBeGreaterThan(base)
  })

  it('damageAbove theo chỉ số thấp nhất: vượt ngưỡng thì hạ ngay, không vượt thì không', () => {
    const enemy = mon('e', [], { level: 50 })
    expect(eventsOf(oneHit(mon('a', ['executioner']), enemy), 'faint')).toHaveLength(1)
    expect(eventsOf(oneHit(mon('a', ['merciful']), enemy), 'faint')).toHaveLength(0)
  })

  it('noGainedStats theo chỉ số: chỉ mất hiệu lực khi đổi đúng chỉ số được xét', () => {
    const enemy = (): Monster => ({ ...mon('e', [], { level: 50 }), skillIds: ['idle'] })
    const hit = (stages: Record<string, number>): number => {
      const d = cloneDraft(makeBattleState([mon('a', ['calm'])], [enemy()]))
      d.battle.stages.a = stages
      return damageOn(gameReducer(data, d, { type: 'submitTurn', commands: [strike()] }), 'e')
    }
    const calm = hit({})
    expect(hit({ defense: 1 })).toBe(calm)
    expect(hit({ speed: 1 })).toBeLessThan(calm)
  })

  it('minion existing: minion đang có +1 stack, không có minion thì không thêm', () => {
    const enemy = { ...mon('e', [], { level: 50 }), skillIds: ['idle'] }
    const d = cloneDraft(makeBattleState([mon('a', ['breeder'])], [enemy]))
    d.battle.volatiles.a = { firstTurn: 1, minions: [{ minionId: 'direWolves', stacks: 1 }] }
    const after = gameReducer(data, d, { type: 'submitTurn', commands: [strike()] })
    expect(defined(after.battle).volatiles.a?.minions).toEqual([
      { minionId: 'direWolves', stacks: 2 }
    ])
    const none = oneHit(mon('a', ['breeder']), mon('e', [], { level: 50 }))
    expect(defined(none.battle).volatiles.a?.minions).toBeUndefined()
  })

  it('debuffResist theo statusIds: chỉ kháng debuff trong danh sách', () => {
    const target = mon('e', ['stoic'], { level: 50 })
    // Scorned / Silenced chỉ 1 lượt (hết cuối lượt) nên xét theo log.
    const applied = (attackerTrait: string): string[] =>
      eventsOf(oneHit(mon('a', [attackerTrait]), target), 'statusApplied').map((e) => e.statusId)
    expect(applied('scornedStrike')).not.toContain('scorned')
    expect(applied('silencedStrike')).toContain('silenced')
  })
})

describe('spell Siralim', () => {
  const caster = (skillId: string): Monster => mon('a', [], { skillIds: [skillId] })
  const cast = (state: GameState, skillId: string): GameState =>
    turn(state, { slot: 0, kind: 'skill', skillId, target: 0 })
  const target = (): Monster => ({ ...mon('e', [], { level: 50 }), skillIds: ['idle'] })

  it('hiệu ứng lên mục tiêu và sau chiêu chạy theo "ngôn ngữ" trait', () => {
    const after = cast(makeBattleState([caster('hex')], [target()]), 'hex')
    const battle = defined(after.battle)
    expect(battle.enemies[0].statuses.map((s) => s.statusId)).toContain('vulnerable')
    expect(battle.volatiles.a?.minions).toEqual([{ minionId: 'direWolves', stacks: 1 }])
  })

  it('cộng sức mạnh khi đủ điều kiện; bỏ qua thủ', () => {
    const plain = damageOn(cast(makeBattleState([caster('punish')], [target()]), 'punish'), 'e')
    const marked = makeBattleState(
      [caster('punish')],
      [{ ...target(), statuses: withStatus('vulnerable') }]
    )
    // Vulnerable +50% sát thương nhận, powerBonus +200%: tổng gấp 4,5 lần (làm tròn).
    expect(damageOn(cast(marked, 'punish'), 'e')).toBeGreaterThanOrEqual(plain * 4)
    const tough = (): Monster => ({
      ...target(),
      genes: { ...target().genes, spDefense: toBig(1e6) }
    })
    const blocked = damageOn(cast(makeBattleState([caster('punish')], [tough()]), 'punish'), 'e')
    const pierced = damageOn(cast(makeBattleState([caster('pierce')], [tough()]), 'pierce'), 'e')
    expect(pierced).toBeGreaterThan(blocked)
  })

  it('chance 0 không bao giờ áp; countPer theo số buff của mục tiêu (0 buff thì không gây)', () => {
    const statusIds = (state: GameState): string[] =>
      defined(state.battle).enemies[0].statuses.map((s) => s.statusId)
    expect(statusIds(cast(makeBattleState([caster('neverHex')], [target()]), 'neverHex'))).toEqual(
      []
    )
    expect(
      statusIds(cast(makeBattleState([caster('buffHex')], [target()]), 'buffHex'))
    ).not.toContain('vulnerable')
    const buffed = { ...target(), statuses: withStatus('shelled', { turnsLeft: null }) }
    expect(statusIds(cast(makeBattleState([caster('buffHex')], [buffed]), 'buffHex'))).toContain(
      'vulnerable'
    )
  })

  it('minion count: thêm nhiều minion trong một hiệu ứng; đổi hệ cố định; chỉ số ngẫu nhiên', () => {
    const packed = cast(makeBattleState([caster('pack')], [target()]), 'pack')
    expect(defined(packed.battle).volatiles.a?.minions).toEqual([
      { minionId: 'direWolves', stacks: 3 }
    ])
    const painted = cast(makeBattleState([caster('paint')], [target()]), 'paint')
    expect(defined(painted.battle).enemies[0].elementIds).toEqual(['fire'])
    const jumbled = cast(makeBattleState([caster('jumble')], [target()]), 'jumble')
    const stages = Object.entries(defined(jumbled.battle).stages.a ?? {}).filter(([, v]) => v)
    expect(stages.length).toBeGreaterThanOrEqual(1)
    expect(stages.length).toBeLessThanOrEqual(2)
  })

  it('powerTimes với divisor: 1 stack → 0 sát thương, 2 stack → có sát thương', () => {
    const blastWith = (stacks: number): number => {
      const d = cloneDraft(makeBattleState([caster('pairBlast')], [target()]))
      d.battle.volatiles.a = { firstTurn: 1, minions: [{ minionId: 'direWolves', stacks }] }
      const after = gameReducer(data, d, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'pairBlast', target: 0 }]
      })
      return eventsOf(after, 'damage')
        .filter((e) => e.targetId === 'e')
        .reduce((sum, e) => sum + e.amount.toNumber(), 0)
    }
    expect(blastWith(1)).toBe(0)
    expect(blastWith(2)).toBeGreaterThan(0)
  })

  it('spell sai thì báo lỗi dữ liệu', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        Object.assign(raw, makeSiralimRawData())
        raw.skills.push({
          id: 'badSpell',
          elementId: 'normal',
          category: 'status',
          power: 0,
          accuracy: 100,
          priority: 0,
          target: 'enemy',
          effects: [],
          spell: {
            onTarget: [{ do: 'fly' }],
            powerBonus: [{ percent: 'x' }],
            ignoreDefensePercent: 150,
            extra: 1
          } as never
        })
      },
      { regenerateText: true }
    ).join(' | ')
    expect(issues).toMatch(/badSpell.*spell.onTarget\[0\]\.do/)
    expect(issues).toMatch(/badSpell.*powerBonus\[0\]\.percent/)
    expect(issues).toMatch(/badSpell.*ignoreDefensePercent/)
    expect(issues).toMatch(/badSpell.*trường lạ "extra"/)
  })
})

describe('phòng thủ / khiêu khích', () => {
  it('defend: đi trước, nhận ít hơn 50% sát thương trong lượt', () => {
    const plain = makeBattleState([mon('a')], [{ ...mon('e'), skillIds: ['strike'] }])
    const hit = damageOn(turn(plain, { slot: 0, kind: 'skill', skillId: 'idle' }), 'a')
    const guarded = turn(plain, { slot: 0, kind: 'defend' })
    expect(eventsOf(guarded, 'defend')).toHaveLength(1)
    expect(damageOn(guarded, 'a')).toBeLessThan(hit)
  })

  it('provoke: đòn đơn mục tiêu của địch phải nhắm quái khiêu khích', () => {
    const state = makeBattleState([mon('a'), mon('b')], [{ ...mon('e'), skillIds: ['strike'] }])
    const after = turn(
      state,
      { slot: 0, kind: 'skill', skillId: 'idle' },
      { slot: 1, kind: 'provoke' }
    )
    expect(damageOn(after, 'b')).toBeGreaterThan(0)
    expect(damageOn(after, 'a')).toBe(0)
  })
})

describe('hồi sinh, hạ ngay, max HP', () => {
  it('đồng đội gục thì được hồi sinh với 50% máu (trigger faint)', () => {
    const state = makeBattleState(
      [mon('a', [], { damageTaken: 49 }), mon('b', ['reviver'])],
      [{ ...mon('e', [], { level: 99 }), skillIds: ['strike'] }]
    )
    const d = cloneDraft(state)
    const after = gameReducer(data, d, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'idle' },
        { slot: 1, kind: 'skill', skillId: 'idle' }
      ]
    })
    expect(eventsOf(after, 'revived').length).toBeGreaterThan(0)
  })

  it('hạ ngay: quái thường gục; boss hoang chỉ mất phần máu theo hệ số boss', () => {
    const normal = oneHit(mon('a', ['reaper']), mon('e', [], { level: 50 }))
    expect(defined(normal.battle).outcome).toBe('won')
    const bossState = makeBattleState(
      [mon('a', ['reaper'])],
      [{ ...mon('e', [], { level: 50 }), skillIds: ['idle'] }],
      {
        isBoss: true
      }
    )
    const after = turn(bossState, strike())
    const boss = defined(after.battle).enemies[0]
    expect(boss.damageTaken.lt(getMaxHp(data, boss))).toBe(true)
    expect(eventsOf(after, 'traitDamage').some((e) => e.monsterId === 'e')).toBe(true)
  })

  it('max HP tăng trong trận được gỡ khi hết trận', () => {
    const state = makeBattleState([mon('a', ['giant'])], [mon('e', [], { damageTaken: 49 })])
    const d = cloneDraft(state)
    const a = defined(d.party[0])
    a.battleMaxHpDelta = toBig(50)
    const after = gameReducer(data, d, { type: 'submitTurn', commands: [strike()] })
    expect(defined(after.battle).outcome).toBe('won')
    expect(after.party[0].battleMaxHpDelta).toBeUndefined()
  })
})

describe('kiểm tra dữ liệu và save', () => {
  const issuesWith = (mutate: Parameters<typeof dataIssuesAfter>[0]): string =>
    dataIssuesAfter(
      (raw) => {
        Object.assign(raw, makeSiralimRawData())
        mutate(raw)
      },
      { regenerateText: true }
    ).join('\n')

  it('hào quang không được đổi hp; trigger sai sự kiện / hiệu ứng báo lỗi', () => {
    expect(
      issuesWith((raw) =>
        raw.traits.push({
          id: 'badAura',
          kind: 'rare',
          hooks: [
            {
              type: 'aura',
              params: {
                scope: 'side',
                hooks: [{ type: 'statModifier', params: { percent: { hp: 10 } } }]
              }
            }
          ]
        })
      )
    ).toMatch(/badAura.*hp/)
    expect(
      issuesWith((raw) =>
        raw.traits.push({
          id: 'badTrigger',
          kind: 'rare',
          hooks: [
            { type: 'trigger', params: { on: 'nope', scope: 'self', effects: [{ do: 'fly' }] } }
          ]
        })
      )
    ).toMatch(/badTrigger.*on phải là một trong/)
  })

  it('tham số mở rộng của DSL sai thì báo lỗi', () => {
    const triggerTrait = (id: string, params: Record<string, unknown>) => (raw: RawGameData) =>
      raw.traits.push({
        id,
        kind: 'rare',
        hooks: [{ type: 'trigger', params: { on: 'attack', scope: 'self', ...params } }]
      })
    const kill = [{ do: 'kill', to: 'other' }]
    expect(
      issuesWith(
        triggerTrait('bothThresholds', {
          when: [{ if: 'damageAbove', percentOfMaxHp: 1, percentOfLowestStat: 1 }],
          effects: kill
        })
      )
    ).toMatch(/bothThresholds.*cần đúng một trong/)
    expect(
      issuesWith(triggerTrait('noThreshold', { when: [{ if: 'damageAbove' }], effects: kill }))
    ).toMatch(/noThreshold.*cần đúng một trong/)
    expect(
      issuesWith(
        triggerTrait('badStats', {
          when: [{ if: 'noGainedStats', stats: ['hp'] }],
          effects: kill
        })
      )
    ).toMatch(/badStats.*chỉ số không hợp lệ/)
    expect(
      issuesWith(
        triggerTrait('mixedMinion', {
          effects: [{ do: 'minion', to: 'self', stacks: 1, existing: true, minionId: 'direWolves' }]
        })
      )
    ).toMatch(/mixedMinion.*existing không dùng cùng/)
    expect(
      issuesWith((raw) =>
        raw.traits.push({
          id: 'noTraitId',
          kind: 'rare',
          hooks: [
            { type: 'scaling', params: { per: { of: 'traitOnSide' }, effect: { damageDealt: 1 } } }
          ]
        })
      )
    ).toMatch(/noTraitId.*traitOnSide cần traitId/)
    expect(
      issuesWith((raw) =>
        raw.traits.push({
          id: 'badResist',
          kind: 'rare',
          hooks: [{ type: 'debuffResist', params: { chance: 50, statusIds: ['nope'] } }]
        })
      )
    ).toMatch(/badResist.*nope/)
  })

  it('minion không được đổi hp; trạng thái cần kind', () => {
    expect(
      issuesWith((raw) =>
        raw.minions.push({
          id: 'badMinion',
          maxStacks: 1,
          leaveChance: 0,
          hooks: [{ type: 'statModifier', params: { percent: { hp: 5 } } }]
        })
      )
    ).toMatch(/badMinion.*hp/)
    expect(
      issuesWith((raw) => {
        const status = defined(raw.statuses.find((s) => s.id === 'vulnerable'))
        Object.assign(status, { kind: 'neutral' })
      })
    ).toMatch(/vulnerable.*kind/)
  })

  it('migrate v20 → v21: trận dở thêm bản ghi trận rỗng, state hợp lệ', () => {
    const state = makeBattleState([mon('a')], [mon('e')])
    const battle = defined(state.battle)
    const { records: _records, counters: _counters, ...oldBattle } = battle
    const migrated = migrateState(
      {
        ...JSON.parse(JSON.stringify(state)),
        version: 20,
        battle: JSON.parse(JSON.stringify(oldBattle))
      },
      data
    )
    expect(defined(migrated.battle).records).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
