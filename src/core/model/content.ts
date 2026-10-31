// Nội dung game đọc từ JSON: hệ, trạng thái, race, loài, trait, skill, vật phẩm, vùng; GameData.
// Không có chữ hiển thị: tên tra theo id trong `text` (model/text.ts, mục "Đa ngôn ngữ").

import type { ExpeditionDef } from './expeditions'
import type { TrainerClass } from './trainers'
import type { TrialRuleDef } from './trials'
import type { RawZoneDef, ZoneDef } from './zones'
import type { SerumEffectDef } from './implant'
import type { EventDef, EventModifierDef } from './events'
import type { QuestTemplate } from './quests'
import type { RecipeDef } from './alchemy'
import type { BiomeGathering } from './gathering'
import type { BalanceConfig } from './config'
import type { SkillStyleOverrides } from './moveStyles'
import type { PartialStats, StatName, Stats } from './stats'
import type { NonHpStat } from './state'
import type { TalentBranchDef, TalentNodeDef } from './talents'
import type { TamerRealmDef, TamerSkill } from './tamer'
import type { TextData } from './text'
import type { ActiveTime, GameOptionFlag } from './time'

// ---------- Hệ nguyên tố ----------

export interface ElementDef {
  id: string
  /** Hệ số sát thương khi hệ này đánh vào hệ phòng thủ; hệ không liệt kê = 1. */
  effectiveness: Record<string, number>
  /** Trạng thái quái mang hệ này không bị dính (ví dụ hệ lửa miễn bỏng); bỏ trống = không có. */
  statusImmunities?: string[]
  /** Quái mang hệ này không đứng trên mặt đất (hệ Bay): địa hình không tác dụng (mục "Môi trường"). */
  airborne?: true
  /** Không bị giữ chân (Bind, Mean Look, Shadow Tag), như hệ Ma của Pokémon. */
  trapImmune?: true
  /** Miễn skill mang các cờ chiêu này (hệ Cỏ miễn chiêu bột: Spore, Sleep Powder...), như Pokémon. */
  immuneMoveFlags?: MoveFlag[]
}

// ---------- Môi trường trong trận ----------

/**
 * Lớp môi trường (mục "Môi trường" ở battle-environment.md): thời tiết, địa hình (toàn sân, tối đa một cái
 * mỗi lớp); hiệu ứng theo phe (side); hiệu ứng toàn sân đặc biệt (room: toàn sân, nhiều cái cùng
 * lúc, kiểu Trick Room).
 */
export const FIELD_LAYERS = ['weather', 'terrain', 'side', 'room'] as const

export type FieldLayer = (typeof FIELD_LAYERS)[number]

/** Lớp toàn sân có đúng một môi trường (thời tiết, địa hình); room không thuộc nhóm này. */
export const GLOBAL_FIELD_LAYERS = ['weather', 'terrain'] as const satisfies readonly FieldLayer[]

/** Lớp toàn sân có đúng một môi trường tại mỗi thời điểm. */
export type GlobalFieldLayer = (typeof GLOBAL_FIELD_LAYERS)[number]

/** Môi trường (fieldEffects.json); hành vi viết bằng hook trong registries/fieldHooks.ts. */
export interface FieldEffectDef {
  id: string
  layer: FieldLayer
  /** Rỗng với môi trường mặc định (trời quang, không địa hình). */
  hooks: EffectDef[]
  /**
   * Số lượt khi skill / trait đặt môi trường này mà không ghi `turns`. Lớp side bỏ trống = kéo dài
   * cả trận (bẫy).
   */
  duration?: number
  /** Chỉ lớp side: số tầng tối đa khi đặt lại (bẫy cộng tầng, kiểu Spikes); bỏ trống = 1. */
  maxLayers?: number
  /**
   * Chỉ lớp room: đặt lại khi đang có. toggle (mặc định): tắt room (kiểu Trick Room); refresh: làm
   * mới thời hạn (kiểu Mud Sport).
   */
  onReuse?: RoomReuse
  /**
   * Chỉ lớp toàn sân: môi trường này còn tính là các môi trường cùng lớp này ở mọi điều kiện theo
   * môi trường (trait, fieldModifiers, nạp chiêu...); Heavy Rain tính là mưa. Hook không kế thừa.
   */
  actsAs?: string[]
  /**
   * Chỉ lớp toàn sân, thời tiết nguyên thủy (Primordial Sea, Desolate Land, Delta Stream): không có
   * `duration`, kéo dài tới khi không còn quái nào trên sân mang trait đặt nó; môi trường thường
   * không thay được (chỉ môi trường primal khác thay được).
   */
  primal?: true
}

export const ROOM_REUSES = ['toggle', 'refresh'] as const

export type RoomReuse = (typeof ROOM_REUSES)[number]

/** Phe nhận hiệu ứng theo phe, tính từ quái đặt: phe mình hoặc phe địch. */
export type SideFieldTarget = 'own' | 'foe'

/** Đặt một hiệu ứng theo phe (hiệu ứng skill setSideField). */
export interface SideFieldPlacement {
  side: SideFieldTarget
  fieldId: string
  /** Bỏ trống = `duration` của môi trường (không có thì cả trận). */
  turns?: number
  /** Chỉ đặt được khi môi trường toàn sân này đang có (kiểu Aurora Veil cần tuyết). */
  requiresFieldId?: string
}

/** Đặt / tắt một hiệu ứng toàn sân đặc biệt (hiệu ứng skill setRoom). */
export interface RoomPlacement {
  fieldId: string
  /** Bỏ trống = `duration` của môi trường. */
  turns?: number
}

/** Đặt một môi trường (hiệu ứng skill setField, trait setFieldOnEntry). */
export interface FieldPlacement {
  layer: GlobalFieldLayer
  fieldId: string
  /** Bỏ trống = `duration` của môi trường. */
  turns?: number
}

// ---------- Trạng thái bất thường ----------

/** Số lượt của trạng thái khi bị dính: tung đều trong [min, max] (số nguyên, 1 ≤ min ≤ max). */
export interface StatusDuration {
  min: number
  max: number
}

/**
 * Loại trạng thái (mục "Buff và debuff" ở battle.md): debuff là trạng thái bất thường (chữa, miễn,
 * Thuốc giải chỉ áp cho debuff), buff là trạng thái có lợi.
 */
export const STATUS_KINDS = ['debuff', 'buff'] as const

export type StatusKind = (typeof STATUS_KINDS)[number]

/** Trạng thái (statuses.json); hành vi viết bằng hook trong registries/statusHooks.ts. */
export interface StatusDef {
  id: string
  kind: StatusKind
  /** Bỏ trống = không hết hạn theo lượt (kiểu Barrier, Shelled, Frozen: hết theo điều kiện riêng). */
  duration?: StatusDuration
  hooks: EffectDef[]
  /**
   * Hook trait (registries/traitHooks.ts) quái mang trạng thái được hưởng như trait của chính nó,
   * hệ số = potency / 100 (kiểu Berserk: +50% sát thương).
   */
  traitHooks?: TraitHookDef[]
  /**
   * Các trạng thái cùng nhóm không cùng có trên một quái (độc / độc nặng): đang có một trạng thái
   * trong nhóm thì không dính trạng thái khác của nhóm.
   */
  exclusiveGroup?: string
  /**
   * Dính trạng thái khác cùng nhóm thì trạng thái cũ bị thay thế thay vì chặn trạng thái mới
   * (kiểu Scorned / Silenced của Siralim).
   */
  overwritesGroup?: true
  /** Mất khi hết trận (trạng thái của Siralim); bỏ trống = còn sau trận như trạng thái Pokémon. */
  battleOnly?: true
  /** Mất khi quái rời sân (rút về, gục, bị bắt), như trạng thái tạm của Pokémon (lú lẫn). */
  endsOnLeave?: true
  /** Bộ đếm lượt đã qua (turnsElapsed) về 0 khi quái rời sân (độc nặng của Pokémon). */
  resetsOnLeave?: true
  /** Mất khi quái gây ra rời sân (Bind, Wrap, Mean Look, Block: như Pokémon). */
  endsWhenSourceLeaves?: true
  /** Món lắp của quái mang trạng thái không có tác dụng (Embargo). */
  disablesItems?: true
  /** Không dùng được skill vừa dùng ở lượt trước (Torment). */
  blocksRepeatSkill?: true
  /** Quái phe địch không dùng được skill mà quái mang trạng thái biết (Imprison). */
  imprisons?: true
  /** Không được hồi máu (Heal Block, Psychic Noise). */
  blocksHealing?: true
  /**
   * Máu mất cuối lượt vì trạng thái này hồi cho quái gây ra nếu nó còn trên sân (Leech Seed); quái
   * mang Liquid Ooze thì quái gây ra mất lượng đó.
   */
  drainsToSource?: true
  /** Trạng thái đánh dấu, không hook: skill khác đọc (Minimize: `alwaysHitsVsStatusIds`, ×2 đòn đạp). */
  marker?: true
  /** Không dùng được skill âm thanh (Throat Chop). */
  blocksSoundSkills?: true
  /** Hết hạn thì dính trạng thái này (Yawn → ngủ). */
  onEndStatusId?: string
  /** Mất khi quái không còn trạng thái này (Nightmare cần ngủ). */
  requiresStatusId?: string
  /** Skill của quái mang trạng thái đổi sang hệ này (Electrify: điện). */
  skillElementOverride?: string
  /** Dùng skill hệ trong danh sách thì nổ: mất % max HP, skill thất bại (Powder: lửa, 25%). */
  explodesOnElement?: { elementIds: string[]; percent: number }
  /** Quái hoang mang trạng thái này dễ bắt hơn (× số này, lấy số lớn nhất; ngủ 2,5, tê liệt 1,5). */
  catchMultiplier?: number
}

// ---------- Minion ----------

/**
 * Minion (minions.json, mục "Minion" ở battle.md): sinh vật bám vào quái trong trận, có stack.
 * Hành vi viết bằng hook trait (registries/traitHooks.ts), hệ số = số stack.
 */
export interface MinionDef {
  id: string
  /** Số stack tối đa (≥ 1). */
  maxStacks: number
  /** % mỗi cuối lượt minion bớt một stack (0 = không bao giờ tự mất). */
  leaveChance: number
  hooks: TraitHookDef[]
  /** Không bao giờ ra từ hiệu ứng "minion ngẫu nhiên" (Greater / Lesser Demon của Siralim). */
  excludeFromRandom?: true
}

// ---------- Race ----------

/**
 * Nhóm race lớn (raceGroups.json, mục "Race" ở stats-traits.md): mặc định cho mọi race trong nhóm,
 * trait dùng chung của nhóm, nhóm breed chéo được. Tham chiếu race (khẩu vị, trait "race X", cộng
 * hưởng...) ghi id nhóm thì khớp mọi race trong nhóm (`raceMatches`).
 */
