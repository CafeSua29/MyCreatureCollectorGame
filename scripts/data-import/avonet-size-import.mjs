// Bổ sung cân nặng thật cho loài chim còn thiếu sau animal-size-import.mjs, từ AVONET (Tobias et al.
// 2022, khối lượng trung bình theo loài, gram). Chạy: node scripts/data-import/avonet-size-import.mjs
// (cần mạng: tự tải ELEData.zip ở https://figshare.com/articles/dataset/16586228, khoảng 18 MB).
// Chỉ xét loài thuộc nhóm race chim có tên khoa học trong animal-size-report.json (`missing`), khớp
// đúng tên hai phần; cập nhật species.json và báo cáo.

import { readFileSync, writeFileSync } from 'node:fs'

import { fetchZipEntry } from './zip.mjs'

const ELE_DATA = 'https://ndownloader.figshare.com/files/38429873'
const AVONET_CSV = 'ELEData/TraitData/AVONET1_BirdLife.csv'
const DATA = new URL('../../src/data/', import.meta.url)
const SPECIES_PATH = new URL('species.json', DATA)
const REPORT_PATH = new URL('./animal-size-report.json', import.meta.url)
const GRAMS_PER_KG = 1000

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const groupOf = new Map(
  JSON.parse(readFileSync(new URL('races.json', DATA), 'utf8')).map((r) => [r.id, r.groupId])
)
const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'))

const [header, ...lines] = (await fetchZipEntry(ELE_DATA, AVONET_CSV))
  .toString('utf8')
  .trim()
  .split(/\r?\n/)
const columns = header.split(',')
const nameAt = columns.indexOf('Species1')
const massAt = columns.indexOf('Mass')
const massOf = new Map()
for (const line of lines) {
  const cells = line.split(',')
  const grams = Number(cells[massAt])
  if (cells[nameAt] && grams > 0) massOf.set(cells[nameAt].toLowerCase(), grams)
}

let added = 0
const byId = new Map(species.map((s) => [s.id, s]))
for (const line of [...report.missing]) {
  const match = /^(\S+) \(.*, ([A-Z][a-z]+ [a-z]+)\)$/.exec(line)
  const sp = match && byId.get(match[1])
  if (!sp || sp.weightKg || groupOf.get(sp.raceId) !== 'avian') continue
  const grams = massOf.get(match[2].toLowerCase())
  if (!grams) continue
  sp.weightKg = Math.round((grams / GRAMS_PER_KG) * 1000) / 1000
  report.missing = report.missing.filter((entry) => entry !== line)
  report.updated++
  report.bySource.avonet = (report.bySource.avonet ?? 0) + 1
  added++
}
writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
console.log(`AVONET: thêm cân nặng ${added} loài chim; còn thiếu ${report.missing.length}`)
