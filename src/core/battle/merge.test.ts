// Song thú hợp thể (docs/rules/battle-merge.md): điều kiện, chỉ số / HP / hệ / skill của thực thể, 2
// hành động mỗi lượt, tách khi hết lượt (chia máu), cùng gục, hết trận, một lần mỗi phe, AI, save.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { computeStats, getMaxHp, masteryOf } from '../monster'
import { toBig } from '../shared'
import { suggestTamerCommand } from './tamerSkills'
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
import {
  battleSkillIds,
  type BattleCommand,
  type BattleState,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData
} from '../model'

const MERGE = 'twin'

function mergeRawData(): RawGameData {
  const raw = makeRawData()
  raw.tamerSkills.push({
    id: MERGE,
    unlockRealm: 0,
    manaCost: 30,
    cooldown: 0,
    usesPerBattle: 1,
    target: 'merge'
  })
  // oak là quái lớn (như monsterSize.test.ts).
  for (const species of raw.species) {
    if (species.kind === 'normal' && species.id === 'oak') species.weightKg = 5000
  }
  return raw
}

const data: GameData = createGameData(withFixtureText(mergeRawData()))

/** Quái ta đủ thân mật (Tri kỷ) để hợp thể. */
const pal = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, affinity: 200, skillIds: ['idle', 'strike'], ...overrides })
const foe = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], ...overrides })

/** a: strongling (lửa, chỉ số gốc 60), b: weakling (cỏ, 30) cùng race neutral. */
const lead = (overrides: MonsterOverrides = {}): Monster =>
  pal('a', {
    speciesId: 'strongling',
    baseSpeciesId: 'strongling',
    elementIds: ['fire'],
    ...overrides
  })
const partner = (overrides: MonsterOverrides = {}): Monster =>
  pal('b', { skillIds: ['idle', 'wave'], ...overrides })

const idle = (slot: number): BattleCommand => ({ slot, kind: 'skill', skillId: 'idle' })

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })
const mergeTurn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, {
    type: 'submitTurn',
    commands: commands.length > 0 ? commands : [idle(0), idle(1)],
    tamer: { skillId: MERGE }
  })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const member = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    `quái ${id}`
  )

