// Hook trait cuối lượt và trạng thái (registries/turnEndTraitHooks.ts, battle/turnEndTraits.ts):
// gây mất máu cho địch cuối lượt, tự mất máu khi máu thấp, tự chữa trạng thái (Shed Skin), chữa
// khi rời sân / hết trận (Natural Cure), miễn sát thương gián tiếp (Magic Guard); kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getCurrentHp, getMaxHp } from '../monster'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeField,
  makeMonster,
  makeSideFieldRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  StatusInstance,
  TraitDef
} from '../model'

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'rare', hooks: [{ type, params }] }
}

const TRAITS: TraitDef[] = [
  trait('foeBurner', 'turnEndDamageFoes', { percent: 10 }),
  trait('foeSinger', 'turnEndDamageFoes', { percent: 5 }),
  trait('unstable', 'turnEndSelfDamageWhileLowHp', { hpBelowPercent: 50, percent: 10 }),
  trait('shedSkin', 'turnEndCureStatus', { chance: 100 }),
  trait('halfShed', 'turnEndCureStatus', { chance: 50 }),
  trait('naturalCure', 'cureStatusOnLeave', {}),
  trait('magicGuard', 'indirectDamageImmunity', {}),
  trait('roughSkin', 'retaliateDamage', { category: 'any', percentOfAttackerMaxHp: 20 }),
  trait('curse', 'retaliateOnKnockout', { percentOfAttackerMaxHp: 30 })
]

const data: GameData = (() => {
  const raw = makeSideFieldRawData()
  raw.traits.push(...TRAITS)
  return createGameData(withFixtureText(raw))
})()

/** Quái mẫu mọi chỉ số 50 (HP 50), hệ ma, trait cấp 1 (hoặc cấp cho trước). */
const fighter = (
  id: string,
  traits: (string | [string, number])[] = [],
  extra: MonsterOverrides = {}
): Monster =>
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['idle', 'strike'],
    traits: traits.map((entry) =>
      typeof entry === 'string' ? { id: entry, level: 1 } : { id: entry[0], level: entry[1] }
    ),
    ...extra
  })

/** Quái địch hệ nước, chỉ biết idle (AI không đánh). */
const foe = (
  id: string,
  traits: (string | [string, number])[] = [],
  extra: MonsterOverrides = {}
): Monster => fighter(id, traits, { skillIds: ['idle'], elementIds: ['water'], ...extra })

const run = (state: GameState, commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const cast = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})
const idle = (slot = 0): BattleCommand => cast(slot, 'idle')
const switchTo = (slot: number, monsterId: string): BattleCommand => ({
  slot,
  kind: 'switch',
  monsterId
})

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = (state: GameState, type: BattleEvent['type']): BattleEvent[] =>
  battleOf(state).log.filter((event) => event.type === type)
const monsterIn = (state: GameState, id: string): Monster =>
  defined(
    [...state.party, ...battleOf(state).enemies].find((monster) => monster.id === id),
    `quái ${id}`
  )
const hpOf = (state: GameState, id: string): number =>
  getCurrentHp(data, monsterIn(state, id)).toNumber()
const poisoned: StatusInstance[] = [{ statusId: 'poison', turnsLeft: 4 }]

describe('turnEndDamageFoes (gây mất máu cho địch cuối lượt)', () => {
  it('mọi địch còn sống trên sân mất % max HP của chúng, log trait một lần rồi traitDamage', () => {
    const after = run(makeBattleState([fighter('a', ['foeBurner'])], [foe('e1'), foe('e2')]), [
      idle()
    ])
    expect(hpOf(after, 'e1')).toBe(45)
    expect(hpOf(after, 'e2')).toBe(45)
    expect(hpOf(after, 'a')).toBe(50)
    expect(eventsOf(after, 'traitTriggered')).toEqual([
      { type: 'traitTriggered', monsterId: 'a', traitId: 'foeBurner' }
    ])
    expect(eventsOf(after, 'traitDamage')).toHaveLength(2)
  })

  it('nhiều trait cộng %; cấp trait nhân %; làm tròn lên', () => {
    const summed = run(makeBattleState([fighter('a', ['foeBurner', 'foeSinger'])], [foe('e1')]), [
      idle()
    ])
    expect(hpOf(summed, 'e1')).toBe(50 - Math.ceil(7.5))
    const leveled = run(makeBattleState([fighter('a', [['foeBurner', 6]])], [foe('e1')]), [idle()])
    expect(hpOf(leveled, 'e1')).toBe(40)
  })

  it('boss hoang nhận ½ (làm tròn lên); quái địch cũng gây được cho quái ta', () => {
    const boss = run(
      makeBattleState([fighter('a', ['foeBurner'])], [foe('e1')], { isBoss: true }),
      [idle()]
    )
    expect(hpOf(boss, 'e1')).toBe(50 - Math.ceil(2.5))
    const reverse = run(makeBattleState([fighter('a')], [foe('e1', ['foeBurner'])]), [idle()])
    expect(hpOf(reverse, 'a')).toBe(45)
  })

  it('địch gục vì trait thì thắng trận', () => {
    const after = run(
      makeBattleState([fighter('a', ['foeBurner'])], [foe('e1', [], { damageTaken: 47 })]),
      [idle()]
    )
    expect(hpOf(after, 'e1')).toBe(0)
    expect(battleOf(after).outcome).toBe('won')
  })

  it('số cực lớn: lượng mất vẫn đúng 10% max HP', () => {
    const huge = { genes: { ...uniformStats(10), hp: '1e1000' } }
    const after = run(makeBattleState([fighter('a', ['foeBurner'])], [foe('e1', [], huge)]), [
      idle()
    ])
    const target = monsterIn(after, 'e1')
    expect(target.damageTaken.eq(getMaxHp(data, target).times(0.1).ceil())).toBe(true)
  })
})

