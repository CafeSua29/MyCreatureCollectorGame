/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Sinh nội dung trang bị và đồ cầm (mục "Trang bị và đồ cầm" ở docs/rules/equipment.md, quyết định ở
// "Dữ liệu trang bị và đồ cầm" của docs/rules/content-mechanics.md): trang bị gốc, đồ cầm tiêu hao, dòng
// phụ (src/data/equipmentAffixes.json), món unique cho mọi loài boss, danh sách trang bị rơi của
// từng map, tên vi / en, báo cáo scripts/data-import/equipment-report.json.
// Chạy: node scripts/data-import/equipment-import.mjs (Node thuần, tất định, chạy lại an toàn: mọi item
// category equipment / held trong items.json do script này sinh nên được thay hết mỗi lần chạy).

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const writeJson = (file, value) =>
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n')

const items = readJson('src/data/items.json')
const species = readJson('src/data/species.json')
const skills = readJson('src/data/skills.json')
const elements = readJson('src/data/elements.json')
const races = readJson('src/data/races.json')
const biomes = readJson('src/data/biomes.json')
const names = {
  vi: readJson('src/data/i18n/vi/items.json'),
  en: readJson('src/data/i18n/en/items.json')
}
const speciesNames = {
  vi: readJson('src/data/i18n/vi/species.json'),
  en: readJson('src/data/i18n/en/species.json')
}
const elementNames = {
  vi: readJson('src/data/i18n/vi/elements.json'),
  en: readJson('src/data/i18n/en/elements.json')
}
const raceNames = {
  vi: readJson('src/data/i18n/vi/races.json'),
  en: readJson('src/data/i18n/en/races.json')
}

const speciesById = new Map(species.map((s) => [s.id, s]))
const skillById = new Map(skills.map((s) => [s.id, s]))
const ELEMENT_IDS = elements.map((e) => e.id)

/** Số tất định trong [0, 1) theo chuỗi (md5). */
const hashUnit = (text) =>
  parseInt(crypto.createHash('md5').update(text).digest('hex').slice(0, 8), 16) / 2 ** 32

// ---------- Khoảng giá trị theo bậc ----------

/** Mức chuẩn: +% một chỉ số (chủ project chốt 2026-10-23). */
const BASE = {
  common: [5, 10],
  uncommon: [10, 15],
  rare: [15, 22],
  epic: [22, 30],
  legendary: [30, 40],
  unique: [35, 50]
}
const NORMAL = ['common', 'uncommon', 'rare', 'epic', 'legendary']
/** Dòng phụ = 60% mức dòng chính. */
const AFFIX_FACTOR = 0.6

/** Khoảng theo bậc = mức chuẩn × hệ số, làm tròn, tối thiểu 1, kẹp `cap`. */
function ranges(factor, rarities = NORMAL, cap = Infinity) {
  const result = {}
  for (const rarity of rarities) {
    const [lo, hi] = BASE[rarity]
    const min = Math.min(cap, Math.max(1, Math.round(lo * factor)))
    const max = Math.min(cap, Math.max(min, Math.round(hi * factor)))
    result[rarity] = { min, max }
  }
  return result
}

/** Khoảng cố định theo bậc (số lượt, số nhỏ): mỗi bậc một [min, max]. */
const fixedRanges = (table) =>
  Object.fromEntries(Object.entries(table).map(([rarity, [min, max]]) => [rarity, { min, max }]))

const hook = (type, params = {}) => ({ type, params })
const line = (type, params, valueParam, lineRanges, tags) => ({
  hook: hook(type, params),
  valueParam,
  ranges: lineRanges,
  ...(tags ? { tags } : {})
})
const statLine = (stats, factor, rarities) =>
  line(
    'statModifier',
    {},
    stats.map((stat) => `percent.${stat}`),
    ranges(factor, rarities),
    ['stat']
  )

// ---------- Trang bị gốc thường ----------

/** Món gốc: id, tên vi / en, giá, có bán ở cửa hàng, dòng chính, hook cố định, nhóm (danh sách rơi). */
const equipment = []
const addEquipment = ({
  id,
  vi,
  en,
  price = 300,
  shop = false,
  mainLine,
  hooks,
  group,
  groupKey
}) => equipment.push({ id, vi, en, price, shop, mainLine, hooks, group, groupKey })

// Đồ chỉ số chung (rơi ở mọi map).
const GENERAL = [
  ['ironSword', 'Kiếm sắt', 'Iron Sword', ['attack'], 1, true],
  ['battleAxe', 'Rìu chiến', 'Battle Axe', ['attack', 'defense'], 0.6, false],
  ['magicStaff', 'Gậy phép', 'Magic Staff', ['spAttack'], 1, true],
  ['spellTome', 'Sách phép', 'Spell Tome', ['spAttack', 'spDefense'], 0.6, false],
  ['chainArmor', 'Giáp xích', 'Chain Armor', ['hp', 'defense'], 0.6, true],
  ['towerShield', 'Khiên tháp', 'Tower Shield', ['defense'], 1, true],
  ['mysticCloak', 'Áo choàng huyền bí', 'Mystic Cloak', ['spDefense'], 1, true],
  ['warHelm', 'Mũ chiến', 'War Helm', ['hp'], 1, true],
  ['swiftBoots', 'Giày nhanh', 'Swift Boots', ['speed'], 1, true],
  ['brawlerGloves', 'Găng đấu sĩ', 'Brawler Gloves', ['attack', 'speed'], 0.6, false],
  ['sageRing', 'Nhẫn hiền giả', 'Sage Ring', ['spAttack', 'speed'], 0.6, false],
  ['guardianAmulet', 'Bùa hộ thân', 'Guardian Amulet', ['hp', 'defense', 'spDefense'], 0.4, false]
]
for (const [id, vi, en, stats, factor, shop] of GENERAL) {
  addEquipment({
    id,
    vi,
    en,
    price: 250,
    shop,
    mainLine: statLine(stats, factor),
    group: 'general'
  })
}

// Đồ cầm không tiêu hao của Pokémon (rơi ở mọi map). Số theo Pokémon quy về mức chuẩn.
const ALL = ELEMENT_IDS
const POKEMON_GEAR = [
  [
    'leftovers',
    'Đồ ăn thừa',
    'Leftovers',
    line('regen', {}, 'percent', ranges(0.2)),
    undefined,
    true
  ],
  [
    'shellBell',
    'Chuông vỏ sò',
    'Shell Bell',
    line('lifesteal', {}, 'percent', ranges(1)),
    undefined,
    true
  ],
  [
    'rockyHelmet',
    'Mũ đá gai',
    'Rocky Helmet',
    line('retaliateDamage', { category: 'physical' }, 'percentOfAttackerMaxHp', ranges(0.8)),
    undefined,
    true
  ],
  [
    'expertBelt',
    'Đai chuyên gia',
    'Expert Belt',
    line('effectivenessModifier', { side: 'dealt', when: 'superEffective' }, 'percent', ranges(1)),
    undefined,
    true
  ],
  [
    'scopeLens',
    'Kính ngắm',
    'Scope Lens',
    line('critChanceModifier', {}, 'percent', ranges(4)),
    undefined,
    true
  ],
  [
    'wideLens',
    'Kính rộng',
    'Wide Lens',
    line('accuracyModifier', {}, 'percent', ranges(0.6)),
    undefined,
    true
  ],
  [
    'brightPowder',
    'Bột sáng',
    'Bright Powder',
    line('evasion', {}, 'percent', ranges(0.4, NORMAL, 90)),
    undefined,
    false
  ],
  [
    'quickClaw',
    'Vuốt nhanh',
    'Quick Claw',
    line('actFirstChance', {}, 'chance', ranges(1.2, NORMAL, 100)),
    undefined,
    true
  ],
  [
    'muscleBand',
    'Băng cơ bắp',
    'Muscle Band',
    line('damageDealtModifier', { categories: ['physical'] }, 'percent', ranges(0.8)),
    undefined,
    true
  ],
  [
    'wiseGlasses',
    'Kính thông thái',
    'Wise Glasses',
    line('damageDealtModifier', { categories: ['special'] }, 'percent', ranges(0.8)),
    undefined,
    true
  ],
  [
    'kingsRock',
    'Đá vương giả',
    "King's Rock",
    line(
      'onAttackApplyStatus',
      { category: 'any', statuses: [{ statusId: 'flinch', chance: 10 }] },
      'statuses.0.chance',
      ranges(0.6, NORMAL, 100)
    ),
    undefined,
    false
  ],
  [
    'bigRoot',
    'Rễ lớn',
    'Big Root',
    line('healingModifier', {}, 'received', ranges(1.5)),
    undefined,
    false
  ],
  [
    'focusBand',
    'Băng tập trung',
    'Focus Band',
    line('surviveLethal', { fromFullHp: false }, 'chance', ranges(0.6, NORMAL, 100)),
    undefined,
    false
  ],
  [
    'choiceBand',
    'Băng lựa chọn',
    'Choice Band',
    statLine(['attack'], 2.5),
    [hook('choiceLock')],
    false
  ],
  [
    'choiceSpecs',
    'Kính lựa chọn',
    'Choice Specs',
    statLine(['spAttack'], 2.5),
    [hook('choiceLock')],
    false
  ],
  [
    'choiceScarf',
    'Khăn lựa chọn',
    'Choice Scarf',
    statLine(['speed'], 2.5),
    [hook('choiceLock')],
    false
  ],
  [
    'lifeOrb',
    'Ngọc sinh mệnh',
    'Life Orb',
    line('elementDamageDealt', { elementIds: ALL }, 'percent', ranges(1.5)),
    [hook('recoilOnAttack', { percent: 10 })],
    false
  ],
  [
    'assaultVest',
    'Áo giáp xung kích',
    'Assault Vest',
    statLine(['spDefense'], 2.5),
    [hook('blockManual', { categories: ['status'] })],
    false
  ],
  [
    'eviolite',
    'Đá tiến hóa dở',
    'Eviolite',
    line('statModifierIfCanEvolve', {}, ['percent.defense', 'percent.spDefense'], ranges(2.5)),
    undefined,
    false
  ]
]
for (const [id, vi, en, mainLine, hooks, shop] of POKEMON_GEAR) {
  addEquipment({ id, vi, en, price: 400, shop, mainLine, hooks, group: 'gear' })
}

// Đồ tăng sát thương theo hệ (Charcoal, Mystic Water...): rơi ở map có quái hệ đó.
const ELEMENT_BOOSTERS = {
  normal: ['silkScarf', 'Khăn lụa', 'Silk Scarf'],
  fire: ['charcoal', 'Than củi', 'Charcoal'],
  water: ['mysticWater', 'Nước huyền bí', 'Mystic Water'],
  electric: ['magnet', 'Nam châm', 'Magnet'],
  grass: ['miracleSeed', 'Hạt kỳ diệu', 'Miracle Seed'],
  ice: ['neverMeltIce', 'Băng vĩnh cửu', 'Never-Melt Ice'],
  fighting: ['blackBelt', 'Đai đen', 'Black Belt'],
  poison: ['poisonBarb', 'Gai độc', 'Poison Barb'],
  ground: ['softSand', 'Cát mịn', 'Soft Sand'],
  flying: ['sharpBeak', 'Mỏ nhọn', 'Sharp Beak'],
  psychic: ['twistedSpoon', 'Thìa uốn cong', 'Twisted Spoon'],
  bug: ['silverPowder', 'Bột bạc', 'Silver Powder'],
  rock: ['hardStone', 'Đá cứng', 'Hard Stone'],
  ghost: ['spellTag', 'Bùa chú', 'Spell Tag'],
  dragon: ['dragonFang', 'Nanh rồng', 'Dragon Fang'],
  dark: ['blackGlasses', 'Kính đen', 'Black Glasses'],
  steel: ['metalCoat', 'Lớp phủ kim loại', 'Metal Coat'],
  fairy: ['fairyFeather', 'Lông tiên', 'Fairy Feather'],
  light: ['prismShard', 'Mảnh lăng kính', 'Prism Shard']
}
for (const elementId of ELEMENT_IDS) {
  const [id, vi, en] = ELEMENT_BOOSTERS[elementId] ?? [
    `${elementId}Booster`,
    `Bùa hệ ${elementNames.vi[elementId]}`,
    `${elementNames.en[elementId]} Charm`
  ]
  addEquipment({
    id,
    vi,
    en,
    price: 300,
    shop: false,
    mainLine: line('elementDamageDealt', { elementIds: [elementId] }, 'percent', ranges(1.5)),
    group: 'element',
    groupKey: elementId
  })
}

// Đồ của Siralim / game khác: gậy kéo dài trạng thái, bùa miễn trạng thái, vũ khí diệt race.
addEquipment({
  id: 'cursedScepter',
  vi: 'Trượng nguyền rủa',
  en: 'Cursed Scepter',
  price: 400,
  mainLine: line(
    'statusDurationBonus',
    {},
    'turns',
    fixedRanges({ common: [1, 1], uncommon: [1, 1], rare: [1, 2], epic: [2, 2], legendary: [2, 3] })
  ),
  group: 'gear'
})
addEquipment({
  id: 'whetstone',
  vi: 'Đá mài',
  en: 'Whetstone',
  price: 300,
  shop: true,
  mainLine: line('critDamageModifier', {}, 'percent', ranges(2)),
  group: 'gear'
})
addEquipment({
  id: 'soulReaver',
  vi: 'Nhẫn hút hồn',
  en: 'Soul Reaver',
  price: 350,
  mainLine: line('healOnKnockout', {}, 'percent', ranges(1)),
  group: 'gear'
})
addEquipment({
  id: 'executionerBlade',
  vi: 'Lưỡi đao phủ',
  en: "Executioner's Blade",
  price: 350,
  mainLine: line('damageVsLowHp', { hpBelowPercent: 30 }, 'percent', ranges(1.5)),
  group: 'gear'
})
addEquipment({
  id: 'aegisPlate',
  vi: 'Giáp Aegis',
  en: 'Aegis Plate',
  price: 400,
  mainLine: line(
    'damageTakenModifier',
    {},
    'percent',
    Object.fromEntries(
      Object.entries(ranges(0.5, NORMAL, 90)).map(([r, v]) => [r, { min: -v.max, max: -v.min }])
    )
  ),
  group: 'gear'
})

const STATUS_CHARMS = [
  ['antidoteCharm', 'Bùa giải độc', 'Antidote Charm', ['poison', 'badPoison']],
  ['flameCharm', 'Bùa chống bỏng', 'Flame Charm', ['burn']],
  ['groundingCharm', 'Bùa chống tê', 'Grounding Charm', ['paralysis']],
  ['wakefulCharm', 'Bùa tỉnh táo', 'Wakeful Charm', ['sleep']]
]
for (const [id, vi, en, statusIds] of STATUS_CHARMS) {
  addEquipment({
    id,
    vi,
    en,
    price: 300,
    shop: true,
    mainLine: statLine(['spDefense'], 0.5),
    hooks: [hook('statusImmunity', { statusIds })],
    group: 'gear'
  })
}
for (const race of races) {
  const raceVi = raceNames.vi[race.id]
  const raceEn = raceNames.en[race.id]
  addEquipment({
    id: `${race.id}Slayer`,
    vi: `Vũ khí diệt ${raceVi.toLowerCase()}`,
    en: `${raceEn} Slayer`,
    price: 300,
    mainLine: line('damageVsRace', { raceIds: [race.id] }, 'percent', ranges(2)),
    group: 'race',
    groupKey: race.id
  })
}

// Ngọc phép (ô spell của Artifact Siralim): sau khi tấn công, tung tỉ lệ để tự dùng spell. 12 spell
// Siralim chọn tất định theo md5: 4 gây sát thương, 4 hồi máu, 4 buff / debuff (chủ project chốt tỉ
// lệ common 10% → legendary 30%).
const SLOT_CHANCE = fixedRanges({
  common: [8, 12],
  uncommon: [12, 16],
  rare: [16, 22],
  epic: [22, 26],
  legendary: [26, 32]
})
const skillNamesVi = readJson('src/data/i18n/vi/skills.json')
const skillNamesEn = readJson('src/data/i18n/en/skills.json')
const siralimSpells = skills.filter((s) => s.spell && !(s.tags ?? []).includes('minion'))
const spellKinds = {
  damage: siralimSpells.filter((s) => s.power > 0 && s.target === 'enemy'),
  heal: siralimSpells.filter((s) => JSON.stringify(s.spell).includes('"heal"')),
  status: siralimSpells.filter((s) => s.power === 0 && JSON.stringify(s.spell).includes('"status"'))
}
const pickSpells = (list, count, salt) =>
  [...list]
    .sort((a, b) => hashUnit(`${salt}|${a.id}`) - hashUnit(`${salt}|${b.id}`))
    .slice(0, count)
const slotSpells = [
  ...pickSpells(spellKinds.damage, 4, 'slotDamage'),
  ...pickSpells(spellKinds.heal, 4, 'slotHeal'),
  ...pickSpells(spellKinds.status, 4, 'slotStatus')
]
for (const spell of slotSpells) {
  addEquipment({
    id: `${spell.id}Gem`,
    vi: `Ngọc phép ${skillNamesVi[spell.id]}`,
    en: `${skillNamesEn[spell.id]} Spell Gem`,
    price: 400,
    mainLine: line('spellSlot', { skillId: spell.id }, 'chance', SLOT_CHANCE, ['spell']),
    group: 'spell'
  })
}

// ---------- Dòng phụ ----------

const affixes = [
  ...['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'].map((stat) => ({
    id: `affix${stat[0].toUpperCase()}${stat.slice(1)}`,
    weight: 10,
    ...statLine([stat], AFFIX_FACTOR, [...NORMAL, 'unique'])
  })),
  {
    id: 'affixCritChance',
    weight: 5,
    ...line('critChanceModifier', {}, 'percent', ranges(4 * AFFIX_FACTOR, [...NORMAL, 'unique']))
  },
  {
    id: 'affixCritDamage',
    weight: 5,
    ...line('critDamageModifier', {}, 'percent', ranges(2 * AFFIX_FACTOR, [...NORMAL, 'unique']))
  },
  {
    id: 'affixAccuracy',
    weight: 5,
    ...line('accuracyModifier', {}, 'percent', ranges(0.6 * AFFIX_FACTOR, [...NORMAL, 'unique']))
  },
  {
    id: 'affixEvasion',
    weight: 5,
    ...line('evasion', {}, 'percent', ranges(0.4 * AFFIX_FACTOR, [...NORMAL, 'unique'], 90))
  },
  {
    id: 'affixLifesteal',
    weight: 5,
    ...line('lifesteal', {}, 'percent', ranges(1 * AFFIX_FACTOR, [...NORMAL, 'unique']))
  },
  {
    id: 'affixRegen',
    weight: 5,
    ...line('regen', {}, 'percent', ranges(0.2 * AFFIX_FACTOR, [...NORMAL, 'unique']))
  },
  {
    id: 'affixDamageTaken',
    weight: 5,
    ...line(
      'damageTakenModifier',
      {},
      'percent',
      Object.fromEntries(
        Object.entries(ranges(0.5 * AFFIX_FACTOR, [...NORMAL, 'unique'], 90)).map(([r, v]) => [
          r,
          { min: -v.max, max: -v.min }
        ])
      )
    )
  },
  {
    id: 'affixSecondaryChance',
    weight: 5,
    ...line('secondaryEffectChance', {}, 'percent', ranges(2 * AFFIX_FACTOR, [...NORMAL, 'unique']))
  },
  // Thuộc tính Artifact Siralim: nhận buff khi bị đánh, gây debuff khi đánh trúng.
  {
    id: 'affixBuffOnDamage',
    weight: 3,
    ...line(
      'trigger',
      { on: 'damaged', scope: 'self', effects: [{ do: 'status', to: 'self', random: 'buff' }] },
      'chance',
      ranges(AFFIX_FACTOR, [...NORMAL, 'unique'], 100),
      ['buffOnDamage']
    )
  },
  {
    id: 'affixDebuffOnDamage',
    weight: 3,
    ...line(
      'trigger',
      { on: 'attack', scope: 'self', effects: [{ do: 'status', to: 'other', random: 'debuff' }] },
      'chance',
      ranges(AFFIX_FACTOR, [...NORMAL, 'unique'], 100),
      ['debuffOnDamage']
    )
  },
  // "[Class] Strength" của Siralim: gây thêm / nhận ít hơn với quái mang hệ đó.
  ...ELEMENT_IDS.flatMap((elementId) => {
    const key = elementId[0].toUpperCase() + elementId.slice(1)
    const taken = ranges(0.5 * AFFIX_FACTOR, [...NORMAL, 'unique'], 90)
    return [
      {
        id: `affixStrengthVs${key}`,
        weight: 1,
        ...line(
          'damageVsElement',
          { elementIds: [elementId] },
          'percent',
          ranges(1.5 * AFFIX_FACTOR, [...NORMAL, 'unique']),
          ['elementStrengthDealt']
        )
      },
      {
        id: `affixStrengthFrom${key}`,
        weight: 1,
        ...line(
          'damageFromElement',
          { elementIds: [elementId] },
          'percent',
          Object.fromEntries(
            Object.entries(taken).map(([r, v]) => [r, { min: -v.max, max: -v.min }])
          ),
          ['elementStrengthTaken']
        )
      }
    ]
  })
]

// ---------- Đồ cầm tiêu hao (Pokémon) ----------

const held = []
const addHeld = ({ id, vi, en, price = 100, shopWeight = 2, tags, hooks }) =>
  held.push({ id, vi, en, price, shopWeight, tags, hooks })
const onDamagedLowHp = (percent, effects) =>
  hook('trigger', {
    on: 'damaged',
    scope: 'self',
    when: [{ if: 'hpBelow', who: 'self', percent }],
    effects
  })
const healSelf = (percent) => [
  { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent } }
]

