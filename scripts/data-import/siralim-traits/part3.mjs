/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 3 (thứ tự lúc soạn: 400–599).
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
  critChance,
  dodge,
  negate,
  cap,
  extraHits,
  repeat,
  healing,
  attackStat,
  bonus,
  share,
  potencyAll,
  regen,
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
/** "Bắt đầu trận với +p% chỉ số, cuối mỗi lượt mất q%". */
const decaying = (percent, loss, ...names) => [
  trig('entry', 'self', E.stage('self', stats(...names), stg(percent))),
  trig('turnEnd', 'self', E.stage('self', stats(...names), -stg(loss)))
]
const gainAll4 = (percent, to = 'self', of = 'subject') =>
  ALL4.map((name) => E.flat(to, stats(name), sv(name, percent, of)))
const classSpellCast = (klass) => [C.skillElement([CLASS[klass]])]

export const CONVERSIONS = {
  annoyingBobblehead: [
    side({
      type: 'statusGainBlock',
      params: { kind: 'buff', when: [C.below(cnt('turnsTaken'), 1)] }
    }),
    foes({
      type: 'statusGainBlock',
      params: { kind: 'buff', when: [C.below(cnt('turnsTaken'), 1)] }
    })
  ],
  forgivenessAndOtherBlunders: REJECT('ignoreTriggers'),
  peaceAndOtherMyths: REJECT('ignoreTriggers'),
  justiceAndOtherFallacies: REJECT('ignoreTriggers'),
  masterOfElves: [
    trig('entry', 'self', E.flat('allies', 'all', sv('highest', 5)), { when: [isRace('Elf')] })
  ],
  stampede: [
    trig('attack', 'self', E.cast({ skillId: spell('Wrath of Nature') })),
    trig('defend', 'self', E.cast({ skillId: spell('Wrath of Nature') })),
    trig('provoke', 'self', E.cast({ skillId: spell('Wrath of Nature') }))
  ],
  optimism: [trig('attacked', 'self', E.stage('self', stats('Defense', 'Speed'), stg(25)))],
  cycleOfLife: [trig('revived', 'self', E.maxHp('self', hpv('max', 100)))],
  naturesBlessing: [side(regen(30), taken(-15))],
  blackLotus: [side(taken(-40, { when: [has('self', 'Mending')] }))],
  unscathed: [
    trig('attacked', 'side', E.heal('subject', hpv('max', 30, 'subject')), {
      when: [has('subject', 'Mending')]
    })
  ],
  infestedWithAnts: [trig('turnEnd', 'self', E.dmg('randomFoe', sv('lowest', 30), { times: 3 }))],
  nutrientBlood: [
    trig(
      'turnEnd',
      'side',
      onlyIf(E.heal('subject', hpv('max', 15, 'subject')), C.lacks('subject', [S('Mending')]))
    ),
    trig(
      'turnEnd',
      'side',
      onlyIf(E.heal('subject', hpv('max', 50, 'subject')), has('subject', 'Mending'))
    )
  ],
  sacredBark: [trig('attacked', 'side', E.status('self', S('Barrier'), { amount: ev(50) }))],
  masterOfEnts: [
    trig('faint', 'side', E.revive('subject', 10), {
      oncePerBattle: true,
      when: [isRace('Ent', 'subject')]
    })
  ],
  allForOne: [side(repeat(1, SPELL, 100))],
  conversion: [
    side(
      scaling(raceCount('Familiar'), { damageDealt: 15 }, { categories: SPELL }),
      healing({ dealt: -15 })
    )
  ],
  oneForAll: [
    trig('cast', 'side', E.temp('allies', { sameElement: true }), {
      when: [isRace('Familiar', 'subject')]
    })
  ],
  pierceTheVeil: [
    side(scaling(raceCount('Familiar'), { defenseIgnored: 10 }, { categories: SPELL }))
  ],
  groupMeditation: REJECT('charge'),
  potency: [side({ type: 'stageMultiplier', params: { gain: 1.25, loss: 1.25 } })],
  higherUnderstanding: REJECT('charge'),
  masterOfFamiliars: [perRace('Familiar', { stats: pct(10, 'Intelligence') })],
  uncontrollableAnger: [
    trig('attack', 'side', E.atk('other', 100, 1, 'subject'), {
      chance: 35,
      when: [has('subject', 'Berserk'), C.own()]
    })
  ],
  outrage: [dmg(50), dmg(75)],
  flashOfAnger: [
    trig('attack', 'side', E.status('subject', S('Invisible')), {
      when: [has('subject', 'Berserk')]
    })
  ],
  bloodfury: [
    trig('provoke', 'self', [E.status('side', S('Berserk')), E.status('side', S('Savage'))])
  ],
  agitation: [scaling(cnt('debuffs'), { damageDealt: 80 }, { categories: ATK })],
  eyesore: [
    trig('entry', 'self', [
      E.flat('self', stats('Attack'), sv('Defense', 100)),
      E.lose('self', stats('Defense'), sv('Defense', 90))
    ])
  ],
  relentlessHunger: [trig('attack', 'self', E.dmg('otherFoes', ev(100)))],
  masterOfFiends: [side(negate(40, { when: [isRace('Fiend'), has('self', 'Berserk')] }))],
  whettedBones: decaying(100, 25, 'Attack', 'Defense'),
  deathwalkersDestruction: [
    trig('statusDamage', 'foes', E.dmg('subject', ev(100)), {
      statusIds: [S('Bomb')],
      chance: 50,
      repeatChance: 50
    })
  ],
  deathwalkersHymn: [
    trig('entry', 'self', E.trait('allies', { copyFrom: 'self' }), { when: [isRace('Leper')] })
  ],
  deathwalkersStrangulation: [
    trig('statusDamage', 'foes', E.dmg('subject', ev(100)), {
      statusIds: [S('Poisoned')],
      chance: 50,
      repeatChance: 50
    })
  ],
  anxiety: [dmg(100, { categories: SPELL }), trig('cast', 'self', E.seal('self'))],
  stupify: decaying(100, 25, 'Intelligence', 'Defense'),
  curseOfTheSilent: [trig('entry', 'self', E.status('self', S('Silenced')))],
  transmogrification: [
    trig('entry', 'self', E.random('self', 'buff', 5)),
    { type: 'statusGainBlock', params: { kind: 'buff', when: [C.atLeast(cnt('turnsOnField'), 1)] } }
  ],
  contradiction: [
    trig('entry', 'self', E.stage('self', stats('Speed'), 3)),
    { type: 'startPosition', params: { position: 'bottom' } }
  ],
  darknessSurrounding: [
    trig('entry', 'self', E.maxHp('self', hpv('max', 125))),
    trig('turnEnd', 'self', E.dmg('self', hpv('max', 15)))
  ],
  masterOfForsaken: [auraIf('side', allRace, potencyAll(50))],
  furor: [trig('faint', 'any', E.atk('randomFoe', 200), { when: [C.notSelf('subject')] })],
  charge: [trig('turnEnd', 'any', E.atk('randomFoe'), { chance: 25 })],
  resprout: [trig('damaged', 'self', E.heal('self', ev(100)))],
  scrutiny: [trig('cast', 'foes', E.cast({ pool: 'global' }))],
  bide: [bonus({ record: 'damageTaken', of: 'self', percent: 30 }, { categories: ATK })],
  comeHither: [trig('attacked', 'self', E.cast({ skillId: spell('Crush Punch'), to: 'other' }))],
  deferPain: [taken(-45)],
  spontaneousCombustion: [trig('attacked', 'self', E.cast({ skillId: spell('Volcano') }))],
  masterOfGargantuans: [
    side(
      negate(50, { when: [isRace('Gargantuan'), C.defending()] }),
      negate(50, { when: [isRace('Gargantuan'), C.provoking()] })
    )
  ],
  warMagic: [
    trig('cast', 'side', E.stage('subject', stats('Attack'), stg(35)), {
      when: classSpellCast('Chaos')
    })
  ],
  theWickedEnd: [
    trig('cast', 'self', E.cast({ pool: 'global', elementIds: [CLASS.Chaos], times: 3 }), {
      when: own
    })
  ],
  sleightOfHand: [
    trig('cast', 'side', E.status('other', S('Silenced')), {
      when: [...classSpellCast('Chaos'), C.single()]
    })
  ],
  discord: [trig('entry', 'self', E.temp('side', spell('Chaos Bolt')))],
  ransack: [trig('entry', 'self', E.temp('side', { elementIds: [CLASS.Chaos], count: 2 }))],
  heartOfSteel: [
    trig('faint', 'self', E.revive('self', 50), {
      when: [C.atLeast(cnt('casts'), 1)],
      oncePerBattle: true
    })
  ],
  reignOfChaos: [side({ type: 'repeatSkill', params: { extra: 2, categories: SPELL } })],
  primitiveIncantation: [
    side(
      scaling(
        cnt('elementOnSide', { elementIds: [CLASS.Chaos] }),
        { stats: pct(7, 'Attack') },
        { cap: 21 }
      )
    )
  ],
  masterOfGargoyles: [
    trig('cast', 'side', E.stage('subject', stats('Attack'), stg(20)), {
      when: [...classSpellCast('Chaos'), isRace('Gargoyle', 'subject')]
    })
  ],
  oscillation: REJECT('charge'),
  tumble: REJECT('spellGem'),
  neodymium: REJECT('spellGem'),
  obelisk: REJECT('spellGem'),
  qualityOverQuanitity: REJECT('spellGem'),
  distribution: REJECT('spellGem'),
  masterOfGemlings: REJECT('spellGem'),
  footEater: [
    trig('attack', 'self', E.flat('self', stats('Speed'), sv('Speed', 50, 'subject'), 'other'))
  ],
  darkRoamer: [side(scaling(cnt('missingHpPercent'), { stats: pct(3, 'Speed') }))],
  horde: [trig('entry', 'self', E.flat('allies', stats('Speed'), sv('Speed', 5)))],
  frenzy: [side(dodge(10), critChance(10))],
  grimAura: [side(bonus(sv('Speed', 25), { categories: ATK }))],
  ravage: [bonus(sv('Speed', 50), { categories: ['physical', 'special'] })],
  onlyForTheWeak: [scaling(cnt('stageTotal'), { damageDealt: 35 }, { step: 2 })],
  masterOfGhouls: [
    side(bonus(sv('Speed', 15, 'self', raceCount('Ghoul')), { when: [isRace('Ghoul')] }))
  ],
  strengthOfTheWorld: [
    trig('entry', 'self', [
      E.maxHp('self', sv('Defense', 100)),
      E.lose('self', stats('Defense'), sv('Defense', 90))
    ]),
    taken(-50)
  ],
  admireTheGods: [cap(25)],
  hoHoOh: [
    side({ type: 'statGainBlock', params: { when: [C.below(cnt('turnsTaken'), 1)] } }),
    foes({ type: 'statGainBlock', params: { when: [C.below(cnt('turnsTaken'), 1)] } })
  ],
  boastfulProtector: [negate(25, { when: [C.provoking()] })],
  pilgrimage: [bonus(hpv('current', 50), { categories: SPELL })],
  rapidRegeneration: [trig('turnEnd', 'any', E.heal('self', hpv('missing', 10)))],
  absorption: [trig('healed', 'foes', E.maxHp('self', ev(30)))],
  wreck: [attackStat('currentHp', 100, ['physical'])],
  hostileVitality: [bonus(hpv('current', 35), { categories: ATK })],
  reforged: [trig('revived', 'side', E.maxHp('subject', hpv('max', 50, 'subject')))],
  masterOfGiants: [
    trig('entry', 'self', E.maxHp('side', hpv('max', 30, 'target', raceCount('Giant'))), {
      when: [isRace('Giant')]
    })
  ],
  dimensions: [
    trig('turnEnd', 'self', [
      E.cast({ pool: 'global', elementIds: [CLASS.Chaos] }),
      E.cast({ pool: 'global', elementIds: [CLASS.Death] }),
      E.cast({ pool: 'global', elementIds: [CLASS.Life] }),
      E.cast({ pool: 'global', elementIds: [CLASS.Nature] }),
      E.cast({ pool: 'global', elementIds: [CLASS.Sorcery] })
    ])
  ],
  hopelesslyHopeful: REJECT('spellFamily'),
  whatsYoursIsMine: [trig('entry', 'self', E.trait('side', { copyFrom: 'randomFoe' }))],
  fromDeathToDestiny: [
    scaling(cnt('faintedAllies'), { stats: pct(50, 'Attack', 'Intelligence', 'Defense', 'Speed') })
  ],
  skyttels: REJECT('spellGem'),
  eve: REJECT('charge'),
  empire: [repeat(4, SPELL, 50)],
  releaseTheCure: [
    trig('attack', 'self', E.random('self', 'buff')),
    trig('damaged', 'self', E.random('self', 'buff'))
  ],
  silenceSpeaks: [trig('entry', 'self', E.trait('self', { copyFrom: 'randomAlly', count: 2 }))],
  rescueRide: [trig('turnEnd', 'self', [E.revive('faintedAlly', 100)])],
  anyGivenSin: [
    side(dmg(100, { categories: ATK })),
    trig('attack', 'side', E.status('subject', S('Scorned')))
  ],
  nostalgia: [trig('turnEnd', 'side', E.cast({ pool: 'global', sameElement: true }), { when: [] })],
  greatExpectations: REJECT('spellGem'),
  revolt: [
    trig('attack', 'self', E.random('other', 'debuff')),
    trig('damaged', 'self', E.random('other', 'debuff'))
  ],
  ultimateSacrifice: [trig('turnEnd', 'self', E.trait('self', { count: 5 }))],
  eliminationProcess: [trig('attack', 'self', E.dmg('other', ev(100)))],
  toMoveOnIsToGrow: [
    dmg(100, { categories: ATK, when: [{ if: 'counterAtLeast', counter: cnt('casts'), min: 1 }] }),
    dmg(100, {
      categories: SPELL,
      when: [{ if: 'counterAtLeast', counter: cnt('attacks'), min: 1 }]
    })
  ],
  beyondOblivion: REJECT('adjacency'),
  heartrage: [trig('turnEnd', 'any', E.dmg('randomFoe', sv('lowest', 80)))],
  karma: [
    trig('attack', 'self', E.flat('self', 'lowest', sv('lowest', 50))),
    trig('damaged', 'self', E.flat('self', 'lowest', sv('lowest', 50)))
  ],
  closure: [
    trig('turnEnd', 'self', [
      E.maxHp('self', hpv('max', 35)),
      E.heal('self', hpv('max', 35)),
      E.provoke()
    ])
  ],
  iniquity: [
    trig('attack', 'self', E.atk('other'), { repeatChance: 75, repeatDecay: 25, when: own })
  ],
  chipOffTheBlock: [trig('attacked', 'self', gainAll4(15, 'allies', 'self'))],
  embolden: [statMod(pct(50, 'Defense'))],
  mechanicalIllusion: REJECT('transform'),
  selfAwareness: [
    trig('entry', 'self', E.trait('allies', { copyFrom: 'self' }), { when: [isRace('Golem')] })
  ],
  cataclysm: [
    trig('attacked', 'self', [
      onlyIf(E.potency('foes', [S('Burning')], 30), has('target', 'Burning')),
      onlyIf(E.status('foes', S('Burning')), C.lacks('target', [S('Burning')]))
    ])
  ],
  massEntanglement: [trig('defend', 'self', E.status('foes', S('Snared')), { chance: 50 })],
  slop: [
    trig('attacked', 'self', [
      onlyIf(E.stage('foes', stats('Speed'), -stg(20)), has('target', 'Blind')),
      onlyIf(E.status('foes', S('Blind')), C.lacks('target', [S('Blind')]))
    ])
  ],
  badDreams: [trig('entry', 'self', E.status('foes', S('Sleeping')), { chance: 50 })],
  pumpkinSpice: REJECT('statSwap'),
  senseOfPurpose: [trig('turnEnd', 'self', E.heal('side', hpv('max', 35, 'target')))],
  animatedTreasure: REJECT('realm'),
  treasureGolemsBoon: REJECT('realm'),
  treasureGolemsRevenge: REJECT('realm'),
  treasureGolemsSecret: REJECT('realm'),
  tripleTake: [extraHits(2, 100), repeat(2, SPELL)],
  masterOfGolems: [
    trig('entry', 'self', E.trait('side', { traitId: 'chipOffTheBlock' }), { when: allRace })
  ],
  blink: strikeWith('Stone'),
  deterioration: [
    foes(scaling(cnt('statuses', { statusIds: [S('Stone')] }), { damageDealt: -10 }, { cap: 90 }))
  ],
  steadyGaze: [
    negate(50, { source: 'skill' }),
    trig('damaged', 'self', E.status('other', S('Stone')), { chance: 50 })
  ],
  eternalJinx: [
    foes({
      type: 'statusDuration',
      params: { statusIds: [S('Stone')], turns: null, on: 'received' }
    }),
    dmg(75, { when: [has('target', 'Stone')] })
  ],
  treachery: [trig('entry', 'self', E.status('foes', S('Stone')))],
  pulverizingStare: [foes(taken(50, { when: [has('self', 'Stone')] }))],
  sealedFate: [
    dmg(50, { categories: SPELL, when: [C.single()] }),
    trig('cast', 'self', E.status('other', S('Stone')), { when: [C.single()] })
  ],
  masterOfGorgons: [perRace('Gorgon', { damageDealt: 35 }, { when: [has('target', 'Stone')] })],
  volley: [perRace('Griffon', { critChance: 20 }, { categories: ATK })],
  heavyRepercussions: [
    trig('turnEnd', 'self', E.extra(), { chance: 7, chancePer: raceCount('Griffon') })
  ],
  impendingVictory: [
    trig('attack', 'allies', E.atk('randomFoe'), { when: [isRace('Griffon', 'subject'), C.own()] })
  ],
  allAsOne: [
    trig('statusGained', 'side', E.move('subject', 'allies', 'buff', true), {
      statusKind: 'buff',
      when: [isRace('Griffon', 'subject')],
      oncePerTurn: true
    })
  ],
  deafeningRoar: [perRace('Griffon', { damageDealt: 10 })],
  impunity: [perRace('Griffon', { damageTaken: -5 })],
  colony: [trig('defend', 'allies', E.defend('side'), { when: [isRace('Griffon', 'subject')] })],
  gumption: [{ type: 'surviveLethal', params: { fromFullHp: false, chance: 50 } }],
  masterOfGriffons: [auraIf('side', allRace, potencyAll(100))],
  bookOfTheElder: REJECT('spellGem'),
  eldritchEssence: [
    trig('faint', 'allies', E.cast({ pool: 'global', sameElement: true, times: 2 }))
  ],
  bookOfTheLost: REJECT('spellGem'),
  bookOfTheHeretic: [
    dmg(100, { categories: SPELL }),
    { type: 'interrupt', params: { chance: 25, categories: SPELL } }
  ],
  lostKnowledge: [side(repeat(1, SPELL, 100))],
  bookOfTheDead: [trig('entry', 'self', E.minion('self', 2))],
  bookOfTheArsonist: [
    side({ type: 'inflictPotency', params: { statusIds: [S('Burning')], percent: 30 } })
  ],
  bookOfTheWarlock: [
    trig('entry', 'self', E.status('side', S('Arcane'))),
    trig('turnEnd', 'side', E.status('subject', S('Arcane')), { chance: 30 })
  ],
  masterOfGrimoires: [side({ type: 'statusImmunity', params: { statusIds: [S('Silenced')] } })],
  kraaw: strikeWith('Blind'),
  scraaaw: REJECT('cancelAction'),
  redWedding: [trig('entry', 'self', E.kill('allies'))],
  badOmen: [trig('entry', 'self', E.status('foes', S('Blind')))],
  caww: [foes({ type: 'randomTarget', params: { chance: 100 } })],
  braaaawk: [trig('turnEnd', 'foes', E.cast({ pool: 'global' }), { chance: 50 })],
  skreee: [trig('turnEnd', 'foes', E.status('subject', S('Confused')), { chance: 20 })],
  curukuku: [foes({ type: 'randomTarget', params: { chance: 50 } })],
  masterOfHarpies: [
    trig('attack', 'foes', E.atk('randomFoe', 20), { when: [isRace('Harpy', 'self')] })
  ],
  worldDomination: [auraIf('side', allRace, potencyAll(50))],
  fromHeroToZero: [trig('attack', 'self', E.trait('side', { copyFrom: 'other' }))],
  heartstopper: [
    trig('attack', 'self', E.flat('side', stats('Speed'), sv('Speed', 20, 'subject'), 'other'))
  ],
  abation: [
    trig('attack', 'self', [
      E.flat('side', stats('Attack'), sv('Attack', 20, 'subject'), 'other'),
      E.flat('side', stats('Intelligence'), sv('Intelligence', 20, 'subject'), 'other')
    ])
  ],
  depression: [
    trig('attack', 'self', E.flat('side', stats('Defense'), sv('Defense', 20, 'subject'), 'other'))
  ],
  mindEraser: [trig('attack', 'self', E.seal('other'))],
  masterOfHemomancers: [auraIf('side', allRace, potencyAll(100))],
  photomorphogenesis: [
    trig('attack', 'self', E.stage('self', stats('Attack'), 1)),
    trig('cast', 'self', E.stage('self', stats('Intelligence'), 1)),
    trig('defend', 'self', E.stage('self', stats('Defense'), 1)),
    trig('provoke', 'self', E.stage('self', stats('Speed'), 1))
  ],
  bloodThirst: [
    side({ type: 'minionModifier', params: { minionIds: ['direWolves'], extraMaxStacks: 5 } })
  ],
  uncharted: [side(scaling(cnt('minionStacks'), { damageDealt: 5 }, { when: [isRace('Hound')] }))],
  summonThePack: [trig('turnEnd', 'side', E.minion('subject', 1, 'direWolves'))],
  houndLegion: [
    side({
      type: 'minionModifier',
      params: { minionIds: ['direWolves'], leaveChancePercent: -100 }
    })
  ],
  fingertipNip: [side(bonus(sv('Attack', 20, 'self', cnt('minionStacks')), { categories: ATK }))],
  viciousBite: [side(scaling(cnt('minionStacks'), { damageDealt: 2 }))],
  natureOfTheBeast: [trig('entry', 'self', E.minion('side', 3, 'direWolves'))],
  eyeOfTheThylacine: [
    side(dmg(-95)),
    trig('attack', 'self', onlyIf(E.atk('other', 100, 1, 'allies'), C.race('target', ['deity'])))
  ],
  masterOfHounds: [
    side(bonus(sv('highest', 30, 'self', cnt('minionStacks')), { when: [isRace('Hound')] }))
  ],
  directorsCut: [
    trig('attack', 'self', E.dmg('randomFoe', ev(70)), {
      chancePer: raceCount('Hunter'),
      chance: 100
    })
  ],
  glaiveOfPrayer: [
    trig('attack', 'self', [E.dmg('randomFoe', ev(35))]),
    trig('attack', 'self', E.revive('faintedAlly', 40), { chance: 20 })
  ],
  glaiveOfJustice: [
    trig('attack', 'self', E.dmg('randomFoe', ev(35))),
    trig('attack', 'self', E.cast({ skillId: spell('Holy Smite'), to: 'other' }), { chance: 50 })
  ],
  glaiveOfHungering: [trig('attack', 'self', [E.dmg('randomFoe', ev(35)), E.heal('self', ev(35))])],
  razorsharp: [
    trig('attack', 'self', E.dmg('randomFoe', ev(35)), { chance: 60 }),
    trig('attack', 'self', E.dmg('randomFoe', ev(100)), { chance: 40 })
  ],
  glaiveOfPower: [
    trig('attack', 'self', [E.dmg('randomFoe', ev(35)), E.flat('self', 'lowest', sv('lowest', 15))])
  ],
  huntersSeason: [
    trig('attack', 'self', [E.dmg('randomFoe', ev(35)), E.status('randomFoe', S('Poisoned'))])
  ],
  glaiveOfDestruction: [trig('attack', 'self', E.dmg('randomFoe', hpv('current', 20)))],
  masterOfHunters: [auraIf('side', allRace, potencyAll(100))],
  nextGeneration: [
    trig('faint', 'self', [
      ...gainAll4(30, 'allies', 'self'),
      E.trait('allies', { copyFrom: 'self' })
    ])
  ],
  vengeance: [
    trig(
      'faint',
      'allies',
      [E.stage('self', stats('Attack'), 3), E.stage('self', stats('Speed'), 2)],
      {
        when: [isRace('Imling', 'subject')]
      }
    )
  ],
  nothingToLose: [
    trig('faint', 'allies', E.atk('randomFoe', 100, 5), { when: [isRace('Imling', 'subject')] })
  ],
  spiritLink: [perRace('Imler', { damageTaken: -10 }, { cap: 90 })],
  leadByExample: DEFER('equipment'),
  patriarchy: [share(100)],
  devotion: [side(taken(-65, { when: [C.below(cnt('alliesOnField'), 2)] }))],
  monstrousRampage: [trig('provoke', 'side', E.dmg('randomFoe', sv('Attack', 50, 'subject')))],
  masterOfImlers: [perRace('Imler', { damageDealt: 20 })],
  trove: REJECT('spellGem'),
  ingenuity: DEFER('equipment'),
  thickAndThin: [
    trig('faint', 'side', E.revive('subject', 100), {
      chance: 50,
      when: [isRace('Imler', 'subject')]
    })
  ],
  jealousy: [trig('entry', 'self', E.flat('allies', 'all', sv('highest', 25)))],
  everythingToGain: [
    trig('faint', 'allies', E.cast({ pool: 'ownSpell', times: 5 }), {
      when: [isRace('Imler', 'subject')]
    })
  ],
  rapidEvolution: REJECT('fusion'),
  crazyIdea: [trig('turnEnd', 'foes', E.cast({ pool: 'global' }), { when: [C.dead()] })],
  patchUp: [
    trig('damaged', 'side', E.heal('subject', hpv('max', 20, 'subject')), {
      when: [isRace('Imler', 'subject')]
    })
  ],
  masterOfImlings: [perRace('Imling', { damageTaken: -5 })],
  grayscale: [trig('cast', 'self', E.revive('faintedAlly', 50))],
  earthenAttunement: [trig('entry', 'self', E.temp('side', spell('Shellbust')))],
  miracleOfTheMind: [
    trig('cast', 'side', E.cast({ sameSkill: true, to: 'other' }), { chance: 50, when: own })
  ],
  voodoo: REJECT('spellGem'),
  darknessFate: REJECT('spellGem'),
  creationism: [side(bonus(sv('Intelligence', 10), { when: [C.skillElement([CLASS.Nature])] }))],
  ordinaryAbnormality: [side({ type: 'repeatSkill', params: { extra: 1, categories: SPELL } })],
  incarnation: [
    trig('cast', 'side', E.cast({ sameSkill: true, to: 'subjectAllies' }), {
      chance: 50,
      when: [...classSpellCast('Nature'), C.single(), C.own()]
    })
  ],
  heeHayHoHa: [side(repeat(1, SPELL))],
  heeHooHa: [
    trig('attack', 'side', E.extra('subject'), { chance: 15, oncePerTurn: true, when: own }),
    trig('cast', 'side', E.extra('subject'), { chance: 15, oncePerTurn: true, when: own })
  ],
  hooHoHa: REJECT('transform'),
  masterOfImps: [
    trig('entry', 'self', E.temp('self', spell('Shellbust')), { when: [isRace('Imp')] })
  ],
  permanence: [side({ type: 'minionModifier', params: { leaveChancePercent: -50 } })],
  onAPaleHorse: REJECT('minionPotency'),
  massSummoning: [trig('entry', 'self', E.minion('side', 2))],
  openThePortals: [
    trig('attack', 'self', E.minion('self')),
    trig('attack', 'allies', E.minion('subject'), { chance: 30 })
  ],
  theWalkingDead: [trig('entry', 'self', E.minion('side', 1, 'zombies'))],
  pleasantDisease: [trig('entry', 'self', E.minion('side', 1, 'writhelings'))],
  masterOfInquisitors: [trig('turnEnd', 'side', E.minion('subject'), { when: allRace })],
  heartyAppetite: [trig('statGain', 'side', E.maxHp('subject', hpv('max', 5, 'subject')))],
  heartVersusMind: [
    trig('statusEnded', 'side', E.maxHp('subject', hpv('max', 20, 'subject')), {
      statusIds: [S('Barrier')]
    })
  ],
  riseAbove: [trig('healed', 'side', E.maxHp('subject', ev(5)))],
  traumaPrevention: [
    trig(
      'statusGained',
      'side',
      E.status('subject', S('Barrier'), { amount: hpv('max', 25, 'subject') }),
      { statusIds: [S('Barrier')], oncePerTurn: true }
    )
  ]
}
