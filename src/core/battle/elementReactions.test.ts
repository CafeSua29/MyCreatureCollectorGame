// Phản ứng hệ (docs/rules/element-reactions.md): cặp có / không có phản ứng, quái hai hệ, đánh nhiều
// lần, trượt / bảo vệ / thế thân, biến hệ và Tera, trạng thái đổi mục tiêu / dẫn hệ, AI, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import { SKILL_EFFECTS, type SkillEffectAiContext } from '../registries'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  ElementReactionPair,
  GameState,
  Monster,
  RawGameData,
  Skill,
  StatusDef
} from '../model'
import { cloneDraft } from './draft'
import { elementEffectiveness } from './damage'
import { reactionEffectsOn, runElementReactions } from './elementReactions'
import { executeSkill } from './executeSkill'

const status = (id: string, kind: StatusDef['kind'], fields: Partial<StatusDef>): StatusDef => ({
  id,
  kind,
  duration: { min: 3, max: 3 },
  hooks: [],
  battleOnly: true,
  ...fields
})

const REGEN = [{ type: 'regen', params: { percent: 10 } }]

const TEST_STATUSES: StatusDef[] = [
  status('steamy', 'buff', { traitHooks: REGEN }),
  status('multi', 'buff', { skillTargetOverride: 'allEnemies' }),
  status('uni', 'debuff', { skillTargetOverride: 'enemy' }),
  status('conduct', 'debuff', { conductsElement: { elementId: 'fire', percent: 8 } })
]

const fireBase = { elementId: 'fire', priority: 0, accuracy: 100, effects: [] }

const TEST_SKILLS: Skill[] = [
  { ...fireBase, id: 'firePunch', category: 'physical', power: 1, target: 'enemy' },
  {
    ...fireBase,
    id: 'fireFlurry',
    category: 'physical',
    power: 1,
    target: 'enemy',
    hits: { min: 3, max: 3 }
  },
  { ...fireBase, id: 'fireSpark', category: 'status', power: 0, target: 'enemy' },
  // Accuracy tối thiểu 1: seed của fixture tung trượt (test kiểm có log miss).
  { ...fireBase, id: 'fireMiss', category: 'physical', power: 1, target: 'enemy', accuracy: 1 },
  {
    ...fireBase,
    id: 'fireRoar',
    category: 'status',
    power: 0,
    target: 'enemy',
    effects: [{ type: 'forceSwitch', params: {} }]
  },
  { ...fireBase, id: 'fireSelf', category: 'status', power: 0, target: 'self' },
  { ...fireBase, id: 'fireAlly', category: 'status', power: 0, target: 'ally' },
  { ...fireBase, id: 'fireWave', category: 'special', power: 1, target: 'allEnemies' },
  {
    ...fireBase,
    id: 'fireStruggle',
    category: 'physical',
    power: 1,
    target: 'enemy',
    typeless: true
  }
]

function withReactions(raw: RawGameData): RawGameData {
  raw.statuses.push(...TEST_STATUSES)
  Object.assign(raw.config.ai.statusWeights, { steamy: 0.2, multi: 0.1, uni: 0.1, conduct: 0.1 })
  raw.skills.push(...TEST_SKILLS.map((skill) => ({ ...skill })))
  raw.elementReactions.push(
    {
      id: 'steamed',
      pairs: [{ attackElementId: 'fire', defenderElementId: 'water' }],
      effects: [{ type: 'applyStatus', params: { statusId: 'steamy' } }]
    },
    {
      id: 'melted',
      pairs: [{ attackElementId: 'fire', defenderElementId: 'grass' }],
      effects: [{ type: 'transmute', params: { elementId: 'water' } }]
    },
    {
      id: 'resonating',
      pairs: [{ attackElementId: 'fire', defenderElementId: 'flying' }],
      effects: [{ type: 'resonate', params: { threshold: 3 } }]
    }
  )
  return raw
}

const data = createGameData(withFixtureText(withReactions(makeRawData())))

const idleEnemy = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id: 'e', skillIds: ['idle'], level: 50, ...fields })

const attacker = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id: 'a', skillIds: ['firePunch'], level: 50, ...fields })

/** Quái a dùng skill lên địch (không qua lượt, chỉ một lần dùng skill). */
function use(state: GameState, skillId: string): ReturnType<typeof cloneDraft> {
  const d = cloneDraft(state)
  executeSkill(data, d, {
    side: 'player',
    slot: 0,
    user: d.party[0],
    skill: data.skills[skillId],
    targetSlot: 0
  })
  return d
}

