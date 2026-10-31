/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Đợt 2 của nội dung triệu hồi (chủ project chốt 2026-10-23, sau summons-import.mjs):
// - Spell hạ ngay (Death Siphon, Heat Beam): chỉ khi mục tiêu dưới 10% máu, kèm tỉ lệ trượt.
// - Thêm nốt 4 spell Siralim còn bỏ (Illusion, Torun Attunement, Dark Summoning, Quietus) và 2
//   minion Illusion, Torun Junior; họ skill `minion` cho mọi spell gọi / tác động minion.
// - Skill triệu hồi của nguồn khác (D&D, Warcraft, Elder Scrolls, Diablo, Terraria, Minecraft) và
//   2 minion mới Golem, Vex.
// Chạy một lần: node scripts/data-import/summons-extra-import.mjs, rồi prettier + npm test.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { stats, sv, hpv, cnt, E, C, onlyIf, hit, cast, pb } from './siralim-spells/sdsl.mjs'

const root = new URL('../../', import.meta.url)
const path = (relative) => new URL(relative, root)
const readJson = (relative) => JSON.parse(readFileSync(path(relative), 'utf8'))
const writeJson = (relative, value) =>
  writeFileSync(path(relative), JSON.stringify(value, null, 2) + '\n', 'utf8')
const md5 = (text) => createHash('md5').update(text).digest('hex')
const fail = (message) => {
  throw new Error(message)
}

const skills = readJson('src/data/skills.json')
const species = readJson('src/data/species.json')
const minions = readJson('src/data/minions.json')
const names = Object.fromEntries(
  ['vi', 'en'].map((language) => [
    language,
    {
      skills: readJson(`src/data/i18n/${language}/skills.json`),
      minions: readJson(`src/data/i18n/${language}/minions.json`)
    }
  ])
)
const siralimReport = readJson('scripts/data-import/siralim-report.json')
const summonsReportPath = 'scripts/data-import/summons-report.json'

const minion = (to, minionId, stacks = 1) => E.minion(to, stacks, minionId)
const ALL4 = ['Attack', 'Intelligence', 'Defense', 'Speed']
const skillById = new Map(skills.map((s) => [s.id, s]))
const takenVi = new Set(Object.values(names.vi.skills))
const counts = { minions: 0, skills: 0, learnset: 0, tagged: 0 }

/** Tỉ lệ (%) spell hạ ngay có tác dụng khi mục tiêu đủ điều kiện (số tạm, xem balance-numbers.md). */
const EXECUTE_HIT_CHANCE = 70
/** Ngưỡng máu của spell hạ ngay (chủ project chốt 2026-10-23). */
const EXECUTE_HP_PERCENT = 10

// ---------- Spell hạ ngay ----------

const dead = C.hpBelow('subject', 0.001)
const executeSkills = {
  // Hạ ngay trước, rồi lấy chỉ số / máu của mục tiêu chỉ khi nó đã gục.
  deathSiphon: cast('enemy', {
    onTarget: [
      { ...E.kill('subject', EXECUTE_HP_PERCENT), chance: EXECUTE_HIT_CHANCE },
      ...ALL4.map((name) => onlyIf(E.flat('self', stats(name), sv(name, 50, 'subject')), dead)),
      onlyIf(E.maxHp('self', hpv('max', 50, 'subject')), dead)
    ]
  }),
  heatBeam: hit('devastating', 'enemy', {
    onTarget: [{ ...E.kill('subject', EXECUTE_HP_PERCENT), chance: EXECUTE_HIT_CHANCE }]
  })
}
for (const [id, conversion] of Object.entries(executeSkills)) {
  const skill = skillById.get(id) ?? fail(`Thiếu skill "${id}"`)
  const tags = skill.tags
  for (const key of Object.keys(skill)) if (!['id', 'elementId'].includes(key)) delete skill[key]
  Object.assign(skill, conversion, tags ? { tags } : {})
}

// ---------- Minion mới ----------

const trigger = (on, effects, extra = {}) => ({
  type: 'trigger',
  params: { on, scope: 'self', effects, ...extra }
})
const NEW_MINIONS = [
  {
    // Hiệu ứng sau hành động của chủ kích hoạt thêm 2 lần: quy thành trait của chủ mạnh thêm 200%.
    def: {
      id: 'illusion',
      maxStacks: 1,
      leaveChance: 25,
      excludeFromRandom: true,
      hooks: [{ type: 'traitPotency', params: { percent: 200 } }]
    },
    vi: 'Ảo ảnh',
    en: 'Illusion'
  },
  {
    // Bản gốc là câu đùa "bắn laser": cuối lượt bắn một địch ngẫu nhiên theo chỉ số cao nhất.
    def: {
      id: 'torunJunior',
      maxStacks: 1,
      leaveChance: 0,
      hooks: [trigger('turnEnd', [E.dmg('randomFoe', sv('highest', 30))])]
    },
    vi: 'Torun nhí',
    en: 'Torun Junior'
  },
  {
    def: {
      id: 'golem',
      maxStacks: 1,
      leaveChance: 15,
      hooks: [
        { type: 'statModifier', params: { percent: { defense: 20, spDefense: 20 } } },
        trigger('attacked', [E.dmg('other', sv('Defense', 20))])
      ]
    },
    vi: 'Golem hộ vệ',
    en: 'Guardian Golem'
  },
  {
    def: {
      id: 'vex',
      maxStacks: 3,
      leaveChance: 50,
      hooks: [trigger('turnEnd', [E.dmg('randomFoe', sv('Intelligence', 20))])]
    },
    vi: 'Vex',
    en: 'Vex'
  }
]
for (const { def, vi, en } of NEW_MINIONS) {
  if (minions.some((m) => m.id === def.id)) fail(`Minion "${def.id}" đã có`)
  minions.push(def)
  names.vi.minions[def.id] = vi
  names.en.minions[def.id] = en
  counts.minions++
}

