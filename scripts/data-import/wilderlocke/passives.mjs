/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi 75 passive WILDERLOCKE sang trait, số theo PassivesDB của game gốc. Khóa là số PassiveId. Quái game
// gốc luôn 100 HP nên sát thương phẳng N = N% max HP; stack chỉ số / 2,5 = bậc trận. Luật ở
// content-sources-real.md mục "WILDERLOCKE".

import { C, E, cnt, h, immune, taken, trig } from '../siralim-spells/sdsl.mjs'

const dmg = (percent, ...when) =>
  h('damageDealtModifier', { percent, ...(when.length ? { when } : {}) })
const weather = (...fieldIds) => ({ if: 'fieldActive', layer: 'weather', fieldIds })
const element = (...ids) => C.skillElement(ids)
const contact = { if: 'moveFlag', flags: ['contact'] }
const hitBy = (elementId, ...effects) =>
  trig('damaged', 'self', effects, { when: [element(elementId)] })
const stage = (to, stat, delta) => E.stage(to, Array.isArray(stat) ? stat : [stat], delta)
const onEntry = (...effects) => trig('entry', 'self', effects)
const place = (fieldId) => onEntry({ do: 'placeField', fieldId })
const endTurn = (...effects) => trig('turnEnd', 'self', effects)
const halved = (...elementIds) => taken(-50, { when: [element(...elementIds)] })
const noField = (...fieldIds) => h('fieldDamageImmunity', { fieldIds })
const foeHit = (percent) => ({ hp: 'max', of: 'other', percent })
const ownHit = (percent) => ({ hp: 'max', of: 'self', percent })
/** Mỗi N chiêu hệ X đã dùng (bản ghi cập nhật trước khi sự kiện chạy). */
const everyElementUse = (elementId, every) => ({
  if: 'counterMultipleOf',
  counter: cnt('skillUsesOfElement', { elementIds: [elementId] }),
  every
})
const onOwnSkill = (when, ...effects) => [
  trig('attack', 'self', effects, { when }),
  trig('cast', 'self', effects, { when })
]

