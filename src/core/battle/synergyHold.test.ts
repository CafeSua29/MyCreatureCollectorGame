// Synergy và hold của skill (mục "Synergy", "Hold" ở battle.md): power / hiệu ứng thêm theo hệ
// đồng đội trên sân (kể cả Tera), lượt chờ đầu trận / sau khi dùng / khi ra vào sân, mã lỗi
// skillOnHold, AI bỏ qua skill đang chờ, kiểm tra dữ liệu, save.

import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, deserializeState, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import { ActionError, createRng } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeMonster,
  makeRawData,
  makeTeamRawData,
  withFixtureText
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameState,
  Monster,
  RawGameData,
  Skill
} from '../model'
import { chooseAiCommands, suggestBattleCommands } from './ai'
import { suggestTamerCommand } from './tamerSkills'
import { cloneDraft } from './draft'
import { executeSkill } from './executeSkill'
import { holdTurnsLeft } from '../monster'

const base = { elementId: 'water', priority: 0, accuracy: 100, effects: [] }

/** Skill thử: tidal (synergy với đồng đội hệ lửa), boom (hold 1), meteor (hold 2). */
const TEST_SKILLS: Skill[] = [
  {
    ...base,
    id: 'tidal',
    category: 'special',
    power: 50,
    target: 'enemy',
    synergy: {
      partnerElementIds: ['fire'],
      powerBonusPercent: 50,
      effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 1 } }]
    }
  },
  { ...base, id: 'boom', category: 'physical', power: 60, target: 'enemy', hold: 1 },
  { ...base, id: 'meteor', category: 'physical', power: 60, target: 'enemy', hold: 2 }
]

function withTestSkills(raw: RawGameData): RawGameData {
  raw.skills.push(...TEST_SKILLS.map((skill) => ({ ...skill })))
  // Kỹ năng ngự thú sư kiểu Tĩnh Tâm Chú (miễn phí để test luật hiệu ứng).
  raw.tamerSkills.push({
    id: 'calm',
    unlockRealm: 0,
    manaCost: 0,
    cooldown: 0,
    target: 'allyOnField',
    effects: [{ type: 'reduceHold', params: { turns: 1 } }]
  })
  return raw
}

const data = createGameData(withFixtureText(withTestSkills(makeRawData())))

const idleEnemy = (id = 'e'): Monster => makeMonster({ id, skillIds: ['idle'], level: 50 })

const battleOf = (state: GameState): BattleState => defined(state.battle)
const logOf = (state: GameState): BattleEvent[] => battleOf(state).log

function submit(state: GameState, commands: BattleCommand[]): GameState {
  return gameReducer(data, state, { type: 'submitTurn', commands })
}

const skillCommand = (slot: number, skillId: string): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0
})

/** Sát thương đầu tiên lên địch trong log. */
function firstDamage(state: GameState): number {
  const event = logOf(state).find((e) => e.type === 'damage' && e.targetId === 'e')
  if (event?.type !== 'damage') throw new Error('không có sát thương')
  return event.amount.toNumber()
}

describe('synergy', () => {
  /** Quái a dùng tidal, đồng đội b mang `elementIds` (idle). */
  function castWithAlly(ally: Partial<Monster>): GameState {
    const party = [
      makeMonster({ id: 'a', skillIds: ['tidal'] }),
      makeMonster({ id: 'b', skillIds: ['idle'], ...ally })
    ]
    const state = makeBattleState(party, [idleEnemy()])
    return submit(state, [skillCommand(0, 'tidal'), { slot: 1, kind: 'skill', skillId: 'idle' }])
  }

  it('đồng đội đúng hệ: log synergy, power +50%, chạy thêm hiệu ứng', () => {
    const boosted = castWithAlly({ elementIds: ['fire'] })
    const plain = castWithAlly({ elementIds: ['normal'] })
    expect(logOf(boosted)).toContainEqual({
      type: 'synergy',
      monsterId: 'a',
      skillId: 'tidal',
      partnerId: 'b'
    })
    expect(logOf(plain).some((e) => e.type === 'synergy')).toBe(false)
    // Cùng RNG (synergy không tốn RNG): sát thương gấp 1,5 lần, lệch tối đa 1 do làm tròn.
    expect(Math.abs(firstDamage(boosted) - firstDamage(plain) * 1.5)).toBeLessThanOrEqual(1)
    expect(battleOf(boosted).stages.a?.attack).toBe(1)
    expect(battleOf(plain).stages.a?.attack).toBeUndefined()
  })

  it('Tera đổi hệ: tính theo hệ hiện tại của đồng đội', () => {
    const tera = { kind: 'tera' as const, teraElementId: 'fire', originalElementIds: ['normal'] }
    const teraFire = castWithAlly({ elementIds: ['fire'], battleTransform: tera })
    expect(logOf(teraFire).some((e) => e.type === 'synergy')).toBe(true)
    const teraWater = castWithAlly({
      elementIds: ['water'],
      battleTransform: { kind: 'tera', teraElementId: 'water', originalElementIds: ['fire'] }
    })
    expect(logOf(teraWater).some((e) => e.type === 'synergy')).toBe(false)
  })

  it('không có đồng đội trên sân (một mình) thì không có synergy', () => {
    const state = makeBattleState([makeMonster({ id: 'a', skillIds: ['tidal'] })], [idleEnemy()])
    const after = submit(state, [skillCommand(0, 'tidal')])
    expect(logOf(after).some((e) => e.type === 'synergy')).toBe(false)
  })

  it('đồng đội đã gục không tính', () => {
    const ally = makeMonster({ id: 'b', elementIds: ['fire'], skillIds: ['idle'] })
    const party = [
      makeMonster({ id: 'a', skillIds: ['tidal'] }),
      { ...ally, damageTaken: getMaxHp(data, ally) }
    ]
    const state = makeBattleState(party, [idleEnemy()])
    const after = submit(state, [skillCommand(0, 'tidal')])
    expect(logOf(after).some((e) => e.type === 'synergy')).toBe(false)
  })
})