addHeld({
  id: 'oranBerry',
  vi: 'Quả oran',
  en: 'Oran Berry',
  price: 50,
  shopWeight: 3,
  tags: ['berry'],
  hooks: [onDamagedLowHp(50, healSelf(10))]
})
addHeld({
  id: 'sitrusBerry',
  vi: 'Quả sitrus',
  en: 'Sitrus Berry',
  price: 120,
  shopWeight: 3,
  tags: ['berry'],
  hooks: [onDamagedLowHp(50, healSelf(25))]
})
const cureBerry = (id, vi, en, statusIds) =>
  addHeld({
    id,
    vi,
    en,
    price: 80,
    tags: ['berry'],
    hooks: [
      hook('trigger', {
        on: 'statusGained',
        scope: 'self',
        ...(statusIds ? { statusIds } : { statusKind: 'debuff' }),
        effects: [{ do: 'cure', to: 'self', kind: 'debuff', ...(statusIds ? { statusIds } : {}) }]
      })
    ]
  })
cureBerry('lumBerry', 'Quả lum', 'Lum Berry')
cureBerry('cheriBerry', 'Quả cheri', 'Cheri Berry', ['paralysis'])
cureBerry('chestoBerry', 'Quả chesto', 'Chesto Berry', ['sleep'])
cureBerry('pechaBerry', 'Quả pecha', 'Pecha Berry', ['poison', 'badPoison'])
cureBerry('rawstBerry', 'Quả rawst', 'Rawst Berry', ['burn'])
for (const [id, vi, en, stat] of [
  ['liechiBerry', 'Quả liechi', 'Liechi Berry', 'attack'],
  ['ganlonBerry', 'Quả ganlon', 'Ganlon Berry', 'defense'],
  ['petayaBerry', 'Quả petaya', 'Petaya Berry', 'spAttack'],
  ['apicotBerry', 'Quả apicot', 'Apicot Berry', 'spDefense'],
  ['salacBerry', 'Quả salac', 'Salac Berry', 'speed']
]) {
  addHeld({
    id,
    vi,
    en,
    price: 100,
    tags: ['berry'],
    hooks: [onDamagedLowHp(25, [{ do: 'stage', to: 'self', stats: [stat], delta: 1 }])]
  })
}
const RESIST_BERRIES = {
  normal: ['chilanBerry', 'Quả chilan', 'Chilan Berry'],
  fire: ['occaBerry', 'Quả occa', 'Occa Berry'],
  water: ['passhoBerry', 'Quả passho', 'Passho Berry'],
  electric: ['wacanBerry', 'Quả wacan', 'Wacan Berry'],
  grass: ['rindoBerry', 'Quả rindo', 'Rindo Berry'],
  ice: ['yacheBerry', 'Quả yache', 'Yache Berry'],
  fighting: ['chopleBerry', 'Quả chople', 'Chople Berry'],
  poison: ['kebiaBerry', 'Quả kebia', 'Kebia Berry'],
  ground: ['shucaBerry', 'Quả shuca', 'Shuca Berry'],
  flying: ['cobaBerry', 'Quả coba', 'Coba Berry'],
  psychic: ['payapaBerry', 'Quả payapa', 'Payapa Berry'],
  bug: ['tangaBerry', 'Quả tanga', 'Tanga Berry'],
  rock: ['chartiBerry', 'Quả charti', 'Charti Berry'],
  ghost: ['kasibBerry', 'Quả kasib', 'Kasib Berry'],
  dragon: ['habanBerry', 'Quả haban', 'Haban Berry'],
  dark: ['colburBerry', 'Quả colbur', 'Colbur Berry'],
  steel: ['babiriBerry', 'Quả babiri', 'Babiri Berry'],
  fairy: ['roseliBerry', 'Quả roseli', 'Roseli Berry'],
  light: ['lumenBerry', 'Quả lumen', 'Lumen Berry']
}
for (const elementId of ELEMENT_IDS) {
  const [id, vi, en] = RESIST_BERRIES[elementId]
  // Như Pokémon: Chilan Berry (hệ thường) giảm đòn hệ thường dù không khắc hệ.
  const params =
    elementId === 'normal'
      ? { elementIds: ['normal'], percent: -50 }
      : { side: 'taken', when: 'superEffective', percent: -50, elementIds: [elementId] }
  addHeld({
    id,
    vi,
    en,
    price: 80,
    shopWeight: 1,
    tags: ['berry'],
    hooks: [hook(elementId === 'normal' ? 'elementDamageTaken' : 'effectivenessModifier', params)]
  })
}
for (const elementId of ELEMENT_IDS) {
  addHeld({
    id: `${elementId}Gem`,
    vi: `Đá quý hệ ${elementNames.vi[elementId].toLowerCase()}`,
    en: `${elementNames.en[elementId]} Gem`,
    price: 80,
    shopWeight: 1,
    hooks: [hook('elementDamageDealt', { elementIds: [elementId], percent: 30 })]
  })
}
addHeld({
  id: 'focusSash',
  vi: 'Đai tập trung',
  en: 'Focus Sash',
  price: 200,
  hooks: [hook('surviveLethal', { fromFullHp: true })]
})
addHeld({
  id: 'custapBerry',
  vi: 'Quả custap',
  en: 'Custap Berry',
  price: 150,
  tags: ['berry'],
  hooks: [hook('actFirstChance', { chance: 100, hpBelowPercent: 25 })]
})
addHeld({
  id: 'airBalloon',
  vi: 'Bóng bay',
  en: 'Air Balloon',
  price: 120,
  hooks: [hook('airborne'), hook('elementDamageTaken', { elementIds: ['ground'], percent: -100 })]
})
addHeld({
  id: 'whiteHerb',
  vi: 'Thảo dược trắng',
  en: 'White Herb',
  price: 120,
  hooks: [
    hook('trigger', {
      on: 'statLoss',
      scope: 'self',
      effects: [{ do: 'restoreStages', to: 'self' }]
    })
  ]
})
addHeld({
  id: 'weaknessPolicy',
  vi: 'Hợp đồng điểm yếu',
  en: 'Weakness Policy',
  price: 200,
  hooks: [
    hook('trigger', {
      on: 'damaged',
      scope: 'self',
      when: [{ if: 'superEffective' }],
      effects: [{ do: 'stage', to: 'self', stats: ['attack', 'spAttack'], delta: 2 }]
    })
  ]
})

