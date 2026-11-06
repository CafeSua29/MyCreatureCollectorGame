// Cơ chế Cassette Beasts (docs/rules/element-reactions.md): tường (chặn đòn, khắc hệ phá, Window,
// Revolving Door, Recycle, hết lượt), Booby Trap, skill bị động (không ra lệnh được, hook Resistance,
// Camouflage lúc vào sân, Prismatic cuối lượt), Spring-Loaded, Glass Bonds, lớp phủ có thời hạn,
// kiểm tra dữ liệu và save.

import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type {
  BattleEvent,
  GameState,
  Monster,
  RawGameData,
  Skill,
  StatusDef,
  StatusInstance
} from '../model'
import { cloneDraft, type Draft } from './draft'
import { executeSkill } from './executeSkill'
import { isSkillBlocked } from './executeSkill'
import { applyTransform } from './transform'
import { triggerEntryEffects } from './environment'
import { passivesAtTurnEnd } from './passiveSkills'
import { wallAttacksOnAction } from './walls'
import { cureAllStatuses } from './statuses'
import { boobyTrapsAtTurnEnd } from './boobyTraps'
import { coatingsAtTurnEnd } from './coatings'
import { suggestBattleCommands } from './ai'

const status = (id: string, kind: StatusDef['kind'], fields: Partial<StatusDef>): StatusDef => ({
  id,
  kind,
  hooks: [],
  battleOnly: true,
  ...fields
})

const base = { priority: 0, accuracy: 100, effects: [] }
const self = (id: string, effects: Skill['effects'], fields: Partial<Skill> = {}): Skill => ({
  ...base,
  id,
  elementId: 'normal',
  category: 'status',
  power: 0,
  target: 'self',
  effects,
  ...fields
})

const TEST_SKILLS: Skill[] = [
  // Tường đặt được lên đồng đội / địch (TARGET_ONE của gốc).
  {
    ...self('raiseWall', [{ type: 'wall', params: { statusId: 'wallGrass', hpCostPercent: 20 } }]),
    onAlly: [{ type: 'wall', params: { statusId: 'wallGrass', hpCostPercent: 20 } }],
    onFoe: [{ type: 'wall', params: { statusId: 'wallGrass', hpCostPercent: 20 } }]
  },
  self('userWall', [{ type: 'wall', params: { elementFromUser: true } }]),
  self('specialWall', [{ type: 'wall', params: { statusId: 'wallSpecial' } }]),
  self('crumbleIt', [{ type: 'crumbleWalls', params: { power: 30, elementId: 'normal' } }]),
  {
    ...base,
    id: 'gale',
    elementId: 'normal',
    category: 'special',
    power: 40,
    target: 'enemy',
    destroysWalls: true
  },
  {
    ...base,
    id: 'hurl',
    elementId: 'normal',
    category: 'special',
    power: 40,
    target: 'enemy',
    consumesWall: true
  },
  { ...base, id: 'bolt', elementId: 'normal', category: 'special', power: 30, target: 'enemy' },
  self('ricochetSkill', [], {
    passive: { hooks: [{ type: 'wallIgnoreChance', params: { percent: 100 } }] }
  }),
  { ...base, id: 'fireHit', elementId: 'fire', category: 'special', power: 40, target: 'enemy' },
  {
    ...base,
    id: 'normalHit',
    elementId: 'normal',
    category: 'special',
    power: 40,
    target: 'enemy'
  },
  {
    ...base,
    id: 'punch',
    elementId: 'normal',
    category: 'physical',
    power: 40,
    target: 'enemy',
    contact: true
  },
  {
    ...base,
    id: 'peek',
    elementId: 'normal',
    category: 'status',
    power: 0,
    target: 'enemy',
    effects: [{ type: 'applyStatus', params: { statusId: 'peeked' } }]
  },
  {
    ...base,
    id: 'swipeWall',
    elementId: 'normal',
    category: 'status',
    power: 0,
    target: 'enemy',
    effects: [{ type: 'stealWall', params: {} }]
  },
  self('recycleIt', [{ type: 'recycleWall', params: { staminaPerTurn: 10 } }]),
  {
    ...base,
    id: 'trick',
    elementId: 'normal',
    category: 'status',
    power: 0,
    target: 'enemy',
    effects: [{ type: 'stickerTrick', params: { turns: 2, power: 30 } }]
  },
  self('resistFire', [], {
    passive: {
      hooks: [
        {
          type: 'elementDamageTaken',
          params: { elementIds: ['fire'], percent: -50, exceptCritical: true }
        },
        { type: 'blocksElementReactions', params: { elementIds: ['fire'] } }
      ]
    }
  }),
  {
    ...self('camo', [{ type: 'transmute', params: { elementId: 'ghost', turns: 2 } }]),
    passive: {
      onBattleStart: [{ type: 'transmute', params: { elementId: 'ghost', turns: 2 } }],
      usable: true
    }
  },
  self('prism', [], {
    passive: { turnEnd: [{ type: 'transmuteRandom', params: { elementIds: ['water'] } }] }
  }),
  self('springy', [], {
    passive: { onEntry: [{ type: 'applyStatus', params: { statusId: 'sprung' } }] }
  })
]

