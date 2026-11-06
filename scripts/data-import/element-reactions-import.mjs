/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập phản ứng hệ từ Type Chemistry của Cassette Beasts (docs/rules/element-reactions.md).
// Nguồn: trang dữ liệu wiki (Data:Types), lưu ở element-reactions-source.json; `--fetch` tải lại.
// Sinh src/data/elementReactions.json; thêm trạng thái mới vào statuses.json, trọng số AI vào
// balance.json, tên vào i18n (đã có thì giữ, nên chạy lại được và không đè số đã chỉnh tay).
//
// Chạy: node scripts/data-import/element-reactions-import.mjs [--fetch]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const SOURCE_URL = 'https://wiki.cassettebeasts.com/wiki/Data:Types?action=raw'
const SOURCE = new URL('./element-reactions-source.json', import.meta.url)
const dataFile = (name) => new URL(`../../src/data/${name}`, import.meta.url)

// Hệ gốc → hệ của game (Glass, Plastic, Glitter do cb-elements-import.mjs thêm).
const ELEMENTS = {
  Fire: 'fire',
  Water: 'water',
  Plant: 'grass',
  Air: 'flying',
  Lightning: 'electric',
  Earth: 'ground',
  Ice: 'ice',
  Poison: 'poison',
  Metal: 'steel',
  Astral: 'psychic',
  Beast: 'normal',
  Glass: 'glass',
  Plastic: 'plastic',
  Glitter: 'glitter'
}

const status = (statusId, turns) => ({
  type: 'applyStatus',
  params: { statusId, ...(turns ? { turns } : {}) }
})
// Lớp phủ của gốc: 3 lượt.
const transmute = (elementId, turns = 3) => ({ type: 'transmute', params: { elementId, turns } })

// Hiệu ứng gốc → hiệu ứng của game; hiệu ứng tăng / giảm hai loại công / thủ gộp một trạng thái. Lệch
// gốc: AP Boost / Drain chưa có AP (tạm đổi tốc độ, chờ thể lực); trạng thái vĩnh viễn của game (độc,
// bỏng, gieo hạt) giới hạn 3 lượt như gốc.
const EFFECTS = {
  Berserk: () => status('disturbed'),
  'Contact Dmg Poison': () => status('tipped'),
  'AP Boost': () => status('energised'),
  'AP Drain': () => status('drained'),
  Poisoned: () => status('poison', 3),
  Burned: () => status('burn', 3),
  Leeched: () => status('seeded', 3),
  Flinched: () => status('flinch'),
  'Evasion Up': () => status('agile'),
  Unitarget: () => status('grounded'),
  Multitarget: () => status('conducted'),
  'Air Wall': (turns) => ({ type: 'wall', params: { statusId: 'wallFlying', turns } }),
  'Healing Steam': () => status('healingMist'),
  'Healing Leaf': () => status('healingMist'),
  'Melee Attack Down': () => status('extinguished'),
  'Ranged Attack Down': () => null,
  'Melee Attack Up': () => status('potentiated'),
  'Ranged Attack Up': () => null,
  'Melee Defence Down': () => status('eroded'),
  'Ranged Defence Down': () => null,
  'Melee Defence Up': () => status('bulkedUp'),
  'Ranged Defence Up': () => null,
  'Evasion Down': () => status('buried'),
  'Speed Down': () => null,
  'Accuracy Down': () => status('chilled'),
  'Glass Shards': () => status('shattered'),
  Conductive: () => status('conductive'),
  Resonance: () => ({ type: 'resonate', params: { threshold: 3 } }),
  'Contact Dmg Lightning': () => status('staticCharged'),
  // Mọi lớp phủ của gốc: biến thành hệ đó.
  ...Object.fromEntries(
    Object.entries(ELEMENTS).map(([name, id]) => [
      `${name} Coating`,
      (turns) => transmute(id, turns)
    ])
  )
}

const sparklyId = (elementId) => `sparkly${elementId[0].toUpperCase()}${elementId.slice(1)}`
const readData = (name) => JSON.parse(readFileSync(dataFile(name), 'utf8'))
const elementName = (language, elementId) => readData(`i18n/${language}/elements.json`)[elementId]

