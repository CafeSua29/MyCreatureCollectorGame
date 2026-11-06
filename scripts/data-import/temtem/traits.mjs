/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi 193 trait Temtem sang hook trait của game (content-sources-real.md mục "Temtem: chiêu, trait"), số
// theo wiki temtem.wiki.gg (bậc chỉ số `{{statchange}}`, %). Quy ước: "đầu lượt" của gốc = cuối lượt của game;
// "đồng đội" = cả phe trừ quái mang (aura `allies`); "cùng dòng tiến hóa" = cùng race (chuỗi Temtem chung race).
// Trait không quy đổi được ghi REJECT(lý do) (hiện không còn mục nào).

import { C, E, h, immune, regen, taken, trig } from '../siralim-spells/sdsl.mjs'
import { NEGATIVE } from './conditions.mjs'

const T = {
  wind: 'flying',
  earth: 'ground',
  water: 'water',
  fire: 'fire',
  nature: 'grass',
  electric: 'electric',
  mental: 'psychic',
  digital: 'steel',
  melee: 'fighting',
  crystal: 'rock',
  toxic: 'poison',
  neutral: 'normal'
}
const el = (...names) => C.skillElement(names.map((name) => T[name]))
const cat = (...categories) => C.cat(...categories)
const offensive = cat('physical', 'special')
const st = (to, stats, delta) => E.stage(to, stats, delta)
const give = (to, statusId, turns) => E.status(to, statusId, { turns })
const healOf = (to, percent) => E.heal(to, { hp: 'max', of: 'target', percent })
const lose = (to, percent) => E.dmg(to, { hp: 'max', of: 'target', percent })
const dmg = (percent, ...when) =>
  h('damageDealtModifier', { percent, ...(when.length ? { when } : {}) })
const takenWhen = (percent, ...when) => taken(percent, { when })
const allies = (...hooks) => h('aura', { scope: 'allies', hooks })
const side = (...hooks) => h('aura', { scope: 'side', hooks })
const foes = (...hooks) => h('aura', { scope: 'foes', hooks })
const onSelf = (on, effects, opts) => trig(on, 'self', effects, opts)
/** Dùng skill bất kỳ (sự kiện attack = đòn vật lý, cast = đặc biệt / trạng thái). */
const onUse = (effects, opts = {}) => [
  trig('attack', 'self', effects, opts),
  trig('cast', 'self', effects, opts)
]
/** Bị trúng skill của địch (đòn gây sát thương; damaged = mất máu vì skill). */
const onHit = (effects, opts = {}) => onSelf('damaged', effects, opts)
const once = { oncePerBattle: true }
const flag = (name) => h('abilityFlag', { flag: name })
const costPercent = (percent, extra = {}) => h('staminaCostPercent', { percent, ...extra })
const block = (...statusIds) => immune(...statusIds)
const sameTypeAlly = C.atLeast({ of: 'sameElementOnSide' }, 2)
const sameLineAlly = C.atLeast({ of: 'sameRaceOnSide' }, 2)
const hasNegative = C.count('target', 'debuff', 1)
const absorb = (element) => h('absorbElement', { elementIds: [T[element]], healPercent: 25 })
const STATUS_TEMTEM = NEGATIVE.filter((id) => id !== 'doomedTemtem')

