// Điều kiện chiêu theo việc trong lượt (battle.md mục "Việc trong lượt", trait-dsl.md): `spell.requires`
// (thất bại lên mục tiêu không thỏa), điều kiện fieldActive / pendingSkill / lastSkillFailed /
// actedThisTurn / hitThisTurn / statsChangedThisTurn / holdsItem / grounded / transformed, nhật ký
// trong lượt bỏ ở cuối lượt, AI bỏ skill không thỏa, kiểm tra dữ liệu và save.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { checkAllConditions, type DslCondition } from '../registries'
import { gameReducer, validateGameState } from '../game'
import {
  dataIssuesAfter,
  defined,
  makeBattleContext,
  makeBattleState,
  makeField,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import { skillAccuracy } from './environment'
import type {
  BattleCommand,
  BattleEvent,
  BattleField,
  GameData,
  GameState,
  Monster,
  Skill
} from '../model'

const attack = (id: string, spell: Skill['spell'], overrides: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  spell,
  ...overrides
})

const doubleWhen = (when: unknown[]): Skill['spell'] => ({ powerBonus: [{ percent: 100, when }] })

const SKILLS: Skill[] = [
  attack('roller', { requires: [{ if: 'fieldActive', layer: 'terrain' }] }),
  attack('ambush', {
    requires: [{ if: 'pendingSkill', who: 'target', categories: ['physical', 'special'] }]
  }),
  attack('tantrum', doubleWhen([{ if: 'lastSkillFailed', who: 'self' }])),
  attack('payback', doubleWhen([{ if: 'actedThisTurn', who: 'target', value: true }])),
  attack('beak', doubleWhen([{ if: 'actedThisTurn', who: 'target', value: false }])),
  attack('avalanche', doubleWhen([{ if: 'hitThisTurn', who: 'self', by: 'target' }])),
  attack('lash', doubleWhen([{ if: 'statsChangedThisTurn', who: 'self', direction: 'lowered' }])),
  attack('plain', undefined),
  attack('acro', doubleWhen([{ if: 'holdsItem', who: 'self', value: false }])),
  attack('groundShock', doubleWhen([{ if: 'grounded', who: 'target', value: true }])),
  attack('antiGiant', doubleWhen([{ if: 'transformed', who: 'target', kinds: ['dynamax'] }])),
  attack('voltRise', doubleWhen([{ if: 'fieldActive', layer: 'terrain', fieldIds: ['misty'] }]))
]

function makeTestData(): GameData {
  const raw = makeRawData()
  raw.skills.push(...SKILLS)
  return createGameData(withFixtureText(raw))
}

const data = makeTestData()

/** Quái mẫu: máu rất lớn để không gục, công lớn để sát thương không bị làm tròn, tốc độ cho trước. */
const fighter = (id: string, skillIds: string[], speed = 10): Monster =>
  makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(10), hp: '1e9', attack: 1000, speed })
  })

const cast = (skillId: string, slot = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0
})

const run = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const battleOf = (state: GameState): NonNullable<GameState['battle']> =>
  defined(state.battle, 'trận')

function eventsOfTurn<T extends BattleEvent['type']>(
  before: GameState,
  after: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] {
  return battleOf(after)
    .log.slice(battleOf(before).log.length)
    .filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type)
}

/** Sát thương quái `targetId` nhận trong lượt (tổng các sự kiện damage lên nó). */
function damageBy(before: GameState, after: GameState, targetId: string): number {
  return eventsOfTurn(before, after, 'damage')
    .filter((event) => event.targetId === targetId)
    .reduce((sum, event) => sum + event.amount.toNumber(), 0)
}

const scene = (player: Monster, enemy: Monster, field: BattleField = makeField()): GameState =>
  makeBattleState([player], [enemy], { field })

