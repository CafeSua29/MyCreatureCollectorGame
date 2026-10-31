/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải "type" chính thức của các loài Digimon (digi-api.com) vào scripts/data-import/digimon-types.json
// cho races-split.mjs. Chạy: node scripts/data-import/digimon-types-fetch.mjs (cần mạng). Tra theo tên
// tiếng Anh của loài (src/data/i18n/en/species.json); loài không tìm thấy ghi danh sách rỗng.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const species = JSON.parse(
  readFileSync(new URL('../../src/data/species.json', import.meta.url), 'utf8')
)
const names = JSON.parse(
  readFileSync(new URL('../../src/data/i18n/en/species.json', import.meta.url), 'utf8')
)
const OUT = new URL('./digimon-types.json', import.meta.url)

// Chạy lại chỉ tải loài chưa có type (API giới hạn tốc độ: giãn cách giữa các lần gọi).
const result = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const digimon = species.filter((s) => s.source === 'digimon')
for (const s of digimon) {
  if (result[s.id]?.length) continue
  for (const name of [names[s.id], s.id].filter(Boolean)) {
    try {
      const response = await fetch(
        `https://digi-api.com/api/v1/digimon/${encodeURIComponent(name)}`
      )
      const body = response.ok ? await response.json() : null
      result[s.id] = (body?.types ?? []).map((t) => t.type)
    } catch {
      result[s.id] = []
    }
    await sleep(400)
    if (result[s.id].length) break
  }
}
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`)
const found = Object.values(result).filter((types) => types.length > 0).length
console.log(`Digimon: ${digimon.length}, có type: ${found}`)
