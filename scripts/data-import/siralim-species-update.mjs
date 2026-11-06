/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Gắn trait riêng của loài Siralim thành ability (như game gốc: mỗi loài có một trait bẩm sinh; ô
// ability ở abilities.md) và cho loài Siralim chưa học spell Siralim nào (loài bổ sung đợt 2026-11-04)
// học 6 spell cùng class như lần nhập đầu (content-sources-more.md mục "Dữ liệu Siralim Ultimate":
// ưu tiên spell cùng hệ, rồi spell ít loài học, hòa thì theo md5(speciesId|spell)). Đọc
// sources/siralimCreatureTraits.json do siralim-update-fetch.mjs ghi. Chạy lại an toàn: loài đã có
// ability / spell Siralim giữ nguyên.
// Chạy: node scripts/data-import/siralim-species-update.mjs

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const DATA = new URL('../../src/data/', import.meta.url)
const HERE = new URL('./', import.meta.url)
const read = (url) => JSON.parse(readFileSync(url, 'utf8'))
const write = (url, value) => writeFileSync(url, `${JSON.stringify(value, null, 2)}\n`)
const CLASS = { Chaos: 'fire', Death: 'ghost', Life: 'light', Nature: 'grass', Sorcery: 'psychic' }
const SPELLS_PER_SPECIES = 6
/** Level học theo sức mạnh spell (lần nhập đầu: 8 / 16 / 26 / 36 / 44, Ultimate 50). */
const levelOf = (skill) => {
  if (skill.tags?.includes('ultimate')) return 50
  if (skill.category === 'status' || !skill.power) return 16
  if (skill.power <= 40) return 8
  if (skill.power <= 70) return 16
  if (skill.power <= 90) return 26
  if (skill.power <= 120) return 36
  return 44
}
const nameKey = (name) =>
  String(name)
    .replace(/ \((siralim|spell|creature)\)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
const md5 = (text) => createHash('md5').update(text).digest('hex')

const species = read(new URL('species.json', DATA))
const skills = read(new URL('skills.json', DATA))
const speciesEn = read(new URL('i18n/en/species.json', DATA))
const skillsEn = read(new URL('i18n/en/skills.json', DATA))
const traitsEn = read(new URL('i18n/en/traits.json', DATA))
const { creatures, spells } = read(new URL('sources/siralimCreatureTraits.json', HERE))
/** Loài Siralim bổ sung đợt 2026-11-04 (siralim-wiki-fetch.mjs). */
const addedNames = new Set(
  read(new URL('sources/siralimExtra.json', HERE)).species.map((entry) => nameKey(entry.name))
)

const traitIdByName = new Map(Object.entries(traitsEn).map(([id, name]) => [nameKey(name), id]))
const creatureByName = new Map(creatures.map((c) => [nameKey(c.creature), c]))
const spellClass = new Map(spells.map((s) => [nameKey(s.nameEn), s.siralimClass]))
const skillById = new Map(skills.map((s) => [s.id, s]))
/** Spell Siralim trong game: skill có tên trùng spell của wiki → class. */
const siralimSpells = new Map(
  Object.entries(skillsEn)
    .filter(([id, name]) => skillById.has(id) && spellClass.has(nameKey(name)))
    .map(([id, name]) => [id, spellClass.get(nameKey(name))])
)
const learners = new Map()
for (const sp of species)
  for (const entry of sp.learnset ?? [])
    if (siralimSpells.has(entry.skillId))
      learners.set(entry.skillId, (learners.get(entry.skillId) ?? 0) + 1)

const counts = { abilities: 0, missingTrait: 0, learnsets: 0 }
for (const sp of species) {
  if (sp.source !== 'siralim') continue
  const creature = creatureByName.get(nameKey(speciesEn[sp.id] ?? ''))
  if (!creature) continue
  const traitId = traitIdByName.get(nameKey(creature.trait))
  if (!sp.abilities) {
    if (traitId) {
      sp.abilities = [traitId]
      counts.abilities++
    } else counts.missingTrait++
  }
  const element = CLASS[creature.siralimClass]
  // Chỉ loài bổ sung (lần nhập đầu đã có 6 spell); bù cho đủ 6 spell cùng class.
  if (!element || !sp.learnset || !addedNames.has(nameKey(speciesEn[sp.id] ?? ''))) continue
  const known = new Set(
    sp.learnset
      .map((entry) => entry.skillId)
      .filter((id) => siralimSpells.get(id) === creature.siralimClass)
  )
  const missing = SPELLS_PER_SPECIES - known.size
  if (missing <= 0) continue
  const picked = [...siralimSpells]
    .filter(([id, cls]) => cls === creature.siralimClass && !known.has(id))
    .map(([id]) => id)
    .sort(
      (a, b) =>
        Number(skillById.get(a).elementId !== sp.elementIds[0]) -
          Number(skillById.get(b).elementId !== sp.elementIds[0]) ||
        (learners.get(a) ?? 0) - (learners.get(b) ?? 0) ||
        md5(`${sp.id}|${a}`).localeCompare(md5(`${sp.id}|${b}`))
    )
    .slice(0, missing)
  for (const skillId of picked) {
    sp.learnset.push({ level: levelOf(skillById.get(skillId)), skillId })
    learners.set(skillId, (learners.get(skillId) ?? 0) + 1)
  }
  sp.learnset.sort((a, b) => a.level - b.level)
  counts.learnsets++
}
write(new URL('species.json', DATA), species)
console.log(counts)
