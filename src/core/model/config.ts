// Cấu hình cân bằng (src/data/balance.json).

import type {
  DropEntry,
  EquipmentRarity,
  NormalRarity,
  CrystalTraitKind,
  FormKind,
  GlobalFieldLayer,
  TraitKind
} from './content'
import type { HistoryConfig } from './history'
import type { PartialStats } from './stats'
import type { Pole } from './monster'
import type { AlchemyConfig, CraftCurveConfig } from './alchemy'
import type { QuestConfig } from './quests'
import type { ExpeditionConfig } from './expeditions'
import type { TrainerConfig } from './trainers'
import type { TrialConfig } from './trials'
import type { EventConfig } from './events'
import type { BondConfig, ContractConfig } from './tamer'
import type { SoulRelicConfig } from './soul'
import type { TalentConfig } from './talents'
import type { Tactic } from './monster'
import type { ImprintConfig } from './imprint'
import type { MasteryConfig } from './mastery'
import type { MoveStylesConfig } from './moveStyles'
import type { FrenzyConfig } from './frenzy'
import type { RecruitConfig } from './recruit'
import type { SafariConfig } from './safari'
import type { ImplantConfig } from './implant'
import type { CapacityConfig } from './capacity'
import type { ZoneConfig } from './zones'
import type { GatheringConfig } from './gathering'
import type { CriticalTier, DexConfig } from './dex'
import type { StatName } from './stats'
import type { TransformKind } from './transform'
import type { ActiveTime, DayPhase, Season, TimedActivity } from './time'

type NonHpStatName = Exclude<StatName, 'hp'>

// ---------- Cấu hình cân bằng (src/data/balance.json) ----------

export interface BalanceConfig {
  /** Hệ số nhân gen trước khi cộng vào chỉ số gốc loài. */
  geneWeight: number
  /** Cơ số hệ số thưởng EXP / tiền của shiny: shinyMultiplier^shinyStacks. Không dùng cho chỉ số. */
  shinyMultiplier: number
  /** Bước tăng theo cấp của trait (và trang bị sau này): hiệu ứng = gốc × (1 + step × (cấp − 1)). */
  levelEffectStep: number
  /**
   * Ô trait (không tính trait shiny và boss): quái mới có `initial` ô; mỗi lần làm quái gốc
   * khi fuse +1 ô, tối đa `max`. Con breeding nhận số ô cao nhất của bố mẹ.
   */
  traitSlots: { initial: number; max: number }
  /** Bậc tăng/giảm trong trận: hệ số (base + s) / base khi s ≥ 0, base / (base − s) khi s < 0. */
  /**
   * Bậc trận: −min…max; chỉ số × (base + s) / base (s ≥ 0) hoặc base / (base − s); chính xác / né
   * dùng `accuracyBase` (Pokémon: 3) cho bậc chính xác của quái dùng trừ bậc né của mục tiêu.
   */
  battleStage: { min: number; max: number; base: number; accuracyBase: number }
  /** Id của loài chung dùng cho quái đã fuse. */
  fusedSpeciesId: string
  /** Số quái tối đa trong đội. */
  partySize: number
  /** Số skill tối đa mỗi quái. */
  maxSkills: number
  battle: BattleConfig
  status: StatusConfig
  field: FieldConfig
  ai: AiConfig
  rewards: RewardConfig
  wild: WildConfig
  floors: FloorConfig
  /** Giá nghỉ ngơi = restCostPerLevel × tổng level cả đội. */
  restCostPerLevel: number
  capture: CaptureConfig
  /** Bộ sưu tập (docs/rules/dex.md). */
  dex: DexConfig
  weight: WeightConfig
  size: SizeConfig
  /** Tầm chiêu và vị trí ra đòn (docs/rules/hit-locations.md). */
  hitLocations: HitLocationConfig
  /** Số ký tự tối đa của biệt danh quái. */
  maxNicknameLength: number
  /** Giá học lại skill ở thị trấn = relearnCostPerLevel × level quái. */
  relearnCostPerLevel: number
  shiny: ShinyConfig
  boss: BossConfig
  egg: EggConfig
  breeding: BreedingConfig
  abilities: AbilityConfig
  /** Giá fuse = fuseCostPerLevel × (level quái gốc + level quái phụ). */
  fuseCostPerLevel: number
  fuseChance: FuseChanceConfig
  fusion: FusionConfig
  sacrifice: SacrificeConfig
  rebirth: RebirthConfig
  crystal: CrystalConfig
  skillBook: SkillBookConfig
  shop: ShopConfig
  market: MarketConfig
  equipment: EquipmentConfig
  starter: StarterConfig
  transform: TransformConfig
  clock: ClockConfig
  calendar: CalendarConfig
  lifespan: LifespanConfig
  /** Lý lịch quái (monster-history.md). */
  history: HistoryConfig
  expCandy: ExpCandyConfig
  tamer: TamerConfig
  affinity: AffinityConfig
  /** Dưỡng dục (docs/rules/imprinting.md). */
  imprint: ImprintConfig
  /** Tiến hóa có điều kiện (evolution-skills.md): đồ rơi từ boss (Dị Biến Thạch). */
  evolution: EvolutionConfig
  /** Trận pháp (docs/rules/team.md): trận đồ rơi từ boss tầng. */
  formations: FormationConfig
  /** Hợp kích kỹ (docs/rules/team.md). */
  combo: ComboConfig
  /** Độ thuần thục skill (docs/rules/skill-mastery.md). */
  mastery: MasteryConfig
  /** Thế mạnh / thế nhanh (docs/rules/move-styles.md). */
  moveStyles: MoveStylesConfig
  /** Tính cách (docs/rules/natures.md). */
  nature: NatureConfig
  /** Phẩm cấp loài (docs/rules/species-rank.md). */
  speciesRank: SpeciesRankConfig
  /** Kỹ năng đồng hành (docs/rules/partner-skills.md). */
  partnerSkill: PartnerSkillConfig
  /** Thức tỉnh và độ kiếp (docs/rules/awakening.md). */
  awakening: AwakeningConfig
  /** Hóa hình (docs/rules/human-form.md). */
  humanForm: HumanFormConfig
  /** Thiên tài địa bảo (docs/rules/treasures.md). */
  treasures: TreasureConfig
  /** Luyện đan và linh điền (docs/rules/alchemy.md). */
  alchemy: AlchemyConfig
  /** Linh thực: cấp nấu ăn (docs/rules/cooking.md). */
  cooking: CraftCurveConfig
  /** Nhóm vật phẩm dùng làm nguyên liệu "món bất kỳ trong nhóm" (docs/rules/alchemy.md). */
  itemGroups: Record<string, string[]>
  /** Bảng nhiệm vụ (docs/rules/quests.md). */
  quests: QuestConfig
  /** Phái quái đi thám hiểm (docs/rules/expeditions.md). */
  expeditions: ExpeditionConfig
  /** Tự động đánh: trọng số AI theo chiến thuật (docs/rules/auto-battle.md). */
  autoBattle: AutoBattleConfig
  /** Ngự thú sư NPC, đạo quán, giải đấu, đấu trường (docs/rules/trainers.md). */
  trainers: TrainerConfig
  /** Bí cảnh và tháp thí luyện (docs/rules/trials.md). */
  trials: TrialConfig
  /** Hồn tinh (docs/rules/soul-levels.md). */
  soulLevels: SoulLevelConfig
  /** Điểm nỗ lực, như EV của Pokémon (docs/rules/effort-values.md). */
  effort: EffortConfig
  /** Linh dịch, như Pokérus (docs/rules/spirit-virus.md). */
  spiritVirus: SpiritVirusConfig
  /** Âm / Dương hóa (docs/rules/polarity.md). */
  polarity: PolarityConfig
  /** Huyết mạch và phản tổ (docs/rules/bloodline.md). */
  bloodline: BloodlineConfig
  /** Thiên phú quái (docs/rules/monster-talents.md). */
  talents: TalentConfig
  /** Hệ thống event, chợ đen, thú triều (docs/rules/events.md). */
  events: EventConfig
  /** Bản mệnh thú (docs/rules/tamer.md mục "Bản mệnh thú"). */
  bond: BondConfig
  /** Hồn phách và hồn khí (docs/rules/soul-relics.md). */
  soulRelic: SoulRelicConfig
  /** Cường hóa, tẩy luyện, phân giải trang bị (docs/rules/equipment-forge.md). */
  forge: ForgeConfig
  /** Cuồng bạo (docs/rules/frenzy.md). */
  frenzy: FrenzyConfig
  /** Thu phục (docs/rules/recruit.md). */
  recruit: RecruitConfig
  /** Khu bảo tồn (docs/rules/safari-zone.md). */
  safari: SafariConfig
  /** Phòng Thí Nghiệm: cấy ghép (docs/rules/implant.md). */
  implant: ImplantConfig
  /** Sức chứa kho quái / túi trang bị (docs/rules/capacity.md). */
  capacity: CapacityConfig
  /** Hiểm địa (docs/rules/zones.md). */
  zones: ZoneConfig
  /** Câu cá và khai thác (docs/rules/gathering.md). */
  gathering: GatheringConfig
}

