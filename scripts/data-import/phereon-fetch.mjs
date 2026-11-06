/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Loài dạng sinh vật của Portals of Phereon (content-sources-real.md mục "Portals of Phereon"). Game người
// lớn: CHỈ nhập loài dạng sinh vật theo danh sách chủ project duyệt, chữ mô tả tự viết (không lấy mô tả
// gốc), không nhập skill / passive người lớn. Số đọc từ game đã cài: extract.py task `phereon` →
// game-files/dump/phereon.json; cây tiến hóa ở phereon/evolutions.json (trích từ mã game).
// Chạy: PHEREON_DIR=... python extract.py <steam> phereon; node scripts/data-import/phereon-fetch.mjs;
// rồi species-batch-import.mjs sources/portalsOfPhereon.json.

import { readFileSync } from 'node:fs'

import { readDumpJson, statsAtTier } from './game-files/gameFiles.mjs'
import { guessRace } from './raceGuess.mjs'
import { writeSource } from './sourceHelpers.mjs'

/**
 * Danh sách chủ project duyệt (168 tên, 2026-11-05) trừ 12 tên không có CharacterData trong game (Robot,
 * ForestDragon, WaterDragon, Spiderling, SlimeGod, Toad, TinyShroom, BigShroom, SkyWhale, IceStrider, Rift,
 * Lamia); thêm loài người (danh từ chung, không phải tên riêng; content-data.md).
 */
const SPECIES =
  `FirePlant Tentacle HealFlower Phoenix Unicorn Pegasus LightLizard FireLizard PlantLizard Naga
PoisonLizard LightBug SoldierBug Butterfly LavaBug LavaWorm Floater Bird MagicDeer ForestStalker Naiad Wolf Mule
DragonWelp FireDragon Turtle BeastPlant BeastLizard LightFox FireBeast Mantis Seedling SeedlingMonster
SeedlingDragon SeedlingBattery FireBlossom SlimeBeast SlimeLizard Leviathan TrueUnicorn AnglerFish ShadowGhost
GhostPlant LavaGhost Spirit ShadowBeast ShadowInsect ShadowLizard Ghostwing Spectre Glider SwampSlime Mosquito
GlowWorm PoisonPlant Vine Kraken KrakenTentacle MushroomCore Spore LavaFish SuperHybrid CursedPlant ShadowPlant
HybridFlower OmniFlower Kitsune LifeRoot Wisp GrassSpirit FireSpirit WaterSpirit GrassCat FireCat WaterFish
GrassSteed HellBeast SeaSerpent ShellDrake FireSnake OrbFish PlantSpider Lavorm LavaFrog WaterSpider LavaDrinker
DeathFly HoleWorm Stinger Shade Strider Mandragora SlimeBulb GhostBulb RingBeast IceSpirit IceBeast FrostWeaver
IceBall RockSpirit RockGolem RockCrab RockGuardian ManaWorm SpikedSeal LightSpirit LightBee LightOrb HolySpirit
ShadowSpirit NightCrawler LavaSpider GlowFly Burrower Horror Brute RockHugger Guardian SkyWorm CatSeal DarkSeal
FrostSeal SwampSeal HolySeal PortalRipper ManaTank Fenrir FungalSpirit FungalStrider FungalGlider GlowFish
SpiritBeast SandWorm Oasis ElementalSeed TentacleClone RockThrower DarkMoth LightMoth FungalSoldier Elexolotl
Cyclops Triclops LoveSpider PoisonArachnid ElectroSpirit Pylon DesertSeal SpikeSlime StaticSpider SeaHorse Mole
Toxtle Goblin Elf Orc Human Human_Knight Human_Mage`
    .split(/\s+/)
    .filter(Boolean)

/** Tên gốc nghe người lớn: đổi tên trung tính. */
const RENAMED = {
  LoveSpider: 'Silk Spider',
  Human_Knight: 'Human Knight',
  Human_Mage: 'Human Mage'
}

const dump = readDumpJson('phereon.json')
const enumName = (kind, value) => dump.enums[kind][String(value)]
const bySpecies = new Map(dump.characters.map((row) => [row.species, row]))
const displayName = (id) => RENAMED[id] ?? id.replace(/([a-z])([A-Z])/g, '$1 $2')

// Hệ theo getAffinity của gốc: Fungal (nhãn) → nấm; sát thương điện → điện; còn lại theo loại trứng.
// Lệch gốc: trứng thường gốc là hệ Đá mặc định nên về hệ Thường; trứng chất nhờn về hệ Độc.
const ELEMENT_BY_EGG = {
  Normal: 'normal',
  Lava: 'fire',
  Aquatic: 'water',
  Floral: 'grass',
  Stone: 'rock',
  Ice: 'ice',
  Light: 'light',
  Dark: 'dark',
  Slime: 'poison',
  Crystal: 'rock'
}
const ELEMENT_BY_DAMAGE = {
  Fire: 'fire',
  Water: 'water',
  Frost: 'ice',
  Electric: 'electric',
  Poison: 'poison',
  Radiant: 'light',
  Shadow: 'dark'
}
const FLYING = new Set(['flying'])