describe('hold', () => {
  const party = (skillIds: string[]): Monster[] => [makeMonster({ id: 'a', skillIds, level: 5 })]

  function expectOnHold(state: GameState, skillId: string, turnsLeft: number): void {
    expectActionError(() => submit(state, [skillCommand(0, skillId)]), 'skillOnHold', {
      monsterId: 'a',
      skillId,
      turnsLeft
    })
  }

  it('đầu trận phải chờ đủ hold lượt (hold 1: lượt 1, hold 2: lượt 1–2)', () => {
    const state = makeBattleState(party(['boom', 'meteor', 'strike']), [idleEnemy()])
    expectOnHold(state, 'boom', 1)
    expectOnHold(state, 'meteor', 2)
    const turn2 = submit(state, [skillCommand(0, 'strike')])
    expect(holdTurnsLeft(battleOf(turn2), turn2.party[0], data.skills.boom)).toBe(0)
    expectOnHold(turn2, 'meteor', 1)
    const turn3 = submit(turn2, [skillCommand(0, 'strike')])
    expect(holdTurnsLeft(battleOf(turn3), turn3.party[0], data.skills.meteor)).toBe(0)
  })

  it('lỗi giữ nguyên state', () => {
    const state = makeBattleState(party(['boom']), [idleEnemy()])
    const before = JSON.stringify(serializeState(state))
    expect(() => submit(state, [skillCommand(0, 'boom')])).toThrow(ActionError)
    expect(JSON.stringify(serializeState(state))).toBe(before)
  })

  it('dùng xong chờ lại hold lượt', () => {
    const state = makeBattleState(party(['boom', 'strike']), [idleEnemy()], { turn: 2 })
    const used = submit(state, [skillCommand(0, 'boom')])
    expect(logOf(used).some((e) => e.type === 'useSkill' && e.skillId === 'boom')).toBe(true)
    expectOnHold(used, 'boom', 1)
    const later = submit(used, [skillCommand(0, 'strike')])
    expect(() => submit(later, [skillCommand(0, 'boom')])).not.toThrow()
  })

  it('rời sân mất bộ đếm: vào lại thì chờ lại từ đầu', () => {
    const team = [
      makeMonster({ id: 'a', skillIds: ['boom', 'strike'], level: 5 }),
      makeMonster({ id: 'c', skillIds: ['strike'], level: 5 })
    ]
    const state = makeBattleState(team, [idleEnemy()], { turn: 3, playerSlots: ['a', null] })
    // Lượt 3: a dùng được boom (đã qua lượt chờ đầu). Đổi c vào, rồi đổi a vào lại.
    const out = submit(state, [{ slot: 0, kind: 'switch', monsterId: 'c' }])
    const back = submit(out, [{ slot: 0, kind: 'switch', monsterId: 'a' }])
    expectOnHold(back, 'boom', 1)
  })

  it('skill đang chờ do trait chọn ngẫu nhiên thì thất bại (log onHold)', () => {
    const state = makeBattleState(party(['boom']), [idleEnemy()])
    const d = cloneDraft(state)
    executeSkill(data, d, { side: 'player', slot: 0, user: d.party[0], skill: data.skills.boom })
    expect(d.battle.log).toContainEqual({
      type: 'skillFailed',
      monsterId: 'a',
      skillId: 'boom',
      reason: 'onHold'
    })
    expect(d.battle.log.some((e) => e.type === 'damage')).toBe(false)
  })

  it('skill do trait / minion (reactive) không bị hold và không bắt đầu chờ', () => {
    const state = makeBattleState(party(['boom']), [idleEnemy()])
    const d = cloneDraft(state)
    const skill = data.skills.boom
    executeSkill(data, d, { side: 'player', slot: 0, user: d.party[0], skill, reactive: true })
    expect(d.battle.log.some((e) => e.type === 'damage')).toBe(true)
    expect(d.battle.volatiles.a.holdReadyTurns).toBeUndefined()
  })

  it('đang Dynamax (chiêu Max) không phải chờ', () => {
    const monster = makeMonster({
      id: 'a',
      skillIds: ['boom'],
      battleTransform: { kind: 'dynamax', originalElementIds: ['grass'], turnsLeft: 3 }
    })
    const state = makeBattleState([monster], [idleEnemy()])
    expect(holdTurnsLeft(battleOf(state), monster, data.skills.boom)).toBe(0)
  })

  it('quái không trên sân: 0; vào sân giữa lượt T thì chờ tính từ lượt T + 1', () => {
    const state = makeBattleState(party(['boom']), [idleEnemy()], { turn: 5 })
    const battle = battleOf(state)
    expect(holdTurnsLeft(battle, makeMonster({ id: 'x' }), data.skills.boom)).toBe(0)
    const entered = { ...battle, volatiles: { a: { firstTurn: 6 } } }
    expect(holdTurnsLeft(entered, state.party[0], data.skills.meteor)).toBe(3)
  })

  it('số lượt cực lớn', () => {
    const state = makeBattleState(party(['boom']), [idleEnemy()], { turn: 1_000_000 })
    const battle = battleOf(state)
    const skill = { ...data.skills.boom, hold: 1_000_000 }
    expect(holdTurnsLeft(battle, state.party[0], skill)).toBe(1)
  })
})

