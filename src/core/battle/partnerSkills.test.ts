// Kỹ năng đồng hành (docs/rules/partner-skills.md): quái ô 0 còn sống, kỹ năng theo race / loài ghi
// đè, sức mạnh theo thân mật, từng loại hiệu ứng (bắt, tiền, EXP, đồ rơi, shiny, boss, chạy trốn,
// trứng, chỉ số trong trận), bật / tắt khi gục / hồi sinh, kiểm tra dữ liệu và save.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { computeStats, getMaxHp } from '../monster'
import { getMonsterView } from '../roster'
import { activePartner, partnerAmount, partnerSkillIdOf, partnerStrength } from '../tamer'
import { toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeFieldMoveRawData,
  makeGameState,
  makeInventory,
  makeMonster,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  RawGameData
} from '../model'
import { battleStats, monsterBattleContext, type Draft } from './draft'
import { loseHp, reviveMonster } from './hpChanges'

/**
 * Race neutral (mọi quái fixture) mang "boost" (mọi loại hiệu ứng), loài strongling ghi đè "shy"
 * (tiền −50%). Chạy trốn chung 50%, đồ rơi của map 50%.
 */
function makePartnerData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeFieldMoveRawData()
  const percent = (type: string, value: number): { type: string; params: unknown } => ({
    type,
    params: { percent: value }
  })
  raw.partnerSkills.push(
    {
      id: 'boost',
      effects: [
        percent('catchRatePercent', 100),
        percent('moneyPercent', 50),
        percent('expPercent', 50),
        percent('dropRatePercent', 100),
        percent('shinyChancePercent', 100),
        percent('bossChancePercent', 100),
        percent('fleeChancePercent', 100),
        { type: 'eggStepBonus', params: { count: 1 } },
        { type: 'teamStatPercent', params: { percent: { attack: 20 } } }
      ]
    },
    { id: 'shy', effects: [percent('moneyPercent', -50)] }
  )
  raw.races[0].partnerSkillId = 'boost'
  const strongling = defined(raw.species.find((species) => species.id === 'strongling'))
  if (strongling.kind === 'normal') strongling.partnerSkillId = 'shy'
  raw.config.battle.fleeChance = 50
  for (const biome of raw.biomes) {
    biome.drops = biome.drops.map((drop) => ({ ...drop, chance: 50 }))
  }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makePartnerData()

const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })
/** Quái loài strongling: kỹ năng ghi đè "shy". */
const shy = (id: string, overrides: MonsterOverrides = {}): Monster =>
  fighter(id, { speciesId: 'strongling', baseSpeciesId: 'strongling', ...overrides })
const fallen = (id: string): Monster => fighter(id, { damageTaken: toBig('1e9') })

/** Quái hoang level 4 sắp gục (8 EXP, 20 tiền khi bị hạ). */
const prey = (id: string): Monster =>
  fighter(id, { level: 4, exp: toBig(64), damageTaken: toBig(60), skillIds: ['idle'] })

const command = (slot: number, skillId: string): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0
})
/** Ô có quái đầu tiên còn sống đánh, ô còn lại đứng yên. */
const strikeTurn = (state: GameState, slot = 0): BattleCommand[] =>
  battleOf(state).playerSlots.flatMap((id, i) =>
    id === null ? [] : [command(i, i === slot ? 'strike' : 'idle')]
  )
const run = (state: GameState, commands: BattleCommand[], gameData = data): GameState =>
  gameReducer(gameData, state, { type: 'submitTurn', commands })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)
const withSeed = (state: GameState, seed: number): GameState => ({ ...state, rng: seed })

