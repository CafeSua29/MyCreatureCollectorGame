/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập dữ liệu synergy / hold của skill (docs/rules/skill-synergy-hold.md, chủ project duyệt
// 2026-10-24): hold 1 cho skill power ≥ HOLD_POWER_THRESHOLD (trừ chiêu Max); synergy +30% power
// cho skill gây sát thương phổ biến theo nhóm chủ đề hệ hợp lý (SYNERGY_GROUPS); kỹ năng ngự thú
// sư Tĩnh Tâm Chú; trọng số AI holdTurnWeight. Chạy lại được (ghi đè các mục cùng id).
// Chạy: node scripts/data-import/synergy-hold-import.mjs rồi npx prettier --write src/data

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const write = (file, value) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')

const HOLD_POWER_THRESHOLD = 150
const SYNERGY_POWER_BONUS = 30
/**
 * Nhóm synergy theo chủ đề (chủ project: nhiều skill cho đa dạng nhưng phải hợp lý): mỗi nhóm là
 * các skill gây sát thương phổ biến cùng một ý, mạnh hơn khi đồng đội mang một trong các hệ.
 */
const SYNERGY_GROUPS = [
  // Lửa: cỏ làm mồi lửa, gió thổi bùng.
  {
    partners: ['grass', 'flying'],
    skillIds: ['ember', 'flamethrower', 'fireBreath', 'hellfire', 'flameCharge']
  },
  // Điện: nước và thép dẫn điện.
  {
    partners: ['water', 'steel'],
    skillIds: ['thunderShock', 'thunderbolt', 'discharge', 'chainLightning', 'spark']
  },
  // Băng: hơi nước đóng băng, gió lạnh.
  {
    partners: ['water', 'flying'],
    skillIds: ['powderSnow', 'iceBeam', 'blizzard', 'icyWind']
  },
  // Nước: gặp đất thành lũ bùn.
  {
    partners: ['ground'],
    skillIds: ['waterGun', 'surf', 'waterPulse', 'bubbleNet']
  },
  // Đất: bùn cần nước; địa chấn làm đá lở; bão cát cần gió.
  { why: 'bùn', partners: ['water'], skillIds: ['mudSlap', 'mudShot'] },
  {
    partners: ['rock'],
    skillIds: ['stampede', 'earthquake', 'giantStomp']
  },
  { why: 'bão cát', partners: ['flying'], skillIds: ['sandBlast'] },
  // Đá: đất rung làm đá lở.
  {
    partners: ['ground'],
    skillIds: ['rockThrow', 'rockSlide', 'boulderHurl', 'smackDown']
  },
  // Cỏ: quang hợp nhờ ánh sáng; gió cuốn lá; rễ bám đất.
  { why: 'quang hợp', partners: ['light'], skillIds: ['energyBall', 'absorb'] },
  { why: 'gió cuốn lá', partners: ['flying'], skillIds: ['razorLeaf', 'leafage', 'leafBlade'] },
  { why: 'rễ bám đất', partners: ['ground'], skillIds: ['rootBind', 'spineVine'] },
  // Bay: giông bão.
  { why: 'giông bão', partners: ['electric'], skillIds: ['gust', 'windBlast', 'airSlash'] },
  // Độc: nọc côn trùng; độc thực vật.
  {
    partners: ['bug'],
    skillIds: ['poisonSting', 'venomFang', 'spiderBite', 'poisonFang']
  },
  { why: 'độc thực vật', partners: ['grass'], skillIds: ['sludgeBomb', 'acidSpray', 'venomSpit'] },
  // Côn trùng: nọc độc; bầy sâu trong cây cỏ.
  {
    partners: ['poison', 'grass'],
    skillIds: ['bugBite', 'xScissor', 'furyCutter', 'bugBuzz']
  },
  // Bóng tối và ma: đêm tối.
  {
    partners: ['ghost'],
    skillIds: ['bite', 'darkPulse', 'crunch', 'pursuit', 'ambushStrike', 'silentSwoop']
  },
  {
    partners: ['dark'],
    skillIds: ['astonish', 'shadowBall', 'hex', 'graveTouch', 'soulDrain']
  },
  // Siêu linh: huyền bí của tiên; tiên tri nhờ ánh sáng.
  {
    partners: ['fairy'],
    skillIds: ['confusion', 'psychic', 'psybeam', 'mindBlast']
  },
  { why: 'tiên tri', partners: ['light'], skillIds: ['futureSight'] },
  // Tiên: ánh trăng / ánh sáng.
  {
    partners: ['light'],
    skillIds: ['moonblast', 'fairyWind', 'drainingKiss', 'fairyDust']
  },
  // Ánh sáng: phép tiên; mặt trời cùng lửa / trời.
  {
    partners: ['fairy'],
    skillIds: ['glimmer', 'radiantPulse', 'starlightRay', 'holySmite']
  },
  { why: 'mặt trời', partners: ['fire', 'flying'], skillIds: ['solarFeather'] },
  // Rồng: lửa rồng.
  {
    partners: ['fire'],
    skillIds: ['dragonBreath', 'draconicBreath', 'dragonPulse', 'dragonClaw', 'outrage']
  },
  // Thép: rèn bằng lửa; cánh thép cùng trời.
  {
    partners: ['fire'],
    skillIds: ['metalClaw', 'ironHead', 'heavySlam', 'smartStrike']
  },
  { why: 'cánh thép', partners: ['flying'], skillIds: ['steelWing'] }
]

const TAMER_SKILL = {
  id: 'calmMind',
  unlockRealm: 3,
  manaCost: 20,
  cooldown: 3,
  target: 'allyOnField',
  effects: [{ type: 'reduceHold', params: { turns: 1 } }]
}
const TAMER_SKILL_NAMES = { vi: 'Tĩnh Tâm Chú', en: 'Calm Mind' }

const skills = read('skills.json')

for (const skill of skills) {
  delete skill.hold
  delete skill.synergy
  if (!skill.maxMove && skill.power >= HOLD_POWER_THRESHOLD) skill.hold = 1
}

const byId = new Map(skills.map((skill) => [skill.id, skill]))
for (const { partners, skillIds } of SYNERGY_GROUPS) {
  for (const skillId of skillIds) {
    const skill = byId.get(skillId)
    if (!skill || skill.power <= 0 || skill.hold || skill.maxMove) {
      throw new Error(`Synergy: skill "${skillId}" không tồn tại / không gây sát thương / có hold`)
    }
    if (skill.synergy) throw new Error(`Synergy: skill "${skillId}" nằm ở hai nhóm`)
    skill.synergy = { partnerElementIds: partners, powerBonusPercent: SYNERGY_POWER_BONUS }
  }
}
write('skills.json', skills)

const tamerSkills = read('tamerSkills.json').filter((s) => s.id !== TAMER_SKILL.id)
write('tamerSkills.json', [...tamerSkills, TAMER_SKILL])
for (const [language, name] of Object.entries(TAMER_SKILL_NAMES)) {
  const file = `i18n/${language}/tamerSkills.json`
  write(file, { ...read(file), [TAMER_SKILL.id]: name })
}

const balance = read('balance.json')
balance.ai.holdTurnWeight = 0.15
write('balance.json', balance)

const holdIds = skills.filter((s) => s.hold).map((s) => s.id)
console.log(`hold: ${holdIds.length} skill`)
console.log(`synergy: ${skills.filter((s) => s.synergy).length} skill`)
