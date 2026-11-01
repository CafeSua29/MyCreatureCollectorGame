import { describe, expect, it } from 'vitest'
import { BIG_ZERO, toBig } from '@core'
import { emptyBattleTotals } from './battleRunner'
import type { FloorResult } from './floorSweep'
import type { FloorUnlock } from './progression'
import {
  aiSummaryTable,
  biomeTable,
  floorTable,
  formatDecimal,
  formatPercent,
  formatTable,
  progressionTable,
  bossLevelTable,
  bossMultiplierTable,
  naturalFieldTable,
  formatByMultiplier,
  formatFarmBattles,
  runSummaryTable,
  skillUsageTable,
  summarizeRun,
  tribulationTable,
  toCsv
} from './report'
import { newLifespanTracker } from './lifespan'
import { newEventTally } from './events'

const floorResult = (overrides: Partial<FloorResult> = {}): FloorResult => ({
  variantId: 'v',
  teamId: 't',
  floor: 1,
  biomeId: null,
  kind: 'wild',
  battles: 4,
  played: 4,
  won: 3,
  lost: 1,
  timeout: 0,
  totalTurns: 10,
  avgMoney: toBig(10),
  avgExp: toBig(1.234),
  avgDropValue: toBig(0),
  skillUses: { player: { damage: 3, status: 1 }, enemy: {} },
  byBossMultiplier: {},
  byNaturalField: {},
  byTrainer: {},
  frenzies: { player: 2, enemy: 1 },
  largeEnemyBattles: 1,
  mergedBattles: 2,
  zMoveBattles: 1,
  hitLocations: {
    aimed: 6,
    weak: 2,
    outOfReach: { player: 1, enemy: 3 },
    broken: 1,
    offBalance: { player: 2, enemy: 4 },
    revealed: 3
  },
  ...overrides
})

describe('định dạng số', () => {
  it('Decimal: 2 chữ số thập phân, số rất lớn dạng mũ', () => {
    expect(formatDecimal(toBig(1.239))).toBe('1.24')
    expect(formatDecimal(BIG_ZERO)).toBe('0')
    expect(formatDecimal(toBig('1.5e400'))).toBe('1.500e+400')
  })

  it('%: mẫu số 0 thì "-"', () => {
    expect(formatPercent(1, 3)).toBe('33.3%')
    expect(formatPercent(0, 0)).toBe('-')
  })
})

describe('formatTable / toCsv', () => {
  const table = { headers: ['a', 'long header'], rows: [['x,y', 'say "hi"']] }

  it('căn cột theo ô dài nhất', () => {
    expect(formatTable(table).split('\n')).toEqual([
      'a    long header',
      '---  -----------',
      'x,y  say "hi"'
    ])
  })

  it('CSV bọc nháy ô có dấu phẩy / nháy kép', () => {
    expect(toCsv(table)).toBe('a,long header\n"x,y","say ""hi"""\n')
  })
})

