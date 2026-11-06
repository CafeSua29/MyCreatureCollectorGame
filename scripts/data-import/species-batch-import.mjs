/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập loài từ file nguồn đã chuẩn hóa (scripts/data-import/sources/<nguồn>.json, do các script
// *-fetch.mjs tải từ API / wiki sinh ra). Luật ở mục "Dữ liệu nguồn thật" của
// docs/rules/content-sources-more.md. Chạy: node scripts/data-import/species-batch-import.mjs
// sources/temtem.json [sources/...]. Chạy lại an toàn: loài đã có (cùng source, cùng tên tiếng Anh)
// chỉ được cập nhật các phần file nguồn cho phép (`update`), không tạo lại.
//
// File nguồn: { source, origin, update?: { race, stats, elements, evolutions (true | 'add'), catchRate, work }, species: [{
//   name, elements, raceId, tier? | stats?, style?, catchRate? (0–100) | catchRate255?,
//   evolutions?: [{ name, level }], genderless?, heightM?, weightKg?, workStats?, eggType?, flavor?, category? }] }
// update.stats / update.catchRate với mục chỉ có `tier`: dựng lại chỉ số / tỉ lệ bắt theo bậc (nguồn
// mới có độ mạnh thật thay cho bậc đoán của lần nhập trước, ví dụ Void Monsters).

import { readFileSync, writeFileSync } from 'node:fs'
import {
  TIERS,
  buildLearnset,
  buildLifespan,
  buildSkillPools,
  buildStats,
  catchRateFrom255,
  toCamelId
} from './speciesBuild.mjs'

const DATA = new URL('../../src/data/', import.meta.url)
const HERE = new URL('./', import.meta.url)
const read = (url) => JSON.parse(readFileSync(url, 'utf8'))
const write = (url, value) => writeFileSync(url, `${JSON.stringify(value, null, 2)}\n`)

const files = process.argv.slice(2)
if (files.length === 0)
  throw new Error('Cần đường dẫn file nguồn (tương đối với scripts/data-import/)')

const species = read(new URL('species.json', DATA))
const skills = read(new URL('skills.json', DATA))
const races = read(new URL('races.json', DATA))
const elements = new Set(read(new URL('elements.json', DATA)).map((e) => e.id))
const names = {
  vi: read(new URL('i18n/vi/species.json', DATA)),
  en: read(new URL('i18n/en/species.json', DATA))
}
const infoUrl = (kind) => new URL(`i18n/en/speciesInfo/${kind}.json`, DATA)
const info = { flavor: read(infoUrl('flavor')), category: read(infoUrl('category')) }
const raceGroup = new Map(races.map((r) => [r.id, r.groupId]))
const pools = buildSkillPools(skills, species)
const reportUrl = new URL('sources-report.json', HERE)
const report = (() => {
  try {
    return read(reportUrl)
  } catch {
    return {}
  }
})()

const byId = new Map(species.map((s) => [s.id, s]))
// Bỏ chữ của id không còn trong species.json (lần chạy hỏng trước), rồi mới xét tên trùng.
for (const table of [names.vi, names.en, info.flavor, info.category])
  for (const id of Object.keys(table)) if (!byId.has(id)) delete table[id]
const enNameTaken = new Map(Object.entries(names.en).map(([id, name]) => [name.toLowerCase(), id]))
const viNameTaken = new Map(Object.entries(names.vi).map(([id, name]) => [name.toLowerCase(), id]))

/** Nhãn tác phẩm cho tên trùng: "Golem (Dragon Quest)". */
const LABELS = {
  yokaiWatch: 'Yo-kai Watch',
  dragonQuest: 'Dragon Quest',
  monsterHunter: 'Monster Hunter',
  elderScrolls: 'Elder Scrolls',
  dnd: 'D&D',
  chineseFolklore: 'Chinese Folklore'
}
const labelOf = (source) =>
  LABELS[source] ?? source.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

function checkEntry(entry, where) {
  if (!entry.name) throw new Error(`${where}: thiếu name`)
  // Rỗng = loài không hệ (data.md mục "Loài không hệ").
  if (!Array.isArray(entry.elements)) throw new Error(`${where}: thiếu elements`)
  for (const id of entry.elements)
    if (!elements.has(id)) throw new Error(`${where}: hệ không tồn tại "${id}"`)
  if (!raceGroup.has(entry.raceId))
    throw new Error(`${where}: race không tồn tại "${entry.raceId}"`)
  if (!entry.stats && !TIERS[entry.tier]) throw new Error(`${where}: cần stats hoặc tier hợp lệ`)
}

function catchRateOf(entry) {
  if (entry.catchRate !== undefined) return entry.catchRate
  if (entry.catchRate255 !== undefined) return catchRateFrom255(entry.catchRate255)
  return TIERS[entry.tier].catchRate
}

/**
 * `prune: true` trong file nguồn: bỏ loài của nguồn này không còn trong file (ví dụ nhân vật collab bị
 * lọc sau), kèm tên, chữ Dex và mọi hướng tiến hóa trỏ tới nó. Map gán lại bằng biomes-import.mjs.
 */
function pruneMissing(batch, idOfName, result) {
  const wanted = new Set(batch.species.map((entry) => entry.name.toLowerCase()))
  const removed = new Set()
  for (const [name, id] of idOfName) {
    if (
      !wanted.has(name) &&
      ![...idOfName].some(([other, same]) => same === id && wanted.has(other))
    )
      removed.add(id)
  }
  if (removed.size === 0) return
  for (let i = species.length - 1; i >= 0; i--) {
    if (removed.has(species[i].id)) species.splice(i, 1)
  }
  for (const sp of species) {
    if (sp.evolutions?.some((e) => removed.has(e.speciesId)))
      sp.evolutions = sp.evolutions.filter((e) => !removed.has(e.speciesId))
  }
  for (const id of removed) {
    byId.delete(id)
    enNameTaken.delete((names.en[id] ?? '').toLowerCase())
    viNameTaken.delete((names.vi[id] ?? '').toLowerCase())
    for (const table of [names.vi, names.en, info.flavor, info.category]) delete table[id]
  }
  for (const [name, id] of [...idOfName]) if (removed.has(id)) idOfName.delete(name)
  result.pruned = [...removed]
}

function importFile(file) {
  const batch = read(new URL(file, HERE))
  // Nguồn không có tác phẩm (origin living / extinct / cryptid cấm `source`): khóa theo origin.
  const { source, origin } = batch
  const sourceKey = source ?? origin
  const sameSource = (sp) => (source ? sp.source === source : !sp.source && sp.origin === origin)
  const update = batch.update ?? {}
  const result = { added: [], updated: [], renamed: [], droppedEvolutions: [], skipped: [] }
  /** Tên tiếng Anh (thường) → id loài của nguồn này (đã có + mới). */
  const idOfName = new Map()
  for (const sp of species) {
    if (!sameSource(sp) || !names.en[sp.id]) continue
    const enName = names.en[sp.id].toLowerCase()
    idOfName.set(enName, sp.id)
    // Tên đã thêm nhãn tác phẩm vì trùng ("Asura (Yo-kai Watch)") vẫn khớp tên gốc trong file nguồn.
    const suffix = ` (${labelOf(sourceKey).toLowerCase()})`
    if (enName.endsWith(suffix)) idOfName.set(enName.slice(0, -suffix.length), sp.id)
  }
  const seen = new Set()
  const created = []
  if (batch.prune) pruneMissing(batch, idOfName, result)
  for (const entry of batch.species) {
    const where = `${source} "${entry.name}"`
    checkEntry(entry, where)
    const key = entry.name.toLowerCase()
    if (seen.has(key)) {
      result.skipped.push({ name: entry.name, reason: 'trùng tên trong file nguồn' })
      continue
    }
    seen.add(key)
    const existingId = idOfName.get(key)
    if (existingId) {
      updateExisting(byId.get(existingId), entry, update, result)
      continue
    }
    let id = toCamelId(entry.name)
    if (!id) {
      result.skipped.push({ name: entry.name, reason: 'tên không tạo được id' })
      continue
    }
    // Hậu tố id chỉ gồm chữ / số ("Yo-kai Watch" → "YokaiWatch", "D&D" → "Dd").
    const idSuffix = toCamelId(labelOf(sourceKey)).replace(/^./, (c) => c.toUpperCase())
    if (byId.has(id)) id = `${id}${idSuffix}`
    if (byId.has(id)) {
      result.skipped.push({ name: entry.name, reason: `id trùng "${id}"` })
      continue
    }
    let enName = entry.name
    // Tên mới dùng cho cả vi lẫn en nên phải tránh trùng cả tên tiếng Việt của loài khác ("La" = con la).
    if (enNameTaken.has(enName.toLowerCase()) || viNameTaken.has(enName.toLowerCase())) {
      enName = `${entry.name} (${labelOf(sourceKey)})`
      result.renamed.push({ id, name: enName })
    }
    const stats = entry.stats ?? buildStats(id, entry.tier, entry.style)
    const catchRate = catchRateOf(entry)
    const sp = {
      kind: 'normal',
      id,
      raceId: entry.raceId,
      elementIds: entry.elements.slice(0, 2),
      baseStats: stats,
      evolutions: [],
      learnset: buildLearnset(pools, { id, elementIds: entry.elements, stats }),
      catchRate,
      lifespan: buildLifespan({
        stats,
        raceId: entry.raceId,
        groupId: raceGroup.get(entry.raceId),
        origin,
        catchRate
      }),
      ...(entry.weightKg ? { weightKg: entry.weightKg } : {}),
      ...(entry.workStats ? { workStats: entry.workStats } : {}),
      ...(entry.eggType ? { eggType: entry.eggType } : {}),
      ...(entry.heightM ? { heightM: entry.heightM } : {}),
      ...(entry.genderless ? { genderless: true } : {}),
      origin,
      ...(source ? { source } : {})
    }
    species.push(sp)
    byId.set(id, sp)
    idOfName.set(key, id)
    enNameTaken.set(enName.toLowerCase(), id)
    viNameTaken.set(enName.toLowerCase(), id)
    names.en[id] = enName
    names.vi[id] = enName
    writeInfo(id, entry)
    created.push({ sp, entry })
    result.added.push(id)
  }
  // Tiến hóa: nối sau khi đủ loài, giống game gốc (được đổi race, được nhiều dạng trước; mục "Tiến
  // hóa" ở evolution-skills.md). Chỉ bỏ hướng tạo vòng lặp.
  const reaches = (startId, goalId) => {
    const seen = new Set()
    const queue = [startId]
    for (let i = 0; i < queue.length; i++) {
      if (queue[i] === goalId) return true
      if (seen.has(queue[i])) continue
      seen.add(queue[i])
      for (const e of byId.get(queue[i])?.evolutions ?? []) queue.push(e.speciesId)
    }
    return false
  }
  for (const entry of batch.species) {
    if (!entry.evolutions?.length) continue
    const fromId = idOfName.get(entry.name.toLowerCase())
    const from = byId.get(fromId)
    const isNew = created.some((c) => c.sp.id === fromId)
    if (!from || (!isNew && !update.evolutions)) continue
    const evolutions = []
    for (const evolution of entry.evolutions) {
      const target = byId.get(idOfName.get(evolution.name.toLowerCase()))
      if (!target || target.id === from.id) continue
      if (reaches(target.id, from.id)) {
        result.droppedEvolutions.push(`${from.id} → ${target.id} (tạo vòng lặp)`)
        continue
      }
      evolutions.push({ speciesId: target.id, level: Math.max(1, Math.round(evolution.level)) })
    }
    // Giữ hướng tiến hóa bằng đá / dị biến đã có (file nguồn chỉ có tiến hóa theo level).
    // update.evolutions = 'add': chỉ thêm hướng mới vào loài đã có, không bỏ hướng cũ.
    const kept =
      !isNew && update.evolutions === 'add'
        ? from.evolutions
        : from.evolutions.filter((e) => e.itemId !== undefined || e.mutation !== undefined)
    const fresh = evolutions.filter((e) => !kept.some((k) => k.speciesId === e.speciesId))
    from.evolutions = [...kept, ...fresh]
  }
  const totalSpecies = species.filter(sameSource).length
  console.log(`${sourceKey}: thêm ${result.added.length}, cập nhật ${result.updated.length}`)
  // Mỗi file nguồn một mục báo cáo, khóa theo tên file (bỏ tiền tố "extra-"): file bổ sung của cùng
  // nguồn (digimonCyberSleuth.json của digimon) không đè báo cáo của file chính.
  const reportKey = file
    .replace(/^.*\//, '')
    .replace(/\.json$/, '')
    .replace(/^extra-/, '')
  // Lần chạy lại không đổi gì: giữ báo cáo của lần nhập trước (lịch sử), chỉ cập nhật tổng.
  if (
    result.added.length + result.updated.length + (result.pruned?.length ?? 0) === 0 &&
    report[reportKey]
  ) {
    report[reportKey].totalSpecies = totalSpecies
    return
  }
  report[reportKey] = {
    file,
    totalSpecies,
    added: result.added.length,
    updated: result.updated.length,
    renamed: result.renamed,
    pruned: result.pruned ?? [],
    droppedEvolutions: result.droppedEvolutions,
    skipped: result.skipped,
    excluded: batch.excluded ?? []
  }
}

function updateExisting(sp, entry, update, result) {
  const changed = []
  if (update.race && sp.raceId !== entry.raceId) {
    sp.raceId = entry.raceId
    changed.push('race')
  }
  if (update.elements && JSON.stringify(sp.elementIds) !== JSON.stringify(entry.elements)) {
    sp.elementIds = entry.elements.slice(0, 2)
    changed.push('elements')
  }
  // Nguồn chỉ có bậc (không có chỉ số thật): dựng lại theo bậc, tất định theo id như lúc nhập mới.
  const stats = entry.stats ?? (entry.tier ? buildStats(sp.id, entry.tier, entry.style) : undefined)
  if (update.stats && stats && JSON.stringify(sp.baseStats) !== JSON.stringify(stats)) {
    sp.baseStats = stats
    changed.push('stats')
  }
  const hasCatchRate =
    entry.catchRate !== undefined || entry.catchRate255 !== undefined || entry.tier !== undefined
  if (update.catchRate && hasCatchRate && sp.catchRate !== catchRateOf(entry)) {
    sp.catchRate = catchRateOf(entry)
    changed.push('catchRate')
  }
  if (entry.weightKg && !sp.weightKg) {
    sp.weightKg = entry.weightKg
    changed.push('weightKg')
  }
  if (entry.eggType && sp.eggType !== entry.eggType) {
    sp.eggType = entry.eggType
    changed.push('eggType')
  }
  if (entry.heightM && !sp.heightM) {
    sp.heightM = entry.heightM
    changed.push('heightM')
  }
  if (
    update.work &&
    entry.workStats &&
    JSON.stringify(sp.workStats) !== JSON.stringify(entry.workStats)
  ) {
    sp.workStats = entry.workStats
    changed.push('workStats')
  }
  if (writeInfo(sp.id, entry)) changed.push('info')
  if (changed.length > 0) result.updated.push({ id: sp.id, changed })
}

/** Chữ Dex tiếng Anh (phân loại, mô tả); không ghi đè chữ đã có. */
function writeInfo(id, entry) {
  let wrote = false
  for (const kind of ['flavor', 'category']) {
    if (entry[kind] && !info[kind][id]) {
      info[kind][id] = entry[kind]
      wrote = true
    }
  }
  return wrote
}

for (const file of files) importFile(file)
write(new URL('species.json', DATA), species)
write(new URL('i18n/vi/species.json', DATA), names.vi)
write(new URL('i18n/en/species.json', DATA), names.en)
write(infoUrl('flavor'), info.flavor)
write(infoUrl('category'), info.category)
write(reportUrl, report)