const reactionsIn = (log: readonly BattleEvent[]): string[] =>
  log.flatMap((event) => (event.type === 'elementReaction' ? [event.reactionId] : []))

const hasStatus = (monster: Monster, statusId: string): boolean =>
  monster.statuses.some((entry) => entry.statusId === statusId)

describe('phản ứng theo cặp hệ', () => {
  it('cặp có phản ứng: log và hiệu ứng lên mục tiêu', () => {
    const d = use(
      makeBattleState([attacker()], [idleEnemy({ elementIds: ['water'] })]),
      'firePunch'
    )
    expect(d.battle.log).toContainEqual({
      type: 'elementReaction',
      monsterId: 'e',
      reactionId: 'steamed',
      attackElementId: 'fire',
      defenderElementId: 'water'
    })
    expect(hasStatus(d.battle.enemies[0], 'steamy')).toBe(true)
  })

  it('cặp không có phản ứng: không log, không hiệu ứng', () => {
    const d = use(
      makeBattleState([attacker()], [idleEnemy({ elementIds: ['normal'] })]),
      'firePunch'
    )
    expect(reactionsIn(d.battle.log)).toEqual([])
    expect(d.battle.enemies[0].statuses).toEqual([])
  })

  it('quái hai hệ ra hai phản ứng theo thứ tự hệ, biến hệ không làm mất phản ứng sau', () => {
    const d = use(
      makeBattleState([attacker()], [idleEnemy({ elementIds: ['grass', 'water'] })]),
      'firePunch'
    )
    expect(reactionsIn(d.battle.log)).toEqual(['melted', 'steamed'])
    expect(hasStatus(d.battle.enemies[0], 'steamy')).toBe(true)
    expect(d.battle.enemies[0].elementIds).toEqual(['water'])
  })

  it('đánh nhiều lần chỉ phản ứng một lần', () => {
    const d = use(
      makeBattleState(
        [attacker({ skillIds: ['fireFlurry'] })],
        [idleEnemy({ elementIds: ['water'] })]
      ),
      'fireFlurry'
    )
    expect(d.battle.log.some((e) => e.type === 'hitCount' && e.hits === 3)).toBe(true)
    expect(reactionsIn(d.battle.log)).toEqual(['steamed'])
  })

  it('skill không gây sát thương cũng phản ứng', () => {
    const d = use(
      makeBattleState(
        [attacker({ skillIds: ['fireSpark'] })],
        [idleEnemy({ elementIds: ['water'] })]
      ),
      'fireSpark'
    )
    expect(reactionsIn(d.battle.log)).toEqual(['steamed'])
  })

  it('trượt, bị bảo vệ, thế thân đỡ: không phản ứng', () => {
    const enemy = idleEnemy({ elementIds: ['water'] })
    const missed = use(makeBattleState([attacker({ skillIds: ['fireMiss'] })], [enemy]), 'fireMiss')
    expect(missed.battle.log.some((e) => e.type === 'miss')).toBe(true)
    expect(reactionsIn(missed.battle.log)).toEqual([])

    const guarded = makeBattleState([attacker()], [enemy])
    defined(guarded.battle).volatiles.e.protect = { turn: 1, streak: 0 }
    expect(reactionsIn(use(guarded, 'firePunch').battle.log)).toEqual([])

    const shielded = makeBattleState([attacker()], [enemy])
    defined(shielded.battle).volatiles.e.substituteHp = toBig(1e6)
    const blocked = use(shielded, 'firePunch')
    expect(blocked.battle.log.some((e) => e.type === 'substituteDamaged')).toBe(true)
    expect(reactionsIn(blocked.battle.log)).toEqual([])
  })

  it('skill không hệ và skill tự dùng lên mình không phản ứng; nhắm đồng đội thì có', () => {
    const typeless = use(
      makeBattleState(
        [attacker({ skillIds: ['fireStruggle'] })],
        [idleEnemy({ elementIds: ['water'] })]
      ),
      'fireStruggle'
    )
    expect(reactionsIn(typeless.battle.log)).toEqual([])

    const self = use(
      makeBattleState([attacker({ elementIds: ['water'], skillIds: ['fireSelf'] })], [idleEnemy()]),
      'fireSelf'
    )
    expect(reactionsIn(self.battle.log)).toEqual([])

    const ally = use(
      makeBattleState(
        [
          attacker({ skillIds: ['fireAlly'] }),
          makeMonster({ id: 'b', skillIds: ['idle'], elementIds: ['water'] })
        ],
        [idleEnemy()]
      ),
      'fireAlly'
    )
    expect(reactionsIn(ally.battle.log)).toEqual(['steamed'])
    expect(hasStatus(ally.party[1], 'steamy')).toBe(true)
  })

  it('mục tiêu đã rời sân vì đòn (bị ép đổi quái) thì không phản ứng', () => {
    const party = [
      makeMonster({ id: 'a', skillIds: ['idle'], elementIds: ['water'], level: 50 }),
      makeMonster({ id: 'r', skillIds: ['idle'], level: 50 })
    ]
    const enemy = makeMonster({ id: 'e', skillIds: ['fireRoar'], level: 50 })
    const d = cloneDraft(makeBattleState(party, [enemy], { playerSlots: ['a', null] }))
    executeSkill(data, d, {
      side: 'enemy',
      slot: 0,
      user: d.battle.enemies[0],
      skill: data.skills.fireRoar,
      targetSlot: 0
    })
    expect(d.battle.playerSlots[0]).toBe('r')
    expect(reactionsIn(d.battle.log)).toEqual([])
    expect(d.party[0].statuses).toEqual([])
  })

  it('mục tiêu đã khỏi trận vì đòn (quái hoang bỏ chạy) thì không lỗi, không phản ứng', () => {
    const d = cloneDraft(makeBattleState([attacker()], [idleEnemy({ elementIds: ['water'] })]))
    // Như trait bỏ chạy lúc trúng đòn: quái rời danh sách địch trước bước phản ứng.
    const target = d.battle.enemies[0]
    d.battle.enemySlots = [null, null]
    d.battle.enemies = []
    runElementReactions(data, d, { user: d.party[0], skill: data.skills.firePunch, target })
    expect(reactionsIn(d.battle.log)).toEqual([])
  })

  it('mục tiêu gục vì đòn thì không phản ứng', () => {
    const state = makeBattleState([attacker()], [idleEnemy({ elementIds: ['water'], level: 1 })])
    defined(state.battle).enemies[0].damageTaken = getMaxHp(
      data,
      defined(state.battle).enemies[0]
    ).minus(1)
    const d = use(state, 'firePunch')
    expect(d.battle.enemies[0].damageTaken.gt(0)).toBe(true)
    expect(reactionsIn(d.battle.log)).toEqual([])
  })
})

