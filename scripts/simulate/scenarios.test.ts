import { describe, expect, it } from 'vitest'
import { DataError, createGameData } from '@core'
import { makeData, makeRawData } from '@core/testing'
import { validScenarios } from './scenarioFixture'
import { parseScenarios, rawWithVariant, turnLimit } from './scenarios'

const data = makeData()

function issuesOf(value: unknown): string[] {
  try {
    parseScenarios(data, value)
  } catch (error) {
    if (error instanceof DataError) return error.issues
    throw error
  }
  return []
}

describe('parseScenarios', () => {
  it('đọc kịch bản hợp lệ, trait bỏ trống = không trait', () => {
    const raw = validScenarios()
    const teams = raw.teams as { members: Record<string, unknown>[] }[]
    delete teams[0].members[0].traits
    const scenarios = parseScenarios(data, raw)
    expect(scenarios.teams[0].members[0]).toEqual({
      speciesId: 'weakling',
      levelOffset: 0,
      genes: 'wild',
      traits: []
    })
    expect(scenarios.fusion.genes).toBe(20)
  })

  it('báo mọi lỗi kèm đường dẫn trường', () => {
    const raw = {
      ...validScenarios(),
      extra: 1,
      seed: -1,
      floors: { from: 3, to: 2 },
      teams: [
        { id: 'a', members: [{ speciesId: 'nope', levelOffset: 0, genes: 0, traits: [] }] },
        { id: 'a', members: [] }
      ],
      variants: [
        { id: 'x', ai: { koBonus: -1, unknownWeight: 1 } },
        { id: 'y', config: { ai: {}, mastery: { nope: 1 }, partySize: {} } }
      ],
      assumedMastery: { expPerFloor: -1 },
      progression: {
        teamIds: ['ghost'],
        bossPolicy: { type: 'everyWins', wins: 1 },
        maxBattles: 0
      }
    }
    const issues = issuesOf(raw)
    const expected = [
      'trường "extra"',
      'seed',
      'floors.to phải ≥ floors.from',
      'teams[0].members[0].speciesId: loài "nope"',
      'teams[0].members[0].genes',
      'teams[1].members phải có ít nhất một quái',
      'id "a" bị trùng',
      'variants[0].ai.koBonus',
      'variants[1].config: trường "ai"',
      'variants[1].config: trường "partySize"',
      'variants[1].config.mastery: trường "nope"',
      'assumedMastery.expPerFloor',
      'trường "unknownWeight"',
      'không có đội "ghost"',
      'progression.maxBattles'
    ]
    for (const text of expected) expect(issues.some((issue) => issue.includes(text))).toBe(true)
  })

  it('trường tùy chọn không ghi: tắt dừng sớm, trần lượt boss = maxTurns, đội vẫn đánh boss', () => {
    const scenarios = parseScenarios(data, validScenarios())
    expect(scenarios.earlyStop).toBeNull()
    expect(scenarios.maxTurnsBoss).toBe(50)
    expect(scenarios.teams[0].skipBoss).toBe(false)
    expect(turnLimit(scenarios, 'wild')).toBe(50)
    expect(turnLimit(scenarios, 'boss')).toBe(50)
  })

  it('đọc earlyStop, maxTurnsBoss, skipBoss', () => {
    const raw = validScenarios()
    raw.earlyStop = { minBattles: 20, ciWidth: 0.1 }
    raw.maxTurnsBoss = 7
    ;(raw.teams as Record<string, unknown>[])[0].skipBoss = true
    const scenarios = parseScenarios(data, raw)
    expect(scenarios.earlyStop).toEqual({ minBattles: 20, ciWidth: 0.1 })
    expect(turnLimit(scenarios, 'boss')).toBe(7)
    expect(turnLimit(scenarios, 'wild')).toBe(50)
    expect(scenarios.teams[0].skipBoss).toBe(true)
  })

  it('báo lỗi trường mới sai kèm đường dẫn', () => {
    const raw = validScenarios()
    raw.earlyStop = { minBattles: 0, ciWidth: 0, extra: 1 }
    raw.maxTurnsBoss = 0
    ;(raw.teams as Record<string, unknown>[])[0].skipBoss = 'yes'
    const issues = issuesOf(raw)
    const expected = [
      'earlyStop.minBattles',
      'earlyStop.ciWidth phải > 0',
      'trường "extra"',
      'maxTurnsBoss',
      'teams[0].skipBoss phải là true / false'
    ]
    for (const text of expected) expect(issues.some((issue) => issue.includes(text))).toBe(true)
    raw.earlyStop = { minBattles: 1, ciWidth: 1.5 }
    expect(issuesOf(raw).some((issue) => issue.includes('earlyStop.ciWidth'))).toBe(true)
  })

  it('đọc bossPolicy, farm, bossLevelSearch; không ghi farm / bossLevelSearch thì null', () => {
    const plain = parseScenarios(data, validScenarios())
    expect(plain.progression.bossPolicy).toEqual({ type: 'everyWins', wins: 2 })
    expect(plain.progression.farm).toBeNull()
    expect(plain.bossLevelSearch).toBeNull()
    const raw = validScenarios()
    const policy = {
      type: 'levelTarget',
      marginStart: 0,
      marginStepOnLoss: 2,
      minWinsBetween: 3,
      maxMargin: 60,
      maxMarginPercent: 75
    }
    const farm = { window: 20, dropBelow: 50, returnAt: 80 }
    raw.progression = { teamIds: ['solo'], bossPolicy: policy, farm, maxBattles: 5 }
    raw.bossLevelSearch = { targets: [50, 80], maxOffset: 60, battles: 40 }
    const scenarios = parseScenarios(data, raw)
    expect(scenarios.progression.bossPolicy).toEqual(policy)
    expect(scenarios.progression.farm).toEqual(farm)
    expect(scenarios.bossLevelSearch).toEqual({ targets: [50, 80], maxOffset: 60, battles: 40 })
  })

  it('báo lỗi bossPolicy / farm / bossLevelSearch sai kèm đường dẫn', () => {
    const raw = validScenarios()
    raw.progression = {
      teamIds: ['solo'],
      bossPolicy: {
        type: 'levelTarget',
        marginStart: 5,
        marginStepOnLoss: 0,
        minWinsBetween: -1,
        maxMargin: 4,
        wins: 1
      },
      farm: { window: 0, dropBelow: 90, returnAt: 80 },
      maxBattles: 5
    }
    raw.bossLevelSearch = { targets: [], maxOffset: -1, battles: 0 }
    const issues = issuesOf(raw)
    const expected = [
      'progression.bossPolicy.marginStepOnLoss',
      'progression.bossPolicy.minWinsBetween',
      'progression.bossPolicy.maxMargin phải ≥ marginStart',
      'trường "wins"',
      'progression.farm.window',
      'progression.farm.returnAt phải ≥ dropBelow',
      'bossLevelSearch.targets phải có ít nhất một mục tiêu',
      'bossLevelSearch.maxOffset',
      'bossLevelSearch.battles'
    ]
    for (const text of expected) expect(issues.some((issue) => issue.includes(text))).toBe(true)
    raw.progression = { teamIds: ['solo'], bossPolicy: { type: 'often' }, maxBattles: 5 }
    raw.bossLevelSearch = { targets: [120], maxOffset: 1, battles: 1 }
    const more = issuesOf(raw)
    expect(more.some((issue) => issue.includes('bossPolicy.type'))).toBe(true)
    expect(more.some((issue) => issue.includes('bossLevelSearch.targets[0]'))).toBe(true)
  })

  it('đọc biomeSweep; không ghi thì null; sai thì báo kèm đường dẫn', () => {
    expect(parseScenarios(data, validScenarios()).biomeSweep).toBeNull()
    const raw = validScenarios()
    const spec = { teamIds: ['solo'], floors: [1, 5], wildBattles: 3, bossBattles: 2 }
    raw.biomeSweep = spec
    expect(parseScenarios(data, raw).biomeSweep).toEqual(spec)
    raw.biomeSweep = { teamIds: ['ghost'], floors: [0], wildBattles: -1, bossBattles: 1, x: 1 }
    const issues = issuesOf(raw)
    const expected = [
      'biomeSweep.teamIds[0]: không có đội "ghost"',
      'biomeSweep.floors[0]',
      'biomeSweep.wildBattles',
      'trường "x"'
    ]
    for (const text of expected) expect(issues.some((issue) => issue.includes(text))).toBe(true)
    raw.biomeSweep = { teamIds: [], floors: [], wildBattles: 1, bossBattles: 1 }
    const empty = issuesOf(raw)
    expect(empty.some((issue) => issue.includes('biomeSweep.teamIds phải có'))).toBe(true)
    expect(empty.some((issue) => issue.includes('biomeSweep.floors phải có'))).toBe(true)
  })

  it('biến thể theo chiến thuật: đọc tactic, không ghi = balanced, lạ thì báo', () => {
    const raw = validScenarios()
    raw.variants = [{ id: 'a' }, { id: 'b', tactic: 'allOut' }]
    expect(parseScenarios(data, raw).variants.map((v) => v.tactic)).toEqual(['balanced', 'allOut'])
    raw.variants = [{ id: 'c', tactic: 'berserk' }]
    expect(issuesOf(raw).some((issue) => issue.includes('variants[0].tactic'))).toBe(true)
  })

  it('đọc tribulation; không ghi thì null; sai thì báo kèm đường dẫn', () => {
    expect(parseScenarios(data, validScenarios()).tribulation).toBeNull()
    const raw = validScenarios()
    const spec = { teamId: 'solo', tiers: [1, 3], levelOffsets: [0, 20], battles: 4 }
    raw.tribulation = spec
    expect(parseScenarios(data, raw).tribulation).toEqual(spec)
    raw.tribulation = { teamId: 'ghost', tiers: [0], levelOffsets: [-1], battles: 0 }
    const issues = issuesOf(raw)
    const expected = [
      'tribulation.teamId: không có đội "ghost"',
      'tribulation.tiers[0]',
      'tribulation.levelOffsets[0]',
      'tribulation.battles'
    ]
    for (const text of expected) expect(issues.some((issue) => issue.includes(text))).toBe(true)
    raw.tribulation = { teamId: 'solo', tiers: [], levelOffsets: [], battles: 1 }
    const empty = issuesOf(raw)
    expect(empty.some((issue) => issue.includes('tribulation.tiers phải có'))).toBe(true)
    expect(empty.some((issue) => issue.includes('tribulation.levelOffsets phải có'))).toBe(true)
  })

  it('chặn loài fuse và giá trị không phải object', () => {
    const raw = validScenarios()
    raw.breeding = { ...(raw.breeding as object), speciesId: 'fused' }
    expect(issuesOf(raw).some((issue) => issue.includes('breeding.speciesId'))).toBe(true)
    expect(issuesOf(null)).toContain('scenarios phải là object')
  })
})