function elementsOf(row) {
  const egg = enumName('EggType', row.eggType)
  const damage = enumName('DamageType', row.damageType)
  const primary = row.specialTraits.includes('Fungal')
    ? 'fungal'
    : damage === 'Electric'
      ? 'electric'
      : ELEMENT_BY_EGG[egg]
  const ghostly = /Ghost|Spectre|Shade|Wisp/.test(row.species)
  const candidates = [
    primary,
    ...(ghostly ? ['ghost'] : []),
    ...(FLYING.has(enumName('MovementType', row.movementType)) ? ['flying'] : []),
    ELEMENT_BY_DAMAGE[damage]
  ].filter(Boolean)
  return [...new Set(candidates)].slice(0, 2)
}

const rows = SPECIES.map((id) => {
  const row = bySpecies.get(id)
  if (!row) throw new Error(`Game không có CharacterData của ${id}`)
  return row
})

const statKeys = ['hp', 'strength', 'armor', 'magicStrength', 'mana', 'speed']
const averages = Object.fromEntries(
  statKeys.map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0) / rows.length])
)
/** Armor gốc nhiều loài = 0: cộng 1 để loài không giáp không rơi về chỉ số tối thiểu. */
const ratio = (row, key) =>
  key === 'armor'
    ? (row.armor + 1) / (averages.armor + 1)
    : (row[key] + 0.5) / (averages[key] + 0.5)
/** Dáng chỉ số: chỉ số gốc so với trung bình cả game, nhân tăng trưởng theo level của gốc (1 = trung bình). */
function shapeOf(row) {
  const { growth } = row
  const grown = (key, rate) => ratio(row, key) * ((1 + rate) / 2)
  return {
    hp: grown('hp', growth.hp),
    attack: grown('strength', growth.strength),
    defense: ratio(row, 'armor'),
    spAttack: grown('magicStrength', growth.magic),
    // Gốc không có thủ phép: lấy mana (sức chịu đựng phép) làm dáng thủ đặc biệt.
    spDefense: grown('mana', growth.mana),
    speed: grown('speed', growth.speed)
  }
}

const evolutions = JSON.parse(
  readFileSync(new URL('./phereon/evolutions.json', import.meta.url), 'utf8')
)
const preForms = new Map()
for (const edge of evolutions) preForms.set(edge.to, [...(preForms.get(edge.to) ?? []), edge.from])
/** Giai đoạn trong cây tiến hóa (0 = dạng đầu). Gốc tiến hóa ở level tối đa (bậc 5 / 10 / 15...). */
const stageOf = (id, seen = new Set()) => {
  if (seen.has(id)) return 0
  seen.add(id)
  const before = preForms.get(id) ?? []
  return before.length === 0 ? 0 : 1 + Math.max(...before.map((from) => stageOf(from, seen)))
}
const LEVEL_BY_STAGE = [16, 32, 48]

const powerOf = (row) => Object.values(shapeOf(row)).reduce((sum, value) => sum + value, 0)
const standalone = rows
  .filter((row) => stageOf(row.species) === 0 && !evolutions.some((e) => e.from === row.species))
  .sort((a, b) => powerOf(a) - powerOf(b))
const quantile = (row) => standalone.indexOf(row) / Math.max(1, standalone.length - 1)

/** Bậc chỉ số: loài trong cây theo giai đoạn; loài lẻ theo độ mạnh so với loài lẻ khác; Elite +1 bậc. */
function tierOf(row) {
  const TIERS = ['small', 'medium', 'peak', 'large', 'mythic']
  const inTree = evolutions.some((e) => e.from === row.species || e.to === row.species)
  const base = inTree
    ? Math.min(2, stageOf(row.species))
    : quantile(row) < 0.3
      ? 0
      : quantile(row) < 0.7
        ? 1
        : quantile(row) < 0.95
          ? 2
          : 3
  return TIERS[Math.min(TIERS.length - 1, base + (row.specialTraits.includes('Elite') ? 1 : 0))]
}

const HABITAT = {
  Normal: 'wild',
  Lava: 'lava-born',
  Aquatic: 'water-dwelling',
  Floral: 'plant-bound',
  Stone: 'stone-shelled',
  Ice: 'frost-touched',
  Light: 'light-blessed',
  Dark: 'shadow-dwelling',
  Slime: 'slime-coated',
  Crystal: 'crystal-grown'
}
const MOVEMENT = {
  normal: 'roams the portal worlds on foot',
  semiAquatic: 'hunts along shallow water',
  amphibic: 'moves freely between land and water',
  flying: 'drifts high above the portal worlds',
  stationary: 'stays rooted and waits for prey',
  lava: 'wades through molten rock',
  slime: 'oozes slowly across the ground',
  aquatic: 'swims the deep waters',
  semiSlime: 'leaves a sticky trail wherever it goes',
  shadow: 'slips unseen between shadows',
  laquatic: 'swims through both water and lava'
}
const STRIKE = {
  Fire: 'Its strikes leave burns.',
  Water: 'It strikes with crashing water.',
  Frost: 'Its touch freezes flesh.',
  Electric: 'Sparks jump from its body when it attacks.',
  Poison: 'Its attacks carry venom.',
  Bleeding: 'Its attacks leave wounds that keep bleeding.',
  Slashing: 'Its blades cut deep.',
  Radiant: 'It attacks with searing light.',
  Shadow: 'It attacks with bolts of darkness.',
  True: 'Nothing seems to dull its attacks.'
}

