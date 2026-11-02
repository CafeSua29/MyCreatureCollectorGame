// Đội hình mẫu (docs/rules/roster.md mục "Đội hình mẫu"): lưu đội hiện tại (thứ tự ô, món đang lắp)
// để áp lại một lần. Mẫu chỉ giữ id: quái / món đã mất thì bỏ qua lúc áp.

/** Món của một quái trong mẫu: món trang bị theo id riêng, đồ gộp chồng theo id vật phẩm. */
export type PresetEquipment =
  { storage: 'instance'; instanceId: string } | { storage: 'stack'; itemId: string }

/** Một đội hình mẫu: id "p<số>", tên người chơi đặt (null = chưa đặt), quái theo thứ tự ô. */
export interface TeamPreset {
  id: string
  name: string | null
  monsterIds: string[]
  /** Món đang lắp lúc lưu, theo id quái. */
  equipmentByMonster: Record<string, PresetEquipment[]>
}

/** Thứ không áp được ở lần áp gần nhất (UI báo cho người chơi); null = đủ hết hoặc chưa áp. */
export interface PresetMissing {
  monsterIds: string[]
  items: PresetEquipment[]
}

export interface TeamPresetState {
  presets: TeamPreset[]
  nextPresetId: number
  lastMissing: PresetMissing | null
}

export interface TeamPresetConfig {
  /** Số mẫu tối đa. */
  slots: number
}
