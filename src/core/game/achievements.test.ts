// Thành tựu và danh hiệu (docs/rules/achievements.md): bộ đếm ghi khi chơi, nhận thưởng bậc, đeo /
// đổi danh hiệu và hiệu ứng, kiểm tra save / dữ liệu, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { toBig } from '../shared'
import { requireBattleStart } from '../battle'
import { battleCatchChance } from '../battle/battleItems'
import { recruitChance } from '../battle/recruit'
import { safariCatchChance } from '../world'
import {
  FIXTURE_ACHIEVEMENT_IDS,
  FIXTURE_TITLE_IDS,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BallItem,
  BattleCommand,
  BattleEvent,
  BattleState,
  Egg,
  GameAction,
  GameData,
  GameState,
  Monster,
  RawGameData
} from '../model'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'

/** Fixture; xin theo chắc chắn (weakling catchRate 100) để test thu phục. */
const data: GameData = (() => {
  const raw = makeRawData()
  raw.config.recruit = { ...raw.config.recruit, baseChance: 100 }
  raw.species = raw.species.map((species) =>
    species.id === 'weakling' && species.kind === 'normal'
      ? { ...species, catchRate: 100 }
      : species
  )
  return createGameData(withFixtureText(raw))
})()

const { wins: WINS, pair: PAIR } = FIXTURE_ACHIEVEMENT_IDS
const { veteran: VETERAN, lucky: LUCKY } = FIXTURE_TITLE_IDS

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

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

const twoOnTwo = (overrides: Partial<BattleState> = {}): GameState =>
  makeBattleState([ally('a'), ally('b')], [weak('e1'), weak('e2')], overrides)

const win = (state: GameState): GameState =>
  act(state, { type: 'submitTurn', commands: [strike(0, 0), strike(1, 1)] })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const town = (overrides: Partial<GameState> = {}): GameState => ({
  ...makeGameState({ seed: 1, party: [ally('a')], highestFloor: 3 }),
  ...overrides
})

const withStats = (state: GameState, stats: Partial<GameState['stats']>): GameState => ({
  ...state,
  stats: { ...state.stats, ...stats }
})

const wearing = (state: GameState, titleId: string): GameState => ({
  ...state,
  titles: { owned: [titleId], active: titleId }
})

describe('bộ đếm ghi khi chơi', () => {
  it('thắng trận: + trận thắng; trận boss: + boss; state hợp lệ', () => {
    const won = win(twoOnTwo())
    expect(won.stats).toMatchObject({ battlesWon: 1, bossesDefeated: 0 })
    expect(validateGameState(data, won)).toEqual([])
    const boss = win(twoOnTwo({ isBoss: true }))
    expect(boss.stats).toMatchObject({ battlesWon: 1, bossesDefeated: 1 })
  })

  it('quái bắt được (kể cả khi chạy) tính quái bắt / shiny bắt; chạy không tính trận thắng', () => {
    const state = twoOnTwo()
    const captured = [weak('c1'), weak('c2', { shinyStacks: 1 })]
    const fled = act({ ...state, battle: { ...battleOf(state), captured } }, { type: 'flee' })
    expect(battleOf(fled).outcome).toBe('fled')
    expect(fled.stats).toMatchObject({ battlesWon: 0, monstersCaught: 2, shinyCaught: 1 })
  })

  it('nhận quái xin theo: + quái bắt', () => {
    const won = win(twoOnTwo())
    expect(battleOf(won).recruitOfferId).not.toBeNull()
    const accepted = act(won, { type: 'acceptRecruit' })
    expect(accepted.stats.monstersCaught).toBe(won.stats.monstersCaught + 1)
  })

  it('trứng nở sau trận thắng: + trứng nở', () => {
    const egg: Egg = { id: 'x', battlesLeft: 1, infusions: [], monster: makeMonster({ id: 'x' }) }
    const won = win({ ...twoOnTwo(), eggs: [egg] })
    expect(eventsOf(won, 'eggHatched')).toHaveLength(1)
    expect(won.stats.eggsHatched).toBe(1)
  })

  it('fuse thành công: + fuse; breed: + breed', () => {
    const fusing = makeGameState({
      seed: 1,
      party: [
        makeMonster({ id: 'a' }),
        makeMonster({ id: 'b', speciesId: 'twig', baseSpeciesId: 'twig' }),
        makeMonster({ id: 'c' })
      ],
      money: toBig(10_000)
    })
    expect(act(fusing, { type: 'fuse', baseId: 'a', subId: 'b' }).stats.fusions).toBe(1)
    const breeding = makeGameState({
      seed: 3,
      party: [makeMonster({ id: 'f', gender: 'male' }), makeMonster({ id: 'm' })],
      money: toBig(1000),
      nextMonsterId: 50
    })
    expect(act(breeding, { type: 'breed', fatherId: 'f', motherId: 'm' }).stats.breeds).toBe(1)
  })
})

