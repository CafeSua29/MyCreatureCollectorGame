// State game (được lưu vào save): vị trí, đội, kho, trứng, trận đấu, sự kiện trận.

import type { EventState, SpecialBattle } from './events'
import type { ExpeditionState } from './expeditions'
import type { BattleTrainer, TrainerMode, TrainerState } from './trainers'
import type {
  BattleInstability,
  BattleTrial,
  InstabilityState,
  TowerState,
  TrialRun
} from './trials'
import type { ArtifactSpirit, SpiritPool } from './artifactSpirits'
import type { QuestState } from './quests'
import type { AlchemyState, CookingState, GardenState, SmithingState } from './alchemy'
import type { Decimal } from '../shared'
import type {
  EquipmentRarity,
  GlobalFieldLayer,
  InvulnerableKind,
  LockInKind,
  SkillCategory,
  TraitInstance
} from './content'
import type { Monster } from './monster'
import type { MoveStyle } from './moveStyles'
import type { BattleStages, PartialStats, StageStat, StatName } from './stats'
import type { PlannedTransform, TransformKind } from './transform'
import type { BattleTamer, TamerState } from './tamer'
import type { DayEvent, GameOptions, PartyRefillEvent } from './time'
import type { SoulImprint, SoulRemnant } from './soul'
import type { RecruitMethod, RecruitState } from './recruit'
import type { SafariState } from './safari'
import type { LabState } from './implant'
import type { CapacityState } from './capacity'
import type { ZoneState } from './zones'
import type { GatheringState } from './gathering'
import type { WorldBossState } from './worldBoss'
import type { DexState } from './dex'

// ---------- State game (được lưu vào save) ----------

/** Vị trí người chơi: thị trấn hoặc một tầng (tầng 1 trở lên, không quá highestFloor). */
export type Location = { type: 'town' } | { type: 'floor'; floor: number }

export interface GameState {
  /** Phiên bản cấu trúc save; đổi cấu trúc thì tăng và viết migrate. */
  version: number
  location: Location
  /** Tầng cao nhất đã mở (mục "Tầng và biome"); tầng 1 mở từ đầu. */
  highestFloor: number
  /**
   * Map của từng tầng đã mở: phần tử thứ N − 1 là id biome của tầng N, độ dài = highestFloor.
   * Tung khi mở tầng rồi cố định mãi.
   */
  floorBiomeIds: string[]
  /** State của RNG có seed. */
  rng: number
  money: Decimal
  party: Monster[]
  /** Kho quái (không giới hạn); quái bắt được khi đội đầy sẽ vào đây. */
  storage: Monster[]
  inventory: Inventory
  /** Cửa hàng ở thị trấn (mục "Cửa hàng và vứt vật phẩm"). */
  shop: ShopState
  /** Giá thị trường động: độ bão hòa theo món đã bán (mục "Giá thị trường động" ở world-items.md). */
  market: MarketState
  /** Trứng đang ấp (không nằm trong đội, không giới hạn số lượng). */
  eggs: Egg[]
  /** Bộ đếm sinh id quái. */
  nextMonsterId: number
  /** Bộ đếm sinh id món trang bị ("e<số>"). */
  nextItemId: number
  /**
   * Tera Orb đang sạc (mục "Tera" ở transformation.md): dùng Tera trong trận thì hết sạc, sạc lại
   * khi dùng NPC hồi máu ở thị trấn.
   */
  teraOrbCharged: boolean
  /**
   * Đồng hồ game tính bằng giờ (số nguyên ≥ 0; ngày = ⌊time / 24⌋). Chỉ trôi qua advanceTime khi
   * làm việc tốn giờ (đánh trận, đi lại, hồi máu, nghỉ); mục "Đồng hồ game" ở lifespan.md.
   */
  time: number
  /** Tùy chọn luật chơi của game này (bật / tắt thọ nguyên...). */
  options: GameOptions
  /** Sự kiện của lần trôi thời gian gần nhất (tọa hóa, trứng truyền thừa...); UI báo người chơi. */
  dayEvents: DayEvent[]
  /** Ngự thú sư của người chơi: cảnh giới, EXP (docs/rules/tamer.md). */
  tamer: TamerState
  /** Trận pháp đã học và đang dùng (docs/rules/team.md). */
  formations: FormationState
  /** Cấp luyện đan, công thức đã học; linh điền (docs/rules/alchemy.md). */
  alchemy: AlchemyState
  /** Cấp luyện khí ở Thợ rèn (docs/rules/alchemy.md, equipment-forge.md). */
  smithing: SmithingState
  /** Cấp nấu ăn ở Đầu bếp, món ăn đang có tác dụng cho cả đội (docs/rules/cooking.md). */
  cooking: CookingState
  garden: GardenState
  /** Bảng nhiệm vụ và nhiệm vụ đang nhận (docs/rules/quests.md). */
  quests: QuestState
  /** Bảng thám hiểm và đội đang đi (docs/rules/expeditions.md). */
  expeditions: ExpeditionState
  /** Đạo quán, đấu trường xếp hạng, giải đấu (docs/rules/trainers.md). */
  trainers: TrainerState
  /**
   * Phó bản chuỗi trận đang đi: bí cảnh (docs/rules/trials.md) hoặc Khí giới bí cảnh
   * (docs/rules/artifact-spirits.md); null = không đi phó bản nào.
   */
  trial: TrialRun | null
  /** Cặp khí linh đang phối ở Linh trì (docs/rules/artifact-spirits.md). */
  spiritPools: SpiritPool[]
  /** Tháp thí luyện (docs/rules/trials.md). */
  tower: TowerState
  /** Độ bất ổn tầng (docs/rules/instability.md). */
  instability: InstabilityState
  /** Ân sủng theo id thần (docs/rules/deities.md); thần chưa có ân sủng thì không có mục. */
  favor: Record<string, Decimal>
  /**
   * Event đang chờ, hiệu ứng toàn cục, chuỗi event, cửa hàng tạm, thú triều (docs/rules/events.md).
   */
  events: EventState
  /** Thu phục: mồi dụ đang dùng (docs/rules/recruit.md). */
  recruit: RecruitState
  /** Khu bảo tồn: danh sách loài theo đợt, lượt vào khu đang diễn ra (docs/rules/safari-zone.md). */
  safari: SafariState
  /** Phòng Thí Nghiệm: huyết thanh đang bán, ngày đổi hàng (docs/rules/implant.md). */
  lab: LabState
  /** Số lần đã mở rộng kho quái / túi trang bị (docs/rules/capacity.md). */
  capacity: CapacityState
  /** Hiểm địa: lượt vào đang diễn ra, ngày mở lại của từng hiểm địa (docs/rules/zones.md). */
  zones: ZoneState
  /** Kết quả câu cá / khai thác gần nhất (docs/rules/gathering.md). */
  gathering: GatheringState
  /** Boss thế giới: lần xuất hiện đang diễn ra, thưởng chờ nhận (docs/rules/world-boss.md). */
  worldBoss: WorldBossState
  /** Bộ sưu tập: loài đã gặp / đã sở hữu, mốc thưởng đã nhận (docs/rules/dex.md). */
  dex: DexState
  battle: BattleState | null
}

export interface FormationState {
  /** Id trận pháp đã học, theo thứ tự học, không trùng. */
  known: string[]
  /** Trận pháp đang dùng (phải nằm trong known); null = không dùng. */
  active: string | null
}

/** Chồng tinh thể trait: gộp theo traitId + level. */
export interface CrystalStack {
  traitId: string
  level: number
  count: number
}

/**
 * Chồng sách kỹ năng (docs/rules/skill-books.md): gộp theo skillId + reusable (false = Bí kíp dùng
 * một lần, true = Chân kinh dùng mãi).
 */
export interface BookStack {
  skillId: string
  reusable: boolean
  count: number
}

/**
 * Một món trang bị (mục "Trang bị và đồ cầm"): bản riêng, không gộp chồng. `rolls` là các dòng đã
 * random lúc món được tạo (dòng chính "main", dòng unique, dòng phụ), giá trị ghi vào hook của dòng.
 */
export interface EquipmentInstance {
  /** Dạng "e<số>" từ GameState.nextItemId, duy nhất trong save. */
  id: string
  baseItemId: string
  rarity: EquipmentRarity
  /** Cấp ≥ 1 (món mới luôn cấp 1); hiệu ứng × levelEffectScale như trait. */
  level: number
  rolls: EquipmentRoll[]
  /**
   * Chỉ có ở hồn khí (docs/rules/soul-relics.md): quái đã luyện thành món, trait của dòng `soul`.
   * Món gốc là món gốc hồn khí (`soulRelicStat`) khi và chỉ khi có trường này.
   */
  soul?: SoulImprint
  /** Khí linh trên món (docs/rules/artifact-spirits.md); bỏ trống = không có. */
  spirits?: ArtifactSpirit[]
  /** Số tầng Khí giới bí cảnh đã qua; bỏ trống = 0. */
  depth?: number
}