// ---------- Món unique của boss ----------

/** Hồ sơ chiến đấu của loài theo learnset: gây trạng thái, vật lý / đặc biệt, hệ chính. */
function profileOf(sp) {
  let status = 0
  let physical = 0
  let special = 0
  for (const { skillId } of sp.learnset ?? []) {
    const skill = skillById.get(skillId)
    if (!skill) continue
    if (skill.effects?.some((e) => e.type === 'applyStatus')) status++
    if (skill.category === 'physical' && skill.power > 0) physical++
    if (skill.category === 'special' && skill.power > 0) special++
  }
  const total = Math.max(1, (sp.learnset ?? []).length)
  return { statusShare: status / total, physical, special, element: sp.elementIds[0] }
}

/** Hệ khắc hệ `elementId` (hệ số > 1). */
const weaknessesOf = (elementId) =>
  elements.filter((e) => (e.effectiveness?.[elementId] ?? 1) > 1).map((e) => e.id)

const U = ['unique']
const uniqueRanges = (factor, cap) => ranges(factor, U, cap)
/** Mẫu món unique: tên vi / en, trọng số theo hồ sơ, dòng chính, dòng unique, hook cố định, gợi ý AI. */
const TEMPLATES = [
  {
    key: 'Scepter',
    vi: 'Quyền trượng',
    en: 'Scepter',
    weight: (p) => 1 + 20 * p.statusShare,
    main: () => statLine(['spAttack'], 1, U),
    lines: () => [line('statusDurationBonus', {}, 'turns', fixedRanges({ unique: [1, 2] }))],
    aiHints: () => [{ effectType: 'applyStatus', multiplier: 1.5 }]
  },
  {
    key: 'Fang',
    vi: 'Nanh',
    en: 'Fang',
    weight: (p) => 1 + p.physical,
    main: () => statLine(['attack'], 1, U),
    lines: () => [line('critChanceModifier', {}, 'percent', uniqueRanges(4))],
    aiHints: () => [{ category: 'physical', multiplier: 1.2 }]
  },
  {
    key: 'Orb',
    vi: 'Ngọc',
    en: 'Orb',
    weight: (p) => 1 + p.special,
    main: () => statLine(['spAttack'], 1, U),
    lines: () => [line('accuracyModifier', {}, 'percent', uniqueRanges(0.6))],
    aiHints: () => [{ category: 'special', multiplier: 1.2 }]
  },
  {
    key: 'Core',
    vi: 'Lõi',
    en: 'Core',
    weight: () => 4,
    main: (p) =>
      line('elementDamageDealt', { elementIds: [p.element] }, 'percent', uniqueRanges(1.5)),
    lines: (p) =>
      weaknessesOf(p.element).length > 0
        ? [
            line('elementDamageTaken', { elementIds: weaknessesOf(p.element) }, 'percent', {
              unique: { min: -25, max: -15 }
            })
          ]
        : [statLine(['hp'], 0.6, U)],
    aiHints: (p) => [{ elementId: p.element, multiplier: 1.3 }]
  },
  {
    key: 'Hide',
    vi: 'Da',
    en: 'Hide',
    weight: () => 2,
    main: () => statLine(['hp'], 1, U),
    lines: () => [line('damageTakenModifier', {}, 'percent', { unique: { min: -20, max: -12 } })]
  },
  {
    key: 'Carapace',
    vi: 'Mai',
    en: 'Carapace',
    weight: () => 2,
    main: () => statLine(['defense'], 1, U),
    lines: () => [statLine(['spDefense'], 0.6, U)]
  },
  {
    key: 'Wing',
    vi: 'Cánh',
    en: 'Wing',
    weight: () => 2,
    main: () => statLine(['speed'], 1, U),
    lines: () => [line('actFirstChance', {}, 'chance', uniqueRanges(1.2, 100))]
  },
  {
    key: 'Maw',
    vi: 'Hàm',
    en: 'Maw',
    weight: (p) => 1 + p.physical / 2,
    main: () => statLine(['attack'], 1, U),
    lines: () => [line('lifesteal', {}, 'percent', uniqueRanges(1))]
  },
  {
    key: 'Heart',
    vi: 'Tim',
    en: 'Heart',
    weight: () => 2,
    main: () => statLine(['hp'], 1, U),
    lines: () => [line('regen', {}, 'percent', uniqueRanges(0.2))]
  },
  {
    key: 'Spines',
    vi: 'Gai',
    en: 'Spines',
    weight: () => 2,
    main: () => statLine(['defense'], 1, U),
    lines: () => [
      line('retaliateDamage', { category: 'any' }, 'percentOfAttackerMaxHp', uniqueRanges(0.8))
    ]
  },
  {
    key: 'Talon',
    vi: 'Vuốt',
    en: 'Talon',
    weight: (p) => 1 + p.physical / 2,
    main: () => statLine(['attack'], 1, U),
    lines: () => [line('damageVsLowHp', { hpBelowPercent: 30 }, 'percent', uniqueRanges(1.5))]
  },
  {
    key: 'Ward',
    vi: 'Bùa',
    en: 'Ward',
    weight: () => 1,
    main: () => statLine(['spDefense'], 1, U),
    lines: () => [line('evasion', {}, 'percent', uniqueRanges(0.4, 90))],
    hooks: () => [
      hook('statusImmunity', { statusIds: ['poison', 'badPoison', 'burn', 'paralysis', 'sleep'] })
    ]
  },
  {
    key: 'Horn',
    vi: 'Sừng',
    en: 'Horn',
    weight: (p) => 1 + p.physical / 3,
    main: () => statLine(['attack'], 1, U),
    lines: () => [
      line('statModifierWhileLowHp', { hpBelowPercent: 50 }, 'percent.attack', uniqueRanges(1.5))
    ]
  },
  {
    key: 'Eye',
    vi: 'Mắt',
    en: 'Eye',
    weight: () => 1,
    main: () => statLine(['spAttack', 'attack'], 0.6, U),
    lines: () => [line('critDamageModifier', {}, 'percent', uniqueRanges(2))]
  },
  {
    // "Trait của Artifact" (Siralim): món cho thêm một trait thường, cấp 1–3.
    key: 'Sigil',
    vi: 'Ấn',
    en: 'Sigil',
    weight: () => 1,
    main: () => statLine(['hp'], 0.6, U),
    lines: (p, sp) => [
      line(
        'equipmentTrait',
        { traitId: sigilTraitOf(sp) },
        'level',
        fixedRanges({ unique: [1, 3] }),
        ['trait']
      )
    ]
  },
  {
    key: 'Crown',
    vi: 'Vương miện',
    en: 'Crown',
    weight: () => 1,
    main: () => statLine(['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'], 0.4, U),
    lines: () => [line('secondaryEffectChance', {}, 'percent', uniqueRanges(2))]
  }
]

