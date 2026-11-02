// Quái: đúng những gì được lưu vào save (nguyên liệu, không có chỉ số đã tính).

import type { MonsterAssignment } from './expeditions'
import type { MonsterAilment, WorkStats } from './dwelling'
import type { AbilitySlot, TraitInstance } from './content'
import type { EquippedItem } from './state'
import type { Decimal } from '../shared'
import type { MonsterHistory } from './history'
import type { Imprint } from './imprint'
import type { SkillMastery } from './mastery'
import type { BigStats, Stats } from './stats'
import type { BattleForm, BattleTransform } from './transform'

// ---------- Quái (đúng những gì được lưu vào save) ----------

/** 'none' chỉ dành cho quái có loài gốc không giới tính (mục "Loài không giới tính"). */
export type Gender = 'male' | 'female' | 'none'

/** Giới tính tung được cho loài có giới tính. */
export const SEXED_GENDERS: readonly Gender[] = ['male', 'female']

export const GENDERS: readonly Gender[] = [...SEXED_GENDERS, 'none']

/** Một trạng thái (buff / debuff) đang có trên quái (mục "Trạng thái bất thường" ở battle-statuses.md). */
export interface StatusInstance {
  statusId: string
  /**
   * Số lần cuối lượt (khi quái ở trên sân) còn lại, ≥ 1; về 0 thì hết trạng thái. null = không
   * hết hạn theo lượt (trạng thái không có duration, hoặc bị trait làm "kéo dài mãi").
   */
  turnsLeft: number | null
  /** Sức mạnh (%) của trạng thái, nhân vào sát thương / hệ số của nó; bỏ trống = 100. */
  potency?: number
  /** Lượng còn lại của trạng thái theo lượng (Barrier: sát thương còn hút được; Inverted). */
  amount?: Decimal
  /** Số cuối lượt đã qua kể từ khi dính (Frozen: tỉ lệ tan gấp đôi sau mỗi lượt); bỏ trống = 0. */
  turnsElapsed?: number
  /** Quái gây ra, với trạng thái mất khi quái đó rời sân (endsWhenSourceLeaves: Bind, Mean Look). */
  sourceId?: string
}

/**
 * Chiến thuật khi tự đánh (docs/rules/auto-battle.md): bộ trọng số AI; `manual` = theo lệnh (không tự
 * đánh, chờ người chơi).
 */
export const TACTICS = ['balanced', 'allOut', 'cautious', 'support', 'manual'] as const

export type Tactic = (typeof TACTICS)[number]

/** Trạng thái hóa hình của quái (docs/rules/human-form.md). */
export const HUMAN_FORM_STATES = ['locked', 'beast', 'human'] as const

export type HumanFormState = (typeof HUMAN_FORM_STATES)[number]

/**
 * Linh dịch, như Pokérus (docs/rules/spirit-virus.md): đang nhiễm (còn `daysLeft` ngày, chỉ đếm khi
 * ở đội) hoặc đã khỏi thành miễn dịch vĩnh viễn.
 */
export type SpiritVirus = { state: 'infected'; daysLeft: number } | { state: 'immune' }