// Tên phản ứng: id theo (tên gốc, hiệu ứng đầu) vì một tên gốc có thể có hai hiệu ứng khác nhau.
const REACTIONS = {
  'Disturbed|Berserk': ['disturbed', 'Rối loạn', 'Disturbed'],
  'Tipped|Contact Dmg Poison': ['tipped', 'Tẩm độc', 'Tipped'],
  'Fueled|AP Boost': ['fueled', 'Tiếp nhiên liệu', 'Fueled'],
  'Absorbed|Poisoned': ['absorbedPoison', 'Ngấm độc', 'Toxin Absorbed'],
  'Smoke|Evasion Up': ['smoke', 'Khói', 'Smoke'],
  'Updraft|Air Wall': ['updraft', 'Luồng khí nóng', 'Updraft'],
  'Energised|AP Boost': ['energised', 'Sung sức', 'Energised'],
  'Melted|Water Coating': ['meltedIce', 'Tan chảy', 'Melted'],
  'Melted|Burned': ['meltedMetal', 'Nung chảy', 'Molten'],
  'Ignited|Burned': ['ignited', 'Bốc cháy', 'Ignited'],
  'Steamed|Healing Steam': ['steamed', 'Hơi nước', 'Steamed'],
  'Extinguished|Melee Attack Down': ['extinguished', 'Dập tắt', 'Extinguished'],
  'Grounded|Unitarget': ['grounded', 'Tiếp đất', 'Grounded'],
  'Chilled|Accuracy Down': ['chilled', 'Tê cóng', 'Chilled'],
  'Conducted|Multitarget': ['conducted', 'Dẫn truyền', 'Conducted'],
  'Frozen|Ice Coating': ['frozen', 'Đóng băng', 'Frozen'],
  'Drained|AP Drain': ['drained', 'Hao lực', 'Drained'],
  'Shattered|Glass Shards': ['shattered', 'Vỡ vụn', 'Shattered'],
  'Seeded|Leeched': ['seeded', 'Gieo hạt', 'Seeded'],
  'Potentiated|Melee Attack Up': ['potentiated', 'Cường hóa', 'Potentiated'],
  'Smashed|Melee Defence Down': ['smashed', 'Đập nát', 'Smashed'],
  'Eroded|Melee Defence Down': ['eroded', 'Xói mòn', 'Eroded'],
  'Bulked Up|Melee Defence Up': ['bulkedUp', 'Trương nở', 'Bulked Up'],
  'Corroded|Melee Defence Down': ['corroded', 'Ăn mòn', 'Corroded'],
  'Absorbed|Healing Leaf': ['absorbedWater', 'Thấm nước', 'Water Absorbed'],
  'Sapped|Leeched': ['sapped', 'Hút nhựa', 'Sapped'],
  'Insulated|Unitarget': ['insulated', 'Cách điện', 'Insulated'],
  'Electrified|Conductive': ['electrified', 'Nhiễm điện', 'Electrified'],
  'Vitrified|Glass Coating': ['vitrified', 'Thủy tinh hóa', 'Vitrified'],
  'Resonating|Resonance': ['resonating', 'Cộng hưởng', 'Resonating'],
  'Uprooted|AP Drain': ['uprooted', 'Bật gốc', 'Uprooted'],
  'Distracted|AP Drain': ['distracted', 'Phân tâm', 'Distracted'],
  'Buried|Evasion Down': ['buried', 'Chôn vùi', 'Buried'],
  'Melted|Poison Coating': ['meltedPlastic', 'Chảy nhựa', 'Melted Plastic'],
  'Static|Contact Dmg Lightning': ['staticShock', 'Tĩnh điện', 'Static'],
  ...Object.fromEntries(
    Object.entries(ELEMENTS).map(([name, id]) => [
      `Sparkly|${name} Coating`,
      [sparklyId(id), `Lấp lánh (${elementName('vi', id)})`, `Sparkly (${elementName('en', id)})`]
    ])
  )
}

const THREE_TURNS = { min: 3, max: 3 }
const percentStats = (percent, ...stats) => ({
  type: 'statModifier',
  params: { percent: Object.fromEntries(stats.map((stat) => [stat, percent])) }
})
const reactionStatus = (id, kind, fields) => ({
  id,
  kind,
  duration: THREE_TURNS,
  hooks: [],
  battleOnly: true,
  ...fields
})

