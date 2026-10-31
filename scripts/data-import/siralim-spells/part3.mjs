/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi spell Siralim, phần 3 (thứ tự trong skills-planned.json lúc soạn: 290–429).
import {
  ST,
  CLASS,
  stats,
  sv,
  hpv,
  ev,
  cnt,
  rec,
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
const give = (to, ...names) => names.map((name) => E.status(to, S(name)))
const healPct = (to, percent, of = to) => E.heal(to, hpv('max', percent, of))
const barrier = (to, amount) => E.status(to, S('Barrier'), { amount })
const toClass = (to, className) => E.identity(to, { elementIds: [CLASS[className]] })
const raise = (to, tier, ...names) => E.stage(to, stats(...names), STAGE[tier])
const lower = (to, tier, ...names) => E.stage(to, stats(...names), -STAGE[tier])
const arrow = (tier, opts = {}) => hit(tier, 'enemy', { attackStat: basedOn('speed'), ...opts })
const smallOr = (big, target, conditions) =>
  hit('small', target, { powerBonus: [ifThen('small', big, conditions, target)] })
const lance = (className) =>
  hit('small', 'enemy', {
    physical: true,
    powerBonus: [ifThen('small', 'massive', [C.el('target', [CLASS[className]])])]
  })
const shield = (className, buff) =>
  cast('self', {
    after: [toClass('self', className), ...give('self', buff), raise('self', 'moderate', 'Defense')]
  })
/** Họ Morph: cả phe tăng mạnh một chỉ số và đổi class tới hết trận. */
const morph = (className, gain) =>
  cast('allAllies', { onTarget: [gain, toClass('subject', className)] })
/** Họ Rune: đòn theo chỉ số cao nhất của quái dùng, kèm hiệu ứng riêng. */
const rune = (opts = {}) => hit('large', 'enemy', { attackStat: basedOn('highest'), ...opts })
/** Địch có trạng thái X đánh đồng đội của nó. */
const attackAllyIf = (name) =>
  cast('allEnemies', {
    onTarget: [onlyIf(E.atk('otherFoes', 100, 1, 'subject'), has('subject', name))]
  })
const BURNING_FOES = cnt('foesWithStatus', { statusIds: [S('Burning')] })

export const CONVERSIONS = {
  livingHeavyShield: cast('self', {
    after: [raise('self', 'massive', 'Defense'), ...give('self', 'Shelled')]
  }),
  livingHelmet: cast('self', {
    after: [E.maxHp('self', hpv('max', HEAL.massive)), ...give('self', 'Protected')]
  }),
  livingLifeLance: lance('Life'),
  livingLifeShield: shield('Life', 'Protected'),
  livingNatureLance: lance('Nature'),
  livingNatureShield: shield('Nature', 'Invisible'),
  livingNecklace: cast('allAllies', { onTarget: [E.remove('subject', 'debuff', S('Silenced'))] }),
  livingRibbon: cast('allAllies', { onTarget: give('subject', 'Immune') }),
  livingRing: hit('devastating', 'enemy', { attackStat: basedOn('lowest') }),
  livingSorceryLance: lance('Sorcery'),
  livingSorceryShield: shield('Sorcery', 'Warded'),
  livingStaff: hit('moderate', 'allEnemies'),
  livingSword: hit('large', 'enemy', { onTarget: [E.dmg('subject', sv('Attack', 50))] }),
  livingWizardHat: REJECT('charge'),
  loveless: REJECT('statHistory'),
  lusciousLager: cast('allEnemies', { onTarget: give('subject', 'Sleeping', 'Blind') }),
  luckOfTheDraw: cast('self', {
    after: [
      E.random('side', 'buff'),
      E.random('side', 'debuff'),
      E.random('foes', 'buff'),
      E.random('foes', 'debuff')
    ]
  }),
  lucksGambit: REJECT('spellGem'),
  lycanthropy: REJECT('autoCast'),
  madness: hit('devastating', 'enemy', { after: [E.dmg('self', ev(100))] }),
  maelstrom: cast('enemy', { onTarget: give('subject', 'Confused', 'Feared') }),
  magicJellyBeans: hit('moderate', 'enemy', { onTarget: [E.random('subject', 'debuff')] }),
  magicSuppression: cast('allEnemies', {
    onTarget: [lower('subject', 'moderate', 'Intelligence'), ...give('subject', 'Silenced')]
  }),
  magmaOrb: hit('moderate', 'enemy', {
    onTarget: [E.dmg('randomFoe', ev(100, cnt('debuffs', { who: 'subject' })))]
  }),
  majorResurrection: cast('self', { after: [E.revive('faintedAlly', HEAL.large)] }),
  mangle: hit('small', 'enemy', { onTarget: [E.burst('subject', [S('Bleeding')], 3)] }),
  massDispel: cast('self', {
    after: [
      E.cure('side', 'buff'),
      E.cure('side', 'debuff'),
      E.cure('foes', 'buff'),
      E.cure('foes', 'debuff')
    ]
  }),
  massMutilation: REJECT('selfAttack'),
  massTaunt: cast('allAllies', { onTarget: [E.provoke('subject')] }),
  mastersHand: hit('small', 'enemy', { powerBonus: [pb(20, cnt('attacks'))] }),
  meatGrinder: REJECT('statHistory'),
  mementoOfAttack: REJECT('charge'),
  mementoOfDefense: REJECT('charge'),
  mementoOfIntelligence: REJECT('charge'),
  mementoOfSpeed: REJECT('charge'),
  mentalBarrier: cast('allAllies', {
    onTarget: [barrier('subject', hpv('max', HEAL.massive, 'subject'))]
  }),
  merryMalt: cast('self', { after: [E.trait('self')] }),
  // Máu về ngẫu nhiên 1–100%: lấy kỳ vọng 50% (không có hiệu ứng đặt máu ngẫu nhiên).
  metamorphosis: cast('enemy', { onTarget: [E.setHp('subject', 50)] }),
  meteorShower: hit('moderate', 'allEnemies', { hits: 3 }),
  mightOfTheJotun: cast('self', {
    after: [raise('self', 'massive', 'Attack'), E.atk('randomFoe')]
  }),
  mindControl: cast('enemy', { onTarget: [E.atk('otherFoes', 100, 1, 'subject')] }),
  mindCrunch: REJECT('statDifference'),
  mindExplosion: REJECT('targetStat'),
  mindFlay: REJECT('timelinePosition'),
  mindGames: cast('self', { after: [healPct('side', HEAL.large, 'target')] }),
  mindStorm: hit('small', 'allEnemies', { onTarget: [ch(E.status('subject', S('Stone')), 50)] }),
  mindTricks: REJECT('selfAttack'),
  minorResurrection: cast('self', { after: [E.revive('faintedAlly', HEAL.small)] }),
  misery: cast('enemy', {
    onTarget: give('subject', 'Weak', 'Vulnerable', 'Feared', 'Cursed', 'Scorned')
  }),
  moltenArmor: cast('self', {
    after: [...give('self', 'Shelled'), raise('self', 'moderate', 'Attack')]
  }),
  moltenWall: cast('allAllies', { onTarget: [raise('subject', 'moderate', 'Attack', 'Defense')] }),
  morphChaos: morph('Chaos', raise('subject', 'large', 'Attack')),
  morphDeath: morph('Death', raise('subject', 'large', 'Defense')),
  morphLife: morph('Life', E.maxHp('subject', hpv('max', HEAL.large, 'subject'))),
  morphNature: morph('Nature', raise('subject', 'large', 'Speed')),
  morphSorcery: morph('Sorcery', raise('subject', 'large', 'Intelligence')),
  mouthbreathe: cast('self', {
    after: [
      E.dmg('foes', sv('Intelligence', 60)),
      E.lose('self', stats('Intelligence'), sv('Intelligence', 30))
    ]
  }),
  // "Thêm 2 lần mỗi quái đã chết" quy thành +66% sức mạnh mỗi lần chết (3 đòn gốc).
  murderOfCrows: hit('moderate', 'enemy', { hits: 3, powerBonus: [pb(66, cnt('deathsTotal'))] }),
  muster: cast('self', {
    after: [...give('self', 'Leeching', 'Mending'), raise('self', 'large', 'Attack')]
  }),
  mutagen: cast('self', {
    after: [
      E.revive('faintedAlly', HEAL.large),
      raise('allies', 'large', ...['Attack', 'Intelligence', 'Defense', 'Speed'])
    ]
  }),
  mutilate: cast('enemy', { onTarget: [E.dmg('subject', hpv('current', 50))] }),
  natureOrb: cast('allAllies', {
    onTarget: [E.random('subject', 'buff'), E.stage('subject', 'all', STAGE.moderate)]
  }),
  naturesBlessing: REJECT('statusDuration'),
  necrosis: hit('moderate', 'allEnemies', { attackStat: basedOn('speed', 50) }),
  nightSword: hit('moderate', 'enemy', { onTarget: [E.seal('subject')] }),
  nineMeteors: hit('small', 'enemy', { hits: 9 }),
  nourish: cast('allAllies', { onTarget: give('subject', 'Mending') }),
  nutrition: cast('self', {
    after: [
      onlyIf(healPct('self', HEAL.large), C.count('target', 'debuff', 1)),
      E.cure('self', 'debuff', 1)
    ]
  }),
  overcharge: hit('devastating', 'enemy'),
  pandemonium: REJECT('timelineShuffle'),
  panicAttack: cast('allAllies', { onTarget: [E.atk('randomFoe', 50, 1, 'subject')] }),
  parasiteEve: cast('allEnemies', {
    onTarget: [E.dmg('subject', rec('healingReceived', 10, 'subject'))]
  }),
  parasites: cast('allEnemies', { onTarget: give('subject', 'Blighted', 'Leeching') }),
  peace: REJECT('statSet'),
  permafrost: cast('allEnemies', {
    onTarget: [onlyIf(E.status('subject', S('Snared')), has('subject', 'Frozen'))]
  }),
  pestilence: cast('allEnemies', { onTarget: [E.move('subject', 'otherFoes', 'debuff', true)] }),
  petrify: cast('enemy', { onTarget: give('subject', 'Stone') }),
  phantasm: REJECT('statHistory'),
  phoenixBurst: smallOr('massive', 'allEnemies', [C.atLeast(cnt('faintedFoes'), 1)]),
  phoenixDown: cast('self', {
    after: [E.revive('faintedAllies', HEAL.moderate), E.random('side', 'buff')]
  }),
  plague: cast('self', {
    after: [
      E.heal(
        'self',
        hpv('max', HEAL.small, 'self', cnt('foesWithStatus', { statusIds: [S('Blighted')] }))
      )
    ]
  }),
  poisonArrow: arrow('moderate', { onTarget: give('subject', 'Poisoned') }),
  polish: REJECT('charge'),
  pop: REJECT('castHistory'),
  potentPorter: cast('self', { after: [E.cast({ pool: 'ownSpell', times: 2 })] }),
  poweredBlast: smallOr('massive', 'enemy', [C.sameEl('target')]),
  praiseTheSun: cast('self', {
    after: [healPct('side', HEAL.large, 'target'), healPct('foes', HEAL.large, 'target')]
  }),
  prismaticChanneling: hit('large', 'allEnemies', {
    powerBonus: [pb(20, cnt('distinctElementsOnSide'))]
  }),
  productiveBelch: hit('small', 'enemy', { onTarget: give('subject', 'Disarmed') }),
  profanity: cast('self', { after: [E.provoke('self')] }),
  prometheanBlaze: hit('moderate', 'allEnemies', {
    onTarget: give('subject', 'Burning'),
    after: [E.flat('self', stats('Intelligence'), ev(10))]
  }),
  prosperity: cast('self', { after: [healPct('self', 50)] }),
  siralimProtect: cast('self', {
    after: [...give('self', 'Protected', 'Warded'), E.defend('self')]
  }),
  psionicBlast: hit('moderate', 'enemy', { onTarget: give('subject', 'Weak') }),
  psychicRapture: hit('small', 'allEnemies'),
  pumpkinKingsWrath: hit('moderate', 'allEnemies', { hits: 2 }),
  pureLove: cast('self', {
    after: [
      E.maxHp('side', hpv('max', HEAL.massive, 'target')),
      E.maxHp('foes', hpv('max', HEAL.massive, 'target'))
    ]
  }),
  purgatory: cast('enemy', { onTarget: [E.timeline('subject', 'bottom')] }),
  pusplosion: hit('moderate', 'allEnemies', {
    powerBonus: [pb(10, cnt('debuffs', { who: 'target' }))]
  }),
  pustule: hit('small', 'enemy', { onTarget: [E.dmg('otherFoes', ev(200))] }),
  pyroburst: smallOr('massive', 'enemy', [has('target', 'Bomb')]),
  rabidDementia: cast('self', { after: [E.atk('randomFoe', 200)] }),
  radiantSunfire: cast('self', {
    after: [
      E.random('side', 'buff', 1, { countPer: BURNING_FOES }),
      E.random('foes', 'debuff', 1, { countPer: BURNING_FOES })
    ]
  }),
  rainOfArrows: hit('small', 'allEnemies', {
    after: [E.cast({ pool: 'global', tags: ['arrow'], times: 5 })]
  }),
  rainOfBlood: cast('allEnemies', { onTarget: give('subject', 'Bleeding') }),
  rapture: hit('massive', 'allEnemies', { onTarget: give('subject', 'Weak', 'Vulnerable') }),
  raze: cast('allEnemies', { onTarget: [E.burst('subject', [S('Burning')], 2)] }),
  recharge: REJECT('charge'),
  redirection: cast('self', { after: [raise('self', 'moderate', 'Defense'), E.provoke('self')] }),
  redoubt: REJECT('charge'),
  siralimRefresh: cast('self', { after: [E.cure('self', 'debuff')] }),
  reincarnation: cast('self', { after: [E.kill('self'), E.revive('self', HEAL.massive)] }),
  relight: cast('self', { after: [...give('allies', 'Rebirth'), E.kill('self')] }),
  rend: hit('moderate', 'enemy', { onTarget: give('subject', 'Bleeding') }),
  replicate: cast('self', { after: [E.cast({ pool: 'ownSpell', times: 2 })] }),
  requiem: cast('self', { after: [E.revive('faintedAllies', HEAL.moderate)] }),
  resonance: smallOr('large', 'allEnemies', [has('target', 'Silenced')]),
  resplendence: hit('small', 'allEnemies', {
    after: [
      healPct('side', HEAL.small, 'target'),
      E.maxHp('side', hpv('max', HEAL.small, 'target'))
    ]
  }),
  restoreBalance: REJECT('hpAverage'),
  resurrection: cast('self', { after: [E.revive('faintedAlly', HEAL.moderate)] }),
  revelation: REJECT('triggerActivation'),
  reverberate: attackAllyIf('Confused'),
  reversePolarity: cast('self', {
    after: [E.random('self', 'buff', 1, { countPer: cnt('debuffs') }), E.cure('self', 'debuff')]
  }),
  riotousRum: hit('moderate', 'allEnemies', { onTarget: give('subject', 'Feared') }),
  riverAgainstTheCurrent: cast('allEnemies', { onTarget: [E.cure('subject', 'buff')] }),
  // "Tới khi 25% tỉ lệ dừng": lấy kỳ vọng 4 lần.
  rollingMeteor: cast('self', { after: [{ ...E.dmg('randomFoe', hpv('current', 20)), times: 4 }] }),
  rubyPower: DEFER('equipment'),
  ruin: cast('enemy', { onTarget: [E.stage('subject', 'highest', -STAGE.devastating)] }),
  runeOfCor: rune({ onTarget: [E.stage('subject', 'random', -STAGE.moderate)] }),
  runeOfDun: rune(),
  runeOfLua: rune({ onTarget: [E.heal('self', ev(50))] }),
  runeOfNax: rune({ after: [E.stage('self', 'random', STAGE.moderate)] }),
  runeOfSah: rune({ onTarget: [E.cure('subject', 'buff')], after: [E.cure('self', 'debuff')] }),
  rupture: REJECT('statDifference'),
  ruse: REJECT('nextAction'),
  sabotage: cast('enemy', { onTarget: [E.atk('self', 5, 3, 'subject')] }),
  sacredGround: cast('self', { after: [...give('side', 'Scorned'), ...give('foes', 'Scorned')] }),
  sacrificeToTheLight: REJECT('autoCast'),
  saintsTouch: cast('enemy', { onTarget: [E.stage('subject', 'highest', -STAGE.large)] }),
  sanctuary: cast('allAllies', { onTarget: give('subject', 'Shelled', 'Mending', 'Repelling') })
}