/** Trait thường (positive) tất định theo loài cho mẫu Ấn. */
const positiveTraits = readJson('src/data/traits.json')
  .filter((t) => t.kind === 'positive')
  .map((t) => t.id)
  .sort()
const sigilTraitOf = (sp) =>
  positiveTraits[Math.floor(hashUnit(`${sp.id}|sigil`) * positiveTraits.length)]

/** Chọn `count` mẫu khác nhau theo trọng số, tất định theo loài. */
function pickTemplates(sp, profile, count) {
  let pool = TEMPLATES.map((template) => ({ template, weight: template.weight(profile) }))
  const chosen = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    let rest = hashUnit(`${sp.id}|template|${i}`) * total
    const entry = pool.find((candidate) => (rest -= candidate.weight) < 0) ?? pool[pool.length - 1]
    chosen.push(entry.template)
    pool = pool.filter((candidate) => candidate !== entry)
  }
  return chosen
}

const bossSpeciesIds = [
  ...new Set(biomes.flatMap((biome) => biome.bosses.map((boss) => boss.speciesId)))
].sort()
const uniques = []
for (const speciesId of bossSpeciesIds) {
  const sp = speciesById.get(speciesId)
  if (!sp) continue
  const profile = profileOf(sp)
  // 1–3 món mỗi loài (chủ project chốt: không cố định 2 món).
  const count = 1 + Math.floor(hashUnit(`${speciesId}|count`) * 3)
  for (const template of pickTemplates(sp, profile, count)) {
    const lines = template
      .lines(profile, sp)
      .map((entry, i) => ({ id: `${speciesId}${template.key}${i + 1}`, ...entry }))
    uniques.push({
      id: `${speciesId}${template.key}`,
      vi: `${template.vi} của ${speciesNames.vi[speciesId] ?? speciesId}`,
      en: `${speciesNames.en[speciesId] ?? speciesId} ${template.en}`,
      price: 1000,
      mainLine: template.main(profile),
      hooks: template.hooks?.(profile),
      unique: {
        bossSpeciesId: speciesId,
        lines,
        ...(template.aiHints ? { aiHints: template.aiHints(profile) } : {})
      }
    })
  }
}

