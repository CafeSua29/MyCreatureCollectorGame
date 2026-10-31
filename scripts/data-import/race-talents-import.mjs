/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhánh thiên phú theo từng race (docs/rules/monster-talents.md mục "Nhánh race"): mỗi race một
// nhánh 3 nút ghép từ thư viện khuôn nút bên dưới (cùng khuôn nên cân bằng giữa các race); nút sát
// thương theo hệ lấy 2 hệ phổ biến nhất trong các loài của race (bỏ hệ thường nếu còn hệ khác).
// Giữ nguyên 3 nhánh chung (offense / defense / support). Số tạm Claude đặt.
// Chạy lại được (ghi đè các nhánh race): node scripts/data-import/race-talents-import.mjs
// rồi chạy prettier cho src/data/talent*.json và src/data/i18n/*/talent*.json.

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(`${DATA}/${path}`, 'utf8'))
const write = (path, value) =>
  writeFileSync(`${DATA}/${path}`, JSON.stringify(value, null, 2) + '\n')

const GENERAL = ['offense', 'defense', 'support']
const LANGUAGES = ['vi', 'en']

const hook = (type, params) => ({ type, params })
const stats = (percent) => hook('statModifier', { percent })
const onAttack = (statusId, chance) =>
  hook('onAttackApplyStatus', { category: 'any', statuses: [{ statusId, chance }] })

/** Nút chỉ số: cost 1, không trần, tổng ~4% mỗi cấp (như nút chỉ số của nhánh chung). */
const STAT_NODES = {
  AS: ['Hung Tính', 'Ferocity', stats({ attack: 2, speed: 2 })],
  AH: ['Cự Lực', 'Brawn', stats({ hp: 2, attack: 2 })],
  AD: ['Cương Mãnh', 'Stalwart Might', stats({ attack: 2, defense: 2 })],
  AT4: ['Bạo Lực', 'Brute Force', stats({ attack: 4 })],
  DH: ['Kiên Bì', 'Thick Hide', stats({ hp: 2, defense: 2 })],
  D4: ['Thiết Giáp', 'Iron Shell', stats({ defense: 4 })],
  DSD: ['Hộ Thể', 'Warding Body', stats({ defense: 2, spDefense: 2 })],
  HSD: ['Sinh Mệnh', 'Life Force', stats({ hp: 2, spDefense: 2 })],
  HP4: ['Sinh Cơ Dồi Dào', 'Abundant Vitality', stats({ hp: 4 })],
  SA4: ['Linh Lực', 'Spirit Power', stats({ spAttack: 4 })],
  SAS: ['Linh Động', 'Quickened Mind', stats({ spAttack: 2, speed: 2 })],
  SASD: ['Tâm Pháp', 'Mind Art', stats({ spAttack: 2, spDefense: 2 })],
  HSA: ['Huyết Mạch', 'Bloodline', stats({ hp: 2, spAttack: 2 })],
  SP4: ['Tật Ảnh', 'Swift Shadow', stats({ speed: 4 })],
  BAL: [
    'Toàn Diện',
    'Versatile',
    stats({ attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 })
  ]
}
/** Thần linh: +1% mọi chỉ số, cost 2 (race vốn mạnh). */
const DIVINE = [
  'Thần Uy',
  'Divinity',
  stats({ hp: 1, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 })
]
const DIVINE_COST = 2