/**
 * Thợ rèn (docs/rules/equipment-forge.md). Bảng theo bậc gồm cả bậc unique; cấp luyện khí theo đường
 * cong `CraftCurveConfig`.
 */
export interface ForgeConfig extends CraftCurveConfig {
  /** Đá cường hóa / Tẩy luyện thạch (material). */
  enhanceStoneItemId: string
  refiningStoneItemId: string
  /** Cường hóa cấp n → n + 1: enhanceBase × rarityPriceMultipliers[bậc] × n² tiền + n Đá cường hóa. */
  enhanceBase: number
  /** Tẩy luyện: (1 + số dòng khóa) × rerollCost[bậc] Tẩy luyện thạch. */
  rerollCost: Record<EquipmentRarity, number>
  /** Phân giải: Đá cường hóa theo bậc + salvageRefundPercent % số đá đã dùng để cường hóa. */
  salvageStones: Record<EquipmentRarity, number>
  salvageRefundPercent: number
  /** % ra 1 Tẩy luyện thạch mỗi món phân giải, theo bậc. */
  salvageRefiningChance: Record<EquipmentRarity, number>
  /** Hồn khí phân giải ra thêm điểm hồn tinh theo bậc. */
  salvageSoulPoints: Record<EquipmentRarity, number>
  /** Đồ rơi thêm khi hạ boss. */
  bossDrops: DropEntry[]
  /** Exp luyện khí mỗi lần cường hóa. */
  enhanceExp: number
  /** Cường hóa cấp cao: từ cấp fromLevel cần thêm ⌊(cấp − fromLevel) / step⌋ + 1 món của nhóm. */
  coreEnhance: { groupId: string; fromLevel: number; step: number }
  /** Đúc trang bị (`castEquipment`). */
  cast: CastConfig
  /** Phụ linh (`imbueEquipment`). */
  imbue: ImbueConfig
}

/**
 * Phụ linh (docs/rules/equipment-forge.md): dòng linh hệ theo hệ của yêu đan (hệ → id dòng phụ có
 * trọng số 0), số yêu đan cùng hệ theo bậc món, tiền × tầng cao nhất, exp luyện khí.
 */
export interface ImbueConfig {
  lineIds: Record<string, string>
  cores: Record<EquipmentRarity, number>
  money: number
  exp: number
}

/**
 * Đúc trang bị từ món gốc thường + yêu đan cùng một hệ (yêu đan theo hệ ở
 * config.treasures.demonCoreItemIds); món đúc mang sẵn dòng linh hệ của hệ đó.
 */
export interface CastConfig {
  minLevel: number
  /** Số món của nhóm bỏ vào mỗi lần: 1 … maxCores. */
  maxCores: number
  /** Tiền mỗi lần = money × tầng cao nhất. */
  money: number
  exp: number
  rarityWeights: Partial<Record<NormalRarity, number>>
  /** Bậc từ floorBoostFrom × (1 + coreFactor × (số món − 1)) × (1 + levelFactor × (cấp − minLevel)). */
  coreFactor: number
  levelFactor: number
}

export interface SoulLevelConfig {
  /** % chỉ số mỗi cấp hồn tinh của chỉ số đó. */
  percentPerLevel: number
  /** Cấp n → n + 1: tốn n + 1 điểm hồn tinh và costBase × (n + 1)² tiền. */
  costBase: number
  /** Fuse: quái bị tiêu hao hoàn lại % số điểm hồn tinh đã dùng (làm tròn xuống). */
  fuseRefundPercent: number
  /** Rơi từ mọi quái bị hạ / thêm từ boss. */
  wildDrops: DropEntry[]
  bossDrops: DropEntry[]
}

/** Một bậc điểm nỗ lực suy ra cho loài không ghi effortYield: tổng chỉ số gốc ≥ mốc thì cho `points`. */
export interface DerivedEffortTier {
  minBaseStatTotal: number
  points: number
}

export interface EffortConfig {
  /** Trần điểm nỗ lực của một chỉ số (Pokémon: 252). */
  maxPerStat: number
  /** Trần tổng điểm nỗ lực mọi chỉ số (Pokémon: 510). */
  maxTotal: number
  /** % chỉ số mỗi điểm nỗ lực của chỉ số đó (nguồn % `effort`). */
  percentPerPoint: number
  /**
   * Loài không ghi effortYield: tổng điểm theo tổng chỉ số gốc (bậc cao nhất có mốc ≤ tổng; mốc tăng
   * dần, bậc đầu mốc 0), dồn vào chỉ số gốc cao nhất.
   */
  derivedYield: DerivedEffortTier[]
}

/** Một khoảng độ thuần tung cho quái hoang, theo trọng số. */
export interface PurityRollTier {
  min: number
  max: number
  weight: number
}

/** Mọi tỉ lệ tính bằng %, độ thuần tính bằng điểm % (docs/rules/bloodline.md). */
export interface BloodlineConfig {
  /** Độ thuần mỗi nhóm của quái hoang / boss / trứng boss: chọn khoảng theo trọng số rồi tung đều. */
  wildPurityWeights: PurityRollTier[]
  /** Boss cộng thêm vào mọi nhóm của nó. */
  bossPurityBonus: number
  /** Con breeding: trung bình bố mẹ + số nguyên đều trong [−breedDownPoints, +breedUpPoints]. */
  breedDownPoints: number
  breedUpPoints: number
  /** Đột biến phản tổ khi breed: tỉ lệ và điểm cộng vào huyết mạch chính của con. */
  atavismMutationChance: number
  atavismMutationPoints: number
  /** Mẹ có huyết mạch chính ≥ ancestorBirthMinPurity: tỉ lệ con là một loài tổ của nhóm đó. */
  ancestorBirthChance: number
  ancestorBirthMinPurity: number
  /** Tỉ lệ boss rơi Tinh huyết mỗi nhóm của nó (loài tổ của nhóm thì chắc chắn rơi). */
  essenceDropChance: number
  /** Tỉ lệ boss rơi trận đồ của mỗi nhóm của nó có trận đồ (loài tổ thì chắc chắn rơi). */
  scrollDropChance: number
  /** Thắng trận boss: quái tham chiến cùng nhóm với địch nhận thêm (địch là loài tổ: ancestorKillPurity). */
  bossKillPurity: number
  ancestorKillPurity: number
  /** Fuse: quái gốc nhận % độ thuần của quái phụ ở nhóm mà quái gốc cũng thuộc. */
  fusePurityPercent: number
  /** Hiến tế: quái chính nhận % độ thuần của quái phụ ở nhóm mà quái chính cũng thuộc. */
  sacrificePurityPercent: number
  /** Hệ số pha trộn chỉ số gốc ở độ thuần 100%. */
  mixAtFullPurity: number
  /** Mốc độ thuần (tăng dần): số mốc đã đạt = cấp trait huyết mạch. */
  milestones: number[]
  /** Giá phản tổ = atavismCostPerLevel × level. */
  atavismCostPerLevel: number
}

