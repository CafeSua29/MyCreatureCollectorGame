// Cuồng bạo (docs/rules/frenzy.md): kích hoạt cuối lượt (ngưỡng HP, phe đang thua, một lần mỗi
// trận), vai trò (quái hoang / boss / quái có chủ race khó kiểm soát / Thiên Kiếp), % công / đặc
// công, hành động thêm (tất định, tối đa 1 mỗi lượt), mất điều khiển, trait, kiểm tra dữ liệu, save.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { deserializeState, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { getMaxHp } from '../monster'
import { frenzyRole, frenzyThreshold } from '../registries'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  BigStats,
  FrenzyRole,
  FrenzyRoleNumbers,
  GameData,
  GameState,
  Monster,
  RawGameData
} from '../model'
import { battleStats, cloneDraft, markUsedOnce, monsterBattleContext } from './draft'
import { suggestBattleCommands } from './ai'

const ROLES = {
  tamed: { hpThresholdPercent: 25, statPercent: 30, extraActionChance: 0 },
  unbound: { hpThresholdPercent: 0, statPercent: 15, extraActionChance: 0 },
  wild: { hpThresholdPercent: 25, statPercent: 15, extraActionChance: 0 },
  boss: { hpThresholdPercent: 30, statPercent: 20, extraActionChance: 0 },
  worldBoss: { hpThresholdPercent: 0, statPercent: 30, extraActionChance: 0, fromTurn: 5 }
}

/** Dữ liệu fixture có số cuồng bạo, race khó kiểm soát `wyrm` và hai trait cuồng bạo. */
function makeData(edit: (roles: Record<string, FrenzyRoleNumbers>) => void = () => {}): GameData {
  const raw = makeRawData()
  const roles = structuredClone(ROLES)
  edit(roles)
  raw.config.frenzy = { roles }
  addFrenzyContent(raw)
  return createGameData(withFixtureText(raw))
}

function addFrenzyContent(raw: RawGameData): void {
  const neutral = defined(
    raw.races.find((race) => race.id === 'neutral'),
    'race neutral'
  )
  raw.races.push({ ...neutral, id: 'wyrm', breedsWith: ['wyrm'], frenzyProne: true })
  raw.traits.push(
    {
      id: 'rageBorn',
      kind: 'rare',
      exclusiveGroup: 'frenzy',
      hooks: [{ type: 'frenzyThresholdBonus', params: { percent: 10 } }]
    },
    {
      id: 'composure',
      kind: 'rare',
      exclusiveGroup: 'frenzy',
      hooks: [{ type: 'frenzyImmune', params: {} }]
    }
  )
}

const data = makeData()

/** Quái mẫu mọi chỉ số 50, chỉ biết idle (không đổi HP) và strike. */
const fighter = (id: string, extra: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], ...extra })
const wyrm = (id: string, extra: MonsterOverrides = {}): Monster =>
  fighter(id, { raceId: 'wyrm', ...extra })

/** Bản sao quái với HP còn lại `percent` % max HP (làm tròn xuống). */
function atHpPercent(monster: Monster, percent: number): Monster {
  const max = getMaxHp(data, monster)
  const left = max.times(percent).div(100).floor()
  return { ...monster, damageTaken: max.minus(left) }
}

const idle = (slot: number): BattleCommand => ({ slot, kind: 'skill', skillId: 'idle' })
const run = (state: GameState, commands: BattleCommand[], gameData = data): GameState =>
  gameReducer(gameData, state, { type: 'submitTurn', commands })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = (state: GameState, type: BattleEvent['type']): BattleEvent[] =>
  battleOf(state).log.filter((event) => event.type === type)
const frenzied = (state: GameState): string[] =>
  Object.entries(battleOf(state).usedOnce).flatMap(([id, effects]) =>
    effects.includes('frenzy') ? [id] : []
  )

/** Đặt quái `id` đã cuồng bạo (giữa hai lượt). */
function withFrenzy(state: GameState, id: string): GameState {
  const d = cloneDraft(state)
  markUsedOnce(d, id, 'frenzy')
  return d
}

