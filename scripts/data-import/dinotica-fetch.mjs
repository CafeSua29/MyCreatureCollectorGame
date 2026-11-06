/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Dino Pet và quái của Dinotica từ game đã cài (game-files/extract.py): Pet_Config (50 pet), MonsterConfig
// (quái, boss), English.csv (tên). Quái theo bộ ba X / Elder X / Ancient X thành chuỗi tiến hóa; pet trùng
// tên quái dùng chung một loài. Bỏ tên dịch máy trùng pet và bộ phận boss. Race / hệ đặt tay theo id pet
// (P_Rex, P_FireCat...) vì bảng không ghi. Chạy: node scripts/data-import/dinotica-fetch.mjs, rồi
// species-batch-import.mjs sources/dinotica.json. Luật ở content-sources-real.md mục "Dinotica".

import { parseCsv, readDump } from './game-files/gameFiles.mjs'
import { writeSource } from './sourceHelpers.mjs'

/** Id pet → [hệ, race]; hệ rỗng = không hệ (pet không gợi hệ nào, game không có hệ). */
const PETS = {
  P_Rex: [[], 'theropod'],
  P_Ptero: [['flying'], 'pterosaur'],
  P_ThreeHorns: [['ground'], 'ornithischian'],
  P_Pachy: [['rock'], 'ornithischian'],
  P_Frog: [['water'], 'anuran'],
  P_TreeDeer: [['grass'], 'cervid'],
  P_StormEagle: [['electric', 'flying'], 'raptor'],
  P_Deer: [['grass'], 'cervid'],
  P_MudDragon: [['ground', 'flying'], 'pterosaur'],
  P_Dinornis: [[], 'ratite'],
  P_Kangaroo: [['ground'], 'marsupial'],
  P_CrystalDragon: [['rock', 'dragon'], 'crystal'],
  P_Salamander: [['flying'], 'caudate'],
  P_ForestKing: [['grass'], 'pachyderm'],
  P_Gazelle: [['dark'], 'buffalo'],
  P_SandWorm: [['ground'], 'annelid'],
  P_SnowOwl: [['ice', 'flying'], 'owl'],
  P_SnowBeast: [['ice'], 'wildBeast'],
  P_Mammoth: [['ice'], 'proboscid'],
  P_Stoat: [['ice'], 'mustelid'],
  P_IceGhost: [['ice', 'ghost'], 'ghost'],
  P_Plesiosaur: [['water'], 'marineReptile'],
  P_Jakiro: [['ice', 'fire'], 'westernDragon'],
  P_FrostStar: [['ice'], 'cnidarian'],
  P_FireFlower: [['fire'], 'cnidarian'],
  P_FireCat: [['fire'], 'felid'],
  P_FireKylin: [['fire'], 'divineBeast'],
  P_FireBird: [['fire', 'flying'], 'mythicBird'],
  P_FireBFly: [['fire', 'bug'], 'lepidopteran'],
  P_FireCrane: [['fire', 'flying'], 'mythicBird'],
  P_FireFish: [['fire', 'water'], 'fish'],
  P_Lobster: [['water'], 'crustacean'],
  P_BigEye: [[], 'mythicBeast'],
  P_BubbleBeast: [['water'], 'mythicBeast'],
  P_Panda: [['grass', 'fighting'], 'ursid'],
  P_Sheep: [[], 'buffalo'],
  P_Huahuai: [['dark'], 'mythicBeast'],
  P_Taotie: [['dark'], 'divineBeast'],
  P_Qiongqi: [['dark', 'flying'], 'divineBeast'],
  P_Jiegou: [['fire'], 'mythicBeast'],
  P_Capybara: [['bug'], 'rodent'],
  P_Crystabeetle: [['bug', 'rock'], 'beetle'],
  P_Fuzzscorp: [['poison', 'bug'], 'arachnid'],
  P_Bluethroat: [['flying', 'dragon'], 'wyvern'],
  P_AquaBubble: [['water'], 'leviathan'],
  P_Aquaflame: [['fire', 'dragon'], 'wyvern'],
  P_ShadowKraken: [['dark', 'water'], 'cephalopod'],
  P_ToxicSpike: [['poison', 'dark'], 'fiend'],
  P_LingYu: [['water'], 'fish'],
  P_HunDun: [['dark'], 'divineBeast']
}
/** Quái theo bộ ba Elder / Ancient (tên tiếng Anh dạng đầu) → [hệ, race]. */
const MONSTER_LINES = {
  Venomthorn: [['poison'], 'flower'],
  Viletoad: [['poison'], 'anuran'],
  Furylla: [['fighting'], 'primate'],
  Shadowweaver: [['dark', 'bug'], 'arachnid'],
  Mirajhin: [['ground'], 'djinn'],
  Dunescourge: [['ground'], 'annelid'],
  Crystalshell: [['rock', 'bug'], 'arachnid'],
  Sonicfox: [[], 'canid']
}
/** Quái không có bộ ba → [hệ, race]. */
const MONSTERS = {
  Cunninga: [[], 'mythicBeast'],
  'Evil Snowman': [['ice'], 'golem'],
  'Lava Hatchling': [['fire'], 'mythicBeast'],
  'Red Tide Beast': [['fire', 'water'], 'mythicBeast'],
  'Fire Kun': [['fire', 'water'], 'fish'],
  Dungtarou: [['poison'], 'slime']
}
const LINE_LEVELS = [16, 32]
/** Tổng chỉ số gốc theo bậc (speciesBuild.mjs): chỉ số làm việc cùng cỡ chỉ số gốc TB (dwelling.md). */
const TIER_AVERAGE_STAT = { small: 290 / 6, medium: 420 / 6, peak: 520 / 6, large: 560 / 6 }
/** Một bậc tốc độ làm việc của game = % chỉ số gốc TB: bậc 1 = thế mạnh phụ (50%), bậc 2 = chính (100%). */
const WORK_PERCENT_PER_LEVEL = 50
/**
 * Cột AttributePack → loại việc của game mình. Make (chế tạo) gồm cả đốt lò lẫn phát điện vì đều là việc
 * máy móc; FishSpeed không có loại việc tương ứng nên bỏ.
 */
