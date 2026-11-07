// Dựng bảng kết quả của script mô phỏng: cùng một bảng in ra console (căn cột) và ghi CSV.

import type { Decimal } from '@core'
import type { FloorResult } from './floorSweep'
import type { LineageRow } from './lineage'
import type { FloorUnlock, ProgressionResult } from './progression'
import type { BossLevelRow } from './bossLevel'
import {
  emptyBattleTotals,
  mergeBattleTotals,
  type BattleKind,
  type BattleTotalsByKind
} from './battleRunner'
import { SIM_PARTS, type SimPart, type TimedJobResult } from './jobs'
import type { TribulationRow } from './tribulation'
import type { SafariRow } from './safari'
import type { ZoneRow } from './zones'
import type { GatheringRow } from './gathering'
import { NO_TIER, type WorldBossRow } from './worldBoss'
import type { ItemWorldRow } from './itemWorld'

export interface Table {
  headers: string[]
  rows: string[][]
}

/** Số lớn hơn ngưỡng này in dạng mũ để cột không quá dài. */
const EXPONENT_THRESHOLD = 1e9

/** Decimal ngắn gọn: 2 chữ số thập phân, hoặc dạng mũ 4 chữ số có nghĩa khi rất lớn. */
export function formatDecimal(value: Decimal): string {
  return value.abs().lt(EXPONENT_THRESHOLD)
    ? value.toDecimalPlaces(2).toString()
    : value.toExponential(3)
}

const formatRatio = (value: number): string => value.toFixed(2)
/** Làm tròn 2 chữ số thập phân (số đo trung bình nhỏ như số dấu mỗi quái). */
const round2 = (value: number): number => Math.round(value * 100) / 100

/** Tỉ lệ dạng %, 1 chữ số thập phân; mẫu số 0 thì "-". */
export function formatPercent(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '-'
}

/** Bảng căn cột cho console. */
export function formatTable(table: Table): string {
  const widths = table.headers.map((header, i) =>
    Math.max(header.length, ...table.rows.map((row) => row[i]?.length ?? 0))
  )
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join('  ')
      .trimEnd()
  return [
    line(table.headers),
    line(widths.map((w) => '-'.repeat(w))),
    ...table.rows.map(line)
  ].join('\n')
}

