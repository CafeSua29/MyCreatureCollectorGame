/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải toàn bộ Digimon của digi-api.com (cấp, type, thuộc tính, field, mô tả tiếng Anh, tiến hóa trước /
// sau) vào scripts/data-import/digimon-source.json, đầu vào của species-batch-import.mjs (đợt "nguồn
// thật", content-sources-more.md). Chạy: node scripts/data-import/digimon-source-fetch.mjs (cần mạng).
// Chạy lại chỉ tải id chưa có (API giới hạn tốc độ: giãn cách giữa các lần gọi).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = new URL('./digimon-source.json', import.meta.url)
const API = 'https://digi-api.com/api/v1/digimon'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
      if (response.status === 404) return null
    } catch {
      // thử lại sau
    }
    await sleep(2000 * (attempt + 1))
  }
  console.warn(`Không tải được ${url} (bỏ qua, chạy lại để thử tiếp)`)
  return null
}

/** Giữ các trường cần cho việc nhập (bỏ ảnh, mô tả tiếng Nhật, skill). */
function slim(body) {
  const description = body.descriptions?.find((d) => d.language === 'en_us')?.description ?? ''
  return {
    id: body.id,
    name: body.name,
    xAntibody: body.xAntibody,
    levels: (body.levels ?? []).map((l) => l.level),
    types: (body.types ?? []).map((t) => t.type),
    attributes: (body.attributes ?? []).map((a) => a.attribute),
    fields: (body.fields ?? []).map((f) => f.field),
    releaseDate: body.releaseDate ?? '',
    description,
    priorEvolutions: (body.priorEvolutions ?? []).map((e) => e.digimon),
    nextEvolutions: (body.nextEvolutions ?? []).map((e) => e.digimon)
  }
}

const result = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { digimon: [] }
const have = new Set(result.digimon.map((d) => d.id))
const first = await fetchJson(`${API}?pageSize=1`)
const total = first.pageable.totalElements
for (let id = 1; id <= total + 20; id++) {
  if (have.has(id)) continue
  const body = await fetchJson(`${API}/${id}`)
  if (body) result.digimon.push(slim(body))
  await sleep(300)
  if (id % 100 === 0) {
    writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`)
    console.log(`đã tải tới id ${id}`)
  }
}
result.digimon.sort((a, b) => a.id - b.id)
writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`)
console.log(`Digimon: ${result.digimon.length} / ${total}`)