const wallStatus = (id: string, wall: StatusDef['wall']): StatusDef =>
  status(id, 'buff', {
    duration: { min: 3, max: 3 },
    endsOnLeave: true,
    wall,
    ...(wall?.special ? {} : { exclusiveGroup: 'wall', overwritesGroup: true })
  })

const TEST_STATUSES: StatusDef[] = [
  wallStatus('wallGrass', { elementId: 'grass', hits: 2 }),
  wallStatus('wallNormal', { elementId: 'normal', hits: 3 }),
  wallStatus('wallFire', { elementId: 'fire', hits: 3 }),
  wallStatus('wallSpecial', {
    elementId: 'normal',
    hits: 3,
    special: true,
    attackSkillId: 'bolt'
  }),
  status('peeked', 'debuff', { duration: { min: 3, max: 3 }, seeThroughWall: true }),
  status('quick', 'buff', {
    duration: { min: 3, max: 3 },
    traitHooks: [{ type: 'statModifier', params: { percent: { speed: 25 } } }]
  }),
  status('sprung', 'buff', { endsOnLeave: true, meleeAsRanged: true }),
  status('bonds', 'debuff', { duration: { min: 3, max: 3 }, damageOnTransform: 25 })
]

function withMechanics(raw: RawGameData): RawGameData {
  raw.skills.push(...TEST_SKILLS.map((skill) => ({ ...skill })))
  raw.statuses.push(...TEST_STATUSES)
  Object.assign(raw.config.ai.statusWeights, {
    peeked: 0.05,
    quick: 0.1,
    sprung: 0.1,
    bonds: 0.1,
    wallGrass: 0.1,
    wallNormal: 0.1,
    wallFire: 0.1,
    wallSpecial: 0.1
  })
  raw.elementReactions.push({
    id: 'scorch',
    pairs: [{ attackElementId: 'fire', defenderElementId: 'grass' }],
    effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }]
  })
  return raw
}

const data = createGameData(withFixtureText(withMechanics(makeRawData())))

const player = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id: 'a', skillIds: ['fireHit', 'normalHit', 'punch'], level: 50, ...fields })
const enemy = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id: 'e', skillIds: ['idle'], level: 50, ...fields })

/** Một lần dùng skill của quái `userId` lên ô 0 phe kia. */
function castSkill(d: Draft, userId: string, skillId: string): void {
  const side = d.party.some((m) => m.id === userId) ? 'player' : 'enemy'
  const user = defined(
    [...d.party, ...d.battle.enemies].find((m) => m.id === userId),
    `quái ${userId}`
  )
  const slots = side === 'player' ? d.battle.playerSlots : d.battle.enemySlots
  executeSkill(data, d, {
    side,
    slot: slots.indexOf(userId),
    user,
    skill: data.skills[skillId],
    targetSlot: 0
  })
}

const eventsOf = (d: Draft, type: BattleEvent['type']): BattleEvent[] =>
  d.battle.log.filter((event) => event.type === type)

const damageTo = (d: Draft, targetId: string): number =>
  d.battle.log.reduce(
    (sum, event) =>
      event.type === 'damage' && event.targetId === targetId ? sum + event.amount.toNumber() : sum,
    0
  )

