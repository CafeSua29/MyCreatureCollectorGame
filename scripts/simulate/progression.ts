// Chơi liên tục từ tầng 1 (mục "Chơi liên tục" ở simulation.md): farm quái hoang (tầng farm chọn
// theo tỉ lệ thắng gần đây), đánh boss tầng cao nhất khi chính sách bossPolicy cho phép; mất máu
// thì về thị trấn hồi (miễn phí). Đội lên level thật theo EXP. Đo số trận để mở từng tầng.

import { autoEquip, averageSourcePercent } from './gear'
import {
  BIG_ZERO,
  GROWTH_RATES,
  createGameState,
  createRng,
  dayOf,
  floorBossLevel,
  groupItemCount,
  levelFromExp,
  mapBigStats,
  maxBig,
  pick,
  type GameAction,
  type GameData,
  type GameState,
  type GrowthRate,
  type Monster,
  type RngState
} from '@core'
import {
  addBattleTotals,
  emptyBattleTotals,
  runBattle,
  type BattleKind,
  type BattleStats,
  type BattleTotalsByKind
} from './battleRunner'
import {
  afterBossBattle,
  afterWildBattle,
  farmAt,
  initialPolicyState,
  isPolicyStuck,
  marginLimit,
  nextFarmState,
  onFloorUnlocked,
  shouldChallengeBoss,
  type BossPolicyState,
  type FarmState
} from './bossPolicy'
import { feedCandies } from './candy'
import { feedTreasures } from './treasures'
import { upgradeSoulLevels } from './soulLevels'
import { allocateTalents } from './talents'
import { tuneTeamTraits } from './traitCrystals'
import { implantSharePercent, implantTeam } from './implant'
import { sacrificeSpareFodder } from './sacrifice'
import { rebirthWhenPossible } from './rebirth'
import { highestFavorRank, runDeities } from './deities'
import { castWithCores, enhanceTeamGear, imbueTeamGear, salvageSurplus } from './forge'
import { runAlchemy } from './alchemy'
import { runCooking } from './cooking'
import { runQuests } from './quests'
import { runTrainerChallenges } from './trainers'
import { runTrials } from './trials'
import { sendExpeditions } from './expeditions'
import { buySkillBooks, teachSkillBooks } from './books'
import { breakthroughWhilePossible, readyToBreakthrough } from './tamer'
import { awakenWhilePossible, readyToAwaken, takeHumanFormWhenPossible } from './awakening'
import { turnLimit, type ProgressionSpec, type TeamSpec } from './scenarios'
import { floorMapsFor } from './floorSweep'
import { averageMastery } from './mastery'
import { buildTeam, deriveSeed, geneValue } from './team'
import {
  newLifespanTracker,
  handleSouls,
  previewRelics,
  recordDayEvents,
  feedPillsWhenOld,
  type LifespanTracker
} from './lifespan'
import {
  bindBondWhenPossible,
  contractTeamWhenPossible,
  claimAchievementsWhenPossible,
  claimResearchRewardsWhenPossible,
  claimDexRewardsWhenPossible,
  buyPlotWhenCheap,
  expandCapacityWhenFull,
  feedAffinityItems,
  holdMegaStones,
  holdCritItems,
  holdZCrystals,
  newEconomyCount,
  sellSurplus,
  type EconomyCount
} from './economy'
import {
  breedWhenPossible,
  buyBalls,
  intimidateCommand,
  recruitDecision,
  applyBaitWhenNeeded,
  captureCommand,
  fuseWhenPossible,
  newGrowthCount,
  petRequests,
  promoteChildren,
  releaseStaleFodder,
  applyFormations,
  type GrowthCount
} from './growth'
import { beginEventTally, mergeEventTally, simAct, takeEventTally, type EventTally } from './events'

export interface LevelSpread {
  average: number
  min: number
  max: number
}

/** Trận thắng boss tầng đã mở tầng. */
export interface BossWin {
  /** margin của bossPolicy lúc đánh trận đó. */
  margin: number
  /** Level của đội mẫu lúc vào trận. */
  level: LevelSpread
  bossMultiplier: number
}