// Trạng thái mới: thời hạn 3 lượt và số theo gốc (2 bậc của gốc = −33% / +50%, Conductive 8%, Glass
// Shards 10%, Healing 10%). Tên: [id, vi, en, trọng số AI, định nghĩa].
const NEW_STATUSES = [
  [
    'staticCharged',
    'Tĩnh điện',
    'Static',
    0.1,
    'buff',
    {
      traitHooks: [
        { type: 'retaliateDamage', params: { category: 'physical', percentOfAttackerMaxHp: 6.25 } }
      ]
    }
  ],
  // Trạng thái nhẹ cho ô trung tính: gốc không có phản ứng ở các ô này nên không được mạnh như ô khắc
  // / kháng (±15% thay vì −33% / +50%; 3% thay vì 10%).
  [
    'softAttackDown',
    'Yếu sức',
    'Weakened',
    0.05,
    'debuff',
    { traitHooks: [percentStats(-15, 'attack', 'spAttack')] }
  ],
  [
    'softAttackUp',
    'Hăng hái',
    'Spirited',
    0.05,
    'buff',
    { traitHooks: [percentStats(15, 'attack', 'spAttack')] }
  ],
  [
    'softDefenseDown',
    'Nứt giáp',
    'Cracked Guard',
    0.05,
    'debuff',
    { traitHooks: [percentStats(-15, 'defense', 'spDefense')] }
  ],
  [
    'softDefenseUp',
    'Vững thế',
    'Firm Stance',
    0.05,
    'buff',
    { traitHooks: [percentStats(15, 'defense', 'spDefense')] }
  ],
  [
    'softSpeedDown',
    'Chậm chạp',
    'Sluggish',
    0.05,
    'debuff',
    { traitHooks: [percentStats(-15, 'speed')] }
  ],
  ['softSpeedUp', 'Lanh lẹ', 'Nimble', 0.05, 'buff', { traitHooks: [percentStats(15, 'speed')] }],
  [
    'softAccuracyDown',
    'Chao đảo',
    'Unsteady',
    0.05,
    'debuff',
    { traitHooks: [{ type: 'accuracyModifier', params: { percent: -15 } }] }
  ],
  [
    'softRegen',
    'Dễ chịu',
    'Soothed',
    0.05,
    'buff',
    { traitHooks: [{ type: 'regen', params: { percent: 3 } }] }
  ],
  [
    'softBurn',
    'Xém nhẹ',
    'Singed',
    0.05,
    'debuff',
    { hooks: [{ type: 'turnEndDamage', params: { percent: 3 } }] }
  ],
  [
    'disturbed',
    'Mất bình tĩnh',
    'Disturbed',
    0.1,
    'debuff',
    { hooks: [{ type: 'blockCategories', params: { categories: ['status'] } }] }
  ],
  [
    'tipped',
    'Tẩm độc',
    'Tipped',
    0.1,
    'buff',
    {
      traitHooks: [
        { type: 'retaliateDamage', params: { category: 'physical', percentOfAttackerMaxHp: 6.25 } }
      ]
    }
  ],
  ['energised', 'Sung sức', 'Energised', 0.1, 'buff', { staminaPerTurn: 10 }],
  ['drained', 'Hao lực', 'Drained', 0.1, 'debuff', { staminaPerTurn: -10 }],
  [
    'grounded',
    'Đơn mục tiêu',
    'Unitarget',
    0.2,
    'debuff',
    {
      skillTargetOverride: 'enemy',
      traitHooks: [{ type: 'accuracyModifier', params: { percent: -50 } }]
    }
  ],
  ['conducted', 'Đa mục tiêu', 'Multitarget', 0.1, 'buff', { skillTargetOverride: 'allEnemies' }],
  [
    'healingMist',
    'Hơi hồi phục',
    'Healing Mist',
    0.2,
    'buff',
    { traitHooks: [{ type: 'regen', params: { percent: 10 } }] }
  ],
  [
    'extinguished',
    'Suy công',
    'Attack Down',
    0.25,
    'debuff',
    { traitHooks: [percentStats(-33, 'attack', 'spAttack')] }
  ],
  [
    'potentiated',
    'Tăng công',
    'Attack Up',
    0.25,
    'buff',
    { traitHooks: [percentStats(50, 'attack', 'spAttack')] }
  ],
  [
    'eroded',
    'Suy thủ',
    'Defence Down',
    0.25,
    'debuff',
    { traitHooks: [percentStats(-33, 'defense', 'spDefense')] }
  ],
  [
    'bulkedUp',
    'Tăng thủ',
    'Defence Up',
    0.25,
    'buff',
    { traitHooks: [percentStats(50, 'defense', 'spDefense')] }
  ],
  [
    'buried',
    'Bị chôn vùi',
    'Buried',
    0.15,
    'debuff',
    { traitHooks: [percentStats(-33, 'speed'), { type: 'cannotDodge', params: {} }] }
  ],
  [
    'chilled',
    'Tê cóng',
    'Accuracy Down',
    0.15,
    'debuff',
    { traitHooks: [{ type: 'accuracyModifier', params: { percent: -33 } }] }
  ],
  [
    'shattered',
    'Mảnh vỡ',
    'Glass Shards',
    0.1,
    'buff',
    {
      traitHooks: [
        { type: 'retaliateDamage', params: { category: 'physical', percentOfAttackerMaxHp: 10 } }
      ]
    }
  ],
  [
    'conductive',
    'Dẫn điện',
    'Conductive',
    0.1,
    'debuff',
    { conductsElement: { elementId: 'electric', percent: 8 } }
  ]
]

