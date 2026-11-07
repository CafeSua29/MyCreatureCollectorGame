// Kiểu dùng chung của registry hiệu ứng skill (skillEffects.ts, fieldSkillEffects.ts): thời
// điểm chạy, ngữ cảnh, kết quả (mô tả thay đổi để trận đấu áp vào), ngữ cảnh chấm điểm AI.

import type { Decimal, RngState } from '../shared'
import type {
  BattleField,
  BattleSide,
  BattleStages,
  FieldPlacement,
  GameData,
  GlobalFieldLayer,
  Monster,
  RoomPlacement,
  SideFieldPlacement,
  SideFieldTarget,
  SkillTarget,
  VolatileState,
  StageStat
} from '../model'

/**
 * perHit: chạy sau mỗi đòn (damageDealt = sát thương đòn đó); afterHits: một lần sau đòn cuối
 * lên mỗi mục tiêu; perSkill: một lần cho cả chiêu sau mọi mục tiêu, nếu trúng ít nhất một mục
 * tiêu (target = mục tiêu trúng đầu tiên, damageDealt = tổng sát thương lên mọi mục tiêu).
 */
export type SkillEffectTiming = 'perHit' | 'afterHits' | 'perSkill'

export interface SkillEffectContext {
  data: GameData
  user: Monster
  target: Monster
  /**
   * Sát thương thực đã gây cho target (0 với skill status): của đòn vừa đánh với hiệu ứng
   * perHit, tổng mọi đòn với hiệu ứng afterHits.
   */
  damageDealt: Decimal
  rng: RngState
  /** Môi trường hiện tại của trận. */
  field: BattleField
  /** Quái còn sống trên sân của cả hai phe (hiệu ứng toàn sân kiểu Haze, Flower Shield). */
  onField: readonly Monster[]
  /** Mọi quái còn sống của phe user, kể cả dự bị (hiệu ứng cả đội kiểu Heal Bell). */
  team: readonly Monster[]
  /**
   * Hệ số nhân tỉ lệ hiệu ứng phụ (trait kiểu Serene Grace của quái dùng skill); bỏ trống = 1
   * (vật phẩm ném).
   */
  chanceMultiplier?: number
}

/** Phần trạng thái tạm được truyền khi rút về: mọi thứ (kiểu Baton Pass) hoặc chỉ thế thân. */
export type PassOn = 'all' | 'substitute'

/**
 * Yêu cầu rút về: `passOn` truyền trạng thái tạm (Baton Pass), `onlyIfResisted` chỉ rút khi đòn bị
 * kháng (Ricochet của WILDERLOCKE), `incomingEffects` chạy lên quái vào thay (Diversion, Magnet Swap).
 */
export interface SwitchOutRequest {
  passOn?: PassOn
  onlyIfResisted?: true
  incomingEffects?: unknown[]
  /**
   * Quái vào thay nhận lớp phủ hệ của quái rút về trong ngần ấy lượt (Crossfade: đổi dạng mà giữ hệ).
   * Skill do trait / chiêu khác gọi thì không có tác dụng, như gốc.
   */
  coatIncomingTurns?: number
}

/** Dọn hiệu ứng theo phe: phe tính từ quái dùng skill; hazardsOnly: chỉ bẫy (hook vào sân). */
export interface SideFieldClear {
  side: SideFieldTarget
  hazardsOnly: boolean
}