export interface EquipmentRoll {
  lineId: string
  value: number
}

/**
 * Món đang lắp trong một ô của quái: item gộp chồng theo id (đồ cầm tiêu hao) hoặc món riêng
 * (trang bị). Theo phần túi chứa nó (`ItemStorage`).
 */
export type EquippedItem =
  { storage: 'stack'; itemId: string } | { storage: 'instance'; instance: EquipmentInstance }

/**
 * Túi đồ (mục "Thị trấn, di chuyển, vùng, vật phẩm"). Item gộp chồng không giới hạn số lượng.
 */
export interface Inventory {
  /** Item gộp chồng theo id (mọi category trừ trang bị và tinh thể): số lượng, luôn ≥ 1. */
  stacks: Record<string, number>
  /** Tinh thể trait, mỗi cặp traitId + level xuất hiện tối đa một lần. */
  crystals: CrystalStack[]
  /** Sách kỹ năng, mỗi cặp skillId + reusable xuất hiện tối đa một lần. */
  books: BookStack[]
  /** Trang bị (món riêng), theo thứ tự nhận. */
  equipment: EquipmentInstance[]
  /** Hồn phách của quái đã chết hẳn (docs/rules/soul-relics.md), cũ trước mới. */
  souls: SoulRemnant[]
  /** Kho khí linh: khí linh đã thu phục chưa gắn vào món (docs/rules/artifact-spirits.md). */
  spirits: ArtifactSpirit[]
}

/** Định danh item gộp được (số lượng): theo id, tinh thể theo trait + cấp, sách theo skill + loại. */
export type StackableItemRef =
  | { storage: 'stack'; itemId: string }
  | { storage: 'crystal'; traitId: string; level: number }
  | { storage: 'book'; skillId: string; reusable: boolean }

/**
 * Định danh một item trong túi, theo phần túi chứa nó (`ItemStorage`): item gộp chồng theo id,
 * tinh thể theo trait + cấp, trang bị theo id món. Dùng chung cho vứt, bán, mua, lắp.
 */
export type ItemRef = StackableItemRef | { storage: 'instance'; instanceId: string }

/**
 * Item kèm nội dung để tính giá: item gộp được theo định danh, hoặc chính món trang bị (giá theo
 * bậc của món).
 */
export type ItemEntry = StackableItemRef | { storage: 'instance'; instance: EquipmentInstance }

/** Một món trong danh sách hàng: item gộp được, hoặc một món trang bị đã random sẵn. */
export type ShopEntry = ItemEntry

export interface ShopState {
  /**
   * Hàng đang bán (không trùng món); item gộp được không giới hạn số lượng, món trang bị mua xong
   * thì mất khỏi danh sách. Random lại khi vào thị trấn.
   */
  stock: ShopEntry[]
}

export interface MarketState {
  /**
   * Độ bão hòa theo key thị trường (`marketKey`: id vật phẩm, `crystal:<traitId>`,
   * `book:<skillId>`): cộng số cái
   * mỗi lần bán, × recoveryPerDay mỗi ngày, dưới removeBelow thì xóa key. Số thực > 0.
   */
  saturation: Record<string, number>
}

/** Trứng: quái bên trong đã random sẵn lúc tạo trứng; nở khi battlesLeft về 0. */
export interface Egg {
  /** Bằng id của quái sẽ nở. */
  id: string
  monster: Monster
  /** Số trận thắng quái hoang còn lại trước khi nở. */
  battlesLeft: number
  /**
   * Hệ của các linh thạch đã đặt vào trứng, theo thứ tự đặt (docs/rules/breeding-eggs.md mục "Ấp
   * trứng có hoàn cảnh"); hiệu ứng đã áp thẳng vào quái bên trong, mảng này để đếm và cho UI.
   */
  infusions: string[]
}

/** Hai phe của trận. */
export const BATTLE_SIDES = ['player', 'enemy'] as const

export type BattleSide = (typeof BATTLE_SIDES)[number]

/** Nguồn hiệu ứng ghi trong log traitTriggered khi không phải trait của quái. */
export type TriggerLogSource =
  | 'status'
  | 'minion'
  | 'equipment'
  | 'held'
  | 'affinity'
  | 'talent'
  | 'synergy'
  | 'formation'
  | 'partner'
  | 'implant'

/**
 * Cộng hưởng / trận pháp đang có tác dụng với một phe trong trận (docs/rules/team.md), tính lúc vào
 * trận từ cả đội: cộng hưởng ghi số quái khớp trong đội (bậc tra lại theo dữ liệu), trận pháp ghi id
 * (đội đã đủ yêu cầu).
 */
export type TeamBonus =
  | { kind: 'synergy'; id: string; count: number }
  | { kind: 'formation'; id: string }
  /**
   * Kỹ năng đồng hành của quái đầu đội `monsterId` (docs/rules/partner-skills.md); `strength` = sức
   * mạnh theo thân mật lúc bật. Quái gục thì gỡ, hồi sinh thì bật lại.
   */
  | { kind: 'partner'; id: string; monsterId: string; strength: number }
  /**
   * Luật sideHooks của bí cảnh / tháp / độ bất ổn (docs/rules/instability.md): hook của luật `id`,
   * `count` = số lần luật có trong trận (hệ số hook).
   */
  | { kind: 'rule'; id: string; count: number }

export type BattlePhase = 'chooseActions' | 'chooseReplacement' | 'ended'

export type BattleOutcome = 'won' | 'lost' | 'fled'

/** Môi trường đang có ở một lớp; turnsLeft null = kéo dài cả trận (môi trường tự nhiên). */
export interface ActiveField {
  id: string
  turnsLeft: number | null
}

/** Hiệu ứng theo phe đang có; turnsLeft null = cả trận (bẫy); layers = số tầng đã đặt (≥ 1). */
export interface ActiveSideField {
  id: string
  turnsLeft: number | null
  layers: number
}

/** Hiệu ứng toàn sân đặc biệt đang có (lớp room, kiểu Trick Room); luôn có thời hạn. */
export interface ActiveRoom {
  id: string
  turnsLeft: number
}

/**
 * Môi trường của trận: mỗi lớp toàn sân đúng một môi trường (mặc định: trời quang, không địa
 * hình); mỗi phe một danh sách hiệu ứng theo phe; danh sách hiệu ứng toàn sân đặc biệt (room).
 * Mỗi danh sách: mỗi id tối đa một lần, theo thứ tự đặt.
 */
export type BattleField = Record<GlobalFieldLayer, ActiveField> & {
  sides: Record<BattleSide, ActiveSideField[]>
  rooms: ActiveRoom[]
}

/**
 * Bối cảnh trận của một quái đang trên sân cho bước trait (trait theo lượt trên sân, theo đồng
 * đội; mục "Trait" ở stats-traits.md).
 */