describe('rawWithVariant', () => {
  it('chỉ ghi đè các trọng số được khai báo, dữ liệu vẫn qua createGameData', () => {
    const raw = makeRawData()
    const varied = createGameData(
      rawWithVariant(raw, {
        id: 'v',
        ai: { koBonus: 3 },
        config: {},
        withoutSkillFields: [],
        withoutPartnerSkills: false,
        tactic: 'balanced' as const,
        uncontracted: false,
        tamerRealm: null
      })
    )
    expect(varied.config.ai).toEqual({ ...raw.config.ai, koBonus: 3 })
    expect(raw.config.ai.koBonus).not.toBe(3)
  })

  it('ghi đè nông mục khác của config (tắt hiệu lực thuần thục), giữ các khóa còn lại', () => {
    const raw = makeRawData()
    const off = { powerStep: 0, accuracyPerLevel: 0, milestones: [] }
    const varied = createGameData(
      rawWithVariant(raw, {
        id: 'v',
        ai: {},
        config: { mastery: off },
        withoutSkillFields: [],
        withoutPartnerSkills: false,
        tactic: 'balanced' as const,
        uncontracted: false,
        tamerRealm: null
      })
    )
    expect(varied.config.mastery).toEqual({ ...raw.config.mastery, ...off })
    expect(raw.config.mastery.powerStep).toBeGreaterThan(0)
  })

  it('bỏ hold / synergy khỏi mọi skill (A/B), không sửa dữ liệu gốc', () => {
    const raw = makeRawData()
    raw.skills[0] = { ...raw.skills[0], hold: 1 }
    const variant = {
      id: 'v',
      ai: {},
      config: {},
      withoutSkillFields: ['hold' as const],
      withoutPartnerSkills: false,
      tactic: 'balanced' as const,
      uncontracted: false,
      tamerRealm: null
    }
    const varied = createGameData(rawWithVariant(raw, variant))
    expect(varied.skills[raw.skills[0].id].hold).toBeUndefined()
    expect(raw.skills[0].hold).toBe(1)
  })

  it('tắt tầm chiêu: mọi skill tầm xa (A/B vị trí ra đòn)', () => {
    const raw = makeRawData()
    raw.skills[0] = { ...raw.skills[0], contact: true }
    raw.skills[1] = { ...raw.skills[1], reach: 'melee' }
    const variant = {
      id: 'v',
      ai: {},
      config: {},
      withoutSkillFields: ['reach' as const],
      withoutPartnerSkills: false,
      tactic: 'balanced' as const,
      uncontracted: false,
      tamerRealm: null
    }
    const varied = createGameData(rawWithVariant(raw, variant))
    expect(varied.skills[raw.skills[0].id].reach).toBe('ranged')
    expect(varied.skills[raw.skills[1].id].reach).toBe('ranged')
    expect(raw.skills[1].reach).toBe('melee')
  })

  it('bỏ styles khỏi mọi skill (A/B thế mạnh / thế nhanh)', () => {
    const raw = makeRawData()
    raw.skills[0] = { ...raw.skills[0], styles: true }
    const variant = {
      id: 'v',
      ai: {},
      config: {},
      withoutSkillFields: ['styles' as const],
      withoutPartnerSkills: false,
      tactic: 'balanced' as const,
      uncontracted: false,
      tamerRealm: null
    }
    expect(createGameData(rawWithVariant(raw, variant)).skills[raw.skills[0].id].styles).toBe(
      undefined
    )
    expect(raw.skills[0].styles).toBe(true)
  })

  it('bỏ hiệu ứng mọi kỹ năng đồng hành (A/B), không sửa dữ liệu gốc', () => {
    const raw = makeRawData()
    raw.partnerSkills[0] = {
      ...raw.partnerSkills[0],
      effects: [{ type: 'moneyPercent', params: { percent: 10 } }]
    }
    const variant = {
      id: 'v',
      ai: {},
      config: {},
      withoutSkillFields: [],
      withoutPartnerSkills: true,
      tactic: 'balanced' as const,
      uncontracted: false,
      tamerRealm: null
    }
    const varied = createGameData(rawWithVariant(raw, variant))
    expect(Object.values(varied.partnerSkills).map((skill) => skill.effects)).toEqual([[]])
    expect(raw.partnerSkills[0].effects).toHaveLength(1)
  })

  it('giá trị sai do createGameData báo', () => {
    const raw = makeRawData()
    const bad = rawWithVariant(raw, {
      id: 'v',
      ai: {},
      config: { mastery: { baseExp: 0 } },
      withoutSkillFields: [],
      withoutPartnerSkills: false,
      tactic: 'balanced' as const,
      uncontracted: false,
      tamerRealm: null
    })
    expect(() => createGameData(bad)).toThrow()
  })
})