describe('hợp thể: bắt đầu', () => {
  it('hai quái thành một thực thể chiếm cả hai ô, log, tính lượt biến hình của phe, tốn linh lực', () => {
    const state = makeBattleState([lead(), partner({ damageTaken: 10 }), pal('c')], [foe('e1')])
    const maxA = getMaxHp(data, lead())
    const maxB = getMaxHp(data, partner())
    const after = mergeTurn(state)
    const battle = battleOf(after)
    expect(battle.playerSlots).toEqual(['a', 'a'])
    expect(battle.log).toContainEqual({
      type: 'merged',
      side: 'player',
      monsterId: 'a',
      partnerId: 'b'
    })
    expect(battle.transformsUsed.player).toEqual(['merge'])
    expect(defined(battle.tamers.player, 'ngự thú sư').mana).toBe(20)
    const a = member(after, 'a')
    // Max HP = tổng, máu đã mất = tổng; hệ đầu của mỗi con; skill của cả hai.
    expect(getMaxHp(data, a).eq(maxA.plus(maxB))).toBe(true)
    expect(a.damageTaken.toNumber()).toBe(10)
    expect(a.elementIds).toEqual(['fire', 'grass'])
    // Skill của cả hai, thêm Fusion Power của thực thể hợp thể (docs/rules/fusion-power.md).
    expect(battleSkillIds(a)).toEqual(['idle', 'strike', 'wave', 'fusionPower'])
    // Hợp thể lượt này, cuối lượt còn 2 lượt.
    expect(a.battleTransform?.turnsLeft).toBe(2)
    expect(member(after, 'b').battleTransform?.mergedIntoId).toBe('a')
    // Lệnh của quái phụ ở ô 1 thành hành động thứ hai của thực thể ngay lượt hợp thể.
    const uses = battle.log.filter((e) => e.type === 'useSkill' && e.monsterId === 'a')
    expect(uses).toHaveLength(2)
    // Save giữa trận hợp thể (quái phụ nằm trong biến hình, có trường Decimal) ghi / đọc lại đúng.
    const loaded = migrateState(JSON.parse(JSON.stringify(serializeState(after))), data)
    expect(validateGameState(data, loaded)).toEqual([])
  })

  it('chỉ số: cao hơn + 50% thấp hơn (tính trên chỉ số riêng của từng con), HP cộng', () => {
    const after = mergeTurn(makeBattleState([lead(), partner()], [foe('e1')]))
    const merged = computeStats(data, member(after, 'a')).withTransform
    const own = computeStats(data, lead()).withField
    const other = computeStats(data, partner()).withField
    expect(merged.hp.eq(own.hp.plus(other.hp))).toBe(true)
    for (const stat of ['attack', 'defense', 'spAttack', 'spDefense', 'speed'] as const) {
      const [high, low] = own[stat].gte(other[stat])
        ? [own[stat], other[stat]]
        : [other[stat], own[stat]]
      expect(merged[stat].eq(high.plus(low.times(0.5)))).toBe(true)
    }
  })

  it('số cực lớn: gen 1e300 vẫn gộp được, không Infinity / NaN', () => {
    const genes = {
      hp: '1e300',
      attack: '1e300',
      defense: '1e300',
      spAttack: '1e300',
      spDefense: '1e300',
      speed: '1e300'
    }
    const bigState = makeBattleState([lead({ genes }), partner({ genes })], [foe('e1')])
    const after = mergeTurn(bigState)
    const hp = getMaxHp(data, member(after, 'a'))
    expect(hp.isFinite()).toBe(true)
    expect(hp.gt('1e300')).toBe(true)
  })

  it('skill chỉ quái phụ biết dùng thuần thục của quái phụ', () => {
    const skilled = partner({ skillMastery: { wave: { level: 5, exp: toBig(0) } } })
    const after = mergeTurn(makeBattleState([lead(), skilled], [foe('e1')]))
    expect(masteryOf(member(after, 'a'), 'wave').level).toBe(5)
    expect(masteryOf(member(after, 'a'), 'strike').level).toBe(1)
  })

  it('trait và trang bị của quái phụ áp lên thực thể (trait đổi chỉ số không tính hai lần)', () => {
    const withTrait = partner({ traits: [{ id: 'mighty', level: 1 }] })
    const after = mergeTurn(makeBattleState([lead(), withTrait], [foe('e1')]))
    const merged = computeStats(data, member(after, 'a')).withTransform
    const own = computeStats(data, lead()).withField
    const other = computeStats(data, withTrait).withField
    const [high, low] = own.attack.gte(other.attack)
      ? [own.attack, other.attack]
      : [other.attack, own.attack]
    expect(merged.attack.eq(high.plus(low.times(0.5)))).toBe(true)
  })
})

describe('hợp thể: điều kiện', () => {
  const reasonOf = (state: GameState, reason: string, commands = [idle(0), idle(1)]): void =>
    expectActionError(() => mergeTurn(state, ...commands), 'transformUnavailable', {
      kind: 'merge',
      reason
    })

  it('thân mật mỗi con ≥ 200', () => {
    reasonOf(makeBattleState([lead(), partner({ affinity: 199 })], [foe('e1')]), 'affinityTooLow')
  })

  it('hợp nhau: cùng race, chung hệ, hoặc bản mệnh', () => {
    const brute = (overrides: MonsterOverrides = {}): Monster =>
      pal('b', {
        speciesId: 'brawler',
        baseSpeciesId: 'brawler',
        raceId: 'brute',
        elementIds: ['fire'],
        ...overrides
      })
    const grassLead = pal('a')
    reasonOf(makeBattleState([grassLead, brute()], [foe('e1')]), 'incompatible')
    // Chung hệ lửa với strongling.
    expect(
      battleOf(mergeTurn(makeBattleState([lead(), brute()], [foe('e1')]))).playerSlots
    ).toEqual(['a', 'a'])
    // Bản mệnh thì luôn hợp.
    const bonded = makeBattleState([grassLead, brute({ bond: true })], [foe('e1')])
    expect(battleOf(mergeTurn(bonded)).playerSlots).toEqual(['a', 'a'])
  })

  it('cần đúng hai quái thường còn sống trên sân; quái lớn không hợp thể', () => {
    reasonOf(makeBattleState([lead()], [foe('e1')]), 'needsPair', [idle(0)])
    const big = pal('o', { speciesId: 'oak', baseSpeciesId: 'oak' })
    reasonOf(
      makeBattleState([big, partner()], [foe('e1')], { playerSlots: ['o', 'o'] }),
      'notEligible',
      [idle(0)]
    )
  })

  it('quái đã biến hình trong trận, phe đã hợp thể', () => {
    const transformed = lead({
      battleTransform: { kind: 'tera', originalElementIds: ['fire'], ended: true }
    })
    reasonOf(makeBattleState([transformed, partner()], [foe('e1')]), 'monsterAlreadyTransformed')
    reasonOf(
      makeBattleState([lead(), partner()], [foe('e1')], {
        transformsUsed: { player: ['merge'], enemy: [] }
      }),
      'alreadyUsedBySide'
    )
  })

  it('lệnh có mục tiêu là lệnh sai; lỗi thì state giữ nguyên', () => {
    const state = makeBattleState([lead(), partner()], [foe('e1')])
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'submitTurn',
          commands: [idle(0), idle(1)],
          tamer: { skillId: MERGE, targetId: 'a' }
        }),
      'malformedAction'
    )
    expect(battleOf(state).playerSlots).toEqual(['a', 'b'])
  })
})

