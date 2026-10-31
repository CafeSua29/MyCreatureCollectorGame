/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tính lại cờ `gathering` (câu cá / khai thác) cho mọi biome trong src/data/biomes.json theo luật ở
// gathering.mjs (docs/rules/gathering.md). Chạy: node scripts/data-import/gathering-import.mjs
// (chạy lại an toàn, tất định). biomes-import.mjs cũng gọi cùng luật khi sinh lại map.

import fs from 'node:fs'
import path from 'node:path'
import { withGathering } from './gathering.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))

const species = readJson('src/data/species.json')
const races = readJson('src/data/races.json')
const lookup = {
  byId: new Map(species.map((s) => [s.id, s])),
  groupOf: new Map(races.map((race) => [race.id, race.groupId])),
  config: readJson('src/data/balance.json').gathering
}
const biomes = readJson('src/data/biomes.json').map((biome) => withGathering(biome, lookup))
fs.writeFileSync(path.join(root, 'src/data/biomes.json'), JSON.stringify(biomes, null, 2) + '\n')

const count = (method) => biomes.filter((biome) => biome.gathering?.[method]).length
console.log(`biomes: ${biomes.length}, câu cá: ${count('fishing')}, khai thác: ${count('mining')}`)