export interface SpiritVirusConfig {
  /** % mỗi trận một quái ngẫu nhiên trong đội nhiễm (Pokémon: 3/65536). */
  infectPercent: number
  /** % mỗi trận một quái đang nhiễm lây sang hai quái kề trong đội (Pokémon: 1/3). */
  spreadPercent: number
  /** Số ngày nhiễm, tung đều trong [minDays, maxDays] (Pokémon: 1–4). */
  minDays: number
  maxDays: number
  /** % EXP nhận thêm khi đang nhiễm / đã miễn dịch (cộng như hook expGainPercent). */
  infectedExpPercent: number
  immuneExpPercent: number
  /** Hệ số nhân điểm nỗ lực khi đang nhiễm (Pokémon: ×2). */
  effortMultiplier: number
  /** Gen cộng vào một chỉ số ngẫu nhiên mỗi trận thắng khi đang nhiễm (× hệ số gen tầng cao nhất). */
  genesPerWin: number
}

/**
 * Trọng số AI của một chiến thuật, nhân vào từng phần điểm của ứng viên: sát thương (kể cả hạ gục,
 * địch máu thấp, trait khi trúng), hiệu ứng lên địch, hiệu ứng lên phe mình, phần điểm âm (skill tự
 * hạ chỉ số...), lệnh phòng thủ / khiêu khích.
 */
export interface TacticWeights {
  damage: number
  foeEffects: number
  allyEffects: number
  penalty: number
  guard: number
}

export interface AutoBattleConfig {
  /** Theo chiến thuật; `manual` không tự đánh (trọng số không dùng nhưng vẫn khai báo). */
  tactics: Record<Tactic, TacticWeights>
}

export interface TreasureConfig {
  /** Kháng: hiệu quả × resistance ^ (số lần đã ăn đúng món). */
  resistance: number
  /** Đúng khẩu vị: hiệu quả × favoriteMultiplier, + favoriteAffinity thân mật. */
  favoriteMultiplier: number
  favoriteAffinity: number
  /** Rơi từ mọi quái bị hạ / từ boss. */
  wildDrops: DropEntry[]
  bossDrops: DropEntry[]
  /** Yêu đan theo hệ: boss bị hạ rơi yêu đan của hệ đầu với tỉ lệ demonCoreChance (%). */
  demonCoreItemIds: Record<string, string>
  demonCoreChance: number
  /** Quái hoang (không phải boss) bị hạ rơi yêu đan của hệ đầu với tỉ lệ này (%). */
  demonCoreWildChance: number
}

export interface HumanFormConfig {
  /** Tầng thức tỉnh tối thiểu để hóa hình. */
  minAwakening: number
  /** Hóa Hình Đan (1 viên) và tiền costPerLevel × level. */
  pillItemId: string
  costPerLevel: number
  /** Thọ nguyên × số này khi đã hóa hình. */
  lifespanMultiplier: number
  /** % chỉ số khi đang ở nhân hình (cộng ở bước áp trait). */
  statPercents: PartialStats
  /** Hiện nguyên hình: + statPercentBase + statPercentPerAwakening × tầng thức tỉnh, mọi chỉ số trừ HP. */
  trueForm: { statPercentBase: number; statPercentPerAwakening: number }
  /** Hóa Hình Đan rơi từ boss tầng của map từ tầng dropFromFloor. */
  dropFromFloor: number
  floorBossDrops: DropEntry[]
}

/** Phần thưởng của một tầng mốc thức tỉnh: thần thông (skill) hoặc +1 ô trait. */
export type AwakeningReward = 'skill' | 'traitSlot'

export interface AwakeningMilestone {
  tier: number
  reward: AwakeningReward
}

export interface AwakeningConfig {
  /** Hệ số chỉ số mỗi tầng: (1 + statStepPercent / 100) ^ tầng. */
  statStepPercent: number
  /** Hệ số thọ nguyên mỗi tầng: lifespanMultiplier ^ tầng. */
  lifespanMultiplier: number
  /** Level cần cho tầng n: levelPerTier × n. */
  levelPerTier: number
  /** Tiền cho tầng n: costBase × n². */
  costBase: number
  /**
   * Thức tỉnh đan theo hệ (hệ → id) và số viên cho tầng n: pillsPerTier × n, đan của bất kỳ hệ nào
   * quái đang mang.
   */
  pillItemIds: Record<string, string>
  pillsPerTier: number
  /** Tầng mốc theo tầng tăng dần; sau mốc cuối, mỗi repeatEvery tầng một mốc, xen kẽ hai loại. */
  milestones: AwakeningMilestone[]
  repeatEvery: number
  /** Thần thông theo hệ: danh sách skill (mạnh nhất trước), ít nhất 2. */
  divineSkills: Record<string, string[]>
  /** Thua quá số lần này liên tiếp ở một tầng thì quái chết hẳn. */
  maxFailures: number
  /** Trọng thương: % mọi chỉ số (âm) và số trận thắng mới hết. */
  injuryStatPercent: number
  injuryBattles: number
  /** Đồ rơi thêm: mỗi boss bị hạ / boss tầng của map. */
  bossDrops: DropEntry[]
  floorBossDrops: DropEntry[]
  /** Thức tỉnh đan theo hệ đầu của boss rơi (%): mỗi boss / thêm khi là boss tầng của map. */
  bossPillChance: number
  floorBossPillChance: number
  tribulation: TribulationConfig
}

export interface TribulationConfig {
  /** Loài Thiên Kiếp (không ở biome nào, không bắt được). */
  speciesId: string
  /** Level Thiên Kiếp = level quái độ kiếp + levelOffset (tối thiểu 1). */
  levelOffset: number
  /** Hệ số chỉ số của Thiên Kiếp ở tầng n (đang lên n + 1): multiplierBase + multiplierPerTier × n. */
  multiplierBase: number
  multiplierPerTier: number
  /** Môi trường cố định cả trận. */
  weather: string
  terrain: string
  /** Hết số lượt này mà chưa phân thắng thua thì tính là thua. */
  maxTurns: number
}

export interface PartnerSkillConfig {
  /** Sức mạnh = 1 + strengthPerTier × bậc thân mật (0 = mức đầu của affinityTiers.json). */
  strengthPerTier: number
}

export interface SpeciesRankConfig {
  /** Loài có catchRate ≤ số này là huyền thoại, được cộng bậc. */
  legendaryCatchRate: number
  /** Số bậc cộng cho loài huyền thoại (không vượt bậc cao nhất). */
  legendaryBonus: number
}

