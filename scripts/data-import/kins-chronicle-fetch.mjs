/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quái Kin's Chronicle từ data/Enemies.json (RPG Maker) của game đã cài, theo mục trong file: quái ngẫu
// nhiên (vùng → bậc), quái lang thang, boss. Theo luật "Boss được lấy", nhưng nhân vật độc nhất mang tên
// riêng / thần thoại (Aphrodite, Medusa, Hades, Corvena...) không lấy: dùng bảng cho phép ALLOWED. Hệ theo
// bảng kháng của game (hệ có hệ số thấp nhất dưới 1), không có thì đoán theo tên. Race đặt tay trong bảng.
// Chạy: node scripts/data-import/kins-chronicle-fetch.mjs, rồi species-batch-import.mjs
// sources/kinsChronicle.json. Luật ở content-sources-real.md mục "Kin's Chronicle".

import { readGameJson } from './game-files/gameFiles.mjs'
import { writeSource } from './sourceHelpers.mjs'
import { guessElements } from './smallSources.mjs'

const DATA = "Kin's Chronicle/data"
/** Mã trait "hệ số nhận theo hệ" của RPG Maker. */
const ELEMENT_RATE_CODE = 11
/** Hệ của game → hệ của project (Physical, Hinder, Aid không phải hệ). */
const ELEMENTS = {
  Fire: 'fire',
  Ice: 'ice',
  Bolt: 'electric',
  Aqua: 'water',
  Stone: 'rock',
  Wind: 'flying',
  Light: 'light',
  Shadow: 'dark',
  Star: 'fairy',
  Void: 'ghost'
}
/** Mục trong Enemies.json (dòng "~X~" hoặc "// X") → bậc. */
const SECTION_TIERS = {
  GORGE: 'small',
  GORGE2: 'small',
  CAVERN: 'small',
  GROTTO: 'medium',
  'DRY BASIN': 'medium',
  'CLOCK TOWER': 'peak',
  'WANDERING MOBS': 'peak'
}
const BOSS_TIER = 'large'
/** Tên được lấy → race (loài / sinh vật chung; tên riêng không nằm trong bảng). */
const ALLOWED = {
  'Huge Snail': 'mollusk',
  'Singing Slime': 'slime',
  'Walking Tree': 'tree',
  'Void Hive': 'hive',
  Emberhound: 'canid',
  'Grotto Guardian': 'golem',
  'Kelp Quetzal': 'bird',
  Jubokko: 'yokai',
  'Scarlet Wyrm': 'drake',
  'Dark Crow': 'bird',
  Radulac: 'mythicBeast',
  'Clockwork Prototype': 'machine',
  Mimik: 'mimic',
  Amalgamate: 'mutant',
  'Apex Behemoth': 'kaiju',
  'Clockwork Knight': 'machine',
  Crababoon: 'crustacean',
  Minotaur: 'beastfolk',
  'High Dragon': 'westernDragon',
  'Frost Lich': 'lich',
  'Gazer Skull': 'skeleton',
  Gazer: 'eldritch',
  Huanglong: 'easternDragon',
  'Lich Warlord': 'lich',
  Mountoll: 'troll',
  'Primal Demon': 'fiend',
  'Slime Guardian': 'slime',
  'Soulless One': 'wraith',
  'Void Mage': 'human',
  Aquarius: 'elementalSpirit',
  Aries: 'buffalo',
  Cancer: 'crustacean',
  Capricorn: 'buffalo',
  Leo: 'felid',
  'King Libra': 'golem',
  'Queen Libra': 'golem',
  Pisces: 'fish',
  Saggitarius: 'centaur',
  Scorpio: 'arachnid',
  Taurus: 'buffalo',
  Virgo: 'angel',
  Megalodile: 'crocodilian',
  Pegausi: 'equid',
  Voidoll: 'livingObject',
  'The Grim Reaper': 'wraith',
  'Earth Worm': 'annelid',
  Karkinos: 'crustacean',
  'Carnivorous Plant': 'flower',
  Manticora: 'chimera',
  'Mantis Hunter': 'insectfolk',
  'Dark Hunter': 'human',
  'Black Ant Queen': 'hymenopteran',
  Bonemask: 'skeleton',
  'Continental Turtle': 'turtle',
  'Dragon Sovereign': 'elderDragon',
  'Earth Horse': 'equid',
  'Insect Queen': 'insectoid',
  Jiangshi: 'zombie',
  Kitsune: 'yokai',
  Gigan: 'giant',
  'Gigan Volcanica': 'giant',
  'Magma Dragon': 'westernDragon',
  'Parrot King': 'parrot',
  Rafflesia: 'flower',
  'Weretiger Maxima': 'lycanthrope',
  'Eldritch Knight': 'eldritch',
  'Arcane Golem': 'golem',
  'Clockwork Skull': 'machine',
  Cyberwolf: 'machine',
  Phoenix: 'mythicBird',
  'Runic Stone Golem': 'golem',
  'The Fallen': 'angel',
  'Queen Bee': 'hymenopteran',
  'The Electric Hivemind': 'hive'
}
const EVOLUTIONS = { Gigan: 'Gigan Volcanica', Gazer: 'Gazer Skull' }

const elementNames = readGameJson(`${DATA}/System.json`).elements
const enemies = readGameJson(`${DATA}/Enemies.json`).filter(Boolean)

/** Hệ của quái: hệ nhận ít nhất theo bảng kháng; không có thì đoán theo tên. */
function elementsOf(enemy) {
  const rates = enemy.traits
    .filter((trait) => trait.code === ELEMENT_RATE_CODE && ELEMENTS[elementNames[trait.dataId]])
    .filter((trait) => trait.value < 1)
    .sort((a, b) => a.value - b.value)
  return rates.length > 0
    ? [...new Set(rates.slice(0, 2).map((t) => ELEMENTS[elementNames[t.dataId]]))]
    : guessElements(enemy.name)
}

const species = new Map()
let section = ''
for (const enemy of enemies) {
  const header = /^(?:\/\/\s*|~)([^~]*?)~?$/.exec(enemy.name)
  if (header && /^(\/\/|~)/.test(enemy.name)) {
    section = header[1].replace(/~.*/, '').trim()
    continue
  }
  const raceId = ALLOWED[enemy.name]
  if (!raceId || species.has(enemy.name)) continue
  species.set(enemy.name, {
    name: enemy.name,
    elements: elementsOf(enemy),
    raceId,
    tier: SECTION_TIERS[section] ?? BOSS_TIER,
    category: section,
    evolutions: EVOLUTIONS[enemy.name] ? [{ name: EVOLUTIONS[enemy.name], level: 32 }] : []
  })
}
const missing = Object.keys(ALLOWED).filter((name) => !species.has(name))
if (missing.length > 0) throw new Error(`Enemies.json không có: ${missing.join(', ')}`)
writeSource('kinsChronicle', {
  source: 'kinsChronicle',
  origin: 'fantasy',
  species: [...species.values()]
})
