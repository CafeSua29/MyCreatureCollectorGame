/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi chiêu (technique) Temtem sang skill của game (content-sources-real.md mục "Temtem: chiêu, trait").
// Số lấy thẳng từ temtem-api: sát thương = power, giá thể lực = staminaCost (thanh thể lực Temtem ~ cùng thang
// 100), hold, ưu tiên. Hiệu ứng đọc từ mô tả wiki (`{{condition}}`, `{{statchange}}`, % hồi, giảm hold...);
// ca không đọc được ở OVERRIDES (ghi đè phần hiệu ứng / trường riêng).
// Lệch gốc: game chỉ có 5 kiểu mục tiêu (không có "đánh cả đồng đội"); synergy đổi ưu tiên / mục tiêu / loại
// đòn / giá không làm được (synergy chỉ cộng power và hiệu ứng skill), bỏ phần đó.

import { E } from '../siralim-spells/sdsl.mjs'
import { STATUS_ALIASES } from './conditions.mjs'

/** Hệ Temtem → hệ game (bảng chung với temtem-fetch.mjs). */
export const TYPES = {
  Neutral: 'normal',
  Wind: 'flying',
  Earth: 'ground',
  Water: 'water',
  Fire: 'fire',
  Nature: 'grass',
  Electric: 'electric',
  Mental: 'psychic',
  Digital: 'steel',
  Melee: 'fighting',
  Crystal: 'rock',
  Toxic: 'poison'
}

/** Ưu tiên của gốc (6 mức) → priority của game; giữ thứ tự, normal = 0. */
const PRIORITY = { verylow: -2, low: -1, normal: 0, high: 1, veryhigh: 2, ultra: 3 }
const STAT = { atk: 'attack', def: 'defense', spatk: 'spAttack', spdef: 'spDefense', spd: 'speed' }
/** Sát thương cố định của gốc (HP Temtem ~ 400 ở level cao) → % max HP mục tiêu: 120 → 30%. */
const EXACT_DAMAGE_PER_PERCENT = 4