/** Đặt tường lên địch e. */
function raiseOn(d: Draft, statusId: string): void {
  const hits = defined(data.statuses[statusId].wall, 'tường').hits
  d.battle.enemies[0].statuses.push({ statusId, turnsLeft: 3, amount: toBig(hits) })
}

const wallOfState = (state: GameState): boolean =>
  defined(state.battle).enemies[0].statuses.some((status) => status.statusId === 'wallGrass')

/** Trận a (người chơi) với e (địch hệ thường); e dựng tường cỏ cho chính nó trước. */
function walledState(enemyFields: Partial<Monster> = {}): Draft {
  const d = cloneDraft(
    makeBattleState([player()], [enemy({ skillIds: ['raiseWall'], ...enemyFields })])
  )
  castSkill(d, 'e', 'raiseWall')
  return d
}

describe('tường', () => {
  const wallOf = (d: Draft, statusId = 'wallGrass'): StatusInstance | undefined =>
    d.battle.enemies[0].statuses.find((status) => status.statusId === statusId)

  it('quái dùng mất 20% max HP, chặn trọn đòn, hết lượt chặn thì vỡ', () => {
    const d = walledState()
    const owner = d.battle.enemies[0]
    expect(owner.damageTaken.eq(getMaxHp(data, owner).times(20).div(100).ceil())).toBe(true)
    expect(wallOf(d)?.amount?.toNumber()).toBe(2)
    expect(wallOf(d)?.turnsLeft).toBe(3)
    const before = owner.damageTaken
    castSkill(d, 'a', 'normalHit')
    expect(owner.damageTaken.eq(before)).toBe(true)
    expect(wallOf(d)?.amount?.toNumber()).toBe(1)
    castSkill(d, 'a', 'normalHit')
    expect(wallOf(d)).toBeUndefined()
    expect(eventsOf(d, 'wallBroken')).toHaveLength(1)
    castSkill(d, 'a', 'normalHit')
    expect(owner.damageTaken.gt(before)).toBe(true)
  })

  it('đòn khắc hệ CỦA TƯỜNG phá tường và vẫn trúng; khắc hệ của quái thì không', () => {
    // Tường cỏ trên quái thường: lửa khắc tường.
    const broken = walledState()
    castSkill(broken, 'a', 'fireHit')
    expect(wallOf(broken)).toBeUndefined()
    expect(damageTo(broken, 'e')).toBeGreaterThan(0)
    // Tường thường trên quái cỏ: lửa khắc quái nhưng không khắc tường, tường vẫn chặn.
    const d = cloneDraft(makeBattleState([player()], [enemy({ elementIds: ['grass'] })]))
    raiseOn(d, 'wallNormal')
    castSkill(d, 'a', 'fireHit')
    expect(damageTo(d, 'e')).toBe(0)
    expect(wallOf(d, 'wallNormal')?.amount?.toNumber()).toBe(2)
    expect(eventsOf(d, 'elementReaction')).toHaveLength(0)
  })

  it('đặt được lên đồng đội và địch, quái dùng vẫn mất máu', () => {
    const state = makeBattleState(
      [
        player({ skillIds: ['raiseWall'] }),
        makeMonster({ id: 'b', skillIds: ['idle'], level: 50 })
      ],
      [enemy()]
    )
    const d = cloneDraft(state)
    executeSkill(data, d, {
      side: 'player',
      slot: 0,
      user: d.party[0],
      skill: data.skills.raiseWall,
      targetAlly: true
    })
    expect(d.party[1].statuses.some((s) => s.statusId === 'wallGrass')).toBe(true)
    expect(d.party[0].damageTaken.gt(0)).toBe(true)
    expect(d.party[1].damageTaken.eq(0)).toBe(true)
    executeSkill(data, d, {
      side: 'player',
      slot: 0,
      user: d.party[0],
      skill: data.skills.raiseWall,
      targetFoe: true,
      targetSlot: 0
    })
    expect(wallOf(d)).toBeDefined()
  })

  it('lệnh targetFoe chỉ cho skill có onFoe', () => {
    const state = makeBattleState([player({ skillIds: ['raiseWall', 'punch'] })], [enemy()])
    const submit = (skillId: string): GameState =>
      gameReducer(data, state, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId, target: 0, targetFoe: true }]
      })
    expect(wallOfState(submit('raiseWall'))).toBe(true)
    expectActionError(() => submit('punch'), 'malformedAction')
  })

  it('tường theo hệ quái dùng; tường thường thay nhau, tường đặc biệt tồn tại song song', () => {
    const d = cloneDraft(
      makeBattleState([player({ skillIds: ['userWall'], elementIds: ['fire'] })], [enemy()])
    )
    castSkill(d, 'a', 'userWall')
    const statuses = (): string[] => d.party[0].statuses.map((status) => status.statusId)
    expect(statuses()).toEqual(['wallFire'])
    // Tường đặc biệt gỡ tường thường.
    executeSkill(data, d, {
      side: 'player',
      slot: 0,
      user: d.party[0],
      skill: data.skills.specialWall
    })
    expect(statuses()).toEqual(['wallSpecial'])
    // Tường thường không gỡ tường đặc biệt.
    castSkill(d, 'a', 'userWall')
    expect(statuses()).toEqual(['wallSpecial', 'wallFire'])
  })

  it('tường có đòn riêng đánh đầu lượt của quái (Abramacabra)', () => {
    const d = cloneDraft(makeBattleState([player()], [enemy({ skillIds: ['specialWall'] })]))
    raiseOn(d, 'wallSpecial')
    wallAttacksOnAction(data, d, d.battle.enemies[0])
    expect(damageTo(d, 'a')).toBeGreaterThan(0)
  })

  it('Window: tường không chặn skill tầm xa, vẫn chặn cận chiến', () => {
    const d = walledState()
    d.battle.enemies[0].statuses.push({ statusId: 'peeked', turnsLeft: 3 })
    castSkill(d, 'a', 'normalHit')
    expect(damageTo(d, 'e')).toBeGreaterThan(0)
    expect(wallOf(d)?.amount?.toNumber()).toBe(2)
    castSkill(d, 'a', 'punch')
    expect(wallOf(d)?.amount?.toNumber()).toBe(1)
  })

  it('Ricochet đi xuyên tường với đòn tầm xa, không với cận chiến', () => {
    const d = cloneDraft(
      makeBattleState([player({ skillIds: ['ricochetSkill', 'normalHit', 'punch'] })], [enemy()])
    )
    raiseOn(d, 'wallGrass')
    castSkill(d, 'a', 'normalHit')
    expect(damageTo(d, 'e')).toBeGreaterThan(0)
    expect(wallOf(d)?.amount?.toNumber()).toBe(2)
    castSkill(d, 'a', 'punch')
    expect(wallOf(d)?.amount?.toNumber()).toBe(1)
  })

  it('chiêu phá tường: gỡ mọi tường rồi trúng', () => {
    const d = walledState()
    castSkill(d, 'a', 'gale')
    expect(wallOf(d)).toBeUndefined()
    expect(damageTo(d, 'e')).toBeGreaterThan(0)
  })

  it('Crumble: phá mọi tường, quái có tường mất máu, quái không tường thì không', () => {
    const d = cloneDraft(
      makeBattleState(
        [
          player({ skillIds: ['crumbleIt'] }),
          makeMonster({ id: 'b', skillIds: ['idle'], level: 50 })
        ],
        [enemy()]
      )
    )
    raiseOn(d, 'wallGrass')
    const before = d.battle.enemies[0].damageTaken
    castSkill(d, 'a', 'crumbleIt')
    expect(wallOf(d)).toBeUndefined()
    expect(d.battle.enemies[0].damageTaken.gt(before)).toBe(true)
    expect(d.party[1].damageTaken.eq(0)).toBe(true)
  })

  it('Throw: cần tường của chính quái, sát thương × lượt còn lại, không có thì thất bại', () => {
    const plain = cloneDraft(makeBattleState([player({ skillIds: ['hurl'] })], [enemy()]))
    castSkill(plain, 'a', 'hurl')
    expect(eventsOf(plain, 'skillFailed')).toHaveLength(1)
    expect(damageTo(plain, 'e')).toBe(0)
    const d = cloneDraft(makeBattleState([player({ skillIds: ['hurl', 'raiseWall'] })], [enemy()]))
    castSkill(d, 'a', 'raiseWall')
    castSkill(d, 'a', 'hurl')
    expect(d.party[0].statuses.some((s) => s.statusId === 'wallGrass')).toBe(false)
    expect(damageTo(d, 'e')).toBeGreaterThan(0)
  })

  it('Revolving Door lấy tường; Recycle đổi tường lấy thể lực theo lượt còn lại', () => {
    const d = walledState()
    d.party[0].skillIds = ['swipeWall', 'recycleIt']
    castSkill(d, 'a', 'swipeWall')
    expect(wallOf(d)).toBeUndefined()
    expect(d.party[0].statuses.find((s) => s.statusId === 'wallGrass')?.amount?.toNumber()).toBe(2)
    castSkill(d, 'a', 'recycleIt')
    expect(d.party[0].statuses.some((s) => s.statusId === 'wallGrass')).toBe(false)
    // Tường còn 3 lượt: hồi 30 thể lực, đầy thì không thừa.
    expect(d.battle.records.a?.staminaUsed).toBeUndefined()
    // Không còn tường: Recycle thất bại.
    castSkill(d, 'a', 'recycleIt')
    expect(eventsOf(d, 'skillFailed').length).toBeGreaterThan(0)
  })

  it('tường là trạng thái có thời hạn: hết lượt thì mất, rời sân thì mất', () => {
    const party = [
      player({ skillIds: ['raiseWall', 'idle'] }),
      makeMonster({ id: 'r', skillIds: ['idle'], level: 50 })
    ]
    let state = makeBattleState(party, [enemy()], { playerSlots: ['a', null] })
    const turnWith = (skillId: string): GameState =>
      gameReducer(data, state, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId }]
      })
    const hasWallNow = (): boolean =>
      defined(state.party.find((m) => m.id === 'a')).statuses.some(
        (s) => s.statusId === 'wallGrass'
      )
    state = turnWith('raiseWall')
    expect(hasWallNow()).toBe(true)
    state = turnWith('idle')
    state = turnWith('idle')
    expect(hasWallNow()).toBe(false)
    state = turnWith('raiseWall')
    state = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'switch', monsterId: 'r' }]
    })
    expect(hasWallNow()).toBe(false)
  })
})