const WORK_COLUMNS = {
  mining: 'ConstructionSpeed',
  farming: 'HarvestSpeed',
  watering: 'PlantSpeed',
  kindling: 'MakeSpeed',
  generating: 'MakeSpeed',
  transporting: 'CarrySpeed',
  caring: 'HatchSpeed',
  research: 'TecSpeed'
}

const rows = (file) => parseCsv(readDump(`dinotica/${file}.txt`))
const english = new Map(rows('English').map((row) => [row[0], row[1]]))
const config = rows('Pet_Config')
const header = config[1]
const [idColumn, nameColumn, officialColumn] = ['id', 'name', 'IsOfficialPet'].map((key) =>
  header.indexOf(key)
)
const monsterConfig = rows('MonsterConfig')
const monsterNameColumn = monsterConfig[1].indexOf('name')
const monsterNames = new Set(
  monsterConfig.slice(3).map((row) => english.get(row[monsterNameColumn]))
)

const attributes = rows('AttributePack')
const attributeHeader = attributes[1]
const attributeOf = new Map(attributes.slice(2).map((row) => [row[0], row]))
/** Chỉ số làm việc của pet theo bảng của game, cùng cỡ với chỉ số gốc của bậc. */
function workStatsOf(petId, tier) {
  const row = attributeOf.get(petId)
  if (!row) throw new Error(`AttributePack không có ${petId}`)
  return Object.fromEntries(
    Object.entries(WORK_COLUMNS).map(([workType, column]) => {
      const level = Number(row[attributeHeader.indexOf(column)])
      if (!Number.isFinite(level)) throw new Error(`${petId}.${column} không phải số`)
      return [
        workType,
        Math.round((level * WORK_PERCENT_PER_LEVEL * TIER_AVERAGE_STAT[tier]) / 100)
      ]
    })
  )
}

const species = new Map()
const add = (name, [elements, raceId], extra) => {
  if (!species.has(name))
    species.set(name, { name, elements, raceId, tier: 'medium', evolutions: [], ...extra })
  return species.get(name)
}
for (const row of config.slice(2)) {
  if (!row[idColumn] || row[officialColumn] !== '1') continue
  const name = english.get(row[nameColumn])
  const kind = PETS[row[idColumn]]
  if (!name || !kind) throw new Error(`Chưa có tên / hệ của pet ${row[idColumn]} (thêm vào PETS)`)
  add(name, kind, {
    category: 'Dino Pet',
    workStats: workStatsOf(row[idColumn], 'medium'),
    petId: row[idColumn]
  })
}
for (const [name, kind] of Object.entries(MONSTERS)) {
  if (!monsterNames.has(name)) throw new Error(`MonsterConfig không có ${name}`)
  add(name, kind, { tier: 'peak', category: 'Boss' })
}
// Pet trùng tên quái (Glaciris, Mammothus, Cryora, Crystalux) cũng có bản Elder / Ancient.
const petsWithLine = [...species.keys()].filter((name) => monsterNames.has(`Elder ${name}`))
for (const base of [...Object.keys(MONSTER_LINES), ...petsWithLine]) {
  const first =
    species.get(base) ?? add(base, MONSTER_LINES[base], { tier: 'small', category: 'Monster' })
  // Bản Elder / Ancient của pet làm việc như pet, cùng cỡ bậc của nó.
  const work = (tier) => (first.petId ? { workStats: workStatsOf(first.petId, tier) } : {})
  const elder = add(`Elder ${base}`, [first.elements, first.raceId], {
    tier: 'peak',
    category: 'Elite',
    ...work('peak')
  })
  add(`Ancient ${base}`, [first.elements, first.raceId], {
    tier: 'large',
    category: 'Boss',
    ...work('large')
  })
  first.evolutions.push({ name: elder.name, level: LINE_LEVELS[0] })
  elder.evolutions.push({ name: `Ancient ${base}`, level: LINE_LEVELS[1] })
}
// Tên dịch khác đợt thành tựu ("Qiongqi" → "Qynaxx"): bỏ mục cũ.
writeSource('dinotica', {
  source: 'dinotica',
  origin: 'fantasy',
  prune: true,
  update: { work: true },
  species: [...species.values()].map((entry) => {
    const copy = { ...entry }
    delete copy.petId
    return copy
  })
})
