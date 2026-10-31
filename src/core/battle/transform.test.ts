// Biến hình trong trận (mục "Biến hình trong trận" ở transformation.md): luật chung (vật phẩm chìa
// khóa, mỗi phe mỗi loại một lần, mỗi quái một biến hình), Tera (phòng thủ, STAB, power tối thiểu,
// Stellar, Tera Blast, sạc Tera Orb), Mega (đá, nhiều dạng, skill thay đá, chỉ số, tốc độ có tác dụng
// ngay lượt đó, giữ khi đổi quái, Primal), Dynamax (power spot, máu, 3 lượt, rời sân, chiêu Max, Max
// Guard, Gigantamax, không bắt được), boss biến hình, AI, trả lại dạng thường khi hết trận.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { computeStats, getMaxHp } from '../monster'
import { createGameData } from '../gameData'
import { createRng } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeInventory,
  makeMonster,
  makeTransformData,
  makeTransformRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import {
  STELLAR,
  type BattleCommand,
  type BattleEvent,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData
} from '../model'
import { rollBossTransformTraits } from '../world'
import { cloneDraft } from './draft'
import { maxMoveFor, maxMovePower } from './maxMoves'
import { suggestBattleCommands } from './ai'
import {
  battleSkill,
  recordStellarUse,
  stabMultiplierOf,
  stellarBlastEffectiveness,
  transformBlocker
} from './transform'
import { raiseProtect } from './volatiles'

const data = makeTransformData()
const KEYS = { megaRing: 1, dynamaxBand: 1, teraOrb: 1 }

/** Quái ta: weakling hệ cỏ, hệ Tera nước, mọi chỉ số 50 (HP 50). */
const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    speciesId: 'weakling',
    baseSpeciesId: 'weakling',
    elementIds: ['grass'],
    teraElementId: 'water',
    skillIds: ['strike', 'idle', 'sap'],
    ...overrides
  })

/** Quái địch nhiều máu, chậm (tốc độ 30), chỉ biết một skill. */
const foe = (id: string, skillId = 'idle', overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['normal'],
    skillIds: [skillId],
    genes: { ...uniformStats(1000), speed: 1 },
    ...overrides
  })

function battle(
  party: Monster[],
  enemies: Monster[],
  options: { isBoss?: boolean; stacks?: Record<string, number> } = {}
): GameState {
  const state = makeBattleState(party, enemies, { isBoss: options.isBoss ?? false })
  return { ...state, inventory: makeInventory(options.stacks ?? KEYS) }
}

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const use = (skillId: string, extra: Partial<BattleCommand> = {}, slot = 0): BattleCommand =>
  ({ slot, kind: 'skill', skillId, target: 0, ...extra }) as BattleCommand

const events = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  defined(state.battle, 'trận').log.filter(
    (event): event is Extract<BattleEvent, { type: T }> => event.type === type
  )

const partyMember = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    id
  )

