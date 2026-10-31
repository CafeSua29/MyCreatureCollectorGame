// Thế mạnh / thế nhanh (docs/rules/move-styles.md): điều kiện (có styles, đủ thuần thục, không
// Dynamax), power / hiệu ứng / priority từng thế, tốc độ lượt sau và mất khi rời sân, skill trạng
// thái (bậc, số lượt), số ghi đè theo skill, log, AI chọn biến thể, kiểm tra dữ liệu, save.

import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, deserializeState, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { createGameData } from '../gameData'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameState,
  Monster,
  MoveStyle,
  RawGameData,
  Skill,
  SkillMastery
} from '../model'
import { suggestBattleCommands } from './ai'
import { expectedDamage } from './damage'
import { battleStats, cloneDraft } from './draft'
import {
  styleBlockReason,
  stylePowerMultiplier,
  styleSpeedMultiplier,
  styledSkill,
  usableStyles
} from './moveStyles'

const base = { elementId: 'normal', priority: 0, accuracy: 100, target: 'enemy' as const }

/**
 * heavy: đánh kèm 50% hạ thủ địch 1 bậc; zap: skill trạng thái gây tê liệt (3 lượt) và hạ công
 * địch; custom: ghi đè power thế mạnh ×2; plainHit: không có thế.
 */
const TEST_SKILLS: Skill[] = [
  {
    ...base,
    id: 'heavy',
    category: 'physical',
    power: 50,
    styles: true,
    effects: [
      { type: 'statStage', params: { who: 'target', stat: 'defense', delta: -1, chance: 50 } },
      { type: 'applyStatus', params: { statusId: 'burn', chance: 5 } }
    ]
  },
  {
    ...base,
    id: 'zap',
    category: 'status',
    power: 0,
    styles: true,
    effects: [
      { type: 'applyStatus', params: { statusId: 'paralysis', chance: 90 } },
      { type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }
    ]
  },
  {
    ...base,
    id: 'custom',
    category: 'physical',
    power: 50,
    styles: { strong: { powerMultiplier: 2, nextTurnSpeedMultiplier: 0.5 } },
    effects: []
  },
  { ...base, id: 'plainHit', category: 'physical', power: 50, effects: [] },
  // Kiểu Close Combat: tự hạ thủ (mặt xấu); kiểu Coaching: tăng công đồng đội.
  {
    ...base,
    id: 'brawl',
    category: 'physical',
    power: 50,
    styles: true,
    effects: [{ type: 'statStage', params: { who: 'self', stat: 'defense', delta: -1 } }]
  },
  {
    ...base,
    id: 'coach',
    category: 'status',
    power: 0,
    target: 'ally',
    styles: true,
    effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: 1 } }]
  }
]

function withTestSkills(raw: RawGameData): RawGameData {
  raw.skills.push(...TEST_SKILLS.map((skill) => ({ ...skill })))
  return raw
}

const data = createGameData(withFixtureText(withTestSkills(makeRawData())))
const skillOf = (id: string): Skill => data.skills[id]

const mastered = (level: number, ...skillIds: string[]): Record<string, SkillMastery> =>
  Object.fromEntries(skillIds.map((id) => [id, { level, exp: toBig(0) }]))

/** Quái ta đã thuần thục mọi skill thử tới cấp mở thế. */
const stylist = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'a',
    skillIds: ['heavy', 'zap', 'custom', 'plainHit'],
    skillMastery: mastered(10, 'heavy', 'zap', 'custom', 'plainHit'),
    ...overrides
  })

const idleEnemy = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'e', skillIds: ['idle'], ...overrides })

const battleOf = (state: GameState): BattleState => defined(state.battle)
const logOf = (state: GameState): BattleEvent[] => battleOf(state).log

const styled = (skillId: string, style?: MoveStyle, slot = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0,
  ...(style ? { style } : {})
})