describe('nhận thưởng thành tựu', () => {
  it('nhận mọi bậc đã đạt một lần: tiền × highestFloor, vật phẩm, danh hiệu', () => {
    const claimed = act(withStats(town(), { battlesWon: 3 }), {
      type: 'claimAchievement',
      achievementId: WINS
    })
    expect(claimed.money.toNumber()).toBe(100 * 3)
    expect(claimed.inventory.stacks.potion).toBe(2)
    expect(claimed.titles).toEqual({ owned: [VETERAN], active: null })
    expect(claimed.achievements.claimedTiers).toEqual({ [WINS]: 2 })
    expect(validateGameState(data, claimed)).toEqual([])
  })

  it('bậc lặp không trần: 6, 12, ... mỗi bậc thưởng repeat; nhận tiếp từ bậc chưa nhận', () => {
    const first = act(withStats(town(), { battlesWon: 3 }), {
      type: 'claimAchievement',
      achievementId: WINS
    })
    const later = act(withStats(first, { battlesWon: 12 }), {
      type: 'claimAchievement',
      achievementId: WINS
    })
    expect(later.achievements.claimedTiers[WINS]).toBe(4)
    expect(later.money.minus(first.money).toNumber()).toBe(2 * 1000 * 3)
    // Số cực lớn: mọi bậc lặp tới MAX_SAFE_INTEGER nhận một lần.
    const huge = act(withStats(town(), { battlesWon: Number.MAX_SAFE_INTEGER }), {
      type: 'claimAchievement',
      achievementId: WINS
    })
    expect(huge.achievements.claimedTiers[WINS]).toBeGreaterThan(40)
    expect(validateGameState(data, huge)).toEqual([])
  })

  it('danh hiệu đã có thì không thêm lần nữa', () => {
    const owned = { ...town(), titles: { owned: [LUCKY], active: LUCKY } }
    const state = { ...owned, dex: { ...owned.dex, owned: ['weakling', 'strongling'] } }
    const claimed = act(state, { type: 'claimAchievement', achievementId: PAIR })
    expect(claimed.titles).toEqual({ owned: [LUCKY], active: LUCKY })
  })

  it('lỗi: đang trận, thành tựu lạ, chưa đạt, đã nhận hết; state giữ nguyên', () => {
    const state = withStats(town(), { battlesWon: 0 })
    const before = serializeState(state)
    const claim = (s: GameState, achievementId: string) => () =>
      act(s, { type: 'claimAchievement', achievementId })
    expectActionError(claim(twoOnTwo(), WINS), 'inBattle')
    expectActionError(claim(state, 'ghost'), 'achievementNotFound', { achievementId: 'ghost' })
    expectActionError(claim(state, WINS), 'achievementNotReached', { need: 1, have: 0 })
    const done = { ...state, achievements: { claimedTiers: { [PAIR]: 1 } } }
    expectActionError(claim(done, PAIR), 'achievementCompleted', { achievementId: PAIR })
    expect(serializeState(state)).toEqual(before)
  })
})

describe('đeo danh hiệu', () => {
  const owning = { ...town(), titles: { owned: [VETERAN, LUCKY], active: null } }

  it('đeo / đổi / tháo miễn phí; đeo lại cái đang đeo giữ nguyên state', () => {
    const worn = act(owning, { type: 'setTitle', titleId: VETERAN })
    expect(worn.titles.active).toBe(VETERAN)
    expect(worn.money).toEqual(owning.money)
    expect(act(worn, { type: 'setTitle', titleId: LUCKY }).titles.active).toBe(LUCKY)
    expect(act(worn, { type: 'setTitle', titleId: null }).titles.active).toBeNull()
    expect(act(worn, { type: 'setTitle', titleId: VETERAN })).toBe(worn)
  })

  it('lỗi: đang trận, danh hiệu lạ, chưa có, sai dạng', () => {
    const set = (s: GameState, titleId: unknown) => () =>
      // Ép kiểu: cố ý gửi action sai dạng như renderer có thể gửi lúc chạy.
      act(s, { type: 'setTitle', titleId } as GameAction)
    expectActionError(set({ ...twoOnTwo(), titles: owning.titles }, VETERAN), 'inBattle')
    expectActionError(set(owning, 'ghost'), 'titleNotFound', { titleId: 'ghost' })
    expectActionError(set(town(), VETERAN), 'titleNotOwned', { titleId: VETERAN })
    expectActionError(set(owning, 7), 'malformedAction')
  })
})