export interface Monster {
  /** Định danh duy nhất trong save. */
  id: string
  /** Biệt danh người chơi đặt; null = hiển thị tên loài. */
  nickname: string | null
  /** Khóa: không thể làm mất quái bằng action của người chơi (docs/rules/roster.md mục "Khóa"). */
  locked: boolean
  /** Yêu thích: chỉ để lọc / sắp xếp. */
  favorite: boolean
  /** Loài hiện tại; quái đã fuse dùng BalanceConfig.fusedSpeciesId. */
  speciesId: string
  /** Loài cung cấp chỉ số gốc. Quái thường: bằng speciesId. Quái fuse: loài của quái gốc. */
  baseSpeciesId: string
  level: number
  exp: Decimal
  gender: Gender
  /** Chỉ số tiềm năng, không trần, tối thiểu 1. */
  genes: BigStats
  /** Chỉ số cộng thêm từ fuse, không trần. */
  fusingBonusStats: BigStats
  traits: TraitInstance[]
  /** 0 = thường, 1 = shiny, 2 = shiny ×2... */
  shinyStacks: number
  /**
   * Số stack hiến tế (docs/rules/sacrifice.md), nguyên ≥ 0, không trần: mỗi stack + % mọi chỉ số.
   * Fuse cộng stack của quái phụ; breeding không truyền.
   */
  sacrificeStacks: number
  /**
   * Số lần luân hồi (docs/rules/rebirth.md), nguyên ≥ 0, không trần: mỗi lần + % mọi chỉ số và
   * điểm thiên phú. Fuse cộng ½ của quái phụ (làm tròn xuống); breeding không truyền.
   */
  rebirths: number
  /**
   * Tổng cấy ghép của từng chỉ số (docs/rules/implant.md): cộng cùng chỗ với gen (không nhân
   * geneWeight), được phép âm (cấy thất bại trừ). Breeding không truyền.
   */
  implantBonusStats: BigStats
  /**
   * Cấp hiệu ứng cấy theo id hiệu ứng (serumEffects.json): nguyên khác 0; dương = hiệu ứng (hooks ×
   * cấp), âm = hiệu ứng ngược (failHooks × |cấp|). Breeding không truyền.
   */
  implantEffects: Record<string, number>
  /** Số lần đã cấy (gộp mọi chỉ số, cả thành công lẫn thất bại), nguyên ≥ 0. */
  implantAttempts: number
  /** Số lần cấy thất bại, nguyên ≥ 0, không bao giờ reset; tới implant.maxFails thì mất quái. */
  implantFails: number
  /** Trait làm việc (id trong workTraits.json, không lặp; docs/rules/dwelling.md). */
  workTraits: string[]
  /**
   * Điểm sách làm việc theo loại việc: % chỉ số gốc trung bình của loài cộng thêm vào chỉ số làm việc
   * (nguyên ≥ 0, không trần).
   */
  workPoints: WorkStats
  /** Cấp hồn tinh tốc độ làm việc (Tượng Lực, docs/rules/soul-levels.md), nguyên ≥ 0. */
  workSoulLevel: number
  /** No và tinh thần (như Hunger / SAN của Palworld), trong [0, config.dwelling.needs.max]. */
  fullness: number
  sanity: number
  /** Bệnh / chấn thương đang mắc (docs/rules/dwelling.md mục "Bệnh và chấn thương"); null = khỏe. */
  ailment: MonsterAilment | null
  /** 1 với quái thường, 2–5 với boss bắt được. */
  bossMultiplier: number
  fused: boolean
  /** Các loài đã fuse vào quái này. */
  lineage: string[]
  raceId: string
  elementIds: string[]
  /** Skill đang biết, 1 đến maxSkills. */
  skillIds: string[]
  /** Lượng máu đã mất. HP hiện tại = max(0, maxHp − damageTaken); gục khi ≤ 0. */
  damageTaken: Decimal
  /** Số ô trait của quái này, trong [config.traitSlots.initial, config.traitSlots.max]. */
  traitSlots: number
  /** Skill chờ học (đủ ô skill lúc được học); người chơi học hoặc bỏ qua. */
  pendingSkillIds: string[]
  /**
   * Skill ngoài learnset quái từng được dạy (sách kỹ năng, sau này kế thừa khi fuse): NPC học lại
   * skill dạy lại được. Không trùng, theo thứ tự học (docs/rules/skill-books.md).
   */
  extraSkillIds: string[]
  /** Các loài có thể tiến hóa thành, chờ người chơi chọn (khi nhiều hướng level cùng đủ). */
  pendingEvolutionIds: string[]
  /**
   * Trạng thái đang có (mỗi id tối đa một lần); còn sau trận (trừ trạng thái `battleOnly`), gục
   * thì mất hết.
   */
  statuses: StatusInstance[]
  /**
   * Món đang lắp (trang bị, đồ cầm), tối đa số ô của người chơi (equipmentSlotCount); đi theo quái
   * khi vào kho. Quái hoang không mang gì, boss mang 1 món unique.
   */
  equipment: EquippedItem[]
  /**
   * Max HP tăng / giảm trong trận (trait, minion kiểu Famine); chỉ có trong trận, mất khi hết trận.
   * Lưu trên quái (không ở trạng thái tạm) vì max HP phải như nhau ở mọi nơi tính HP.
   */
  battleMaxHpDelta?: Decimal
  /**
   * HP vô hạn (boss thế giới, docs/rules/world-boss.md): mất máu không trừ HP, không gục; sát thương
   * vẫn ghi vào bản ghi trận. Chỉ có trên quái địch trong trận.
   */
  endlessHp?: true
  /**
   * Hệ Tera (id hệ hoặc STELLAR; mục "Tera" ở transformation.md): random theo hệ của quái khi sinh,
   * giữ khi tiến hóa / fuse, đổi bằng Mảnh Tera ở thị trấn.
   */
  teraElementId: string
  /** Gmax Factor: Dynamax thành Gigantamax nếu loài có dạng gmax (bật / tắt bằng Max Soup). */
  gmaxFactor: boolean
  /** Cấp Dynamax 0–config.transform.dynamax.maxLevel: max HP khi Dynamax tăng theo cấp. */
  dynamaxLevel: number
  /** Biến hình đang có trong trận (chỉ có trong trận, mất khi hết trận). */
  battleTransform?: BattleTransform
  /**
   * Dạng chỉ có trong trận do ability / chiêu (Zen Mode, Stance Change, Forecast...; mục "Dạng trong
   * trận" ở docs/rules/battle-forms.md): độc lập với biến hình, mất khi hết trận.
   */
  battleForm?: BattleForm
  /**
   * Tuổi tính bằng ngày (mục "Tuổi và thọ nguyên" ở lifespan.md): nguyên liệu như exp, tăng mỗi
   * ngày game khi `aging`; trứng chưa nở không tăng. Lưu trên quái (không lưu ngày sinh) để chỉ số
   * theo tuổi tính được từ chính quái, như battleMaxHpDelta.
   */
  ageDays: number
  /**
   * Quái có già đi và chịu hiệu ứng tuổi không: luôn bằng GameState.options.lifespanEnabled (đổi
   * cùng lúc khi bật / tắt thọ nguyên).
   */
  aging: boolean
  /** Level cao nhất từng đạt (chỉ tăng): thọ nguyên tính theo số này, không theo level hiện tại. */
  maxLevelReached: number
  /** Số năm thọ nguyên cộng thêm (Thọ Nguyên Đan, hấp thu khi fuse...), ≥ 0. */
  lifespanBonusYears: Decimal
  /**
   * Số lần đã dùng theo id vật phẩm (chỉ vật phẩm giảm hiệu quả khi dùng nhiều, kiểu Thọ Nguyên
   * Đan); mỗi số ≥ 1.
   */
  itemUseCounts: Record<string, number>
  /**
   * Lý lịch (monster-history.md): có từ lúc quái về tay người chơi (khởi đầu, bắt, nhận
   * trứng); quái hoang chưa bắt là null.
   */
  history: MonsterHistory | null
  /**
   * Cảnh giới khế ước (docs/rules/tamer.md): cộng hưởng chỉ số và thọ nguyên theo số này. null =
   * chưa khế ước (quái hoang, boss chưa bắt). Lúc về tay người chơi nhận cảnh giới của ngự thú sư,
   * mỗi lần đột phá thành công thì nâng lên cảnh giới mới (không bao giờ hạ); quái có thể cao hơn
   * cảnh giới hiện tại của ngự thú sư (phi thăng reset ngự thú sư, quái vẫn giữ).
   */
  contractRealm: number | null
  /**
   * Số ngày đã khế ước liên tục (tâm linh tương thông, docs/rules/tamer.md mục "Khế ước"): +1 mỗi
   * ngày khi đã khế ước và ở đội / kho; về 0 khi giải trừ. Chưa khế ước luôn 0.
   */
  contractDays: number
  /**
   * Độ thân mật 0–config.affinity.max (docs/rules/affinity.md): hiệu ứng theo mức (affinityTiers.json,
   * nguồn hook "affinity"). Quái hoang 0; nhận giá trị khởi đầu lúc về tay người chơi.
   */
  affinity: number
  /**
   * Dưỡng dục (docs/rules/imprinting.md): null = chưa từng dưỡng dục (quái không nở từ trứng, quái
   * còn trong trứng). Bắt đầu lúc nở, mỗi quái một lần trong đời.
   */
  imprint: Imprint | null
  /**
   * Số boss đã hạ (điều kiện tiến hóa `bossDefeats`): tăng 1 mỗi trận boss thắng mà quái có ra
   * sân. Quái mới 0; fuse giữ của quái gốc.
   */
  bossDefeats: number
  /**
   * Thức tỉnh (docs/rules/awakening.md): tầng thức tỉnh đã đạt (nguyên ≥ 0, không trần), số lần độ
   * kiếp thất bại liên tiếp ở tầng đang thử (0–config.awakening.maxFailures), số trận thắng còn bị
   * trọng thương (nguyên ≥ 0). Quái mới 0; fuse giữ của quái gốc; con breeding 0.
   */
  awakening: number
  tribulationFailures: number
  injuryBattlesLeft: number
  /**
   * Hóa hình (docs/rules/human-form.md): chưa hóa hình / đã hóa hình, đang ở bản thể / đang ở nhân
   * hình. Quái mới, con breeding `locked`; fuse giữ của quái gốc; tiến hóa giữ.
   */
  humanForm: HumanFormState
  /**
   * Việc đang làm (docs/rules/expeditions.md): null = rảnh. Có việc thì bị khóa (không vào đội,
   * không fuse / breed / thả, không dùng kẹo EXP).
   */
  assignment: MonsterAssignment | null
  /** Chiến thuật khi AI chọn lệnh (tự đánh; docs/rules/auto-battle.md). Quái mới `balanced`. */
  tactic: Tactic
  /**
   * Thuần thục theo id skill (docs/rules/skill-mastery.md): skill chưa có mục là cấp 1, exp 0. Quên
   * skill vẫn giữ mục (học lại dùng tiếp); tiến hóa, fuse (quái gốc) giữ; con breeding không thừa hưởng.
   */
  skillMastery: Record<string, SkillMastery>
  /**
   * Tính cách (docs/rules/natures.md): id trong natures.json. Random đều khi sinh; con breeding
   * random hoặc nhận của bố / mẹ lắp Bất Biến Thạch; fuse (quái gốc), tiến hóa giữ; đổi bằng Bạc Hà.
   */
  natureId: string
  /**
   * Cấp hồn tinh theo chỉ số (docs/rules/soul-levels.md): nguyên ≥ 0, không trần, mỗi cấp +% chỉ số
   * đó (nguồn % `soulLevel`). Quái mới, con breeding 0; tiến hóa, fuse (quái gốc) giữ.
   */
  soulLevels: Stats
  /**
   * Điểm nỗ lực theo chỉ số, như EV của Pokémon (docs/rules/effort-values.md): nguyên ≥ 0, nhận khi
   * thắng trận theo loài bị hạ / bị bắt, trần mỗi chỉ số và trần tổng ở config.effort. Quái mới, con
   * breeding 0; tiến hóa, fuse (quái gốc) giữ.
   */
  effortValues: Stats
  /**
   * Ô ability (docs/rules/abilities.md): ability thật tính theo loài hiện tại (dạng Mega khi đang
   * Mega). Quái hoang tung (ô ẩn theo config.abilities), con breeding theo mẹ; tiến hóa, fuse giữ.
   */
  abilitySlot: AbilitySlot
  /**
   * Bản mệnh thú của ngự thú sư (docs/rules/tamer.md mục "Bản mệnh thú"): tối đa một quái sở hữu.
   * Lưu trên quái (như contractRealm) vì chỉ số và thọ nguyên tính chỉ từ (data, monster). Quái mới,
   * con breeding, quái hoang false; tiến hóa, fuse (quái gốc), thức tỉnh giữ.
   */
  bond: boolean
  /**
   * Thiên phú (docs/rules/monster-talents.md): id nút → cấp đã nâng (nguyên ≥ 1; nút chưa nâng không
   * có mục). Điểm không lưu: suy từ maxLevelReached và awakening trừ phần đã dùng. Quái mới, con
   * breeding, quái hoang rỗng; tiến hóa, fuse (quái gốc) giữ.
   */
  talentRanks: Record<string, number>
  /**
   * Linh dịch (docs/rules/spirit-virus.md): null = chưa từng nhiễm. Quái mới, con breeding, quái
   * hoang null; tiến hóa giữ; fuse giữ trạng thái tốt hơn của hai quái.
   */
  spiritVirus: SpiritVirus | null
  /**
   * Độ thuần huyết mạch theo nhóm (docs/rules/bloodline.md): số trong (0, 100], tối đa 1 chữ số thập
   * phân, không lặp nhóm, chỉ nhóm loài gốc là thành viên, thứ tự theo bloodlines.json. Nhóm 0 không
   * ghi. Quái hoang tung; con breeding theo bố mẹ; fuse cộng một phần của quái phụ; tiến hóa giữ (bỏ
   * nhóm loài mới không thuộc).
   */
  bloodlines: BloodlinePurity[]
  /**
   * Âm / Dương (docs/rules/polarity.md): null = không cực. Có cực thì kèm trait cực tính (loại
   * `polarity`, trong pool của cực ở config.polarity.traitIds). Đổi bằng đá chuyển cực; quái hoang /
   * boss từ tầng mở khóa có tỉ lệ có sẵn; con breeding theo bố mẹ cùng cực; fuse (quái gốc), tiến
   * hóa giữ.
   */
  polarity: MonsterPolarity | null
}

/** Hai cực Âm / Dương (docs/rules/polarity.md). */
export const POLES = ['yin', 'yang'] as const

export type Pole = (typeof POLES)[number]

/** Cực của quái kèm trait cực tính (luôn cấp 1, không chiếm ô). */
export interface MonsterPolarity {
  pole: Pole
  traitId: string
}

/** Độ thuần của một nhóm huyết mạch trên quái. */
export interface BloodlinePurity {
  groupId: string
  purity: number
}
