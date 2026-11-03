// Thu phục (docs/rules/recruit.md): tỉ lệ xin theo, nhận / từ chối, giới hạn khế ước, boss quy
// phục, Thị Uy (chỉ lượt đầu, thành / bại), mồi dụ (đếm trận, khẩu vị), kiểm tra save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, validateGameState } from '../game'
import { createGameData } from '../gameData'
import { cloneData, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameAction,
  GameData,
  GameState,
  Monster,
  RecruitConfig
} from '../model'
import { intimidateChance, isRecruitBattle, recruitChance } from './recruit'
import { suggestTamerCommand } from './tamerSkills'

/**
 * Dữ liệu fixture có thu phục (weakling catchRate 100): mồi thường (+50%, 2 trận) và mồi khẩu vị race neutral (+50%), Thị
 * Uy mở từ cảnh giới 0. `recruit`: ghi đè số của config.recruit (fixture mặc định tỉ lệ 0).
 */
function recruitData(recruit: Partial<RecruitConfig> = {}): GameData {
  const raw = makeRawData()
  raw.config.recruit = { ...raw.config.recruit, ...recruit }
  // weakling catchRate tối đa để baseChance 100 là chắc chắn xin theo.
  raw.species = raw.species.map((species) =>
    species.id === 'weakling' && species.kind === 'normal'
      ? { ...species, catchRate: 100 }
      : species
  )
  raw.items.push(
    { id: 'lure', category: 'bait', price: 10, recruitPercent: 50, battles: 2 },
    {
      id: 'neutralLure',
      category: 'bait',
      price: 10,
      recruitPercent: 50,
      battles: 2,
      favoriteRaceIds: ['neutral']
    }
  )
  raw.tamerSkills.push({
    id: 'intimidate',
    unlockRealm: 0,
    manaCost: 30,
    cooldown: 0,
    usesPerBattle: 1,
    target: 'wildFoe'
  })
  return createGameData(withFixtureText(raw))
}

const always = recruitData({ baseChance: 100, bossChance: 100 })

const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })

/** Quái hoang còn 1 máu: một đòn strike là gục. */
const weak = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], damageTaken: toBig(49), ...overrides })

const strike = (slot: number, target: number): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId: 'strike',
  target
})
const idle = (slot: number): BattleCommand => ({ slot, kind: 'skill', skillId: 'idle' })

const act = (data: GameData, state: GameState, action: GameAction): GameState =>
  gameReducer(data, state, action)

const turn = (data: GameData, state: GameState, ...commands: BattleCommand[]): GameState =>
  act(data, state, { type: 'submitTurn', commands })

/** Thắng ngay lượt đầu: hai quái ta hạ hai quái hoang còn 1 máu. */
function winBattle(data: GameData, state: GameState): GameState {
  return turn(data, state, strike(0, 0), strike(1, 1))
}

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const twoOnTwo = (overrides: Partial<BattleState> = {}): GameState =>
  makeBattleState([ally('a'), ally('b')], [weak('e1'), weak('e2')], overrides)

