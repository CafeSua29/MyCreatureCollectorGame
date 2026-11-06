// Phòng ấp theo môi trường (docs/rules/hatchery.md, theo Hatching room của Portals of Phereon): trứng
// đặt trong phòng có môi trường; loại trứng (theo hệ của quái trong trứng) hợp môi trường thì lớn
// nhanh hơn / ổn định hơn, trứng cạnh nhau ảnh hưởng nhau. Số ở balance.json khóa `hatchery`.

/** Phòng ấp: môi trường đang dựng, nâng cấp đã mua, người ấp (quái trong kho). */
export interface HatcheryRoom {
  /** Id trong config.hatchery.habitats. */
  habitatId: string
  /** Id trong config.hatchery.upgrades, không lặp, tối đa upgradeCap. */
  upgrades: string[]
  /** Quái đang ấp (assignment kind `hatchery`); null = không có. */
  hatcherId: string | null
}

/**
 * Hiệu ứng nâng cấp phòng (Advancement của gốc; union theo `kind`, thêm loại = thêm một mục ở đây và
 * `HATCHERY_UPGRADE_FIELDS` của gameData/validateHatchery.ts):
 * - `bonus`: + sức lớn / độ ổn định; `growthPercent`: nhân sức lớn gốc (Delayed).
 * - `sameSpecies`: + sức lớn mỗi trứng khác cùng loài (Symbiotic).
 * - `readyEggs`: + độ ổn định lúc nở mỗi trứng khác sắp nở (Supporting).
 * - `hatchTrait`: quái nở nhận trait (Embiggening); `randomTrait`: nhận một trait ngẫu nhiên (Mutating).
 * - `hatchGenes`: + % mọi gen lúc nở (Potential). `hatchLevels`: + level lúc nở (Delayed).
 * - `hatchCare`: quái nở đầy no / tinh thần (Energizing).
 * - `boostOthers`: nở xong trứng khác cùng phòng tiến bước (Boosting).
 * - `onFail`: nở hỏng thì trứng lùi về `battlesLeft` thay vì mất (Continuous), trứng khác cùng phòng tiến
 *   `spreadSteps` (Consuming), nhận `soulPoints` điểm hồn tinh (SoulCollector).
 * - `excessGenes`: phần ổn định dư chỉ cộng vào gen cao nhất / thấp nhất, × `multiplier` (Focusing, Equalizing).
 * - `hatchItem`: nở thành công trứng loại `eggTypes` được vật phẩm (ObsidianFarm).
 * - `dailyItem`: mỗi ngày mỗi trứng loại `eggTypes` cho vật phẩm (Fruiting).
 */
export type HatcheryUpgradeEffect =
  | { kind: 'bonus'; growth?: number; stability?: number; growthPercent?: number }
  | { kind: 'sameSpecies'; growth: number }
  | { kind: 'readyEggs'; stability: number }
  | { kind: 'hatchTrait'; traitId: string }
  | { kind: 'randomTrait' }
  | { kind: 'hatchGenes'; percent: number }
  | { kind: 'hatchLevels'; levels: number }
  | { kind: 'hatchCare' }
  | { kind: 'boostOthers'; steps: number }
  | { kind: 'onFail'; battlesLeft?: number; spreadSteps?: number; soulPoints?: number }
  | { kind: 'excessGenes'; target: 'highest' | 'lowest'; multiplier: number }
  | { kind: 'hatchItem'; eggTypes: string[]; itemId: string; count: number }
  | { kind: 'dailyItem'; eggTypes: string[]; itemId: string; count: number }

export interface HatcheryUpgrade {
  id: string
  price: number
  /** Chỉ mua / có tác dụng khi phòng là một trong các môi trường này; đổi môi trường thì mất. */
  habitatIds?: string[]
  effects: HatcheryUpgradeEffect[]
}

export interface HatcheryState {
  rooms: HatcheryRoom[]
}

/** Một môi trường dựng được. */
export interface HatcheryHabitat {
  id: string
  /** Tiền dựng lại phòng thành môi trường này. */
  buildCost: number
  /** Trait quái nở ở môi trường này nhận (gốc: Lava → LavaImmune, Water → WaterBreathing...). */
  hatchTraitId?: string
}

/**
 * Luật cộng sức lớn (growth, % mỗi bước) / độ ổn định (stability, điểm %) theo loại trứng và môi
 * trường. Trường bỏ trống = mọi giá trị. `notHabitatIds`: áp khi phòng KHÔNG là các môi trường đó.
 */
export interface HatcheryRule {
  eggTypes?: string[]
  /** Áp khi trứng KHÔNG thuộc các loại này. */
  notEggTypes?: string[]
  habitatIds?: string[]
  notHabitatIds?: string[]
  growth?: number
  stability?: number
}

/**
 * Luật theo trứng khác cùng phòng: mỗi trứng khác thuộc `neighborEggTypes` (bỏ trống = mọi loại;
 * `notNeighborEggTypes`: trừ các loại này) cộng growth / stability cho trứng thuộc `eggTypes`
 * (bỏ trống = mọi loại; `notEggTypes`: trừ các loại này).
 */
export interface HatcheryNeighborRule {
  eggTypes?: string[]
  notEggTypes?: string[]
  neighborEggTypes?: string[]
  notNeighborEggTypes?: string[]
  growth?: number
  stability?: number
}

export interface HatcherConfig {
  /** Sức ấp theo công đặc biệt gốc của loài: mỗi `statPerPoint` chỉ số = 1 điểm. */
  statPerPoint: number
  /** Mỗi `diminishEvery` điểm thì các điểm sau nhân thêm `diminishFactor` (gốc: 10 điểm, × 0,75). */
  diminishEvery: number
  diminishFactor: number
  /** + sức lớn khi người ấp cùng loại trứng với trứng. */
  sameEggTypeGrowth: number
  /** + sức lớn khi loại trứng của người ấp hợp môi trường phòng: môi trường → loại trứng. */
  habitatEggTypes: Record<string, string>
  habitatGrowth: number
}

export interface HatcheryConfig {
  /** Số phòng; phòng mới dựng là môi trường `defaultHabitatId`. */
  roomCount: number
  eggsPerRoom: number
  defaultHabitatId: string
  habitats: HatcheryHabitat[]
  /** Mọi loại trứng (luật, bảng theo hệ, `eggType` của loài chỉ dùng loại trong danh sách này). */
  eggTypes: string[]
  /** Loại trứng theo hệ của quái (hệ đầu tiên có trong bảng); không có thì `defaultEggType`. */
  eggTypeByElement: Record<string, string>
  defaultEggType: string
  /** Độ ổn định gốc của trứng trong phòng (điểm %). */
  baseStability: number
  rules: HatcheryRule[]
  neighborRules: HatcheryNeighborRule[]
  /** Nở: độ ổn định thấp hơn mức này thì kẹp (luôn có cơ hội nở). */
  minHatchChance: number
  /** Mỗi điểm ổn định trên 100: mọi gen + % này. */
  genePercentPerExcessStability: number
  /** Mỗi ngày trứng trong phòng tiến bước như một trận thắng (dừng ở 1, nở sau trận thắng). */
  dailySteps: number
  hatcher: HatcherConfig
  /** Số nâng cấp tối đa mỗi phòng (gốc: 3). */
  upgradeCap: number
  upgrades: HatcheryUpgrade[]
}