export interface RaceGroup {
  id: string
  statBias: Stats
  growth: Stats
  /** Trait dùng chung (loại `race`) cho mọi race trong nhóm; có thể nhiều. */
  traitIds: string[]
  /** Nhóm breed chéo được (xét cả hai chiều); race cùng nhóm luôn breed được với nhau. */
  breedsWith: string[]
  partnerSkillId: string
  humanForm: boolean
  frenzyProne?: boolean
  weightKg?: number
  /**
   * Bộ phận ra đòn được (id trong bodyParts.json; docs/rules/hit-locations.md); bỏ trống = theo
   * cấp trên (loài → race → nhóm → config.hitLocations.defaultBodyParts).
   */
  bodyParts?: string[]
  /** Điểm yếu (tối đa config.hitLocations.maxWeakPoints bộ phận, trong bodyParts); bỏ trống = theo cấp trên. */
  weakPoints?: string[]
}

/**
 * Race trong races.json: thuộc một nhóm, chỉ ghi phần khác nhóm. Lúc dựng GameData được trộn mặc
 * định của nhóm thành `Race` đủ trường (`resolveRaces`).
 */
export interface RawRace {
  id: string
  groupId: string
  statBias?: Stats
  growth?: Stats
  /** Trait riêng của race (loại `race`); có thể nhiều; trait của nhóm cộng thêm. */
  traitIds?: string[]
  /** Race / nhóm breed chéo được thêm (ngoài nhóm của mình và nhóm mà nhóm mình breed được). */
  breedsWith?: string[]
  partnerSkillId?: string
  humanForm?: boolean
  frenzyProne?: boolean
  weightKg?: number
  /**
   * Bộ phận ra đòn được (id trong bodyParts.json; docs/rules/hit-locations.md); bỏ trống = theo
   * cấp trên (loài → race → nhóm → config.hitLocations.defaultBodyParts).
   */
  bodyParts?: string[]
  /** Điểm yếu (tối đa config.hitLocations.maxWeakPoints bộ phận, trong bodyParts); bỏ trống = theo cấp trên. */
  weakPoints?: string[]
}

/** Race đã trộn mặc định của nhóm (GameData.races). */
export interface Race {
  id: string
  /** Nhóm race lớn (raceGroups.json). */
  groupId: string
  /** Độ lệch chỉ số, nhân vào (gốc loài + gen × geneWeight). */
  statBias: Stats
  /** Mức tăng mỗi level: × (1 + (level − 1) × growth). */
  growth: Stats
  /**
   * Các race breed chéo được với race này (đã mở rộng: cùng nhóm, nhóm mà nhóm mình breed được, và
   * race / nhóm ghi thêm ở race; khác loài vẫn breed được nếu race tương thích).
   */
  breedsWith: string[]
  /** Trait bản sắc (loại `race`): trait riêng của race rồi trait của nhóm; suy ra, luôn cấp 1. */
  traitIds: string[]
  /** Kỹ năng đồng hành mặc định của race (partnerSkills.json; docs/rules/partner-skills.md). */
  partnerSkillId: string
  /** Quái race này hóa hình được không (docs/rules/human-form.md; race vốn hình người: false). */
  humanForm: boolean
  /**
   * Race khó kiểm soát (docs/rules/frenzy.md): quái có chủ (người chơi / NPC) race này mới cuồng bạo.
   * Bỏ trống = không.
   */
  frenzyProne?: boolean
  /**
   * Cân nặng điển hình (kg) của loài race này ở tổng chỉ số gốc chuẩn (config.weight); loài không ghi
   * `weightKg` thì ước lượng từ số này. Bỏ trống = config.weight.defaultRaceKg.
   */
  weightKg?: number
  /**
   * Bộ phận ra đòn được (id trong bodyParts.json; docs/rules/hit-locations.md); bỏ trống = theo
   * cấp trên (loài → race → nhóm → config.hitLocations.defaultBodyParts).
   */
  bodyParts?: string[]
  /** Điểm yếu (tối đa config.hitLocations.maxWeakPoints bộ phận, trong bodyParts); bỏ trống = theo cấp trên. */
  weakPoints?: string[]
}

// ---------- Loài ----------

export interface Evolution {
  speciesId: string
  level: number
  /**
   * Không có: tự tiến hóa sau trận thắng khi đủ level.
   * Có: chỉ tiến hóa khi người chơi dùng vật phẩm này (đá tiến hóa) lên quái đủ level.
   */
  itemId?: string
  /**
   * Điều kiện phụ, phải đủ tất cả (cùng level / itemId); `type` là tên handler trong
   * EVOLUTION_CONDITIONS (registries/evolutionConditions.ts). Bỏ trống = không có.
   */
  conditions?: EffectDef[]
  /** Tiến hóa dị biến: khi tiến hóa theo hướng này, tung tỉ lệ thành loài khác. */
  mutation?: EvolutionMutation
}

/**
 * Tiến hóa dị biến (docs/rules/evolution-skills.md): tung `chance` %; quái đang lắp xúc tác
 * `catalystItemId` (đồ cầm) thì tỉ lệ thành `catalystChance` và xúc tác bị tiêu khi trúng.
 */
export interface EvolutionMutation {
  speciesId: string
  chance: number
  catalystItemId?: string
  catalystChance?: number
}

/** Mọi loài một hướng tiến hóa có thể thành: loài thường, và loài dị biến nếu có. */
export const evolutionTargetIds = (evolution: Evolution): string[] =>
  evolution.mutation ? [evolution.speciesId, evolution.mutation.speciesId] : [evolution.speciesId]

export interface LearnsetEntry {
  level: number
  skillId: string
}

/**
 * Loại dạng của loài (Mega, Gigantamax, dạng vùng miền...). Dạng mega / gmax chỉ là dạng biến hình
 * trong trận (mục "Biến hình trong trận"): không sở hữu, không gặp ngoài tự nhiên.
 */
export const FORM_KINDS = ['mega', 'gmax', 'regional', 'battleOnly', 'alternate'] as const

export type FormKind = (typeof FORM_KINDS)[number]

/** Dạng chỉ có trong trận (biến hình): không bắt / sở hữu được nên không có thọ nguyên. */
export const BATTLE_FORM_KINDS: readonly FormKind[] = ['mega', 'gmax', 'battleOnly']

/** Nguồn gốc loài (thật, tuyệt chủng, cryptid, thần thoại, fantasy, viễn tưởng). */
export const SPECIES_ORIGINS = ['living', 'extinct', 'cryptid', 'myth', 'fantasy', 'scifi'] as const

export type SpeciesOrigin = (typeof SPECIES_ORIGINS)[number]

/** Trường `source` (tác phẩm / nguồn thần thoại) bắt buộc hay bị cấm theo `origin`. */
export const ORIGIN_SOURCE_RULES: Readonly<Record<SpeciesOrigin, 'required' | 'forbidden'>> = {
  living: 'forbidden',
  extinct: 'forbidden',
  cryptid: 'forbidden',
  myth: 'required',
  fantasy: 'required',
  scifi: 'required'
}

export interface NormalSpecies {
  kind: 'normal'
  id: string
  raceId: string
  elementIds: string[]
  baseStats: Stats
  evolutions: Evolution[]
  /** Skill học theo level. Phải có ít nhất một skill ở level 1. */
  learnset: LearnsetEntry[]
  /** Tỉ lệ bắt gốc (%), trước khi nhân hệ số bóng, HP, trait, boss. */
  catchRate: number
  /**
   * Thọ nguyên gốc (năm, nguyên ≥ 1; mục "Tuổi và thọ nguyên"): bắt buộc với loài thường, không có
   * ở dạng chỉ có trong trận (Mega, gmax, battleOnly: BATTLE_FORM_KINDS).
   */
  lifespan?: number
  /** Loài không giới tính: quái loài này có gender 'none', không breed được. */
  genderless?: boolean
  /** Id loài gốc nếu loài này là một dạng (đi cùng formKind). */
  formOf?: string
  formKind?: FormKind
  origin?: SpeciesOrigin
  /** Tác phẩm / nguồn thần thoại; bắt buộc hay bị cấm theo ORIGIN_SOURCE_RULES. */
  source?: string
  /** Dạng gmax: chiêu G-Max thay chiêu Max cùng hệ khi Gigantamax; bỏ trống = chiêu Max thường. */
  gmaxSkillId?: string
  /** Dạng Mega không cần đá mà cần biết skill này (kiểu Rayquaza với Dragon Ascent). */
  megaSkillId?: string
  /**
   * Dạng Mega / gmax: loài (loài gốc hoặc dạng khác của nó) được biến thành dạng này (Tatsugiri
   * Droopy → Mega Droopy, Toxtricity Low Key → Gmax Low Key); bỏ trống = chỉ loài gốc `formOf`.
   */
  fromSpeciesIds?: string[]
  /** Hệ Tera cố định (Ogerpon theo mặt nạ, Terapagos Stellar): không tung, không đổi được. */
  teraElementId?: string
  /** Dạng trong trận (battleOnly của cùng loài gốc) quái nhận khi Terastallize (Ogerpon, Terapagos). */
  teraFormId?: string
  /** Ghi đè phẩm cấp loài (id trong speciesRanks.json; docs/rules/species-rank.md). */
  rank?: string
  /**
   * Điểm nỗ lực quái loài này cho khi bị hạ / bị bắt (EV yield của Pokémon; nguyên ≥ 1 mỗi chỉ số
   * ghi; docs/rules/effort-values.md); bỏ trống = suy từ chỉ số gốc (config.effort.derivedYield).
   */
  effortYield?: PartialStats
  /**
   * Nhóm tăng trưởng EXP (6 nhóm của Pokémon; docs/rules/growth-rates.md); bỏ trống = Medium Fast
   * (level³).
   */
  growthRate?: GrowthRate
  /**
   * Ability thường của loài (id trait, 1–2 mục; như ability của Pokémon, docs/rules/abilities.md);
   * bỏ trống = loài không có ability riêng.
   */
  abilities?: string[]
  /** Ability ẩn (Hidden Ability) của loài (id trait); bỏ trống = không có. */
  hiddenAbility?: string
  /** Cân nặng thật (kg, > 0; Heavy Ball, mục "Cân nặng" ở battle.md); bỏ trống = ước lượng theo race. */
  weightKg?: number
  /** Chiều cao thật (m, > 0; thông tin Bộ sưu tập như Pokédex); bỏ trống = chưa có. */
  heightM?: number
  /**
   * Bộ phận ra đòn được (id trong bodyParts.json; docs/rules/hit-locations.md); bỏ trống = theo
   * cấp trên (loài → race → nhóm → config.hitLocations.defaultBodyParts).
   */
  bodyParts?: string[]
  /** Điểm yếu (tối đa config.hitLocations.maxWeakPoints bộ phận, trong bodyParts); bỏ trống = theo cấp trên. */
  weakPoints?: string[]
  /**
   * Giờ hoạt động (hệ số gặp theo thời khắc, docs/rules/calendar.md); bỏ trống = suy theo race /
   * hệ (config.calendar), không suy được thì gặp như nhau mọi giờ.
   */
  activeTime?: ActiveTime
  /** Ghi đè kỹ năng đồng hành của race (docs/rules/partner-skills.md). */
  partnerSkillId?: string
  /**
   * Skill học được qua sách kỹ năng ngoài learnset (TM / TR / Move Tutor của game gốc;
   * docs/rules/skill-books.md); cũng tính vào độ hiếm của sách.
   */
  bookSkillIds?: string[]
  /**
   * Chiêu trứng (egg move của game gốc): con breeding dạng này học được skill mà bố hoặc mẹ đang
   * biết (docs/rules/breeding-eggs.md).
   */
  eggSkillIds?: string[]
}

