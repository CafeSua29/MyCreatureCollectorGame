/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi chiêu WILDERLOCKE (bản demo) sang skill của game. Phần chung tự dựng từ dữ liệu của game; chiêu
// có `specificEffect` (hiệu ứng viết riêng trong code game gốc) quy đổi tay ở SPECIAL theo số thật trong
// MoveSpecificEffectDB của game. Quy ước, chỗ lệch: mục "WILDERLOCKE" ở docs/rules/content-sources-real.md.
// - Power × 5 (power gốc 5–32, chiêu thường 12 ≈ 60 của game này). Game gốc không có trượt: accuracy 100.
// - Quái game gốc luôn 100 HP: sát thương phẳng N của game gốc = N% max HP.
// - Stack chỉ số (5 stack = ×2, 10 stack = ×3, mất 1 stack mỗi lượt) quy về bậc trận: stack / 2,5, tối thiểu 1.

import { C, E, cnt, onlyIf } from '../siralim-spells/sdsl.mjs'

const POWER_SCALE = 5
const STACKS_PER_STAGE = 2.5
const MAX_STAGE = 4
export const ELEMENTS = {
  neutral: 'normal',
  pyro: 'fire',
  aqua: 'water',
  terra: 'ground',
  flora: 'grass',
  thunder: 'electric',
  frost: 'ice',
  wind: 'flying'
}
/** Trạng thái thay đổi chỉ số → [chỉ số, chiều]. */
const STAT_STATUS = {
  physatk_plus: ['attack', 1],
  physatk_minus: ['attack', -1],
  speatk_plus: ['spAttack', 1],
  speatk_minus: ['spAttack', -1],
  physdef_plus: ['defense', 1],
  physdef_minus: ['defense', -1],
  spedef_plus: ['spDefense', 1],
  spedef_minus: ['spDefense', -1],
  speed_plus: ['speed', 1],
  speed_minus: ['speed', -1]
}
/** Trạng thái của game gốc → trạng thái của game (mới thêm ở wilderlocke-import.mjs hoặc có sẵn). */
const STATUS = {
  poison: 'poison',
  burn: 'burn',
  sleep: 'sleep',
  dazed: 'dazed',
  frostbite: 'frostbite',
  root: 'cantEscape',
  disoriented: 'tormented',
  prio_minus: 'snared',
  redirection: 'taunting',
  prio_plus: 'prioPlus',
  move_liquefy: 'liquefied',
  move_jinx: 'jinxed',
  move_overgrowth: 'overgrown',
  move_oilslick: 'oilSlick',
  move_drench: 'drenched',
  move_featherguard: 'featherGuard',
  move_updraft: 'updraft',
  move_caltrops: 'caltrops',
  move_fog: 'fogged',
  move_fertilize: 'fertilized',
  move_lightup: 'lightUp',
  move_bloodlust: 'bloodlust',
  move_assist: 'assisted'
}
const WEATHER = { heatwave: 'sun', rain: 'rain', sandstorm: 'sandstorm', snow: 'snow' }
const stages = (count) => Math.min(MAX_STAGE, Math.max(1, Math.round(count / STACKS_PER_STAGE)))

const inWeather = (...fieldIds) => ({ if: 'fieldActive', layer: 'weather', fieldIds })
const has = (...statusIds) => C.has('target', statusIds)
const firstTurn = C.below(cnt('turnsOnField'), 2)
const lastCategory = (...categories) => ({ if: 'lastSkillCategory', who: 'self', categories })
const bonus = (when, percent) => ({ percent, when: [when] })
const spell = (part, extra = {}) => ({ spell: part, ...extra })
const onTarget = (...effects) => spell({ onTarget: effects })
const after = (...effects) => spell({ after: effects })
const stage = (to, stat, delta) => E.stage(to, [stat], delta)
const onTargetUses = cnt('skillUsesOnTarget', { who: 'self' })
/** Lần dùng hiện tại (bản ghi tăng sau khi dùng nên cộng 1). */
const thisUse = cnt('skillUses', { bonus: 1 })
const everyUse = (every) => ({ if: 'counterMultipleOf', counter: thisUse, every })