export interface FloorUnlock {
  /** Tầng vừa vượt qua (hạ boss tầng này thì mở tầng tiếp theo). */
  floor: number
  wildBattles: number
  /** Số trận quái hoang theo tầng đã farm (khóa = tầng). */
  farmBattles: Record<number, number>
  bossAttempts: number
  /** Số lần đánh boss tầng mà không thắng (thua hoặc hết lượt). */
  bossLosses: number
  losses: number
  timeouts: number
  /** Số Kẹo EXP / Kẹo Hiếm đã dùng trong lúc ở tầng này (mục "Kẹo EXP" ở simulation.md). */
  candiesUsed: number
  /** Số lần dùng sách kỹ năng trong lúc ở tầng này (mục "Sách kỹ năng" ở simulation.md). */
  booksUsed: number
  /** Số sách kỹ năng rơi trong lúc ở tầng này. */
  booksDropped: number
  /** Số Bí kíp mua ở kệ sách trong lúc ở tầng này. */
  booksBought: number
  /** Số lần đột phá cảnh giới thất bại trong lúc ở tầng này. */
  breakthroughFails: number
  /** Số lần độ kiếp thắng / thua trong lúc ở tầng này (awakening.ts). */
  awakenings: number
  tribulationFails: number
  /** Số quái đội mẫu hóa hình trong lúc ở tầng này. */
  humanForms: number
  /** Số lần luân hồi quái đội mẫu trong lúc ở tầng này (rebirth.ts). */
  rebirths: number
  /** Số thiên tài địa bảo đã cho ăn trong lúc ở tầng này (treasures.ts). */
  treasuresUsed: number
  /** Số lần nâng hồn tinh trong lúc ở tầng này (soulLevels.ts). */
  soulUpgrades: number
  /** Số lần nâng nút thiên phú trong lúc ở tầng này (talents.ts). */
  talentUpgrades: number
  /** Số lần cường hóa / số món phân giải ở Thợ rèn trong lúc ở tầng này (forge.ts). */
  enhances: number
  salvaged: number
  /** Số lần đúc trang bị / phụ linh bằng yêu đan trong lúc ở tầng này (forge.ts). */
  casts: number
  imbues: number
  /** Số lần luyện đan / thu hoạch linh điền trong lúc ở tầng này (alchemy.ts). */
  crafts: number
  harvests: number
  /** Số món ăn linh thực đã ăn / số lần nấu trong lúc ở tầng này (cooking.ts). */
  meals: number
  cooks: number
  /** Số nhiệm vụ đã nhận thưởng trong lúc ở tầng này (quests.ts). */
  questsClaimed: number
  /** Số đội thám hiểm đã phái trong lúc ở tầng này (expeditions.ts). */
  expeditionsSent: number
  /** Trận ngự thú sư NPC (gặp trên tầng, đạo quán, giải đấu, đấu trường; trainers.ts) và số thắng. */
  trainerBattles: number
  trainerWins: number
  /** Huy hiệu / chức vô địch giải đấu giành được trong lúc ở tầng này. */
  badges: number
  tournamentsWon: number
  /** Bậc đấu trường lúc mở tầng. */
  arenaRank: number
  /** Bí cảnh đã vào / hoàn thành, số trận bí cảnh, số tầng tháp đã thắng (trials.ts). */
  trialsEntered: number
  trialsCompleted: number
  trialBattles: number
  towerWins: number
  /** Tầng tháp cao nhất lúc mở tầng. */
  towerFloor: number
  /** Bắt quái, fuse (thành công / thất bại, quái đội mẫu mất), breeding, con vào đội (growth.ts). */
  growth: GrowthCount
  /** Bán đồ, vật phẩm thân mật, đá Mega, ô linh điền (economy.ts). */
  economy: EconomyCount
  /** Event đã gặp, trận event / số thắng, thú triều (bắt đầu / thắng hết / thất bại, đợt thắng; events.ts). */
  events: EventTally
  /** Cấp luyện đan / luyện khí và số yêu đan (nhóm nguyên liệu đúc) trong túi lúc mở tầng. */
  alchemyLevel: number
  smithingLevel: number
  /** Cấp nấu ăn lúc mở tầng (cooking.ts). */
  cookingLevel: number
  demonCores: number
  /** Tầng thức tỉnh trung bình của đội mẫu lúc mở tầng. */
  averageAwakening: number
  /** Cảnh giới ngự thú sư lúc mở tầng. */
  realm: number
  /** Level trung bình của đội lúc mở tầng. */
  averageLevel: number
  /**
   * Level trung bình của đội nếu cùng lượng EXP thuộc từng nhóm tăng trưởng (docs/rules/growth-rates.md;
   * đội mẫu đều Medium Fast nên đo bằng cách này, không chạy thêm trận).
   */
  growthLevels: Record<GrowthRate, number>
  /** Trung bình % chỉ số từ trang bị của đội mẫu lúc mở tầng (trung bình 6 chỉ số). */
  gearPercent: number
  /** Như gearPercent, nguồn hồn tinh (soulLevels.ts). */
  soulPercent: number
  /** Như gearPercent, nguồn thiên phú (talents.ts). */
  talentPercent: number
  /** Như gearPercent, nguồn điểm nỗ lực (docs/rules/effort-values.md). */
  effortPercent: number
  /** Số quái đội mẫu đã từng nhiễm linh dịch (đang nhiễm hoặc miễn dịch; spirit-virus.md). */
  spiritVirus: number
  /** Cấp / exp thuần thục trung bình trên mọi skill đang biết của đội mẫu lúc mở tầng. */
  masteryLevel: number
  masteryExp: number
  /** null = mở tầng nhờ gặp boss tầng ngẫu nhiên trong trận quái hoang. */
  bossWin: BossWin | null
}