describe('hiệu ứng danh hiệu đang đeo', () => {
  const moneyOf = (state: GameState): number => eventsOf(state, 'won')[0]?.money.toNumber() ?? NaN
  const expOf = (state: GameState): number =>
    eventsOf(state, 'expGain')[0]?.amount.toNumber() ?? NaN

  it('tiền ×2 (lucky), EXP ×1,5 (veteran)', () => {
    const base = win(twoOnTwo())
    expect(moneyOf(base)).toBeGreaterThan(0)
    expect(moneyOf(win(wearing(twoOnTwo(), LUCKY)))).toBe(moneyOf(base) * 2)
    expect(expOf(win(wearing(twoOnTwo(), VETERAN)))).toBe(Math.floor(expOf(base) * 1.5))
  })

  it('tỉ lệ bắt ×2 (trong trận, khu bảo tồn), shiny ×2, % thu phục +100', () => {
    const ball = data.items.ball as BallItem
    const state = makeBattleState([ally('a')], [makeMonster({ id: 'e1', bossMultiplier: 50 })])
    const chanceIn = (s: GameState): number =>
      battleCatchChance(
        data,
        { ...s, battle: battleOf(s) },
        { ball, target: battleOf(s).enemies[0], user: s.party[0] }
      )
    const base = chanceIn(state)
    expect(base).toBeGreaterThan(0)
    expect(base).toBeLessThan(50)
    expect(chanceIn(wearing(state, LUCKY))).toBeCloseTo(base * 2)

    const encounter = {
      monster: makeMonster({ id: 'w', bossMultiplier: 50 }),
      misses: 0,
      lure: null
    }
    const safariBase = safariCatchChance(data, town(), encounter)
    expect(safariCatchChance(data, wearing(town(), LUCKY), encounter)).toBeCloseTo(safariBase * 2)

    const onFloor = { ...town(), location: { type: 'floor', floor: 1 } as const }
    const shiny = (s: GameState): number => requireBattleStart(data, s).odds?.shinyMultiplier ?? NaN
    expect(shiny(wearing(onFloor, LUCKY))).toBe(2 * shiny(onFloor))

    const lower = createGameData(withFixtureText(makeRawData()))
    const enemy = weak('e1')
    const plain = recruitChance(lower, town(), { enemy, isBoss: false })
    expect(plain).toBeLessThan(50)
    expect(recruitChance(lower, wearing(town(), LUCKY), { enemy, isBoss: false })).toBeCloseTo(
      plain * 2
    )
  })
})