describe('biến hệ', () => {
  const skillCommand = (slot: number, skillId: string): BattleCommand => ({
    slot,
    kind: 'skill',
    skillId,
    target: 0
  })

  it('đổi khắc hệ ở đòn sau', () => {
    const d = use(
      makeBattleState([attacker()], [idleEnemy({ elementIds: ['grass'] })]),
      'firePunch'
    )
    const target = d.battle.enemies[0]
    expect(target.elementIds).toEqual(['water'])
    expect(elementEffectiveness(data, 'fire', ['grass'])).toBe(2)
    expect(elementEffectiveness(data, 'fire', target.elementIds)).toBe(1)
    expect(d.battle.log.some((e) => e.type === 'identityChanged')).toBe(true)
  })

  it('mất khi rời sân', () => {
    // Chỉ a trên sân nên địch (chỉ có skill lửa) chắc chắn nhắm a; r ở dự bị.
    const party = [
      makeMonster({ id: 'a', skillIds: ['idle'], elementIds: ['grass'], level: 50 }),
      makeMonster({ id: 'r', skillIds: ['idle'], level: 50 })
    ]
    const enemy = makeMonster({ id: 'e', skillIds: ['fireSpark'], level: 50 })
    const state = makeBattleState(party, [enemy], { playerSlots: ['a', null] })
    const hit = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [skillCommand(0, 'idle')]
    })
    expect(defined(hit.party.find((m) => m.id === 'a')).elementIds).toEqual(['water'])
    const left = gameReducer(data, hit, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'switch', monsterId: 'r' }]
    })
    expect(defined(left.party.find((m) => m.id === 'a')).elementIds).toEqual(['grass'])
  })

  it('Tera chặn biến hệ, không log đổi hệ', () => {
    const target = idleEnemy({
      elementIds: ['grass'],
      battleTransform: { kind: 'tera', teraElementId: 'grass', originalElementIds: ['grass'] }
    })
    const d = use(makeBattleState([attacker()], [target]), 'firePunch')
    expect(reactionsIn(d.battle.log)).toEqual(['melted'])
    expect(d.battle.enemies[0].elementIds).toEqual(['grass'])
    expect(d.battle.log.some((e) => e.type === 'identityChanged')).toBe(false)
  })
})

