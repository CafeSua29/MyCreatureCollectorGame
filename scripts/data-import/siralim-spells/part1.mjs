/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi spell Siralim, phần 1 (thứ tự trong skills-planned.json lúc soạn: 0–139).
import {
  ST,
  CLASS,
  stats,
  sv,
  hpv,
  ev,
  cnt,
  E,
  C,
  REJECT,
  onlyIf,
  hit,
  cast,
  pb,
  ifThen,
  basedOn,
  ch,
  HEAL,
  STAGE
} from './sdsl.mjs'

const S = (name) => ST[name]
const has = (who, ...names) => C.has(who, names.map(S))
const ALL4 = ['Attack', 'Intelligence', 'Defense', 'Speed']
/** Gây / nhận các trạng thái theo tên Siralim. */
const give = (to, ...names) => names.map((name) => E.status(to, S(name)))
const healPct = (to, percent, of = to) => E.heal(to, hpv('max', percent, of))
const barrier = (to, amount) => E.status(to, S('Barrier'), { amount })
const toClass = (to, className) => E.identity(to, { elementIds: [CLASS[className]] })
const CLASSES = ['Chaos', 'Death', 'Life', 'Nature', 'Sorcery']

export const CONVERSIONS = {
  absoluteCorruption: cast('enemy', {
    onTarget: [
      E.random('subject', 'debuff', 1, { countPer: cnt('buffs', { who: 'subject' }) }),
      E.cure('subject', 'buff')
    ]
  }),
  absoluteFocus: REJECT('nextAction'),
  abundance: cast('allAllies', {
    onTarget: [healPct('subject', HEAL.small), E.stage('subject', stats(...ALL4), STAGE.small)]
  }),
  acidBomb: hit('small', 'enemy', { onTarget: [E.burst('subject', [S('Bomb')], 1, true)] }),
  adrenalineRush: cast('self', { after: [E.atk('randomFoe', 15, 3)] }),
  affliction: cast('allEnemies', { onTarget: [E.random('subject', 'debuff')] }),
  afterlife: REJECT('triggerActivation'),
  aftermath: cast('self', {
    after: [{ ...E.atk('randomFoe', 100), timesPer: cnt('turnsTaken', { max: 10 }) }]
  }),
  aggravate: cast('allEnemies', {
    onTarget: [onlyIf(E.atk('self', 25, 1, 'subject'), has('subject', 'Cursed'))]
  }),
  amberAle: cast('self', { after: [E.atk('randomFoe', 300)] }),
  ancientPrayer: cast('self', { after: [E.move('self', 'allies', 'buff', true)] }),
  anger: REJECT('statSet'),
  angryOrchard: hit('moderate', 'allEnemies', { hits: 4 }),
  antidote: cast('allAllies', {
    onTarget: [
      E.heal('subject', hpv('max', HEAL.small, 'subject', cnt('debuffs', { who: 'subject' })))
    ]
  }),
  apocalypse: hit('massive', 'allEnemies', { after: [E.dmg('side', ev(50))] }),
  arbitration: cast('allEnemies', { onTarget: [E.move('subject', 'side', 'buff')] }),
  arcaneEnchantment: cast('self', { after: give('self', 'Warded', 'Protected') }),
  arcaneFallacy: REJECT('forcedCast'),
  archangelsBlessing: cast('allAllies', {
    onTarget: [healPct('subject', 30), E.random('subject', 'buff')]
  }),
  aridAlcohol: cast('allEnemies', {
    onTarget: [
      onlyIf(E.random('subject', 'debuff'), C.atLeast(cnt('debuffs', { who: 'subject' }), 6)),
      onlyIf(E.random('subject', 'debuff'), C.atLeast(cnt('debuffs', { who: 'subject' }), 4)),
      E.random('subject', 'debuff')
    ]
  }),
  ascension: REJECT('autoCast'),
  awakenedNetherOrbs: cast('self', { after: [E.cast({ pool: 'global', tags: ['ultimate'] })] }),
  banginBourbon: hit('massive', 'enemy', { onTarget: [E.dmg('otherFoes', ev(80))] }),
  astralDimension: REJECT('unseal'),
  blackIce: cast('allEnemies', {
    onTarget: [ch(E.status('subject', S('Frozen')), 50)],
    after: [ch(E.status('side', S('Invisible')), 50)]
  }),
  bladestorm: hit('moderate', 'allEnemies', {
    powerBonus: [pb(1, cnt('missingHpPercent', { who: 'target' }))]
  }),
  blankSlate: REJECT('traitRemoval'),
  blastarPunch: hit('large', 'enemy', { onTarget: give('subject', 'Scorned') }),
  blastwave: hit('small', 'allEnemies', {
    powerBonus: [ifThen('small', 'massive', [has('target', 'Burning')], 'allEnemies')]
  }),
  blindingBeam: hit('large', 'allEnemies', { onTarget: give('subject', 'Blind') }),
  blindside: hit('small', 'enemy', { ignoreDefense: 100 }),
  blisteringRadiance: hit('large', 'allEnemies', { onTarget: give('subject', 'Scorned') }),
  bloodBurst: hit('moderate', 'enemy', {
    powerBonus: [pb(2, cnt('hpPercent', { who: 'target' }))]
  }),
  bloodShield: hit('large', 'enemy', { onTarget: [barrier('self', ev(200))] }),
  bloodSpray: REJECT('statusHistory'),
  bloodwave: REJECT('statHistory'),
  blowMind: hit('small', 'allEnemies', {
    powerBonus: [pb(20, cnt('sideCasts', { who: 'target' }))]
  }),
  boneOffering: cast('enemy', {
    onTarget: [E.stage('subject', stats('Defense'), -STAGE.large)],
    after: [E.stage('side', stats('Defense'), STAGE.small)]
  }),
  brainFreeze: cast('allEnemies', { onTarget: [E.seal('subject', 2)] }),
  breathOfLife: cast('self', {
    after: [E.revive('faintedAlly', HEAL.massive), healPct('lowestHpAlly', HEAL.massive, 'target')]
  }),
  brethren: cast('self', { after: [E.atk('randomFoe', 100, 1, 'allies')] }),
  brightwave: REJECT('forcedCast'),
  butcher: hit('devastating', 'enemy', { onTarget: [E.flat('side', stats(...ALL4), ev(30))] }),
  cannibalize: hit('small', 'enemy', {
    powerBonus: [ifThen('small', 'devastating', [C.sameEl('target')])]
  }),
  cauterizeWound: cast('self', {
    after: [healPct('self', HEAL.small), onlyIf(healPct('self', 50), has('target', 'Burning'))]
  }),
  chainLightning: hit('large', 'enemy', { onTarget: [E.dmg('otherFoes', ev(85))] }),
  chaosBlades: hit('small', 'enemy', { powerBonus: [pb(5, cnt('attacks'))] }),
  chaosChanneling: cast('enemy', { onTarget: [E.random('subject', 'debuff', 3)] }),
  chaosMastery: cast('allAllies', {
    onTarget: [E.stage('subject', stats('Attack'), STAGE.moderate), ...give('subject', 'Savage')]
  }),
  chaosNexus: cast('enemy', { after: [E.identity('foes', { elementFrom: 'other' })] }),
  chaosOrb: hit('large', 'allEnemies', { onTarget: [E.cure('subject', 'buff')] }),
  chaosReign: REJECT('stealCast'),
  chaosRift: cast('allAllies', { onTarget: [E.trait('subject')] }),
  chaosSpheres: cast('enemy', { onTarget: [E.seal('subject', 4)] }),
  charmOfLife: cast('allAllies', {
    onTarget: [
      E.stage('subject', stats('Attack', 'Speed'), STAGE.moderate),
      E.maxHp('subject', hpv('max', HEAL.moderate, 'subject'))
    ]
  }),
  cherubsMissile: cast('enemy', {
    onTarget: [...give('subject', 'Poisoned', 'Sleeping'), E.random('otherFoes', 'debuff')]
  }),
  chrysalis: cast('self', {
    after: [E.stage('self', stats('Defense'), STAGE.massive), E.timeline('self', 'bottom')]
  }),
  clawingShadows: hit('moderate', 'enemy', { attackStat: basedOn('highest') }),
  clayman: cast('self', { after: [E.maxHp('self', hpv('current', 100))] }),
  cloggedPores: cast('enemy', { onTarget: give('subject', 'Poisoned', 'Burning', 'Bleeding') }),
  cloudBeam: hit('small', 'enemy', { hits: 5 }),
  cloudOfEmbers: REJECT('timelinePosition'),
  colorwaveChaos: hit('devastating', 'enemy'),
  colorwaveDeath: cast('allEnemies', { onTarget: [E.random('subject', 'debuff', 3)] }),
  colorwaveLife: cast('allAllies', { onTarget: [E.random('subject', 'buff', 5)] }),
  colorwaveNature: cast('allAllies', { onTarget: [E.stage('subject', 'all', STAGE.large)] }),
  colorwaveSorcery: cast('self', { after: [E.cast({ pool: 'ownSpell' })] }),
  comet: hit('moderate', 'allEnemies', { powerTimes: cnt('turnsTaken') }),
  condemnLight: cast('allEnemies', { onTarget: [toClass('subject', 'Life')] }),
  conductiveChains: hit('moderate', 'enemy', { onTarget: [E.dmg('otherFoes', ev(120))] }),
  conflagration: REJECT('statusPotency'),
  conjoin: REJECT('statusPotency'),
  consecration: hit('small', 'allEnemies', { after: [healPct('self', HEAL.large)] }),
  constriction: cast('enemy', { onTarget: give('subject', 'Weak', 'Snared') }),
  controlledBurn: hit('large', 'enemy', { powerBonus: [pb(5, cnt('casts'))] }),
  convokeTheSpirits: hit('large', 'enemy', { powerBonus: [pb(100)] }),
  corpseExplosion: hit('small', 'allEnemies', { powerTimes: cnt('deathsTotal') }),
  corpseShield: cast('allAllies', {
    onTarget: [barrier('subject', hpv('max', HEAL.large, 'subject', cnt('faintedAllies')))]
  }),
  corruption: cast('enemy', { onTarget: give('subject', 'Blighted', 'Cursed') }),
  cosmicRipple: hit('moderate', 'enemy'),
  counterspell: REJECT('charge'),
  covenant: cast('self', { after: give('self', 'Rebirth') }),
  crackle: hit('moderate', 'enemy', { onTarget: give('subject', 'Confused') }),
  crossPollination: cast('allAllies', {
    onTarget: [
      toClass('subject', 'Nature'),
      E.flat('subject', 'highest', sv('highest', 50, 'self'))
    ]
  }),
  crueltyOfTheWild: cast('allEnemies', {
    onTarget: [
      onlyIf(healPct('subject', HEAL.moderate), has('subject', 'Blighted')),
      onlyIf(E.status('subject', S('Blighted')), C.lacks('subject', [S('Blighted')]))
    ]
  }),
  crushingImpact: cast('enemy', { onTarget: [E.atk('subject', 100, 1, 'otherFoes')] }),
  crystalShield: cast('allAllies', {
    onTarget: [barrier('subject', sv('Defense', 100, 'subject'))]
  }),
  crystalSpears: hit('moderate', 'enemy', { onTarget: [E.dmg('subject', hpv('current', 20))] }),
  curseOfTheSwarm: cast('allEnemies', {
    onTarget: [E.random('subject', 'debuff', 1, { countPer: cnt('distinctElementsOnSide') })]
  }),
  cycloneStrike: hit('devastating', 'allEnemies'),
  damnation: cast('allEnemies', { onTarget: give('subject', 'Cursed') }),
  darkCrystal: cast('self', { after: give('self', 'Shelled', 'Arcane') }),
  darkEnchantment: cast('self', { after: give('self', 'Arcane') }),
  darkRitual: cast('ally', {
    onTarget: [
      E.move('subject', 'self', 'buff'),
      E.flat('self', stats('Attack'), sv('Attack', 100, 'subject')),
      E.flat('self', stats('Speed'), sv('Speed', 100, 'subject')),
      E.kill('subject')
    ]
  }),
  darkSeraphim: cast('self', {
    after: [
      healPct('self', 100),
      E.stage('self', stats('Attack', 'Intelligence', 'Speed'), STAGE.massive)
    ]
  }),
  darkStrike: hit('devastating', 'enemy', { onTarget: [E.random('subject', 'debuff', 10)] }),
  darkThoughts: cast('allAllies', {
    onTarget: [
      E.stage('subject', stats('Intelligence'), STAGE.massive),
      ...give('subject', 'Scorned')
    ]
  }),
  darkTranquility: REJECT('hpInvert'),
  darkWhispers: cast('allAllies', { onTarget: give('subject', 'Arcane') }),
  deathBlossom: hit('small', 'allEnemies', { hits: 3 }),
  deathGrip: hit('large', 'enemy', { onTarget: [E.timeline('subject', 'bottom')] }),
  deathOrb: cast('allEnemies', {
    onTarget: [E.random('subject', 'debuff'), E.stage('subject', 'all', -STAGE.moderate)]
  }),
  // Không có Charge nên spell hạ ngay chỉ có tác dụng khi mục tiêu dưới 50% máu (xem report).
  deathSiphon: cast('enemy', {
    onTarget: [
      ...ALL4.map((name) =>
        onlyIf(E.flat('self', stats(name), sv(name, 50, 'subject')), C.hpBelow('subject', 50))
      ),
      onlyIf(E.maxHp('self', hpv('max', 50, 'subject')), C.hpBelow('subject', 50)),
      E.kill('subject', 50)
    ]
  }),
  deathsCall: cast('enemy', {
    onTarget: [...give('subject', 'Feared'), E.cure('subject', 'buff')]
  }),
  debilitate: REJECT('traitRemoval'),
  debilitatingBlast: hit('small', 'allEnemies', {
    powerTimes: cnt('debuffs', { who: 'target', max: 3 })
  }),
  decay: cast('allEnemies', { onTarget: give('subject', 'Disarmed') }),
  deepSubmersion: REJECT('statSet'),
  defile: cast('allEnemies', { onTarget: give('subject', 'Poisoned', 'Blighted') }),
  defyLight: cast('allEnemies', { onTarget: [toClass('subject', 'Death')] }),
  demonCore: cast('allAllies', {
    onTarget: [
      E.stage('subject', stats('Attack', 'Intelligence'), STAGE.large),
      E.temp('subject', { elementIds: [CLASS.Chaos] })
    ]
  }),
  demonsJudgment: REJECT('randomStatShared'),
  demonicStrike: hit('moderate', 'enemy', {
    powerBonus: [pb(50, cnt('sameElementOnSide', { who: 'target' }))]
  }),
  demonwrath: hit('massive', 'enemy', { powerBonus: [pb(-30, cnt('turnsTaken'))] }),
  depression: REJECT('statusHistory'),
  desecrate: hit('moderate', 'enemy', {
    powerBonus: [pb(100, cnt('sameRaceOnSide', { who: 'target' }))]
  }),
  desperateBid: cast('self', { after: [E.revive('faintedAlly', 50)] }),
  desperateSacrifice: cast('self', { after: [E.revive('faintedAllies', 100), E.kill('self')] }),
  desperation: cast('self', {
    after: [barrier('self', sv('Defense', 100)), E.stage('self', stats('Defense'), -STAGE.large)]
  }),
  determination: cast('allAllies', {
    onTarget: [
      E.stage('subject', stats('Defense'), STAGE.large),
      E.maxHp('subject', hpv('max', HEAL.large, 'subject'))
    ]
  }),
  devastatingThrow: hit('massive', 'enemy', {
    physical: true,
    attackStat: basedOn('speed', 50),
    onTarget: [ch(E.timeline('subject', 'bottom'), 50)]
  }),
  devastation: REJECT('statusPotency'),
  devour: cast('enemy', {
    onTarget: ALL4.map((name) => E.flat('self', stats(name), sv(name, 30, 'subject'), 'subject'))
  }),
  disintegratingArrow: hit('moderate', 'enemy', { attackStat: basedOn('speed') }),
  diskOfCreation: REJECT('stageReset'),
  dispel: cast('enemy', { onTarget: [E.cure('subject', 'buff'), E.cure('subject', 'debuff')] }),
  dispellingDervish: hit('moderate', 'enemy', { onTarget: [E.cure('subject', 'buff')] }),
  divination: REJECT('spellGem'),
  divineAegis: cast('self', { after: [barrier('self', hpv('max', HEAL.moderate))] }),
  divinity: cast('self', {
    after: [
      E.revive('faintedAllies', 100),
      healPct('side', 100, 'target'),
      healPct('foes', 100, 'target'),
      E.cure('side', 'debuff'),
      E.cure('foes', 'debuff')
    ]
  }),
  doubleStrike: hit('moderate', 'enemy', { hits: 2 }),
  downburst: hit('moderate', 'allEnemies'),
  drainLife: hit('moderate', 'enemy', { onTarget: [E.heal('side', ev(100))] }),
  drainPower: REJECT('charge'),
  dreadblade: hit('large', 'enemy', { onTarget: give('subject', 'Feared') }),
  dream: cast('self', {
    after: CLASSES.map((name) => E.cast({ pool: 'global', elementIds: [CLASS[name]] }))
  }),
  dreamStomp: hit('small', 'enemy', {
    powerBonus: [ifThen('small', 'massive', [has('target', 'Sleeping')])]
  }),
  duel: cast('enemy', {
    onTarget: [
      E.provoke('self'),
      E.provoke('subject'),
      E.atk('subject'),
      E.atk('self', 100, 1, 'subject')
    ]
  }),
  dustCloak: cast('allAllies', {
    onTarget: [...give('subject', 'Invisible'), E.timeline('subject', 'bottom')]
  }),
  dyingWish: cast('ally', { onTarget: [E.timeline('subject', 'top')], after: [E.kill('self')] })
}