describe('luật chung', () => {
  it('thiếu vật phẩm chìa khóa: transformUnavailable noKeyItem, state giữ nguyên', () => {
    const state = battle([ally('a')], [foe('x')], { stacks: {} })
    expectActionError(
      () => turn(state, use('idle', { transform: 'tera' })),
      'transformUnavailable',
      {
        kind: 'tera',
        reason: 'noKeyItem'
      }
    )
  })

  it('mỗi phe mỗi loại một lần mỗi trận, hai quái cùng xin một loại cũng bị chặn', () => {
    const state = battle([ally('a'), ally('b')], [foe('x')])
    expectActionError(
      () => turn(state, use('idle', { transform: 'tera' }), use('idle', { transform: 'tera' }, 1)),
      'transformUnavailable',
      { reason: 'alreadyUsedBySide' }
    )
    const after = turn(state, use('idle', { transform: 'tera' }), use('idle', {}, 1))
    expectActionError(
      () => turn(after, use('idle'), use('idle', { transform: 'tera' }, 1)),
      'transformUnavailable',
      { reason: 'alreadyUsedBySide' }
    )
  })

  it('mỗi quái tối đa một biến hình mỗi trận', () => {
    const state = battle(
      [ally('a', { equipment: [{ storage: 'stack', itemId: 'weaklingite' }] })],
      [foe('x')]
    )
    const after = turn(state, use('idle', { transform: 'mega' }))
    expectActionError(
      () => turn(after, use('idle', { transform: 'tera' })),
      'transformUnavailable',
      { reason: 'monsterAlreadyTransformed' }
    )
  })

  it('loại biến hình lạ hoặc formSpeciesId không kèm transform: malformedAction', () => {
    const state = battle([ally('a')], [foe('x')])
    expectActionError(
      () => turn(state, use('idle', { transform: 'zmove' as never })),
      'malformedAction'
    )
    expectActionError(
      () => turn(state, use('idle', { formSpeciesId: 'weaklingMega' })),
      'malformedAction'
    )
  })

  it('hết trận: trở lại dạng thường, hệ gốc', () => {
    const state = battle(
      [ally('a')],
      [foe('x', 'idle', { genes: uniformStats(10), damageTaken: 49 })]
    )
    const after = turn(state, use('strike', { transform: 'tera' }))
    expect(after.battle?.outcome).toBe('won')
    const a = partyMember(after, 'a')
    expect(a.battleTransform).toBeUndefined()
    expect(a.elementIds).toEqual(['grass'])
  })
})

