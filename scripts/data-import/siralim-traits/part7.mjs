/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 7 (thứ tự lúc soạn: 1199–1399).
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
  dodge,
  negate,
  healing,
  bonus,
  resist,
  potencyAll,
  lifesteal,
  intercept,
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
const ofRace = (r) => [race(r)]
const raceCount = (r) => cnt('raceOnSide', { raceIds: ofRace(r) })
const isRace = (r, who = 'self') => C.race(who, ofRace(r))
const ALL4 = ['Attack', 'Intelligence', 'Defense', 'Speed']
const allRace = [C.allRace()]
const own = [C.own()]
const gainAll4 = (percent, to, of) =>
  ALL4.map((name) => E.flat(to, stats(name), sv(name, percent, of)))
/** "Sau khi bị trúng đòn thì xuống cuối Timeline" (họ Wisp). */
const fragile = trig('damaged', 'self', E.timeline('self', 'bottom'))
const zantai = (extra) => [trig('entry', 'self', E.temp('self', spell('Mega Magic'))), ...extra]
const megaMagic = [C.skill(spell('Mega Magic'))]

export const CONVERSIONS = {
  darkEmbrace: [trig('faint', 'side', gainAll4(25, 'self', 'subject'))],
  lastStandSr: [trig('faint', 'self', E.atk('randomFoe', 100, 5))],
  shacklersDomination: [
    trig(
      'entry',
      'self',
      onlyIf(E.trait('allies', { copyFrom: 'self' }), C.race('target', ofRace('Shade'))),
      {
        when: [isRace('Shade')]
      }
    )
  ],
  shacklersMastery: REJECT('countBonus'),
  shacklersTrance: [
    dmg(-100, { when: [C.reactive(false)] }),
    dmg(200, { when: [C.reactive(true)] })
  ],
  masterOfWights: [
    trig(
      'revived',
      'side',
      [E.heal('subject', hpv('max', 100, 'subject')), E.status('subject', S('Shelled'))],
      { when: [isRace('Wight', 'subject')] }
    )
  ],
  lyra: [
    { type: 'extraHits', params: { count: 3, damagePercent: 100 } },
    { type: 'repeatSkill', params: { extra: 3, categories: SPELL } },
    fragile
  ],
  overpowered: [dmg(100), fragile],
  ethereal: [{ type: 'debuffImmunity', params: {} }, taken(-50), fragile],
  poof: [crit(), dodge(90), fragile],
  theVirtueOfPatience: [trig('turnEnd', 'self', E.random('side', 'buff', 3)), fragile],
  spasm: [trig('turnEnd', 'self', E.cast({ pool: 'ownSpell', times: 5 })), fragile],
  masterOfWisps: [
    auraIf('side', allRace, negate(25)),
    trig('turnEnd', 'self', E.status('self', S('Shelled')), { when: allRace })
  ],
  ditto: REJECT('spellFamily'),
  soulSucker: [trig('cast', 'side', E.heal('subject', ev(30)), { when: [C.cat('special')] })],
  camaraderie: [
    trig('defend', 'self', [
      onlyIf(
        E.status('self', S('Barrier'), { amount: hpv('max', 100) }),
        C.lacks('target', [S('Barrier')])
      ),
      onlyIf(
        E.status('randomAlly', S('Barrier'), { amount: hpv('max', 100, 'self') }),
        has('self', 'Barrier')
      )
    ])
  ],
  colorblind: REJECT('spellFamily'),
  fraud: REJECT('spellFamily'),
  echoingIncantation: [
    trig('cast', 'self', E.cast({ sameSkill: true, to: 'other' }), {
      chance: 35,
      repeatChance: 35,
      when: [C.single(), C.own()]
    })
  ],
  bottomFeeder: REJECT('spellFamily'),
  prey: REJECT('spellFamily'),
  whimsical: REJECT('spellFamily'),
  furnessDecadence: REJECT('charge'),
  furnessInstability: [trig('turnEnd', 'self', E.cast({ pool: 'own', tags: ['booze'] }))],
  furnessStupor: [dmg(100, { when: [C.tag('booze')] })],
  masterOfWolpertingers: REJECT('spellFamily'),
  wingsOfDespair: [
    {
      type: 'statusConversion',
      params: { from: 'buff', chance: 50, onto: 'foe', redirect: 'steal' }
    }
  ],
  fallenStar: REJECT('statRedirect'),
  deepInhalation: [
    trig('cast', 'foes', E.cast({ sameSkill: true }), {
      chance: 50,
      when: [C.skillTarget('allEnemies')]
    })
  ],
  bounce: [
    trig('spellTargeted', 'side', E.cast({ sameSkill: true, to: 'randomFoe' }), { chance: 50 })
  ],
  currents: [trig('statGain', 'foes', E.random('subject', 'debuff'))],
  spellStealer: [
    trig('cast', 'foes', E.cast({ sameSkill: true }), {
      chance: 50,
      when: [C.skillTarget('allAllies')]
    })
  ],
  masterOfWyverns: [side(taken(-80, { categories: SPELL, when: [isRace('Wyvern')] }))],
  winterHasCome: [trig('entry', 'self', E.status('randomFoe', S('Frozen'), { count: 2 }))],
  thermalVoid: [foes(taken(50, { when: [has('self', 'Frozen')] }))],
  iceNova: [trig('provoke', 'self', E.status('foes', S('Frozen')), { chance: 50 })],
  brainFreeze: [trig('attacked', 'self', E.status('other', S('Frozen')))],
  lingeringFrost: [
    trig('statusEnded', 'foes', E.status('subject', S('Snared')), { statusIds: [S('Frozen')] })
  ],
  frostBreath: [
    trig('dodged', 'self', E.status('foes', S('Frozen')), { chance: 50 }),
    trig('crit', 'self', E.status('foes', S('Frozen')), { chance: 50 })
  ],
  coldSnap: [
    dmg(300, { when: [has('target', 'Frozen')] }),
    trig('attack', 'self', E.remove('other', 'debuff', S('Frozen')), {
      when: [has('other', 'Frozen')]
    })
  ],
  vextsAntiquity: [foes({ type: 'stageMultiplier', params: { loss: 1.5 } })],
  vextsBoldness: REJECT('statCap'),
  vextsInvocation: [side({ type: 'stageMultiplier', params: { gain: 1.5 } })],
  masterOfYetis: [trig('entry', 'self', E.status('foes', S('Frozen')), { when: allRace })],
  zantaisBoon: zantai([trig('cast', 'side', E.random('side', 'buff', 3), { when: megaMagic })]),
  zantaisCall: zantai([trig('cast', 'side', E.minion('side', 3), { when: megaMagic })]),
  zantaisCunning: zantai([
    side({
      type: 'scaling',
      params: {
        per: cnt('turnsOnField', { max: 1, bonus: 1 }),
        effect: { defenseIgnored: 15 },
        when: megaMagic
      }
    })
  ]),
  zantaisEmbrace: zantai([trig('cast', 'side', E.heal('side', ev(100)), { when: megaMagic })]),
  zantaisEnvy: zantai([trig('cast', 'side', E.random('foes', 'debuff', 3), { when: megaMagic })]),
  zantaisHavoc: zantai([side(dmg(200, { when: megaMagic }))]),
  zantaisInhibition: zantai([
    trig('cast', 'side', E.stage('foes', 'all', -1), { when: megaMagic })
  ]),
  zantaisPerfection: REJECT('charge'),
  zantaisStratagem: zantai([
    side({ type: 'attackStat', params: { stat: 'highest', weight: 100, categories: ['special'] } })
  ]),
  zantaisReign: zantai([trig('cast', 'side', E.stage('side', 'all', 1), { when: megaMagic })]),
  abyssOrbs: [
    trig('turnEnd', 'foes', E.random('subject', 'debuff', 2), {
      when: [C.atLeast(cnt('turnsTaken', { who: 'subject' }), 2)]
    })
  ],
  adaptiveTactics: [
    side(scaling(cnt('deathsTotal'), { defenseIgnored: 5 }, { cap: 50, categories: ATK }))
  ],
  alchemistsBuffer: [
    taken(-50, { categories: SPELL }),
    taken(50, { categories: ATK }),
    statMod({ ...pct(50, 'Intelligence'), ...pct(-50, 'Attack') })
  ],
  anatidaephobia: REJECT('joke'),
  anointed: [trig('attack', 'self', E.stage('self', stats('Speed'), stg(20)))],
  antiMagicField: [side(resist(35))],
  arcaneEcho: [trig('cast', 'side', E.cast({ pool: 'global', sameElement: true }), { when: own })],
  atPeace: [
    trig(
      'revived',
      'side',
      E.status('subject', S('Barrier'), { amount: hpv('current', 100, 'subject') })
    )
  ],
  auraBoost: DEFER('equipment'),
  bonding: [
    trig('faint', 'side', E.revive('subject', 50), {
      chance: 7,
      chancePer: cnt('sameElementOnSide')
    })
  ],
  bossPowers: [trig('entry', 'self', E.maxHp('side', hpv('max', 50, 'target'))), side(taken(50))],
  cauterizeTheWound: [
    { type: 'statusHeals', params: { statusIds: [S('Bleeding'), S('Burning')], percent: 50 } }
  ],
  celestialNexus: [intercept({ when: [has('self', 'Barrier', 'Shelled')] })],
  chaoticDisposition: [
    trig('statusGained', 'foes', E.cast({ skillId: spell('Debilitating Blast'), to: 'subject' }), {
      statusKind: 'debuff',
      chance: 10
    })
  ],
  chargingRod: REJECT('charge'),
  consecratedGround: [side({ type: 'indirectDamage', params: { percent: -35 } })],
  conspiracyTheory: REJECT('realm'),
  cowardsEmbrace: [side(dodge(50), { type: 'cannotCrit', params: {} })],
  deadOfWinter: [
    trig('statusInflicted', 'foes', [
      E.status('subject', S('Frozen')),
      E.status('subject', S('Poisoned'))
    ])
  ],
  deepRoots: [negate(75, { when: [C.sameEl('attacker')] })],
  determination: [trig('faint', 'allies', E.stage('self', stats('Defense'), stg(50)))],
  dragonsRage: [trig('turnEnd', 'self', E.cast({ skillId: spell('Fireball') }))],
  dualcast: [trig('turnEnd', 'self', E.cast({ lastCast: true }))],
  eldritchRune: [
    trig('entry', 'self', E.maxHp('self', hpv('max', 50), true)),
    dmg(100, { categories: SPELL })
  ],
  emberSoul: [statWhen(pct(75, 'Attack', 'Speed'), [has('self', 'Burning')])],
  embiggening: [statMod(pct(100, ...ALL4, 'Health'))],
  emeraldBlessings: [healing({ received: 150, dealt: 150 })],
  erratic: [trig('entry', 'self', E.stage('randomAlly', 'all', stg(150)))],
  firedevilsWill: [
    side({ type: 'statusImmunity', params: { statusIds: [S('Burning')] } }),
    foes({ type: 'statusDamageModifier', params: { statusIds: [S('Burning')], percent: 50 } })
  ],
  flashBarrier: [taken(-90, { when: [C.below(cnt('turnsTaken'), 1)] })],
  flowerPower: [trig('entry', 'self', E.temp('side', { elementIds: [CLASS.Nature], count: 3 }))],
  forcedMomentum: [trig('turnEnd', 'side', E.trait('subject'), { chance: 35 })],
  frostburn: [
    trig('statusDamage', 'foes', E.status('subject', S('Frozen')), { statusIds: [S('Burning')] })
  ],
  frozenLegion: [
    trig('attack', 'side', E.minion('subject', 1, 'zombies'), { when: [has('other', 'Frozen')] })
  ],
  gamblersGame: [
    trig('turnEnd', 'any', E.random('subject', 'debuff'), { chance: 50 }),
    trig('turnEnd', 'any', E.trait('subject'), { chance: 50 })
  ],
  gemLeech: REJECT('spellGem'),
  glitchInTheSystem: [
    side({
      type: 'statusConversion',
      params: { from: 'buff', to: 'debuff', chance: 100, onto: 'self' }
    }),
    foes({
      type: 'statusConversion',
      params: { from: 'buff', to: 'debuff', chance: 100, onto: 'self' }
    })
  ],
  guards: [trig('attack', 'self', E.kill('other'), { chance: 30, when: [has('other', 'Stone')] })],
  headsOrTails: [
    trig('attack', 'self', E.random('self', 'buff'), { chance: 50 }),
    trig('attack', 'self', E.minion('self'), { chance: 50 })
  ],
  hederassGrasp: [
    dmg(40, { categories: ATK }),
    trig('attack', 'self', [E.status('other', S('Snared')), E.status('otherFoes', S('Snared'))])
  ],
  hemophilia: [
    foes({
      type: 'statusDuration',
      params: { statusIds: [S('Bleeding')], turns: null, on: 'received' }
    }),
    foes({ type: 'statusDamageModifier', params: { statusIds: [S('Bleeding')], percent: 35 } })
  ],
  herEmbrace: [
    dmg(150, { categories: ATK }),
    crit({ categories: ATK }),
    { type: 'skipEveryOtherTurn', params: {} }
  ],
  hiddenPotential: [
    trig('turnEnd', 'self', [E.heal('self', hpv('max', 100)), E.stage('self', 'all', 3)], {
      when: [C.atLeast(cnt('turnsOnField'), 2)],
      oncePerBattle: true
    })
  ],
  highRisk: [side(scaling(cnt('turnsTaken'), { damageDealt: 40, damageTaken: 10 }))],
  hive: [scaling(cnt('traitOnSide', { traitId: 'hive' }), { stats: pct(15, ...ALL4) })],
  hoarding: REJECT('spellGem'),
  hordeLimits: [
    trig('statusGained', 'side', E.status('subject', S('Immune')), {
      statusKind: 'debuff',
      chance: 25
    })
  ],
  imposterSyndrome: [
    trig(
      'entry',
      'allies',
      ALL4.map((name) => E.flat('self', stats(name), sv(name, 50, 'subject')))
    ),
    { type: 'startPosition', params: { position: 'bottom' } }
  ],
  improbableCatapult: REJECT('traitGiveaway'),
  inAllThings: [trig('turnEnd', 'self', E.flat('self', 'all', sv('highest', 20)))],
  incomingTide: [trig('turnEnd', 'self', E.cast({ skillId: spell('Submerge') }), { chance: 50 })],
  infestation: [trig('turnEnd', 'side', E.minion('subject', 2, 'spiderlings'))],
  insight: [side({ type: 'seeInvisible', params: {} })],
  jiggly: [statMod({ ...pct(-50, 'Defense'), ...pct(100, 'Speed') })],
  lawOfTheLarge: [bonus(hpv('current', 30), { categories: ATK })],
  lionsRoar: [trig('attack', 'self', E.stage('other', stats('Attack', 'Defense'), -stg(30)))],
  lithosEvolution: [trig('turnEnd', 'side', E.maxHp('subject', hpv('max', 10, 'subject')))],
  lordOfUndeath: REJECT('minionEvent'),
  loveGiveth: REJECT('statConversion'),
  madMan: [side(statWhen(pct(50, ...ALL4), [C.hpBelow('self', 50)]))],
  massPandemic: [
    trig('statusDamage', 'foes', E.potency('foes', [S('Poisoned')], 15), {
      statusIds: [S('Poisoned')]
    })
  ],
  mathemagic: [potencyAll(50)],
  meansToAnEnd: [dmg(125, { when: [C.none('self', 'buff')] })],
  minionMaster: [trig('turnEnd', 'self', [E.minionUp('self'), E.minion('self')])],
  minionsFirst: [
    trig('turnEnd', 'self', E.extra(), {
      chance: 20,
      chancePer: cnt('minionTypes'),
      oncePerTurn: true
    })
  ],
  myosotis: [
    { type: 'attackStat', params: { stat: 'spAttack', weight: 100, categories: ['physical'] } }
  ],
  necromancy: [trig('faint', 'any', E.minion('side', 2, 'zombies'))],
  neverFade: [side({ type: 'statusImmunity', params: { statusIds: [S('Disarmed')] } })],
  ninetailsRevenge: [trig('attacked', 'side', E.flat('subject', stats('Attack'), ev(20)))],
  ninetailsTrickery: REJECT('spellGem'),
  pactOfStrength: [side(scaling(cnt('sameElementOnSide'), { damageDealt: 6 }))],
  panickedOverheals: [trig('faint', 'self', E.heal('allies', hpv('max', 200, 'target')))],
  parity: [side(bonus(sv('Speed', 30), { categories: SPELL }))],
  pedigreeSafeguard: [{ type: 'intercept', params: { when: [C.sameRace('subject')] } }],
  perfectlyBalanced: [trig('turnEnd', 'self', E.setHp('self', 50))],
  perishingSalvo: DEFER('equipment'),
  plunder: [trig('attack', 'self', E.flat('self', 'lowest', ev(50), 'other'))],
  pocketFrog: [trig('turnEnd', 'self', E.timeline('randomAlly', 'top'), { chance: 50 })],
  powerTrip: [scaling(cnt('traitsGained'), { stats: pct(50, ...ALL4) })],
  prepared: [side({ type: 'turnOrderStat', params: { stat: 'spAttack' } })],
  providence: [statWhen(pct(150, 'Attack', 'Intelligence'), [has('self', 'Shelled')])],
  pullTheStrings: REJECT('actionRedirect'),
  rainbowPalate: [scaling(cnt('distinctElementsOnSide'), { stats: pct(25, ...ALL4) })],
  rave: [side(scaling(cnt('sameRaceOnSide'), { damageDealt: 6 }))],
  restoration: REJECT('statKeep'),
  riseOfThePhoenix: [trig('faint', 'side', E.revive('subject', 20), { chance: 35 })],
  rollTheDice: REJECT('spellGem'),
  scaredStiff: [
    trig('statusGained', 'foes', E.status('subject', S('Feared')), { statusIds: [S('Snared')] }),
    trig('statusGained', 'foes', E.status('subject', S('Snared')), { statusIds: [S('Feared')] })
  ],
  schemingStance: [
    trig('defend', 'self', E.status('foes', S('Feared'))),
    trig('provoke', 'self', E.status('foes', S('Feared')))
  ],
  screechOfDomination: REJECT('minionCopy'),
  seedOfPotentiality: [
    trig('statGain', 'self', E.flat('self', 'lowest', ev(200)), { oncePerTurn: true })
  ],
  seethe: [scaling(cnt('timesDamaged'), { damageDealt: 20 })],
  shrapnelBlast: [
    trig('statusDamage', 'foes', E.dmg('subjectAllies', ev(50)), { statusIds: [S('Bomb')] })
  ],
  shatteringTackle: [
    side(scaling(raceCount('Yeti'), { defenseIgnored: 2.5 }, { categories: ATK })),
    side(
      scaling(
        raceCount('Yeti'),
        { defenseIgnored: 2.5 },
        { categories: ATK, when: [has('target', 'Frozen')] }
      )
    )
  ],
  shiningArmor: [side(statWhen(pct(50, 'Defense'), [has('self', 'Barrier')]))],
  snackBreak: [
    trig('turnEnd', 'self', [E.heal('self', hpv('max', 200)), E.stage('self', stats('Speed'), -1)])
  ],
  soberedUp: REJECT('spellFamily'),
  soulSteal: [dmg(75, { categories: ATK })],
  spinTheWheel: REJECT('rngReroll'),
  spontaneousEntropy: REJECT('spellGem'),
  squadronLeader: [scaling(cnt('minionTypes'), { stats: pct(20, ...ALL4) })],
  stingMartyr: [
    dmg(125, { categories: ATK }),
    trig('attack', 'self', E.maxHp('self', hpv('max', 10), true))
  ],
  sugarRush: [
    scaling(cnt('buffs'), { damageDealt: 25 }, { categories: SPELL }),
    trig('turnEnd', 'self', E.cure('self', 'buff'))
  ],
  superfluidity: REJECT('manualCast'),
  sustain: [lifesteal(10)],
  swarmingHorde: [side(scaling(cnt('sameRaceOnSide'), { stats: pct(4, ...ALL4) }))],
  swellingRanks: REJECT('minionCopy'),
  swordOfWill: [
    trig('attack', 'self', E.kill('other'), { when: [C.dmgAboveLowest(300, 'other')] })
  ],
  synthesis: [
    trig('minionGained', 'side', E.flat('subject', 'highest', sv('highest', 30, 'subject')))
  ],
  theBestMedicine: [
    side({
      type: 'statusConversion',
      params: { from: 'debuff', chance: 25, onto: 'self', redirect: 'reflect' }
    })
  ],
  theKingIsDead: [trig('healed', 'side', E.revive('self', 100), { chance: 20, when: [C.dead()] })],
  theShadows: [
    trig(
      'faint',
      'self',
      [E.revive('self', 100), E.stage('side', stats('Attack', 'Intelligence'), 1)],
      { oncePerBattle: true }
    )
  ],
  toxicCloud: [trig('attack', 'foes', E.random('subjectAllies', 'debuff'), { chance: 35 })],
  toxicKarma: [
    trig('attacked', 'self', [E.status('other', S('Poisoned')), E.status('other', S('Bomb'))])
  ],
  trainingMatrix: [trig('revived', 'side', E.stage('subject', 'all', 1))],
  tribeMentality: [trig('entry', 'self', E.identity('allies', { elementFrom: 'self' }))],
  trueStrike: [
    { type: 'ignoreDefensePercent', params: { percent: 25 } },
    { type: 'effectiveness', params: { mode: 'alwaysStrong' } }
  ],
  undeadLegion: [
    side({ type: 'minionModifier', params: { minionIds: ['zombies'], extraMaxStacks: 5 } })
  ],
  unrelentingFury: [dmg(150, { when: [C.hpBelow('self', 50)] })],
  unrevealedSecret: [trig('dodged', 'self', E.random('other', 'debuff'))],
  unstableExistence: [
    trig('damaged', 'any', E.dmg('subjectAllies', ev(100)), { when: [C.hpBelow('subject', 50)] })
  ],
  usury: [dmg(150, { categories: ATK }), taken(75, { categories: ATK })],
  vengefulRebound: [side(taken(-75, { when: [C.below(cnt('turnsTaken'), 1)] }))],
  viciousRetaliation: [trig('dodged', 'self', E.atk('other'))],
  whyWontYouDie: REJECT('zeroDamage'),
  widdershins: [
    side({ type: 'effectiveness', params: { mode: 'reverse' } }),
    foes({ type: 'effectiveness', params: { mode: 'reverse' } })
  ]
}
