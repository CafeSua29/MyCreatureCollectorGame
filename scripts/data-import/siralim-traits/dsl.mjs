/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Helper soạn quy đổi trait Siralim (traits-planned.json) sang hook thật của game (mục "Trait
// Siralim" ở battle.md, quy đổi ở "Dữ liệu Siralim Ultimate" của content-sources-more.md). Chỉ dùng
// cho script nhập dữ liệu, không nạp vào game. Mỗi file partN.mjs xuất `CONVERSIONS`: id trait →
// danh sách hook, hoặc REJECT(lý do) / DEFER(mục lộ trình).

import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync(new URL('../siralim-report.json', import.meta.url), 'utf8'))

/** Tên buff / debuff Siralim → id trạng thái của game. */
export const ST = {
  Agile: 'agile',
  Arcane: 'arcane',
  Barrier: 'barrierBuff',
  Berserk: 'berserk',
  Defensive: 'defensive',
  Invisible: 'invisible',
  Immune: 'immune',
  Leeching: 'leeching',
  Mending: 'mending',
  Proficient: 'proficient',
  Protected: 'protected',
  Rebirth: 'rebirthBuff',
  Repelling: 'repelling',
  Savage: 'savageBuff',
  Shelled: 'shelled',
  Splashing: 'splashing',
  Taunting: 'taunting',
  Warded: 'warded',
  Bleeding: 'bleeding',
  Blighted: 'blighted',
  Blind: 'blind',
  Bomb: 'bomb',
  Burning: 'burn',
  Confused: 'confused',
  Cursed: 'cursed',
  Disarmed: 'disarmed',
  Feared: 'feared',
  Frozen: 'frozen',
  Inverted: 'inverted',
  Poisoned: 'poison',
  Scorned: 'scorned',
  Silenced: 'silenced',
  Sleeping: 'sleeping',
  Snared: 'snared',
  Stone: 'stone',
  Vulnerable: 'vulnerable',
  Weak: 'weak'
}

/** Class Siralim → hệ của game (bảng đã dùng khi nhập loài). */
export const CLASS = {
  Chaos: 'fire',
  Death: 'ghost',
  Life: 'light',
  Nature: 'grass',
  Sorcery: 'psychic'
}

/** Race Siralim → race game (siralim-report.json). */
export function race(siralimRace) {
  const id = report.speciesBySiralimRace[siralimRace]
  if (!id) throw new Error(`Race Siralim lạ "${siralimRace}"`)
  return id
}

export const ATK = ['physical']
export const SPELL = ['special', 'status']
export const NON_HP = ['attack', 'spAttack', 'defense', 'spDefense', 'speed']

/** Chỉ số Siralim → chỉ số game (Defense = defense + spDefense). */
const STAT = {
  Attack: ['attack'],
  Intelligence: ['spAttack'],
  Defense: ['defense', 'spDefense'],
  Speed: ['speed'],
  Health: ['hp']
}

/** Danh sách chỉ số game từ tên Siralim ("Attack", "Intelligence"...); "all" = mọi chỉ số khác hp. */
export function stats(...names) {
  if (names.length === 1 && names[0] === 'all') return [...NON_HP]
  return names.flatMap((name) => {
    const mapped = STAT[name]
    if (!mapped) throw new Error(`Chỉ số Siralim lạ "${name}"`)
    return mapped
  })
}

/** Object % theo chỉ số Siralim. */
export function pct(percent, ...names) {
  return Object.fromEntries(stats(...names).map((stat) => [stat, percent]))
}

/** Quy đổi "+X% chỉ số trong trận" sang bậc trận (config.battle.stagePercentSteps: 35, 75). */
export const stg = (percent) => (percent < 35 ? 1 : percent < 75 ? 2 : 3)

// ---------- Lượng ----------

/** Theo chỉ số (attack / spAttack / defense / speed / highest / lowest) của quái `of`. */
export const sv = (stat, percent, of = 'self', per) =>
  withPer({ stat: STAT_KEY[stat] ?? stat, of, percent }, per)
const STAT_KEY = { Attack: 'attack', Intelligence: 'spAttack', Defense: 'defense', Speed: 'speed' }
/** Theo máu hiện tại / max / đã mất. */
export const hpv = (hp, percent, of = 'self', per) => withPer({ hp, of, percent }, per)
/** Theo lượng của sự kiện. */
export const ev = (percent, per) => withPer({ event: true, percent }, per)
export const flat = (n) => ({ flat: n })
/** Theo bản ghi trận (damageDealt / damageTaken / healingReceived) của quái hoặc cả phe. */
export const rec = (record, percent, of = 'self', side = false) =>
  side ? { record, of, percent, side: true } : { record, of, percent }