async function loadSource() {
  if (!process.argv.includes('--fetch') && existsSync(SOURCE)) {
    return JSON.parse(readFileSync(SOURCE, 'utf8'))
  }
  const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`Tải ${SOURCE_URL} lỗi ${response.status}`)
  const types = await response.json()
  const rows = types
    .flatMap((type) => Object.values(type.inflicts ?? {}))
    .map(({ attacker, defender, hint, message, statuses }) => ({
      attacker,
      defender,
      hint,
      message,
      statuses
    }))
  writeFileSync(SOURCE, JSON.stringify(rows, null, 2) + '\n')
  return rows
}

function buildReactions(rows) {
  const reactions = new Map()
  const skipped = []
  for (const row of rows) {
    const attackElementId = ELEMENTS[row.attacker]
    const defenderElementId = ELEMENTS[row.defender]
    if (!attackElementId || !defenderElementId) {
      skipped.push(`${row.attacker}>${row.defender}`)
      continue
    }
    const key = `${row.message}|${row.statuses[0][0]}`
    const names = REACTIONS[key]
    if (!names) throw new Error(`Chưa có tên phản ứng "${key}"`)
    const effects = row.statuses.flatMap(([name, turns]) => {
      const convert = EFFECTS[name]
      if (!convert) throw new Error(`Chưa quy đổi hiệu ứng "${name}"`)
      // Thời hạn gốc chỉ cần ghi khi khác 3 lượt của trạng thái (Air Wall: 2).
      const effect = convert(turns)
      return effect ? [effect] : []
    })
    const reaction = reactions.get(names[0]) ?? { id: names[0], pairs: [], effects }
    reaction.pairs.push({ attackElementId, defenderElementId })
    reactions.set(names[0], reaction)
  }
  return { reactions: [...reactions.values()], skipped }
}

// Cặp không có ở bản gốc vì có hệ chỉ game này có (chủ project duyệt 2026-11-03). Nguyên tắc như bảng
// gốc: hệ khắc (×2) ra debuff, bị kháng (×0,5 / 0) ra buff, trung tính chọn theo nghĩa; số ít ngoại lệ
// theo nghĩa (rồng nung chảy thép, bóng tối làm tha hóa tiên).
const EXTRA_PAIRS = {
  smashed: ['fighting>rock', 'fighting>ice', 'steel>fairy'],
  grounded: ['rock>flying'],
  extinguished: ['rock>fire'],
  meltedMetal: ['dragon>steel'],
  meltedIce: ['light>ice'],
  chilled: ['ice>dragon'],
  ignited: ['fire>bug'],
  eroded: ['water>rock'],
  absorbedPoison: ['poison>fairy']
}

