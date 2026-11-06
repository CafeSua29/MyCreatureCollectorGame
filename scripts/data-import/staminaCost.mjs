/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi số lần dùng của game gốc (PP Pokémon, Charges Siralim, hồi chiêu Palworld) sang giá thể lực (docs/rules/stamina.md mục
// "Giá theo game gốc"). Dùng bởi stamina-cost-import.mjs; tách riêng để test.

/**
 * Số lần dùng → giá: `REFERENCE_COST × (REFERENCE_USES / lần dùng) ^ USES_EXPONENT`, kẹp [1, MAX_COST]. Mốc theo
 * Temtem (giá chiêu ~90 power trung vị 20 ≈ Surf / Thunderbolt 15 PP); mũ 0,6 để PP 40 ≈ 11 và PP 5 ≈ 39, khớp
 * khoảng giá 5–39 của Temtem. MAX_COST = thang thể lực (`stamina.max`).
 */
const REFERENCE_USES = 15
const REFERENCE_COST = 20
const USES_EXPONENT = 0.6
export const MAX_COST = 100

export const costFromUses = (uses) =>
  Math.min(
    MAX_COST,
    Math.max(1, Math.round(REFERENCE_COST * (REFERENCE_USES / uses) ** USES_EXPONENT))
  )

/**
 * Palworld đo hồi chiêu (CT, giây) chứ không có số lần dùng: số lần dùng tương đương = cửa sổ 120 giây / CT
 * (CT 8 ≈ 15 lần ≈ 20 thể lực, CT 30 ≈ 44, CT 2 ≈ 9).
 */
export const PALWORLD_WINDOW = 120
