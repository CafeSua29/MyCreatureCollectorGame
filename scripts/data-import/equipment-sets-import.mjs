/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Sinh nội dung bộ trang bị (docs/rules/equipment-sets.md, quy ước ở "Dữ liệu bộ trang bị" của
// docs/rules/content-mechanics.md): src/data/equipmentSets.json (bộ ngẫu nhiên quy đổi rune set Summoners
// War, bộ đặt tên tự đặt mỗi bậc thường, bộ unique gom món unique của boss cùng race), món gốc của bộ
// đặt tên + món giảm số món cần (thêm cuối items.json), setId trên món unique, tên vi / en.
// Chạy: node scripts/data-import/equipment-sets-import.mjs (Node thuần, tất định, chạy lại an toàn: món
// do script sinh và setId của bộ unique được gỡ trước khi ghi lại).

import fs from 'node:fs'
import path from 'node:path'
import { chunkOf, joinChunks, splitTopLevel } from './jsonChunks.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const readText = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
const readJson = (file) => JSON.parse(readText(file))
const writeText = (file, text) => fs.writeFileSync(path.join(root, file), text)
const writeJson = (file, value) => writeText(file, JSON.stringify(value, null, 2) + '\n')

const species = readJson('src/data/species.json')
const raceNames = {
  vi: readJson('src/data/i18n/vi/races.json'),
  en: readJson('src/data/i18n/en/races.json')
}

// ---------- Bộ ngẫu nhiên: rune set Summoners War ----------

const statMod = (percent) => ({ type: 'statModifier', params: { percent } })
const sideAura = (hooks) => ({ type: 'aura', params: { scope: 'side', stacks: true, hooks } })
const trigger = (params) => ({ type: 'trigger', params })
const onActive = (on, chance, effects) =>
  trigger({
    on,
    scope: 'self',
    chance,
    oncePerTurn: true,
    when: [{ if: 'reactive', value: false }],
    effects
  })

const ROLLED = [
  // Bộ 2 món.
  ['energy', 2, 10, [statMod({ hp: 15 })], 'Năng Lượng', 'Energy'],
  ['guard', 2, 10, [statMod({ defense: 15, spDefense: 15 })], 'Hộ Vệ', 'Guard'],
  // Gốc +12 điểm chí mạng trên nền 15% (×1,8); game này chí mạng nhân theo %.
  ['blade', 2, 10, [{ type: 'critChanceModifier', params: { percent: 80 } }], 'Lưỡi Kiếm', 'Blade'],
  // Chính xác hiệu ứng của gốc = tỉ lệ hiệu ứng phụ của skill.
  [
    'focus',
    2,
    10,
    [{ type: 'secondaryEffectChance', params: { percent: 20 } }],
    'Tập Trung',
    'Focus'
  ],
  ['endure', 2, 10, [{ type: 'debuffResist', params: { chance: 20 } }], 'Nhẫn Nại', 'Endure'],
  // Gốc: +4% thanh hành động mỗi 7% máu mất; quy đổi: bị đánh 30% lên đầu thứ tự lượt.
  [
    'nemesis',
    2,
    6,
    [
      trigger({
        on: 'damaged',
        scope: 'self',
        chance: 30,
        effects: [{ do: 'timeline', to: 'self', position: 'top' }]
      })
    ],
    'Báo Thù Định Mệnh',
    'Nemesis',
    { sealable: true }
  ],
  [
    'will',
    2,
    6,
    [
      trigger({
        on: 'entry',
        scope: 'self',
        effects: [{ do: 'status', to: 'self', statusId: 'immune', turns: 1 }]
      })
    ],
    'Ý Chí',
    'Will'
  ],
  [
    'shield',
    2,
    6,
    [
      trigger({
        on: 'entry',
        scope: 'self',
        effects: [
          {
            do: 'status',
            to: 'side',
            statusId: 'barrierBuff',
            turns: 3,
            amount: { hp: 'max', of: 'self', percent: 15 }
          }
        ]
      })
    ],
    'Khiên',
    'Shield'
  ],
  [
    'revenge',
    2,
    6,
    [
      trigger({
        on: 'attacked',
        scope: 'self',
        chance: 15,
        effects: [{ do: 'attack', to: 'other', damagePercent: 75 }]
      })
    ],
    'Phục Thù',
    'Revenge',
    { sealable: true }
  ],
  // Gốc: 30% sát thương gây ra trừ max HP địch (tối đa 4% mỗi đòn), một lần mỗi lượt.
  [
    'destroy',
    2,
    6,
    [
      trigger({
        on: 'attack',
        scope: 'self',
        oncePerTurn: true,
        effects: [{ do: 'maxHp', to: 'other', amount: { event: true, percent: 30 }, lose: true }]
      })
    ],
    'Hủy Diệt',
    'Destroy',
    { sealable: true }
  ],
  ['fight', 2, 5, [sideAura([statMod({ attack: 8, spAttack: 8 })])], 'Chiến Đấu', 'Fight'],
  [
    'determination',
    2,
    5,
    [sideAura([statMod({ defense: 8, spDefense: 8 })])],
    'Quyết Tâm',
    'Determination'
  ],
  // Hào quang không được đổi max HP (trait-dsl.md): +8% max HP cả phe lúc vào sân.
  [
    'enhance',
    2,
    5,
    [
      trigger({
        on: 'entry',
        scope: 'self',
        effects: [{ do: 'maxHp', to: 'side', amount: { hp: 'max', of: 'target', percent: 8 } }]
      })
    ],
    'Cường Hóa',
    'Enhance'
  ],
  [
    'accuracy',
    2,
    5,
    [sideAura([{ type: 'secondaryEffectChance', params: { percent: 10 } }])],
    'Chuẩn Xác',
    'Accuracy'
  ],
  [
    'tolerance',
    2,
    5,
    [sideAura([{ type: 'debuffResist', params: { chance: 10 } }])],
    'Chịu Đựng',
    'Tolerance'
  ],
  ['seal', 2, 4, [], 'Phong Ấn', 'Seal', { seal: true, sealable: true }],
  ['intangible', 2, 2, [], 'Vô Hình', 'Intangible', { wildcard: true }],
  // Bộ 4 món.
  ['swift', 4, 8, [statMod({ speed: 25 })], 'Thần Tốc', 'Swift'],
  ['fatal', 4, 8, [statMod({ attack: 35, spAttack: 35 })], 'Trí Mạng', 'Fatal'],
  ['rage', 4, 8, [{ type: 'critDamageModifier', params: { percent: 40 } }], 'Cuồng Nộ', 'Rage'],
  // Choáng của gốc (mất lượt kế) = Chùn bước.
  [
    'despair',
    4,
    6,
    [
      {
        type: 'onAttackApplyStatus',
        params: { category: 'any', statuses: [{ statusId: 'flinch', chance: 25 }] }
      }
    ],
    'Tuyệt Vọng',
    'Despair',
    { sealable: true }
  ],
  [
    'vampire',
    4,
    6,
    [{ type: 'lifesteal', params: { percent: 35 } }],
    'Ma Cà Rồng',
    'Vampire',
    { sealable: true }
  ],
  [
    'violent',
    4,
    5,
    [
      onActive('attack', 22, [{ do: 'extraTurn', to: 'self' }]),
      onActive('cast', 22, [{ do: 'extraTurn', to: 'self' }])
    ],
    'Bạo Lực',
    'Violent',
    { sealable: true }
  ]
]

// ---------- Bộ đặt tên tự đặt (cấu trúc Diablo II / III, Grim Dawn) ----------

/** Khoảng dòng chính một chỉ số theo bậc (như món thường cùng bậc). */
const STAT_RANGES = {
  common: [5, 10],
  uncommon: [10, 15],
  rare: [15, 22],
  epic: [22, 30],
  legendary: [30, 40]
}
/** Món tăng nhiều chỉ số: × hệ số này (như món nhiều chỉ số của equipment-import). */
const MULTI_STAT_FACTOR = 0.75
const PIECE_PRICE = 300

function pieceMainLine(rarity, stats) {
  const factor = stats.length > 1 ? MULTI_STAT_FACTOR : 1
  const [min, max] = STAT_RANGES[rarity].map((value) => Math.max(1, Math.round(value * factor)))
  return {
    hook: { type: 'statModifier', params: {} },
    valueParam: stats.map((stat) => `percent.${stat}`),
    ranges: { [rarity]: { min, max } },
    tags: ['stat']
  }
}

const element = (elementId, percent) => ({
  type: 'elementDamageDealt',
  params: { elementIds: [elementId], percent }
})
const allStats = (percent) =>
  statMod({
    hp: percent,
    attack: percent,
    defense: percent,
    spAttack: percent,
    spDefense: percent,
    speed: percent
  })
const onHitStatus = (statusId, chance) => ({
  type: 'onAttackApplyStatus',
  params: { category: 'any', statuses: [{ statusId, chance }] }
})
const damageDealt = (percent) => ({
  type: 'damageDealtModifier',
  params: { categories: ['physical', 'special'], percent }
})

// [id, bậc, tên vi, tên en, món: [id, vi, en, chỉ số], mốc: [số món, hook]]
const NAMED = [
  [
    'wanderer',
    'common',
    'Bộ Lữ Khách',
    "Wanderer's Garb",
    [
      ['wandererHood', 'Mũ trùm lữ khách', "Wanderer's Hood", ['hp']],
      ['wandererBoots', 'Giày lữ khách', "Wanderer's Boots", ['speed']],
      ['wandererCloak', 'Áo choàng lữ khách', "Wanderer's Cloak", ['spDefense']]
    ],
    [
      [2, [statMod({ speed: 8 })]],
      [3, [statMod({ hp: 10, defense: 6, spDefense: 6 })]]
    ]
  ],
  [
    'apprentice',
    'common',
    'Bộ Học Đồ',
    "Apprentice's Regalia",
    [
      ['apprenticeWand', 'Đũa học đồ', "Apprentice's Wand", ['spAttack']],
      ['apprenticeRobe', 'Áo học đồ', "Apprentice's Robe", ['spDefense']]
    ],
    [[2, [statMod({ spAttack: 10 }), { type: 'secondaryEffectChance', params: { percent: 10 } }]]]
  ],
  [
    'militia',
    'common',
    'Bộ Dân Binh',
    'Militia Kit',
    [
      ['militiaSpear', 'Giáo dân binh', 'Militia Spear', ['attack']],
      ['militiaShield', 'Khiên dân binh', 'Militia Shield', ['defense']],
      ['militiaHelm', 'Mũ dân binh', 'Militia Helm', ['hp']]
    ],
    [
      [2, [statMod({ attack: 8 })]],
      [3, [{ type: 'damageTakenModifier', params: { percent: -6 } }]]
    ]
  ],
  [
    'ember',
    'uncommon',
    'Bộ Than Hồng',
    'Emberweave',
    [
      ['emberGloves', 'Găng than hồng', 'Ember Gloves', ['attack']],
      ['emberMantle', 'Khăn choàng than hồng', 'Ember Mantle', ['spAttack']],
      ['emberBand', 'Vòng than hồng', 'Ember Band', ['speed']]
    ],
    [
      [2, [element('fire', 10)]],
      [3, [onHitStatus('burn', 10)]]
    ]
  ],
  [
    'tidecaller',
    'uncommon',
    'Bộ Hải Triều',
    "Tidecaller's Vestments",
    [
      ['tideCirclet', 'Vòng đầu hải triều', 'Tide Circlet', ['spAttack']],
      ['tideScale', 'Giáp vảy hải triều', 'Tide Scale', ['spDefense']],
      ['tideAnklet', 'Vòng chân hải triều', 'Tide Anklet', ['hp']]
    ],
    [
      [2, [element('water', 10)]],
      [3, [{ type: 'regen', params: { percent: 3 } }]]
    ]
  ],
  [
    'thornguard',
    'uncommon',
    'Bộ Gai Lục',
    'Thornguard',
    [
      ['thornGauntlet', 'Găng gai lục', 'Thorn Gauntlet', ['attack']],
      ['thornCuirass', 'Giáp ngực gai lục', 'Thorn Cuirass', ['defense']],
      ['thornGreaves', 'Giáp chân gai lục', 'Thorn Greaves', ['hp']]
    ],
    [
      [2, [element('grass', 10)]],
      [
        3,
        [
          {
            type: 'retaliateDamage',
            params: { category: 'physical', percentOfAttackerMaxHp: 6 }
          }
        ]
      ]
    ]
  ],
  [
    'stormcaller',
    'rare',
    'Bộ Lôi Đình',
    'Stormcaller',
    [
      ['stormCrown', 'Vương miện lôi đình', 'Storm Crown', ['spAttack']],
      ['stormRod', 'Gậy lôi đình', 'Storm Rod', ['spAttack', 'speed']],
      ['stormBoots', 'Giày lôi đình', 'Storm Boots', ['speed']],
      ['stormMail', 'Giáp lưới lôi đình', 'Storm Mail', ['spDefense']]
    ],
    [
      [2, [element('electric', 12)]],
      [3, [statMod({ speed: 12 })]],
      [4, [onHitStatus('paralysis', 15)]]
    ]
  ],
  [
    'frostbound',
    'rare',
    'Bộ Hàn Băng',
    'Frostbound Panoply',
    [
      ['frostHelm', 'Mũ hàn băng', 'Frost Helm', ['hp']],
      ['frostPlate', 'Giáp hàn băng', 'Frost Plate', ['defense']],
      ['frostBlade', 'Kiếm hàn băng', 'Frost Blade', ['attack']],
      ['frostVeil', 'Mạng che hàn băng', 'Frost Veil', ['spDefense']]
    ],
    [
      [2, [element('ice', 12)]],
      [3, [statMod({ defense: 12, spDefense: 12 })]],
      [4, [onHitStatus('freeze', 8)]]
    ]
  ],
  [
    'huntsman',
    'rare',
    'Bộ Thợ Săn',
    "Huntsman's Trappings",
    [
      ['hunterBow', 'Cung thợ săn', "Hunter's Bow", ['attack']],
      ['hunterHood', 'Mũ trùm thợ săn', "Hunter's Hood", ['speed']],
      ['hunterQuiver', 'Ống tên thợ săn', "Hunter's Quiver", ['attack', 'speed']],
      ['hunterBoots', 'Giày thợ săn', "Hunter's Boots", ['speed']]
    ],
    [
      [2, [{ type: 'critChanceModifier', params: { percent: 30 } }]],
      [3, [{ type: 'accuracyModifier', params: { percent: 10 } }]],
      [4, [{ type: 'critDamageModifier', params: { percent: 40 } }]]
    ]
  ],
  [
    'bloodMoon',
    'epic',
    'Bộ Huyết Nguyệt',
    'Blood Moon Raiment',
    [
      ['bloodMoonFang', 'Nanh huyết nguyệt', 'Blood Moon Fang', ['attack']],
      ['bloodMoonCowl', 'Mũ trùm huyết nguyệt', 'Blood Moon Cowl', ['hp']],
      ['bloodMoonCloak', 'Áo choàng huyết nguyệt', 'Blood Moon Cloak', ['speed']],
      ['bloodMoonGrips', 'Găng huyết nguyệt', 'Blood Moon Grips', ['attack', 'spAttack']],
      ['bloodMoonSigil', 'Ấn huyết nguyệt', 'Blood Moon Sigil', ['spAttack']]
    ],
    [
      [2, [{ type: 'lifesteal', params: { percent: 10 } }]],
      [3, [statMod({ attack: 15, spAttack: 15 })]],
      [4, [{ type: 'healOnKnockout', params: { percent: 20 } }]],
      [
        5,
        [
          { type: 'lifesteal', params: { percent: 20 } },
          { type: 'damageVsLowHp', params: { hpBelowPercent: 30, percent: 25 } }
        ]
      ]
    ]
  ],
  [
    'bulwark',
    'epic',
    'Bộ Thành Lũy',
    'Bulwark of Ages',
    [
      ['bulwarkHelm', 'Mũ thành lũy', 'Bulwark Helm', ['hp']],
      ['bulwarkPlate', 'Giáp thành lũy', 'Bulwark Plate', ['defense']],
      ['bulwarkTower', 'Khiên tháp thành lũy', 'Bulwark Tower Shield', ['defense', 'spDefense']],
      ['bulwarkGreaves', 'Giáp chân thành lũy', 'Bulwark Greaves', ['hp', 'defense']],
      ['bulwarkTalisman', 'Bùa thành lũy', 'Bulwark Talisman', ['spDefense']]
    ],
    [
      [2, [statMod({ hp: 15 })]],
      [3, [statMod({ defense: 15, spDefense: 15 })]],
      [4, [{ type: 'damageTakenModifier', params: { percent: -10 } }]],
      [5, [sideAura([{ type: 'damageTakenModifier', params: { percent: -8 } }])]]
    ]
  ],
  [
    'arcanum',
    'epic',
    'Bộ Huyền Thuật',
    'Arcanum Vestments',
    [
      ['arcanumStaff', 'Trượng huyền thuật', 'Arcanum Staff', ['spAttack']],
      ['arcanumHat', 'Mũ huyền thuật', 'Arcanum Hat', ['spAttack', 'spDefense']],
      ['arcanumRobe', 'Áo huyền thuật', 'Arcanum Robe', ['spDefense']],
      ['arcanumOrb', 'Cầu huyền thuật', 'Arcanum Orb', ['spAttack']],
      ['arcanumSlippers', 'Hài huyền thuật', 'Arcanum Slippers', ['speed']]
    ],
    [
      [2, [statMod({ spAttack: 15 })]],
      [3, [{ type: 'secondaryEffectChance', params: { percent: 20 } }]],
      [4, [{ type: 'statusDurationBonus', params: { turns: 1 } }]],
      [5, [statMod({ spAttack: 25 }), { type: 'critDamageModifier', params: { percent: 30 } }]]
    ]
  ],
  [
    'dragonlord',
    'legendary',
    'Bộ Long Vương',
    "Dragonlord's Mantle",
    [
      ['dragonlordCrown', 'Vương miện long vương', "Dragonlord's Crown", ['hp']],
      ['dragonlordScale', 'Giáp vảy long vương', "Dragonlord's Scale", ['defense', 'spDefense']],
      ['dragonlordClaw', 'Vuốt long vương', "Dragonlord's Claw", ['attack']],
      ['dragonlordWing', 'Cánh long vương', "Dragonlord's Wing", ['speed']],
      ['dragonlordHeart', 'Tâm long vương', "Dragonlord's Heart", ['spAttack']],
      ['dragonlordTail', 'Đuôi long vương', "Dragonlord's Tail", ['attack', 'spAttack']]
    ],
    [
      [2, [element('dragon', 15)]],
      [3, [allStats(10)]],
      [4, [{ type: 'critStage', params: { stages: 1 } }]],
      [5, [element('dragon', 25)]],
      [6, [damageDealt(20)]]
    ]
  ],
  [
    'celestial',
    'legendary',
    'Bộ Thiên Giới',
    'Celestial Vestments',
    [
      ['celestialHalo', 'Vầng hào quang thiên giới', 'Celestial Halo', ['spAttack']],
      ['celestialRobe', 'Áo thiên giới', 'Celestial Robe', ['spDefense']],
      ['celestialWings', 'Cánh thiên giới', 'Celestial Wings', ['speed']],
      [
        'celestialSceptre',
        'Quyền trượng thiên giới',
        'Celestial Sceptre',
        ['spAttack', 'spDefense']
      ],
      ['celestialSandals', 'Dép thiên giới', 'Celestial Sandals', ['hp']],
      ['celestialAegis', 'Thuẫn thiên giới', 'Celestial Aegis', ['defense']]
    ],
    [
      [2, [element('light', 15)]],
      [3, [{ type: 'regen', params: { percent: 4 } }]],
      [4, [{ type: 'debuffResist', params: { chance: 30 } }]],
      [5, [{ type: 'healingModifier', params: { received: 30 } }]],
      [
        6,
        [
          trigger({
            on: 'entry',
            scope: 'self',
            effects: [{ do: 'status', to: 'side', statusId: 'protected' }]
          })
        ]
      ]
    ]
  ],
  [
    'voidwalker',
    'legendary',
    'Bộ Hư Không',
    "Voidwalker's Shroud",
    [
      ['voidMask', 'Mặt nạ hư không', 'Void Mask', ['speed']],
      ['voidShroud', 'Áo liệm hư không', 'Void Shroud', ['spDefense']],
      ['voidBlade', 'Kiếm hư không', 'Void Blade', ['attack']],
      ['voidCirclet', 'Vòng đầu hư không', 'Void Circlet', ['spAttack']],
      ['voidTreads', 'Giày hư không', 'Void Treads', ['speed']],
      ['voidHeart', 'Tâm hư không', 'Void Heart', ['attack', 'spAttack']]
    ],
    [
      [2, [element('dark', 15)]],
      [3, [{ type: 'evasion', params: { percent: 8 } }]],
      [4, [statMod({ speed: 20 })]],
      [5, [{ type: 'critDamageModifier', params: { percent: 50 } }]],
      [
        6,
        [
          trigger({
            on: 'kill',
            scope: 'self',
            oncePerTurn: true,
            effects: [{ do: 'extraTurn', to: 'self' }]
          })
        ]
      ]
    ]
  ]
]

// ---------- Bộ unique: món unique của các boss khác nhau cùng race ----------

/** Số bộ unique (race có nhiều loài boss mang món unique nhất) và số món mỗi bộ. */
const UNIQUE_SET_COUNT = 8
const UNIQUE_SET_PIECES = 4
const UNIQUE_BONUSES = [
  [2, [allStats(10)]],
  [3, [damageDealt(15)]],
  [
    4,
    [
      { type: 'damageTakenModifier', params: { percent: -15 } },
      { type: 'critDamageModifier', params: { percent: 30 } }
    ]
  ]
]

// ---------- Món giảm số món cần (kiểu Ring of Royal Grandeur của Diablo III) ----------

const ROYAL_SIGNET = {
  id: 'royalSignet',
  vi: 'Ấn vương giả',
  en: 'Royal Signet',
  item: {
    id: 'royalSignet',
    category: 'equipment',
    price: 600,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: ['percent.hp'],
      ranges: Object.fromEntries(
        Object.entries(STAT_RANGES).map(([rarity, [min, max]]) => [rarity, { min, max }])
      ),
      tags: ['stat']
    },
    hooks: [{ type: 'setPieceReduction', params: { value: 1 } }]
  }
}