// [id, vi, en, các cặp, hiệu ứng].
const EXTRA_REACTIONS = [
  [
    'subdued',
    'Khuất phục',
    'Subdued',
    ['fighting>dark', 'fighting>normal'],
    status('extinguished')
  ],
  ['warded', 'Hộ thân', 'Warded', ['fighting>fairy', 'fighting>psychic'], status('protected', 2)],
  ['infested', 'Sâu đục', 'Infested', ['bug>grass'], status('seeded', 3)],
  ['pestered', 'Quấy nhiễu', 'Pestered', ['bug>psychic'], status('disturbed')],
  ['mothToFlame', 'Thiêu thân', 'Moth to Flame', ['bug>fire'], status('potentiated')],
  ['haunted', 'Ám ảnh', 'Haunted', ['ghost>psychic'], status('confused')],
  ['terrified', 'Khiếp hồn', 'Terrified', ['ghost>ghost'], status('feared')],
  ['hexed', 'Nguyền rủa', 'Hexed', ['ghost>fairy'], status('cursed')],
  ['spectralized', 'Hồn hóa', 'Spectralized', ['ghost>normal'], transmute('ghost')],
  ['dragonAwe', 'Long uy', 'Dragon Awe', ['dragon>dragon'], status('extinguished')],
  ['purified', 'Tịnh hóa', 'Purified', ['dragon>fairy'], status('healingMist')],
  ['obscured', 'Che mờ', 'Obscured', ['dark>psychic'], status('blind')],
  ['soulDevoured', 'Thực hồn', 'Soul Devoured', ['dark>ghost'], status('drained')],
  ['eclipsed', 'Nhật thực', 'Eclipsed', ['dark>light'], status('chilled')],
  ['provoked', 'Kích nộ', 'Provoked', ['dark>fighting'], status('potentiated')],
  ['corrupted', 'Sa đọa', 'Corrupted', ['dark>fairy'], transmute('dark')],
  ['charmed', 'Mê hoặc', 'Charmed', ['fairy>dragon'], status('extinguished')],
  ['bewitched', 'Mê hồn', 'Bewitched', ['fairy>fighting'], status('disturbed')],
  ['cleansed', 'Thanh tẩy', 'Cleansed', ['fairy>dark'], status('eroded')],
  ['toxicPollen', 'Phấn độc', 'Toxic Pollen', ['fairy>poison'], status('tipped')],
  ['dispelled', 'Xua tan', 'Dispelled', ['light>dark'], status('blind')],
  ['exorcised', 'Siêu độ', 'Exorcised', ['light>ghost'], status('vulnerable')],
  ['photosynthesis', 'Quang hợp', 'Photosynthesis', ['light>grass'], status('healingMist')],
  ['radiant', 'Rạng rỡ', 'Radiant', ['light>fairy'], status('energised')],
  ['crushed', 'Nghiền nát', 'Crushed', ['rock>bug'], status('eroded')],
  ['sparks', 'Tia lửa', 'Sparks', ['rock>steel'], status('shattered')]
]

const parsePair = (pair) => {
  const [attackElementId, defenderElementId] = pair.split('>')
  return { attackElementId, defenderElementId }
}

