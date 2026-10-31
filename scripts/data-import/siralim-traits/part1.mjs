/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 1 (thứ tự trong traits-planned.json lúc soạn: 0–199).
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
  critDamage,
  dodge,
  undodgeable,
  noCrit,
  negate,
  extraHits,
  repeat,
  bonus,
  resist,
  intercept,
  potencyAll,
  trig,
  E,
  C,
  REJECT,
  spell,
  onlyIf
} from './dsl.mjs'

const S = (name) => ST[name]
const has = (who, ...names) => C.has(who, names.map(S))
const lacks = (who, ...names) => C.lacks(who, names.map(S))
/** "Đòn đánh gây thêm 75% sát thương và gây X lên mục tiêu". */
const strikeWith = (name) => [
  dmg(75, { categories: ATK }),
  trig('attack', 'self', E.status('other', S(name)))
]
/** "Địch dính A hoặc B thì gây nốt cái còn lại". */
const pair = (a, b) => [
  trig('statusGained', 'foes', E.status('subject', S(b)), { statusIds: [S(a)] }),
  trig('statusGained', 'foes', E.status('subject', S(a)), { statusIds: [S(b)] })
]
/** "Đánh địch đang có X: +p% sát thương, hút 100% sát thương, gỡ X". */
const consumeStatus = (name, percent) => [
  dmg(percent, { categories: ATK, when: [has('target', name)] }),
  trig('attack', 'self', [E.heal('self', ev(100)), E.remove('other', 'debuff', S(name))], {
    when: [has('other', name)]
  })
]
const ofRace = (siralimRace) => [race(siralimRace)]
const raceCount = (siralimRace) => cnt('raceOnSide', { raceIds: ofRace(siralimRace) })
const isRace = (siralimRace, who = 'self') => C.race(who, ofRace(siralimRace))
const own = [C.own()]
const ALL4 = ['Attack', 'Intelligence', 'Defense', 'Speed']
const dodged = (effects) => [trig('dodged', 'self', effects), dodge(50)]

