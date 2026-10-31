// Hiệu ứng toàn sân đặc biệt (lớp room, mục "Môi trường" ở battle-environment.md): đặt / tắt / hết hạn, nhiều
// room cùng lúc, Trick Room (thứ tự lượt, priority vẫn thắng, số cực lớn), Wonder Room (đổi thủ,
// bậc theo tên chỉ số), Gravity (đứng trên mặt đất, accuracy, gỡ miễn nhiễm), AI, kiểm tra dữ
// liệu và save.

import { describe, expect, it } from 'vitest'
import { validateGameState, gameReducer } from '../game'
import { computeStats, isGrounded } from '../monster'
import { SKILL_EFFECTS, type SkillEffectAiContext } from '../registries'
import { BIG_ZERO } from '../shared'
import {
  dataIssues,
  defined,
  makeArena,
  makeBattleState,
  makeField,
  makeMonster,
  makeRoomData,
  makeRoomRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  ActiveRoom,
  BattleCommand,
  BattleEvent,
  BattleField,
  GameState,
  Monster,
  RawGameData
} from '../model'
import { expectedDamage } from './damage'
import { skillAccuracy } from './environment'

// Quái mẫu: HP 50, mọi chỉ số 50 (gen 10), hệ cỏ, đứng trên mặt đất.
const data = makeRoomData()

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const skillCommand = (skillId: string, slot = 0, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

const idle = (slot = 0): BattleCommand => skillCommand('idle', slot)

const monster = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    skillIds: ['idle', 'trickRoomMove', 'gravityMove', 'shortGravity'],
    ...overrides
  })

/** Quái địch chỉ biết một skill nên AI luôn chọn skill đó. */
const foe = (id: string, skillId = 'idle', overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, elementIds: ['normal'], skillIds: [skillId], ...overrides })

const room = (id: string, turnsLeft = 5): ActiveRoom => ({ id, turnsLeft })

const battle = (
  party: Monster[],
  enemies: Monster[],
  field: BattleField = makeField()
): GameState => makeBattleState(party, enemies, { field })

const fieldOf = (state: GameState): BattleField => defined(state.battle, 'trận').field

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

/** Thứ tự quái dùng skill trong lượt. */
const skillOrder = (state: GameState): string[] =>
  eventsOf(state, 'useSkill').map((event) => event.monsterId)

describe('setRoom: đặt, tắt, hết hạn', () => {
  it('đặt theo duration, giảm cuối lượt; log quái đặt và số lượt', () => {
    const after = turn(battle([monster('a')], [foe('e1')]), skillCommand('trickRoomMove'))
    expect(fieldOf(after).rooms).toEqual([room('trickRoom', 4)])
    expect(eventsOf(after, 'roomSet')).toEqual([
      { type: 'roomSet', fieldId: 'trickRoom', turnsLeft: 5, monsterId: 'a' }
    ])
  })

  it('turns của hiệu ứng thay duration', () => {
    const after = turn(battle([monster('a')], [foe('e1')]), skillCommand('shortGravity'))
    expect(fieldOf(after).rooms).toEqual([room('gravity', 1)])
  })

  it('đặt lại room đang có thì tắt room đó, room khác giữ nguyên', () => {
    const field = makeField({ rooms: [room('wonderRoom', 3), room('trickRoom', 3)] })
    const after = turn(battle([monster('a')], [foe('e1')], field), skillCommand('trickRoomMove'))
    expect(fieldOf(after).rooms).toEqual([room('wonderRoom', 2)])
    expect(eventsOf(after, 'roomRemoved')).toEqual([
      { type: 'roomRemoved', fieldId: 'trickRoom', monsterId: 'a' }
    ])
    expect(eventsOf(after, 'roomSet')).toEqual([])
  })

  it('nhiều room cùng lúc theo thứ tự đặt', () => {
    let state = battle([monster('a')], [foe('e1')])
    state = turn(state, skillCommand('gravityMove'))
    state = turn(state, skillCommand('trickRoomMove'))
    expect(fieldOf(state).rooms).toEqual([room('gravity', 3), room('trickRoom', 4)])
  })

  it('hết hạn: mất khỏi sân, log roomEnded', () => {
    const field = makeField({ rooms: [room('gravity', 2), room('trickRoom', 1)] })
    const after = turn(battle([monster('a')], [foe('e1')], field), idle())
    expect(fieldOf(after).rooms).toEqual([room('gravity', 1)])
    expect(eventsOf(after, 'roomEnded')).toEqual([{ type: 'roomEnded', fieldId: 'trickRoom' }])
  })
})