// Lấp mọi cặp còn trống theo hệ đánh và khắc hệ, cùng nguyên tắc với bảng gốc: [khắc, bị kháng, trung
// tính], mỗi mục [id, vi, en, hiệu ứng]. Ô trung tính dùng trạng thái nhẹ.
const reaction = (id, vi, en, effect) => [id, vi, en, effect]
const FILL_BY_ATTACKER = {
  normal: [
    reaction('blunted', 'Dập nát', 'Blunted', status('eroded')),
    reaction('rebounded', 'Dội lại', 'Rebounded', status('softDefenseUp')),
    reaction('impact', 'Va đập', 'Impact', status('softDefenseDown'))
  ],
  fire: [
    reaction('scorching', 'Thiêu đốt', 'Scorching', status('burn', 3)),
    reaction('warmedUp', 'Hun nóng', 'Warmed Up', status('softAttackUp')),
    reaction('singed', 'Xém lửa', 'Singed', status('softBurn'))
  ],
  water: [
    reaction('sweptAway', 'Cuốn trôi', 'Swept Away', status('eroded')),
    reaction('refreshed', 'Thấm mát', 'Refreshed', status('softRegen')),
    reaction('drenched', 'Ướt sũng', 'Drenched', status('softSpeedDown'))
  ],
  electric: [
    reaction('shocked', 'Giật điện', 'Shocked', status('conductive')),
    reaction('chargedUp', 'Tích điện', 'Charged Up', status('softSpeedUp')),
    reaction('tingling', 'Tê rần', 'Tingling', status('softAccuracyDown'))
  ],
  grass: [
    reaction('entangled', 'Quấn rễ', 'Entangled', status('seeded', 3)),
    reaction('sprouted', 'Đâm chồi', 'Sprouted', status('softRegen')),
    reaction('rooted', 'Bám rễ', 'Rooted', status('softSpeedDown'))
  ],
  ice: [
    reaction('frostbitten', 'Giá buốt', 'Frostbitten', status('extinguished')),
    reaction('icedOver', 'Phủ băng', 'Iced Over', status('softDefenseUp')),
    reaction('chilly', 'Se lạnh', 'Chilly', status('softSpeedDown'))
  ],
  fighting: [
    reaction('beatenDown', 'Đánh gục', 'Beaten Down', status('eroded')),
    reaction('tempered', 'Tôi luyện', 'Tempered', status('softDefenseUp')),
    reaction('bruised', 'Bầm dập', 'Bruised', status('softDefenseDown'))
  ],
  poison: [
    reaction('envenomed', 'Nhiễm độc', 'Envenomed', status('poison', 3)),
    reaction('inured', 'Kháng độc', 'Inured', status('softDefenseUp')),
    reaction('queasy', 'Nôn nao', 'Queasy', status('softAttackDown'))
  ],
  ground: [
    reaction('smothered', 'Vùi lấp', 'Smothered', status('buried')),
    reaction('steadied', 'Đứng vững', 'Steadied', status('softDefenseUp')),
    reaction('dustCloud', 'Bụi mù', 'Dust Cloud', status('softAccuracyDown'))
  ],
  flying: [
    reaction('blownAway', 'Thổi bay', 'Blown Away', status('chilled')),
    reaction('windborne', 'Đón gió', 'Windborne', status('softSpeedUp')),
    reaction('buffeted', 'Chao liệng', 'Buffeted', status('softAccuracyDown'))
  ],
  psychic: [
    reaction('psychicStatic', 'Nhiễu loạn', 'Psychic Static', status('disturbed')),
    reaction('focused', 'Tĩnh tâm', 'Focused', status('softAttackUp')),
    reaction('hazy', 'Mơ hồ', 'Hazy', status('softAttackDown'))
  ],
  bug: [
    reaction('gnawed', 'Cắn xé', 'Gnawed', status('eroded')),
    reaction('molted', 'Lột xác', 'Molted', status('softSpeedUp')),
    reaction('itchy', 'Ngứa ngáy', 'Itchy', status('softAccuracyDown'))
  ],
  rock: [
    reaction('pinned', 'Đá đè', 'Pinned', status('buried')),
    reaction('hardened', 'Cứng cáp', 'Hardened', status('softDefenseUp')),
    reaction('scraped', 'Trầy xước', 'Scraped', status('softDefenseDown'))
  ],
  ghost: [
    reaction('dread', 'Kinh hãi', 'Dread', status('feared')),
    reaction('chillAura', 'Âm khí', 'Chill Aura', status('softSpeedUp')),
    reaction('spooked', 'Lạnh gáy', 'Spooked', status('softAttackDown'))
  ],
  dragon: [
    reaction('dragonPressure', 'Long áp', 'Dragon Pressure', status('extinguished')),
    reaction('dragonBlood', 'Long huyết', 'Dragon Blood', status('softAttackUp')),
    reaction('cowed', 'Run sợ', 'Cowed', status('softAttackDown'))
  ],
  dark: [
    reaction('manipulated', 'Thao túng', 'Manipulated', status('blind')),
    reaction('awakened', 'Bừng tỉnh', 'Awakened', status('softAttackUp')),
    reaction('uneasy', 'Lo âu', 'Uneasy', status('softAccuracyDown'))
  ],
  steel: [
    reaction('cutDeep', 'Chém sâu', 'Cut Deep', status('eroded')),
    reaction('honed', 'Mài giũa', 'Honed', status('softAttackUp')),
    reaction('dented', 'Móp méo', 'Dented', status('softDefenseDown'))
  ],
  fairy: [
    reaction('holyGlow', 'Thánh quang', 'Holy Glow', status('extinguished')),
    reaction('blessed', 'Ban phước', 'Blessed', status('softRegen')),
    reaction('fairyDust', 'Bụi tiên', 'Fairy Dust', status('softAccuracyDown'))
  ],
  light: [
    reaction('blinding', 'Chói lòa', 'Blinding', status('chilled')),
    reaction('aglow', 'Tỏa sáng', 'Aglow', status('softRegen')),
    reaction('dazzled', 'Lóa mắt', 'Dazzled', status('softAccuracyDown'))
  ],
  glass: [
    reaction('lacerated', 'Cứa rách', 'Lacerated', status('eroded')),
    reaction('reflected', 'Phản chiếu', 'Reflected', status('softDefenseUp')),
    reaction('nicked', 'Xước da', 'Nicked', status('softDefenseDown'))
  ],
  plastic: [
    reaction('gummedTight', 'Dính chặt', 'Gummed Tight', status('buried')),
    reaction('molded', 'Đúc khuôn', 'Molded', status('softDefenseUp')),
    reaction('gummedUp', 'Dính nhựa', 'Gummed Up', status('softSpeedDown'))
  ],
  glitter: [
    reaction('glitterBlind', 'Lóa kim tuyến', 'Glitter Blind', status('softAccuracyDown')),
    reaction('glitterShine', 'Kim tuyến rực', 'Glitter Shine', status('softAttackUp')),
    reaction('glitterShower', 'Mưa kim tuyến', 'Glitter Shower', status('softSpeedUp'))
  ],
  // Hệ Nấm (Portals of Phereon, phereon-import.mjs): bào tử bám vào mục tiêu như gốc.
  fungal: [
    reaction('sporeInfested', 'Nhiễm bào tử', 'Spore Infested', status('spored')),
    reaction('mycelialShell', 'Vỏ sợi nấm', 'Mycelial Shell', status('softDefenseUp')),
    reaction('sporeHaze', 'Bụi bào tử', 'Spore Haze', status('softAccuracyDown'))
  ]
}

