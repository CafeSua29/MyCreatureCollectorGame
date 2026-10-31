/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Thêm lại nội dung triệu hồi đã bỏ ở các đợt nhập trước (chủ project bỏ luật loại trừ "skill
// triệu hồi", minion bám vào quái như Siralim; mục "Minion" ở docs/rules/battle.md):
// - Siralim: spell triệu hồi / chỉ tác động minion (siralim-report.json `droppedSpells`) và phần
//   minion đã cắt của 8 spell (`minionClausesStripped`).
// - Total War: WARHAMMER III: spell triệu hồi (tww3-report.json `skippedSummons`), cần 8 minion mới.
// Chạy một lần: node scripts/data-import/summons-import.mjs, rồi prettier + npm test.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { ST, CLASS, stats, sv, hpv, cnt, E, C, onlyIf, cast, pb } from './siralim-spells/sdsl.mjs'

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
const names = {
  vi: {
    skills: readJson('src/data/i18n/vi/skills.json'),
    minions: readJson('src/data/i18n/vi/minions.json')
  },
  en: {
    skills: readJson('src/data/i18n/en/skills.json'),
    minions: readJson('src/data/i18n/en/minions.json')
  }
}
const siralimReport = readJson('scripts/data-import/siralim-report.json')
const tww3Report = readJson('scripts/data-import/tww3-report.json')
const tww3Source = readJson('scripts/data-import/tww3-source.json')

const S = (name) => ST[name]
const minion = (to, minionId, stacks = 1) => E.minion(to, stacks, minionId)
const ALL4 = ['Attack', 'Intelligence', 'Defense', 'Speed']

// ---------- Minion mới cho TWW3 (số tạm theo cỡ minion Siralim) ----------

const trigger = (on, effects, extra = {}) => ({
  type: 'trigger',
  params: { on, scope: 'self', effects, ...extra }
})
const NEW_MINIONS = [
  {
    def: {
      id: 'ratSwarm',
      maxStacks: 9,
      leaveChance: 25,
      hooks: [trigger('turnEnd', [E.dmg('randomFoe', sv('Attack', 20))])]
    },
    vi: 'Bầy chuột',
    en: 'Rat Swarm'
  },
  {
    def: {
      id: 'seaHorrors',
      maxStacks: 5,
      leaveChance: 25,
      hooks: [trigger('damaged', [E.status('other', S('Snared'))], { chance: 10 })]
    },
    vi: 'Quái biển sâu',
    en: 'Sea Horrors'
  },
  {
    def: {
      id: 'warBeasts',
      maxStacks: 5,
      leaveChance: 25,
      hooks: [trigger('attack', [E.atk('other', 15)], { when: [C.own()] })]
    },
    vi: 'Thú chiến',
    en: 'War Beasts'
  },
  {
    def: {
      id: 'ancestralSpirits',
      maxStacks: 5,
      leaveChance: 25,
      hooks: [
        { type: 'statModifier', params: { percent: { defense: 5, spDefense: 5 } } },
        trigger('turnEnd', [E.heal('self', hpv('max', 3))])
      ]
    },
    vi: 'Vong linh tổ tiên',
    en: 'Ancestral Spirits'
  },
  {
    def: {
      id: 'spectralRiders',
      maxStacks: 3,
      leaveChance: 25,
      hooks: [trigger('turnEnd', [E.dmg('randomFoe', sv('Speed', 30))])]
    },
    vi: 'Kỵ sĩ bóng ma',
    en: 'Spectral Riders'
  },
  {
    def: {
      id: 'squigLoons',
      maxStacks: 9,
      leaveChance: 50,
      hooks: [trigger('attack', [E.dmg('randomFoe', sv('Attack', 15))])]
    },
    vi: 'Loon nấm',
    en: 'Squig Loons'
  },
  {
    def: {
      id: 'dryads',
      maxStacks: 5,
      leaveChance: 25,
      hooks: [
        trigger('turnEnd', [E.heal('self', hpv('max', 3))]),
        trigger('attacked', [E.status('other', S('Snared'))], { chance: 10 })
      ]
    },
    vi: 'Dryad',
    en: 'Dryads'
  },
  {
    def: {
      id: 'serpentSwarm',
      maxStacks: 9,
      leaveChance: 25,
      hooks: [trigger('attack', [E.status('other', S('Poisoned'))], { chance: 10 })]
    },
    vi: 'Bầy rắn',
    en: 'Serpent Swarm'
  }
]

// ---------- Spell Siralim ----------

/** Level theo mức: thường 16, Tứ kỵ sĩ 26, Ultimate 50 (quy ước learnset Siralim). */
const SIRALIM_SUMMONS = {
  Banish: { vi: 'Trục xuất tay sai', skill: cast('enemy', { onTarget: [E.rmMinions('subject')] }) },
  'Call Help': {
    vi: 'Gọi cứu viện',
    skill: cast('allAllies', { onTarget: [E.minionUp('subject')] })
  },
  Contagion: {
    vi: 'Lây nhiễm',
    skill: cast('allEnemies', {
      onTarget: [
        E.random('subject', 'debuff', 1, { countPer: cnt('minionTypes', { who: 'subject' }) }),
        E.rmMinions('subject')
      ]
    })
  },
  'Curse of Jimly': {
    vi: 'Lời nguyền Jimly',
    skill: cast('allEnemies', {
      onTarget: [
        E.random('subject', 'debuff', 1, { countPer: cnt('minionStacks', { divisor: 3 }) })
      ]
    })
  },
  'Dark Summoning': { reject: 'spellFamily' },
  'Dark Transformation': {
    vi: 'Biến hóa hắc ám',
    skill: cast('self', {
      after: ALL4.map((name) =>
        E.flat('self', stats(name), sv(name, 10, 'self', cnt('minionTypes')))
      )
    })
  },
  'Divulging Bark': {
    vi: 'Tiếng sủa vạch trần',
    skill: cast('allAllies', { onTarget: [minion('subject', 'direWolves')] })
  },
  'Graveyard Shift': {
    vi: 'Ca trực nghĩa địa',
    skill: cast('allAllies', { onTarget: [minion('subject', 'zombies')] })
  },
  'Horrible Howl': {
    vi: 'Tiếng tru kinh hoàng',
    skill: cast('allAllies', {
      onTarget: [
        onlyIf(
          minion('subject', 'direWolves', 3),
          C.atLeast(cnt('minionStacks', { who: 'target' }), 1)
        )
      ]
    })
  },
  Illusion: { reject: 'minionMissing' },
  'Indiscriminate Summoning': {
    vi: 'Triệu hồi bừa bãi',
    skill: cast('allAllies', { onTarget: [E.minion('subject')] })
  },
  'Obelisk of Summoning': {
    vi: 'Tháp triệu hồi',
    skill: cast('self', { after: [E.minionUp('self', 9)] })
  },
  'Ritual of Summoning': {
    vi: 'Nghi lễ triệu hồi',
    skill: cast('self', { after: [E.minionUp('allies', 3), E.kill('self')] })
  },
  'Summon Animated Gem': {
    vi: 'Triệu hồi Ngọc sống',
    skill: cast('self', { after: [minion('self', 'animatedGem')] })
  },
  'Summon Animated Weapon': { defer: 'equipment' },
  'Summon Conquest': {
    vi: 'Triệu hồi Chinh Phạt',
    level: 26,
    skill: cast('self', { after: [minion('self', 'conquest')] })
  },
  'Summon Death': {
    vi: 'Triệu hồi Tử Thần',
    level: 26,
    skill: cast('self', { after: [minion('self', 'death')] })
  },
  'Summon Dire Wolf': {
    vi: 'Triệu hồi Sói dữ',
    skill: cast('self', { after: [minion('self', 'direWolves')] })
  },
  'Summon Doppelganger': {
    vi: 'Triệu hồi Phân thân',
    skill: cast('self', { after: [minion('self', 'doppelganger')] })
  },
  'Summon Famine': {
    vi: 'Triệu hồi Nạn Đói',
    level: 26,
    skill: cast('self', { after: [minion('self', 'famine')] })
  },
  'Summon Horde': {
    vi: 'Triệu hồi bầy đàn',
    skill: cast('allAllies', { onTarget: [E.minion('subject')] })
  },
  'Summon Spiderlings': {
    vi: 'Triệu hồi Nhện con',
    skill: cast('self', { after: [minion('self', 'spiderlings', 2)] })
  },
  'Summon Unstable Horror': {
    vi: 'Triệu hồi Quái vật bất ổn',
    skill: cast('self', { after: [minion('self', 'unstableHorror')] })
  },
  'Summon War': {
    vi: 'Triệu hồi Chiến Tranh',
    level: 26,
    skill: cast('self', { after: [minion('self', 'war')] })
  },
  'Summon Writheling': {
    vi: 'Triệu hồi Ấu trùng quằn quại',
    skill: cast('self', { after: [minion('self', 'writhelings')] })
  },
  'Summon Zombie': {
    vi: 'Triệu hồi Xác sống',
    skill: cast('self', { after: [minion('self', 'zombies')] })
  },
  'Supplicant Sacrifice': {
    vi: 'Hiến tế cầu khẩn',
    skill: cast('self', {
      after: [E.minion('allies'), E.minion('allies'), E.minion('allies'), E.kill('self')]
    })
  },
  'Torun Attunement': { reject: 'uniqueCharacter' },
  'Unstable Summoning': {
    vi: 'Triệu hồi bất ổn',
    skill: cast('self', { after: [E.minion('self')] })
  },
  Quietus: { reject: 'castHistory' },
  'Work of Art': {
    vi: 'Kiệt tác',
    level: 50,
    tags: ['ultimate'],
    skill: cast('allAllies', {
      onTarget: [1, 2, 3, 4, 5].map(() => E.minion('subject'))
    })
  }
}
/** Class Siralim của từng spell (spells.csv của nguồn gốc). */
const SIRALIM_CLASS = {
  Banish: 'Sorcery',
  'Call Help': 'Nature',
  Contagion: 'Death',
  'Curse of Jimly': 'Death',
  'Dark Transformation': 'Death',
  'Divulging Bark': 'Nature',
  'Graveyard Shift': 'Death',
  'Horrible Howl': 'Nature',
  'Indiscriminate Summoning': 'Death',
  'Obelisk of Summoning': 'Sorcery',
  'Ritual of Summoning': 'Death',
  'Summon Animated Gem': 'Sorcery',
  'Summon Conquest': 'Death',
  'Summon Death': 'Death',
  'Summon Dire Wolf': 'Sorcery',
  'Summon Doppelganger': 'Sorcery',
  'Summon Famine': 'Death',
  'Summon Horde': 'Death',
  'Summon Spiderlings': 'Nature',
  'Summon Unstable Horror': 'Death',
  'Summon War': 'Death',
  'Summon Writheling': 'Death',
  'Summon Zombie': 'Death',
  'Supplicant Sacrifice': 'Death',
  'Unstable Summoning': 'Death',
  'Work of Art': 'Life'
}

/** Phần minion đã cắt của 8 spell, ghép lại vào skill đã có. */
const STRIPPED_CLAUSES = {
  chaosOrb: (skill) => addOnTarget(skill, E.rmMinions('subject')),
  crucifixion: (skill) => addPowerBonus(skill, pb(35, cnt('minionTypes'))),
  directOrders: (skill) => addPowerBonus(skill, pb(20, cnt('minionTypes'))),
  dogpile: (skill) => addPowerBonus(skill, pb(5, cnt('minionStacks'))),
  runeOfDun: (skill) => addAfter(skill, E.minion('self')),
  runeOfSah: (skill) => addOnTarget(skill, E.rmMinions('subject')),
  zombieClap: (skill) => addAfter(skill, minion('self', 'zombies', 3)),
  faeFire: (skill) => addOnTarget(skill, E.rmMinions('subject'))
}
const spellOf = (skill) => (skill.spell ??= {})
const addOnTarget = (skill, effect) => (spellOf(skill).onTarget ??= []).push(effect)
const addAfter = (skill, effect) => (spellOf(skill).after ??= []).push(effect)
const addPowerBonus = (skill, bonus) => (spellOf(skill).powerBonus ??= []).push(bonus)

// ---------- Spell TWW3 ----------

/** Spell triệu hồi TWW3 → minion cho quái dùng (hoặc cả phe). */
const TWW3_SUMMONS = {
  transformationOfKadon: { reject: 'transform' },
  raiseDead: { vi: 'Gọi xác dậy', effects: [minion('self', 'zombies', 3)] },
  commandOfTheUnliving: {
    vi: 'Hiệu lệnh bất tử',
    target: 'allAllies',
    effects: [minion('subject', 'zombies', 2)]
  },
  awakenFromTheGrave: { vi: 'Thức dậy từ mồ', effects: [minion('self', 'zombies', 4)] },
  drownedDead: { vi: 'Xác chết đuối', effects: [minion('self', 'zombies', 3)] },
  denizensOfTheDeep: { vi: 'Cư dân biển sâu', effects: [minion('self', 'seaHorrors', 2)] },
  vermintide: { vi: 'Thủy triều chuột', effects: [minion('self', 'ratSwarm', 4)] },
  pestilentBirth: {
    vi: 'Sinh nở dịch hạch',
    effects: [minion('self', 'ratSwarm', 3), E.status('randomFoe', S('Poisoned'))]
  },
  savageDominion: { vi: 'Thống trị hoang dã', effects: [minion('self', 'warBeasts', 3)] },
  ancestralWarriors: {
    vi: 'Chiến binh tổ tiên',
    effects: [minion('self', 'ancestralSpirits', 3)]
  },
  mistressOfTheDeeps: { vi: 'Nữ chúa biển sâu', effects: [minion('self', 'seaHorrors', 3)] },
  theGraveCall: { vi: 'Tiếng gọi mồ', effects: [minion('self', 'zombies', 3)] },
  theDarkRiders: { vi: 'Kỵ sĩ bóng tối', effects: [minion('self', 'spectralRiders', 2)] },
  theAbyssalSwarm: { vi: 'Bầy vực thẳm', effects: [minion('self', 'spiderlings', 4)] },
  theHarbinger: { vi: 'Sứ giả điềm gở', effects: [minion('self', 'death')] },
  arachneruption: { vi: 'Nhện phun trào', effects: [minion('self', 'spiderlings', 5)] },
  daBossLoons: { vi: 'Bầy Loon của sếp', effects: [minion('self', 'squigLoons', 3)] },
  theLoonsOfTheEightPeaks: {
    vi: 'Bầy Loon Tám Đỉnh',
    effects: [minion('self', 'squigLoons', 5)]
  },
  gravecall: { vi: 'Hồi chuông mồ', effects: [minion('self', 'zombies', 5)] },
  callOfTheWoods: { vi: 'Tiếng gọi rừng', effects: [minion('self', 'dryads', 3)] },
  nightmaw: { vi: 'Nightmaw', effects: [minion('self', 'unstableHorror', 3)] },
  arkOfSotek: { vi: 'Hòm Sotek', effects: [minion('self', 'serpentSwarm', 4)] },
  theRatsEmerge: {
    vi: 'Chuột trồi lên',
    target: 'allAllies',
    effects: [minion('subject', 'ratSwarm', 3)]
  }
}
const TWW3_LEVEL_BY_TIER = [14, 24, 36, 44]

// ---------- Ghi dữ liệu ----------

const skillIds = new Set(skills.map((s) => s.id))
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const enByKey = new Map(Object.entries(names.en.skills).map(([id, name]) => [nameKey(name), id]))
const takenVi = new Set(Object.values(names.vi.skills))
const counts = { minions: 0, siralim: 0, siralimReused: 0, tww3: 0, learnset: 0, stripped: 0 }

function teach(sp, skillId, level) {
  if (sp.learnset.some((entry) => entry.skillId === skillId)) return
  sp.learnset.push({ level, skillId })
  sp.learnset.sort((a, b) => a.level - b.level)
  counts.learnset++
}

/** Thêm skill mới (id chưa có, tên vi / en không trùng). */
function addSkill(skill, nameVi, nameEn) {
  if (skillIds.has(skill.id)) fail(`Skill "${skill.id}" đã có`)
  if (takenVi.has(nameVi)) fail(`Tên vi "${nameVi}" đã có`)
  skillIds.add(skill.id)
  takenVi.add(nameVi)
  skills.push(skill)
  names.vi.skills[skill.id] = nameVi
  names.en.skills[skill.id] = nameEn
  enByKey.set(nameKey(nameEn), skill.id)
}

for (const { def, vi, en } of NEW_MINIONS) {
  if (minions.some((m) => m.id === def.id)) fail(`Minion "${def.id}" đã có`)
  minions.push(def)
  names.vi.minions[def.id] = vi
  names.en.minions[def.id] = en
  counts.minions++
}

const camel = (name) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)))
    .join('')