describe('các bảng kết quả', () => {
  it('bảng tầng: tỉ lệ thắng theo %, quái cuồng bạo trung bình mỗi trận, % trận có quái lớn / hợp thể / Z-Move, vị trí ra đòn mỗi trận', () => {
    expect(floorTable([floorResult()]).rows[0]).toEqual([
      'v',
      't',
      '1',
      'wild',
      '4',
      '4',
      '75.0%',
      '1',
      '0',
      '2.50',
      '10',
      '1.23',
      '0',
      '0.50',
      '0.25',
      '25.0%',
      '50.0%',
      '25.0%',
      '1.50',
      '0.50',
      '0.25',
      '0.75',
      '0.25',
      '0.50',
      '1.00',
      '0.75'
    ])
  })

  it('bảng theo map: một dòng mỗi map × đội × tầng × loại trận', () => {
    const row = biomeTable([floorResult({ biomeId: 'lair', avgDropValue: toBig(12.5) })]).rows[0]
    expect(row).toEqual(['lair', 't', '1', 'wild', '4', '75.0%', '0', '2.50', '10', '1.23', '12.5'])
  })

  it('tóm tắt AI gộp theo biến thể, loại trận chưa có thì "-"', () => {
    const results = [floorResult(), floorResult({ floor: 2, won: 1, totalTurns: 18 })]
    expect(aiSummaryTable(results).rows).toEqual([['v', '50.0%', '3.50', '-', '-']])
  })

  it('tỉ lệ dùng skill theo phe, nhiều nhất trước', () => {
    expect(skillUsageTable([floorResult(), floorResult()]).rows).toEqual([
      ['v', 'player', 'damage', '6', '75.0%'],
      ['v', 'player', 'status', '2', '25.0%']
    ])
  })

  it('chơi liên tục: một dòng mỗi tầng, thêm dòng "kẹt" nếu kẹt', () => {
    const unlock: FloorUnlock = {
      floor: 1,
      wildBattles: 5,
      farmBattles: { 1: 3, 2: 2 },
      bossAttempts: 2,
      bossLosses: 1,
      losses: 1,
      timeouts: 0,
      candiesUsed: 7,
      booksUsed: 3,
      booksDropped: 4,
      booksBought: 5,
      breakthroughFails: 1,
      awakenings: 2,
      tribulationFails: 1,
      humanForms: 1,
      rebirths: 1,
      treasuresUsed: 4,
      soulUpgrades: 5,
      soulPercent: 1.5,
      talentUpgrades: 3,
      talentPercent: 2.5,
      effortPercent: 4.5,
      spiritVirus: 1,
      enhances: 3,
      salvaged: 2,
      casts: 1,
      imbues: 2,
      crafts: 6,
      harvests: 2,
      alchemyLevel: 3,
      smithingLevel: 2,
      meals: 1,
      cooks: 2,
      cookingLevel: 2,
      demonCores: 4,
      questsClaimed: 2,
      expeditionsSent: 1,
      trainerBattles: 4,
      trainerWins: 3,
      badges: 1,
      tournamentsWon: 0,
      arenaRank: 2,
      trialsEntered: 2,
      trialsCompleted: 1,
      trialBattles: 6,
      towerWins: 3,
      towerFloor: 4,
      averageAwakening: 1.5,
      realm: 2,
      averageLevel: 3,
      growthLevels: { slow: 2.5, fast: 3.25 } as FloorUnlock['growthLevels'],
      gearPercent: 4.5,
      masteryLevel: 2.5,
      masteryExp: 12,
      events: {
        ...newEventTally(),
        met: { chest: 2, spring: 1 },
        battles: 2,
        battleWins: 1,
        tides: 1,
        tidesCleared: 1,
        tideWaves: 6
      },
      growth: {
        captures: 3,
        ballsThrown: 5,
        fuses: 2,
        fuseFails: 1,
        teamLost: 0,
        breeds: 1,
        promotions: 1,
        recruitOffers: 3,
        recruits: 2,
        intimidates: 2,
        intimidateWins: 1,
        baitsUsed: 1,
        fuseSkips: { money: 2 }
      },
      economy: {
        itemsSold: 4,
        tempShopBought: 0,
        affinityItemsUsed: 2,
        megaStonesHeld: 0,
        zCrystalsHeld: 0,
        critItemsHeld: 0,
        plotsBought: 1,
        bondsBound: 0,
        contracts: 0,
        contractFails: 0,
        contractEscapes: 0,
        dexRewards: 0,
        traitsExtracted: 0,
        traitsInjected: 0,
        crystalsBought: 0,
        sacrifices: 2,
        implants: 3,
        implantFails: 1,
        implantEffects: 2,
        implantSharePercent: 4.6,
        capacityExpansions: 0,
        storagePeak: 3,
        bagPeak: 0,
        incense: 4,
        deityBuys: 0,
        favorRank: 2,
        achievementTiers: 0,
        researchRewards: 0,
        researchLevelPeak: 0
      },
      bossWin: null
    }
    const table = progressionTable([
      {
        teamId: 't',
        usePills: true,
        growth: true,
        snapshots: [],
        lifespan: newLifespanTracker(),
        totalBattles: 9,
        stuckAtFloor: 3,
        stuckReason: 'maxBattles',
        finalMargin: 0,
        finalMarginLimit: null,
        battleTotals: emptyBattleTotals(),
        eventTotals: newEventTally(),
        unlocks: [
          {
            ...unlock,
            bossWin: { margin: 2, level: { average: 12.5, min: 11, max: 14 }, bossMultiplier: 3 }
          },
          { ...unlock, floor: 2, bossLosses: 0, farmBattles: { 2: 4 }, bossWin: null }
        ]
      },
      {
        teamId: 'u',
        usePills: false,
        growth: false,
        snapshots: [],
        lifespan: newLifespanTracker(),
        totalBattles: 40,
        stuckAtFloor: 1,
        stuckReason: 'maxMargin',
        finalMargin: 62,
        finalMarginLimit: 60,
        battleTotals: emptyBattleTotals(),
        eventTotals: newEventTally(),
        unlocks: []
      }
    ])
    const blanks = new Array<string>(69).fill('')
    expect(table.rows).toEqual([
      [
        't',
        '1',
        '5',
        '2',
        '1',
        '0',
        '3.00',
        'slow:2.50 fast:3.25',
        '2:2 1:3',
        '1',
        '2',
        '12.50',
        '11',
        '14',
        '3',
        '4.50',
        '2.50',
        '12.00',
        '7',
        '4',
        '5',
        '3',
        '2',
        '1',
        '1.50',
        '2',
        '1',
        '1',
        '1',
        '4',
        '5',
        '1.50',
        '3',
        '2.50',
        '4.50',
        '1',
        '3',
        '2',
        '1',
        '2',
        '6',
        '2',
        '3',
        '2',
        '1',
        '2',
        '2',
        '4',
        '2',
        '1',
        '4',
        '75.0%',
        '1',
        '0',
        '2',
        '1/2',
        '6',
        '3',
        '4',
        '3',
        '1/2',
        '1/1',
        '6',
        '3/5',
        '2/3 1/2 b1',
        '2/3',
        '0',
        '1',
        '1',
        'money:2',
        'sold:4 affinity:2 plots:1 sacrifice:2 implant:3 implantFail:1 implantEffect:2 implantShare%:5 storagePeak:3 incense:4 favorRank:2',
        ''
      ],
      [
        't',
        '2',
        '5',
        '2',
        '1',
        '0',
        '3.00',
        'slow:2.50 fast:3.25',
        '2:4',
        '0',
        '',
        '',
        '',
        '',
        '',
        '4.50',
        '2.50',
        '12.00',
        '7',
        '4',
        '5',
        '3',
        '2',
        '1',
        '1.50',
        '2',
        '1',
        '1',
        '1',
        '4',
        '5',
        '1.50',
        '3',
        '2.50',
        '4.50',
        '1',
        '3',
        '2',
        '1',
        '2',
        '6',
        '2',
        '3',
        '2',
        '1',
        '2',
        '2',
        '4',
        '2',
        '1',
        '4',
        '75.0%',
        '1',
        '0',
        '2',
        '1/2',
        '6',
        '3',
        '4',
        '3',
        '1/2',
        '1/1',
        '6',
        '3/5',
        '2/3 1/2 b1',
        '2/3',
        '0',
        '1',
        '1',
        'money:2',
        'sold:4 affinity:2 plots:1 sacrifice:2 implant:3 implantFail:1 implantEffect:2 implantShare%:5 storagePeak:3 incense:4 favorRank:2',
        'mở nhờ boss ngẫu nhiên'
      ],
      ['t', '3', ...blanks, 'kẹt sau 9 trận'],
      ['u (no growth) (no pills)', '1', ...blanks, 'kẹt: margin 62 > giới hạn 60.00 sau 40 trận']
    ])
  })
})

