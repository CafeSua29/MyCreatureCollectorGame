/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập cân nặng / chiều cao thật của động vật thật và tuyệt chủng (origin `living` / `extinct`) vào
// src/data/species.json (`weightKg`, `heightM`; mục "Cân nặng" ở docs/rules/battle.md). Chạy lại
// được: node scripts/data-import/animal-size-import.mjs (cần mạng). Nguồn và thứ tự:
// 1. AnAge (thú, chim, bò sát, cá, lưỡng cư; khối lượng trưởng thành) theo tên tiếng Anh.
// 2. Wikidata: tên tiếng Anh (nhãn / tên khác, có tên khoa học P225) → tên khoa học; khối lượng
//    P2067, chiều cao P2048, chiều dài P2043 (lấy giá trị lớn nhất: con trưởng thành).
// 3. Theo tên khoa học: PanTHERIA (thú có vú) rồi AnAge; phân loài lấy loài (2 chữ đầu); tên bậc
//    cao (chi / họ / bộ, ví dụ "Gorilla", "Leporidae") lấy trung bình nhân các loài trong bậc đó.
// 4. Khối lượng Wikidata của chính item.
// 5. Con non (tiến hóa thành loài đã có số, ví dụ Lion Cub → Lion): ước lượng theo con trưởng thành
//    (× JUVENILE_WEIGHT / JUVENILE_HEIGHT), vì nguồn chỉ có số con trưởng thành.
// Loài không tìm thấy giữ cân nặng ước lượng theo race; danh sách ở animal-size-report.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { labelsOf, sleep, sparql } from './wikidata.mjs'
import { fetchZipEntry } from './zip.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)
const NAMES_PATH = new URL('../../src/data/i18n/en/species.json', import.meta.url)
const REPORT_PATH = new URL('./animal-size-report.json', import.meta.url)
const PANTHERIA = 'https://esapubs.org/archive/ecol/E090/184/PanTHERIA_1-0_WR05_Aug2008.txt'
const ANAGE = 'https://genomics.senescence.info/species/dataset.zip'
const BATCH = 120
const JUVENILE_WEIGHT = 0.15
const JUVENILE_HEIGHT = 0.5

// Đổi đơn vị Wikidata (Q-id) sang kg / m.
const MASS_UNITS = { Q11570: 1, Q41803: 0.001, Q191118: 1000, Q100995: 0.45359237 }
const LENGTH_UNITS = { Q11573: 1, Q174728: 0.01, Q174789: 0.001, Q3710: 0.3048, Q218593: 0.0254 }

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const names = JSON.parse(readFileSync(NAMES_PATH, 'utf8'))
const targets = species.filter(
  (s) => s.kind === 'normal' && (s.origin === 'living' || s.origin === 'extinct') && names[s.id]
)

const round = (value) => Number(value.toPrecision(3))
const geoMean = (values) =>
  values.length ? Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length) : 0

/** Tên (đúng chữ hoa / thường như truy vấn) → Map(item → { taxon, massKg, heightM, lengthM }). */
async function wikidataByLabel(labels) {
  const values = labels.map((label) => `${JSON.stringify(label)}@en`).join(' ')
  const query = `SELECT ?name ?item ?taxon ?prop ?amount ?unit WHERE {
    VALUES ?name { ${values} }
    ?item rdfs:label|skos:altLabel ?name ; wdt:P225 ?taxon .
    OPTIONAL {
      VALUES ?prop { p:P2067 p:P2048 p:P2043 }
      ?item ?prop [ psv:P2067|psv:P2048|psv:P2043 [ wikibase:quantityAmount ?amount ;
        wikibase:quantityUnit ?unit ] ] .
    }
  }`
  const result = new Map()
  for (const row of await sparql(query)) {
    const name = row.name.value
    const byItem = result.get(name) ?? new Map()
    const entry = byItem.get(row.item.value) ?? {
      taxon: row.taxon.value,
      massKg: 0,
      heightM: 0,
      lengthM: 0
    }
    if (row.prop) {
      const unit = row.unit.value.split('/').at(-1)
      const amount = Number(row.amount.value)
      const prop = row.prop.value.split('/').at(-1)
      if (prop === 'P2067' && MASS_UNITS[unit])
        entry.massKg = Math.max(entry.massKg, amount * MASS_UNITS[unit])
      if (prop === 'P2048' && LENGTH_UNITS[unit])
        entry.heightM = Math.max(entry.heightM, amount * LENGTH_UNITS[unit])
      if (prop === 'P2043' && LENGTH_UNITS[unit])
        entry.lengthM = Math.max(entry.lengthM, amount * LENGTH_UNITS[unit])
    }
    byItem.set(row.item.value, entry)
    result.set(name, byItem)
  }
  return result
}

