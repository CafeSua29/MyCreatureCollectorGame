// Động phủ (docs/rules/dwelling.md): công trình (src/data/buildings.json), loại việc, thiên phú làm
// việc, phần động phủ trong state, config.

import type { CraftStation } from './alchemy'
import type { BookStack } from './state'
import type { PartialStats } from './stats'

/** Loại việc của quái ở động phủ (thiên phú làm việc theo hệ / race / loài). */
export const WORK_TYPES = [
  'mining',
  'farming',
  'watering',
  'kindling',
  'generating',
  'transporting',
  'caring',
  'research'
] as const

export type WorkType = (typeof WORK_TYPES)[number]

/**
 * Chỉ số làm việc theo loại việc (số như công / thủ, 100 ≈ một bậc Work Suitability của Palworld);
 * thiếu hoặc 0 = không có thiên phú loại đó.
 */
export type WorkStats = Partial<Record<WorkType, number>>

/** Một món công trình sản xuất mỗi ngày: kỳ vọng `perDay` × sức làm việc (phần lẻ tung RNG). */
export interface BuildingDrop {
  itemId: string
  perDay: number
}

/** Loại hiệu ứng của công trình. Thêm loại = thêm vào đây + một mục BUILDING_EFFECT_RULES. */
export const BUILDING_EFFECT_TYPES = [
  'produce',
  'garden',
  'cropGrowth',
  'outputBoost',
  'nurture',
  'craftBonus',
  'research',
  'rest'
] as const

export type BuildingEffectType = (typeof BUILDING_EFFECT_TYPES)[number]

/** Hiệu ứng của công trình theo `type` (các số "PerPower" nhân với sức làm việc của công trình). */
export type BuildingEffect =
  /** Sản xuất vật phẩm vào kho động phủ mỗi ngày. */
  | { type: 'produce'; drops: BuildingDrop[] }
  /** Linh điền: số ô = cấp × plotsPerLevel (docs/rules/alchemy.md mục "Linh điền"). */
  | { type: 'garden'; plotsPerLevel: number }
  /** Ô linh điền lớn thêm percentPerPower % mỗi ngày mỗi điểm sức làm việc. */
  | { type: 'cropGrowth'; percentPerPower: number }
  /** Công trình khác + percentPerPower % sức làm việc mỗi điểm sức làm việc. */
  | { type: 'outputBoost'; percentPerPower: number }
  /** Mỗi ngày: quái trong kho + thân mật, trứng bớt số trận còn lại (phần lẻ tung RNG). */
  | { type: 'nurture'; affinityPerPower: number; eggStepsPerPower: number }
  /** + điểm % thành công ở các nơi luyện `stations` (docs/rules/alchemy.md). */
  | { type: 'craftBonus'; percentPerPower: number; stations: CraftStation[] }
  /**
   * Sách kỹ năng vào kho động phủ mỗi ngày: kỳ vọng booksPerPower × sức, skill trong learnset loài
   * của map tầng cao nhất, reusableChance % là Chân kinh (docs/rules/skill-books.md).
   */
  | { type: 'research'; booksPerPower: number; reusableChance: number }
  /** Nghỉ ngơi (như Hot Spring của Palworld): mỗi ngày quái làm việc + cấp × sanityPerLevel tinh thần. */
  | { type: 'rest'; sanityPerLevel: number }

/**
 * Giá nâng lên cấp L (n = L − startLevel): tiền `money × moneyGrowth ^ (n − 1)`, mỗi món
 * `count × (n − 1)` (bậc đầu chỉ tốn tiền).
 */
export interface BuildingCost {
  money: number
  moneyGrowth: number
  items: { itemId: string; count: number }[]
}

/** Công trình (buildings.json; tên ở i18n). */
export interface BuildingDef {
  id: string
  workType: WorkType
  /** Cấp lúc tạo game (0 = chưa xây). */
  startLevel: number
  /** Cấp tối đa; không ghi = không trần. */
  maxLevel?: number
  /** Số ô quái làm việc mỗi cấp (0 = công trình không cần quái). */
  slotsPerLevel: number
  cost: BuildingCost
  effect: BuildingEffect
}

/** Một công trình đã xây. */
export interface BuildingState {
  level: number
  /** Quái trong kho đang làm việc ở đây (assignment `{ kind: 'dwelling', id: <id công trình> }`). */
  workers: string[]
}

/** Một ô linh điền đang trồng: `growth` = số ngày đã lớn (Linh tuyền làm lớn nhanh hơn 1 / ngày). */
export interface GardenPlot {
  seedItemId: string
  growth: number
}