describe('tóm tắt lần chạy', () => {
  it('gom thời gian và số trận / lượt / hết lượt theo phần, đủ mọi phần kể cả phần không có việc', () => {
    const progressionTotals = emptyBattleTotals()
    progressionTotals.boss = { battles: 2, turns: 7, timeouts: 1 }
    const parts = summarizeRun([
      { part: 'sweep', ms: 1500, result: { type: 'sweep', floors: [floorResult()] } },
      {
        part: 'sweep',
        ms: 500,
        result: { type: 'sweep', floors: [floorResult({ kind: 'boss', timeout: 1 })] }
      },
      {
        part: 'biomeSweep',
        ms: 200,
        result: { type: 'biomeSweep', biomes: [floorResult({ biomeId: 'lair' })] }
      },
      {
        part: 'bossLevel',
        ms: 100,
        result: { type: 'bossLevel', rows: [], totals: { battles: 30, turns: 200, timeouts: 2 } }
      },
      {
        part: 'progression',
        ms: 300,
        result: {
          type: 'progression',
          progression: {
            teamId: 't',
            usePills: true,
            growth: true,
            snapshots: [],
            lifespan: newLifespanTracker(),
            unlocks: [],
            totalBattles: 2,
            stuckAtFloor: null,
            stuckReason: null,
            finalMargin: 0,
            finalMarginLimit: null,
            battleTotals: progressionTotals,
            eventTotals: newEventTally()
          }
        }
      },
      {
        part: 'tribulation',
        ms: 400,
        result: {
          type: 'tribulation',
          rows: [{ tier: 1, levelOffset: 0, level: 50, battles: 3, won: 1, lost: 2, totalTurns: 9 }]
        }
      }
    ])
    expect(runSummaryTable(parts).rows).toEqual([
      ['sweep', '2', '2.0', '4', '10', '0', '4', '10', '1'],
      ['biomeSweep', '1', '0.2', '4', '10', '0', '0', '0', '0'],
      ['bossLevel', '1', '0.1', '0', '0', '0', '30', '200', '2'],
      ['progression', '1', '0.3', '0', '0', '0', '2', '7', '1'],
      ['progressionSweep', '0', '0.0', '0', '0', '0', '0', '0', '0'],
      ['tribulation', '1', '0.4', '0', '0', '0', '3', '9', '0'],
      ['safari', '0', '0.0', '0', '0', '0', '0', '0', '0'],
      ['zones', '0', '0.0', '0', '0', '0', '0', '0', '0'],
      ['gathering', '0', '0.0', '0', '0', '0', '0', '0', '0'],
      ['worldBoss', '0', '0.0', '0', '0', '0', '0', '0', '0'],
      ['itemWorld', '0', '0.0', '0', '0', '0', '0', '0', '0'],
      ['lineage', '0', '0.0', '0', '0', '0', '0', '0', '0']
    ])
  })
})