const withPer = (amount, per) => (per ? { ...amount, per } : amount)

/** Bộ đếm. */
export const cnt = (of, extra = {}) => ({ of, ...extra })

// ---------- Hook ----------

export const h = (type, params) => ({ type, params })
export const statMod = (percent) => h('statModifier', { percent })
export const aura = (scope, hooks, stacks = false, when) =>
  h('aura', { scope, ...(stacks ? { stacks: true } : {}), hooks, ...(when ? { when } : {}) })
/** Hào quang chỉ phát khi chủ hào quang thỏa điều kiện (kiểu "nếu cả đội là X"). */
export const auraIf = (scope, when, ...hooks) => aura(scope, hooks, false, when)
export const side = (...hooks) => aura('side', hooks)
export const allies = (...hooks) => aura('allies', hooks)
export const foes = (...hooks) => aura('foes', hooks)
export const dmg = (percent, opts = {}) => h('damageDealtModifier', { percent, ...opts })
export const taken = (percent, opts = {}) => h('damageTakenWhen', { percent, ...opts })
export const scaling = (per, effect, opts = {}) => h('scaling', { per, effect, ...opts })
export const statWhen = (percent, when) => h('statWhen', { percent, when })
export const crit = (opts = {}) => h('guaranteedCritical', opts)
export const critChance = (percent, opts = {}) => h('critChance', { percent, ...opts })
export const critDamage = (percent) => h('critDamageModifier', { percent })
export const dodge = (percent, opts = {}) => h('dodge', { percent, ...opts })
export const undodgeable = (opts = {}) => h('undodgeable', opts)
export const noCrit = (opts = {}) => h('cannotCrit', opts)
export const noDodge = () => h('cannotDodge', {})
export const negate = (chance, opts = {}) => h('negateDamage', { chance, ...opts })
export const cap = (percent) => h('damageCap', { percent })
export const floor = (percent, when) => h('hpFloor', when ? { percent, when } : { percent })
export const extraHits = (count, damagePercent, categories) =>
  h('extraHits', categories ? { count, damagePercent, categories } : { count, damagePercent })
export const repeat = (extra, categories, damagePercent) =>
  h('repeatSkill', damagePercent ? { extra, categories, damagePercent } : { extra, categories })
export const variance = (min, max) => h('damageVariance', { min, max })
export const healing = (opts) => h('healingModifier', opts)
export const attackStat = (stat, weight, categories) =>
  h('attackStat', categories ? { stat, weight, categories } : { stat, weight })
export const bonus = (amount, opts = {}) => h('bonusDamage', { amount, ...opts })
export const effectiveness = (mode) => h('effectiveness', { mode })
export const debuffImmune = (when) => h('debuffImmunity', when ? { when } : {})
export const resist = (chance, opts = {}) => h('debuffResist', { chance, ...opts })
export const potencyAll = (percent) => h('traitPotency', { percent })
export const orderBy = (stat) => h('turnOrderStat', { stat })
export const start = (position, chance) =>
  h('startPosition', chance === undefined ? { position } : { position, chance })
export const intercept = (opts = {}) => h('intercept', opts)
export const share = (percent) => h('damageShare', { percent })
export const randomTarget = (chance) => h('randomTarget', { chance })
export const seeInvisible = () => h('seeInvisible', {})
export const blockManual = (categories) => h('blockManual', { categories })
export const interrupt = (chance, categories) =>
  h('interrupt', categories ? { chance, categories } : { chance })
export const stageMult = (opts) => h('stageMultiplier', opts)
export const noStatGain = () => h('statGainBlock', {})
export const indirect = (percent) => h('indirectDamage', { percent })
export const convert = (opts) => h('statusConversion', opts)
export const duration = (opts) => h('statusDuration', opts)
export const potency = (statusIds, percent) => h('inflictPotency', { statusIds, percent })
export const statusDmg = (statusIds, percent) => h('statusDamageModifier', { statusIds, percent })
export const statusHeal = (statusIds, percent) => h('statusHeals', { statusIds, percent })
export const blockStatus = (kind, when) => h('statusGainBlock', when ? { kind, when } : { kind })
export const minionMod = (opts) => h('minionModifier', opts)
export const immune = (...statusIds) => h('statusImmunity', { statusIds })
export const regen = (percent) => h('regen', { percent })
export const lifesteal = (percent) => h('lifesteal', { percent })
export const revive = (hpPercent) => h('reviveOnce', { hpPercent })
export const survive = (chance) => h('surviveLethal', { fromFullHp: false, chance })
export const skipTurn = (chance) => h('skipTurnChance', { chance })
export const skipAlternate = () => h('skipEveryOtherTurn', {})
export const ignoreDefense = (percent) => h('ignoreDefensePercent', { percent })
export const indirectImmune = () => h('indirectDamageImmunity', {})
export const critImmune = () => h('critImmunity', {})
export const taken0 = (percent) => h('damageTakenModifier', { percent })

