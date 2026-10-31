/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Chuyển spell Siralim từ skills-planned.json vào game theo bảng quy đổi (partN.mjs, helper ở
// sdsl.mjs): spell có hiệu ứng → src/data/skills.json + tên i18n vi / en + learnset của loài (theo
// mục `learnset` của file chờ); spell bị loại (REJECT) → siralim-report.json (rejectedSpells) rồi
// xóa khỏi file chờ; spell hoãn (DEFER) giữ trong file chờ kèm `deferredTo`.
// Chạy: node scripts/data-import/siralim-spells/convert.mjs (trước convert.mjs của trait, vì trait
// tham chiếu spell). Sau đó: npx prettier --write src/data scripts/data-import rồi npm test.

import { readFileSync, writeFileSync } from 'node:fs'
import { buildSpellSkill, loadSpellConversions } from './build.mjs'

const root = new URL('../../../', import.meta.url)
const path = (relative) => new URL(relative, root)
const readJson = (relative) => JSON.parse(readFileSync(path(relative), 'utf8'))
const writeJson = (relative, value) =>
  writeFileSync(path(relative), JSON.stringify(value, null, 2) + '\n', 'utf8')

const conversions = await loadSpellConversions()
const planned = readJson('scripts/data-import/skills-planned.json')
const skills = readJson('src/data/skills.json')
const species = readJson('src/data/species.json')
const namesVi = readJson('src/data/i18n/vi/skills.json')
const namesEn = readJson('src/data/i18n/en/skills.json')
const report = readJson('scripts/data-import/siralim-report.json')
report.rejectedSpells ??= []

const speciesById = new Map(species.map((s) => [s.id, s]))
const takenIds = new Set(skills.map((s) => s.id))
const takenVi = new Set(Object.values(namesVi))
const takenEn = new Set(Object.values(namesEn))
/** Tên trùng với skill đã có thì thêm hậu tố như luật đặt tên loài trùng. */
const uniqueName = (name, taken) => {
  let result = name
  if (taken.has(result)) result = `${name} (Siralim)`
  taken.add(result)
  return result
}

/** Khóa so tên: chữ thường, bỏ khoảng trắng / dấu (luật dùng lại skill trùng tên tiếng Anh). */
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const skillByName = new Map(Object.entries(namesEn).map(([id, name]) => [nameKey(name), id]))

/** Thêm spell vào learnset các loài theo mục `learnset` của file chờ. */
function addLearnset(entry, skillId) {
  for (const { speciesId, level } of entry.learnset ?? []) {
    const owner = speciesById.get(speciesId)
    if (!owner) {
      counts.missingSpecies++
      continue
    }
    if (owner.learnset.some((l) => l.skillId === skillId)) continue
    owner.learnset.push({ level, skillId })
    owner.learnset.sort((a, b) => a.level - b.level)
    counts.learnset++
  }
}

const remaining = []
const counts = {
  converted: 0,
  reused: 0,
  rejected: 0,
  deferred: 0,
  pending: 0,
  learnset: 0,
  missingSpecies: 0
}
for (const entry of planned) {
  // Trùng tên tiếng Anh với skill có sẵn: dùng lại skill cũ, chỉ thêm learnset.
  const reusedId = skillByName.get(nameKey(entry.nameEn))
  if (reusedId) {
    addLearnset(entry, reusedId)
    report.reusedSkills.push({
      name: entry.nameEn,
      skillId: reusedId,
      siralimDescription: entry.description
    })
    counts.reused++
    continue
  }
  const conversion = conversions[entry.id]
  if (!conversion) {
    remaining.push(entry)
    counts.pending++
    continue
  }
  if (conversion.reject) {
    report.rejectedSpells.push({
      id: entry.id,
      nameEn: entry.nameEn,
      reason: conversion.reject,
      description: entry.description
    })
    counts.rejected++
    continue
  }
  if (conversion.defer) {
    remaining.push({ ...entry, deferredTo: conversion.defer })
    counts.deferred++
    continue
  }
  if (takenIds.has(entry.id)) throw new Error(`Skill "${entry.id}" đã có trong skills.json`)
  takenIds.add(entry.id)
  skills.push(buildSpellSkill(entry, conversion))
  namesVi[entry.id] = uniqueName(entry.name, takenVi)
  namesEn[entry.id] = uniqueName(entry.nameEn, takenEn)
  addLearnset(entry, entry.id)
  counts.converted++
}

writeJson('src/data/skills.json', skills)
writeJson('src/data/species.json', species)
writeJson('src/data/i18n/vi/skills.json', namesVi)
writeJson('src/data/i18n/en/skills.json', namesEn)
writeJson('scripts/data-import/skills-planned.json', remaining)
report.counts = { ...report.counts, siralimSpellConversion: counts }
writeJson('scripts/data-import/siralim-report.json', report)
console.log(counts)