/** Nút cơ chế: [tên vi, tên en, costPerRank, maxRank, hook]. Hook có tỉ lệ luôn có trần. */
const MECH_NODES = {
  HUNT: ['Săn Mồi', 'Hunt', 2, 10, hook('damageVsLowHp', { hpBelowPercent: 50, percent: 4 })],
  CRIT: ['Ưng Nhãn', 'Keen Eye', 2, 10, hook('critChance', { percent: 1 })],
  CRITD: ['Trí Mạng', 'Lethal Strike', 2, 10, hook('critDamageModifier', { percent: 5 })],
  POI: ['Độc Tố', 'Toxin', 2, 10, onAttack('poison', 2)],
  BURN: ['Thiêu Đốt', 'Searing', 2, 10, onAttack('burn', 2)],
  PARA: ['Tê Liệt', 'Numbing', 2, 10, onAttack('paralysis', 2)],
  CONF: ['Mê Hoặc', 'Bewilder', 2, 10, onAttack('confused', 2)],
  BLEED: ['Xé Thịt', 'Rend', 2, 10, onAttack('bleeding', 2)],
  SLEEP: ['Thôi Miên', 'Lull', 3, 10, onAttack('sleep', 1)],
  LS: ['Hút Huyết', 'Drain', 2, 10, hook('lifesteal', { percent: 2 })],
  SE: [
    'Thích Nghi',
    'Adaptation',
    2,
    10,
    hook('effectivenessModifier', { side: 'taken', when: 'superEffective', percent: -3 })
  ],
  FULL: ['Kiên Cố', 'Hardened', 2, 6, hook('damageTakenAtFullHp', { percent: -5 })],
  SPINE: [
    'Gai Nhọn',
    'Spines',
    2,
    8,
    hook('retaliateDamage', { category: 'physical', percentOfAttackerMaxHp: 1.5 })
  ],
  RES: ['Kiên Tâm', 'Steadfast', 1, 10, hook('debuffResist', { chance: 3 })],
  STAB: ['Cộng Minh', 'Resonance', 2, 10, hook('stabMultiplier', { multiplier: 1.03 })],
  PIERCE: ['Xuyên Giáp', 'Pierce', 3, 10, hook('ignoreDefensePercent', { percent: 2 })],
  HEAL: ['Dưỡng Sinh', 'Nurture', 1, 10, hook('healingModifier', { received: 5, dealt: 5 })],
  MONEY: ['Thương Đạo', 'Commerce', 1, 20, hook('moneyRewardModifier', { percent: 3 })],
  EXP: ['Học Hỏi', 'Studious', 1, 20, hook('expRewardModifier', { percent: 2 })],
  DODGE: ['Ẩn Hình', 'Elusive', 3, 5, hook('dodge', { percent: 1 })],
  ACC: ['Chuẩn Xác', 'Precision', 1, 10, hook('accuracyModifier', { percent: 3 })],
  PACK: [
    'Bầy Đàn',
    'Pack',
    2,
    5,
    hook('statModifierWithAlly', { percent: { attack: 3, defense: 3 } })
  ],
  PACKS: [
    'Đồng Tâm',
    'Kindred Minds',
    2,
    5,
    hook('statModifierWithAlly', { percent: { spAttack: 3, spDefense: 3 } })
  ],
  RAGE: [
    'Cuồng Nộ',
    'Rage',
    2,
    5,
    hook('statModifierWhileLowHp', { hpBelowPercent: 50, percent: { attack: 4, speed: 4 } })
  ],
  VIGOR: [
    'Thịnh Khí',
    'Vigor',
    2,
    5,
    hook('statModifierWhileHighHp', { hpAbovePercent: 50, percent: { attack: 3, defense: 3 } })
  ],
  FIRST: [
    'Tiên Phát',
    'Opening Gambit',
    2,
    5,
    hook('statModifierFirstTurns', { turns: 3, percent: { attack: 4, defense: 4, speed: 4 } })
  ],
  GUTS: [
    'Bất Khuất',
    'Guts',
    2,
    5,
    hook('statModifierWhileStatused', { percent: { attack: 4, defense: 4 } })
  ],
  REGEN: ['Tái Sinh', 'Regrowth', 3, 3, hook('regen', { percent: 1 })],
  SURV: ['Bất Tử Thân', 'Undying', 3, 10, hook('surviveLethal', { fromFullHp: false, chance: 2 })],
  KO: ['Khát Huyết', 'Bloodlust', 2, 10, hook('healOnKnockout', { percent: 5 })],
  CURE: ['Tịnh Hóa', 'Purify', 2, 10, hook('turnEndCureStatus', { chance: 5 })]
}
/** Nút sát thương theo hệ của race ("EL"): +4% mỗi cấp, cost 2, tối đa 10. */
const ELEMENT_NODE = { costPerRank: 2, maxRank: 10, percent: 4 }

/**
 * Race → [nút chỉ số, nút cơ chế, nút cuối]. Nút cuối cần nút chỉ số cấp 3 (cost ≤ 2) hoặc 5
 * (cost 3).
 */