describe('recruitChance', () => {
  const data = recruitData({ baseChance: 3, bossChance: 0.5 })
  const state = makeGameState({ seed: 1, party: [ally('a')] })

  it('quái thường: baseChance × catchRate / 100 × rankFalloff^bậc phẩm cấp loài', () => {
    // weakling: catchRate 100, bậc G (thứ hạng 0); strongling: catchRate 20, bậc E (thứ hạng 2).
    const weakling = makeMonster({ id: 'w' })
    const strongling = makeMonster({
      id: 's',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling'
    })
    expect(recruitChance(data, state, { enemy: weakling, isBoss: false })).toBeCloseTo(3)
    expect(recruitChance(data, state, { enemy: strongling, isBoss: false })).toBeCloseTo(
      ((3 * 20) / 100) * 0.85 ** 2
    )
  })

  it('boss: bossChance, không nhân catchRate / phẩm cấp', () => {
    const boss = makeMonster({ id: 'b', speciesId: 'strongling', baseSpeciesId: 'strongling' })
    expect(recruitChance(data, state, { enemy: boss, isBoss: true })).toBeCloseTo(0.5)
  })

  it('mồi dụ: + % thu phục; đúng khẩu vị thì × baitFavoriteMultiplier (2)', () => {
    const monster = makeMonster({ id: 'w' })
    const plain = { ...state, recruit: { bait: { itemId: 'lure', battlesLeft: 1 } } }
    const favorite = { ...state, recruit: { bait: { itemId: 'neutralLure', battlesLeft: 1 } } }
    const base = 3
    expect(recruitChance(data, plain, { enemy: monster, isBoss: false })).toBeCloseTo(base * 1.5)
    expect(recruitChance(data, favorite, { enemy: monster, isBoss: false })).toBeCloseTo(base * 2)
    // Quái khác race: mồi khẩu vị chỉ + 50%.
    const brute = makeMonster({ id: 'x', raceId: 'brute' })
    expect(recruitChance(data, favorite, { enemy: brute, isBoss: false })).toBeCloseTo(base * 1.5)
  })

  it('không theo giới hạn khế ước (level cao vẫn xin theo); kẹp tối đa 100 (số cực lớn)', () => {
    const tooHigh = makeMonster({ id: 'h', level: 10_000 })
    expect(recruitChance(always, state, { enemy: tooHigh, isBoss: false })).toBe(100)
    const huge = recruitData({ baseChance: 100, rankFalloff: 1 })
    const lured = { ...state, recruit: { bait: { itemId: 'lure', battlesLeft: 1 } } }
    expect(recruitChance(huge, lured, { enemy: makeMonster(), isBoss: true })).toBe(0)
    expect(recruitChance(always, lured, { enemy: makeMonster(), isBoss: false })).toBe(100)
    expect(recruitChance(always, lured, { enemy: makeMonster(), isBoss: true })).toBe(100)
  })

  it('isRecruitBattle: trận NPC / bí cảnh / event / độ kiếp không thu phục', () => {
    const battle = battleOf(twoOnTwo())
    expect(isRecruitBattle(battle)).toBe(true)
    expect(isRecruitBattle({ ...battle, tribulation: { monsterId: 'a', tier: 1 } })).toBe(false)
    expect(
      isRecruitBattle({ ...battle, special: { kind: 'event', eventId: 'x' } } as BattleState)
    ).toBe(false)
  })
})

describe('xin theo sau trận thắng', () => {
  it('trúng: quái bị hạ xin theo, nhận thì vào đội với HP đầy, thân mật 70, lý lịch recruit', () => {
    const won = winBattle(always, twoOnTwo())
    const battle = battleOf(won)
    expect(battle.outcome).toBe('won')
    const offerId = defined(battle.recruitOfferId, 'quái xin theo')
    expect(eventsOf(won, 'recruitOffered')).toEqual([
      { type: 'recruitOffered', monsterId: offerId, method: 'afterBattle' }
    ])
    expect(validateGameState(always, won)).toEqual([])
    const accepted = act(always, won, { type: 'acceptRecruit' })
    const recruited = defined(
      accepted.party.find((m) => m.id === offerId),
      'quái thu phục'
    )
    expect(recruited.damageTaken.toNumber()).toBe(0)
    expect(recruited.statuses).toEqual([])
    expect(recruited.affinity).toBe(70)
    expect(recruited.contractRealm).toBeNull() // khế ước là bước riêng (tamer.md)
    expect(recruited.history).toMatchObject({
      origin: { kind: 'recruit', method: 'afterBattle' },
      metFloor: 1,
      metLevel: 1
    })
    expect(battleOf(accepted).enemies.some((m) => m.id === offerId)).toBe(false)
    expect(battleOf(accepted).recruitOfferId).toBeNull()
    expect(eventsOf(accepted, 'recruited')).toEqual([
      { type: 'recruited', monsterId: offerId, method: 'afterBattle', destination: 'party' }
    ])
    expect(validateGameState(always, accepted)).toEqual([])
    const left = act(always, accepted, { type: 'leaveBattle' })
    expect(left.party.map((m) => m.id)).toContain(offerId)
  })

  it('đội đầy thì vào kho', () => {
    const party = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ally(id))
    const state = makeBattleState(party, [weak('e1'), weak('e2')])
    const accepted = act(always, winBattle(always, state), { type: 'acceptRecruit' })
    expect(accepted.party).toHaveLength(6)
    expect(accepted.storage).toHaveLength(1)
  })

  it('từ chối / rời trận chưa chọn: không có quái mới; nhận lại báo lỗi, state giữ nguyên', () => {
    const won = winBattle(always, twoOnTwo())
    const declined = act(always, won, { type: 'declineRecruit' })
    expect(battleOf(declined).recruitOfferId).toBeNull()
    expectActionError(() => act(always, declined, { type: 'acceptRecruit' }), 'noRecruitOffer')
    expectActionError(() => act(always, declined, { type: 'declineRecruit' }), 'noRecruitOffer')
    const left = act(always, won, { type: 'leaveBattle' })
    expect(left.party.map((m) => m.id)).toEqual(['a', 'b'])
    // Chưa kết thúc trận / không có trận.
    expectActionError(() => act(always, twoOnTwo(), { type: 'acceptRecruit' }), 'wrongBattlePhase')
    expectActionError(() => act(always, left, { type: 'acceptRecruit' }), 'noBattle')
  })

  it('tỉ lệ 0 (fixture): không xin theo, không tốn RNG; level cao vẫn xin theo được', () => {
    const none = recruitData()
    const base = winBattle(none, twoOnTwo())
    expect(battleOf(base).recruitOfferId).toBeNull()
    const over = makeBattleState(
      [ally('a', { level: 200 }), ally('b', { level: 200 })],
      [weak('e1', { level: 101, damageTaken: toBig(10_000) }), weak('e2', { level: 101 })]
    )
    const capped = recruitData({ baseChance: 100 })
    const wonOver = turn(capped, over, strike(0, 0), strike(1, 1))
    expect(battleOf(wonOver).outcome).toBe('won')
    expect(battleOf(wonOver).recruitOfferId).not.toBeNull()
  })

  it('boss quy phục: method bossSubmit, giữ bossMultiplier và nhận trait boss', () => {
    const boss = weak('boss', { bossMultiplier: 3, damageTaken: toBig(149) })
    const state = makeBattleState([ally('a', { level: 50 })], [boss], { isBoss: true })
    const won = turn(always, state, strike(0, 0))
    expect(eventsOf(won, 'recruitOffered')).toEqual([
      { type: 'recruitOffered', monsterId: 'boss', method: 'bossSubmit' }
    ])
    const accepted = act(always, won, { type: 'acceptRecruit' })
    const recruited = defined(
      accepted.party.find((m) => m.id === 'boss'),
      'boss'
    )
    expect(recruited.bossMultiplier).toBe(3)
    expect(recruited.traits.some((t) => t.id === always.config.boss.traitId)).toBe(true)
    expect(recruited.history?.origin).toEqual({ kind: 'recruit', method: 'bossSubmit' })
  })

  it('cùng state và action cho cùng kết quả', () => {
    const data = recruitData({ baseChance: 50 })
    expect(winBattle(data, twoOnTwo())).toEqual(winBattle(data, twoOnTwo()))
  })
})