// ---------- Món gốc hồn khí (docs/rules/soul-relics.md) ----------

// Mỗi chỉ số một món: dòng chính +% chỉ số đó theo mức chuẩn ở mọi bậc (cả unique, bậc theo tư
// chất), giá như đồ chỉ số chung; không bán, không rơi (không vào danh sách rơi của map).
const SOUL_RELIC_STATS = [
  ['hp', 'Hp', 'Sinh Lực', 'Vitality'],
  ['attack', 'Attack', 'Công', 'Might'],
  ['defense', 'Defense', 'Thủ', 'Guard'],
  ['spAttack', 'SpAttack', 'Đặc Công', 'Sorcery'],
  ['spDefense', 'SpDefense', 'Đặc Thủ', 'Ward'],
  ['speed', 'Speed', 'Tốc', 'Swiftness']
]
const soulRelics = SOUL_RELIC_STATS.map(([stat, suffix, vi, en]) => ({
  id: `soulRelic${suffix}`,
  vi: `Hồn Khí: ${vi}`,
  en: `Soul Relic: ${en}`,
  price: 250,
  soulRelicStat: stat,
  mainLine: line('statModifier', {}, [`percent.${stat}`], ranges(1, [...NORMAL, 'unique']), [
    'stat'
  ])
}))

