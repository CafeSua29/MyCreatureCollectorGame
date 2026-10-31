// Tầng và biome (docs/rules/world-items.md): map (biome) của tầng, level theo tầng. Hệ số gen theo
// tầng (floorGeneMultiplier) ở registries/aptitude.ts, dùng chung với tư chất.

import { pick, type RngState } from '../shared'
import type { Biome, BiomeBoss, GameData, GameState } from '../model'

// Xuất lại cho bên ngoài core (sinh quái theo tầng ở script mô phỏng).
export { floorGeneMultiplier } from '../registries'

/** Một tầng đã mở kèm map của nó: đủ để sinh quái, tung môi trường, tung đồ rơi. */
export interface FloorSite {
  floor: number
  biome: Biome
  /** Quái sinh ra có già đi không (= options.lifespanEnabled của game; mục "Tuổi và thọ nguyên"). */
  aging: boolean
  /**
   * Giờ game lúc sinh quái / tung event (GameState.time): thời khắc, mùa (docs/rules/calendar.md).
   * null = ngoài lịch (tháp thí luyện: cùng tầng tháp luôn cùng đội), không nhân hệ số thời khắc.
   */
  time: number | null
  /** Hệ số tỉ lệ gặp từ phía người chơi (kỹ năng đồng hành); bỏ trống = 1. Chỉ trận ở tầng. */
  odds?: EncounterOdds
}

export interface EncounterOdds {
  /** Nhân tỉ lệ shiny của quái sinh ra (quái thường, boss). */
  shinyMultiplier: number
  /** Nhân tỉ lệ gặp boss ngẫu nhiên. */
  bossChanceMultiplier: number
}

/** Tầng hợp lệ: số nguyên an toàn ≥ 1. */
export const isValidFloor = (floor: unknown): floor is number =>
  Number.isSafeInteger(floor) && (floor as number) >= 1

/** Biome theo id; undefined nếu không có (save cũ / dữ liệu đã đổi). */
export function findBiome(data: GameData, biomeId: string): Biome | undefined {
  return Object.hasOwn(data.biomes, biomeId) ? data.biomes[biomeId] : undefined
}

/**
 * Biome của một tầng đã mở (đọc floorBiomeIds). State đã qua validateGameState nên luôn có;
 * thiếu là lỗi lập trình.
 */
export function biomeOfFloor(
  data: GameData,
  state: Pick<GameState, 'floorBiomeIds'>,
  floor: number
): Biome {
  const biomeId = state.floorBiomeIds[floor - 1]
  const biome = biomeId === undefined ? undefined : findBiome(data, biomeId)
  if (!biome) throw new Error(`Tầng ${floor} chưa có map hợp lệ ("${String(biomeId)}")`)
  return biome
}

/**
 * Map của trận đang đánh: trận bí cảnh / tháp thí luyện lấy map chủ đề của trận (docs/rules/trials.md),
 * trận hiểm địa lấy map của hiểm địa (docs/rules/zones.md), trận khác lấy map của tầng trận. Mọi chỗ
 * tra map của trận (đồ rơi, boss tầng, tiến hóa) dùng hàm này.
 */
export function battleBiome(
  data: GameData,
  state: Pick<GameState, 'floorBiomeIds'>,
  battle: Pick<NonNullable<GameState['battle']>, 'floor' | 'trial' | 'special'>
): Biome {
  if (battle.special?.kind === 'zone') {
    const zone = data.zones[battle.special.zoneId]
    if (!zone) throw new Error(`Trận hiểm địa không hợp lệ "${battle.special.zoneId}"`)
    return zone.map
  }
  if (!battle.trial) return biomeOfFloor(data, state, battle.floor)
  const biome = findBiome(data, battle.trial.biomeId)
  if (!biome) throw new Error(`Trận bí cảnh có map không hợp lệ "${battle.trial.biomeId}"`)
  return biome
}

/** Tầng đã mở kèm map của nó. */
export function floorSite(
  data: GameData,
  state: Pick<GameState, 'floorBiomeIds' | 'options' | 'time'>,
  floor: number
): FloorSite {
  return {
    floor,
    biome: biomeOfFloor(data, state, floor),
    aging: state.options.lifespanEnabled,
    time: state.time
  }
}

/**
 * Tung map cho một tầng mới mở: đều trên **mọi** biome (tầng nào cũng ra được mọi map, được
 * trùng kể cả hai tầng liền nhau; chủ project chốt).
 */
export function rollFloorBiome(data: GameData, rng: RngState): [string, RngState] {
  // Chỉ biome của tầng: map của hiểm địa nằm riêng ở data.zones (docs/rules/zones.md).
  return pick(rng, Object.keys(data.biomes))
}

/** Khoảng level quái thường (kể cả boss ngẫu nhiên) của tầng. */
export function floorLevelRange(data: GameData, floor: number): { min: number; max: number } {
  const { levelPerFloor } = data.config.floors
  return { min: levelPerFloor * (floor - 1) + 1, max: levelPerFloor * floor - 1 }
}

/** Level cố định của boss tầng. */
export function floorBossLevel(data: GameData, floor: number): number {
  return data.config.floors.levelPerFloor * floor
}

/** Boss của biome theo loài (đồ rơi riêng); undefined nếu loài không phải boss của biome. */
export function findBiomeBoss(biome: Biome, speciesId: string): BiomeBoss | undefined {
  return biome.bosses.find((boss) => boss.speciesId === speciesId)
}