/** Trigger: sự kiện, phạm vi, hiệu ứng, tùy chọn (chance, when, oncePerTurn, oncePerBattle...). */
export const trig = (on, scope, effects, opts = {}) =>
  h('trigger', { on, scope, ...opts, effects: Array.isArray(effects) ? effects : [effects] })

// ---------- Hiệu ứng ----------

export const E = {
  dmg: (to, amount, extra = {}) => ({ do: 'damage', to, amount, ...extra }),
  heal: (to, amount) => ({ do: 'heal', to, amount }),
  stage: (to, statsOrSelector, delta) => ({ do: 'stage', to, stats: statsOrSelector, delta }),
  stamina: (to, amount) => ({ do: 'stamina', to, amount }),
  staminaPercent: (to, percent) => ({ do: 'stamina', to, percent }),
  staminaAtLeast: (to, atLeastPercent) => ({ do: 'stamina', to, atLeastPercent }),
  drainStamina: (to, from, amount) => ({ do: 'stamina', to, from, amount }),
  flat: (to, statsOrSelector, amount, from) =>
    from
      ? { do: 'flatStat', to, stats: statsOrSelector, amount, from }
      : { do: 'flatStat', to, stats: statsOrSelector, amount },
  lose: (to, statsOrSelector, amount) => ({
    do: 'flatStat',
    to,
    stats: statsOrSelector,
    amount,
    lose: true
  }),
  status: (to, statusId, extra = {}) => ({ do: 'status', to, statusId, ...extra }),
  random: (to, kind, count, extra = {}) =>
    count && count > 1
      ? { do: 'status', to, random: kind, count, ...extra }
      : { do: 'status', to, random: kind, ...extra },
  cure: (to, kind, count) => (count ? { do: 'cure', to, kind, count } : { do: 'cure', to, kind }),
  move: (from, to, kind, copy) =>
    copy
      ? { do: 'moveStatuses', from, to, kind, copy: true }
      : { do: 'moveStatuses', from, to, kind },
  potency: (to, statusIds, percent) => ({ do: 'statusPotency', to, statusIds, percent }),
  burst: (to, statusIds, turns, remove) =>
    remove
      ? { do: 'statusBurst', to, statusIds, turns, remove: true }
      : { do: 'statusBurst', to, statusIds, turns },
  atk: (to, damagePercent = 100, times = 1, by) => ({
    do: 'attack',
    to,
    damagePercent,
    ...(times > 1 ? { times } : {}),
    ...(by ? { by } : {})
  }),
  cast: (opts) => ({ do: 'cast', ...opts }),
  revive: (to, hpPercent) => ({ do: 'revive', to, hpPercent }),
  kill: (to, belowHpPercent) =>
    belowHpPercent === undefined ? { do: 'kill', to } : { do: 'kill', to, belowHpPercent },
  extra: (to = 'self') => ({ do: 'extraTurn', to }),
  timeline: (to, position) => ({ do: 'timeline', to, position }),
  minion: (to, stacks = 1, minionId) =>
    minionId ? { do: 'minion', to, minionId, stacks } : { do: 'minion', to, stacks },
  minionPool: (to, pool, stacks = 1) => ({ do: 'minion', to, pool, stacks }),
  minionUp: (to, stacks = 1) => ({ do: 'minion', to, stacks, existing: true }),
  rmMinions: (to, minionId) =>
    minionId ? { do: 'removeMinions', to, minionId } : { do: 'removeMinions', to },
  trait: (to, opts = {}) => ({ do: 'gainTrait', to, ...opts }),
  seal: (to, count = 1) => ({ do: 'seal', to, count }),
  maxHp: (to, amount, lose) =>
    lose ? { do: 'maxHp', to, amount, lose: true } : { do: 'maxHp', to, amount },
  maxHpToCurrent: (to) => ({ do: 'maxHpToCurrent', to }),
  setHp: (to, percent) => ({ do: 'setHp', to, percent }),
  defend: (to = 'self') => ({ do: 'defend', to }),
  provoke: (to = 'self') => ({ do: 'provoke', to }),
  identity: (to, opts) => ({ do: 'identity', to, ...opts }),
  temp: (to, opts) => ({
    do: 'tempSkill',
    to,
    ...(typeof opts === 'string' ? { skillId: opts } : opts)
  }),
  remove: (to, kind, ...statusIds) => ({ do: 'cure', to, kind, statusIds })
}