export interface MonsterBattleContext {
  /** Số lượt đã ở trên sân tính cả lượt hiện tại (lượt được chọn lệnh đầu tiên = 1). */
  turnsOnField: number
  /** Đồng đội còn sống trên sân, không gồm chính nó. */
  allies: readonly Monster[]
  /** Số quái địch đã hạ gục trong lần ra sân này (trait statModifierAfterKnockout). */
  knockouts: number
  /** Trait đã hút skill và đang tăng sát thương (kiểu Flash Fire, VolatileState.absorbBoosts). */
  absorbBoosts: readonly string[]
  /** Phe của quái. */
  side: BattleSide
  /** Lượt hiện tại của trận (BattleState.turn). */
  battleTurn: number
  /** Bậc trận hiện tại của quái. */
  stages: BattleStages
  /** Trận boss (một số trait không tác dụng trong trận boss). */
  isBossBattle: boolean
  /** Địch còn sống trên sân (hào quang lên địch, điều kiện theo địch). */
  foes: readonly Monster[]
  /** Trạng thái tạm của mọi quái trên sân (minion, trait tạm của quái khác cho hào quang). */
  volatiles: Readonly<Record<string, VolatileState>>
  /** Bản ghi trận của quái (số lần đánh, bị trúng...; mục "Ngôn ngữ trait" ở trait-dsl.md). */
  record: BattleRecord
  /** Bản ghi trận của mọi quái (đếm theo phe). */
  records: Readonly<Record<string, BattleRecord>>
  /** Id mọi quái của phe mình (cả dự bị): cộng bản ghi trận theo phe. */
  teamIds: readonly string[]
  /** Bộ đếm chung của trận. */
  counters: BattleCounters
  /** Số quái phe mình / phe địch đã gục (cả đội, kể cả dự bị). */
  faintedAllies: number
  faintedFoes: number
  /** Số quái còn sống của phe mình / phe địch (cả đội, kể cả dự bị). */
  livingAllies: number
  livingFoes: number
  /** Món trong ô của quái không tác dụng (room kiểu Magic Room). */
  itemsDisabled: boolean
  /** Berry (đồ cầm nhãn berry) không tác dụng: địch trên sân có Unnerve / As One. */
  berriesBlocked: boolean
  /** Cộng hưởng / trận pháp của phe mình (BattleState.teamBonuses). */
  teamBonuses: readonly TeamBonus[]
  /** % công / đặc công do cuồng bạo (docs/rules/frenzy.md); 0 = không cuồng bạo. */
  frenzyStatPercent: number
  /** % mọi chỉ số của thưởng sưu tập (phe người chơi; docs/rules/dex.md); 0 = không có. */
  collectionStatPercent: number
  /** % chỉ số của món ăn linh thực đang có tác dụng (phe người chơi; docs/rules/cooking.md). */
  mealStatPercent: PartialStats
  /**
   * % chỉ số của chúc phúc thần cai quản map của trận (phe người chơi, quái có hệ của thần;
   * docs/rules/deities.md); bỏ trống = không có.
   */
  blessingStatPercent?: PartialStats
  /** Môi trường hiện tại của trận (điều kiện theo thời tiết / địa hình). */
  field: BattleField
  /**
   * Ability theo loài của quái không có tác dụng (Gastro Acid, Core Enforcer; skill bỏ qua ability
   * như Moongeist Beam trong một đòn); bỏ trống = có tác dụng.
   */
  abilitySuppressed?: boolean
  /**
   * Skill quái đã chọn mà chưa dùng trong lượt đang xử lý (điều kiện kiểu Sucker Punch, Upper Hand):
   * id skill và priority thật; bỏ trống = không có.
   */
  pendingSkill?: { skillId: string; priority: number }
  /** Skill dùng ngay trước trong lượt đang xử lý và phe của quái dùng (Round, Fusion Flare). */
  previousSkill?: { skillId: string; side: BattleSide }
}

/** Bối cảnh trận của một đòn (công thức sát thương): môi trường, phe hai bên. */
export interface DamageArena {
  field: BattleField
  /**
   * Môi trường cho hệ số sát thương của môi trường (Utility Umbrella của bên nhận che mưa / nắng);
   * bỏ trống = `field`.
   */
  damageField?: BattleField
  attackerSide: BattleSide
  defenderSide: BattleSide
  /** Số quái còn sống trên sân của phe bên nhận (màn chắn: 1 quái × 0,5, 2 quái × 2/3). */
  defenderSideCount: number
  /** Bậc chí mạng thêm của bên đánh từ trạng thái tạm (Focus Energy); bỏ trống = 0. */
  attackerFocusStages?: number
  /** Bối cảnh trận của hai bên (trait theo lượt / đồng đội); bỏ trống = không có. */
  attackerContext?: MonsterBattleContext
  defenderContext?: MonsterBattleContext
  /**
   * Đòn do trait / minion gây ra (phản công, đánh thêm...), không phải hành động trong lượt của
   * quái đánh (Siralim: "khi không phải lượt của nó"); bỏ trống = hành động thường.
   */
  reactive?: boolean
}

/** Một loại minion đang bám vào quái (mục "Minion" ở battle.md). */
export interface MinionInstance {
  minionId: string
  /** 1 đến maxStacks của minion. */
  stacks: number
}

/** Chỉ số khác hp (đổi được trong trận). */
export type NonHpStat = Exclude<StatName, 'hp'>

/**
 * Bản ghi trận của một quái (mục "Ngôn ngữ trait" ở trait-dsl.md): đếm cả trận, giữ khi rời sân, mất
 * khi hết trận. Trait đếm theo bản ghi (Harbinger, Tellur...).
 */
export interface BattleRecord {
  /** Số lượt đã hành động bằng lệnh của nó. */
  turnsTaken: number
  /** Số lần dùng skill physical gây sát thương (Attack của Siralim). */
  attacks: number
  /** Số lần dùng skill special / status (Cast spell của Siralim). */
  casts: number
  /** Số lần bị mất máu vì skill / trait của địch. */
  timesDamaged: number
  defends: number
  provokes: number
  /** Số lần gục / được hồi sinh. */
  deaths: number
  revivals: number
  /** Tổng máu đã mất, đã gây cho địch, đã được hồi trong trận. */
  damageTaken: Decimal
  damageDealt: Decimal
  healingReceived: Decimal
  /** Hành động gần nhất trong lượt của nó; null = chưa hành động. */
  lastAction: 'attack' | 'cast' | null
  /** Số trait tạm đã nhận trong trận. */
  traitsGained: number
  /** Trait kích hoạt "một lần mỗi trận" đã dùng (id trait / trạng thái / minion). */
  usedTriggers: string[]
  /** Số lần quái hoang này thoát khỏi bóng trong trận (mục "Bắt trượt" ở battle.md). */
  catchMisses: number
  /** Số berry đã ăn trong trận (Belch); bỏ trống = 0. */
  berriesEaten?: number
  /** Đồ cầm tiêu hao gần nhất trong trận (Recycle); bỏ trống = chưa có. */
  lastConsumedItemId?: string
  /** Số lần dùng từng skill bằng lệnh của quái trong trận (Last Resort, Trump Card); bỏ trống = 0. */
  skillUses?: Record<string, number>
  /**
   * Vị trí ra đòn (docs/rules/hit-locations.md): sát thương đã dồn vào từng bộ phận, tính bằng % max
   * HP lúc trúng (điểm yếu × weakPointBreakMultiplier); bỏ trống = chưa bị nhắm.
   */
  partDamagePercent?: Record<string, number>
  /** Bộ phận đã bị phá trong trận (đồ rơi tăng); bỏ trống = chưa có. */
  brokenParts?: string[]
  /** Bộ phận trúng đòn skill hạ gục quái gần nhất (yêu đan dễ vỡ khi trúng đầu); bỏ trống = không nhắm. */
  knockoutPart?: string
}

/** Bộ đếm chung của trận (mục "Ngôn ngữ trait" ở trait-dsl.md). */
export interface BattleCounters {
  /** Skill dùng gần nhất trong trận bằng lệnh của quái (Copycat); bỏ trống = chưa có. */
  lastSkillId?: string
  /** Số lần dùng skill special / status của từng phe (Cast spell của Siralim). */
  casts: Record<BattleSide, number>
  /** Skill special / status dùng gần nhất trong trận; null = chưa có. */
  lastCastSkillId: string | null
  /** Tổng số lần quái gục trong trận (cả hai phe). */
  deaths: number
  /** Lượt gần nhất mỗi phe có quái gục (Retaliate); bỏ trống = chưa có. */
  faintTurn?: Partial<Record<BattleSide, number>>
  /**
   * Chuỗi lượt liên tiếp có quái (bất kỳ) dùng từng skill (Echoed Voice): id skill → lượt gần nhất,
   * số lượt liên tiếp; chỉ giữ skill dùng ở lượt này / lượt trước.
   */
  fieldStreaks?: Record<string, { turn: number; count: number }>
}

/**
 * Trạng thái tạm của một quái đang trên sân (mục "Skill" ở battle.md); mất khi rời sân, trừ phần
 * được truyền khi rút về kiểu Baton Pass / Shed Tail.
 */