describe('giảm lượt chờ (reduceHold, kiểu Tĩnh Tâm Chú)', () => {
  const calm = (state: GameState, commands: BattleCommand[]): GameState =>
    gameReducer(data, state, {
      type: 'submitTurn',
      commands,
      tamer: { skillId: 'calm', targetId: 'a' }
    })

  it('giảm 1 lượt mọi skill đang chờ (meteor 2 → 1, boom 1 → 0), log tổng lượt giảm', () => {
    const party = [makeMonster({ id: 'a', skillIds: ['boom', 'meteor', 'idle'] })]
    const state = makeBattleState(party, [idleEnemy()])
    const after = calm(state, [{ slot: 0, kind: 'skill', skillId: 'idle' }])
    expect(logOf(after)).toContainEqual({ type: 'holdReduced', monsterId: 'a', turns: 2 })
    // Lượt 2: boom vốn đã dùng được, meteor còn 1 → 0 nhờ giảm.
    const battle = battleOf(after)
    expect(holdTurnsLeft(battle, after.party[0], data.skills.meteor)).toBe(0)
    expect(() => submit(after, [skillCommand(0, 'meteor')])).not.toThrow()
  })

  it('không có skill đang chờ: không log, AI không dùng (điểm 0)', () => {
    const party = [makeMonster({ id: 'a', skillIds: ['strike'] })]
    const state = makeBattleState(party, [idleEnemy()])
    const after = calm(state, [skillCommand(0, 'strike')])
    expect(logOf(after).some((e) => e.type === 'holdReduced')).toBe(false)
    expect(suggestTamerCommand(data, state)).toBeNull()
  })

  it('AI dùng khi có skill đang chờ (điểm = lượt giảm × holdTurnWeight)', () => {
    const party = [makeMonster({ id: 'a', skillIds: ['boom', 'meteor'] })]
    const state = makeBattleState(party, [idleEnemy()])
    expect(suggestTamerCommand(data, state)).toEqual({ skillId: 'calm', targetId: 'a' })
  })

  it('kiểm tra dữ liệu: turns nguyên ≥ 1, không nhắm địch', () => {
    const issuesWith = (effect: object, target: Skill['target'] = 'self'): string[] =>
      dataIssuesAfter(
        (raw) => {
          raw.skills.push({
            ...base,
            id: 'focus',
            category: 'status',
            power: 0,
            target,
            effects: [{ type: 'reduceHold', params: effect }]
          })
        },
        { regenerateText: true }
      )
    expect(issuesWith({ turns: 1 })).toEqual([])
    expect(issuesWith({ turns: 0 }).join('\n')).toMatch(/turns/)
    expect(issuesWith({ turns: 1 }, 'enemy').join('\n')).toMatch(/phe mình/)
  })
})

