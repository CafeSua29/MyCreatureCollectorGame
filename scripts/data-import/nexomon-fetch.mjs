/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải Nexomon của Nexomon 1 và Nexomon: Extinction (nexomon.fandom.com, mọi trang trong
// Category:Creatures có infobox NexoInfo / NexoInfoEX) thành sources/nexomon.json. Chạy:
// node scripts/data-import/nexomon-fetch.mjs (cần mạng), rồi species-batch-import.mjs sources/nexomon.json.
// Luật ở content-sources-real.md mục "Nexomon".

import { guessRace } from './raceGuess.mjs'
import {
  categoryMembers,
  existingSpecies,
  infoboxParams,
  pageCategories,
  pagesWikitext,
  plainText,
  unifyChainRaces,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://nexomon.fandom.com/api.php')
/** Hệ Nexomon → hệ game. */
const ELEMENTS = {
  normal: 'normal',
  fire: 'fire',
  water: 'water',
  plant: 'grass',
  electric: 'electric',
  wind: 'flying',
  mineral: 'rock',
  ghost: 'ghost',
  psychic: 'psychic'
}
/** Độ hiếm → bậc (cho tỉ lệ bắt / thọ nguyên) và tỉ lệ bắt (thang 0–100). */
const RARITY = {
  common: { tier: 'small', catchRate: 70 },
  uncommon: { tier: 'medium', catchRate: 60 },
  rare: { tier: 'medium', catchRate: 40 },
  'mega rare': { tier: 'peak', catchRate: 20 },
  'ultra rare': { tier: 'large', catchRate: 12 },
  special: { tier: 'large', catchRate: 12 },
  legendary: { tier: 'mythic', catchRate: 5 }
}
/** Category loài vật của wiki ("Cat Nexomon") → race. */
const ANIMAL_RACE = {
  bat: 'chiropteran',
  bear: 'ursid',
  beaver: 'rodent',
  bird: 'bird',
  cactus: 'flower',
  cat: 'felid',
  cow: 'buffalo',
  crab: 'crustacean',
  crocodile: 'crocodilian',
  deer: 'cervid',
  dog: 'canid',
  dragon: 'westernDragon',
  elephant: 'proboscid',
  fish: 'fish',
  fox: 'canid',
  frog: 'anuran',
  horse: 'equid',
  insect: 'insectoid',
  jellyfish: 'cnidarian',
  kangaroo: 'marsupial',
  mushroom: 'fungus',
  pig: 'suid',
  primate: 'primate',
  rabbit: 'lagomorph',
  rodent: 'rodent',
  sheep: 'buffalo',
  skunk: 'mustelid',
  slug: 'mollusk',
  snake: 'serpent',
  squid: 'cephalopod',
  turtle: 'turtle',
  wolf: 'canid'
}
/** Tổng 6 chỉ số của loài có BST trung vị của game đó (chuẩn hóa từng game, hai game khác thang). */
const MEDIAN_TOTAL = 420

const titles = await categoryMembers(api, 'Creatures')
const texts = await pagesWikitext(api, titles)
const categories = await pageCategories(api, titles)
const existing = existingSpecies('nexomon')

/** Infobox Extinction ưu tiên hơn Nexomon 1 (bản mới hơn). */
function infoboxOf(text) {
  const extinction =
    /\{\{NexoInfoEX([\s\S]*?)\n\}\}/.exec(text) ?? /\{\{NexoInfoEX([\s\S]*?)\}\}/.exec(text)
  if (extinction) return { game: 'extinction', params: infoboxParams(extinction[1]) }
  const first = /\{\{NexoInfo\b([\s\S]*?)\}\}/.exec(text)
  return first ? { game: 'first', params: infoboxParams(first[1]) } : null
}

/** Chuỗi tiến hóa từ {{EvolutionLine |Base |Evo1 |Evo1Req = Level N ...}}. */
function evolutionLine(text) {
  const block = /\{\{EvolutionLine([\s\S]*?)\}\}/.exec(text)
  if (!block) return []
  const p = infoboxParams(block[1])
  const stages = [p.base, p.evo1, p.evo2, p.evo3].map((n) => (n ? plainText(n) : null))
  const result = []
  for (let i = 1; i < stages.length; i++) {
    const level = Number(/(\d+)/.exec(p[`evo${i}req`] ?? '')?.[1])
    if (stages[i - 1] && stages[i] && level) result.push([stages[i - 1], stages[i], level])
  }
  return result
}

/** "Darine (Extinction)" → "Darine": hai game có trang riêng cho cùng một Nexomon. */
const baseName = (title) => title.replace(/\s*\((?:Extinction|Nexomon 1|Nexomon)\)$/, '')

/** Race: category loài vật của wiki → tên → mô tả (bỏ kết quả "người" vì mô tả hay có "hunter"). */
function raceOf(title, flavor) {
  for (const category of categories.get(title) ?? []) {
    const animal = /^(\w+) Nexomon$/.exec(category)?.[1]?.toLowerCase()
    if (animal && ANIMAL_RACE[animal]) return ANIMAL_RACE[animal]
  }
  const fromName = guessRace([baseName(title)], null)
  if (fromName) return fromName
  const fromFlavor = guessRace([flavor], null)
  return fromFlavor && fromFlavor !== 'human' ? fromFlavor : null
}

const parsedByName = new Map()
for (const title of titles) {
  const text = texts.get(title)
  if (!text) continue
  const box = infoboxOf(text)
  if (!box) continue
  const p = box.params
  const element = ELEMENTS[(p.element ?? '').toLowerCase().trim()]
  const hp = Number(p.hp)
  if (!element || !hp) continue
  const description =
    /==\s*Description\s*==\s*\n([^\n]+)/.exec(text)?.[1] ??
    /'''[^']+'''\s+is\s+an?\s+[^\n]+/.exec(text)?.[0]
  const name = baseName(title)
  // Trang trùng tên của hai game: giữ bản Extinction.
  if (parsedByName.get(name.toLowerCase())?.game === 'extinction') continue
  const flavor = description ? plainText(description) : undefined
  parsedByName.set(name.toLowerCase(), {
    name,
    race: raceOf(title, flavor),
    game: box.game,
    element,
    rarity: RARITY[(p.rarity ?? '').toLowerCase().trim()] ?? RARITY.rare,
    shape: {
      hp,
      attack: Number(p.attack) || 1,
      defense: Number(p.defense) || 1,
      speed: Number(p.speed) || 1
    },
    chains: evolutionLine(text).map(([from, to, level]) => [baseName(from), baseName(to), level]),
    flavor
  })
}
const parsed = [...parsedByName.values()]

/** BST trung vị của mỗi game để quy về cùng thang. */
const medianOf = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const sumShape = (s) => s.hp + s.attack + s.defense + s.speed
const medians = Object.fromEntries(
  ['first', 'extinction'].map((game) => [
    game,
    medianOf(parsed.filter((e) => e.game === game).map((e) => sumShape(e.shape)))
  ])
)

const names = new Set(parsed.map((e) => e.name.toLowerCase()))
const evolutionsOf = new Map()
for (const entry of parsed) {
  for (const [from, to, level] of entry.chains) {
    if (!names.has(from.toLowerCase()) || !names.has(to.toLowerCase())) continue
    const list = evolutionsOf.get(from.toLowerCase()) ?? []
    if (!list.some((e) => e.name.toLowerCase() === to.toLowerCase())) list.push({ name: to, level })
    evolutionsOf.set(from.toLowerCase(), list)
  }
}

const species = parsed.map((entry) => {
  const { hp, attack, defense, speed } = entry.shape
  // Nexomon chỉ có một cặp công / thủ: dùng cho cả vật lý lẫn đặc biệt.
  const shape = { hp, attack, defense, spAttack: attack, spDefense: defense, speed }
  const total = (MEDIAN_TOTAL * sumShape(entry.shape)) / medians[entry.game]
  const sum = Object.values(shape).reduce((a, b) => a + b, 0)
  const stats = Object.fromEntries(
    Object.entries(shape).map(([k, v]) => [k, Math.max(1, Math.round((v * total) / sum))])
  )
  return {
    name: entry.name,
    elements: [entry.element],
    raceId:
      existing.get(entry.name.toLowerCase())?.raceId ??
      entry.race ??
      (entry.element === 'ghost' ? 'ghost' : 'mythicBeast'),
    stats,
    tier: entry.rarity.tier,
    catchRate: entry.rarity.catchRate,
    evolutions: evolutionsOf.get(entry.name.toLowerCase()) ?? [],
    category: `${entry.element[0].toUpperCase()}${entry.element.slice(1)} Nexomon`,
    flavor: entry.flavor
  }
})
// Race của chuỗi lấy theo dạng đầu (đứng trước trong danh sách): tên dạng sau dễ trùng từ khóa khác
// ("Champ" là quái hồ Champ trong khi cả chuỗi là tinh tinh).
const evolvedNames = new Set(
  species.flatMap((s) => (s.evolutions ?? []).map((e) => e.name.toLowerCase()))
)
unifyChainRaces(
  [...species].sort(
    (a, b) => evolvedNames.has(a.name.toLowerCase()) - evolvedNames.has(b.name.toLowerCase())
  ),
  existing
)
writeSource('nexomon', { source: 'nexomon', origin: 'fantasy', species })