describe('kích hoạt cuối lượt', () => {
  it('quái hoang HP ≤ ngưỡng và phe đang thua thì cuồng bạo, log frenzy', () => {
    const state = makeBattleState([fighter('a')], [atHpPercent(fighter('e1'), 20)])
    const after = run(state, [idle(0)])
    expect(frenzied(after)).toEqual(['e1'])
    expect(eventsOf(after, 'frenzy')).toEqual([{ type: 'frenzy', monsterId: 'e1' }])
  })

  it('biên ngưỡng: đúng 25% thì có, 26% thì không', () => {
    const at = run(makeBattleState([fighter('a')], [atHpPercent(fighter('e1'), 25)]), [idle(0)])
    expect(frenzied(at)).toEqual(['e1'])
    const above = run(makeBattleState([fighter('a')], [atHpPercent(fighter('e1'), 26)]), [idle(0)])
    expect(frenzied(above)).toEqual([])
  })

  it('phe không thua (tổng % HP cả phe không thấp hơn) thì không cuồng bạo', () => {
    // Địch 20% nhưng phe ta 10% (cả đội): địch đang thắng; quái ta race khó kiểm soát thì cuồng bạo.
    const state = makeBattleState([atHpPercent(wyrm('a'), 10)], [atHpPercent(fighter('e1'), 20)])
    const after = run(state, [idle(0)])
    expect(frenzied(after)).toEqual(['a'])
    // Bằng nhau không tính là thua.
    const tied = run(
      makeBattleState([atHpPercent(wyrm('a'), 20)], [atHpPercent(fighter('e1'), 20)]),
      [idle(0)]
    )
    expect(frenzied(tied)).toEqual([])
  })

  it('tổng % HP tính cả dự bị', () => {
    // Quái trên sân 20% nhưng dự bị đầy máu: phe ta (2 quái) vẫn hơn địch 22% → ta không thua.
    const state = makeBattleState(
      [atHpPercent(wyrm('a'), 20), fighter('b'), fighter('c')],
      [atHpPercent(fighter('e1'), 22), atHpPercent(fighter('e2'), 22)]
    )
    expect(frenzied(run(state, [idle(0), idle(1)]))).toEqual(['e1', 'e2'])
  })

  it('một lần mỗi trận: không log lại ở lượt sau', () => {
    const first = run(makeBattleState([fighter('a')], [atHpPercent(fighter('e1'), 10)]), [idle(0)])
    const second = run(first, [idle(0)])
    expect(eventsOf(second, 'frenzy')).toHaveLength(1)
    expect(battleOf(second).usedOnce.e1).toEqual(['frenzy'])
  })

  it('quái có chủ race thường không bao giờ cuồng bạo', () => {
    const state = makeBattleState([atHpPercent(fighter('a'), 10)], [fighter('e1')])
    expect(frenzied(run(state, [idle(0)]))).toEqual([])
  })

  it('số cực lớn: HP 1e300 vẫn so đúng ngưỡng và phe thua', () => {
    const huge = fighter('e1', { genes: toBigStats({ ...uniformStats(10), hp: '1e300' }) })
    const max = getMaxHp(data, huge)
    const hurt = { ...huge, damageTaken: max.times(0.9) }
    const after = run(makeBattleState([fighter('a')], [hurt]), [idle(0)])
    expect(frenzied(after)).toEqual(['e1'])
  })
})

describe('vai trò', () => {
  const role = (
    battle: Partial<BattleState>,
    side: 'player' | 'enemy',
    monster: Monster
  ): FrenzyRole | null =>
    frenzyRole(
      data,
      { ...battleOf(makeBattleState([fighter('a')], [fighter('e1')])), ...battle },
      {
        side,
        monster
      }
    )

  it('quái hoang thường / boss / Thiên Kiếp', () => {
    expect(role({}, 'enemy', fighter('e1'))).toBe('wild')
    expect(role({ isBoss: true }, 'enemy', fighter('e1'))).toBe('boss')
    expect(role({ tribulation: { monsterId: 'a', tier: 1 } }, 'enemy', fighter('e1'))).toBeNull()
  })

  it('quái có chủ (người chơi, NPC) chỉ khi race khó kiểm soát', () => {
    const trainer = { classId: 'x', mode: 'floor' as const, elementId: null, rewardMultiplier: 1 }
    expect(role({}, 'player', fighter('a'))).toBeNull()
    expect(role({}, 'player', wyrm('a'))).toBe('tamed')
    expect(role({ trainer }, 'enemy', fighter('e1'))).toBeNull()
    expect(role({ trainer }, 'enemy', wyrm('e1'))).toBe('tamed')
    // Quái người chơi race khó kiểm soát vẫn cuồng bạo trong trận độ kiếp.
    expect(role({ tribulation: { monsterId: 'a', tier: 1 } }, 'player', wyrm('a'))).toBe('tamed')
  })

  it('quái người chơi chưa khế ước: unbound (race khó kiểm soát vẫn là tamed)', () => {
    expect(role({}, 'player', { ...fighter('a'), contractRealm: null })).toBe('unbound')
    expect(role({}, 'player', { ...wyrm('a'), contractRealm: null })).toBe('tamed')
    expect(role({}, 'player', fighter('a'))).toBeNull()
  })

  it('boss dùng ngưỡng của boss (30%)', () => {
    const state = makeBattleState([fighter('a')], [atHpPercent(fighter('e1'), 30)], {
      isBoss: true
    })
    expect(frenzied(run(state, [idle(0)]))).toEqual(['e1'])
  })
})