describe('Tera', () => {
  it('phòng thủ chỉ còn hệ Tera, Tera Orb hết sạc, phe đã dùng Tera, log transformed', () => {
    const after = turn(battle([ally('a')], [foe('x')]), use('idle', { transform: 'tera' }))
    expect(partyMember(after, 'a').elementIds).toEqual(['water'])
    expect(after.teraOrbCharged).toBe(false)
    expect(after.battle?.transformsUsed.player).toEqual(['tera'])
    expect(events(after, 'transformed')).toEqual([
      { type: 'transformed', monsterId: 'a', kind: 'tera', teraElementId: 'water' }
    ])
  })

  it('Tera Orb hết sạc: teraOrbEmpty; NPC hồi máu sạc lại kể cả khi đội đầy máu', () => {
    const state = { ...battle([ally('a')], [foe('x')]), teraOrbCharged: false }
    expectActionError(
      () => turn(state, use('idle', { transform: 'tera' })),
      'transformUnavailable',
      {
        reason: 'teraOrbEmpty'
      }
    )
    const town: GameState = { ...state, battle: null, location: { type: 'town' } }
    const healed = gameReducer(data, town, { type: 'healParty' })
    expect(healed.teraOrbCharged).toBe(true)
    expectActionError(() => gameReducer(data, healed, { type: 'healParty' }), 'partyFullHp')
  })

  it('STAB: hệ gốc 1,5; hệ Tera 1,5; trùng hệ gốc 2; hệ khác 1', () => {
    const tera = (teraElementId: string): Monster =>
      ally('a', {
        elementIds: [teraElementId],
        battleTransform: { kind: 'tera', teraElementId, originalElementIds: ['grass'] }
      })
    const stab = (attacker: Monster, skillId: string): number =>
      stabMultiplierOf(data, { attacker, skill: data.skills[skillId] })
    expect(stab(tera('water'), 'sap')).toBe(1.5)
    expect(stab(tera('fire'), 'blast')).toBe(1.5)
    expect(stab(tera('fire'), 'strike')).toBe(1)
    expect(stab(tera('grass'), 'sap')).toBe(2)
    expect(stab(ally('a'), 'sap')).toBe(1.5)
  })

  it('Stellar: lần đầu mỗi hệ ×2 (hệ gốc) / ×1,2 (hệ khác), sau đó như không Tera', () => {
    const stellar = ally('a', {
      battleTransform: { kind: 'tera', teraElementId: STELLAR, originalElementIds: ['grass'] }
    })
    const stab = (skillId: string): number =>
      stabMultiplierOf(data, { attacker: stellar, skill: data.skills[skillId] })
    expect([stab('sap'), stab('strike')]).toEqual([2, 1.2])
    recordStellarUse(stellar, 'grass')
    recordStellarUse(stellar, 'normal')
    expect([stab('sap'), stab('strike')]).toEqual([1.5, 1])
  })

  it('skill cùng hệ Tera power < 60 (một đòn, priority ≤ 0) thành 60', () => {
    const d = cloneDraft(battle([ally('a')], [foe('x')]))
    const a = ally('a', {
      elementIds: ['normal'],
      battleTransform: { kind: 'tera', teraElementId: 'normal', originalElementIds: ['grass'] }
    })
    expect(battleSkill(data, d, a, data.skills.strike).power).toBe(60)
    expect(battleSkill(data, d, a, data.skills.quick).power).toBe(10)
    expect(battleSkill(data, d, a, data.skills.flurry).power).toBe(20)
    expect(battleSkill(data, d, a, data.skills.blast).power).toBe(50)
  })

  it('Tera Blast: hệ Tera, vật lý khi công > đặc công; Stellar power riêng, tự hạ bậc, khắc quái Tera', () => {
    const d = cloneDraft(battle([ally('a')], [foe('x')]))
    const strong = ally('a', {
      genes: { ...uniformStats(10), attack: 100 },
      battleTransform: { kind: 'tera', teraElementId: 'fire', originalElementIds: ['grass'] }
    })
    const blast = battleSkill(data, d, strong, data.skills.teraBlast)
    expect([blast.elementId, blast.category]).toEqual(['fire', 'physical'])
    const stellar = ally('a', {
      battleTransform: { kind: 'tera', teraElementId: STELLAR, originalElementIds: ['grass'] }
    })
    const starBlast = battleSkill(data, d, stellar, data.skills.teraBlast)
    expect(starBlast.power).toBe(100)
    expect(starBlast.effects.map((effect) => effect.params)).toEqual([
      { who: 'self', stat: 'attack', delta: -1 },
      { who: 'self', stat: 'spAttack', delta: -1 }
    ])
    const teraFoe = foe('x', 'idle', {
      battleTransform: { kind: 'tera', teraElementId: 'fire', originalElementIds: ['normal'] }
    })
    const input = { attacker: stellar, skill: starBlast }
    expect(stellarBlastEffectiveness(data, { ...input, defender: teraFoe })).toBe(2)
    expect(stellarBlastEffectiveness(data, { ...input, defender: foe('y') })).toBe(1)
    expect(
      stellarBlastEffectiveness(data, { ...input, skill: data.skills.strike, defender: teraFoe })
    ).toBeNull()
  })
})

