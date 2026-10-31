/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 8 (thứ tự lúc soạn: 1379–1590, hết danh sách).
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
  negate,
  healing,
  bonus,
  resist,
  potencyAll,
  potency,
  variance,
  extraHits,
  repeat,
  attackStat,
  ignoreDefense,
  intercept,
  start,
  statusDmg,
  stageMult,
  minionMod,
  immune,
  blockStatus,
  skipTurn,
  trig,
  E,
  C,
  REJECT,
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
const perRace = (r, effect, opts = {}) =>
  side(scaling(raceCount(r), effect, { ...opts, when: [isRace(r), ...(opts.when ?? [])] }))
/**
 * "Luôn có trạng thái X": gán khi vào trận và làm mới cuối mỗi lượt của chủ trait; `targetIf` lọc
 * từng mục tiêu (ví dụ chỉ quái thuộc race / hệ đó).
 */
const always = (to, name, { when, targetIf } = {}) => {
  const effect = targetIf ? onlyIf(E.status(to, S(name)), ...targetIf) : E.status(to, S(name))
  const opts = when ? { when } : {}
  return [trig('entry', 'self', effect, opts), trig('turnEnd', 'self', effect, opts)]
}
/** "Quái hệ X và quái Beacon của bạn luôn có trạng thái Y" (họ Beacon). */
const beaconAlways = (className, name) => [
  ...always('side', name, { targetIf: [C.el('target', [CLASS[className]])] }),
  ...always('side', name, { targetIf: [C.race('target', ofRace('Beacon'))] })
]
/** "Chưa tăng / giảm chỉ số X thì +200% X và luôn có buff Y" (họ Kraken). */
const untouched = (statName, buffName) => {
  const when = [C.noGains(stats(statName))]
  return [statWhen(pct(200, statName), when), ...always('self', buffName, { when })]
}
/** "Nhận spell X khi vào trận; dùng X xong thì tàng hình + tăng chỉ số" (họ Spellmane). */
const stalker = (spellName, statName) => [
  trig('entry', 'self', E.temp('self', spell(spellName))),
  trig(
    'cast',
    'self',
    [E.status('self', S('Invisible')), E.stage('self', stats(statName), stg(20))],
    {
      when: [C.skill(spell(spellName))]
    }
  )
]
/** "Bắt đầu lượt: +10% chỉ số X" (họ Clockwork; phần "10% tổng lượng đã nhận" gộp vào % hiện tại). */
const autonomous = (statName) => [
  trig('turnEnd', 'self', E.flat('self', stats(statName), sv(statName, 10)))
]
/** "Sau hiệu ứng vào trận: cộng 40% chỉ số X của quái này cho đồng đội" (họ In Favor Of). */
const inFavor = (statName) => [
  trig('entry', 'self', E.flat('allies', stats(statName), sv(statName, 40)))
]
/** Hiệu ứng lên mọi quái Uralos trên sân khi quái Uralos của bạn làm gì đó. */
const uralos = (on, effect, extra = []) =>
  trig(on, 'side', onlyIf(effect, isRace('Uralos', 'target')), {
    when: [isRace('Uralos', 'subject'), ...extra]
  })
/** "Sau khi tấn công: gây debuff X và giảm chỉ số Y của mục tiêu" (họ Warhog). */
const eater = (statusName, stat, percent = 15) => [
  trig('attack', 'self', [
    E.status('other', S(statusName)),
    E.stage('other', stat === 'lowest' ? 'lowest' : stats(stat), -stg(percent))
  ])
]
/** Quái race X chia sẻ trait của nhau (Shackler's Domination, Royal Flush). */
const shareInnate = (r) => [
  trig(
    'entry',
    'self',
    onlyIf(E.trait('allies', { copyFrom: 'self' }), C.race('target', ofRace(r))),
    {
      when: [isRace(r)]
    }
  )
]
/** Sau khi trúng đòn từ địch mà còn sống. */
const survived = [C.hpAbove('self', 0)]

