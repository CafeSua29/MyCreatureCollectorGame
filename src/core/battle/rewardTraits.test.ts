// Hook trait chạy trốn (registries/actionTraitHooks.ts, battle/fleeTraits.ts: Run Away, Bản năng
// sinh tồn) và phần thưởng (registries/rewardTraitHooks.ts, battle/outcome.ts: Pickup, Chăm chỉ /
// Lười biếng, Phúc tinh, Ấp ủ); cấp trait; kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeField,
  makeFieldMoveRawData,
  makeMonster,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  Egg,
  GameData,
  GameState,
  Monster,
  RawGameData,
  TraitDef
} from '../model'

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'positive', hooks: [{ type, params }] }
}

const TRAITS: TraitDef[] = [
  trait('runAway', 'fleeChanceOverride', { chance: 100 }),
  trait('halfRun', 'fleeChanceOverride', { chance: 50 }),
  { ...trait('survival', 'fleeWhenLowHp', { hpBelowPercent: 25, chance: 100 }), kind: 'negative' },
  trait('pickup', 'extraDropChance', { percent: 100 }),
  trait('diligent', 'expRewardModifier', { percent: 50 }),
  { ...trait('lazy', 'expRewardModifier', { percent: -50 }), kind: 'negative' },
  trait('lucky', 'moneyRewardModifier', { percent: 50 }),
  trait('nurturer', 'eggHatchBoost', { extraCount: 1 }),
  trait('nurturer2', 'eggHatchBoost', { extraCount: 2 })
]

/** Dữ liệu mẫu: chạy trốn chung 0%, map tầng 1 rơi potion 50%, trứng boss 50%. */
function makeTraitData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeFieldMoveRawData()
  raw.traits.push(...TRAITS)
  raw.config.battle.fleeChance = 0
  raw.config.boss.eggChance = 50
  for (const biome of raw.biomes) {
    biome.drops = biome.drops.map((drop) => ({ ...drop, chance: 50 }))
  }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeTraitData()

type TraitList = (string | [string, number])[]

function fighter(id: string, traits: TraitList = [], overrides: MonsterOverrides = {}): Monster {
  return makeMonster({
    id,
    skillIds: ['strike', 'idle'],
    traits: traits.map((entry) =>
      typeof entry === 'string' ? { id: entry, level: 1 } : { id: entry[0], level: entry[1] }
    ),
    ...overrides
  })
}

/** Quái máu còn `percent`% (làm tròn xuống), chưa gục. */
function wounded(id: string, percent: number, traits: TraitList = []): Monster {
  const monster = fighter(id, traits, { skillIds: ['idle'] })
  const maxHp = getMaxHp(data, monster)
  return { ...monster, damageTaken: maxHp.minus(maxHp.times(percent).div(100).floor()) }
}

/** Quái hoang level 4 sắp gục (8 EXP, 20 tiền khi bị hạ). */
const prey = (id: string): Monster =>
  fighter(id, [], { level: 4, exp: toBig(64), damageTaken: toBig(60), skillIds: ['idle'] })

const command = (slot: number, skillId: string): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0
})
/** Ô 0 đánh, ô 1 (nếu có quái) đứng yên. */
const strikeTurn = (state: GameState): BattleCommand[] =>
  battleOf(state).playerSlots.flatMap((id, slot) =>
    id === null ? [] : [command(slot, slot === 0 ? 'strike' : 'idle')]
  )
const run = (state: GameState, commands: BattleCommand[], gameData = data): GameState =>
  gameReducer(gameData, state, { type: 'submitTurn', commands })
const flee = (state: GameState, gameData = data): GameState =>
  gameReducer(gameData, state, { type: 'flee' })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)
const monsterIn = (state: GameState, id: string): Monster =>
  defined(state.party.find((m) => m.id === id))

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)
const withSeed = (state: GameState, seed: number): GameState => ({ ...state, rng: seed })

