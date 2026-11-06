/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Bổ sung spell và trait Siralim Ultimate ra ở các bản cập nhật sau bộ CSV của lần nhập đầu (đợt
// 2026-11-04, content-sources-real.md mục "Siralim Ultimate (bổ sung)"): tải siralimultimate.wiki.gg
// (Category:Spells với {{Spell}}, Category:Creatures với {{Creature infobox}}), ghi spell / trait còn
// thiếu (chưa có trong game, chưa bị loại ở lần trước) vào skills-planned.json / traits-planned.json
// để siralim-spells/convert.mjs và siralim-traits/convert.mjs chuyển theo bảng quy đổi (part5 / part9),
// và ghi bảng loài → trait (sources/siralimCreatureTraits.json) cho siralim-species-update.mjs.
// Chạy (cần mạng): node scripts/data-import/siralim-update-fetch.mjs, rồi
// node scripts/data-import/siralim-spells/convert.mjs, node scripts/data-import/siralim-traits/convert.mjs,
// node scripts/data-import/siralim-species-update.mjs.

import { readFileSync, writeFileSync } from 'node:fs'
import { freshId } from './siralim-update/ids.mjs'
import { VI_SPELLS, VI_TRAITS } from './siralim-update/names.mjs'
import { categoryMembers, infoboxParams, pagesWikitext, wikiApi } from './sourceHelpers.mjs'

const api = wikiApi('https://siralimultimate.wiki.gg/api.php')
const DATA = new URL('../../src/data/', import.meta.url)
const HERE = new URL('./', import.meta.url)
const read = (url) => JSON.parse(readFileSync(url, 'utf8'))
const write = (url, value) => writeFileSync(url, `${JSON.stringify(value, null, 2)}\n`)
/** Class Siralim → hệ của game (bảng đã dùng khi nhập loài / spell). */
const CLASS = { Chaos: 'fire', Death: 'ghost', Life: 'light', Nature: 'grass', Sorcery: 'psychic' }

/** Khóa so tên: chữ thường, bỏ khoảng trắng / dấu, bỏ nhãn "(Siralim)" / "(spell)" / "(Creature)". */
const nameKey = (name) =>
  String(name)
    .replace(/ \((siralim|spell|creature)\)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
/** Mô tả wiki → chữ: {{X|Y}} → Y, {{Attackaction}} → "Attack", [[a|b]] → b. */
const render = (text) =>
  text
    .replace(/\{\{([^{}|]+)(?:\|([^{}]*))?\}\}/g, (_, name, args) => {
      const arg = args ? args.split('|').pop().trim() : ''
      if (arg) return arg
      return name
        .trim()
        .replace(/action$/i, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
    })
    .replace(/\[\[(?:File:[^\]]*\]\]\s*)/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .trim()
const field = (box, key) =>
  (box.split('\n').find((line) => line.startsWith(`|${key}=`)) ?? '').slice(key.length + 2).trim()

const skillsEn = read(new URL('i18n/en/skills.json', DATA))
const traitsEn = read(new URL('i18n/en/traits.json', DATA))
const report = read(new URL('siralim-report.json', HERE))
const existingSkill = new Set(Object.values(skillsEn).map(nameKey))
const existingTrait = new Set(Object.values(traitsEn).map(nameKey))
const rejectedSpell = new Set(
  [...(report.rejectedSpells ?? []), ...(report.droppedSpells ?? [])].map((x) =>
    nameKey(x.nameEn ?? x.name ?? x)
  )
)
const rejectedTrait = new Set((report.rejectedTraits ?? []).map((x) => nameKey(x.nameEn)))
const skillIds = new Set(read(new URL('skills.json', DATA)).map((s) => s.id))
const speciesEn = read(new URL('i18n/en/species.json', DATA))
/** Loài Siralim đang có trong game (nhân vật độc nhất đã loại thì trait của nó không nhập thêm). */
const siralimSpecies = new Set(
  read(new URL('species.json', DATA))
    .filter((s) => s.source === 'siralim')
    .map((s) => nameKey(speciesEn[s.id] ?? ''))
)
const traitIds = new Set(read(new URL('traits.json', DATA)).map((t) => t.id))

// ---------- Spell ----------
const spellTitles = (await categoryMembers(api, 'Spells')).filter((t) => !t.includes('/'))
const spellTexts = await pagesWikitext(api, spellTitles)
const plannedSkills = read(new URL('skills-planned.json', HERE))
const spellClasses = []
for (const title of spellTitles) {
  const box = /\{\{Spell\s*\n([\s\S]*?)\n\}\}/.exec(spellTexts.get(title) ?? '')?.[1]
  if (!box) continue
  const nameEn = title.replace(/ \(spell\)$/i, '')
  const siralimClass = field(box, 'Class')
  spellClasses.push({ nameEn, siralimClass })
  const key = nameKey(nameEn)
  if (existingSkill.has(key) || rejectedSpell.has(key) || !CLASS[siralimClass]) continue
  if (plannedSkills.some((p) => nameKey(p.nameEn) === key)) continue
  const { id, conversionKey } = freshId(nameEn, skillIds)
  plannedSkills.push({
    id,
    ...(conversionKey !== id ? { conversionKey } : {}),
    name: VI_SPELLS[conversionKey] ?? nameEn,
    nameEn,
    elementId: CLASS[siralimClass],
    siralimClass,
    description: render(field(box, 'Description')),
    learnset: []
  })
}
write(new URL('skills-planned.json', HERE), plannedSkills)

// ---------- Trait của loài ----------
const creatureTitles = (await categoryMembers(api, 'Creatures')).filter(
  (t) => !t.includes('/') && t !== 'Creatures'
)
const creatureTexts = await pagesWikitext(api, creatureTitles)
const plannedTraits = read(new URL('traits-planned.json', HERE))
const creatureTraits = []
for (const title of creatureTitles) {
  const box = /\{\{Creature infobox([\s\S]*?)\n\}\}/i.exec(creatureTexts.get(title) ?? '')?.[1]
  if (!box) continue
  const p = infoboxParams(box)
  const traitEn = render(p.trait ?? '')
  if (!traitEn) continue
  const description = render(/\|\s*Trait Description\s*=\s*([^\n]+)/i.exec(box)?.[1] ?? '')
  creatureTraits.push({
    creature: title.replace(/ \(Creature\)$/, ''),
    trait: traitEn,
    siralimClass: p.class,
    siralimRace: p.species
  })
  const key = nameKey(traitEn)
  if (existingTrait.has(key) || rejectedTrait.has(key) || !siralimSpecies.has(nameKey(title)))
    continue
  if (plannedTraits.some((t) => nameKey(t.nameEn) === key)) continue
  const { id, conversionKey } = freshId(traitEn, traitIds)
  plannedTraits.push({
    id,
    ...(conversionKey !== id ? { conversionKey } : {}),
    name: VI_TRAITS[conversionKey] ?? traitEn,
    kind: 'positive',
    hooks: [],
    nameEn: traitEn,
    description,
    source: 'siralim',
    siralimClass: p.class,
    siralimCreature: title
  })
}
write(new URL('traits-planned.json', HERE), plannedTraits)
write(new URL('sources/siralimCreatureTraits.json', HERE), {
  creatures: creatureTraits,
  spells: spellClasses
})
console.log(
  `spell chờ: ${plannedSkills.length}, trait chờ: ${plannedTraits.length}, loài có trait: ${creatureTraits.length}`
)