export interface VolatileState {
  /** Lượt đầu tiên quái được chọn lệnh từ khi vào sân (skill firstTurnOnly). */
  firstTurn: number
  /** Số lượt còn lại trước khi gục (Perish Song); bỏ trống = không đếm. */
  perishTurns?: number
  /** Máu còn lại của thế thân (Substitute); bỏ trống = không có thế thân. */
  substituteHp?: Decimal
  /** Số quái địch đã hạ gục bằng skill trong lần ra sân này; bỏ trống = chưa hạ quái nào. */
  knockouts?: number
  /**
   * Id trait đã hút skill và đang tăng sát thương skill các hệ đó (kiểu Flash Fire, mục "Trait
   * cuối lượt và trạng thái"); bỏ trống = chưa có. Hệ số tính lại từ trait, không lưu.
   */
  absorbBoosts?: string[]
  /** Minion đang bám (mỗi loại tối đa một mục); bỏ trống = không có. */
  minions?: MinionInstance[]
  /** Trait tạm nhận trong trận (mục "Trait Siralim"); mất khi rời sân. */
  gainedTraits?: TraitInstance[]
  /** Skill bị khóa tới hết trận (Seal của Siralim). */
  sealedSkillIds?: string[]
  /** Skill quái đã khóa vào (hook kiểu Choice Band), tới khi rời sân. */
  choiceLockSkillId?: string
  /** Bản sao ô spell có thêm trong trận (Emerald Power), tới khi rời sân. */
  gainedSpellSlots?: { skillId: string; chance: number }[]
  /** Ô spell luôn kích hoạt (Sapphire Power), tới khi rời sân. */
  spellSlotGuaranteed?: true
  /** Skill tạm có trong trận, ngoài giới hạn maxSkills ("nhận spell X khi vào trận"). */
  tempSkillIds?: string[]
  /** Chỉ số cộng / trừ thẳng trong trận (lượng cố định: "nhận chỉ số bằng X% của..."). */
  flatStats?: Partial<Record<NonHpStat, Decimal>>
  /** Lượt (BattleState.turn) quái đang phòng thủ / khiêu khích (lệnh defend / provoke). */
  defending?: number
  provoking?: number
  /** Hệ / race gốc khi bị đổi trong trận; trả lại khi rời sân hoặc hết trận. */
  originalIdentity?: { elementIds: string[]; raceId: string }
  /**
   * Max Guard (hiệu ứng skill protect): lượt đang được bảo vệ và số lần dùng liên tiếp trước đó
   * (tỉ lệ thành công × 1/3 mỗi lần liên tiếp).
   */
  protect?: { turn: number; streak: number; skillId?: string }
  /**
   * Z-Memento / Z-Parting Shot (docs/rules/z-moves.md): quái vào thay ô của quái này được hồi đầy
   * máu (một lần).
   */
  healsReplacement?: true
  /** Bậc chí mạng thêm tới khi rời sân (Focus Energy +2, Dragon Cheer, Z-Power; battle.md "Chí mạng"). */
  focusStages?: number
  /** Lượt sau đi đầu / cuối trong cùng mức priority (Timeline của Siralim). */
  timeline?: 'top' | 'bottom'
  /** Đã mất máu vì skill / trait của địch kể từ cuối lượt trước. */
  damagedSinceTurnEnd?: true
  /**
   * Lượt (BattleState.turn) skill có hold dùng lại được, theo id skill (mục "Hold" ở battle.md);
   * thiếu mục = firstTurn + hold (chưa dùng từ khi vào sân).
   */
  holdReadyTurns?: Record<string, number>
  /**
   * Thế đã dùng ở lượt trước (docs/rules/move-styles.md): ở lượt `turn` tốc độ xếp thứ tự nhân hệ
   * số của thế (theo số của skill đã dùng); mất khi rời sân.
   */
  styleSpeed?: { turn: number; skillId: string; style: MoveStyle }
  /**
   * Việc đã xảy ra với quái trong lượt `turn` (điều kiện chiêu kiểu Payback, Lash Out, Assurance,
   * Avalanche, Counter; docs/rules/battle.md mục "Việc trong lượt"); lượt khác = chưa có gì.
   */
  turnLog?: TurnLog
  /** Lần dùng skill gần nhất bằng lệnh của quái thất bại / trượt hết (Stomping Tantrum, Temper Flare). */
  lastSkillFailed?: true
  /** Ability theo loài bị vô hiệu tới khi rời sân (Gastro Acid, Core Enforcer). */
  abilitySuppressed?: true
  /** Đang nạp chiêu hai lượt: lượt sau tự dùng skill này lên mục tiêu đã chọn; bán vô hình nếu có. */
  charging?: { skillId: string; targetId?: string; invulnerable?: InvulnerableKind }
  /** Lượt (BattleState.turn) quái phải nghỉ sau Hyper Beam. */
  mustRecharge?: number
  /** Đang khóa chiêu nhiều lượt (Outrage, Rollout, Uproar): số lượt còn lại sau lượt này. */
  lockedMove?: { skillId: string; targetId?: string; turnsLeft: number; kind: LockInKind }
  /**
   * Số lần liên tiếp dùng cùng một skill qua các lượt (Fury Cutter, Echoed Voice, Rollout); `turn` =
   * lượt dùng gần nhất.
   */
  skillStreak?: { skillId: string; count: number; turn: number }
  /** Nạp đầu lượt (Beak Blast, Shell Trap): skill và lượt nạp. */
  turnStartCharge?: { skillId: string; turn: number }
  /** Số lần đã tích trữ (Stockpile, tối đa 3). */
  stockpile?: number
  /** Ability (id trait) trong trận thay ability theo loài (Skill Swap, Role Play, Transform). */
  abilityOverride?: string
  /** Skill bị khóa tới hết lượt `untilTurn` (Disable, Spite). */
  disabledSkill?: { skillId: string; untilTurn: number }
  /** Destiny Bond / Grudge: có tác dụng tới lần dùng skill kế tiếp của quái. */
  destinyBond?: true
  grudge?: true
  /** Lượt (BattleState.turn) có Magic Coat / Snatch. */
  magicCoatTurn?: number
  snatchTurn?: number
  /** Cud Chew: lượt ăn berry; cuối lượt sau đó ăn lại berry vừa ăn (record.lastConsumedItemId). */
  cudChewTurn?: number
  /**
   * Bide: số lượt tích còn lại (0 = lượt sau trả đòn), sát thương đã tích và quái gây sát thương
   * cuối cùng (mục tiêu trả đòn).
   */
  bide?: { skillId: string; turnsLeft: number; damage: Decimal; lastAttackerId?: string }
  /** Sky Drop: quái đang bị `carriedBy` nhấc lên (bán vô hình trên không, mất lượt). */
  carriedBy?: string
  /** Commander: quái đang ở trong miệng đồng đội `commanding` (không bị nhắm, không hành động). */
  commanding?: string
  /** Commander: đồng đội đang chỉ huy quái này (Order Up đổi bậc theo dạng của nó). */
  commandedBy?: string
  /** Illusion: quái hiện ra như loài này cho tới khi trúng đòn gây sát thương. */
  illusionSpeciesId?: string
  /**
   * Quái đang bay đã sà xuống đánh cận chiến (docs/rules/hit-locations.md): tới hết lượt này skill
   * cận chiến của quái đứng trên đất với tới nó.
   */
  swoopedUntilTurn?: number
  /** Mất thế tới hết lượt này: đòn đánh vào nó + bậc chí mạng (hit-locations.md mục "Mất thế"). */
  offBalanceUntilTurn?: number
}

/** Lý do mất thế: trúng điểm yếu, nhắm bộ phận mà trượt, nhắm bộ phận mà bị kháng hệ. */
export const OFF_BALANCE_CAUSES = ['weakPoint', 'missed', 'resisted'] as const
export type OffBalanceCause = (typeof OFF_BALANCE_CAUSES)[number]

/** Một đòn skill gây sát thương lên quái trong lượt (đòn trả kiểu Counter, Avalanche). */
export interface TurnHit {
  /** Id quái ra đòn. */
  by: string
  category: SkillCategory
  amount: Decimal
}

/** Việc đã xảy ra với quái trong một lượt (VolatileState.turnLog). */
export interface TurnLog {
  turn: number
  /** Đã dùng skill (bằng lệnh của nó) trong lượt. */
  acted?: true
  /** Có bậc trận tăng / giảm thật trong lượt. */
  statsRaised?: true
  statsLowered?: true
  /** Đòn skill gây sát thương thật lên quái trong lượt, theo thứ tự. */
  hits?: TurnHit[]
}

/** Nguồn đặt môi trường: tự nhiên của biome, skill (hoặc vật phẩm ném), trait khi vào sân. */
export type FieldSource = 'biome' | 'skill' | 'trait' | 'tribulation' | 'trial' | 'event'

/** Đòn đến muộn đang chờ (Future Sight): trúng ô `slot` của phe `side` ở cuối lượt `turn`. */
export interface DelayedAttack {
  userId: string
  skillId: string
  /** Hồi % max HP của quái dùng thay vì đánh (Wish). */
  healPercent?: number
  side: BattleSide
  slot: number
  turn: number
}

/**
 * Hiệu ứng chỉ có một lần mỗi trận: trait sống sót (mục "Trait sống sót" ở battle-traits.md), cuồng
 * bạo (docs/rules/frenzy.md: đã kích hoạt = đang cuồng bạo tới hết trận).
 */