describe('spell.requires', () => {
  it('fieldActive: không có địa hình thì thất bại (skillFailed condition), có thì trúng', () => {
    const plain = scene(fighter('a', ['roller']), fighter('e', ['idle']))
    const failed = run(plain, cast('roller'))
    expect(eventsOfTurn(plain, failed, 'skillFailed')).toEqual([
      { type: 'skillFailed', monsterId: 'a', skillId: 'roller', reason: 'condition' }
    ])
    expect(damageBy(plain, failed, 'e')).toBe(0)

    const terrain = scene(
      fighter('a', ['roller']),
      fighter('e', ['idle']),
      makeField({ terrain: 'grassy' })
    )
    expect(damageBy(terrain, run(terrain, cast('roller')), 'e')).toBeGreaterThan(0)
  })

  it('pendingSkill: mục tiêu sắp dùng đòn gây sát thương thì trúng; đã đi / dùng skill status thì thất bại', () => {
    const striking = scene(fighter('a', ['ambush'], 100), fighter('e', ['strike'], 1))
    expect(damageBy(striking, run(striking, cast('ambush')), 'e')).toBeGreaterThan(0)

    const resting = scene(fighter('a', ['ambush'], 100), fighter('e', ['idle'], 1))
    const afterResting = run(resting, cast('ambush'))
    expect(eventsOfTurn(resting, afterResting, 'skillFailed')).toHaveLength(1)

    // Địch nhanh hơn đã dùng đòn trước: không còn skill chờ nên thất bại.
    const faster = scene(fighter('a', ['ambush'], 1), fighter('e', ['strike'], 100))
    expect(damageBy(faster, run(faster, cast('ambush')), 'e')).toBe(0)
  })
})

describe('power theo việc trong lượt', () => {
  it('lastSkillFailed: lần trước thất bại thì ×2, lần sau trúng thì về như thường', () => {
    let state = scene(fighter('a', ['roller', 'tantrum']), fighter('e', ['idle']))
    state = run(state, cast('roller'))
    expect(damageBy(state, run(state, cast('tantrum')), 'e')).toBeGreaterThan(0)
    expect(battleOf(state).volatiles.a?.lastSkillFailed).toBe(true)
    const boosted = run(state, cast('tantrum'))
    const normal = run(boosted, cast('tantrum'))
    expect(damageBy(state, boosted, 'e')).toBe(2 * damageBy(boosted, normal, 'e'))
    expect(battleOf(normal).volatiles.a?.lastSkillFailed).toBeUndefined()
  })

  it('actedThisTurn: Payback ×2 khi mục tiêu đã đi trước, Bolt Beak ×2 khi mục tiêu chưa đi', () => {
    const slow = (skillId: string): number => {
      const state = scene(fighter('a', [skillId], 1), fighter('e', ['idle'], 100))
      return damageBy(state, run(state, cast(skillId)), 'e')
    }
    const fast = (skillId: string): number => {
      const state = scene(fighter('a', [skillId], 100), fighter('e', ['idle'], 1))
      return damageBy(state, run(state, cast(skillId)), 'e')
    }
    expect(fast('payback')).toBeGreaterThan(0)
    expect(slow('payback')).toBe(2 * fast('payback'))
    expect(fast('beak')).toBe(2 * slow('beak'))
  })

  it('hitThisTurn by target: Avalanche ×2 khi đã trúng đòn của mục tiêu trong lượt', () => {
    const hitFirst = scene(fighter('a', ['avalanche'], 1), fighter('e', ['strike'], 100))
    const notHit = scene(fighter('a', ['avalanche'], 1), fighter('e', ['idle'], 100))
    expect(damageBy(notHit, run(notHit, cast('avalanche')), 'e')).toBeGreaterThan(0)
    expect(damageBy(hitFirst, run(hitFirst, cast('avalanche')), 'e')).toBe(
      2 * damageBy(notHit, run(notHit, cast('avalanche')), 'e')
    )
  })

  it('statsChangedThisTurn lowered: Lash Out ×2 khi vừa bị hạ bậc trong lượt', () => {
    const damageOf = (skillId: string, enemySkill: string): number => {
      const state = scene(fighter('a', [skillId], 1), fighter('e', [enemySkill], 100))
      return damageBy(state, run(state, cast(skillId)), 'e')
    }
    expect(damageOf('plain', 'growl')).toBeGreaterThan(0)
    expect(damageOf('lash', 'growl')).toBe(2 * damageOf('plain', 'growl'))
    expect(damageOf('lash', 'idle')).toBe(damageOf('plain', 'idle'))
  })

  it('holdsItem / grounded / transformed / fieldActive theo id', () => {
    const damageOf = (
      skillId: string,
      player: Monster,
      enemy: Monster,
      field?: BattleField
    ): number => {
      const state = scene({ ...player, skillIds: [skillId] }, enemy, field)
      return damageBy(state, run(state, cast(skillId)), 'e')
    }
    const target = fighter('e', ['idle'])
    const user = fighter('a', [])
    const holder: Monster = { ...user, equipment: [{ storage: 'stack', itemId: 'everstone' }] }
    expect(damageOf('acro', holder, target)).toBeGreaterThan(0)
    expect(damageOf('acro', holder, target)).toBe(damageOf('plain', holder, target))
    expect(damageOf('acro', user, target)).toBe(2 * damageOf('plain', user, target))
    const flyer = { ...target, elementIds: ['flying'] }
    expect(damageOf('groundShock', user, target)).toBe(2 * damageOf('plain', user, target))
    expect(damageOf('groundShock', user, flyer)).toBe(damageOf('plain', user, flyer))
    expect(damageOf('antiGiant', user, target)).toBe(damageOf('plain', user, target))
    const misty = makeField({ terrain: 'misty' })
    const grassy = makeField({ terrain: 'grassy' })
    expect(damageOf('voltRise', user, target, misty)).toBe(
      2 * damageOf('plain', user, target, misty)
    )
    expect(damageOf('voltRise', user, target, grassy)).toBe(damageOf('plain', user, target, grassy))
  })
})