/** Loài chung cho quái đã fuse: không có chỉ số gốc, race hay hệ riêng. */
export interface FusedSpecies {
  kind: 'fused'
  id: string
}

export type Species = NormalSpecies | FusedSpecies

// ---------- Trait ----------

export const TRAIT_KINDS = [
  'positive',
  'negative',
  'rare',
  'shiny',
  'boss',
  'race',
  'bloodline',
  'polarity'
] as const

export type TraitKind = (typeof TRAIT_KINDS)[number]

/** Luật chung của một loại trait (mục Trait ở stats-traits.md). */
export interface TraitKindRule {
  /** Chiếm ô trait; cũng là trait "thường": truyền qua breeding, random lại khi fuse. */
  usesSlot: boolean
  /** Có tinh thể (extract / inject / mua / bán được). */
  hasCrystal: boolean
  /** Được phép có trong `config.wild.traitKindWeights` (tung cho quái hoang). */
  wildRollable: boolean
  /**
   * Lưu trong `monster.traits`. Không lưu: trait race (suy từ `raceId`), trait huyết mạch (suy từ
   * huyết mạch chính), trait cực tính (lưu ở `monster.polarity`).
   */
  inTraitList: boolean
}

/** Bảng luật theo loại trait: thêm loại mới mà thiếu mục thì TypeScript báo lỗi. */
export const TRAIT_KIND_RULES = {
  positive: { usesSlot: true, hasCrystal: true, wildRollable: true, inTraitList: true },
  negative: { usesSlot: true, hasCrystal: true, wildRollable: true, inTraitList: true },
  rare: { usesSlot: true, hasCrystal: true, wildRollable: true, inTraitList: true },
  shiny: { usesSlot: false, hasCrystal: false, wildRollable: false, inTraitList: true },
  boss: { usesSlot: false, hasCrystal: false, wildRollable: false, inTraitList: true },
  race: { usesSlot: false, hasCrystal: false, wildRollable: false, inTraitList: false },
  // Trait huyết mạch suy từ huyết mạch chính (docs/rules/bloodline.md).
  bloodline: { usesSlot: false, hasCrystal: false, wildRollable: false, inTraitList: false },
  // Trait cực tính lưu cùng cực của quái (docs/rules/polarity.md).
  polarity: { usesSlot: false, hasCrystal: false, wildRollable: false, inTraitList: false }
} as const satisfies Readonly<Record<TraitKind, TraitKindRule>>

/** Loại trait có tinh thể (bảng giá / trọng số tinh thể theo loại phải đủ các loại này). */
export type CrystalTraitKind = {
  [K in TraitKind]: (typeof TRAIT_KIND_RULES)[K]['hasCrystal'] extends true ? K : never
}[TraitKind]

/** Trait loại này có tinh thể không. */
export const hasCrystal = (kind: TraitKind): kind is CrystalTraitKind =>
  TRAIT_KIND_RULES[kind].hasCrystal

/** Trait loại này chiếm ô trait không (shiny, boss, race thì không). */
export const usesTraitSlot = (kind: TraitKind): boolean => TRAIT_KIND_RULES[kind].usesSlot

/** Các loại trait có tinh thể, theo thứ tự TRAIT_KINDS. */
export const CRYSTAL_TRAIT_KINDS: readonly CrystalTraitKind[] = TRAIT_KINDS.filter(hasCrystal)

export interface TraitHookDef {
  /** Tên handler trong registry (registries/traitHooks.ts). */
  type: string
  params: unknown
}

export interface TraitDef {
  id: string
  kind: TraitKind
  /** Các trait cùng nhóm không được tồn tại cùng lúc trên một quái. */
  exclusiveGroup?: string
  hooks: TraitHookDef[]
  /**
   * Ability không có tác dụng trong game (chỉ thông tin như Frisk, đổi dạng đã là loài riêng như
   * Multitype, theo PP như Pressure): được để `hooks` rỗng.
   */
  noBattleEffect?: true
}

export interface TraitInstance {
  id: string
  level: number
}

// ---------- Nhóm tăng trưởng EXP ----------

/** 6 nhóm tăng trưởng EXP của Pokémon (docs/rules/growth-rates.md). */
export const GROWTH_RATES = [
  'erratic',
  'fast',
  'mediumFast',
  'mediumSlow',
  'slow',
  'fluctuating'
] as const

export type GrowthRate = (typeof GROWTH_RATES)[number]

/** Nhóm của loài không ghi growthRate: level³ (Medium Fast). */
export const DEFAULT_GROWTH_RATE: GrowthRate = 'mediumFast'

// ---------- Ability ----------

/**
 * Ô ability của quái (docs/rules/abilities.md): ability thường thứ nhất / thứ hai, ability ẩn. Như
 * Pokémon, quái lưu ô, ability tính theo loài hiện tại (tiến hóa đổi theo ô).
 */
export const ABILITY_SLOTS = ['first', 'second', 'hidden'] as const

export type AbilitySlot = (typeof ABILITY_SLOTS)[number]

// ---------- Skill ----------

export const SKILL_CATEGORIES = ['physical', 'special', 'status'] as const

export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

/**
 * enemy: một địch (người chơi chọn); allEnemies: mọi địch; ally: đồng đội còn lại; allAllies: quái
 * dùng và đồng đội còn lại trên sân (kiểu Howl, Life Dew).
 */
export const SKILL_TARGETS = ['enemy', 'allEnemies', 'self', 'ally', 'allAllies'] as const

export type SkillTarget = (typeof SKILL_TARGETS)[number]

/**
 * Tầm chiêu (docs/rules/hit-locations.md): `melee` cận chiến (quái đứng trên đất không với tới quái
 * đang bay), `ranged` tầm xa (với tới mọi nơi).
 */
export const SKILL_REACHES = ['melee', 'ranged'] as const

export type SkillReach = (typeof SKILL_REACHES)[number]

export interface EffectDef {
  /** Tên handler trong registry tương ứng. */
  type: string
  params: unknown
}

/** Số đòn của skill đánh nhiều lần (số nguyên, 1 ≤ min ≤ max). */
export interface HitRange {
  min: number
  max: number
}

