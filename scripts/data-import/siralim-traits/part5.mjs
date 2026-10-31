/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 5 (thứ tự lúc soạn: 801–1000).
import {
  ST,
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
  statWhen,
  crit,
  critChance,
  dodge,
  negate,
  healing,
  bonus,
  resist,
  potencyAll,
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
const perRace = (r, effect, opts = {}) =>
  side(scaling(raceCount(r), effect, { ...opts, when: [isRace(r), ...(opts.when ?? [])] }))
const gainAll4 = (percent, to, of) =>
  ALL4.map((name) => E.flat(to, stats(name), sv(name, percent, of)))
const reap = (effects, { ally = false, hp = 35 } = {}) => [
  trig('attack', 'self', [E.kill('other'), ...effects], {
    when: [C.hpBelow('other', hp), ...(ally ? [C.sameSide('other')] : [])]
  })
]
const healthy = (percent = 90) => [C.hpAbove('self', percent)]

export const CONVERSIONS = {
  markedForDeath: [trig('provoke', 'self', onlyIf(E.atk('foes', 50), has('target', 'Bleeding')))],
  pica: REJECT('realm'),
  zenpangsBoast: [side(scaling(cnt('provokes'), { damageTaken: -10 }, { cap: 90 }))],
  zenpangsExploit: [foes(taken(100, { when: [C.provoking()] }))],
  zenpangsYell: [trig('provoke', 'side', E.random('subject', 'buff'))],
  masterOfPilwizes: [
    auraIf('foes', allRace, {
      type: 'statusDamageModifier',
      params: { statusIds: [S('Bleeding')], percent: 50 }
    })
  ],
  hauntedCarapace: [
    trig('turnEnd', 'allies', E.dmg('randomFoe', sv('Intelligence', 15, 'subject')))
  ],
  insatiable: [
    trig('turnEnd', 'allies', E.flat('self', stats('Attack'), sv('Attack', 7, 'subject')))
  ],
  hindrance: [trig('turnEnd', 'foes', E.stage('subject', stats('Speed'), -stg(20)))],
  rockCandy: [trig('turnEnd', 'foes', E.seal('subject'))],
  elusiveness: [side(resist(50, { when: [C.atLeast(cnt('turnsTaken'), 3)] }))],
  spewAcid: [trig('turnEnd', 'foes', E.stage('subject', stats('Defense'), -stg(15)))],
  liveToLabor: [trig('turnEnd', 'foes', E.dmg('subject', sv('Attack', 20)))],
  deathsBite: [trig('turnEnd', 'allies', E.atk('randomFoe', 30))],
  ceaselessFighting: [trig('faint', 'side', E.atk('randomFoe', 100, 1, 'subject'))],
  ceaselessFlame: [
    trig('statusDamage', 'foes', E.dmg('subject', ev(100)), {
      statusIds: [S('Burning')],
      chance: 50,
      repeatChance: 50
    })
  ],
  ceaselessVitality: [
    trig('turnEnd', 'self', [E.heal('self', hpv('max', 20)), E.status('self', S('Shelled'))])
  ],
  masterOfPitWorms: [auraIf('side', allRace, potencyAll(100))],
  decrepify: [trig('attack', 'self', E.stage('other', stats('Defense'), -stg(50)))],
  breaker: [
    side(dmg(100, { when: [C.defending('target')] }), dmg(100, { when: [C.provoking('target')] }))
  ],
  throughTheGloom: [side(dmg(50, { when: [C.hpAbove('target', 90)] }))],
  unmending: [foes(scaling(cnt('hpPercent'), { damageTaken: 0.5 }))],
  soulSquelch: [trig('attack', 'self', E.maxHpToCurrent('other'))],
  stricken: [trig('entry', 'self', E.random('foes', 'debuff', 2))],
  hauntingMemories: [trig('turnEnd', 'foes', E.atk('subject'), { chance: 50, when: [C.dead()] })],
  masterOfPitWraiths: [auraIf('side', allRace, resist(50))],
  drained: [trig('statLoss', 'foes', E.dmg('subject', hpv('max', 5, 'subject')))],
  kismet: [
    trig('statusInflicted', 'foes', E.random('subject', 'debuff'), { when: [C.sameSide('other')] })
  ],
  maximize: [trig('attack', 'self', [E.cure('other', 'buff'), E.random('other', 'debuff', 2)])],
  bloodAndPower: [side(bonus(rec('healingReceived', 10), { categories: ATK }))],
  blackToWhite: [
    trig('statusEnded', 'foes', E.random('subject', 'debuff'), { statusKind: 'debuff' })
  ],
  insipid: [side(scaling(cnt('debuffs'), { damageTaken: -15 }, { cap: 75 }))],
  metaphor: [
    trig('statusDamage', 'foes', E.heal('side', ev(35)), {
      statusIds: [S('Poisoned'), S('Burning'), S('Blighted')]
    })
  ],
  liberation: [{ type: 'repeatSkill', params: { extra: 1, categories: SPELL } }],
  masterOfPlagueDoctors: [
    trig('entry', 'self', E.trait('side', { traitId: 'drained' }), { when: allRace })
  ],
  tenderOfEarth: [trig('turnEnd', 'self', E.temp('allies', { sameElement: true }))],
  shepherdOfFire: [trig('turnEnd', 'self', E.flat('allies', stats('Attack'), sv('Attack', 15)))],
  zealotOfTheForest: [trig('turnEnd', 'self', E.flat('allies', stats('Speed'), sv('Speed', 15)))],
  preacherOfStone: [trig('turnEnd', 'self', E.flat('allies', stats('Defense'), sv('Defense', 15)))],
  bearerOfNeeds: [trig('turnEnd', 'self', E.heal('allies', hpv('max', 15)))],
  radiantEclipse: [
    trig('turnEnd', 'self', E.status('side', S('Barrier'), { amount: hpv('max', 15) }))
  ],
  fanaticism: [trig('turnEnd', 'self', E.random('side', 'buff'))],
  discipleOfWar: [trig('turnEnd', 'self', E.cure('allies', 'debuff', 2))],
  apostleOfWater: [
    trig('turnEnd', 'self', E.flat('allies', stats('Intelligence'), sv('Intelligence', 15)))
  ],
  masterOfPriests: [auraIf('side', allRace, potencyAll(100))],
  memoriae: REJECT('statusKeep'),
  evocation: [side(statMod(pct(35, 'Intelligence')))],
  swiftcasting: [side(bonus(sv('Speed', 35), { categories: SPELL }))],
  bloodMagic: [
    trig('turnEnd', 'self', [
      E.dmg('self', hpv('max', 20)),
      E.flat('self', stats('Intelligence'), hpv('max', 40))
    ])
  ],
  everythingsGone: [trig('entry', 'self', E.dmg('foes', hpv('max', 20, 'target')))],
  mindfulAwareness: [side(taken(-15, { categories: ATK }))],
  alteration: [
    side({ type: 'attackStat', params: { stat: 'speed', weight: 50, categories: ['special'] } })
  ],
  psychicBarrier: [
    trig('turnEnd', 'self', E.flat('self', stats('Defense'), sv('Intelligence', 50)))
  ],
  farsight: [
    trig('statusGained', 'side', E.cast({ pool: 'global' }), {
      statusKind: 'buff',
      oncePerTurn: true
    })
  ],
  masterOfRavens: [perRace('Raven', { stats: pct(15, 'Intelligence', 'Speed') })],
  decapitation: reap([E.heal('side', hpv('max', 200, 'target'))]),
  bonecraft: reap(
    [
      E.flat('allies', stats('Attack'), sv('Attack', 50, 'other')),
      E.flat('allies', stats('Intelligence'), sv('Intelligence', 50, 'other')),
      E.flat('allies', stats('Defense'), sv('Defense', 50, 'other'))
    ],
    { ally: true }
  ),
  soulCorruption: reap([E.random('foes', 'debuff', 2)]),
  defyTheGods: [
    trig(
      'attack',
      'self',
      [
        E.kill('other'),
        E.revive('other', 100),
        E.stage('other', stats('Attack', 'Intelligence', 'Speed'), stg(50))
      ],
      {
        when: [C.hpBelow('other', 50), C.sameSide('other')]
      }
    )
  ],
  assumption: reap([E.cast({ pool: 'ownSpell', times: 3 })]),
  shadowScythe: reap([E.dmg('otherFoes', ev(200))]),
  soulSiphon: reap([E.trait('side', { copyFrom: 'other' })]),
  heartVersusCog: [
    trig('statusEnded', 'side', E.maxHp('subject', hpv('max', 20, 'subject')), {
      statusIds: [S('Barrier')]
    })
  ],
  masterOfReapers: REJECT('thresholdChange'),
  fireworks: [trig('cast', 'self', E.dmg('foes', sv('Speed', 40)), { when: own })],
  painRedefined: [
    trig('defend', 'self', [E.dmg('self', hpv('max', 20)), E.random('side', 'buff')])
  ],
  reignOfPain: [scaling(cnt('missingHpPercent'), { damageDealt: 5 })],
  lunacy: [foes(taken(40), { type: 'debuffImmunity', params: {} })],
  delirium: [trig('damaged', 'self', E.flat('self', stats('Intelligence'), ev(40)))],
  pactOfTheDeep: [
    trig('entry', 'self', [
      E.maxHp('self', hpv('max', 35, 'self')),
      E.dmg('allies', hpv('current', 35, 'target'))
    ])
  ],
  internalStruggle: [
    trig(
      'cast',
      'self',
      [E.dmg('self', hpv('current', 25)), E.cast({ sameSkill: true, to: 'other' })],
      { when: own }
    )
  ],
  bloodForBlood: [
    bonus(hpv('current', 40), { categories: ATK }),
    trig('attack', 'self', E.dmg('self', hpv('current', 20)))
  ],
  giftOfScylla: [
    trig('faint', 'side', [
      E.flat('side', stats('Attack'), sv('Attack', 25, 'subject')),
      E.flat('side', stats('Speed'), sv('Speed', 25, 'subject'))
    ])
  ],
  masterOfRevenants: [
    trig('turnEnd', 'side', E.heal('subject', hpv('max', 50, 'subject')), { when: allRace })
  ],
  psychicDance: REJECT('triggerRepeat'),
  moonDance: REJECT('triggerRepeat'),
  renaissance: REJECT('triggerRepeat'),
  fanDance: REJECT('triggerRepeat'),
  darkDance: REJECT('triggerRepeat'),
  whatIsLeft: [scaling(cnt('stageTotal'), { damageDealt: 5 })],
  swordDance: REJECT('triggerRepeat'),
  masterOfRiftDancers: [auraIf('side', allRace, potencyAll(100))],
  hotspur: [trig('entry', 'side', E.cast({ pool: 'ownSpell' }), { chance: 50 })],
  memorial: [trig('revived', 'side', E.cast({ pool: 'ownSpell' }))],
  untilTheEnd: REJECT('deathTiming'),
  naivety: [
    trig('damaged', 'side', E.cast({ pool: 'ownSpell' }), {
      when: [C.dmgAbove(15)],
      oncePerTurn: true
    })
  ],
  limitless: [
    trig('cast', 'side', E.cast({ sameSkill: true, to: 'other' }), { chance: 50, when: own })
  ],
  wallflower: [
    trig('defend', 'side', E.cast({ pool: 'ownSpell' })),
    trig('provoke', 'side', E.cast({ pool: 'ownSpell' }))
  ],
  simulation: REJECT('triggerRepeat'),
  masterOfSalamanders: [auraIf('side', allRace, dmg(60, { categories: SPELL }))],
  charity: [trig('healed', 'self', E.heal('randomAlly', ev(300)), { oncePerTurn: true })],
  chastity: [trig('turnEnd', 'self', E.status('self', S('Invisible')), { when: healthy() })],
  kindness: [trig('turnEnd', 'self', gainAll4(5, 'allies', 'self'))],
  humility: [trig('attacked', 'self', E.stage('other', stats('Attack'), -stg(50)))],
  diligence: [
    side({ type: 'statusDuration', params: { kind: 'debuff', turns: 1, on: 'received' } })
  ],
  conservationOfEnergy: [trig('faint', 'side', E.revive('faintedAlly', 50), { chance: 50 })],
  patience: [foes({ type: 'indirectDamage', params: { percent: 50 } })],
  temperance: REJECT('statAverage'),
  masterOfSanctuses: [trig('entry', 'self', E.trait('self'), { when: allRace })],
  roughRecovery: REJECT('actionLimit'),
  languidLimbs: REJECT('actionLimit'),
  scantStamina: REJECT('actionLimit'),
  meaninglessMind: REJECT('actionLimit'),
  somberSpirits: REJECT('actionLimit'),
  faultyFortune: REJECT('actionLimit'),
  masterOfSatyrs: [trig('entry', 'self', E.stage('foes', 'all', -1), { when: allRace })],
  theSickness: [trig('healed', 'foes', E.status('subject', S('Blighted')))],
  appetiteForEschar: [
    trig('statusDamage', 'foes', E.heal('side', ev(100)), { statusIds: [S('Blighted')] })
  ],
  vicarsBlessing: [
    trig('statusDamage', 'foes', E.cast({ skillId: spell('Minor Healing'), to: 'subject' }), {
      statusIds: [S('Blighted')],
      chance: 35
    })
  ],
  aggravatedIllness: [
    foes({ type: 'statusDamageModifier', params: { statusIds: [S('Blighted')], percent: 50 } })
  ],
  chronicAffliction: [
    trig('statusDamage', 'foes', E.dmg('subject', ev(100)), {
      statusIds: [S('Blighted')],
      chance: 50
    })
  ],
  retrograde: [foes(healing({ received: 50 }))],
  masterOfSeaShamblers: [
    auraIf(
      'side',
      allRace,
      scaling(cnt('foesWithStatus', { statusIds: [S('Blighted')] }), { damageTaken: -12 })
    )
  ],
  breakTheCycle: [
    trig('provoke', 'self', E.timeline('randomFoe', 'bottom'), {
      when: [C.atLeast(cnt('provokes'), 2)]
    })
  ],
  breakOfDawn: [foes(scaling(cnt('turnsTaken'), { damageTaken: 20 }))],
  chasingInfinity: [dmg(50, { categories: SPELL, when: [C.atLeast(cnt('provokes'), 1)] })],
  defyTheOdds: [taken(-65, { when: [C.atLeast(cnt('attacks'), 1)] })],
  haven: [side(statWhen(pct(50, 'Defense'), [C.atLeast(cnt('defends'), 1)]))],
  everUpwards: [
    trig('defend', 'self', E.revive('faintedAllies', 50), { when: [C.atLeast(cnt('defends'), 2)] })
  ],
  almostEasy: [dmg(200, { categories: ATK, when: [C.atLeast(cnt('attacks'), 1)] })],
  masterOfSeraphs: [
    trig('entry', 'self', E.trait('allies', { copyFrom: 'self' }), { when: [isRace('Seraph')] })
  ],
  shadowAegis: [side(taken(-95, { when: [has('self', 'Invisible')] }))],
  phaseShift: [trig('damaged', 'self', E.status('self', S('Invisible')))],
  fromLightComesDarkness: [
    trig('damaged', 'side', E.status('subject', S('Invisible')), { chance: 50 })
  ],
  spook: [
    trig('entry', 'self', E.status('self', S('Invisible'))),
    dmg(200, { when: [has('self', 'Invisible')] })
  ],
  darkSigns: [side(dmg(100, { when: [has('self', 'Invisible')] }))],
  spookyTechnique: [
    trig('statusEnded', 'side', E.dmg('foes', sv('Defense', 35, 'subject')), {
      statusIds: [S('Invisible')]
    })
  ],
  impossibility: [side(negate(100, { source: 'spell', when: [has('self', 'Invisible')] }))],
  pariah: [trig('faint', 'any', E.status('side', S('Invisible')))],
  masterOfShades: [
    trig('turnEnd', 'side', E.status('subject', S('Invisible')), { when: allRace }),
    auraIf('side', allRace, dodge(100, { when: [has('self', 'Invisible')] }))
  ],
  allHopeIsLost: [
    foes({ type: 'statusGainBlock', params: { kind: 'buff', when: [has('self', 'Feared')] } })
  ],
  haunt: strikeWith('Feared'),
  tasteOfFear: REJECT('statRedirect'),
  cowardice: [foes(dmg(-60, { categories: ATK, when: [has('self', 'Feared')] }))],
  unspeakableFrights: [
    trig('turnEnd', 'foes', E.timeline('subject', 'bottom'), {
      chance: 20,
      when: [has('subject', 'Feared')]
    })
  ],
  horrifyingVisage: [trig('entry', 'self', E.status('foes', S('Feared')))],
  breach: [
    trig('faint', 'self', E.status('foes', S('Bomb'))),
    trig('revived', 'self', E.status('foes', S('Bomb')))
  ],
  childhoodsEnd: [
    foes({ type: 'statusDamageModifier', params: { statusIds: [S('Bomb')], percent: -50 } })
  ],
  fatherShadow: [
    trig('attack', 'self', E.dmg('randomFoe', ev(20))),
    trig('cast', 'self', E.dmg('randomFoe', ev(20)))
  ],
  masterOfShadows: [
    auraIf(
      'foes',
      allRace,
      dmg(-50, { when: [has('self', 'Feared')] }),
      taken(50, { when: [has('self', 'Feared')] })
    )
  ],
  chaosTransformation: [
    { type: 'statusConversion', params: { from: 'buff', to: 'debuff', chance: 100, onto: 'foe' } },
    { type: 'statusConversion', params: { from: 'debuff', to: 'buff', chance: 100, onto: 'ally' } }
  ],
  deathTransformation: REJECT('statConversion'),
  lifeTransformation: REJECT('healConversion'),
  transformationMastery: [auraIf('side', [isRace('Shapeshifter')], potencyAll(50))],
  natureTransformation: REJECT('healConversion'),
  rapidLearning: [trig('entry', 'self', E.trait('self'), { when: [isRace('Shapeshifter')] })],
  sorceryTransformation: REJECT('healConversion'),
  diamondHands: [scaling(cnt('traitsGained'), { damageDealt: 20, damageTaken: -4 })],
  masterOfShapeshifters: [perRace('Shapeshifter', { damageDealt: 20, damageTaken: -5 })],
  sloth: [trig('entry', 'self', E.stage('foes', stats('Attack', 'Intelligence'), -stg(30)))],
  greed: [
    trig(
      'entry',
      'self',
      ALL4.map((name) => E.flat('self', stats(name), sv(name, 15, 'subject'), 'allies'))
    )
  ],
  despair: [trig('statLoss', 'foes', E.random('subject', 'debuff'))],
  gluttony: [
    trig('entry', 'self', [
      E.maxHp('self', sv('Attack', 50)),
      E.lose('self', stats('Attack', 'Intelligence', 'Speed'), sv('Attack', 50))
    ])
  ],
  envy: REJECT('statCopy'),
  wrath: [critChance(25, { categories: ATK }), dmg(50), dmg(30)],
  lust: REJECT('spellGem'),
  pride: [negate(50, { source: 'spell' }), taken(-30)],
  masterOfSins: [trig('entry', 'self', E.trait('self'), { when: allRace })],
  coercedCoexistence: [
    trig('attack', 'foes', E.status('subject', S('Scorned'))),
    trig('cast', 'foes', E.status('subject', S('Silenced')))
  ],
  sirenCharms: [trig('entry', 'self', E.status('foes', S('Confused')))],
  forbiddenLullaby: [trig('attacked', 'self', E.status('other', S('Sleeping')))],
  beautifulSorrow: [trig('faint', 'allies', E.trait('self', { copyFrom: 'subject' }))],
  inPlainView: [
    trig('entry', 'self', [
      onlyIf(E.status('foes', S('Scorned'), { turns: 1 }), C.higher('attack', 'target')),
      onlyIf(E.status('foes', S('Silenced'), { turns: 1 }), C.lower('attack', 'target'))
    ])
  ],
  dreamTouch: [trig('attack', 'self', E.status('other', S('Sleeping')))],
  filteredTruth: REJECT('statAverage'),
  katarinasAsylum: [side(taken(35)), trig('damaged', 'side', E.status('subject', S('Invisible')))],
  katarinasGuidance: [trig('entry', 'self', E.random('self', 'buff', 5))],
  katarinasReturn: [trig('damaged', 'side', E.heal('subject', hpv('max', 30, 'subject')))],
  masterOfSirens: REJECT('statusCoexist'),
  allIn: [dmg(300, { categories: ATK, when: [C.below(cnt('attacks'), 1)] })],
  cannonShot: [trig('attack', 'self', E.status('foes', S('Vulnerable')))],
  quickShot: [trig('attack', 'self', E.atk('other'), { chance: 50, when: own })],
  aimedShot: [dmg(200, { categories: ATK, when: [C.hpAbove('target', 99.99)] })],
  scatterShot: [trig('attack', 'self', E.dmg('otherFoes', ev(30)))],
  headShot: [{ type: 'damageVariance', params: { min: 100, max: 300 } }],
  vitalShot: [
    scaling(cnt('missingHpPercent', { who: 'target' }), { damageDealt: 5 }, { categories: ATK })
  ],
  masterOfSkeletons: [
    auraIf('side', allRace, crit({ categories: ATK }), {
      type: 'extraHits',
      params: { count: 1, damagePercent: 100 }
    })
  ],
  secretRecipe: [trig('revived', 'self', E.revive('faintedAllies', 50))],
  dispersion: [trig('healed', 'self', E.heal('allies', ev(50)), { oncePerTurn: true })],
  falseProphecy: REJECT('statusRedirect'),
  concoction: [
    trig('statusGained', 'self', E.move('self', 'allies', 'buff', true), {
      statusKind: 'buff',
      oncePerTurn: true
    })
  ],
  abomination: [trig('statGain', 'self', E.stage('allies', 'all', 1), { oncePerTurn: true })],
  parasiticIllusion: [
    trig('entry', 'self', E.status('self', S('Poisoned'))),
    trig('statusDamage', 'self', E.dmg('foes', ev(50)), { statusIds: [S('Poisoned')] })
  ],
  diffusion: [trig('minionGained', 'self', E.minion('allies'), { oncePerTurn: true })],
  vanity: REJECT('spellGem'),
  flubrisEngulfing: [
    trig('statusDamage', 'foes', E.stage('subject', stats('Attack', 'Defense'), -1), {
      statusIds: [S('Burning')]
    })
  ],
  flubrisEntrapment: [
    trig('statusDamage', 'foes', E.random('subject', 'debuff'), {
      statusIds: [S('Poisoned'), S('Burning')],
      chance: 50
    })
  ],
  flubrisToxicity: [
    trig('statusDamage', 'foes', E.stage('subject', stats('Intelligence', 'Speed'), -1), {
      statusIds: [S('Poisoned')]
    })
  ],
  masterOfSlimes: [auraIf('side', allRace, resist(50), dmg(30))],
  unbreakable: DEFER('equipment'),
  dissection: DEFER('equipment'),
  foolsAxiom: DEFER('equipment'),
  battleBorn: DEFER('equipment'),
  honedBlades: DEFER('equipment'),
  braze: DEFER('equipment'),
  imbue: DEFER('equipment'),
  warForged: DEFER('equipment'),
  incursion: DEFER('equipment'),
  warcraft: DEFER('equipment')
}