/** Ô CSV: bọc nháy kép khi có dấu phẩy, nháy kép hoặc xuống dòng. */
function csvCell(cell: string): string {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

export function toCsv(table: Table): string {
  return [table.headers, ...table.rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

export function floorTable(results: readonly FloorResult[]): Table {
  return {
    headers: [
      'variant',
      'team',
      'floor',
      'kind',
      'battles',
      'played',
      'winRate',
      'lost',
      'timeout',
      'avgTurns',
      'avgMoney',
      'avgExp',
      'avgDropValue',
      'frenzyPlayer',
      'frenzyEnemy',
      'largeEnemy',
      'merged',
      'zMove',
      'aimed',
      'weakHits',
      'outOfReachPlayer',
      'outOfReachEnemy',
      'partsBroken',
      'offBalancePlayer',
      'offBalanceEnemy',
      'partsRevealed',
      'elementReactions',
      'rests',
      'overexerted'
    ],
    rows: results.map((r) => [
      r.variantId,
      r.teamId,
      String(r.floor),
      r.kind,
      String(r.battles),
      String(r.played),
      formatPercent(r.won, r.played),
      String(r.lost),
      String(r.timeout),
      formatRatio(r.played > 0 ? r.totalTurns / r.played : 0),
      formatDecimal(r.avgMoney),
      formatDecimal(r.avgExp),
      formatDecimal(r.avgDropValue),
      // Số quái cuồng bạo trung bình mỗi trận (docs/rules/frenzy.md).
      formatRatio(r.played > 0 ? r.frenzies.player / r.played : 0),
      formatRatio(r.played > 0 ? r.frenzies.enemy / r.played : 0),
      // % trận có quái địch lớn (docs/rules/monster-size.md).
      formatPercent(r.largeEnemyBattles, r.played),
      // % trận người chơi song thú hợp thể (docs/rules/battle-merge.md).
      formatPercent(r.mergedBattles, r.played),
      // % trận người chơi dùng Z-Move (docs/rules/z-moves.md).
      formatPercent(r.zMoveBattles, r.played),
      // Vị trí ra đòn / tầm chiêu, trung bình mỗi trận (docs/rules/hit-locations.md).
      ...[
        r.hitLocations.aimed,
        r.hitLocations.weak,
        r.hitLocations.outOfReach.player,
        r.hitLocations.outOfReach.enemy,
        r.hitLocations.broken,
        r.hitLocations.offBalance.player,
        r.hitLocations.offBalance.enemy,
        r.hitLocations.revealed,
        r.hitLocations.reactions,
        r.hitLocations.rests,
        r.hitLocations.overexerted
      ].map((count) => formatRatio(r.played > 0 ? count / r.played : 0))
    ])
  }
}

/** Quét theo map: một dòng mỗi map × đội × tầng × loại trận. */
export function biomeTable(results: readonly FloorResult[]): Table {
  return {
    headers: [
      'biome',
      'team',
      'floor',
      'kind',
      'played',
      'winRate',
      'timeout',
      'avgTurns',
      'avgMoney',
      'avgExp',
      'avgDropValue'
    ],
    rows: results.map((r) => [
      r.biomeId ?? '',
      r.teamId,
      String(r.floor),
      r.kind,
      String(r.played),
      formatPercent(r.won, r.played),
      String(r.timeout),
      formatRatio(r.played > 0 ? r.totalTurns / r.played : 0),
      formatDecimal(r.avgMoney),
      formatDecimal(r.avgExp),
      formatDecimal(r.avgDropValue)
    ])
  }
}

const PROGRESSION_HEADERS = [
  'team',
  'floor',
  'wildBattles',
  'bossAttempts',
  'losses',
  'timeouts',
  'avgLevel',
  'growthLevels',
  'farmBattles',
  'bossLosses',
  'winMargin',
  'winLevelAvg',
  'winLevelMin',
  'winLevelMax',
  'winBossMultiplier',
  'gearPercent',
  'setBonuses',
  'masteryLevel',
  'masteryExp',
  'candies',
  'booksDropped',
  'booksBought',
  'books',
  'realm',
  'breakthroughFails',
  'awakening',
  'awakenings',
  'tribulationFails',
  'humanForms',
  'rebirths',
  'treasures',
  'soulUpgrades',
  'soulPercent',
  'talentUpgrades',
  'talentPercent',
  'effortPercent',
  'spiritVirus',
  'enhances',
  'salvaged',
  'casts',
  'imbues',
  'crafts',
  'harvests',
  'alchemyLevel',
  'smithingLevel',
  'meals',
  'cooks',
  'cookingLevel',
  'demonCores',
  'quests',
  'expeditions',
  'trainerBattles',
  'trainerWinRate',
  'badges',
  'tournaments',
  'arenaRank',
  'trials',
  'trialBattles',
  'towerWins',
  'towerFloor',
  'events',
  'eventBattles',
  'tides',
  'tideWaves',
  'captures',
  'recruits',
  'fuses',
  'teamLost',
  'breeds',
  'promotions',
  'fuseSkips',
  'economy',
  'note'
]

/** Level theo nhóm tăng trưởng, dạng "erratic:21.0 fast:20.5 ..." (thứ tự GROWTH_RATES). */
export function formatGrowthLevels(levels: Readonly<Record<string, number>>): string {
  return Object.entries(levels)
    .map(([rate, level]) => `${rate}:${formatRatio(level)}`)
    .join(' ')
}

/** Số trận farm theo tầng, tầng cao trước, dạng "3:40 2:12". */
export function formatFarmBattles(farmBattles: Readonly<Record<number, number>>): string {
  return Object.entries(farmBattles)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([floor, count]) => `${floor}:${count}`)
    .join(' ')
}

function unlockRow(teamId: string, unlock: FloorUnlock): string[] {
  const win = unlock.bossWin
  return [
    teamId,
    String(unlock.floor),
    String(unlock.wildBattles),
    String(unlock.bossAttempts),
    String(unlock.losses),
    String(unlock.timeouts),
    formatRatio(unlock.averageLevel),
    formatGrowthLevels(unlock.growthLevels),
    formatFarmBattles(unlock.farmBattles),
    String(unlock.bossLosses),
    win ? String(win.margin) : '',
    win ? formatRatio(win.level.average) : '',
    win ? String(win.level.min) : '',
    win ? String(win.level.max) : '',
    win ? String(win.bossMultiplier) : '',
    formatRatio(unlock.gearPercent),
    formatRatio(unlock.setBonuses),
    formatRatio(unlock.masteryLevel),
    formatRatio(unlock.masteryExp),
    String(unlock.candiesUsed),
    String(unlock.booksDropped),
    String(unlock.booksBought),
    String(unlock.booksUsed),
    String(unlock.realm),
    String(unlock.breakthroughFails),
    formatRatio(unlock.averageAwakening),
    String(unlock.awakenings),
    String(unlock.tribulationFails),
    String(unlock.humanForms),
    String(unlock.rebirths),
    String(unlock.treasuresUsed),
    String(unlock.soulUpgrades),
    formatRatio(unlock.soulPercent),
    String(unlock.talentUpgrades),
    formatRatio(unlock.talentPercent),
    formatRatio(unlock.effortPercent),
    String(unlock.spiritVirus),
    String(unlock.enhances),
    String(unlock.salvaged),
    String(unlock.casts),
    String(unlock.imbues),
    String(unlock.crafts),
    String(unlock.harvests),
    String(unlock.alchemyLevel),
    String(unlock.smithingLevel),
    String(unlock.meals),
    String(unlock.cooks),
    String(unlock.cookingLevel),
    String(unlock.demonCores),
    String(unlock.questsClaimed),
    String(unlock.expeditionsSent),
    String(unlock.trainerBattles),
    formatPercent(unlock.trainerWins, unlock.trainerBattles),
    String(unlock.badges),
    String(unlock.tournamentsWon),
    String(unlock.arenaRank),
    `${unlock.trialsCompleted}/${unlock.trialsEntered}`,
    String(unlock.trialBattles),
    String(unlock.towerWins),
    String(unlock.towerFloor),
    String(Object.values(unlock.events.met).reduce((sum, count) => sum + count, 0)),
    `${unlock.events.battleWins}/${unlock.events.battles}`,
    `${unlock.events.tidesCleared}/${unlock.events.tides}`,
    String(unlock.events.tideWaves),
    `${unlock.growth.captures}/${unlock.growth.ballsThrown}`,
    // Thu phục: quái về / lần xin theo, Thị Uy thành công / lần, số mồi đã dùng.
    `${unlock.growth.recruits}/${unlock.growth.recruitOffers} ` +
      `${unlock.growth.intimidateWins}/${unlock.growth.intimidates} b${unlock.growth.baitsUsed}`,
    `${unlock.growth.fuses}/${unlock.growth.fuses + unlock.growth.fuseFails}`,
    String(unlock.growth.teamLost),
    String(unlock.growth.breeds),
    String(unlock.growth.promotions),
    Object.entries(unlock.growth.fuseSkips)
      .map(([reason, n]) => `${reason}:${n}`)
      .join(' '),
    economyCell(unlock.economy),
    win ? '' : 'mở nhờ boss ngẫu nhiên'
  ]
}

export function stuckNote(result: ProgressionResult): string {
  switch (result.stuckReason) {
    case 'maxBattles':
      return `kẹt sau ${result.totalBattles} trận`
    case 'maxMargin':
      return `kẹt: margin ${result.finalMargin} > giới hạn ${formatRatio(result.finalMarginLimit ?? 0)} sau ${result.totalBattles} trận`
    case 'teamDied':
      return `cả đội mẫu tọa hóa sau ${result.totalBattles} trận`
    case null:
      return ''
  }
}

/**
 * Ô kinh tế: món đã bán, vật phẩm thân mật, đá Mega / Z-Crystal / đồ chí mạng cầm, động phủ (nâng
 * công trình, quái giao việc, đồ lấy về),
 * extract / inject / mua tinh thể trait, quái phụ hiến tế, cấy ghép, sức chứa (bỏ mục 0).
 */
function economyCell(count: FloorUnlock['economy']): string {
  const parts: [string, number][] = [
    ['sold', count.itemsSold],
    ['affinity', count.affinityItemsUsed],
    ['mega', count.megaStonesHeld],
    ['zCrystal', count.zCrystalsHeld],
    ['critItem', count.critItemsHeld],
    ['buildings', count.buildingUpgrades],
    ['workers', count.workersAssigned],
    ['dwellingItems', count.dwellingItems],
    ['feed', count.feedStocked],
    ['sick', count.sickWorkers],
    ['cured', count.ailmentsCured],
    ['sickRest', count.sickRested],
    ['bond', count.bondsBound],
    ['contract', count.contracts],
    ['contractFail', count.contractFails],
    ['escape', count.contractEscapes],
    ['dex', count.dexRewards],
    ['extract', count.traitsExtracted],
    ['inject', count.traitsInjected],
    ['crystalBuy', count.crystalsBought],
    ['sacrifice', count.sacrifices],
    ['starFeed', count.starFeeds],
    ['stars/mon', round2(count.teamStars)],
    ['implant', count.implants],
    ['implantFail', count.implantFails],
    ['implantEffect', count.implantEffects],
    ['implantShare%', Math.round(count.implantSharePercent)],
    ['markTreat', count.marksTreated],
    ['scar/mon', round2(count.scarsPerMonster)],
    ['mutation/mon', round2(count.mutationsPerMonster)],
    ['adapt/mon', round2(count.adaptationsPerMonster)],
    ['trauma/mon', round2(count.traumasPerMonster)],
    ['trophy/mon', round2(count.trophiesPerMonster)],
    ['markStat%', round2(count.markStatPercent)],
    ['expand', count.capacityExpansions],
    ['storagePeak', count.storagePeak],
    ['bagPeak', count.bagPeak],
    ['incense', count.incense],
    ['deityBuy', count.deityBuys],
    ['favorRank', count.favorRank],
    ['achievement', count.achievementTiers],
    ['tamerTalent', count.tamerTalentUpgrades],
    ['sectMission', count.sectMissions],
    ['sectPromote', count.sectPromotions],
    ['sectWar', count.sectWarsWon],
    ['sectBattle', count.sectBattles],
    ['trade', count.trades],
    ['tradePower%', Math.round(count.tradePowerPercent)],
    ['gacha', count.gachaEggs],
    ['auctionBid', count.auctionBids],
    ['research', count.researchRewards],
    ['researchLv', count.researchLevelPeak]
  ]
  // Số âm cũng hiện (% chỉ số từ dấu ấn có thể âm khi sẹo nhiều hơn đột biến).
  return parts
    .filter(([, n]) => n !== 0)
    .map(([key, n]) => `${key}:${n}`)
    .join(' ')
}

/** Tên lần chơi: đội, thêm "(no growth)" khi không fuse / breeding. */
/** Tên lần chơi: đội, kèm "(no growth)" khi không fuse / breeding và "[độ khó]" khi khác Thường. */
export function runLabel(result: { teamId: string; growth: boolean; difficulty: string }): string {
  const base = result.growth ? result.teamId : `${result.teamId} (no growth)`
  return result.difficulty === 'normal' ? base : `${base} [${result.difficulty}]`
}

export function progressionTable(results: readonly ProgressionResult[]): Table {
  const rows = results.flatMap((result) => {
    // Lần chơi không dùng Thọ Nguyên Đan / không fuse, breeding ghi thêm vào tên đội.
    const teamId = result.usePills ? runLabel(result) : `${runLabel(result)} (no pills)`
    const unlockRows = result.unlocks.map((unlock) => unlockRow(teamId, unlock))
    if (result.stuckAtFloor === null) return unlockRows
    const blanks = new Array<string>(PROGRESSION_HEADERS.length - 3).fill('')
    return [...unlockRows, [teamId, String(result.stuckAtFloor), ...blanks, stuckNote(result)]]
  })
  return { headers: PROGRESSION_HEADERS, rows }
}

/** Tỉ lệ thắng trận boss tầng theo bossMultiplier, mỗi hệ số một dòng (hệ số nhỏ trước). */
export function bossMultiplierTable(results: readonly FloorResult[]): Table {
  const rows = results
    .filter((r) => r.kind === 'boss')
    .flatMap((r) =>
      sortedMultipliers(r.byBossMultiplier).map(([multiplier, bucket]) => [
        r.variantId,
        r.teamId,
        String(r.floor),
        multiplier,
        String(bucket.played),
        formatPercent(bucket.won, bucket.played)
      ])
    )
  return { headers: ['variant', 'team', 'floor', 'bossMultiplier', 'played', 'winRate'], rows }
}

/** Tỉ lệ thắng theo môi trường tự nhiên của biome: mỗi lớp / môi trường một dòng. */
export function naturalFieldTable(results: readonly FloorResult[]): Table {
  const rows = results.flatMap((r) =>
    Object.entries(r.byNaturalField)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, bucket]) => {
        const [layer, fieldId] = key.split(':')
        return [
          r.variantId,
          r.teamId,
          String(r.floor),
          r.kind,
          layer,
          fieldId,
          String(bucket.played),
          formatPercent(bucket.won, bucket.played)
        ]
      })
  )
  return {
    headers: ['variant', 'team', 'floor', 'kind', 'layer', 'field', 'played', 'winRate'],
    rows
  }
}