describe('Thị Uy', () => {
  const sure = recruitData({
    intimidate: { slope: 1, offset: 0, maxChance: 1, failStages: { attack: 1, spAttack: 1 } }
  })
  const never = recruitData({
    intimidate: { slope: 0, offset: 0, maxChance: 0, failStages: { attack: 1, spAttack: 1 } }
  })
  const intimidate = (targetId?: string): GameAction => ({
    type: 'submitTurn',
    commands: [idle(0), idle(1)],
    tamer: { skillId: 'intimidate', ...(targetId === undefined ? {} : { targetId }) }
  })
  const fresh = (): GameState =>
    makeBattleState([ally('a'), ally('b')], [makeMonster({ id: 'e1' }), makeMonster({ id: 'e2' })])

  it('tỉ lệ = kẹp(0,5 × tổng chỉ số quái ta / mọi quái hoang trên sân − 0,25, 0, 0,8)', () => {
    // Hai quái ta giống hệt hai quái hoang: tỉ lệ chỉ số 1 → 0,25; còn một quái hoang: 2 → 0,75.
    expect(intimidateChance(always, fresh(), 'e1')).toBeCloseTo(0.25)
    const oneFoe = makeBattleState([ally('a'), ally('b')], [makeMonster({ id: 'e1' })])
    expect(intimidateChance(always, oneFoe, 'e1')).toBeCloseTo(0.75)
    const strong = makeBattleState(
      [ally('a', { level: 50 }), ally('b', { level: 50 })],
      [makeMonster({ id: 'e1' })]
    )
    expect(intimidateChance(always, strong, 'e1')).toBe(0.8)
    // Một quái ta yếu hơn quái hoang: tỉ lệ < 0,5 → 0.
    const weakSide = makeBattleState([ally('a')], [makeMonster({ id: 'e1', level: 30 })])
    expect(intimidateChance(always, weakSide, 'e1')).toBe(0)
    // Lượt sau / mục tiêu lạ: 0.
    expect(
      intimidateChance(always, { ...fresh(), battle: { ...battleOf(fresh()), turn: 2 } }, 'e1')
    ).toBe(0)
    expect(intimidateChance(always, fresh(), 'nope')).toBe(0)
  })

  it('thành công: quái hoang theo về ngay, con còn lại tiếp tục; hết trận vào đội, lý lịch intimidate', () => {
    const start = makeBattleState([ally('a'), ally('b')], [makeMonster({ id: 'e1' }), weak('e2')])
    const after = act(sure, start, intimidate('e1'))
    const battle = battleOf(after)
    expect(eventsOf(after, 'intimidate')).toEqual([
      { type: 'intimidate', targetId: 'e1', chance: 1, success: true }
    ])
    expect(battle.enemySlots).toEqual([null, 'e2'])
    expect(battle.captured.map((m) => m.id)).toEqual(['e1'])
    expect(battle.phase).toBe('chooseActions')
    expect(defined(battle.tamers.player, 'ngự thú sư').mana).toBe(20)
    expect(validateGameState(sure, after)).toEqual([])
    const won = turn(sure, after, strike(0, 1), idle(1))
    expect(battleOf(won).outcome).toBe('won')
    const recruited = defined(
      won.party.find((m) => m.id === 'e1'),
      'quái thu phục'
    )
    expect(recruited.history?.origin).toEqual({ kind: 'recruit', method: 'intimidate' })
    expect(recruited.affinity).toBe(70)
  })

  it('thất bại: quái hoang +1 công / đặc công, vẫn tốn linh lực', () => {
    const after = act(never, fresh(), intimidate('e1'))
    expect(eventsOf(after, 'intimidate')[0]).toMatchObject({ success: false, chance: 0 })
    expect(battleOf(after).stages.e1).toEqual({ attack: 1, spAttack: 1 })
    expect(defined(battleOf(after).tamers.player, 'ngự thú sư').mana).toBe(20)
  })

  it('báo lỗi: lượt sau, trận boss, mục tiêu sai; state giữ nguyên; level cao vẫn Thị Uy được', () => {
    const state = fresh()
    const later = { ...state, battle: { ...battleOf(state), turn: 2 } }
    expectActionError(() => act(sure, later, intimidate('e1')), 'tamerSkillUnavailable')
    const boss = { ...state, battle: { ...battleOf(state), isBoss: true } }
    expectActionError(() => act(sure, boss, intimidate('e1')), 'tamerSkillUnavailable')
    expectActionError(() => act(sure, state, intimidate()), 'malformedAction')
    expectActionError(() => act(sure, state, intimidate('a')), 'malformedAction')
    const high = makeBattleState([ally('a'), ally('b')], [makeMonster({ id: 'e1', level: 101 })])
    expect(() => act(sure, high, intimidate('e1'))).not.toThrow()
  })

  it('Nuzlocke: Thị Uy chỉ ở lượt gặp của khu, thành công thì hết lượt gặp; xin theo cũng vậy', () => {
    const nuzlocke = (state: GameState, encounter: boolean): GameState => ({
      ...state,
      options: { ...state.options, nuzlocke: { dupesClause: false }, permadeathEnabled: true },
      battle: { ...battleOf(state), nuzlockeEncounter: encounter }
    })
    expectActionError(
      () => act(sure, nuzlocke(fresh(), false), intimidate('e1')),
      'nuzlockeAreaUsed'
    )
    const after = act(sure, nuzlocke(fresh(), true), intimidate('e1'))
    expect(battleOf(after).captured.map((m) => m.id)).toEqual(['e1'])
    expect(battleOf(after).nuzlockeEncounter).toBe(false)
    // Hết lượt gặp: không quái nào xin theo sau trận thắng.
    const data = recruitData({ baseChance: 100 })
    const spent = nuzlocke(twoOnTwo(), false)
    expect(eventsOf(winBattle(data, spent), 'recruitOffered')).toEqual([])
  })

  it('AI không gợi ý Thị Uy', () => {
    const command = suggestTamerCommand(sure, fresh())
    expect(command?.skillId).not.toBe('intimidate')
  })
})