/**
 * Lý do dừng trước khi qua tầng cuối: hết maxBattles, margin vượt giới hạn (marginLimit), hoặc mọi
 * quái đội mẫu đã tọa hóa (thọ nguyên).
 */
export type StuckReason = 'maxBattles' | 'maxMargin' | 'teamDied'

/**
 * Đội mẫu thật lúc vừa tới một tầng (mục "Quét tầng bằng đội thật" ở simulation.md): level, thuần
 * thục, thân mật, trang bị... đúng như đã tích lũy; máu đầy, không trạng thái (như đầu mỗi trận quét).
 */
export interface TeamSnapshot {
  teamId: string
  floor: number
  party: Monster[]
  tamerRealm: number
}

export interface ProgressionResult {
  teamId: string
  /** Đội mẫu lúc vừa tới từng tầng (tầng 1 lúc bắt đầu, tầng sau lúc vừa mở). */
  snapshots: TeamSnapshot[]
  /** Chế độ dùng Thọ Nguyên Đan / fuse, breeding của lần chơi này. */
  usePills: boolean
  growth: boolean
  /** Quái tọa hóa, cảnh báo, đan đã dùng (mục "Thọ nguyên" ở simulation.md). */
  lifespan: LifespanTracker
  unlocks: FloorUnlock[]
  totalBattles: number
  /** Tầng bị kẹt; null = đã qua tầng cuối. */
  stuckAtFloor: number | null
  stuckReason: StuckReason | null
  /** margin của bossPolicy lúc dừng. */
  finalMargin: number
  /** Giới hạn margin ở tầng lúc dừng (marginLimit); null với everyWins. */
  finalMarginLimit: number | null
  battleTotals: BattleTotalsByKind
  /** Số liệu event cả lần chơi (events.ts). */
  eventTotals: EventTally
}

export interface ProgressionOptions extends ProgressionSpec {
  team: TeamSpec
  /** Dừng khi đã vượt qua tầng này. */
  toFloor: number
  maxTurns: number
  maxTurnsBoss: number
  seed: number
  /** "Người chơi" dùng Thọ Nguyên Đan cho quái đội mẫu sắp thọ tận. */
  usePills: boolean
  /** "Người chơi" bắt quái, fuse, breeding, đưa con vào đội (growth.ts). */
  growth: boolean
}

type FloorCounter = Omit<
  FloorUnlock,
  | 'floor'
  | 'averageLevel'
  | 'growthLevels'
  | 'gearPercent'
  | 'soulPercent'
  | 'talentPercent'
  | 'effortPercent'
  | 'spiritVirus'
  | 'bossWin'
  | 'realm'
  | 'masteryLevel'
  | 'masteryExp'
  | 'averageAwakening'
  | 'alchemyLevel'
  | 'smithingLevel'
  | 'cookingLevel'
  | 'demonCores'
  | 'arenaRank'
  | 'towerFloor'
  | 'events'
  | 'growth'
  | 'economy'
>

/** Cứ số trận quái hoang này thì một trận "người chơi" dùng explore (giả định của mô phỏng). */
const EXPLORE_EVERY = 5

/** Số tầng tháp "người chơi" thử tối đa mỗi ngày game (giả định của mô phỏng, không phải luật). */
const TOWER_ATTEMPTS_PER_DAY = 3

const newCounter = (): FloorCounter => ({
  wildBattles: 0,
  farmBattles: {},
  bossAttempts: 0,
  bossLosses: 0,
  losses: 0,
  timeouts: 0,
  candiesUsed: 0,
  booksUsed: 0,
  booksDropped: 0,
  booksBought: 0,
  breakthroughFails: 0,
  awakenings: 0,
  tribulationFails: 0,
  humanForms: 0,
  rebirths: 0,
  treasuresUsed: 0,
  soulUpgrades: 0,
  talentUpgrades: 0,
  enhances: 0,
  salvaged: 0,
  casts: 0,
  imbues: 0,
  crafts: 0,
  harvests: 0,
  meals: 0,
  cooks: 0,
  questsClaimed: 0,
  expeditionsSent: 0,
  trainerBattles: 0,
  trainerWins: 0,
  badges: 0,
  tournamentsWon: 0,
  trialsEntered: 0,
  trialsCompleted: 0,
  trialBattles: 0,
  towerWins: 0
})

