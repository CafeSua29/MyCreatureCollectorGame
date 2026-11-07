// Dấu ấn trên quái (docs/rules/marks.md, ý từ Mewgenics): sẹo, đột biến, thích nghi, ám ảnh, chiến
// tích. Mỗi dấu là một mục của src/data/marks.json (union theo `kind`); quái chỉ lưu nguyên liệu
// (id dấu, đối tượng, cấp, nguồn gốc, bộ đếm), hiệu lực tính lại từ dữ liệu.

import type { TraitHookDef } from './content'

/** Năm loại dấu ấn. */
export const MARK_KINDS = ['scar', 'mutation', 'adaptation', 'trauma', 'trophy'] as const
export type MarkKind = (typeof MARK_KINDS)[number]

/**
 * Loại đối tượng của dấu theo đối tượng (thích nghi, ám ảnh, chiến tích): id đối tượng lưu trên quái
 * (`MarkInstance.targetId`), thay chỗ giữ `$target` trong hook của dấu. `status` = debuff;
 * `weather` / `terrain` = môi trường lớp đó trừ mặc định (fieldEffects).
 */
export const MARK_TARGET_KINDS = [
  'element',
  'status',
  'weather',
  'terrain',
  'species',
  'race'
] as const
export type MarkTargetKind = (typeof MARK_TARGET_KINDS)[number]

/** Chỗ giữ id đối tượng trong params hook của dấu (chuỗi đúng bằng chỗ giữ). */
export const MARK_TARGET_PLACEHOLDER = '$target'

/** Nguồn nhận dấu (ghi trong nguồn gốc của dấu và lý lịch). */
export const MARK_SOURCES = [
  'partBreak',
  'crit',
  'faint',
  'status',
  'nearDeath',
  'adaptation',
  'trauma',
  'resolve',
  'bossKill',
  'worldBoss',
  'raceKills',
  'tribulation',
  'hardened',
  'hazard',
  'event',
  'item',
  'virus',
  'implant',
  'wild',
  'birth',
  'inherited'
] as const
export type MarkSource = (typeof MARK_SOURCES)[number]

/** Lý do mất dấu. */
export const MARK_REMOVALS = ['treated', 'item', 'rebirth', 'resolved', 'hardened'] as const
export type MarkRemoval = (typeof MARK_REMOVALS)[number]

/** Phần chung của mọi mục dấu. */
interface MarkDefBase {
  id: string
  /** Hook trait của dấu, × hệ số cấp (như trait cấp); có thể chứa chỗ giữ `$target`. */
  hooks: TraitHookDef[]
  /** Trait dấu cho (không chiếm ô trait), cấp = cấp dấu. */
  traitId?: string
  /** Cấp tối đa; bỏ trống = không trần. */
  maxLevel?: number
}

/** Dấu theo bộ phận: chọn theo trọng số trong các mục cùng loại, cùng bộ phận. */
interface PartMarkFields {
  partId: string
  weight: number
}

/**
 * Sẹo: thương tật ở một bộ phận. Sẹo vết thương (không có `statusIds`) ra từ phá bộ phận, chí mạng,
 * gục, cấy ghép hỏng; sẹo trạng thái (có `statusIds`) ra khi trạng thái đó còn lúc hết trận.
 */
export interface ScarMarkDef extends MarkDefBase, PartMarkFields {
  kind: 'scar'
  statusIds?: string[]
  /** Dấu tốt (cùng bộ phận) sẹo chai thành sau đủ trận thắng (mục "Sẹo chai thành sẹo chiến"). */
  hardensInto?: string
}

/** Đột biến: bộ phận biến dạng, tốt hoặc hai mặt; di truyền khi breeding. */
export interface MutationMarkDef extends MarkDefBase, PartMarkFields {
  kind: 'mutation'
  /** % truyền cho con mỗi lần breeding; bỏ trống = config.marks.mutationInheritPercent. */
  inheritPercent?: number
}