describe('Sticker Trick / Booby Trap', () => {
  function trapped(): Draft {
    const d = cloneDraft(
      makeBattleState([player({ skillIds: ['trick'] })], [enemy({ skillIds: ['normalHit'] })])
    )
    castSkill(d, 'e', 'normalHit')
    castSkill(d, 'a', 'trick')
    return d
  }

  it('thay skill vừa dùng của mục tiêu; dùng lại thì tự mất máu, không đánh địch', () => {
    const d = trapped()
    expect(d.battle.volatiles.e.boobyTraps).toEqual([
      { skillId: 'normalHit', turnsLeft: 2, power: 30 }
    ])
    const playerHpBefore = d.party[0].damageTaken
    const enemyHpBefore = d.battle.enemies[0].damageTaken
    castSkill(d, 'e', 'normalHit')
    expect(eventsOf(d, 'boobyTrapSprung')).toHaveLength(1)
    expect(d.party[0].damageTaken.eq(playerHpBefore)).toBe(true)
    expect(d.battle.enemies[0].damageTaken.gt(enemyHpBefore)).toBe(true)
  })

  it('chưa dùng skill nào hoặc skill đã bị bẫy thì thất bại; hết lượt thì gỡ bẫy', () => {
    const fresh = cloneDraft(makeBattleState([player({ skillIds: ['trick'] })], [enemy()]))
    castSkill(fresh, 'a', 'trick')
    expect(fresh.battle.volatiles.e.boobyTraps).toBeUndefined()
    expect(eventsOf(fresh, 'skillFailed')).toHaveLength(1)
    const d = trapped()
    castSkill(d, 'a', 'trick')
    expect(d.battle.volatiles.e.boobyTraps).toHaveLength(1)
    boobyTrapsAtTurnEnd(d)
    boobyTrapsAtTurnEnd(d)
    expect(d.battle.volatiles.e.boobyTraps).toBeUndefined()
  })

  it('AI không chọn skill đã bị bẫy', () => {
    const state = makeBattleState([player({ skillIds: ['normalHit', 'punch'] })], [enemy()])
    defined(state.battle).volatiles.a.boobyTraps = [
      { skillId: 'normalHit', turnsLeft: 2, power: 30 }
    ]
    for (let seed = 0; seed < 5; seed++) {
      const commands = suggestBattleCommands(data, { ...state, rng: seed })
      expect(commands.every((c) => c.kind !== 'skill' || c.skillId === 'punch')).toBe(true)
    }
  })
})