// ---------- Sinh ----------

const sets = []
const setNames = { vi: {}, en: {} }
for (const [id, size, weight, hooks, vi, en, flags = {}] of ROLLED) {
  sets.push({ id, kind: 'rolled', size, hooks, weight, ...flags })
  setNames.vi[id] = `Bộ ${vi}`
  setNames.en[id] = `${en} Set`
}

const pieceItems = [ROYAL_SIGNET.item]
const pieceNames = [ROYAL_SIGNET]
for (const [id, rarity, vi, en, pieces, bonuses] of NAMED) {
  sets.push({
    id,
    kind: 'named',
    rarity,
    pieceItemIds: pieces.map(([pieceId]) => pieceId),
    bonuses: bonuses.map(([count, hooks]) => ({ pieces: count, hooks }))
  })
  setNames.vi[id] = vi
  setNames.en[id] = en
  for (const [pieceId, pieceVi, pieceEn, stats] of pieces) {
    pieceItems.push({
      id: pieceId,
      category: 'equipment',
      price: PIECE_PRICE,
      mainLine: pieceMainLine(rarity, stats),
      setId: id
    })
    pieceNames.push({ id: pieceId, vi: pieceVi, en: pieceEn })
  }
}

// Món unique theo race của loài boss (loài thường), mỗi boss lấy món có id nhỏ nhất.
const itemsText = readText('src/data/items.json')
const items = JSON.parse(itemsText)
const speciesById = new Map(species.map((entry) => [entry.id, entry]))
const bossesByRace = new Map()
for (const item of items) {
  if (item.category !== 'equipment' || !item.unique) continue
  const boss = speciesById.get(item.unique.bossSpeciesId)
  if (boss?.kind !== 'normal') continue
  const bosses = bossesByRace.get(boss.raceId) ?? new Map()
  const current = bosses.get(boss.id)
  if (current === undefined || item.id < current) bosses.set(boss.id, item.id)
  bossesByRace.set(boss.raceId, bosses)
}
const uniqueRaces = [...bossesByRace.entries()]
  .filter(([, bosses]) => bosses.size >= UNIQUE_SET_PIECES)
  .sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))
  .slice(0, UNIQUE_SET_COUNT)