/** Âm / Dương hóa (docs/rules/polarity.md). */
export interface PolarityConfig {
  /** % chỉ số theo cực, cộng vào tổng % ở bước áp trait (nguồn `polarity`). */
  statPercents: Record<Pole, PartialStats>
  /** % sát thương thêm khi quái Âm đánh quái Dương hoặc ngược lại. */
  opposeBonus: number
  /** Từ tầng này quái hoang / boss có thể có sẵn cực (theo tầng đang đánh). */
  unlockFloor: number
  /** % quái hoang có cực (từ unlockFloor; Âm / Dương đều nhau). */
  wildChance: number
  /** % boss có cực (từ unlockFloor). */
  bossChance: number
  /** Pool trait cực tính theo cực (trait loại `polarity`), random đều khi nhận cực. */
  traitIds: Record<Pole, string[]>
  /** Đá chuyển cực rơi thêm khi hạ boss từ unlockFloor. */
  bossDrops: DropEntry[]
}

export interface NatureConfig {
  /** % tăng của chỉ số `up` và % giảm của chỉ số `down`. */
  percent: number
  /** Rơi thêm khi hạ boss (Bạc Hà Tính Cách). */
  bossDrops: DropEntry[]
}

export interface FormationConfig {
  /** Rơi thêm khi hạ boss tầng của map. */
  floorBossDrops: DropEntry[]
}

export interface ComboConfig {
  /** Thân mật tối thiểu của mỗi quái phe người chơi để dùng hợp kích kỹ. */
  minAffinity: number
}

/** Một bậc đồ rơi theo tầng: dùng từ tầng fromFloor tới trước bậc kế tiếp. */
export interface FloorDropTier {
  fromFloor: number
  drops: DropEntry[]
}

/** Độ thân mật (docs/rules/affinity.md). Lượng tăng nhân hook affinityGainPercent, lượng giảm thì không. */
export interface AffinityConfig {
  /** Trần thân mật (sàn 0). */
  max: number
  /**
   * Thân mật khởi đầu: quái khởi đầu, quái bắt được (bóng không ghi startAffinity), quái trong
   * trứng, quái thu phục (docs/rules/recruit.md).
   */
  start: { starter: number; caught: number; egg: number; recruit: number }
  gain: {
    /** Thắng trận: quái trong đội không ra sân / đã ra sân. */
    win: number
    participated: number
    /** Mỗi lần nghỉ / NPC hồi máu, mọi quái trong đội. */
    rest: number
    /** Dùng vật phẩm hồi máu (có hồi máu thật) lên quái. */
    potion: number
    /** Mỗi viên kẹo EXP / Kẹo Hiếm. */
    candy: number
  }
  /** Quái ta gục trong trận. */
  loss: { faint: number }
  /** Đồ rơi thêm: mỗi quái hoang bị hạ (cả boss), mỗi boss bị hạ, boss tầng của map. */
  wildDrops: DropEntry[]
  bossDrops: DropEntry[]
  floorBossDrops: DropEntry[]
}

/** Ngự thú sư và khế ước (docs/rules/tamer.md). Mọi tỉ lệ tính bằng %. */
export interface TamerConfig {
  /** EXP ngự thú sư khi thắng trận = expShare% EXP gốc của trận (số mỗi quái nhận trước trait). */
  expShare: number
  /** Lần đầu mở tầng mới: thêm floorUnlockExpPercent% EXP gốc của trận boss tầng đó. */
  floorUnlockExpPercent: number
  /** EXP cần để lên cảnh giới n + 1 = expBase × (n + 1)^expPower. */
  expBase: number
  expPower: number
  /** Đột phá cảnh giới n → n + 1. */
  breakthrough: {
    /** Tiền = costBase × (n + 1)². */
    costBase: number
    /** Nguyên liệu tiêu hao: (n + 1) cái. */
    itemId: string
    /** Tỉ lệ thành công = max(minChance, baseChance − n × chanceStep). */
    baseChance: number
    chanceStep: number
    minChance: number
  }
  /** Cộng hưởng khế ước: % mọi chỉ số mỗi cảnh giới khế ước của quái. */
  statPercentPerRealm: number
  /** Thọ nguyên × (1 + cảnh giới khế ước × lifespanPercentPerRealm / 100). */
  lifespanPercentPerRealm: number
  /** Khế ước: giới hạn level, số ô, tỉ lệ, hậu quả thất bại (docs/rules/tamer.md mục "Khế ước"). */
  contract: ContractConfig
  /** Linh lực tối đa = manaBase + manaPerRealm × cảnh giới; đầy lại mỗi đầu trận. */
  manaBase: number
  manaPerRealm: number
  /** Mốc cảnh giới (tăng dần, sau mốc cuối gấp đôi mãi): mỗi mốc đã đạt +1 ô đồ cầm. */
  realmMilestones: number[]
  /** Đồ rơi thêm khi hạ boss tầng (Phá Cảnh Đan). */
  floorBossDrops: DropEntry[]
}

/** Kẹo EXP và Kẹo Hiếm (mục "Kẹo EXP và Kẹo Hiếm" ở world-items.md). */
export interface ExpCandyConfig {
  /** Kẹo rơi khi hạ mọi boss, theo bậc tầng (fromFloor tăng dần, bậc đầu từ tầng 1). */
  bossDropTiers: FloorDropTier[]
  /** Rơi thêm khi hạ boss tầng (Kẹo Hiếm). */
  floorBossDrops: DropEntry[]
}

export interface EvolutionConfig {
  /** Rơi khi hạ mọi boss. */
  bossDrops: DropEntry[]
  /** Rơi thêm khi hạ boss tầng của map. */
  floorBossDrops: DropEntry[]
}

/** Đồng hồ game (mục "Đồng hồ game" ở lifespan.md): giờ thường, 24 giờ một ngày. */
export interface ClockConfig {
  /** Giờ trong ngày lúc bắt đầu game mới (0–23). */
  startHour: number
  /** Nghỉ (rest) là ngủ tới giờ này của sáng hôm sau (0–23). */
  wakeHour: number
  /** Số giờ mỗi việc tốn (số nguyên ≥ 0). */
  hours: Record<TimedActivity, number>
}

/** Ngày đêm và mùa (docs/rules/calendar.md); mọi thứ suy từ GameState.time, không lưu thêm. */
export interface CalendarConfig {
  /** Giờ bắt đầu của từng thời khắc (0–23, khác nhau); thời khắc kéo tới giờ bắt đầu kế tiếp. */
  phaseStartHours: Record<DayPhase, number>
  /** Hệ số trọng số gặp loài theo giờ hoạt động và thời khắc (> 0). */
  activeTimeMultipliers: Record<ActiveTime, Record<DayPhase, number>>
  /**
   * Giờ hoạt động suy ra khi loài không ghi `activeTime`: theo race (id race xét trước id nhóm
   * race), rồi theo hệ (các hệ của loài phải cùng một giờ hoạt động, lệch nhau thì không có).
   */
  activeTimeByRace: Record<string, ActiveTime>
  activeTimeByElement: Record<string, ActiveTime>
  /** Hệ số trọng số thời tiết tự nhiên của map theo mùa (id thời tiết → hệ số > 0; thiếu = 1). */
  seasonWeatherMultipliers: Record<Season, Record<string, number>>
}

/** Khoảng % thọ nguyên (tuổi khi xuất hiện). */
export interface PercentRange {
  min: number
  max: number
}

