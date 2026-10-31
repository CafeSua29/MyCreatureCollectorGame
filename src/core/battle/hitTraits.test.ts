// Hook trait khi trúng đòn / hạ gục (registries/hitTraitHooks.ts, battle/hitTraits.ts): hút máu,
// hạ ngay, đánh trúng gây trạng thái, bị đánh thì kẻ đánh dính trạng thái / mất máu, hồi máu khi hạ
// gục, phản đòn khi bị hạ gục, Serene Grace; thế thân, boss hoang, chiêu nhiều đòn; AI; kiểm tra
// dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getCurrentHp, getMaxHp } from '../monster'
import { HIT_TRAIT_HOOKS, SKILL_EFFECTS, effectChance } from '../registries'
import { BIG_ZERO, createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeField,
  makeMonster,
  makeRawData,
  toBigStats,
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
  Skill,
  TraitDef
} from '../model'
import { cloneDraft } from './draft'
import { hitTraitScore } from './hitTraitScore'

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'rare', hooks: [{ type, params }] }
}

const TRAITS: TraitDef[] = [
  trait('vampiric', 'lifesteal', { percent: 50 }),
  trait('executioner', 'executeLowHp', { hpBelowPercent: 20 }),
  trait('venomTouch', 'onAttackApplyStatus', {
    category: 'any',
    statuses: [{ statusId: 'poison', chance: 100 }]
  }),
  trait('static', 'onHitApplyStatus', {
    category: 'physical',
    statuses: [{ statusId: 'paralysis', chance: 100 }]
  }),
  trait('spore', 'onHitApplyStatus', {
    category: 'physical',
    statuses: [
      { statusId: 'poison', chance: 100 },
      { statusId: 'sleep', chance: 100 }
    ]
  }),
  trait('roughSkin', 'retaliateDamage', { category: 'physical', percentOfAttackerMaxHp: 25 }),
  trait('thorns', 'retaliateDamage', { category: 'any', percentOfAttackerMaxHp: 100 }),
  trait('curse', 'retaliateOnKnockout', { percentOfAttackerMaxHp: 30 }),
  trait('soulEater', 'healOnKnockout', { percent: 20 }),
  {
    id: 'bloodgreed',
    kind: 'positive',
    hooks: [
      { type: 'stageOnKnockout', params: { stat: 'attack', stages: 1 } },
      { type: 'healOnKnockout', params: { percent: 10 } }
    ]
  },
  trait('sereneGrace', 'secondaryEffectChance', { percent: 100 })
]

// Đòn kèm 50% gây độc (hiệu ứng phụ), đòn chắc chắn gây độc (không phải hiệu ứng phụ).
const SKILLS: Skill[] = [
  {
    id: 'venomJab',
    elementId: 'normal',
    category: 'physical',
    power: 50,
    accuracy: 100,
    priority: 0,
    target: 'enemy',
    effects: [{ type: 'applyStatus', params: { statusId: 'poison', chance: 50 } }]
  }
]