// ---------- Ghi items.json, tên ----------

const kept = items.filter((item) => item.category !== 'equipment' && item.category !== 'held')
const keptIds = new Set(kept.map((item) => item.id))
for (const lang of ['vi', 'en']) {
  for (const id of Object.keys(names[lang])) {
    const item = items.find((entry) => entry.id === id)
    if (item && (item.category === 'equipment' || item.category === 'held')) delete names[lang][id]
  }
}
const generated = []
const SHOP_EQUIPMENT_WEIGHT = 3
for (const entry of equipment) {
  generated.push({
    id: entry.id,
    category: 'equipment',
    price: entry.price,
    ...(entry.shop ? { shop: true, shopWeight: SHOP_EQUIPMENT_WEIGHT } : {}),
    mainLine: entry.mainLine,
    ...(entry.hooks ? { hooks: entry.hooks } : {})
  })
}
for (const entry of uniques) {
  generated.push({
    id: entry.id,
    category: 'equipment',
    price: entry.price,
    mainLine: entry.mainLine,
    ...(entry.hooks ? { hooks: entry.hooks } : {}),
    unique: entry.unique
  })
}
for (const entry of soulRelics) {
  generated.push({
    id: entry.id,
    category: 'equipment',
    price: entry.price,
    soulRelicStat: entry.soulRelicStat,
    mainLine: entry.mainLine
  })
}
for (const entry of held) {
  generated.push({
    id: entry.id,
    category: 'held',
    price: entry.price,
    shop: true,
    shopWeight: entry.shopWeight,
    ...(entry.tags ? { tags: entry.tags } : {}),
    hooks: entry.hooks
  })
}
const seen = new Set()
for (const entry of generated) {
  if (keptIds.has(entry.id) || seen.has(entry.id))
    throw new Error(`Trùng id vật phẩm "${entry.id}"`)
  seen.add(entry.id)
}
for (const entry of [...equipment, ...uniques, ...soulRelics, ...held]) {
  names.vi[entry.id] = entry.vi
  names.en[entry.id] = entry.en
}
writeJson('src/data/items.json', [...kept, ...generated])
writeJson('src/data/equipmentAffixes.json', affixes)
writeJson('src/data/i18n/vi/items.json', names.vi)
writeJson('src/data/i18n/en/items.json', names.en)