/** Tuổi và thọ nguyên (mục "Tuổi và thọ nguyên" ở lifespan.md). */
export interface LifespanConfig {
  /** Số ngày game của một năm tuổi. */
  daysPerYear: number
  /** Thọ nguyên × (1 + maxLevelReached × levelPercent / 100). */
  levelPercent: number
  /** Dưới % này thọ nguyên đã sống là ấu niên; từ oldFromPercent là lão niên. */
  youngBelowPercent: number
  oldFromPercent: number
  /** Ấu niên: % mọi chỉ số, % EXP nhận. */
  young: { statPercent: number; expPercent: number }
  /** Lão niên: % mọi chỉ số giảm tuyến tính từ 0 (ở oldFromPercent) tới statPercentAtEnd (100%). */
  old: { statPercentAtEnd: number; expPercent: number }
  /** Lần đầu vượt % này thì cảnh báo sắp thọ tận. */
  warnPercent: number
  /** Tuổi khi xuất hiện (% thọ nguyên): quái hoang, boss random trong khoảng; quái khởi đầu cố định. */
  spawnAgePercent: { wild: PercentRange; boss: PercentRange; starter: number }
  /** Fuse: quái gốc nhận % số năm còn lại của quái phụ. */
  fuseAbsorbPercent: number
  /** Trứng truyền thừa: % gen của quái tọa hóa (làm tròn xuống, tối thiểu wild.geneMin). */
  legacyEgg: { genePercent: number }
  /** Kháng đan: hiệu quả Thọ Nguyên Đan × pillResistance^(số lần đã dùng đúng loại đan đó). */
  pillResistance: number
  /** Đồ rơi thêm khi hạ boss (mọi boss) / boss tầng, chỉ khi bật thọ nguyên (Thọ Nguyên Đan). */
  bossDrops: DropEntry[]
  floorBossDrops: DropEntry[]
}

/** Trang bị (mục "Trang bị và đồ cầm"). Mọi tỉ lệ tính bằng %. */
export interface EquipmentConfig {
  /** Số ô trên quái của người chơi = baseSlots + số mốc tầng đã đạt. */
  baseSlots: number
  /** Mốc tầng mở thêm ô (tăng dần); sau mốc cuối cứ gấp đôi mốc trước (không trần). */
  floorMilestones: number[]
  /** % rơi một món trang bị thường mỗi quái hoang bị hạ / mỗi boss bị hạ. */
  dropChance: number
  bossDropChance: number
  /** Trọng số bậc khi tung: quái hoang, boss, cửa hàng (bậc không ghi = không ra). */
  rarityWeights: Partial<Record<NormalRarity, number>>
  bossRarityWeights: Partial<Record<NormalRarity, number>>
  shopRarityWeights: Partial<Record<NormalRarity, number>>
  /** Bậc từ mức này trở lên có trọng số × (1 + floorRarityFactor × (tầng − 1)). */
  floorBoostFrom: NormalRarity
  floorRarityFactor: number
  /** Giá = price × hệ số bậc (× tầng như mọi vật phẩm có giá). */
  rarityPriceMultipliers: Record<EquipmentRarity, number>
  /** Số dòng phụ tung thêm theo bậc. */
  affixCounts: Record<EquipmentRarity, number>
  /** Hạ boss: % rơi món unique boss đang mang; % rơi thêm 1 món mới từ pool của loài. */
  uniqueCarriedDropChance: number
  uniquePoolDropChance: number
}

/** Mức độ hợp race khi fuse: cùng race, race nằm trong breedsWith (cả hai chiều), còn lại. */
export const FUSE_RACE_MATCHES = ['same', 'breedable', 'other'] as const

export type FuseRaceMatch = (typeof FUSE_RACE_MATCHES)[number]

/** Fuse (fusing.md, khóa `fusion`). */
export interface FusionConfig {
  /** Số skill tối đa của quái phụ được chọn kế thừa mỗi lần fuse. */
  inheritSkills: number
}

/** Hiến tế (docs/rules/sacrifice.md). */
export interface SacrificeConfig {
  /** Giá mỗi quái phụ = costPerLevel × (level quái chính + level quái phụ). */
  costPerLevel: number
  /** % mọi chỉ số mỗi stack hiến tế (tuyến tính). */
  statPercentPerStack: number
}

/** Luân hồi quái (docs/rules/rebirth.md). Lần thứ n = rebirths + 1. */
export interface RebirthConfig {
  /** Level tối thiểu lần thứ n = minLevelBase × n. */
  minLevelBase: number
  /** Giá lần thứ n = costBase × n². */
  costBase: number
  /** Luân Hồi Đan (category material); lần thứ n cần pillsPerRebirth × n viên. */
  pillItemId: string
  pillsPerRebirth: number
  /** % mọi chỉ số mỗi lần đã luân hồi (tuyến tính, cộng vào tổng % ở bước áp trait). */
  statPercentPerRebirth: number
  /** Gen mọi chỉ số + genePercent % gen hiện tại mỗi lần luân hồi. */
  genePercent: number
  /** Luân Hồi Đan rơi từ boss tầng của map. */
  floorBossDrops: DropEntry[]
}

/**
 * Tỉ lệ fuse thành công (mục Fusing): raceChances[mức hợp race] × lineageFactor^(số loài trong
 * lineage của quái gốc) + điểm cộng (trait, bùa), kẹp [0, 100].
 */
export interface FuseChanceConfig {
  /** Tỉ lệ % theo mức độ hợp race. */
  raceChances: Record<FuseRaceMatch, number>
  /** Hệ số nhân mỗi loài trong lineage (0–1): tỉ lệ giảm dần nhưng không về 0. */
  lineageFactor: number
}

/** Tinh thể trait (mục "Extract / inject trait"). */
export interface CrystalConfig {
  /** Giá extract = extractCostBase × cấp² × hệ số theo loại trait. */
  extractCostBase: number
  /** Giá inject = injectCostBase × (cấp sau khi gộp)² × hệ số theo loại trait. */
  injectCostBase: number
  kindCostMultipliers: Record<CrystalTraitKind, number>
}

/**
 * Một bậc hiếm của sách kỹ năng (docs/rules/skill-books.md), xếp từ phổ biến tới hiếm: skill có số
 * loài học được (theo learnset) ≥ minLearners thì thuộc bậc này (bậc phổ biến nhất khớp được).
 */
export interface SkillBookRarityDef {
  id: string
  minLearners: number
  /** Hệ số giá (> 0). */
  priceMultiplier: number
  /** Tổng trọng số của bậc trong kệ sách cửa hàng, chia đều cho các skill của bậc (≥ 0). */
  shopWeight: number
}

/** Sách kỹ năng (docs/rules/skill-books.md). */
export interface SkillBookConfig {
  /** Giá gốc Bí kíp = (priceBase + power × pricePerPower) × hệ số bậc hiếm × highestFloor. */
  priceBase: number
  pricePerPower: number
  /** Chân kinh = giá Bí kíp × reusablePriceMultiplier. */
  reusablePriceMultiplier: number
  /** Skill thuộc hệ này mọi quái học được qua sách (hệ thường). */
  universalElementIds: string[]
  /** Bậc hiếm theo số loài học được, minLearners giảm dần (bậc cuối thường 0). */
  rarities: SkillBookRarityDef[]
  /** Mỗi mốc power đạt (≥) thì skill hiếm thêm một bậc (tối đa bậc cuối); tăng dần. */
  rarityPowerSteps: number[]
  /** Kệ sách cửa hàng: số Bí kíp random trong [shopMin, shopMax], skill power ≤ shopMaxPower. */
  shopMin: number
  shopMax: number
  shopMaxPower: number
  /** Sách mà quái trong đội học được (chưa biết) nhân trọng số này trên kệ và khi boss rơi (≥ 1). */
  partyMultiplier: number
  /** % mỗi boss bị hạ rơi một sách (× hệ số rơi), skill trong learnset loài gốc của boss. */
  bossDropChance: number
  /** % sách rơi từ boss là Chân kinh. */
  reusableDropChance: number
}

