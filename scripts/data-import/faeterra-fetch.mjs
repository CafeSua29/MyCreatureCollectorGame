// 121 Fae của FaeTerra từ game đã cài (game-files/extract.py): tên, chuỗi tiến hóa, huyền thoại, hệ thật.
// Dạng huyền thoại đều là bậc thần thoại; còn lại bậc theo giai đoạn chuỗi. Race đặt tay theo tên dạng đầu
// (bảng RACES, game không có race). Chạy: node scripts/data-import/faeterra-fetch.mjs, rồi
// species-batch-import.mjs sources/faeterra.json. Luật ở content-sources-real.md mục "FaeTerra".

import { readDumpJson } from './game-files/gameFiles.mjs'
import { writeSource } from './sourceHelpers.mjs'

/** Hệ FaeTerra → hệ game. */
const ELEMENTS = {
  AIR: 'flying',
  BEAST: 'normal',
  DRAGON: 'dragon',
  EARTH: 'ground',
  FIRE: 'fire',
  FROST: 'ice',
  INSECT: 'bug',
  LEAF: 'grass',
  LIGHT: 'light',
  LIGHTNING: 'electric',
  MAGIC: 'psychic',
  SHADOW: 'dark',
  WATER: 'water'
}
const STAGE_TIERS = ['small', 'medium', 'peak']
const STAGE_LEVELS = [16, 32]
/** Dạng đầu của chuỗi → race. */
const RACES = {
  Toracle: 'fish',
  Avion: 'machine',
  Palakin: 'human',
  Draygo: 'westernDragon',
  Magnox: 'fangedBeast',
  Swanblossom: 'waterfowl',
  Atlas: 'giant',
  Nebula: 'eldritch',
  Anu: 'god',
  Stellaria: 'angel',
  Solios: 'god',
  Drax: 'westernDragon',
  Jemini: 'changeling',
  Axol: 'caudate',
  Soltrix: 'canid',
  Fawneer: 'cervid',
  Wooty: 'owl',
  'Mr.Mot': 'insectivore',
  Fenpaw: 'canid',
  Lunarva: 'lepidopteran',
  Peckidae: 'bird',
  Samubee: 'hymenopteran',
  Linx: 'felid',
  Turto: 'turtle',
  Carapinch: 'crustacean',
  Maycelia: 'fungus',
  Smallfin: 'cetacean',
  Manaray: 'fish',
  Pluckpea: 'flower',
  Magpy: 'bird',
  "Spook'em": 'ghost',
  Radu: 'chiropteran',
  Geohog: 'insectivore',
  Twigleon: 'lizard',
  Manti: 'neopteron',
  Boarig: 'suid',
  Charyena: 'canid',
  Harpy: 'harpyfolk',
  Sadpa: 'primate',
  Hoblin: 'goblin',
  Pyrepaw: 'felid',
  Shocktooth: 'theropod',
  Ceratop: 'ornithischian',
  Mudile: 'crocodilian',
  Kwarm: 'beetle',
  Scaragold: 'beetle',
  Ward: 'golem',
  Palibear: 'ursid',
  'Po-coi': 'fish',
  Marlin: 'fish',
  Lumenia: 'fey',
  Gambit: 'livingObject',
  Occultress: 'human',
  Snowstump: 'proboscid',
  Narlance: 'cetacean',
  Entroot: 'tree',
  'B.A.R': 'machine',
  Joltin: 'lagomorph',
  Kileon: 'lizard'
}

const species = []
for (const { elements, forms } of readDumpJson('faeterra.json')) {
  const raceId = RACES[forms[0].name]
  if (!raceId) throw new Error(`Chưa đặt race cho chuỗi ${forms[0].name} (thêm vào RACES)`)
  const mapped = elements.map((element) => {
    if (!ELEMENTS[element]) throw new Error(`Hệ lạ ${element} của ${forms[0].name}`)
    return ELEMENTS[element]
  })
  forms.forEach((form, stage) => {
    const next = forms[stage + 1]
    species.push({
      name: form.name,
      elements: mapped,
      raceId,
      tier: form.legendary ? 'mythic' : STAGE_TIERS[stage],
      category: `${form.id} ${elements.join(' / ')} Fae`,
      evolutions: next ? [{ name: next.name, level: STAGE_LEVELS[stage] }] : []
    })
  })
}
if (species.length !== 121) throw new Error(`FaeTerra có 121 Fae, đọc được ${species.length}`)
writeSource('faeterra', { source: 'faeterra', origin: 'fantasy', species })
