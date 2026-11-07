// Log ngoài trận (docs/rules/game-log.md): những gì action gần nhất gây ra mà không nằm trong log
// trận, để UI báo người chơi. gameReducer xóa log trước mỗi action đổi state; hàm action chỉ ghi
// thêm (appendLog), không tự xóa.

import type { Decimal } from '../shared'
import type { CraftStation } from './alchemy'
import type { EquipmentRarity } from './content'
import type { EventLogEntry } from './events'
import type { MarkLogEntry } from './marks'
import type { GatheringEncounter, GatheringMethod } from './gathering'
import type { SafariLogEntry } from './safari'
import type { PresetEquipment } from './teamPresets'
import type { DayEvent } from './time'
import type { ItemReward } from './trainers'
import type { ZoneStepResult } from './zones'

/** Kết quả một lần fuse: thành công, thất bại (quái gốc mất), thất bại có Bùa Hộ Mệnh. */
export type FuseOutcome = 'success' | 'failed' | 'protected'

/** Kết quả một lần khế ước: thành công, thất bại, thất bại rồi quái bỏ trốn. */
export type ContractOutcome = 'success' | 'failed' | 'escaped'

/** Dòng log của các action ngoài trận (không thuộc thời gian trôi, event, khu bảo tồn). */
export type ActionLogEntry =
  /** Câu cá / khai thác (docs/rules/gathering.md); encounter khác 'none' thì trận vừa mở. */
  | {
      type: 'gathered'
      method: GatheringMethod
      tier: number
      /** Mồi câu đã dùng (null = không dùng). */
      lureItemId: string | null
      items: ItemReward[]
      encounter: GatheringEncounter
    }
  /** Áp đội hình mẫu mà có quái / món không còn (bỏ qua). */
  | { type: 'presetMissing'; presetId: string; monsterIds: string[]; items: PresetEquipment[] }
  /** Luyện đan / luyện khí / nấu ăn `times` lần (docs/rules/alchemy.md). */
  | {
      type: 'crafted'
      station: CraftStation
      recipeId: string
      successes: number
      failures: number
    }
  /** Bước khám phá hiểm địa (docs/rules/zones.md); bước trận thì diễn biến ở log trận. */
  | { type: 'zoneStep'; zoneId: string; result: ZoneStepResult }
  /** Chọn ân huệ bí cảnh (docs/rules/trial-boons.md): cấp sau khi chọn. */
  | { type: 'trialBoonChosen'; boonId: string; stacks: number }
  /** Bỏ lựa chọn ân huệ, nhận tiền. */
  | { type: 'trialBoonSkipped'; money: Decimal }
  /** Fuse vào quái gốc `baseId` (docs/rules/fusing.md). */
  | { type: 'fused'; baseId: string; outcome: FuseOutcome }
  /** Phi thăng (docs/rules/ascension.md): lần thứ mấy, Tiên nguyên nhận, tầng khởi đầu. */
  | { type: 'ascended'; count: number; essenceGained: Decimal; startFloor: number }
  /** Đã chọn thiên mệnh sau phi thăng; rỗng = Phàm nhân. */
  | { type: 'destiniesChosen'; destinyIds: string[] }
  /** Đột phá cảnh giới (docs/rules/tamer.md); realm = cảnh giới sau lần thử. */
  | { type: 'breakthrough'; success: boolean; realm: number }
  /** Khế ước quái (docs/rules/tamer.md mục "Khế ước"). */
  | { type: 'contractAttempted'; monsterId: string; outcome: ContractOutcome }
  /**
   * Quái nhận / lên cấp / mất dấu ấn ngoài trận (đan, Thầy thuốc, event, luân hồi, breeding, linh
   * dịch...; docs/rules/marks.md). Dấu trong trận ghi ở log trận.
   */
  | MarkLogEntry
  /**
   * Cấy ghép huyết thanh bậc `tierId` (docs/rules/implant.md): `fails` = số lần thất bại sau lần
   * này; `died` = thất bại lần cuối, quái chết hẳn (hồn phách id = monsterId).
   */
  | {
      type: 'implanted'
      monsterId: string
      tierId: string
      success: boolean
      fails: number
      died: boolean
    }
  /** Nghiên cứu loài lên cấp (docs/rules/species-research.md), ghi ở gameReducer. */
  | { type: 'researchLevelUp'; speciesId: string; level: number }
  /** Đúc trang bị ở Thợ rèn (docs/rules/equipment-forge.md). */
  | { type: 'equipmentCast'; instanceId: string; itemId: string; rarity: EquipmentRarity }
  /** Phân giải trang bị: tổng thứ nhận được của cả lần (hồn tinh tính bằng điểm). */
  | {
      type: 'equipmentSalvaged'
      instanceIds: string[]
      enhanceStones: number
      refiningStones: number
      soulPoints: number
      /** Khí linh đã thu phục về kho khí linh. */
      spirits: number
    }
  /** Quay Cây thần (docs/rules/gacha.md): id các trứng mới theo thứ tự. */
  | { type: 'gachaPulled'; eggIds: string[] }

/**
 * Một dòng log ngoài trận: sự kiện khi thời gian trôi, kết quả event, khu bảo tồn, action khác.
 * Thêm loại = thêm vào union con đúng chủ đề + mục ở GAME_LOG_FIELDS (validateGameLog).
 */
export type GameLogEntry = DayEvent | EventLogEntry | SafariLogEntry | ActionLogEntry

export type GameLogType = GameLogEntry['type']

/** Ghi thêm dòng vào log ngoài trận của state (không sửa state cũ). */
export function appendLog<S extends { log: readonly GameLogEntry[] }>(
  state: S,
  ...entries: readonly GameLogEntry[]
): S {
  return entries.length === 0 ? state : { ...state, log: [...state.log, ...entries] }
}