const uniqueSetOf = new Map()
for (const [raceId, bosses] of uniqueRaces) {
  const id = `${raceId}Overlord`
  const pieceIds = [...bosses.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, UNIQUE_SET_PIECES)
    .map(([, itemId]) => itemId)
  sets.push({
    id,
    kind: 'named',
    rarity: 'unique',
    pieceItemIds: pieceIds,
    bonuses: UNIQUE_BONUSES.map(([count, hooks]) => ({ pieces: count, hooks }))
  })
  setNames.vi[id] = `Bộ Bá Chủ ${raceNames.vi[raceId]}`
  setNames.en[id] = `${raceNames.en[raceId]} Overlord Set`
  for (const itemId of pieceIds) uniqueSetOf.set(itemId, id)
}

// items.json: sửa theo từng phần tử để giữ nguyên văn bản các món không đổi (file không theo một định
// dạng chuẩn). Gỡ món do script sinh, ghi lại món unique đổi setId, thêm món mới ở cuối.
const generatedIds = new Set(pieceItems.map((item) => item.id))
const chunks = []
splitTopLevel(itemsText).forEach((chunk, i) => {
  const item = items[i]
  if (generatedIds.has(item.id)) return
  if (!item.unique) {
    chunks.push(chunk)
    return
  }
  const { setId: oldSetId, ...rest } = item
  const setId = uniqueSetOf.get(item.id)
  if (oldSetId === setId) chunks.push(chunk)
  else chunks.push(chunkOf(setId === undefined ? rest : { ...rest, setId }))
})
for (const item of pieceItems) chunks.push(chunkOf(item))
writeText('src/data/items.json', joinChunks(chunks))

writeJson('src/data/equipmentSets.json', sets)
for (const lang of ['vi', 'en']) {
  writeJson(`src/data/i18n/${lang}/equipmentSets.json`, setNames[lang])
  const file = `src/data/i18n/${lang}/items.json`
  const names = readJson(file)
  for (const entry of pieceNames) names[entry.id] = entry[lang]
  writeJson(file, names)
}
console.log(
  `bộ ngẫu nhiên ${ROLLED.length}, bộ đặt tên ${NAMED.length}, bộ unique ${uniqueRaces.length}, món mới ${pieceItems.length}`
)