/** Bảng loài: { binomial, genus, family, order, common, kg }. */
async function loadTaxa() {
  const rows = []
  const pantheria = await (await fetch(PANTHERIA)).text()
  const [pHeader, ...pLines] = pantheria.trim().split('\n')
  const p = pHeader.split('\t')
  const col = (name) => p.indexOf(name)
  for (const line of pLines) {
    const cells = line.split('\t')
    const grams = Number(cells[col('5-1_AdultBodyMass_g')])
    if (grams > 0)
      rows.push({
        binomial: cells[col('MSW05_Binomial')],
        genus: cells[col('MSW05_Genus')],
        family: cells[col('MSW05_Family')],
        order: cells[col('MSW05_Order')],
        common: '',
        kg: grams / 1000,
        pantheria: true
      })
  }
  const anage = (await fetchZipEntry(ANAGE, 'anage_data.txt')).toString('latin1')
  const [aHeader, ...aLines] = anage.trim().split('\n')
  const a = aHeader.trim().split('\t')
  for (const line of aLines) {
    const cells = line.split('\t')
    const value = (name) => (cells[a.indexOf(name)] ?? '').trim()
    const grams = Number(value('Adult weight (g)'))
    if (grams > 0)
      rows.push({
        binomial: `${value('Genus')} ${value('Species')}`,
        genus: value('Genus'),
        family: value('Family'),
        order: value('Order'),
        common: value('Common name').toLowerCase(),
        kg: grams / 1000,
        pantheria: false
      })
  }
  return rows
}

/** Khối lượng theo tên khoa học: loài (PanTHERIA trước AnAge), rồi chi / họ / bộ (trung bình nhân). */
function massByTaxon(taxa, taxon) {
  const binomial = taxon.split(' ').slice(0, 2).join(' ')
  const exact = taxa.filter((row) => row.binomial === binomial)
  if (exact.length) return (exact.find((row) => row.pantheria) ?? exact[0]).kg
  if (taxon.includes(' ')) return 0
  for (const rank of ['genus', 'family', 'order']) {
    const members = taxa.filter((row) => row[rank] === taxon)
    if (members.length) return geoMean(members.map((row) => row.kg))
  }
  return 0
}

const taxa = await loadTaxa()
const byCommon = new Map(taxa.filter((row) => row.common).map((row) => [row.common, row.kg]))
const labels = [...new Set(targets.flatMap((s) => labelsOf(names[s.id])))]
const found = new Map()
for (let i = 0; i < labels.length; i += BATCH) {
  for (const [name, byItem] of await wikidataByLabel(labels.slice(i, i + BATCH)))
    found.set(name, byItem)
  await sleep(1000)
}

const report = { updated: 0, bySource: {}, missing: [] }
for (const s of targets) {
  delete s.weightKg
  delete s.heightM
  const name = names[s.id]
  const items = labelsOf(name).flatMap((label) => [...(found.get(label)?.values() ?? [])])
  // Nhiều item cùng tên: ưu tiên item có khối lượng theo tên khoa học, rồi khối lượng Wikidata.
  const scored = items
    .map((entry) => ({ ...entry, taxonKg: massByTaxon(taxa, entry.taxon) }))
    .sort((x, y) => y.taxonKg - x.taxonKg || y.massKg - x.massKg)
  const best = scored[0]
  const common = byCommon.get(name.toLowerCase()) ?? 0
  const [massKg, source] = common
    ? [common, 'anageName']
    : best?.taxonKg
      ? [best.taxonKg, 'taxon']
      : best?.massKg
        ? [best.massKg, 'wikidata']
        : [0, null]
  const sizeM = best ? best.heightM || best.lengthM : 0
  if (sizeM > 0) s.heightM = round(sizeM)
  if (!source) {
    report.missing.push(`${s.id} (${name}${best ? `, ${best.taxon}` : ''})`)
    continue
  }
  s.weightKg = round(massKg)
  report.updated++
  report.bySource[source] = (report.bySource[source] ?? 0) + 1
}

// Con non: chưa có số thì lấy theo dạng tiến hóa đầu tiên đã có số.
const byId = new Map(species.map((s) => [s.id, s]))
for (const s of targets) {
  if (s.weightKg) continue
  const adult = (s.evolutions ?? []).map((evo) => byId.get(evo.speciesId)).find((x) => x?.weightKg)
  if (!adult) continue
  s.weightKg = round(adult.weightKg * JUVENILE_WEIGHT)
  if (adult.heightM && !s.heightM) s.heightM = round(adult.heightM * JUVENILE_HEIGHT)
  report.updated++
  report.bySource.juvenile = (report.bySource.juvenile ?? 0) + 1
  report.missing = report.missing.filter((line) => !line.startsWith(`${s.id} (`))
}

writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `Động vật: ${targets.length}, có cân nặng: ${report.updated} ${JSON.stringify(report.bySource)}, thiếu: ${report.missing.length}`
)
