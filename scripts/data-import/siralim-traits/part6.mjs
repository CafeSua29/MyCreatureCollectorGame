/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 6 (thứ tự lúc soạn: 1000–1199).
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
  flat,
  auraIf,
  side,
  foes,
  dmg,
  taken,
  scaling,
  statWhen,
  negate,
  healing,
  bonus,
  resist,
  effectiveness,
  share,
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
const healthy = [C.hpAbove('self', 90)]
const sameClassCount = cnt('sameElementOnSide')
const toBottom = (event, opts = {}) =>
  trig(event, 'foes', E.timeline('subject', 'bottom'), { chance: 25, ...opts })
const commonRace = (event, effects, opts = {}) =>
  trig(event, 'allies', effects, { ...opts, when: [C.sameRace('subject'), ...(opts.when ?? [])] })

export const CONVERSIONS = {
  iannesEccentricity: [trig('attack', 'self', E.dmg('side', flat(100)))],
  iannesOddity: [side(taken(-50, { when: [C.dmgAbove(30)] }))],
  iannesQuirk: [trig('attack', 'self', E.cast({ skillId: spell('Metamorphosis'), to: 'other' }))],
  masterOfSmiths: DEFER('equipment'),
  poisonInoculation: [
    side({ type: 'statusHeals', params: { statusIds: [S('Poisoned')], percent: 100 } }),
    trig('entry', 'self', E.status('side', S('Poisoned')))
  ],
  endlessDistraction: [
    { type: 'aura', params: { scope: 'allies', hooks: [taken(-35)], when: [C.provoking()] } }
  ],
  vex: [
    foes({
      type: 'statusDamageModifier',
      params: { statusIds: [S('Burning'), S('Poisoned')], percent: 50 }
    })
  ],
  creepingDeath: [
    trig('defend', 'self', onlyIf(E.burst('foes', [S('Poisoned')], 3), has('target', 'Poisoned'))),
    trig('provoke', 'self', onlyIf(E.burst('foes', [S('Poisoned')], 3), has('target', 'Poisoned')))
  ],
  transfusion: [
    trig('attack', 'self', E.burst('other', [S('Poisoned')], 5, true), {
      when: [has('other', 'Poisoned')]
    })
  ],
  contamination: strikeWith('Poisoned'),
  malady: [
    foes({
      type: 'statusDuration',
      params: { statusIds: [S('Poisoned')], turns: null, on: 'received' }
    })
  ],
  extermination: [dmg(150, { when: [has('target', 'Poisoned')] })],
  taintedBlood: [
    trig('statusDamage', 'foes', E.dmg('subjectAllies', ev(35)), { statusIds: [S('Poisoned')] })
  ],
  masterOfSmogs: [
    side({ type: 'inflictPotency', params: { statusIds: [S('Poisoned')], percent: 50 } })
  ],
  atrophy: [toBottom('statGain')],
  debacle: [toBottom('healed')],
  comingDown: [
    trig('statusGained', 'foes', E.timeline('subject', 'bottom'), {
      chance: 25,
      statusKind: 'buff'
    })
  ],
  greatFall: [
    trig('attack', 'foes', E.timeline('subjectAllies', 'bottom'), { chance: 10, oncePerTurn: true })
  ],
  tumbleOver: [
    trig('cast', 'foes', E.timeline('subjectAllies', 'bottom'), { chance: 10, oncePerTurn: true })
  ],
  followTheLeader: REJECT('timelineChain'),
  masterOfSnaptraps: [auraIf('side', allRace, potencyAll(100))],
  ofOneMind: [commonRace('attack', E.atk('randomFoe', 10), { chance: 5 })],
  suicidePact: [commonRace('faint', E.kill('self'))],
  groupTherapy: REJECT('healCopy'),
  massResurrection: [commonRace('revived', E.revive('faintedAllies', 50), { chance: 30 })],
  hubbub: [commonRace('provoke', E.provoke())],
  marshal: [commonRace('timelineTop', E.atk('randomFoe'), { chance: 25 })],
  xyrxzysControl: [trig('attack', 'self', E.dmg('other', sv('Attack', 100)))],
  xyrxzysPlan: [trig('entry', 'self', E.temp('side', spell('Mind Control')))],
  xyrxzysSubversion: [trig('cast', 'self', E.cast({ pool: 'global', times: 3 }), { when: own })],
  masterOfSoulflayers: [
    trig('faint', 'side', E.revive('subject', 10), {
      oncePerBattle: true,
      when: [isRace('Soulflayer', 'subject')]
    })
  ],
  recompense: [trig('attacked', 'self', E.dmg('foes', ev(30)))],
  comeuppance: [
    trig('damaged', 'self', E.dmg('foes', ev(30)), { when: [C.cat('special', 'status')] })
  ],
  ravish: [trig('damaged', 'self', E.dmg('other', ev(100)))],
  seeth: [bonus({ record: 'damageTaken', of: 'self', percent: 20 })],
  conviviality: [bonus({ record: 'damageTaken', of: 'self', percent: 5, side: true })],
  bombshell: [side(dmg(75, { when: [C.reactive(true)] }))],
  masterOfSparktails: [
    trig('entry', 'self', E.trait('allies', { copyFrom: 'self' }), { when: allRace })
  ],
  coldTouch: [trig('attack', 'self', E.stage('other', 'highest', -1))],
  blessingFromBelow: [trig('statGain', 'self', E.stage('foes', 'all', -1), { oncePerTurn: true })],
  creationDirge: [trig('attacked', 'self', E.stage('other', 'all', -1))],
  cripple: [
    trig('cast', 'self', E.lose('other', stats('Intelligence'), ev(100)), { when: [C.single()] })
  ],
  unspeakableSins: [
    trig('healed', 'foes', E.stage('subject', stats('Attack', 'Intelligence'), -stg(35)))
  ],
  experimentation: [trig('statGain', 'foes', E.atk('subject'), { chance: 30 })],
  saltedEarth: [
    trig('defend', 'self', E.stage('foes', stats('Defense', 'Speed'), -1)),
    trig('provoke', 'self', E.stage('foes', stats('Defense', 'Speed'), -1))
  ],
  guilt: [trig('turnEnd', 'foes', E.stage('subject', 'lowest', -1))],
  masterOfSpectres: [foes({ type: 'stageMultiplier', params: { loss: 1.5 } })],
  desertGlory: [
    trig('faint', 'side', E.revive('subject', 50), { chance: 5, chancePer: sameClassCount })
  ],
  pharaohsBoon: [side(scaling(sameClassCount, { stats: pct(10, ...ALL4) }))],
  rejuvenation: [
    trig(
      'turnEnd',
      'side',
      E.heal('subject', hpv('max', 12, 'subject', cnt('sameElementOnSide', { who: 'subject' })))
    )
  ],
  recombobulation: REJECT('identityChange'),
  blessingOfSands: REJECT('countBonus'),
  prejudice: [
    trig('attack', 'self', onlyIf(E.atk('otherFoes'), C.sameEl('target')), { when: own })
  ],
  pharaohsBane: [foes(scaling(cnt('sameElementOnSide'), { stats: pct(-5, ...ALL4) }))],
  ramsessConspiracy: [
    trig('turnEnd', 'foes', E.dmg('subject', sv('Intelligence', 25)), {
      when: [has('subject', 'Cursed')]
    })
  ],
  ramsessDeception: [
    trig('turnEnd', 'foes', E.atk('subjectAllies', 100, 1, 'subject'), {
      chance: 30,
      when: [has('subject', 'Cursed')]
    })
  ],
  ramsessPlot: [
    trig('turnEnd', 'foes', E.dmg('subject', sv('Attack', 25)), {
      when: [has('subject', 'Cursed')]
    })
  ],
  masterOfSphinxes: [
    trig('entry', 'self', E.status('self', S('Rebirth')), { when: [isRace('Sphinx')] })
  ],
  essentialDignity: [trig('healed', 'side', E.random('subject', 'buff'), { oncePerTurn: true })],
  abnegation: [trig('healed', 'side', E.dmg('randomFoe', ev(50)))],
  doomAndGloom: [
    {
      type: 'statusConversion',
      params: { from: 'debuff', chance: 50, onto: 'self', redirect: 'reflect' }
    }
  ],
  benefic: [
    trig('healed', 'side', E.status('subject', S('Barrier'), { amount: ev(50) }), {
      oncePerTurn: true
    })
  ],
  absenceOfLight: [trig('healed', 'foes', E.stage('subject', 'lowest', -1))],
  dreamsOfIce: [
    trig('healed', 'side', E.stage('subject', stats('Defense'), 1), { oncePerTurn: true })
  ],
  repetitiveHoliday: [
    trig('turnEnd', 'side', E.kill('self'), { chance: 50, when: [C.notSelf('subject')] }),
    trig('turnEnd', 'side', E.revive('self', 50), { chance: 50, when: [C.dead()] })
  ],
  stayDead: [trig('revived', 'foes', E.dmg('foes', sv('Intelligence', 60)))],
  carnalGenesis: [trig('healed', 'side', E.timeline('subject', 'top'), { chance: 10 })],
  everglow: [side(healing({ received: 100 }))],
  masterOfSpirits: [auraIf('side', [isRace('Spirit')], potencyAll(100))],
  prism: REJECT('spellGem'),
  sunPrayer: REJECT('spellGem'),
  moonPrayer: REJECT('spellGem'),
  christmasIsCanceled: [trig('entry', 'self', E.status('foes', S('Disarmed')))],
  starPrayer: REJECT('spellGem'),
  touchedByTheGods: REJECT('spellGem'),
  endlessly: REJECT('charge'),
  likeSand: REJECT('spellGem'),
  masterOfStags: [auraIf('side', allRace, potencyAll(100))],
  bestKindOfWeather: [trig('entry', 'self', E.temp('side', spell('Snowstorm')))],
  stormToPass: [
    {
      type: 'aura',
      params: {
        scope: 'foes',
        hooks: [{ type: 'skipTurnChance', params: { chance: 20 } }],
        when: healthy
      }
    }
  ],
  powershift: [dmg(100, { when: healthy })],
  damageControl: [{ type: 'aura', params: { scope: 'side', hooks: [taken(-65)], when: healthy } }],
  wastedAge: [negate(100, { source: 'spell', when: healthy })],
  cloudConnected: [
    negate(50, { source: 'spell', when: healthy }),
    { type: 'debuffImmunity', params: { when: healthy } }
  ],
  sailorsWarning: [statWhen(pct(50, ...ALL4), healthy)],
  eyeOfTheStorm: [
    {
      type: 'aura',
      params: { scope: 'side', hooks: [{ type: 'hpFloor', params: { percent: 5 } }], when: healthy }
    }
  ],
  masterOfStorms: [auraIf('side', allRace, potencyAll(50))],
  monsterCrown: [
    trig('turnEnd', 'self', [E.kill('allies'), E.flat('self', 'all', sv('highest', 20))])
  ],
  andYouGetABomb: [trig('entry', 'self', E.status('foes', S('Bomb')))],
  notQuiteADud: REJECT('statusKeep'),
  imminentDanger: [
    trig('attack', 'side', E.potency('other', [S('Bomb')], 20), { when: [has('other', 'Bomb')] })
  ],
  clickClickBoom: [
    trig('defend', 'self', onlyIf(E.burst('foes', [S('Bomb')], 1), has('target', 'Bomb'))),
    trig('provoke', 'self', onlyIf(E.burst('foes', [S('Bomb')], 1), has('target', 'Bomb')))
  ],
  sharingIsCaring: [
    trig('statusDamage', 'foes', E.dmg('subjectAllies', ev(100)), { statusIds: [S('Bomb')] })
  ],
  aGiftForYou: strikeWith('Bomb'),
  spoonorsBreath: [trig('turnEnd', 'self', E.potency('foes', [S('Poisoned')], 50))],
  spoonorsGift: [trig('turnEnd', 'self', E.potency('foes', [S('Bomb')], 50))],
  spoonorsOtherBreath: [trig('turnEnd', 'self', E.potency('foes', [S('Burning')], 50))],
  masterOfToxdwellers: [
    trig('statusDamage', 'foes', E.dmg('subject', ev(100)), {
      statusIds: [S('Bomb')],
      chance: 50,
      chancePer: raceCount('Toxdweller')
    })
  ],
  stomp: [foes({ type: 'interrupt', params: { chance: 35, categories: ATK } })],
  constrict: [
    trig('turnEnd', 'self', [
      E.status('randomFoe', S('Snared')),
      E.status('randomFoe', S('Feared'))
    ])
  ],
  solidarity: REJECT('spellGem'),
  twilight: REJECT('turnDamageTracking'),
  jolt: [trig('turnEnd', 'foes', E.status('subject', S('Stone')))],
  rattle: [
    trig('defend', 'foes', [E.atk('subject'), E.status('subject', S('Stone'))]),
    trig('provoke', 'foes', [E.atk('subject'), E.status('subject', S('Stone'))])
  ],
  shake: [foes({ type: 'interrupt', params: { chance: 35, categories: SPELL } })],
  masterOfTremors: [perRace('Tremor', { stats: pct(25, 'Defense') })],
  mysteryBrew: [
    trig('provoke', 'self', E.cast({ pool: 'global', tags: ['booze'] }), {
      chancePer: cnt('provokes', { max: 5 }),
      chance: 100
    })
  ],
  resin: [trig('turnEnd', 'self', E.dmg('randomFoe', sv('Attack', 75)))],
  misanthropy: [trig('turnEnd', 'self', E.atk('randomFoe', 100, 2))],
  otherworld: [foes({ type: 'indirectDamage', params: { percent: 20 } })],
  yearOfTheTrollboar: [
    trig(
      'provoke',
      'self',
      E.dmg('randomFoe', sv('Intelligence', 25, 'self', cnt('missingHpPercent', { max: 100 })))
    )
  ],
  sadism: [trig('turnEnd', 'self', E.dmg('foes', hpv('current', 15, 'target')))],
  fanOfKnives: [trig('attack', 'allies', E.dmg('other', sv('Speed', 20)))],
  skullBash: [trig('turnEnd', 'self', E.timeline('randomFoe', 'bottom'), { chance: 50 })],
  rudeAwakening: [trig('revived', 'foes', E.dmg('subject', hpv('current', 50, 'subject')))],
  masterOfTrolls: [
    perRace('Troll', { stats: { ...pct(25, 'Attack'), ...pct(-10, 'Intelligence') } })
  ],
  dispossession: [
    side({
      type: 'effectivenessModifier',
      params: { side: 'taken', when: 'superEffective', percent: -50 }
    })
  ],
  mesmer: REJECT('identityChange'),
  capitalize: [
    side({
      type: 'effectivenessModifier',
      params: { side: 'dealt', when: 'superEffective', percent: 75 }
    })
  ],
  quantumFlux: REJECT('identityChange'),
  bloodline: [side(effectiveness('alwaysStrong'))],
  detailsMatter: [side(effectiveness('neverWeak'))],
  masterOfUnguideds: [
    auraIf('side', allRace, {
      type: 'effectivenessModifier',
      params: { side: 'dealt', when: 'superEffective', percent: 150 }
    })
  ],
  circleOfLife: [trig('attack', 'self', E.heal('allies', ev(50)))],
  eruption: [trig('attack', 'self', E.cast({ skillId: spell('Volcano') }), { chance: 50 })],
  divineMending: [trig('attack', 'self', E.heal('lowestHpAlly', ev(200)))],
  chrysaorsAmbition: [trig('attack', 'self', E.random('randomAlly', 'buff', 2))],
  righteousWinds: [
    trig('attack', 'self', E.stage('randomAlly', stats('Attack', 'Intelligence'), stg(50)))
  ],
  spurOfTheHeavens: [trig('attack', 'self', E.timeline('randomAlly', 'top'), { chance: 50 })],
  reinvigoration: [trig('attack', 'self', E.revive('faintedAlly', 50))],
  qilasAssurance: [
    trig('statusEnded', 'side', E.status('subject', S('Invisible')), { statusIds: [S('Barrier')] })
  ],
  qilasDefiance: [side(resist(50, { when: [has('self', 'Barrier')] }))],
  qilasSafeguard: [side(taken(-40, { when: [has('self', 'Barrier')] }))],
  masterOfUnicorns: [side({ type: 'extraHits', params: { count: 2, damagePercent: 100 } })],
  refraction: [trig('spellTargeted', 'side', E.cast({ sameSkill: true, to: 'other' }))],
  goad: [
    {
      type: 'aura',
      params: {
        scope: 'allies',
        hooks: [{ type: 'extraHits', params: { count: 2, damagePercent: 100 } }]
      }
    }
  ],
  savior: [share(50)],
  thorns: [trig('attacked', 'side', E.dmg('other', sv('Attack', 25, 'subject')))],
  illumina: [
    trig(
      'attack',
      'side',
      E.status('subject', S('Barrier'), { amount: hpv('max', 50, 'subject') }),
      { chance: 35 }
    )
  ],
  sentinel: [
    side({ type: 'damageTakenModifier', params: { percent: -15 } }),
    trig('turnEnd', 'side', E.status('subject', S('Taunting'), { turns: 1 }))
  ],
  fightOrFlight: [trig('attacked', 'allies', E.atk('other', 50))],
  secondWind: [trig('attacked', 'side', E.heal('subject', hpv('max', 25, 'subject')))],
  masterOfValkyries: [
    trig('turnEnd', 'side', E.status('subject', S('Defensive'), { turns: 1 }), {
      when: [isRace('Valkyrie', 'subject')]
    })
  ],
  shadowBulwark: [
    negate(50, { source: 'spell' }),
    { type: 'indirectDamage', params: { percent: -90 } }
  ],
  aetherEyes: [side(negate(35, { source: 'attack', when: [has('self', 'Repelling')] }))],
  esotericAlteration: [side(negate(60, { source: 'spell', when: [has('self', 'Repelling')] }))],
  contortion: [
    trig('damaged', 'side', E.dmg('other', ev(50)), { when: [has('subject', 'Repelling')] })
  ],
  returnToSource: [side(resist(50, { when: [has('self', 'Repelling')] }))],
  mindFortress: [
    trig('damaged', 'side', E.status('subject', S('Repelling')), {
      when: [C.cat('special', 'status')]
    })
  ],
  masterOfVoidlords: [auraIf('side', allRace, negate(50, { source: 'spell' }), taken(-30))],
  impedance: [trig('entry', 'self', E.seal('foes'))],
  simulacrum: REJECT('spellNegate'),
  squall: [
    trig('statusGained', 'foes', E.cast({ pool: 'global' }), {
      statusKind: 'debuff',
      oncePerTurn: true
    })
  ],
  stifle: [trig('cast', 'foes', E.status('foes', S('Silenced')))],
  disturbance: REJECT('spellGem'),
  ovularBarrage: [
    trig('attacked', 'self', E.cast({ skillId: spell('Verdant Spheres'), to: 'other' }))
  ],
  mindbender: [side(negate(30, { source: 'spell' }))],
  spiralWard: [
    scaling(cnt('missingHpPercent'), { damageTaken: -2 }, { cap: 90, categories: SPELL })
  ],
  expansion: [trig('damaged', 'self', E.flat('self', stats('Attack'), ev(50)))],
  masterOfVortexes: [
    trig('entry', 'self', E.trait('side', { traitId: 'spiralWard' }), { when: [isRace('Vortex')] })
  ],
  metaphysics: [
    side(dmg(75, { categories: SPELL, when: [{ if: 'skillSameElement', value: false }] }))
  ],
  zerda: REJECT('spellGem'),
  corsac: REJECT('spellGem'),
  naturalization: REJECT('spellGem'),
  lagopus: REJECT('spellGem'),
  cana: REJECT('spellGem'),
  velox: REJECT('spellGem'),
  pallida: REJECT('spellGem'),
  cyhrasAdamance: [side(scaling(cnt('revivals'), { damageDealt: 50 }))],
  cyhrasResilience: [side(scaling(cnt('faintedAllies'), { damageTaken: -15 }))],
  cyhrasTrust: [side(scaling(cnt('faintedAllies'), { damageDealt: 25 }))],
  masterOfVulpeses: REJECT('spellGem'),
  endlessSwarm: [
    trig('attack', 'self', onlyIf(E.revive('faintedAllies', 50), isRace('Waspid', 'target')), {
      chance: 50
    })
  ],
  hiveMind: [trig('attack', 'self', E.atk('other', 30, 1, 'allies'), { when: own })],
  infiltration: [perRace('Waspid', { stats: pct(20, 'Speed') })],
  swarmSr: [{ type: 'startPosition', params: { position: 'top', chance: 4 } }],
  gore: [
    trig('attack', 'side', [E.status('other', S('Poisoned')), E.status('other', S('Bleeding'))], {
      when: [isRace('Waspid', 'subject')]
    })
  ],
  finalSting: [
    dmg(300, { categories: ATK }),
    trig('attack', 'self', E.kill('self'), { when: own })
  ],
  disposability: REJECT('statusKeep'),
  masterOfWaspids: [
    trig(
      'entry',
      'self',
      [E.trait('side', { traitId: 'finalSting' }), E.trait('side', { traitId: 'endlessSwarm' })],
      { when: allRace }
    )
  ],
  baffle: [bonus(sv('Intelligence', 25))],
  affluence: REJECT('spellGem'),
  sycophant: [scaling(cnt('faintedDiff'), { damageDealt: 125 })],
  boingBoingBoing: [trig('attacked', 'self', E.atk('randomFoe', 50, 3))],
  prowess: [scaling(cnt('elementOnSide', { elementIds: [CLASS.Sorcery] }), { damageDealt: 50 })],
  gulper: [scaling(cnt('statuses'), { damageDealt: 50 })],
  outnumbered: [scaling(cnt('livingDiff'), { damageDealt: 125 })],
  subjugation: [bonus(sv('Defense', 25))],
  medierrasMockery: [
    trig('defend', 'foes', E.defend('side'), { chance: 50 }),
    trig('provoke', 'foes', E.provoke('side'), { chance: 50 })
  ],
  medierrasReliance: [
    trig('attack', 'allies', E.atk('other'), { chance: 30, when: own }),
    trig('defend', 'allies', E.defend(), { chance: 30 }),
    trig('provoke', 'allies', E.provoke(), { chance: 30 })
  ],
  medierrasStruggle: [
    trig('attack', 'side', E.extra('subject'), {
      oncePerTurn: true,
      when: [C.hpBelow('subject', 50), C.own()]
    })
  ],
  masterOfWatchers: REJECT('countBonus'),
  undeath: [trig('faint', 'self', E.revive('self', 100), { chance: 50 })],
  coldLikeWar: [
    trig('revived', 'foes', [E.atk('subject', 100, 2), E.status('subject', S('Frozen'))])
  ],
  woe: [trig('faint', 'self', E.dmg('foes', hpv('max', 30, 'self')))],
  noHeadNecessary: [trig('turnEnd', 'foes', E.atk('subject'), { chance: 50, when: [C.dead()] })],
  praiseTheLight: [trig('revived', 'side', E.cast({ skillId: spell('Holy Nova') }))],
  resurrectionCode: [trig('faint', 'self', E.revive('faintedAllies', 50), { chance: 50 })],
  afterlife: [
    trig('faint', 'self', [E.revive('self', 50), E.stage('self', 'all', stg(50))], {
      oncePerBattle: true
    })
  ]
}
