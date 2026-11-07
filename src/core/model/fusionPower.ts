// Fusion Power (docs/rules/fusion-power.md, Fusion Power của Cassette Beasts): chiêu riêng của thực thể
// hợp thể, sinh theo cặp loài (thứ tự hợp thể) lúc dùng.

/** Power theo loại chiêu như gốc: một địch 200; cả phe kèm buff 150, kèm debuff 112. */
export interface FusionPowerPowers {
  single: number
  teamBuff: number
  teamDebuff: number
}

/** Cấu hình Fusion Power (balance.json, khóa `fusionPower`). */
export interface FusionPowerConfig {
  power: FusionPowerPowers
  /** Số lượt buff / debuff mặc định (gốc 3), trừ `shortStatusTurns`. */
  statusTurns: number
  /** Trạng thái thời hạn riêng (gốc: Locked On, Flinched, Bomb 1 lượt). */
  shortStatusTurns: Record<string, number>
  buffStatusIds: string[]
  debuffStatusIds: string[]
  /** Buff phản đòn tiếp xúc theo hệ của chiêu (gốc: Contact Dmg theo hệ). */
  contactStatusByElement: Record<string, string>
  /** Hệ số điểm AI của Fusion Power khi Orb Fusion còn đầy máu (gốc: đầy thanh thì dùng). */
  orbAiMultiplier: number
}