describe('quái đồng hành', () => {
  it('kỹ năng theo race, loài gốc ghi đè', () => {
    expect(partnerSkillIdOf(data, fighter('a'))).toBe('boost')
    expect(partnerSkillIdOf(data, shy('a'))).toBe('shy')
  })

  it('sức mạnh = 1 + 0,25 × bậc thân mật (bậc 0 = mức đầu)', () => {
    expect(partnerStrength(data, fighter('a', { affinity: 0 }))).toBe(1)
    expect(partnerStrength(data, fighter('a', { affinity: 99 }))).toBe(1)
    expect(partnerStrength(data, fighter('a', { affinity: 100 }))).toBe(1.25)
    expect(partnerStrength(data, fighter('a', { affinity: 255 }))).toBe(1.5)
  })

  it('chỉ ô 0 còn sống; ô 0 gục hoặc đội rỗng thì không có', () => {
    expect(activePartner(data, [shy('a'), fighter('b')])?.skill.id).toBe('shy')
    expect(activePartner(data, [fallen('a'), fighter('b')])).toBeNull()
    expect(activePartner(data, [])).toBeNull()
  })

  it('lượng theo kênh nhân sức mạnh; kênh không có hiệu ứng là 0', () => {
    const bonded = [fighter('a', { affinity: 200 })]
    expect(partnerAmount(data, bonded, 'moneyPercent')).toBe(75)
    expect(partnerAmount(data, [shy('a')], 'catchRatePercent')).toBe(0)
    expect(partnerAmount(data, [fallen('a')], 'moneyPercent')).toBe(0)
  })

  it('số trận trứng làm tròn xuống sau khi nhân sức mạnh', () => {
    const strong = makePartnerData((raw) => (raw.config.partnerSkill.strengthPerTier = 0.75))
    expect(partnerAmount(strong, [fighter('a', { affinity: 100 })], 'eggStepBonus')).toBe(1)
    expect(partnerAmount(strong, [fighter('a', { affinity: 200 })], 'eggStepBonus')).toBe(2)
  })

  it('MonsterView hiện kỹ năng và sức mạnh', () => {
    const state = makeGameState({ seed: 1, party: [shy('a', { affinity: 150 })] })
    const view = defined(getMonsterView(data, state, 'a'))
    expect(view.partnerSkillId).toBe('shy')
    expect(view.partnerStrength).toBe(1.25)
  })
})

describe('phần thưởng khi thắng', () => {
  const moneyWon = (party: Monster[], slot = 0): string => {
    const state = makeBattleState(party, [prey('e1')], {
      participants: party.slice(0, 2).map((m) => m.id)
    })
    return run(state, strikeTurn(state, slot)).money.minus(state.money).toString()
  }

  it('tiền nhân theo kỹ năng của quái ô 0, kể cả % âm', () => {
    expect(moneyWon([fighter('a')])).toBe('30')
    expect(moneyWon([shy('a')])).toBe('10')
    // Quái đồng hành không cần ra sân: chỉ cần đứng ô 0 (ở đây đánh là ô 1).
    expect(moneyWon([fighter('a', { skillIds: ['idle'] }), shy('b')], 1)).toBe('30')
  })

  it('thân mật cao mạnh hơn; ô 0 gục thì không có', () => {
    expect(moneyWon([fighter('a', { affinity: 255 })])).toBe('35')
    const state = makeBattleState([fallen('a'), shy('b')], [prey('e1')], {
      participants: ['a', 'b']
    })
    expect(
      run(state, [command(1, 'strike')])
        .money.minus(state.money)
        .toString()
    ).toBe('20')
  })

  it('EXP quái nhận nhân hệ số, làm tròn xuống', () => {
    const state = makeBattleState([fighter('a')], [prey('e1')])
    const next = run(state, [command(0, 'strike')])
    // EXP gốc 1 + 8 × 1,5.
    expect(defined(next.party[0]).exp.toString()).toBe('13')
  })

  it('EXP rất lớn vẫn chính xác (Decimal)', () => {
    const giant = fighter('e1', { level: 10000, skillIds: ['idle'] })
    const enemy = { ...giant, damageTaken: getMaxHp(data, giant).minus(1) }
    const next = run(makeBattleState([fighter('a')], [enemy]), [command(0, 'strike')])
    // 0,5 × 10000² = 5e7 → × 1,5 = 7,5e7, cộng EXP gốc 1.
    expect(defined(next.party[0]).exp.toString()).toBe('75000001')
  })

  it('đồ rơi nhân tỉ lệ (50% × 2 = luôn rơi)', () => {
    const drops = (party: Monster[]): number[] =>
      SEEDS.map((seed) => {
        const state = withSeed(makeBattleState(party, [prey('e1')]), seed)
        return eventsOf(run(state, strikeTurn(state)), 'drop').length
      })
    expect(new Set(drops([fighter('a')]))).toEqual(new Set([1]))
    expect(drops([shy('a')])).toContain(0)
  })

  it('trứng giảm thêm số trận', () => {
    const egg = { id: 'x', battlesLeft: 5, monster: makeMonster({ id: 'x' }), infusions: [] }
    const left = (party: Monster[]): number[] => {
      const state = { ...makeBattleState(party, [prey('e1')]), eggs: [egg] }
      return run(state, strikeTurn(state)).eggs.map((e) => e.battlesLeft)
    }
    expect(left([fighter('a')])).toEqual([3])
    expect(left([shy('a')])).toEqual([4])
  })
})