// Siralim: loài học là loài Siralim cùng hệ với class của spell, 8 loài theo md5.
const siralimSpecies = species.filter((s) => s.source === 'siralim' && s.kind === 'normal')
const readded = []
const stillDropped = []
for (const dropped of siralimReport.droppedSpells) {
  const entry = SIRALIM_SUMMONS[dropped.name] ?? fail(`Thiếu quy đổi "${dropped.name}"`)
  if (entry.reject || entry.defer) {
    stillDropped.push({ ...dropped, reason: entry.reject ?? `defer:${entry.defer}` })
    continue
  }
  const elementId = CLASS[SIRALIM_CLASS[dropped.name]] ?? fail(`Thiếu class "${dropped.name}"`)
  const reusedId = enByKey.get(nameKey(dropped.name))
  const skillId = reusedId ?? camel(dropped.name)
  if (!reusedId) {
    addSkill(
      { id: skillId, elementId, ...entry.skill, ...(entry.tags ? { tags: entry.tags } : {}) },
      entry.vi,
      dropped.name
    )
    counts.siralim++
  } else counts.siralimReused++
  const learners = siralimSpecies
    .filter((s) => s.elementIds.includes(elementId))
    .sort((a, b) => md5(`${a.id}|${skillId}`).localeCompare(md5(`${b.id}|${skillId}`)))
    .slice(0, 8)
  for (const sp of learners) teach(sp, skillId, entry.level ?? 16)
  readded.push({ name: dropped.name, skillId, reused: Boolean(reusedId) })
}
siralimReport.droppedSpells = stillDropped
siralimReport.readdedSummonSpells = readded