/** Phần thay đổi sau mỗi trận của một lần chơi liên tục. */
interface Run {
  state: GameState
  policy: BossPolicyState
  farm: FarmState
  counter: FloorCounter
  unlocks: FloorUnlock[]
  snapshots: TeamSnapshot[]
  lifespan: LifespanTracker
  /** Số trận đã đánh (ghi trận của lần tọa hóa). */
  battles: number
  /** Bắt / fuse / breeding từ lần mở tầng trước (growth.ts) và ngày breed gần nhất. */
  growth: GrowthCount
  economy: EconomyCount
  lastBreedDay: number
  /** Ngày gần nhất đã làm việc NPC ở thị trấn (trainers.ts: mỗi ngày tối đa một lần). */
  trainerDay: number
}

/** Đội mẫu của state lúc vừa tới `floor`, hồi đầy máu và bỏ trạng thái. */
function snapshotOf(
  state: GameState,
  { teamId, teamIds, floor }: { teamId: string; teamIds: ReadonlySet<string>; floor: number }
): TeamSnapshot {
  const party = state.party
    .filter((monster) => teamIds.has(monster.id))
    .map((monster) => ({ ...monster, damageTaken: BIG_ZERO, statuses: [] }))
  return { teamId, floor, party, tamerRealm: state.tamer.realm }
}

export function runProgression(data: GameData, options: ProgressionOptions): ProgressionResult {
  const { team, seed } = options
  const party = buildTeam(data, team, 1, deriveSeed(seed, 'team', team.id, 1))
  const teamIds = new Set(party.map((m) => m.id))
  beginEventTally()
  const run: Run = {
    // Tầng 1 tung map như game mới; tầng sau do reducer tung khi mở tầng.
    state: createGameState({
      // Mô phỏng đo với thọ nguyên bật (game mới mặc định tắt, docs/rules/options.md).
      lifespanEnabled: true,
      seed: deriveSeed(seed, 'progression', team.id),
      party,
      location: { type: 'floor', floor: 1 },
      floorBiomeIds: floorMapsFor(data, {
        floor: 1,
        biomeId: null,
        seed: deriveSeed(seed, 'map', team.id)
      })
    }),
    policy: initialPolicyState(options.bossPolicy),
    farm: farmAt(1),
    counter: newCounter(),
    unlocks: [],
    snapshots: [],
    lifespan: newLifespanTracker(),
    battles: 0,
    growth: newGrowthCount(),
    economy: newEconomyCount(),
    lastBreedDay: -Infinity,
    trainerDay: -1
  }
  run.snapshots.push(snapshotOf(run.state, { teamId: team.id, teamIds, floor: 1 }))
  // Luồng ngẫu nhiên riêng cho lựa chọn của "người chơi" (rẽ nhánh tiến hóa).
  let choiceRng = createRng(deriveSeed(seed, 'choices', team.id))
  let stuckReason: StuckReason | null = null
  const battleTotals = emptyBattleTotals()

  while (run.state.highestFloor <= options.toFloor) {
    if (run.battles >= options.maxBattles) {
      stuckReason = 'maxBattles'
      break
    }
    if (
      isPolicyStuck(options.bossPolicy, run.policy, floorBossLevel(data, run.state.highestFloor))
    ) {
      stuckReason = 'maxMargin'
      break
    }
    const { kind, stats } = playBattle(data, run, { options, teamIds })
    run.battles++
    addBattleTotals(battleTotals, kind, stats)
    // Mọi quái đội mẫu đã tọa hóa: không còn đội để đo.
    if (!run.state.party.some((m) => teamIds.has(m.id))) {
      stuckReason = 'teamDied'
      break
    }
    choiceRng = afterBattle(data, run, {
      rng: choiceRng,
      teamIds,
      usePills: options.usePills,
      growth: options.growth,
      trainerMaxTurns: turnLimit(options, 'wild'),
      bossMaxTurns: turnLimit(options, 'boss')
    })
  }
  previewRelics(data, run.state, { teamIds, tracker: run.lifespan })
  return {
    teamId: team.id,
    snapshots: run.snapshots,
    usePills: options.usePills,
    growth: options.growth,
    lifespan: run.lifespan,
    unlocks: run.unlocks,
    totalBattles: run.battles,
    stuckAtFloor: stuckReason ? run.state.highestFloor : null,
    stuckReason,
    finalMargin: run.policy.margin,
    finalMarginLimit: marginLimit(options.bossPolicy, floorBossLevel(data, run.state.highestFloor)),
    battleTotals,
    eventTotals: run.unlocks.reduce(
      (total, unlock) => mergeEventTally(total, unlock.events),
      takeEventTally()
    )
  }
}