/** Kho động phủ: chồng vật phẩm theo id và sách kỹ năng, chờ lấy về túi. */
export interface DwellingStorage {
  stacks: Record<string, number>
  books: BookStack[]
}

export interface DwellingState {
  /** Công trình đã xây theo id (chưa xây thì không có). */
  buildings: Record<string, BuildingState>
  /** Ô linh điền; số ô = Σ cấp × plotsPerLevel của công trình `garden`. */
  plots: (GardenPlot | null)[]
  storage: DwellingStorage
  /** Hộp thức ăn (như Feed Box của Palworld): quái làm việc tự ăn khi đói, chồng theo id. */
  feedBox: Record<string, number>
}

/**
 * Chỉ số làm việc gốc theo hệ / race (hoặc nhóm race), tính bằng % chỉ số gốc trung bình của loài;
 * loài ghi đè bằng `workStats` (số tuyệt đối) ở species.json.
 */
export interface WorkStatTable {
  elements: Record<string, WorkStats>
  races: Record<string, WorkStats>
}

/** Loại hiệu ứng của trait làm việc. Thêm loại = thêm vào đây + một mục WORK_TRAIT_EFFECT_RULES. */
export const WORK_TRAIT_EFFECT_TYPES = [
  'workSpeed',
  'workTypeSpeed',
  'statPercent',
  'hungerRate',
  'sanityRate',
  'nocturnal'
] as const

export type WorkTraitEffectType = (typeof WORK_TRAIT_EFFECT_TYPES)[number]

/** Hiệu ứng của trait làm việc (như passive skill của Palworld). */
export type WorkTraitEffect =
  /** + % tốc độ làm việc mọi loại việc (Artisan, Serious, Slacker...). */
  | { type: 'workSpeed'; percent: number }
  /** + % tốc độ làm việc của một loại việc (Mine Foreman, Logging Foreman...). */
  | { type: 'workTypeSpeed'; workType: WorkType; percent: number }
  /** + % chỉ số (Work Slave: công −30%...), nguồn % `workTraits` (docs/rules/stats-traits.md). */
  | { type: 'statPercent'; stats: PartialStats }
  /** + % tốc độ đói khi làm việc (Glutton +, Diet Lover −). */
  | { type: 'hungerRate'; percent: number }
  /** + % tốc độ giảm tinh thần khi làm việc (Unstable +, Workaholic / Positive Thinker −). */
  | { type: 'sanityRate'; percent: number }
  /** Làm cả đêm (Nocturnal): sức + nocturnalWorkPercent %, đói / mệt + nocturnalDrainPercent %. */
  | { type: 'nocturnal' }

/** Trait làm việc (workTraits.json; tên ở i18n): quái mang tối đa (số mục countWeights − 1) trait. */
export interface WorkTraitDef {
  id: string
  /** Trọng số khi tung cho quái mới / đột biến khi breeding. */
  weight: number
  /** Cùng nhóm thì loại trừ nhau (quái mang tối đa một trait mỗi nhóm). */
  group?: string
  effects: WorkTraitEffect[]
}

export interface WorkTraitConfig {
  /** Trọng số số trait của quái mới: phần tử i = trọng số có i trait. */
  countWeights: number[]
  /** % con breeding nhận từng trait của bố / mẹ. */
  inheritChance: number
  /** % con breeding có thêm một trait ngẫu nhiên (còn chỗ). */
  mutationChance: number
  /** Quái shiny luôn có trait này (Lucky của Lucky Pal); null = không. */
  shinyTraitId: string | null
}

/** Một món ăn trong hộp thức ăn: no thêm, tinh thần thêm (có thể 0). */
export interface FoodValue {
  fullness: number
  sanity: number
}

/** Nguồn mắc bệnh: làm việc quá sức (tinh thần thấp / đói lả) hoặc bị hạ gục trong trận. */
export const AILMENT_CAUSES = ['work', 'battle'] as const

export type AilmentCause = (typeof AILMENT_CAUSES)[number]

/**
 * Bệnh / chấn thương (ailments.json; tên ở i18n; như Sprain / Fracture / Weakened / Ulcer / Depression
 * của Palworld): mắc khi làm việc quá sức hoặc bị hạ gục trong trận, giảm sức làm việc và chỉ số
 * trong trận, chữa bằng thuốc bậc ≥ cureTier hoặc nghỉ đủ ngày.
 */