describe('Mega', () => {
  const holding = (...itemIds: string[]): MonsterOverrides => ({
    equipment: itemIds.map((itemId) => ({ storage: 'stack', itemId }))
  })

  it('cần Vòng Mega và đá đúng dạng; chỉ số gốc và hệ theo dạng Mega', () => {
    expectActionError(
      () => turn(battle([ally('a')], [foe('x')]), use('idle', { transform: 'mega' })),
      'transformUnavailable',
      { reason: 'notEligible' }
    )
    const state = battle([ally('a', holding('weaklingite'))], [foe('x')])
    expectActionError(
      () => turn({ ...state, inventory: makeInventory({}) }, use('idle', { transform: 'mega' })),
      'transformUnavailable',
      { reason: 'noKeyItem' }
    )
    const after = turn(state, use('idle', { transform: 'mega' }))
    const a = partyMember(after, 'a')
    expect(a.battleTransform?.formSpeciesId).toBe('weaklingMega')
    expect(a.elementIds).toEqual(['fire'])
    expect(computeStats(data, a).base.hp.toNumber()).toBe(80)
  })

  it('cầm nhiều đá hợp lệ: phải chọn dạng; skill thay đá (kiểu Rayquaza) không cần đá', () => {
    const state = battle([ally('a', holding('weaklingite', 'weaklingiteY'))], [foe('x')])
    expectActionError(() => turn(state, use('idle', { transform: 'mega' })), 'malformedAction')
    const chosen = turn(state, use('idle', { transform: 'mega', formSpeciesId: 'weaklingMegaY' }))
    expect(partyMember(chosen, 'a').elementIds).toEqual(['water'])
    const skillForm = battle([ally('a', { skillIds: ['idle', 'blast'] })], [foe('x')])
    const after = turn(skillForm, use('idle', { transform: 'mega' }))
    expect(partyMember(after, 'a').battleTransform?.formSpeciesId).toBe('weaklingMegaZ')
  })

  it('quái fuse không Mega được (Dynamax / Tera thì được)', () => {
    const d = cloneDraft(battle([ally('a', holding('weaklingite'))], [foe('x')]))
    const fused = { ...ally('a', holding('weaklingite')), fused: true }
    expect(transformBlocker(data, d, { side: 'player', monster: fused, kind: 'mega' })).toBe(
      'notEligible'
    )
    expect(transformBlocker(data, d, { side: 'player', monster: fused, kind: 'tera' })).toBeNull()
  })

  it('tốc độ dạng Mega có tác dụng ngay lượt biến hình', () => {
    // Quái ta tốc độ 50 → Mega 80; địch tốc độ 60.
    const fast = foe('x', 'idle', { genes: { ...uniformStats(1000), speed: 15 } })
    const state = battle([ally('a', holding('weaklingite'))], [fast])
    const firstUser = (s: GameState): string => events(s, 'useSkill')[0].monsterId
    expect(firstUser(turn(state, use('idle')))).toBe('x')
    expect(firstUser(turn(state, use('idle', { transform: 'mega' })))).toBe('a')
  })

  it('giữ Mega khi đổi quái ra vào', () => {
    const state = battle([ally('a', holding('weaklingite')), ally('b')], [foe('x')])
    const megaTurn = turn(
      { ...state, battle: { ...defined(state.battle), playerSlots: ['a', null] } },
      use('idle', { transform: 'mega' })
    )
    const switched = turn(megaTurn, { slot: 0, kind: 'switch', monsterId: 'b' })
    expect(partyMember(switched, 'a').battleTransform?.kind).toBe('mega')
  })

  it('đá tự kích hoạt (Primal): biến khi ra sân, không cần Vòng Mega, không tính lượt của phe', () => {
    const primal = makeMonster({
      id: 'p',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire'],
      ...holding('blueOrb')
    })
    const state = battle([ally('a'), primal], [foe('x')], { stacks: {} })
    const narrowed = { ...state, battle: { ...defined(state.battle), playerSlots: ['a', null] } }
    const after = turn(narrowed, { slot: 0, kind: 'switch', monsterId: 'p' })
    const p = partyMember(after, 'p')
    expect(p.battleTransform?.formSpeciesId).toBe('stronglingPrimal')
    expect(p.elementIds).toEqual(['water'])
    expect(after.battle?.transformsUsed.player).toEqual([])
  })
})