describe('trạng thái đổi mục tiêu và dẫn hệ', () => {
  const twoEnemies = [idleEnemy(), makeMonster({ id: 'f', skillIds: ['idle'], level: 50 })]
  const damagedIds = (log: readonly BattleEvent[]): string[] =>
    log.flatMap((e) => (e.type === 'damage' ? [e.targetId] : []))
  const withStatus = (statusId: string, skillId: string): Monster =>
    attacker({ skillIds: [skillId], statuses: [{ statusId, turnsLeft: 3, turnsElapsed: 0 }] })

  it('đa mục tiêu: skill một địch đánh mọi địch; đánh nhiều lần giữ nguyên', () => {
    const d = use(makeBattleState([withStatus('multi', 'firePunch')], twoEnemies), 'firePunch')
    expect(damagedIds(d.battle.log).sort()).toEqual(['e', 'f'])
    const multiHit = use(
      makeBattleState([withStatus('multi', 'fireFlurry')], twoEnemies),
      'fireFlurry'
    )
    expect(new Set(damagedIds(multiHit.battle.log))).toEqual(new Set(['e']))
  })

  it('đơn mục tiêu: skill mọi địch chỉ đánh một địch', () => {
    const d = use(makeBattleState([withStatus('uni', 'fireWave')], twoEnemies), 'fireWave')
    expect(damagedIds(d.battle.log)).toHaveLength(1)
  })

  it('skill trạng thái không đổi mục tiêu', () => {
    const d = use(makeBattleState([withStatus('multi', 'fireSpark')], twoEnemies), 'fireSpark')
    expect(d.battle.log.filter((e) => e.type === 'useSkill')).toHaveLength(1)
    expect(d.battle.enemies[1].statuses).toEqual([])
  })

  it('dẫn hệ: mất % max HP mỗi mục tiêu bị đánh trúng, cả đồng đội của quái đánh', () => {
    const conductive = (id: string, level: number): Monster =>
      makeMonster({
        id,
        skillIds: ['idle'],
        level,
        statuses: [{ statusId: 'conduct', turnsLeft: 3, turnsElapsed: 0 }]
      })
    const state = makeBattleState(
      [attacker({ skillIds: ['fireWave'] }), conductive('b', 50)],
      twoEnemies
    )
    const d = use(state, 'fireWave')
    const ally = d.party[1]
    // Hai mục tiêu trúng, mỗi lần 8% max HP (làm tròn lên).
    const once = getMaxHp(data, ally).times(8).div(100).ceil()
    expect(ally.damageTaken.toString()).toBe(once.times(2).toString())
  })

  it('dẫn hệ với số cực lớn: không ra Infinity / NaN', () => {
    const huge = makeMonster({
      id: 'b',
      skillIds: ['idle'],
      level: 1e6,
      statuses: [{ statusId: 'conduct', turnsLeft: 3, turnsElapsed: 0 }]
    })
    const d = use(makeBattleState([attacker(), huge], [idleEnemy()]), 'firePunch')
    expect(d.party[1].damageTaken.isFinite()).toBe(true)
    expect(d.party[1].damageTaken.gt(0)).toBe(true)
  })

  it('hệ khác và skill trạng thái không kích hoạt dẫn hệ', () => {
    const conductive = makeMonster({
      id: 'b',
      skillIds: ['idle'],
      statuses: [{ statusId: 'conduct', turnsLeft: 3, turnsElapsed: 0 }]
    })
    const normal = use(
      makeBattleState([attacker({ skillIds: ['strike'] }), conductive], [idleEnemy()]),
      'strike'
    )
    expect(normal.party[1].damageTaken.eq(0)).toBe(true)
    const spark = use(
      makeBattleState([attacker({ skillIds: ['fireSpark'] }), conductive], [idleEnemy()]),
      'fireSpark'
    )
    expect(spark.party[1].damageTaken.eq(0)).toBe(true)
  })
})

