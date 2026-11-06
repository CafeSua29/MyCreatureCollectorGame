// Mục tiêu của chiêu Pokémon theo Showdown (docs/rules/battle.md mục "Mục tiêu"): chiêu `allAdjacent` (đánh mọi
// quái khác kể cả đồng đội trong trận đôi: Earthquake, Surf, Explosion, Teeter Dance...) → `allOthers`. Chiêu
// đơn mục tiêu (`normal`) giữ `enemy` (lệnh `targetAlly` nhắm đồng đội như gốc). Chạy lại được.
// Chạy: node scripts/data-import/pokemon-targets-import.mjs (cần mạng) rồi npx prettier --write src/data/skills.json

import { readFileSync, writeFileSync } from 'node:fs'

import { camelId, fetchShowdown } from './showdown.mjs'

const SKILLS = new URL('../../src/data/skills.json', import.meta.url)
const SHOWDOWN_TO_GAME = { allAdjacent: 'allOthers' }

const skills = JSON.parse(readFileSync(SKILLS, 'utf8'))
const byId = new Map(skills.map((skill) => [skill.id, skill]))
const moves = await fetchShowdown('moves.js')
const changed = []
for (const move of Object.values(moves)) {
  const target = SHOWDOWN_TO_GAME[move.target]
  const skill = byId.get(camelId(move.name))
  if (!target || !skill || skill.maxMove || skill.target === target) continue
  skill.target = target
  changed.push(skill.id)
}
writeFileSync(SKILLS, `${JSON.stringify(skills, null, 2)}\n`)
console.log(`đổi mục tiêu ${changed.length} chiêu: ${changed.join(', ')}`)