describe('Dynamax', () => {
  it('chỉ ở power spot: map thường thì notPowerSpot, trận boss thì được', () => {
    expectActionError(
      () => turn(battle([ally('a')], [foe('x')]), use('idle', { transform: 'dynamax' })),
      'transformUnavailable',
      { reason: 'notPowerSpot' }
    )
    const raw = makeTransformRawData()
    raw.biomes[0].powerSpot = true
    const spotData = createGameData(withFixtureText(raw))
    const after = gameReducer(spotData, battle([ally('a')], [foe('x')]), {
      type: 'submitTurn',
      commands: [use('idle', { transform: 'dynamax' })]
    })
    expect(partyMember(after, 'a').battleTransform?.kind).toBe('dynamax')
  })

  it('max HP × (1,5 + 0,05 × cấp) giữ tỉ lệ máu; hết sau 3 lượt thì trả lại', () => {
    const state = battle([ally('a', { damageTaken: 10, dynamaxLevel: 10 })], [foe('x')], {
      isBoss: true
    })
    const t1 = turn(state, use('idle', { transform: 'dynamax' }))
    const a1 = partyMember(t1, 'a')
    expect(getMaxHp(data, a1).toNumber()).toBe(100)
    expect(a1.damageTaken.toNumber()).toBe(20)
    const t3 = turn(turn(t1, use('idle')), use('idle'))
    const a3 = partyMember(t3, 'a')
    expect(events(t3, 'transformEnded')).toEqual([
      { type: 'transformEnded', monsterId: 'a', kind: 'dynamax' }
    ])
    expect(getMaxHp(data, a3).toNumber()).toBe(50)
    expect(a3.damageTaken.toNumber()).toBe(10)
    expect(a3.battleTransform?.ended).toBe(true)
  })

  it('đổi quái ra thì Dynamax kết thúc ngay', () => {
    const state = battle([ally('a'), ally('b')], [foe('x')], { isBoss: true })
    const narrowed = { ...state, battle: { ...defined(state.battle), playerSlots: ['a', null] } }
    const t1 = turn(narrowed, use('idle', { transform: 'dynamax' }))
    const switched = turn(t1, { slot: 0, kind: 'switch', monsterId: 'b' })
    expect(partyMember(switched, 'a').battleTransform?.ended).toBe(true)
  })

  it('chiêu Max: power theo bảng (hệ giác đấu / độc dùng bảng thấp), một mục tiêu, luôn trúng', () => {
    const { powerTable, lowPowerTable } = data.config.transform.dynamax
    expect([10, 44, 45, 74, 109, 149, 150, 1e9].map((p) => maxMovePower(powerTable, p))).toEqual([
      90, 90, 100, 120, 130, 140, 150, 150
    ])
    expect(maxMovePower(lowPowerTable, 50)).toBe(75)
    const d = cloneDraft(battle([ally('a')], [foe('x')]))
    const max = maxMoveFor(data, d.battle.field, ally('a'), data.skills.wave)
    expect([max.id, max.power, max.target, max.category]).toEqual([
      'maxStrike',
      90,
      'enemy',
      'special'
    ])
    expect(maxMoveFor(data, d.battle.field, ally('a'), data.skills.idle).id).toBe('maxGuard')
    // Trượt 50% bình thường, chiêu Max luôn trúng; hiệu ứng: −1 tốc độ phe địch.
    const state = battle([ally('a', { skillIds: ['shaky'] })], [foe('x')], { isBoss: true })
    const after = turn(state, use('shaky', { transform: 'dynamax' }))
    expect(events(after, 'useSkill')[0]).toEqual({
      type: 'useSkill',
      monsterId: 'a',
      skillId: 'maxStrike'
    })
    expect(events(after, 'miss')).toEqual([])
    expect(after.battle?.stages.x?.speed).toBe(-1)
  })

  it('Max Guard chặn skill nhắm vào quái trong lượt; dùng liên tiếp tỉ lệ ÷ 3 mỗi lần', () => {
    const state = battle([ally('a')], [foe('x', 'strike', { genes: uniformStats(10) })], {
      isBoss: true
    })
    const after = turn(state, use('idle', { transform: 'dynamax' }))
    expect(events(after, 'protected')).toEqual([{ type: 'protected', monsterId: 'a', userId: 'x' }])
    expect(partyMember(after, 'a').damageTaken.toNumber()).toBe(0)
    const d = cloneDraft(after)
    const volatile = defined(d.battle.volatiles.a)
    volatile.protect = { turn: d.battle.turn - 1, streak: 0 }
    raiseProtect(d, {
      user: partyMember(d, 'a'),
      consecutiveChanceDivisor: 1e9,
      skillId: 'maxGuard'
    })
    expect(volatile.protect).toBeUndefined()
    expect(d.battle.log.at(-1)).toMatchObject({ type: 'skillFailed', reason: 'protectFailed' })
  })

  it('Gigantamax: Gmax Factor thì thành dạng gmax, chiêu hệ đặc trưng là chiêu G-Max', () => {
    const state = battle([ally('a', { gmaxFactor: true })], [foe('x')], { isBoss: true })
    const after = turn(state, use('sap', { transform: 'dynamax' }))
    expect(partyMember(after, 'a').battleTransform?.formSpeciesId).toBe('weaklingGmax')
    expect(events(after, 'useSkill')[0].skillId).toBe('gmaxBloom')
    expect(after.battle?.stages.x?.speed).toBe(-2)
  })

  it('không ném bóng được vào quái đang Dynamax', () => {
    const dynamaxed = foe('x', 'idle', {
      battleTransform: { kind: 'dynamax', originalElementIds: ['normal'], turnsLeft: 3 }
    })
    const state = battle([ally('a')], [dynamaxed], { stacks: { ...KEYS, ball: 1 } })
    expectActionError(
      () => turn(state, { slot: 0, kind: 'item', itemId: 'ball', targetId: 'x' }),
      'cannotCatchDynamaxed'
    )
  })
})