/** Trận gặp ngự thú sư NPC theo lớp (trainers.md): số trận và tỉ lệ thắng mỗi tầng / đội. */
export function trainerTable(results: readonly FloorResult[]): Table {
  const rows = results.flatMap((r) =>
    Object.entries(r.byTrainer)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([classId, bucket]) => [
        r.variantId,
        r.teamId,
        String(r.floor),
        classId,
        String(bucket.played),
        formatPercent(bucket.won, bucket.played)
      ])
  )
  return { headers: ['variant', 'team', 'floor', 'trainer', 'played', 'winRate'], rows }
}

function sortedMultipliers(
  byMultiplier: FloorResult['byBossMultiplier']
): [string, { played: number; won: number }][] {
  return Object.entries(byMultiplier).sort((a, b) => Number(a[0]) - Number(b[0]))
}

/** Tỉ lệ thắng theo hệ số gọn trong một ô: "×2 90.0% (10) ×3 60.0% (5)". */
export function formatByMultiplier(byMultiplier: FloorResult['byBossMultiplier']): string {
  return sortedMultipliers(byMultiplier)
    .map(([m, bucket]) => `×${m} ${formatPercent(bucket.won, bucket.played)} (${bucket.played})`)
    .join(' ')
}

export function bossLevelTable(rows: readonly BossLevelRow[]): Table {
  return {
    headers: [
      'team',
      'floor',
      'targetWinRate',
      'levelOffset',
      'level',
      'winRate',
      'played',
      'byBossMultiplier'
    ],
    rows: rows.map((row) => [
      row.teamId,
      String(row.floor),
      `${row.target}%`,
      row.offset === null ? `> ${row.maxOffset}` : String(row.offset),
      row.level === null ? '' : String(row.level),
      formatPercent(row.measured.won, row.measured.played),
      String(row.measured.played),
      formatByMultiplier(row.measured.byBossMultiplier)
    ])
  }
}