const pairKey = ({ attackElementId, defenderElementId }) =>
  `${attackElementId}>${defenderElementId}`

/** Lớp phủ gốc của Glitter áp cho cả hệ gốc không có: đánh Glitter thành hệ đòn, Glitter đánh thành Glitter. */
function coverGlitter(reactions, elementIds) {
  const taken = new Set(reactions.flatMap((entry) => entry.pairs.map(pairKey)))
  const byId = new Map(reactions.map((entry) => [entry.id, entry]))
  const addPair = (id, elementId, pair) => {
    if (taken.has(pairKey(pair))) return
    const entry = byId.get(id) ?? { id, pairs: [], effects: [transmute(elementId)] }
    if (!byId.has(id)) {
      byId.set(id, entry)
      reactions.push(entry)
    }
    entry.pairs.push(pair)
    taken.add(pairKey(pair))
  }
  for (const elementId of elementIds) {
    if (elementId === 'glitter') continue
    addPair(sparklyId(elementId), elementId, {
      attackElementId: elementId,
      defenderElementId: 'glitter'
    })
    addPair(sparklyId('glitter'), 'glitter', {
      attackElementId: 'glitter',
      defenderElementId: elementId
    })
  }
}

/** Mọi cặp chưa có phản ứng: theo hệ đánh và khắc hệ (khắc, bị kháng, trung tính). */
function fillEmptyPairs(reactions, elements) {
  const taken = new Set(reactions.flatMap((entry) => entry.pairs.map(pairKey)))
  const fills = new Map()
  for (const attacker of elements) {
    const row = FILL_BY_ATTACKER[attacker.id]
    if (!row) throw new Error(`Chưa có phản ứng lấp cho hệ "${attacker.id}"`)
    for (const defender of elements) {
      const pair = { attackElementId: attacker.id, defenderElementId: defender.id }
      if (taken.has(pairKey(pair))) continue
      const factor = attacker.effectiveness[defender.id] ?? 1
      const [id, , , effect] = row[factor > 1 ? 0 : factor < 1 ? 1 : 2]
      const entry = fills.get(id) ?? { id, pairs: [], effects: [effect] }
      entry.pairs.push(pair)
      fills.set(id, entry)
    }
  }
  return [...reactions, ...fills.values()]
}

