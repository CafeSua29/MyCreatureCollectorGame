/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập lại tiến hóa đặc biệt của Pokémon từ @pkmn/dex (bước 5f, mục "Tiến hóa có điều kiện" ở
// docs/rules/evolution-skills.md; quy đổi ở mục Pokémon của docs/rules/content-sources.md) thay
// cho cách quy về level lúc nhập: thân mật, đồ cầm, biết chiêu, giới tính, đồng đội, thời tiết,
// vật phẩm tiến hóa riêng, giờ / trăng tròn (docs/rules/calendar.md). Chạy lại được (tính lại `conditions` từ đầu mỗi lần).
// @pkmn/dex không phải dependency của project: cài vào thư mục tạm rồi truyền đường dẫn:
//   npm install @pkmn/dex --prefix <tạm>
//   node scripts/data-import/evolution-conditions-import.mjs <tạm>/node_modules/@pkmn/dex/build/index.mjs
// rồi prettier + npm test. Báo cáo: scripts/data-import/evolution-conditions-report.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = new URL('../../', import.meta.url)
const path = (relative) => new URL(relative, root)
const readJson = (relative) => JSON.parse(readFileSync(path(relative), 'utf8'))
const writeJson = (relative, value) =>
  writeFileSync(path(relative), JSON.stringify(value, null, 2) + '\n', 'utf8')

const dexPath = process.argv[2]
if (!dexPath) throw new Error('Thiếu đường dẫn tới @pkmn/dex (xem đầu file)')
const { Dex } = await import(pathToFileURL(dexPath).href)

// Thân mật để tiến hóa (bản gốc 160 / 255; affinity.md dùng cùng thang 0–255).
const FRIENDSHIP = 160
// Level tối thiểu khi đổi sang tiến hóa bằng đá (luật nhập Pokémon: dạng đầu 15, đã tiến hóa 25).
const STONE_LEVEL = { base: 15, evolved: 25 }
// Bản gốc không có level: chỉ cần điều kiện (thân mật, cầm đồ, biết chiêu, đồng đội).
const NO_LEVEL = 1
// Điều kiện theo giờ / trăng (docs/rules/calendar.md), cộng thêm vào điều kiện khác, không bỏ
// level. Ban ngày của Pokémon (Gen 7: 6:00–17:59) = bình minh + ban ngày + hoàng hôn của game;
// ban đêm (18:00–5:59) = ban đêm; "evening" (Lycanroc Dusk 17:00–17:59) = hoàng hôn. Trăng tròn
// (Ursaluna, Legends: Arceus) là đêm trăng tròn.
const TIME_PATTERN = /during the day|at night|during the evening|full moon/i
const DAY_TIME = ['dawn', 'day', 'dusk']
function timeConditions(text) {
  if (!text) return []
  const phases = (list) => ({ type: 'timeOfDay', params: { phases: list } })
  if (/full moon/i.test(text)) {
    return [phases(['night']), { type: 'moonPhase', params: { phases: ['full'] } }]
  }
  if (/during the day/i.test(text)) return [phases(DAY_TIME)]
  if (/during the evening/i.test(text)) return [phases(['dusk'])]
  if (/at night/i.test(text)) return [phases(['night'])]
  return []
}
// Không có tương đương (trao đổi, thử thách riêng của game gốc): giữ level đã quy đổi.
// Probopass: từ Gen 8 Nosepass tiến hóa bằng Thunder Stone (bản dex vẫn ghi "magnetic field").
const ITEM_OVERRIDES = {
  Probopass: 'Thunder Stone',
  Ursaluna: 'Peat Block',
  Kleavor: 'Black Augurite'
}

const species = readJson('src/data/species.json')
const items = Object.fromEntries(readJson('src/data/items.json').map((i) => [i.id, i]))
const skills = new Set(readJson('src/data/skills.json').map((s) => s.id))
const elements = new Set(readJson('src/data/elements.json').map((e) => e.id))
const byId = Object.fromEntries(species.map((s) => [s.id, s]))

/** Tên tiếng Anh → id camelCase của project (cùng cách đặt id lúc nhập). */
function toId(name) {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.:]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  return words
    .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
    .join('')
}

const dexById = {}
for (const s of Dex.species.all()) dexById[toId(s.name)] ??= s

const pre = {}
for (const s of species) for (const e of s.evolutions ?? []) pre[e.speciesId] = s.id

const report = { changed: [], kept: [], skipped: [] }
const note = (list, from, to, reason) => list.push({ from, to, reason })

/** Điều kiện từ câu evoCondition của dex; trả về null nếu không quy đổi được. */
function conditionsFromText(text) {
  if (!text) return []
  if (TIME_PATTERN.test(text)) return []
  if (text === 'during rain') return [{ type: 'weather', params: { weatherIds: ['rain'] } }]
  const typed = text.match(/^with an? (\w+)-type in the party$/)
  if (typed && elements.has(typed[1].toLowerCase())) {
    return [{ type: 'partnerInParty', params: { elementId: typed[1].toLowerCase() } }]
  }
  const partner = text.match(/^with an? (.+?)(?: in (?:the )?party)?$/)
  if (partner && byId[toId(partner[1])]) {
    return [{ type: 'partnerInParty', params: { speciesId: toId(partner[1]) } }]
  }
  const fairy = text.match(/^with an? (\w+)-type move and two levels of Affection$/)
  if (fairy && elements.has(fairy[1].toLowerCase())) {
    return [
      { type: 'affinity', params: { min: FRIENDSHIP } },
      { type: 'knowsElementSkill', params: { elementId: fairy[1].toLowerCase() } }
    ]
  }
  return null
}