export function lineageTable(rows: readonly LineageRow[]): Table {
  return {
    headers: [
      'kind',
      'generation',
      'geneTotal',
      'statTotal',
      'statRatio',
      'aptitude',
      'aptitudeRatio',
      'cost',
      'sacrificeStacks',
      'sacrificeCost',
      'stars',
      'starCost',
      'successChance',
      'reachChance',
      'skillPower',
      'inheritedSkills',
      'bloodline',
      'purity',
      'note'
    ],
    rows: rows.map((row) => [
      row.kind,
      String(row.generation),
      formatDecimal(row.geneTotal),
      formatDecimal(row.statTotal),
      formatDecimal(row.statRatio),
      row.aptitudeTierId,
      formatDecimal(row.aptitudeRatio),
      formatDecimal(row.cost),
      String(row.sacrificeStacks),
      formatDecimal(row.sacrificeCost),
      String(row.stars),
      formatDecimal(row.starCost),
      row.successChance === null ? '' : `${row.successChance.toFixed(2)}%`,
      row.reachChance === null ? '' : `${row.reachChance.toPrecision(3)}%`,
      String(row.skillPower),
      row.inheritedSkills === null ? '' : String(row.inheritedSkills),
      row.bloodlineGroupId,
      String(row.bloodlinePurity),
      row.note
    ])
  }
}