describe('điều kiện theo biến hình / skill đang chờ (tính trực tiếp)', () => {
  const user = fighter('a', [])
  const check = (condition: DslCondition, target: Monster, pending?: number): boolean =>
    checkAllConditions(
      {
        data,
        self: user,
        target,
        targetCtx: makeBattleContext(
          pending === undefined ? {} : { pendingSkill: { skillId: 'strike', priority: pending } }
        )
      },
      [condition]
    )

  it('transformed: đúng loại biến hình đang có tác dụng; đã kết thúc thì không', () => {
    const giant: Monster = {
      ...fighter('e', []),
      battleTransform: { kind: 'dynamax', originalElementIds: ['normal'], turnsLeft: 3 }
    }
    const rule: DslCondition = { if: 'transformed', who: 'target', kinds: ['dynamax'] }
    expect(check(rule, giant)).toBe(true)
    expect(check({ if: 'transformed', who: 'target', kinds: ['mega'] }, giant)).toBe(false)
    expect(check({ if: 'transformed', who: 'target' }, giant)).toBe(true)
    const ended: Monster = {
      ...giant,
      battleTransform: { ...defined(giant.battleTransform), ended: true }
    }
    expect(check(rule, ended)).toBe(false)
    expect(check(rule, fighter('e', []))).toBe(false)
  })

  it('pendingSkill: minPriority so với priority thật (biên 0 / 1)', () => {
    const rule: DslCondition = { if: 'pendingSkill', who: 'target', minPriority: 1 }
    const target = fighter('e', [])
    expect(check(rule, target, 1)).toBe(true)
    expect(check(rule, target, 0)).toBe(false)
    expect(check(rule, target)).toBe(false)
    expect(check({ if: 'pendingSkill', who: 'target', categories: ['status'] }, target, 5)).toBe(
      false
    )
  })
})

describe('nhật ký trong lượt', () => {
  it('ghi trong lượt, bỏ ở cuối lượt; save sau lượt hợp lệ', () => {
    const state = scene(fighter('a', ['strike'], 100), fighter('e', ['strike'], 1))
    const after = run(state, cast('strike'))
    expect(battleOf(after).volatiles.a?.turnLog).toBeUndefined()
    expect(validateGameState(data, after)).toEqual([])
  })

  it('kiểm tra save: turnLog / lastSkillFailed sai', () => {
    const state = scene(fighter('a', ['strike']), fighter('e', ['idle']))
    const battle = battleOf(state)
    const broken: GameState = {
      ...state,
      battle: {
        ...battle,
        volatiles: {
          ...battle.volatiles,
          a: {
            firstTurn: 1,
            lastSkillFailed: false as unknown as true,
            turnLog: {
              turn: 0,
              acted: 1 as unknown as true,
              hits: [{ by: 'e', category: 'x' }]
            } as never
          }
        }
      }
    }
    const issues = validateGameState(data, broken).join('\n')
    expect(issues).toMatch(/lastSkillFailed chỉ được là true/)
    expect(issues).toMatch(/turnLog\.turn/)
    expect(issues).toMatch(/turnLog\.acted chỉ được là true/)
    expect(issues).toMatch(/hits\[0\]\.category/)
    expect(issues).toMatch(/hits\[0\]\.amount/)
  })
})