describe('AI', () => {
  const aiContext = (fields: Partial<SkillEffectAiContext>): SkillEffectAiContext => {
    const d = cloneDraft(makeBattleState([attacker()], [idleEnemy()]))
    return {
      data,
      user: d.party[0],
      target: d.battle.enemies[0],
      targetIsAlly: false,
      stages: {},
      expectedDamage: toBig(0),
      field: d.battle.field,
      side: 'player',
      allies: [],
      foes: [],
      allyReserves: [],
      foeReserves: [],
      ...fields
    }
  }

  it('buff cho địch là điểm âm, debuff là điểm dương', () => {
    const apply = SKILL_EFFECTS.applyStatus
    expect(apply.aiValue({ statusId: 'steamy' }, aiContext({}))).toBeLessThan(0)
    expect(apply.aiValue({ statusId: 'uni' }, aiContext({}))).toBeGreaterThan(0)
  })

  it('biến hệ chấm theo khắc hệ trước và sau', () => {
    const { transmute } = SKILL_EFFECTS
    const user = attacker({ elementIds: ['fire'] })
    // Lửa khắc cỏ (×2): đổi cỏ thành nước (×1) là mất lợi thế.
    const grass = idleEnemy({ elementIds: ['grass'] })
    const worse = aiContext({ user, target: grass })
    expect(transmute.aiValue({ elementId: 'water' }, worse)).toBeLessThan(0)
    const water = idleEnemy({ elementIds: ['water'] })
    expect(
      transmute.aiValue({ elementId: 'grass' }, aiContext({ user, target: water }))
    ).toBeGreaterThan(0)
    const tera = idleEnemy({
      elementIds: ['water'],
      battleTransform: { kind: 'tera', teraElementId: 'water', originalElementIds: ['water'] }
    })
    expect(transmute.aiValue({ elementId: 'grass' }, aiContext({ user, target: tera }))).toBe(0)
  })

  it('hiệu ứng phản ứng dự kiến theo skill và mục tiêu', () => {
    const state = makeBattleState([attacker()], [idleEnemy({ elementIds: ['water', 'grass'] })])
    const d = cloneDraft(state)
    const input = { user: d.party[0], target: d.battle.enemies[0] }
    expect(reactionEffectsOn(data, d, { ...input, skill: data.skills.firePunch })).toHaveLength(2)
    expect(reactionEffectsOn(data, d, { ...input, skill: data.skills.strike })).toEqual([])
    expect(reactionEffectsOn(data, d, { ...input, skill: data.skills.fireStruggle })).toEqual([])
    expect(
      reactionEffectsOn(data, d, { ...input, target: input.user, skill: data.skills.firePunch })
    ).toEqual([])
  })
})

describe('cộng hưởng (Resonance)', () => {
  const flyer = (fields: Partial<Monster> = {}): Monster =>
    idleEnemy({ elementIds: ['flying'], ...fields })
  const sparkOn = (state: GameState, times: number): ReturnType<typeof cloneDraft> => {
    const d = cloneDraft(state)
    for (let i = 0; i < times; i++) {
      executeSkill(data, d, {
        side: 'player',
        slot: 0,
        user: d.party[0],
        skill: data.skills.fireSpark,
        targetSlot: 0
      })
    }
    return d
  }
  const caster = attacker({ skillIds: ['fireSpark'] })

  it('đủ 3 lần thì mục tiêu gục, dưới 3 lần chỉ đếm', () => {
    const state = makeBattleState([caster], [flyer()])
    const twice = sparkOn(state, 2)
    expect(twice.battle.volatiles.e.resonance).toBe(2)
    expect(twice.battle.enemies[0].damageTaken.eq(0)).toBe(true)
    const thrice = sparkOn(state, 3)
    const enemy = thrice.battle.enemies[0]
    expect(enemy.damageTaken.eq(getMaxHp(data, enemy))).toBe(true)
    expect(thrice.battle.log).toContainEqual({
      type: 'resonance',
      monsterId: 'e',
      count: 3,
      threshold: 3
    })
    expect(thrice.battle.log.some((e) => e.type === 'perished')).toBe(true)
  })

  it('boss hoang không bị; thế thân đỡ thì không đếm', () => {
    const boss = sparkOn(makeBattleState([caster], [flyer()], { isBoss: true }), 3)
    expect(boss.battle.enemies[0].damageTaken.eq(0)).toBe(true)
    expect(boss.battle.volatiles.e.resonance).toBeUndefined()

    const shielded = makeBattleState([caster], [flyer()])
    defined(shielded.battle).volatiles.e.substituteHp = toBig(1e6)
    expect(sparkOn(shielded, 1).battle.volatiles.e.resonance).toBeUndefined()
  })

  it('điểm AI: tăng theo số lần đã đếm, boss hoang 0', () => {
    const d = cloneDraft(makeBattleState([caster], [flyer()]))
    const { resonate } = SKILL_EFFECTS
    const context = {
      data,
      user: d.party[0],
      target: d.battle.enemies[0],
      targetIsAlly: false,
      stages: {},
      expectedDamage: toBig(0),
      field: d.battle.field,
      side: 'player' as const,
      allies: [],
      foes: [],
      allyReserves: [],
      foeReserves: []
    }
    const first = resonate.aiValue({ threshold: 3 }, context)
    const later = resonate.aiValue(
      { threshold: 3 },
      { ...context, volatiles: { e: { firstTurn: 1, resonance: 2 } } }
    )
    expect(first).toBeGreaterThan(0)
    expect(later).toBeGreaterThan(first)
    expect(resonate.aiValue({ threshold: 3 }, { ...context, isBoss: true })).toBe(0)
  })

  it('save: resonance sai kiểu báo lỗi, save v102 lên được version hiện tại', () => {
    const state = makeBattleState([caster], [flyer()])
    defined(state.battle).volatiles.e.resonance = 0
    expect(validateGameState(data, state).join('\n')).toContain('resonance')
    const fresh = makeBattleState([caster], [flyer()])
    const raw = JSON.parse(JSON.stringify(serializeState(fresh)))
    expect(migrateState({ ...raw, version: 102 }, data).version).toBe(SAVE_VERSION)
  })
})