/** Đánh một trận (boss tầng cao nhất nếu bossPolicy cho phép, không thì quái hoang ở tầng farm). */
function playBattle(
  data: GameData,
  run: Run,
  { options, teamIds }: { options: ProgressionOptions; teamIds: Set<string> }
): { kind: BattleKind; stats: BattleStats } {
  const highest = run.state.highestFloor
  const level = levelSpread(run.state.party, teamIds)
  const bossLevel = floorBossLevel(data, highest)
  const isBoss = shouldChallengeBoss(options.bossPolicy, run.policy, {
    averageLevel: level.average,
    bossLevel
  })
  const kind: BattleKind = isBoss ? 'boss' : 'wild'
  const floor = isBoss ? highest : run.farm.floor
  const margin = run.policy.margin
  const atFloor = actTimed(data, run, { type: 'travel', to: { type: 'floor', floor } }, teamIds)
  // Mỗi EXPLORE_EVERY trận quái hoang "người chơi" chủ động khám phá (tìm event).
  const explore = kind === 'wild' && run.battles % EXPLORE_EVERY === 0
  const { state, stats } = runBattle(data, atFloor, {
    kind,
    maxTurns: turnLimit(options, kind),
    ...(explore ? { start: { type: 'explore' } as const } : {}),
    // Bắt / thu phục quái làm nguyên liệu fuse (growth.ts).
    ...(options.growth
      ? {
          capture: (s: GameState) => captureCommand(data, s, teamIds),
          tamer: (s: GameState) => intimidateCommand(data, s, teamIds),
          recruit: (s: GameState) => recruitDecision(data, s, teamIds)
        }
      : {})
  })
  run.growth.captures += stats.captures
  run.growth.ballsThrown += stats.ballsThrown
  run.growth.recruitOffers += stats.recruitOffers
  run.growth.recruits += stats.recruits
  run.growth.intimidates += stats.intimidates
  run.growth.intimidateWins += stats.intimidateWins
  run.lifespan.battleFallen += stats.playerFallen
  run.state = state
  // Trận vừa rời (leaveBattle) làm thời gian trôi.
  recordDayEvents(run.lifespan, state, { battle: run.battles + 1, teamIds })
  const won = stats.outcome === 'won'
  const { counter } = run
  if (isBoss) {
    counter.bossAttempts++
    if (!won) counter.bossLosses++
    run.policy = afterBossBattle(options.bossPolicy, run.policy, won)
  } else {
    counter.wildBattles++
    counter.farmBattles[floor] = (counter.farmBattles[floor] ?? 0) + 1
    run.policy = afterWildBattle(run.policy, won)
    run.farm = nextFarmState(options.farm, run.farm, { won, highestFloor: highest })
  }
  counter.booksDropped += stats.booksDropped
  if (stats.trainerClassId !== null) {
    counter.trainerBattles++
    if (won) counter.trainerWins++
  }
  if (stats.outcome === 'lost') counter.losses++
  if (stats.outcome === 'timeout') counter.timeouts++
  if (state.highestFloor > highest) {
    const bossWin = isBoss ? { margin, level, bossMultiplier: stats.bossMultiplier } : null
    const averageLevel = levelSpread(state.party, teamIds).average
    const gearPercent = averageSourcePercent(data, state, teamIds, 'equipment')
    const realm = state.tamer.realm
    const mastery = averageMastery(state.party, teamIds)
    run.unlocks.push({
      floor: highest,
      ...counter,
      averageLevel,
      growthLevels: growthLevels(state.party, teamIds),
      gearPercent,
      soulPercent: averageSourcePercent(data, state, teamIds, 'soulLevel'),
      talentPercent: averageSourcePercent(data, state, teamIds, 'talent'),
      effortPercent: averageSourcePercent(data, state, teamIds, 'effort'),
      spiritVirus: state.party.filter((m) => teamIds.has(m.id) && m.spiritVirus !== null).length,
      masteryLevel: mastery.level,
      masteryExp: mastery.exp,
      bossWin,
      realm,
      averageAwakening: averageAwakening(state.party, teamIds),
      alchemyLevel: state.alchemy.level,
      smithingLevel: state.smithing.level,
      cookingLevel: state.cooking.level,
      demonCores: groupItemCount(data, state.inventory, data.config.forge.coreEnhance.groupId),
      arenaRank: state.trainers.arenaRank,
      towerFloor: state.tower.highest,
      events: takeEventTally(),
      growth: run.growth,
      economy: { ...run.economy, favorRank: highestFavorRank(data, state) }
    })
    run.counter = newCounter()
    run.growth = newGrowthCount()
    run.economy = newEconomyCount()
    run.policy = onFloorUnlocked(run.policy)
    run.farm = farmAt(state.highestFloor)
    if (options.genesFollowFloor) {
      run.state = {
        ...run.state,
        party: raiseGenesToFloor(data, run.state.party, options.team, state.highestFloor)
      }
    }
    if (state.highestFloor <= options.toFloor) {
      const where = { teamId: options.team.id, teamIds, floor: state.highestFloor }
      run.snapshots.push(snapshotOf(run.state, where))
    }
  }
  return { kind, stats }
}

