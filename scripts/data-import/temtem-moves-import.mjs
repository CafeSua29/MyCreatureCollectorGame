/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập chiêu, trait, trạng thái và learnset thật của Temtem (content-sources-real.md mục "Temtem: chiêu,
// trait"). Nguồn: temtem-moves-source.json (temtem-moves-fetch.mjs). Quy đổi ở temtem/conditions.mjs,
// temtem/techniques.mjs, temtem/traits.mjs. Mọi chiêu / trait là bản riêng (id hậu tố Temtem); tên trùng với
// mục có sẵn thì thêm " (Temtem)". Loài Temtem: learnset theo cấp (Levelling) thay learnset cũ, Technique Course
// → sách kỹ năng, Breeding → chiêu trứng, trait → ability (1–2 ô). Chạy lại được (ghi đè đúng các mục của script).
// Chạy: node scripts/data-import/temtem-moves-import.mjs rồi npx prettier --write src/data

import { readFileSync, writeFileSync } from 'node:fs'

import { addStatuses, readJson, writeJson } from './element-common.mjs'
import { ELEMENT_IMMUNITIES, STATUSES } from './temtem/conditions.mjs'
import { REJECTED, convertTechnique } from './temtem/techniques.mjs'
import { TRAITS } from './temtem/traits.mjs'

const SOURCE = JSON.parse(
  readFileSync(new URL('./temtem-moves-source.json', import.meta.url), 'utf8')
)
const REPORT = new URL('./temtem-moves-report.json', import.meta.url)
const LABEL = 'Temtem'
const SUFFIX = 'Temtem'

const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
/** "Quetza-leño" → "quetzaLeno", "Tortenite's Garden" → "tortenitesGarden". */
const camelId = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/'/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word, i) => (i ? word[0].toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join('')
const idOf = (name) => `${camelId(name.replace(/ \(Trait\)$/, ''))}${SUFFIX}`

/** Gắn tên (vi = en như mọi tên riêng của tác phẩm); trùng tên mục khác thì thêm nhãn. */
function nameTables(file, ownIds) {
  const vi = readJson(`i18n/vi/${file}.json`)
  const en = readJson(`i18n/en/${file}.json`)
  const taken = new Set(
    Object.entries(en)
      .filter(([id]) => !ownIds.has(id))
      .map(([, name]) => nameKey(name))
  )
  const add = (id, name) => {
    const shown = taken.has(nameKey(name)) ? `${name} (${LABEL})` : name
    taken.add(nameKey(shown))
    vi[id] = shown
    en[id] = shown
  }
  const save = () => {
    writeJson(`i18n/vi/${file}.json`, vi)
    writeJson(`i18n/en/${file}.json`, en)
  }
  return { add, save }
}

function importStatuses() {
  addStatuses(STATUSES)
  // Tên trùng trạng thái có sẵn (Frozen, Immune, Ngủ, Bỏng...) thêm nhãn tác phẩm; vi / en riêng.
  const ownIds = new Set(STATUSES.map(([id]) => id))
  for (const [language, column] of [
    ['vi', 1],
    ['en', 2]
  ]) {
    const file = `i18n/${language}/statuses.json`
    const names = readJson(file)
    const taken = new Set(
      Object.entries(names)
        .filter(([id]) => !ownIds.has(id))
        .map(([, name]) => nameKey(name))
    )
    for (const entry of STATUSES) {
      const name = entry[column]
      names[entry[0]] = taken.has(nameKey(name)) ? `${name} (${LABEL})` : name
    }
    writeJson(file, names)
  }
  const elements = readJson('elements.json')
  for (const element of elements) {
    const extra = ELEMENT_IMMUNITIES[element.id]
    if (extra)
      element.statusImmunities = [...new Set([...(element.statusImmunities ?? []), ...extra])]
  }
  writeJson('elements.json', elements)
}

function importSkills(report) {
  const ownIds = new Set(SOURCE.techniques.map((t) => idOf(t.name)))
  const skills = readJson('skills.json').filter((skill) => !ownIds.has(skill.id))
  const names = nameTables('skills', ownIds)
  for (const technique of SOURCE.techniques) {
    if (REJECTED[technique.name]) {
      report.rejectedTechniques[technique.name] = REJECTED[technique.name]
      continue
    }
    const id = idOf(technique.name)
    skills.push({ id, ...JSON.parse(JSON.stringify(convertTechnique(technique))) })
    names.add(id, technique.name)
    report.techniques++
  }
  writeJson('skills.json', skills)
  names.save()
}

function importTraits(report) {
  const ownIds = new Set(SOURCE.traits.map((t) => idOf(t.name)))
  const traits = readJson('traits.json').filter((trait) => !ownIds.has(trait.id))
  const names = nameTables('traits', ownIds)
  for (const trait of SOURCE.traits) {
    const hooks = TRAITS[trait.name]
    if (hooks === undefined) {
      // Mục "Traits" của API là trang mục lục, không phải trait.
      if (trait.name !== 'Traits') report.missingTraits.push(trait.name)
      continue
    }
    if (hooks.reject) {
      report.rejectedTraits[trait.name] = hooks.reject
      continue
    }
    const id = idOf(trait.name)
    traits.push({ id, kind: 'rare', hooks: JSON.parse(JSON.stringify(hooks)) })
    names.add(id, trait.name.replace(/ \(Trait\)$/, ''))
    report.traits++
  }
  writeJson('traits.json', traits)
  names.save()
  return new Set(traits.map((trait) => trait.id))
}

function updateSpecies(report, traitIds) {
  const species = readJson('species.json')
  const en = readJson('i18n/en/species.json')
  const byName = new Map(
    species
      .filter((entry) => entry.source === 'temtem')
      // Dạng như "Chromeon (Digital)" giữ phần ngoặc; chỉ bỏ nhãn tác phẩm khi tên trùng.
      .map((entry) => [nameKey((en[entry.id] ?? entry.id).replace(/ \(Temtem\)$/, '')), entry])
  )
  const skillIds = new Set(readJson('skills.json').map((skill) => skill.id))
  const skillOf = (name) => {
    const id = idOf(name)
    return skillIds.has(id) ? id : null
  }
  for (const tem of SOURCE.temtems) {
    const target = byName.get(nameKey(tem.name))
    if (!target) {
      report.missingSpecies.push(tem.name)
      continue
    }
    const bySource = (source) => tem.techniques.filter((t) => t.source === source)
    const seen = new Set()
    const learnset = bySource('Levelling')
      .map((t) => ({ level: Math.max(1, t.levels ?? 1), skillId: skillOf(t.name) }))
      .filter((entry) => entry.skillId && !seen.has(entry.skillId) && seen.add(entry.skillId))
      .sort((a, b) => a.level - b.level)
    if (learnset.length) {
      // Mọi loài cần chiêu ở level 1 (như các đợt nhập khác).
      learnset[0].level = 1
      target.learnset = learnset
    }
    const others = (source) =>
      [...new Set(bySource(source).map((t) => skillOf(t.name)))].filter((id) => id && !seen.has(id))
    const books = others('TechniqueCourses')
    const eggs = others('Breeding')
    if (books.length) target.bookSkillIds = books
    else delete target.bookSkillIds
    if (eggs.length) target.eggSkillIds = eggs
    else delete target.eggSkillIds
    const abilities = tem.traits.map(idOf).filter((id) => traitIds.has(id))
    if (abilities.length) target.abilities = abilities.slice(0, 2)
    report.species++
  }
  writeJson('species.json', species)
}

const report = {
  techniques: 0,
  traits: 0,
  species: 0,
  rejectedTechniques: {},
  rejectedTraits: {},
  missingTraits: [],
  missingSpecies: []
}
importStatuses()
importSkills(report)
const traitIds = importTraits(report)
updateSpecies(report, traitIds)
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `chiêu ${report.techniques}, trait ${report.traits} (không nhập ${Object.keys(report.rejectedTraits).length}), loài ${report.species}; thiếu loài: ${report.missingSpecies.join(', ') || 'không'}; thiếu trait: ${report.missingTraits.join(', ') || 'không'}`
)
