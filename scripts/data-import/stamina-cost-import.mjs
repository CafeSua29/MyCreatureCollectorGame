/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Giá thể lực của skill theo tài nguyên của game gốc (docs/rules/stamina.md mục "Giá theo game gốc"):
// - Pokémon: PP (Showdown moves.js). Siralim Ultimate: Charges của spell (siralimultimate.wiki.gg). Cả hai là
//   số lần dùng, quy đổi chung `costFromUses`: ít lần dùng = đắt.
// - Portals of Phereon: 1 mana = 5 thể lực (`phereon/skills.mjs`), giới hạn lần dùng chỉ theo hồi chiêu.
// Skill đã có giá riêng của nguồn khác (Cassette Beasts, Temtem) không đụng. Chạy lại được (ghi đè đúng các
// skill của ba nguồn trên).
// Chạy: node scripts/data-import/stamina-cost-import.mjs (cần mạng) rồi npx prettier --write src/data/skills.json

import { readFileSync, writeFileSync } from 'node:fs'

import { MANA_STAMINA, OVERRIDES, SOURCE_ROWS, usesLimit } from './phereon/skills.mjs'
import { MAX_COST, PALWORLD_WINDOW, costFromUses } from './staminaCost.mjs'
import { camelId, fetchShowdown } from './showdown.mjs'
import { loadSpellConversions } from './siralim-spells/build.mjs'
import { infoboxParams, pagesWikitext, wikiApi } from './sourceHelpers.mjs'

const SKILLS = new URL('../../src/data/skills.json', import.meta.url)
const NAMES_EN = new URL('../../src/data/i18n/en/skills.json', import.meta.url)
const REPORT = new URL('./stamina-cost-report.json', import.meta.url)

const skills = JSON.parse(readFileSync(SKILLS, 'utf8'))
const namesEn = JSON.parse(readFileSync(NAMES_EN, 'utf8'))
const byId = new Map(skills.map((skill) => [skill.id, skill]))
const report = { pokemon: 0, siralim: 0, phereon: 0, palworld: 0, siralimMissing: [], costs: {} }
/** Skill đã có giá của nguồn đi trước (Pokémon thắng khi trùng tên với Palworld). */
const assigned = new Set()

// Pokémon: chiêu Z / Max (PP 1) không dùng bằng lệnh thường, giá theo skill gốc (stamina.md).
const moves = await fetchShowdown('moves.js')
for (const move of Object.values(moves)) {
  if (move.isZ || move.isMax || !move.pp) continue
  const skill = byId.get(camelId(move.name))
  if (!skill) continue
  skill.staminaCost = costFromUses(move.pp)
  assigned.add(skill.id)
  report.pokemon++
}

// Siralim: tra Charges theo tên tiếng Anh của spell đã nhập.
const conversions = await loadSpellConversions()
const siralimIds = Object.entries(conversions)
  .filter(([id, value]) => byId.has(id) && !value.reject && !value.defer)
  .map(([id]) => id)
const api = wikiApi('https://siralimultimate.wiki.gg/api.php')
const titleOf = (id) => namesEn[id]?.replace(/ \(Siralim\)$/, '')
const pages = await pagesWikitext(api, [...new Set(siralimIds.map(titleOf).filter(Boolean))])
for (const id of siralimIds) {
  const text = pages.get(titleOf(id))
  const charges = text ? Number(infoboxParams(text).charges) : NaN
  if (!Number.isFinite(charges) || charges <= 0) {
    report.siralimMissing.push(id)
    continue
  }
  byId.get(id).staminaCost = costFromUses(charges)
  assigned.add(id)
  report.siralim++
}

// Phereon: mana × 5; bỏ giới hạn lần dùng cũ theo mana (giờ đã tốn thể lực).
for (const row of SOURCE_ROWS) {
  const skill = byId.get(`${row.id[0].toLowerCase()}${row.id.slice(1).replace(/_/g, '')}Phereon`)
  if (!skill) continue
  skill.staminaCost = Math.min(MAX_COST, row.mana * MANA_STAMINA)
  report.phereon++
  // Giới hạn đặt tay (OVERRIDES) giữ nguyên; giới hạn tự sinh tính lại chỉ theo hồi chiêu.
  if (OVERRIDES[row.id]?.maxUsesPerBattle !== undefined) continue
  const limit = usesLimit(row).maxUsesPerBattle
  if (limit === undefined) delete skill.maxUsesPerBattle
  else skill.maxUsesPerBattle = limit
}

// Palworld: hồi chiêu CT (giây) → số lần dùng tương đương trong PALWORLD_WINDOW giây. Bảng render của wiki
// (Active Skills/List, Unique, Boss); khớp theo tên tiếng Anh, bỏ skill đã có giá của nguồn khác / có hậu tố
// nguồn riêng (Temtem, Phereon, Siralim, Wilderlocke).
const palworldApi = wikiApi('https://palworld.wiki.gg/api.php')
const OWN_SOURCE = /(Temtem|Phereon|Siralim|Wilderlocke)$/
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const idByName = new Map(Object.entries(namesEn).map(([id, name]) => [nameKey(name), id]))
for (const page of ['Active_Skills/List', 'Active_Skills/Unique', 'Active_Skills/Boss']) {
  const body = await palworldApi({ action: 'parse', page, prop: 'text' })
  const html = body?.parse?.text?.['*'] ?? ''
  for (const row of html.matchAll(
    /<tr><td><a[^>]*>([^<]+)<\/a><\/td><td>[\s\S]*?<\/td><td>([\d.]+)<\/td>/g
  )) {
    const id = idByName.get(nameKey(row[1]))
    const skill = id ? byId.get(id) : undefined
    if (!skill || assigned.has(skill.id) || OWN_SOURCE.test(skill.id)) continue
    skill.staminaCost = costFromUses(PALWORLD_WINDOW / Number(row[2]))
    assigned.add(skill.id)
    report.palworld++
  }
}

for (const skill of skills) {
  const key = skill.staminaCost === undefined ? 'none' : String(skill.staminaCost)
  report.costs[key] = (report.costs[key] ?? 0) + 1
}
writeFileSync(SKILLS, `${JSON.stringify(skills, null, 2)}\n`)
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `Pokémon ${report.pokemon}, Siralim ${report.siralim} (thiếu ${report.siralimMissing.length}), Phereon ${report.phereon}, Palworld ${report.palworld}`
)