/**
 * Gen của đội mẫu (id m1, m2... theo thứ tự khai báo) nâng lên gen của tầng `floor` theo bản mẫu
 * (gen "wild" = giữa khoảng gen quái hoang của tầng), chỉ tăng, không giảm. Quái khác giữ nguyên.
 */
export function raiseGenesToFloor(
  data: GameData,
  party: readonly Monster[],
  team: TeamSpec,
  floor: number
): Monster[] {
  return party.map((monster) => {
    const index = team.members.findIndex((_, i) => `m${i + 1}` === monster.id)
    if (index < 0) return monster
    const target = geneValue(data, floor, team.members[index].genes)
    return { ...monster, genes: mapBigStats((stat) => maxBig(monster.genes[stat], target)) }
  })
}

const act = (data: GameData, state: GameState, action: GameAction): GameState =>
  simAct(data, state, action)

/** Action tốn giờ: áp vào run.state và ghi sự kiện tọa hóa / cảnh báo của lần trôi thời gian đó. */
function actTimed(
  data: GameData,
  run: Run,
  action: GameAction,
  teamIds: ReadonlySet<string>
): GameState {
  run.state = act(data, run.state, action)
  recordDayEvents(run.lifespan, run.state, { battle: run.battles, teamIds })
  return run.state
}

/** Tầng thức tỉnh trung bình của đội mẫu. */
function averageAwakening(party: readonly Monster[], teamIds: ReadonlySet<string>): number {
  const tiers = party.filter((m) => teamIds.has(m.id)).map((m) => m.awakening)
  return tiers.length === 0 ? 0 : tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length
}

/** Level trung bình / thấp nhất / cao nhất của đội mẫu (bỏ quái vừa nở, chưa kịp vào kho). */
/** Level trung bình của đội mẫu theo từng nhóm tăng trưởng với cùng EXP hiện có. */
function growthLevels(
  party: readonly Monster[],
  teamIds: ReadonlySet<string>
): Record<GrowthRate, number> {
  const team = party.filter((m) => teamIds.has(m.id))
  const average = (rate: GrowthRate): number =>
    team.reduce((sum, m) => sum + levelFromExp(m.exp, rate), 0) / team.length
  return Object.fromEntries(GROWTH_RATES.map((rate) => [rate, average(rate)])) as Record<
    GrowthRate,
    number
  >
}

function levelSpread(party: readonly Monster[], teamIds: ReadonlySet<string>): LevelSpread {
  const levels = party.filter((m) => teamIds.has(m.id)).map((m) => m.level)
  return {
    average: levels.reduce((sum, level) => sum + level, 0) / levels.length,
    min: Math.min(...levels),
    max: Math.max(...levels)
  }
}

/**
 * Việc của "người chơi" sau trận: dùng hết kẹo lên quái đội mẫu level thấp nhất, dạy sách kỹ năng
 * rơi được (books.ts), chọn rẽ nhánh
 * tiến hóa (ngẫu nhiên), học / bỏ skill chờ học,
 * đưa quái mới (trứng nở) vào kho để giữ nguyên đội mẫu, dùng Thọ Nguyên Đan cho quái sắp thọ tận
 * (tùy chế độ), về thị trấn hồi máu nếu cần. Trả RNG lựa chọn mới.
 */