describe('skill bị động', () => {
  it('skill chỉ bị động không ra lệnh được, bị chặn khi dùng; skill usable thì dùng được', () => {
    const state = makeBattleState([player({ skillIds: ['resistFire', 'camo'] })], [enemy()])
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'skill', skillId: 'resistFire' }]
        }),
      'skillIsPassive'
    )
    const d = cloneDraft(state)
    expect(isSkillBlocked(data, d, { user: d.party[0], skill: data.skills.resistFire })).toBe(true)
    expect(isSkillBlocked(data, d, { user: d.party[0], skill: data.skills.camo })).toBe(false)
  })

  it('Resistance: giảm 50% sát thương hệ đó (trừ chí mạng), chặn phản ứng của hệ đó', () => {
    const run = (skillIds: string[]): Draft => {
      const d = cloneDraft(
        makeBattleState([player()], [enemy({ elementIds: ['grass'], skillIds })])
      )
      castSkill(d, 'a', 'fireHit')
      return d
    }
    const plain = run(['idle'])
    const resisted = run(['idle', 'resistFire'])
    const ratio = damageTo(resisted, 'e') / damageTo(plain, 'e')
    expect(ratio).toBeGreaterThan(0.45)
    expect(ratio).toBeLessThan(0.55)
    expect(eventsOf(plain, 'elementReaction')).toHaveLength(1)
    expect(eventsOf(resisted, 'elementReaction')).toHaveLength(0)
  })

  it('Camouflage tự dùng một lần đầu trận, vào lại sân không dùng nữa, hết hạn thì trả hệ', () => {
    const d = cloneDraft(
      makeBattleState([player({ skillIds: ['camo'], elementIds: ['grass'] })], [enemy()])
    )
    triggerEntryEffects(data, d, [d.party[0]])
    expect(d.party[0].elementIds).toEqual(['ghost'])
    expect(d.battle.volatiles.a.coatingTurnsLeft).toBe(2)
    coatingsAtTurnEnd(d)
    expect(d.party[0].elementIds).toEqual(['ghost'])
    coatingsAtTurnEnd(d)
    expect(d.party[0].elementIds).toEqual(['grass'])
    expect(d.battle.volatiles.a.originalIdentity).toBeUndefined()
    triggerEntryEffects(data, d, [d.party[0]])
    expect(d.party[0].elementIds).toEqual(['grass'])
  })

  it('Camouflage vẫn dùng được bằng lệnh; gỡ trạng thái thì gỡ cả lớp phủ', () => {
    const d = cloneDraft(
      makeBattleState([player({ skillIds: ['camo'], elementIds: ['grass'] })], [enemy()])
    )
    castSkill(d, 'a', 'camo')
    expect(d.party[0].elementIds).toEqual(['ghost'])
    cureAllStatuses(data, d, d.party[0])
    expect(d.party[0].elementIds).toEqual(['grass'])
  })

  it('Prismatic đổi hệ cuối lượt; Spring-Load cho trạng thái lúc vào sân', () => {
    const d = cloneDraft(
      makeBattleState(
        [player({ skillIds: ['prism', 'springy'], elementIds: ['grass'] })],
        [enemy()]
      )
    )
    passivesAtTurnEnd(data, d)
    expect(d.party[0].elementIds).toEqual(['water'])
    triggerEntryEffects(data, d, [d.party[0]])
    expect(d.party[0].statuses.some((s) => s.statusId === 'sprung')).toBe(true)
  })
})