describe('Trick Room: đảo thứ tự tốc độ', () => {
  // Quái địch tốc độ 70 (gen 20) nhanh hơn quái ta (50).
  const fast = { genes: { ...uniformStats(10), speed: 20 } }

  it('quái chậm đi trước trong cùng mức priority', () => {
    const order = (field: BattleField): string[] =>
      skillOrder(turn(battle([monster('a')], [foe('e1', 'idle', fast)], field), idle()))
    expect(order(makeField())).toEqual(['e1', 'a'])
    expect(order(makeField({ rooms: [room('trickRoom')] }))).toEqual(['a', 'e1'])
  })

  it('priority vẫn thắng tốc độ', () => {
    const field = makeField({ rooms: [room('trickRoom')] })
    const state = battle([monster('a')], [foe('e1', 'quick', fast)], field)
    expect(skillOrder(turn(state, idle()))).toEqual(['e1', 'a'])
  })

  it('chỉ có tác dụng từ lượt sau lượt đặt (thứ tự tính lúc đầu lượt)', () => {
    const state = battle([monster('a')], [foe('e1', 'idle', fast)])
    const first = turn(state, skillCommand('trickRoomMove'))
    expect(skillOrder(first)).toEqual(['e1', 'a'])
    expect(skillOrder(turn(first, idle())).slice(-2)).toEqual(['a', 'e1'])
  })

  it('số cực lớn: so tốc độ Decimal đúng', () => {
    const huge = { genes: { ...uniformStats(10), speed: '1e300' } }
    const field = makeField({ rooms: [room('trickRoom')] })
    const state = battle([monster('a', huge)], [foe('e1', 'idle', fast)], field)
    expect(skillOrder(turn(state, idle()))).toEqual(['e1', 'a'])
  })
})

describe('Wonder Room: đổi thủ ↔ thủ đặc biệt', () => {
  // Thủ 70 (gen 20), thủ đặc biệt 50.
  const tanky = makeMonster({ id: 't', genes: { ...uniformStats(10), defense: 20 } })
  const field = makeField({ rooms: [room('wonderRoom')] })

  it('đổi giá trị ở bước môi trường; bậc trận vẫn theo tên chỉ số', () => {
    const plain = computeStats(data, tanky, { field: makeField() })
    expect([plain.final.defense.toNumber(), plain.final.spDefense.toNumber()]).toEqual([70, 50])
    const swapped = computeStats(data, tanky, { field, stages: { defense: 2 } })
    expect([swapped.withField.defense.toNumber(), swapped.withField.spDefense.toNumber()]).toEqual([
      50, 70
    ])
    // +2 bậc thủ nhân giá trị mới của thủ (50 × 2).
    expect([swapped.final.defense.toNumber(), swapped.final.spDefense.toNumber()]).toEqual([
      100, 70
    ])
  })

  it('đòn vật lý tính theo giá trị thủ đặc biệt', () => {
    const attacker = makeMonster({ id: 'a' })
    const mirrored = makeMonster({ id: 't', genes: { ...uniformStats(10), spDefense: 20 } })
    const damage = (defender: Monster, arenaField: BattleField): number =>
      expectedDamage({
        data,
        attacker,
        defender,
        skill: data.skills.strike,
        spread: false,
        arena: makeArena(arenaField)
      }).toNumber()
    expect(damage(tanky, field)).toBeCloseTo(damage(mirrored, makeField()))
    expect(damage(tanky, field)).toBeGreaterThan(damage(tanky, makeField()))
  })

  it('ngoài trận không đổi', () => {
    const stats = computeStats(data, tanky)
    expect([stats.final.defense.toNumber(), stats.final.spDefense.toNumber()]).toEqual([70, 50])
  })
})

