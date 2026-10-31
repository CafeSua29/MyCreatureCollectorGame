/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập bảng nhiệm vụ (docs/rules/quests.md) vào src/data: mẫu nhiệm vụ (quests.json + tên i18n),
// khóa config `quests` (balance.json). Số tạm Claude đặt (chủ project giao). Chạy lại được.

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

/** [id, loại, params, countMin, countMax, trọng số, tiền × tầng, vật phẩm, tên vi, tên en]. */
const TEMPLATES = [
  [
    'catchElement',
    'catchElement',
    {},
    1,
    3,
    3,
    300,
    [['basicBall', 3]],
    'Thu phục theo hệ',
    'Catch by element'
  ],
  [
    'catchRace',
    'catchRace',
    {},
    1,
    2,
    2,
    400,
    [['greatBall', 2]],
    'Thu phục theo tộc',
    'Catch by race'
  ],
  [
    'hunt',
    'defeat',
    { floorOffset: 2 },
    10,
    20,
    4,
    200,
    [['potion', 3]],
    'Săn quái tầng cao',
    'Hunt at the frontier'
  ],
  [
    'floorBoss',
    'defeatFloorBoss',
    {},
    1,
    1,
    1,
    2000,
    [['expCandyS', 1]],
    'Hạ boss tầng',
    'Defeat a floor boss'
  ],
  ['hatchEggs', 'hatch', {}, 1, 2, 1, 800, [['spiritFruit', 3]], 'Ấp trứng', 'Hatch eggs'],
  ['fuseOnce', 'fuse', {}, 1, 1, 1, 1500, [['expCandyS', 2]], 'Dung hợp', 'Fuse monsters'],
  ['breedOnce', 'breed', {}, 1, 1, 1, 1000, [['bondFruit', 1]], 'Phối giống', 'Breed monsters']
]

write(
  `${DATA}/quests.json`,
  TEMPLATES.map(([id, type, params, countMin, countMax, weight, moneyPerFloor, items]) => ({
    id,
    type,
    params,
    countMin,
    countMax,
    weight,
    reward: { moneyPerFloor, items: items.map(([itemId, count]) => ({ itemId, count })) }
  }))
)
for (const [language, index] of [
  ['vi', 8],
  ['en', 9]
]) {
  write(
    `${DATA}/i18n/${language}/quests.json`,
    Object.fromEntries(TEMPLATES.map((entry) => [entry[0], entry[index]]))
  )
}
const balance = read(`${DATA}/balance.json`)
balance.quests = { boardSize: 5, maxActive: 3 }
write(`${DATA}/balance.json`, balance)