export interface SkillEffectResult {
  rng: RngState
  stageChanges: { monsterId: string; stat: StageStat; delta: number }[]
  /** `drainedFrom`: máu hút từ quái này (Liquid Ooze của nó đổi thành mất máu). */
  heals: { monsterId: string; amount: Decimal; drainedFrom?: string }[]
  /** Trạng thái gây lên quái (đã trúng chance); miễn nhiễm và thời hạn do trận đấu xử lý. */
  statusChanges: { monsterId: string; statusId: string; turns?: number }[]
  /** Môi trường đặt bởi quái dùng skill (thay / làm mới do trận đấu xử lý). */
  fieldChanges: FieldPlacement[]
  /** Hiệu ứng theo phe đặt bởi quái dùng skill (cộng tầng / làm mới do trận đấu xử lý). */
  sideFieldChanges: SideFieldPlacement[]
  /** Room đặt / tắt bởi quái dùng skill (trận đấu xử lý: chưa có thì đặt, đang có thì tắt). */
  roomChanges: RoomPlacement[]
  /** Quái được chữa mọi trạng thái bất thường. */
  statusCures: string[]
  /** Quái mất mọi bậc trận (kiểu Haze). */
  stageResets: string[]
  /** Lớp toàn sân bị dọn về môi trường mặc định (kiểu Defog với địa hình). */
  fieldClears: GlobalFieldLayer[]
  /** Hiệu ứng theo phe bị dọn (kiểu Defog, Rapid Spin). */
  sideFieldClears: SideFieldClear[]
  /** Đổi hiệu ứng theo phe của hai phe (kiểu Court Change). */
  swapSideFields: boolean
  /** Quái bắt đầu đếm ngược Perish Song; quái đang đếm và boss hoang do trận đấu bỏ qua. */
  perishStarts: { monsterId: string; turns: number }[]
  /** Quái dùng skill tạo thế thân bằng `hpCostPercent`% max HP của mình (kiểu Substitute). */
  substitute: { hpCostPercent: number } | null
  /** Quái dùng skill rút về sau chiêu (quái thay do trận đấu chọn); null = không rút về. */
  switchOut: SwitchOutRequest | null
  /** Quái ăn ngay đồ cầm có nhãn `tags` (bỏ trống = mọi đồ cầm) đang lắp (kiểu Teatime). */
  heldItemEats: { monsterId: string; tags?: string[] }[]
  /**
   * Quái dùng skill được bảo vệ khỏi mọi skill nhắm vào nó tới hết lượt (kiểu Max Guard); tỉ lệ
   * thành công ÷ consecutiveChanceDivisor mỗi lần dùng liên tiếp (trận đấu tung). null = không.
   */
  protect: { consecutiveChanceDivisor: number } | null
  /** Quái được giảm lượt chờ của mọi skill đang chờ (hold, kiểu Tĩnh Tâm Chú). */
  holdReductions: { monsterId: string; turns: number }[]
  /** Quái bị ép rời sân, quái dự bị ngẫu nhiên vào thay (Roar, Dragon Tail). */
  forceSwitches: string[]
  /** Quái đổi hệ tạm tới khi rời sân / hết trận (biến hệ của phản ứng hệ). */
  elementChanges: { monsterId: string; elementIds: string[]; turns?: number }[]
  /** Tường dựng lên quái (`hpCostPercent`: quái dùng mất % max HP; Glass / Plastic Wall, Air Wall). */
  walls: { monsterId: string; statusId: string; turns?: number; hpCostPercent?: number }[]
  /** Tường của `fromId` chuyển sang `toId` (Revolving Door). */
  wallSteals: { fromId: string; toId: string }[]
  /** Quái phá tường của mình, hồi thể lực = lượt còn lại × `staminaPerTurn` (Recycle). */
  wallRecycles: { monsterId: string; staminaPerTurn: number }[]
  /** Skill vừa dùng gần nhất của quái bị thay bằng Booby Trap (Sticker Trick). */
  boobyTraps: { monsterId: string; turns: number; power: number }[]
  /** Lớp phủ hệ của `fromId` chuyển sang `toId`, còn nguyên lượt (Paint Swipe). */
  coatingTransfers: { fromId: string; toId: string }[]
  /** Phá mọi tường trên sân, quái có tường mất máu theo `power` × lượt còn lại (Crumble). */
  wallCrumbles: { power: number; elementId: string }[]
  /** Quái cộng một lần cộng hưởng, đủ `threshold` lần thì gục (Resonance của phản ứng hệ). */
  resonances: { monsterId: string; threshold: number }[]
}

/** Kết quả không đổi gì (chỉ chuyển RNG). */
export const noChanges = (rng: RngState): SkillEffectResult => ({
  rng,
  stageChanges: [],
  heals: [],
  statusChanges: [],
  fieldChanges: [],
  sideFieldChanges: [],
  roomChanges: [],
  statusCures: [],
  stageResets: [],
  fieldClears: [],
  sideFieldClears: [],
  swapSideFields: false,
  perishStarts: [],
  substitute: null,
  switchOut: null,
  heldItemEats: [],
  protect: null,
  holdReductions: [],
  forceSwitches: [],
  elementChanges: [],
  walls: [],
  wallSteals: [],
  wallRecycles: [],
  boobyTraps: [],
  wallCrumbles: [],
  coatingTransfers: [],
  resonances: []
})

/** Thông tin AI trận đấu đưa cho handler để chấm giá trị hiệu ứng lên một mục tiêu. */
export interface SkillEffectAiContext {
  data: GameData
  user: Monster
  target: Monster
  /** target cùng phe với user (skill self / ally / allAllies). */
  targetIsAlly: boolean
  /** Bậc trận hiện tại theo id quái (thiếu = chưa đổi bậc). */
  stages: Readonly<Record<string, BattleStages>>
  /** Sát thương dự kiến lên target, đã giới hạn bởi HP còn lại (0 với skill status). */
  expectedDamage: Decimal
  /** Môi trường hiện tại của trận. */
  field: BattleField
  /** Phe của user. */
  side: BattleSide
  /** Quái còn sống trên sân phe user (kể cả user) và phe địch. */
  allies: readonly Monster[]
  foes: readonly Monster[]
  /** Quái dự bị còn sống của phe user và phe địch (sẽ gặp bẫy khi vào sân). */
  allyReserves: readonly Monster[]
  foeReserves: readonly Monster[]
  /** Trạng thái tạm theo id quái đang trên sân (bỏ trống / thiếu = không có gì). */
  volatiles?: Readonly<Record<string, VolatileState>>
  /** Trận boss: boss hoang không chịu một số hiệu ứng (Perish Song); bỏ trống = không. */
  isBoss?: boolean
  /** Hệ số nhân tỉ lệ hiệu ứng phụ, như SkillEffectContext; bỏ trống = 1. */
  chanceMultiplier?: number
  /** Lượt hiện tại của trận (lượt chờ của hold); bỏ trống = ngoài trận. */
  battleTurn?: number
}

