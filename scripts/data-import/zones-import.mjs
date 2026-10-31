/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Sinh src/data/zones.json + tên src/data/i18n/{vi,en}/zones.json (docs/rules/zones.md, mục "Nội
// dung"). Chạy: node scripts/data-import/zones-import.mjs (Node thuần, tất định: cùng species.json /
// races.json / items.json luôn ra cùng kết quả). Bốn kiểu hiểm địa:
// - Theo hệ (`zone<Hệ>`): vào khi tầng cao nhất ≥ minFloor và trong đội có quái mang hệ đó; loài có
//   hệ chính là hệ đó; đồ theo hệ (linh thạch, mảnh Tera, Thức tỉnh đan, Z-Crystal, đá tiến hóa).
// - Theo nhóm race (`zoneRace<Nhóm>`): vào khi có quái thuộc nhóm race đó; loài thuộc nhóm đó; đồ là
//   tinh phách của nhóm (essence<Nhóm>, nhóm không có tinh phách thì bỏ).
// - Cấm địa (`zoneAncient`): vào phải tiêu một Bí Cảnh Lệnh; loài phẩm cấp S trở lên mọi hệ; rương
//   nhiều lượt hơn, shiny cao hơn.
// - Cố hương của loài (`zoneLine<Loài>`): dạng đầu gặp được ngoài tự nhiên có ≥ LINE_MIN_BRANCHES
//   nhánh tiến hóa trực tiếp và cả họ ≤ LINE_MAX_FAMILY loài (Eevee...; cây Digimon lớn thì bỏ); vào
//   khi có quái cùng dòng tiến hóa; quái là cả họ (kể cả dạng đã tiến hóa, gặp ngoài tự nhiên chỉ ở
//   đây); rương có vật phẩm tiến hóa của họ. Tên = "Cố Hương <tên loài>" / "<name> Homeland".
// Luật chung: loài là dạng đầu gặp được ngoài tự nhiên (wildCandidates) có tổng chỉ số gốc ≥ ngưỡng
// phẩm cấp, mẫu đều theo md5, tối đa MAX_SPECIES (thiếu MIN_SPECIES thì lấy loài mạnh nhất của nhóm);
// trọng số = catchRate (huyền thoại hiếm hơn). Boss canh giữ / tinh anh: dạng cuối của loài trong map,
// tổng chỉ số gần trung bình của map nhất. Đồ rơi: bóng / thuốc theo luật map tầng (mapDrops) + đồ
// chủ đề + Đá cường hóa; boss thêm Tẩy luyện thạch.

import fs from 'node:fs'
import path from 'node:path'
import {
  BATTLE_ONLY_FORM_KINDS,
  STONE_BY_ELEMENT,
  averageWildTotal,
  baseStatTotal,
  encounterWeight,
  fieldEntries,
  finalForms,
  hashUnit,
  mapBossDrops,
  mapDrops,
  wildCandidates
} from './biomeAssign.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const writeJson = (file, value) =>
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n')

/** Tổng chỉ số gốc tối thiểu của loài hiểm địa (phẩm cấp B / S, speciesRanks.json). */
const RARE_TOTAL = 510
const ANCIENT_TOTAL = 555
const MAX_SPECIES = 150
const MIN_SPECIES = 40
const RANDOM_BOSSES = 3
const SHINY_CHANCE = 1
const ANCIENT_SHINY_CHANCE = 2
const DOUBLE_CHANCE = 25
const BOSS_CHANCE = 5
/** Boss của hiểm địa (canh giữ, tinh anh) yếu hơn boss tầng (2–5): đội đã hao máu qua nhiều bước. */
const BOSS_MULTIPLIER = { min: 2, max: 3 }

/** Theo hệ: tên vi / en, tầng mở (hệ hiếm / mạnh mở muộn hơn), thời tiết, địa hình. */
const ELEMENT_ZONES = {
  normal: ['Thánh Địa Vạn Thú', 'Sanctuary of Beasts', 3, { clear: 70, fog: 30 }, {}],
  fire: [
    'Hỏa Diệm Sơn',
    'Blazing Caldera',
    3,
    { sun: 70, ashfall: 30 },
    { volcanicTerrain: 60, none: 40 }
  ],
  water: [
    'Hải Uyên Long Cung',
    'Abyssal Trench',
    3,
    { rain: 70, clear: 30 },
    { deepWater: 60, none: 40 }
  ],
  grass: [
    'Vạn Mộc Cổ Lâm',
    'Primeval Grove',
    3,
    { clear: 50, rain: 30, fog: 20 },
    { grassyTerrain: 70, none: 30 }
  ],
  bug: ['Trùng Sào', 'Great Hive', 3, { clear: 60, fog: 40 }, { grassyTerrain: 40, none: 60 }],
  flying: ['Thiên Không Đảo', 'Sky Isles', 3, { strongWinds: 60, clear: 40 }, {}],
  electric: [
    'Lôi Trì',
    'Thunder Pool',
    6,
    { thunderstorm: 60, rain: 40 },
    { electricTerrain: 70, none: 30 }
  ],
  poison: [
    'Vạn Độc Cốc',
    'Venom Valley',
    6,
    { toxicMiasma: 60, fog: 40 },
    { swampTerrain: 60, none: 40 }
  ],
  ground: ['Hoàng Sa Cổ Mạc', 'Ancient Dunes', 6, { sandstorm: 70, sun: 30 }, {}],
  rock: [
    'Thạch Lâm Mê Cung',
    'Stone Labyrinth',
    6,
    { sandstorm: 50, clear: 50 },
    { crystalTerrain: 40, none: 60 }
  ],
  ice: [
    'Băng Phong Cực Địa',
    'Frozen Expanse',
    6,
    { snow: 60, blizzard: 40 },
    { frozenGround: 70, none: 30 }
  ],
  fighting: ['Võ Thần Đài', "War God's Arena", 6, { clear: 100 }, {}],
  psychic: [
    'Huyễn Cảnh',
    'Mindscape',
    10,
    { fog: 50, clear: 50 },
    { psychicTerrain: 70, none: 30 }
  ],
  ghost: [
    'U Minh Địa',
    'Netherrealm',
    10,
    { darkness: 60, fog: 40 },
    { cursedGround: 60, none: 40 }
  ],
  dark: ['Hắc Uyên', 'Shadow Abyss', 10, { darkness: 80, fog: 20 }, { cursedGround: 40, none: 60 }],
  steel: [
    'Thiết Khí Mộ',
    'Forge Tomb',
    10,
    { clear: 60, ashfall: 40 },
    { crystalTerrain: 40, none: 60 }
  ],
  fairy: ['Tiên Cảnh', 'Fairy Glade', 10, { clear: 60, fog: 40 }, { mistyTerrain: 70, none: 30 }],
  dragon: ['Long Mạch', "Dragon's Vein", 15, { strongWinds: 40, thunderstorm: 30, clear: 30 }, {}],
  light: [
    'Thánh Quang Điện',
    'Sanctum of Light',
    15,
    { sun: 60, clear: 40 },
    { holyGround: 70, none: 30 }
  ]
}

/** Theo nhóm race: tên vi / en, tầng mở, thời tiết, địa hình. */
const RACE_ZONES = {
  beast: [
    'Vạn Thú Sơn Lâm',
    'Wildbeast Highlands',
    4,
    { clear: 60, rain: 40 },
    { grassyTerrain: 40, none: 60 }
  ],
  avian: ['Vạn Điểu Nhai', 'Roost of Ten Thousand Wings', 4, { strongWinds: 50, clear: 50 }, {}],
  insect: ['Trùng Cốc', 'Chitin Hollow', 4, { fog: 50, clear: 50 }, { swampTerrain: 40, none: 60 }],
  plant: [
    'Linh Thảo Viên',
    'Spirit Herb Garden',
    4,
    { rain: 50, clear: 50 },
    { grassyTerrain: 80, none: 20 }
  ],
  aquatic: [
    'Bích Hải Long Cung',
    'Coral Palace',
    4,
    { rain: 60, clear: 40 },
    { deepWater: 70, none: 30 }
  ],
  humanoid: ['Cổ Chiến Trường', 'Ancient Battlefield', 5, { clear: 60, fog: 40 }, {}],
  reptile: ['Xà Đầm', 'Serpent Marsh', 5, { rain: 50, fog: 50 }, { swampTerrain: 70, none: 30 }],
  dinosaur: [
    'Thượng Cổ Mãng Hoang',
    'Primordial Wilds',
    6,
    { sun: 50, ashfall: 20, clear: 30 },
    { volcanicTerrain: 30, none: 70 }
  ],
  mineral: [
    'Linh Khoáng Động',
    'Spirit Ore Cavern',
    6,
    { clear: 50, sandstorm: 50 },
    { crystalTerrain: 70, none: 30 }
  ],
  amorphous: [
    'Hỗn Nguyên Trì',
    'Primal Ooze Pools',
    6,
    { fog: 60, rain: 40 },
    { swampTerrain: 60, none: 40 }
  ],
  spirit: [
    'Linh Giới Môn',
    'Spirit Gate',
    6,
    { fog: 60, clear: 40 },
    { mistyTerrain: 50, none: 50 }
  ],
  elemental: [
    'Ngũ Hành Trận',
    'Elemental Nexus',
    8,
    { thunderstorm: 30, sun: 30, snow: 20, rain: 20 },
    {}
  ],
  shapeshifter: ['Thiên Biến Động', 'Cave of Myriad Forms', 8, { fog: 70, clear: 30 }, {}],
  undead: [
    'Vạn Cốt Trủng',
    'Barrow of Bones',
    8,
    { darkness: 60, fog: 40 },
    { cursedGround: 70, none: 30 }
  ],
  aberration: [
    'Dị Không Gian',
    'Aberrant Rift',
    10,
    { darkness: 50, fog: 50 },
    { psychicTerrain: 40, none: 60 }
  ],
  demon: [
    'Ma Vực',
    'Demon Abyss',
    10,
    { darkness: 60, ashfall: 40 },
    { cursedGround: 50, volcanicTerrain: 30, none: 20 }
  ],
  alien: [
    'Thiên Ngoại Vẫn Thạch',
    'Fallen Star Crater',
    10,
    { clear: 50, darkness: 50 },
    { crystalTerrain: 50, none: 50 }
  ],
  dragon: ['Long Cốc', 'Dragon Valley', 12, { strongWinds: 50, clear: 50 }, {}],
  celestial: [
    'Cửu Thiên Cung',
    'Ninefold Heaven Palace',
    15,
    { sun: 50, clear: 50 },
    { holyGround: 80, none: 20 }
  ],
  deity: ['Thần Điện', 'Divine Sanctum', 15, { sun: 40, clear: 60 }, { holyGround: 60, none: 40 }]
}

/** Cấm địa cần vật phẩm khóa (tiêu khi vào). */
const ANCIENT_ZONE = {
  id: 'zoneAncient',
  names: ['Thượng Cổ Cấm Địa', 'Forbidden Ancient Land'],
  minFloor: 10,
  keyItemId: 'secretRealmToken',
  weather: { fog: 40, darkness: 30, clear: 30 },
  terrain: { cursedGround: 30, crystalTerrain: 30, none: 40 }
}

/** Cố hương của loài: số nhánh tiến hóa trực tiếp tối thiểu, cỡ họ tối đa, tầng mở. */
const LINE_MIN_BRANCHES = 3
const LINE_MAX_FAMILY = 40
const LINE_MIN_FLOOR = 5

/** Dược liệu hợp hệ (rương thường). */
const HERB_BY_ELEMENT = {
  grass: 'lingzhi',
  ice: 'snowLotus',
  ground: 'ginseng',
  poison: 'fleeceflower'
}

const species = readJson('src/data/species.json')
const races = readJson('src/data/races.json')
const raceGroupIds = readJson('src/data/raceGroups.json').map((group) => group.id)
const items = new Set(readJson('src/data/items.json').map((item) => item.id))
const elements = readJson('src/data/elements.json').map((element) => element.id)
const byId = new Map(species.map((s) => [s.id, s]))
const groupOfRace = new Map(races.map((race) => [race.id, race.groupId]))
const candidates = wildCandidates(species)
const speciesNames = {
  vi: readJson('src/data/i18n/vi/species.json'),
  en: readJson('src/data/i18n/en/species.json')
}

const capital = (id) => id[0].toUpperCase() + id.slice(1)
const need = (itemId) => {
  if (!items.has(itemId)) throw new Error(`Thiếu item "${itemId}"`)
  return itemId
}
const optional = (itemId) => (items.has(itemId) ? itemId : null)

/**
 * Loài của hiểm địa: mẫu đều theo md5 trong các loài của nhóm có tổng chỉ số ≥ `minTotal` (không lấy
 * mạnh nhất trước: nhóm đông loài mạnh sẽ khó hơn hẳn nhóm khác), trọng số theo catchRate.
 */
function zoneSpecies(key, matches, minTotal) {
  const pool = candidates
    .filter(matches)
    .sort((a, b) => baseStatTotal(b) - baseStatTotal(a) || a.id.localeCompare(b.id))
  const rare = pool
    .filter((s) => baseStatTotal(s) >= minTotal)
    .sort((a, b) => hashUnit(key, a.id) - hashUnit(key, b.id))
    .slice(0, MAX_SPECIES)
  const picked = rare.length >= MIN_SPECIES ? rare : pool.slice(0, MIN_SPECIES)
  if (picked.length === 0) throw new Error(`Hiểm địa "${key}" không có loài`)
  return picked.map((s) => ({ speciesId: s.id, weight: encounterWeight(s) }))
}

/** Boss: dạng cuối gần trung bình tổng chỉ số của map nhất (hòa theo md5). */
function zoneBosses(zoneId, encounters) {
  const target = averageWildTotal(encounters, byId)
  const finals = [...new Set(encounters.flatMap((e) => finalForms(e.speciesId, byId)))]
  const ranked = finals.sort(
    (a, b) =>
      Math.abs(baseStatTotal(byId.get(a)) - target) -
        Math.abs(baseStatTotal(byId.get(b)) - target) || hashUnit(zoneId, a) - hashUnit(zoneId, b)
  )
  if (ranked.length === 0) throw new Error(`Hiểm địa "${zoneId}" không có boss`)
  return ranked.slice(0, 1 + RANDOM_BOSSES)
}

/** Bỏ món null (đồ chủ đề không có item). */
const present = (entries) => entries.filter((entry) => entry.itemId !== null)

/**
 * Một hiểm địa từ chủ đề: `encounters`, điều kiện, đồ rơi / rương thêm (ngoài phần chung), môi
 * trường, tỉ lệ shiny, số lượt rương.
 */
function buildZone(theme) {
  const { id, encounters, weather, terrain, elementIds } = theme
  const [guardian, ...elites] = zoneBosses(id, encounters)
  const source = { id, weather, terrain, elements: elementIds }
  return {
    id,
    map: {
      doubleChance: DOUBLE_CHANCE,
      shinyChance: theme.shinyChance ?? SHINY_CHANCE,
      bossChance: BOSS_CHANCE,
      bossMultiplierMin: BOSS_MULTIPLIER.min,
      bossMultiplierMax: BOSS_MULTIPLIER.max,
      encounters,
      drops: [
        ...mapDrops(source, new Set(elementIds)),
        { itemId: need('enhanceStone'), chance: 8 },
        ...present(theme.drops)
      ],
      bossDrops: [
        ...mapBossDrops(source),
        { itemId: need('refiningStone'), chance: 20 },
        ...present(theme.bossDrops)
      ],
      floorBossSpeciesId: guardian,
      bosses: [guardian, ...elites].map((speciesId) => ({ speciesId, weight: 1, drops: [] })),
      weather: fieldEntries(weather),
      terrain: fieldEntries(terrain)
    },
    requirements: theme.requirements,
    treasure: {
      rolls: theme.treasureRolls ?? 2,
      items: [
        { itemId: need('enhanceStone'), weight: 30, min: 1, max: 3 },
        { itemId: need('superPotion'), weight: 15, min: 1, max: 2 },
        { itemId: need('expCandyS'), weight: 10, min: 1, max: 2 },
        ...present(theme.treasure)
      ]
    },
    rareTreasure: {
      rolls: theme.rareRolls ?? 1,
      items: [
        { itemId: need('refiningStone'), weight: 25, min: 1, max: 2 },
        { itemId: need('rareCandy'), weight: 15, min: 1, max: 1 },
        { itemId: need('expCandyS'), weight: 15, min: 1, max: 2 },
        { itemId: need('secretRealmToken'), weight: 10, min: 1, max: 1 },
        { itemId: need('breakthroughPill'), weight: 5, min: 1, max: 1 },
        ...present(theme.rareTreasure)
      ]
    }
  }
}

function elementZone(elementId) {
  const [, , minFloor, weather, terrain] = ELEMENT_ZONES[elementId]
  const El = capital(elementId)
  const spiritStone = need(`spiritStone${El}`)
  const awakeningPill = need(`awakeningPill${El}`)
  const teraShard = need(`${elementId}TeraShard`)
  const zCrystal = need(`${elementId}ZCrystal`)
  const stone = STONE_BY_ELEMENT[elementId] ?? null
  const herb = HERB_BY_ELEMENT[elementId] ?? null
  return buildZone({
    id: `zone${El}`,
    encounters: zoneSpecies(elementId, (s) => s.elementIds[0] === elementId, RARE_TOTAL),
    weather,
    terrain,
    elementIds: [elementId],
    requirements: [
      { type: 'minFloor', floor: minFloor },
      { type: 'partyElement', elementId, count: 1 }
    ],
    drops: [
      { itemId: spiritStone, chance: 6 },
      { itemId: teraShard, chance: 2 },
      { itemId: awakeningPill, chance: 0.5 }
    ],
    bossDrops: [
      { itemId: spiritStone, chance: 40 },
      { itemId: awakeningPill, chance: 10 },
      { itemId: zCrystal, chance: 8 }
    ],
    treasure: [
      { itemId: spiritStone, weight: 25, min: 1, max: 2 },
      { itemId: teraShard, weight: 10, min: 1, max: 1 },
      { itemId: stone && need(stone), weight: 5, min: 1, max: 1 },
      { itemId: herb && need(herb), weight: 10, min: 1, max: 3 }
    ],
    rareTreasure: [
      { itemId: awakeningPill, weight: 20, min: 1, max: 1 },
      { itemId: zCrystal, weight: 10, min: 1, max: 1 }
    ]
  })
}

function raceZone(raceGroupId) {
  const [, , minFloor, weather, terrain] = RACE_ZONES[raceGroupId]
  const essence = optional(`essence${capital(raceGroupId)}`)
  const encounters = zoneSpecies(
    `race:${raceGroupId}`,
    (s) => groupOfRace.get(s.raceId) === raceGroupId,
    RARE_TOTAL
  )
  // Hệ của map (đá tiến hóa rơi theo hệ) = hệ chính phổ biến nhất của loài trong map.
  const counts = new Map()
  for (const entry of encounters) {
    const elementId = byId.get(entry.speciesId).elementIds[0]
    counts.set(elementId, (counts.get(elementId) ?? 0) + 1)
  }
  const [topElement] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return buildZone({
    id: `zoneRace${capital(raceGroupId)}`,
    encounters,
    weather,
    terrain,
    elementIds: [topElement],
    requirements: [
      { type: 'minFloor', floor: minFloor },
      { type: 'partyRaceGroup', raceGroupId, count: 1 }
    ],
    drops: [{ itemId: essence, chance: 10 }],
    bossDrops: [{ itemId: essence, chance: 60 }],
    treasure: [{ itemId: essence, weight: 30, min: 1, max: 3 }],
    rareTreasure: [{ itemId: essence, weight: 20, min: 3, max: 6 }]
  })
}

function ancientZone() {
  const { id, minFloor, keyItemId, weather, terrain } = ANCIENT_ZONE
  return buildZone({
    id,
    encounters: zoneSpecies(id, () => true, ANCIENT_TOTAL),
    weather,
    terrain,
    elementIds: [],
    shinyChance: ANCIENT_SHINY_CHANCE,
    treasureRolls: 3,
    rareRolls: 2,
    requirements: [
      { type: 'minFloor', floor: minFloor },
      { type: 'item', itemId: need(keyItemId), count: 1, consume: true }
    ],
    drops: [{ itemId: need('rareCandy'), chance: 1 }],
    bossDrops: [{ itemId: need('rareCandy'), chance: 25 }],
    treasure: [{ itemId: need('refiningStone'), weight: 15, min: 1, max: 1 }],
    rareTreasure: [
      { itemId: need('expCandyM'), weight: 10, min: 1, max: 1 },
      { itemId: need('humanFormPill'), weight: 5, min: 1, max: 1 }
    ]
  })
}

/** Loài đích của một mục tiến hóa (một loài hoặc nhiều loài). */
const evolutionTargets = (evolution) =>
  evolution.speciesId ? [evolution.speciesId] : (evolution.speciesIds ?? [])

/** Cả họ của dạng đầu: chính nó và mọi dạng sau gặp được ngoài trận (bỏ dạng chỉ có trong trận). */
function familyOf(rootId) {
  const seen = new Set()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()
    const entry = byId.get(id)
    if (seen.has(id) || entry?.kind !== 'normal') continue
    if (BATTLE_ONLY_FORM_KINDS.includes(entry.formKind)) continue
    seen.add(id)
    for (const evolution of entry.evolutions ?? []) stack.push(...evolutionTargets(evolution))
  }
  return [...seen]
}