function afterBattle(
  data: GameData,
  run: Run,
  {
    rng,
    teamIds,
    usePills,
    growth,
    trainerMaxTurns,
    bossMaxTurns
  }: {
    rng: RngState
    /** Đội mẫu; fuse thất bại / con breeding vào đội thì đổi (growth.ts). */
    teamIds: Set<string>
    usePills: boolean
    growth: boolean
    trainerMaxTurns: number
    bossMaxTurns: number
  }
): RngState {
  const fed = feedCandies(data, run.state, teamIds)
  let { state } = fed
  run.counter.candiesUsed += fed.used
  state = feedAffinityItems(data, state, teamIds, run.economy)
  const treasures = feedTreasures(data, state, teamIds)
  state = treasures.state
  run.counter.treasuresUsed += treasures.used
  const taught = teachSkillBooks(data, state, teamIds)
  state = taught.state
  run.counter.booksUsed += taught.used
  for (const monster of state.party) {
    if (monster.pendingEvolutionIds.length > 0) {
      let speciesId: string
      ;[speciesId, rng] = pick(rng, monster.pendingEvolutionIds)
      state = act(data, state, { type: 'chooseEvolution', monsterId: monster.id, speciesId })
    }
  }
  for (const monster of state.party) state = handlePendingSkills(data, state, monster.id)
  state = keepSampleTeam(data, state, teamIds)
  state = autoEquip(data, state, teamIds)
  state = holdMegaStones(data, state, teamIds, run.economy)
  state = holdZCrystals(data, state, teamIds, run.economy)
  if (usePills) state = feedPillsWhenOld(data, state, { teamIds, tracker: run.lifespan })
  if (growth) state = petRequests(data, state)
  run.state = state
  // Mất máu thì về hồi; đủ EXP ngự thú sư thì về đột phá (mục "Ngự thú sư" ở
  // simulation-features.md); quái đủ level thì về độ kiếp (mục "Độ kiếp").
  const hurt = state.party.some((m) => m.damageTaken.gt(0))
  if (hurt || readyToBreakthrough(data, state) || readyToAwaken(data, state, teamIds)) {
    actTimed(data, run, { type: 'travel', to: { type: 'town' } }, teamIds)
    if (hurt) actTimed(data, run, { type: 'healParty' }, teamIds)
    // Phân giải đồ dư lấy đá (forge.ts), rồi bán nguyên liệu dư trước mọi việc tốn tiền (economy.ts).
    const salvaged = salvageSurplus(data, run.state)
    run.state = salvaged.state
    run.counter.salvaged += salvaged.salvaged
    run.state = sellSurplus(data, run.state, run.economy)
    const expedition = sendExpeditions(data, run.state)
    run.state = expedition.state
    run.counter.expeditionsSent += expedition.sent
    const quested = runQuests(data, run.state)
    run.state = quested.state
    run.counter.questsClaimed += quested.claimed
    // Nấu ăn trước luyện đan (luyện đan dùng hết dược liệu).
    const cooked = runCooking(data, run.state)
    run.state = cooked.state
    run.counter.meals += cooked.meals
    run.counter.cooks += cooked.cooks
    const crafted = runAlchemy(data, run.state)
    run.state = crafted.state
    run.counter.crafts += crafted.crafts
    run.counter.harvests += crafted.harvests
    // Hồn phách của quái chết hẳn (tọa hóa, độ kiếp): luyện hồn khí / ấp trứng (lifespan.ts).
    run.state = handleSouls(data, run.state, run.lifespan)
    run.state = buyPlotWhenCheap(data, run.state, run.economy)
    run.state = expandCapacityWhenFull(data, run.state, run.economy)
    // Khế ước trước bản mệnh (bản mệnh phải đã khế ước).
    run.state = contractTeamWhenPossible(data, run.state, teamIds, run.economy)
    run.state = claimDexRewardsWhenPossible(data, run.state, run.economy)
    run.state = claimResearchRewardsWhenPossible(data, run.state, run.economy)
    run.state = claimAchievementsWhenPossible(data, run.state, run.economy)
    run.state = bindBondWhenPossible(data, run.state, teamIds, run.economy)
    const tried = breakthroughWhilePossible(data, run.state)
    run.state = tried.state
    run.counter.breakthroughFails += tried.failures
    const awakened = awakenWhilePossible(data, run.state, teamIds)
    run.state = awakened.state
    run.counter.awakenings += awakened.successes
    run.counter.tribulationFails += awakened.failures
    const formed = takeHumanFormWhenPossible(data, run.state, teamIds)
    run.state = formed.state
    run.counter.humanForms += formed.taken
    const reborn = rebirthWhenPossible(data, run.state, teamIds)
    run.state = reborn.state
    run.counter.rebirths += reborn.rebirths
    // Fuse, breeding, trận pháp (growth.ts): sau đột phá / độ kiếp, trước hồn tinh và việc NPC
    // (người chơi ưu tiên fuse hơn hồn tinh).
    if (growth) runGrowth(data, run, teamIds)
    // Hồn tinh sau đột phá / độ kiếp (hai việc đó ưu tiên tiền).
    const souls = upgradeSoulLevels(data, run.state, teamIds)
    run.state = souls.state
    run.counter.soulUpgrades += souls.upgrades
    // Thiên phú không tốn tiền nên không tranh với việc khác.
    const talents = allocateTalents(data, run.state, teamIds)
    run.state = talents.state
    run.counter.talentUpgrades += talents.upgrades
    // Thợ rèn sau hồn tinh (forge.ts): cường hóa đồ đang lắp bằng đá đã có.
    const forged = enhanceTeamGear(data, run.state, teamIds)
    run.state = forged.state
    run.counter.enhances += forged.enhances
    // Phụ linh đồ đang lắp trước (rẻ), rồi đúc bằng yêu đan còn lại.
    const imbued = imbueTeamGear(data, run.state, teamIds)
    run.state = imbued.state
    run.counter.imbues += imbued.imbues
    const cast = castWithCores(data, run.state, teamIds)
    run.state = cast.state
    run.counter.casts += cast.casts
    // Ngự thú sư NPC: mỗi ngày game tối đa một lần (giải đấu, đấu trường, đạo quán; trainers.ts).
    if (dayOf(run.state.time) > run.trainerDay) {
      run.trainerDay = dayOf(run.state.time)
      const trained = runTrainerChallenges(data, run.state, { maxTurns: trainerMaxTurns })
      run.state = trained.state
      run.counter.trainerBattles += trained.battles
      run.counter.trainerWins += trained.wins
      run.counter.badges += trained.badges
      run.counter.tournamentsWon += trained.tournamentsWon
      // Bí cảnh (khi có lệnh) và tháp thí luyện cùng nhịp mỗi ngày (trials.ts).
      const trialRun = runTrials(data, run.state, {
        limits: { maxTurns: trainerMaxTurns, maxTurnsBoss: bossMaxTurns },
        towerAttempts: TOWER_ATTEMPTS_PER_DAY
      })
      run.state = trialRun.state
      run.counter.trialsEntered += trialRun.entered
      run.counter.trialsCompleted += trialRun.completed
      run.counter.trialBattles += trialRun.realmBattles
      run.counter.towerWins += trialRun.towerWins
    }
    // Mua sách hữu ích trên kệ sau đột phá (đột phá ưu tiên tiền); dạy ở lần sau trận kế tiếp.
    const shopped = buySkillBooks(data, run.state, teamIds)
    run.state = shopped.state
    run.counter.booksBought += shopped.bought
    run.state = holdCritItems(data, run.state, teamIds, run.economy)
    // NPC tinh thể trait sau mọi việc khác (traitCrystals.ts): giá nhỏ so với fuse / đột phá.
    const tuned = tuneTeamTraits(data, run.state, teamIds)
    run.state = tuned.state
    run.economy.traitsExtracted += tuned.count.extracted
    run.economy.traitsInjected += tuned.count.injected
    run.economy.crystalsBought += tuned.count.bought
    // Phòng Thí Nghiệm sau tinh thể trait (implant.ts): không liều mạng, giá theo tầng.
    const implanted = implantTeam(data, run.state, teamIds)
    run.state = implanted.state
    run.economy.implants += implanted.count.succeeded
    run.economy.implantFails += implanted.count.failed
    run.economy.implantEffects += implanted.count.effectSerums
    run.economy.implantSharePercent = implantSharePercent(data, run.state, teamIds)
    // Miếu thần linh sau cùng (deities.ts): dâng hương cho thần của tầng cao nhất, đổi tín vật.
    run.state = runDeities(data, run.state, run.economy)
  }
  return rng
}