describe('AI', () => {
  it('không chọn skill có requires không thỏa (điều kiện theo lượt coi như thỏa)', () => {
    // Địch chỉ biết roller (cần địa hình) và idle: sân không địa hình thì không chọn roller.
    const state = scene(fighter('a', ['idle']), fighter('e', ['roller', 'idle']))
    const after = run(state, cast('idle'))
    expect(eventsOfTurn(state, after, 'useSkill').map((e) => e.skillId)).not.toContain('roller')

    const ambusher = scene(fighter('a', ['strike']), fighter('e', ['ambush']))
    const afterAmbush = run(ambusher, cast('strike'))
    expect(eventsOfTurn(ambusher, afterAmbush, 'useSkill').map((e) => e.skillId)).toContain(
      'ambush'
    )
  })
})

describe('alwaysHits (accuracy "—" của Pokémon)', () => {
  it('luôn 100: bỏ qua bậc né của mục tiêu và accuracy gốc', () => {
    const user = fighter('a', [])
    const target = fighter('e', [])
    const stages = { e: { evasion: 6 } }
    const shaky = { ...attack('shakySwift', undefined), accuracy: 50 }
    const ctx = { user, target, stages }
    expect(skillAccuracy(data, makeField(), shaky, ctx)).toBeLessThan(50)
    expect(skillAccuracy(data, makeField(), { ...shaky, alwaysHits: true }, ctx)).toBe(100)
  })

  it('kiểm tra dữ liệu: chỉ được là true', () => {
    const issues = dataIssuesAfter(
      (raw) =>
        raw.skills.push({ ...attack('badHit', undefined), alwaysHits: false as unknown as true }),
      { regenerateText: true }
    )
    expect(issues.join('\n')).toContain('alwaysHits chỉ được là true')
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (spell: unknown): string[] =>
    dataIssuesAfter((raw) => raw.skills.push({ ...attack('broken', undefined), spell } as Skill), {
      regenerateText: true
    })

  it('điều kiện mới hợp lệ / sai', () => {
    expect(
      issuesFor({ requires: [{ if: 'fieldActive', layer: 'terrain', fieldIds: ['grassy'] }] })
    ).toEqual([])
    const cases: [unknown, string][] = [
      [{ requires: [] }, 'requires phải là danh sách không rỗng'],
      [{ requires: [{ if: 'fieldActive', layer: 'room' }] }, 'layer'],
      [
        { requires: [{ if: 'fieldActive', layer: 'terrain', fieldIds: ['rain'] }] },
        'không thuộc lớp terrain'
      ],
      [
        { requires: [{ if: 'fieldActive', layer: 'weather', fieldIds: ['nope'] }] },
        'không tồn tại'
      ],
      [{ requires: [{ if: 'grounded', who: 'target' }] }, 'value'],
      [{ requires: [{ if: 'holdsItem', who: 'nobody', value: true }] }, 'who'],
      [{ requires: [{ if: 'transformed', who: 'target', kinds: ['giant'] }] }, 'kinds'],
      [{ requires: [{ if: 'actedThisTurn', who: 'target' }] }, 'value'],
      [{ requires: [{ if: 'statsChangedThisTurn', who: 'self', direction: 'up' }] }, 'direction'],
      [{ requires: [{ if: 'hitThisTurn', who: 'self', by: 'nobody' }] }, 'by'],
      [{ requires: [{ if: 'pendingSkill', who: 'target', minPriority: 0.5 }] }, 'minPriority'],
      [{ requires: [{ if: 'pendingSkill', who: 'target', categories: ['magic'] }] }, 'categories']
    ]
    for (const [spell, fragment] of cases) {
      expect(issuesFor(spell).join('\n')).toContain(fragment)
    }
  })
})