/**
 * Điều kiện giới tính: loài đích chỉ một giới tính mà dạng trước có cả hai. Bỏ qua khi dạng của
 * giới tính kia (kiểu Meowstic-F) không có trong project: loài của project đại diện cả hai.
 */
function genderCondition(target, prevo) {
  if (target.gender !== 'M' && target.gender !== 'F') return []
  if (prevo.gender) return []
  const base = target.baseSpecies
  const counterpart = target.name === base ? `${base}-F` : base
  const counterpartDex = Dex.species.get(counterpart)
  if (counterpartDex?.exists && counterpartDex.gender && !byId[toId(counterpartDex.name)]) return []
  return [{ type: 'gender', params: { gender: target.gender === 'M' ? 'male' : 'female' } }]
}

/** Item của dex → id vật phẩm của project, nếu có. */
const itemOf = (name) => (name && items[toId(name)] ? toId(name) : null)

/** Tính lại một hướng tiến hóa; trả về hướng mới hoặc null nếu giữ nguyên. */
function convert(from, evolution, target) {
  const prevo = Dex.species.get(target.prevo)
  const conditions = []
  let { level, itemId } = evolution
  const stoneLevel = pre[from.id] ? STONE_LEVEL.evolved : STONE_LEVEL.base
  const override = ITEM_OVERRIDES[target.name]
  // Câu điều kiện của hướng 'other' / có vật phẩm thay thế đã xử lý ở nhánh của nó.
  const textConditions =
    override || target.evoType === 'other' ? [] : conditionsFromText(target.evoCondition)
  const reasons = []
  if (textConditions === null) reasons.push(`điều kiện không quy đổi: "${target.evoCondition}"`)
  else conditions.push(...textConditions)
  // Đã có đá / bùa vùng thì giữ level của nó; không thì hướng chỉ điều kiện bỏ level.
  const freeLevel = () => {
    if (itemId === undefined) level = NO_LEVEL
  }
  const useStone = (name) => {
    const stone = itemOf(name)
    if (!stone || items[stone].category !== 'evolutionStone') {
      reasons.push(`thiếu đá "${name}"`)
      return
    }
    if (itemId !== stone && itemId !== undefined && !itemId.endsWith('Charm')) {
      reasons.push(`đã có đá khác "${itemId}"`)
      return
    }
    // Bùa vùng (dạng vùng miền) giữ nguyên: luật nhập dạng vùng miền.
    if (itemId === undefined) {
      itemId = stone
      level = stoneLevel
    }
  }
  switch (target.evoType) {
    case 'levelFriendship':
      conditions.push({ type: 'affinity', params: { min: FRIENDSHIP } })
      freeLevel()
      break
    case 'levelHold': {
      const held = itemOf(target.evoItem)
      if (held) {
        conditions.push({ type: 'heldItem', params: { itemId: held, consume: true } })
        freeLevel()
      } else reasons.push(`thiếu đồ cầm "${target.evoItem}"`)
      break
    }
    case 'levelMove': {
      const skillId = toId(target.evoMove)
      if (skills.has(skillId)) {
        conditions.push({ type: 'knowsSkill', params: { skillId } })
        freeLevel()
      } else reasons.push(`thiếu skill "${target.evoMove}"`)
      break
    }
    case 'levelExtra':
      if (override) useStone(override)
      else if (textConditions?.length) freeLevel()
      break
    case 'useItem':
      useStone(override ?? target.evoItem)
      break
    case 'trade':
      // Trao đổi không có tương đương: giữ level đã quy đổi; đồ cầm khi trao đổi thành heldItem.
      if (target.evoItem) {
        const held = itemOf(target.evoItem)
        if (held) conditions.push({ type: 'heldItem', params: { itemId: held, consume: true } })
        else reasons.push(`thiếu đồ cầm "${target.evoItem}"`)
      } else if (!textConditions?.length) reasons.push('trao đổi: giữ level')
      break
    case 'other':
      if (override) useStone(override)
      else reasons.push(`không có tương đương: "${target.evoCondition}"`)
      break
    default:
      break
  }
  conditions.push(...genderCondition(target, prevo))
  conditions.push(...timeConditions(target.evoCondition))
  const next = { speciesId: evolution.speciesId, level }
  if (itemId !== undefined) next.itemId = itemId
  if (conditions.length > 0) next.conditions = conditions
  if (evolution.mutation) next.mutation = evolution.mutation
  return { next, reasons }
}

for (const from of species) {
  if (from.kind !== 'normal' || !from.evolutions?.length) continue
  from.evolutions = from.evolutions.map((evolution) => {
    const target = dexById[evolution.speciesId]
    // Chỉ loài Pokémon (có trong dex) và đúng hướng của bản gốc (dạng trước trong dex là loài này).
    if (!target?.prevo || !dexById[from.id]) return evolution
    if (toId(target.prevo) !== from.id) {
      note(report.skipped, from.id, evolution.speciesId, `dạng trước trong dex là ${target.prevo}`)
      return evolution
    }
    const { next, reasons } = convert(from, { ...evolution, conditions: undefined }, target)
    const before = JSON.stringify(evolution)
    const after = JSON.stringify(next)
    for (const reason of reasons) note(report.kept, from.id, evolution.speciesId, reason)
    if (before !== after) report.changed.push({ from: from.id, before: evolution, after: next })
    return next
  })
}

writeJson('src/data/species.json', species)
writeJson('scripts/data-import/evolution-conditions-report.json', report)
console.log(
  `đổi ${report.changed.length}, giữ (có lý do) ${report.kept.length}, bỏ qua ${report.skipped.length}`
)