/**
 * Skill chờ học: thay skill có power thấp nhất nếu skill mới có power cao hơn, không thì bỏ qua
 * (chủ project chốt). Power so theo một đòn.
 */
function handlePendingSkills(data: GameData, state: GameState, monsterId: string): GameState {
  const find = (s: GameState): Monster | undefined => s.party.find((m) => m.id === monsterId)
  for (const skillId of find(state)?.pendingSkillIds ?? []) {
    const monster = find(state)
    if (!monster) break
    const weakest = monster.skillIds.reduce((low, id) =>
      data.skills[id].power < data.skills[low].power ? id : low
    )
    state =
      data.skills[skillId].power > data.skills[weakest].power
        ? act(data, state, {
            type: 'learnPendingSkill',
            monsterId,
            skillId,
            forgetSkillId: weakest
          })
        : act(data, state, { type: 'skipPendingSkill', monsterId, skillId })
  }
  return state
}

/** Quái không thuộc đội mẫu (trứng nở vào đội) chuyển vào kho. */
function keepSampleTeam(data: GameData, state: GameState, teamIds: ReadonlySet<string>): GameState {
  for (const monster of state.party) {
    if (!teamIds.has(monster.id)) {
      state = act(data, state, { type: 'moveToStorage', monsterId: monster.id })
    }
  }
  return state
}

/**
 * Ở thị trấn (growth.ts): mua bóng, dùng mồi dụ, fuse quái đội mẫu với nguyên liệu trong kho, hiến tế
 * nguyên liệu hết dùng (sacrifice.ts), breeding, đưa con mạnh hơn vào đội mẫu, học / chọn trận pháp.
 */
function runGrowth(data: GameData, run: Run, teamIds: Set<string>): void {
  let state = buyBalls(data, run.state)
  const baited = applyBaitWhenNeeded(data, state, teamIds)
  state = baited.state
  run.growth.baitsUsed += baited.used
  state = fuseWhenPossible(data, state, teamIds, run.growth)
  // Quái bắt về dư: hiến tế vào quái đội mẫu nhận được, hết dùng còn lại thả (sacrifice.ts).
  const offered = sacrificeSpareFodder(data, state, teamIds)
  state = offered.state
  run.economy.sacrifices += offered.sacrificed
  state = releaseStaleFodder(data, state, teamIds)
  const bred = breedWhenPossible(data, state, { lastBreedDay: run.lastBreedDay, count: run.growth })
  state = bred.state
  if (bred.bred) run.lastBreedDay = dayOf(state.time)
  state = promoteChildren(data, state, teamIds, run.growth)
  run.state = applyFormations(data, state)
}