/** Mọi id vật phẩm có trong mục tiến hóa (kể cả trong điều kiện), chỉ giữ item có thật. */
function evolutionItemIds(family) {
  const found = new Set()
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        if (key === 'itemId' && typeof inner === 'string' && items.has(inner)) found.add(inner)
        else visit(inner)
      }
    }
  }
  for (const id of family) visit(byId.get(id).evolutions ?? [])
  return [...found].sort()
}

/** Dạng đầu được làm cố hương (luật ở đầu file), theo thứ tự species.json. */
const lineRoots = candidates.filter(
  (s) =>
    (s.evolutions ?? []).length >= LINE_MIN_BRANCHES && familyOf(s.id).length <= LINE_MAX_FAMILY
)

function lineZone(root) {
  const elementId = root.elementIds[0]
  const [, , , weather, terrain] = ELEMENT_ZONES[elementId]
  const evolutionItems = evolutionItemIds(familyOf(root.id))
  return buildZone({
    id: `zoneLine${capital(root.id)}`,
    encounters: familyOf(root.id).map((id) => ({
      speciesId: id,
      weight: encounterWeight(byId.get(id))
    })),
    weather,
    terrain,
    elementIds: [elementId],
    requirements: [
      { type: 'minFloor', floor: LINE_MIN_FLOOR },
      { type: 'partySpeciesLine', speciesId: root.id, count: 1 }
    ],
    drops: [],
    bossDrops: [],
    treasure: evolutionItems.map((itemId) => ({ itemId, weight: 20, min: 1, max: 1 })),
    rareTreasure: evolutionItems.map((itemId) => ({ itemId, weight: 15, min: 1, max: 1 }))
  })
}