describe('mồi dụ', () => {
  const data = always
  const town = (stacks: Record<string, number>): GameState => ({
    ...makeGameState({ seed: 1, party: [ally('a'), ally('b')] }),
    inventory: makeInventory(stacks)
  })

  it('dùng ngoài trận: mất một mồi, có tác dụng `battles` trận', () => {
    const used = act(data, town({ lure: 2 }), { type: 'useBait', itemId: 'lure' })
    expect(used.inventory.stacks).toEqual({ lure: 1 })
    expect(used.recruit.bait).toEqual({ itemId: 'lure', battlesLeft: 2 })
    expect(validateGameState(data, used)).toEqual([])
  })

  it('đếm theo trận (thắng hay chạy đều tính), hết thì mất; trận độ kiếp không tính', () => {
    const lured = { ...twoOnTwo(), recruit: { bait: { itemId: 'lure', battlesLeft: 2 } } }
    const won = winBattle(data, lured)
    expect(won.recruit.bait).toEqual({ itemId: 'lure', battlesLeft: 1 })
    const last = winBattle(data, { ...twoOnTwo(), recruit: won.recruit })
    expect(last.recruit.bait).toBeNull()
    // Trận cuối của mồi vẫn có tác dụng: tỉ lệ 100% nên vẫn có quái xin theo.
    expect(battleOf(last).recruitOfferId).not.toBeNull()
  })

  it('báo lỗi: trong trận, id lạ, không phải mồi, đang có mồi, không có mồi', () => {
    expectActionError(
      () =>
        act(
          data,
          { ...twoOnTwo(), inventory: makeInventory({ lure: 1 }) },
          {
            type: 'useBait',
            itemId: 'lure'
          }
        ),
      'inBattle'
    )
    expectActionError(() => act(data, town({}), { type: 'useBait', itemId: 'nope' }), 'unknownItem')
    expectActionError(
      () => act(data, town({ potion: 1 }), { type: 'useBait', itemId: 'potion' }),
      'notBait'
    )
    const active = { ...town({ lure: 1 }), recruit: { bait: { itemId: 'lure', battlesLeft: 1 } } }
    expectActionError(() => act(data, active, { type: 'useBait', itemId: 'lure' }), 'baitActive')
    expectActionError(
      () => act(data, town({}), { type: 'useBait', itemId: 'lure' }),
      'notEnoughItem'
    )
  })
})

