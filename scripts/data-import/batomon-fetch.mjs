/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải Batomon (Batomon Showdown, berrymint; dữ liệu Batodex nhúng trong trang batodex.com) thành
// sources/batomon.json. Chạy: node scripts/data-import/batomon-fetch.mjs (cần mạng), rồi
// species-batch-import.mjs sources/batomon.json.

import { guessRace } from './raceGuess.mjs'
import { unifyChainRaces, writeSource } from './sourceHelpers.mjs'

const URL_DEX = 'https://batodex.com/'
const TYPE_ELEMENT = {
  fighting: 'fighting',
  grass: 'grass',
  bug: 'bug',
  electric: 'electric',
  water: 'water',
  fire: 'fire',
  curio: 'steel',
  rock: 'rock',
  ghost: 'ghost',
  toxic: 'poison',
  flying: 'flying',
  dragon: 'dragon',
  steel: 'steel'
}
/** Bậc cửa hàng 1–6 của game gốc → bậc chỉ số. */
const TIER = { 1: 'small', 2: 'small', 3: 'medium', 4: 'medium', 5: 'peak', 6: 'large' }
/** Game gốc lên tối đa level 4 (tiến hóa ở level 3) → level tiến hóa của game này. */
const LEVEL_EVOLUTION = 20
const CONDITION_EVOLUTION = 30

const response = await fetch(URL_DEX, {
  headers: { 'User-Agent': 'creature-collector-data-import/1.0 (offline game data build)' }
})
if (!response.ok) throw new Error(`Không tải được ${URL_DEX} (${response.status})`)
const html = await response.text()
// Dữ liệu React Server Components: nối các chuỗi self.__next_f.push([1, "..."]) rồi lấy mảng entries.
const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("[\s\S]*?")\]\)<\/script>/g)]
  .map((m) => JSON.parse(m[1]))
  .join('')
const start = payload.indexOf('"entries":[') + '"entries":'.length
let depth = 0
let end = start
for (; end < payload.length; end++) {
  if (payload[end] === '[') depth++
  else if (payload[end] === ']' && --depth === 0) break
}
const entries = JSON.parse(payload.slice(start, end + 1))

/** Giá trị tham chiếu "$13:props:children:0:props:entries:N:field" → entries[N][field]. */
function resolve(value) {
  const match = typeof value === 'string' && /entries:(\d+):(\w+)$/.exec(value)
  return match ? entries[Number(match[1])]?.[match[2]] : value
}

const all = new Map()
for (const entry of entries) {
  all.set(entry.id, entry)
  const form = entry.evolvedForm
  if (form && !all.has(form.id)) all.set(form.id, form)
}
const species = [...all.values()]
  .filter((e) => !e.flags?.excludeFromDex)
  .map((e) => {
    const types = resolve(e.types)
    const elements = (Array.isArray(types) ? types : [])
      .map((t) => TYPE_ELEMENT[t?.id])
      .filter(Boolean)
    const evolution = e.evolution?.targetId ? all.get(e.evolution.targetId) : null
    return {
      name: e.name,
      elements: elements.length ? [...new Set(elements)].slice(0, 2) : ['normal'],
      raceId: guessRace([e.name], 'mythicBeast'),
      tier: TIER[e.tier] ?? 'medium',
      evolutions: evolution
        ? [
            {
              name: evolution.name,
              level: e.evolution.trigger === 'level' ? LEVEL_EVOLUTION : CONDITION_EVOLUTION
            }
          ]
        : [],
      category: e.rarity?.label ? `${e.rarity.label} Batomon` : 'Batomon'
    }
  })
// Dạng tiến hóa mạnh hơn dạng trước một bậc (game gốc giữ nguyên bậc cửa hàng).
const STEP = { small: 'medium', medium: 'peak', peak: 'large', large: 'large' }
const targets = new Set(species.flatMap((s) => s.evolutions.map((e) => e.name)))
for (const s of species) if (targets.has(s.name)) s.tier = STEP[s.tier]
unifyChainRaces(species, new Map())
writeSource('batomon', {
  source: 'batomon',
  origin: 'fantasy',
  update: { evolutions: 'add' },
  species
})