export interface Skill {
  id: string
  elementId: string
  category: SkillCategory
  /** 0 với skill status, > 0 với skill gây sát thương. */
  power: number
  /** % trúng, 1–100. */
  accuracy: number
  /** Cao hơn đánh trước, bất kể speed. */
  priority: number
  target: SkillTarget
  effects: EffectDef[]
  /** Đánh nhiều lần, `power` là sức mạnh mỗi đòn; bỏ trống = 1 đòn. Chỉ cho skill nhắm `enemy`. */
  hits?: HitRange
  /** Skill mạnh / yếu / chính xác hơn trong môi trường cụ thể; mỗi môi trường tối đa một mục. */
  fieldModifiers?: SkillFieldModifier[]
  /** Chỉ dùng được ở lượt đầu tiên quái có mặt trên sân (kiểu Fake Out, Mat Block). */
  firstTurnOnly?: true
  /**
   * Power theo công thức thay cho `power` (Eruption, Gyro Ball, Grass Knot, Stored Power...;
   * docs/rules/pokemon-moves.md). Kiểm tra / đọc kiểu ở registries/powerFormulas.ts.
   */
  powerFormula?: unknown
  /**
   * Chiêu hai lượt (docs/rules/pokemon-moves.md mục "Chiêu nhiều lượt"): lượt đầu nạp (chạy
   * `onCharge`, có thể bán vô hình `invulnerable`), lượt sau tự đánh; môi trường trong `skipInFieldIds`
   * thì đánh ngay (Solar Beam trong nắng, Electro Shot trong mưa).
   */
  charge?: SkillCharge
  /** Đánh trúng thì lượt sau phải nghỉ (Hyper Beam, Giga Impact). */
  recharge?: true
  /**
   * Khóa chiêu nhiều lượt: `rampage` (Outrage: 2–3 lượt rồi lú lẫn), `rollout` (Rollout: tới 5 lượt,
   * trượt thì dừng), `uproar` (Uproar: 3 lượt, không ai trên sân ngủ được).
   */
  lockIn?: SkillLockIn
  /**
   * Đánh trúng quái đang bán vô hình kiểu này (Earthquake trúng quái dưới đất ×2, Thunder trúng quái
   * trên không, Surf trúng quái dưới nước ×2).
   */
  hitsInvulnerable?: { kind: InvulnerableKind; multiplier?: number }[]
  /** Đòn đến muộn: trúng ô mục tiêu sau `turns` lượt (Future Sight, Doom Desire: 2). */
  delayedTurns?: number
  /**
   * Nạp đầu lượt trước mọi hành động (Beak Blast, Shell Trap): trong lượt đó quái đánh tiếp xúc vào quái
   * dùng chịu `onContactHit` (self = quái dùng, other = quái đánh).
   */
  chargeAtTurnStart?: { onContactHit?: unknown[] }
  /** Đòn tiếp xúc (cờ `contact` của Pokémon: King's Shield, Rough Skin...). */
  contact?: true
  /**
   * Tầm chiêu (docs/rules/hit-locations.md); bỏ trống = `melee` nếu là đòn tiếp xúc, không thì
   * `ranged` (skillReach).
   */
  reach?: SkillReach
  /**
   * Bộ phận dùng để ra chiêu (đuôi của Iron Tail, cánh của Wing Attack...; hit-locations.md mục
   * "Phá bộ phận"): bộ phận đó của quái bị phá thì không dùng được skill tới hết trận. Quái không có
   * bộ phận đó vẫn dùng được (dữ liệu bộ phận theo nhóm race còn thô).
   */
  bodyPart?: string
  /** Phá bảo vệ của mục tiêu (Protect...) rồi đánh như thường (Feint, Shadow Force). */
  breaksProtect?: true
  /**
   * Tự nhắm quái phe địch vừa gây sát thương cho quái dùng trong lượt bằng skill loại `categories`
   * (Counter: vật lý, Mirror Coat: đặc biệt, Metal Burst: mọi đòn); không có thì thất bại.
   */
  targetsLastAttacker?: { categories?: SkillCategory[] }
  /** Sát thương cố định / theo máu / hạ gục một đòn thay cho công thức (Night Shade, Super Fang, Fissure). */
  fixedDamage?: FixedDamage
  /**
   * Quái dùng tự gục sau khi dùng: `always` (Explosion, Memento, Healing Wish: kể cả trượt),
   * `onHit` (Final Gambit: chỉ khi trúng).
   */
  selfFaint?: 'always' | 'onHit'
  /** Trượt / bị chặn / không gây sát thương thì quái dùng mất % max HP (Jump Kick, High Jump Kick: 50). */
  crashDamagePercent?: number
  /** Mỗi lần dùng, quái dùng mất % max HP làm tròn lên (Mind Blown, Steel Beam, Chloroblast: 50). */
  selfDamagePercent?: number
  /** Phản lực: quái dùng mất % tổng sát thương vừa gây (Double-Edge 33, Head Smash 50). */
  recoilPercent?: number
  /** Không hạ gục mục tiêu: luôn chừa ít nhất 1 máu (False Swipe, Hold Back). */
  leavesOneHp?: true
  /** Chỉ số công thay cho công / đặc công (Foul Play: công của mục tiêu; Body Press: thủ quái dùng). */
  attackFrom?: { who: 'self' | 'target'; stat: NonHpStat }
  /** Chỉ số thủ của mục tiêu dùng thay theo loại đòn (Psyshock: thủ vật lý). */
  defenseStat?: NonHpStat
  /** Loại đòn tính lúc đánh (Photon Geyser: higherAttack; Shell Side Arm: betterRatio). */
  categoryRule?: SkillCategoryRule
  /** Bỏ qua bậc trận của mục tiêu (thủ, né), như Sacred Sword / Chip Away. */
  ignoresTargetStages?: true
  /** Bỏ qua ability của mục tiêu trong đòn (Moongeist Beam, Sunsteel Strike). */
  ignoresAbility?: true
  /**
   * Khắc hệ đặc biệt: `against` ghi đè hệ số lên hệ bên nhận (Freeze-Dry: nước 2), `extraElementIds`
   * nhân thêm bảng của hệ khác (Flying Press: bay).
   */
  effectiveness?: { against?: Record<string, number>; extraElementIds?: string[] }
  /** Dùng được khi đang dính các trạng thái mất lượt này (Sleep Talk, Snore: ngủ). */
  usableWhileStatusIds?: string[]
  /** Bị Magic Coat phản lại (cờ `reflectable` của Pokémon). */
  reflectable?: true
  /** Bị Snatch cướp (cờ `snatch` của Pokémon). */
  snatchable?: true
  /** Bỏ qua phần giảm sát thương của trạng thái quái dùng đang mang (Facade: bỏng). */
  ignoresStatusPenalty?: true
  /** Không bị nhử đòn đổi mục tiêu (Snipe Shot; nhử của Follow Me / Rage Powder / Spotlight). */
  ignoresRedirect?: true
  /** Cờ loại chiêu theo Pokémon (Showdown `flags`): Iron Fist, Strong Jaw, Soundproof... dùng. */
  moveFlags?: MoveFlag[]
  /** Phá màn chắn (hiệu ứng theo phe giảm sát thương) của phe mục tiêu trước khi đánh (Brick Break). */
  breaksScreens?: true
  /** Cướp mọi bậc đang tăng của mục tiêu sang quái dùng trước khi đánh (Spectral Thief). */
  stealsBoosts?: true
  /** Đòn thứ n của skill nhiều đòn có power × n (Triple Axel 20 / 40 / 60, Triple Kick). */
  escalatingHits?: true
  /** Đòn đến muộn là hồi máu: hồi % max HP của quái dùng cho quái ở ô (Wish: 50). */
  delayedHealPercent?: number
  /** Hệ của skill theo berry đang cầm (Natural Gift: `naturalGift.elementId` của berry đầu tiên). */
  elementFromHeldItem?: true
  /**
   * Hệ của skill theo hệ quái dùng: `first` (Revelation Dance, Raging Bull, Judgment, Multi-Attack:
   * dạng của loài quyết định hệ) hoặc `last` (Ivy Cudgel: hệ mặt nạ là hệ sau của dạng Ogerpon).
   */
  elementFromUser?: 'first' | 'last'
  /** Hệ theo tính chẵn lẻ của gen như IV (Hidden Power; `hiddenPowerElement` ở battle/damage.ts). */
  elementFromGenes?: true
  /**
   * Power ngẫu nhiên mỗi lần dùng theo trọng số (Present, Magnitude, Fickle Beam); AI dùng power
   * trung bình theo trọng số.
   */
  randomPower?: { power: number; weight: number }[]
  /** Trạng thái của quái dùng được chữa ngay khi dùng skill, trước khi xét mất lượt (Flame Wheel rã đông). */
  curesUserStatuses?: string[]
  /** Trạng thái của mục tiêu được chữa khi trúng đòn gây sát thương (Scald rã đông). */
  curesTargetStatuses?: string[]
  /**
   * Không kiểm tra chính xác (accuracy "—" của Pokémon: Swift, Aerial Ace, Defog...): luôn trúng,
   * bỏ qua bậc né; né của trait vẫn tính.
   */
  alwaysHits?: true
  /** Họ skill (họ spell của Siralim: Booze, Arsenal, Arrow, Ultimate) cho trait tác động cả họ. */
  tags?: SkillTag[]
  /** Phần spell Siralim: hiệu ứng / sức mạnh viết bằng "ngôn ngữ" trait (mục "Spell Siralim"). */
  spell?: SkillSpellDef
  /**
   * Chiêu của quái Dynamax (mục "Dynamax" ở transformation.md): chiêu Max theo hệ, chiêu G-Max của
   * dạng gmax, Max Guard. Không nằm trong learnset; power / loại lấy theo skill gốc lúc dùng.
   */
  maxMove?: MaxMoveKind
  /** Tera Blast: đã Tera thì thành hệ Tera, loại theo công / đặc công (mục "Tera"). */
  teraBlast?: true
  /** Đánh xuyên Max Guard (hiệu ứng protect), kiểu G-Max One Blow. */
  ignoresProtect?: true
  /**
   * Bậc chí mạng cộng thêm của skill (nguyên ≥ 1; như Pokémon: Slash / Stone Edge 1, 10,000,000 Volt
   * Thunderbolt 2; docs/rules/battle.md mục "Chí mạng").
   */
  critStage?: number
  /** Luôn chí mạng (Frost Breath, Wicked Blow...); trait / phe miễn chí mạng vẫn chặn. */
  alwaysCrit?: true
  /**
   * Z-Move (docs/rules/z-moves.md): `z` = Z-Move theo hệ (power / loại lấy theo skill gốc lúc
   * dùng), `signature` = Z-Move riêng của loài (số cố định). Không nằm trong learnset.
   */
  zMove?: ZMoveKind
  /** Power Z-Move khi skill gây sát thương này thành Z-Move (thay bảng power; như Pokémon). */
  zPower?: number
  /**
   * Z-Power của skill trạng thái khi dùng thành Z-Move: hiệu ứng "ngôn ngữ" trait lên quái dùng,
   * chạy trước skill (kiểu Z-Swords Dance +1 công). Kiểm tra / đọc kiểu ở registries/zEffects.ts.
   */
  zEffects?: unknown[]
  /** Mạnh hơn khi có đồng đội trên sân mang hệ nhất định (mục "Synergy" ở battle.md). */
  synergy?: SkillSynergy
  /**
   * Số lượt chờ (nguyên ≥ 1): không dùng được trong `hold` lượt đầu trên sân, dùng xong chờ lại
   * `hold` lượt (mục "Hold" ở battle.md).
   */
  hold?: number
  /**
   * Có thế mạnh / thế nhanh (docs/rules/move-styles.md): `true` dùng số chung, object ghi đè số
   * riêng cho từng thế. Chỉ skill Pokémon có trong Legends: Arceus.
   */
  styles?: true | SkillStyleOverrides
  /**
   * Skill đổi khi quái dùng ở dạng nhất định (docs/rules/battle-forms.md): Aura Wheel của Morpeko
   * Hangry thành hệ Bóng tối, Water Shuriken của Ash-Greninja 20 power × 3 đòn, Tera Starstorm của
   * Terapagos Stellar thành Stellar đánh mọi địch. Mục đầu tiên khớp dạng hiện tại được áp.
   */
  formOverrides?: SkillFormOverride[]
  /**
   * Bide: `turns` lượt tích sát thương nhận (bị ép dùng lại, priority của skill), lượt sau trả
   * `fixedDamage` kiểu `stored` lên quái gây sát thương cuối cùng.
   */
  bide?: { turns: number }
  /**
   * Sky Drop: lượt nạp nhấc mục tiêu lên cùng (mục tiêu bán vô hình, mất lượt); mục tiêu nặng từ
   * `maxWeightKg` trở lên, đang Dynamax hoặc núp sau thế thân thì thất bại.
   */
  carriesTarget?: { maxWeightKg: number }
  /**
   * Pollen Puff: nhắm được đồng đội (lệnh `targetAlly`); trúng đồng đội thì không gây sát thương mà
   * chạy các hiệu ứng này (hồi 50% max HP).
   */
  onAlly?: EffectDef[]
  /** Pursuit: địch rút về trong lượt thì đánh trước khi nó rời sân, % sát thương này (×2 = 200). */
  pursuit?: { damagePercent: number }
  /** Round: dùng xong thì đồng đội đang chờ dùng cùng skill đi ngay sau. */
  pullsAllySameSkill?: true
  /**
   * Luôn trúng mục tiêu đang mang một trong các trạng thái này (Stomp, Body Slam... lên quái đã
   * Minimize), bỏ qua accuracy và né.
   */
  alwaysHitsVsStatusIds?: string[]
  /** Đòn không hệ (Struggle, Bide; hệ "???" của Pokémon): khắc chế luôn 1, không STAB. */
  typeless?: true
  /**
   * Đòn hệ Stellar (Tera Starstorm của Terapagos Stellar): khắc chế cố định như Tera Blast Stellar
   * (lên quái đang Tera theo config, không thì trung tính).
   */
  stellar?: true
}