describe('dữ liệu và save', () => {
  it('kiểm tra dữ liệu: mồi sai số, config.recruit sai, Thị Uy có effects', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.items.push({ id: 'badLure', category: 'bait', price: 1, recruitPercent: 0, battles: 0 })
        raw.config.recruit = { ...raw.config.recruit, rankFalloff: 2 }
        raw.tamerSkills.push({
          id: 'badIntimidate',
          unlockRealm: 0,
          manaCost: 0,
          cooldown: 0,
          target: 'wildFoe',
          // Ép kiểu để giả lập JSON có trường thừa.
          ...({ effects: [] } as object)
        })
      },
      { regenerateText: true }
    )
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Vật phẩm "badLure": recruitPercent'),
        expect.stringContaining('Vật phẩm "badLure": battles'),
        expect.stringContaining('config.recruit.rankFalloff'),
        'Kỹ năng ngự thú sư "badIntimidate": trường "effects" không thuộc kỹ năng ngự thú sư'
      ])
    )
  })

  it('kiểm tra save: mồi không phải bait / số trận 0, quái xin theo sai', () => {
    const state = makeGameState({ seed: 1, party: [ally('a')] })
    expect(
      validateGameState(always, {
        ...state,
        recruit: { bait: { itemId: 'potion', battlesLeft: 0 } }
      })
    ).toEqual([
      'recruit.bait.itemId: không phải mồi dụ "potion"',
      'recruit.bait.battlesLeft phải là số nguyên ≥ 1, nhận 0'
    ])
    const battle = twoOnTwo()
    expect(
      validateGameState(always, {
        ...battle,
        battle: { ...battleOf(battle), recruitOfferId: 'zz' }
      })
    ).toEqual([
      'battle.recruitOfferId: chỉ có sau trận thắng',
      'battle.recruitOfferId: không có quái địch "zz"'
    ])
  })

  it('migrate v51 → v52: chưa có mồi, trận đang diễn ra không có quái xin theo', () => {
    const current = twoOnTwo()
    const { recruit: _recruit, ...rest } = cloneData(current)
    const { recruitOfferId: _offer, ...battle } = battleOf(current)
    const old = JSON.parse(JSON.stringify({ ...rest, version: 51, battle }))
    const migrated = migrateState(old, always)
    expect(migrated.recruit).toEqual({ bait: null })
    expect(battleOf(migrated).recruitOfferId).toBeNull()
    expect(validateGameState(always, migrated)).toEqual([])
  })
})
