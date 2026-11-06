/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Id camelCase cho spell / trait Siralim nhập bổ sung (siralim-update-fetch.mjs): khóa của bảng quy
// đổi (siralim-spells/part5.mjs, siralim-traits/part9.mjs) là id này; id trùng nội dung đã có thì
// file chờ thêm hậu tố nhưng vẫn ghi `conversionKey` = id gốc để convert.mjs tìm đúng quy đổi.

/** "Mermaid's Kiss" → "mermaidsKiss", "Co-Ray" → "coRay", "EF5 Twister" → "ef5Twister". */
export function camelId(name) {
  const words = name
    .normalize('NFKD')
    .replace(/['’!?.,:]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
  return words
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`
    )
    .join('')
}

/** Id chưa dùng: id gốc, trùng thì thêm hậu tố "Siralim". */
export function freshId(name, takenIds) {
  const base = camelId(name)
  const id = takenIds.has(base) ? `${base}Siralim` : base
  takenIds.add(id)
  return { id, conversionKey: base }
}