describe('Gravity', () => {
  const field = makeField({ rooms: [room('gravity')] })
  const flyer = makeMonster({ id: 'f', elementIds: ['flying'] })
  const floater = makeMonster({ id: 'g', traits: [{ id: 'floater', level: 1 }] })
  const hovering = makeMonster({ id: 'h', traits: [{ id: 'hover', level: 1 }] })

  it('mọi quái đứng trên mặt đất (hệ bay, trait không chạm đất)', () => {
    expect([isGrounded(data, flyer), isGrounded(data, hovering)]).toEqual([false, false])
    expect([isGrounded(data, flyer, field), isGrounded(data, hovering, field)]).toEqual([
      true,
      true
    ])
  })

  it('địa hình tác dụng lên quái hệ bay (địa hình cỏ hồi máu)', () => {
    const hurt = makeMonster({
      id: 'a',
      elementIds: ['flying'],
      skillIds: ['idle'],
      damageTaken: 20
    })
    const healed = (rooms: ActiveRoom[]): number => {
      const state = battle([hurt], [foe('e1')], makeField({ terrain: 'grassy', rooms }))
      return defined(turn(state, idle()).party[0]).damageTaken.toNumber()
    }
    expect(healed([])).toBe(20)
    expect(healed([room('gravity')])).toBe(15)
  })

  it('accuracy × 5/3, tối đa 100', () => {
    expect(skillAccuracy(data, field, data.skills.tide)).toBeCloseTo(83.33, 1)
    expect(skillAccuracy(data, field, data.skills.strike)).toBe(100)
  })

  it('gỡ miễn nhiễm: hệ số 0 lên hệ bay thành 1, trait miễn nhiễm bỏ qua', () => {
    const attacker = makeMonster({ id: 'a' })
    const damage = (defender: Monster, skillId: string, arenaField: BattleField): number =>
      expectedDamage({
        data,
        attacker,
        defender,
        skill: data.skills[skillId],
        spread: false,
        arena: makeArena(arenaField)
      }).toNumber()
    const plainTarget = makeMonster({ id: 'p', elementIds: ['normal'] })
    expect(damage(flyer, 'tide', makeField())).toBe(0)
    expect(damage(flyer, 'tide', field)).toBeCloseTo(damage(plainTarget, 'tide', field))
    expect(damage(floater, 'strike', makeField())).toBe(0)
    expect(damage(floater, 'strike', field)).toBeCloseTo(damage(makeMonster(), 'strike', field))
  })

  it('cấm skill (banSkills): dùng thì bị chặn, hết room dùng lại được', () => {
    const user = monster('a', { skillIds: ['tide'] })
    const blocked = turn(battle([user], [foe('e1')], field), skillCommand('tide'))
    expect(eventsOf(blocked, 'skillBlocked')).toEqual([
      { type: 'skillBlocked', monsterId: 'a', skillId: 'tide' }
    ])
    const free = turn(battle([user], [foe('e1')]), skillCommand('tide'))
    expect(eventsOf(free, 'skillBlocked')).toEqual([])
  })

  it('hệ không nằm trong danh sách vẫn bị miễn nhiễm', () => {
    const ghost = makeMonster({ id: 'x', elementIds: ['ghost'] })
    const value = expectedDamage({
      data,
      attacker: makeMonster({ id: 'a' }),
      defender: ghost,
      skill: data.skills.strike,
      spread: false,
      arena: makeArena(field)
    })
    // Thường → ma × 0 theo bảng hệ: ma không phải hệ bay nên Gravity không gỡ.
    expect(value.toNumber()).toBe(0)
  })
})

