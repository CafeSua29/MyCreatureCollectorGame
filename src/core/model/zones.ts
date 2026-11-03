// Hiểm địa (docs/rules/zones.md): khu đặc biệt có điều kiện vào, map riêng (quái hiếm, đồ rơi theo
// chủ đề), khám phá từng bước (trận, quái tinh anh, rương, linh tuyền), boss canh giữ ở bước cuối.
// Dữ liệu src/data/zones.json (tên ở i18n `zones`), số ở balance.json khóa `zones`.

import type { Biome, GameData } from './content'
import type { ItemReward } from './trainers'
import type { ChestItemEntry } from './trials'

/**
 * Điều kiện vào hiểm địa (kiểm tra lúc vào; mọi điều kiện phải đạt): tầng cao nhất đã mở, số quái
 * còn đánh được trong đội mang hệ / race / nhóm race / loài / dòng tiến hóa, có vật phẩm (`consume` = mất khi vào).
 */
export type ZoneRequirement =
  | { type: 'minFloor'; floor: number }
  | { type: 'partyElement'; elementId: string; count: number }
  | { type: 'partyRace'; raceId: string; count: number }
  | { type: 'partyRaceGroup'; raceGroupId: string; count: number }
  | { type: 'partySpecies'; speciesId: string }
  /** Quái cùng dòng tiến hóa với loài (chính loài đó, dạng trước hoặc dạng sau của nó). */
  | { type: 'partySpeciesLine'; speciesId: string; count: number }
  | { type: 'item'; itemId: string; count: number; consume: boolean }

export type ZoneRequirementType = ZoneRequirement['type']

export const ZONE_REQUIREMENT_TYPES = [
  'minFloor',
  'partyElement',
  'partyRace',
  'partyRaceGroup',
  'partySpecies',
  'partySpeciesLine',
  'item'
] as const satisfies readonly ZoneRequirementType[]

/**
 * Loại bước khám phá (registry ZONE_STEPS ở battle/zones.ts): trận quái hoang của map, quái tinh anh
 * (boss ngẫu nhiên của map), rương thường, rương hiếm, linh tuyền (hồi máu). Bước cuối luôn là boss
 * canh giữ (không tung).
 */
export const ZONE_STEP_KINDS = ['battle', 'elite', 'treasure', 'rareTreasure', 'spring'] as const

export type ZoneStepKind = (typeof ZONE_STEP_KINDS)[number]

/** Bảng rương: số lượt tung, mỗi lượt một món theo trọng số. */
export interface ZoneLootTable {
  rolls: number
  items: ChestItemEntry[]
}

/** Hiểm địa trong zones.json (map chưa có id: id của map = id hiểm địa). */
export interface RawZoneDef {
  id: string
  map: Omit<Biome, 'id'>
  requirements: ZoneRequirement[]
  /** Rương thường (bước `treasure`): đồ của hiểm địa. */
  treasure: ZoneLootTable
  /** Rương hiếm (bước `rareTreasure`, thưởng hạ boss canh giữ). */
  rareTreasure: ZoneLootTable
}

/** Hiểm địa đã nạp: map đủ trường như biome (sinh quái, đồ rơi, môi trường dùng chung với tầng). */
export interface ZoneDef extends Omit<RawZoneDef, 'map'> {
  map: Biome
}

/** Mọi map: biome của tầng rồi map của hiểm địa (kiểm tra dữ liệu dùng chung luật biome). */
export const allMaps = (data: Pick<GameData, 'biomes' | 'zones'>): Biome[] => [
  ...Object.values(data.biomes),
  ...Object.values(data.zones).map((zone) => zone.map)
]

/** Kết quả một bước khám phá (log ngoài trận `zoneStep`); trận thì xem log của trận. */
export type ZoneStepResult =
  | { kind: 'battle' | 'elite' | 'guardian' }
  | { kind: 'treasure' | 'rareTreasure'; items: ItemReward[] }
  | { kind: 'spring'; healPercent: number }

/** Lượt vào hiểm địa đang diễn ra (GameState.zones.visit). */
export interface ZoneVisit {
  zoneId: string
  /** Tầng sức mạnh của quái (level, gen, bậc trang bị): tầng cao nhất lúc vào + floorOffset (≥ 1). */
  floor: number
  /** Tổng số bước; bước thứ `steps` là boss canh giữ. */
  steps: number
  /** Số bước đã đi (không tính boss canh giữ: thắng boss là xong lượt). */
  stepsTaken: number
}

export interface ZoneState {
  visit: ZoneVisit | null
  /**
   * Ngày mở lại của từng hiểm địa sau một lượt vào (id → ngày; không có = vào được). Lượt vào kết
   * thúc (xong, thua, rời) thì khóa cooldownDays ngày.
   */
  reopenDay: Record<string, number>
}

export interface ZoneConfig {
  /** Tầng sức mạnh = tầng cao nhất + floorOffset, tối thiểu 1. */
  floorOffset: number
  /** Số bước mỗi lượt vào (đều trong khoảng, gồm bước boss canh giữ). */
  steps: { min: number; max: number }
  /** Trọng số loại bước (trừ bước cuối); 0 = không có. */
  stepWeights: Record<ZoneStepKind, number>
  /** % max HP linh tuyền hồi cho mọi quái trong đội (kể cả quái đã gục). */
  springHealPercent: number
  /** Hạ / bắt boss canh giữ: số lần tung rương hiếm. */
  guardianRareRolls: number
  /** Số ngày hiểm địa khóa sau một lượt vào (tính từ ngày lượt vào kết thúc). */
  cooldownDays: number
}