/** Bỏ cú pháp wiki: `<x>` = trạng thái, `[stat±n]` = bậc chỉ số. */
export function cleanText(text, name) {
  return text
    .replace(/\{\{PAGENAME\}\}/g, name)
    .replace(/\{\{condition\|([a-z]+)[^}]*\}\}/gi, (_, id) => `<${id.toLowerCase()}>`)
    .replace(/\{\{statchange\|([+-]\d)\|([a-z]+)[^}]*\}\}/gi, '[$2$1]')
    .replace(/\{\{(?:stat|type|class)\|([a-z]+)[^}]*\}\}/gi, '$1')
    .replace(/\{\{priority[^}]*\}\}/gi, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>|<math>[\s\S]*?<\/math>|<\/?small>/g, ' ')
    .replace(/'''/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const statusId = (alias) => {
  const id = STATUS_ALIASES[alias]
  if (!id) throw new Error(`Trạng thái Temtem lạ "${alias}"`)
  return id
}

const VERB =
  /\b(inflicts?|inflicting|gifts?|gifting|gives?|grants?|restores?|causes?|cures?|removes?)\b/gi
const SELF_OBJECT = /\b(the user|user's|themselves|itself|the team)\b/i
const ANY_OBJECT = /\b(user|target|them|team|rival|combatants|ally|temtem)\b/i
/** Câu điều kiện / nhắc tới trạng thái để kiểm tra, không phải gây ra. */
const REFERENCE =
  /\b(if|afflicted with|already have|through|cures?|cured|removes?|removing|of the)\s*(the )?$/i
const COUNTDOWN = /countdown of (the )?$/i
/** "the rival team or the user's ally": mục tiêu là đội địch, không phải quái dùng. */
const objectText = (text) => text.replace(/or the user's ally/gi, '')

/** Ai nhận hiệu ứng ở vị trí `index`: theo tân ngữ của động từ gần nhất, không có thì như hiệu ứng trước. */
function whoAt(text, index, previous) {
  let last = null
  for (const match of text.slice(0, index).matchAll(VERB)) last = match
  if (!last) return previous
  const object = objectText(text.slice(last.index + last[0].length, index))
  if (SELF_OBJECT.test(object)) return 'self'
  return ANY_OBJECT.test(object) ? 'target' : previous
}

/** Số lượt của trạng thái ở `index`: "N turn countdown of", "N turn(s) of", hoặc "for N turn(s)" phía sau. */
function turnsAt(text, index, end) {
  const before = text.slice(Math.max(0, index - 30), index)
  const countdown = before.match(/(\d+) turns? (countdown of|of) (the )?$/i)
  if (countdown) return Number(countdown[1])
  const after = text.slice(index, end).match(/(?:for|lasts?) (\d+) turns?/i)
  return after ? Number(after[1]) : 1
}

/** Hiệu ứng đọc từ phần chính của mô tả (trước câu synergy). */
export function parseEffects(main) {
  const effects = []
  let who = 'target'
  const sentenceEnd = (index) => {
    const end = main.indexOf('.', index)
    return end < 0 ? main.length : end
  }
  const tokens = [
    ...[...main.matchAll(/<([a-z]+)>/g)].map((m) => ({ m, kind: 'status' })),
    ...[...main.matchAll(/\[([a-z]+)([+-]\d)\]/g)].map((m) => ({ m, kind: 'stage' })),
    ...[...main.matchAll(/(?:restores?|heals?) (\d+)% of [^.]*?maxim\w* (hp|sta)/gi)].map((m) => ({
      m,
      kind: 'restore'
    })),
    ...[...main.matchAll(/lose (\d+)% of their maximum (hp|sta)/gi)].map((m) => ({
      m,
      kind: 'lose'
    })),
    ...[
      ...main.matchAll(
        /(reduces|decreases) the hold of (all )?(the )?techniques[^.]*?by (\d)|-1 hold/gi
      )
    ].map((m) => ({ m, kind: 'hold' }))
  ].sort((a, b) => a.m.index - b.m.index)
  for (const { m, kind } of tokens) {
    const index = m.index
    const before = main.slice(Math.max(0, index - 30), index)
    if (kind === 'status' && REFERENCE.test(before) && !COUNTDOWN.test(before)) continue
    who = whoAt(main, index, who)
    if (kind === 'status') {
      effects.push({
        kind,
        who,
        statusId: statusId(m[1]),
        turns: turnsAt(main, index, sentenceEnd(index))
      })
    } else if (kind === 'stage') {
      effects.push({ kind, who, stat: STAT[m[1]], delta: Number(m[2]) })
    } else if (kind === 'restore' || kind === 'lose') {
      const sign = kind === 'lose' ? -1 : 1
      const restoreWho = /user's/i.test(objectText(m[0]))
        ? 'self'
        : kind === 'lose'
          ? 'target'
          : who
      effects.push({ kind: m[2].toLowerCase(), who: restoreWho, percent: sign * Number(m[1]) })
    } else {
      effects.push({
        kind: 'hold',
        who: /itself|user|its ally/.test(m[0]) ? 'self' : who,
        turns: Number(m[4] ?? 1)
      })
    }
  }
  return effects
}

/** Hiệu ứng đã đọc → hiệu ứng ngôn ngữ trait trong `spell` (onTarget lên mục tiêu, after lên quái dùng). */
function toSpell(effects, selfTargeted) {
  const onTarget = []
  const after = []
  for (const effect of effects) {
    const self = effect.who === 'self' && !selfTargeted
    const to = self ? 'self' : 'subject'
    const bucket = self ? after : onTarget
    if (effect.kind === 'status')
      bucket.push(E.status(to, effect.statusId, { turns: effect.turns }))
    else if (effect.kind === 'stage') bucket.push(E.stage(to, [effect.stat], effect.delta))
    else if (effect.kind === 'hp' && effect.percent > 0) {
      bucket.push(E.heal(to, { hp: 'max', of: self ? 'self' : 'subject', percent: effect.percent }))
    } else if (effect.kind === 'hp') {
      bucket.push(E.dmg(to, { hp: 'max', of: 'target', percent: -effect.percent }))
    } else if (effect.kind === 'sta') bucket.push(E.staminaPercent(to, effect.percent))
    else if (effect.kind === 'hold') bucket.push({ do: 'reduceHold', to, turns: effect.turns })
  }
  return { ...(onTarget.length ? { onTarget } : {}), ...(after.length ? { after } : {}) }
}

const GOOD_STATUSES = new Set([
  'invigoratedTemtem',
  'alertedTemtem',
  'regeneratedTemtem',
  'evadingTemtem',
  'immuneTemtem'
])

/** Mọi hiệu ứng đều có lợi (chiêu trạng thái nhắm phe mình). */
function isPositive(effects) {
  const good = (e) =>
    (e.kind === 'stage' && e.delta > 0) ||
    (e.kind === 'status' && GOOD_STATUSES.has(e.statusId)) ||
    ((e.kind === 'hp' || e.kind === 'sta') && e.percent > 0) ||
    e.kind === 'hold'
  return effects.length > 0 && effects.every(good)
}

/** Mục tiêu của gốc → mục tiêu của game (chiêu trạng thái tốt nhắm phe mình). */
function targetOf(technique, effects) {
  const positive = technique.class === 'Status' && isPositive(effects)
  switch (technique.targets) {
    case 'Self':
      return 'self'
    case 'Single Team':
      return positive ? 'allAllies' : 'allEnemies'
    case 'Single Other Target':
    case 'Single Target':
      return positive ? 'ally' : 'enemy'
    case 'All':
      return 'all'
    case 'All Other Temtem':
      return 'allOthers'
    case 'Other Team or Ally':
      return 'foesOrAlly'
    default:
      return 'allEnemies'
  }
}

/** Synergy của gốc → synergy của game: cộng power theo sát thương mới, hiệu ứng trạng thái lên mục tiêu. */
function synergyOf(technique, synergyText, mainEffects) {
  const partner = TYPES[technique.synergy]
  if (!partner) return undefined
  const synergy = { partnerElementIds: [partner] }
  const boosted =
    technique.synergyEffects.find((e) => e.type === 'damage')?.damage ??
    Number(synergyText.match(/damage increases to (\d+)/i)?.[1] ?? 0)
  if (technique.damage > 0 && boosted > technique.damage) {
    synergy.powerBonusPercent = Math.round((boosted / technique.damage - 1) * 100)
  }
  const effects = parseEffects(synergyText).flatMap((effect) => {
    if (effect.who === 'self') {
      return effect.kind === 'stage'
        ? [{ type: 'statStage', params: { who: 'self', stat: effect.stat, delta: effect.delta } }]
        : []
    }
    if (effect.kind === 'status') {
      return [{ type: 'applyStatus', params: { statusId: effect.statusId, turns: effect.turns } }]
    }
    if (effect.kind === 'stage') {
      // "inflicts [def-2] instead" của [def-1]: chỉ phần chênh lệch (bậc gốc đã áp).
      const replaced = /instead|inflicts \[/i.test(synergyText)
        ? (mainEffects.find((e) => e.kind === 'stage' && e.stat === effect.stat)?.delta ?? 0)
        : 0
      const delta = effect.delta - replaced
      return delta === 0
        ? []
        : [{ type: 'statStage', params: { who: 'target', stat: effect.stat, delta } }]
    }
    return []
  })
  if (effects.length) synergy.effects = effects
  return synergy.powerBonusPercent || synergy.effects ? synergy : undefined
}

const spellOnly = (spell) => ({ spell })
const fixed = (amount, category) => ({
  category,
  power: 1,
  fixedDamage: { kind: 'maxHpPercent', percent: amount / EXACT_DAMAGE_PER_PERCENT }
})
const resetStages = { do: 'restoreStages', to: 'subject', all: true }
const clearDrops = { do: 'restoreStages', to: 'subject' }

/**
 * Ca đọc tay: trường thay / thêm cho skill tự dựng (hiệu ứng `spell` ở đây thay hẳn phần đọc tự động).
 * Hiệu ứng có điều kiện dùng `if` của hiệu ứng ngôn ngữ trait (trait-dsl.md).
 */
export const OVERRIDES = {
  // Doomed 5 lượt nhưng Immune 5 lượt (chặn trạng thái mới, gốc dùng để "khóa").
  '5PPEH': spellOnly({
    onTarget: [
      E.status('subject', 'doomedTemtem', { turns: 5 }),
      E.status('subject', 'immuneTemtem', { turns: 5 })
    ]
  }),
  // Gốc: Status class nhưng gây sát thương; quy về đòn đặc biệt 50 power.
  'Ampere Outburst': {
    category: 'special',
    power: 50,
    spell: {
      after: [
        { do: 'reduceHold', to: 'allies', turns: 1 },
        { do: 'reduceHold', to: 'self', turns: 1 }
      ]
    }
  },
  Antitoxins: spellOnly({
    onTarget: [
      {
        ...E.status('subject', 'invigoratedTemtem', { turns: 2 }),
        if: [{ if: 'hasStatus', who: 'target', statusIds: ['poison'] }]
      },
      E.remove('subject', 'debuff', 'poison')
    ]
  }),
  // Sát thương theo công + thủ của quái dùng: công thay bằng trung bình công / thủ (gốc ~ cộng hai phần).
  Autodestruction: { selfFaint: 'always', spell: { attackStat: { stat: 'defense', weight: 50 } } },
  Bamboozle: {},
  Blackhole: spellOnly({ onTarget: [E.cure('subject', 'debuff'), E.cure('subject', 'buff')] }),
  Brace: spellOnly({
    onTarget: [
      {
        ...E.heal('subject', { hp: 'max', of: 'target', percent: 10 }),
        if: [{ if: 'hasStatus', who: 'target', statusIds: ['alertedTemtem'] }]
      },
      E.remove('subject', 'buff', 'alertedTemtem'),
      E.status('subject', 'evadingTemtem', { turns: 2 })
    ]
  }),
  Burrow: spellOnly({
    onTarget: [E.status('subject', 'evadingTemtem', { turns: 4 }), clearDrops]
  }),
  Bush: spellOnly({
    onTarget: [
      E.status('subject', 'regeneratedTemtem', { turns: 1 }),
      E.status('subject', 'evadingTemtem', { turns: 1 })
    ]
  }),
  // Chuỗi như gốc: mục tiêu được chọn rồi 2 quái kế theo chiều kim đồng hồ (kể cả quái dùng), mỗi quái 15%;
  // chỉ có 2 quái trên sân thì mục tiêu đầu 30%.
  'Chain Heal': {
    target: 'ally',
    chain: { steps: 3 },
    spell: {
      onTarget: [
        E.heal('subject', { hp: 'max', of: 'target', percent: 15 }),
        {
          ...E.heal('subject', { hp: 'max', of: 'target', percent: 15 }),
          if: [{ if: 'chainStep', step: 0, maxSize: 2 }]
        }
      ]
    }
  },
  // Chuỗi như gốc: 100% / 70% / 60%, quái chặn được đòn (né, hút, bảo vệ) thì dừng.
  'Chain Lightning': {
    target: 'enemy',
    chain: { steps: 3, damagePercents: [100, 70, 60] },
    spell: {}
  },
  Composure: {
    target: 'all',
    spell: { onTarget: [E.cure('subject', 'debuff'), E.cure('subject', 'buff'), resetStages] }
  },
  Cooperation: spellOnly({
    onTarget: [E.heal('subject', { hp: 'max', of: 'target', percent: 10 })]
  }),
  // Gốc không làm mục tiêu đang ngủ tỉnh; game: sát thương cố định vẫn làm tỉnh (lệch gốc).
  Depress: fixed(120, 'special'),
  'Dim Mak': fixed(130, 'special'),
  Electromagnetism: spellOnly({
    onTarget: [
      E.status('subject', 'trappedTemtem', { turns: 2 }),
      E.stage('subject', ['speed'], -2)
    ],
    after: [E.status('self', 'trappedTemtem', { turns: 2 })]
  }),
  'Double Edge': spellOnly({
    onTarget: [E.stage('subject', ['defense'], 1), E.stage('subject', ['spDefense'], 1)]
  }),
  Execution: spellOnly({
    after: [
      { ...E.stage('self', ['attack', 'spAttack'], 2), if: [{ if: 'fainted', who: 'other' }] }
    ]
  }),
  Extinction: spellOnly({
    onTarget: [
      E.status('subject', 'doomedTemtem', { turns: 3 }),
      E.status('subject', 'burnedTemtem', { turns: 2 })
    ]
  }),
  // Sát thương thêm theo thể lực còn lại của quái dùng (gốc: cộng phần theo STA).
  'Extra Energy Slam': spellOnly({ powerBonus: [{ percent: 1, per: { of: 'stamina' } }] }),
  Gaia: spellOnly({
    onTarget: [
      E.status('subject', 'regeneratedTemtem', { turns: 2 }),
      E.staminaPercent('subject', 100)
    ]
  }),
  Hibernate: spellOnly({
    onTarget: [
      E.heal('subject', { hp: 'max', of: 'target', percent: 35 }),
      E.staminaPercent('subject', 15),
      E.status('subject', 'frozenTemtem', { turns: 3 })
    ]
  }),
  Horror: spellOnly({
    powerBonus: [
      { percent: 100, when: [{ if: 'hasStatus', who: 'target', statusIds: ['asleepTemtem'] }] }
    ]
  }),
  // Gốc: sát thương theo đặc công và tốc độ; game: trung bình hai chỉ số.
  'Hyperkinetic Strike': spellOnly({ attackStat: { stat: 'speed', weight: 50 } }),
  'Jinxed Whisper': {},
  Knockback: { recoilPercent: 30 },
  'Late Torment': spellOnly({
    requires: [{ if: 'hasStatus', who: 'target', statusIds: ['trappedTemtem'] }]
  }),
  Laundry: spellOnly({ onTarget: [E.cure('subject', 'debuff'), E.cure('subject', 'buff')] }),
  Leech: { effects: [{ type: 'drain', params: { percent: 45 } }] },
  'Look out': {
    target: 'allAllies',
    spell: {
      onTarget: [
        E.remove('subject', 'debuff', 'asleepTemtem'),
        E.status('subject', 'alertedTemtem', { turns: 2 })
      ]
    }
  },
  'Madness Buff': spellOnly({
    onTarget: [
      E.dmg('subject', { hp: 'max', of: 'target', percent: 25 }),
      E.stage('subject', ['spAttack'], 4),
      E.stage('subject', ['spDefense'], 4)
    ]
  }),
  Metabolize: {
    target: 'enemy',
    spell: {
      onTarget: [E.remove('subject', 'debuff', 'poison')],
      after: [E.heal('self', { hp: 'max', of: 'self', percent: 20 })]
    }
  },
  Misogi: spellOnly({
    onTarget: [E.cure('subject', 'debuff'), E.cure('subject', 'buff'), clearDrops]
  }),
  'Narcoleptic Hit': spellOnly({ after: [E.status('self', 'asleepTemtem', { turns: 2 })] }),
  'Nightmare Feed': spellOnly({
    requires: [{ if: 'hasStatus', who: 'target', statusIds: ['asleepTemtem'] }],
    onTarget: [E.dmg('subject', { hp: 'max', of: 'target', percent: 30 })],
    after: [E.heal('self', { hp: 'max', of: 'self', percent: 30 })]
  }),
  Nimble: { target: 'ally' },
  Penance: {
    target: 'ally',
    spell: {
      onTarget: [E.stage('subject', ['attack'], 4), E.stage('subject', ['spAttack'], 4)],
      after: [E.dmg('self', { hp: 'max', of: 'self', percent: 100 })]
    }
  },
  Petrify: spellOnly({
    onTarget: [E.status('subject', 'trappedTemtem', { turns: 2 }), { do: 'exhaust', to: 'subject' }]
  }),
  'Psychic Collaborator': spellOnly({ after: [E.stage('self', ['spAttack'], 2)] }),
  'Refreshing Breeze': spellOnly({
    onTarget: [E.cure('subject', 'buff'), E.stage('subject', ['spDefense'], -2)]
  }),
  Rend: { category: 'special', power: 1, fixedDamage: { kind: 'targetHpPercent', percent: 50 } },
  Reset: {
    target: 'enemy',
    spell: { onTarget: [E.cure('subject', 'debuff'), E.cure('subject', 'buff'), resetStages] }
  },
  Restore: {
    target: 'ally',
    spell: {
      onTarget: [E.staminaPercent('subject', 40), E.remove('subject', 'debuff', 'doomedTemtem')]
    }
  },
  Rush: {
    ...fixed(40, 'physical'),
    contact: true,
    spell: { after: [{ do: 'exhaust', to: 'self' }] }
  },
  Sacrifice: {
    target: 'ally',
    spell: {
      onTarget: [
        E.cure('subject', 'debuff'),
        E.stage('subject', ['defense'], 3),
        E.stage('subject', ['spDefense'], 3)
      ],
      after: [E.dmg('self', { hp: 'max', of: 'self', percent: 100 })]
    }
  },
  'Sanative Rain': {
    target: 'all',
    spell: { onTarget: [E.heal('subject', { hp: 'max', of: 'target', percent: 15 })] }
  },
  'Sand Storm': spellOnly({ onTarget: [E.status('subject', 'isolatedTemtem', { turns: 2 })] }),
  'Selfless Ruination': {
    target: 'ally',
    spell: {
      onTarget: [
        E.stage('subject', ['defense'], 2),
        E.stage('subject', ['spDefense'], 2),
        E.status('subject', 'evadingTemtem', { turns: 1 })
      ]
    }
  },
  Strangle: spellOnly({
    onTarget: [{ do: 'exhaust', to: 'subject' }],
    after: [{ do: 'exhaust', to: 'self' }]
  }),
  // Gốc: trên 50% HP thì địch mất 15%, đồng đội hồi 10%; dưới thì ngược lại (10% / 15%).
  'Swarm Aid': {
    target: 'allEnemies',
    spell: {
      onTarget: [
        {
          ...E.dmg('subject', { hp: 'max', of: 'target', percent: 15 }),
          if: [{ if: 'hpAbove', who: 'self', percent: 50 }]
        },
        {
          ...E.dmg('subject', { hp: 'max', of: 'target', percent: 10 }),
          if: [{ if: 'not', condition: { if: 'hpAbove', who: 'self', percent: 50 } }]
        }
      ],
      after: [
        {
          ...E.heal('side', { hp: 'max', of: 'target', percent: 10 }),
          if: [{ if: 'hpAbove', who: 'self', percent: 50 }]
        },
        {
          ...E.heal('side', { hp: 'max', of: 'target', percent: 15 }),
          if: [{ if: 'not', condition: { if: 'hpAbove', who: 'self', percent: 50 } }]
        }
      ]
    }
  },
  "Tortenite's Garden": spellOnly({
    onTarget: [E.status('subject', 'doomedTemtem', { turns: 4 })],
    after: [E.heal('self', { hp: 'max', of: 'self', percent: 10 })]
  }),
  Trample: spellOnly({
    after: [
      { ...E.stage('self', ['attack', 'spAttack'], 3), if: [{ if: 'fainted', who: 'other' }] }
    ]
  }),
  'Transient Echo': spellOnly({ after: [{ do: 'reduceHold', to: 'self', turns: 1 }] }),
  'Turbo Charge': {
    target: 'allAllies',
    spell: {
      onTarget: [{ do: 'reduceHold', to: 'subject', turns: 1 }, E.stage('subject', ['speed'], 1)]
    }
  },
  Untangle: {
    target: 'ally',
    spell: {
      onTarget: [
        {
          ...E.stage('subject', ['defense'], 1),
          if: [{ if: 'hasStatus', who: 'target', statusIds: ['trappedTemtem'] }]
        },
        {
          ...E.stage('subject', ['spDefense'], 2),
          if: [{ if: 'hasStatus', who: 'target', statusIds: ['trappedTemtem'] }]
        },
        E.remove('subject', 'debuff', 'trappedTemtem')
      ]
    }
  },
  'Venom Spread': spellOnly({
    requires: [{ if: 'hasStatus', who: 'target', statusIds: ['poison'] }]
  }),
  'Willpower Drain': spellOnly({ onTarget: [E.drainStamina('self', 'subject', 25)] }),
  'Winter Call': spellOnly({
    onTarget: [E.status('subject', 'frozenTemtem', { turns: 2 })],
    after: [E.stage('self', ['attack'], 3)]
  })
}

/** Chiêu không nhập (không quy đổi được). */
export const REJECTED = {}

/** Một chiêu gốc → skill của game (chưa có id). */
export function convertTechnique(technique) {
  const text = cleanText(technique.wiki?.effect || technique.effectText, technique.name)
  const [main, ...rest] = text.split(/\b(?:If|When) used with\b/)
  const synergyText = rest.join(' ')
  const effects = parseEffects(main)
  const override = OVERRIDES[technique.name] ?? {}
  const target = override.target ?? targetOf(technique, effects)
  const damaging = technique.damage > 0 && technique.class !== 'Status'
  const category = damaging ? technique.class.toLowerCase() : 'status'
  const parsedSpell = toSpell(
    effects,
    target === 'self' || (!damaging && target !== 'enemy' && target !== 'allEnemies')
  )
  const spell = override.spell ?? parsedSpell
  const synergy = synergyOf(technique, synergyText, effects)
  const rest2 = { ...override }
  delete rest2.spell
  delete rest2.target
  return {
    elementId: TYPES[technique.type],
    category,
    power: damaging ? technique.damage : 0,
    accuracy: 100,
    target,
    effects: [],
    priority: PRIORITY[technique.priority],
    staminaCost: technique.staminaCost,
    ...(technique.hold > 0 ? { hold: technique.hold } : {}),
    ...(category === 'physical' ? { contact: true } : {}),
    // Gốc không giảm sát thương khi đánh nhiều mục tiêu.
    ...(damaging ? { fullSpread: true } : {}),
    ...(synergy ? { synergy } : {}),
    ...rest2,
    ...(Object.keys(spell).length ? { spell } : {})
  }
}