/** Một bậc tốc độ tụt giá theo giá gốc trong dữ liệu (không nhân tầng). */
export interface MarketDropTier {
  /** Giá gốc ≤ maxPrice thì dùng bậc này; bậc cuối không ghi (mọi giá còn lại). */
  maxPrice?: number
  /** Mỗi cái đã bán làm hệ số giá tụt thêm dropPerUnit (0 = không tụt). */
  dropPerUnit: number
}

/** Giá thị trường động (mục "Giá thị trường động" ở world-items.md). Chỉ đổi giá bán. */
export interface MarketConfig {
  /** Hệ số bão hòa không xuống dưới mức này. */
  minFactor: number
  /** Mỗi ngày saturation × recoveryPerDay. */
  recoveryPerDay: number
  /** Saturation dưới ngưỡng này thì xóa key. */
  removeBelow: number
  /** Hệ số dao động ngày theo category, trong [dayFactorMin, dayFactorMax]. */
  dayFactorMin: number
  dayFactorMax: number
  /** Hệ số của category được giá trong ngày. */
  hotMultiplier: number
  /** Bậc tốc độ tụt theo giá gốc, maxPrice tăng dần. */
  dropTiers: MarketDropTier[]
}

/** Cửa hàng ở thị trấn (mục "Cửa hàng và vứt vật phẩm"). */
export interface ShopConfig {
  /** Số món trong danh sách hàng, random trong [stockMin, stockMax]. */
  stockMin: number
  stockMax: number
  /** Giá bán mỗi món = sellPercent % giá gốc, làm tròn xuống. */
  sellPercent: number
  /** Giá mua tinh thể = crystalBuyMultiplier × giá extract của tinh thể đó. */
  crystalBuyMultiplier: number
  /**
   * Trọng số của tinh thể cấp 1 khi random hàng: tổng của cả loại trait, chia đều cho các trait
   * trong loại (thêm trait mới không làm tinh thể lấn vật phẩm).
   */
  crystalWeights: Record<CrystalTraitKind, number>
}

/**
 * Điều kiện của một ô quái khởi đầu (docs/rules/starters.md), xét trên loài dạng đầu có tiến hóa.
 * Handler ở registries/starterConditions.ts (STARTER_CONDITIONS).
 */
export type StarterCondition =
  /** Chuỗi tiến hóa (chính nó hoặc dạng sau) có dạng thuộc `formKinds` (Mega, Gigantamax...). */
  | { kind: 'lineHasForm'; formKinds: FormKind[] }
  /** Chính nó hoặc một dạng sau đạt phẩm cấp loài ≥ `rankId` (tiềm năng cao). */
  | { kind: 'evolvesToRank'; rankId: string }
  /** Thuộc danh sách loài cho trước. */
  | { kind: 'species'; speciesIds: string[] }
  /** Thuộc ít nhất một nhóm huyết mạch (phản tổ được về sau; docs/rules/bloodline.md). */
  | { kind: 'bloodline' }

export const STARTER_CONDITION_KINDS = [
  'lineHasForm',
  'evolvesToRank',
  'species',
  'bloodline'
] as const

/** Một ô ứng viên khởi đầu: random đều trong loài thỏa mọi điều kiện (rỗng = mọi loài hợp lệ). */
export interface StarterSlot {
  conditions: StarterCondition[]
}

export interface StarterConfig {
  /** Mỗi ô ra một ứng viên (theo thứ tự hiển thị), không trùng loài với ô trước. */
  slots: StarterSlot[]
  level: number
  money: number
  /** Vật phẩm ban đầu: id → số lượng. */
  items: Record<string, number>
}

/** Mọi tỉ lệ tính bằng %. */
export interface BreedingConfig {
  /** Giá breed = costPerLevel × (level bố + level mẹ). */
  costPerLevel: number
  /** Tỉ lệ con shiny khi không ai shiny / khi đúng một trong hai shiny (cả hai shiny: chắc chắn). */
  shinyChance: number
  shinyChanceOneParent: number
  /** Tỉ lệ đột biến: mọi gen đều tăng. */
  mutationChance: number
  /** Gen con = max(bố, mẹ) × (1 + r), r random trong [−geneDownPercent, +geneUpPercent] %. */
  geneDownPercent: number
  geneUpPercent: number
}

/** Ô ability của quái (docs/rules/abilities.md). */
export interface AbilityConfig {
  /** % quái hoang có ô ability ẩn (còn lại chia đều hai ô thường). */
  wildHiddenChance: number
  /** % con breeding giữ ô ability thường của mẹ (còn lại: ô thường kia). */
  inheritChance: number
  /** % con breeding có ô ẩn khi mẹ có ô ẩn (còn lại: chia đều hai ô thường). */
  inheritHiddenChance: number
}

export interface BossConfig {
  /** Trait "Huyết thống boss": boss bị bắt và quái nở từ trứng boss nhận trait này (cấp 1). */
  traitId: string
  /** % một trận quái hoang là trận boss (biome có thể ghi đè bằng Biome.bossChance). */
  chance: number
  /** bossMultiplier random số nguyên trong [multiplierMin, multiplierMax]; biome có thể ghi đè. */
  multiplierMin: number
  multiplierMax: number
  /** % rơi trứng khi hạ boss. */
  eggChance: number
}

/** Tầng (mục "Tầng và biome"): level và gen quái hoang theo tầng. */
export interface FloorConfig {
  /**
   * Quái thường tầng N có level từ levelPerFloor × (N − 1) + 1 đến levelPerFloor × N − 1;
   * boss tầng cố định level levelPerFloor × N.
   */
  levelPerFloor: number
  /** Khoảng gen quái hoang (và quái trong trứng boss) tầng N nhân geneGrowthPerFloor^(N − 1). */
  geneGrowthPerFloor: number
}

export interface EggConfig {
  /** Số trận thắng quái hoang để trứng nở, random trong [min, max] khi tạo trứng. */
  hatchBattlesMin: number
  hatchBattlesMax: number
  incubation: IncubationConfig
}

/** Ấp trứng có hoàn cảnh (docs/rules/breeding-eggs.md mục "Ấp trứng có hoàn cảnh"). */
export interface IncubationConfig {
  /** Số linh thạch tối đa đặt vào một trứng. */
  maxInfusions: number
  /** Linh thạch cùng hệ với quái trong trứng: mọi gen × (1 + % này), ít nhất +1. */
  genePercentPerInfusion: number
  /** % thêm cho quái trong trứng ra shiny mỗi lần đặt linh thạch (mọi hệ). */
  infusionShinyChance: number
  /** Trận thắng ở linh địa (map có hệ của quái trong trứng): trứng tiến thêm số bước này. */
  spiritLandExtraSteps: number
  /** % đột biến mỗi trận thắng ở linh địa (mọi gen tăng như đột biến breeding). */
  spiritLandMutationChance: number
}

export interface ShinyConfig {
  /** Trait shiny duy nhất; quái shiny ×N mang trait này ở cấp N. */
  traitId: string
  /** % quái hoang ra shiny (biome có thể ghi đè bằng Biome.shinyChance). */
  wildChance: number
}

/** Cân nặng ước lượng (mục "Cân nặng" ở battle.md). */
export interface WeightConfig {
  /** Cân nặng điển hình của race không ghi weightKg. */
  defaultRaceKg: number
  /** Ước lượng = weightKg(race) × (tổng chỉ số gốc / referenceStatTotal) ^ statExponent. */
  referenceStatTotal: number
  statExponent: number
}

