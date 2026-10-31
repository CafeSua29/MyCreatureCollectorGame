// Biến hình trong trận (mục "Biến hình trong trận" ở transformation.md): Mega, Dynamax / Gigantamax,
// Tera, Hiện nguyên hình của Hóa hình (docs/rules/human-form.md), Song thú hợp thể
// (docs/rules/battle-merge.md). Thêm loại mới = thêm vào
// TRANSFORM_KINDS + một handler ở battle/transformHandlers.ts + một mục ở HUMAN_FORM_ON_TRANSFORM.

import type { Monster } from './monster'

/** Loại biến hình; mỗi phe dùng mỗi loại tối đa một lần mỗi trận. */
export const TRANSFORM_KINDS = [
  'mega',
  'dynamax',
  'tera',
  'trueForm',
  'merge',
  'ultraBurst'
] as const

export type TransformKind = (typeof TRANSFORM_KINDS)[number]

/**
 * Quái đang ở nhân hình biến hình loại này thì giữ nhân hình (`keep`) hay về bản thể trong trận đó
 * (`revert`: bỏ % nhân hình, khóa ô skill nhân hình; docs/rules/human-form.md).
 */
export const HUMAN_FORM_ON_TRANSFORM: Readonly<Record<TransformKind, 'keep' | 'revert'>> = {
  mega: 'revert',
  dynamax: 'revert',
  tera: 'keep',
  trueForm: 'revert',
  merge: 'keep',
  ultraBurst: 'revert'
}

/** Hệ Tera đặc biệt: giữ hệ gốc khi phòng thủ, tăng sát thương mỗi hệ một lần (như Pokémon). */
export const STELLAR = 'stellar'

/**
 * Lý do không biến hình được (mã lỗi `transformUnavailable`): thiếu vật phẩm chìa khóa, phe đã dùng
 * loại này, quái đã biến hình trong trận, quái không hợp lệ (sai loài, không cầm đá, quái fuse...),
 * không phải power spot, Tera Orb hết sạc, trận độ kiếp (docs/rules/awakening.md), luật noTransforms
 * của bí cảnh / tháp (docs/rules/trials.md); hợp thể (docs/rules/battle-merge.md): phe không có
 * đúng hai quái thường còn sống trên sân, thân mật chưa đủ, hai quái không hợp nhau.
 */
export const TRANSFORM_FAIL_REASONS = [
  'noKeyItem',
  'alreadyUsedBySide',
  'monsterAlreadyTransformed',
  'notEligible',
  'notPowerSpot',
  'teraOrbEmpty',
  'tribulation',
  'trialRule',
  'needsPair',
  'affinityTooLow',
  'incompatible'
] as const

export type TransformFailReason = (typeof TRANSFORM_FAIL_REASONS)[number]

/**
 * Lý do không dùng Z-Move được (mã lỗi `zMoveUnavailable`, docs/rules/z-moves.md): thiếu Vòng Z,
 * phe đã dùng Z-Move trong trận (kể cả hai quái cùng xin trong một lượt), quái không cầm Z-Crystal
 * hợp skill, quái đang / sắp Dynamax, trận độ kiếp.
 */
export const ZMOVE_FAIL_REASONS = [
  'noKeyItem',
  'alreadyUsedBySide',
  'noCrystal',
  'dynamaxed',
  'tribulation'
] as const

export type ZMoveFailReason = (typeof ZMOVE_FAIL_REASONS)[number]

/**
 * Biến hình của một quái trong trận: chỉ có trong trận (như `battleMaxHpDelta`), mất khi hết trận.
 * Lưu trên quái vì chỉ số gốc (Mega) và max HP (Dynamax) phải như nhau ở mọi nơi tính chỉ số / HP.
 */
export interface BattleTransform {
  kind: TransformKind
  /** Dạng hiển thị: loài dạng Mega (chỉ số gốc, hệ) hoặc dạng gmax (chỉ hiển thị, chiêu G-Max). */
  formSpeciesId?: string
  /** Hệ Tera đang dùng (id hệ hoặc STELLAR). */
  teraElementId?: string
  /** Hệ của quái trước khi biến hình: STAB hệ gốc của Tera, trả lại khi hết trận. */
  originalElementIds: string[]
  /** Dynamax: số cuối lượt còn lại (tính cả lượt biến). */
  turnsLeft?: number
  /**
   * Biến hình đã kết thúc (Dynamax hết lượt / rời sân): không còn tác dụng nhưng vẫn tính là quái đã
   * biến hình trong trận (mỗi quái tối đa 1 biến hình mỗi trận).
   */
  ended?: true
  /** Tera Stellar: các hệ đã được tăng sát thương (mỗi hệ một lần mỗi trận). */
  stellarBoostedElementIds?: string[]
  /**
   * Hợp thể, chỉ trên quái chính (docs/rules/battle-merge.md): bản chụp quái phụ lúc hợp thể (chỉ
   * số, skill, trait, trang bị của nó áp lên thực thể; quái phụ thật vẫn nằm trong đội, ẩn khỏi sân)
   * và ô của quái phụ (tách ra thì về ô này).
   */
  mergePartner?: MergePartner
  /** Hợp thể, chỉ trên quái phụ: id quái chính đang mang nó (quái phụ không ở trên sân). */
  mergedIntoId?: string
}

/**
 * Dạng chỉ có trong trận (docs/rules/battle-forms.md): chỉ số gốc và hệ theo loài dạng; ability giữ
 * theo loài gốc (như Pokémon: Zen Mode, Stance Change vẫn là ability của dạng thường).
 */
export interface BattleForm {
  /** Loài dạng (formKind battleOnly, formOf = loài gốc của quái). */
  speciesId: string
  /** Hệ trước khi đổi dạng: trả lại khi về dạng thường / hết trận. */
  originalElementIds: string[]
  /** Về dạng thường khi rời sân (Zen Mode, Stance Change); bỏ trống = giữ tới hết trận. */
  untilLeave?: true
}

/** Quái phụ của thực thể hợp thể. */
export interface MergePartner {
  monster: Monster
  slot: number
}

/** Quái phụ của thực thể hợp thể đang có tác dụng (chỉ quái chính có); undefined = không hợp thể. */
export function mergePartnerOf(monster: Monster): Monster | undefined {
  const transform = monster.battleTransform
  return transform && !transform.ended ? transform.mergePartner?.monster : undefined
}

/** Quái đang bị hợp vào quái khác (quái phụ): ẩn khỏi sân, không là dự bị, không tính trong đội. */
export const isMergedAway = (monster: Monster): boolean =>
  monster.battleTransform?.ended !== true && monster.battleTransform?.mergedIntoId !== undefined

/**
 * Skill dùng được trong trận: skill của quái, thực thể hợp thể thêm skill của quái phụ (không lặp).
 * Mọi chỗ trong trận hỏi "quái biết skill nào" đi qua đây.
 */
export function battleSkillIds(monster: Monster): string[] {
  const partner = mergePartnerOf(monster)
  return partner ? [...new Set([...monster.skillIds, ...partner.skillIds])] : monster.skillIds
}

/** Biến hình boss sẽ dùng ở lượt đầu (tung khi mở trận boss). */
export interface PlannedTransform {
  monsterId: string
  kind: TransformKind
  /** Mega: dạng đã chọn (loài có nhiều dạng Mega thì tung một). */
  formSpeciesId?: string
}