describe('kiểm tra dữ liệu', () => {
  const pair = (attackElementId: string, defenderElementId: string): ElementReactionPair => ({
    attackElementId,
    defenderElementId
  })
  const stage = { type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }
  const issuesOf = (reactions: RawGameData['elementReactions']): string =>
    dataIssuesAfter((raw) => raw.elementReactions.push(...reactions), {
      regenerateText: true
    }).join('\n')

  it('dữ liệu hợp lệ không báo lỗi', () => {
    expect(issuesOf([{ id: 'ok', pairs: [pair('fire', 'water')], effects: [stage] }])).toBe('')
  })

  it('trùng cặp, hệ không tồn tại, thiếu cặp, thiếu hiệu ứng, trường lạ', () => {
    const issues = issuesOf([
      { id: 'one', pairs: [pair('fire', 'water')], effects: [stage] },
      { id: 'two', pairs: [pair('fire', 'water')], effects: [stage] },
      { id: 'badElement', pairs: [pair('mud', 'water')], effects: [stage] },
      { id: 'noPairs', pairs: [], effects: [stage] },
      { id: 'noEffects', pairs: [pair('water', 'fire')], effects: [] },
      { id: 'extra', pairs: [pair('grass', 'fire')], effects: [stage], chance: 5 } as never
    ])
    expect(issues).toContain('cặp "fire>water" trùng với phản ứng "one"')
    expect(issues).toContain('hệ không tồn tại "mud"')
    expect(issues).toContain('"noPairs": cần ít nhất 1 cặp hệ')
    expect(issues).toContain('"noEffects".effects: cần ít nhất 1 hiệu ứng')
    expect(issues).toContain('chance')
  })

  it('hiệu ứng sai timing, chạy lên quái dùng, hệ biến không tồn tại', () => {
    const issues = issuesOf([
      {
        id: 'wrongTiming',
        pairs: [pair('fire', 'water')],
        effects: [{ type: 'cureTeamStatus', params: {} }]
      },
      {
        id: 'onUser',
        pairs: [pair('water', 'fire')],
        effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 1 } }]
      },
      {
        id: 'badTransmute',
        pairs: [pair('grass', 'fire')],
        effects: [{ type: 'transmute', params: { elementId: 'mud' } }]
      }
    ])
    expect(issues).toContain(
      '"wrongTiming".effects: hook "cureTeamStatus" phải có timing afterHits'
    )
    expect(issues).toContain('"onUser".effects: hook "statStage" phải chạy lên mục tiêu')
    expect(issues).toContain('hệ không tồn tại "mud"')
  })

  it('trường trạng thái của phản ứng hệ', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.statuses.push(
          status('badTarget', 'buff', { skillTargetOverride: 'self' as never }),
          status('badConduct', 'debuff', { conductsElement: { elementId: 'mud', percent: 0 } })
        )
        Object.assign(raw.config.ai.statusWeights, { badTarget: 0, badConduct: 0 })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('skillTargetOverride phải là allEnemies / enemy')
    expect(issues).toContain('conductsElement: hệ không tồn tại "mud"')
    expect(issues).toContain('conductsElement: ')
  })
})
