/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Hàm thuần dựng loài mới từ một mục nguồn đã chuẩn hóa (species-batch-import.mjs; luật ở mục
// "Dữ liệu nguồn thật" của docs/rules/content-sources-more.md). Mọi lựa chọn tất định theo md5.

import { createHash } from 'node:crypto'

export const STAT_KEYS = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed']

/** Tổng chỉ số gốc và tỉ lệ bắt theo bậc (như các đợt fantasy / scifi trước). */
export const TIERS = {
  baby: { total: 220, catchRate: 70 },
  small: { total: 290, catchRate: 60 },
  medium: { total: 420, catchRate: 40 },
  peak: { total: 520, catchRate: 20 },
  large: { total: 560, catchRate: 12 },
  mythic: { total: 630, catchRate: 5 }
}
const TOTAL_JITTER = 0.07

/** Dáng chỉ số theo kiểu (hệ số tương đối, chuẩn hóa về tổng của bậc). */
export const STYLES = {
  balanced: [1, 1, 1, 1, 1, 1],
  fast: [0.85, 1.05, 0.8, 1, 0.85, 1.45],
  tank: [1.3, 0.9, 1.4, 0.75, 1.1, 0.55],
  bruiser: [1.15, 1.35, 1.05, 0.65, 0.9, 0.9],
  caster: [0.9, 0.65, 0.85, 1.4, 1.2, 1],
  hunter: [0.95, 1.3, 0.85, 0.75, 0.85, 1.3],
  guardian: [1.2, 0.8, 1.15, 0.9, 1.3, 0.65]
}
const STAT_JITTER = 0.1

export const hashUnit = (value) =>
  parseInt(createHash('md5').update(value).digest('hex').slice(0, 8), 16) / 0x100000000

/** Chỉ số gốc theo bậc + kiểu, dao động tất định theo id. */
export function buildStats(id, tier, style = 'balanced') {
  const tierRule = TIERS[tier] ?? TIERS.medium
  const shape = STYLES[style] ?? STYLES.balanced
  const total = tierRule.total * (1 + (hashUnit(`${id}|total`) * 2 - 1) * TOTAL_JITTER)
  const weights = shape.map((w, i) => w * (1 + (hashUnit(`${id}|${i}`) * 2 - 1) * STAT_JITTER))
  const sum = weights.reduce((a, b) => a + b, 0)
  return Object.fromEntries(
    STAT_KEYS.map((key, i) => [key, Math.max(1, Math.round((total * weights[i]) / sum))])
  )
}

/** Tỉ lệ bắt thang 0–255 của game gốc → thang 0–100 (như Pokémon: 100 × √(r / 255)). */
export const catchRateFrom255 = (rate) =>
  Math.max(1, Math.min(100, Math.round(100 * Math.sqrt(Math.max(1, rate) / 255))))

/** Hệ số thọ nguyên theo race (race riêng trước, rồi nhóm) — công thức ở lifespan.md. */
const LIFESPAN_RACE = {
  elf: 5,
  dwarf: 2.5,
  halfling: 1.3,
  orc: 0.8,
  giant: 2,
  angel: 5,
  god: 8
}
const LIFESPAN_GROUP = {
  insect: 0.6,
  plant: 1.5,
  mineral: 2,
  aquatic: 1.2,
  reptile: 1.4,
  dinosaur: 1.2,
  dragon: 4,
  spirit: 3,
  undead: 3,
  demon: 3,
  elemental: 2.5,
  celestial: 5,
  deity: 8,
  shapeshifter: 2,
  aberration: 2
}
const LIFESPAN_ORIGIN = { fantasy: 1.2, cryptid: 1.5, myth: 2 }

/** Thọ nguyên gốc (năm) theo công thức ban đầu của lifespan.md. */
export function buildLifespan({ stats, raceId, groupId, origin, catchRate }) {
  const total = STAT_KEYS.reduce((sum, key) => sum + stats[key], 0)
  let years = 20 + Math.max(0, total - 150) * 0.2
  years *= LIFESPAN_RACE[raceId] ?? LIFESPAN_GROUP[groupId] ?? 1
  years *= LIFESPAN_ORIGIN[origin] ?? 1
  if (catchRate <= 5) years *= 3
  else if (catchRate <= 12) years *= 1.5
  const step = years < 100 ? 5 : years < 1000 ? 10 : 100
  return Math.max(10, Math.round(years / step) * step)
}

/** Dải power của từng ô learnset. */
const BANDS = { basic: [1, 50], weak: [50, 75], mid: [60, 85], strong: [80, 105] }
const POOL_SIZE = 6
const MIN_LEARNERS = 10

/**
 * Bể skill dùng chung: theo hệ và dải power, chỉ skill gây sát thương phổ biến (không spell /
 * tag / đánh nhiều lần), xếp theo số loài đang học; skill buff theo chỉ số (status, nhắm bản thân).
 */
export function buildSkillPools(skills, species) {
  const learners = new Map()
  for (const sp of species)
    for (const entry of sp.learnset ?? [])
      learners.set(entry.skillId, (learners.get(entry.skillId) ?? 0) + 1)
  const common = skills.filter(
    (s) => !s.spell && !s.tags && (learners.get(s.id) ?? 0) >= MIN_LEARNERS
  )
  const byCount = (a, b) => (learners.get(b.id) ?? 0) - (learners.get(a.id) ?? 0)
  const damage = {}
  for (const skill of common.filter((s) => s.category !== 'status' && !s.hits)) {
    for (const [band, [min, max]] of Object.entries(BANDS)) {
      if (skill.power < min || skill.power > max) continue
      const key = `${skill.elementId}|${band}|${skill.category}`
      ;(damage[key] ??= []).push(skill)
    }
  }
  for (const list of Object.values(damage)) list.sort(byCount)
  const buffs = {}
  for (const stat of STAT_KEYS) {
    buffs[stat] = common
      .filter(
        (s) =>
          s.category === 'status' &&
          s.target === 'self' &&
          s.effects.some(
            (e) => e.type === 'statStage' && e.params.stat === stat && e.params.delta > 0
          )
      )
      .sort(byCount)
      .slice(0, 3)
  }
  return { damage, buffs }
}

/**
 * Chọn một skill trong bể (ưu tiên đúng loại công; thiếu thì loại còn lại, rồi cả hai loại của hệ
 * Thường, để ô level 1 luôn có skill).
 */
function pickDamage(pools, { id, slot, elementId, band, category }) {
  const other = category === 'physical' ? 'special' : 'physical'
  for (const [element, cat] of [
    [elementId, category],
    [elementId, other],
    ['normal', category],
    ['normal', other]
  ]) {
    const list = (pools.damage[`${element}|${band}|${cat}`] ?? []).slice(0, POOL_SIZE)
    if (list.length > 0) return list[Math.floor(hashUnit(`${id}|${slot}`) * list.length)].id
  }
  return null
}

/** Learnset: skill cơ bản level 1, skill yếu / vừa / mạnh theo hệ, một skill buff chỉ số cao nhất. */
export function buildLearnset(pools, { id, elementIds, stats }) {
  const category = stats.attack >= stats.spAttack ? 'physical' : 'special'
  const [first, second = first] = elementIds
  const plan = [
    [1, first, 'basic'],
    [8, second, 'basic'],
    [14, first, 'weak'],
    [22, second, 'weak'],
    [30, first, 'mid'],
    [38, first, 'strong'],
    [46, second, 'strong']
  ]
  const learnset = []
  const taken = new Set()
  for (const [level, elementId, band] of plan) {
    const skillId = pickDamage(pools, { id, slot: `${level}`, elementId, band, category })
    if (skillId && !taken.has(skillId)) {
      learnset.push({ level, skillId })
      taken.add(skillId)
    }
  }
  const bestStat = STAT_KEYS.filter((k) => k !== 'hp').sort((a, b) => stats[b] - stats[a])[0]
  const buffs = pools.buffs[bestStat] ?? []
  if (buffs.length > 0) {
    const skillId = buffs[Math.floor(hashUnit(`${id}|buff`) * buffs.length)].id
    if (!taken.has(skillId)) learnset.push({ level: 18, skillId })
  }
  learnset.sort((a, b) => a.level - b.level)
  // Luật dữ liệu: cần ít nhất một skill ở level 1.
  if (learnset.length > 0 && learnset[0].level !== 1) learnset[0] = { ...learnset[0], level: 1 }
  return learnset
}

/** "Rock Golem (Big)" → "rockGolemBig"; ký tự không phải chữ / số bị bỏ, chữ có dấu bỏ dấu. */
export function toCamelId(name) {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const id = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
  return /^[0-9]/.test(id) ? `n${id}` : id
}