/**
 * Tỉ lệ % thực của hiệu ứng có `chance` (bỏ trống = 100): hiệu ứng phụ (chance < 100) nhân hệ số
 * của trait kiểu Serene Grace, kẹp 100; hiệu ứng chắc chắn giữ 100.
 */
export function effectChance(chance: number | undefined, multiplier = 1): number {
  if (chance === undefined || chance >= 100) return 100
  return Math.min(100, chance * multiplier)
}

/** Đổi số của hiệu ứng theo thế mạnh / thế nhanh (docs/rules/move-styles.md). */
export interface EffectStyleMod {
  /** Điểm % cộng vào tỉ lệ hiệu ứng phụ (chance < 100), kẹp 0–100. */
  chanceShift: number
  /** Số bậc cộng thêm cho hiệu ứng đổi bậc có lợi cho phe quái dùng. */
  stageBonus: number
  /** Skill nhắm phe mình (self / ally / allAllies): `target` của hiệu ứng là quái ta. */
  targetsAlly: boolean
}

/** Tỉ lệ hiệu ứng phụ sau khi cộng điểm % của thế; hiệu ứng chắc chắn (bỏ trống / ≥ 100) giữ nguyên. */
export function shiftedChance(chance: number | undefined, shift: number): number | undefined {
  if (chance === undefined || chance >= 100) return chance
  return Math.min(100, Math.max(0, chance + shift))
}

/**
 * Số bậc sau khi cộng thêm của thế mạnh: chỉ thay đổi có lợi cho phe quái dùng (tăng bậc phe mình,
 * hạ bậc phe địch) được thêm bậc theo chiều của nó; mặt xấu (kiểu Close Combat tự hạ thủ) giữ nguyên
 * như Legends: Arceus. `affectsAlly`: quái bị đổi bậc thuộc phe quái dùng.
 */
export function boostedDelta(delta: number, bonus: number, affectsAlly: boolean): number {
  const beneficial = affectsAlly ? delta > 0 : delta < 0
  return beneficial ? delta + Math.sign(delta) * bonus : delta
}

/** Phe đối diện. */
export const otherSide = (side: BattleSide): BattleSide => (side === 'player' ? 'enemy' : 'player')

export interface SkillEffectHandler {
  timing: SkillEffectTiming
  /**
   * Hiệu ứng làm quái dùng skill rút về: lệnh skill được kèm quái vào thay (`switchTo`). Chỉ dùng
   * trên skill (cần ô sân của quái dùng); vật phẩm ném có hiệu ứng này thì kiểm tra dữ liệu báo lỗi.
   */
  switchesUserOut?: true
  /** Hiệu ứng gây trạng thái (thuộc tính sticker cần skill gây trạng thái, skill-stickers.md). */
  inflictsStatus?: true
  /**
   * Hiệu ứng `afterHits` chỉ lên quái dùng skill (tự đổi bậc, tự hồi máu): chạy một lần cho cả chiêu,
   * ở mục tiêu trúng đầu tiên, kể cả skill đánh mọi địch (như Pokémon: Clanging Scales −1 thủ một lần).
   */
  userOnly?(params: unknown): boolean
  validateParams(params: unknown, data: GameData): string[]
  /**
   * Luật riêng theo mục tiêu của skill (vật phẩm ném tính như skill nhắm `enemy`); trả về danh
   * sách lỗi. Gọi khi kiểm tra dữ liệu, sau validateParams.
   */
  checkTarget?(params: unknown, target: SkillTarget): string[]
  apply(params: unknown, ctx: SkillEffectContext): SkillEffectResult
  /**
   * Tham số của hiệu ứng khi skill dùng thế (docs/rules/move-styles.md): đổi tỉ lệ hiệu ứng phụ /
   * số bậc. Bỏ trống = thế không đổi hiệu ứng này.
   */
  styled?(params: unknown, mod: EffectStyleMod): unknown
  /**
   * Điểm AI của hiệu ứng khi trúng (mục "AI trận đấu"), cùng thang với điểm sát thương (1 = lấy
   * hết máu còn lại của địch). Âm = có hại cho phe user.
   */
  aiValue(params: unknown, ctx: SkillEffectAiContext): number
}