/** Thay đổi của skill khi quái dùng đang ở một trong các dạng `speciesIds` (Skill.formOverrides). */
export interface SkillFormOverride {
  speciesIds: string[]
  elementId?: string
  power?: number
  hits?: HitRange
  target?: SkillTarget
  categoryRule?: SkillCategoryRule
  stellar?: true
}

/** Kiểu bán vô hình lúc nạp chiêu (Fly / Bounce / Sky Drop, Dig, Dive, Phantom / Shadow Force). */
export const INVULNERABLE_KINDS = [
  'air',
  'underground',
  'underwater',
  'vanished',
  'commanding'
] as const

export type InvulnerableKind = (typeof INVULNERABLE_KINDS)[number]

/** Chiêu hai lượt (Skill.charge). */
export interface SkillCharge {
  invulnerable?: InvulnerableKind
  /** Hiệu ứng ngôn ngữ trait chạy lượt nạp (Skull Bash +1 thủ, Meteor Beam +1 đặc công). */
  onCharge?: unknown[]
  /** Môi trường làm đánh ngay không cần nạp (Solar Beam: nắng; Electro Shot: mưa). */
  skipInFieldIds?: string[]
}

export const LOCK_IN_KINDS = ['rampage', 'rollout', 'uproar', 'encore'] as const

export type LockInKind = (typeof LOCK_IN_KINDS)[number]

/** Khóa chiêu nhiều lượt (Skill.lockIn); số lượt tung đều trong [min, max]. */
export interface SkillLockIn {
  kind: LockInKind
  turns: { min: number; max: number }
  /** Hết khóa (đủ lượt) thì quái dùng dính trạng thái này (Outrage: lú lẫn). */
  fatigueStatusId?: string
  /** Trong lúc khóa, không quái nào trên sân dính các trạng thái này (Uproar: ngủ). */
  blocksStatusIds?: string[]
}

/** Sát thương cố định của skill (docs/rules/pokemon-moves.md mục "Sát thương cố định"). */
export type FixedDamage =
  /** Số cố định (Dragon Rage 40, Sonic Boom 20). */
  | { kind: 'flat'; amount: number }
  /** Theo level quái dùng × % trong [min, max] (Night Shade 100; Psywave 50–150). */
  | { kind: 'level'; minPercent?: number; maxPercent?: number }
  /** % máu hiện tại của mục tiêu (Super Fang, Nature's Madness, Ruination: 50). */
  | { kind: 'targetHpPercent'; percent: number }
  /** Máu mục tiêu về bằng máu quái dùng (Endeavor). */
  | { kind: 'hpDifference' }
  /** Bằng máu hiện tại của quái dùng (Final Gambit). */
  | { kind: 'userHp' }
  /**
   * Đòn trả: `multiplier` × sát thương mục tiêu vừa gây cho quái dùng trong lượt bằng skill loại
   * `categories` (Counter, Mirror Coat ×2; Metal Burst, Comeuppance ×1,5).
   */
  | { kind: 'counter'; multiplier: number; categories?: SkillCategory[] }
  /** Bide: `multiplier` × sát thương tích được (Bide là đòn không hệ: typeless). */
  | { kind: 'stored'; multiplier: number }
  /** Hạ gục một đòn (Fissure, Guillotine, Horn Drill, Sheer Cold). */
  | {
      kind: 'ohko'
      immuneElementIds?: string[]
      accuracyIfNotElement?: { elementId: string; accuracy: number }
    }

export const FIXED_DAMAGE_KINDS = [
  'stored',
  'flat',
  'level',
  'targetHpPercent',
  'hpDifference',
  'userHp',
  'counter',
  'ohko'
] as const satisfies readonly FixedDamage['kind'][]

/** Luật chọn loại đòn lúc đánh (docs/rules/pokemon-moves.md). */
export const SKILL_CATEGORY_RULES = ['higherAttack', 'betterRatio'] as const

export type SkillCategoryRule = (typeof SKILL_CATEGORY_RULES)[number]

/** Synergy của skill: đồng đội còn sống trên sân mang một hệ trong `partnerElementIds`. */
export interface SkillSynergy {
  partnerElementIds: string[]
  /** % power cộng thêm (> 0); bỏ trống = không cộng. */
  powerBonusPercent?: number
  /** Hiệu ứng chạy thêm (registry hiệu ứng skill, như `effects`); bỏ trống = không có. */
  effects?: EffectDef[]
}

/** Loại chiêu của quái Dynamax: chiêu Max theo hệ, chiêu G-Max, Max Guard (skill trạng thái). */
export const MAX_MOVE_KINDS = ['max', 'gmax', 'guard'] as const

export type MaxMoveKind = (typeof MAX_MOVE_KINDS)[number]

/** Loại Z-Move: theo hệ (Z-Crystal hệ) hay riêng của loài (Z-Crystal loài). */
export const ZMOVE_KINDS = ['z', 'signature'] as const

export type ZMoveKind = (typeof ZMOVE_KINDS)[number]

/** Chiêu chỉ có trong trận (chiêu Max, Z-Move): không học, không có thế, luôn trúng... */
export const isBattleOnlyMove = (skill: Skill): boolean =>
  skill.maxMove !== undefined || skill.zMove !== undefined

/**
 * Phần spell Siralim của skill (mục "Spell Siralim" ở battle.md). Chi tiết hiệu ứng / bộ đếm /
 * điều kiện theo "ngôn ngữ" trait (registries/traitDsl.ts) nên ở đây để `unknown`, kiểm tra và đọc
 * kiểu ở registries/skillSpell.ts (như `params` của hook).
 */
export interface SkillSpellDef {
  /**
   * Điều kiện phải thỏa với từng mục tiêu, không thì skill thất bại lên mục tiêu đó (Steel Roller
   * cần địa hình, Sucker Punch cần mục tiêu sắp dùng đòn gây sát thương).
   */
  requires?: unknown[]
  /** Hiệu ứng lên từng mục tiêu trúng (subject = other = mục tiêu, lượng = sát thương lên nó). */
  onTarget?: unknown[]
  /** Hiệu ứng một lần sau cả chiêu nếu trúng ít nhất một mục tiêu (lượng = tổng sát thương). */
  after?: unknown[]
  /** Cộng % sức mạnh (mỗi đơn vị bộ đếm `per`, khi đủ điều kiện `when`); có thể âm. */
  powerBonus?: unknown[]
  /** Nhân sức mạnh với bộ đếm (kiểu "dùng N lần, N = số địch đang bỏng"); 0 thì không gây gì. */
  powerTimes?: unknown
  /** Chỉ số công thay thế (`stat`, `weight`%) như hook trait attackStat. */
  attackStat?: unknown
  /** % thủ của mục tiêu bị bỏ qua (0–100). */
  ignoreDefensePercent?: number
}

/** Họ skill có trait tác động cả họ (mục "Ngôn ngữ trait" ở trait-dsl.md). */
/**
 * Cờ loại chiêu Pokémon (`flags` của Showdown): sound (Throat Chop chặn, Soundproof), punch (Iron
 * Fist), bite (Strong Jaw), slicing (Sharpness), pulse (Mega Launcher), bullet (Bulletproof), wind
 * (Wind Rider), dance (Dancer), powder (Overcoat, hệ Cỏ miễn).
 */
export const MOVE_FLAGS = [
  'sound',
  'punch',
  'bite',
  'slicing',
  'pulse',
  'bullet',
  'wind',
  'dance',
  'powder'
] as const

export type MoveFlag = (typeof MOVE_FLAGS)[number]

export const SKILL_TAGS = ['booze', 'arsenal', 'arrow', 'ultimate', 'minion'] as const

export type SkillTag = (typeof SKILL_TAGS)[number]

/** Thay đổi của skill khi môi trường `fieldId` đang có (mục "Môi trường"). */
export interface SkillFieldModifier {
  fieldId: string
  /** Sức mạnh thay thế (> 0), trước khi nhân powerMultiplier (Solar Beam khi nắng: power gốc). */
  power?: number
  /** Nhân sức mạnh (> 0). */
  powerMultiplier?: number
  /** Accuracy thay thế (1–100), trước khi nhân hệ số accuracy của môi trường. */
  accuracy?: number
  /** Luôn trúng (bỏ qua mọi accuracy). */
  hitsAlways?: true
  /** Hệ thay thế (kiểu Weather Ball: mưa → nước); dùng cho STAB, khắc chế, hook theo hệ, AI. */
  elementId?: string
  /** Mục này chỉ có tác dụng khi quái dùng skill đứng trên mặt đất (kiểu Terrain Pulse). */
  requiresGroundedUser?: true
  /** Cộng priority khi môi trường có (Grassy Glide: +1 trên địa hình cỏ). */
  priority?: number
  /** Mục tiêu thay thế khi môi trường có (Expanding Force: mọi địch trên địa hình tâm linh). */
  target?: SkillTarget
}

// ---------- Vật phẩm ----------
// Mọi thứ trong túi đều là item, phân loại theo `category` (mục "Thị trấn, di chuyển, vùng,
// vật phẩm"). Mỗi category một interface chỉ có trường của nó; thêm category mới = thêm
// interface vào union `Item` + một mục luật trong gameData/itemCategories.ts.

export const ITEM_CATEGORIES = [
  'consumable',
  'ball',
  'evolutionStone',
  'held',
  'equipment',
  'traitCrystal',
  'fusionAid',
  'keyItem',
  'megaStone',
  'teraShard',
  'zCrystal',
  'material',
  'formationScroll',
  'recipeScroll',
  'seed',
  'skillBook',
  'soulCrystal',
  'bait',
  'charm',
  'dish',
  'fishingLure'
] as const

export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

/** Vật phẩm tiêu hao dùng ở đâu: ngoài trận, trong trận, hoặc cả hai. */
export const ITEM_USES = ['field', 'battle', 'both'] as const

export type ItemUse = (typeof ITEM_USES)[number]

/** Vật phẩm tiêu hao nhắm ai: quái của ta (thuốc) hay quái hoang trên sân (vật phẩm ném). */
export const ITEM_TARGETS = ['ally', 'enemy'] as const

export type ItemTarget = (typeof ITEM_TARGETS)[number]

interface ItemBase {
  id: string
}

/**
 * Item có giá: bán lại được ở cửa hàng (mục "Cửa hàng và vứt vật phẩm"). `shop: true` thì có
 * trong danh sách hàng random của cửa hàng, chọn theo `shopWeight` (bắt buộc khi có `shop`).
 * Giá thật = `price × highestFloor` (tiền tăng theo tầng), trừ item ghi `fixedPrice: true`.
 */
