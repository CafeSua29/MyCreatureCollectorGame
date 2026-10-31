/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập thám hiểm (docs/rules/expeditions.md) vào src/data: mẫu thám hiểm (expeditions.json + tên
// i18n), khóa config `expeditions` (balance.json), hiệu ứng đồng hành sức thám hiểm cho race beast
// (partnerSkills.json). Số tạm Claude đặt (chủ project giao). Chạy lại được.

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

const drop = (itemId, chance, min, max) => ({ itemId, chance, min, max })
const stones = (elementIds, chance) =>
  elementIds.map((id) => drop(`spiritStone${id[0].toUpperCase()}${id.slice(1)}`, chance, 1, 3))

/** [id, kind, ngày, yêu cầu, sức / tầng, tiền / tầng, đồ, tên vi, tên en]. */
const EXPEDITIONS = [
  [
    'copperMine',
    'mining',
    2,
    [{ type: 'teamSize', min: 1, max: 3 }],
    150,
    300,
    [...stones(['rock', 'ground', 'steel'], 40), drop('essenceMineral', 20, 1, 2)],
    'Mỏ đồng hoang',
    'Abandoned Copper Mine'
  ],
  [
    'crystalCavern',
    'mining',
    4,
    [
      { type: 'teamSize', min: 2, max: 4 },
      { type: 'minLevel', level: 20 }
    ],
    400,
    800,
    [...stones(['ice', 'electric', 'light', 'dark'], 35), drop('expCandyS', 15, 1, 1)],
    'Hang pha lê',
    'Crystal Cavern'
  ],
  [
    'herbValley',
    'herbs',
    2,
    [{ type: 'teamSize', min: 1, max: 3 }],
    150,
    200,
    [
      drop('lingzhi', 60, 2, 4),
      drop('ginseng', 40, 1, 3),
      drop('fleeceflower', 50, 2, 4),
      drop('seedLingzhi', 20, 1, 2)
    ],
    'Thung lũng dược thảo',
    'Herb Valley'
  ],
  [
    'snowPeak',
    'herbs',
    5,
    [
      { type: 'teamSize', min: 2, max: 4 },
      { type: 'element', elementId: 'ice' }
    ],
    500,
    600,
    [drop('snowLotus', 60, 1, 3), drop('heavenSpiritFruit', 15, 1, 1)],
    'Tuyết sơn',
    'Snow Peak'
  ],
  [
    'beastHunt',
    'hunting',
    3,
    [{ type: 'teamSize', min: 2, max: 4 }],
    300,
    500,
    [
      drop('essenceBeast', 50, 1, 3),
      drop('essenceAvian', 30, 1, 2),
      drop('tigerBoneFruit', 10, 1, 1)
    ],
    'Săn thú',
    'Beast Hunt'
  ],
  [
    'ancientRuins',
    'exploring',
    6,
    [
      { type: 'teamSize', min: 3, max: 4 },
      { type: 'minLevel', level: 30 }
    ],
    700,
    1500,
    [
      drop('essenceSpirit', 30, 1, 2),
      drop('essenceUndead', 30, 1, 2),
      drop('expCandyM', 15, 1, 1),
      drop('enlightenmentTea', 20, 1, 2)
    ],
    'Di tích cổ',
    'Ancient Ruins'
  ]
]

// % mang về một trứng hiếm (loài boss của map tầng cao nhất, docs/rules/expeditions.md), × độ thành
// công: săn bắt / thám hiểm có, đào khoáng / hái thuốc không.
const EGG_CHANCE = { mining: 0, herbs: 0, hunting: 4, exploring: 6 }

write(
  `${DATA}/expeditions.json`,
  EXPEDITIONS.map(
    ([id, kind, durationDays, requirements, powerPerFloor, moneyPerFloor, drops]) => ({
      id,
      kind,
      durationDays,
      requirements,
      powerPerFloor,
      moneyPerFloor,
      drops,
      eggChance: EGG_CHANCE[kind]
    })
  )
)
for (const [language, index] of [
  ['vi', 7],
  ['en', 8]
]) {
  write(
    `${DATA}/i18n/${language}/expeditions.json`,
    Object.fromEntries(EXPEDITIONS.map((entry) => [entry[0], entry[index]]))
  )
}

const balance = read(`${DATA}/balance.json`)
balance.expeditions = {
  boardMin: 3,
  boardMax: 5,
  refreshDays: 7,
  minSuccess: 0.5,
  maxSuccess: 1.5,
  expPerDayPerFloor: 20,
  injuryChance: 5,
  affinityPerDay: 1
}
write(`${DATA}/balance.json`, balance)

// Race beast (săn theo bầy): thêm sức thám hiểm +15% bên cạnh +8% tốc độ.
const partnerSkills = read(`${DATA}/partnerSkills.json`)
const beast = partnerSkills.find((skill) => skill.id === 'packSwiftness')
beast.effects = [
  ...beast.effects.filter((effect) => effect.type !== 'expeditionPowerPercent'),
  { type: 'expeditionPowerPercent', params: { percent: 15 } }
]
write(`${DATA}/partnerSkills.json`, partnerSkills)