const RACES = {
  felid: ['AS', 'CRIT', 'DODGE'],
  canid: ['AS', 'PACK', 'HUNT'],
  ursid: ['AH', 'RAGE', 'FULL'],
  mustelid: ['SP4', 'BLEED', 'DODGE'],
  rodent: ['SP4', 'EL', 'DODGE'],
  lagomorph: ['SP4', 'CURE', 'DODGE'],
  primate: ['BAL', 'ACC', 'PACK'],
  equid: ['SP4', 'FIRST', 'VIGOR'],
  buffalo: ['AH', 'FIRST', 'FULL'],
  cervid: ['AS', 'CURE', 'VIGOR'],
  suid: ['DH', 'GUTS', 'RAGE'],
  proboscid: ['DH', 'FULL', 'PACK'],
  pachyderm: ['D4', 'PIERCE', 'FULL'],
  chiropteran: ['SP4', 'LS', 'CONF'],
  marsupial: ['HSD', 'HEAL', 'PACK'],
  xenarthran: ['DH', 'FULL', 'REGEN'],
  insectivore: ['D4', 'SPINE', 'GUTS'],
  megafauna: ['AH', 'HUNT', 'FULL'],
  fangedBeast: ['AT4', 'BLEED', 'HUNT'],
  mythicBeast: ['BAL', 'EL', 'STAB'],
  wildBeast: ['AS', 'RAGE', 'HUNT'],
  raptor: ['AS', 'CRIT', 'HUNT'],
  owl: ['SAS', 'ACC', 'SLEEP'],
  bird: ['SP4', 'EL', 'DODGE'],
  waterfowl: ['HSD', 'EL', 'HEAL'],
  galliform: ['AD', 'FIRST', 'GUTS'],
  penguin: ['DSD', 'EL', 'PACK'],
  seabird: ['SP4', 'EL', 'CRIT'],
  ratite: ['SP4', 'FIRST', 'CRITD'],
  parrot: ['SAS', 'CONF', 'EXP'],
  mythicBird: ['HSA', 'EL', 'REGEN'],
  serpent: ['AS', 'POI', 'CRIT'],
  lizard: ['SP4', 'POI', 'REGEN'],
  turtle: ['D4', 'SE', 'FULL'],
  crocodilian: ['AH', 'BLEED', 'HUNT'],
  anuran: ['HSD', 'POI', 'HEAL'],
  caudate: ['HP4', 'EL', 'REGEN'],
  fish: ['SP4', 'EL', 'DODGE'],
  shark: ['AT4', 'BLEED', 'KO'],
  cetacean: ['HP4', 'PACKS', 'HEAL'],
  pinniped: ['HSD', 'EL', 'PACK'],
  sirenian: ['HP4', 'HEAL', 'CURE'],
  cephalopod: ['SASD', 'CONF', 'DODGE'],
  crustacean: ['D4', 'SPINE', 'CRITD'],
  cnidarian: ['HSD', 'PARA', 'POI'],
  mollusk: ['D4', 'FULL', 'REGEN'],
  leviathan: ['HSA', 'EL', 'PIERCE'],
  carapaceon: ['DH', 'SPINE', 'FULL'],
  beetle: ['AD', 'FULL', 'PIERCE'],
  lepidopteran: ['SAS', 'SLEEP', 'POI'],
  hymenopteran: ['AS', 'POI', 'PACK'],
  arachnid: ['AS', 'POI', 'PARA'],
  orthopteran: ['AS', 'CRIT', 'FIRST'],
  odonate: ['SP4', 'ACC', 'CRIT'],
  myriapod: ['AD', 'POI', 'SPINE'],
  larva: ['HSD', 'REGEN', 'EXP'],
  neopteron: ['AH', 'FULL', 'RAGE'],
  insectoid: ['BAL', 'PACK', 'POI'],
  theropod: ['AT4', 'HUNT', 'KO'],
  sauropod: ['HP4', 'FULL', 'PACK'],
  ornithischian: ['D4', 'SPINE', 'FULL'],
  pterosaur: ['SP4', 'CRIT', 'EL'],
  marineReptile: ['HSA', 'EL', 'HUNT'],
  ancientCreature: ['DH', 'FULL', 'SURV'],
  kaiju: ['AH', 'STAB', 'PIERCE'],
  westernDragon: ['HSA', 'EL', 'SE'],
  easternDragon: ['SASD', 'EL', 'CURE'],
  wyvern: ['AS', 'EL', 'CRIT'],
  fangedWyvern: ['AS', 'PARA', 'HUNT'],
  bruteWyvern: ['AH', 'RAGE', 'FULL'],
  piscineWyvern: ['HSD', 'EL', 'DODGE'],
  birdWyvern: ['SP4', 'POI', 'FIRST'],
  snakeWyvern: ['AS', 'POI', 'BLEED'],
  elderDragon: ['BAL', 'SE', 'STAB'],
  drake: ['AH', 'EL', 'GUTS'],
  tree: ['DH', 'REGEN', 'HEAL'],
  flower: ['SASD', 'HEAL', 'SLEEP'],
  fungus: ['HSD', 'SLEEP', 'POI'],
  algae: ['HP4', 'REGEN', 'EL'],
  golem: ['D4', 'FULL', 'RAGE'],
  crystal: ['SASD', 'SE', 'STAB'],
  metal: ['DSD', 'SE', 'RES'],
  livingObject: ['DSD', 'CONF', 'SURV'],
  machine: ['AD', 'ACC', 'FIRST'],
  slime: ['HP4', 'RES', 'REGEN'],
  annelid: ['HP4', 'LS', 'REGEN'],
  changeling: ['BAL', 'SE', 'DODGE'],
  lycanthrope: ['AS', 'RAGE', 'BLEED'],
  mimic: ['AD', 'FIRST', 'CRITD'],
  zombie: ['DH', 'POI', 'SURV'],
  skeleton: ['AD', 'CRIT', 'SURV'],
  vampire: ['SAS', 'LS', 'KO'],
  wraith: ['SAS', 'CONF', 'DODGE'],
  lich: ['SA4', 'STAB', 'SURV'],
  mummy: ['DH', 'RES', 'FULL'],
  ghoul: ['AT4', 'LS', 'KO'],
  ghost: ['SAS', 'EL', 'DODGE'],
  yokai: ['SAS', 'CONF', 'BURN'],
  fey: ['SASD', 'EL', 'HEAL'],
  wisp: ['SAS', 'BURN', 'DODGE'],
  natureSpirit: ['HSD', 'REGEN', 'CURE'],
  fiend: ['AS', 'BURN', 'KO'],
  imp: ['SP4', 'CONF', 'BURN'],
  oni: ['AH', 'RAGE', 'CRITD'],
  elementalSpirit: ['SA4', 'STAB', 'SE'],
  djinn: ['SASD', 'EL', 'MONEY'],
  eldritch: ['SASD', 'CONF', 'PIERCE'],
  chimera: ['AH', 'POI', 'BURN'],
  angel: ['HSD', 'EL', 'CURE'],
  god: ['DIV', 'STAB', 'RES'],
  divineBeast: ['DIV', 'SE', 'EL'],
  demigod: ['DIV', 'CRITD', 'FIRST'],
  human: ['BAL', 'EXP', 'MONEY'],
  elf: ['SAS', 'ACC', 'CRIT'],
  dwarf: ['DH', 'CRITD', 'FULL'],
  orc: ['AH', 'RAGE', 'GUTS'],
  halfling: ['SP4', 'DODGE', 'MONEY'],
  giant: ['AH', 'FULL', 'PIERCE'],
  goblin: ['SP4', 'MONEY', 'PACK'],
  troll: ['HP4', 'REGEN', 'RAGE'],
  beastfolk: ['AS', 'HUNT', 'PACK'],
  centaur: ['SP4', 'ACC', 'FIRST'],
  insectfolk: ['AD', 'POI', 'PACK'],
  merfolk: ['HSD', 'EL', 'HEAL'],
  lizardfolk: ['DH', 'POI', 'REGEN'],
  harpyfolk: ['SP4', 'BLEED', 'DODGE'],
  alienRace: ['SASD', 'EXP', 'CONF'],
  hive: ['BAL', 'PACKS', 'POI'],
  android: ['AD', 'ACC', 'RES'],
  mutant: ['HP4', 'POI', 'GUTS']
}