interface PricedItemBase extends ItemBase {
  price: number
  shop?: true
  shopWeight?: number
  fixedPrice?: true
  /** Chỉ vào danh sách hàng khi người chơi có vật phẩm chìa khóa này (đá Mega, Mảnh Tera...). */
  requiresKeyItemId?: string
  /**
   * Chỉ có trong cửa hàng và bảng rơi khi tùy chọn luật chơi này đang bật (Thọ Nguyên Đan khi bật
   * thọ nguyên); món đã có trong túi vẫn giữ và dùng được.
   */
  requiresOption?: GameOptionFlag
}

/** Thuốc, thuốc giải (nhắm quái ta), vật phẩm ném (nhắm quái hoang, chỉ dùng trong trận). */
export interface ConsumableItem extends PricedItemBase {
  category: 'consumable'
  use: ItemUse
  target: ItemTarget
  /**
   * Hiệu ứng: nhắm `ally` thì theo registry vật phẩm (registries/itemEffects.ts); nhắm `enemy`
   * thì theo registry hiệu ứng skill (registries/skillEffects.ts), chạy như skill trúng mục tiêu.
   */
  effects: EffectDef[]
  /**
   * Khẩu vị (thiên tài địa bảo, docs/rules/treasures.md): quái race này / có hệ này nhận hiệu quả ×
   * treasures.favoriteMultiplier và + thân mật.
   */
  favoriteRaceIds?: string[]
  favoriteElementIds?: string[]
}

/** Bóng bắt quái: chỉ dùng trong trận, ném vào quái hoang. */
export interface BallItem extends PricedItemBase {
  category: 'ball'
  /** Hệ số nhân tỉ lệ bắt. */
  catchMultiplier: number
  /** Thân mật khởi đầu của quái bắt bằng bóng này; bỏ trống = config.affinity.start.caught. */
  startAffinity?: number
  /** Điều kiện nhân thêm hệ số (registry BALL_BONUSES: firstTurn, turnScaling, targetElement...). */
  bonuses?: EffectDef[]
  /** Luôn bắt được, kể cả boss (Master Ball). */
  alwaysCatch?: true
  /** Quái bắt được hồi đầy máu, hết trạng thái bất thường (Heal Ball). */
  healOnCatch?: true
}

/** Đá tiến hóa (kể cả bùa vùng): chỉ dùng ngoài trận, theo hướng tiến hóa có `itemId` này. */
export interface EvolutionStoneItem extends PricedItemBase {
  category: 'evolutionStone'
}

/**
 * Đồ cầm (mục "Trang bị và đồ cầm"): lắp vào ô như trang bị. Đồ tiêu hao: hook trait tác dụng một
 * lần rồi đồ mất khỏi ô, chỉ nhận hook có lúc kích hoạt rõ (`heldUse` của handler). Đồ không tiêu
 * hao (`persistent`, kiểu Razor Claw / Leek của Pokémon): hook tác dụng liên tục như trait.
 */
export interface HeldItem extends PricedItemBase {
  category: 'held'
  hooks: TraitHookDef[]
  /** Nhãn (ví dụ "berry": Teatime cho quái ăn berry đang cầm). */
  tags?: string[]
  /** Không tiêu hao: hook tác dụng liên tục, không mất khi kích hoạt, không bị ăn (Teatime). */
  persistent?: true
  /** Hook chỉ tác dụng khi loài gốc của quái cầm nằm trong danh sách (Leek: dòng Farfetch'd). */
  speciesIds?: string[]
  /** Power khi bị ném bằng Fling (số của Pokémon); bỏ trống = không ném được. */
  flingPower?: number
  /** Berry dùng cho Natural Gift: power và hệ (số của Pokémon). */
  naturalGift?: { power: number; elementId: string }
  /** Trạng thái gây lên mục tiêu khi bị ném bằng Fling (Flame Orb: bỏng, King's Rock: chùn bước). */
  flingStatusId?: string
  /** Đổi hệ các skill `elementFromHeldItem` này khi cầm (Drive của Genesect: Techno Blast). */
  skillElement?: { skillIds: string[]; elementId: string }
}

/** Bậc hiếm của trang bị, từ thấp tới cao; `unique` chỉ có ở trang bị của boss. */
export const EQUIPMENT_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'unique'
] as const

export type EquipmentRarity = (typeof EQUIPMENT_RARITIES)[number]

/** Bậc tung được cho trang bị thường (rơi từ quái, cửa hàng). */
export type NormalRarity = Exclude<EquipmentRarity, 'unique'>

export const NORMAL_RARITIES: readonly NormalRarity[] = EQUIPMENT_RARITIES.filter(
  (rarity): rarity is NormalRarity => rarity !== 'unique'
)

/** Khoảng random của giá trị một dòng ở một bậc (số nguyên, min ≤ max). */
export interface ValueRange {
  min: number
  max: number
}

/**
 * Một dòng chỉ số của trang bị (mục "Trang bị và đồ cầm"): một hook trait có giá trị random. Giá trị
 * tung trong khoảng của bậc rồi ghi vào `params` tại đường dẫn `valueParam` (ví dụ
 * "percent.attack"), nên dòng dùng lại mọi hook trait có sẵn.
 */
export interface EquipmentLineDef {
  /** Id dòng: "main" (dòng chính), id dòng unique trong món, hoặc id dòng phụ (equipmentAffixes). */
  id: string
  hook: TraitHookDef
  /**
   * Đường dẫn tham số nhận giá trị trong `hook.params`, các khóa nối bằng dấu chấm (khóa số = phần tử
   * danh sách); danh sách đường dẫn = ghi cùng giá trị vào nhiều chỗ (món tăng nhiều chỉ số).
   */
  valueParam: string | string[]
  /** Khoảng giá trị theo bậc; dòng chính / dòng phụ khai báo mọi bậc nó có thể ra. */
  ranges: Partial<Record<EquipmentRarity, ValueRange>>
  /** Nhãn loại dòng (trait / spell Siralim tác động theo loại dòng của Artifact). */
  tags?: string[]
}

/** Dòng phụ dùng chung (equipmentAffixes.json): tung theo trọng số cho trang bị bậc cao. */
export interface EquipmentAffixDef extends EquipmentLineDef {
  weight: number
}

/** Gợi ý AI của món unique: nhân điểm skill khớp (loại hiệu ứng, loại skill, hệ). */
export interface EquipmentAiHint {
  /** Skill có hiệu ứng loại này (registry hiệu ứng skill). */
  effectType?: string
  category?: SkillCategory
  elementId?: string
  /** Hệ số nhân điểm ứng viên (> 0). */
  multiplier: number
}

/** Phần riêng của trang bị unique: thuộc pool của một loài boss. */
export interface UniqueEquipmentDef {
  /** Loài boss mang / rơi món này; chỉ quái cùng race (hoặc có race đó trong lineage) lắp được. */
  bossSpeciesId: string
  /** Dòng unique (≥ 1), luôn có đủ trên mọi món. */
  lines: EquipmentLineDef[]
  aiHints?: EquipmentAiHint[]
}

/** Trang bị gốc: mỗi món rơi ra / mua về là một bản riêng đã random (EquipmentInstance). */
export interface EquipmentItem extends PricedItemBase {
  category: 'equipment'
  /** Dòng chính (id luôn "main"). */
  mainLine: Omit<EquipmentLineDef, 'id'>
  /**
   * Hook cố định của món (không random, không đổi theo cấp món): phần cơ chế đi kèm dòng chính, ví
   * dụ Choice Band khóa skill, Life Orb tự mất máu, Assault Vest cấm skill trạng thái.
   */
  hooks?: TraitHookDef[]
  /** Có thì là món unique của boss (bậc luôn `unique`). */
  unique?: UniqueEquipmentDef
  /**
   * Có thì là món gốc của hồn khí (docs/rules/soul-relics.md) với dòng chính tăng chỉ số này: chỉ
   * tạo khi luyện hồn khí (không rơi, không bán ở cửa hàng / chợ đen), có khoảng cho mọi bậc.
   */
  soulRelicStat?: StatName
}

/**
 * Tinh thể trait: một định nghĩa chung duy nhất; trait và cấp nằm ở từng chồng trong túi
 * (`Inventory.crystals`). Không có `price`: giá tính theo trait và cấp.
 */
export interface TraitCrystalItem extends ItemBase {
  category: 'traitCrystal'
}

/**
 * Bùa fuse (mục Fusing): chỉ dùng trong action `fuse`. Hiệu ứng theo registry
 * registries/fusionAidEffects.ts; mọi hiệu ứng của một bùa cùng một ô (tăng tỉ lệ / hộ mệnh).
 */
export interface FusionAidItem extends PricedItemBase {
  category: 'fusionAid'
  effects: EffectDef[]
}

/**
 * Vật phẩm chìa khóa (Vòng Mega, Dynamax Band, Tera Orb, Vòng Z): tối đa 1 mỗi loại, không giá
 * (không bán, mua, vứt), không dùng trực tiếp; nhận khi lần đầu thắng quán chủ đạo quán
 * (config.trainers.gym.keyItemFloors).
 */
export interface KeyItem extends ItemBase {
  category: 'keyItem'
}

/** Loại hiệu ứng của bùa (docs/rules/dex.md mục "Bùa"); luật gộp ở registries/charms.ts. */
export const CHARM_EFFECT_TYPES = [
  'shinyChanceMultiplier',
  'eggStepBonus',
  'restEggSteps',
  // Cấp dụng cụ câu cá / khai thác (docs/rules/gathering.md): lấy cấp cao nhất đang có.
  'fishingRodTier',
  'pickaxeTier'
] as const

export type CharmEffectType = (typeof CHARM_EFFECT_TYPES)[number]

/**
 * Một hiệu ứng của bùa: hệ số nhân (shinyChanceMultiplier) hoặc lượng cộng (eggStepBonus, số bước
 * trứng tiến mỗi lần nghỉ restEggSteps).
 */
export interface CharmEffect {
  type: CharmEffectType
  value: number
}

/**
 * Bùa (như Shiny Charm / Oval Charm của Pokémon): có trong túi là có tác dụng, không dùng / bán /
 * vứt, không rơi; nhận từ thưởng Dex. Có `townPrice` thì mua được một lần ở cửa hàng thị trấn với
 * giá cố định đó (action buyCharm, kiểu Ôn Dưỡng Lò); `townMinFloor` = tầng cao nhất cần đạt mới mua
 * được (cần câu / cuốc cấp cao, docs/rules/gathering.md).
 */
export interface CharmItem extends ItemBase {
  category: 'charm'
  effects: CharmEffect[]
  townPrice?: number
  townMinFloor?: number
}

/**
 * Đá Mega (mục "Mega"): lắp vào ô như đồ cầm, không tiêu hao; quái loài `formOf` của dạng `formId`
 * Mega được. `auto`: tự biến khi ra sân, không cần Vòng Mega, không tính lượt Mega của phe (Primal).
 */