describe('AI: setRoom', () => {
  const user = makeMonster({ id: 'u' })
  const context = (overrides: Partial<SkillEffectAiContext> = {}): SkillEffectAiContext => ({
    data,
    user,
    target: user,
    targetIsAlly: true,
    stages: {},
    expectedDamage: BIG_ZERO,
    field: makeField(),
    side: 'player',
    allies: [user],
    foes: [makeMonster({ id: 'f' })],
    allyReserves: [],
    foeReserves: [],
    ...overrides
  })
  const value = (fieldId: string, overrides: Partial<SkillEffectAiContext> = {}): number =>
    SKILL_EFFECTS.setRoom.aiValue({ fieldId }, context(overrides))
  const fastFoe = makeMonster({ id: 'f', genes: { ...uniformStats(10), speed: 20 } })

  it('Trick Room: lợi khi phe mình chậm hơn; đang có thì dùng lại là tắt', () => {
    expect(value('trickRoom', { foes: [fastFoe] })).toBeCloseTo(0.3)
    expect(value('trickRoom', { allies: [fastFoe], foes: [user] })).toBeCloseTo(-0.3)
    const active = makeField({ rooms: [room('trickRoom')] })
    expect(value('trickRoom', { foes: [fastFoe], field: active })).toBeCloseTo(-0.3)
    expect(value('trickRoom')).toBe(0)
  })

  it('Wonder Room: lợi khi thủ đặc biệt cao hơn mà địch đánh vật lý', () => {
    const allies = [makeMonster({ id: 'u', genes: { ...uniformStats(10), spDefense: 20 } })]
    expect(value('wonderRoom', { allies })).toBeCloseTo(0.3)
    const specialFoe = makeMonster({ id: 'f', skillIds: ['tide'] })
    expect(value('wonderRoom', { allies, foes: [specialFoe] })).toBeCloseTo(-0.3)
  })

  it('Gravity: lợi khi đánh trúng được quái bay của địch', () => {
    const waterUser = makeMonster({ id: 'u', skillIds: ['tide'] })
    const flyingFoe = makeMonster({ id: 'f', elementIds: ['flying'] })
    // Gỡ miễn nhiễm +1; accuracy: cả hai phe đều có skill nhắm địch nên triệt tiêu.
    expect(value('gravity', { allies: [waterUser], foes: [flyingFoe] })).toBeCloseTo(0.3)
    expect(value('gravity', { allies: [flyingFoe], foes: [waterUser] })).toBeCloseTo(-0.3)
  })
})

