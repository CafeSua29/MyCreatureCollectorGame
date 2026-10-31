/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 4 (thứ tự lúc soạn: 600–799).
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
  critChance,
  dodge,
  negate,
  extraHits,
  repeat,
  healing,
  attackStat,
  bonus,
  resist,
  potencyAll,
  lifesteal,
  orderBy,
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
const pair = (a, b) => [
  trig('statusGained', 'foes', E.status('subject', S(b)), { statusIds: [S(a)] }),
  trig('statusGained', 'foes', E.status('subject', S(a)), { statusIds: [S(b)] })
]
const classSpellCast = (klass) => [C.skillElement([CLASS[klass]])]

export const CONVERSIONS = {
  divisionOfMortality: [bonus(hpv('current', 100))],
  bigBoned: [
    trig('entry', 'self', [
      E.maxHp('self', sv('highest', 35)),
      E.lose('self', 'all', sv('highest', 90))
    ])
  ],
  masterOfKolosses: [
    trig('entry', 'self', E.maxHp('side', hpv('max', 20, 'target', raceCount('Koloss'))), {
      when: [isRace('Koloss')]
    })
  ],
  comingUndone: [
    trig('attack', 'side', E.stage('subject', 'all', 1), { when: [has('subject', 'Leeching')] })
  ],
  cleansedBlood: [side(dmg(30, { when: [has('self', 'Leeching')] }))],
  deeperSucking: [side(lifesteal(25))],
  bloodlust: [side(lifesteal(25), healing({ received: 30 }))],
  bloodBarrier: [
    trig('healed', 'side', E.status('subject', S('Barrier'), { amount: ev(50) }), {
      when: [has('subject', 'Leeching')],
      oncePerTurn: true
    })
  ],
  imbibe: [
    trig('damaged', 'side', E.heal('subject', ev(40)), { when: [has('subject', 'Leeching')] })
  ],
  masterOfLeeches: [auraIf('side', allRace, lifesteal(75))],
  lushLicks: [trig('attack', 'side', E.move('subject', 'other', 'debuff', true))],
  pusAndPox: [trig('turnEnd', 'foes', E.random('subject', 'debuff'))],
  bloodBoil: [
    trig('provoke', 'self', [
      E.dmg('foes', sv('Speed', 50, 'self', cnt('debuffs'))),
      E.kill('self')
    ])
  ],
  finalExcretion: [trig('faint', 'foes', E.cast({ skillId: spell('Corpse Explosion') }))],
  hugsAndKisses: [trig('damaged', 'self', E.random('other', 'debuff'))],
  puppetMaster: [scaling(cnt('minionStacks'), { damageDealt: 20, damageTaken: -5 })],
  stank: [foes(scaling(cnt('debuffs'), { damageDealt: -5, damageTaken: 7 }, { cap: 90 }))],
  wrongSide: [
    {
      type: 'statusConversion',
      params: { from: 'debuff', chance: 40, onto: 'ally', redirect: 'reflect' }
    },
    {
      type: 'statusConversion',
      params: { from: 'debuff', chance: 40, onto: 'self', redirect: 'reflect' }
    }
  ],
  masterOfLepers: [
    trig('statusInflicted', 'side', E.random('other', 'debuff'), {
      when: [C.allRace()],
      oncePerTurn: true
    })
  ],
  hereticBlood: REJECT('charge'),
  necronomicon: [side({ type: 'repeatSkill', params: { extra: 2, categories: SPELL } })],
  hailToTheKing: [
    trig('entry', 'self', [
      E.minion('self', 1, 'conquest'),
      E.minion('self', 1, 'war'),
      E.minion('self', 1, 'death'),
      E.minion('self', 1, 'famine')
    ])
  ],
  necromastery: REJECT('charge'),
  watchOfTheBuried: [trig('minionGained', 'self', E.minion('self', 9))],
  darkAegis: REJECT('spellGem'),
  unholyPrayer: [trig('entry', 'self', E.temp('side', spell('Murder of Crows')))],
  sacrimony: [side(dmg(100, { when: classSpellCast('Death') }))],
  andricksEmpowerment: [side(scaling(cnt('minionStacks'), { damageDealt: 5 }))],
  andricksFolly: [trig('minionGained', 'side', E.minion('subject', 1), { oncePerTurn: true })],
  andricksRoyalDecree: [trig('minionGained', 'side', E.random('subject', 'buff'))],
  masterOfLiches: [
    trig('cast', 'side', E.stage('subject', stats('Intelligence'), 1), {
      when: [...classSpellCast('Death'), isRace('Lich', 'subject')]
    })
  ],
  meatBomb: [trig('provoke', 'self', [E.dmg('foes', hpv('missing', 50)), E.kill('self')])],
  noFear: [side(dmg(100, { when: [C.hpBelow('self', 35)] }))],
  detonation: [
    trig('provoke', 'self', [
      E.dmg('foes', hpv('max', 25, 'self')),
      onlyIf(E.kill('allies'), isRace('Maniac', 'target'))
    ])
  ],
  badBlood: [
    trig('faint', 'side', [
      E.status('foes', S('Poisoned')),
      E.status('foes', S('Burning')),
      E.status('foes', S('Bleeding'))
    ])
  ],
  cannibalisticTendencies: [
    trig('provoke', 'side', [E.kill('subject'), ...gainAll4(20, 'allies', 'subject')])
  ],
  niceHaircut: [
    trig('faint', 'side', E.revive('subject', 50), {
      chance: 50,
      when: [isRace('Maniac', 'subject')]
    })
  ],
  masterOfManiacs: [
    trig('entry', 'self', [E.maxHp('side', hpv('max', 25, 'target', raceCount('Maniac')))], {
      when: [isRace('Maniac')]
    })
  ],
  loidsLaugh: [
    trig('cast', 'foes', [
      E.stage('subject', stats('Intelligence'), -1),
      E.status('subject', S('Silenced'))
    ])
  ],
  loidsPustulantPimples: [
    trig('defend', 'foes', E.random('subject', 'debuff', 3)),
    trig('provoke', 'foes', E.random('subject', 'debuff', 3))
  ],
  loidsVisage: [
    trig('attack', 'foes', [
      E.stage('subject', stats('Attack'), -1),
      E.status('subject', S('Scorned'))
    ])
  ],
  whiplash: [trig('attack', 'self', E.dmg('randomFoe', sv('Attack', 40), { times: 2 }))],
  theCrimson: [foes(statMod(pct(-40, 'Attack')))],
  beastWithin: [
    trig('statGain', 'side', E.stage('subject', stats('Attack'), 1), { oncePerTurn: true })
  ],
  parry: [trig('turnEnd', 'self', E.flat('self', stats('Defense'), sv('Attack', 50)))],
  mouthForWar: [trig('cast', 'self', E.atk('other', 100, 2), { when: [C.single()] })],
  covert: [side(orderBy('attack'))],
  conservation: [trig('turnEnd', 'self', E.flat('self', stats('Defense'), sv('highest', 30)))],
  razorHide: [trig('attacked', 'self', E.dmg('other', sv('Attack', 75)))],
  masterOfManticores: [
    foes(scaling(raceCount('Manticore'), { stats: pct(-5, 'Attack') })),
    side(scaling(raceCount('Manticore'), { stats: pct(15, 'Attack', 'Defense') }))
  ],
  underStress: [side(dodge(20, { per: cnt('debuffs') }), critChance(20, { per: cnt('debuffs') }))],
  lustForPunishment: [side(scaling(cnt('debuffs'), { damageDealt: 40 }))],
  redefined: REJECT('countBonus'),
  purge: [trig('turnEnd', 'side', E.cure('subject', 'debuff', 1), { chance: 35 })],
  boonToBane: [
    { type: 'statusConversion', params: { from: 'buff', to: 'debuff', chance: 50, onto: 'foe' } }
  ],
  vendetta: [scaling(cnt('debuffs'), { damageDealt: 100 })],
  phlebotomize: [
    trig('defend', 'self', [
      E.heal('side', hpv('max', 50, 'target', cnt('debuffs'))),
      E.cure('self', 'debuff')
    ])
  ],
  binaryAffliction: [
    trig('attack', 'self', [E.random('self', 'buff'), E.random('other', 'debuff')])
  ],
  bladedancing: [
    trig('crit', 'side', E.atk('other', 100, 1, 'subject'), { chance: 30, repeatChance: 30 })
  ],
  butterflyTouch: [taken(-15)],
  phobosGrip: [
    trig('attack', 'side', E.status('other', S('Snared')), { when: [has('subject', 'Proficient')] })
  ],
  masterOfMasochists: [auraIf('side', allRace, resist(50), taken(-30))],
  nothingButCoal: [trig('faint', 'self', E.dmg('foes', sv('Attack', 35)))],
  hydration: [trig('entry', 'self', E.trait('self', { count: 5 }))],
  surprise: [{ type: 'startPosition', params: { position: 'top' } }],
  pandorasBox: [
    trig(
      'entry',
      'self',
      ['Chaos', 'Death', 'Life', 'Nature', 'Sorcery'].map((klass) =>
        E.cast({ pool: 'global', elementIds: [CLASS[klass]] })
      )
    )
  ],
  giftwrappedArmy: [
    trig('entry', 'self', E.random('self', 'buff', 2), { when: [isRace('Mimic')] })
  ],
  sadBirthdaySong: REJECT('transform'),
  ultimateTrickery: REJECT('transform'),
  masterOfMimics: [{ type: 'startPosition', params: { position: 'top', chance: 25 } }],
  resolve: [
    { type: 'debuffImmunity', params: { when: [C.hpBelow('self', 50)] } },
    taken(-50, { when: [C.hpBelow('self', 50)] })
  ],
  seeingRed: [
    side(dmg(50, { when: [C.hpBelow('self', 75)] }), taken(-25, { when: [C.hpBelow('self', 75)] }))
  ],
  fracture: [trig('attacked', 'self', E.dmg('foes', ev(50)))],
  fleshWound: [
    trig('damaged', 'self', E.status('self', S('Barrier'), { amount: hpv('max', 100) }), {
      when: [C.hpBelow('self', 50)]
    })
  ],
  piercingFocus: [
    scaling(cnt('missingHpPercent'), { defenseIgnored: 1 }, { categories: ATK, cap: 100 })
  ],
  riseToFall: [trig('attack', 'self', E.heal('self', hpv('max', 30))), healing({ received: 100 })],
  bloodCrazed: [
    trig('attacked', 'self', [E.stage('self', stats('Attack'), stg(35)), E.heal('self', ev(40))])
  ],
  masterOfMinotaurs: [auraIf('side', allRace, extraHits(1, 100, ['physical']), dmg(-50))],
  cradleToTheGrave: [
    trig('faint', 'side', E.revive('subject', 50), { chance: 15, chancePer: cnt('faintedAllies') })
  ],
  corrosion: [
    trig('attack', 'self', [
      onlyIf(E.heal('other', ev(100)), has('target', 'Blighted')),
      onlyIf(E.status('other', S('Blighted')), lacks('target', 'Blighted'))
    ])
  ],
  neonGrave: [trig('attack', 'self', E.cast({ skillId: spell('Affliction') }), { chance: 35 })],
  swell: [
    trig('attack', 'self', E.random('other', 'debuff'), { when: [C.count('other', 'debuff', 1)] })
  ],
  villainyThrives: REJECT('potencyShare'),
  intensify: [trig('attack', 'self', E.potency('other', [S('Poisoned'), S('Burning')], 50))],
  viscousWebs: [foes(scaling(cnt('debuffs'), { damageTaken: 25 }))],
  masterOfMites: [perRace('Mite', { damageTaken: -5 })],
  noSanctuary: [attackStat('speed', 100, ['physical', 'special'])],
  innerHatred: [side(statMod(pct(100, 'Attack')))],
  exploitation: [
    side(
      scaling(cnt('foesWithStatus', { statusIds: [S('Cursed')] }), {
        stats: pct(20, 'Attack', 'Intelligence')
      })
    )
  ],
  gimpTouch: strikeWith('Cursed'),
  pharaohsBeckoning: [trig('attack', 'self', E.atk('self', 25, 3, 'other'))],
  mockery: [
    side(
      scaling(
        cnt('foesWithStatus', { statusIds: [S('Cursed')] }),
        { damageTaken: -30 },
        { categories: SPELL, cap: 90 }
      )
    )
  ],
  curseOfTheOutspoken: [
    trig('cast', 'foes', [E.status('subject', S('Cursed')), E.status('subject', S('Vulnerable'))])
  ],
  sorrow: [
    foes({ type: 'statusDamageModifier', params: { statusIds: [S('Cursed')], percent: 50 } })
  ],
  masterOfMummies: REJECT('turnOwnership'),
  ambush: [trig('turnEnd', 'self', E.atk('randomFoe'))],
  breakDownAndCry: [trig('faint', 'self', E.cast({ pool: 'ownSpell', times: 3 }))],
  subtlety: [side(dmg(-50, { when: [C.reactive(false)] }), dmg(100, { when: [C.reactive(true)] }))],
  heartseeker: [extraHits(1, 135)],
  starless: [
    side({ type: 'statGainBlock', params: {} }),
    foes({ type: 'statGainBlock', params: {} })
  ],
  supersonic: [trig('entry', 'self', E.status('foes', S('Silenced'), { turns: 1 }))],
  rerouteToRemain: [trig('entry', 'self', E.status('foes', S('Scorned'), { turns: 1 }))],
  pacingDeathsTrail: [trig('faint', 'allies', E.atk('randomFoe', 100, 4))],
  masterOfNixes: [
    auraIf('side', allRace, negate(25)),
    trig('entry', 'self', E.status('self', S('Invisible')), { when: allRace })
  ],
  lingeringIncantation: [
    trig('cast', 'side', E.random('randomFoe', 'debuff', 3), { when: classSpellCast('Sorcery') })
  ],
  strengthOfTheMind: [side({ type: 'statLowerImmunity', params: { stats: ['spAttack'] } })],
  sealMagic: [trig('cast', 'foes', E.seal('subject'))],
  conjuration: REJECT('charge'),
  thaumaturgy: REJECT('spellGem'),
  phantasm: [side(scaling(cnt('casts'), { damageDealt: 30 }, { categories: SPELL }))],
  apprenticeship: [
    trig('cast', 'allies', E.cast({ skillId: spell('Magic Missile'), to: 'randomFoe' }), {
      when: own
    })
  ],
  vipersMind: [trig('turnEnd', 'self', E.flat('self', stats('Intelligence'), sv('Speed', 50)))],
  arcaneBrilliance: [
    trig('cast', 'side', E.stage('subject', stats('Intelligence'), stg(40)), {
      when: classSpellCast('Sorcery')
    })
  ],
  sareasCommand: [trig('entry', 'self', E.atk('foes', 100, 1, 'foes'))],
  sareasHaste: REJECT('netZero'),
  sareasPlot: [side(scaling(cnt('timesDamaged'), { damageDealt: 15 }))],
  masterOfOccultists: [auraIf('side', allRace, repeat(1, SPELL))],
  infusion: [side(dmg(100, { when: classSpellCast('Life') }), healing({ dealt: 100 }))],
  twistOfFate: [
    trig('cast', 'side', E.random('subject', 'buff'), {
      when: [...classSpellCast('Life'), C.own()]
    })
  ],
  spectrumOfEternity: [
    trig('cast', 'side', E.extra('subject'), {
      chance: 50,
      when: [...classSpellCast('Life'), C.own()]
    })
  ],
  solace: REJECT('spellGem'),
  worship: [
    trig('cast', 'side', E.trait('subject'), { when: [...classSpellCast('Life'), C.own()] })
  ],
  centerOfTheUniverse: REJECT('spellGem'),
  mantra: [trig('entry', 'self', E.temp('side', spell('Major Healing')))],
  nerlyxsChant: [trig('defend', 'side', E.random('subject', 'buff'))],
  nerlyxsDisturbance: [side(scaling(cnt('defends'), { damageTaken: -10 }, { cap: 90 }))],
  nerlyxsVeil: [trig('defend', 'side', E.extra('subject'), { chance: 50 })],
  masterOfOphans: [
    trig('cast', 'side', E.heal('side', hpv('max', 25, 'target')), {
      when: [...classSpellCast('Life'), isRace('Ophan', 'subject')]
    })
  ],
  lonesomeHaze: [trig('revived', 'side', E.atk('randomFoe', 100, 3, 'subject'))],
  introvert: [trig('revived', 'side', E.status('subject', S('Rebirth')), { chance: 35 })],
  solitaryEmpowerment: [trig('entry', 'self', E.status('side', S('Rebirth')))],
  forbearance: [trig('revived', 'side', E.heal('subject', hpv('max', 100, 'subject')))],
  asceticism: [
    trig('revived', 'side', [
      E.status('subject', S('Mending')),
      E.status('subject', S('Repelling')),
      E.status('subject', S('Shelled'))
    ])
  ],
  reclusiveGlutton: [trig('revived', 'side', E.cast({ pool: 'global', times: 5 }))],
  giransRigor: [{ type: 'statLowerImmunity', params: { stats: 'all' } }],
  giransStrategy: REJECT('partyOrder'),
  giransUnity: [trig('entry', 'self', E.flat('self', 'all', sv('highest', 10, 'self')))],
  masterOfOsseins: [trig('entry', 'self', E.status('self', S('Rebirth')), { when: allRace })],
  amethystAttunement: REJECT('charge'),
  bismuthAttunement: [
    side({ type: 'stageMultiplier', params: { gain: 0.5 } }),
    foes({ type: 'stageMultiplier', params: { gain: 0.5 } })
  ],
  chocolateAttunement: [
    side({ type: 'statusGainBlock', params: { kind: 'buff' } }),
    foes({ type: 'statusGainBlock', params: { kind: 'buff' } })
  ],
  diamondAttunement: [side(dmg(50, { categories: SPELL })), foes(dmg(50, { categories: SPELL }))],
  emeraldAttunement: [side(dmg(50)), foes(dmg(50))],
  opalAttunement: [
    side({ type: 'statLowerImmunity', params: { stats: 'all' } }),
    foes({ type: 'statLowerImmunity', params: { stats: 'all' } })
  ],
  rubyAttunement: [
    trig('entry', 'self', [
      E.maxHp('side', hpv('max', 75, 'target')),
      E.maxHp('foes', hpv('max', 75, 'target'))
    ])
  ],
  sapphireAttunement: [side(taken(-50)), foes(taken(-50))],
  topazAttunement: [
    side({ type: 'statusDuration', params: { turns: 1, on: 'received' } }),
    foes({ type: 'statusDuration', params: { turns: 1, on: 'received' } })
  ],
  chromasShelter: [taken(-100, { when: [C.sameEl('attacker')] })],
  chromasSolution: [
    statWhen(pct(100, 'Intelligence'), [has('self', 'Scorned')]),
    statWhen(pct(100, 'Attack'), [has('self', 'Silenced')])
  ],
  chromasStability: [
    negate(100, { source: 'attack', when: [has('self', 'Scorned')] }),
    negate(100, { source: 'spell', when: [has('self', 'Silenced')] })
  ],
  masterOfParagons: [side(taken(-80, { categories: SPELL, when: [isRace('Paragon')] }))],
  resilienceAura: [trig('faint', 'foes', E.revive('faintedAllies', 50))],
  mightAura: [side(dmg(25))],
  enduranceAura: [side({ type: 'indirectDamage', params: { percent: -70 } })],
  agilityAura: [side(dodge(40))],
  shieldAura: [trig('damaged', 'side', E.status('subject', S('Shelled')), { chance: 35 })],
  dexterityAura: [side(critChance(20), dodge(20))],
  shockAura: [trig('attacked', 'side', E.dmg('other', sv('Speed', 25, 'other')))],
  masterOfPhaseWarriors: [auraIf('side', allRace, { type: 'indirectDamageImmunity', params: {} })],
  lifebinder: [
    trig('kill', 'side', E.revive('faintedAllies', 50), { when: [C.sameSide('other')] })
  ],
  finalBreath: [trig('revived', 'foes', E.kill('subject'), { chance: 75 })],
  terminus: [trig('turnEnd', 'self', [E.kill('self'), E.revive('self', 100)])],
  breathOfTheDying: [trig('revived', 'side', E.status('foes', S('Frozen')))],
  secondChance: [trig('revived', 'side', E.timeline('subject', 'top'), { chance: 50 })],
  thundershock: [trig('revived', 'side', E.status('foes', S('Stone')))],
  alternateReality: [allies0(taken(-60))],
  buffet: [trig('revived', 'side', E.dmg('foes', sv('Speed', 50)))],
  masterOfPhoenixes: [auraIf('side', allRace, potencyAll(50))],
  brainDrain: [
    trig(
      'statusDamage',
      'foes',
      E.flat('side', stats('Intelligence'), sv('Intelligence', 15, 'subject'), 'subject'),
      {
        statusIds: [S('Bleeding')]
      }
    )
  ],
  shadowHook: [
    side(scaling(cnt('foesWithStatus', { statusIds: [S('Bleeding')] }), { damageDealt: 10 })),
    foes(scaling(cnt('foesWithStatus', { statusIds: [S('Bleeding')] }), { damageDealt: -10 }))
  ],
  kindling: pair('Bleeding', 'Burning'),
  bleedOut: [trig('statusDamage', 'foes', E.heal('side', ev(50)), { statusIds: [S('Bleeding')] })],
  spatter: [trig('faint', 'foes', E.dmg('foes', hpv('max', 20, 'subject')), { when: [] })],
  throatSlash: [trig('entry', 'self', E.status('foes', S('Bleeding')))],
  flay: strikeWith('Bleeding')
}

/** "Đồng đội (không gồm nó)": hào quang allies. */
function allies0(...hooks) {
  return { type: 'aura', params: { scope: 'allies', hooks } }
}
