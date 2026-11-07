/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tính lại danh sách trang bị rơi (`equipmentDrops`) cho mọi biome trong src/data/biomes.json theo luật ở
// equipmentDrops.mjs, từ items.json hiện tại (không đụng tới món nào). Chạy:
// node scripts/data-import/equipment-drops-import.mjs (chạy lại an toàn, tất định). biomes-import.mjs
// cũng gọi cùng luật khi sinh lại map; thêm / bớt trang bị thường thì chạy lại script này.

import fs from 'node:fs'
import path from 'node:path'
import { equipmentDropLookup, withEquipmentDrops } from './equipmentDrops.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'))

const lookup = equipmentDropLookup({
  species: readJson('src/data/species.json'),
  races: readJson('src/data/races.json'),
  items: readJson('src/data/items.json'),
  equipmentSets: readJson('src/data/equipmentSets.json')
})
const biomes = readJson('src/data/biomes.json').map((biome) => withEquipmentDrops(biome, lookup))
fs.writeFileSync(path.join(root, 'src/data/biomes.json'), JSON.stringify(biomes, null, 2) + '\n')

const sizes = biomes.map((biome) => biome.equipmentDrops?.length ?? 0).sort((a, b) => a - b)
console.log(
  `biomes: ${biomes.length}, món rơi mỗi map: ít nhất ${sizes[0]}, trung vị ${sizes[sizes.length >> 1]}, nhiều nhất ${sizes[sizes.length - 1]}`
)