describe('Spring-Loaded và Glass Bonds', () => {
  it('Spring-Loaded: đòn cận chiến thành tầm xa, với tới quái đang bay', () => {
    const run = (statuses: Monster['statuses']): Draft => {
      const d = cloneDraft(
        makeBattleState([player({ statuses })], [enemy({ elementIds: ['flying'] })])
      )
      castSkill(d, 'a', 'punch')
      return d
    }
    expect(eventsOf(run([]), 'outOfReach')).toHaveLength(1)
    const sprung = run([{ statusId: 'sprung', turnsLeft: null }])
    expect(eventsOf(sprung, 'outOfReach')).toHaveLength(0)
    expect(damageTo(sprung, 'e')).toBeGreaterThan(0)
  })

  it('Glass Bonds: biến hình thì mất 25% max HP; số cực lớn không ra Infinity', () => {
    for (const level of [50, 1e6]) {
      const d = cloneDraft(
        makeBattleState(
          [player({ level, statuses: [{ statusId: 'bonds', turnsLeft: 3 }] })],
          [enemy()]
        )
      )
      applyTransform(data, d, { monsterId: 'a', side: 'player', kind: 'tera' })
      const monster = d.party[0]
      const expected = getMaxHp(data, monster).times(25).div(100).floor()
      expect(monster.damageTaken.eq(expected)).toBe(true)
      expect(monster.damageTaken.isFinite()).toBe(true)
    }
  })
})