describe('fleeChanceOverride (Run Away)', () => {
  it('quái trên sân mang trait: chạy chắc chắn dù tỉ lệ chung 0%, log trait', () => {
    const next = flee(makeBattleState([fighter('a', ['runAway'])], [fighter('e1')]))
    expect(battleOf(next).outcome).toBe('fled')
    expect(eventsOf(next, 'traitTriggered')).toEqual([
      { type: 'traitTriggered', monsterId: 'a', traitId: 'runAway' }
    ])
  })

  it('quái mang trait ở dự bị thì không tính', () => {
    const state = makeBattleState(
      [fighter('a'), fighter('b'), fighter('c', ['runAway'])],
      [fighter('e1', [], { skillIds: ['idle'] })]
    )
    const next = flee(state)
    expect(eventsOf(next, 'fleeFailed')).toHaveLength(1)
    expect(eventsOf(next, 'traitTriggered')).toEqual([])
  })

  it('vượt room chặn chạy trốn (Fairy Lock) như Pokémon; không có trait thì vẫn bị chặn', () => {
    const field = makeField({ rooms: [{ id: 'fairyLock', turnsLeft: 2 }] })
    const locked = makeBattleState([fighter('a')], [fighter('e1')], { field })
    expectActionError(() => flee(locked), 'escapeBlocked', { fieldId: 'fairyLock' })
    const runner = makeBattleState([fighter('a', ['runAway'])], [fighter('e1')], { field })
    expect(battleOf(flee(runner)).outcome).toBe('fled')
  })

  it('tỉ lệ thấp hơn tỉ lệ chung thì dùng tỉ lệ chung, không log trait', () => {
    const always = makeTraitData((raw) => (raw.config.battle.fleeChance = 100))
    const next = flee(makeBattleState([fighter('a', ['halfRun'])], [fighter('e1')]), always)
    expect(battleOf(next).outcome).toBe('fled')
    expect(eventsOf(next, 'traitTriggered')).toEqual([])
  })

  it('tỉ lệ nhân hệ số cấp, kẹp 100', () => {
    const outcomes = (level: number): string[] =>
      SEEDS.map(
        (seed) =>
          battleOf(
            flee(
              withSeed(
                makeBattleState(
                  [fighter('a', [['halfRun', level]])],
                  [fighter('e1', [], { skillIds: ['idle'] })]
                ),
                seed
              )
            )
          ).phase
      )
    expect(outcomes(1)).toContain('chooseActions')
    expect(outcomes(1)).toContain('ended')
    // Cấp 6: 50 × 2 = 100.
    expect(new Set(outcomes(6))).toEqual(new Set(['ended']))
  })
})

describe('fleeWhenLowHp (Bản năng sinh tồn)', () => {
  const idleTurn = (state: GameState): GameState => run(state, [command(0, 'idle')])

  it('quái hoang máu ≤ ngưỡng bỏ chạy cuối lượt: rời trận, không thưởng; hết địch thì thắng', () => {
    const state = makeBattleState([fighter('a')], [wounded('e1', 25, ['survival'])])
    const next = idleTurn(state)
    const battle = battleOf(next)
    expect(battle.outcome).toBe('won')
    expect(battle.enemies).toEqual([])
    expect(eventsOf(next, 'wildFled')).toEqual([{ type: 'wildFled', monsterId: 'e1' }])
    expect(eventsOf(next, 'traitTriggered')).toEqual([
      { type: 'traitTriggered', monsterId: 'e1', traitId: 'survival' }
    ])
    expect(next.money).toEqual(state.money)
    expect(next.inventory).toEqual(state.inventory)
    expect(monsterIn(next, 'a').exp).toEqual(monsterIn(state, 'a').exp)
  })

  it('còn địch khác thì trận tiếp tục, ô của quái bỏ chạy để trống', () => {
    const state = makeBattleState(
      [fighter('a')],
      [wounded('e1', 10, ['survival']), fighter('e2', [], { skillIds: ['idle'] })]
    )
    const battle = battleOf(idleTurn(state))
    expect(battle.phase).toBe('chooseActions')
    expect(battle.enemySlots).toEqual([null, 'e2'])
    expect(battle.enemies.map((m) => m.id)).toEqual(['e2'])
  })

  it('máu trên ngưỡng thì ở lại, không tốn RNG', () => {
    const plain = makeBattleState([fighter('a')], [wounded('e1', 26)])
    const withTrait = makeBattleState([fighter('a')], [wounded('e1', 26, ['survival'])])
    const next = idleTurn(withTrait)
    expect(eventsOf(next, 'wildFled')).toEqual([])
    expect(next.rng).toEqual(idleTurn(plain).rng)
  })

  it('boss hoang không bỏ chạy', () => {
    const state = makeBattleState([fighter('a')], [wounded('e1', 10, ['survival'])], {
      isBoss: true
    })
    const next = idleTurn(state)
    expect(eventsOf(next, 'wildFled')).toEqual([])
    expect(battleOf(next).enemySlots).toEqual(['e1', null])
  })

  it('quái ta rút về, quái dự bị còn sống đầu tiên vào thay; không còn dự bị thì ở lại', () => {
    const enemy = fighter('e1', [], { skillIds: ['idle'] })
    const withReserve = makeBattleState(
      [wounded('a', 20, ['survival']), fighter('b'), fighter('c')],
      [enemy]
    )
    const next = run(withReserve, [command(0, 'idle'), command(1, 'idle')])
    expect(battleOf(next).playerSlots).toEqual(['c', 'b'])
    expect(eventsOf(next, 'enter').at(-1)).toEqual({
      type: 'enter',
      side: 'player',
      slot: 0,
      monsterId: 'c'
    })
    expect(battleOf(next).participants).toContain('c')

    const alone = makeBattleState([wounded('a', 20, ['survival'])], [enemy])
    expect(battleOf(idleTurn(alone)).playerSlots).toEqual(['a', null])
  })
})