export interface AilmentDef {
  id: string
  /** Trọng số khi mắc bệnh (chọn trong các bệnh có nguồn đó). */
  weight: number
  causes: AilmentCause[]
  /** Sức làm việc còn bao nhiêu % khi mắc (0 = không làm được). */
  workPercent: number
  /** % chỉ số khi mắc (âm = giảm), nguồn % `ailment` (docs/rules/stats-traits.md); bỏ trống = không. */
  statPercents?: PartialStats
  /**
   * Chấn thương trận gắn với bộ phận (bodyParts.json, docs/rules/hit-locations.md): chỉ mắc khi bộ
   * phận bị đòn hạ gục / bị phá nằm trong danh sách; bỏ trống = chấn thương chung (không rõ chỗ).
   */
  bodyParts?: string[]
  /** Bậc thuốc tối thiểu chữa được. */
  cureTier: number
}

/** Bệnh đang mắc: id bệnh, số ngày đã nghỉ (không làm ở động phủ) kể từ khi mắc. */
export interface MonsterAilment {
  id: string
  restDays: number
}

/** Đói / tinh thần của quái làm việc (như Hunger / SAN của Palworld), tính theo ngày. */
export interface NeedsConfig {
  /** No và tinh thần tối đa (quái mới đầy). */
  max: number
  /** Mỗi ngày làm việc: − no, − tinh thần (trước hệ số trait / cú đêm). */
  hungerPerDay: number
  sanityPerDay: number
  /** Còn dưới eatBelow no thì ăn từ hộp thức ăn tới khi ≥ eatBelow hoặc hết món. */
  eatBelow: number
  /** Đói lả (no 0 sau khi ăn): − thêm tinh thần mỗi ngày, sức × starvingWorkPercent %. */
  starvingSanityPerDay: number
  starvingWorkPercent: number
  /** Tinh thần dưới lowSanity: sức × lowSanityWorkPercent %; tinh thần 0: bỏ việc (sức 0). */
  lowSanity: number
  lowSanityWorkPercent: number
  /** Quái không làm ở động phủ hồi idleRecoveryPerDay no và tinh thần mỗi ngày. */
  idleRecoveryPerDay: number
  /** Trait cú đêm: + % sức, + % đói / mệt. */
  nocturnalWorkPercent: number
  nocturnalDrainPercent: number
  /**
   * Mắc bệnh: tinh thần dưới sickSanity thì mỗi ngày làm việc tung sickChanceMax × (sickSanity −
   * tinh thần) / sickSanity %, đói lả thêm starvingSickChance %.
   */
  sickSanity: number
  sickChanceMax: number
  starvingSickChance: number
  /** Nghỉ (không làm ở động phủ) đủ idleCureDays ngày thì tự khỏi. */
  idleCureDays: number
  /**
   * Chấn thương trận khi trận kết thúc: quái của người chơi còn gục faintAilmentChance %, + mỗi bộ
   * phận bị phá brokenPartAilmentChance % (bị phá bộ phận thì không gục cũng có thể chấn thương).
   */
  faintAilmentChance: number
  brokenPartAilmentChance: number
}

export interface DwellingConfig {
  /**
   * Chỉ số làm việc = % trong bảng × chỉ số gốc trung bình của loài (tổng chỉ số gốc / 6), làm tròn:
   * loài có công / thủ hàng chục thì chỉ số làm việc hàng chục, hàng trăm thì hàng trăm.
   */
  workStatPercents: WorkStatTable
  /** Quái làm sai loại việc (không có chỉ số loại đó) tính như wrongWorkPercent % chỉ số gốc TB. */
  wrongWorkPercent: number
  /** Sức làm việc = chỉ số / powerStatUnit × level ^ levelExponent × tốc độ / 100. */
  powerStatUnit: number
  /** Chỉ số vận chuyển dùng được ở mọi công trình, × transportRatio. */
  transportRatio: number
  /** Hệ số theo level quái = level ^ levelExponent. */
  levelExponent: number
  /** Tốc độ làm việc gốc (%) của loài không ghi `workSpeed`; tốc độ thấp nhất sau trait. */
  baseWorkSpeed: number
  minWorkSpeed: number
  /**
   * Hiến tế đủ condenseStacks stack: mọi chỉ số làm việc đang có + condensePercent % chỉ số gốc TB
   * (như cô đặc Palworld).
   */
  condenseStacks: number
  condensePercent: number
  /** Mỗi cấp hồn tinh tốc độ làm việc (Tượng Lực) + % tốc độ. */
  soulWorkSpeedPercentPerLevel: number
  workTraits: WorkTraitConfig
  needs: NeedsConfig
  /** Món ăn được trong hộp thức ăn theo id vật phẩm (gộp chồng). */
  foods: Record<string, FoodValue>
  /** Quái làm việc + workerAffinity thân mật mỗi workerAffinityDays ngày. */
  workerAffinity: number
  workerAffinityDays: number
}
