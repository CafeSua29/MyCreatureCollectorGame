/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi trait Siralim, phần 9: trait của loài ra ở các bản cập nhật sau bộ CSV của lần nhập đầu
// (lấy từ siralimultimate.wiki.gg bằng siralim-update-fetch.mjs, đợt 2026-11-04). Cùng quy ước và lý
// do loại với phần 1–8 (mục "Quy đổi trait / spell Siralim" ở content-data.md). Quy ước riêng:
// - Race Siralim mới quy về race game của loài (Eggxotic → livingObject, Mythicant theo bảng cũ...).
// - "Gây sát thương / nhận chỉ số bằng X% chỉ số" dùng lượng theo chỉ số như các phần trước.
// - "Phần trăm ngẫu nhiên 1–100%" lấy giữa khoảng (50%).
// - Mệnh đề dựa trên hệ thống game không có (Spell Gem, Charge, Personality, Artifact...) thì loại cả
//   trait nếu phần còn lại chỉ là bất lợi; còn phần có lợi dùng được thì giữ phần đó.
import {
  ST,
  CLASS,
  race,
  stats,
  pct,
  sv,
  hpv,
  ev,
  cnt,
  statMod,
  side,
  h,
  dmg,
  scaling,
  undodgeable,
  negate,
  cap,
  bonus,
  statusDmg,
  potencyAll,
  blockManual,
  revive,
  stageMult,
  intercept,
  start,
  trig,
  E,
  C,
  REJECT,
  spell,
  onlyIf
} from './dsl.mjs'

const MANIA = 'mania'
const S = (name) => (name === 'Mania' ? MANIA : ST[name])
const has = (who, ...names) => C.has(who, names.map(S))
const lacks = (who, ...names) => C.lacks(who, names.map(S))
const EGGXOTIC = ['livingObject']
const isEggxotic = (who) => C.race(who, EGGXOTIC)
/** Mania với lượng theo máu đã hồi của cả trận (trạng thái Mania ở trait-dsl.md). */
const mania = (to) =>
  E.status(to, MANIA, {
    amount: { record: 'healingReceived', of: 'self', percent: 3, side: 'all' }
  })
const status = (to, name) => (name === 'Mania' ? mania(to) : E.status(to, S(name)))
/** "Luôn có trạng thái X": gán khi vào sân và làm mới cuối mỗi lượt (như phần 8). */
const always = (to, name, { targetIf } = {}) => {
  const effect = targetIf ? onlyIf(status(to, name), ...targetIf) : status(to, name)
  return [trig('entry', 'self', effect), trig('turnEnd', 'self', effect)]
}
/** Hào quang cho quái phe mình thỏa điều kiện (xét trên quái nhận). */
const sideIf = (receiverWhen, ...hooks) => ({
  type: 'aura',
  params: { scope: 'side', hooks, receiverWhen }
})
const foesIf = (receiverWhen, ...hooks) => ({
  type: 'aura',
  params: { scope: 'foes', hooks, receiverWhen }
})
const alliesIf = (receiverWhen, ...hooks) => ({
  type: 'aura',
  params: { scope: 'allies', hooks, receiverWhen }
})
/** "Cuối lượt của mọi quái: 10% dùng spell X" (họ Cataclysm). */
const wrath = (spellName) => [
  trig('turnEnd', 'any', E.cast({ skillId: spell(spellName) }), { chance: 10 })
]
/** "Đầu lượt của quái này: mỗi địch 50% dính hai debuff" (họ Exotic ánh sáng / lửa...). */
const startAfflict = (...names) => [
  trig(
    'turnEnd',
    'self',
    names.map((name) => ({ ...E.status('foes', S(name)), chance: 50 }))
  )
]
/** Sau khi gây sát thương bằng đòn hoặc spell. */
const onDamage = (effects, opts = {}) => [
  trig('attack', 'self', effects, opts),
  trig('cast', 'self', effects, opts)
]
const CLUTTER = ['Cursed', 'Burning', 'Poisoned', 'Bleeding'].map(S)

