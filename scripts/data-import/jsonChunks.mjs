/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Sửa mảng JSON cấp đầu (items.json) theo từng phần tử để giữ nguyên văn bản các phần tử không đổi
// (file không theo một định dạng chuẩn, ghi lại cả file sẽ đổi định dạng hàng nghìn dòng). Dùng chung cho
// equipment-sets-import.mjs và race-slayers-import.mjs.

/** Văn bản từng phần tử cấp đầu của mảng JSON (giữ nguyên định dạng, kể cả thụt lề đầu dòng). */
export function splitTopLevel(json) {
  const result = []
  let depth = 0
  let inString = false
  let start = -1
  for (let i = 0; i < json.length; i++) {
    const char = json[i]
    if (inString) {
      if (char === '\\') i++
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{' || char === '[') {
      depth++
      if (depth === 2) start = json.lastIndexOf('\n', i) + 1
    } else if (char === '}' || char === ']') {
      if (depth === 2) result.push(json.slice(start, i + 1))
      depth--
    }
  }
  return result
}

/** Văn bản một phần tử mới, thụt lề như phần tử cấp đầu của mảng (2 dấu cách). */
export const chunkOf = (value) => '  ' + JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')

/** Ghép lại mảng JSON từ văn bản các phần tử. */
export const joinChunks = (chunks) => '[\n' + chunks.join(',\n') + '\n]\n'
