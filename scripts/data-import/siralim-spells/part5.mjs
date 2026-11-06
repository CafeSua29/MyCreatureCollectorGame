/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi spell Siralim, phần 5: spell ra ở các bản cập nhật sau bộ CSV của lần nhập đầu (lấy từ
// siralimultimate.wiki.gg bằng siralim-update-fetch.mjs, đợt 2026-11-04). Cùng quy ước với phần 1–4
// (mục "Quy đổi trait / spell Siralim" ở content-data.md); quy ước riêng của đợt này:
// - "Random enemies ... continuously, X% to end": số đòn kỳ vọng 100 / X chia đều cho hai ô địch
//   (đánh cả phe địch, power mỗi địch = power đơn mục tiêu × kỳ vọng / 2).
// - "Target ... continuously, X% to end": đánh một mục tiêu, số đòn = kỳ vọng làm tròn.
// - Dời xuống trên Timeline (một / vài bậc) quy về xuống cuối Timeline (Timeline chỉ có đầu / cuối).
// - Mania: lượng = 3% tổng máu mọi quái đã hồi trong trận lúc dính (`side: 'all'`).
import {
  ST,
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
  ch,
  HEAL,
  STAGE,
  POWER
} from './sdsl.mjs'

const S = (name) => ST[name] ?? MANIA_ID
const MANIA_ID = 'mania'
const has = (who, ...names) => C.has(who, names.map(S))
const give = (to, ...names) => names.map((name) => E.status(to, S(name)))
/** Mania với lượng theo máu đã hồi của cả trận (trạng thái Mania ở trait-dsl.md). */
const mania = (to) =>
  E.status(to, MANIA_ID, {
    amount: { record: 'healingReceived', of: 'self', percent: 3, side: 'all' }
  })
/** Đòn liên tục lên địch ngẫu nhiên: kỳ vọng 100 / endChance đòn, chia cho hai ô địch. */
const rain = (tier, endChance, opts = {}) =>
  hit(Math.round((POWER[tier] * 100) / endChance / 2), 'allEnemies', opts)
/** Đòn liên tục lên một mục tiêu: số đòn kỳ vọng làm tròn. */
const barrage = (tier, endChance, opts = {}) =>
  hit(tier, 'enemy', { ...opts, hits: Math.max(2, Math.round(100 / endChance)) })
const CATACLYSM = { tags: ['cataclysm'] }
const crit = { alwaysCrit: true }
/** Mục tiêu đang xét đã gục (vừa bị hạ ngay). */
const felled = { if: 'fainted', who: 'subject' }

export const CONVERSIONS = {
  bazooka: { ...hit('large', 'allEnemies'), ...crit },
  bigBang: hit('massive', 'allEnemies', {
    powerBonus: [
      pb(3, cnt('statuses', { who: 'target' })),
      pb(3, cnt('minionStacks', { who: 'target' }))
    ],
    onTarget: [E.cure('subject', 'buff'), E.cure('subject', 'debuff'), E.rmMinions('subject')],
    after: [
      E.dmg('side', ev(50)),
      E.cure('side', 'buff'),
      E.cure('side', 'debuff'),
      E.rmMinions('side')
    ]
  }),
  // Kỳ vọng 2 lần (50% dừng), mỗi địch một debuff ngẫu nhiên mỗi lần.
  blackMagic: cast('allEnemies', { onTarget: [E.random('subject', 'debuff')] }),
  boulderCrush: hit('massive', 'enemy', {
    onTarget: ['Bleeding', 'Confused', 'Weak', 'Vulnerable'].map((name) =>
      ch(E.status('subject', S(name)), 50)
    )
  }),
  chainsaw: barrage('large', 35, { onTarget: give('subject', 'Bleeding', 'Vulnerable') }),
  charity: cast('enemy', { onTarget: [ch(E.move('subject', 'subjectAllies', 'buff', true), 50)] }),
  cloudOfAnguish: {
    ...hit('small', 'allEnemies', {
      powerBonus: [pb(3, cnt('debuffs', { who: 'target' }))],
      onTarget: [E.random('subject', 'debuff', 2)]
    }),
    ...CATACLYSM
  },
  clusterBomb: cast('allEnemies', {
    onTarget: [
      E.burst('subject', [S('Bomb')], 1),
      onlyIf(E.status('subject', S('Bomb')), C.lacks('subject', [S('Bomb')]))
    ]
  }),
  coRay: cast('self', { after: [E.cast({ pool: 'ownSpell', by: 'allies' })] }),
  colorwave: REJECT('spellGem'),
  compulsion: cast('enemy', {
    onTarget: [mania('subject')],
    after: [E.heal('self', hpv('max', HEAL.small))]
  }),
  concoction: rain('small', 25, { onTarget: [E.random('subject', 'debuff')] }),
  concussiveHailstorm: hit('large', 'allEnemies', {
    onTarget: [ch(E.status('subject', S('Confused')), 50), ch(E.status('subject', S('Frozen')), 50)]
  }),
  // Kỳ vọng 4 lần (25% dừng).
  continuum: cast('self', { after: [E.cast({ pool: 'global', times: 4 })] }),
  cryOfTheMandrake: cast('allEnemies', { onTarget: [ch(E.kill('subject'), 25)] }),
  cyanideGas: cast('allEnemies', {
    onTarget: [...give('subject', 'Poisoned'), ch(E.kill('subject'), 25)]
  }),
  darkSky: cast('allEnemies', { onTarget: [E.cure('subject', 'buff', 1)] }),
  deadlyDuel: cast('enemy', {
    onTarget: [ch(E.kill('subject'), 50)],
    after: [ch(E.kill('self'), 50)]
  }),
  // Kỳ vọng 2 lần (50% lặp mãi).
  deathAndDestruction: cast('self', {
    after: [E.cast({ pool: 'global', tags: ['cataclysm'], times: 2 })]
  }),
  deepFreeze: cast('allEnemies', {
    onTarget: [
      ch(E.status('subject', S('Frozen')), 50),
      onlyIf(E.status('subject', S('Snared')), has('subject', 'Frozen'))
    ]
  }),
  delirium: cast('enemy', {
    onTarget: give('subject', 'Confused', 'Blind', 'Berserk', 'Savage')
  }),
  demonbreath: hit('moderate', 'allEnemies', {
    onTarget: [
      ch(E.status('subject', S('Blighted')), 75),
      ch(E.status('subject', S('Inverted')), 50),
      ch(E.status('subject', S('Cursed')), 25)
    ]
  }),
  // Phần "hồi 100% Charges" bỏ (không có Charge).
  eatenAlive: cast('enemy', {
    onTarget: [ch(E.kill('subject'), 35), onlyIf(E.heal('self', hpv('max', 100)), felled)]
  }),
  ef5Twister: {
    ...hit('large', 'allEnemies', {
      onTarget: ['Snared', 'Scorned', 'Silenced'].map((name) =>
        ch(E.status('subject', S(name)), 50)
      )
    }),
    ...CATACLYSM
  },
  entropicSwing: REJECT('autoCast'),
  euthanasia: cast('self', { after: [ch(E.kill('randomFoe'), 50)] }),
  fate: cast('self', { after: [ch(E.kill('foes'), 50), ch(E.kill('side'), 50)] }),
  gemConversion: REJECT('charge'),
  gemGamble: REJECT('charge'),
  genesis: cast('self', { after: [E.kill('allies'), E.revive('faintedAllies', 100)] }),
  giggle: cast('ally', {
    onTarget: [
      E.heal('subject', hpv('max', HEAL.small, 'subject')),
      E.flat('subject', stats('Intelligence'), hpv('max', HEAL.small, 'subject'))
    ]
  }),
  grandExplosion: {
    ...hit('large', 'allEnemies', {
      powerBonus: [pb(20, cnt('foesWithStatus', { statusIds: [S('Bomb')] }))],
      onTarget: give('subject', 'Bomb')
    }),
    ...CATACLYSM
  },
  grandFireball: hit('massive', 'enemy', {
    onTarget: [
      ...give('subject', 'Burning'),
      E.dmg('otherFoes', ev(35)),
      ...give('otherFoes', 'Burning')
    ]
  }),
  hemorrhage: cast('enemy', { onTarget: [E.burst('subject', [S('Bleeding')], 3)] }),
  hierarchy: cast('self', {
    after: [E.atk('randomFoe', 100, 1, 'side'), E.atk('randomAlly', 100, 1, 'foes')]
  }),
  holyWater: cast('allAllies', { onTarget: [E.cure('subject', 'debuff', 1)] }),
  hunger: rain('large', 35, { after: [E.status('self', S('Barrier'), { amount: ev(50) })] }),
  hurlingOfRocks: rain('large', 35, { onTarget: give('subject', 'Confused', 'Bleeding') }),
  icicleRain: {
    ...rain('large', 35, { onTarget: give('subject', 'Frozen', 'Bleeding') }),
    ...CATACLYSM
  },
  killStreak: cast('self', {
    after: [
      E.cast({ pool: 'global', categories: ['special'], timesPer: cnt('faintedAllies') }),
      E.cast({ pool: 'global', categories: ['special'], timesPer: cnt('faintedFoes') })
    ]
  }),
  kilonova: { ...rain('large', 25), ...CATACLYSM },
  lamentation: cast('allEnemies', {
    onTarget: [E.random('subject', 'debuff', 1, { countPer: cnt('faintedAllies') })]
  }),
  luckyGem: REJECT('charge'),
  magmaShower: {
    ...rain('large', 35, { onTarget: give('subject', 'Burning', 'Vulnerable') }),
    ...CATACLYSM
  },
  magnification: REJECT('castHistory'),
  megaTsunami: {
    ...hit('large', 'allEnemies', {
      onTarget: [
        ch(E.kill('subject'), 25),
        onlyIf(E.status('subject', S('Cursed')), C.hpAbove('subject', 0))
      ]
    }),
    ...CATACLYSM
  },
  mermaidsKiss: cast('ally', {
    onTarget: [
      E.heal('subject', hpv('max', HEAL.massive, 'subject')),
      ...give('subject', 'Mending')
    ]
  }),
  // Kỳ vọng 4 đòn, mỗi đòn +50%: tổng ~ 1 + 1,5 + 2 + 2,5 = 7 lần small, chia hai địch.
  momentum: hit(Math.round((POWER.small * 7) / 2), 'allEnemies'),
  mysteryGem: REJECT('charge'),
  napalm: hit('large', 'allEnemies', {
    onTarget: [
      ...give('subject', 'Burning', 'Vulnerable'),
      E.stage('subject', stats('Defense'), -STAGE.large)
    ]
  }),
  // Số stack minion theo bộ đếm chưa có (minion chỉ có số stack cố định).
  necromancy: REJECT('countBonus'),
  nuclearBlast: {
    ...hit('large', 'allEnemies', {
      onTarget: give('subject', 'Poisoned', 'Blighted', 'Inverted')
    }),
    ...CATACLYSM
  },
  partyInTheBack: REJECT('autoCast'),
  plaguebearer: cast('enemy', {
    onTarget: [ch(E.move('subject', 'subjectAllies', 'debuff', true), 50)]
  }),
  putrescentOdor: cast('allEnemies', {
    onTarget: give('subject', 'Poisoned', 'Blind', 'Confused')
  }),
  quicksand: cast('allEnemies', {
    onTarget: [ch(E.status('subject', S('Snared')), 50), ch(E.timeline('subject', 'bottom'), 50)]
  }),
  raiden: {
    ...rain('large', 35, { onTarget: give('subject', 'Blind', 'Confused') }),
    ...CATACLYSM
  },
  // Hệ số ngẫu nhiên 1–300%: lấy kỳ vọng ~150% của mức large.
  reckoning: hit(Math.round(POWER.large * 1.5), 'allEnemies'),
  richter10: { ...rain('massive', 50), ...CATACLYSM },
  riptide: cast('allEnemies', { onTarget: [E.timeline('subject', 'bottom')] }),
  searingFlames: hit('moderate', 'allEnemies', {
    onTarget: [
      E.cure('subject', 'buff'),
      E.cure('subject', 'debuff'),
      ...give('subject', 'Burning', 'Disarmed')
    ]
  }),
  // Mức ngẫu nhiên small → devastating: lấy mức giữa (large); 1–3 debuff: lấy 2.
  shatteredRainbow: hit('large', 'allEnemies', { onTarget: [E.random('subject', 'debuff', 2)] }),
  shiningJewel: REJECT('charge'),
  shotgun: { ...barrage('large', 50), ...crit },
  shrapnelGrenade: hit('massive', 'enemy', {
    onTarget: [
      ...give('subject', 'Bleeding'),
      ch(E.dmg('otherFoes', ev(100)), 50),
      ch(E.status('otherFoes', S('Bleeding')), 50)
    ]
  }),
  silverLining: cast('allAllies', {
    onTarget: [E.random('subject', 'buff', 1, { countPer: cnt('faintedAllies') })]
  }),
  snipe: { ...hit('massive', 'enemy', { onTarget: [ch(E.kill('subject'), 30)] }), ...crit },
  snowball: hit('small', 'enemy', {
    onTarget: [
      onlyIf(E.timeline('subject', 'bottom'), has('subject', 'Frozen')),
      ...give('subject', 'Frozen')
    ]
  }),
  spontaneousCombustion: cast('enemy', {
    onTarget: [
      ch(E.kill('subject'), 35),
      onlyIf(E.dmg('otherFoes', sv('Intelligence', POWER.massive)), felled)
    ]
  }),
  // Tỉ lệ hạ ngay theo bộ đếm (1% mỗi 1% máu đã mất): cùng lý do loại như Impending Doom.
  supremacy: REJECT('killChance'),
  thoughtsAndPrayers: REJECT('joke'),
  tradeOffer: REJECT('artifact'),
  treasonousMind: REJECT('autoCast'),
  // Kỳ vọng 2 đòn mỗi địch rồi nhảy sang địch kế: mọi địch, mỗi địch 2 đòn massive.
  ultimus: hit('massive', 'allEnemies', { hits: 4 }),
  usury: cast('self', {
    after: [
      { ...E.stage('self', stats('Attack'), STAGE.small), timesPer: cnt('turnsTaken', { max: 5 }) }
    ]
  }),
  uzi: { ...rain('small', 20), ...crit },
  // Mức ngẫu nhiên: lấy mức giữa (large) cho cả quái dùng lẫn mọi địch.
  voodoo: cast('self', {
    after: [
      E.dmg('self', sv('Intelligence', POWER.large)),
      E.dmg('foes', sv('Intelligence', POWER.large))
    ]
  }),
  waveOfBliss: cast('allEnemies', {
    onTarget: [
      onlyIf(E.burst('subject', [MANIA_ID], 1), has('subject', MANIA_ID)),
      onlyIf(mania('subject'), C.lacks('subject', [MANIA_ID]))
    ]
  }),
  whiteMagic: cast('allAllies', { onTarget: [E.random('subject', 'buff')] }),
  witchcraft: REJECT('forcedCast')
}
