// 41 Fable của Koltera (bản 1, tên Steam hiện là Fableverse) từ bảng gốc trong app.asar của game đã cài
// (game-files/extract.py): tên, hệ, 5 chỉ số, độ hiếm. Race game không có: đặt tay theo nghĩa tên (bảng
// RACES). Chạy: node scripts/data-import/koltera-fetch.mjs, rồi species-batch-import.mjs
// sources/koltera.json. Luật ở content-sources-real.md mục "Koltera".

import { readDumpJson } from './game-files/gameFiles.mjs'
import { writeSource } from './sourceHelpers.mjs'

/** Độ hiếm → bậc (lấy tỉ lệ bắt theo bậc). */
const RARITY_TIERS = {
  Starter: 'medium',
  Common: 'small',
  Uncommon: 'medium',
  Rare: 'peak',
  Legendary: 'mythic'
}
/** Hệ của game → hệ project (như Koltera 2). */
const ELEMENTS = { Water: 'water', Air: 'flying', Fire: 'fire', Earth: 'ground' }
const RACES = {
  Otto: 'mustelid',
  Arbowl: 'owl',
  Firox: 'canid',
  Rok: 'golem',
  Croakle: 'anuran',
  Shrubark: 'tree',
  Shellbunny: 'lagomorph',
  Pengrum: 'penguin',
  Seaserpa: 'serpent',
  Coralite: 'cnidarian',
  Beedle: 'hymenopteran',
  Goledon: 'golem',
  Ratpack: 'rodent',
  Tuskador: 'proboscid',
  Cindertail: 'mythicBeast',
  Leafiana: 'flower',
  Sandmite: 'arachnid',
  Blokion: 'felid',
  Paratoot: 'parrot',
  Stagsol: 'cervid',
  Nebuloth: 'lepidopteran',
  Aviando: 'bird',
  Agardae: 'slime',
  Laventoad: 'anuran',
  Nibbles: 'rodent',
  Tricera: 'ornithischian',
  Buteo: 'raptor',
  Ferracoon: 'mustelid',
  Angrose: 'flower',
  Prismare: 'equid',
  Fluffpup: 'canid',
  Polairian: 'ursid',
  Frostkit: 'felid',
  Swimpo: 'fish',
  Eatsa: 'mythicBeast',
  Bunbun: 'lagomorph',
  Cirquil: 'rodent',
  Sylvera: 'fey',
  Suijin: 'god',
  Titanwing: 'mythicBird',
  Barblade: 'mythicBeast'
}

const species = readDumpJson('koltera.json').map((fable) => {
  const raceId = RACES[fable.Name]
  if (!raceId) throw new Error(`Chưa đặt race cho ${fable.Name} (thêm vào RACES)`)
  return {
    name: fable.Name,
    elements: [ELEMENTS[fable.Type]],
    raceId,
    tier: RARITY_TIERS[fable.Rarity],
    // Game có 5 chỉ số: công dùng cho cả đặc công (game không chia vật lý / đặc biệt), sức bền làm đặc thủ.
    stats: {
      hp: fable.Health,
      attack: fable.Attack,
      defense: fable.Defense,
      spAttack: fable.Attack,
      spDefense: fable.Stamina,
      speed: fable.Speed
    },
    category: `${fable.Rarity} ${fable.Type} Fable`
  }
})
// Lần nhập đầu lấy từ guide, hệ đặt tay: cập nhật theo bảng gốc.
writeSource('koltera', {
  source: 'koltera',
  origin: 'fantasy',
  update: { elements: true, stats: true },
  species
})