describe('save', () => {
  it('kiểm tra stats / achievements / titles', () => {
    const state = town()
    expect(validateGameState(data, state)).toEqual([])
    expect(validateGameState(data, withStats(state, { fusions: -1 }))).toHaveLength(1)
    expect(validateGameState(data, withStats(state, { fusions: 1.5 }))).toHaveLength(1)
    expect(
      validateGameState(data, {
        ...state,
        stats: { ...state.stats, extra: 1 } as GameState['stats']
      })
    ).toEqual(['stats: trường "extra" không thuộc bộ đếm'])
    const claimed = (claimedTiers: Record<string, number>): GameState => ({
      ...state,
      achievements: { claimedTiers }
    })
    expect(validateGameState(data, claimed({ [WINS]: 50 }))).toEqual([])
    expect(validateGameState(data, claimed({ ghost: 1 }))).toEqual([
      'achievements.claimedTiers.ghost: thành tựu không tồn tại'
    ])
    expect(validateGameState(data, claimed({ [PAIR]: 2 }))).toEqual([
      `achievements.claimedTiers.${PAIR}: thành tựu không có tới 2 bậc`
    ])
    expect(validateGameState(data, claimed({ [WINS]: 0 }))).toHaveLength(1)
    const titles = (owned: string[], active: string | null): GameState => ({
      ...state,
      titles: { owned, active }
    })
    expect(validateGameState(data, titles([VETERAN], VETERAN))).toEqual([])
    expect(validateGameState(data, titles([VETERAN, VETERAN], null))).toHaveLength(1)
    expect(validateGameState(data, titles(['ghost'], null))).toHaveLength(1)
    expect(validateGameState(data, titles([VETERAN], LUCKY))).toHaveLength(1)
  })

  it('lưu / đọc giữ nguyên; migrate v85 → v86 thêm bộ đếm 0, chưa nhận, chưa có danh hiệu', () => {
    const state = wearing(withStats(town(), { battlesWon: 7 }), VETERAN)
    expect(migrateState(serializeState(state), data)).toEqual(state)
    const old = serializeState(town()) as Record<string, unknown>
    const { stats: _stats, achievements: _achievements, titles: _titles, ...rest } = old
    const migrated = migrateState({ ...rest, version: 85 }, data)
    expect(migrated.stats).toEqual(town().stats)
    expect(migrated.achievements).toEqual({ claimedTiers: {} })
    expect(migrated.titles).toEqual({ owned: [], active: null })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesOf = (edit: (raw: RawGameData) => void): string[] =>
    dataIssuesAfter(edit, { regenerateText: true })
  const winsOf = (raw: RawGameData): RawGameData['achievements'][number] =>
    defined(raw.achievements.find((a) => a.id === WINS))
  const pairOf = (raw: RawGameData): RawGameData['achievements'][number] =>
    defined(raw.achievements.find((a) => a.id === PAIR))

  it('dữ liệu fixture hợp lệ', () => {
    expect(issuesOf(() => {})).toEqual([])
  })

  it('báo lỗi điều kiện, bậc, bậc lặp, thưởng', () => {
    const where = `Thành tựu "${WINS}"`
    expect(issuesOf((raw) => (winsOf(raw).condition = { type: 'stat', key: 'naps' }))).toEqual([
      `${where}: condition: khóa bộ đếm lạ "naps"`
    ])
    expect(
      issuesOf((raw) => (winsOf(raw).condition = { type: 'luck' as 'stat', key: 'fusions' }))
    ).toEqual([`${where}: condition: loại "luck" chưa có trong registry`])
    expect(
      issuesOf((raw) => (winsOf(raw).condition = { type: 'dexOwned', key: 'fusions' }))
    ).toEqual([`${where}: condition: trường "key" không thuộc loại "dexOwned"`])
    expect(issuesOf((raw) => (winsOf(raw).tiers = []))).toEqual([
      `${where}: tiers phải là danh sách không rỗng`
    ])
    expect(
      issuesOf((raw) => (winsOf(raw).tiers = [...winsOf(raw).tiers, { value: 3, rewards: {} }]))
    ).toEqual([`${where}: tiers[2].value phải là số > 3 (tăng dần), nhận 3`])
    expect(
      issuesOf((raw) => (winsOf(raw).repeat = { factor: 1, rewards: { titleId: VETERAN } }))
    ).toEqual([
      `${where}: repeat.factor phải là số > 1, nhận 1`,
      `${where}: repeat.rewards: bậc lặp không được thưởng danh hiệu`
    ])
    expect(
      issuesOf((raw) => {
        winsOf(raw).tiers[0].rewards = {
          moneyPerFloor: -1,
          items: [{ itemId: 'nothing', count: 1 }],
          titleId: 'ghost'
        }
      })
    ).toHaveLength(3)
    const pair = `Thành tựu "${PAIR}"`
    expect(issuesOf((raw) => (pairOf(raw).tiers = [{ value: 3, rewards: {} }]))).toEqual([
      `${pair}: tiers[0].value 3 vượt tiến độ tối đa 2`
    ])
    expect(issuesOf((raw) => (pairOf(raw).repeat = { factor: 2, rewards: {} }))).toEqual([
      `${pair}: điều kiện có trần 2, không có bậc lặp`
    ])
  })

  it('báo lỗi danh hiệu: hiệu ứng lạ / % sai; danh sách hiệu ứng rỗng hợp lệ', () => {
    const titleOf = (raw: RawGameData): RawGameData['titles'][number] =>
      defined(raw.titles.find((t) => t.id === VETERAN))
    const where = `Danh hiệu "${VETERAN}"`
    expect(issuesOf((raw) => (titleOf(raw).effects = []))).toEqual([])
    expect(
      issuesOf((raw) => (titleOf(raw).effects = [{ type: 'luck' as 'expPercent', params: {} }]))
    ).toEqual([`${where}: effects[0]: loại hiệu ứng lạ "luck"`])
    expect(
      issuesOf((raw) => {
        titleOf(raw).effects = [{ type: 'expPercent', params: { percent: 0, extra: 1 } }]
      })
    ).toEqual([
      `${where}: effects[0] (expPercent): percent phải khác 0`,
      `${where}: effects[0] (expPercent): trường lạ "extra"`
    ])
  })
})