describe('turnEndSelfDamageWhileLowHp (tự mất máu khi máu thấp)', () => {
  it('máu ≤ ngưỡng (so ≤) thì mất % max HP, log trait rồi traitDamage; cao hơn thì không', () => {
    const atThreshold = run(
      makeBattleState([fighter('a', ['unstable'], { damageTaken: 25 })], [foe('e1')]),
      [idle()]
    )
    expect(hpOf(atThreshold, 'a')).toBe(20)
    expect(battleOf(atThreshold).log.map((event) => event.type)).toEqual(
      expect.arrayContaining(['traitTriggered', 'traitDamage'])
    )
    const above = run(
      makeBattleState([fighter('a', ['unstable'], { damageTaken: 24 })], [foe('e1')]),
      [idle()]
    )
    expect(hpOf(above, 'a')).toBe(26)
    expect(eventsOf(above, 'traitDamage')).toHaveLength(0)
  })

  it('xét sau khi hồi máu cuối lượt (regen 10%: 25 → 30, trên ngưỡng)', () => {
    const after = run(
      makeBattleState([fighter('a', ['unstable', 'regen'], { damageTaken: 25 })], [foe('e1')]),
      [idle()]
    )
    expect(hpOf(after, 'a')).toBe(30)
  })

  it('boss hoang không được giảm (trait của chính nó)', () => {
    const after = run(
      makeBattleState([fighter('a')], [foe('e1', ['unstable'], { damageTaken: 30 })], {
        isBoss: true
      }),
      [idle()]
    )
    expect(hpOf(after, 'e1')).toBe(15)
  })
})

describe('turnEndCureStatus (tự chữa trạng thái, kiểu Shed Skin)', () => {
  it('trúng thì chữa mọi trạng thái trước bước trạng thái: không mất máu vì độc', () => {
    const after = run(
      makeBattleState(
        [
          fighter('a', ['shedSkin'], {
            statuses: [...poisoned, { statusId: 'burn', turnsLeft: 3 }]
          })
        ],
        [foe('e1')]
      ),
      [idle()]
    )
    expect(monsterIn(after, 'a').statuses).toEqual([])
    expect(eventsOf(after, 'statusCured')).toHaveLength(2)
    expect(eventsOf(after, 'statusDamage')).toHaveLength(0)
    expect(hpOf(after, 'a')).toBe(50)
  })

  it('không có trạng thái thì không tốn RNG; cấp trait nhân tỉ lệ tới 100', () => {
    const plain = run(makeBattleState([fighter('a')], [foe('e1')]), [idle()])
    const withTrait = run(makeBattleState([fighter('a', ['halfShed'])], [foe('e1')]), [idle()])
    expect(withTrait.rng).toBe(plain.rng)
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = {
        ...makeBattleState([fighter('a', [['halfShed', 6]], { statuses: poisoned })], [foe('e1')]),
        rng: seed
      }
      expect(monsterIn(run(state, [idle()]), 'a').statuses).toEqual([])
    }
  })
})

describe('cureStatusOnLeave (chữa khi rời sân, kiểu Natural Cure)', () => {
  it('đổi quái: quái rút về được chữa, log trait rồi statusCured; không có trait thì giữ', () => {
    const state = makeBattleState(
      [fighter('a', ['naturalCure'], { statuses: poisoned }), fighter('b'), fighter('c')],
      [foe('e1')]
    )
    const after = run(state, [switchTo(0, 'c'), idle(1)])
    expect(monsterIn(after, 'a').statuses).toEqual([])
    const types = battleOf(after).log.map((event) => event.type)
    expect(types.indexOf('statusCured')).toBe(types.indexOf('traitTriggered') + 1)

    const plain = makeBattleState(
      [fighter('a', [], { statuses: poisoned }), fighter('b'), fighter('c')],
      [foe('e1')]
    )
    expect(monsterIn(run(plain, [switchTo(0, 'c'), idle(1)]), 'a').statuses).toEqual(poisoned)
  })

  it('hết trận: quái ta còn sống trên sân được chữa; quái dự bị thì không', () => {
    const state = makeBattleState(
      [
        fighter('a', ['naturalCure'], { statuses: poisoned }),
        fighter('b'),
        fighter('c', ['naturalCure'], { statuses: poisoned })
      ],
      [foe('e1', [], { damageTaken: 49 })]
    )
    const after = run(state, [cast(0, 'strike'), idle(1)])
    expect(battleOf(after).outcome).toBe('won')
    expect(monsterIn(after, 'a').statuses).toEqual([])
    expect(monsterIn(after, 'c').statuses).toEqual(poisoned)
  })
})

