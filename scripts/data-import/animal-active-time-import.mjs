/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập giờ hoạt động (`activeTime`, docs/rules/calendar.md) của động vật thật và tuyệt chủng
// (origin `living` / `extinct`) vào src/data/species.json. Chạy lại được: node
// scripts/data-import/animal-active-time-import.mjs (cần mạng). Báo cáo:
// scripts/data-import/animal-active-time-report.json. Nguồn và thứ tự:
// 1. EltonTraits 1.0 (Wilman et al. 2014): thú có vú (Activity-Nocturnal / Crepuscular / Diurnal),
//    chim (Nocturnal 0 / 1, khớp cả tên tiếng Anh; tên chung như "Sparrow" lấy theo các loài chim có
//    tên kết thúc bằng từ đó, ví dụ "House Sparrow"). Theo tên khoa học (phân loài lấy loài); tên bậc
//    cao (chi / họ) lấy giờ hoạt động chiếm ít nhất 2/3 số loài trong bậc, không thì bỏ qua.
// 2. Wikidata: tên tiếng Anh (nhãn / tên khác, có tên khoa học P225) → tên khoa học dùng cho bước 1,
//    và "diel cycle" P9566 của chính item (bò sát, cá, côn trùng... EltonTraits không có).
// 3. Con non (tiến hóa thành loài đã có giờ, ví dụ Lion Cub → Lion): như con trưởng thành.
// Loài không tìm thấy bỏ trống (suy theo race / hệ); danh sách ở báo cáo.

import { readFileSync, writeFileSync } from 'node:fs'
import { labelsOf, sleep, sparql } from './wikidata.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)
const NAMES_PATH = new URL('../../src/data/i18n/en/species.json', import.meta.url)
const REPORT_PATH = new URL('./animal-active-time-report.json', import.meta.url)
const ELTON = 'https://esapubs.org/archive/ecol/E095/178'
const BATCH = 120
// Tỉ lệ loài cùng giờ hoạt động tối thiểu để gán cho cả chi / họ.
const RANK_AGREEMENT = 2 / 3
// Giá trị P9566 → giờ hoạt động (matutinal: hoạt động lúc rạng sáng → chạng vạng).
const DIEL = {
  Q4284186: 'diurnal',
  Q101029366: 'nocturnal',
  Q3255068: 'crepuscular',
  Q6792025: 'crepuscular',
  Q5052479: 'cathemeral'
}

/** Bảng TSV của EltonTraits thành danh sách object. */
async function loadElton(file) {
  const text = await (await fetch(`${ELTON}/${file}`)).text()
  const [header, ...lines] = text.trim().split(/\r?\n/)
  const columns = header.split('\t')
  return lines.map((line) => {
    const cells = line.split('\t')
    return Object.fromEntries(columns.map((name, i) => [name, (cells[i] ?? '').trim()]))
  })
}

/** Cờ hoạt động của thú (đêm / chạng vạng / ngày) → giờ hoạt động. */
function mammalActiveTime(row) {
  const night = row['Activity-Nocturnal'] === '1'
  const twilight = row['Activity-Crepuscular'] === '1'
  const day = row['Activity-Diurnal'] === '1'
  if (night && day) return 'cathemeral'
  if (night) return 'nocturnal'
  if (day) return 'diurnal'
  return twilight ? 'crepuscular' : null
}

const [mammals, birds] = await Promise.all([
  loadElton('MamFuncDat.txt'),
  loadElton('BirdFuncDat.txt')
])
/** { binomial, genus, family, common, activeTime } của mọi loài EltonTraits có dữ liệu. */
const taxa = [
  ...mammals.map((row) => ({
    binomial: row.Scientific,
    family: row.MSWFamilyLatin,
    common: '',
    activeTime: mammalActiveTime(row)
  })),
  ...birds.map((row) => ({
    binomial: row.Scientific,
    family: row.BLFamilyLatin,
    common: row.English.toLowerCase(),
    activeTime: row.Nocturnal === '1' ? 'nocturnal' : row.Nocturnal === '0' ? 'diurnal' : null
  }))
]
  .filter((row) => row.activeTime && row.binomial)
  .map((row) => ({ ...row, genus: row.binomial.split(' ')[0] }))