for (const [skillId, apply] of Object.entries(STRIPPED_CLAUSES)) {
  const skill = skills.find((s) => s.id === skillId) ?? fail(`Thiếu skill "${skillId}"`)
  apply(skill)
  counts.stripped++
}
siralimReport.minionClausesRestored = siralimReport.minionClausesStripped.map((c) => c.name)
delete siralimReport.minionClausesStripped

// TWW3: loài học là loài đang học spell khác cùng lore, tối đa 6 loài theo md5.
const loreOf = new Map()
for (const lore of tww3Source.lores) for (const spell of lore.spells) loreOf.set(spell.id, lore)
/** Nhóm ability cùng phe chứa ability `name` (dạng như lore: { spells }). */
function abilityGroup(name) {
  const ability =
    tww3Source.abilities.find((a) => a.name === name) ?? fail(`Không tìm thấy "${name}"`)
  return { spells: tww3Source.abilities.filter((a) => a.faction === ability.faction) }
}
const tww3Readded = []
const tww3Skipped = []
for (const name of tww3Report.skippedSummons) {
  // Spell của lore, hoặc ability của phe (anh em = ability khác cùng phe).
  const lore =
    [...loreOf.values()].find((l) => l.spells.some((s) => s.name === name)) ?? abilityGroup(name)
  const source = lore.spells.find((s) => s.name === name) ?? fail(`Không tìm thấy "${name}"`)
  const entry = TWW3_SUMMONS[source.id] ?? fail(`Thiếu quy đổi "${source.id}"`)
  if (entry.reject) {
    tww3Skipped.push({ name, reason: entry.reject })
    continue
  }
  const reusedId = enByKey.get(nameKey(name))
  const skillId = reusedId ?? source.id
  if (!reusedId) {
    const target = entry.target ?? 'self'
    const skill =
      target === 'self'
        ? cast('self', { after: entry.effects })
        : cast(target, { onTarget: entry.effects })
    addSkill({ id: skillId, elementId: source.elementId, ...skill }, entry.vi, name)
    counts.tww3++
  }
  const siblings = new Set(
    lore.spells.filter((s) => s.id !== source.id).map((s) => enByKey.get(nameKey(s.name)))
  )
  const learners = species
    .filter((sp) => sp.kind === 'normal' && sp.learnset.some((l) => siblings.has(l.skillId)))
    .sort((a, b) => md5(`${a.id}|${skillId}`).localeCompare(md5(`${b.id}|${skillId}`)))
    .slice(0, 6)
  for (const sp of learners) teach(sp, skillId, TWW3_LEVEL_BY_TIER[source.tier - 1])
  tww3Readded.push({ name, skillId, learners: learners.length, reused: Boolean(reusedId) })
}
tww3Report.skippedSummons = tww3Skipped
tww3Report.readdedSummons = tww3Readded

writeJson('src/data/skills.json', skills)
writeJson('src/data/species.json', species)
writeJson('src/data/minions.json', minions)
for (const language of ['vi', 'en']) {
  writeJson(`src/data/i18n/${language}/skills.json`, names[language].skills)
  writeJson(`src/data/i18n/${language}/minions.json`, names[language].minions)
}
writeJson('scripts/data-import/siralim-report.json', siralimReport)
writeJson('scripts/data-import/tww3-report.json', tww3Report)
console.log(counts, { siralimStillDropped: stillDropped.length, tww3Skipped: tww3Skipped.length })