export const ONCE_PER_BATTLE_EFFECTS = ['surviveLethal', 'revive', 'frenzy'] as const
export type OncePerBattleEffect = (typeof ONCE_PER_BATTLE_EFFECTS)[number]

export interface BattleState {
  /** Tầng đang đánh; biome và bảng rơi tra theo tầng này. */
  floor: number
  /** Trận boss: một boss đánh một mình. */
  isBoss: boolean
  /**
   * Trận độ kiếp (docs/rules/awakening.md): quái `monsterId` đánh một mình với Thiên Kiếp để lên
   * tầng `tier`; null = trận thường.
   */
  tribulation: { monsterId: string; tier: number } | null
  /**
   * Trận với ngự thú sư NPC (docs/rules/trainers.md): không bắt, không chạy; đội NPC trong
   * `enemies`, quái gục được thay. null = quái hoang / boss / độ kiếp.
   */
  trainer: BattleTrainer | null
  /** Trận trong bí cảnh / tháp thí luyện (docs/rules/trials.md): map, luật; null = trận thường. */
  trial: BattleTrial | null
  /**
   * Độ bất ổn của trận quái hoang / boss trên tầng (docs/rules/instability.md); null = không áp.
   */
  instability: BattleInstability | null
  /** Trận do event mở / một đợt thú triều (docs/rules/events.md); null = trận thường. */
  special: SpecialBattle | null
  phase: BattlePhase
  outcome: BattleOutcome | null
  turn: number
  /** Quái hoang; HP của chúng nằm trong damageTaken như quái ta. */
  enemies: Monster[]
  /** Id quái đang trên sân của mỗi ô (2 ô); null = ô trống. */
  playerSlots: (string | null)[]
  enemySlots: (string | null)[]
  /** Môi trường (thời tiết, địa hình); tung theo biome khi vào trận. */
  field: BattleField
  /** Bậc trận theo id quái; mất khi rời sân hoặc hết trận. */
  stages: Record<string, BattleStages>
  /** Trạng thái tạm theo id quái đang trên sân; mất khi rời sân hoặc hết trận. */
  volatiles: Record<string, VolatileState>
  /**
   * Hiệu ứng trait chỉ có một lần mỗi trận đã dùng, theo id quái (trụ lại theo tỉ lệ, hồi sinh);
   * giữ cả khi rời sân để đổi quái không dùng lại được.
   */
  usedOnce: Record<string, OncePerBattleEffect[]>
  /** Bản ghi trận theo id quái (mọi quái đã ra sân); giữ khi rời sân. */
  records: Record<string, BattleRecord>
  /** Đòn đến muộn đang chờ (Future Sight, Doom Desire); bỏ trống = không có. */
  delayedAttacks?: DelayedAttack[]
  /**
   * Món lắp của quái trước khi bị lấy / tráo trong trận (Knock Off, Thief, Trick), theo id quái: hết
   * trận trả lại như Pokémon thế hệ 5+; bỏ trống = không có.
   */
  itemLedger?: Record<string, EquippedItem[]>
  counters: BattleCounters
  /** Quái ta đã từng ra sân trong trận này. */
  participants: string[]
  /**
   * Quái hoang đã bắt / thu phục bằng Thị Uy trong trận; vào đội hoặc kho khi trận kết thúc.
   */
  captured: Monster[]
  /**
   * Quái bị hạ đang xin theo sau trận thắng (docs/rules/recruit.md): id một quái trong `enemies`,
   * chờ acceptRecruit / declineRecruit; null = không có.
   */
  recruitOfferId: string | null
  /** Loại biến hình mỗi phe đã dùng trong trận (mỗi loại tối đa một lần; Primal không tính). */
  transformsUsed: Record<BattleSide, TransformKind[]>
  /** Biến hình boss sẽ dùng ở lượt đầu; null = không có (hoặc đã dùng). */
  plannedTransform: PlannedTransform | null
  /** Phe đã dùng Z-Move trong trận chưa (mỗi phe một lần mỗi trận; docs/rules/z-moves.md). */
  zMoveUsed: Record<BattleSide, boolean>
  /**
   * Ngự thú sư của mỗi phe (linh lực, hồi chiêu; docs/rules/tamer.md); null = phe không có ngự thú
   * sư (quái hoang, boss; sau này trận độ kiếp bỏ ngự thú sư của người chơi).
   */
  tamers: Record<BattleSide, BattleTamer | null>
  /** Cộng hưởng / trận pháp có tác dụng của mỗi phe (docs/rules/team.md); quái hoang không có. */
  teamBonuses: Record<BattleSide, TeamBonus[]>
  /** Diễn biến trận để UI hiển thị. */
  log: BattleEvent[]
}