const byBinomial = new Map(taxa.map((row) => [row.binomial, row.activeTime]))
const byCommon = new Map(
  taxa.filter((row) => row.common).map((row) => [row.common, row.activeTime])
)

/** Tên chung của chim (một từ, ví dụ "hawk"): các loài có tên tiếng Anh kết thúc bằng từ đó. */
const birdsNamed = (name) => taxa.filter((row) => row.common.endsWith(` ${name}`))

/** Giờ hoạt động chiếm ít nhất RANK_AGREEMENT số loài trong danh sách; không có = null. */
function majority(rows) {
  const counts = {}
  for (const row of rows) counts[row.activeTime] = (counts[row.activeTime] ?? 0) + 1
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? []
  return count >= RANK_AGREEMENT * rows.length ? best : null
}

/** Theo tên khoa học: loài (phân loài lấy 2 chữ đầu), rồi chi / họ. */
function activeTimeByTaxon(taxon) {
  const binomial = taxon.split(' ').slice(0, 2).join(' ')
  if (byBinomial.has(binomial)) return byBinomial.get(binomial)
  if (taxon.includes(' ')) return null
  for (const rank of ['genus', 'family']) {
    const members = taxa.filter((row) => row[rank] === taxon)
    if (members.length) return majority(members)
  }
  return null
}

/** Tên → danh sách { taxon, diel } của các item Wikidata có nhãn / tên khác đó. */
async function wikidataByLabel(labels) {
  const values = labels.map((label) => `${JSON.stringify(label)}@en`).join(' ')
  const query = `SELECT ?name ?item ?taxon ?diel WHERE {
    VALUES ?name { ${values} }
    ?item rdfs:label|skos:altLabel ?name ; wdt:P225 ?taxon .
    OPTIONAL { ?item wdt:P9566 ?diel . }
  }`
  const result = new Map()
  for (const row of await sparql(query)) {
    const list = result.get(row.name.value) ?? []
    const diel = row.diel ? DIEL[row.diel.value.split('/').at(-1)] : undefined
    list.push({ taxon: row.taxon.value, diel: diel ?? null })
    result.set(row.name.value, list)
  }
  return result
}

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const names = JSON.parse(readFileSync(NAMES_PATH, 'utf8'))
const targets = species.filter(
  (s) => s.kind === 'normal' && (s.origin === 'living' || s.origin === 'extinct') && names[s.id]
)
const labels = [...new Set(targets.flatMap((s) => labelsOf(names[s.id])))]
const found = new Map()
for (let i = 0; i < labels.length; i += BATCH) {
  for (const [name, items] of await wikidataByLabel(labels.slice(i, i + BATCH)))
    found.set(name, items)
  await sleep(1000)
}

const report = { bySource: {}, byActiveTime: {}, missing: [] }
const note = (s, activeTime, source) => {
  s.activeTime = activeTime
  report.bySource[source] = (report.bySource[source] ?? 0) + 1
  report.byActiveTime[activeTime] = (report.byActiveTime[activeTime] ?? 0) + 1
}
for (const s of targets) {
  delete s.activeTime
  const name = names[s.id]
  const items = labelsOf(name).flatMap((label) => found.get(label) ?? [])
  const lower = name.toLowerCase()
  const named = lower.includes(' ') ? [] : birdsNamed(lower)
  const common = byCommon.get(lower) ?? (named.length ? majority(named) : null)
  const byTaxon = items.map((item) => activeTimeByTaxon(item.taxon)).find(Boolean)
  const diel = items.map((item) => item.diel).find(Boolean)
  if (common) note(s, common, 'eltonName')
  else if (byTaxon) note(s, byTaxon, 'eltonTaxon')
  else if (diel) note(s, diel, 'wikidata')
}

// Con non: lấy theo dạng tiến hóa đầu tiên đã có giờ hoạt động.
const byId = new Map(species.map((s) => [s.id, s]))
for (const s of targets) {
  if (s.activeTime) continue
  const adult = (s.evolutions ?? []).map((e) => byId.get(e.speciesId)).find((x) => x?.activeTime)
  if (adult) note(s, adult.activeTime, 'juvenile')
  else report.missing.push(`${s.id} (${names[s.id]})`)
}

writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `Động vật: ${targets.length}, có giờ hoạt động: ${targets.length - report.missing.length}`,
  JSON.stringify(report.bySource),
  JSON.stringify(report.byActiveTime)
)
