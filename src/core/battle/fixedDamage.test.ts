// Cụm 4 (docs/rules/pokemon-moves.md mục "Sát thương cố định"): sát thương cố định / theo level /
// theo máu / Endeavor / Final Gambit / hạ gục một đòn (accuracy theo level, miễn hệ), miễn nhiễm vẫn
// chặn, tự gục / hụt mất máu / mất % máu mỗi lần dùng, False Swipe, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getCurrentHp, getMaxHp } from '../monster'
import { createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeArena,
  makeBattleState,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type { BattleEvent, GameState, Monster, Skill } from '../model'
import { computeDamage, expectedDamage } from './damage'
import { fixedDamageAmount, ohkoAccuracy } from './fixedDamage'

const base = (id: string, fields: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 50,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...fields
})

const SKILLS: Skill[] = [
  base('rage40', { fixedDamage: { kind: 'flat', amount: 40 } }),
  base('shade', { fixedDamage: { kind: 'level' } }),
  base('psywave', { fixedDamage: { kind: 'level', minPercent: 50, maxPercent: 150 } }),
  base('fang', { fixedDamage: { kind: 'targetHpPercent', percent: 50 } }),
  base('endeavor', { fixedDamage: { kind: 'hpDifference' } }),
  base('gambit', { fixedDamage: { kind: 'userHp' }, selfFaint: 'onHit' }),
  base('fissure', {
    accuracy: 30,
    fixedDamage: {
      kind: 'ohko',
      immuneElementIds: ['fire'],
      accuracyIfNotElement: { elementId: 'grass', accuracy: 20 }
    }
  }),
  base('boom', { selfFaint: 'always', power: 250 }),
  base('kick', { crashDamagePercent: 50, accuracy: 1 }),
  base('blown', { selfDamagePercent: 50 }),
  base('swipe', { leavesOneHp: true, power: 250 })
]

const raw = makeRawData()
raw.skills.push(...SKILLS)
const data = createGameData(withFixtureText(raw))

const monster = (id: string, fields: Partial<Monster> & { hp?: string } = {}): Monster => {
  const { hp = '1000', ...rest } = fields
  return makeMonster({ id, genes: toBigStats({ ...uniformStats(50), hp }), ...rest })
}

const amount = (skillId: string, attacker: Monster, defender: Monster): number =>
  defined(
    fixedDamageAmount({ data, attacker, defender, skill: data.skills[skillId] })
  ).amount.toNumber()

describe('lượng cố định', () => {
  const user = monster('a', { level: 40 })
  const target = monster('d')
  it('flat / level / % máu mục tiêu', () => {
    expect(amount('rage40', user, target)).toBe(40)
    expect(amount('shade', user, target)).toBe(40)
    const hp = getCurrentHp(data, target)
    expect(amount('fang', user, target)).toBe(hp.div(2).floor().toNumber())
  })

  it('Psywave: level × 50–150%, AI lấy trung bình; mọi giá trị trong khoảng', () => {
    expect(amount('psywave', user, target)).toBe(40)
    const seen = new Set<number>()
    let rng = createRng(3)
    for (let i = 0; i < 80; i++) {
      const result = defined(
        fixedDamageAmount(
          { data, attacker: user, defender: target, skill: data.skills.psywave },
          rng
        )
      )
      seen.add(result.amount.toNumber())
      rng = defined(result.rng)
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...seen)).toBeLessThanOrEqual(60)
    expect(seen.size).toBeGreaterThan(10)
  })

  it('Endeavor: máu mục tiêu về bằng máu quái dùng; mục tiêu ít máu hơn thì 0', () => {
    const hurt = { ...user, damageTaken: getMaxHp(data, user).minus(10) }
    expect(amount('endeavor', hurt, target)).toBe(getCurrentHp(data, target).minus(10).toNumber())
    expect(amount('endeavor', target, hurt)).toBe(0)
  })

  it('miễn nhiễm theo hệ vẫn chặn; số cực lớn không tràn', () => {
    const ghost = monster('g', { elementIds: ['ghost'] })
    expect(
      expectedDamage({
        data,
        attacker: user,
        defender: ghost,
        skill: data.skills.shade,
        spread: false,
        arena: makeArena()
      }).toNumber()
    ).toBe(0)
    const huge = monster('h', { hp: '1e300' })
    const fang = computeDamage({
      data,
      attacker: user,
      defender: huge,
      skill: data.skills.fang,
      spread: false,
      arena: makeArena(),
      rng: createRng(1)
    })
    expect(fang.damage.isFinite()).toBe(true)
    expect(fang.critical).toBe(false)
  })
})