describe('hiệu ứng', () => {
  it('% công / đặc công theo vai trò cộng vào bước trait, chỉ số khác giữ nguyên', () => {
    const state = makeBattleState([wyrm('a')], [fighter('e1')])
    const before = cloneDraft(state)
    const after = cloneDraft(withFrenzy(withFrenzy(state, 'a'), 'e1'))
    const stat = (d: typeof before, id: string): BigStats =>
      battleStats(
        data,
        d,
        defined(
          [...d.party, ...d.battle.enemies].find((m) => m.id === id),
          id
        )
      )
    for (const [id, percent] of [
      ['a', 30],
      ['e1', 15]
    ] as const) {
      const ctx = defined(
        monsterBattleContext(data, after, defined(after.party[0], 'a')),
        'bối cảnh'
      )
      if (id === 'a') expect(ctx.frenzyStatPercent).toBe(30)
      const ratio = stat(after, id).attack.div(stat(before, id).attack).toNumber()
      expect(ratio).toBeCloseTo(1 + percent / 100, 1)
      expect(stat(after, id).spAttack.gt(stat(before, id).spAttack)).toBe(true)
      expect(stat(after, id).defense.eq(stat(before, id).defense)).toBe(true)
    }
  })

  it('hành động thêm: tỉ lệ 100% thì dùng thêm đúng một skill mỗi lượt; 0% thì không', () => {
    const always = makeData((roles) => {
      roles.wild.extraActionChance = 100
    })
    const state = withFrenzy(makeBattleState([fighter('a')], [fighter('e1')]), 'e1')
    const after = run(state, [idle(0)], always)
    const uses = eventsOf(after, 'useSkill').filter(
      (event) => event.type === 'useSkill' && event.monsterId === 'e1'
    )
    expect(uses).toHaveLength(2)
    expect(eventsOf(after, 'frenzyAction')).toEqual([{ type: 'frenzyAction', monsterId: 'e1' }])
    // Tất định theo seed.
    expect(run(state, [idle(0)], always)).toEqual(after)

    const never = run(state, [idle(0)])
    expect(eventsOf(never, 'frenzyAction')).toEqual([])
  })
})

describe('mất điều khiển', () => {
  const state = withFrenzy(makeBattleState([wyrm('a'), fighter('b')], [fighter('e1')]), 'a')

  it('ra lệnh cho quái cuồng bạo báo monsterFrenzied, state giữ nguyên', () => {
    const before = cloneDraft(state)
    expectActionError(() => run(state, [idle(0), idle(1)]), 'monsterFrenzied', {
      monsterId: 'a'
    })
    expect(state).toEqual(before)
  })

  it('thiếu lệnh của ô thường vẫn báo lỗi; ô cuồng bạo do AI chọn', () => {
    expect(() => run(state, [])).toThrow()
    const after = run(state, [idle(1)])
    expect(eventsOf(after, 'useSkill')).toContainEqual({
      type: 'useSkill',
      monsterId: 'a',
      skillId: 'idle'
    })
  })

  it('gợi ý lệnh (tự đánh) bỏ qua ô cuồng bạo và hợp lệ cho submitTurn', () => {
    const suggested = suggestBattleCommands(data, state)
    expect(suggested.map((command) => command.slot)).toEqual([1])
    expect(() => run(state, suggested)).not.toThrow()
  })
})

describe('trait', () => {
  const thresholdOf = (traits: string[]): number | null =>
    frenzyThreshold(data, {
      monster: fighter('e1', { traits: traits.map((id) => ({ id, level: 1 })) }),
      role: 'wild',
      difficulty: 'normal'
    })

  it('Cuồng tính +10 điểm ngưỡng, Điềm tĩnh không bao giờ cuồng bạo', () => {
    expect(thresholdOf([])).toBe(25)
    expect(thresholdOf(['rageBorn'])).toBe(35)
    expect(thresholdOf(['composure'])).toBeNull()
    const calm = fighter('e1', { traits: [{ id: 'composure', level: 1 }] })
    expect(
      frenzied(run(makeBattleState([fighter('a')], [atHpPercent(calm, 10)]), [idle(0)]))
    ).toEqual([])
    const rage = fighter('e1', { traits: [{ id: 'rageBorn', level: 1 }] })
    expect(
      frenzied(run(makeBattleState([fighter('a')], [atHpPercent(rage, 35)]), [idle(0)]))
    ).toEqual(['e1'])
  })
})

describe('kiểm tra dữ liệu và save', () => {
  it('báo lỗi config và race sai', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.frenzy.roles.wild.hpThresholdPercent = 150
      ;(raw.config.frenzy.roles.boss as unknown as Record<string, unknown>).extra = 1
      ;(raw.races[0] as unknown as Record<string, unknown>).frenzyProne = 'yes'
    })
    expect(issues.some((issue) => issue.includes('roles.wild.hpThresholdPercent'))).toBe(true)
    expect(issues.some((issue) => issue.includes('extra'))).toBe(true)
    expect(issues.some((issue) => issue.includes('frenzyProne'))).toBe(true)
  })

  it('save giữa trận có quái cuồng bạo đọc lại được', () => {
    const state = withFrenzy(makeBattleState([fighter('a')], [fighter('e1')]), 'e1')
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    const loaded = migrateState(deserializeState(raw), data)
    expect(validateGameState(data, loaded)).toEqual([])
    expect(defined(loaded.battle, 'trận').usedOnce).toEqual({ e1: ['frenzy'] })
  })
})
