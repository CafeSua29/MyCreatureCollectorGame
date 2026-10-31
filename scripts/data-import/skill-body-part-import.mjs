/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập bộ phận ra chiêu `bodyPart` của skill (docs/rules/hit-locations.md mục "Phá bộ phận"): bộ
// phận đó bị phá thì quái không dùng được skill tới hết trận. Theo từ khóa trong id và tên tiếng Anh
// (mọi nguồn, kể cả chiêu Pokémon): đuôi (Iron Tail, Tail Whip), cánh (Wing Attack, Feather Dance,
// Gust), tay (Mach Punch, Karate Chop, Arm Thrust), chân (Double Kick, Stomp, High Jump Kick). Đầu /
// thân không ghi: phá đầu / thân là quái gục luôn. Vuốt không ghi (thú bốn chân vuốt bằng chân, người
// bằng tay; chưa có dữ liệu theo loài).
// Chạy lại được (xóa `bodyPart` cũ rồi ghi lại). Chạy: node scripts/data-import/skill-body-part-import.mjs
// rồi npx prettier --write src/data/skills.json

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const write = (file, value) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')

/** Từ khóa theo bộ phận, xét theo thứ tự (khớp bộ phận đầu tiên). */
const PART_WORDS = [
  ['tail', /\b(tail|tails)\b/],
  ['wings', /\b(wing|wings|feather|feathers|gust|flap|flapping)\b/],
  ['arms', /\b(punch|punches|fist|fists|chop|arm|arms|jab|uppercut|slap|palm|hammer arm|elbow)\b/],
  ['legs', /\b(kick|kicks|stomp|stomps|trample|leg|legs|knee|heel|hoof|hooves|talon|talons)\b/]
]

/** Tên khớp từ khóa nhưng không ra chiêu bằng bộ phận đó (ném bùn, vỏ sò, gạc trên đầu). */
const NOT_PART = /\b(mud slap|shell side arm|antler)\b/

const words = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')

function main() {
  const skills = read('skills.json')
  const names = read('i18n/en/skills.json')
  const counts = {}
  for (const skill of skills) {
    delete skill.bodyPart
    const text = ` ${words(skill.id)} ${words(names[skill.id] ?? '')} `
    if (NOT_PART.test(text)) continue
    const match = PART_WORDS.find(([, pattern]) => pattern.test(text))
    if (!match) continue
    skill.bodyPart = match[0]
    counts[match[0]] = (counts[match[0]] ?? 0) + 1
  }
  write('skills.json', skills)
  console.log('Skill theo bộ phận:', counts)
}

main()