describe('indirectDamageImmunity (miễn sát thương gián tiếp, kiểu Magic Guard)', () => {
  it('trạng thái không trừ máu nhưng vẫn giảm thời hạn', () => {
    const after = run(
      makeBattleState([fighter('a', ['magicGuard'], { statuses: poisoned })], [foe('e1')]),
      [idle()]
    )
    expect(hpOf(after, 'a')).toBe(50)
    expect(eventsOf(after, 'statusDamage')).toHaveLength(0)
    expect(monsterIn(after, 'a').statuses).toEqual([{ statusId: 'poison', turnsLeft: 3 }])
  })

  it('môi trường cuối lượt (bão) không trừ máu', () => {
    const field = makeField({ weather: 'storm' })
    const after = run(makeBattleState([fighter('a', ['magicGuard'])], [foe('e1')], { field }), [
      idle()
    ])
    expect(hpOf(after, 'a')).toBe(50)
    expect(hpOf(after, 'e1')).toBe(45)
  })

  it('bẫy khi vào sân (Spikes) không trừ máu', () => {
    const field = makeField({ sides: { player: [{ id: 'spikes', turnsLeft: null, layers: 1 }] } })
    const enter = (traits: string[]): number =>
      hpOf(
        run(
          makeBattleState([fighter('a'), fighter('b'), fighter('c', traits)], [foe('e1')], {
            field
          }),
          [switchTo(0, 'c'), idle(1)]
        ),
        'c'
      )
    expect(enter(['magicGuard'])).toBe(50)
    expect(enter([])).toBe(45)
  })

  it('phản đòn và phản đòn khi hạ gục không trừ máu kẻ đánh', () => {
    const rough = run(
      makeBattleState([fighter('a', ['magicGuard'])], [foe('e1', ['roughSkin']), foe('e2')]),
      [cast(0, 'strike')]
    )
    expect(hpOf(rough, 'a')).toBe(50)
    expect(eventsOf(rough, 'traitDamage')).toHaveLength(0)
    const curse = run(
      makeBattleState(
        [fighter('a', ['magicGuard'])],
        [foe('e1', ['curse'], { damageTaken: 49 }), foe('e2')]
      ),
      [cast(0, 'strike')]
    )
    expect(hpOf(curse, 'a')).toBe(50)
  })

  it('trait gây mất máu cuối lượt (của địch và của chính nó) không trừ máu', () => {
    const after = run(
      makeBattleState(
        [fighter('a', ['magicGuard', 'unstable'], { damageTaken: 30 })],
        [foe('e1', ['foeBurner'])]
      ),
      [idle()]
    )
    expect(hpOf(after, 'a')).toBe(20)
    expect(eventsOf(after, 'traitTriggered')).toHaveLength(0)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (type: string, params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', type, params)), {
      regenerateText: true
    })

  it('params hợp lệ / sai', () => {
    expect(issuesFor('turnEndDamageFoes', { percent: 3 })).toEqual([])
    expect(issuesFor('turnEndSelfDamageWhileLowHp', { hpBelowPercent: 50, percent: 5 })).toEqual([])
    expect(issuesFor('turnEndCureStatus', { chance: 30 })).toEqual([])
    expect(issuesFor('cureStatusOnLeave', {})).toEqual([])
    expect(issuesFor('indirectDamageImmunity', {})).toEqual([])
    const cases: [string, unknown, string][] = [
      ['turnEndDamageFoes', { percent: 0 }, 'percent'],
      ['turnEndDamageFoes', null, 'object'],
      ['turnEndSelfDamageWhileLowHp', { hpBelowPercent: 0, percent: 5 }, 'hpBelowPercent'],
      ['turnEndSelfDamageWhileLowHp', { hpBelowPercent: 101, percent: 5 }, 'hpBelowPercent'],
      ['turnEndSelfDamageWhileLowHp', { hpBelowPercent: 50, percent: -5 }, 'percent'],
      ['turnEndCureStatus', { chance: 0 }, 'chance'],
      ['turnEndCureStatus', { chance: 120 }, 'chance'],
      ['cureStatusOnLeave', { chance: 10 }, 'không có params'],
      ['indirectDamageImmunity', { all: true }, 'không có params']
    ]
    for (const [type, params, fragment] of cases) {
      expect(issuesFor(type, params).join('\n'), type).toContain(fragment)
    }
  })
})