export interface MegaStoneItem extends PricedItemBase {
  category: 'megaStone'
  formId: string
  auto?: true
}

/** Mảnh Tera của một hệ (hoặc STELLAR): đổi hệ Tera ở thị trấn, không dùng trực tiếp. */
export interface TeraShardItem extends PricedItemBase {
  category: 'teraShard'
  elementId: string
}

/**
 * Z-Crystal (docs/rules/z-moves.md): lắp vào ô như đồ cầm, không tiêu hao. Crystal hệ (`elementId`):
 * skill hệ đó thành Z-Move của hệ; crystal loài: quái loài `speciesIds` biết `baseSkillId` thì
 * skill đó thành Z-Move riêng `zSkillId`.
 */
export type ZCrystalItem = PricedItemBase & { category: 'zCrystal' } & (
    | {
        elementId: string
        baseSkillId?: never
        zSkillId?: never
        speciesIds?: never
        ultraBurst?: never
      }
    | {
        elementId?: never
        baseSkillId: string
        zSkillId: string
        speciesIds: string[]
        /**
         * Ultra Burst (transformation.md): quái loài `fromSpeciesIds` cầm crystal này biến thành dạng
         * `formId` (Ultranecrozium Z: Necrozma Dusk Mane / Dawn Wings → Ultra Necrozma).
         */
        ultraBurst?: { fromSpeciesIds: string[]; formId: string }
      }
  )

/**
 * Nguyên liệu (Phá Cảnh Đan...): gộp chồng, không dùng trực tiếp; chỉ bán / vứt / tiêu hao trong
 * action dùng nó (đột phá cảnh giới ngự thú sư, sau này công thức luyện đan, cường hóa).
 */
export interface MaterialItem extends PricedItemBase {
  category: 'material'
}

/**
 * Trận đồ (docs/rules/team.md): gộp chồng, không dùng trực tiếp; action `learnFormation` tiêu một
 * trận đồ để học trận pháp `formationId` (trận pháp đã học dùng mãi, không tốn trận đồ khi đánh).
 */
export interface FormationScrollItem extends PricedItemBase {
  category: 'formationScroll'
  formationId: string
}

/**
 * Đan phương (docs/rules/alchemy.md): gộp chồng, không dùng trực tiếp; action `learnRecipe` tiêu
 * một đan phương để biết công thức `recipeId` (công thức cần học).
 */
export interface RecipeScrollItem extends PricedItemBase {
  category: 'recipeScroll'
  recipeId: string
}

/** Một món thu hoạch của hạt giống: số lượng random đều trong [min, max]. */
export interface HarvestEntry {
  itemId: string
  min: number
  max: number
}

/** Hạt giống (docs/rules/alchemy.md): trồng ở linh điền, đủ `growDays` ngày thì thu hoạch `harvest`. */
export interface SeedItem extends PricedItemBase {
  category: 'seed'
  growDays: number
  harvest: HarvestEntry[]
}

/**
 * Sách kỹ năng (docs/rules/skill-books.md): một định nghĩa chung duy nhất như tinh thể trait; skill và
 * loại sách (Bí kíp / Chân kinh) nằm ở từng chồng trong túi (`Inventory.books`). Không có `price`:
 * giá tính theo skill (power, độ hiếm).
 */
export interface SkillBookItem extends ItemBase {
  category: 'skillBook'
}

/**
 * Hồn tinh (docs/rules/soul-levels.md): gộp chồng, không dùng trực tiếp; mỗi viên `points` điểm,
 * điểm dùng chung mọi chỉ số khi nâng cấp hồn tinh (`upgradeSoulLevel`).
 */
export interface SoulCrystalItem extends PricedItemBase {
  category: 'soulCrystal'
  points: number
}

/**
 * Mồi dụ (docs/rules/recruit.md): dùng ngoài trận bằng action `useBait`, + `recruitPercent` % thu
 * phục (xin theo, quy phục, Thị Uy) trong `battles` trận kế. Khẩu vị như thiên tài địa bảo: quái
 * đúng race / hệ nhận % × config.recruit.baitFavoriteMultiplier.
 */
export interface BaitItem extends PricedItemBase {
  category: 'bait'
  recruitPercent: number
  battles: number
  favoriteRaceIds?: string[]
  favoriteElementIds?: string[]
}

/**
 * Món ăn linh thực (docs/rules/cooking.md): nấu ở Đầu bếp, ăn ngoài trận bằng action `eatDish` cho
 * cả đội trong `battles` trận kế; `effects` theo registry MEAL_EFFECTS.
 */
export interface DishItem extends PricedItemBase {
  category: 'dish'
  effects: EffectDef[]
  battles: number
}

/**
 * Mồi câu (docs/rules/gathering.md): tiêu một cái mỗi lần câu cá (`fish { lureItemId }`); số mũ hiếm
 * của cần câu × `rarityFactor` (< 1 thì loài / món hiếm dễ ra hơn).
 */
export interface FishingLureItem extends PricedItemBase {
  category: 'fishingLure'
  rarityFactor: number
}

/** Trường khẩu vị (thiên tài địa bảo, mồi dụ); isFavoriteItem đọc chung. */
export type FavoriteFields = Pick<ConsumableItem, 'favoriteRaceIds' | 'favoriteElementIds'>

export type Item =
  | ConsumableItem
  | BallItem
  | EvolutionStoneItem
  | HeldItem
  | EquipmentItem
  | TraitCrystalItem
  | FusionAidItem
  | KeyItem
  | RecipeScrollItem
  | SeedItem
  | MegaStoneItem
  | TeraShardItem
  | ZCrystalItem
  | MaterialItem
  | FormationScrollItem
  | SkillBookItem
  | SoulCrystalItem
  | BaitItem
  | CharmItem
  | DishItem
  | FishingLureItem

/** Item thuộc một category cụ thể. */
export type ItemOfCategory<C extends ItemCategory> = Extract<Item, { category: C }>

// ---------- Biome (vùng tầng N) ----------

export interface EncounterEntry {
  speciesId: string
  weight: number
}

/** Môi trường tự nhiên của biome kèm trọng số (tung khi vào trận). */
export interface FieldEntry {
  fieldId: string
  weight: number
}

export interface DropEntry {
  itemId: string
  /** % rơi cho mỗi quái địch bị hạ. */
  chance: number
}

/** Một boss của biome, kèm đồ rơi riêng của nó (đồ unique của từng boss). */
export interface BiomeBoss {
  speciesId: string
  /** Trọng số gặp ngẫu nhiên khi đánh quái hoang; bỏ trống = chỉ gặp qua challengeBoss. */
  weight?: number
  /** Đồ rơi riêng khi hạ boss này, thêm vào ngoài drops thường và bossDrops chung của biome. */
  drops: DropEntry[]
  /**
   * Đấu trường boss: môi trường cố định của trận với boss này (lớp có ghi thì thay cho việc tung
   * môi trường tự nhiên, không tốn RNG; lớp không ghi thì tung như thường).
   */
  bossField?: BossField
}

/** Môi trường cố định của trận boss, theo lớp toàn sân. */
export type BossField = Partial<Record<GlobalFieldLayer, string>>

/**
 * Biome (map) của tầng: mỗi tầng mới mở được tung ngẫu nhiên một biome và lưu trong
 * `GameState.floorBiomeIds` (mục "Tầng và biome"). Level quái tính theo tầng (config.floors),
 * không khai báo ở biome.
 */
export interface Biome {
  id: string
  /** % gặp 2 quái thay vì 1. */
  doubleChance: number
  /** % quái hoang ra shiny ở biome này; bỏ trống = config.shiny.wildChance. */
  shinyChance?: number
  encounters: EncounterEntry[]
  drops: DropEntry[]
  /** Đồ rơi chung cho mọi boss của biome (boss tầng và boss ngẫu nhiên), ngoài đồ riêng. */
  bossDrops: DropEntry[]
  /** Boss tầng: phải nằm trong `bosses`; hạ / bắt ở tầng highestFloor thì mở tầng tiếp. */
  floorBossSpeciesId: string
  /** Mọi boss của biome (boss tầng và boss ngẫu nhiên), mỗi loài tối đa một lần. */
  bosses: BiomeBoss[]
  /** % gặp boss ngẫu nhiên thay vì quái thường; bỏ trống = config.boss.chance. */
  bossChance?: number
  /** Ghi đè khoảng bossMultiplier của config. */
  bossMultiplierMin?: number
  bossMultiplierMax?: number
  /** Thời tiết tự nhiên; bỏ trống = luôn môi trường mặc định (không tốn RNG). */
  weather?: FieldEntry[]
  /** Địa hình tự nhiên; bỏ trống = luôn môi trường mặc định (không tốn RNG). */
  terrain?: FieldEntry[]
  /**
   * Trang bị thường rơi được ở map (món gốc, trọng số); bỏ trống = không rơi trang bị. Rơi hay không
   * và bậc tung theo config.equipment.
   */
  equipmentDrops?: WeightedItem[]
  /** Power spot (mục "Dynamax"): Dynamax / Gigantamax dùng được ở map này (trận boss luôn được). */
  powerSpot?: true
  /** Lớp ngự thú sư NPC gặp ở map (docs/rules/trainers.md); bỏ trống = theo hệ của loài trong map. */
  trainerClassIds?: string[]
  /**
   * Hệ chủ đạo của map: map là linh địa cho trứng có quái cùng hệ (docs/rules/breeding-eggs.md mục
   * "Ấp trứng có hoàn cảnh"); bỏ trống = không là linh địa của hệ nào.
   */
  elementIds?: string[]
  /**
   * Câu cá / khai thác ở map này (docs/rules/gathering.md): mỗi cách có danh sách quái gặp được và
   * bảng vật phẩm; bỏ trống cách nào thì map không làm được cách đó.
   */
  gathering?: BiomeGathering
}

/** Món gốc kèm trọng số (danh sách trang bị rơi của map). */
/**
 * Một mức thân mật (src/data/affinityTiers.json; tên ở i18n): từ `from` điểm trở lên, quái nhận các
 * hook trait `hooks` (nguồn hook "affinity"); không chồng, chỉ lấy mức cao nhất đã đạt.
 */
export interface AffinityTierDef {
  id: string
  from: number
  hooks: TraitHookDef[]
}

/**
 * Một bậc tư chất (src/data/aptitudeTiers.json; tên ở i18n; docs/rules/aptitude.md): tỉ lệ gen từ
 * `from` trở lên.
 */
export interface AptitudeTierDef {
  id: string
  from: number
}

/**
 * Một phẩm cấp loài (src/data/speciesRanks.json; tên ở i18n; docs/rules/species-rank.md): tổng chỉ số
 * gốc từ `from` trở lên.
 */