describe('kiểm tra dữ liệu room', () => {
  const issuesAfter = (edit: (raw: RawGameData) => void): string => {
    const raw = makeRoomRawData()
    edit(raw)
    return dataIssues(withFixtureText(raw)).join('\n')
  }

  it('dữ liệu mẫu hợp lệ', () => {
    expect(issuesAfter(() => undefined)).toBe('')
  })

  it('hook room chỉ dùng ở lớp room; accuracyMultiplier dùng được ở room', () => {
    const issues = issuesAfter((raw) => {
      raw.fieldEffects.push(
        { id: 'oddWeather', layer: 'weather', hooks: [{ type: 'reverseSpeedOrder', params: {} }] },
        {
          id: 'oddRoom',
          layer: 'room',
          duration: 3,
          hooks: [{ type: 'damageTakenMultiplier', params: {} }]
        }
      )
    })
    expect(issues).toMatch(
      /"oddWeather": hooks\[0\] "reverseSpeedOrder" không dùng được ở lớp weather/
    )
    expect(issues).toMatch(
      /"oddRoom": hooks\[0\] "damageTakenMultiplier" không dùng được ở lớp room/
    )
    expect(issues).not.toMatch(/"gravity"/)
  })

  it('params sai (kể cả Magic Room có params)', () => {
    const issues = issuesAfter((raw) => {
      raw.fieldEffects.push(
        {
          id: 'badRoom',
          layer: 'room',
          duration: 5,
          hooks: [
            { type: 'swapDefenses', params: { extra: 1 } },
            { type: 'forceGrounded', params: { removesImmunityFromElementIds: ['lava'] } },
            { type: 'banSkills', params: { skillIds: ['nope'] } }
          ]
        },
        {
          id: 'magicRoom',
          layer: 'room',
          duration: 5,
          hooks: [{ type: 'disableHeldItems', params: { extra: 1 } }]
        }
      )
    })
    expect(issues).toMatch(/"badRoom".*swapDefenses.*hook này không có params/)
    expect(issues).toMatch(/"badRoom".*removesImmunityFromElementIds: hệ không tồn tại "lava"/)
    expect(issues).toMatch(/"magicRoom".*disableHeldItems.*hook này không có params/)
    expect(issues).toMatch(/"badRoom".*skillIds: "nope"/)
  })

  it('setRoom: môi trường lớp room, turns nguyên ≥ 1, thiếu duration cần turns', () => {
    const issues = issuesAfter((raw) => {
      raw.fieldEffects.push({ id: 'endless', layer: 'room', hooks: [] })
      const bad = (id: string, params: unknown): number =>
        raw.skills.push({
          id,
          elementId: 'normal',
          category: 'status',
          power: 0,
          accuracy: 100,
          priority: 0,
          target: 'self',
          effects: [{ type: 'setRoom', params }]
        })
      bad('roomRain', { fieldId: 'rain' })
      bad('roomLava', { fieldId: 'lava' })
      bad('roomZero', { fieldId: 'trickRoom', turns: 0 })
      bad('roomEndless', { fieldId: 'endless' })
    })
    expect(issues).toMatch(/"roomRain".*"rain" không thuộc lớp room/)
    expect(issues).toMatch(/"roomLava".*môi trường không tồn tại "lava"/)
    expect(issues).toMatch(/"roomZero".*turns phải là số nguyên/)
    expect(issues).toMatch(/"roomEndless".*cần turns vì môi trường "endless" không có duration/)
  })
})

describe('kiểm tra save: battle.field.rooms', () => {
  const check = (rooms: unknown): string => {
    const state = battle([monster('a')], [foe('e1')])
    const current = defined(state.battle, 'trận')
    // Ép kiểu vì thử dữ liệu sai từ file.
    const edited = {
      ...state,
      battle: { ...current, field: { ...current.field, rooms } }
    } as unknown as GameState
    return validateGameState(data, edited).join('\n')
  }

  it('hợp lệ: room tồn tại, còn số lượt nguyên ≥ 1', () => {
    expect(check([room('trickRoom', 5), room('gravity', 1)])).toBe('')
  })

  it('không phải danh sách, id lạ, sai lớp, lặp, turnsLeft sai', () => {
    expect(check(undefined)).toMatch(/battle\.field\.rooms phải là danh sách/)
    const text = check([
      room('lava'),
      room('rain'),
      room('trickRoom'),
      room('trickRoom', 0),
      { id: 'gravity', turnsLeft: null }
    ])
    expect(text).toMatch(/rooms\[0\]: môi trường không tồn tại "lava"/)
    expect(text).toMatch(/rooms\[1\]: "rain" không thuộc lớp room/)
    expect(text).toMatch(/battle\.field\.rooms: "trickRoom" bị lặp/)
    expect(text).toMatch(/rooms\[3\]\.turnsLeft phải là số nguyên/)
    expect(text).toMatch(/rooms\[4\]\.turnsLeft phải là số nguyên/)
  })
})
