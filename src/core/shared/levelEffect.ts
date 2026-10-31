// Hệ số hiệu ứng theo cấp, dùng chung cho trait cấp (và trang bị sau này).
// Tuyến tính (mục Trait): hiệu ứng = gốc × (1 + step × (cấp − 1)). Lý do không dùng hàm mũ:
// % của trait nhân lên chỉ số vốn đã scale vô hạn nhờ level, gen, fuse.

/** Hệ số nhân hiệu ứng ở `level` (cấp 1 = 1). `step` là levelEffectStep trong balance.json. */
export function levelEffectScale(step: number, level: number): number {
  return 1 + step * (level - 1)
}