describe('AI và skill đang chờ', () => {
  it('AI bỏ qua skill đang chờ', () => {
    const enemy = makeMonster({ id: 'e', skillIds: ['boom', 'strike'], level: 50 })
    for (let seed = 1; seed <= 20; seed++) {
      const state = makeBattleState([makeMonster({ id: 'a' })], [enemy])
      const d = cloneDraft({ ...state, rng: createRng(seed) })
      const [command] = chooseAiCommands(data, d, 'enemy')
      expect(command).toMatchObject({ kind: 'skill', skillId: 'strike' })
    }
  })

  it('mọi skill đang chờ: gợi ý phòng thủ (lệnh hợp lệ)', () => {
    const state = makeBattleState([makeMonster({ id: 'a', skillIds: ['boom'] })], [idleEnemy()])
    const commands = suggestBattleCommands(data, state)
    expect(commands).toEqual([{ slot: 0, kind: 'defend' }])
    expect(() => submit(state, commands)).not.toThrow()
  })
})

describe('kiểm tra dữ liệu synergy / hold', () => {
  const issuesWith = (edit: Partial<Skill>): string[] =>
    dataIssuesAfter(
      (raw) => {
        withTestSkills(raw)
        Object.assign(defined(raw.skills.find((s) => s.id === 'tidal')), edit)
      },
      { regenerateText: true }
    )

  it('dữ liệu hợp lệ không lỗi', () => {
    expect(issuesWith({})).toEqual([])
    expect(issuesWith({ hold: 3 })).toEqual([])
  })

  it.each([0, 1.5, -1, '2'])('hold %s báo lỗi', (hold) => {
    expect(issuesWith({ hold: hold as number }).join('\n')).toMatch(/hold/)
  })

  it.each([
    [{ partnerElementIds: [], powerBonusPercent: 10 }, /cần ít nhất một hệ/],
    [{ partnerElementIds: ['ghostly'], powerBonusPercent: 10 }, /hệ không tồn tại/],
    [{ partnerElementIds: ['fire', 'fire'], powerBonusPercent: 10 }, /bị lặp/],
    [{ partnerElementIds: ['fire'] }, /cần powerBonusPercent hoặc effects/],
    [{ partnerElementIds: ['fire'], powerBonusPercent: 0 }, /powerBonusPercent/],
    [{ partnerElementIds: ['fire'], powerBonusPercent: 10, extra: 1 }, /"extra"/],
    [
      { partnerElementIds: ['fire'], effects: [{ type: 'nope', params: {} }] },
      /chưa có trong registry/
    ],
    [
      { partnerElementIds: ['fire'], effects: [{ type: 'switchOut', params: {} }] },
      /không được rút quái dùng về/
    ]
  ])('synergy sai báo lỗi: %j', (synergy, pattern) => {
    expect(issuesWith({ synergy: synergy as Skill['synergy'] }).join('\n')).toMatch(pattern)
  })

  it('powerBonusPercent trên skill status báo lỗi', () => {
    const issues = issuesWith({ category: 'status', power: 0 })
    expect(issues.join('\n')).toMatch(/chỉ dùng cho skill gây sát thương/)
  })

  it('chiêu Max / hợp kích kỹ không có synergy / hold', () => {
    const maxIssues = dataIssuesAfter((raw) => {
      Object.assign(defined(raw.skills.find((s) => s.maxMove === 'max')), { hold: 1 })
    })
    expect(maxIssues.join('\n')).toMatch(/chiêu Max \/ Z-Move \/ hợp kích kỹ/)
    const raw = makeTeamRawData()
    Object.assign(raw.comboSkills[0], { hold: 1 })
    const comboIssues: string[] = []
    try {
      createGameData(raw)
    } catch (error) {
      comboIssues.push(...(error as { issues: string[] }).issues)
    }
    expect(comboIssues.join('\n')).toMatch(/chiêu Max \/ Z-Move \/ hợp kích kỹ/)
  })
})

describe('save', () => {
  const withReady = (holdReadyTurns: unknown): GameState => {
    const state = makeBattleState([makeMonster({ id: 'a', skillIds: ['boom'] })], [idleEnemy()])
    const battle = battleOf(state)
    return {
      ...state,
      battle: {
        ...battle,
        volatiles: { ...battle.volatiles, a: { firstTurn: 1, holdReadyTurns } }
      }
    } as GameState
  }

  it('holdReadyTurns hợp lệ / sai', () => {
    expect(validateGameState(data, withReady({ boom: 3 }))).toEqual([])
    expect(validateGameState(data, withReady({ strike: 3 })).join('\n')).toMatch(/không có hold/)
    expect(validateGameState(data, withReady({ boom: 0 })).join('\n')).toMatch(/holdReadyTurns/)
    expect(validateGameState(data, withReady([])).join('\n')).toMatch(/holdReadyTurns/)
  })

  it('migrate v33 → hiện tại giữ nguyên trạng thái tạm', () => {
    const state = withReady({ boom: 3 })
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    raw.version = 33
    const migrated = migrateState(deserializeState(raw), data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(battleOf(migrated).volatiles).toEqual(battleOf(state).volatiles)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