export const CONVERSIONS = {
  frailty: consumeStatus('Vulnerable', 100),
  fleshRot: pair('Weak', 'Vulnerable'),
  extraPadding: [
    trig('entry', 'self', E.status('self', S('Barrier'), { amount: sv('highest', 200) }))
  ],
  wretchedness: [
    side(
      undodgeable({ categories: ATK, when: [has('target', 'Vulnerable')] }),
      critChance(50, { categories: ATK, when: [has('target', 'Vulnerable')] })
    )
  ],
  manipulateFear: [
    foes(
      statWhen(pct(-50, 'Attack'), [has('self', 'Weak')]),
      noCrit({ when: [has('self', 'Weak')] })
    )
  ],
  turnToGray: [trig('attacked', 'self', E.status('foes', S('Vulnerable')))],
  quell: [
    dmg(100, { categories: ATK, when: [has('target', 'Vulnerable')] }),
    trig('attack', 'self', E.kill('other'), {
      when: [has('other', 'Vulnerable'), C.dmgAbove(35, 'other')]
    })
  ],
  sinAndSentence: [
    trig('attack', 'self', E.kill('other'), {
      chance: 50,
      when: [C.has('other', [S('Weak'), S('Vulnerable')], true)]
    })
  ],
  masterOfAbominations: [auraIf('foes', [C.allRace()], dmg(-50), taken(100))],
  slosh: [trig('cast', 'side', E.random('randomFoe', 'debuff'), { when: own })],
  drinkingGame: [trig('turnEnd', 'foes', E.kill('subject'), { chance: 5 })],
  alcoholism: [
    trig('statusGained', 'foes', E.timeline('subject', 'bottom'), {
      statusKind: 'debuff',
      chance: 10
    })
  ],
  drunkenRage: [
    trig('turnEnd', 'foes', E.atk('subjectAllies', 100, 1, 'subject'), {
      chance: 5,
      chancePer: cnt('debuffs', { who: 'subject' })
    })
  ],
  numbedPain: [side(negate(5, { source: 'skill', per: cnt('debuffs') }))],
  falseEpiphany: REJECT('charge'),
  bobAndWeave: [side(dodge(25, { per: cnt('buffs', { who: 'attacker' }) }))],
  hangover: [trig('turnEnd', 'foes', E.cast({ pool: 'global', tags: ['booze'] }), { chance: 35 })],
  hangoverCure: [
    trig('healed', 'foes', E.kill('subject'), {
      chance: 3,
      chancePer: cnt('debuffs', { who: 'subject' }),
      when: [C.sameSide('other')]
    })
  ],
  drunkenBrawler: [trig('dodged', 'side', E.atk('other', 40, 1, 'subject'))],
  masterOfAlementals: [
    trig('entry', 'self', E.temp('self', { tags: ['booze'], count: 2 }), { when: [C.allRace()] })
  ],
  incandescence: [trig('entry', 'self', E.maxHp('self', sv('Defense', 100)))],
  mementoMori: [trig('attacked', 'self', E.dmg('other', sv('Defense', 75)))],
  soulstoneSplinter: [trig('attacked', 'side', E.stage('subject', stats('Defense'), stg(20)))],
  collectiveUnconscious: [
    trig('statGain', 'side', E.stage('subject', stats('Attack'), 1), { oncePerTurn: true })
  ],
  jailbreak: [side(statMod(pct(40, 'Defense')))],
  crystallization: [trig('cast', 'self', E.stage('side', stats('Defense'), stg(15)))],
  solarFlare: [
    trig('attacked', 'self', E.cast({ skillId: spell('Stellar Flare'), to: 'other' }), {
      when: [C.defending()]
    }),
    trig('attacked', 'self', E.cast({ skillId: spell('Stellar Flare'), to: 'other' }), {
      when: [C.provoking()]
    })
  ],
  exaltedDetriment: [side(bonus(sv('Defense', 30), { categories: ATK }))],
  masterOfAmaranths: [
    trig('entry', 'self', E.flat('allies', stats('Defense'), sv('Defense', 15)), {
      when: [C.allRace()]
    })
  ],
  multistrike: [side(extraHits(1, 70))],
  multicast: [side(repeat(1, SPELL, 70))],
  unrealizedPotential: REJECT('netZero'),
  unbiddenMiracle: REJECT('netZero'),
  carefulWhatYouWishFor: [
    side({ type: 'statusDuration', params: { kind: 'buff', turns: 1, on: 'received' } }),
    trig('statusGained', 'side', E.random('subject', 'buff'), {
      statusKind: 'buff',
      oncePerTurn: true
    })
  ],
  grimAilment: [
    side({ type: 'statusDuration', params: { kind: 'debuff', turns: 1, on: 'inflicted' } }),
    trig('statusInflicted', 'side', E.random('other', 'debuff'), { oncePerTurn: true })
  ],
  masterOfAmphisbaena: [auraIf('side', [C.allRace()], potencyAll(100))],
  handOfLight: [
    dmg(75, { categories: ATK }),
    trig('attack', 'self', E.status('self', S('Shelled')))
  ],
  scourge: strikeWith('Weak'),
  pyre: strikeWith('Burning'),
  stasis: strikeWith('Confused'),
  rime: strikeWith('Frozen'),
  blackHoleHalo: strikeWith('Scorned'),
  soulToKeep: [
    dmg(75, { categories: ATK }),
    trig('attack', 'self', E.trait('self', { copyFrom: 'other' }))
  ],
  stormOfTheCentury: [trig('attack', 'self', E.cast({ skillId: spell('Lightning Storm') }))],
  finalActOfHatred: REJECT('spellGem'),
  finalActOfJudgement: [
    trig(
      'turnEnd',
      'self',
      E.dmg('foes', hpv('current', 2, 'target', cnt('missingHpPercent', { max: 17.5 })))
    )
  ],
  finalActOfMercy: [trig('turnEnd', 'self', E.kill('foes', 25))],
  masterOfAngels: REJECT('innateCombination'),
  brilliantCreation: [
    scaling(cnt('faintedAllies'), { stats: pct(15, 'Attack', 'Intelligence') }),
    scaling(cnt('livingAllies'), { stats: pct(15, 'Defense', 'Speed') })
  ],
  primedAndReady: [
    trig('cast', 'foes', E.atk('subject', 300), { when: [C.skillTarget('allEnemies')] })
  ],
  threshold: [
    trig('attack', 'self', [E.status('other', S('Scorned')), E.status('other', S('Disarmed'))])
  ],
  vigilance: [intercept()],
  longLive: [scaling(cnt('missingHpPercent'), { damageTaken: -2 }, { cap: 90, categories: ATK })],
  grit: [
    trig('entry', 'self', [
      E.maxHp('self', sv('Attack', 100)),
      E.flat('self', stats('Defense'), sv('Attack', 100)),
      E.lose('self', stats('Attack'), sv('Attack', 90))
    ])
  ],
  necessitarianism: [trig('entry', 'self', E.stage('self', 'all', stg(100))), dmg(-70)],
  righteousConcession: [side(resist(50))],
  crunch: strikeWith('Vulnerable'),
  masterOfApises: [
    trig('entry', 'self', E.trait('side', { traitId: 'longLive' }), { when: [C.allRace()] })
  ],
  urhHarbinger: [side(scaling(cnt('turnsTaken'), { stats: pct(15, ...ALL4) }))],
  urdoxHarbinger: [side(scaling(cnt('turnsTaken'), { critDamage: 50 }))],
  culmination: [side(scaling(cnt('sideCasts'), { damageDealt: 5 }, { categories: SPELL }))],
  quahnHarbinger: [side(resist(25, { per: cnt('turnsTaken') }))],
  naxorHarbinger: [side(scaling(cnt('turnsTaken'), { damageDealt: 40 }))],
  mungusHarbinger: [side(scaling(cnt('turnsTaken'), { damageTaken: -10 }, { cap: 90 }))],
  phaseOut: [side(negate(5, { per: cnt('turnsTaken', { max: 10 }) }))],
  giftOfCharybdis: [
    trig('faint', 'side', [
      E.flat('side', stats('Intelligence'), sv('Intelligence', 25, 'subject')),
      E.flat('side', stats('Defense'), sv('Defense', 25, 'subject'))
    ])
  ],
  tornBetweenScyllaAndCharybdis: [trig('faint', 'side', E.trait('side', { copyFrom: 'subject' }))],
  masterOfApocalypses: [
    trig('attack', 'self', E.extra(), { oncePerTurn: true, when: [C.own(), C.allRace()] }),
    trig('cast', 'self', E.extra(), { oncePerTurn: true, when: [C.own(), C.allRace()] })
  ],
  consume: consumeStatus('Snared', 150),
  hereToDie: pair('Bleeding', 'Poisoned'),
  hopelessness: [foes(taken(50, { when: [has('self', 'Snared')] }))],
  numbingVenom: [
    trig('statusDamage', 'foes', E.status('subject', S('Snared')), {
      statusIds: [S('Poisoned')],
      chance: 50
    })
  ],
  entrapment: [trig('attacked', 'self', E.status('other', S('Snared')))],
  jaggedEdges: [
    trig('turnEnd', 'any', onlyIf(E.dmg('foes', sv('Speed', 10)), has('target', 'Snared')))
  ],
  spitPoison: [
    trig('attacked', 'self', [
      onlyIf(E.potency('foes', [S('Poisoned')], 30), has('target', 'Poisoned')),
      onlyIf(E.status('foes', S('Poisoned')), lacks('target', 'Poisoned'))
    ])
  ],
  arachnophobia: [
    foes({ type: 'statusDamageModifier', params: { statusIds: [S('Poisoned')], percent: 65 } })
  ],
  masterOfArachnalisks: [
    foes({ type: 'statusDamageModifier', params: { statusIds: [S('Poisoned')], percent: 20 } })
  ],
  callOfTheHarvest: [side(dodge(25)), dodge(50)],
  callOfEvolution: dodged(E.cast({ pool: 'ownSpell' })),
  callOfTheGrave: dodged(E.stage('foes', 'highest', -stg(20))),
  callOfTheAspect: [
    dodge(12, { per: raceCount('Aspect') }),
    trig('dodged', 'self', onlyIf(E.stage('side', 'all', 1), isRace('Aspect', 'target')))
  ],
  callOfTheBloom: dodged(E.heal('side', hpv('max', 30, 'target'))),
  callOfTheSolstice: dodged(E.atk('other')),
  callOfTime: dodged(E.status('self', S('Barrier'), { amount: sv('Speed', 50) })),
  callOfTheTundra: dodged(E.cast({ skillId: spell('Snowstorm') })),
  crownPrinceSyndrome: [trig('dodged', 'self', E.defend()), trig('crit', 'self', E.defend())],
  neverYield: [
    crit(),
    { type: 'skipTurnChance', params: { chance: 100 } },
    trig('turnEnd', 'self', E.status('self', S('Defensive'), { turns: 1 }))
  ],
  standAloneComplex: [
    dodge(90),
    { type: 'skipTurnChance', params: { chance: 100 } },
    trig('turnEnd', 'self', E.status('self', S('Taunting'), { turns: 1 }))
  ],
  masterOfAspects: [
    side(dodge(50, { when: [isRace('Aspect')] }), taken(-25, { when: [isRace('Aspect')] }))
  ],
  thirstForBlood: [trig('crit', 'side', E.heal('subject', ev(100)))],
  ferocity: [side(critChance(25, { categories: ATK }), critChance(25))],
  markedWithBlood: [trig('crit', 'allies', E.atk('other'), { when: [C.cat('physical')] })],
  sidewinder: [trig('crit', 'self', E.atk('other'), { chance: 75 })],
  pummel: [critDamage(200)],
  lacerate: [
    trig('crit', 'side', [E.status('other', S('Silenced')), E.status('other', S('Bleeding'))])
  ],
  quadhits: [extraHits(3, 30), trig('crit', 'self', E.kill('other'), { chance: 10 })],
  masterOfAsuras: [auraIf('side', [C.allRace()], potencyAll(200))],
  momentum: [trig('turnEnd', 'self', E.lose('foes', stats('Speed'), sv('Speed', 15)))],
  motivation: [trig('turnEnd', 'self', E.lose('foes', stats('Attack'), sv('Attack', 15)))],
  euphoria: [
    trig('turnEnd', 'self', E.lose('foes', stats('Intelligence'), sv('Intelligence', 15)))
  ],
  instigation: [trig('turnEnd', 'self', E.lose('foes', stats('Defense'), sv('Defense', 15)))],
  pandemic: [trig('turnEnd', 'self', E.random('foes', 'debuff'))],
  battleFromWithin: [trig('turnEnd', 'self', E.dmg('foes', hpv('missing', 25)))],
  downturn: [trig('turnEnd', 'self', E.cure('foes', 'buff', 1))],
  masterOfAutomatons: [auraIf('side', [C.allRace()], potencyAll(100))],
  periphery: [side(crit(), dodge(90), taken(50))],
  trickShot: [trig('attack', 'self', E.cast({ pool: 'own', tags: ['arrow'], times: 3 }))],
  pandora: REJECT('spellGem'),
  wintermaul: [
    trig('turnEnd', 'self', E.cast({ skillId: spell('Snowstorm') })),
    trig('attack', 'side', E.cast({ skillId: spell('Shatter'), to: 'other' }), {
      when: [has('other', 'Frozen')]
    })
  ],
  theNether: [
    trig('turnEnd', 'allies', E.atk('randomFoe'), { when: [C.el('subject', [CLASS.Chaos])] }),
    trig('turnEnd', 'allies', E.random('foes', 'debuff'), {
      when: [C.el('subject', [CLASS.Death])]
    }),
    trig('turnEnd', 'allies', E.random('side', 'buff'), { when: [C.el('subject', [CLASS.Life])] }),
    trig('turnEnd', 'allies', E.stage('side', 'all', 1), {
      when: [C.el('subject', [CLASS.Nature])]
    }),
    trig('turnEnd', 'allies', E.cast({ pool: 'ownSpell' }), {
      when: [C.el('subject', [CLASS.Sorcery])]
    })
  ],
  avengedSevenfold: REJECT('spellFamily'),
  theBlack: [
    trig('turnEnd', 'self', [
      E.status('foes', S('Poisoned')),
      E.status('foes', S('Blighted')),
      E.status('foes', S('Leeching')),
      E.status('foes', S('Mending'))
    ])
  ],
  eraser: [trig('attack', 'side', E.maxHp('other', ev(100), true))],
  perfectImperfection: [
    side(scaling(cnt('turnsTaken'), { damageDealt: 40, damageTaken: -10 })),
    trig('entry', 'self', E.temp('side', spell('Timewalk')))
  ],
  marigold: REJECT('statCap'),
  bloodPact: [side(bonus({ record: 'damageDealt', of: 'self', percent: 5, side: true }))],
  euthanasia: [
    trig('attack', 'self', E.cast({ skillId: spell('Death Siphon'), to: 'other' }), {
      when: [C.hpBelow('other', 50)]
    })
  ],
  brothel: [trig('entry', 'self', E.trait('allies', { copyFrom: 'self' }))],
  prayerPosition: [
    side(taken(-90, { when: [C.defending()] })),
    trig('turnEnd', 'side', E.status('subject', S('Defensive'), { turns: 1 }))
  ],
  theEnd: [trig('turnEnd', 'foes', E.dmg('subject', sv('highest', 40)))],
  lingeringEssence: [scaling(cnt('alliesOnField'), { damageTaken: -18 })],
  iHateYouIngAll: [foes(dmg(-90))],
  soulReaver: [
    trig('attack', 'self', [E.move('other', 'self', 'buff'), E.move('self', 'other', 'debuff')]),
    side({ type: 'statusDuration', params: { kind: 'buff', turns: null, on: 'received' } }),
    foes({ type: 'statusDuration', params: { kind: 'debuff', turns: null, on: 'received' } })
  ],
  lune: [trig('cast', 'side', E.cast({ pool: 'global' }))],
  firelord: [side(scaling(cnt('attacks'), { damageDealt: 20 }, { categories: ATK }))],
  theTruth: REJECT('artifact'),
  expandedPower: [side(dmg(100, { categories: SPELL }))],
  empoweredDeathSiphon: [trig('entry', 'self', E.temp('self', spell('Death Siphon')))],
  empoweredMagicMissile: [
    trig('entry', 'self', E.temp('self', spell('Magic Missile'))),
    trig('cast', 'self', E.cast({ sameSkill: true, to: 'other', times: 3 }), {
      when: [C.own(), C.skill(spell('Magic Missile'))]
    })
  ],
  empoweredFireball: [
    trig('entry', 'self', E.temp('self', spell('Fireball'))),
    trig('cast', 'self', E.cast({ sameSkill: true, to: 'other' }), {
      when: [C.own(), C.skill(spell('Fireball'))],
      chance: 75,
      repeatChance: 75
    })
  ],
  empoweredBoneSpear: [
    trig('entry', 'self', E.temp('self', spell('Bone Spear'))),
    trig('cast', 'self', E.cast({ sameSkill: true, to: 'other' }), {
      when: [C.own(), C.skill(spell('Bone Spear'))]
    })
  ],
  tempest: [
    trig('cast', 'side', E.cast({ sameSkill: true, to: 'subjectAllies' }), {
      chance: 20,
      when: [C.single(), C.own()]
    })
  ],
  empoweredSavageSpores: [trig('entry', 'self', E.temp('self', spell('Savage Spores')))],
  empoweredChainLightning: [trig('entry', 'self', E.temp('self', spell('Chain Lightning')))],
  empoweredDeathBlossom: [trig('entry', 'self', E.temp('self', spell('Death Blossom')))],
  empoweredSoulSacrifice: [trig('entry', 'self', E.temp('self', spell('Soul Sacrifice')))],
  vlorasHaunting: [
    trig('timelineTop', 'self', [
      E.status('allies', S('Invisible')),
      E.status('allies', S('Savage'))
    ])
  ],
  vlorasLies: [trig('timelineTop', 'self', E.minion('allies'))],
  vlorasTrick: [trig('timelineTop', 'self', E.dmg('foes', sv('highest', 50)))],
  masterOfBanshees: [
    trig('turnEnd', 'self', E.status('foes', S('Scorned')), { when: [C.allRace()] })
  ],
  songOfAlacrity: [
    side({ type: 'attackStat', params: { stat: 'speed', weight: 50, categories: ATK } })
  ],
  christmasMusicSucks: REJECT('barrierPotency'),
  fable: [side(scaling(cnt('raceOnSide', { raceIds: ['deity'] }), { damageDealt: 25 }))],
  songOfResolve: [
    side({ type: 'attackStat', params: { stat: 'defense', weight: 50, categories: ATK } })
  ],
  songOfWit: [
    side({ type: 'attackStat', params: { stat: 'spAttack', weight: 50, categories: ATK } })
  ],
  hymnOfGuile: [foes({ type: 'statusImmunity', params: { statusIds: [S('Invisible')] } })],
  hymnOfPanic: [{ type: 'startPosition', params: { position: 'top', chance: 50 } }],
  hymnOfStrength: [side({ type: 'stageMultiplier', params: { loss: 0.5 } })],
  masterOfBards: [auraIf('side', [C.allRace()], potencyAll(100), critChance(50))],
  awakening: [trig('turnEnd', 'self', E.cast({ pool: 'ownSpell' }), { when: [C.noDmg()] })],
  hereUntilForever: [
    trig('turnEnd', 'self', [E.heal('self', hpv('max', 100)), E.status('self', S('Rebirth'))], {
      when: [C.noDmg()]
    })
  ],
  sluice: [trig('turnEnd', 'self', E.cast({ pool: 'ownSpell', times: 3 }), { when: [C.noDmg()] })],
  runFree: [trig('turnEnd', 'self', E.atk('foes'), { when: [C.noDmg()] })],
  noSuddenMovement: [
    trig(
      'turnEnd',
      'self',
      [E.status('foes', S('Snared')), E.stage('foes', stats('Speed'), -stg(30))],
      {
        when: [C.noDmg()]
      }
    )
  ],
  heatedIchor: [trig('turnEnd', 'self', E.dmg('foes', hpv('current', 50)), { when: [C.noDmg()] })],
  sap: [trig('turnEnd', 'self', E.seal('foes', 4), { when: [C.noDmg()] })],
  masterOfBasilisks: [auraIf('side', [C.allRace()], negate(20))],
  amongstGods: [trig('attack', 'allies', E.revive('faintedAlly', 50), { chance: 20 })],
  bombardment: [trig('attack', 'allies', E.dmg('other', sv('Attack', 35)))],
  darkPassenger: [
    trig('attack', 'allies', E.cast({ skillId: spell('Necrosis'), to: 'other' }), { chance: 35 })
  ],
  cloudOfBats: [trig('attack', 'allies', E.atk('other'), { chance: 50, when: [C.own()] })],
  screechingBarrage: [trig('attack', 'allies', E.dmg('foes', sv('Speed', 25)))],
  vampiricAura: [trig('attack', 'allies', E.heal('side', ev(25)))],
  echolocation: [trig('attack', 'allies', E.stage('self', stats('Speed'), stg(7)))],
  sluuurp: [trig('attack', 'allies', E.random('other', 'debuff'))],
  bloodSucker: [trig('attack', 'allies', E.heal('self', ev(100)))],
  masterOfBats: [
    trig('attack', 'side', E.atk('other', 100, 1, 'subject'), {
      chance: 50,
      repeatChance: 50,
      when: [isRace('Bat', 'subject'), C.own()]
    })
  ],
  overkill: [
    trig('attack', 'self', E.dmg('otherFoes', ev(70)), { when: [C.dmgAbove(35, 'other')] })
  ],
  ultimatum: [
    trig('attack', 'self', [
      E.dmg('other', hpv('current', 50)),
      E.dmg('otherFoes', hpv('current', 50))
    ])
  ],
  wallop: [
    trig('attack', 'self', [
      E.stage('other', stats('Defense'), -stg(30)),
      E.stage('otherFoes', stats('Defense'), -stg(30))
    ])
  ],
  wreckingBall: [
    trig('attack', 'self', [E.status('other', S('Vulnerable')), E.status('other', S('Stone'))])
  ],
  independence: [crit({ categories: ATK }), dodge(30)],
  sweepingSmash: [trig('attack', 'self', E.dmg('otherFoes', ev(70)))],
  kirisuteGomen: [
    trig('attack', 'self', [E.kill('other'), E.kill('self')], { when: [C.dmgAbove(25, 'other')] })
  ],
  brainBash: [
    trig('attack', 'self', [E.status('other', S('Confused'))]),
    trig('attack', 'self', E.status('otherFoes', S('Confused')), { chance: 50 })
  ],
  masterOfBrownies: [auraIf('side', [C.allRace()], extraHits(1, 100, ['physical']), dmg(-50))],
  thirstForPower: [
    trig('cast', 'side', E.random('subject', 'buff'), { chance: 7, chancePer: cnt('totalCasts') })
  ],
  paramount: [
    trig('damaged', 'self', E.cast({ pool: 'ownSpell' }), {
      chance: 2,
      chancePer: cnt('totalCasts'),
      oncePerTurn: true
    })
  ],
  magicBarrier: [
    side({ type: 'debuffImmunity', params: { when: [C.atLeast(cnt('sideCasts'), 12)] } })
  ],
  annex: [scaling(cnt('totalCasts'), { stats: pct(5, 'Intelligence') })],
  nirvana: [dmg(50, { categories: SPELL, when: [C.atLeast(cnt('sideCasts'), 7)] })],
  absolutePower: [scaling(cnt('totalCasts'), { damageDealt: 5 }, { categories: ATK })],
  vitjasGames: [trig('faint', 'self', E.cast({ pool: 'global', times: 10 }))],
  vitjasSurprise: [
    trig('faint', 'self', E.cast({ pool: 'ownSpell', times: 3 })),
    trig('revived', 'self', E.cast({ pool: 'ownSpell', times: 3 }))
  ],
  vitjasRevenge: [trig('revived', 'self', E.cast({ pool: 'ownSpell', times: 5 }))]
}