/** Tóm tắt mỗi biến thể AI: tỉ lệ thắng và số lượt trung bình trên mọi đội, mọi tầng. */
export function aiSummaryTable(results: readonly FloorResult[]): Table {
  const variantIds = [...new Set(results.map((r) => r.variantId))]
  const kindStats = (
    variantId: string,
    kind: BattleKind
  ): { won: number; battles: number; turns: number } => {
    const matching = results.filter((r) => r.variantId === variantId && r.kind === kind)
    return {
      won: matching.reduce((sum, r) => sum + r.won, 0),
      battles: matching.reduce((sum, r) => sum + r.played, 0),
      turns: matching.reduce((sum, r) => sum + r.totalTurns, 0)
    }
  }
  return {
    headers: ['variant', 'wildWinRate', 'wildAvgTurns', 'bossWinRate', 'bossAvgTurns'],
    rows: variantIds.map((variantId) => {
      const wild = kindStats(variantId, 'wild')
      const boss = kindStats(variantId, 'boss')
      return [
        variantId,
        formatPercent(wild.won, wild.battles),
        wild.battles > 0 ? formatRatio(wild.turns / wild.battles) : '-',
        formatPercent(boss.won, boss.battles),
        boss.battles > 0 ? formatRatio(boss.turns / boss.battles) : '-'
      ]
    })
  }
}

