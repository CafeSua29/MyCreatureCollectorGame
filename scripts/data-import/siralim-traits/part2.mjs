/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 2 (thứ tự lúc soạn: 185–399).
import {
  ST,
  CLASS,
  race,
  ATK,
  SPELL,
  stats,
  pct,
  stg,
  sv,
  hpv,
  ev,
  cnt,
  rec,
  statMod,
  auraIf,
  side,
  foes,
  dmg,
  taken,
  scaling,
  crit,
  critChance,
  dodge,
  undodgeable,
  noCrit,
  negate,
  cap,
  variance,
  healing,
  attackStat,
  bonus,
  resist,
  intercept,
  potencyAll,
  minionMod,
  regen,
  lifesteal,
  trig,
  E,
  C,
  REJECT,
  DEFER,
  spell,
  onlyIf
} from './dsl.mjs'

const S = (name) => ST[name]
const has = (who, ...names) => C.has(who, names.map(S))
const lacks = (who, ...names) => C.lacks(who, names.map(S))
const strikeWith = (name) => [
  dmg(75, { categories: ATK }),
  trig('attack', 'self', E.status('other', S(name)))
]
const ofRace = (r) => [race(r)]
const raceCount = (r) => cnt('raceOnSide', { raceIds: ofRace(r) })
const isRace = (r, who = 'self') => C.race(who, ofRace(r))
const ALL4 = ['Attack', 'Intelligence', 'Defense', 'Speed']
const allRace = [C.allRace()]
const own = [C.own()]
/** "Your Xs ... for each X fighting on your side": hào quang cả phe chỉ lên quái race X. */
const perRace = (r, effect, opts = {}) =>
  side(scaling(raceCount(r), effect, { ...opts, when: [isRace(r), ...(opts.when ?? [])] }))
const vsClass = (klass) => [
  dmg(200, { when: [C.el('target', [CLASS[klass]])] }),
  taken(-65, { when: [C.el('attacker', [CLASS[klass]])] })
]