/** 2 hệ phổ biến nhất của mỗi race (bỏ hệ thường nếu còn hệ khác). */
function raceElements(species) {
  const counts = {}
  for (const entry of species) {
    if (entry.kind !== 'normal') continue
    const counter = (counts[entry.raceId] ??= {})
    for (const elementId of entry.elementIds) counter[elementId] = (counter[elementId] ?? 0) + 1
  }
  const result = {}
  for (const [raceId, counter] of Object.entries(counts)) {
    // Sắp ổn định: nhiều trước, hòa thì theo thứ tự gặp.
    let ranked = Object.entries(counter)
      .sort((a, b) => b[1] - a[1])
      .map(([elementId]) => elementId)
    if (ranked.length > 1) ranked = ranked.filter((elementId) => elementId !== 'normal')
    result[raceId] = ranked.slice(0, 2)
  }
  return result
}

/** "Keen Eye" → "KeenEye" (hậu tố id nút). */
const pascal = (text) =>
  text
    .replace(/\//g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('')

/** Khuôn của một nút: tên, costPerRank, maxRank, hook. */
function nodeTemplate(code, kind, elementIds, elementNames) {
  if (kind === 'stat') {
    const [vi, en, effect] = code === 'DIV' ? DIVINE : STAT_NODES[code]
    return { vi, en, costPerRank: code === 'DIV' ? DIVINE_COST : 1, hook: effect }
  }
  if (code === 'EL') {
    return {
      vi: 'Thông Thạo ' + elementIds.map((id) => elementNames.vi[id]).join(' / '),
      en: elementIds.map((id) => elementNames.en[id]).join(' / ') + ' Mastery',
      costPerRank: ELEMENT_NODE.costPerRank,
      maxRank: ELEMENT_NODE.maxRank,
      hook: hook('elementDamageDealt', { elementIds, percent: ELEMENT_NODE.percent })
    }
  }
  const [vi, en, costPerRank, maxRank, effect] = MECH_NODES[code]
  return { vi, en, costPerRank, maxRank, hook: effect }
}

const races = read('races.json')
const missing = races.filter((race) => !RACES[race.id]).map((race) => race.id)
const extra = Object.keys(RACES).filter((id) => !races.some((race) => race.id === id))
if (missing.length > 0 || extra.length > 0) {
  throw new Error(`RACES lệch races.json: thiếu ${missing.join(', ')}; thừa ${extra.join(', ')}`)
}
const elements = raceElements(read('species.json'))
const raceNames = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, read(`i18n/${lang}/races.json`)])
)
const elementNames = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, read(`i18n/${lang}/elements.json`)])
)