describe('moneyRewardModifier (Phúc tinh)', () => {
  const moneyWon = (party: Monster[]): string => {
    const state = makeBattleState(party, [prey('e1')])
    return run(state, strikeTurn(state)).money.minus(state.money).toString()
  }

  it('quái đã tham chiến mang trait nhân tiền thưởng; quái chưa ra sân không tính', () => {
    expect(moneyWon([fighter('a')])).toBe('20')
    expect(moneyWon([fighter('a', ['lucky'])])).toBe('30')
    expect(moneyWon([fighter('a'), fighter('b'), fighter('c', ['lucky'])])).toBe('20')
  })

  it('cộng dồn giữa các quái và theo cấp trait', () => {
    // 50% + 50% × 2 (cấp 6) = 150% → 20 × 2,5 = 50.
    expect(moneyWon([fighter('a', ['lucky']), fighter('b', [['lucky', 6]])])).toBe('50')
  })

  it('quái tham chiến đã gục vẫn tính', () => {
    const fallen = fighter('a', ['lucky'], { damageTaken: toBig('1e9') })
    const state = makeBattleState([fallen, fighter('b')], [prey('e1')], {
      participants: ['a', 'b']
    })
    expect(
      run(state, [command(1, 'strike')])
        .money.minus(state.money)
        .toString()
    ).toBe('30')
  })
})

describe('expRewardModifier (Chăm chỉ / Lười biếng)', () => {
  const expAfterWin = (traits: TraitList, enemy = prey('e1')): string =>
    monsterIn(
      run(makeBattleState([fighter('a', traits)], [enemy]), [command(0, 'strike')]),
      'a'
    ).exp.toString()

  it('chỉ đổi EXP của quái mang trait, làm tròn xuống', () => {
    // EXP gốc 1, địch cho 8.
    expect(expAfterWin([])).toBe('9')
    expect(expAfterWin(['diligent'])).toBe('13')
    expect(expAfterWin(['lazy'])).toBe('5')
  })

  it('hệ số còn > 0 thì không dưới minExp; về 0 khi trait cấp cao', () => {
    const tiny = fighter('e1', [], { damageTaken: toBig(60), skillIds: ['idle'] }) // level 1: 1 EXP
    expect(expAfterWin(['lazy'], tiny)).toBe('2')
    // Cấp 6: −50% × 2 = −100% → hệ số 0.
    expect(expAfterWin([['lazy', 6]])).toBe('1')
  })

  it('EXP rất lớn vẫn chính xác (Decimal)', () => {
    const giant = fighter('e1', [], { level: 10000, skillIds: ['idle'] })
    const enemy = { ...giant, damageTaken: getMaxHp(data, giant).minus(1) }
    // 0,5 × 10000² = 5e7 → × 1,5 = 7,5e7, cộng EXP gốc 1.
    expect(expAfterWin(['diligent'], enemy)).toBe('75000001')
  })
})