describe('hợp thể: trong trận', () => {
  const merged = (): GameState =>
    mergeTurn(makeBattleState([lead(), partner(), pal('c')], [foe('e1')]))

  it('hành động 2 lần mỗi lượt: cần lệnh cho cả hai ô', () => {
    const state = merged()
    expectActionError(() => turn(state, idle(0)), 'malformedAction')
    const after = turn(state, idle(0), { slot: 1, kind: 'skill', skillId: 'wave' })
    const log = battleOf(after).log.slice(battleOf(state).log.length)
    expect(log.filter((e) => e.type === 'useSkill' && e.monsterId === 'a')).toHaveLength(2)
  })

  it('quái phụ không là dự bị, không đổi vào được; không hợp kích', () => {
    const state = merged()
    expectActionError(
      () => turn(state, { slot: 0, kind: 'switch', monsterId: 'b' }, idle(1)),
      'monsterAlreadyActive',
      { monsterId: 'b' }
    )
  })

  it('hết 3 lượt thì tách: quái phụ về ô cũ, máu chia theo tỉ lệ max HP, nhận bậc trận', () => {
    let state = merged()
    const a = member(state, 'a')
    // Thực thể mất một nửa máu.
    const half = getMaxHp(data, a).div(2).floor()
    state = {
      ...state,
      party: state.party.map((m) => (m.id === 'a' ? { ...m, damageTaken: half } : m))
    }
    state = turn(state, idle(0), idle(1))
    expect(battleOf(state).playerSlots).toEqual(['a', 'a'])
    state = turn(state, idle(0), idle(1))
    const battle = battleOf(state)
    expect(battle.playerSlots).toEqual(['a', 'b'])
    expect(battle.log).toContainEqual({ type: 'unmerged', monsterId: 'a', partnerId: 'b' })
    const [splitA, splitB] = [member(state, 'a'), member(state, 'b')]
    const [maxA, maxB] = [getMaxHp(data, splitA), getMaxHp(data, splitB)]
    const total = maxA.plus(maxB)
    expect(splitA.damageTaken.eq(half.times(maxA).div(total).floor())).toBe(true)
    expect(splitB.damageTaken.eq(half.times(maxB).div(total).floor())).toBe(true)
    // Vẫn tính đã biến hình; hệ trả lại.
    expect(splitA.battleTransform).toEqual({
      kind: 'merge',
      originalElementIds: ['fire'],
      ended: true
    })
    expect(splitB.battleTransform?.ended).toBe(true)
    expect(splitA.elementIds).toEqual(['fire'])
    // Lượt sau hai quái ra lệnh riêng.
    expect(() => turn(state, idle(0), idle(1))).not.toThrow()
    // Không hợp thể lại được trong trận (dùng một lần mỗi trận).
    expectActionError(() => mergeTurn(state), 'tamerSkillUnavailable', {
      skillId: MERGE,
      reason: 'noUsesLeft'
    })
  })

  it('thực thể bị hạ thì cả hai cùng gục; còn dự bị thì chờ thay', () => {
    let state = merged()
    const a = member(state, 'a')
    state = {
      ...state,
      party: state.party.map((m) =>
        m.id === 'a' ? { ...m, damageTaken: getMaxHp(data, a).minus(1) } : m
      ),
      battle: { ...battleOf(state), enemies: [foe('e1', { skillIds: ['strike'] })] }
    }
    const after = turn(state, idle(0), idle(1))
    expect(member(after, 'a').damageTaken.gte(getMaxHp(data, member(after, 'a')))).toBe(true)
    expect(member(after, 'b').damageTaken.gte(getMaxHp(data, member(after, 'b')))).toBe(true)
    expect(battleOf(after).phase).toBe('chooseReplacement')
  })

  it('thực thể là quái cuối cùng: gục thì thua, cả hai gục', () => {
    let state = mergeTurn(
      makeBattleState([lead(), partner()], [foe('e1', { skillIds: ['strike'] })])
    )
    const a = member(state, 'a')
    state = {
      ...state,
      party: state.party.map((m) =>
        m.id === 'a' ? { ...m, damageTaken: getMaxHp(data, a).minus(1) } : m
      )
    }
    const after = turn(state, idle(0), idle(1))
    expect(after.party.every((m) => m.battleTransform === undefined)).toBe(true)
    expect(member(after, 'b').damageTaken.gte(getMaxHp(data, member(after, 'b')))).toBe(true)
  })

  it('hết trận: tách và về dạng thường (chia máu theo max HP riêng)', () => {
    let state = merged()
    state = {
      ...state,
      battle: {
        ...battleOf(state),
        enemies: battleOf(state).enemies.map((m) => ({
          ...m,
          damageTaken: getMaxHp(data, m).minus(1)
        }))
      }
    }
    const after = turn(state, { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }, idle(1))
    expect(after.party.every((m) => m.battleTransform === undefined)).toBe(true)
    expect(member(after, 'a').elementIds).toEqual(['fire'])
    expect(member(after, 'b').damageTaken.lt(getMaxHp(data, member(after, 'b')))).toBe(true)
  })

  it('save giữa lúc hợp thể hợp lệ; quái phụ ở trên sân thì báo lỗi', () => {
    const state = merged()
    expect(validateGameState(data, state)).toEqual([])
    const broken = { ...state, battle: { ...battleOf(state), playerSlots: ['a', 'b'] } }
    expect(validateGameState(data, broken).join()).toMatch(/quái "b" đang hợp vào quái khác/)
  })
})