/** Tỉ lệ dùng từng nhóm skill theo biến thể AI và phe (gộp mọi đội, mọi tầng). */
export function skillUsageTable(results: readonly FloorResult[]): Table {
  const rows: string[][] = []
  for (const variantId of new Set(results.map((r) => r.variantId))) {
    for (const side of ['player', 'enemy'] as const) {
      const counts: Record<string, number> = {}
      for (const result of results.filter((r) => r.variantId === variantId)) {
        for (const [group, count] of Object.entries(result.skillUses[side])) {
          counts[group] = (counts[group] ?? 0) + count
        }
      }
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
      for (const [group, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        rows.push([variantId, side, group, String(count), formatPercent(count, total)])
      }
    }
  }
  return { headers: ['variant', 'side', 'skillGroup', 'uses', 'share'], rows }
}

export interface PartSummary {
  part: SimPart
  jobs: number
  /** Tổng thời gian chạy các việc của phần này (cộng mọi worker). */
  ms: number
  totals: BattleTotalsByKind
}

/** Gom thời gian và số trận / lượt / trận hết lượt theo phần của lần chạy. */
export function summarizeRun(results: readonly TimedJobResult[]): PartSummary[] {
  return SIM_PARTS.map((part) => {
    const summary: PartSummary = { part, jobs: 0, ms: 0, totals: emptyBattleTotals() }
    for (const timed of results.filter((r) => r.part === part)) {
      summary.jobs++
      summary.ms += timed.ms
      addJobTotals(summary.totals, timed.result)
    }
    return summary
  })
}

function addJobTotals(totals: BattleTotalsByKind, result: TimedJobResult['result']): void {
  switch (result.type) {
    case 'sweep':
    case 'biomeSweep':
    case 'progressionSweep':
      for (const floor of result.type === 'biomeSweep' ? result.biomes : result.floors) {
        mergeBattleTotals(totals, floor.kind, {
          battles: floor.played,
          turns: floor.totalTurns,
          timeouts: floor.timeout
        })
      }
      break
    case 'bossLevel':
      mergeBattleTotals(totals, 'boss', result.totals)
      break
    case 'progression':
      for (const kind of ['wild', 'boss'] as const) {
        mergeBattleTotals(totals, kind, result.progression.battleTotals[kind])
      }
      break
    case 'tribulation':
      for (const row of result.rows) {
        mergeBattleTotals(totals, 'boss', {
          battles: row.battles,
          turns: row.totalTurns,
          timeouts: 0
        })
      }
      break
    case 'safari':
    case 'zones':
    case 'gathering':
    case 'worldBoss':
    case 'itemWorld':
    case 'lineage':
      break
  }
}

/** Độ kiếp theo tầng sẽ lên × độ lệch level (tribulation.ts). */
export function tribulationTable(rows: readonly TribulationRow[]): Table {
  return {
    headers: ['tier', 'levelOffset', 'level', 'battles', 'winRate', 'avgTurns'],
    rows: rows.map((row) => [
      String(row.tier),
      String(row.levelOffset),
      String(row.level),
      String(row.battles),
      formatPercent(row.won, row.battles),
      (row.totalTurns / Math.max(1, row.battles)).toFixed(2)
    ])
  }
}

/** Khu bảo tồn theo tầng × cách chơi (safari.ts): trung bình mỗi lượt vào khu. */
export function safariTable(rows: readonly SafariRow[]): Table {
  const perVisit = (value: number, row: SafariRow): string =>
    (value / Math.max(1, row.visits)).toFixed(2)
  const perCaught = (value: number, row: SafariRow): string =>
    row.caught > 0 ? (value / row.caught).toFixed(2) : '-'
  return {
    headers: [
      'floor',
      'policy',
      'visits',
      'caught/visit',
      'balls/visit',
      'fled/visit',
      'encounters/visit',
      'catchPerBall',
      'avgCatchRate',
      'avgRank',
      'unmappedShare',
      'fee',
      'feePerCatch'
    ],
    rows: rows.map((row) => [
      String(row.floor),
      row.policy,
      String(row.visits),
      perVisit(row.caught, row),
      perVisit(row.ballsThrown, row),
      perVisit(row.fled, row),
      perVisit(row.encounters, row),
      formatPercent(row.caught, row.ballsThrown),
      perCaught(row.catchRateSum, row),
      perCaught(row.rankSum, row),
      formatPercent(row.unmappedCaught, row.caught),
      String(row.fee),
      perCaught(row.fee * row.visits, row)
    ])
  }
}

/**
 * Hiểm địa theo hiểm địa × tầng (zones.ts): tỉ lệ xong / thua / bỏ, trận, boss canh giữ, giờ, giá
 * trị đồ (giá gốc) và tiền mỗi lượt vào, đồ tiếp tế đã dùng, giá trị ròng (trừ đồ đã dùng) mỗi giờ
 * game (so với farm tầng thường).
 */
export function zonesTable(rows: readonly ZoneRow[]): Table {
  const perVisit = (value: number, row: ZoneRow): string =>
    (value / Math.max(1, row.visits)).toFixed(1)
  return {
    headers: [
      'zone',
      'floor',
      'visits',
      'completed',
      'failed',
      'abandoned',
      'battles/visit',
      'battleWinRate',
      'guardianWinRate',
      'hours/visit',
      'loot/visit',
      'money/visit',
      'supplies/visit',
      'supplyCost/visit',
      'netValue/hour'
    ],
    rows: rows.map((row) => [
      row.zoneId,
      String(row.floor),
      String(row.visits),
      formatPercent(row.completed, row.visits),
      formatPercent(row.failed, row.visits),
      formatPercent(row.abandoned, row.visits),
      perVisit(row.battles, row),
      formatPercent(row.battlesWon, row.battles),
      formatPercent(row.guardianWins, row.guardianBattles),
      perVisit(row.hours, row),
      perVisit(row.lootValue, row),
      perVisit(row.money, row),
      perVisit(row.suppliesUsed, row),
      perVisit(row.supplyCost, row),
      ((row.lootValue + row.money - row.supplyCost) / Math.max(1, row.hours)).toFixed(1)
    ])
  }
}

/**
 * Câu cá / khai thác theo tầng × cách chơi (gathering.ts): map, % lần ra trận, tỉ lệ thắng, % loài
 * hiếm, level địch trung bình, giờ, đồ / tiền / mồi mỗi lần, giá trị ròng mỗi giờ game (so với dòng
 * `wild` cùng tầng: farm quái hoang thường ở cùng map).
 */
export function gatheringTable(rows: readonly GatheringRow[]): Table {
  const perCast = (value: number, row: GatheringRow): string =>
    (value / Math.max(1, row.casts)).toFixed(1)
  return {
    headers: [
      'floor',
      'run',
      'biome',
      'casts',
      'battleRate',
      'battleWinRate',
      'rareRate',
      'enemyLevel',
      'hours/cast',
      'items/cast',
      'money/cast',
      'lure/cast',
      'netValue/hour'
    ],
    rows: rows.map((row) => [
      String(row.floor),
      row.run.id,
      row.biomeId,
      String(row.casts),
      formatPercent(row.battles, row.casts),
      formatPercent(row.battlesWon, row.battles),
      formatPercent(row.rareEncounters, row.battles),
      (row.enemyLevelSum / Math.max(1, row.battles)).toFixed(1),
      perCast(row.hours, row),
      perCast(row.itemValue, row),
      perCast(row.money, row),
      perCast(row.lureCost, row),
      ((row.itemValue + row.money - row.lureCost) / Math.max(1, row.hours)).toFixed(1)
    ])
  }
}

/** Phân vị `p` (0–1) của danh sách đã sắp xếp tăng dần (rỗng = 0). */
function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

/**
 * Boss thế giới theo đội × tầng (worldBoss.ts): % lần cả đội gục, tổng sát thương theo bội số máu
 * đơn vị (trung bình, phân vị 25 / 50 / 75), % lần đạt từng bậc (bậc cao nhất đạt được, theo thứ tự
 * config.worldBoss.tiers; "-" = chưa đạt bậc nào).
 */
export function worldBossTable(rows: readonly WorldBossRow[], tierIds: readonly string[]): Table {
  const columns = [NO_TIER, ...tierIds]
  return {
    headers: [
      'team',
      'floor',
      'challenges',
      'wipeRate',
      'avgMultiple',
      'p25',
      'p50',
      'p75',
      ...columns
    ],
    rows: rows.map((row) => {
      const sorted = [...row.multiples].sort((a, b) => a - b)
      const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length)
      return [
        row.teamId,
        String(row.floor),
        String(row.challenges),
        formatPercent(row.lost, row.challenges),
        mean.toFixed(2),
        ...[0.25, 0.5, 0.75].map((p) => quantile(sorted, p).toFixed(2)),
        ...columns.map((id) => formatPercent(row.tiers[id] ?? 0, row.challenges))
      ]
    })
  }
}