/** Mô tả tự viết theo môi trường, cách di chuyển, kiểu sát thương (không dùng mô tả gốc). */
function flavorOf(row) {
  const habitat = HABITAT[enumName('EggType', row.eggType)] ?? 'wild'
  const body = displayName(row.species).split(' ').pop().toLowerCase()
  const movement = MOVEMENT[enumName('MovementType', row.movementType)] ?? 'roams the portal worlds'
  const strike = STRIKE[enumName('DamageType', row.damageType)]
  const article = /^[aeiou]/i.test(habitat) ? 'An' : 'A'
  return `${article} ${habitat} ${body} that ${movement}.${strike ? ` ${strike}` : ''}`
}

/** Cân nặng của loài lớn (Giant / Enormous): đúng ngưỡng quái lớn (monster-size.md). */
const LARGE_WEIGHT_KG = 1000
const LARGE_SIZES = new Set(['Giant', 'Enormous'])
const NON_TYPES = { Dark: 'dark', Normal: 'normal' }

/** Race theo bảng (từ khóa trong tên đoán sai), rồi nhãn của gốc, rồi từ khóa. Tiến hóa được đổi race như gốc. */
const RACE_BY_SPECIES = {
  Goblin: 'goblin',
  Elf: 'elf',
  Orc: 'orc',
  Human: 'human',
  Human_Knight: 'human',
  Human_Mage: 'human',
  Mandragora: 'flower',
  Brute: 'troll',
  Cyclops: 'giant',
  Triclops: 'giant',
  Pylon: 'machine',
  Naiad: 'natureSpirit',
  Oasis: 'natureSpirit',
  Spirit: 'ghost',
  ShadowInsect: 'insectoid',
  Ghostwing: 'wraith',
  Toxtle: 'turtle',
  PortalRipper: 'eldritch',
  Guardian: 'golem',
  LifeRoot: 'tree',
  SuperHybrid: 'chimera',
  NightCrawler: 'annelid',
  HellBeast: 'fiend',
  Shade: 'wraith',
  DragonWelp: 'drake',
  FireDragon: 'westernDragon'
}
const RACE_BY_TRAIT = { Seal: 'pinniped', Worm: 'annelid', Fungal: 'fungus', Slime: 'slime' }
const raceOf = (row, name, flavor) => {
  if (RACE_BY_SPECIES[row.species]) return RACE_BY_SPECIES[row.species]
  const tag = row.specialTraits.find((trait) => RACE_BY_TRAIT[trait])
  if (tag) return RACE_BY_TRAIT[tag]
  if (/Spirit$/.test(row.species)) return 'elementalSpirit'
  const guessed = guessRace([name], null) ?? guessRace([flavor], null)
  if (guessed) return guessed
  return row.specialTraits.includes('Insectoid') ? 'insectoid' : 'mythicBeast'
}

const species = rows.map((row) => {
  const name = displayName(row.species)
  const egg = enumName('EggType', row.eggType)
  const next = evolutions.filter((edge) => edge.from === row.species)
  const flavor = flavorOf(row)
  const tier = tierOf(row)
  return {
    name,
    elements: elementsOf(row),
    raceId: raceOf(row, name, flavor),
    tier,
    stats: statsAtTier(shapeOf(row), tier),
    ...(LARGE_SIZES.has(enumName('Size', row.size)) ? { weightKg: LARGE_WEIGHT_KG } : {}),
    ...(next.length
      ? {
          evolutions: next.map((edge) => ({
            name: displayName(edge.to),
            level: LEVEL_BY_STAGE[Math.min(2, stageOf(row.species))]
          }))
        }
      : {}),
    category: row.specialTraits.includes('Spirit') ? 'Elemental spirit' : 'Portal creature',
    flavor,
    eggType: (NON_TYPES[egg] ?? egg).toLowerCase()
  }
})

writeSource('portalsOfPhereon', {
  source: 'portalsOfPhereon',
  origin: 'fantasy',
  prune: true,
  update: { race: true, stats: true, elements: true, evolutions: true },
  species,
  excluded: [
    {
      name: 'Robot, ForestDragon, WaterDragon, Spiderling, SlimeGod, Toad, TinyShroom, BigShroom, SkyWhale, IceStrider, Rift, Lamia',
      reason: 'không có CharacterData trong bản game đã cài (v0.32)'
    },
    { name: 'Loài gợi dục của gốc', reason: 'chủ project chốt không nhập nội dung người lớn' }
  ]
})
console.log(species.length, 'loài')