const missingElements = elements.filter((id) => !ELEMENT_ZONES[id])
if (missingElements.length > 0)
  throw new Error(`Hệ chưa có hiểm địa: ${missingElements.join(', ')}`)
const missingGroups = raceGroupIds.filter((id) => !RACE_ZONES[id])
if (missingGroups.length > 0)
  throw new Error(`Nhóm race chưa có hiểm địa: ${missingGroups.join(', ')}`)

const zones = [
  ...elements.map(elementZone),
  ...raceGroupIds.map(raceZone),
  ancientZone(),
  ...lineRoots.map(lineZone)
]
writeJson('src/data/zones.json', zones)
for (const [language, index] of [
  ['vi', 0],
  ['en', 1]
]) {
  const names = {
    ...Object.fromEntries(elements.map((id) => [`zone${capital(id)}`, ELEMENT_ZONES[id][index]])),
    ...Object.fromEntries(
      raceGroupIds.map((id) => [`zoneRace${capital(id)}`, RACE_ZONES[id][index]])
    ),
    [ANCIENT_ZONE.id]: ANCIENT_ZONE.names[index],
    ...Object.fromEntries(
      lineRoots.map((root) => {
        const name = speciesNames[language][root.id]
        return [
          `zoneLine${capital(root.id)}`,
          index === 0 ? `Cố Hương ${name}` : `${name} Homeland`
        ]
      })
    )
  }
  writeJson(`src/data/i18n/${language}/zones.json`, names)
}
console.log(
  zones
    .map((z) => `${z.id}: ${z.map.encounters.length} loài, canh giữ ${z.map.floorBossSpeciesId}`)
    .join('\n')
)