describe('kiểm tra dữ liệu và save', () => {
  it('skill bị động sai: thiếu hiệu ứng, trường lạ, không phải skill trạng thái nhắm self', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.skills.push(self('emptyPassive', [], { passive: {} }), {
          ...base,
          id: 'badPassive',
          elementId: 'normal',
          category: 'physical',
          power: 40,
          target: 'enemy',
          passive: { hooks: [{ type: 'nope', params: {} }], extra: 1 } as never
        })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('"emptyPassive": passive cần ít nhất một hook / hiệu ứng')
    expect(issues).toContain('skill chỉ bị động phải là skill trạng thái power 0 nhắm self')
    expect(issues).toContain('hook "nope" chưa có trong registry')
    expect(issues).toContain('extra')
  })

  it('tường sai: hệ, số đòn, đòn riêng không tồn tại; hiệu ứng trỏ tới không phải tường', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.statuses.push(
          status('badWall', 'buff', {
            wall: { elementId: 'mud', hits: 0, attackSkillId: 'nope' }
          })
        )
        Object.assign(raw.config.ai.statusWeights, { badWall: 0 })
        raw.skills.push(self('badWallSkill', [{ type: 'wall', params: { statusId: 'poison' } }]))
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('wall: hệ không tồn tại "mud"')
    expect(issues).toContain('wall.hits')
    expect(issues).toContain('attackSkillId: skill không tồn tại "nope"')
    expect(issues).toContain('trạng thái không phải tường "poison"')
  })

  it('trạng thái sai: cờ không phải true, damageOnTransform ngoài khoảng', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.statuses.push(
          status('badFlags', 'buff', { seeThroughWall: 1 as never, damageOnTransform: 0 })
        )
        Object.assign(raw.config.ai.statusWeights, { badFlags: 0 })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('seeThroughWall chỉ được là true')
    expect(issues).toContain('damageOnTransform')
  })

  it('save: trường tạm sai báo lỗi; save v107 bỏ tường kiểu cũ, lên được version hiện tại', () => {
    const state: GameState = makeBattleState([player()], [enemy()])
    const volatiles = defined(state.battle).volatiles
    volatiles.e.boobyTraps = [{ skillId: 'nope', turnsLeft: 1, power: 30 }]
    volatiles.e.coatingTurnsLeft = 2
    const issues = validateGameState(data, state).join('\n')
    expect(issues).toContain('boobyTraps[0].skillId')
    expect(issues).toContain('coatingTurnsLeft cần originalIdentity')
    const fresh = makeBattleState([player()], [enemy()])
    const raw = JSON.parse(JSON.stringify(serializeState(fresh)))
    raw.battle.volatiles.e.wall = { hitsLeft: 1, turnsLeft: 1 }
    const migrated = migrateState({ ...raw, version: 107 }, data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(defined(migrated.battle).volatiles.e).not.toHaveProperty('wall')
  })
})
