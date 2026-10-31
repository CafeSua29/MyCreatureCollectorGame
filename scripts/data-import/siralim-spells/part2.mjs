/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi spell Siralim, phần 2 (thứ tự trong skills-planned.json lúc soạn: 140–289).
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
const lacks = (who, ...names) => C.lacks(who, names.map(S))
const give = (to, ...names) => names.map((name) => E.status(to, S(name)))
const healPct = (to, percent, of = to) => E.heal(to, hpv('max', percent, of))
const barrier = (to, amount) => E.status(to, S('Barrier'), { amount })
const toClass = (to, className) => E.identity(to, { elementIds: [CLASS[className]] })
const raise = (to, tier, ...names) => E.stage(to, stats(...names), STAGE[tier])
const lower = (to, tier, ...names) => E.stage(to, stats(...names), -STAGE[tier])
/** Spell Arrow: sát thương theo Speed. */
const arrow = (tier, opts = {}) => hit(tier, 'enemy', { attackStat: basedOn('speed'), ...opts })
/** "small, hoặc massive nếu mục tiêu có trạng thái X". */
const smallOrMassive = (target, ...names) =>
  hit('small', target, {
    powerBonus: [ifThen('small', 'massive', [has('target', ...names)], target)]
  })
/** Lance của Arsenal: đòn theo Attack, mạnh lên với mục tiêu thuộc class. */
const lance = (className) =>
  hit('small', 'enemy', {
    physical: true,
    powerBonus: [ifThen('small', 'massive', [C.el('target', [CLASS[className]])])]
  })
/** Shield của Arsenal: đổi class, nhận buff, tăng thủ. */
const shield = (className, buff) =>
  cast('self', {
    after: [toClass('self', className), ...give('self', buff), raise('self', 'moderate', 'Defense')]
  })
const dead = C.hpBelow('subject', 0.001)

