/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi spell Siralim, phần 4 (thứ tự trong skills-planned.json lúc soạn: 430–559, hết).
import {
  ST,
  CLASS,
  stats,
  sv,
  hpv,
  cnt,
  E,
  C,
  REJECT,
  DEFER,
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
const lacks = (who, ...names) => C.lacks(who, names.map(S))
const give = (to, ...names) => names.map((name) => E.status(to, S(name)))
const healPct = (to, percent, of = to) => E.heal(to, hpv('max', percent, of))
const raise = (to, tier, ...names) => E.stage(to, stats(...names), STAGE[tier])
const lower = (to, tier, ...names) => E.stage(to, stats(...names), -STAGE[tier])
const ALL4 = ['Attack', 'Intelligence', 'Defense', 'Speed']
const smallOr = (big, target, conditions) =>
  hit('small', target, { powerBonus: [ifThen('small', big, conditions, target)] })
/** Họ Scourge: mạnh với mục tiêu thuộc class. */
const scourge = (className) => smallOr('massive', 'enemy', [C.el('target', [CLASS[className]])])
const attackAllyIf = (name) =>
  cast('allEnemies', {
    onTarget: [onlyIf(E.atk('otherFoes', 100, 1, 'subject'), has('subject', name))]
  })

export const CONVERSIONS = {
  sapphirePower: DEFER('equipment'),
  savageRoar: cast('allAllies', { onTarget: [raise('subject', 'massive', 'Attack')] }),
  savageSpores: cast('self', {
    after: [
      ...give('side', 'Berserk'),
      ...give('foes', 'Berserk'),
      lower('side', 'large', 'Defense'),
      lower('foes', 'large', 'Defense')
    ]
  }),
  schism: hit('moderate', 'allEnemies', { powerTimes: cnt('revivals') }),
  scourgeChaos: scourge('Chaos'),
  scourgeDeath: scourge('Death'),
  scourgeLife: scourge('Life'),
  scourgeNature: scourge('Nature'),
  scourgeSorcery: scourge('Sorcery'),
  secretStuff: cast('enemy', { onTarget: [E.atk('otherFoes', 200, 1, 'subject')] }),
  seduction: cast('allEnemies', {
    onTarget: ALL4.map((name) => E.flat('self', stats(name), sv(name, 25, 'subject'), 'subject'))
  }),
  seismicCrash: hit('moderate', 'enemy', {
    onTarget: [ch(onlyIf(E.kill('subject'), has('subject', 'Stone')), 25)]
  }),
  selfAnalysis: REJECT('statCopy'),
  serendipity: cast('allAllies', { onTarget: give('subject', 'Savage', 'Agile') }),
  shadowCrash: cast('allEnemies', {
    onTarget: [E.dmg('subject', sv('Intelligence', 10, 'self', cnt('casts', { who: 'subject' })))]
  }),
  shatter: smallOr('massive', 'enemy', [has('target', 'Frozen')]),
  shatteringIce: hit('moderate', 'enemy', {
    onTarget: [...give('subject', 'Frozen'), E.status('otherFoes', S('Bleeding'))]
  }),
  // "Gây sát thương bằng 150% lượng thủ bị giảm": quy thành 30% thủ của mục tiêu.
  shellbust: cast('enemy', {
    onTarget: [
      E.dmg('subject', sv('Defense', 30, 'subject')),
      lower('subject', 'moderate', 'Defense')
    ]
  }),
  shieldBash: hit('small', 'enemy', {
    attackStat: basedOn('defense'),
    onTarget: give('subject', 'Confused')
  }),
  shieldSlam: hit('moderate', 'enemy', {
    attackStat: basedOn('defense'),
    onTarget: [ch(E.timeline('subject', 'bottom'), 35)]
  }),
  shock: hit('moderate', 'allEnemies', { powerBonus: [pb(20, cnt('debuffs', { who: 'target' }))] }),
  // Luôn chí mạng: quy thành +50% sức mạnh (hệ số chí mạng mặc định).
  shootout: hit('massive', 'enemy', { powerBonus: [pb(50)] }),
  skewer: REJECT('statusHistory'),
  slaughter: cast('self', { after: [E.kill('allies')] }),
  smokeBomb: cast('allEnemies', { onTarget: give('subject', 'Blind') }),
  sneakAttack: REJECT('castHistory'),
  snowstorm: hit('large', 'allEnemies', { onTarget: [ch(E.status('subject', S('Frozen')), 50)] }),
  sorceryOrb: cast('self', { after: [E.cast({ pool: 'global', sameElement: true })] }),
  soulFire: hit('moderate', 'allEnemies', {
    powerBonus: [pb(10, cnt('buffs', { who: 'target' }))]
  }),
  soulHarvest: cast('allEnemies', {
    onTarget: [E.flat('self', stats('Intelligence'), sv('Intelligence', 10, 'subject'), 'subject')]
  }),
  soulRage: cast('allAllies', { onTarget: give('subject', 'Leeching', 'Splashing') }),
  soulSacrifice: cast('allAllies', { onTarget: [E.setHp('subject', 70)] }),
  spectralCrash: hit('moderate', 'enemy', {
    powerBonus: [pb(100, undefined, [has('self', 'Savage')])]
  }),
  spectralRain: REJECT('statusPotency'),
  spectralSwords: hit('moderate', 'enemy', { attackStat: basedOn('speed') }),
  spellBlast: REJECT('charge'),
  spellBreath: hit('moderate', 'allEnemies', { attackStat: basedOn('attack', 50) }),
  spellFlow: cast('self', { after: give('self', 'Arcane', 'Warded') }),
  spellLeak: REJECT('spellGem'),
  spellLock: cast('self', { after: [...give('side', 'Silenced'), ...give('foes', 'Silenced')] }),
  spellStrike: hit('moderate', 'enemy', { attackStat: basedOn('attack', 50) }),
  spellWard: cast('allAllies', { onTarget: give('subject', 'Warded') }),
  spicySuds: cast('allAllies', {
    onTarget: [
      onlyIf(E.atk('randomFoe', 100, 1, 'subject'), has('subject', 'Splashing')),
      onlyIf(E.status('subject', S('Splashing')), lacks('subject', 'Splashing'))
    ]
  }),
  spiritBond: cast('ally', { onTarget: [E.trait('subject', { copyFrom: 'self' })] }),
  spiritBreaker: hit('small', 'enemy', {
    powerBonus: [pb(50, cnt('turnsTaken', { who: 'target' }))]
  }),
  spiritOffering: cast('enemy', {
    onTarget: [lower('subject', 'large', 'Intelligence')],
    after: [raise('side', 'small', 'Intelligence')]
  }),
  splitPunch: hit('large', 'enemy', { onTarget: give('subject', 'Bleeding') }),
  splittingArrow: hit('small', 'allEnemies', { attackStat: basedOn('speed') }),
  spreadingPlague: cast('enemy', { onTarget: [E.move('subject', 'otherFoes', 'debuff')] }),
  starBlast: REJECT('charge'),
  starPact: hit('massive', 'allEnemies', { powerBonus: [pb(10, cnt('buffs'))] }),
  starfire: hit('moderate', 'allEnemies', {
    onTarget: [
      ch(E.status('subject', S('Scorned')), 50),
      ch(E.status('subject', S('Silenced')), 50)
    ]
  }),
  stasisSword: hit('large', 'enemy', { onTarget: give('subject', 'Stone') }),
  stellarFlare: hit('small', 'allEnemies', {
    powerBonus: [pb(10, cnt('defends')), pb(10, cnt('provokes'))]
  }),
  stoneWard: cast('self', {
    after: [raise('self', 'small', 'Defense'), E.defend('self'), E.provoke('self')]
  }),
  stonewall: cast('allAllies', {
    onTarget: [onlyIf(raise('subject', 'massive', 'Defense'), C.defending('target'))]
  }),
  stubbornWill: cast('self', {
    after: [E.heal('self', hpv('max', HEAL.small, 'self', cnt('debuffs', { max: 5 })))]
  }),
  stunBeam: cast('enemy', { onTarget: [E.timeline('subject', 'bottom')] }),
  submerge: hit('moderate', 'allEnemies', {
    powerBonus: [pb(25, cnt('turnsTaken', { who: 'target' }))]
  }),
  subterfuge: REJECT('selfAttack'),
  succulentScotch: REJECT('selfAttack'),
  suddenDeath: cast('ally', {
    onTarget: [E.dmg('foes', hpv('current', 25, 'subject')), E.kill('subject')]
  }),
  suffocation: cast('enemy', { onTarget: give('subject', 'Silenced', 'Stone') }),
  // "Đặt về giá trị nhỏ nhất": quy thành −6 bậc.
  sunder: hit('large', 'allEnemies', {
    onTarget: [E.stage('subject', stats('Defense', 'Speed'), -6)]
  }),
  surrenderToMadness: cast('enemy', { onTarget: give('subject', 'Confused', 'Cursed') }),
  terror: cast('enemy', {
    onTarget: [lower('subject', 'large', 'Defense'), ...give('subject', 'Feared')]
  }),
  timeStop: REJECT('turnSkip'),
  timelyDemise: hit('small', 'allEnemies', { powerBonus: [pb(10, cnt('turnsTaken'))] }),
  // Chạy hiệu ứng đầu lượt + tăng lượt: quy thành đưa đồng đội lên đầu Timeline.
  timewalk: cast('ally', { onTarget: [E.timeline('subject', 'top')] }),
  tornado: hit('large', 'enemy', { powerBonus: [pb(35, cnt('deathsTotal'))] }),
  toxicFrogmania: smallOr('massive', 'enemy', [has('target', 'Poisoned')]),
  toxicShield: cast('self', {
    after: [
      E.flat('self', stats('Defense'), sv('Defense', 20, 'self', cnt('debuffs'))),
      E.cure('self', 'debuff')
    ]
  }),
  transcendence: cast('self', { after: [E.trait('self')] }),
  trueLight: cast('self', {
    after: [raise('side', 'large', 'Defense'), lower('foes', 'large', 'Defense')]
  }),
  trueMagic: hit('moderate', 'allEnemies'),
  truesight: cast('allEnemies', { onTarget: [E.remove('subject', 'buff', S('Invisible'))] }),
  ultimateOdor: hit('small', 'allEnemies', { powerTimes: cnt('debuffs') }),
  unansweredPrayers: REJECT('joke'),
  unboundCombustion: hit('small', 'enemy', { attackStat: basedOn('currentHp') }),
  unholyAugmentation: cast('allAllies', { onTarget: give('subject', 'Repelling') }),
  unholyRage: REJECT('statSet'),
  universalRecall: REJECT('turnCounter'),
  unrighteousFire: cast('self', {
    after: [E.dmg('foes', hpv('current', 30)), E.setHp('self', 1)]
  }),
  unstableAnomaly: hit('small', 'allEnemies', { powerTimes: cnt('casts') }),
  unstableEquilibrium: REJECT('hpAverage'),
  usery: cast('self', {
    after: [
      E.flat('self', stats('Attack'), sv('Attack', 10, 'self', cnt('turnsTaken', { max: 5 })))
    ]
  }),
  utopia: cast('self', { after: [healPct('side', 100, 'target'), healPct('foes', 100, 'target')] }),
  vacuum: cast('enemy', { onTarget: [E.trait('self', { copyFrom: 'subject' })] }),
  vampirism: cast('allAllies', { onTarget: give('subject', 'Leeching') }),
  // Dùng 3 spell của mục tiêu: không có nguồn skill của địch, quy thành 3 spell ngẫu nhiên.
  verdantSpheres: cast('enemy', { after: [E.cast({ pool: 'global', times: 3 })] }),
  vertigo: cast('enemy', { onTarget: give('subject', 'Confused') }),
  vilify: REJECT('guardRemoval'),
  // Sát thương bằng phần max HP vượt gốc: không lưu max HP gốc trong trận, quy thành 20% max HP.
  vitalityExplosion: cast('enemy', { onTarget: [E.dmg('subject', hpv('max', 20, 'subject'))] }),
  vivaciousVodka: cast('ally', { onTarget: [E.timeline('subject', 'top')] }),
  voidFlare: cast('enemy', {
    onTarget: [onlyIf(E.kill('subject'), C.atLeast(cnt('revivals', { who: 'subject' }), 1))]
  }),
  volatileStrike: hit('moderate', 'enemy', { attackStat: basedOn('highest') }),
  warning: cast('allAllies', {
    onTarget: [onlyIf(raise('subject', 'massive', 'Defense'), C.provoking('target'))]
  }),
  warpReality: REJECT('barrierPotency'),
  waterEnchantment: cast('self', {
    after: [...give('self', 'Splashing'), raise('self', 'large', 'Attack')]
  }),
  web: cast('enemy', { onTarget: give('subject', 'Snared') }),
  whiplash: hit('small', 'enemy', {
    attackStat: basedOn('speed'),
    onTarget: give('subject', 'Bleeding')
  }),
  siralimWhirlwind: hit('moderate', 'allEnemies', { ignoreDefense: 30 }),
  wildGrowth: cast('self', {
    after: [...give('self', 'Mending'), E.maxHp('self', hpv('max', HEAL.large))]
  }),
  windEnchantment: cast('self', {
    after: [...give('self', 'Agile'), raise('self', 'large', 'Speed')]
  }),
  windShear: hit('small', 'allEnemies', {
    powerBonus: [pb(35, cnt('elementOnSide', { elementIds: [CLASS.Nature] }))]
  }),
  wordOfChaos: REJECT('killChance'),
  wordsOfEncouragement: cast('self', { after: [healPct('self', HEAL.small * 3)] }),
  wormhole: REJECT('timelineSwap'),
  wormrot: cast('allEnemies', { onTarget: give('subject', 'Weak', 'Vulnerable') }),
  wrathOfNature: cast('allAllies', { onTarget: [raise('subject', 'moderate', 'Attack')] }),
  zephyr: cast('allAllies', {
    onTarget: [
      healPct('subject', HEAL.moderate),
      E.heal(
        'subject',
        hpv('max', 9, 'subject', cnt('elementOnSide', { elementIds: [CLASS.Life] }))
      )
    ]
  }),
  balanceInAllThings: hit('devastating', 'allEnemies', {
    after: [E.revive('faintedAllies', 100), healPct('side', 100, 'target')]
  }),
  blitzHowl: REJECT('autoCast'),
  faeFire: cast('allEnemies', {
    onTarget: [E.stage('subject', 'all', -STAGE.devastating), E.cure('subject', 'buff')]
  }),
  grandeur: cast('allAllies', { onTarget: [E.stage('subject', 'all', STAGE.massive)] }),
  // Không có Charge nên hạ ngay chỉ khi mục tiêu dưới 50% máu (như Death Siphon).
  heatBeam: hit('devastating', 'enemy', { onTarget: [E.kill('subject', 50)] }),
  infiniteBlades: hit('moderate', 'allEnemies', { hits: 5 }),
  savingGrace: REJECT('autoCast'),
  tectonicUpheaval: hit('massive', 'allEnemies', {
    onTarget: [lower('subject', 'massive', 'Defense', 'Speed'), ...give('subject', 'Snared')]
  }),
  totalCarnage: cast('allEnemies', {
    onTarget: [...give('subject', 'Bleeding'), E.atk('subject')]
  }),
  virus: cast('allEnemies', { onTarget: [E.burst('subject', [S('Poisoned')], 2)] }),
  whitchcraft: REJECT('forcedCast'),
  evilEye: smallOr('massive', 'enemy', [has('target', 'Cursed')]),
  gunpowder: REJECT('statusPotency'),
  curseOfDoom: cast('allEnemies', {
    onTarget: [
      onlyIf(raise('subject', 'large', 'Attack', 'Intelligence'), has('subject', 'Cursed')),
      onlyIf(lower('subject', 'large', 'Defense', 'Speed'), has('subject', 'Cursed'))
    ]
  }),
  shortFuse: cast('allEnemies', { onTarget: [E.burst('subject', [S('Bomb')], 1)] }),
  herdImmunity: REJECT('statusPotency'),
  dissonance: REJECT('statusPotency'),
  vaccination: REJECT('statusPotency'),
  discombobulate: attackAllyIf('Confused')
}