export const TRAITS = {
  // Đổi hệ phụ theo chiêu đầu tiên nhắm vào: game đổi hệ theo skill của đòn (một lần mỗi trận).
  Adaptive: [
    onSelf(
      'damaged',
      [{ do: 'identity', to: 'self', elementFromSkill: true }, st('self', ['spAttack'], 1)],
      once
    )
  ],
  Aerobic: onUse([st('self', ['speed'], 1), st('self', ['spDefense'], -2)], {
    when: [el('wind'), offensive]
  }),
  Aggressor: [onSelf('entry', [st('self', ['attack'], 1), st('self', ['defense'], -1)])],
  'Air Specialist': [dmg(15, el('wind'))],
  Amphibian: [
    onSelf('damaged', [st('self', ['speed'], 1), st('self', ['attack'], 2)], {
      when: [el('water')]
    })
  ],
  Anaerobic: onUse([st('self', ['spDefense'], 1), st('self', ['spAttack'], -1)], {
    when: [el('toxic'), offensive]
  }),
  Antibodies: [onHit([st('self', ['defense', 'spDefense'], 2)], { when: [el('toxic')] })],
  Apothecary: [
    trig('cast', 'self', [give('other', 'poison', 1)], {
      when: [cat('special'), C.notSelf('other')]
    })
  ],
  'Arcane Wrap': [takenWhen(-20, cat('special'))],
  // Gốc đổi hệ phụ theo chiêu sắp dùng: game đổi hệ theo skill vừa dùng (như Protean).
  'Attack T': onUse([{ do: 'identity', to: 'self', elementFromSkill: true }]),
  Autotomy: [onSelf('entry', [give('self', 'evadingTemtem', 2)], once)],
  Avenger: [trig('faint', 'allies', [st('self', ['speed', 'spAttack'], 2)])],
  Backhanded: [
    trig('cast', 'self', [give('self', 'regeneratedTemtem', 1)], { when: [cat('status')] })
  ],
  Benefactor: [trig('damaged', 'allies', [healOf('subject', 8)])],
  'Bird Season': [dmg(100, el('wind'), C.el('target', [T.wind]))],
  'Body Stretch': [onSelf('rest', [healOf('self', 7), give('self', 'regeneratedTemtem', 1)])],
  'Book Lungs': [takenWhen(-50, el('water'))],
  Botanist: [dmg(15, el('nature'))],
  Botanophobia: [takenWhen(50, el('nature'))],
  Brawny: [dmg(20, cat('physical'))],
  Bruiser: [dmg(15, el('melee'))],
  Brumation: [
    onSelf('rest', [st('self', ['defense'], 2), { do: 'reduceHold', to: 'self', turns: 1 }])
  ],
  Bully: [dmg(25, hasNegative)],
  // Vô hiệu đồ của mục tiêu tới hết trận → Seized dài (gốc: cả trận).
  Burglar: onUse([give('other', 'seizedTemtem', 99)], {
    when: [C.has('target', ['asleepTemtem', 'exhaustedTemtem'])]
  }),
  Caffeinated: [block('asleepTemtem')],
  Callosity: [onHit([st('self', ['defense'], 1)], { when: [cat('physical')] })],
  Camaraderie: [takenWhen(-50, sameLineAlly)],
  Camouflage: [onHit([give('self', 'evadingTemtem', 2)], { when: [cat('physical')] })],
  Channeler: [dmg(25, cat('special'))],
  Cobweb: onUse([
    { ...give('other', 'poison', 2), if: [C.has('target', ['trappedTemtem'])] },
    give('other', 'trappedTemtem', 2)
  ]),
  // Gốc: chặn Cold / Frozen rồi tặng Regenerated 1 lượt; game không có sự kiện "bị chặn" nên chỉ chặn.
  'Cold-Blooded': [block('coldTemtem', 'frozenTemtem')],
  // Cold thành Frozen (Frozen cùng nhóm nên xóa Cold); thời hạn theo mặc định của Frozen.
  'Cold-Natured': [
    onSelf('statusGained', [E.status('self', 'frozenTemtem')], { statusIds: ['coldTemtem'] })
  ],
  Comebacker: [dmg(32, { if: 'hitThisTurn', who: 'self', by: 'target' })],
  'Common Factor': [
    onSelf('entry', [give('foes', 'nullifiedTemtem', 1), give('side', 'nullifiedTemtem', 1)])
  ],
  Confident: onUse([st('self', ['speed'], 2)], {
    when: [{ if: 'not', condition: { if: 'notVeryEffective' } }, offensive]
  }),
  Confined: [
    onSelf('statusGained', [st('self', ['defense', 'spDefense'], 1)], {
      statusIds: ['trappedTemtem']
    })
  ],
  Contagious: [trig('leave', 'foes', [give('subject', 'poison', 1)])],
  Contemplation: [onSelf('rest', [st('self', ['attack'], 2), st('self', ['speed'], 1)], once)],
  "Coward's Rest": [
    onSelf('rest', [give('self', 'evadingTemtem', 2), give('self', 'invigoratedTemtem', 2)])
  ],
  'Deceit Aura': [h('invertsPriority', { exceptAtLeast: 3 })],
  Defuser: [trig('attack', 'self', [give('other', 'seizedTemtem', 2)])],
  Demoralize: [onSelf('entry', [st('foes', ['speed'], -1)])],
  Determined: [h('stageMultiplier', { loss: 0 })],
  'Digi-Protection': [takenWhen(-75, el('digital')), allies(takenWhen(-30, el('digital')))],
  Disgrace: [trig('leave', 'foes', [st('subject', ['defense', 'spDefense'], -1)])],
  'Dozing Hit': onUse([give('other', 'asleepTemtem', 1)], {
    when: [{ if: 'not', condition: { if: 'notVeryEffective' } }, offensive]
  }),
  'Dreaded Alarm': [
    trig('statusGained', 'foes', [lose('subject', 8)], { statusIds: ['alertedTemtem'] })
  ],
  Earthbound: onUse([st('self', ['defense'], 1)], { when: [el('earth')] }),
  'Effective Denial': [takenWhen(-30, { if: 'superEffective' })],
  Efficient: [costPercent(-30, { damaging: true })],
  'Electric Custodian': [
    h('intercept', { when: [el('electric')] }),
    takenWhen(-15, el('electric'))
  ],
  'Electric Synthesize': [absorb('electric')],
  Energized: [regen(6)],
  'Energy Reserves': [
    onSelf('damaged', [st('self', ['attack'], 4), give('self', 'invigoratedTemtem', 2)], {
      ...once,
      when: [{ if: 'hpFellBelow', who: 'self', percent: 45 }]
    })
  ],
  Enraged: [dmg(30, C.hpBelow('self', 30))],
  Escapist: [
    side(block('trappedTemtem')),
    onSelf('entry', [E.remove('allies', 'debuff', 'trappedTemtem')])
  ],
  'Fainted Curse': [onSelf('faint', [lose('other', 30)], { when: [C.notSelf('other')] })],
  'Fast Charge': [
    trig('entry', 'allies', [st('subject', ['speed'], 1)], {
      ...once,
      when: [C.el('subject', [T.digital])]
    })
  ],
  'Fever Rush': [onSelf('statusGained', [st('self', ['attack'], 2)], { statusKind: 'debuff' })],
  'Final Stand': [
    onSelf('turnEnd', [st('self', ['defense', 'spDefense'], 2)], { when: [C.hpBelow('self', 30)] })
  ],
  'Flawed Crystal': [takenWhen(50, el('electric', 'mental', 'toxic'))],
  // Đòn thứ hai cùng lượt vào cùng mục tiêu +15%: game xét mục tiêu đã trúng đòn của phe trong lượt.
  Friendship: [side(dmg(15, { if: 'hitThisTurn', who: 'target' }))],
  Frightening: [
    onSelf('entry', [
      give('foes', 'gearSuppressedTemtem', 3),
      give('allies', 'gearSuppressedTemtem', 3)
    ])
  ],
  Furor: [dmg(33, C.hpBelow('self', 33))],
  'Going Away Gift': [
    onSelf('faint', [{ do: 'transferStages', from: 'self', to: 'allies', sign: 'positive' }])
  ],
  'Good Friend': [h('intercept', { when: [{ if: 'hitThisTurn', who: 'subject' }] })],
  'Gotta Go Fast': [h('conditionalPriority', { amount: 0, maxPriority: 0, setTo: 1 })],
  Guardian: [
    allies(
      h('stageMultiplier', { loss: 0 }),
      block('coldTemtem', 'frozenTemtem', 'burnedTemtem', 'poison', 'doomedTemtem')
    )
  ],
  Haka: [
    trig('faint', 'foes', [
      st('self', ['attack', 'spAttack'], 1),
      st('allies', ['attack', 'spAttack'], 1)
    ])
  ],
  'Half Full': [
    onSelf(
      'entry',
      [st('self', ['attack', 'defense', 'spAttack', 'spDefense'], 2), lose('self', 50)],
      {
        ...once,
        when: [C.hpAbove('self', 99)]
      }
    )
  ],
  'Heat Discharge': [onSelf('faint', [give('foes', 'burnedTemtem', 2)])],
  Heater: [
    onSelf('entry', [give('foes', 'burnedTemtem', 1), give('allies', 'burnedTemtem', 1)], once)
  ],
  Hostile: [onSelf('entry', [st('self', ['attack', 'spAttack'], 1)], once)],
  Hover: [takenWhen(-50, el('earth'))],
  'Hurry-wart': [onSelf('entry', [{ do: 'reduceHold', to: 'self', turns: 1 }])],
  Hydrologist: [dmg(15, el('water'))],
  Hypnotist: [
    onSelf('turnEnd', [give('foes', 'asleepTemtem', 1)], {
      ...once,
      when: [C.atLeast({ of: 'turnsOnField' }, 2)]
    })
  ],
  'Ignis Fatuus': [
    trig('faint', 'any', [give('self', 'evadingTemtem', 1)], { when: [C.notSelf('subject')] })
  ],
  'Ignite Protection': [onHit([give('other', 'burnedTemtem', 2)], once)],
  Immunity: [block('poison'), h('elementDamageTaken', { elementIds: [T.toxic], percent: -100 })],
  Individualist: [flag('sparesAllies')],
  Inductor: [
    trig('cast', 'any', [healOf('self', 8)], { when: [el('electric')] }),
    trig('attack', 'any', [healOf('self', 8)], { when: [el('electric')] })
  ],
  Infectious: [
    side(h('healingModifier', { received: -100 })),
    foes(h('healingModifier', { received: -100 }))
  ],
  // Một trigger duy nhất (địch mất máu vì đòn của quái mang) để đúng "một lần mỗi trận" của gốc.
  Inhibiter: [
    trig('damaged', 'foes', [E.status('subject', 'inhibitedTemtem')], {
      ...once,
      when: [C.isSelf('other')]
    })
  ],
  'Inner Shield': [flag('bouncesStatusMoves')],
  Intimidator: [
    onSelf('entry', [
      give('foes', 'traitSuppressedTemtem', 3),
      give('allies', 'traitSuppressedTemtem', 3)
    ])
  ],
  Iridescence: [
    h('effectiveness', { mode: 'neutralTaken' }),
    h('damageTakenModifier', { percent: 10 })
  ],
  'Jack of all Trades': [
    trig('attack', 'any', [st('self', ['spAttack'], 1)]),
    trig('cast', 'any', [st('self', ['attack'], 1)], { when: [cat('special')] })
  ],
  'Kinetic Transfer': onUse([{ do: 'stamina', to: 'self', eventHpPercent: 15 }]),
  'Landing Transmog': [
    onSelf('entry', [
      { do: 'transformInto', to: 'self', from: 'nextClockwise', keepStages: true, baseStats: true }
    ])
  ],
  'Last Rush': [dmg(33, C.below({ of: 'livingDiff' }, 0))],
  Loneliness: [side(flag('blocksSynergy'))],
  Marathonist: [costPercent(-50), ...onUse([st('self', ['speed'], -1)])],
  'Meditation (Trait)': [
    onSelf('rest', [give('self', 'regeneratedTemtem', 1), E.cure('self', 'debuff')])
  ],
  'Mental Alliance': [
    h('statWhen', {
      percent: { spAttack: 15 },
      when: [C.atLeast({ of: 'elementOnSide', elementIds: [T.mental] }, 1)]
    })
  ],
  'Mineral Crusher': [dmg(25, C.el('target', [T.earth, T.crystal]))],
  Mirroring: [onHit([E.dmg('other', { event: true, percent: 25 })], { when: [cat('special')] })],
  Mithridatism: [block('poison'), takenWhen(-22, el('toxic'))],
  Motivator: [onSelf('turnEnd', [E.staminaPercent('self', 15), E.staminaPercent('allies', 15)])],
  Mucous: [
    takenWhen(-30, el('electric', 'toxic')),
    block('coldTemtem', 'frozenTemtem', 'burnedTemtem')
  ],
  'Natural Conversion': [
    dmg(-10, el('nature'), offensive),
    dmg(25, { if: 'not', condition: el('nature') }, offensive)
  ],
  Neurotoxins: [
    trig('statusGained', 'any', [st('subject', ['defense', 'spDefense'], -1)], {
      statusIds: ['poison']
    })
  ],
  Neutrality: [block(...STATUS_TEMTEM, 'poison', 'doomedTemtem')],
  Parrier: [takenWhen(-25, cat('physical'))],
  Patient: onUse([E.staminaPercent('self', 15)], { when: [{ if: 'skillHold', min: 1 }] }),
  Physgulp: [onHit([healOf('self', 8)], { when: [cat('physical')] })],
  Physmaster: [dmg(50, cat('physical'))],
  'Pigment Inverter': onUse([give('other', 'nullifiedTemtem', 3)], {
    when: [{ if: 'notVeryEffective' }]
  }),
  Plethoric: [h('statWhen', { percent: { speed: 30 }, when: [C.hpAbove('self', 69)] })],
  'Power Nap': [
    onSelf('turnEnd', [healOf('self', 15)], { when: [C.has('self', ['asleepTemtem'])] })
  ],
  Predatory: [onSelf('kill', [healOf('self', 30)])],
  Prideful: [onSelf('kill', [st('self', ['speed'], 1), st('self', ['attack', 'spAttack'], 2)])],
  'Protective Crystal': [
    side(takenWhen(-20, el('electric', 'mental', 'fire'))),
    allies(takenWhen(-10, offensive))
  ],
  Protector: [onSelf('entry', [st('allies', ['defense', 'spDefense'], 1)], once)],
  // Hồi sinh khi gục vì Doomed, địch mất 30% máu còn lại của quái (≈ 30% max HP vì hồi đầy); đổi qua lại
  // Supernova không làm (game không đổi trait trong trận), gục lần sau vẫn hồi sinh lại.
  Protostar: [
    onSelf('entry', [give('self', 'doomedTemtem', 5)]),
    onSelf(
      'faint',
      [E.revive('self', 100), E.dmg('foes', { hp: 'max', of: 'self', percent: 30 })],
      {
        when: [{ if: 'not', condition: C.notSelf('other') }]
      }
    )
  ],
  Provident: [onHit([st('self', ['spDefense'], 2)], { when: [el('earth', 'fire', 'melee')] })],
  'Punch Bag': [takenWhen(-30, el('melee'))],
  'Puppet Master': [h('redirectToAlly', { when: [C.hpBelow('self', 45)] })],
  Pyromaniac: [dmg(15, el('fire'))],
  Receptive: [
    h('statusDurationBonus', {
      turns: 1,
      on: 'received',
      statusIds: [
        'invigoratedTemtem',
        'immuneTemtem',
        'regeneratedTemtem',
        'evadingTemtem',
        'alertedTemtem'
      ]
    })
  ],
  Refurbished: [
    onSelf('turnEnd', [give('self', 'regeneratedTemtem', 3)], {
      ...once,
      when: [C.atLeast({ of: 'turnsOnField' }, 3)]
    })
  ],
  Rejuvenate: [trig('cast', 'self', [healOf('self', 10)], { when: [cat('special')] })],
  Relaxed: [onSelf('turnEnd', [healOf('self', 15)], { when: [C.noDmg()] })],
  // Không gục vì đòn đánh một lần mỗi trận (còn 1 HP), rồi +2 tốc và Doomed 1 lượt (gốc).
  Resilient: [
    h('surviveLethal', { fromFullHp: false, chance: 100 }),
    onSelf('damaged', [st('self', ['speed'], 2), give('self', 'doomedTemtem', 1)], {
      ...once,
      when: [{ if: 'hpBelow', who: 'self', percent: 1 }]
    })
  ],
  Resistant: [
    h('statusDurationBonus', {
      turns: -1,
      on: 'received',
      statusIds: [
        'poison',
        'burnedTemtem',
        'asleepTemtem',
        'coldTemtem',
        'exhaustedTemtem',
        'isolatedTemtem',
        'seizedTemtem',
        'trappedTemtem'
      ]
    })
  ],
  Rested: [
    h('statWhen', {
      percent: { attack: 30, spAttack: 30 },
      when: [C.below({ of: 'turnsOnField' }, 3)]
    })
  ],
  'Royal Jelly': [onSelf('turnEnd', [healOf('self', 5), healOf('allies', 5)])],
  Ruminant: [
    onSelf('damaged', [st('self', ['attack', 'speed'], 1)], { when: [el('nature')] }),
    takenWhen(-50, el('nature'))
  ],
  // Phần −2 tốc khi rời sân của gốc không làm (bậc trận mất khi rời sân).
  Rusher: [trig('entry', 'foes', [st('self', ['speed'], 1)])],
  'Safe Retreat': [h('healOnLeave', { percent: 10 })],
  Scavenger: [trig('faint', 'any', [healOf('self', 20)], { when: [C.notSelf('subject')] })],
  Seismic: [onSelf('entry', [lose('foes', 10)])],
  'Self-Care': [onHit([give('self', 'regeneratedTemtem', 1)], { when: [offensive] })],
  'Self-Esteem': [
    block(...STATUS_TEMTEM.filter((id) => id !== 'nullifiedTemtem'), 'poison'),
    onSelf('statusGained', [st('self', ['speed'], 1)], { statusKind: 'debuff' })
  ],
  Sensei: [
    h('attackStat', { stat: 'spAttack', weight: 100, categories: ['physical'] }),
    h('attackStat', { stat: 'attack', weight: 100, categories: ['special'] })
  ],
  Sentinel: [
    side(block('asleepTemtem')),
    onSelf('entry', [E.remove('allies', 'debuff', 'asleepTemtem')])
  ],
  Seppuku: [
    onSelf('faint', [give('foes', 'doomedTemtem', 4)], {
      when: [{ if: 'overexerting', who: 'self' }]
    })
  ],
  Settling: [
    onSelf('turnEnd', [st('self', ['attack', 'spAttack'], 1)], {
      when: [{ if: 'counterMultipleOf', counter: { of: 'turnsOnField' }, every: 2 }]
    })
  ],
  Shaolin: [dmg(10, cat('special'))],
  'Shared Pain': [h('redirectToAlly', { when: [{ if: 'hitThisTurn', who: 'self' }] })],
  'Shinobi Tactics': [dmg(10, { if: 'skillPriority', min: 1 })],
  'Short Circuit': [
    side(h('stageMultiplier', { gain: 0, loss: 0 })),
    foes(h('stageMultiplier', { gain: 0, loss: 0 }))
  ],
  'Skull Helmet': [takenWhen(-25, el('mental', 'melee')), block('exhaustedTemtem')],
  Snowstorm: [
    onSelf('entry', [give('foes', 'coldTemtem', 2), give('allies', 'coldTemtem', 2)], once)
  ],
  'Soft Touch': [dmg(12, C.has('target', ['asleepTemtem'])), flag('keepsTargetAsleep')],
  Solidifier: [
    h('attackStat', { stat: 'attack', weight: 100, categories: ['special'], when: [el('water')] })
  ],
  'Source Replicator': [
    onSelf('statusGained', [E.move('self', 'allies', 'buff', true)], {
      statusIds: [
        'alertedTemtem',
        'regeneratedTemtem',
        'evadingTemtem',
        'immuneTemtem',
        'invigoratedTemtem'
      ]
    })
  ],
  Specgulp: [onHit([healOf('self', 8)], { when: [cat('special')] })],
  Specmaster: [dmg(50, cat('special'))],
  Spiritual: [onSelf('entry', [st('self', ['spAttack'], 1), st('self', ['spDefense'], -1)])],
  Splitter: [
    block(
      ...STATUS_TEMTEM.filter((id) => id !== 'nullifiedTemtem' && id !== 'doomedTemtem'),
      'poison'
    )
  ],
  Spoilsport: [dmg(25, C.skillTarget('foesOrAlly'))],
  Spreader: [h('spreadsSingleTarget', { categories: ['special'], powerPercent: 85 })],
  Stabmaster: [dmg(35, { if: 'skillSameElement', value: true })],
  'Striking Transmog': [
    trig(
      'attack',
      'self',
      [
        { do: 'transformInto', to: 'self', from: 'other', keepStages: true, baseStats: true },
        give('self', 'transmogGuardTemtem', 1)
      ],
      { ...once, when: [C.skillTarget('enemy'), C.notSelf('other')] }
    )
  ],
  'Strong Liver': [absorb('toxic')],
  Superconductivity: [flag('grantsSynergy')],
  Supernova: [
    onSelf('entry', [give('self', 'doomedTemtem', 5)]),
    onSelf(
      'faint',
      [E.revive('self', 100), E.dmg('foes', { hp: 'max', of: 'self', percent: 30 })],
      {
        when: [{ if: 'not', condition: C.notSelf('other') }]
      }
    )
  ],
  'Synergy Adept': [side(h('synergyBoost', { percent: 15 }))],
  'Synergy Master': [side(h('synergyBoost', { percent: 25 }))],
  Synertyper: [dmg(25, sameTypeAlly)],
  'Tactical Strike': [dmg(12, { if: 'skillHold', min: 1 })],
  'Tag Team': [takenWhen(-15, sameTypeAlly)],
  'Tardy Rush': [
    h('statWhen', {
      percent: { speed: 85, attack: 10 },
      when: [C.atLeast({ of: 'turnsOnField' }, 3)]
    })
  ],
  'Target Replicator': [
    trig('statusGained', 'allies', [E.move('subject', 'self', 'buff', true)], {
      statusIds: [
        'alertedTemtem',
        'regeneratedTemtem',
        'evadingTemtem',
        'immuneTemtem',
        'invigoratedTemtem'
      ]
    })
  ],
  'Team Elusive': [takenWhen(-100, C.skillTarget('allEnemies', 'allOthers', 'all', 'foesOrAlly'))],
  'Thick Skin': [takenWhen(-50, el('wind'))],
  Tireless: [
    h('overexertion', { hpPercent: -50, skipsExhaustion: true }),
    onSelf('overexert', [st('self', ['attack'], 1)])
  ],
  'Toxic Affinity': [dmg(50, el('toxic'))],
  'Toxic Farewell': [
    onSelf('faint', [give('foes', 'poison', 1), lose('foes', 7)], { when: [C.notSelf('other')] })
  ],
  'Toxic Skin': [onHit([give('other', 'poison', 2)], once)],
  Toxifier: [
    h('attackStat', {
      stat: 'spAttack',
      weight: 100,
      categories: ['physical'],
      when: [el('toxic')]
    }),
    dmg(10, el('toxic'), cat('physical'))
  ],
  'Toxin Crusher': [dmg(50, C.el('target', [T.toxic]))],
  Trance: [
    onSelf(
      'damaged',
      [
        st('self', ['spAttack', 'spDefense'], 2),
        give('self', 'regeneratedTemtem', 3),
        give('self', 'asleepTemtem', 2)
      ],
      {
        ...once,
        when: [C.hpBelow('self', 30)]
      }
    )
  ],
  Trauma: [
    onHit([st('self', ['defense'], -1)], { when: [cat('physical')] }),
    onHit([st('self', ['spDefense'], -1)], { when: [cat('special')] })
  ],
  'Tri-Apothecary': [
    trig('cast', 'self', [give('other', 'poison', 3)], {
      when: [cat('special'), C.notSelf('other')]
    })
  ],
  'Tri-Phytologist': [trig('attack', 'self', [give('other', 'exhaustedTemtem', 2)])],
  Unnoticed: [onSelf('turnEnd', [st('self', ['speed'], 1)], { when: [C.noDmg()] })],
  Vigorous: [dmg(50, { if: 'overexerting', who: 'self' })],
  'Viral Combustion': [
    onSelf('statusGained', [give('other', 'burnedTemtem', 4)], { statusIds: ['poison'] })
  ],
  'Voltaic Charge': [h('lifesteal', { percent: 20 })],
  Voodoo: [flag('spreadsDebuffsToPartner')],
  'Warm Gift': [trig('leave', 'foes', [give('subject', 'burnedTemtem', 3)])],
  'Warm-Blooded': [block('coldTemtem', 'frozenTemtem')],
  'Water Affinity': [dmg(50, el('water'))],
  'Water Custodian': [
    h('intercept', { when: [el('water')] }),
    onHit([st('self', ['spAttack'], 2)], { when: [el('water')] })
  ],
  'Water Synthesizer': [absorb('water')],
  'Wax Bath': [takenWhen(-25, el('fire')), block('burnedTemtem')],
  Welcomer: [trig('entry', 'allies', [healOf('subject', 10)])],
  Withdrawal: [
    onSelf('rest', [healOf('self', 20), E.remove('self', 'debuff', 'asleepTemtem', 'poison')])
  ],
  'Wrecked Farewell': [
    onSelf('faint', [E.staminaPercent('other', -10), st('other', ['attack', 'spAttack'], -2)], {
      when: [C.notSelf('other')]
    })
  ],
  Zen: [
    onSelf('statusGained', [st('self', ['defense', 'spDefense'], 2)], {
      statusIds: ['asleepTemtem']
    })
  ]
}