export const CONVERSIONS = {
  eagleClaws: cast('self', { after: [E.atk('foes', 100, 2), raise('side', 'large', 'Speed')] }),
  earthEnchantment: cast('self', {
    after: [...give('self', 'Taunting'), raise('self', 'large', 'Defense')]
  }),
  earthenEmbrace: cast('self', {
    after: [healPct('self', HEAL.moderate), barrier('self', hpv('max', HEAL.moderate))]
  }),
  earthenSpike: hit('small', 'enemy', {
    powerBonus: [ifThen('small', 'massive', [C.defending('target')])]
  }),
  elderDragonsCall: hit('large', 'enemy', { onTarget: [E.dmg('otherFoes', ev(30))] }),
  elementalBarrage: cast('self', { after: [E.cast({ pool: 'global', times: 3 })] }),
  elementalBarrier: cast('self', { after: [barrier('self', sv('Defense', 50))] }),
  elementalGuard: cast('allAllies', {
    onTarget: [barrier('subject', sv('Defense', 20, 'subject'))]
  }),
  elementalTome: cast('allAllies', { onTarget: [E.temp('subject', { sameElement: true })] }),
  emeraldPower: DEFER('equipment'),
  empower: cast('self', { after: give('self', 'Savage') }),
  energize: REJECT('charge'),
  engorge: cast('self', {
    after: [E.maxHp('self', hpv('max', HEAL.massive)), lower('self', 'massive', 'Defense', 'Speed')]
  }),
  enlightenment: REJECT('statSet'),
  entangle: cast('allEnemies', { onTarget: [ch(E.status('subject', S('Snared')), 50)] }),
  entanglingArrow: arrow('moderate', { onTarget: give('subject', 'Snared') }),
  entanglingRoots: cast('allEnemies', { onTarget: give('subject', 'Snared') }),
  epidemic: cast('enemy', { onTarget: [E.move('subject', 'otherFoes', 'debuff', true)] }),
  epiphany: cast('self', { after: [E.identity('allies', { raceFrom: 'self' })] }),
  equality: REJECT('statAverage'),
  erratium: cast('allAllies', { onTarget: [E.trait('subject'), ...give('subject', 'Disarmed')] }),
  etherealKnives: hit('moderate', 'allEnemies', { attackStat: basedOn('speed') }),
  evangelism: cast('self', { after: give('self', 'Mending', 'Agile', 'Warded') }),
  eviscerate: hit('moderate', 'enemy', {
    powerBonus: [pb(1, cnt('missingHpPercent', { who: 'target' }))]
  }),
  evolution: REJECT('transform'),
  exhaustion: REJECT('fatigue'),
  expel: REJECT('charge'),
  explosiveArrow: arrow('moderate', {
    powerBonus: [ifThen('moderate', 'devastating', [has('target', 'Bomb')])]
  }),
  extinguish: cast('enemy', { onTarget: [E.kill('subject', 33)] }),
  failedExperiment: smallOrMassive('allEnemies', 'Vulnerable'),
  fallingFeathers: hit('moderate', 'enemy', { hits: 4 }),
  falseBeliefs: cast('allEnemies', {
    onTarget: [E.dmg('subject', rec('healingReceived', 100, 'subject'))]
  }),
  feelingLucky: cast('self', { after: [E.cast({ pool: 'ownSpell' })] }),
  feignDeath: REJECT('triggerActivation'),
  fermentedHops: cast('allEnemies', {
    onTarget: [
      onlyIf(healPct('subject', 35), has('subject', 'Blighted')),
      onlyIf(E.status('subject', S('Blighted')), lacks('subject', 'Blighted'))
    ]
  }),
  fieryGleam: cast('enemy', { onTarget: give('subject', 'Burning', 'Blind') }),
  fieryStew: cast('self', {
    after: [
      healPct('self', HEAL.small),
      raise('self', 'small', 'Defense'),
      E.status('randomFoe', S('Burning'))
    ]
  }),
  finalForm: cast('self', { after: give('self', 'Rebirth', 'Protected', 'Berserk') }),
  fireArrow: arrow('moderate', { onTarget: give('subject', 'Burning') }),
  firewall: hit('moderate', 'allEnemies', { after: [raise('side', 'moderate', 'Defense')] }),
  fireworks: hit('small', 'allEnemies', { onTarget: [ch(E.status('subject', S('Bomb')), 50)] }),
  fistOfTorun: hit('devastating', 'enemy', { onTarget: [E.dmg('side', ev(20))] }),
  flameEnchantment: cast('self', { after: give('self', 'Proficient') }),
  flameLash: cast('allAllies', { onTarget: give('subject', 'Berserk', 'Splashing') }),
  flameheart: cast('allAllies', {
    onTarget: [barrier('subject', rec('damageTaken', 100, 'subject'))]
  }),
  flamestrike: hit('small', 'allEnemies', {
    powerTimes: cnt('foesWithStatus', { statusIds: [S('Burning')] })
  }),
  flashFreeze: cast('allEnemies', { onTarget: [ch(E.status('subject', S('Frozen')), 50)] }),
  fleshOffering: cast('enemy', {
    onTarget: [E.maxHp('subject', hpv('max', HEAL.large, 'subject'), true)],
    after: [E.maxHp('side', hpv('max', 10, 'other'))]
  }),
  floodOfDarkness: cast('allEnemies', {
    onTarget: [onlyIf(E.atk('otherFoes', 100, 1, 'subject'), has('subject', 'Cursed'))]
  }),
  flourish: cast('self', { after: [E.revive('faintedAllies', HEAL.small)] }),
  forbiddenUnity: REJECT('spellGem'),
  fortify: cast('allAllies', {
    onTarget: [onlyIf(E.status('subject', S('Shelled')), lacks('subject', 'Barrier'))]
  }),
  frackingStrike: REJECT('charge'),
  fractalExplosion: cast('self', { after: [E.status('foes', S('Bomb'))] }),
  fracture: REJECT('barrierPotency'),
  fragilePerfection: cast('self', {
    after: [E.random('self', 'buff', 3), E.random('self', 'debuff', 3)]
  }),
  fragmentingArrow: arrow('moderate', {
    ignoreDefense: 30,
    onTarget: [onlyIf(E.dmg('otherFoes', ev(100)), C.dmgAbove(100, 'subject'))]
  }),
  freezingSting: hit('moderate', 'enemy', {
    onTarget: [lower('subject', 'moderate', 'Speed'), ...give('subject', 'Frozen')]
  }),
  friendlyFire: REJECT('forcedCast'),
  frostArmor: cast('self', {
    after: [...give('self', 'Shelled'), raise('self', 'moderate', 'Defense')]
  }),
  frostArrow: arrow('moderate', { onTarget: give('subject', 'Frozen') }),
  frostEnchantment: cast('self', {
    after: [...give('self', 'Protected'), raise('self', 'large', 'Intelligence')]
  }),
  frostHammer: hit('devastating', 'enemy', {
    onTarget: [...give('subject', 'Frozen'), E.timeline('subject', 'bottom')]
  }),
  frostRampart: cast('allAllies', { onTarget: give('subject', 'Protected') }),
  siralimFrustration: hit('moderate', 'enemy', { powerBonus: [pb(15, cnt('debuffs'))] }),
  fulmination: REJECT('fatigue'),
  galaxy: hit('small', 'allEnemies', {
    powerBonus: [pb(10, cnt('buffs'))],
    after: [E.cure('side', 'buff')]
  }),
  gemBomb: REJECT('spellGem'),
  germinate: cast('enemy', { onTarget: give('subject', 'Snared', 'Poisoned') }),
  ghostlyScimitar: hit('devastating', 'enemy', { ignoreDefense: 80 }),
  ghoulsGrip: hit('large', 'enemy', { onTarget: give('subject', 'Snared') }),
  giftOfTheWild: cast('allAllies', {
    onTarget: [healPct('subject', HEAL.small), ...give('subject', 'Repelling')]
  }),
  glacier: hit('large', 'enemy', { onTarget: give('subject', 'Frozen') }),
  glory: cast('self', { after: [E.cast({ pool: 'ownSpell' })] }),
  godlyGin: cast('allAllies', { onTarget: give('subject', 'Immune') }),
  goldenStout: DEFER('equipment'),
  goodFortune: cast('allAllies', { onTarget: [E.random('subject', 'buff', 10)] }),
  goreClaws: hit('moderate', 'enemy', {
    powerBonus: [pb(5, cnt('missingHpPercent', { who: 'target' }))]
  }),
  graftBone: REJECT('allyDamage'),
  siralimGravity: REJECT('timelinePosition'),
  greaterDispel: cast('self', { after: [E.cure('side', 'debuff'), E.cure('foes', 'buff')] }),
  guardianForce: cast('allAllies', { onTarget: [E.defend('subject')] }),
  haHoHa: hit('massive', 'enemy', {
    powerBonus: [pb(-100, undefined, [lacks('target', 'Feared')])],
    onTarget: [onlyIf(E.status('subject', S('Feared')), lacks('subject', 'Feared'))]
  }),
  halfwayThrough: cast('enemy', { onTarget: [E.setHp('subject', 50)] }),
  harbingersCurse: hit('moderate', 'enemy', { onTarget: give('subject', 'Weak', 'Vulnerable') }),
  haunt: hit('small', 'enemy', {
    onTarget: [
      onlyIf(E.timeline('subject', 'bottom'), has('subject', 'Feared')),
      onlyIf(E.status('subject', S('Feared')), lacks('subject', 'Feared'))
    ]
  }),
  heavensFury: cast('enemy', {
    onTarget: [E.maxHp('subject', hpv('max', HEAL.large, 'subject'), true)]
  }),
  heavensThunder: hit('moderate', 'enemy', { onTarget: give('subject', 'Silenced') }),
  hellForge: cast('self', { after: give('self', 'Taunting', 'Splashing') }),
  hellcryPunch: hit('large', 'enemy', { onTarget: give('subject', 'Cursed') }),
  herosBlessing: REJECT('autoCast'),
  holyArmor: cast('self', { after: [barrier('self', hpv('max', HEAL.massive))] }),
  holyBlast: cast('self', { after: [E.setHp('self', 25), barrier('self', hpv('max', 200))] }),
  holyBulwark: cast('allAllies', {
    onTarget: [barrier('subject', hpv('max', HEAL.moderate, 'subject'))]
  }),
  holyEnchantment: cast('self', {
    after: [healPct('self', HEAL.large), barrier('self', hpv('max', HEAL.large))]
  }),
  holyFire: REJECT('barrierPotency'),
  holyNova: hit('moderate', 'allEnemies', { after: [healPct('side', HEAL.moderate, 'target')] }),
  holyProtection: cast('allAllies', { onTarget: give('subject', 'Shelled') }),
  holyShock: hit('moderate', 'enemy', {
    powerTimes: cnt('sameElementOnSide', { who: 'target' })
  }),
  holyShrine: cast('allAllies', { onTarget: [E.random('subject', 'buff')] }),
  holySpear: REJECT('barrierPotency'),
  holyStrike: hit('devastating', 'enemy', { onTarget: [barrier('side', ev(100))] }),
  homingArrow: arrow('moderate', { ignoreDefense: 50 }),
  hooHayHell: hit('large', 'enemy', { hits: 3 }),
  humility: REJECT('statSet'),
  hungeringVoid: REJECT('castHistory'),
  hypertrophy: REJECT('statSet'),
  iceBolt: hit('small', 'enemy', { onTarget: give('subject', 'Frozen') }),
  icewolfBite: hit('moderate', 'enemy', { hits: 2, onTarget: give('subject', 'Frozen') }),
  ignusFatuus: REJECT('spellGem'),
  illFate: cast('allEnemies', {
    onTarget: [onlyIf(healPct('subject', HEAL.moderate), has('subject', 'Blighted'))]
  }),
  immolationAura: cast('allAllies', { onTarget: give('subject', 'Savage', 'Splashing') }),
  impale: hit('large', 'enemy', { onTarget: [E.dmg('otherFoes', ev(75))] }),
  impendingDoom: REJECT('killChance'),
  implosion: hit('small', 'enemy', { powerBonus: [pb(50, cnt('buffs', { who: 'target' }))] }),
  improvisedRecitation: REJECT('spellGem'),
  infernalCharge: cast('self', { after: [E.atk('randomFoe', 200)] }),
  infernalPillars: smallOrMassive('allEnemies', 'Burning'),
  innerDestruction: REJECT('autoCast'),
  innerStrength: cast('allAllies', { onTarget: [E.stage('subject', 'random', STAGE.massive)] }),
  innervate: cast('self', {
    after: [healPct('self', HEAL.small), onlyIf(healPct('self', 50), has('target', 'Mending'))]
  }),
  inoculate: cast('self', { after: [healPct('self', HEAL.massive), ...give('self', 'Poisoned')] }),
  insight: cast('self', { after: give('self', 'Arcane') }),
  insincerity: REJECT('forcedCast'),
  internalCombustion: hit('moderate', 'enemy', {
    onTarget: [
      onlyIf(E.dmg('otherFoes', ev(100)), dead),
      onlyIf(E.status('otherFoes', S('Burning')), dead)
    ]
  }),
  invisibility: cast('self', { after: give('self', 'Invisible') }),
  jinx: hit('small', 'enemy', { powerBonus: [pb(25, cnt('debuffs', { who: 'target' }))] }),
  judgmentBlade: hit('small', 'enemy', {
    powerBonus: [pb(10, cnt('attacks', { who: 'target' })), pb(10, cnt('casts', { who: 'target' }))]
  }),
  karmicRetribution: REJECT('castHistory'),
  kick: hit('moderate', 'enemy', { powerBonus: [pb(25, cnt('debuffs', { who: 'target' }))] }),
  kindle: hit('large', 'enemy', { powerBonus: [pb(5, cnt('attacks'))] }),
  knifesEdge: hit('large', 'enemy', { powerBonus: [pb(5, cnt('missingHpPercent'))] }),
  lacerate: hit('moderate', 'enemy', {
    powerBonus: [ifThen('moderate', 'massive', [has('target', 'Bleeding')])],
    onTarget: [onlyIf(E.status('subject', S('Bleeding')), lacks('subject', 'Bleeding'))]
  }),
  landOfTheDead: cast('allAllies', {
    onTarget: [...give('subject', 'Rebirth'), E.kill('subject')]
  }),
  laserBeam: hit('large', 'enemy', { onTarget: [E.maxHp('subject', ev(100), true)] }),
  lastStand: cast('self', { after: [E.atk('randomFoe', 200, 3), E.kill('self')] }),
  leadTheCharge: hit('small', 'enemy', {
    attackStat: basedOn('highest'),
    powerTimes: cnt('sameRaceOnSide')
  }),
  lifeOrb: cast('self', {
    after: [E.revive('faintedAllies', HEAL.massive), healPct('side', HEAL.massive, 'target')]
  }),
  lightningStorm: hit('massive', 'allEnemies', { after: give('self', 'Silenced') }),
  lingeringInsanity: REJECT('targetStat'),
  livingArmor: cast('self', { after: [barrier('self', hpv('max', 100))] }),
  // Không đếm riêng spell Arsenal: mỗi lần dùng skill special / status trong trận +25%.
  livingAxe: hit('large', 'enemy', { powerBonus: [pb(25, cnt('casts'))] }),
  livingBoots: cast('allAllies', {
    onTarget: [raise('subject', 'moderate', 'Speed')]
  }),
  livingBow: cast('self', { after: [E.cast({ pool: 'global', tags: ['arrow'], times: 3 })] }),
  livingChaosLance: lance('Chaos'),
  livingChaosShield: shield('Chaos', 'Taunting'),
  livingCloak: cast('self', {
    after: [raise('self', 'large', 'Speed'), ...give('self', 'Invisible')]
  }),
  livingDeathLance: lance('Death'),
  livingDeathShield: shield('Death', 'Leeching'),
  livingGauntlet: cast('self', {
    after: [raise('self', 'massive', 'Attack'), ...give('self', 'Savage')]
  })
}