// ---------- Skill mới ----------

function addSkill({ id, elementId, skill, vi, en, tags = [] }) {
  if (skillById.has(id)) fail(`Skill "${id}" đã có`)
  if (takenVi.has(vi)) fail(`Tên vi "${vi}" đã có`)
  takenVi.add(vi)
  const full = { id, elementId, ...skill, ...(tags.length ? { tags } : {}) }
  skills.push(full)
  skillById.set(id, full)
  names.vi.skills[id] = vi
  names.en.skills[id] = en
  counts.skills++
}

function teach(sp, skillId, level) {
  if (sp.learnset.some((entry) => entry.skillId === skillId)) return
  sp.learnset.push({ level, skillId })
  sp.learnset.sort((a, b) => a.level - b.level)
  counts.learnset++
}

/** Học bởi `count` loài lọc theo `filter` (theo md5 của loài + skill). */
function teachSome(skillId, filter, count, level) {
  const learners = species
    .filter((sp) => sp.kind === 'normal' && filter(sp))
    .sort((a, b) => md5(`${a.id}|${skillId}`).localeCompare(md5(`${b.id}|${skillId}`)))
    .slice(0, count)
  for (const sp of learners) teach(sp, skillId, level)
  return learners.length
}

// Siralim: 4 spell còn lại (class → hệ: Life = light, Nature = grass, Death = ghost, Sorcery = psychic).
const SIRALIM_EXTRA = [
  {
    id: 'illusion',
    elementId: 'light',
    vi: 'Ảo ảnh',
    en: 'Illusion',
    level: 50,
    tags: ['ultimate', 'minion'],
    skill: cast('allAllies', { onTarget: [minion('subject', 'illusion')] })
  },
  {
    id: 'torunAttunement',
    elementId: 'grass',
    vi: 'Hòa nhịp Torun',
    en: 'Torun Attunement',
    level: 26,
    tags: ['minion'],
    skill: cast('self', { after: [minion('self', 'torunJunior')] })
  },
  {
    // Cả phe dùng spell gọi / tác động minion: quy thành quái dùng dùng một spell họ minion.
    id: 'darkSummoning',
    elementId: 'ghost',
    vi: 'Triệu hồi hắc ám',
    en: 'Dark Summoning',
    level: 16,
    tags: ['minion'],
    skill: cast('self', { after: [E.cast({ pool: 'global', tags: ['minion'] })] })
  },
  {
    // Lần 1 (quái dùng chưa có minion): cả phe nhận 3 minion ngẫu nhiên, không gây sát thương.
    // Lần 2 (đã có minion): sát thương massive +15% mỗi stack minion, rồi cả phe mất minion.
    id: 'quietus',
    elementId: 'psychic',
    vi: 'Khúc tận',
    en: 'Quietus',
    level: 50,
    tags: ['ultimate', 'minion'],
    skill: hit('massive', 'allEnemies', {
      powerTimes: cnt('minionTypes', { max: 1 }),
      powerBonus: [pb(15, cnt('minionStacks'))],
      after: [
        onlyIf({ ...E.minion('side'), count: 3 }, C.below(cnt('minionTypes', { who: 'self' }), 1)),
        onlyIf(E.rmMinions('side'), C.dmgAbove(0, 'self'))
      ]
    })
  }
]
const siralimSpecies = species.filter((s) => s.source === 'siralim')
for (const entry of SIRALIM_EXTRA) {
  addSkill(entry)
  teachSome(
    entry.id,
    (sp) => siralimSpecies.includes(sp) && sp.elementIds.includes(entry.elementId),
    8,
    entry.level
  )
}
const stillDropped = siralimReport.droppedSpells.filter(
  (d) => !SIRALIM_EXTRA.some((e) => e.en === d.name)
)
siralimReport.readdedSummonSpells.push(
  ...SIRALIM_EXTRA.map((e) => ({ name: e.en, skillId: e.id, reused: false }))
)
siralimReport.droppedSpells = stillDropped