/** Thêm cặp của game vào phản ứng đã có và các phản ứng riêng của game. */
function addGamePairs(reactions) {
  const extended = reactions.map((reaction) => ({
    ...reaction,
    pairs: [...reaction.pairs, ...(EXTRA_PAIRS[reaction.id] ?? []).map(parsePair)]
  }))
  const own = EXTRA_REACTIONS.map(([id, , , pairs, effect]) => ({
    id,
    pairs: pairs.map(parsePair),
    effects: [effect]
  }))
  return [...extended, ...own]
}

/** Thêm mục vào cuối object JSON (giữ nguyên định dạng phần cũ); đã có khóa thì giữ. */
function addJsonEntries(name, entries) {
  const file = dataFile(name)
  const text = readFileSync(file, 'utf8')
  const existing = JSON.parse(text)
  const added = Object.entries(entries).filter(([id]) => !(id in existing))
  if (added.length === 0) return
  const body = added.map(([id, value]) => `  ${JSON.stringify(id)}: ${JSON.stringify(value)}`)
  const updated = text.replace(/\s*\}\s*$/, `,\n${body.join(',\n')}\n}\n`)
  JSON.parse(updated)
  writeFileSync(file, updated)
}

function addStatuses() {
  const file = dataFile('statuses.json')
  const text = readFileSync(file, 'utf8')
  const known = new Set(JSON.parse(text).map((entry) => entry.id))
  const added = NEW_STATUSES.filter(([id]) => !known.has(id)).map(([id, , , , kind, fields]) =>
    JSON.stringify(reactionStatus(id, kind, fields))
  )
  if (added.length === 0) return
  const updated = text.replace(/\s*\]\s*$/, `,\n${added.join(',\n')}\n]\n`)
  JSON.parse(updated)
  writeFileSync(file, updated)
}

/** Trọng số AI nằm trong config.ai.statusWeights: chèn đầu object, không ghi lại cả balance.json. */
function addStatusWeights() {
  const file = dataFile('balance.json')
  const text = readFileSync(file, 'utf8')
  const known = JSON.parse(text).ai.statusWeights
  const added = NEW_STATUSES.filter(([id]) => !(id in known)).map(
    ([id, , , weight]) => `${JSON.stringify(id)}: ${weight},`
  )
  if (added.length === 0) return
  const updated = text.replace(/"statusWeights":\s*\{/, (head) => `${head}\n${added.join('\n')}\n`)
  JSON.parse(updated)
  writeFileSync(file, updated)
}

const rows = await loadSource()
const { reactions: sourceReactions, skipped } = buildReactions(rows)
const elements = readData('elements.json')
const elementIds = elements.map((element) => element.id)
const withGamePairs = addGamePairs(sourceReactions)
coverGlitter(withGamePairs, elementIds)
const reactions = fillEmptyPairs(withGamePairs, elements)
writeFileSync(dataFile('elementReactions.json'), JSON.stringify(reactions, null, 2) + '\n')
addStatuses()
addStatusWeights()
const names = [
  ...Object.values(REACTIONS),
  ...EXTRA_REACTIONS,
  ...Object.values(FILL_BY_ATTACKER).flat(),
  ...elementIds.map((id) => [
    sparklyId(id),
    `Lấp lánh (${elementName('vi', id)})`,
    `Sparkly (${elementName('en', id)})`
  ])
]
for (const [language, index] of [
  ['vi', 1],
  ['en', 2]
]) {
  const used = new Set(reactions.map((reaction) => reaction.id))
  const reactionNames = names.filter((entry) => used.has(entry[0]))
  writeFileSync(
    dataFile(`i18n/${language}/elementReactions.json`),
    JSON.stringify(
      Object.fromEntries(reactionNames.map((entry) => [entry[0], entry[index]])),
      null,
      2
    ) + '\n'
  )
  addJsonEntries(
    `i18n/${language}/statuses.json`,
    Object.fromEntries(NEW_STATUSES.map((entry) => [entry[0], entry[index]]))
  )
}
const pairCount = reactions.reduce((sum, reaction) => sum + reaction.pairs.length, 0)
const expected = elementIds.length ** 2
if (pairCount !== expected) throw new Error(`Có ${pairCount} cặp, cần đủ ${expected}`)
if (skipped.length > 0) throw new Error(`Cặp gốc chưa có hệ tương ứng: ${skipped.join(' ')}`)
console.log(`${reactions.length} phản ứng, ${pairCount} cặp (đủ ${elementIds.length} hệ)`)