/**
 * Khí giới bí cảnh theo đội × tầng × bậc món (itemWorld.ts): số tầng qua (= cấp lên), % dừng sớm,
 * giờ mỗi cấp, tiền nhận mỗi giờ trong lượt đi, giá cường hóa cùng số cấp (tiền, đá, yêu đan) và số
 * giờ đi Khí giới bí cảnh để kiếm đủ tiền cường hóa đó (enhanceHours = enhanceMoney ÷ tiền mỗi giờ).
 * itemWorldVsEnhance = giờ Khí giới bí cảnh ÷ enhanceHours (< 1: Khí giới bí cảnh nhanh hơn).
 */
export function itemWorldTable(rows: readonly ItemWorldRow[]): Table {
  return {
    headers: [
      'team',
      'floor',
      'rarity',
      'levels',
      'battles',
      'stopped',
      'hoursPerLevel',
      'moneyPerHour',
      'enhanceMoney',
      'enhanceStones',
      'enhanceCores',
      'enhanceHours',
      'itemWorldVsEnhance',
      'spiritsSubdued'
    ],
    rows: rows.map((row) => {
      const moneyPerHour = row.hours > 0 ? row.moneyEarned.div(row.hours) : row.moneyEarned
      const enhanceHours = moneyPerHour.gt(0) ? row.enhanceMoney.div(moneyPerHour).toNumber() : 0
      return [
        row.teamId,
        String(row.floor),
        row.rarity,
        String(row.cleared),
        String(row.battles),
        row.stopped ? 'yes' : 'no',
        row.cleared > 0 ? (row.hours / row.cleared).toFixed(2) : '-',
        moneyPerHour.toFixed(0),
        row.enhanceMoney.toFixed(0),
        String(row.enhanceStones),
        String(row.enhanceCores),
        enhanceHours.toFixed(1),
        enhanceHours > 0 ? (row.hours / enhanceHours).toFixed(2) : '-',
        String(row.spiritsSubdued)
      ]
    })
  }
}

export function runSummaryTable(parts: readonly PartSummary[]): Table {
  return {
    headers: [
      'part',
      'jobs',
      'seconds',
      'wildBattles',
      'wildTurns',
      'wildTimeouts',
      'bossBattles',
      'bossTurns',
      'bossTimeouts'
    ],
    rows: parts.map((p) => [
      p.part,
      String(p.jobs),
      (p.ms / 1000).toFixed(1),
      String(p.totals.wild.battles),
      String(p.totals.wild.turns),
      String(p.totals.wild.timeouts),
      String(p.totals.boss.battles),
      String(p.totals.boss.turns),
      String(p.totals.boss.timeouts)
    ])
  }
}