// Nguồn khác: học bởi tối đa 6 loài cùng nguồn, level 24 (Army of the Dead 44).
const OTHER_SUMMONS = [
  {
    source: 'dnd',
    id: 'animateDead',
    elementId: 'ghost',
    vi: 'Gọi tử thi',
    en: 'Animate Dead',
    effects: [minion('self', 'zombies', 3)]
  },
  {
    source: 'dnd',
    id: 'conjureAnimals',
    elementId: 'grass',
    vi: 'Triệu thú',
    en: 'Conjure Animals',
    effects: [minion('self', 'direWolves', 2)]
  },
  {
    source: 'dnd',
    id: 'summonFiend',
    elementId: 'fire',
    vi: 'Triệu quỷ dữ',
    en: 'Summon Fiend',
    effects: [minion('self', 'fireImps', 2)]
  },
  {
    source: 'warcraft',
    id: 'feralSpirit',
    elementId: 'electric',
    vi: 'Linh hồn hoang dã',
    en: 'Feral Spirit',
    effects: [minion('self', 'direWolves', 2)]
  },
  {
    source: 'warcraft',
    id: 'summonImp',
    elementId: 'fire',
    vi: 'Gọi quỷ con',
    en: 'Summon Imp',
    effects: [minion('self', 'fireImps')]
  },
  {
    source: 'warcraft',
    id: 'armyOfTheDead',
    elementId: 'ghost',
    vi: 'Đạo quân tử thi',
    en: 'Army of the Dead',
    target: 'allAllies',
    level: 44,
    effects: [minion('subject', 'zombies', 5)]
  },
  {
    source: 'elderScrolls',
    id: 'conjureFamiliar',
    elementId: 'psychic',
    vi: 'Triệu linh thú',
    en: 'Conjure Familiar',
    effects: [minion('self', 'direWolves')]
  },
  {
    source: 'elderScrolls',
    id: 'raiseZombie',
    elementId: 'ghost',
    vi: 'Dựng xác sống',
    en: 'Raise Zombie',
    effects: [minion('self', 'zombies', 2)]
  },
  {
    source: 'diablo',
    id: 'raiseSkeleton',
    elementId: 'ghost',
    vi: 'Dựng bộ xương',
    en: 'Raise Skeleton',
    effects: [minion('self', 'zombies', 2)]
  },
  {
    source: 'diablo',
    id: 'summonGolem',
    elementId: 'rock',
    vi: 'Gọi Golem',
    en: 'Summon Golem',
    effects: [minion('self', 'golem')]
  },
  {
    source: 'terraria',
    id: 'spiderStaff',
    elementId: 'bug',
    vi: 'Gậy nhện',
    en: 'Spider Staff',
    effects: [minion('self', 'spiderlings', 3)]
  },
  {
    source: 'terraria',
    id: 'impStaff',
    elementId: 'fire',
    vi: 'Gậy quỷ con',
    en: 'Imp Staff',
    effects: [minion('self', 'fireImps', 2)]
  },
  {
    source: 'minecraft',
    id: 'summonVex',
    elementId: 'dark',
    vi: 'Gọi Vex',
    en: 'Summon Vex',
    effects: [minion('self', 'vex', 2)]
  }
]
const otherReport = []
for (const entry of OTHER_SUMMONS) {
  const target = entry.target ?? 'self'
  const skill =
    target === 'self'
      ? cast('self', { after: entry.effects })
      : cast(target, { onTarget: entry.effects })
  addSkill({ ...entry, skill, tags: ['minion'] })
  const learners = teachSome(entry.id, (sp) => sp.source === entry.source, 6, entry.level ?? 24)
  otherReport.push({ source: entry.source, skillId: entry.id, learners })
}
// Raise Dead của Warcraft dùng lại skill TWW3 cùng tên, chỉ thêm learnset.
skillById.get('raiseDead') ?? fail('Thiếu skill raiseDead')
otherReport.push({
  source: 'warcraft',
  skillId: 'raiseDead',
  reused: true,
  learners: teachSome('raiseDead', (sp) => sp.source === 'warcraft', 6, 24)
})

// ---------- Họ skill `minion` cho mọi skill gọi / tác động minion ----------

const touchesMinions = (value) =>
  JSON.stringify(value).match(/"do":"(minion|removeMinions)"|"minion(Types|Stacks)"/) !== null
for (const skill of skills) {
  if (!skill.spell || !touchesMinions(skill.spell)) continue
  if (skill.tags?.includes('minion')) continue
  skill.tags = [...(skill.tags ?? []), 'minion']
  counts.tagged++
}

writeJson('src/data/skills.json', skills)
writeJson('src/data/species.json', species)
writeJson('src/data/minions.json', minions)
for (const language of ['vi', 'en']) {
  writeJson(`src/data/i18n/${language}/skills.json`, names[language].skills)
  writeJson(`src/data/i18n/${language}/minions.json`, names[language].minions)
}
writeJson('scripts/data-import/siralim-report.json', siralimReport)
writeJson(summonsReportPath, {
  meta: 'Skill triệu hồi của nguồn khác (summons-extra-import.mjs); xem "Nội dung triệu hồi thêm lại" ở content-data.md',
  executeSpells: { hpBelowPercent: EXECUTE_HP_PERCENT, hitChance: EXECUTE_HIT_CHANCE },
  otherSourceSummons: otherReport
})
console.log(counts, { siralimStillDropped: stillDropped.map((d) => d.name) }, otherReport)