export const CONVERSIONS = {
  blueTether: [intercept()],
  greenTether: [
    trig(
      'healed',
      'any',
      [E.heal('self', ev(100)), E.status('self', S('Barrier'), { amount: ev(100) })],
      {
        when: [C.sameSide('other'), C.notSelf('other')]
      }
    )
  ],
  masterOfAnimations: REJECT('adjacency'),
  purpleTether: [trig('cast', 'allies', E.cast({ sameSkill: true }), { when: own })],
  redTether: [trig('attack', 'allies', E.atk('other'), { when: own })],
  silverTether: [trig('faint', 'allies', gainAll4(60, 'self', 'subject'))],
  yellowTether: [
    trig('crit', 'self', E.stage('allies', stats('Attack', 'Speed'), stg(30))),
    ...always('self', 'Savage')
  ],
  inFavorOfAll: REJECT('statCopy'),
  inFavorOfCreation: inFavor('Intelligence'),
  inFavorOfDestruction: inFavor('Attack'),
  inFavorOfEscape: inFavor('Speed'),
  inFavorOfProtection: inFavor('Defense'),
  inFavorOfSurvival: [trig('entry', 'self', E.maxHp('allies', hpv('max', 40, 'self')))],
  masterOfArbiters: [auraIf('side', allRace, potencyAll(50))],
  betterFasterStronger: REJECT('minionPotency'),
  boundlessCreativity: REJECT('statCopy'),
  faeDust: [
    side(scaling(cnt('attacks'), { damageDealt: 5 })),
    side(scaling(cnt('casts'), { damageDealt: 5 })),
    side(scaling(cnt('attacks'), { damageTaken: -5 }, { cap: 90 })),
    side(scaling(cnt('casts'), { damageTaken: -5 }, { cap: 90 }))
  ],
  gemcutter: [side(immune(S('Silenced')))],
  grandiose: REJECT('countBonus'),
  roboticArmor: [
    side(resist(50)),
    trig('statusGained', 'side', E.status('subject', S('Immune')), {
      statusKind: 'debuff',
      chance: 50
    })
  ],
  speculation: [
    trig('attack', 'side', E.atk('other'), { when: own, repeatChance: 75, repeatDecay: 19 }),
    trig('cast', 'side', E.cast({ sameSkill: true }), {
      when: own,
      repeatChance: 75,
      repeatDecay: 19
    })
  ],
  surgeOfVitality: [
    trig('attack', 'side', E.maxHp('subject', hpv('max', 20, 'subject'))),
    trig('attacked', 'side', E.maxHp('subject', hpv('max', 20, 'subject')))
  ],
  twilightZone: [foes(attackStat('lowest', 100))],
  dueRecompense: beaconAlways('Nature', 'Leeching'),
  eternalReprieve: [
    trig('turnEnd', 'side', E.heal('side', hpv('max', 20, 'target')), { chance: 25 })
  ],
  forbearanceForgone: [
    ...beaconAlways('Sorcery', 'Protected'),
    trig('cast', 'foes', E.seal('subject'), { when: [C.el('subject', [CLASS.Sorcery])] })
  ],
  heavyWeighsTheCrown: [
    trig(
      'entry',
      'self',
      onlyIf(E.minion('side', 1, 'animatedGem'), C.el('target', [CLASS.Chaos]))
    ),
    trig(
      'entry',
      'self',
      onlyIf(E.minion('side', 1, 'animatedGem'), C.race('target', ofRace('Beacon')))
    )
  ],
  masterOfBeacons: REJECT('statAverage'),
  pendulumsReturn: beaconAlways('Death', 'Agile'),
  purityAndEmptiness: beaconAlways('Life', 'Berserk'),
  byMyHand: REJECT('barrierBypass'),
  greatConjunction: [
    trig(
      'faint',
      'side',
      [
        E.revive('subject', 50),
        E.status('subject', S('Barrier'), { amount: hpv('max', 50, 'subject') })
      ],
      { chance: 25 }
    )
  ],
  masterOfCherubs: REJECT('barrierPotency'),
  orElseByNone: REJECT('barrierPotency'),
  sunderedAndUndone: REJECT('barrierPotency'),
  theTwoMadeOne: REJECT('barrierPotency'),
  tripleSuns: [side(statusDmg([S('Bleeding'), S('Poisoned'), S('Burning'), S('Bomb')], -90))],
  appreciationForAncestry: REJECT('fusion'),
  divineForm: REJECT('fusion'),
  eldritchCreation: REJECT('fusion'),
  fairyBlood: REJECT('fusion'),
  masterOfChimeras: REJECT('fusion'),
  ragingSpirit: [
    trig('faint', 'side', [E.revive('subject', 50), E.trait('subject')], { chance: 25 })
  ],
  valiantHeart: REJECT('fusion'),
  autonomousAttack: autonomous('Attack'),
  autonomousDefense: autonomous('Defense'),
  autonomousHealth: [trig('turnEnd', 'self', E.maxHp('self', hpv('max', 10)))],
  autonomousIntelligence: autonomous('Intelligence'),
  autonomousNetwork: REJECT('statCopy'),
  autonomousSpeed: autonomous('Speed'),
  masterOfClockworks: [auraIf('side', allRace, potencyAll(50))],
  highPerformance: REJECT('spellGem'),
  infiniteScaling: [
    trig(
      'entry',
      'self',
      onlyIf(E.flat('allies', stats('Speed'), sv('Speed', 15)), isRace('Electropod', 'target')),
      {
        when: [isRace('Electropod')]
      }
    )
  ],
  malware: [trig('turnEnd', 'foes', E.dmg('subject', sv('Speed', 40)), { chance: 20 })],
  masterOfElectropods: [auraIf('side', allRace, stageMult({ gain: 1.5 }))],
  networking: REJECT('countBonus'),
  spinCycle: [trig('turnEnd', 'self', E.dmg('randomFoe', sv('Speed', 75)))],
  threadPool: [perRace('Electropod', { stats: pct(10, 'Speed') })],
  alchemistsFury: [
    trig('attack', 'self', [E.status('other', S('Blind')), E.status('other', S('Confused'))])
  ],
  ancientBuffoonery: REJECT('partyOrder'),
  ancientDna: REJECT('identityChange'),
  assimilate: [trig('damaged', 'self', E.stage('self', 'all', stg(5)))],
  backupPackup: [trig('attack', 'self', E.minion('randomAlly', 3, 'direWolves'))],
  barbearian: [trig('entry', 'self', E.provoke()), statMod(pct(35, 'Defense'))],
  blackFog: [
    trig(
      'statusInflicted',
      'self',
      E.dmg('other', sv('lowest', 15, 'self', cnt('debuffs', { who: 'other' })))
    )
  ],
  bloodripper: [
    trig('attack', 'self', E.status('other', S('Bleeding'))),
    dmg(120, { categories: ATK, when: [has('target', 'Bleeding')] })
  ],
  breakneck: REJECT('barrierBypass'),
  bulkyBody: [statMod(pct(100, ...ALL4)), skipTurn(50)],
  burdenOfGuilt: [
    trig('defend', 'self', [
      E.cure('side', 'buff', 1),
      E.cure('side', 'debuff', 1),
      E.cure('foes', 'buff', 1),
      E.cure('foes', 'debuff', 1)
    ])
  ],
  cantripology: REJECT('spellGem'),
  celestial: [
    ...always('side', 'Mending', { targetIf: [C.race('target', ofRace('Exotic'))] }),
    ...always('side', 'Leeching', { targetIf: [C.race('target', ofRace('Exotic'))] })
  ],
  chaoticMind: [variance(100, 200)],
  chaoticPotential: REJECT('spellFamily'),
  clawtailSymbiosis: [trig('attack', 'self', E.extra(), { oncePerTurn: true })],
  conductivity: [side(potency([S('Splashing')], 100))],
  confusionAndEmpathy: REJECT('statSwap'),
  connections: [side(scaling(raceCount('Exotic'), { stats: pct(10, ...ALL4) }))],
  corpseKeeper: [trig('turnEnd', 'side', E.minion('subject', 1, 'zombies'))],
  counterSlash: [trig('attacked', 'self', E.dmg('other', sv('Attack', 65)))],
  crabTrap: [
    trig('attacked', 'self', E.stage('other', stats('Defense', 'Speed'), -stg(35)), {
      when: [C.defending()]
    })
  ],
  deathSentence: [dmg(125, { when: [has('target', 'Feared')] })],
  doubleVision: [trig('attack', 'self', E.cast({ pool: 'ownSpell' }), { chance: 40 })],
  draconicArrogance: [
    trig(
      'entry',
      'allies',
      ALL4.map((name) => E.flat('self', stats(name), sv(name, 5, 'subject')))
    )
  ],
  eeryVeil: [trig('entry', 'self', E.status('side', S('Invisible')))],
  featherDance: [
    trig('statusGained', 'side', E.stage('subject', stats('Defense'), stg(20)), {
      statusKind: 'buff',
      when: [isRace('Exotic', 'subject')]
    })
  ],
  forestsCurse: [
    trig('attack', 'foes', E.random('subject', 'debuff', 2), { when: [C.sameSide('other')] })
  ],
  goldenAura: [
    trig('faint', 'side', onlyIf(E.trait('subjectAllies'), isRace('Exotic', 'target')), {
      when: [isRace('Exotic', 'subject')]
    })
  ],
  gracedByWhimsy: [stageMult({ gain: 1.5 })],
  greybeardsBlessing: REJECT('healConversion'),
  grovelAndBeg: [
    statWhen(pct(50, 'Speed'), [C.hpBelow('self', 75)]),
    negate(50, { when: [C.hpBelow('self', 75)] })
  ],
  grubbyStrength: [trig('faint', 'self', E.dmg('foes', sv('lowest', 3, 'self', cnt('attacks'))))],
  healingBreath: [trig('turnEnd', 'self', E.heal('lowestHpAlly', hpv('max', 150, 'target')))],
  heartsAndMinds: [
    trig(
      'turnEnd',
      'self',
      ALL4.flatMap((name) => [
        E.flat('allies', stats(name), sv(name, 20)),
        E.lose('self', stats(name), sv(name, 20))
      ])
    )
  ],
  hungeringVoid: [trig('turnEnd', 'self', [E.seal('side'), E.seal('foes')])],
  indigestion: [scaling(cnt('deathsTotal'), { defenseIgnored: 10 }, { cap: 100 })],
  inoculant: [
    trig('cast', 'self', E.potency('foes', [S('Burning'), S('Poisoned'), S('Bomb')], 10), {
      when: own
    })
  ],
  labAssistant: REJECT('spellGem'),
  lastWard: [taken(-20), trig('damaged', 'self', E.dmg('other', ev(80)), { when: survived })],
  lizardry: REJECT('charge'),
  loveThyself: [
    trig('maxHpGained', 'foes', E.cast({ skillId: spell('Vitality Explosion'), to: 'subject' }))
  ],
  loyaltysLight: [
    trig('faint', 'any', [E.status('self', S('Rebirth')), E.status('self', S('Shelled'))])
  ],
  marrowMetabolism: [trig('damaged', 'self', E.minionUp('self'))],
  mindReave: [trig('cast', 'foes', E.dmg('subject', sv('Intelligence', 35)))],
  naturalBeauty: [trig('entry', 'self', E.temp('side', spell('Crystal Shield')))],
  nineTailsKnowledge: [side(dmg(30, { categories: SPELL }))],
  numericalNightmare: [
    statWhen(pct(75, 'Attack', 'Speed'), [C.levelOdd(true)]),
    statWhen(pct(75, 'Intelligence', 'Defense'), [C.levelOdd(false)])
  ],
  piercingSpeed: [ignoreDefense(30)],
  pocketTank: [
    intercept({ when: [C.count('self', 'buff', 3)] }),
    taken(-50, { when: [C.count('self', 'buff', 3)] })
  ],
  projection: [
    trig('attack', 'allies', E.atk('other'), { chance: 50, when: own }),
    trig('cast', 'allies', E.cast({ sameSkill: true }), { chance: 50, when: own }),
    trig('defend', 'allies', E.defend(), { chance: 50 }),
    trig('provoke', 'allies', E.provoke(), { chance: 50 })
  ],
  propulsion: [
    trig('timelineTop', 'self', [
      E.status('self', S('Splashing')),
      E.stage('self', stats('Attack'), stg(75))
    ])
  ],
  puffUp: [trig('attacked', 'self', E.stage('self', stats('Attack', 'Intelligence'), stg(30)))],
  reactiveHeads: [trig('damaged', 'side', E.timeline('subject', 'top'), { chance: 15 })],
  redInToothAndClaw: [trig('attacked', 'self', E.timeline('self', 'top'), { chance: 50 })],
  redemption: [trig('faint', 'self', E.heal('allies', hpv('max', 100, 'self')))],
  reform: [
    trig('faint', 'allies', E.revive('subject', 30), {
      when: [C.el('subject', [CLASS.Death]), C.below(cnt('deaths', { who: 'subject' }), 2)]
    })
  ],
  rideTheWhirlwind: [attackStat('lowest', 100), dmg(100)],
  rollout: [trig('turnEnd', 'self', E.atk('randomFoe'))],
  sacrificialWill: [trig('faint', 'self', [E.random('allies', 'buff'), E.minion('allies')])],
  scaling: REJECT('spellGem'),
  sharedConsciousness: [
    trig('cast', 'allies', E.cast({ sameSkill: true }), { chance: 50, when: own })
  ],
  stickSoul: REJECT('statusKeep'),
  sugarAndSlice: [
    trig('statusDamage', 'foes', E.atk('subject', 35), { statusIds: [S('Burning')] })
  ],
  tacosInflation: REJECT('triggerRepeat'),
  tigersSpirit: [side(bonus(sv('Speed', 25), { when: [isRace('Exotic')] }))],
  turbulentWaters: [
    trig('attack', 'self', E.cast({ skillId: spell('Maelstrom') }), { chance: 50 })
  ],
  twinSouls: [dmg(75, { categories: ATK }), extraHits(1, 100, ATK)],
  unleashTheHorde: [side(minionMod({ extraMaxStacks: 3 }))],
  wrathOfKrorena: [side(dmg(65, { when: [C.sameEl('target')] }))],
  crystalLake: [extraHits(2, 100, ATK), repeat(2, SPELL), blockStatus('buff')],
  deadButterflies: [
    trig('faint', 'self', E.revive('self', 100), { when: [C.below(cnt('deaths'), 4)] }),
    taken(75),
    dmg(-50)
  ],
  lostInForever: REJECT('triggerRepeat'),
  masterOfFae: [auraIf('side', allRace, negate(60, { source: 'spell' }))],
  outgrow: REJECT('triggerRepeat'),
  theGreatBeyond: REJECT('manualCast'),
  trueNorth: REJECT('triggerRepeat'),
  darkbloom: REJECT('spellGem'),
  echobreather: [scaling(cnt('distinctElementsOnSide'), { damageDealt: 20, damageTaken: -10 })],
  fearOfSuccess: [
    dmg(75, { categories: ATK }),
    trig('attack', 'self', E.status('other', S('Inverted')))
  ],
  masterOfGodspawn: REJECT('transform'),
  negativeNoise: [negate(90, { when: [C.atLeast(cnt('hpPercent'), 100)] })],
  oathbreaker: REJECT('realm'),
  rodianAftermath: [scaling(cnt('deathsTotal'), { damageDealt: 30 })],
  somethingFromNothing: [
    side(scaling(cnt('timesDamaged'), { damageDealt: 5 })),
    side(scaling(cnt('timesDamaged'), { damageTaken: -1 }, { cap: 90 }))
  ],
  syndicate: REJECT('transform'),
  toolsOfCreation: REJECT('perk'),
  abyssalWaters: [side(statWhen(pct(75, ...ALL4), [C.noGains()]))],
  hundredHands: [statWhen(pct(200, ...ALL4), [C.noGains()])],
  inkyEscape: untouched('Speed', 'Agile'),
  ironShell: untouched('Defense', 'Protected'),
  masterOfKrakens: [auraIf('side', allRace, potencyAll(50))],
  shipbreaker: untouched('Attack', 'Berserk'),
  unblinkingEyes: untouched('Intelligence', 'Arcane'),
  ante: REJECT('statCopy'),
  drawingDead: [statWhen(pct(100, 'Attack'), [C.lower('attack', 'anyFoe')])],
  impliedOdds: [trig('faint', 'any', E.random('side', 'buff'))],
  masterOfLuckmantrias: [auraIf('side', allRace, start('top', 40))],
  royalFlush: shareInnate('Luckmantria'),
  semiBluff: [taken(-30, { when: [C.defending()] })],
  showdown: [statWhen(pct(200, 'Intelligence'), [C.higher('spAttack', 'anyFoe')])],
  bigBrained: [side(immune(S('Confused')))],
  bravelyInspired: [trig('faint', 'self', gainAll4(25, 'allies', 'self'))],
  junkyardMight: [immune(S('Blighted'), S('Confused'), S('Poisoned'))],
  masterOfModrons: [auraIf('side', allRace, resist(50), taken(-20))],
  protectTheGlassCannon: [trig('cast', 'side', E.defend('subject'), { when: own })],
  shallNotPass: [
    trig('damaged', 'side', E.status('subject', S('Barrier'), { amount: ev(100) }), {
      when: [C.dmgAbove(25, 'subject')]
    })
  ],
  uninterrupted: [side(resist(50, { statusIds: [S('Silenced'), S('Scorned')] }))],
  masterOfMythicants: [auraIf('side', allRace, negate(75, { source: 'attack' }))],
  ofBloodUntamed: [
    trig('damaged', 'side', E.dmg('randomFoe', sv('Intelligence', 25, 'subject')), {
      when: [C.cat(...SPELL)]
    })
  ],
  ofCreationUndivided: [trig('entry', 'self', E.trait('side', { count: 3 }))],
  ofDeterminationUnyielding: [
    trig('turnEnd', 'side', E.heal('subject', hpv('max', 15, 'subject', raceCount('Mythicant'))))
  ],
  ofGraceUnending: [side(scaling(raceCount('Mythicant'), { stats: pct(3, ...ALL4) }))],
  ofHeartsUnbowed: REJECT('timelineResist'),
  ofRitualsUnbound: REJECT('spellGem'),
  balancedSpellcasting: REJECT('statAverage'),
  balancedSwordplay: REJECT('statAverage'),
  heightenedLearning: REJECT('statCopy'),
  masterOfNephilim: [
    auraIf('side', allRace, resist(50)),
    trig('entry', 'self', E.random('side', 'buff', 2), { when: allRace })
  ],
  mendersOath: [
    side(healing({ received: -50 })),
    trig('healed', 'side', E.heal('subjectAllies', ev(25)))
  ],
  standAsOne: [side(taken(-50)), trig('damaged', 'side', E.dmg('subjectAllies', ev(25)))],
  unboundCorruption: [trig('turnEnd', 'self', E.dmg('foes', sv('lowest', 25)))],
  acceleratedHarvest: [trig('attack', 'side', E.random('other', 'debuff'), { chance: 20 })],
  carefulPlanning: [trig('faint', 'self', E.flat('allies', stats('Attack'), sv('Attack', 75)))],
  intuition: [side(scaling(cnt('attacks'), { damageTaken: -5 }, { cap: 80 }))],
  knowledgeIsPower: [side(scaling(cnt('attacks'), { damageDealt: 10 }, { categories: SPELL }))],
  masterOfNihilists: [auraIf('side', allRace, resist(50), immune(S('Scorned')))],
  nihilism: [
    trig('attack', 'self', E.dmg('otherFoes', ev(50))),
    scaling(cnt('livingFoes'), { damageDealt: -12 }, { categories: ATK })
  ],
  riverside: [trig('attack', 'side', E.stage('other', stats('Speed'), -stg(20)))],
  flamestalker: stalker('Firestorm', 'Intelligence'),
  masterOfSpellmanes: [auraIf('side', allRace, immune(S('Silenced')))],
  sandstalker: stalker('Sandstorm', 'Attack'),
  skystalker: stalker('Whirlwind', 'Intelligence'),
  snowstalker: stalker('Snowstorm', 'Attack'),
  staticstalker: stalker('Chain Lightning', 'Speed'),
  vilestalker: stalker('Acid Rain', 'Speed'),
  cullTheWeak: [
    trig('faint', 'foes', onlyIf(E.stage('side', 'all', stg(15)), isRace('Uralos', 'target')))
  ],
  escalation: [uralos('cast', E.stage('side', stats('Intelligence'), stg(35)), own)],
  formation: [uralos('damaged', E.stage('side', stats('Defense'), stg(5)))],
  healingAura: [
    trig('turnEnd', 'side', E.heal('subject', sv('highest', 25, 'subject')), {
      when: [isRace('Uralos', 'subject')]
    })
  ],
  hungerForBlood: [uralos('attack', E.stage('side', stats('Attack'), stg(10)))],
  masterOfUraloses: [auraIf('side', allRace, negate(50, { source: 'indirect' }))],
  warDance: [
    uralos('defend', E.stage('side', stats('Speed'), stg(20))),
    uralos('provoke', E.stage('side', stats('Speed'), stg(20)))
  ],
  bladeEater: eater('Disarmed', 'Attack'),
  hogWild: [
    trig('statusInflicted', 'side', E.random('subject', 'buff'), {
      when: [isRace('Warhog', 'subject')]
    })
  ],
  lifeEater: eater('Blighted', 'lowest', 30),
  magicEater: eater('Silenced', 'Intelligence'),
  masterOfWarhogs: [auraIf('side', allRace, potencyAll(100))],
  spiritEater: eater('Cursed', 'Speed'),
  steelEater: eater('Vulnerable', 'Defense'),
  youMonstersArePeople: REJECT('statusPotency'),
  excruciatingVenom: REJECT('statusPotency'),
  harbingersSign: [
    trig('attacked', 'self', E.cast({ skillId: spell("Harbinger's Curse") }), { chance: 50 })
  ],
  sharpnelBlast: [
    trig('statusDamage', 'foes', E.dmg('subjectAllies', ev(30)), { statusIds: [S('Bomb')] })
  ]
}