/** Thích nghi: quen dần với một hệ / trạng thái / môi trường hay gặp (bộ đếm, không RNG). */
export interface AdaptationMarkDef extends MarkDefBase {
  kind: 'adaptation'
  target: 'element' | 'status' | 'weather' | 'terrain'
  /** Chỉ các đối tượng này; bỏ trống = mọi id của loại. */
  targetIds?: string[]
  /** Nhận / lên cấp khi bộ đếm đạt threshold × (cấp hiện tại + 1). */
  threshold: number
  /** % truyền cho con; bỏ trống = config.marks.adaptationInheritPercent. */
  inheritPercent?: number
}

/** Ám ảnh: gục nhiều lần dưới tay một loài / một hệ; vượt qua thì thành chiến tích `resolveInto`. */
export interface TraumaMarkDef extends MarkDefBase {
  kind: 'trauma'
  target: 'species' | 'element'
  resolveInto: string
}

/**
 * Cách nhận chiến tích: hạ boss tầng / boss thường (đòn hạ gục), ra sân trong trận thắng boss thế
 * giới, hạ đủ quái một race, vượt ám ảnh, độ kiếp thành công, sẹo chai lại.
 */
export const TROPHY_TRIGGERS = [
  'bossKill',
  'worldBoss',
  'raceKills',
  'resolve',
  'tribulation',
  'hardened'
] as const
export type TrophyTrigger = (typeof TROPHY_TRIGGERS)[number]

/** Chiến tích: huân chương của con quái, không mất. */
export interface TrophyMarkDef extends MarkDefBase {
  kind: 'trophy'
  trigger: TrophyTrigger
  /** Đối tượng (raceKills: race; resolve: cùng loại với ám ảnh). */
  target?: MarkTargetKind
  /** raceKills: hạ đủ threshold × (cấp + 1) quái race đó thì nhận / lên cấp. */
  threshold?: number
  /** Sẹo chiến (hardened) gắn với bộ phận của sẹo cũ. */
  partId?: string
}

export type MarkDef =
  ScarMarkDef | MutationMarkDef | AdaptationMarkDef | TraumaMarkDef | TrophyMarkDef

/** Nơi và hoàn cảnh nhận dấu lần đầu. */
export interface MarkOrigin {
  source: MarkSource
  /** Tầng lúc nhận; null = ngoài tầng (thị trấn, đan, breeding). */
  floor: number | null
  /** Loài đối thủ liên quan (đòn gây sẹo, quái làm gục...). */
  opponentSpeciesId?: string
}

/** Một dấu trên quái. */
export interface MarkInstance {
  markId: string
  /** Id đối tượng (dấu theo đối tượng); dấu khác không có. */
  targetId?: string
  /** Cấp, nguyên ≥ 1, ≤ maxLevel của mục. */
  level: number
  origin: MarkOrigin
  /** Sẹo: số trận thắng quái đã ra sân từ khi có sẹo (chai thành sẹo chiến). */
  winBattles?: number
  /** Ám ảnh: số lần đã hạ đúng đối tượng (vượt qua nỗi sợ). */
  resolveCount?: number
}

/** Thay đổi dấu của một quái (log trận / ngoài trận, lý lịch). */
export type MarkChange =
  | {
      kind: 'gained'
      markId: string
      targetId?: string
      /** Cấp sau khi nhận (1 = dấu mới, > 1 = lên cấp). */
      level: number
      origin: MarkOrigin
    }
  | { kind: 'removed'; markId: string; targetId?: string; reason: MarkRemoval }