const data: GameData = (() => {
  const raw = makeRawData()
  raw.traits.push(...TRAITS)
  raw.skills.push(...SKILLS)
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
    skillIds: ['idle', 'strike', 'wave', 'scaleShot'],
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

/** Sát thương skill của đòn đầu tiên lên quái `targetId`. */
function firstDamage(state: GameState, targetId: string): number {
  const event = eventsOf(state, 'damage').find(
    (entry) => entry.type === 'damage' && entry.targetId === targetId
  )
  if (event?.type !== 'damage') throw new Error('không có sát thương')
  return event.amount.toNumber()
}

describe('lifesteal (hút máu)', () => {
  it('hồi % sát thương đã gây (làm tròn lên), log trait trước; cấp trait nhân %', () => {
    const state = makeBattleState([fighter('a', ['vampiric'], { damageTaken: 30 })], [foe('e1')])
    const after = run(state, [cast(0, 'strike')])
    const dealt = firstDamage(after, 'e1')
    expect(hpOf(after, 'a')).toBe(20 + Math.ceil(dealt * 0.5))
    const types = battleOf(after).log.map((event) => event.type)
    expect(types.indexOf('traitTriggered')).toBe(types.indexOf('heal') - 1)

    const leveled = makeBattleState(
      [fighter('a', [['vampiric', 6]], { damageTaken: 30 })],
      [foe('e1')]
    )
    const leveledAfter = run(leveled, [cast(0, 'strike')])
    expect(hpOf(leveledAfter, 'a')).toBe(20 + Math.ceil(firstDamage(leveledAfter, 'e1') * 1.0))
  })

  it('skill status và đầy máu: không hồi, không log heal', () => {
    const idle = run(makeBattleState([fighter('a', ['vampiric'])], [foe('e1')]), [cast(0, 'idle')])
    expect(eventsOf(idle, 'heal')).toHaveLength(0)
    const full = run(makeBattleState([fighter('a', ['vampiric'])], [foe('e1')]), [
      cast(0, 'strike')
    ])
    expect(eventsOf(full, 'heal')).toHaveLength(0)
  })

  it('sát thương vào thế thân cũng được hút (như drain)', () => {
    const state = makeBattleState([fighter('a', ['vampiric'], { damageTaken: 30 })], [foe('e1')], {
      volatiles: { a: { firstTurn: 1 }, e1: { firstTurn: 1, substituteHp: toBig(100) } }
    })
    const after = run(state, [cast(0, 'strike')])
    expect(eventsOf(after, 'substituteDamaged')).toHaveLength(1)
    expect(hpOf(after, 'a')).toBeGreaterThan(20)
  })
})

describe('executeLowHp (hạ ngay)', () => {
  it('máu sau đòn ≤ ngưỡng thì gục ngay (log traitDamage), cao hơn thì không', () => {
    // strike gây khoảng 7–8: còn 50 − 36 − 7,x ≈ 6 (12%) ≤ 20%.
    const low = run(
      makeBattleState(
        [fighter('a', ['executioner'])],
        [foe('e1', [], { damageTaken: 36 }), foe('e2')]
      ),
      [cast(0, 'strike')]
    )
    expect(hpOf(low, 'e1')).toBe(0)
    expect(eventsOf(low, 'traitDamage')).toHaveLength(1)
    expect(eventsOf(low, 'faint')).toHaveLength(1)

    const high = run(makeBattleState([fighter('a', ['executioner'])], [foe('e1'), foe('e2')]), [
      cast(0, 'strike')
    ])
    expect(hpOf(high, 'e1')).toBeGreaterThan(0)
    expect(eventsOf(high, 'traitDamage')).toHaveLength(0)
  })

  it('boss hoang: ngưỡng × hệ số boss (½) nên 12% không bị hạ ngay', () => {
    const state = makeBattleState(
      [fighter('a', ['executioner'])],
      [foe('e1', [], { damageTaken: 36 })],
      { isBoss: true }
    )
    const after = run(state, [cast(0, 'strike')])
    expect(hpOf(after, 'e1')).toBeGreaterThan(0)
  })

  it('mục tiêu núp sau thế thân không bị hạ ngay', () => {
    const state = makeBattleState(
      [fighter('a', ['executioner'])],
      [foe('e1', [], { damageTaken: 45 })],
      { volatiles: { a: { firstTurn: 1 }, e1: { firstTurn: 1, substituteHp: toBig(100) } } }
    )
    expect(hpOf(run(state, [cast(0, 'strike')]), 'e1')).toBe(5)
  })
})

describe('onAttackApplyStatus / onHitApplyStatus', () => {
  it('đánh trúng: mục tiêu dính trạng thái, log trait trước', () => {
    const after = run(makeBattleState([fighter('a', ['venomTouch'])], [foe('e1')]), [
      cast(0, 'strike')
    ])
    expect(monsterIn(after, 'e1').statuses.map((status) => status.statusId)).toEqual(['poison'])
    expect(battleOf(after).log).toContainEqual({
      type: 'traitTriggered',
      monsterId: 'a',
      traitId: 'venomTouch'
    })
  })

  it('bị đánh vật lý: kẻ đánh dính; skill đặc biệt thì không (category)', () => {
    const physical = run(makeBattleState([fighter('a')], [foe('e1', ['static'])]), [
      cast(0, 'strike')
    ])
    expect(monsterIn(physical, 'a').statuses.map((status) => status.statusId)).toEqual([
      'paralysis'
    ])
    const special = run(makeBattleState([fighter('a')], [foe('e1', ['static'])]), [cast(0, 'wave')])
    expect(monsterIn(special, 'a').statuses).toEqual([])
  })

  it('nhiều trạng thái: trúng đầu tiên thì dừng; không dính được thì bỏ qua sang cái sau', () => {
    const first = run(makeBattleState([fighter('a')], [foe('e1', ['spore'])]), [cast(0, 'strike')])
    expect(monsterIn(first, 'a').statuses.map((status) => status.statusId)).toEqual(['poison'])
    // Hệ cỏ miễn độc: bỏ qua độc (không tốn RNG), ngủ trúng (ngủ có thể hết ngay cuối lượt).
    const second = run(
      makeBattleState([fighter('a', [], { elementIds: ['grass'] })], [foe('e1', ['spore'])]),
      [cast(0, 'strike')]
    )
    const applied = eventsOf(second, 'statusApplied')
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({ monsterId: 'a', statusId: 'sleep' })
  })

  it('bên bị đánh vừa gục vẫn gây trạng thái; đánh vào thế thân thì không', () => {
    const fainted = run(
      makeBattleState([fighter('a')], [foe('e1', ['static'], { damageTaken: 45 }), foe('e2')]),
      [cast(0, 'strike')]
    )
    expect(hpOf(fainted, 'e1')).toBe(0)
    expect(monsterIn(fainted, 'a').statuses).toHaveLength(1)
    const shielded = run(
      makeBattleState([fighter('a')], [foe('e1', ['static'])], {
        volatiles: { a: { firstTurn: 1 }, e1: { firstTurn: 1, substituteHp: toBig(100) } }
      }),
      [cast(0, 'strike')]
    )
    expect(monsterIn(shielded, 'a').statuses).toEqual([])
  })

  it('tỉ lệ nhân hệ số cấp, kẹp 100; lọc category', () => {
    const params = { category: 'physical', statuses: [{ statusId: 'burn', chance: 80 }] }
    const hook = HIT_TRAIT_HOOKS.onAttackApplyStatus
    expect(hook.attackStatuses?.(params, 1.2, 'physical')).toEqual([
      { statusId: 'burn', chance: 96 }
    ])
    expect(hook.attackStatuses?.(params, 1.4, 'physical')).toEqual([
      { statusId: 'burn', chance: 100 }
    ])
    expect(hook.attackStatuses?.(params, 1, 'special')).toEqual([])
    expect(hook.attackStatuses?.(params, 1, 'status')).toEqual([])
  })
})

describe('retaliateDamage / retaliateOnKnockout (phản đòn)', () => {
  it('đánh vật lý: kẻ đánh mất % max HP của nó (làm tròn lên); đặc biệt thì không', () => {
    const after = run(makeBattleState([fighter('a')], [foe('e1', ['roughSkin'])]), [
      cast(0, 'strike')
    ])
    expect(hpOf(after, 'a')).toBe(50 - 13)
    expect(eventsOf(after, 'traitDamage')).toEqual([
      { type: 'traitDamage', monsterId: 'a', amount: toBig(13) }
    ])
    const special = run(makeBattleState([fighter('a')], [foe('e1', ['roughSkin'])]), [
      cast(0, 'wave')
    ])
    expect(hpOf(special, 'a')).toBe(50)
  })

  it('boss hoang đánh trúng quái có phản đòn: nhận ½', () => {
    const state = makeBattleState(
      [fighter('a', ['roughSkin'], { elementIds: ['water'] })],
      [foe('boss', [], { skillIds: ['strike'] })],
      { isBoss: true }
    )
    const after = run(state, [cast(0, 'idle')])
    expect(hpOf(after, 'boss')).toBe(50 - 7)
  })

  it('phản đòn làm kẻ đánh gục: dừng chiêu nhiều đòn sau đòn đó', () => {
    const after = run(makeBattleState([fighter('a'), fighter('b')], [foe('e1', ['thorns'])]), [
      cast(0, 'scaleShot'),
      cast(1, 'idle')
    ])
    expect(hpOf(after, 'a')).toBe(0)
    expect(eventsOf(after, 'hitCount')).toEqual([
      { type: 'hitCount', monsterId: 'a', targetId: 'e1', hits: 1 }
    ])
  })

  it('bị hạ gục thì kẻ đánh mất % max HP; chưa gục thì không', () => {
    const down = run(
      makeBattleState([fighter('a')], [foe('e1', ['curse'], { damageTaken: 45 }), foe('e2')]),
      [cast(0, 'strike')]
    )
    expect(hpOf(down, 'a')).toBe(50 - 15)
    const alive = run(makeBattleState([fighter('a')], [foe('e1', ['curse'])]), [cast(0, 'strike')])
    expect(hpOf(alive, 'a')).toBe(50)
  })

  it('số cực lớn: mất % max HP Decimal của kẻ đánh', () => {
    const giant = fighter('a', [], { genes: toBigStats({ ...uniformStats(10), hp: '1e1000' }) })
    const after = run(makeBattleState([giant], [foe('e1', ['roughSkin'])]), [cast(0, 'strike')])
    const a = monsterIn(after, 'a')
    const ratio = a.damageTaken.div(getMaxHp(data, a))
    expect(ratio.minus(0.25).abs().lt(1e-30)).toBe(true)
  })
})

describe('healOnKnockout (hồi máu khi hạ gục)', () => {
  it('hạ gục địch bằng skill: hồi % max HP; kèm Moxie trong cùng trait', () => {
    const state = makeBattleState(
      [fighter('a', ['bloodgreed'], { damageTaken: 30 })],
      [foe('e1', [], { damageTaken: 45 }), foe('e2')]
    )
    const after = run(state, [cast(0, 'strike')])
    expect(hpOf(after, 'a')).toBe(25)
    expect(battleOf(after).stages.a).toEqual({ attack: 1 })
  })

  it('không hạ gục thì không hồi; cấp trait nhân %', () => {
    const none = run(
      makeBattleState([fighter('a', ['soulEater'], { damageTaken: 30 })], [foe('e1')]),
      [cast(0, 'strike')]
    )
    expect(hpOf(none, 'a')).toBe(20)
    const leveled = run(
      makeBattleState(
        [fighter('a', [['soulEater', 6]], { damageTaken: 30 })],
        [foe('e1', [], { damageTaken: 45 }), foe('e2')]
      ),
      [cast(0, 'strike')]
    )
    expect(hpOf(leveled, 'a')).toBe(20 + 20)
  })
})

describe('secondaryEffectChance (kiểu Serene Grace)', () => {
  it('effectChance: chỉ nhân hiệu ứng phụ (< 100), kẹp 100', () => {
    expect(effectChance(undefined, 2)).toBe(100)
    expect(effectChance(100, 2)).toBe(100)
    expect(effectChance(30, 2)).toBe(60)
    expect(effectChance(60, 2)).toBe(100)
    expect(effectChance(0, 2)).toBe(0)
    expect(effectChance(30)).toBe(30)
  })

  it('trong trận: 50% × 2 = luôn gây độc', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = {
        ...makeBattleState(
          [fighter('a', ['sereneGrace'], { skillIds: ['venomJab'] })],
          [foe('e1')]
        ),
        rng: seed
      }
      const after = run(state, [cast(0, 'venomJab')])
      expect(monsterIn(after, 'e1').statuses.map((status) => status.statusId)).toEqual(['poison'])
    }
  })

  it('AI chấm hiệu ứng phụ theo hệ số', () => {
    const ctx = {
      data,
      user: fighter('u'),
      target: foe('t'),
      targetIsAlly: false,
      stages: {},
      expectedDamage: BIG_ZERO,
      field: makeField(),
      side: 'player' as const,
      allies: [],
      foes: [],
      allyReserves: [],
      foeReserves: []
    }
    const params = { statusId: 'poison', chance: 25 }
    const base = SKILL_EFFECTS.applyStatus.aiValue(params, ctx)
    expect(SKILL_EFFECTS.applyStatus.aiValue(params, { ...ctx, chanceMultiplier: 2 })).toBeCloseTo(
      base * 2
    )
  })
})