const switchOut = (params) => ({ effects: [{ type: 'switchOut', params }] })

/** Chiêu có hiệu ứng riêng: phần thêm vào skill tự dựng (số theo MoveSpecificEffectDB). */
const SPECIAL = {
  3: spell({
    powerBonus: [{ percent: 20, per: cnt('knownSkillsOfElement', { elementIds: ['electric'] }) }]
  }),
  6: spell({ powerBonus: [bonus(has('dazed'), 50)] }),
  12: { damageFloorPercent: 10 },
  17: after(onlyIf(E.dmg('otherFoes', { event: true, percent: 100 }), inWeather('rain'))),
  20: { damageCapPercent: 30 },
  23: after({ do: 'removeStages', to: 'other', sign: 'positive', amount: 1 }),
  24: after(onlyIf(E.status('other', 'burn'), { if: 'not', condition: C.dmgAbove(9) })),
  25: after({
    do: 'transferStages',
    from: 'self',
    to: 'other',
    sign: 'negative',
    stats: ['defense', 'spDefense']
  }),
  29: spell({ powerBonus: [bonus(inWeather('sun'), 50)] }),
  32: spell({ onTarget: [stage('subject', 'attack', -2)], after: [stage('self', 'attack', 2)] }),
  34: after(E.dmg('otherFoes', { event: true, percent: 30 })),
  35: { attackFrom: { who: 'self', stat: 'speed' } },
  36: spell({ requires: [C.below(onTargetUses, 1)] }),
  37: { charge: { rule: 'firstUse' } },
  43: after(E.status('self', 'tormented')),
  46: onTarget(E.cure('subject', 'debuff')),
  47: { fixedDamage: { kind: 'maxHpPercent', percent: 16 } },
  48: spell({ powerBonus: [{ percent: 50, per: onTargetUses }] }),
  54: spell({ powerBonus: [bonus(everyUse(3), 100)] }),
  58: spell({ powerBonus: [bonus(lastCategory('status'), 100)] }),
  64: onTarget(
    onlyIf(E.status('subject', 'dazed'), has('cantEscape')),
    E.remove('subject', 'debuff', 'cantEscape')
  ),
  66: spell({ powerBonus: [bonus(lastCategory('special'), 60)] }),
  73: after(onlyIf(E.status('other', 'dazed'), { if: 'hpFellBelow', who: 'other', percent: 50 })),
  74: { hold: 3 },
  80: spell({
    powerBonus: [{ percent: -50, when: [{ if: 'not', condition: { if: 'superEffective' } }] }]
  }),
  83: { effectiveness: { against: { flying: 2 } } },
  87: onTarget(E.stage('subject', 'highest', 1)),
  88: { ignoresTargetStages: true },
  89: onTarget(stage('subject', 'spDefense', -1)),
  93: {
    fieldModifiers: [
      { fieldId: 'sun', elementId: 'fire' },
      { fieldId: 'rain', elementId: 'water' },
      { fieldId: 'sandstorm', elementId: 'ground' },
      { fieldId: 'snow', elementId: 'ice' }
    ]
  },
  102: onTarget(stage('subject', 'defense', 2)),
  104: spell({ powerBonus: [bonus({ if: 'actedThisTurn', who: 'target', value: false }, 30)] }),
  // Máu mục tiêu càng thấp càng đau, tối đa ×2.
  106: spell({ powerBonus: [{ percent: 1, per: cnt('missingHpPercent', { who: 'target' }) }] }),
  109: spell({ powerBonus: [bonus(has('poison', 'badPoison'), 50)] }),
  111: spell({ powerBonus: [bonus({ if: 'actedThisTurn', who: 'target', value: true }, 30)] }),
  116: spell({
    powerBonus: [bonus(inWeather('sun', 'rain', 'sandstorm', 'snow'), 60)],
    after: [{ do: 'clearFields', layers: ['weather'] }]
  }),
  118: { alternateUse: { elementId: 'ground' } },
  126: { fieldModifiers: [{ fieldId: 'sandstorm', priority: 1 }] },
  130: { alternateUse: { category: 'physical' } },
  132: spell({ powerBonus: [{ percent: 29, per: cnt('skillUses', { max: 5 }) }] }),
  133: { effectiveness: { against: { ground: 2 } } },
  137: onTarget({ do: 'amplifyStages', to: 'subject', amount: 1 }),
  142: { charge: { rule: 'afterFirstUse' } },
  // Số đòn theo máu còn lại của quái dùng (game gốc: ≤ 25 HP 4 đòn, ≤ 50 3 đòn, ≤ 75 2 đòn).
  145: {
    hitsByHp: [
      { atOrBelowPercent: 25, hits: 4 },
      { atOrBelowPercent: 50, hits: 3 },
      { atOrBelowPercent: 75, hits: 2 }
    ]
  },
  147: {
    targetsHighestHpFoe: true,
    spell: { requires: [C.atLeast(cnt('alliesOnField', { who: 'target' }), 1)] }
  },
  149: { maxUsesPerBattle: 3 },
  154: onTarget(E.cure('subject', 'debuff'), E.cure('subject', 'buff')),
  156: { effectiveness: { noResist: true } },
  158: { attackFromAlly: 'spAttack' },
  // Đòn vào quái đứng đối diện (cùng chỉ số ô) ×1,5.
  160: spell({ powerBonus: [bonus({ if: 'facing', who: 'target' }, 50)] }),
  161: spell({ powerBonus: [bonus(C.hpAbove('target', 99), 80)] }),
  162: spell({
    powerBonus: [bonus(has('poison', 'badPoison'), 50)],
    onTarget: [E.remove('subject', 'debuff', 'poison', 'badPoison')]
  }),
  163: spell({ powerBonus: [bonus(C.atLeast(cnt('stageTotal', { who: 'target' }), 1), 40)] }),
  164: { attackFrom: { who: 'self', stat: 'defense' } },
  // Quái vào thay nhận Redirection 1 lượt (Diversion) / +4 stack SpeAtk (Magnet Swap).
  168: switchOut({ incomingEffects: [E.status('self', 'taunting', { turns: 1 })] }),
  169: switchOut({ incomingEffects: [stage('self', 'spAttack', stages(4))] }),
  // Chỉ rút về khi đòn bị kháng.
  170: switchOut({ onlyIfResisted: true }),
  171: onTarget({ do: 'invertStages', to: 'subject' }),
  172: { firstTurnOnly: true },
  173: spell({ powerBonus: [bonus(C.count('self', 'debuff', 1), 100)] }),
  175: { maxUsesPerBattle: 1 },
  176: onTarget(onlyIf(E.status('subject', 'frostbite'), firstTurn)),
  177: onTarget(onlyIf(E.status('subject', 'dazed'), everyUse(4))),
  178: spell({ powerBonus: [bonus(firstTurn, 100)] }),
  179: { effectiveness: { against: { normal: 2 } } },
  180: after(onlyIf(stage('self', 'attack', 2), { if: 'fainted', who: 'other' })),
  182: onTarget(onlyIf(E.status('subject', 'poison'), C.lacks('target', ['poison', 'badPoison']))),
  183: { doublesAttackStage: true },
  184: spell({
    powerBonus: [{ percent: -20, per: cnt('skillUsesOnTarget', { who: 'self', max: 3 }) }]
  })
}
/** Chỉ chiêu thử của game gốc. */
export const REJECTED = { 0: 'chiêu thử của game gốc' }
/** Mục tiêu đặt tay cho chiêu trạng thái ô "Any" / cả phe (theo tác dụng thường dùng). */
const TARGET_OVERRIDE = {
  18: 'enemy',
  45: 'enemy',
  65: 'allEnemies',
  71: 'allEnemies',
  78: 'enemy',
  89: 'enemy',
  98: 'allAllies',
  114: 'allEnemies',
  115: 'allEnemies',
  125: 'ally',
  131: 'allEnemies',
  134: 'self',
  136: 'enemy',
  157: 'self'
}