export const CONVERSIONS = {
  wrathOfTheAlmighty: wrath('Death and Destruction'),
  yowl: REJECT('spellGem'),
  cloudyConstitution: [
    ...always('self', 'Vulnerable'),
    sideIf([has('self', 'Vulnerable')], stageMult({ gain: 1.5 }))
  ],
  maow: REJECT('spellGem'),
  squirmies: [
    trig('entry', 'self', E.minion('self', 1, 'writhelings')),
    trig('damaged', 'self', E.minion('self', 1, 'writhelings'))
  ],
  weaponsOfMassDistortion: REJECT('artifact'),
  // Chỉ số Defense nhận thêm 50% (thủ và thủ đặc biệt; mọi nguồn tăng bậc).
  lordOfTheCastle: [side(stageMult({ gain: 1.5 }))],
  hisss: REJECT('spellGem'),
  // Phần miễn hạ ngay ngoài trận boss chưa có hook; giữ phần giới hạn sát thương mỗi đòn.
  reactorShield: [cap(60)],
  pop: [
    trig('damaged', 'self', [
      onlyIf(E.burst('foes', [S('Bomb')], 1), has('target', 'Bomb')),
      onlyIf({ ...E.status('foes', S('Bomb')), chance: 50 }, lacks('target', 'Bomb'))
    ])
  ],
  eggLog: [
    ...always('self', 'Defensive'),
    trig('damaged', 'side', E.dmg('other', sv('Defense', 10, 'subject')), {
      when: [isEggxotic('subject')]
    })
  ],
  orthoclase: [
    ...always('self', 'Stone'),
    sideIf([has('self', 'Stone')], statMod(pct(50, 'Defense')))
  ],
  oneOfUsMustChange: REJECT('personality'),
  spiteMatch: REJECT('personality'),
  stolenValor: REJECT('traitRemoval'),
  falseBravado: REJECT('personality'),
  suCasaEsMiCasa: REJECT('personality'),
  loadBearingMakeup: REJECT('personality'),
  atmosphericInterference: onDamage(E.status('self', S('Barrier'), { amount: ev(50) })),
  impedence: REJECT('spellGem'),
  multibite: [trig('attack', 'self', E.atk('other', 100), { chance: 25, repeatChance: 25 })],
  timeFractureResonance: REJECT('timelinePosition'),
  ultraCling: onDamage({ ...E.status('other', S('Snared')), chance: 50 }),
  // "Tối đa 3 debuff": chép mọi debuff của quái này.
  lovesick: [
    trig('attack', 'self', E.move('self', 'other', 'debuff', true)),
    trig('attacked', 'self', E.move('self', 'other', 'debuff', true))
  ],
  wrathOfTheCosmos: wrath('Kilonova'),
  massEffect: REJECT('triggerRepeat'),
  theGrudge: REJECT('statusBasis'),
  jungleBoogie: [scaling(cnt('statuses', { statusIds: CLUTTER }), { stats: pct(50, 'Speed') })],
  // Quái đang ngủ hành động theo lệnh thường thay vì tự đánh / dùng spell đầu danh sách.
  sleepwalking: [
    h('enforcedStatuses', { scope: 'self', statusIds: [ST.Sleeping] }),
    side(h('actsThroughStatus', { statusIds: [ST.Sleeping] })),
    ...['attack', 'cast'].map((on) =>
      trig(on, 'side', E.status('other', S('Sleeping')), {
        chance: 50,
        when: [has('subject', 'Sleeping')]
      })
    )
  ],
  fishingForCompliments: REJECT('forcedCast'),
  counterSweep: [
    trig('attacked', 'self', E.dmg('foes', sv('Defense', 5, 'self', cnt('timesDamaged'))))
  ],
  bloodbath: [
    trig('attack', 'self', E.status('other', S('Bleeding'))),
    trig('attack', 'self', E.cast({ skillId: spell('Hemorrhage') }), { chance: 25 })
  ],
  rottenRevenge: [trig('damaged', 'self', E.cast({ skillId: spell('Putrescent Odor') }))],
  ancientWisdom: REJECT('statConversion'),
  // "Đồng đội kề bên" = đồng đội trên sân (đội 2 ô).
  dustyStruggle: ['attack', 'cast', 'defend', 'provoke'].map((on) =>
    trig(on, 'self', [E.random('side', 'debuff'), { ...E.timeline('side', 'top'), chance: 20 }])
  ),
  eggCloustard: [
    ...always('self', 'Agile'),
    alliesIf([isEggxotic('self')], { type: 'dodge', params: { percent: 20 } })
  ],
  soupFfleyed: [
    ...always('self', 'Proficient'),
    trig('attacked', 'side', E.status('other', S('Confused')), { when: [isEggxotic('subject')] })
  ],
  eggFlourishTine: [
    ...always('self', 'Leeching'),
    ...always('side', 'Berserk', { targetIf: [isEggxotic('target')] })
  ],
  // Phần buộc địch dùng spell bỏ (forcedCast); giữ phần gây Mania.
  roundOfApplause: [trig('healed', 'foes', mania('subject'), { when: [C.sameSide('other')] })],
  wrathOfTheGreatWar: wrath('Grand Explosion'),
  petrifiedHope: startAfflict('Stone', 'Feared'),
  outstanding: [trig('statusDamage', 'self', E.flat('self', stats('Attack'), sv('Attack', 20)))],
  chillOut: [trig('cast', 'foes', E.status('subject', S('Frozen')))],
  chatteringChant: REJECT('spellGem'),
  gatheringStorm: REJECT('timelinePosition'),
  lunaticGenerosity: REJECT('spellGem'),
  massMutation: REJECT('fusion'),
  wrathOfTheGlacier: wrath('Icicle Rain'),
  thrillfulTrills: REJECT('spellGem'),
  beyondTheVeil: REJECT('deathTiming'),
  destructionBeam: REJECT('targetStat'),
  karmicReflection: [trig('damaged', 'self', E.dmg('foes', hpv('missing', 25)))],
  sutureTechnique: [trig('statusDamage', 'side', E.heal('subject', hpv('max', 20, 'subject')))],
  ignoranceIsBliss: [
    ...always('self', 'Mania'),
    ...always('self', 'Mending'),
    trig('statusDamage', 'side', E.dmg('randomFoe', ev(100)), { statusIds: [MANIA] })
  ],
  redHotKiss: startAfflict('Burning', 'Confused'),
  freezerBlast: [trig('turnEnd', 'self', E.cast({ skillId: spell('Deep Freeze') }))],
  agonizingEntrapment: [
    trig('damaged', 'self', [E.status('other', S('Snared')), E.status('other', S('Bleeding'))]),
    foesIf([has('self', 'Snared')], statusDmg([S('Bleeding')], 50))
  ],
  wintersEdge: onDamage({ ...E.status('other', S('Frozen')), chance: 50 }),
  trickOrTreat: [
    trig('damaged', 'self', E.cast({ skillId: spell('Fireball') })),
    trig('attack', 'self', E.cast({ skillId: spell('Grand Fireball') }), { chance: 35 })
  ],
  totalDiscord: REJECT('targetChange'),
  roadRage: [trig('attack', 'self', E.atk('randomFoe', 100), { chance: 25, repeatChance: 25 })],
  prismaticOne: REJECT('identityChange'),
  weaponizedSpirit: REJECT('spellFamily'),
  croakOfTheKing: [trig('faint', 'allies', E.cast({ skillId: spell('Cry of the Mandrake') }))],
  coPilots: REJECT('adjacency'),
  pinsAndNeedles: [
    trig('statusDamage', 'self', E.flat('self', stats('Defense'), sv('Defense', 20)))
  ],
  theHighHunt: [
    trig('attack', 'self', E.flat('self', stats('Intelligence'), sv('Intelligence', 10))),
    trig('cast', 'self', E.flat('self', stats('Attack'), sv('Attack', 10)))
  ],
  armigerStrike: [
    scaling(cnt('attacks'), { damageTaken: -5 }),
    scaling(cnt('casts'), { stats: pct(3, 'Attack', 'Intelligence') })
  ],
  consumingKnowledge: REJECT('charge'),
  theGoldenSign: REJECT('randomChoice'),
  soulExchange: REJECT('statSet'),
  bigWings: REJECT('statDifference'),
  lightsOut: startAfflict('Silenced', 'Sleeping'),
  // Bỏ qua 20% thủ ≈ +25% sát thương lên địch đang phòng thủ / khiêu khích (cộng dồn khi cả hai).
  grandPas: [
    side(dmg(25, { when: [C.defending('target')] })),
    side(dmg(25, { when: [C.provoking('target')] }))
  ],
  hoodwink: always('foes', 'Taunting'),
  innocence: REJECT('statusPotency'),
  adoration: REJECT('forcedCast'),
  circusReverie: [side(bonus(sv('Attack', 10, 'self', cnt('buffs', { who: 'target' }))))],
  entrancing: [
    ...always('foes', 'Defensive'),
    trig('defend', 'foes', [E.status('subject', S('Blind')), E.status('subject', S('Sleeping'))])
  ],
  heartstrings: REJECT('forcedCast'),
  spotlight: [
    trig('turnEnd', 'foes', [E.atk('self', 15, 1, 'subject'), E.status('subject', S('Cursed'))])
  ],
  glissando: [
    ...always('foes', 'Agile'),
    trig('dodged', 'foes', E.atk('subject', 50, 1, 'side'), { oncePerTurn: true })
  ],
  communicationServices: REJECT('adjacency'),
  giantBite: [trig('attack', 'self', E.dmg('foes', ev(50)))],
  buzzBreathing: [
    trig(
      'turnEnd',
      'side',
      E.heal('subject', hpv('max', 10, 'subject', cnt('buffs', { who: 'subject' })))
    )
  ],
  endOnAHighNote: REJECT('reviveBlock'),
  surpriseTreat: REJECT('triggerActivation'),
  // Phần đổi cách Spiderlings gây sát thương chưa có hook; giữ phần mọi quái vào trận có Spiderlings.
  megaSpiderBlast: [trig('entry', 'self', E.minion('side', 1, 'spiderlings'))],
  powerInBalance: REJECT('statAverage'),
  enfeeblingHaze: REJECT('statConversion'),
  scoundrelsStrike: REJECT('skillModify'),
  rainOfMagic: REJECT('charge'),
  conduitStrike: REJECT('charge'),
  ofFateUnwritten: [
    trig(
      'attack',
      'self',
      E.dmg('otherFoes', ev(100, cnt('raceOnSide', { raceIds: [race('Mythicant')] })))
    ),
    scaling(
      cnt('raceOnSide', { raceIds: [race('Mythicant')] }),
      { defenseIgnored: 10 },
      { cap: 50 }
    )
  ],
  malediction: [
    scaling(
      cnt('statuses', { statusIds: CLUTTER }),
      { damageDealt: 25 },
      { categories: ['special', 'status'] }
    )
  ],
  wrathOfHumanity: wrath('Nuclear Blast'),
  wrathOfTheOcean: wrath('Mega Tsunami'),
  bangARang: [
    trig(
      'statusDamage',
      'foes',
      [
        onlyIf(E.status('subject', S('Burning')), lacks('subject', 'Burning')),
        onlyIf(E.status('subject', S('Poisoned')), lacks('subject', 'Poisoned')),
        onlyIf(E.potency('subject', [S('Burning'), S('Poisoned')], 30), has('subject', 'Burning'))
      ],
      { statusIds: [S('Bomb')] }
    )
  ],
  oneHitWonder: REJECT('extraHitMerge'),
  adoringFans: [
    trig('healed', 'side', E.flat('subject', 'highest', ev(10)), { when: [has('other', 'Mania')] })
  ],
  powerfulDraw: REJECT('spellFamily'),
  infinity: [trig('cast', 'self', E.cast({ skillId: spell('Continuum') }), { chance: 10 })],
  wrathOfThePandemic: wrath('Cloud of Anguish'),
  imprudence: REJECT('guardRemoval'),
  eureka: REJECT('statusPotency'),
  purrr: REJECT('spellGem'),
  dontTouchMyGarbage: REJECT('spellGem'),
  chaseDown: [
    trig('attack', 'self', E.status('other', S('Bleeding'))),
    side(undodgeable({ when: [has('target', 'Bleeding')] }))
  ],
  prismagic: REJECT('spellGem'),
  outForBlood: [trig('turnEnd', 'foes', E.cast({ skillId: spell('Kill Streak') }), { chance: 35 })],
  turnToGrey: [trig('attacked', 'self', E.status('foes', S('Vulnerable')))],
  testuOyakodon: [
    ...always('self', 'Savage'),
    trig('attacked', 'side', E.status('subject', S('Shelled')), { when: [isEggxotic('subject')] })
  ],
  lavaBroiled: [
    ...always('self', 'Repelling'),
    ...always('allies', 'Warded', { targetIf: [isEggxotic('target')] })
  ],
  perfectReplica: REJECT('transform'),
  transformationApprenticeship: [
    trig('entry', 'self', onlyIf(E.trait('side'), C.race('target', [race('Shapeshifter')])))
  ],
  wrathOfTheSky: wrath('EF5 Twister'),
  colorShift: REJECT('identityChange'),
  chillingAssault: [
    trig('attack', 'self', E.cast({ skillId: spell('Icicle Rain') }), { chance: 50 })
  ],
  unrelentingSun: startAfflict('Burning', 'Blind'),
  warpedSoul: REJECT('identityChange'),
  soulsOfTheDamned: [
    trig('kill', 'self', [
      E.trait('self', { copyFrom: 'other' }),
      E.flat('self', stats('Attack'), sv('Attack', 20, 'other')),
      E.flat('self', stats('Defense'), sv('Defense', 20, 'other'))
    ])
  ],
  spectometry: REJECT('spellGem'),
  prismaticAmplifier: REJECT('castHistory'),
  lucidRenewal: REJECT('charge'),
  shiftingBrilliance: REJECT('castHistory'),
  enochian: REJECT('castHistory'),
  addToTheMix: REJECT('castHistory'),
  gemBlade: REJECT('artifact'),
  duality: REJECT('partyOrder'),
  qualityOverQuantity: REJECT('charge'),
  wrathOfTheStorm: wrath('Raiden'),
  swarmOfBees: [trig('damaged', 'self', E.atk('randomFoe', 100), { repeatChance: 50 })],
  malpractice: [
    trig('attacked', 'self', E.cast({ skillId: spell('Euthanasia') })),
    trig('attack', 'self', E.kill('other'), { chance: 25 })
  ],
  wrathOfTheEarth: wrath('Richter 10'),
  theEndOfAllThings: REJECT('triggerActivation'),
  anotherMansTrash: [
    statMod(pct(100, 'Health', 'Attack', 'Intelligence', 'Defense', 'Speed')),
    blockManual(['physical', 'special', 'status'])
  ],
  negativeCharge: REJECT('skillModify'),
  tardyToTheParty: REJECT('spellGem'),
  badTrip: [trig('damaged', 'self', E.cast({ skillId: spell('Delirium') }))],
  goingMad: [
    trig('damaged', 'self', E.random('self', 'buff')),
    trig('healed', 'self', E.random('self', 'debuff')),
    trig('damaged', 'self', E.dmg('foes', sv('lowest', 50)), {
      when: [C.atLeast(cnt('statuses'), 15)]
    })
  ],
  // Không kích hoạt từ sát thương của chính trait này: chỉ khi quái khác mất máu.
  trainingDay: [trig('damagedAny', 'any', E.dmg('self', ev(30)), { when: [C.notSelf('subject')] })],
  moltenSpray: [
    ...always('self', 'Scorned'),
    trig('attack', 'side', E.dmg('foes', ev(50)), { when: [has('subject', 'Scorned')] })
  ],
  yearOfTheTrolboar: [
    trig(
      'provoke',
      'self',
      E.dmg(
        'randomFoe',
        sv('Intelligence', 25, 'self', cnt('missingHpPercent', { divisor: 5, bonus: 1 }))
      )
    )
  ],
  robbingTheGrave: REJECT('statConversion'),
  creepingDoom: [
    side(
      scaling(
        cnt('elementOnSide', { elementIds: [CLASS.Death] }),
        { damageDealt: 15 },
        { when: [has('target', 'Feared')] }
      )
    )
  ],
  miseryLovesCompany: REJECT('statConversion'),
  mortalTerror: REJECT('triggerActivation'),
  darkRitual: REJECT('statConversion'),
  feastAndFamine: REJECT('reviveBlock'),
  commandingPresence: [sideIf([C.race('self', [race('Uralos')])], potencyAll(50))],
  // Mệnh đề "không tốn Charge" bỏ vì game không có Charge.
  frostAffinity: [
    h('enforcedStatuses', { scope: 'self', statusIds: [ST.Frozen] }),
    side(h('actsThroughStatus', { statusIds: [ST.Frozen] }))
  ],
  // Phần nhận sát thương theo công thay thủ chưa có hook; giữ phần đỡ đòn khi bị Snared.
  barbedVines: [...always('self', 'Snared'), sideIf([has('self', 'Snared')], intercept())],
  wrathOfTheVolcano: wrath('Magma Shower'),
  condiments: [
    trig('cast', 'foes', E.random('foes', 'debuff'), { oncePerTurn: true }),
    trig('attack', 'self', E.random('other', 'debuff', 2), { oncePerTurn: true })
  ],
  whatAreYouBuying: REJECT('artifact'),
  sandstorm: REJECT('targetChange'),
  ejectorSeat: [negate(100, { source: 'skill' }), trig('statusDamage', 'self', E.kill('self'))],
  // Phần nhận trait cường hóa Lightning Strike sau khi hồi sinh chưa có; giữ spell và hồi sinh 100%.
  thunderBuddy: [trig('entry', 'self', E.temp('self', spell('Lightning Strike'))), revive(100)],
  phasers: REJECT('charge'),
  eternalRest: [
    trig('turnEnd', 'foes', E.status('subject', S('Sleeping')), { chance: 10 }),
    trig('turnEnd', 'self', onlyIf(E.atk('foes', 50), has('target', 'Sleeping')))
  ],
  // Trait Nether Boss (Tier 1) của boss tên chung nhập làm loài (siralim-nether-fetch.mjs).
  undying: [trig('damaged', 'self', E.status('self', S('Shelled'))), intercept()],
  // "Luôn có" Scorned, đổi với Silenced đầu lượt của quái mang (hook enforcedStatuses, trait-dsl.md).
  inheritTheEarth: [h('enforcedStatuses', { scope: 'any', statusIds: [ST.Scorned, ST.Silenced] })],
  shadowsConverge: [trig('damaged', 'side', E.dmg('randomFoe', ev(100)))],
  tornBetwixt: [
    trig(
      'faint',
      'self',
      ['Attack', 'Intelligence', 'Defense', 'Speed'].map((name) =>
        E.flat('allies', stats(name), sv(name, 200))
      )
    )
  ],
  sacrilege: [trig('turnEnd', 'self', E.setHp('foes', 20)), start('top')],
  boneyard: [trig('turnEnd', 'self', E.kill('foes', 5)), start('bottom')]
}