describe('trong trận', () => {
  it('chạy trốn: tỉ lệ chung nhân hệ số (50% × 2 = luôn thoát)', () => {
    const outcomes = (party: Monster[]): (string | null)[] =>
      SEEDS.map(
        (seed) =>
          battleOf(
            gameReducer(
              data,
              withSeed(makeBattleState(party, [fighter('e1', { skillIds: ['idle'] })]), seed),
              { type: 'flee' }
            )
          ).outcome
      )
    expect(new Set(outcomes([fighter('a')]))).toEqual(new Set(['fled']))
    expect(outcomes([shy('a')])).toContain(null)
  })

  it('tỉ lệ bắt nhân hệ số (log chance)', () => {
    const chanceWith = (partner: Monster): number => {
      const state = {
        ...makeBattleState([partner], [fighter('e1', { skillIds: ['idle'] })]),
        inventory: makeInventory({ ball: 1 })
      }
      const next = run(state, [{ slot: 0, kind: 'item', itemId: 'ball', targetId: 'e1' }])
      return defined(eventsOf(next, 'throwBall')[0]).chance
    }
    const plain = chanceWith(shy('a'))
    expect(plain).toBeGreaterThan(0)
    expect(chanceWith(fighter('a'))).toBeCloseTo(Math.min(100, plain * 2))
  })

  it('vào trận: bật kỹ năng có hiệu ứng trong trận; kỹ năng chỉ có hiệu ứng ngoài trận thì không', () => {
    const start = (party: Monster[]): BattleState =>
      battleOf(
        gameReducer(data, atFloor(makeGameState({ seed: 5, party }), 1), {
          type: 'startWildBattle'
        })
      )
    expect(start([fighter('a', { affinity: 100 })]).teamBonuses.player).toEqual([
      { kind: 'partner', id: 'boost', monsterId: 'a', strength: 1.25 }
    ])
    expect(start([shy('a')]).teamBonuses.player).toEqual([])
    expect(start([fallen('a'), fighter('b')]).teamBonuses.player).toEqual([])
  })

  /** Trận giữa chừng đã bật kỹ năng của "a". */
  const partnerBattle = (): Draft =>
    makeBattleState([fighter('a'), fighter('b')], [fighter('e', { skillIds: ['idle'] })], {
      teamBonuses: {
        player: [{ kind: 'partner', id: 'boost', monsterId: 'a', strength: 1.5 }],
        enemy: []
      }
    }) as Draft

  it('% chỉ số cho mọi quái ta trên sân, nhân sức mạnh, nguồn partner; quái địch không', () => {
    const d = partnerBattle()
    const [a, b] = d.party
    // 20% × 1,5 = 30%.
    expect(battleStats(data, d, b).attack).toEqual(computeStats(data, b).final.attack.times(1.3))
    const { percentBySource } = computeStats(data, a, {
      battle: defined(monsterBattleContext(data, d, a))
    })
    expect(percentBySource.partner.attack).toBe(30)
    const enemy = defined(d.battle.enemies[0])
    expect(battleStats(data, d, enemy).attack).toEqual(computeStats(data, enemy).final.attack)
  })

  it('quái đồng hành gục thì tắt, hồi sinh thì bật lại; quái khác gục không đổi', () => {
    const d = partnerBattle()
    const [a, b] = d.party
    loseHp(data, d, b, getMaxHp(data, b), (dealt) => ({
      type: 'traitDamage',
      monsterId: b.id,
      amount: dealt
    }))
    expect(d.battle.teamBonuses.player).toHaveLength(1)
    loseHp(data, d, a, getMaxHp(data, a), (dealt) => ({
      type: 'traitDamage',
      monsterId: a.id,
      amount: dealt
    }))
    expect(d.battle.teamBonuses.player).toEqual([])
    reviveMonster(data, d, a, 50)
    // Bật lại theo thân mật hiện tại (gục −1 thân mật: vẫn mức đầu).
    expect(d.battle.teamBonuses.player).toEqual([
      { kind: 'partner', id: 'boost', monsterId: 'a', strength: 1 }
    ])
  })
})