// ---------- Danh sách trang bị rơi của từng map ----------

/** Tỉ lệ (theo trọng số gặp) của từng hệ / race trong quái hoang của map. */
function mapShares(biome) {
  const elementShare = {}
  const raceShare = {}
  const total = biome.encounters.reduce((sum, entry) => sum + entry.weight, 0) || 1
  for (const { speciesId, weight } of biome.encounters) {
    const sp = speciesById.get(speciesId)
    if (!sp) continue
    for (const elementId of sp.elementIds)
      elementShare[elementId] = (elementShare[elementId] ?? 0) + weight / total
    raceShare[sp.raceId] = (raceShare[sp.raceId] ?? 0) + weight / total
  }
  return { elementShare, raceShare }
}

// Trọng số: đồ chỉ số chung 10, đồ Pokémon / đặc biệt 4, đồ theo hệ / race theo tỉ lệ quái của map
// (mọi món hợp map đều rơi được, chủ project chốt 2026-10-23).
const GROUP_WEIGHTS = { general: 10, gear: 4, spell: 2 }
const SHARE_WEIGHT = 20
const report = {
  equipment: equipment.length,
  uniques: uniques.length,
  held: held.length,
  affixes: affixes.length,
  bossSpecies: bossSpeciesIds.length,
  dropsPerMap: {}
}
for (const biome of biomes) {
  const { elementShare, raceShare } = mapShares(biome)
  const drops = []
  for (const entry of equipment) {
    let weight = GROUP_WEIGHTS[entry.group]
    if (entry.group === 'element')
      weight = elementShare[entry.groupKey]
        ? Math.max(1, Math.round(elementShare[entry.groupKey] * SHARE_WEIGHT))
        : 0
    if (entry.group === 'race')
      weight = raceShare[entry.groupKey]
        ? Math.max(1, Math.round(raceShare[entry.groupKey] * SHARE_WEIGHT))
        : 0
    if (weight > 0) drops.push({ itemId: entry.id, weight })
  }
  biome.equipmentDrops = drops
  report.dropsPerMap[biome.id] = drops.length
}
writeJson('src/data/biomes.json', biomes)
writeJson('scripts/data-import/equipment-report.json', report)
console.log(
  `trang bị ${equipment.length}, unique ${uniques.length} (${bossSpeciesIds.length} loài boss), đồ cầm ${held.length}, dòng phụ ${affixes.length}`
)