const branches = read('talentBranches.json').filter((branch) => GENERAL.includes(branch.id))
const nodes = read('talents.json').filter((node) => GENERAL.includes(node.branchId))
const generalIds = new Set(nodes.map((node) => node.id))
const texts = Object.fromEntries(
  LANGUAGES.map((lang) => {
    const pick = (file, keep) =>
      Object.fromEntries(Object.entries(read(`i18n/${lang}/${file}`)).filter(([id]) => keep(id)))
    return [
      lang,
      {
        branches: pick('talentBranches.json', (id) => GENERAL.includes(id)),
        nodes: pick('talents.json', (id) => generalIds.has(id))
      }
    ]
  })
)

for (const race of races) {
  const [statCode, mechCode, capCode] = RACES[race.id]
  const branchId = `${race.id}Arts`
  branches.push({ id: branchId, raceIds: [race.id] })
  for (const lang of LANGUAGES) texts[lang].branches[branchId] = raceNames[lang][race.id]
  const add = (code, kind, requires) => {
    const template = nodeTemplate(code, kind, elements[race.id], elementNames)
    const id = race.id + pascal(template.en)
    nodes.push({
      id,
      branchId,
      ...(requires ? { requires } : {}),
      ...(template.maxRank === undefined ? {} : { maxRank: template.maxRank }),
      costPerRank: template.costPerRank,
      hooks: [template.hook]
    })
    // Tên kèm race để không trùng giữa các nhánh (kiểm tra chữ cấm trùng tên trong một loại).
    texts.vi.nodes[id] = `${template.vi} (${raceNames.vi[race.id]})`
    texts.en.nodes[id] = `${template.en} (${raceNames.en[race.id]})`
    return id
  }
  const statId = add(statCode, 'stat')
  add(mechCode, 'mech')
  const capCost = nodeTemplate(capCode, 'mech', elements[race.id], elementNames).costPerRank
  add(capCode, 'mech', { [statId]: capCost >= 3 ? 5 : 3 })
}

write('talentBranches.json', branches)
write('talents.json', nodes)
for (const lang of LANGUAGES) {
  write(`i18n/${lang}/talentBranches.json`, texts[lang].branches)
  write(`i18n/${lang}/talents.json`, texts[lang].nodes)
}
console.log(`${branches.length} nhánh, ${nodes.length} nút`)
