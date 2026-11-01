// Linh điền (docs/rules/alchemy.md mục "Linh điền"): công trình của động phủ (docs/rules/dwelling.md).
// Trồng hạt giống vào ô trống, mỗi ngày ô lớn 1 ngày (+ % của Linh tuyền), đủ ngày thì thu hoạch.

import { addItems, removeItems } from '../inventory'
import { ActionError, malformedAction, nextInt } from '../shared'
import type { DayEvent, GameData, GameState, SeedItem } from '../model'
import { requireTown } from './town'

/** Làm tròn số ngày đã lớn để cộng dồn số lẻ không lệch (2,9999999 thành 3). */
const GROWTH_PRECISION = 1e6

function requirePlot(state: GameState, plotIndex: number): void {
  const count = state.dwelling.plots.length
  if (!Number.isSafeInteger(plotIndex) || plotIndex < 0 || plotIndex >= count) {
    throw malformedAction(`ô linh điền không hợp lệ: ${String(plotIndex)}`)
  }
}

// Ép kiểu: kiểm tra save / plantSeed đảm bảo ô chỉ trồng hạt giống.
const seedOf = (data: GameData, seedItemId: string): SeedItem => data.items[seedItemId] as SeedItem

const withPlots = (state: GameState, plots: GameState['dwelling']['plots']): GameState => ({
  ...state,
  dwelling: { ...state.dwelling, plots }
})

/** Trồng hạt giống vào ô trống (ở thị trấn). */
export function plantSeed(
  data: GameData,
  state: GameState,
  { plotIndex, itemId }: { plotIndex: number; itemId: string }
): GameState {
  requireTown(state)
  requirePlot(state, plotIndex)
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  if (item.category !== 'seed') throw new ActionError('notSeed', { itemId })
  if (state.dwelling.plots[plotIndex] !== null) throw new ActionError('plotOccupied', { plotIndex })
  const plots = [...state.dwelling.plots]
  plots[plotIndex] = { seedItemId: itemId, growth: 0 }
  return { ...withPlots(state, plots), inventory: removeItems(state.inventory, itemId, 1) }
}

/** Số ngày lớn còn thiếu tới khi ô chín (0 = chín hoặc ô trống). */
export function cropDaysLeft(data: GameData, state: GameState, plotIndex: number): number {
  const plot = state.dwelling.plots[plotIndex]
  if (!plot) return 0
  return Math.max(0, Math.ceil(seedOf(data, plot.seedItemId).growDays - plot.growth))
}

/** Thu hoạch ô đã chín (ở thị trấn): mỗi món số lượng random đều trong [min, max]. */
export function harvest(data: GameData, state: GameState, plotIndex: number): GameState {
  requireTown(state)
  requirePlot(state, plotIndex)
  const plot = state.dwelling.plots[plotIndex]
  if (!plot) throw new ActionError('plotEmpty', { plotIndex })
  const daysLeft = cropDaysLeft(data, state, plotIndex)
  if (daysLeft > 0) throw new ActionError('cropNotReady', { plotIndex, daysLeft })
  let { rng, inventory } = state
  for (const entry of seedOf(data, plot.seedItemId).harvest) {
    let count: number
    ;[count, rng] = nextInt(rng, entry.min, entry.max)
    if (count > 0) inventory = addItems(inventory, entry.itemId, count)
  }
  const plots = [...state.dwelling.plots]
  plots[plotIndex] = null
  return { ...withPlots(state, plots), rng, inventory }
}

/**
 * Một ngày trôi (việc theo ngày của động phủ): mọi ô đang trồng lớn 1 × (1 + growthPercent / 100)
 * ngày; ô vừa đủ ngày ghi `cropRipe`.
 */
export function growCrops(
  data: GameData,
  state: GameState,
  { events, growthPercent }: { events: DayEvent[]; growthPercent: number }
): GameState {
  if (state.dwelling.plots.every((plot) => plot === null)) return state
  const step = 1 + Math.max(0, growthPercent) / 100
  const plots = state.dwelling.plots.map((plot, plotIndex) => {
    if (!plot) return plot
    const { growDays } = seedOf(data, plot.seedItemId)
    const growth = Math.round((plot.growth + step) * GROWTH_PRECISION) / GROWTH_PRECISION
    if (plot.growth < growDays && growth >= growDays) {
      events.push({ type: 'cropRipe', plotIndex, seedItemId: plot.seedItemId })
    }
    // Chín rồi thì dừng ở growDays (chờ thu hoạch).
    return { ...plot, growth: Math.min(growth, growDays) }
  })
  return withPlots(state, plots)
}