/** Chỉ áp hiệu ứng lên mục tiêu thỏa điều kiện (`target` = từng mục tiêu). */
export const onlyIf = (effect, ...conditions) => ({ ...effect, if: conditions })

// ---------- Skill theo tên ----------

const skillNamesEn = JSON.parse(
  readFileSync(new URL('../../../src/data/i18n/en/skills.json', import.meta.url), 'utf8')
)
const plannedSkills = JSON.parse(
  readFileSync(new URL('../skills-planned.json', import.meta.url), 'utf8')
)
/** Khóa so tên: chữ thường, bỏ khoảng trắng / dấu ("Fireball" khớp "Fire Ball"). */
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const skillByName = new Map(Object.entries(skillNamesEn).map(([id, name]) => [nameKey(name), id]))
for (const skill of plannedSkills) {
  if (!skillByName.has(nameKey(skill.nameEn))) skillByName.set(nameKey(skill.nameEn), skill.id)
}

/** Id skill theo tên tiếng Anh (skill trong game hoặc spell Siralim đang chờ, chuyển cùng đợt). */
export function spell(nameEn) {
  const id = skillByName.get(nameKey(nameEn))
  if (!id) throw new Error(`Không có skill tên "${nameEn}"`)
  return id
}

// ---------- Điều kiện ----------

export const C = {
  hpBelow: (who, percent) => ({ if: 'hpBelow', who, percent }),
  hpAbove: (who, percent) => ({ if: 'hpAbove', who, percent }),
  has: (who, statusIds, all) =>
    all ? { if: 'hasStatus', who, statusIds, all: true } : { if: 'hasStatus', who, statusIds },
  lacks: (who, statusIds) => ({ if: 'lacksStatus', who, statusIds }),
  count: (who, kind, min) =>
    kind ? { if: 'statusCount', who, kind, min } : { if: 'statusCount', who, min },
  none: (who, kind) => (kind ? { if: 'noStatus', who, kind } : { if: 'noStatus', who }),
  cat: (...categories) => ({ if: 'category', categories }),
  single: () => ({ if: 'singleTarget' }),
  defending: (who = 'self') => ({ if: 'defending', who }),
  provoking: (who = 'self') => ({ if: 'provoking', who }),
  atLeast: (counter, min) => ({ if: 'counterAtLeast', counter, min }),
  below: (counter, max) => ({ if: 'counterBelow', counter, max }),
  race: (who, raceIds) => ({ if: 'race', who, raceIds }),
  sameRace: (who) => ({ if: 'sameRace', who }),
  el: (who, elementIds) => ({ if: 'element', who, elementIds }),
  sameEl: (who) => ({ if: 'sameElement', who }),
  isSelf: (who) => ({ if: 'isSelf', who }),
  notSelf: (who) => ({ if: 'notSelf', who }),
  dead: () => ({ if: 'selfDead' }),
  dmgAbove: (percentOfMaxHp, who) =>
    who ? { if: 'damageAbove', percentOfMaxHp, who } : { if: 'damageAbove', percentOfMaxHp },
  dmgAboveLowest: (percentOfLowestStat, who) =>
    who
      ? { if: 'damageAbove', percentOfLowestStat, who }
      : { if: 'damageAbove', percentOfLowestStat },
  sameSide: (who) => ({ if: 'sameSide', who }),
  skillTarget: (...targets) => ({ if: 'skillTarget', targets }),
  tag: (...tags) => ({ if: 'skillTag', tags }),
  skill: (...skillIds) => ({ if: 'skill', skillIds }),
  skillElement: (elementIds) => ({ if: 'skillElement', elementIds }),
  higher: (stat, than) => ({ if: 'statHigher', stat, than }),
  lower: (stat, than) => ({ if: 'statLower', stat, than }),
  reactive: (value) => ({ if: 'reactive', value }),
  own: () => ({ if: 'reactive', value: false }),
  noDmg: () => ({ if: 'noDamageSinceTurnEnd' }),
  allRace: () => ({ if: 'partyAllRace' }),
  boss: (value) => ({ if: 'bossBattle', value }),
  levelOdd: (value) => ({ if: 'levelOdd', value }),
  noGains: (statList) =>
    statList ? { if: 'noGainedStats', stats: statList } : { if: 'noGainedStats' },
  crit: () => ({ if: 'critical' })
}

// ---------- Không chuyển ----------

/** Loại hẳn: dựa trên hệ thống game không có và không có trong lộ trình (câu 16 đã duyệt). */
export const REJECT = (reason) => ({ reject: reason })
/** Hoãn: chờ một mục lộ trình (ví dụ Trang bị). */
export const DEFER = (roadmap) => ({ defer: roadmap })
