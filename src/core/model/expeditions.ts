// Phái quái đi thám hiểm (docs/rules/expeditions.md): mẫu thám hiểm (src/data/expeditions.json), việc
// của quái (`assignment`), bảng thám hiểm và đội đang đi trong state, config.

/** Loại việc của quái: thám hiểm (expeditions.md), động phủ (dwelling.md). */
export const ASSIGNMENT_KINDS = ['expedition', 'dwelling'] as const

export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number]

/** Quái đang làm việc: bị khóa (không vào đội, không fuse / breed / thả, không dùng kẹo). */
export interface MonsterAssignment {
  kind: AssignmentKind
  /** Id của việc (đội thám hiểm "x<số>"). */
  id: string
}

export const EXPEDITION_KINDS = ['mining', 'herbs', 'hunting', 'exploring'] as const

export type ExpeditionKind = (typeof EXPEDITION_KINDS)[number]

/** Một yêu cầu của đội thám hiểm theo registry EXPEDITION_REQUIREMENTS: `type` + tham số. */
export interface ExpeditionRequirementDef {
  type: string
  [param: string]: unknown
}

/** Một món thưởng: tỉ lệ (%), số lượng random đều trong [min, max] rồi × độ thành công. */
export interface ExpeditionDrop {
  itemId: string
  chance: number
  min: number
  max: number
}

/**
 * Mẫu thám hiểm (expeditions.json; tên ở i18n): đi `durationDays` ngày; sức mạnh chuẩn =
 * `powerPerFloor × tầng cao nhất`; thưởng tiền `moneyPerFloor × tầng`, vật phẩm theo bảng rơi,
 * trứng hiếm theo `eggChance`.
 */
export interface ExpeditionDef {
  id: string
  kind: ExpeditionKind
  durationDays: number
  requirements: ExpeditionRequirementDef[]
  powerPerFloor: number
  moneyPerFloor: number
  drops: ExpeditionDrop[]
  /** % mang về một trứng hiếm (× độ thành công, tối đa 100); 0 = không. */
  eggChance: number
}

/** Đội đang đi: về vào ngày `endDay` (việc theo ngày). */
export interface ActiveExpedition {
  id: string
  expeditionId: string
  monsterIds: string[]
  endDay: number
}

export interface ExpeditionState {
  /** Mẫu đang có trên bảng (id, không lặp). */
  board: string[]
  /** Ngày làm mới bảng kế tiếp. */
  refreshDay: number
  active: ActiveExpedition[]
  /** Bộ đếm id đội "x<số>". */
  nextId: number
}

export interface ExpeditionConfig {
  /** Số mẫu trên bảng (random trong [boardMin, boardMax]), làm mới mỗi refreshDays ngày. */
  boardMin: number
  boardMax: number
  refreshDays: number
  /** Độ thành công kẹp trong [minSuccess, maxSuccess]. */
  minSuccess: number
  maxSuccess: number
  /** EXP mỗi quái khi về: expPerDayPerFloor × số ngày × tầng cao nhất. */
  expPerDayPerFloor: number
  /** % mỗi quái bị trọng thương khi về (awakening.injuryBattles trận). */
  injuryChance: number
  /** Thân mật mỗi ngày đang đi. */
  affinityPerDay: number
}