const submit = (state: GameState, commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

/** Thứ tự quái dùng skill trong lượt cuối của log. */
const useOrder = (state: GameState): string[] =>
  logOf(state).flatMap((e) => (e.type === 'useSkill' ? [e.monsterId] : []))

describe('skill khi dùng thế (styledSkill)', () => {
  it('thế mạnh: priority −1, tỉ lệ phụ +20 điểm, bậc +1 theo chiều hiệu ứng', () => {
    const skill = styledSkill(data, skillOf('heavy'), 'strong')
    expect(skill.priority).toBe(-1)
    expect(skill.effects).toEqual([
      { type: 'statStage', params: { who: 'target', stat: 'defense', delta: -2, chance: 70 } },
      { type: 'applyStatus', params: { statusId: 'burn', chance: 25 } }
    ])
  })

  it('thế nhanh: priority +1, tỉ lệ phụ −10 điểm (kẹp 0), bậc giữ nguyên', () => {
    const skill = styledSkill(data, skillOf('heavy'), 'agile')
    expect(skill.priority).toBe(1)
    expect(skill.effects).toEqual([
      { type: 'statStage', params: { who: 'target', stat: 'defense', delta: -1, chance: 40 } },
      { type: 'applyStatus', params: { statusId: 'burn', chance: 0 } }
    ])
  })

  it('skill trạng thái: không đổi tỉ lệ phụ, thế mạnh vẫn tăng bậc', () => {
    expect(styledSkill(data, skillOf('zap'), 'strong').effects).toEqual([
      { type: 'applyStatus', params: { statusId: 'paralysis', chance: 90 } },
      { type: 'statStage', params: { who: 'target', stat: 'attack', delta: -2 } }
    ])
    expect(styledSkill(data, skillOf('zap'), 'agile').effects).toEqual(skillOf('zap').effects)
  })

  it('thế mạnh không làm nặng mặt xấu (tự hạ bậc), vẫn tăng bậc có lợi cho đồng đội', () => {
    expect(styledSkill(data, skillOf('brawl'), 'strong').effects).toEqual(skillOf('brawl').effects)
    expect(styledSkill(data, skillOf('coach'), 'strong').effects).toEqual([
      { type: 'statStage', params: { who: 'target', stat: 'attack', delta: 2 } }
    ])
  })

  it('không có thế / skill không có styles: giữ nguyên object', () => {
    expect(styledSkill(data, skillOf('heavy'), undefined)).toBe(skillOf('heavy'))
    expect(styledSkill(data, skillOf('plainHit'), 'strong')).toBe(skillOf('plainHit'))
  })

  it('power nhân trong công thức sát thương; số ghi đè theo skill', () => {
    expect(stylePowerMultiplier(data, skillOf('heavy'), 'strong')).toBe(1.3)
    expect(stylePowerMultiplier(data, skillOf('heavy'), 'agile')).toBe(0.7)
    expect(stylePowerMultiplier(data, skillOf('custom'), 'strong')).toBe(2)
    expect(stylePowerMultiplier(data, skillOf('custom'), 'agile')).toBe(0.7)
    expect(stylePowerMultiplier(data, skillOf('plainHit'), 'strong')).toBe(1)
  })
})

describe('sát thương theo thế', () => {
  const damageOf = (style: MoveStyle | undefined, level = 30): number =>
    expectedDamage({
      data,
      attacker: stylist({ level }),
      defender: idleEnemy({ level }),
      skill: skillOf('heavy'),
      spread: false,
      style
    }).toNumber()

  it('thế mạnh ×1,3, thế nhanh ×0,7 (AI và đánh thật dùng chung công thức)', () => {
    const plain = damageOf(undefined)
    expect(damageOf('strong') / plain).toBeCloseTo(1.3, 2)
    expect(damageOf('agile') / plain).toBeCloseTo(0.7, 2)
  })

  it('số cực lớn: không ra Infinity / NaN', () => {
    const huge = expectedDamage({
      data,
      attacker: stylist({ level: 1e12 }),
      defender: idleEnemy({ level: 1e12 }),
      skill: skillOf('heavy'),
      spread: false,
      style: 'strong'
    })
    expect(huge.isFinite()).toBe(true)
    expect(huge.gt(0)).toBe(true)
  })

  it('đánh thật: thế mạnh của custom (ghi đè ×2) gây gấp đôi (cùng RNG)', () => {
    const run = (style?: MoveStyle): number => {
      const state = makeBattleState([stylist()], [idleEnemy({ level: 50 })])
      const after = submit(state, [styled('custom', style)])
      const hit = logOf(after).find((e) => e.type === 'damage' && e.targetId === 'e')
      return hit?.type === 'damage' ? hit.amount.toNumber() : 0
    }
    expect(Math.abs(run('strong') - run() * 2)).toBeLessThanOrEqual(1)
  })
})

describe('điều kiện dùng thế', () => {
  it('đủ thuần thục: dùng được cả hai thế; chưa đủ: locked; không có styles: noStyles', () => {
    expect(usableStyles(data, stylist(), skillOf('heavy'))).toEqual(['strong', 'agile'])
    const novice = stylist({ skillMastery: mastered(9, 'heavy') })
    expect(styleBlockReason(data, novice, skillOf('heavy'))).toBe('locked')
    expect(usableStyles(data, novice, skillOf('heavy'))).toEqual([])
    expect(styleBlockReason(data, stylist(), skillOf('plainHit'))).toBe('noStyles')
  })

  it('lệnh thế khi chưa đủ thuần thục: styleLocked, state giữ nguyên', () => {
    const state = makeBattleState([stylist({ skillMastery: {} })], [idleEnemy()])
    expectActionError(() => submit(state, [styled('heavy', 'strong')]), 'styleLocked', {
      monsterId: 'a',
      skillId: 'heavy',
      level: 1,
      need: 10
    })
    expect(battleOf(state).log).toEqual([])
  })

  it.each([
    ['skill không có thế', styled('plainHit', 'strong')],
    ['tên thế sai', { ...styled('heavy'), style: 'fast' as MoveStyle }],
    ['Dynamax trong cùng lệnh', { ...styled('heavy', 'agile'), transform: 'dynamax' as const }]
  ])('%s: malformedAction', (_label, command) => {
    const state = makeBattleState([stylist()], [idleEnemy()])
    expectActionError(() => submit(state, [command]), 'malformedAction')
  })
})

describe('thứ tự lượt', () => {
  // Quái ta chậm hơn địch (level thấp hơn), địch đánh bằng strike (priority 0).
  const duel = (): GameState =>
    makeBattleState(
      [stylist({ level: 45 })],
      [makeMonster({ id: 'e', skillIds: ['strike'], level: 50 })]
    )

  it('tiền đề: quái ta chậm hơn nhưng nhanh hơn 1/1,3 tốc độ địch', () => {
    const d = cloneDraft(duel())
    const mine = battleStats(data, d, d.party[0]).speed
    const foe = battleStats(data, d, defined(d.battle.enemies[0])).speed
    expect(mine.lt(foe)).toBe(true)
    expect(mine.times(1.3).gt(foe)).toBe(true)
  })

  it('thế nhanh đi trước, thế thường đi sau', () => {
    expect(useOrder(submit(duel(), [styled('heavy', 'agile')]))).toEqual(['a', 'e'])
    expect(useOrder(submit(duel(), [styled('heavy')]))).toEqual(['e', 'a'])
  })

  it('thế mạnh priority −1: đi sau cả skill priority 0 của quái chậm hơn', () => {
    const state = makeBattleState(
      [stylist({ level: 55 })],
      [makeMonster({ id: 'e', skillIds: ['strike'], level: 50 })]
    )
    expect(useOrder(submit(state, [styled('heavy')]))).toEqual(['a', 'e'])
    expect(useOrder(submit(state, [styled('heavy', 'strong')]))).toEqual(['e', 'a'])
  })

  it('lượt sau: thế nhanh tốc độ ×1,3 (đi trước), thế thường không', () => {
    const afterAgile = submit(duel(), [styled('heavy', 'agile')])
    expect(battleOf(afterAgile).volatiles.a?.styleSpeed).toEqual({
      turn: 2,
      skillId: 'heavy',
      style: 'agile'
    })
    const turn2 = submit(afterAgile, [styled('plainHit')])
    expect(useOrder(turn2).slice(-2)).toEqual(['a', 'e'])
    const plainTurn2 = submit(submit(duel(), [styled('heavy')]), [styled('plainHit')])
    expect(useOrder(plainTurn2).slice(-2)).toEqual(['e', 'a'])
  })

  it('hệ số tốc độ chỉ ở đúng lượt sau; theo số ghi đè của skill', () => {
    const state = submit(duel(), [styled('custom', 'strong')])
    const d = cloneDraft(state)
    const monster = d.party[0]
    expect(styleSpeedMultiplier(data, d, monster)).toBe(0.5)
    d.battle.turn++
    expect(styleSpeedMultiplier(data, d, monster)).toBe(1)
  })

  it('rời sân thì mất (đổi quái)', () => {
    const party = [
      stylist(),
      makeMonster({ id: 'x', skillIds: ['idle'] }),
      makeMonster({ id: 'b', skillIds: ['idle'] })
    ]
    const idle: BattleCommand = { slot: 1, kind: 'skill', skillId: 'idle' }
    const used = submit(makeBattleState(party, [idleEnemy()]), [styled('heavy', 'strong'), idle])
    expect(battleOf(used).volatiles.a?.styleSpeed).toBeDefined()
    const switched = submit(used, [{ slot: 0, kind: 'switch', monsterId: 'b' }, idle])
    expect(battleOf(switched).volatiles.a).toBeUndefined()
  })
})

describe('hiệu ứng và log', () => {
  it('skill trạng thái thế mạnh: trạng thái thêm 1 lượt, bậc thêm 1', () => {
    const run = (style?: MoveStyle): GameState =>
      submit(makeBattleState([stylist()], [idleEnemy()]), [styled('zap', style)])
    const applied = (state: GameState): BattleEvent | undefined =>
      logOf(state).find((e) => e.type === 'statusApplied')
    const strong = run('strong')
    const plain = run()
    // Cùng RNG (thế không tốn RNG): tê liệt trúng ở cả hai lần.
    expect(applied(plain)).toMatchObject({ statusId: 'paralysis', turns: 3 })
    expect(applied(strong)).toMatchObject({ statusId: 'paralysis', turns: 4 })
    expect(battleOf(strong).stages.e?.attack).toBe(-2)
    expect(battleOf(run('agile')).stages.e?.attack).toBe(-1)
  })

  it('log useSkill ghi thế; thế thường không ghi', () => {
    const state = makeBattleState([stylist()], [idleEnemy()])
    expect(logOf(submit(state, [styled('heavy', 'agile')]))).toContainEqual({
      type: 'useSkill',
      monsterId: 'a',
      skillId: 'heavy',
      style: 'agile'
    })
    const plain = logOf(submit(state, [styled('heavy')])).find((e) => e.type === 'useSkill')
    expect(plain).toEqual({ type: 'useSkill', monsterId: 'a', skillId: 'heavy' })
  })

  it('vẫn tăng thuần thục skill gốc khi dùng thế', () => {
    const after = submit(makeBattleState([stylist()], [idleEnemy()]), [styled('heavy', 'strong')])
    expect(after.party[0].skillMastery.heavy.exp.toString()).toBe('1')
  })
})

describe('AI', () => {
  const suggestions = (monster: Monster): BattleCommand[] =>
    Array.from({ length: 40 }, (_, seed) => {
      const state = makeBattleState([monster], [idleEnemy({ level: 80 })])
      return suggestBattleCommands(data, { ...state, rng: seed + 1 })[0]
    })

  it('đủ thuần thục: chọn được cả thế thường, mạnh, nhanh; lệnh hợp lệ', () => {
    const monster = stylist({ skillIds: ['heavy'] })
    const commands = suggestions(monster)
    const styles = new Set(commands.map((c) => (c.kind === 'skill' ? (c.style ?? 'none') : '')))
    expect(styles).toEqual(new Set(['none', 'strong', 'agile']))
    const state = makeBattleState([monster], [idleEnemy({ level: 80 })])
    for (const command of commands) expect(() => submit(state, [command])).not.toThrow()
  })

  it('chưa đủ thuần thục: không bao giờ chọn thế', () => {
    const commands = suggestions(stylist({ skillIds: ['heavy'], skillMastery: {} }))
    expect(commands.every((c) => c.kind === 'skill' && c.style === undefined)).toBe(true)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesWith = (styles: unknown): string[] =>
    dataIssuesAfter(
      (raw) => {
        withTestSkills(raw)
        Object.assign(defined(raw.skills.find((s) => s.id === 'heavy')), { styles })
      },
      { regenerateText: true }
    )

  it('dữ liệu hợp lệ không lỗi', () => {
    expect(issuesWith(true)).toEqual([])
    expect(issuesWith({ agile: { priorityShift: 2 } })).toEqual([])
  })

  it.each([
    [false, /phải là true hoặc object/],
    [{ fast: {} }, /"fast"/],
    [{ strong: { powerMultiplier: 0 } }, /powerMultiplier/],
    [{ strong: { stageBonus: -1 } }, /stageBonus/],
    [{ agile: { priorityShift: 0.5 } }, /priorityShift/],
    [{ agile: { secondaryChanceShift: '5' } }, /secondaryChanceShift/],
    [{ agile: { extra: 1 } }, /"extra"/]
  ])('styles sai báo lỗi: %j', (styles, pattern) => {
    expect(issuesWith(styles).join('\n')).toMatch(pattern)
  })

  it('chiêu Max không có thế', () => {
    const issues = dataIssuesAfter((raw) => {
      Object.assign(defined(raw.skills.find((s) => s.maxMove === 'max')), { styles: true })
    })
    expect(issues.join('\n')).toMatch(/chiêu Max \/ Z-Move \/ hợp kích kỹ không có thế/)
  })

  it.each([
    [{ unlockMastery: 0 }, /unlockMastery/],
    [{ strong: { powerMultiplier: 1 } }, /strong\.secondaryChanceShift/],
    [{ extra: 1 }, /"extra"/]
  ])('config.moveStyles sai báo lỗi: %j', (patch, pattern) => {
    const issues = dataIssuesAfter((raw) => {
      Object.assign(raw.config.moveStyles, patch)
    })
    expect(issues.join('\n')).toMatch(pattern)
  })
})

describe('save', () => {
  const withStyleSpeed = (styleSpeed: unknown): GameState => {
    const state = makeBattleState([stylist()], [idleEnemy()])
    const battle = battleOf(state)
    return {
      ...state,
      battle: { ...battle, volatiles: { ...battle.volatiles, a: { firstTurn: 1, styleSpeed } } }
    } as GameState
  }

  it('styleSpeed hợp lệ / sai', () => {
    const valid = { turn: 2, skillId: 'heavy', style: 'strong' }
    expect(validateGameState(data, withStyleSpeed(valid))).toEqual([])
    const errorsOf = (value: unknown): string =>
      validateGameState(data, withStyleSpeed(value)).join('\n')
    expect(errorsOf({ ...valid, skillId: 'plainHit' })).toMatch(/không có thế/)
    expect(errorsOf({ ...valid, style: 'fast' })).toMatch(/style/)
    expect(errorsOf({ ...valid, turn: 0 })).toMatch(/turn/)
    expect(errorsOf({ ...valid, extra: 1 })).toMatch(/"extra"/)
    expect(errorsOf([])).toMatch(/styleSpeed/)
  })

  it('migrate v34 → hiện tại giữ nguyên trạng thái tạm', () => {
    const state = withStyleSpeed({ turn: 2, skillId: 'heavy', style: 'agile' })
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    raw.version = 34
    const migrated = migrateState(deserializeState(raw), data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(battleOf(migrated).volatiles).toEqual(battleOf(state).volatiles)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