describe('AI: hitTraitScore', () => {
  const score = (user: Monster, target: Monster, dealt: number, remaining = 50): number => {
    const d = cloneDraft(makeBattleState([user], [target]))
    return hitTraitScore(data, d, {
      user,
      target,
      skill: data.skills.strike,
      side: 'player',
      dealt: toBig(dealt),
      remaining: toBig(remaining)
    })
  }

  it('không trait: 0; hút máu khi đã mất máu: dương; phản đòn: âm', () => {
    expect(score(fighter('a'), foe('e1'), 10)).toBe(0)
    expect(score(fighter('a', ['vampiric'], { damageTaken: 20 }), foe('e1'), 10)).toBeGreaterThan(0)
    expect(score(fighter('a', ['vampiric']), foe('e1'), 10)).toBe(0)
    expect(score(fighter('a'), foe('e1', ['roughSkin']), 10)).toBeLessThan(0)
    expect(score(fighter('a'), foe('e1', ['static']), 10)).toBeLessThan(0)
    expect(score(fighter('a'), foe('e1', ['static']), 0)).toBe(0)
  })

  it('hạ ngay: máu dự kiến sau đòn ≤ ngưỡng thì cộng koBonus; gây trạng thái cộng điểm', () => {
    const { koBonus } = data.config.ai
    expect(score(fighter('a', ['executioner']), foe('e1'), 5, 14)).toBeCloseTo(koBonus)
    expect(score(fighter('a', ['executioner']), foe('e1'), 5, 30)).toBe(0)
    expect(score(fighter('a', ['venomTouch']), foe('e1'), 5)).toBeCloseTo(
      data.config.ai.statusWeights.poison
    )
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (type: string, params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', type, params)), {
      regenerateText: true
    })

  it('params hợp lệ: không lỗi', () => {
    expect(issuesFor('lifesteal', { percent: 10 })).toEqual([])
    expect(issuesFor('executeLowHp', { hpBelowPercent: 10 })).toEqual([])
  })

  it('báo lỗi params sai', () => {
    const cases: [string, unknown, string][] = [
      ['lifesteal', { percent: 0 }, 'percent'],
      ['healOnKnockout', {}, 'percent'],
      ['secondaryEffectChance', { percent: -101 }, 'percent'],
      ['retaliateOnKnockout', { percentOfAttackerMaxHp: 'x' }, 'percentOfAttackerMaxHp'],
      ['executeLowHp', { hpBelowPercent: 120 }, 'hpBelowPercent'],
      ['retaliateDamage', { category: 'status', percentOfAttackerMaxHp: 5 }, 'category'],
      ['retaliateDamage', { category: 'any', percentOfAttackerMaxHp: 0 }, 'percentOfAttacker'],
      ['onHitApplyStatus', { category: 'physical', statuses: [] }, 'statuses'],
      [
        'onAttackApplyStatus',
        { category: 'any', statuses: [{ statusId: 'nope', chance: 10 }] },
        'nope'
      ],
      [
        'onHitApplyStatus',
        { category: 'any', statuses: [{ statusId: 'poison', chance: 150 }] },
        'chance'
      ],
      ['onHitApplyStatus', 5, 'object']
    ]
    for (const [type, params, fragment] of cases) {
      expect(issuesFor(type, params).join('\n'), type).toContain(fragment)
    }
  })

  it('RNG có seed: cùng state cho cùng kết quả', () => {
    const state = makeBattleState([fighter('a', ['vampiric'])], [foe('e1', ['spore'])])
    const rng = createRng(7)
    const once = run({ ...state, rng }, [cast(0, 'strike')])
    const twice = run({ ...state, rng }, [cast(0, 'strike')])
    expect(battleOf(once).log).toEqual(battleOf(twice).log)
  })
})