describe('hạ gục một đòn', () => {
  it('accuracy = gốc + chênh level; mục tiêu level cao hơn hoặc mang hệ miễn: 0', () => {
    const skill = data.skills.fissure
    const grassUser = monster('a', { level: 50, elementIds: ['grass'] })
    const plainUser = monster('b', { level: 50, elementIds: ['normal'] })
    expect(ohkoAccuracy(skill, grassUser, monster('d', { level: 40 }))).toBe(40)
    expect(ohkoAccuracy(skill, plainUser, monster('d', { level: 40 }))).toBe(30)
    expect(ohkoAccuracy(skill, plainUser, monster('d', { level: 51 }))).toBe(0)
    expect(ohkoAccuracy(skill, plainUser, monster('d', { level: 1, elementIds: ['fire'] }))).toBe(0)
    expect(ohkoAccuracy(skill, plainUser, monster('d', { level: 1 }))).toBe(69)
    expect(ohkoAccuracy(data.skills.rage40, plainUser, monster('d'))).toBeUndefined()
    expect(amount('fissure', plainUser, monster('d'))).toBe(
      getCurrentHp(data, monster('d')).toNumber()
    )
  })
})

describe('chi phí tự thân và chừa máu', () => {
  const run = (state: GameState, skillId: string): GameState =>
    gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
    })
  const scene = (skillId: string, enemy = monster('e', { skillIds: ['idle'] })): GameState =>
    makeBattleState([monster('a', { skillIds: [skillId] })], [enemy])
  const selfEvents = (state: GameState): Extract<BattleEvent, { type: 'selfDamage' }>[] =>
    defined(state.battle).log.filter(
      (e): e is Extract<BattleEvent, { type: 'selfDamage' }> => e.type === 'selfDamage'
    )

  it('tự gục luôn (Explosion); Final Gambit chỉ khi trúng', () => {
    const after = run(scene('boom'), 'boom')
    expect(selfEvents(after).map((e) => e.reason)).toEqual(['faint'])
    expect(getCurrentHp(data, defined(after.party[0])).toNumber()).toBe(0)
    const ghost = monster('e', { elementIds: ['ghost'], skillIds: ['idle'] })
    // Final Gambit hệ thường lên hệ ma: không trúng (miễn nhiễm) vẫn tính là đã dùng nhưng không gây.
    const gambit = run(scene('gambit'), 'gambit')
    expect(selfEvents(gambit).map((e) => e.reason)).toEqual(['faint'])
    expect(selfEvents(run(scene('blown', ghost), 'blown')).map((e) => e.reason)).toEqual(['cost'])
  })

  it('hụt thì mất 50% máu (Jump Kick); mỗi lần dùng mất 50% (Mind Blown)', () => {
    const miss = selfEvents(run(scene('kick'), 'kick'))
    const maxHp = getMaxHp(data, monster('a'))
    expect(miss[0]?.reason).toBe('crash')
    expect(miss[0]?.amount.toNumber()).toBe(maxHp.div(2).ceil().toNumber())
    expect(selfEvents(run(scene('blown'), 'blown'))[0]?.amount.toNumber()).toBe(
      maxHp.div(2).ceil().toNumber()
    )
  })

  it('False Swipe: không hạ gục, chừa 1 máu', () => {
    const weak = monster('e', { hp: '1', skillIds: ['idle'] })
    const after = run(scene('swipe', weak), 'swipe')
    const enemy = defined(defined(after.battle).enemies[0])
    expect(getCurrentHp(data, enemy).toNumber()).toBe(1)
    expect(toBig(1).eq(getCurrentHp(data, enemy))).toBe(true)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (fields: Partial<Skill>): string =>
    dataIssuesAfter((r) => r.skills.push(base('bad', fields)), { regenerateText: true }).join('\n')

  it('trường sai', () => {
    expect(
      issuesFor({ fixedDamage: { kind: 'magic' } as unknown as Skill['fixedDamage'] })
    ).toMatch(/fixedDamage\.kind/)
    expect(issuesFor({ fixedDamage: { kind: 'flat', amount: 0 } })).toMatch(/amount/)
    expect(issuesFor({ fixedDamage: { kind: 'level', minPercent: 150, maxPercent: 50 } })).toMatch(
      /minPercent/
    )
    expect(issuesFor({ fixedDamage: { kind: 'targetHpPercent', percent: 0 } })).toMatch(/percent/)
    expect(issuesFor({ fixedDamage: { kind: 'ohko', immuneElementIds: ['lava'] } })).toMatch(
      /immuneElementIds/
    )
    expect(issuesFor({ selfFaint: 'sometimes' as 'always' })).toMatch(/selfFaint/)
    expect(issuesFor({ crashDamagePercent: 0 })).toMatch(/crashDamagePercent/)
    expect(issuesFor({ leavesOneHp: false as unknown as true })).toMatch(/leavesOneHp/)
  })
})

describe('AI', () => {
  it('trừ điểm chi phí tự thân: không tự nổ khi đòn thường đủ dùng', () => {
    const state = makeBattleState(
      [monster('a', { skillIds: ['idle'], hp: '1e6' })],
      [monster('e', { skillIds: ['boom', 'strike'] })]
    )
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle', target: 0 }]
    })
    const used = defined(after.battle).log.flatMap((e) =>
      e.type === 'useSkill' && e.monsterId === 'e' ? [e.skillId] : []
    )
    expect(used).toEqual(['strike'])
  })
})
