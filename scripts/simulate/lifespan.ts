// Thọ nguyên trong chơi liên tục (mục "Thọ nguyên" ở simulation.md): ghi quái tọa hóa / cảnh báo từ
// dayEvents, "người chơi" dùng Thọ Nguyên Đan cho quái đội mẫu sắp thọ tận (tùy chế độ), xử lý hồn
// phách ở thị trấn (luyện hồn khí / ấp trứng, soul-relics.md), bảng lifespan.csv.

import {
  aptitudeFloor,
  createSoul,
  dayOf,
  lifePercent,
  soulRelicCost,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import type { Table } from './report'
import { simAct } from './events'

/** Một quái tọa hóa trong lần chơi. */
export interface LifespanDeath {
  monsterId: string
  speciesId: string
  /** Số trận đã đánh lúc tọa hóa. */
  battle: number
  /** Tầng cao nhất đã mở lúc đó. */
  highestFloor: number
  /** Quái thuộc đội mẫu (không phải quái trong kho). */
  inTeam: boolean
}

export interface LifespanTracker {
  deaths: LifespanDeath[]
  warnings: number
  pillsUsed: number
  /** Hồn phách đã luyện thành hồn khí, kèm bậc của từng món. */
  relicRarities: string[]
  /** Hồn phách đã ấp thành trứng truyền thừa (không đủ tiền luyện). */
  soulEggs: number
  /**
   * Xem trước lúc kết thúc (quái hiếm khi chết trong số trận mô phỏng): bậc hồn khí nếu từng quái
   * đội mẫu chết lúc đó, và giá luyện đắt nhất theo % tiền đang có.
   */
  previewRarities: string[]
  previewCostPercent: number | null
  /** Quái ta gục lúc trận kết thúc: số quái sẽ chết hẳn nếu bật chết thật (options.md). */
  battleFallen: number
}

export const newLifespanTracker = (): LifespanTracker => ({
  deaths: [],
  warnings: 0,
  pillsUsed: 0,
  relicRarities: [],
  soulEggs: 0,
  previewRarities: [],
  previewCostPercent: null,
  battleFallen: 0
})

/** Ghi bậc hồn khí và giá luyện (% tiền đang có) nếu mọi quái đội mẫu chết lúc kết thúc lần chơi. */
export function previewRelics(
  data: GameData,
  state: GameState,
  { teamIds, tracker }: { teamIds: ReadonlySet<string>; tracker: LifespanTracker }
): void {
  const death = {
    aptitudeFloor: aptitudeFloor(state),
    day: dayOf(state.time),
    cause: 'oldAge' as const
  }
  let maxCost = 0
  for (const monster of state.party.filter((m) => teamIds.has(m.id))) {
    const soul = createSoul(data, monster, death)
    tracker.previewRarities.push(data.config.soulRelic.rarityByAptitude[soul.aptitudeTierId] ?? '')
    maxCost = Math.max(maxCost, soulRelicCost(data, soul).toNumber())
  }
  const money = state.money.toNumber()
  tracker.previewCostPercent = money > 0 ? Math.round((maxCost / money) * 100) : null
}

/**
 * "Người chơi" ở thị trấn xử lý mọi hồn phách: đủ tiền thì luyện hồn khí (autoEquip lắp nếu tốt hơn
 * đồ đang có), không đủ thì ấp thành trứng truyền thừa.
 */
export function handleSouls(data: GameData, state: GameState, tracker: LifespanTracker): GameState {
  for (const soul of state.inventory.souls) {
    if (state.money.gte(soulRelicCost(data, soul))) {
      state = simAct(data, state, { type: 'forgeSoulRelic', soulId: soul.id })
      tracker.relicRarities.push(state.inventory.equipment.at(-1)?.rarity ?? '')
    } else {
      state = simAct(data, state, { type: 'incubateSoul', soulId: soul.id })
      tracker.soulEggs++
    }
  }
  return state
}

/**
 * Ghi sự kiện của lần trôi thời gian vừa xong (gọi ngay sau mỗi action tốn giờ, vì log ngoài trận bị
 * xóa ở action sau).
 */
export function recordDayEvents(
  tracker: LifespanTracker,
  state: GameState,
  { battle, teamIds }: { battle: number; teamIds: ReadonlySet<string> }
): void {
  for (const event of state.log) {
    if (event.type === 'nearingLifespanEnd') tracker.warnings++
    if (event.type !== 'diedOfOldAge') continue
    tracker.deaths.push({
      monsterId: event.monsterId,
      speciesId: event.speciesId,
      battle,
      highestFloor: state.highestFloor,
      inTeam: teamIds.has(event.monsterId)
    })
  }
}

/** Năm thọ nguyên của một vật phẩm là đan (hiệu ứng addLifespan); 0 = không phải đan. */
function pillYears(data: GameData, itemId: string): number {
  const item = data.items[itemId]
  if (item?.category !== 'consumable') return 0
  return item.effects.reduce((sum, effect) => {
    if (effect.type !== 'addLifespan') return sum
    return sum + (effect.params as { years: number }).years
  }, 0)
}

/**
 * "Người chơi" dùng đan (đan nhiều năm trước) cho quái đội mẫu đã vượt mốc cảnh báo, tới khi về dưới
 * mốc hoặc hết đan.
 */
export function feedPillsWhenOld(
  data: GameData,
  state: GameState,
  { teamIds, tracker }: { teamIds: ReadonlySet<string>; tracker: LifespanTracker }
): GameState {
  const { warnPercent } = data.config.lifespan
  const isOld = (monster: Monster | undefined): boolean =>
    monster !== undefined && monster.aging && lifePercent(data, monster) >= warnPercent
  for (const { id } of state.party.filter((m) => teamIds.has(m.id))) {
    while (isOld(state.party.find((m) => m.id === id))) {
      const pills = Object.keys(state.inventory.stacks)
        .filter((itemId) => pillYears(data, itemId) > 0)
        .sort((a, b) => pillYears(data, b) - pillYears(data, a))
      if (pills.length === 0) return state
      state = simAct(data, state, { type: 'useItem', itemId: pills[0], monsterId: id })
      tracker.pillsUsed++
    }
  }
  return state
}

/** Một dòng lifespan.csv của một lần chơi liên tục. */
export interface LifespanRow {
  teamId: string
  usePills: boolean
  totalBattles: number
  tracker: LifespanTracker
}

/**
 * Mỗi lần chơi: số quái đội mẫu / quái trong kho tọa hóa, trận và tầng của lần tọa hóa đầu tiên trong
 * đội mẫu, số lần cảnh báo, số đan đã dùng, số quái sẽ chết thật nếu bật (battleFallen).
 */
export function lifespanTable(rows: readonly LifespanRow[]): Table {
  return {
    headers: [
      'team',
      'pills',
      'battles',
      'teamDeaths',
      'firstTeamDeathBattle',
      'firstTeamDeathFloor',
      'storageDeaths',
      'warnings',
      'pillsUsed',
      'relicsForged',
      'relicRarities',
      'soulEggs',
      'previewRarities',
      'previewCostPercent',
      'battleFallen'
    ],
    rows: rows.map(({ teamId, usePills, totalBattles, tracker }) => {
      const team = tracker.deaths.filter((death) => death.inTeam)
      return [
        teamId,
        usePills ? 'yes' : 'no',
        String(totalBattles),
        String(team.length),
        team.length > 0 ? String(team[0].battle) : '',
        team.length > 0 ? String(team[0].highestFloor) : '',
        String(tracker.deaths.length - team.length),
        String(tracker.warnings),
        String(tracker.pillsUsed),
        String(tracker.relicRarities.length),
        tracker.relicRarities.join(' '),
        String(tracker.soulEggs),
        tracker.previewRarities.join(' '),
        tracker.previewCostPercent === null ? '' : String(tracker.previewCostPercent),
        String(tracker.battleFallen)
      ]
    })
  }
}