export const CONVERSIONS = {
  masterOfCarbuncles: [auraIf('side', allRace, potencyAll(100))],
  demoralize: [trig('kill', 'self', E.stage('foes', stats('Defense'), -stg(50)))],
  rendAndTear: [trig('kill', 'self', E.atk('subjectAllies', 200))],
  rapidDigestion: [trig('kill', 'self', E.random('self', 'buff', 5))],
  midnightFeast: [
    trig('kill', 'self', [E.heal('self', hpv('max', 100)), E.extra()], { oncePerTurn: true })
  ],
  consumption: [
    trig('kill', 'self', [
      E.flat('self', stats('Attack'), sv('Attack', 35, 'other')),
      E.flat('self', stats('Intelligence'), sv('Intelligence', 35, 'other')),
      E.flat('self', stats('Defense'), sv('Defense', 35, 'other')),
      E.flat('self', stats('Speed'), sv('Speed', 35, 'other'))
    ])
  ],
  augmentation: [trig('kill', 'self', E.random('side', 'buff', 2))],
  deadlyInstincts: [trig('kill', 'self', E.dmg('otherFoes', hpv('current', 75)))],
  masterOfCarnages: [
    trig('kill', 'allies', E.atk('randomFoe', 200), { when: [isRace('Carnage')] })
  ],
  eradication: [side(critChance(25, { categories: ATK, per: cnt('debuffs', { who: 'target' }) }))],
  roulette: [variance(0, 300)],
  confrontation: [trig('turnEnd', 'self', [E.atk('randomFoe', 50)])],
  betrayal: [
    trig(
      'damaged',
      'allies',
      [
        E.kill('subject'),
        E.flat('self', stats('Attack'), sv('Attack', 100, 'subject')),
        E.flat('self', stats('Intelligence'), sv('Intelligence', 100, 'subject')),
        E.flat('self', stats('Defense'), sv('Defense', 100, 'subject')),
        E.flat('self', stats('Speed'), sv('Speed', 100, 'subject'))
      ],
      { when: [C.hpBelow('subject', 40)] }
    )
  ],
  wildStabs: [trig('defend', 'self', E.atk('randomFoe', 50, 4))],
  subversion: strikeWith('Disarmed'),
  peekaboo: [
    { type: 'seeInvisible', params: {} },
    side(dmg(150, { when: [has('target', 'Invisible')] }))
  ],
  coldBlood: [variance(50, 250)],
  masterOfCarvers: [perRace('Carver', { damageDealt: 30, damageTaken: 10 })],
  squareNothing: [
    trig('attack', 'self', E.dmg('otherFoes', ev(60)), { when: [C.count('other', 'debuff', 1)] })
  ],
  touchOfRed: [side(scaling(cnt('attacks'), { damageDealt: 25 }, { categories: ATK, step: 1 }))],
  warStomp: [trig('crit', 'self', E.dmg('otherFoes', ev(20)))],
  anticipation: [trig('faint', 'foes', E.atk('randomFoe', 100, 3))],
  onTheRocks: [
    trig('attack', 'self', E.atk('other'), { when: [C.atLeast(cnt('sideCasts'), 1), C.own()] })
  ],
  infiniteStruggle: [
    trig('attack', 'self', E.atk('other'), {
      chance: 25,
      chancePer: cnt('debuffs', { who: 'other' }),
      repeatChance: 25,
      when: [C.own()]
    })
  ],
  paradigm: [trig('attacked', 'self', E.atk('other'))],
  sunnyDisposition: [trig('cast', 'foes', E.atk('subject'), { when: own })],
  masterOfCentaurs: [perRace('Centaur', { damageDealt: 20, critChance: 10 }, { categories: ATK })],
  spellTap: REJECT('spellGem'),
  wrathOfTheUnderworld: [
    { type: 'blockManual', params: { categories: SPELL } },
    trig('damagedAny', 'self', E.cast({ pool: 'ownSpell' }), { chance: 30 })
  ],
  zeroToOne: [
    { type: 'blockManual', params: { categories: SPELL } },
    trig('attack', 'self', E.cast({ pool: 'ownSpell', to: 'other' }))
  ],
  channeling: REJECT('spellGem'),
  abaddonsBoon: [
    { type: 'blockManual', params: { categories: SPELL } },
    trig('defend', 'self', E.cast({ pool: 'ownSpell' }))
  ],
  hellblast: [
    { type: 'blockManual', params: { categories: SPELL } },
    trig('provoke', 'self', E.cast({ pool: 'ownSpell' }))
  ],
  burstOfPower: [
    { type: 'blockManual', params: { categories: SPELL } },
    trig('attack', 'self', E.cast({ pool: 'ownSpell' }), { chance: 20 })
  ],
  masterOfCerberuses: REJECT('innateCombination'),
  shadowmeld: [side(dodge(10, { per: cnt('debuffs', { who: 'attacker' }) }))],
  painFlurry: [trig('dodged', 'foes', E.cast({ pool: 'global', times: 5 }))],
  stickyFingers: [trig('dodged', 'foes', E.stage('subject', stats('Speed'), -stg(50)))],
  vehemence: [
    trig('dodged', 'foes', [E.status('subject', S('Burning')), E.status('subject', S('Scorned'))])
  ],
  smackAround: [trig('dodged', 'foes', E.atk('subject', 100, 2), { when: [C.notSelf('other')] })],
  brainZap: [trig('dodged', 'foes', E.status('foes', S('Confused')))],
  contagion: [
    trig('dodged', 'foes', [E.status('subject', S('Poisoned')), E.status('subject', S('Silenced'))])
  ],
  seize: [
    trig('dodged', 'foes', [E.status('subject', S('Stone')), E.status('subject', S('Snared'))])
  ],
  lash: [trig('dodged', 'foes', E.dmg('subject', hpv('current', 30, 'subject')))],
  masterOfClutchers: [side(undodgeable({ when: [isRace('Clutcher')] }))],
  strengthInNumbers: REJECT('countBonus'),
  weirdDance: [trig('entry', 'self', E.trait('self', { count: 2 }))],
  oddOne: REJECT('countBonus'),
  outcastNoLonger: REJECT('partyOrder'),
  blendingIn: REJECT('partyOrder'),
  cockADoodleDoo: [
    trig('entry', 'self', E.trait('side', {}), { when: [isRace('Cockatrice', 'self')] })
  ],
  masterOfCockatrices: [
    trig('turnEnd', 'self', E.status('foes', S('Confused')), { when: allRace })
  ],
  acidBody: [trig('attacked', 'self', [E.status('other', S('Disarmed')), E.seal('other')])],
  squelch: [
    trig('statusGained', 'foes', E.status('subject', S('Scorned')), {
      statusIds: [S('Disarmed')],
      when: [C.higher('attack', 'target')]
    }),
    trig('statusGained', 'foes', E.status('subject', S('Silenced')), {
      statusIds: [S('Disarmed')],
      when: [C.lower('attack', 'target')]
    })
  ],
  overcome: DEFER('equipment'),
  dissolve: [
    foes({
      type: 'interrupt',
      params: { chance: 50, categories: ATK, when: [has('self', 'Disarmed')] }
    })
  ],
  reticence: DEFER('equipment'),
  yuck: [
    foes(noCrit({ when: [has('self', 'Disarmed')] }), {
      type: 'cannotDodge',
      params: { when: [has('self', 'Disarmed')] }
    })
  ],
  masterOfConcoction: [
    trig('turnEnd', 'self', onlyIf(E.atk('foes'), has('target', 'Disarmed')), {
      chance: 50,
      when: allRace
    })
  ],
  helix: REJECT('spellGem'),
  stayInspired: [side(scaling(cnt('sideCasts'), { stats: pct(20, 'Intelligence') }))],
  defiance: [trig('entry', 'self', E.cast({ pool: 'global', tags: ['arsenal'] }))],
  chaosThroughCreation: [
    trig('attack', 'self', E.cast({ pool: 'global', tags: ['arsenal'], to: 'other' }))
  ],
  forsakenHorizon: [
    trig('cast', 'self', E.cast({ sameSkill: true, times: 2 }), {
      when: [C.tag('arsenal'), C.own()]
    })
  ],
  feedTheFire: [side(scaling(cnt('sideCasts'), { stats: pct(20, 'Attack') }))],
  masquerade: [trig('entry', 'self', E.temp('side', { tags: ['arsenal'], count: 2 }))],
  iAmAbove: DEFER('equipment'),
  safetyPin: [
    trig('damaged', 'self', E.cast({ skillId: spell('Living Armor') }), { chance: 30 }),
    trig('attack', 'self', E.cast({ skillId: spell('Living Axe'), to: 'other' }))
  ],
  justiceForNone: [
    trig('statusGained', 'side', E.cast({ skillId: spell('Living Helmet') }), {
      statusKind: 'debuff',
      chance: 25
    })
  ],
  masterOfConstructs: [side(dmg(70, { when: [isRace('Construct'), C.tag('arsenal')] }))],
  shellshock: [trig('attacked', 'self', [E.seal('other'), E.provoke()])],
  noPrayers: [
    scaling(cnt('sealedSkills', { who: 'target' }), { damageDealt: 15 }, { categories: ATK })
  ],
  munch: [trig('attack', 'self', [E.seal('other'), E.stage('self', stats('Attack'), stg(20))])],
  shortedOut: [trig('spellTargeted', 'self', E.seal('other'))],
  somethingToComplainAbout: [foes(scaling(cnt('sealedSkills'), { damageDealt: -10 }))],
  relishTheKill: [
    trig('kill', 'self', [
      E.seal('other', 4),
      E.stage('self', stats('Attack'), 2),
      E.stage('self', stats('Defense'), 1)
    ])
  ],
  myrtlesGreed: [
    trig('faint', 'allies', [
      E.flat('self', stats('Attack'), sv('Attack', 50, 'subject')),
      E.flat('self', stats('Intelligence'), sv('Intelligence', 50, 'subject')),
      E.flat('self', stats('Defense'), sv('Defense', 50, 'subject')),
      E.flat('self', stats('Speed'), sv('Speed', 50, 'subject'))
    ])
  ],
  myrtlesHunger: [
    trig('faint', 'foes', [
      E.flat('self', stats('Attack'), sv('Attack', 20, 'subject')),
      E.flat('self', stats('Intelligence'), sv('Intelligence', 20, 'subject')),
      E.flat('self', stats('Defense'), sv('Defense', 20, 'subject')),
      E.flat('self', stats('Speed'), sv('Speed', 20, 'subject'))
    ])
  ],
  myrtlesPerseverence: [trig('faint', 'any', E.revive('self', 100), { when: [C.dead()] })],
  masterOfCrunchers: [auraIf('side', allRace, dmg(10))],
  bloodWeapon: [lifesteal(25), regen(30), healing({ received: 100 })],
  royalAuthority: [
    taken(-50),
    { type: 'negateDamage', params: { chance: 50, source: 'spell' } },
    trig('turnEnd', 'self', E.status('self', S('Defensive'), { turns: 1 }))
  ],
  amalgamy: [trig('attack', 'self', E.stage('self', stats('Defense'), stg(30)))],
  innerForce: REJECT('barrierPotency'),
  faithsArmor: [
    trig('attack', 'self', E.status('self', S('Shelled'))),
    trig('attacked', 'self', E.status('self', S('Shelled')))
  ],
  galvanization: [
    trig('attack', 'self', E.status('self', S('Barrier'), { amount: hpv('max', 50) }))
  ],
  lunarEnding: [
    trig('attack', 'self', E.cast({ skillId: spell('Holy Smite'), to: 'other' }), { chance: 75 }),
    trig('attack', 'self', E.cast({ skillId: spell('Holy Nova') }), { chance: 25 })
  ],
  bathedInLight: [trig('attack', 'self', E.heal('self', hpv('max', 75)))],
  masterOfCrusaders: [
    trig('entry', 'self', E.status('self', S('Shelled')), { when: [isRace('Crusader')] })
  ],
  anomaly: [attackStat('defense', 100, ['physical', 'special']), dmg(-50)],
  solence: [trig('attacked', 'self', E.stage('other', 'all', -1))],
  consciousness: [trig('entry', 'self', E.maxHp('self', hpv('max', 15, 'self')))],
  celestialFortitude: [side(cap(20))],
  calamity: [bonus(hpv('missing', 75))],
  singularity: [side(bonus(hpv('current', 10)))],
  reconstructedMemories: [trig('attack', 'self', E.cast({ lastCast: true }))],
  equilibrium: [bonus(rec('damageTaken', 25, 'target'))],
  noetheriansAdamance: [
    trig('statusEnded', 'side', E.status('subject', S('Shelled')), { statusIds: [S('Barrier')] })
  ],
  noetheriansBouquet: REJECT('barrierBypass'),
  noetheriansObjection: [
    trig('statusEnded', 'foes', E.dmg('subject', hpv('max', 20, 'subject')), {
      statusIds: [S('Barrier')]
    })
  ],
  masterOfDemigods: [auraIf('side', allRace, statMod(pct(25, ...ALL4)))],
  eggnapper: REJECT('spellGem'),
  giantsDestruction: vsClass('Nature'),
  devilsDeceit: vsClass('Chaos'),
  youRuinedChristmas: [
    trig('entry', 'self', E.trait('allies', { copyFrom: 'self' }), { when: [isRace('Devil')] })
  ],
  revenantsToll: vsClass('Death'),
  smokingKills: [
    side(dmg(100, { when: [C.sameEl('target')] }), taken(-35, { when: [C.sameEl('attacker')] }))
  ],
  angelsHorror: vsClass('Life'),
  dragonsUndoing: vsClass('Sorcery'),
  masterOfDevils: [auraIf('side', allRace, potencyAll(50))],
  diabolicCelebration: [trig('entry', 'self', E.temp('self', { sameElement: true }))],
  diabolicFortitude: [perRace('Diabolic Horde', { stats: pct(10, 'Defense') })],
  diabolicOnslaught: [perRace('Diabolic Horde', { stats: pct(10, 'Speed') })],
  diabolicHeritage: [
    trig('statusGained', 'allies', E.move('subject', 'side', 'buff', true), {
      statusKind: 'buff',
      oncePerTurn: true
    })
  ],
  diabolicPower: [perRace('Diabolic Horde', { stats: pct(10, 'Intelligence') })],
  diabolicBrilliance: REJECT('charge'),
  diabolicLink: [trig('entry', 'self', E.maxHp('self', hpv('max', 50), true))],
  diabolicProtection: [perRace('Diabolic Horde', { damageTaken: -5 })],
  diabolicRevolution: REJECT('countBonus'),
  diabolicResilience: [perRace('Diabolic Horde', { stats: pct(10, 'Defense') })],
  diabolicMight: [perRace('Diabolic Horde', { stats: pct(10, 'Attack') })],
  masterOfDiabolicHorde: REJECT('identityChange'),
  ascendancy: REJECT('charge'),
  chainSpells: [
    trig('cast', 'self', E.cast({ pool: 'global', sameElement: true, times: 2 }), { when: own })
  ],
  megaBomb: REJECT('spellGem'),
  atmosphere: [trig('provoke', 'self', E.cast({ skillId: spell('Elemental Barrage') }))],
  alleviation: REJECT('charge'),
  pyromaniac: [trig('cast', 'side', E.dmg('foes', sv('Intelligence', 35)), { when: own })],
  leyLines: [trig('defend', 'self', E.temp('side', { sameElement: true, count: 2 }))],
  celebrateDecline: DEFER('equipment'),
  masterOfDjinns: [
    side(
      crit({ categories: SPELL, when: [isRace('Djinn')] }),
      dmg(40, { categories: SPELL, when: [isRace('Djinn')] })
    )
  ],
  steadfastResilience: [
    trig('provoke', 'side', [
      E.stage('subject', stats('Defense'), stg(35)),
      E.heal('subject', hpv('max', 25, 'subject'))
    ])
  ],
  congregation: [trig('provoke', 'self', E.stage('side', stats('Defense', 'Speed'), stg(35)))],
  mindPrison: [trig('provoke', 'self', E.seal('randomFoe', 3))],
  rally: [trig('provoke', 'self', E.stage('side', stats('Attack', 'Intelligence'), stg(25)))],
  glassHouse: [
    trig('provoke', 'self', E.atk('randomFoe', 100, 1), {
      chancePer: raceCount('Doom Fortress'),
      chance: 100
    })
  ],
  necroticProtection: [side(taken(-50, { when: [C.provoking()] }))],
  pandemoniumPrayer: [
    trig('turnEnd', 'self', E.cast({ pool: 'global', elementIds: [CLASS.Chaos], times: 3 }))
  ],
  pandemoniumSin: [trig('turnEnd', 'self', E.atk('foes', 200))],
  derision: [
    taken(-50, { when: [C.provoking()] }),
    trig('turnEnd', 'self', E.status('self', S('Taunting'), { turns: 1 }))
  ],
  pandemoniumAlacrity: [
    statMod(pct(-30, 'Speed')),
    trig('entry', 'self', [
      E.flat('self', stats('Attack'), sv('Speed', 100)),
      E.flat('self', stats('Intelligence'), sv('Speed', 100))
    ])
  ],
  pandemoniumBrilliance: [trig('turnEnd', 'side', E.cast({ pool: 'global' }))],
  pandemoniumDeath: [trig('attack', 'self', E.cast({ skillId: spell('Extinguish'), to: 'other' }))],
  pandemoniumExploit: [scaling(cnt('foeBuffs'), { damageDealt: 50 })],
  pandemoniumFever: [trig('entry', 'self', E.cast({ skillId: spell('Affliction') }))],
  pandemoniumLife: [trig('cast', 'foes', E.dmg('subject', hpv('current', 10, 'subject')))],
  pandemoniumMania: [
    trig('defend', 'self', E.cast({ skillId: spell('Chaos Rift') })),
    trig('provoke', 'self', E.cast({ skillId: spell('Chaos Rift') }))
  ],
  pandemoniumRebirth: [
    trig('faint', 'self', [
      E.revive('faintedAllies', 100),
      E.heal('allies', hpv('max', 50, 'target'))
    ])
  ],
  pandemoniumWrath: [
    trig('cast', 'self', E.cast({ sameSkill: true, to: 'other' }), {
      chance: 50,
      repeatChance: 50,
      when: own
    })
  ],
  masterOfDoomFortresses: [side(scaling(raceCount('Doom Fortress'), { damageDealt: 15 }))],
  hellsProtection: [side(scaling(cnt('missingHpPercent'), { damageTaken: -1 }, { cap: 50 }))],
  vigor: [side(taken(-25))],
  awareness: [side({ type: 'critImmunity', params: {} })],
  bulwark: [side(taken(-50))],
  guardian: [intercept(), taken(-50)],
  rampart: [
    trig('entry', 'self', [
      E.flat('allies', stats('Defense'), sv('Defense', 65)),
      E.flat('allies', stats('Speed'), sv('Speed', 65)),
      E.maxHp('allies', hpv('max', 65))
    ])
  ],
  fortification: [side(scaling(cnt('timesDamaged'), { damageTaken: -5 }, { cap: 90 }))],
  masterOfDoomguards: [
    side(
      negate(20, { when: [isRace('Doomguard')] }),
      negate(37.5, { when: [isRace('Doomguard'), C.defending()] })
    )
  ],
  dragonDance: [trig('attack', 'self', E.dmg('other', hpv('current', 30, 'other')))],
  corrosiveDragonBreath: [
    trig('defend', 'foes', E.stage('foes', stats('Defense'), -stg(40))),
    trig('provoke', 'foes', E.stage('foes', stats('Defense'), -stg(40)))
  ],
  piercingDragonClaws: [
    trig('statusGained', 'foes', E.dmg('foes', sv('Speed', 30)), { statusKind: 'buff' }),
    trig('minionGained', 'foes', E.dmg('foes', sv('Speed', 30)))
  ],
  dynamicDragonScales: [trig('cast', 'foes', E.stage('foes', stats('Intelligence'), -stg(35)))],
  deflectiveDragonArmor: [trig('attack', 'foes', E.stage('foes', stats('Attack'), -stg(20)))],
  sweepingDragonTail: [trig('crit', 'foes', E.stage('foes', stats('Speed'), -stg(50)))],
  menacingDragonFangs: [trig('dodged', 'foes', E.dmg('foes', sv('Intelligence', 35)))],
  mementoVivere: [
    trig('statusGained', 'foes', [E.revive('faintedAlly', 100)], { statusKind: 'buff' })
  ],
  blend: REJECT('identityChange'),
  tellursFangs: [scaling(cnt('timesDamaged'), { damageDealt: 15 })],
  tellursGlands: [
    trig('damaged', 'self', E.dmg('foes', rec('damageTaken', 100)), {
      when: [C.atLeast(cnt('timesDamaged'), 10)],
      oncePerBattle: true
    })
  ],
  tellursScales: [scaling(cnt('timesDamaged'), { damageTaken: -20 }, { cap: 90 })],
  masterOfDragons: [auraIf('side', allRace, potencyAll(100))],
  surge: [
    trig('statusGained', 'side', E.stage('subject', stats('Attack', 'Intelligence'), stg(15)), {
      statusKind: 'buff'
    })
  ],
  extension: [trig('defend', 'self', E.minion('side', 1))],
  moonlight: [side(scaling(cnt('buffs'), { stats: pct(7, 'Attack', 'Intelligence', 'Defense') }))],
  soothingRain: [
    trig(
      'defend',
      'self',
      E.heal('side', hpv('max', 20, 'target', cnt('buffs', { who: 'target' })))
    )
  ],
  greenEyes: [
    trig('statusGained', 'any', E.move('subject', 'self', 'buff', true), {
      statusKind: 'buff',
      when: [C.notSelf('subject')],
      oncePerTurn: true
    })
  ],
  oulala: [
    foes(dmg(150, { categories: ATK, when: [has('self', 'Confused'), C.sameSide('target')] }))
  ],
  absolution: [
    trig('statusGained', 'foes', E.stage('subject', stats('Attack', 'Intelligence'), -stg(15)), {
      statusKind: 'debuff'
    })
  ],
  duplication: [trig('provoke', 'self', E.move('self', 'allies', 'buff', true))],
  ettasCoercion: [
    trig('turnEnd', 'foes', E.atk('subjectAllies', 100, 1, 'subject'), { chance: 20 })
  ],
  ettasJealousy: [
    trig('turnEnd', 'foes', E.cast({ pool: 'global', categories: ['special'], to: 'subject' }), {
      chance: 20
    })
  ],
  ettasSeduction: [
    trig('turnEnd', 'self', [
      E.flat('self', stats('Attack'), sv('Attack', 15, 'subject'), 'randomFoe'),
      E.flat('self', stats('Intelligence'), sv('Intelligence', 15, 'subject'), 'randomFoe'),
      E.flat('self', stats('Defense'), sv('Defense', 15, 'subject'), 'randomFoe'),
      E.flat('self', stats('Speed'), sv('Speed', 15, 'subject'), 'randomFoe')
    ])
  ],
  masterOfDryads: [
    side({ type: 'statusDuration', params: { kind: 'buff', turns: null, on: 'received' } }),
    minionMod({ leaveChancePercent: -100 })
  ],
  secretIngredient: [
    trig('entry', 'self', E.maxHp('side', hpv('max', 15, 'target')), { when: [isRace('Dumpling')] })
  ],
  richGetRicher: [
    trig('faint', 'allies', E.flat('self', 'highest', sv('highest', 50, 'subject')), {
      when: [isRace('Dumpling', 'subject')]
    })
  ],
  glucose: [{ type: 'startPosition', params: { position: 'top', chance: 10 } }],
  greedIsGood: [perRace('Dumpling', { damageDealt: 7 })],
  highProtein: [side(resist(10, { per: raceCount('Dumpling'), when: [isRace('Dumpling')] }))],
  proofIsInThePudding: REJECT('spellGem'),
  extraTreat: REJECT('charge'),
  cleanEating: [
    trig('faint', 'side', E.revive('subject', 1), {
      oncePerBattle: true,
      when: [isRace('Dumpling', 'subject')]
    })
  ],
  masterOfDumplings: REJECT('skin'),
  infiniteInferno: [
    foes({
      type: 'statusDuration',
      params: { statusIds: [S('Burning')], turns: null, on: 'received' }
    })
  ],
  stoke: [
    trig('defend', 'self', E.potency('foes', [S('Burning')], 65)),
    trig('provoke', 'self', E.potency('foes', [S('Burning')], 65))
  ],
  inFlames: [
    side({ type: 'statusHeals', params: { statusIds: [S('Burning')], percent: 100 } }),
    trig('entry', 'self', E.status('side', S('Burning')))
  ],
  livingFlame: [
    trig('statusDamage', 'foes', E.dmg('subjectAllies', ev(30)), { statusIds: [S('Burning')] })
  ],
  snuff: [
    trig('statusEnded', 'foes', E.dmg('subject', hpv('max', 31.25, 'subject')), {
      statusIds: [S('Burning')]
    })
  ],
  smolder: [
    trig('attack', 'self', E.burst('other', [S('Burning')], 4), { when: [has('other', 'Burning')] })
  ],
  ashesToAshes: [
    trig('attack', 'self', [
      onlyIf(E.status('foes', S('Burning')), has('other', 'Burning')),
      onlyIf(E.status('other', S('Burning')), lacks('target', 'Burning'))
    ])
  ],
  masterOfEfreets: [potencyStatus('Burning', 50)],
  prideOfThePack: [
    side(dodge(25, { when: [isRace('Eft')] }), critChance(25, { when: [isRace('Eft')] }))
  ],
  renderFlesh: [trig('attack', 'self', E.stage('other', stats('Defense'), -1))],
  dismemberment: [trig('attack', 'self', E.stage('other', stats('Intelligence'), -1))],
  throatRipper: [
    trig('attack', 'allies', E.heal('side', ev(5, raceCount('Eft'))), {
      when: [isRace('Eft', 'subject')]
    })
  ],
  hamstring: [trig('attack', 'self', E.stage('other', stats('Speed'), -1))],
  maim: [trig('attack', 'self', E.stage('other', stats('Attack'), -1))],
  kiichisAggression: [
    trig('statusDamage', 'foes', E.dmg('subjectAllies', ev(50)), { statusIds: [S('Bleeding')] })
  ],
  kiichisOnslaught: [
    trig('statusDamage', 'foes', E.dmg('subject', ev(100)), {
      statusIds: [S('Bleeding')],
      chance: 50,
      repeatChance: 50
    })
  ],
  kiichisPersistence: [
    trig('turnEnd', 'foes', E.burst('subject', [S('Bleeding')], 1), {
      when: [has('subject', 'Bleeding')]
    })
  ],
  masterOfEfts: [auraIf('side', allRace, dodge(40), critChance(40))],
  hateAndOtherTriumphs: REJECT('ignoreTriggers'),
  brawl: [trig('attack', 'self', E.atk('randomFoe'), { chance: 20, repeatChance: 20, when: own })],
  madnessAndOtherIdeals: REJECT('ignoreTriggers'),
  lifeAndOtherIllusions: REJECT('ignoreTriggers'),
  loveAndOtherDisasters: REJECT('ignoreTriggers')
}

/** "Potency +p% của trạng thái X khi quái phe mình gây ra". */
function potencyStatus(name, percent) {
  return side({ type: 'inflictPotency', params: { statusIds: [ST[name]], percent } })
}