describe('gặp quái', () => {
  // Map tầng 1 có boss ngẫu nhiên 50%; shiny 50%.
  const oddsData = makePartnerData((raw) => {
    raw.config.shiny.wildChance = 50
    raw.biomes[0].bossChance = 50
    raw.biomes[0].bosses = raw.biomes[0].bosses.map((boss) => ({ ...boss, weight: 1 }))
  })
  const start = (party: Monster[], seed: number): BattleState =>
    battleOf(
      gameReducer(oddsData, atFloor(makeGameState({ seed, party }), 1), {
        type: 'startWildBattle'
      })
    )

  it('tỉ lệ boss và shiny nhân hệ số (50% × 2 = luôn gặp)', () => {
    const boosted = SEEDS.map((seed) => start([fighter('a')], seed))
    expect(new Set(boosted.map((battle) => battle.isBoss))).toEqual(new Set([true]))
    expect(new Set(boosted.map((battle) => battle.enemies[0]?.shinyStacks))).toEqual(new Set([1]))
    const plain = SEEDS.map((seed) => start([shy('a')], seed))
    expect(plain.map((battle) => battle.isBoss)).toContain(false)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesWith = (effects: unknown): string[] =>
    dataIssuesAfter((raw) => raw.partnerSkills.push({ id: 'broken', effects: effects as never }), {
      regenerateText: true
    })

  it('hiệu ứng hợp lệ / sai', () => {
    expect(issuesWith([])).toEqual([])
    expect(issuesWith([{ type: 'moneyPercent', params: { percent: -10 } }])).toEqual([])
    expect(
      issuesWith([{ type: 'teamStatPercent', params: { percent: { speed: 5, attack: 5 } } }])
    ).toEqual([])
    const cases: [unknown, string][] = [
      [[{ type: 'nope', params: {} }], 'chưa có trong registry'],
      [[{ type: 'moneyPercent', params: { percent: 0 } }], 'khác 0'],
      [[{ type: 'catchRatePercent', params: null }], 'object'],
      [[{ type: 'eggStepBonus', params: { count: 0 } }], 'count'],
      [[{ type: 'eggStepBonus', params: { count: 1.5 } }], 'count'],
      [[{ type: 'teamStatPercent', params: { percent: { hp: 5 } } }], 'percent.hp'],
      [[{ type: 'teamStatPercent', params: { percent: {} } }], 'không rỗng'],
      [undefined, 'thiếu danh sách']
    ]
    for (const [effects, fragment] of cases) {
      expect(issuesWith(effects).join('\n'), JSON.stringify(effects)).toContain(fragment)
    }
  })

  it('race thiếu / sai kỹ năng, loài ghi đè sai, trường lạ, config', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.races[0].partnerSkillId = 'nope'
        // Race thiếu trường thì lấy của nhóm: xóa cả hai mới thành thiếu.
        delete (raw.races[1] as { partnerSkillId?: string }).partnerSkillId
        delete (defined(raw.raceGroups[1], 'nhóm brute') as { partnerSkillId?: string })
          .partnerSkillId
        const species = defined(raw.species[0])
        if (species.kind === 'normal') species.partnerSkillId = 'ghost'
        raw.partnerSkills.push({ id: 'extra', effects: [], note: 1 } as never)
        raw.config.partnerSkill = { strengthPerTier: -1 }
      },
      { regenerateText: true }
    )
    expect(issues).toEqual(
      expect.arrayContaining([
        'Race "neutral": partnerSkillId phải là kỹ năng đồng hành, nhận "nope"',
        'Race "brute": partnerSkillId phải là kỹ năng đồng hành, nhận "undefined"',
        'Loài "weakling": partnerSkillId phải là kỹ năng đồng hành, nhận "ghost"',
        expect.stringContaining('config.partnerSkill.strengthPerTier'),
        expect.stringContaining('"note"')
      ])
    )
  })
})

describe('save', () => {
  it('battle.teamBonuses: kỹ năng lạ, sai trường, hai kỹ năng đồng hành', () => {
    const battle = makeBattleState([fighter('a')], [fighter('e')])
    const issues = validateGameState(data, {
      ...battle,
      battle: {
        ...defined(battle.battle),
        teamBonuses: {
          player: [
            { kind: 'partner', id: 'nope', monsterId: 'a', strength: 1 },
            { kind: 'partner', id: 'boost', monsterId: 3, strength: -1 } as never
          ],
          enemy: []
        }
      }
    })
    expect(issues).toEqual([
      'battle.teamBonuses.player[0]: kỹ năng đồng hành không tồn tại "nope"',
      'battle.teamBonuses.player[1].monsterId phải là chuỗi',
      'battle.teamBonuses.player[1].strength phải là số hữu hạn ≥ 0, nhận -1',
      'battle.teamBonuses.player: tối đa một kỹ năng đồng hành'
    ])
  })

  it('migrate v37 → v38: trận đang dở chưa bật kỹ năng; state hợp lệ', () => {
    const battle = makeBattleState([fighter('a')], [fighter('e')])
    const raw = serializeState(battle) as Record<string, unknown>
    const migrated = migrateState({ ...raw, version: 37 }, data)
    expect(defined(migrated.battle).teamBonuses.player).toEqual([])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