function targetOf(move, enums, isDebuff) {
  if (TARGET_OVERRIDE[move.id]) return TARGET_OVERRIDE[move.id]
  const name = enums.MoveTarget[move.target]
  switch (name) {
    case 'AnyOther':
    case 'AnyFoe':
      return 'enemy'
    case 'BothFoes':
    case 'EveryoneElse':
      return 'allEnemies'
    case 'SelfAndAllyOrBothFoes':
      return move.power > 0 || isDebuff ? 'allEnemies' : 'allAllies'
    case 'SelfAndAlly':
      return 'allAllies'
    case 'Self':
    case 'Everyone':
    case 'None':
      return 'self'
    case 'Ally':
    case 'SelfOrAlly':
      return 'ally'
    case 'Any':
      return isDebuff || move.power > 0 ? 'enemy' : 'self'
    default:
      throw new Error(`Mục tiêu lạ ${name} của chiêu ${move.id}`)
  }
}

/** Skill của game từ một chiêu của game gốc (chưa có id). */
export function convertMove(move, enums) {
  const statusName = (id) => enums.StatusID[id]
  const parts = { onTarget: [], after: [] }
  let isDebuff = false
  let usesCharge = false
  for (const effect of move.effects) {
    const name = statusName(effect.status)
    if (effect.weather) {
      parts.after.push({ do: 'placeField', fieldId: WEATHER[statusName(effect.weather)] })
    }
    if (!effect.status) continue
    if (name === 'chargeup') {
      usesCharge = true
      continue
    }
    const self = enums.EffectTarget[effect.effectTarget] === 'Self'
    const to = self ? 'self' : 'subject'
    const bucket = self ? parts.after : parts.onTarget
    if (STAT_STATUS[name]) {
      const [stat, sign] = STAT_STATUS[name]
      bucket.push(stage(to, stat, sign * stages(effect.statusStacks)))
      if (!self && sign < 0) isDebuff = true
    } else if (STATUS[name]) {
      bucket.push(E.status(to, STATUS[name]))
      if (!self) isDebuff = true
    }
  }
  const special = SPECIAL[move.id] ?? {}
  const flags = move.flags.map((flag) => enums.MoveFlag[flag])
  const moveFlags = flags.flatMap((flag) =>
    flag === 'Biting'
      ? ['bite']
      : flag === 'Sound'
        ? ['sound']
        : flag === 'Slicing'
          ? ['slicing']
          : []
  )
  const mergedSpell = {
    ...special.spell,
    onTarget: [...parts.onTarget, ...(special.spell?.onTarget ?? [])],
    after: [...parts.after, ...(special.spell?.after ?? [])]
  }
  for (const key of ['onTarget', 'after']) {
    if (mergedSpell[key].length === 0) delete mergedSpell[key]
  }
  const rest = { ...special }
  delete rest.spell
  return {
    elementId: ELEMENTS[enums.MonsterType[move.type]],
    category: ['physical', 'special', 'status'][move.category],
    power: move.power * POWER_SCALE,
    accuracy: 100,
    target: targetOf(move, enums, isDebuff),
    effects: move.isSwitchgMove ? [{ type: 'switchOut', params: {} }] : [],
    priority: move.priority,
    ...(move.nbrHits > 1 ? { hits: { min: move.nbrHits, max: move.nbrHits } } : {}),
    ...(flags.includes('Contact') ? { contact: true } : {}),
    ...(moveFlags.length ? { moveFlags } : {}),
    ...(move.percentRecoilDmg ? { recoilPercent: move.percentRecoilDmg } : {}),
    ...(move.flatRecoilDmg ? { selfDamagePercent: move.flatRecoilDmg } : {}),
    ...(usesCharge ? { charge: {} } : {}),
    ...rest,
    ...(Object.keys(mergedSpell).length ? { spell: mergedSpell } : {})
  }
}
