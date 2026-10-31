/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập tầm chiêu `reach` của skill (docs/rules/hit-locations.md):
// - chiêu Pokémon (khớp chiêu của Showdown theo id / tên tiếng Anh): không ghi `reach`, theo cờ
//   `contact` thật (tiếp xúc = cận chiến, còn lại tầm xa);
// - chiêu nguồn khác: physical gây sát thương là cận chiến (`reach: "melee"`), trừ tên có từ khóa đòn
//   từ xa (ném, bắn, mưa, sóng, tia...) mà không có từ khóa đòn bằng thân thể (vuốt, đấm, húc...);
//   special / status là tầm xa (mặc định, không ghi).
// Chạy lại được (xóa `reach` cũ rồi ghi lại). Chạy: node scripts/data-import/skill-reach-import.mjs
// rồi npx prettier --write src/data/skills.json

import fs from 'node:fs'
import path from 'node:path'
import { fetchShowdown, showdownId } from './showdown.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const write = (file, value) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')

/**
 * Từ khóa (id camelCase tách từ + tên tiếng Anh, chữ thường) của đòn vật lý đánh từ xa: vật bay,
 * đạn, sóng, mưa, tia. Đòn chấn động mặt đất (quake, stomp) vẫn là cận chiến: không với tới trời.
 */
const RANGED_WORDS =
  /\b(arrows?|volley|throw|toss|tossing|shot|shots|hurl|sling|spit|darts?|missiles?|cannon|laser|beam|bolt|blast|burst|bombs?|bomber|rain|storm|tempest|gale|wave|waves|needles?|quills?|shards?|swarm|lightning|thunder|meteor|avalanche|breath|pulse|ray|orbs?|launch|fling|catapult|grenade|bullets?|gun|shoot|flare|nova|eruption|barrage|projectile|javelin|boomerang|thopter|broodling|spawn|order|tornado|cyclone|whirlwind)\b/

/** Từ khóa đòn bằng thân thể: thắng từ khóa tầm xa (Gale Claw, Blast Punch, Thunder Charge). */
const MELEE_WORDS =
  /\b(claws?|fists?|punch|kick|bite|fangs?|slam|ram|charge|dive|tackle|headbutt|horns?|tusks?|talons?|jaws?|maul)\b/

const words = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')

async function main() {
  const moves = await fetchShowdown('moves.js')
  const showdownIds = new Set(Object.keys(moves))
  const skills = read('skills.json')
  const names = read('i18n/en/skills.json')
  let pokemon = 0
  let melee = 0
  let ranged = 0
  for (const skill of skills) {
    delete skill.reach
    const name = names[skill.id] ?? ''
    if (showdownIds.has(showdownId(skill.id)) || showdownIds.has(showdownId(name))) {
      pokemon++
      continue
    }
    if (skill.category !== 'physical' || skill.power <= 0 || skill.contact) continue
    const text = `${words(skill.id)} ${words(name)}`
    if (RANGED_WORDS.test(text) && !MELEE_WORDS.test(text)) {
      ranged++
      continue
    }
    skill.reach = 'melee'
    melee++
  }
  write('skills.json', skills)
  console.log(`Pokémon (theo contact): ${pokemon}; nguồn khác: melee ${melee}, tầm xa ${ranged}`)
}

await main()