describe('extraDropChance (Nhặt nhạnh)', () => {
  const drops = (party: Monster[], seed: number): number => {
    const state = withSeed(makeBattleState(party, [prey('e1')]), seed)
    return eventsOf(run(state, strikeTurn(state)), 'drop').length
  }

  it('nhân tỉ lệ rơi (kẹp 100); tính cả quái chưa ra sân', () => {
    const plain = SEEDS.map((seed) => drops([fighter('a')], seed))
    expect(plain).toContain(0)
    expect(plain).toContain(1)
    const picked = SEEDS.map((seed) =>
      drops([fighter('a'), fighter('b'), fighter('c', ['pickup'])], seed)
    )
    expect(new Set(picked)).toEqual(new Set([1]))
  })

  it('không nhân tỉ lệ rơi trứng boss', () => {
    const eggs = SEEDS.map((seed) => {
      const boss = { ...fighter('boss', [], { skillIds: ['idle'] }), bossMultiplier: 3 }
      boss.damageTaken = getMaxHp(data, boss).minus(1)
      const state = withSeed(
        makeBattleState([fighter('a', [['pickup', 10]])], [boss], { isBoss: true }),
        seed
      )
      return run(state, [command(0, 'strike')]).eggs.length
    })
    expect(eggs).toContain(0)
    expect(eggs).toContain(1)
  })
})

describe('eggHatchBoost (Ấp ủ)', () => {
  const eggOf = (id: string, battlesLeft: number): Egg => ({
    id,
    battlesLeft,
    monster: makeMonster({ id })
  })
  const battlesLeftAfterWin = (party: Monster[]): number[] => {
    const state = { ...makeBattleState(party, [prey('e1')]), eggs: [eggOf('x', 5)] }
    return run(state, strikeTurn(state)).eggs.map((egg) => egg.battlesLeft)
  }

  it('trứng giảm thêm extraCount; quái chưa ra sân hoặc đã gục cũng tính', () => {
    expect(battlesLeftAfterWin([fighter('a')])).toEqual([4])
    expect(battlesLeftAfterWin([fighter('a', ['nurturer'])])).toEqual([3])
    const fallen = fighter('c', ['nurturer'], { damageTaken: toBig('1e9') })
    expect(battlesLeftAfterWin([fighter('a'), fighter('b'), fallen])).toEqual([3])
  })

  it('không cộng dồn (lấy lớn nhất), không đổi theo cấp trait', () => {
    expect(
      battlesLeftAfterWin([fighter('a', ['nurturer']), fighter('b', [['nurturer2', 10]])])
    ).toEqual([2])
  })

  it('bộ đếm xuống dưới 0 vẫn nở', () => {
    const state = {
      ...makeBattleState([fighter('a', ['nurturer2'])], [prey('e1')]),
      eggs: [eggOf('x', 1)]
    }
    const next = run(state, [command(0, 'strike')])
    expect(next.eggs).toEqual([])
    expect(next.party.map((m) => m.id)).toEqual(['a', 'x'])
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (type: string, params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', type, params)), {
      regenerateText: true
    })

  it('params hợp lệ / sai', () => {
    expect(issuesFor('fleeChanceOverride', { chance: 100 })).toEqual([])
    expect(issuesFor('fleeWhenLowHp', { hpBelowPercent: 25, chance: 0.5 })).toEqual([])
    expect(issuesFor('extraDropChance', { percent: 0.1 })).toEqual([])
    expect(issuesFor('expRewardModifier', { percent: -15 })).toEqual([])
    expect(issuesFor('moneyRewardModifier', { percent: 15 })).toEqual([])
    expect(issuesFor('eggHatchBoost', { extraCount: 1 })).toEqual([])
    const cases: [string, unknown, string][] = [
      ['fleeChanceOverride', { chance: 0 }, 'chance'],
      ['fleeChanceOverride', { chance: 101 }, 'chance'],
      ['fleeWhenLowHp', { hpBelowPercent: 0, chance: 100 }, 'hpBelowPercent'],
      ['fleeWhenLowHp', { hpBelowPercent: 25 }, 'chance'],
      ['extraDropChance', { percent: 0 }, 'percent'],
      ['extraDropChance', { percent: -10 }, 'percent'],
      ['expRewardModifier', { percent: 0 }, 'khác 0'],
      ['moneyRewardModifier', {}, 'percent'],
      ['moneyRewardModifier', null, 'object'],
      ['eggHatchBoost', { extraCount: 0 }, 'extraCount'],
      ['eggHatchBoost', { extraCount: 1.5 }, 'extraCount']
    ]
    for (const [type, params, fragment] of cases) {
      expect(issuesFor(type, params).join('\n'), type).toContain(fragment)
    }
  })
})