describe('hợp thể: AI và dữ liệu', () => {
  it('AI gợi ý hợp thể khi có lợi; thiếu thân mật thì không', () => {
    const tough = foe('e1', {
      speciesId: 'boulder',
      baseSpeciesId: 'boulder',
      elementIds: ['normal'],
      skillIds: ['strike']
    })
    const state = makeBattleState([lead(), partner()], [tough])
    expect(suggestTamerCommand(data, state)).toEqual({ skillId: MERGE })
    const cold = makeBattleState([lead(), partner({ affinity: 0 })], [tough])
    expect(suggestTamerCommand(data, cold)?.skillId).not.toBe(MERGE)
  })

  it('ngự thú sư NPC hợp thể được (không xét thân mật)', () => {
    const tough = pal('p', {
      speciesId: 'boulder',
      baseSpeciesId: 'boulder',
      elementIds: ['normal'],
      skillIds: ['strike']
    })
    const enemies = [
      foe('e1', {
        speciesId: 'strongling',
        baseSpeciesId: 'strongling',
        elementIds: ['fire'],
        skillIds: ['idle', 'strike']
      }),
      foe('e2', { skillIds: ['idle', 'wave'] })
    ]
    const state = makeBattleState([tough], enemies, {
      tamers: {
        player: null,
        enemy: { realm: 0, mana: 50, cooldowns: {}, uses: {}, skillIds: [MERGE] }
      }
    })
    const battle = battleOf(turn(state, { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }))
    expect(battle.enemySlots).toEqual(['e1', 'e1'])
    expect(battle.log).toContainEqual({
      type: 'merged',
      side: 'enemy',
      monsterId: 'e1',
      partnerId: 'e2'
    })
  })

  it('kỹ năng merge không có effects', () => {
    expect(
      dataIssuesAfter((raw) => {
        raw.tamerSkills.push({
          id: 'badMerge',
          unlockRealm: 0,
          manaCost: 10,
          cooldown: 0,
          target: 'merge',
          effects: []
        } as unknown as RawGameData['tamerSkills'][number])
      }).join()
    ).toMatch(/badMerge/)
  })
})