/** Số cân bằng của dấu ấn (balance.json, khóa `marks`; số tạm). */
export interface MarkConfig {
  /** Mỗi bộ phận bị phá: % đột biến, trượt thì % sẹo. */
  mutationOnBreakPercent: number
  scarOnBreakPercent: number
  /** Đòn chí mạng lấy ≥ critScarHpPercent % max HP: % sẹo ở bộ phận bị nhắm (không nhắm: thân). */
  critScarHpPercent: number
  scarOnCritPercent: number
  /** Bộ phận nhận sẹo khi đòn chí mạng không nhắm. */
  critDefaultPartId: string
  /** Gục trong trận: % sẹo ở bộ phận ngẫu nhiên. */
  scarOnFaintPercent: number
  /** Trạng thái nặng còn lúc hết trận: % sẹo của trạng thái. */
  scarOnStatusPercent: number
  /** Thắng với ≤ nearDeathHpPercent % máu (đã ra sân): % đột biến. */
  nearDeathHpPercent: number
  mutationOnNearDeathPercent: number
  /** Ám ảnh: số lần gục (trong các trận gần đây) để nhận; số lần hạ đúng đối tượng để vượt qua. */
  traumaThreshold: number
  resolveThreshold: number
  /** Sẹo chai: đủ số trận thắng thì mỗi trận thắng tung % thành sẹo chiến. */
  scarHardenBattles: number
  scarHardenPercent: number
  /** Linh dịch khỏi bệnh: % đột biến. */
  mutationOnVirusCurePercent: number
  /** Cấy ghép thất bại: % sẹo ở bộ phận implantScarPartId. */
  scarOnImplantFailPercent: number
  implantScarPartId: string
  /** Quái hoang / boss sinh ra: % mang sẵn một sẹo / đột biến. */
  wildMarkPercent: number
  /** Trong dấu sẵn của quái hoang: % là đột biến (còn lại là sẹo). */
  wildMutationShare: number
  /** Con breeding: % đột biến mới bẩm sinh. */
  birthMutationPercent: number
  /** % truyền mặc định của đột biến / thích nghi. */
  mutationInheritPercent: number
  adaptationInheritPercent: number
  /** Thầy thuốc: giá chữa mỗi cấp dấu, nhân tầng cao nhất. */
  treatCostPerLevel: number
}

/** Đòn chí mạng lớn trúng quái ta trong trận (sẹo chí mạng). */
export interface MarkWound {
  partId: string
  opponentSpeciesId?: string
}

/** Một lần quái ta gục: loài và hệ đòn của kẻ hạ gục (ám ảnh); bỏ trống = không rõ. */
export interface MarkFoe {
  speciesId?: string
  elementId?: string
}

/** Một quái địch quái ta hạ gục (vượt ám ảnh, chiến tích). */
export interface MarkKill {
  speciesId?: string
  raceId: string
  elementIds: string[]
  /** Quái bị hạ là boss (trận boss, hệ số boss > 1). */
  boss: boolean
}

/**
 * Bản ghi dấu ấn trong trận của một quái ta (BattleRecord.marks): chỉ ghi khi dữ liệu có mục dấu,
 * tung / đếm lúc hết trận (rollBattleMarks).
 */
export interface MarkBattleRecord {
  /** Số lần trúng đòn skill của địch theo hệ của skill. */
  hitElements?: Record<string, number>
  /** Số lần dính debuff theo id trạng thái. */
  statuses?: Record<string, number>
  /** Thời tiết / địa hình (không mặc định) quái từng đứng trên sân lúc hết lượt. */
  fields?: string[]
  critWounds?: MarkWound[]
  faintedBy?: MarkFoe[]
  kills?: MarkKill[]
}

/**
 * Dòng log khi quái nhận / lên cấp / mất dấu (cùng dạng ở log trận, log ngoài trận và log event):
 * cấp sau khi nhận, nguồn; lý do mất.
 */
export type MarkLogEntry =
  | {
      type: 'markGained'
      monsterId: string
      markId: string
      targetId?: string
      level: number
      source: MarkSource
    }
  | {
      type: 'markRemoved'
      monsterId: string
      markId: string
      targetId?: string
      reason: MarkRemoval
    }
