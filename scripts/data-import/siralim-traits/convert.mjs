/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Chuyển trait Siralim từ traits-planned.json vào game theo bảng quy đổi (partN.mjs, helper ở
// dsl.mjs): trait có hook thật → src/data/traits.json + tên i18n vi / en; trait bị loại (REJECT) →
// ghi vào siralim-report.json (rejectedTraits) rồi xóa khỏi file chờ; trait hoãn (DEFER) giữ trong
// file chờ kèm `deferredTo`. Chạy: node scripts/data-import/siralim-traits/convert.mjs
// Sau khi chạy: npx prettier --write src/data scripts/data-import rồi npm test (kiểm tra dữ liệu).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const root = new URL('../../../', import.meta.url)
const path = (relative) => new URL(relative, root)
const readJson = (relative) => JSON.parse(readFileSync(path(relative), 'utf8'))
const writeJson = (relative, value) =>
  writeFileSync(path(relative), JSON.stringify(value, null, 2) + '\n', 'utf8')

const conversions = {}
const partDir = new URL('./', import.meta.url)
for (const file of readdirSync(partDir)
  .filter((f) => /^part\d+\.mjs$/.test(f))
  .sort()) {
  const { CONVERSIONS } = await import(new URL(file, partDir))
  for (const [id, value] of Object.entries(CONVERSIONS)) {
    if (id in conversions) throw new Error(`Trait "${id}" quy đổi hai lần (${file})`)
    conversions[id] = value
  }
}

const planned = readJson('scripts/data-import/traits-planned.json')
const traits = readJson('src/data/traits.json')
const namesVi = readJson('src/data/i18n/vi/traits.json')
const namesEn = readJson('src/data/i18n/en/traits.json')
const report = readJson('scripts/data-import/siralim-report.json')
report.rejectedTraits ??= []

const takenIds = new Set(traits.map((t) => t.id))
const takenVi = new Set(Object.values(namesVi))
const takenEn = new Set(Object.values(namesEn))
/** Tên trùng với trait đã có thì thêm hậu tố như luật đặt tên loài trùng. */
const uniqueName = (name, taken) => {
  let result = name
  if (taken.has(result)) result = `${name} (Siralim)`
  taken.add(result)
  return result
}

const remaining = []
const counts = { converted: 0, rejected: 0, deferred: 0, pending: 0 }
for (const trait of planned) {
  // Mục nhập bổ sung có id thêm hậu tố vì trùng: quy đổi ghi theo `conversionKey` (siralim-update/ids.mjs).
  // Chỉ mục của Siralim: mục chờ của nguồn khác trùng id (strengthInNumbers của TWW3) giữ nguyên.
  const conversion =
    trait.source === 'siralim' ? conversions[trait.conversionKey ?? trait.id] : undefined
  if (!conversion) {
    remaining.push(trait)
    counts.pending++
    continue
  }
  if (conversion.reject) {
    report.rejectedTraits.push({
      id: trait.id,
      nameEn: trait.nameEn,
      reason: conversion.reject,
      description: trait.description
    })
    counts.rejected++
    continue
  }
  if (conversion.defer) {
    remaining.push({ ...trait, deferredTo: conversion.defer })
    counts.deferred++
    continue
  }
  if (takenIds.has(trait.id)) throw new Error(`Trait "${trait.id}" đã có trong traits.json`)
  takenIds.add(trait.id)
  traits.push({ id: trait.id, kind: trait.kind, hooks: conversion })
  namesVi[trait.id] = uniqueName(trait.name, takenVi)
  namesEn[trait.id] = uniqueName(trait.nameEn, takenEn)
  counts.converted++
}

writeFileSync(path('src/data/traits.json'), JSON.stringify(traits), 'utf8')
writeJson('src/data/i18n/vi/traits.json', namesVi)
writeJson('src/data/i18n/en/traits.json', namesEn)
writeJson('scripts/data-import/traits-planned.json', remaining)
writeJson('scripts/data-import/siralim-report.json', report)
console.log(counts)