/** Kích cỡ quái (docs/rules/monster-size.md): quái lớn suy ra từ cân nặng. */
export interface SizeConfig {
  /** Quái có cân nặng (registries/weight.ts) ≥ số này (kg) là quái lớn. */
  largeWeightKg: number
  /**
   * Chỉ số quái lớn × số này theo từng chỉ số (bước biến hình / HP, như Dynamax); thiếu = 1. Quái lớn
   * chỉ hành động 1 lần mỗi lượt nên bù bằng max HP (mặc định chỉ hp).
   */
  statMultipliers: Partial<Record<StatName, number>>
  /** Sát thương skill của quái lớn × số này (công thức là công² / thủ nên không nhân công). */
  damageMultiplier: number
  /** Số ô đội một quái lớn chiếm (đội có config.partySize ô). */
  largePartySlots: number
}

/** Vị trí ra đòn (docs/rules/hit-locations.md). */
export interface HitLocationConfig {
  /** Bộ phận của quái khi loài / race / nhóm race không ghi `bodyParts`. */
  defaultBodyParts: string[]
  /** Số điểm yếu tối đa mỗi loài / race / nhóm. */
  maxWeakPoints: number
  /** Đòn nhắm trúng điểm yếu: sát thương + % này. */
  weakPointDamagePercent: number
  /** Đòn nhắm trúng điểm yếu: tỉ lệ hiệu ứng khi trúng (hitEffects) × số này. */
  weakPointChanceMultiplier: number
  /** Đòn nhắm trúng điểm yếu: sát thương tính vào việc phá bộ phận × số này. */
  weakPointBreakMultiplier: number
  /**
   * Quái đang bay dùng skill cận chiến lên quái đứng trên đất phải sà xuống: tới hết lượt sau
   * (lượt hiện tại + số này) skill cận chiến của quái đứng trên đất với tới nó.
   */
  swoopTurns: number
  /**
   * Mất thế (như "Down" của Persona / Press Turn của SMT nhưng không thêm / mất lượt): quái bị đánh
   * trúng điểm yếu, quái nhắm bộ phận mà trượt / bị kháng hệ thì mất thế tới hết lượt hiện tại + số
   * này.
   */
  offBalanceTurns: number
  /** Đòn đánh vào quái đang mất thế: + số bậc chí mạng này. */
  offBalanceCritStage: number
  /**
   * AI phe người chơi: bộ phận chưa từng đánh trúng coi là điểm yếu với tỉ lệ % này (100 = lạc quan:
   * thử mọi bộ phận chưa biết một lần để khám phá).
   */
  aiUnknownWeakPercent: number
}

export interface CaptureConfig {
  /** Hệ số HP khi quái hoang đầy máu, tính bằng % (sàn của hệ số HP). */
  hpFloorPercent: number
  /**
   * Bắt trượt (mục "Bắt trượt" ở battle.md): mỗi lần quái thoát khỏi bóng, lần ném sau vào đúng nó
   * (cùng trận / cùng lần gặp ở khu bảo tồn) cộng thẳng số điểm % này vào tỉ lệ cuối.
   */
  pityPercentPerMiss: number
  /**
   * Số lần lắc bóng (Pokémon: 4 lần kiểm, 3 lắc rồi bắt): mỗi lần qua với xác suất tỉ lệ ^ (1 /
   * shakeChecks) nên tổng xác suất vẫn bằng tỉ lệ bắt. 1 = tung một lần.
   */
  shakeChecks: number
  /**
   * Bắt chí mạng (chỉ cần qua một lần kiểm): % = tỉ lệ bắt × hệ số theo % loài đã sở hữu trong Dex
   * (mốc cao nhất đạt được, chưa đạt = 0) / criticalDivisor (như Pokémon).
   */
  criticalTiers: CriticalTier[]
  criticalDivisor: number
}

/** Mọi tỉ lệ tính bằng % (0–100). */
export interface BattleConfig {
  /** Hệ số K trong công thức sát thương. */
  damageFactor: number
  /**
   * Skill quái dùng khi không còn skill nào dùng được (Struggle; pokemon-moves.md); bỏ trống = không
   * có (quái đó chỉ phòng thủ / khiêu khích).
   */
  struggleSkillId?: string
  /** Hệ số khi skill cùng hệ với quái dùng nó. */
  stabMultiplier: number
  /** % chí mạng ở bậc chí mạng 0 (Pokémon thế hệ 6: 6,25%). */
  critChance: number
  /**
   * % chí mạng ở bậc 1, 2, 3... (Pokémon: 12,5 / 50 / 100); bậc vượt danh sách lấy mục cuối. Bậc =
   * critStage của skill + Focus Energy (VolatileState.focusStages) + trait critStage.
   */
  critStageChances: number[]
  critMultiplier: number
  /** Dao động sát thương ngẫu nhiên trong [randomMin, randomMax]. */
  randomMin: number
  randomMax: number
  /** Hệ số sát thương của skill đánh cả hai địch. */
  spreadMultiplier: number
  fleeChance: number
  /** Trọng số số đòn theo khoảng hits (đánh nhiều lần); khoảng không có ở đây thì chia đều. */
  hitCountWeights: HitCountWeights[]
  /** Lệnh phòng thủ / khiêu khích (Defend / Provoke của Siralim). */
  defend: GuardCommandConfig
  provoke: GuardCommandConfig
  /**
   * Giới hạn hành động do trait / minion gây ra (đánh thêm, phản công, dùng spell...), chống lặp
   * vô hạn: tối đa `maxDepth` tầng lồng nhau, tối đa `maxActions` hành động phụ cho mỗi hành động
   * gốc; hiệu ứng "lặp liên tục theo tỉ lệ" tối đa `maxRepeats` lần.
   */
  traitChain: { maxDepth: number; maxActions: number; maxRepeats: number }
  /**
   * Quy đổi "+X% chỉ số trong trận" của trait Siralim sang bậc trận: X dưới stagePercentSteps[0]
   * = 1 bậc, dưới stagePercentSteps[1] = 2 bậc..., từ phần tử cuối trở lên = số phần tử + 1 bậc.
   */
  stagePercentSteps: number[]
}

/** Lệnh phòng thủ / khiêu khích: priority và % sát thương nhận vào thay đổi (âm = giảm). */
export interface GuardCommandConfig {
  priority: number
  damageTakenPercent: number
}

/** Trạng thái bất thường (mục "Trạng thái bất thường" ở battle-statuses.md). */
export interface StatusConfig {
  /**
   * Hệ số sát thương trạng thái lên boss hoang (quái địch của trận boss). Boss đã bắt về nhận
   * sát thương trạng thái bình thường.
   */
  bossDamageMultiplier: number
}

/** Môi trường trong trận (mục "Môi trường" ở battle-environment.md). */
export interface FieldConfig {
  /** Môi trường mặc định của từng lớp toàn sân (trời quang, không địa hình): không có hook. */
  defaults: Record<GlobalFieldLayer, string>
  /** Thời tiết nắng: skill của quái có Mega Sol coi như đang có thời tiết này. */
  sunWeatherId: string
}

/** weights[i] là trọng số của min + i đòn (đủ max − min + 1 phần tử). */
export interface HitCountWeights {
  min: number
  max: number
  weights: number[]
}

/**
 * Trọng số chấm điểm của AI trận đấu (mục "AI trận đấu" ở battle.md). Điểm một lựa chọn tính
 * theo tỉ lệ máu nên không phụ thuộc độ lớn chỉ số; AI tung lựa chọn theo trọng số = điểm.
 */