export const PASSIVES = {
  1: [trig('damaged', 'self', stage('side', 'spDefense', 1), { when: [C.dmgAbove(15)] })],
  2: [hitBy('electric', stage('side', 'speed', 2))],
  3: [immune('sleep', 'sleeping', 'drowsy')],
  4: [
    trig('attacked', 'self', E.status('other', 'poison'), { when: [contact] }),
    trig('attack', 'self', E.status('self', 'poison'), { when: [contact] })
  ],
  5: [onEntry(stage('foes', 'attack', -1))],
  6: [dmg(40, C.hpBelow('self', 30))],
  7: [taken(-20, { when: [weather('sandstorm')] }), noField('sandstorm')],
  8: [onEntry(E.status('self', 'prioPlus'))],
  9: [onEntry(E.status('self', 'taunting'))],
  10: [place('sun')],
  11: [dmg(20, element('fire'))],
  12: [trig('cast', 'self', E.status('self', 'anticipating'))],
  13: [onEntry(stage('foes', 'spDefense', -1), stage('allies', 'spDefense', -1))],
  14: [onEntry(stage('foes', 'spDefense', -1))],
  15: [h('statusHeals', { statusIds: ['poison', 'badPoison'], percent: 100 })],
  16: [
    dmg(20, element('ground')),
    h('convertSkillElement', { fromElementIds: ['normal'], toElementId: 'ground', percent: 0 })
  ],
  17: [endTurn({ ...E.dmg('foes', foeHit(8)), if: [C.has('target', ['sleep', 'sleeping'])] })],
  18: [endTurn({ ...E.dmg('foes', foeHit(4)), if: [weather('snow')] })],
  19: [hitBy('flying', stage('self', 'speed', 1)), halved('flying')],
  20: [place('rain')],
  21: [place('sandstorm')],
  22: [endTurn({ ...stage('self', 'spAttack', 1), if: [weather('sun')] })],
  23: [trig('attacked', 'self', stage('other', 'speed', -1), { when: [contact] })],
  24: [h('stageMultiplier', { gain: 0, loss: 0 })],
  25: [halved('ice'), noField('snow')],
  26: [
    taken(-25, { when: [element('normal')] }),
    noField('sandstorm'),
    h('statModifier', { percent: { speed: -50 } })
  ],
  27: [trig('attacked', 'self', E.dmg('other', { event: true, percent: 30 }), { when: [contact] })],
  28: [h('recoilImmunity', {})],
  // Hồi máu khi di chuyển của game gốc (4 HP) quy về hồi khi rời sân.
  29: [h('healOnLeave', { percent: 4 })],
  30: [h('statLowerImmunity', { stats: ['attack', 'spAttack'] })],
  31: [h('statLowerImmunity', { stats: ['defense', 'spDefense'] })],
  32: [dmg(50, { if: 'skillPriority', min: 1 })],
  33: [endTurn({ ...E.dmg('foes', foeHit(6)), if: [weather('rain')] })],
  34: [
    dmg(20, { if: 'skillSameElement', value: true }),
    dmg(-30, { if: 'skillSameElement', value: false })
  ],
  35: [h('damageCap', { percent: 40 })],
  // Power tối đa 11 của game gốc × 5.
  36: [h('conditionalPriority', { amount: 1, maxPower: 55 })],
  37: [hitBy('water', stage('self', ['attack', 'speed'], 1))],
  38: [h('copiesStages', { stats: ['spAttack'] })],
  39: [h('debuffImmunity', { when: [weather('rain')] })],
  40: [dmg(20, element('flying'))],
  41: [hitBy('flying', stage('self', 'spAttack', 1))],
  // Heatwave dài gấp đôi: sun 5 lượt thành 10; cháy Flora 6%.
  42: [
    h('fieldDuration', { fieldIds: ['sun'], turns: 10 }),
    endTurn({ ...E.dmg('foes', foeHit(6)), if: [weather('sun'), C.el('target', ['grass'])] })
  ],
  43: [immune('tormented'), h('abilityFlag', { flag: 'ignoresRedirect' })],
  44: [h('statLowerImmunity', { stats: ['speed'] }), immune('cantEscape')],
  45: [immune('poison', 'badPoison', 'burn', 'frostbite')],
  46: [h('inflictPotency', { statusIds: ['poison', 'badPoison'], percent: 50 })],
  47: [h('effectiveness', { mode: 'neutral' })],
  48: [dmg(40, C.has('other', ['dazed']))],
  // Power tối đa 12 của game gốc × 5.
  49: [dmg(50, { if: 'skillPowerAtMost', power: 60 })],
  50: [h('absorbElement', { elementIds: ['electric'], healPercent: 25 })],
  51: [onEntry(stage('foes', 'spAttack', -1), stage('allies', 'spAttack', -1))],
  52: [place('snow')],
  // Giảm 3 sát thương phẳng của game gốc ≈ −15% đòn thường (20 HP).
  53: [
    taken(100, { when: [element('fire')] }),
    taken(-15, { when: [{ if: 'not', condition: element('fire') }] })
  ],
  54: [
    h('abilityFlag', { flag: 'keepsTargetAsleep' }),
    dmg(-50, C.has('other', ['sleep', 'sleeping']))
  ],
  55: onOwnSkill([element('fire'), everyElementUse('fire', 3)], {
    do: 'placeField',
    fieldId: 'sun'
  }),
  56: [dmg(30, element('ground')), noField('sandstorm')],
  57: [h('abilityFlag', { flag: 'reflectsAllStages' })],
  58: [h('statWhen', { percent: { speed: 80 }, when: [weather('snow')] })],
  59: [dmg(30), endTurn(E.dmg('self', ownHit(2)))],
  60: [h('abilityFlag', { flag: 'stagesUnremovable' })],
  61: [trig('damaged', 'self', E.status('other', 'dazed'), { when: [C.dmgAbove(25)] })],
  62: [
    trig(
      'attack',
      'self',
      { do: 'removeStages', to: 'other', sign: 'positive', stats: ['defense'], amount: 2 },
      { when: [contact] }
    )
  ],
  63: onOwnSkill([element('ground')], stage('self', 'spDefense', 1)),
  64: [onEntry({ do: 'clearFields', layers: ['weather'] })],
  65: [
    h('priorityModifier', { skillCategory: 'status', amount: 1 }),
    h('damageTakenModifier', { percent: 10 })
  ],
  66: [dmg(30, C.atLeast(cnt('traitOnSide', { traitId: 'swarmWilderlocke' }), 1))],
  67: [h('stageMultiplier', { gain: -1, loss: -1 })],
  68: [
    dmg(-30),
    h('aura', { scope: 'allies', hooks: [h('damageDealtModifier', { percent: 20 })] })
  ],
  69: onOwnSkill([element('grass'), everyElementUse('grass', 4)], E.dmg('foes', foeHit(10))),
  70: [dmg(30), onEntry(E.status('self', 'tormented'))],
  71: [dmg(40, { if: 'counterMultipleOf', counter: cnt('turnsTaken', { bonus: 1 }), every: 4 })],
  72: [taken(-20, { when: [{ if: 'hitThisTurn', who: 'self' }] })],
  73: [
    endTurn(stage('self', 'spAttack', 1)),
    trig('damaged', 'self', {
      do: 'removeStages',
      to: 'self',
      sign: 'positive',
      stats: ['spAttack']
    })
  ],
  74: [h('abilityFlag', { flag: 'defenseStagesToAttack' })],
  75: [h('stageMultiplier', { gain: 2, loss: 2 })]
}
/** Passive 74 chưa có chữ trong bảng ngôn ngữ của game gốc: tên theo mã (_074savage). */
export const PASSIVE_NAMES = { 74: 'Savage' }
export const REJECTED_PASSIVES = {}
