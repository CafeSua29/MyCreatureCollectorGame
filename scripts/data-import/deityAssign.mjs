/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Gán thần cho map hiểm địa (docs/rules/deities.md): theo hệ chủ đạo của hiểm địa (hệ trong điều
// kiện partyElement, không có thì hệ đầu của loài gặp được nhiều nhất theo trọng số), thần của hệ
// đó. Dùng chung cho zones-import.mjs (sinh lại hiểm địa) và deities-import.mjs (ghi vào bản có sẵn).

/** Hệ chủ đạo của một hiểm địa; null nếu không xác định được. */
export function zoneElementId(zone, speciesById) {
  const required = zone.requirements.find((r) => r.type === 'partyElement')
  if (required) return required.elementId
  const weights = new Map()
  for (const entry of zone.map.encounters) {
    const elementId = speciesById.get(entry.speciesId)?.elementIds?.[0]
    if (elementId) weights.set(elementId, (weights.get(elementId) ?? 0) + entry.weight)
  }
  // Hòa: hệ gặp trước trong bảng gặp (thứ tự Map), kết quả tất định.
  let best = null
  for (const [elementId, weight] of weights)
    if (!best || weight > best[1]) best = [elementId, weight]
  return best?.[0] ?? null
}

/** Hiểm địa kèm deityId của thần cùng hệ chủ đạo (không có thần hợp thì giữ nguyên, bỏ deityId cũ). */
export function withZoneDeity(zone, { speciesById, deityOfElement }) {
  const map = { ...zone.map }
  delete map.deityId
  const deityId = deityOfElement.get(zoneElementId(zone, speciesById))
  return { ...zone, map: deityId ? { ...map, deityId } : map }
}