export interface AiConfig {
  /** Điểm thêm (× accuracy) khi sát thương dự kiến đủ hạ mục tiêu. */
  koBonus: number
  /** Điểm thêm × (1 − HP còn / max HP) của mục tiêu: ưu tiên địch máu thấp. */
  lowHpTargetWeight: number
  /** Điểm mỗi bậc trận thực đổi được (buff phe mình, debuff phe địch). */
  stageValuePerStep: number
  /** Điểm × (máu hồi dự kiến / max HP) của hiệu ứng hồi máu (hút máu). */
  healWeight: number
  /**
   * Điểm của việc gây từng trạng thái lên địch (× chance%), theo id trạng thái; mọi trạng thái
   * phải có trọng số.
   */
  statusWeights: Record<string, number>
  /** Điểm mỗi điểm lợi (phe mình − phe địch) khi đặt môi trường (hiệu ứng setField). */
  fieldWeight: number
  /**
   * Điểm của lệnh phòng thủ / khiêu khích: weight × (1 − HP còn / max HP) của quái ra lệnh (máu
   * càng thấp càng muốn phòng thủ).
   */
  defendWeight: number
  provokeWeight: number
  /** Điểm của một hiệu ứng spell thêm minion (mục "Spell Siralim"). */
  minionWeight: number
  /** Điểm của mỗi hiệu ứng khác của spell Siralim lên một mục tiêu (chấm thô, không mô phỏng). */
  spellEffectWeight: number
  /**
   * Lợi tối thiểu (cùng thang điểm lệnh) để AI phe người chơi biến hình Dynamax / Tera (Mega luôn
   * dùng ngay vì không tốn gì).
   */
  transformMinGain: number
  /** Điểm thêm của hiệu ứng hồi sinh (ngoài phần máu hồi × healWeight). */
  reviveBonus: number
  /** Điểm tối thiểu để AI dùng kỹ năng ngự thú sư (cùng thang điểm lệnh). */
  tamerSkillMinScore: number
  /** Điểm mỗi lượt chờ (hold) được giảm (hiệu ứng reduceHold, kiểu Tĩnh Tâm Chú). */
  holdTurnWeight: number
}

/** Một bậc của bảng power chiêu Max: skill gốc có power < below thì chiêu Max có `power`. */
export interface MaxPowerStep {
  below: number
  power: number
}

/** Bảng power chiêu Max: các bậc tăng dần theo `below`, power gốc từ bậc cuối trở lên = `top`. */
export interface MaxPowerTable {
  steps: MaxPowerStep[]
  top: number
}

/** Z-Move (docs/rules/z-moves.md); số như Pokémon. */
export interface ZMoveConfig {
  /** Vật phẩm chìa khóa cần để dùng Z-Move (Vòng Z). */
  keyItemId: string
  /** Power Z-Move theo power skill gốc (skill không ghi zPower). */
  powerTable: MaxPowerTable
  /** Skill đánh nhiều lần với số đòn thay đổi: power × hệ số này rồi mới tra bảng (Pokémon: 3). */
  variableHitsPowerFactor: number
  /** % sát thương Z-Move gây sát thương xuyên qua hiệu ứng protect (Max Guard...). */
  protectDamagePercent: number
  /** Hạ boss: % rơi một Z-Crystal (crystal loài nếu loài boss có, không thì crystal hệ của boss). */
  crystalDropChance: number
}

/** Biến hình trong trận (mục "Biến hình trong trận" ở transformation.md). */
export interface TransformConfig {
  /**
   * Vật phẩm chìa khóa cần cho từng loại biến hình (Mega: Vòng Mega, trừ đá auto kiểu Primal). Loại
   * cần vật phẩm thì quái hoang / boss không dùng được (không có túi đồ); loại không ghi thì ai cũng
   * dùng được. Nhận khi lần đầu thắng đạo quán (config.trainers.gym.keyItemFloors).
   */
  keyItems: Partial<Record<TransformKind, string>>
  mega: {
    /** % boss thuộc loài có dạng Mega rơi đá của một dạng. */
    stoneDropChance: number
  }
  dynamax: {
    /** Số cuối lượt Dynamax kéo dài (tính cả lượt biến). */
    turns: number
    /** Max HP × (hpMultiplierBase + hpMultiplierPerLevel × cấp Dynamax). */
    hpMultiplierBase: number
    hpMultiplierPerLevel: number
    /** Cấp Dynamax tối đa (Dynamax Candy). */
    maxLevel: number
    /** Bảng power chiêu Max thường và bảng thấp cho các hệ `lowPowerElementIds`. */
    powerTable: MaxPowerTable
    lowPowerTable: MaxPowerTable
    lowPowerElementIds: string[]
    /** % boss Gigantamax-được có Gmax Factor. */
    bossGmaxFactorChance: number
  }
  tera: {
    /** STAB khi hệ Tera trùng hệ gốc (thay stabMultiplier). */
    sameStabMultiplier: number
    /** Skill cùng hệ Tera power nhỏ hơn mức này (một đòn, priority ≤ 0) thì power thành mức này. */
    minPower: number
    /** Stellar: hệ số lần đầu mỗi hệ: hệ gốc / hệ khác. */
    stellarOriginalMultiplier: number
    stellarOtherMultiplier: number
    /** Tera Blast khi Stellar: power, khắc chế lên quái đang Tera, tự hạ bậc sau chiêu. */
    stellarBlastPower: number
    stellarBlastEffectiveness: number
    stellarBlastSelfStages: { stat: NonHpStatName; delta: number }[]
    /** Số Mảnh Tera của hệ đích để đổi hệ Tera. */
    changeCost: number
    /** Boss: % lấy hệ Tera trong hệ của chính nó (còn lại random mọi hệ). */
    bossOwnElementChance: number
    /** Boss từ tầng này có `stellarChance`% ra Stellar. */
    stellarFromFloor: number
    stellarChance: number
    /** Hạ boss: % rơi Mảnh Tera theo hệ Tera của boss, số lượng random [min, max]. */
    shardDrop: { chance: number; min: number; max: number }
    /** Skill mọi quái học được ở NPC học lại skill khi có Tera Orb (Tera Blast). */
    relearnSkillIds: string[]
  }
  /** Z-Move (docs/rules/z-moves.md). */
  zMove: ZMoveConfig
  /** Song thú hợp thể (docs/rules/battle-merge.md). */
  merge: {
    /** Số cuối lượt hợp thể kéo dài (tính cả lượt hợp thể). */
    turns: number
    /** Mỗi chỉ số (trừ HP) = chỉ số cao hơn + % này của chỉ số thấp hơn. */
    lowerSharePercent: number
    /** Thân mật tối thiểu của mỗi quái (phe người chơi). */
    minAffinity: number
  }
  boss: {
    /** % trận boss có biến hình = min(100, base + perFloor × tầng). */
    base: number
    perFloor: number
    /** Trọng số chọn loại trong các loại boss dùng được. */
    weights: Record<TransformKind, number>
  }
  /** Đồ rơi thêm khi hạ boss (Max Soup, Dynamax Candy...), như bảng bossDrops của biome. */
  bossDrops: { itemId: string; chance: number }[]
}

export interface RewardConfig {
  /** EXP mỗi quái địch = expFactor × level² (sau hệ số shiny / boss), tối thiểu minExp. */
  expFactor: number
  /** EXP tối thiểu mỗi quái địch, để quái level thấp (expFactor × level² < 1) vẫn cho EXP. */
  minExp: number
  /** Tiền mỗi quái địch = moneyPerLevel × level. */
  moneyPerLevel: number
  /** % tiền bị mất khi thua trận. */
  losePenaltyPercent: number
}

export interface WildConfig {
  geneMin: number
  geneMax: number
  /** Trọng số số trait của quái hoang: phần tử i = trọng số để có i trait. */
  traitCountWeights: number[]
  /**
   * Trọng số theo loại trait cho mỗi ô trait của quái hoang (tổng của cả loại, chia đều cho các
   * trait trong loại); loại thiếu hoặc 0 thì không tung. Chỉ loại `wildRollable`.
   */
  traitKindWeights: Partial<Record<TraitKind, number>>
}