export interface SpeciesRankDef {
  id: string
  from: number
}

/**
 * Nhóm huyết mạch (src/data/bloodlines.json; tên ở i18n; docs/rules/bloodline.md). Thành viên: loài
 * thường có loài trong chuỗi tiến hóa khớp `raceIds` / `elementIds` / `speciesIds`, trừ
 * `excludeSpeciesIds` và trừ loài tổ của nhóm.
 */
export interface BloodlineDef {
  id: string
  ancestorSpeciesIds: string[]
  raceIds?: string[]
  elementIds?: string[]
  speciesIds?: string[]
  excludeSpeciesIds?: string[]
  /** Trait loại `bloodline` của nhóm (cấp theo mốc độ thuần). */
  traitId: string
  /** Tinh huyết của nhóm: vật phẩm tiêu hao có hiệu ứng addPurity đúng nhóm này. */
  essenceItemId: string
  /** Trận đồ của nhóm (rơi từ boss thuộc nhóm, chắc chắn từ loài tổ); bỏ trống = không có. */
  scrollItemId?: string
}

export interface WeightedItem {
  itemId: string
  weight: number
}

/**
 * Tính cách (src/data/natures.json; tên ở i18n; docs/rules/natures.md): `up` +config.nature.percent%,
 * `down` −config.nature.percent%. Cả hai bỏ trống = tính cách trung tính; có thì phải đủ cả hai,
 * khác nhau, không phải hp.
 */
export interface NatureDef {
  id: string
  up?: Exclude<StatName, 'hp'>
  down?: Exclude<StatName, 'hp'>
}

/**
 * Kỹ năng đồng hành (src/data/partnerSkills.json; tên ở i18n; docs/rules/partner-skills.md): hiệu
 * ứng theo registry PARTNER_EFFECTS (registries/partnerEffects.ts) khi quái mang nó đứng đầu đội.
 */
export interface PartnerSkillDef {
  id: string
  effects: EffectDef[]
}

// ---------- Phối hợp đội (docs/rules/team.md) ----------

/**
 * Điều kiện xét trên một quái (cộng hưởng đội, quái nhận hiệu ứng trận pháp, mỗi bên của hợp kích
 * kỹ): theo registry MONSTER_CONDITIONS (registries/teamBonuses.ts), `type` + tham số.
 */
export interface MonsterConditionDef {
  type: string
  [param: string]: unknown
}

/** Một bậc cộng hưởng: từ `count` quái khớp trong đội trở lên thì quái khớp trên sân nhận `hooks`. */
export interface SynergyTier {
  count: number
  hooks: TraitHookDef[]
}

/**
 * Cộng hưởng đội (src/data/synergies.json; tên ở i18n): đếm quái khớp `match` trong cả đội, bậc cao
 * nhất đủ điều kiện thắng (không cộng dồn bậc). `tiers` theo `count` tăng dần.
 */
export interface SynergyDef {
  id: string
  match: MonsterConditionDef
  tiers: SynergyTier[]
}

/** Một yêu cầu của trận pháp với cả đội: theo registry FORMATION_REQUIREMENTS, `type` + tham số. */
export interface FormationRequirementDef {
  type: string
  [param: string]: unknown
}

/**
 * Trận pháp (src/data/formations.json; tên ở i18n): đội đủ mọi `requires` thì quái trên sân khớp
 * `match` (bỏ trống = mọi quái) nhận `hooks`; không đủ thì trận pháp không có tác dụng.
 */
export interface FormationDef {
  id: string
  requires: FormationRequirementDef[]
  match?: MonsterConditionDef
  hooks: TraitHookDef[]
}

/**
 * Hợp kích kỹ (src/data/comboSkills.json): một skill (chung luật kiểm tra với skills.json, nằm
 * trong `GameData.skills`, tên ở i18n skills) cộng cặp điều kiện của hai quái dùng chung. Không
 * nằm trong learnset.
 */
export type RawComboSkill = Skill & { pair: [MonsterConditionDef, MonsterConditionDef] }

/** Phần riêng của hợp kích kỹ trong `GameData.comboSkills`; phần skill ở `GameData.skills`. */
export interface ComboSkillDef {
  id: string
  pair: readonly [MonsterConditionDef, MonsterConditionDef]
}

// ---------- Vị trí ra đòn (docs/rules/hit-locations.md) ----------

/**
 * Bộ phận ra đòn (src/data/bodyParts.json; tên ở i18n): nhắm vào đó thì accuracy / sát thương đổi
 * theo %, cộng bậc chí mạng, trúng thì chạy `hitEffects` (hiệu ứng skill, tỉ lệ × hệ số điểm yếu).
 * Sát thương dồn vào bộ phận ≥ `breakPercent`% max HP thì bộ phận bị phá: chạy `breakEffects`, đồ
 * rơi của quái đó × (1 + `breakDropPercent` / 100). Hạ gục bằng đòn vào bộ phận này thì tỉ lệ rơi
 * yêu đan × (1 + `knockoutCorePercent` / 100).
 */
export interface BodyPartDef {
  id: string
  accuracyPercent: number
  damagePercent: number
  critStage: number
  hitEffects: EffectDef[]
  /** Bỏ trống = không phá được. */
  breakPercent?: number
  breakEffects: EffectDef[]
  breakDropPercent: number
  knockoutCorePercent: number
}

// ---------- Dữ liệu game ----------

/** Dữ liệu thô đọc từ JSON, chưa kiểm tra. */
export interface RawGameData {
  config: BalanceConfig
  elements: ElementDef[]
  raceGroups: RaceGroup[]
  races: RawRace[]
  species: Species[]
  traits: TraitDef[]
  skills: Skill[]
  items: Item[]
  biomes: Biome[]
  statuses: StatusDef[]
  minions: MinionDef[]
  fieldEffects: FieldEffectDef[]
  equipmentAffixes: EquipmentAffixDef[]
  tamerSkills: TamerSkill[]
  tamerRealms: TamerRealmDef[]
  affinityTiers: AffinityTierDef[]
  talentBranches: TalentBranchDef[]
  talents: TalentNodeDef[]
  synergies: SynergyDef[]
  formations: FormationDef[]
  comboSkills: RawComboSkill[]
  natures: NatureDef[]
  bodyParts: BodyPartDef[]
  aptitudeTiers: AptitudeTierDef[]
  speciesRanks: SpeciesRankDef[]
  bloodlines: BloodlineDef[]
  partnerSkills: PartnerSkillDef[]
  recipes: RecipeDef[]
  quests: QuestTemplate[]
  expeditions: ExpeditionDef[]
  trainers: TrainerClass[]
  trialRules: TrialRuleDef[]
  events: EventDef[]
  eventModifiers: EventModifierDef[]
  zones: RawZoneDef[]
  serumEffects: SerumEffectDef[]
  text: TextData
}

/** Dữ liệu đã kiểm tra, tra cứu theo id. */
export interface GameData {
  config: BalanceConfig
  elements: Record<string, ElementDef>
  raceGroups: Record<string, RaceGroup>
  races: Record<string, Race>
  species: Record<string, Species>
  traits: Record<string, TraitDef>
  skills: Record<string, Skill>
  items: Record<string, Item>
  /** Theo id; thứ tự key = thứ tự trong JSON (dùng khi tung map của tầng). */
  biomes: Record<string, Biome>
  statuses: Record<string, StatusDef>
  minions: Record<string, MinionDef>
  fieldEffects: Record<string, FieldEffectDef>
  /** Dòng phụ của trang bị (không có chữ riêng: UI mô tả theo hook). */
  equipmentAffixes: Record<string, EquipmentAffixDef>
  /** Kỹ năng ngự thú sư (docs/rules/tamer.md). */
  tamerSkills: Record<string, TamerSkill>
  /** Tên cảnh giới theo thứ tự (key = thứ tự trong JSON: cảnh giới 0, 1, 2...). */
  tamerRealms: Record<string, TamerRealmDef>
  /** Mức thân mật theo thứ tự tăng dần của `from` (docs/rules/affinity.md). */
  affinityTiers: Record<string, AffinityTierDef>
  /** Nhánh và nút thiên phú (docs/rules/monster-talents.md); thứ tự key = thứ tự trong JSON. */
  talentBranches: Record<string, TalentBranchDef>
  talents: Record<string, TalentNodeDef>
  /** Cộng hưởng đội, trận pháp, phần riêng của hợp kích kỹ (docs/rules/team.md). */
  synergies: Record<string, SynergyDef>
  formations: Record<string, FormationDef>
  comboSkills: Record<string, ComboSkillDef>
  /** Tính cách (docs/rules/natures.md); thứ tự key = thứ tự trong JSON (migrate gán theo băm). */
  natures: Record<string, NatureDef>
  /** Bộ phận ra đòn (docs/rules/hit-locations.md). */
  bodyParts: Record<string, BodyPartDef>
  /** Bậc tư chất theo thứ tự tăng dần của `from` (docs/rules/aptitude.md). */
  aptitudeTiers: Record<string, AptitudeTierDef>
  /** Phẩm cấp loài theo thứ tự tăng dần của `from` (docs/rules/species-rank.md). */
  speciesRanks: Record<string, SpeciesRankDef>
  /** Nhóm huyết mạch (docs/rules/bloodline.md); thứ tự key = thứ tự trong JSON (hòa độ thuần). */
  bloodlines: Record<string, BloodlineDef>
  /** Kỹ năng đồng hành (docs/rules/partner-skills.md). */
  partnerSkills: Record<string, PartnerSkillDef>
  /** Công thức luyện đan (docs/rules/alchemy.md). */
  recipes: Record<string, RecipeDef>
  /** Mẫu nhiệm vụ (docs/rules/quests.md). */
  quests: Record<string, QuestTemplate>
  /** Mẫu thám hiểm (docs/rules/expeditions.md). */
  expeditions: Record<string, ExpeditionDef>
  /** Lớp ngự thú sư NPC (docs/rules/trainers.md). */
  trainers: Record<string, TrainerClass>
  /** Luật bí cảnh / tháp thí luyện (docs/rules/trials.md). */
  trialRules: Record<string, TrialRuleDef>
  /** Event và hiệu ứng toàn cục (docs/rules/events.md). */
  events: Record<string, EventDef>
  eventModifiers: Record<string, EventModifierDef>
  /** Hiểm địa (docs/rules/zones.md): map riêng, không tung làm map của tầng. */
  zones: Record<string, ZoneDef>
  /** Hiệu ứng cấy ghép của huyết thanh (docs/rules/implant.md). */
  serumEffects: Record<string, SerumEffectDef>
  /** Chữ nội dung theo ngôn ngữ; logic core không dùng, chỉ tra qua contentName. */
  text: TextData
}