describe('bảng độ kiếp', () => {
  it('tỉ lệ thắng và số lượt trung bình theo tầng × độ lệch level', () => {
    const table = tribulationTable([
      { tier: 2, levelOffset: 10, level: 110, battles: 4, won: 3, lost: 1, totalTurns: 10 }
    ])
    expect(table.rows).toEqual([['2', '10', '110', '4', '75.0%', '2.50']])
  })
})

describe('bảng theo môi trường tự nhiên', () => {
  it('mỗi lớp / môi trường một dòng, sắp theo khóa', () => {
    const byNaturalField = {
      'weather:rain': { played: 2, won: 1 },
      'terrain:none': { played: 4, won: 4 },
      'weather:clear': { played: 2, won: 0 }
    }
    expect(naturalFieldTable([floorResult({ byNaturalField })]).rows).toEqual([
      ['v', 't', '1', 'wild', 'terrain', 'none', '4', '100.0%'],
      ['v', 't', '1', 'wild', 'weather', 'clear', '2', '0.0%'],
      ['v', 't', '1', 'wild', 'weather', 'rain', '2', '50.0%']
    ])
  })
})

describe('bảng boss theo hệ số và level cần để thắng boss', () => {
  const byBossMultiplier = { 10: { played: 2, won: 0 }, 2: { played: 4, won: 3 } }

  it('hệ số boss: chỉ trận boss, hệ số nhỏ trước (so số, không so chuỗi)', () => {
    const table = bossMultiplierTable([
      floorResult({ byBossMultiplier }),
      floorResult({ kind: 'boss', byBossMultiplier })
    ])
    expect(table.rows).toEqual([
      ['v', 't', '1', '2', '4', '75.0%'],
      ['v', 't', '1', '10', '2', '0.0%']
    ])
    expect(formatByMultiplier(byBossMultiplier)).toBe('×2 75.0% (4) ×10 0.0% (2)')
    expect(formatByMultiplier({})).toBe('')
  })

  it('level cần: offset / level, không đạt thì "> maxOffset"', () => {
    const measured = floorResult({ kind: 'boss', played: 4, won: 3, byBossMultiplier })
    const rows = bossLevelTable([
      { teamId: 't', floor: 2, target: 50, offset: 3, maxOffset: 60, level: 23, measured },
      { teamId: 't', floor: 2, target: 80, offset: null, maxOffset: 60, level: null, measured }
    ]).rows
    expect(rows).toEqual([
      ['t', '2', '50%', '3', '23', '75.0%', '4', '×2 75.0% (4) ×10 0.0% (2)'],
      ['t', '2', '80%', '> 60', '', '75.0%', '4', '×2 75.0% (4) ×10 0.0% (2)']
    ])
  })

  it('số trận farm theo tầng: tầng cao trước, rỗng thì chuỗi rỗng', () => {
    expect(formatFarmBattles({ 1: 3, 12: 40, 2: 5 })).toBe('12:40 2:5 1:3')
    expect(formatFarmBattles({})).toBe('')
  })
})