describe('boss và AI', () => {
  const openBoss = (
    edit: (raw: RawGameData) => void
  ): { bossData: GameData; opened: GameState } => {
    const raw = makeTransformRawData()
    raw.config.transform.boss = {
      base: 100,
      perFloor: 0,
      weights: { mega: 1, dynamax: 1, tera: 1, trueForm: 0, merge: 0, ultraBurst: 1 }
    }
    edit(raw)
    const bossData = createGameData(withFixtureText(raw))
    const strong = ally('a', { genes: uniformStats(1000) })
    const opened = gameReducer(
      bossData,
      { ...makeBattleState([strong], []), battle: null, location: { type: 'floor', floor: 1 } },
      { type: 'challengeBoss' }
    )
    return { bossData, opened }
  }

  it('boss không dùng biến hình cần vật phẩm (Mega, Dynamax, Tera đều cần): không có kế hoạch', () => {
    const { opened } = openBoss(() => undefined)
    expect(opened.battle?.plannedTransform).toBeNull()
  })

  it('loại không cần vật phẩm: boss biến hình ở lượt đầu theo kế hoạch tung lúc mở trận', () => {
    const { bossData, opened } = openBoss((raw) => {
      delete raw.config.transform.keyItems.tera
    })
    expect(opened.battle?.plannedTransform?.kind).toBe('tera')
    const after = gameReducer(bossData, opened, { type: 'submitTurn', commands: [use('idle')] })
    expect(after.battle?.plannedTransform).toBeNull()
    expect(after.battle?.transformsUsed.enemy).toEqual(['tera'])
  })

  it('trường biến hình của boss: Stellar từ tầng mốc, Gmax Factor nếu loài mang được, cấp Dynamax', () => {
    const raw = makeTransformRawData()
    Object.assign(raw.config.transform.tera, { stellarChance: 100, stellarFromFloor: 3 })
    raw.config.transform.dynamax.bossGmaxFactorChance = 100
    const bossData = createGameData(withFixtureText(raw))
    const [boss] = rollBossTransformTraits(bossData, createRng(1), { floor: 3, boss: ally('m') })
    expect([boss.teraElementId, boss.gmaxFactor]).toEqual([STELLAR, true])
    expect(boss.dynamaxLevel).toBeGreaterThanOrEqual(0)
    expect(boss.dynamaxLevel).toBeLessThanOrEqual(10)
    const [low] = rollBossTransformTraits(bossData, createRng(1), { floor: 2, boss: ally('m') })
    expect(low.teraElementId).toBe('grass')
  })

  it('AI phe người chơi dùng Mega ngay khi được', () => {
    const state = battle(
      [ally('a', { equipment: [{ storage: 'stack', itemId: 'weaklingite' }] })],
      [foe('x')]
    )
    expect(suggestBattleCommands(data, state)[0]).toMatchObject({ transform: 'mega' })
  })
})