export type BattleEvent =
  /** Hạ / bắt boss canh giữ: xong lượt vào hiểm địa (docs/rules/zones.md). */
  | { type: 'zoneCompleted'; zoneId: string }
  /** Thua trận hiểm địa: lượt vào kết thúc. */
  | { type: 'zoneFailed'; zoneId: string }
  | { type: 'enter'; side: BattleSide; slot: number; monsterId: string }
  /** elementId: hệ thật khi môi trường đổi hệ của skill (kiểu Weather Ball); bỏ trống = hệ gốc. */
  | {
      type: 'useSkill'
      monsterId: string
      skillId: string
      elementId?: string
      /** Thế đã dùng (docs/rules/move-styles.md); bỏ trống = thế thường. */
      style?: MoveStyle
    }
  /** Synergy của skill có tác dụng nhờ đồng đội partnerId (mục "Synergy" ở battle.md). */
  | { type: 'synergy'; monsterId: string; skillId: string; partnerId: string }
  /** Lượt chờ của skill có hold giảm tổng `turns` lượt (kiểu Tĩnh Tâm Chú). */
  | { type: 'holdReduced'; monsterId: string; turns: number }
  /** Quái cuồng bạo (docs/rules/frenzy.md); hành động thêm của nó log `frenzyAction`. */
  | { type: 'frenzy'; monsterId: string }
  /** Quái chưa khế ước không nghe lệnh, bỏ lượt skill (docs/rules/tamer.md mục "Khế ước"). */
  | { type: 'disobey'; monsterId: string }
  | { type: 'frenzyAction'; monsterId: string }
  | { type: 'miss'; monsterId: string; targetId: string }
  /** Skill cận chiến không với tới quái đang bay (docs/rules/hit-locations.md). */
  | { type: 'outOfReach'; monsterId: string; targetId: string }
  /** Quái đang bay sà xuống đánh cận chiến: quái đứng trên đất với tới nó tới hết `untilTurn`. */
  | { type: 'swooped'; monsterId: string; untilTurn: number }
  /** Đòn nhắm trúng bộ phận `partId` (weakPoint: trúng điểm yếu). */
  | { type: 'aimedHit'; monsterId: string; targetId: string; partId: string; weakPoint: boolean }
  /** Bộ phận của quái bị phá (đồ rơi tăng, hiệu ứng phá bộ phận). */
  | { type: 'partBroken'; monsterId: string; partId: string }
  /**
   * Quái mất thế tới hết `untilTurn`: bị đánh trúng điểm yếu, hoặc nhắm bộ phận mà trượt / bị kháng
   * hệ (`cause`).
   */
  | { type: 'offBalance'; monsterId: string; untilTurn: number; cause: OffBalanceCause }
  /** Người chơi biết lần đầu bộ phận `partId` của loài có phải điểm yếu không (ghi Dex). */
  | { type: 'partRevealed'; speciesId: string; partId: string; weakPoint: boolean }
  | { type: 'noTarget'; monsterId: string }
  | {
      type: 'damage'
      targetId: string
      amount: Decimal
      effectiveness: number
      critical: boolean
    }
  /** Tổng số đòn trúng của skill đánh nhiều lần (sau các sự kiện damage của từng đòn). */
  | { type: 'hitCount'; monsterId: string; targetId: string; hits: number }
  | { type: 'heal'; monsterId: string; amount: Decimal }
  | { type: 'stage'; monsterId: string; stat: StageStat; delta: number }
  | { type: 'faint'; monsterId: string }
  | { type: 'fleeFailed' }
  | { type: 'fled' }
  /** Hết số lượt tối đa của trận (boss thế giới, docs/rules/world-boss.md). */
  | { type: 'battleTimeUp' }
  /**
   * Hết trận boss thế giới: tổng sát thương lần này; `record` = lập kỷ lục mới của lần xuất hiện
   * (kỷ lục ở GameState.worldBoss).
   */
  | { type: 'worldBossDamage'; total: Decimal; record: boolean }
  /** Quái hoang tự bỏ chạy khỏi trận vì trait (không cho EXP, tiền, đồ rơi). */
  | { type: 'wildFled'; monsterId: string }
  | { type: 'expGain'; monsterId: string; amount: Decimal }
  | { type: 'levelUp'; monsterId: string; level: number }
  | { type: 'learnSkill'; monsterId: string; skillId: string }
  /** Thuần thục của skill lên cấp `level` (docs/rules/skill-mastery.md). */
  | { type: 'masteryLevelUp'; monsterId: string; skillId: string; level: number }
  /** Đủ ô skill nên chưa học; UI hỏi người chơi sau. */
  | { type: 'canLearnSkill'; monsterId: string; skillId: string }
  | { type: 'drop'; itemId: string }
  /** Rơi một sách kỹ năng (docs/rules/skill-books.md), đã vào túi. */
  | { type: 'skillBookDropped'; skillId: string; reusable: boolean }
  /** Bậc trận đang âm của quái về 0 (kiểu White Herb). */
  | { type: 'stagesRestored'; monsterId: string; stats: StageStat[] }
  /** Rơi một món trang bị (kể cả món unique boss đang mang), đã vào túi. */
  | { type: 'equipmentDropped'; instanceId: string; itemId: string; rarity: EquipmentRarity }
  /** Túi trang bị đầy: món rơi ra bị mất (docs/rules/capacity.md). */
  | { type: 'equipmentLost'; itemId: string; rarity: EquipmentRarity }
  /** Đội đủ và kho quái đầy: bóng / Thị Uy không có tác dụng, không mất bóng (capacity.md). */
  | { type: 'rosterFull'; monsterId: string }
  /** Trứng đã tới lúc nở nhưng không còn chỗ: vẫn là trứng, chờ có chỗ (capacity.md). */
  | { type: 'eggWaiting'; eggId: string }
  /** Quái tự dùng spell trong ô spell của Artifact (Siralim). */
  | { type: 'spellSlotCast'; monsterId: string; skillId: string }
  /** Đồ cầm tiêu hao đã tác dụng, mất khỏi ô của quái (log traitTriggered của nó ở ngay trước / sau). */
  | { type: 'heldItemConsumed'; monsterId: string; itemId: string }
  | { type: 'useItem'; monsterId: string; itemId: string; targetId: string }
  /** Vật phẩm không có tác dụng lúc dùng (ví dụ mục tiêu đã hồi đầy); không bị trừ. */
  | { type: 'itemNoEffect'; monsterId: string; itemId: string; targetId: string }
  /** Ngự thú sư dùng kỹ năng (đã trừ linh lực); targetId bỏ trống với mục tiêu `field`. */
  | { type: 'tamerSkill'; side: BattleSide; skillId: string; targetId?: string }
  /** Kỹ năng ngự thú sư không có tác dụng lúc tới lượt (mục tiêu đã rời sân...); không tốn gì. */
  | { type: 'tamerSkillNoEffect'; side: BattleSide; skillId: string; targetId?: string }
  /** chance: tỉ lệ bắt (%); critical: bắt chí mạng; shakes: số lần lắc (0–3) trước khi bắt / thoát. */
  | {
      type: 'throwBall'
      monsterId: string
      itemId: string
      targetId: string
      chance: number
      critical: boolean
      shakes: number
    }
  | { type: 'caught'; monsterId: string; destination: 'party' | 'storage' }
  /** Thị Uy (docs/rules/recruit.md): tỉ lệ (0–1) và kết quả; thành công thì quái hoang theo về. */
  | { type: 'intimidate'; targetId: string; chance: number; success: boolean }
  /** Sau trận thắng: quái bị hạ xin theo / boss quy phục, chờ người chơi chọn. */
  | { type: 'recruitOffered'; monsterId: string; method: RecruitMethod }
  /** Quái thu phục (Thị Uy, hoặc nhận lời xin theo) đã vào đội / kho / sẽ vào khi hết trận. */
  | {
      type: 'recruited'
      monsterId: string
      method: RecruitMethod
      destination: 'party' | 'storage'
    }
  | { type: 'breakFree'; monsterId: string }
  /** Ném vật phẩm (không phải bóng) vào quái hoang; trúng hay trượt xem các sự kiện sau đó. */
  | { type: 'throwItem'; monsterId: string; itemId: string; targetId: string }
  /** Dính trạng thái (dính lại thì turns là thời hạn sau khi làm mới). */
  | { type: 'statusApplied'; monsterId: string; statusId: string; turns: number }
  | { type: 'statusImmune'; monsterId: string; statusId: string }
  | { type: 'statusDamage'; monsterId: string; statusId: string; amount: Decimal }
  | { type: 'statusSkipTurn'; monsterId: string; statusId: string }
  /** Lú lẫn kiểu Pokémon: tự đánh mình thay vì dùng skill (hook selfHit), mất `amount` máu. */
  | { type: 'selfHit'; monsterId: string; statusId: string; amount: Decimal }
  /** Mất lượt dùng skill vì trait (xen kẽ kiểu Truant, hoặc theo tỉ lệ). */
  | { type: 'traitSkipTurn'; monsterId: string; traitId: string }
  /** Trait làm quái dùng skill ngẫu nhiên thay lệnh đã chọn (useSkill theo sau là skill thật). */
  | { type: 'traitRandomSkill'; monsterId: string; traitId: string; skillId: string }
  | { type: 'statusEnded'; monsterId: string; statusId: string }
  | { type: 'statusCured'; monsterId: string; statusId: string }
  /** Môi trường bị trạng thái chặn (ví dụ địa hình điện chặn ngủ). */
  | { type: 'statusBlockedByField'; monsterId: string; statusId: string; fieldId: string }
  /** Môi trường đổi (kể cả làm mới thời hạn); monsterId: quái dùng skill / mang trait. */
  | {
      type: 'fieldChanged'
      layer: GlobalFieldLayer
      fieldId: string
      source: FieldSource
      monsterId?: string
    }
  /**
   * Đặt môi trường thất bại: lớp đó đang là thời tiết nguyên thủy (primal), môi trường thường
   * không thay được.
   */
  | { type: 'fieldFailed'; layer: GlobalFieldLayer; fieldId: string; monsterId: string }
  /**
   * Hết thời hạn, hoặc thời tiết nguyên thủy mất vì không còn quái nào trên sân mang trait đặt nó:
   * lớp đó về môi trường mặc định.
   */
  | { type: 'fieldEnded'; layer: GlobalFieldLayer; fieldId: string }
  | { type: 'fieldDamage'; monsterId: string; fieldId: string; amount: Decimal }
  /** Đặt / cộng tầng / làm mới hiệu ứng theo phe; monsterId: quái dùng skill. */
  | {
      type: 'sideFieldSet'
      side: BattleSide
      fieldId: string
      layers: number
      turnsLeft: number | null
      monsterId: string
    }
  /** Không đặt được: đã đủ tầng, hoặc thiếu môi trường yêu cầu (requiresFieldId). */
  | {
      type: 'sideFieldFailed'
      side: BattleSide
      fieldId: string
      monsterId: string
      reason: 'maxLayers' | 'requiresField'
    }
  /** Hết thời hạn: hiệu ứng mất khỏi phe. */
  | { type: 'sideFieldEnded'; side: BattleSide; fieldId: string }
  /** Quái vào sân hút mất bẫy (kiểu quái hệ độc hút Toxic Spikes). */
  | { type: 'sideFieldAbsorbed'; side: BattleSide; fieldId: string; monsterId: string }
  /**
   * Skill không có tác dụng: không phải lượt đầu trên sân, không đủ máu, đã có thế thân, đang chờ
   * (hold; skill do trait chọn ngẫu nhiên), mục tiêu không thỏa `spell.requires` (condition).
   */
  | {
      type: 'skillFailed'
      monsterId: string
      skillId: string
      reason:
        'notFirstTurn' | 'notEnoughHp' | 'alreadyActive' | 'protectFailed' | 'onHold' | 'condition'
    }
  /**
   * Skill được trait của quái dùng cộng priority không có tác dụng lên mục tiêu phe địch (Prankster
   * trước hệ Bóng tối); monsterId: mục tiêu.
   */
  | { type: 'boostUnaffected'; monsterId: string; userId: string; traitId: string }
  /** Hiệu ứng theo phe của quái nhận chặn skill (kiểu Wide Guard); monsterId: quái được bảo vệ. */
  | { type: 'protectedByField'; monsterId: string; fieldId: string; userId: string }
  /** Mọi bậc trận của quái về 0 (kiểu Haze). */
  | { type: 'stagesReset'; monsterId: string }
  /** Skill dọn môi trường toàn sân (kiểu Defog): lớp đó về môi trường mặc định. */
  | { type: 'fieldRemoved'; layer: GlobalFieldLayer; fieldId: string; monsterId: string }
  /** Skill dọn hiệu ứng theo phe (kiểu Defog, Rapid Spin). */
  | { type: 'sideFieldRemoved'; side: BattleSide; fieldId: string; monsterId: string }
  /** Đổi hiệu ứng theo phe của hai phe (kiểu Court Change). */
  | { type: 'sideFieldsSwapped'; monsterId: string }
  /** Đếm ngược Perish Song (turnsLeft sau khi giảm; đặt mới thì là số lượt ban đầu). */
  | { type: 'perishCount'; monsterId: string; turnsLeft: number }
  /**
   * Quái dùng skill tự mất máu: tự gục (Explosion, Final Gambit), trượt mất máu (Jump Kick), mất % max
   * HP mỗi lần dùng (Mind Blown).
   */
  | {
      type: 'selfDamage'
      monsterId: string
      skillId: string
      amount: Decimal
      reason: 'faint' | 'crash' | 'cost' | 'recoil'
    }
  /** Quái nạp chiêu hai lượt / nạp đầu lượt (Fly, Solar Beam, Beak Blast). */
  | { type: 'charging'; monsterId: string; skillId: string }
  /** Quái phải nghỉ lượt này sau Hyper Beam. */
  | { type: 'recharging'; monsterId: string }
  /** Đòn đến muộn được đặt / trúng ô (Future Sight). */
  | { type: 'delayedAttackSet'; monsterId: string; skillId: string }
  | { type: 'delayedAttackHit'; monsterId: string; skillId: string; targetId: string }
  /** Món lắp bị lấy / bỏ (Knock Off, Thief), tráo (Trick), lắp lại (Recycle). */
  | { type: 'itemsTaken'; monsterId: string; count: number }
  | { type: 'itemsSwapped'; monsterId: string; otherId: string }
  | { type: 'itemRecycled'; monsterId: string; itemId: string }
  /** Quái bị ép rời sân (Roar, Dragon Tail) / không bị đẩy được. */
  | { type: 'forcedOut'; monsterId: string }
  | { type: 'forceSwitchFailed'; monsterId: string }
  /** Ability trong trận bị đổi / vô hiệu (Skill Swap, Gastro Acid). */
  | { type: 'abilityChanged'; monsterId: string; abilityId: string }
  | { type: 'abilitySuppressed'; monsterId: string }
  /** Skill bị khóa (Disable), bị ép dùng lại (Encore), học trong trận (Sketch, Mimic). */
  | { type: 'skillDisabled'; monsterId: string; skillId: string }
  | { type: 'encored'; monsterId: string; skillId: string }
  | { type: 'skillLearnedInBattle'; monsterId: string; skillId: string }
  /** Transform: quái biến thành quái khác; Ally Switch: đổi ô với đồng đội. */
  | { type: 'transformedInto'; monsterId: string; otherId: string }
  | { type: 'positionsSwapped'; monsterId: string; otherId: string }
  /** Heal Block chặn hồi máu; Magic Coat phản skill; Snatch cướp skill. */
  | { type: 'healBlocked'; monsterId: string }
  | { type: 'boostsStolen'; monsterId: string; targetId: string; stats: StageStat[] }
  | { type: 'reflected'; monsterId: string; skillId: string }
  | { type: 'snatched'; monsterId: string; skillId: string }
  /** Skill phá bảo vệ của mục tiêu (Feint). */
  | { type: 'protectBroken'; monsterId: string; userId: string }
  /** Quái trụ lại 1 máu nhờ Endure. */
  | { type: 'endured'; monsterId: string }
  /** Hết đếm ngược Perish Song: mất hết máu còn lại. */
  | { type: 'perished'; monsterId: string; amount: Decimal }
  | { type: 'substituteCreated'; monsterId: string; hp: Decimal }
  | { type: 'substituteDamaged'; monsterId: string; amount: Decimal }
  | { type: 'substituteBroken'; monsterId: string }
  /** Quái rút về truyền trạng thái tạm cho quái vào thay (kiểu Baton Pass, Shed Tail). */
  | { type: 'passedOn'; monsterId: string; toMonsterId: string }
  /** Đặt hiệu ứng toàn sân đặc biệt (setRoom); monsterId: quái dùng skill. */
  | { type: 'roomSet'; fieldId: string; turnsLeft: number; monsterId: string }
  /** Đặt lại room đang có thì tắt room đó (như Pokémon). */
  | { type: 'roomRemoved'; fieldId: string; monsterId: string }
  /** Hết thời hạn: room mất khỏi sân. */
  | { type: 'roomEnded'; fieldId: string }
  /** Hiệu ứng theo phe chặn quái khác hạ bậc chỉ số (kiểu Mist). */
  | { type: 'stageBlockedByField'; monsterId: string; stat: StageStat; fieldId: string }
  /** Trait của quái chặn quái khác hạ bậc (kiểu Clear Body). */
  | { type: 'stageBlockedByTrait'; monsterId: string; stat: StageStat; traitId: string }
  /**
   * Trait của quái tác dụng (ghi trước các thay đổi nó gây ra, kiểu Intimidate). `source`: hiệu ứng
   * đến từ trạng thái hoặc minion của quái (traitId là id trạng thái / minion); bỏ trống = trait.
   */
  /**
   * Hiệu ứng của trait kích hoạt; `source` ghi nguồn khi không phải trait (traitId khi đó là id
   * trạng thái / minion / món gốc).
   */
  | {
      type: 'traitTriggered'
      monsterId: string
      traitId: string
      source?: TriggerLogSource
    }
  /**
   * Quái mất máu vì trait của quái khác (phản đòn kiểu Rough Skin, hạ ngay mục tiêu máu thấp); các
   * log traitTriggered ngay trước cho biết trait nào gây ra.
   */
  | { type: 'traitDamage'; monsterId: string; amount: Decimal }
  /** Quái vừa gục sống lại nhờ trait (kiểu Phượng hoàng tái sinh), còn `amount` máu. */
  | { type: 'revived'; monsterId: string; amount: Decimal }
  /**
   * Hợp kích kỹ (docs/rules/team.md): quái nhanh hơn sẵn sàng (chờ đồng đội), quái chậm hơn tung
   * chiêu cùng đồng đội (useSkill theo sau), hoặc bị hủy (một quái gục / mất lượt / hết điều kiện).
   */
  | { type: 'comboReady'; monsterId: string; comboId: string }
  | { type: 'combo'; monsterId: string; partnerId: string; comboId: string }
  | { type: 'comboFailed'; monsterId: string; comboId: string }
  /** Lệnh phòng thủ / khiêu khích (kể cả do trait / buff tự làm). */
  | { type: 'defend'; monsterId: string }
  | { type: 'provoke'; monsterId: string }
  /** Mục tiêu né đòn (tung né độc lập sau accuracy). */
  | { type: 'dodge'; monsterId: string; attackerId: string }
  /** Barrier hút sát thương. */
  | { type: 'barrierAbsorbed'; monsterId: string; amount: Decimal }
  /** Shelled chặn hoàn toàn một đòn. */
  | { type: 'shellBlocked'; monsterId: string }
  /** Sát thương bị bỏ qua hoàn toàn theo tỉ lệ (Repelling, trait "tránh sát thương"). */
  | { type: 'damageNegated'; monsterId: string }
  | { type: 'minionGained'; monsterId: string; minionId: string; stacks: number }
  | { type: 'minionLost'; monsterId: string; minionId: string; stacks: number }
  /** Quái được hành động thêm một lần ngay trong lượt. */
  | { type: 'extraTurn'; monsterId: string }
  /** Quái đổi chỗ trên Timeline (thứ tự hành động). */
  | { type: 'timelineMoved'; monsterId: string; position: 'top' | 'bottom' }
  | { type: 'skillSealed'; monsterId: string; skillId: string }
  /** Không dùng được skill vì trạng thái / khóa (Scorned, Silenced, Seal). */
  | { type: 'skillBlocked'; monsterId: string; skillId: string }
  /** Hành động bị ngắt (trait kiểu Stomp). */
  | { type: 'interrupted'; monsterId: string }
  | { type: 'traitGained'; monsterId: string; traitId: string }
  /** Max HP trong trận đổi `amount` (âm = giảm). */
  | { type: 'maxHpChanged'; monsterId: string; amount: Decimal }
  /** Chỉ số cộng / trừ thẳng trong trận. */
  | { type: 'flatStat'; monsterId: string; stat: StatName; amount: Decimal }
  | { type: 'statusPotency'; monsterId: string; statusId: string; potency: number }
  | { type: 'identityChanged'; monsterId: string; elementIds: string[]; raceId: string }
  /** Đòn đơn mục tiêu bị chuyển sang quái khác (khiêu khích, chặn đòn, Blind, Confused). */
  | { type: 'redirected'; monsterId: string; fromId: string }
  /** Đang có trạng thái cùng nhóm loại trừ nên không dính (đang độc thì không dính độc nặng). */
  | { type: 'statusBlockedByStatus'; monsterId: string; statusId: string; blockingStatusId: string }
  | { type: 'evolve'; monsterId: string; fromSpeciesId: string; toSpeciesId: string }
  /** Tiến hóa dị biến: thành loài dị biến thay cho loài thường của hướng tiến hóa. */
  | { type: 'mutatedEvolution'; monsterId: string; fromSpeciesId: string; toSpeciesId: string }
  /** Gặp quái hoang shiny (để UI làm hiệu ứng). */
  | { type: 'shinyAppeared'; monsterId: string }
  | { type: 'bossAppeared'; monsterId: string }
  /** Hạ / bắt boss tầng ở tầng highestFloor: mở tầng mới. */
  | { type: 'floorUnlocked'; floor: number; biomeId: string }
  /** Bản mệnh chết hẳn trong trận (độ kiếp thất bại lần cuối): đạo thương tới hết ngày đó. */
  | { type: 'bondBroken'; monsterId: string; woundUntilDay: number }
  /** Thắng một đợt thú triều (docs/rules/events.md); cleared = số đợt đã thắng. */
  | { type: 'beastTideWaveWon'; cleared: number; waves: number }
  | { type: 'beastTideCleared' }
  /** Thua đợt thú triều: mất tiền (thay cho phạt thua thường), cửa hàng đóng tới hết ngày đó. */
  | { type: 'beastTideFailed'; shopClosedUntilDay: number }
  | { type: 'eggDropped'; eggId: string }
  | { type: 'eggHatched'; monsterId: string; destination: 'party' | 'storage' }
  /** Thắng trận làm xong yêu cầu "cùng chiến đấu" của quái đang dưỡng dục (imprinting.md). */
  | { type: 'imprintProgress'; monsterId: string; completed: number; total: number }
  /** Nhiều hướng tiến hóa cùng đủ điều kiện; chờ người chơi chọn (chooseEvolution). */
  | { type: 'evolutionChoice'; monsterId: string; options: string[] }
  /** Quái biến hình (Mega, Dynamax / Gigantamax, Tera). */
  | {
      type: 'transformed'
      monsterId: string
      kind: TransformKind
      formSpeciesId?: string
      teraElementId?: string
    }
  /** Quái đổi dạng trong trận (docs/rules/battle-forms.md); `speciesId` null = về dạng thường. */
  | { type: 'formChanged'; monsterId: string; speciesId: string | null }
  /** Dạng chặn đòn (Disguise, Ice Face) chặn đòn của `userId` rồi đổi dạng. */
  | { type: 'disguiseBroken'; monsterId: string; userId: string }
  /** Commander: `monsterId` vào miệng đồng đội `partnerId`. */
  | { type: 'commanding'; monsterId: string; partnerId: string }
  /** Illusion của `monsterId` bị lộ (trúng đòn gây sát thương). */
  | { type: 'illusionEnded'; monsterId: string }
  /** Sky Drop: `userId` nhấc `monsterId` lên trời. */
  | { type: 'carried'; monsterId: string; userId: string }
  /** Mirror Armor: hạ bậc `stat` nhắm vào `monsterId` phản lại lên `targetId`. */
  | { type: 'stageReflected'; monsterId: string; targetId: string; stat: StageStat }
  /** Biến hình hết tác dụng trong trận (Dynamax hết lượt / rời sân). */
  | { type: 'transformEnded'; monsterId: string; kind: TransformKind }
  /** Song thú hợp thể (docs/rules/battle-merge.md): quái phụ hợp vào quái chính. */
  | { type: 'merged'; side: BattleSide; monsterId: string; partnerId: string }
  /** Thực thể hợp thể tách lại thành hai quái (hết lượt, rời sân, gục, hết trận). */
  | { type: 'unmerged'; monsterId: string; partnerId: string }
  /** Max Guard chặn skill nhắm vào quái. */
  | { type: 'protected'; monsterId: string; userId: string }
  /** Z-Move xuyên qua hiệu ứng protect của `monsterId`, chỉ gây một phần sát thương. */
  | { type: 'protectPierced'; monsterId: string; userId: string }
  /** Quái dùng Z-Power: skill gốc `skillId` thành Z-Move `zSkillId` (skill trạng thái: chính nó). */
  | { type: 'zMoveUsed'; monsterId: string; skillId: string; zSkillId: string }
  /** Quái vào thay ô của quái đã dùng Z-Memento / Z-Parting Shot được hồi đầy máu. */
  | { type: 'replacementHealed'; monsterId: string }
  /** Quái được thêm bậc chí mạng tới khi rời sân (Focus Energy, Dragon Cheer, Z-Power). */
  | { type: 'focused'; monsterId: string; stages: number }
  /** Nhận vật phẩm chìa khóa (lần đầu mở tới tầng mốc). */
  | { type: 'keyItemReceived'; itemId: string }
  | { type: 'won'; money: Decimal }
  /** Độ kiếp (docs/rules/awakening.md): thắng lên tầng, thua thêm một lần thất bại, chết hẳn. */
  | { type: 'awakened'; monsterId: string; tier: number }
  | { type: 'tribulationFailed'; monsterId: string; tier: number; failures: number }
  | { type: 'diedInTribulation'; monsterId: string }
  /**
   * Chết thật (docs/rules/options.md): quái gục trong trận chết hẳn lúc trận kết thúc, để lại hồn
   * phách id = monsterId; đội trống thì có quái thay (PartyRefillEvent).
   */
  | { type: 'diedInBattle'; monsterId: string }
  | PartyRefillEvent
  /** EXP ngự thú sư nhận khi thắng trận (kể cả phần mở tầng mới). */
  | { type: 'tamerExpGained'; amount: Decimal }
  /** Ngự thú sư NPC (docs/rules/trainers.md): gặp NPC, tiến độ đạo quán, giải đấu, đấu trường. */
  | { type: 'trainerAppeared'; classId: string; mode: TrainerMode }
  | { type: 'gymProgress'; floor: number; progress: number; total: number }
  /** Thắng quán chủ; first = lần đầu (nhận huy hiệu). */
  | { type: 'gymCleared'; floor: number; first: boolean }
  /** Mở tầng có đạo quán: hệ của đạo quán. */
  | { type: 'gymOpened'; floor: number; elementId: string }
  | { type: 'tournamentRoundWon'; round: number }
  | { type: 'tournamentWon' }
  | { type: 'tournamentEliminated'; round: number }
  | { type: 'arenaRankUp'; rank: number }
  /** Nhận vật phẩm thưởng cố định (vô địch giải, mốc đấu trường, lần đầu thắng đạo quán). */
  | { type: 'itemRewarded'; itemId: string; count: number }
  /**
   * Bí cảnh / tháp thí luyện (docs/rules/trials.md): luật của trận, thắng một trận bí cảnh (kèm hồi
   * máu), hoàn thành (rương), thất bại, thắng tầng tháp.
   */
  | { type: 'trialRules'; ruleIds: string[] }
  /** Đầu trận có độ bất ổn tầng (docs/rules/instability.md): mức và mọi thuộc tính (kể cả ẩn). */
  | { type: 'instability'; level: number; ruleIds: string[] }
  /** Hết trận trong map có thần (docs/rules/deities.md): ân sủng nhận và bậc sau khi nhận. */
  | { type: 'favorGained'; deityId: string; amount: number; rank: number }
  | { type: 'blessingRankUp'; deityId: string; rank: number }
  | { type: 'trialProgress'; cleared: number; total: number }
  | { type: 'trialCompleted' }
  | { type: 'trialFailed' }
  | { type: 'towerFloorCleared'; floor: number }
  /**
   * Khí giới bí cảnh (docs/rules/artifact-spirits.md): qua một tầng (tầng đã qua, cấp mới của món),
   * thu phục dã linh (vị trí trên món), thưởng boss (thêm dòng phụ / + value mọi khí linh), thua.
   */
  | { type: 'itemWorldFloorCleared'; depth: number; level: number }
  | { type: 'spiritSubdued'; index: number; typeIds: string[]; value: number }
  | { type: 'itemWorldBonus'; bonus: 'affix' | 'spiritValue' }
  | { type: 'itemWorldFailed' }
  | { type: 'lost'; moneyLost: Decimal }
