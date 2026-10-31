/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Cơ chế riêng của chiêu Pokémon theo bản gốc (docs/rules/pokemon-moves.md, pokemon-moves-flow.md), viết bằng
// "ngôn ngữ" trait trong phần `spell` của skill (docs/rules/trait-dsl.md). Mỗi mục ghi đè các
// trường đã nêu của skill cùng id (spell ghi đè cả object); trường không nêu giữ nguyên. Chạy lại
// được: node scripts/data-import/pokemon-move-mechanics.mjs rồi prettier src/data/skills.json.
// Ngoài bảng: chiêu nhắm địch có accuracy "—" ở gốc (Showdown `accuracy: true`) được `alwaysHits`.
// Số lấy theo Bulbapedia / Pokémon Showdown (thế hệ 9).

import { readFileSync, writeFileSync } from 'node:fs'
import { camelId, fetchShowdown } from './showdown.mjs'

const SKILLS = new URL('../../src/data/skills.json', import.meta.url)

/** Trạng thái chính của Pokémon (Hex...). */
const MAJOR_STATUSES = ['burn', 'paralysis', 'poison', 'badPoison', 'sleep', 'freeze']
const DAMAGING = ['physical', 'special']

/**
 * Hồi máu theo thời tiết: mục đầu tiên có thời tiết đang có thì hồi % đó, không có thì 50%.
 * [[thời tiết], %][] → hiệu ứng `heal` có điều kiện (spell.after).
 */
const weatherHeal = (rules) => {
  const heal = (percent, condition) => ({
    do: 'heal',
    to: 'self',
    amount: { hp: 'max', of: 'self', percent },
    if: [condition]
  })
  const active = (fieldIds) => ({ if: 'fieldActive', layer: 'weather', fieldIds })
  const all = rules.flatMap(([fieldIds]) => fieldIds)
  return [
    ...rules.map(([fieldIds, percent]) => heal(percent, active(fieldIds))),
    heal(50, { if: 'not', condition: active(all) })
  ]
}

/** Power theo công thức (registries/powerFormulas.ts). */
const linear = (value, times, extra = {}) => ({
  powerFormula: { type: 'linear', value, times, ...extra }
})
const steps = (value, list, otherwise) => ({
  powerFormula: { type: 'steps', value, steps: list, otherwise }
})
const hpOf = (who) => ({ of: 'hpPercent', who })
const ratio = (numerator, denominator) => ({ of: 'ratio', numerator, denominator })
const speedOf = (who) => ({ of: 'stat', stat: 'speed', who })
const weightOf = (who) => ({ of: 'weight', who })
/** Flail / Reversal: p = ⌊48 × máu / max⌋, mốc theo % máu tương ứng. */
const FLAIL_STEPS = [
  [2, 200],
  [5, 150],
  [10, 100],
  [17, 80],
  [33, 40]
].map(([p, power]) => ({ below: (p / 48) * 100, power }))
const WEIGHT_STEPS = [
  [200, 120],
  [100, 100],
  [50, 80],
  [25, 60],
  [10, 40]
].map(([kg, power]) => ({ atLeast: kg, power }))
const WEIGHT_RATIO_STEPS = [
  [5, 120],
  [4, 100],
  [3, 80],
  [2, 60]
].map(([r, power]) => ({ atLeast: r, power }))
const ELECTRO_STEPS = [
  [4, 150],
  [3, 120],
  [2, 80],
  [1, 60]
].map(([r, power]) => ({ atLeast: r, power }))

/** Hiệu ứng bảo vệ (Protect, Detect, Endure, King's Shield...): dùng liên tiếp tỉ lệ ÷ 3. */
const protectEffect = (extra = {}) => ({
  type: 'protect',
  params: { consecutiveChanceDivisor: 3, ...extra }
})
const stageOther = (stat, delta) => ({ do: 'stage', to: 'other', stats: [stat], delta })
/** Đòn trả: nhắm kẻ vừa đánh, sát thương = hệ số × đòn cuối đúng loại. */
const counterMove = (multiplier, categories) => ({
  target: 'enemy',
  targetsLastAttacker: categories ? { categories } : {},
  fixedDamage: categories
    ? { kind: 'counter', multiplier, categories }
    : { kind: 'counter', multiplier }
})

const selfStage = (stat, delta) => ({ do: 'stage', to: 'self', stats: [stat], delta })
/** Số lần dùng liên tiếp skill đang xét (bộ đếm skillStreak). */
const streak = { of: 'counter', counter: { of: 'skillStreak' } }
/** Rollout / Ice Ball: 30 × 2^(n − 1), tối đa 5 lần. */
const rolloutPower = {
  type: 'steps',
  value: streak,
  steps: [
    { atLeast: 5, power: 480 },
    { atLeast: 4, power: 240 },
    { atLeast: 3, power: 120 },
    { atLeast: 2, power: 60 }
  ],
  otherwise: 30
}

const trapTarget = { type: 'applyStatus', params: { statusId: 'cantEscape' } }
/** Trạng thái lên chính quái dùng (skill nhắm self: applyStatus lên mục tiêu = quái dùng). */
const selfStatus = (statusId) => ({ type: 'applyStatus', params: { statusId } })

/** Thief / Covet: lấy món của mục tiêu khi quái dùng chưa cầm gì (trả lại hết trận). */
const stealItems = {
  do: 'takeItems',
  from: 'other',
  to: 'self',
  if: [{ if: 'holdsItem', who: 'self', value: false }]
}

const ALL_STAGES = ['attack', 'defense', 'spAttack', 'spDefense', 'speed', 'accuracy', 'evasion']
const statusOn = (statusId) => ({ type: 'applyStatus', params: { statusId } })
const isGhost = { if: 'element', who: 'self', elementIds: ['ghost'] }
const notGhost = { if: 'not', condition: isGhost }
const grassy = { if: 'fieldActive', layer: 'terrain', fieldIds: ['grassyTerrain'] }
// Chiêu theo cân nặng thất bại trước quái Dynamax (như Pokémon).
const notDynamaxTarget = {
  requires: [{ if: 'not', condition: { if: 'transformed', who: 'target', kinds: ['dynamax'] } }]
}
const comboAfter = (skillIds) => ({ if: 'previousSkillThisTurn', skillIds, sameSide: true })
const healOther = (percent) => ({
  do: 'heal',
  to: 'other',
  amount: { hp: 'max', of: 'other', percent }
})
const stockpiled = { of: 'counter', counter: { of: 'stockpile' } }
/** Swallow: hồi 25 / 50 / 100% theo số lần tích trữ. */
const swallowHeal = (percent, count) => ({
  do: 'heal',
  to: 'self',
  amount: { hp: 'max', of: 'self', percent },
  if: [
    { if: 'counterAtLeast', counter: { of: 'stockpile' }, min: count },
    { if: 'counterBelow', counter: { of: 'stockpile' }, max: count + 1 }
  ]
})

const double = (when) => ({ powerBonus: [{ percent: 100, when }] })
const boostWhen = (percent, when) => ({ powerBonus: [{ percent, when }] })
const flinch = { type: 'applyStatus', params: { statusId: 'flinch' } }

/** Chiêu Metronome gọi được / chiêu không gọi được (Sleep Talk, Assist), điền sau khi tải Showdown. */
const METRONOME_POOL = []
const NOT_CALLABLE = []

/** id skill → trường ghi đè. */
const MECHANICS = {
  // ---------- Điều kiện thất bại ----------
  steelRoller: { spell: { requires: [{ if: 'fieldActive', layer: 'terrain' }] } },
  poltergeist: { spell: { requires: [{ if: 'holdsItem', who: 'target', value: true }] } },
  suckerPunch: {
    spell: { requires: [{ if: 'pendingSkill', who: 'target', categories: DAMAGING }] }
  },
  thunderclap: {
    spell: { requires: [{ if: 'pendingSkill', who: 'target', categories: DAMAGING }] }
  },
  upperHand: {
    effects: [flinch],
    spell: {
      requires: [{ if: 'pendingSkill', who: 'target', categories: DAMAGING, minPriority: 1 }]
    }
  },

  // Defog nhắm một địch như gốc: hạ 1 bậc né của mục tiêu rồi dọn sân (crit-accuracy-import.mjs
  // cũng tự thêm bậc né khi skill nhắm địch, chạy lại không bị trùng).
  defog: {
    target: 'enemy',
    effects: [
      { type: 'clearSideFields', params: { side: 'foe' } },
      { type: 'clearSideFields', params: { side: 'own', hazardsOnly: true } },
      { type: 'clearField', params: { layer: 'terrain' } },
      { type: 'statStage', params: { who: 'target', stat: 'evasion', delta: -1 } }
    ]
  },

  // ---------- Mạnh hơn theo việc trong lượt ----------
  lashOut: { spell: double([{ if: 'statsChangedThisTurn', who: 'self', direction: 'lowered' }]) },
  stompingTantrum: { spell: double([{ if: 'lastSkillFailed', who: 'self' }]) },
  temperFlare: { spell: double([{ if: 'lastSkillFailed', who: 'self' }]) },
  payback: { spell: double([{ if: 'actedThisTurn', who: 'target', value: true }]) },
  boltBeak: { spell: double([{ if: 'actedThisTurn', who: 'target', value: false }]) },
  fishiousRend: { spell: double([{ if: 'actedThisTurn', who: 'target', value: false }]) },
  avalanche: { spell: double([{ if: 'hitThisTurn', who: 'self', by: 'target' }]) },
  revenge: { spell: double([{ if: 'hitThisTurn', who: 'self', by: 'target' }]) },
  assurance: { spell: double([{ if: 'hitThisTurn', who: 'target' }]) },

  // ---------- Mạnh hơn theo trạng thái / đồ / biến hình ----------
  hex: { spell: double([{ if: 'hasStatus', who: 'target', statusIds: MAJOR_STATUSES }]) },
  venoshock: {
    spell: double([{ if: 'hasStatus', who: 'target', statusIds: ['poison', 'badPoison'] }])
  },
  brine: { spell: double([{ if: 'hpBelow', who: 'target', percent: 50 }]) },
  smellingSalts: {
    spell: {
      ...double([{ if: 'hasStatus', who: 'target', statusIds: ['paralysis'] }]),
      onTarget: [{ do: 'cure', to: 'other', kind: 'debuff', statusIds: ['paralysis'] }]
    }
  },
  wakeUpSlap: {
    spell: {
      ...double([{ if: 'hasStatus', who: 'target', statusIds: ['sleep'] }]),
      onTarget: [{ do: 'cure', to: 'other', kind: 'debuff', statusIds: ['sleep'] }]
    }
  },
  // Facade: ×2 khi mang trạng thái chính, bỏ qua giảm sát thương của bỏng.
  facade: {
    ignoresStatusPenalty: true,
    spell: double([
      { if: 'hasStatus', who: 'self', statusIds: ['burn', 'paralysis', 'poison', 'badPoison'] }
    ])
  },
  acrobatics: { spell: double([{ if: 'holdsItem', who: 'self', value: false }]) },
  knockOff: {
    spell: {
      ...boostWhen(50, [{ if: 'holdsItem', who: 'target', value: true }]),
      onTarget: [{ do: 'takeItems', from: 'other' }]
    }
  },
  behemothBlade: { spell: double([{ if: 'transformed', who: 'target', kinds: ['dynamax'] }]) },
  behemothBash: { spell: double([{ if: 'transformed', who: 'target', kinds: ['dynamax'] }]) },
  dynamaxCannon: { spell: double([{ if: 'transformed', who: 'target', kinds: ['dynamax'] }]) },

  // ---------- Theo địa hình ----------
  // Expanding Force: trên địa hình tâm linh (quái dùng chạm đất) ×1,5 và đánh mọi địch.
  expandingForce: {
    fieldModifiers: [
      { fieldId: 'psychicTerrain', target: 'allEnemies', requiresGroundedUser: true }
    ],
    spell: boostWhen(50, [
      { if: 'fieldActive', layer: 'terrain', fieldIds: ['psychicTerrain'] },
      { if: 'grounded', who: 'self', value: true }
    ])
  },
  risingVoltage: {
    spell: double([
      { if: 'fieldActive', layer: 'terrain', fieldIds: ['electricTerrain'] },
      { if: 'grounded', who: 'target', value: true }
    ])
  },
  psyblade: {
    spell: boostWhen(50, [{ if: 'fieldActive', layer: 'terrain', fieldIds: ['electricTerrain'] }])
  },

  // ---------- Trạng thái ngẫu nhiên ----------
  triAttack: {
    effects: [
      {
        type: 'applyRandomStatus',
        params: { statusIds: ['burn', 'paralysis', 'freeze'], chance: 20 }
      }
    ]
  },
  direClaw: {
    effects: [
      {
        type: 'applyRandomStatus',
        params: { statusIds: ['poison', 'paralysis', 'sleep'], chance: 50 }
      }
    ]
  },

  // ---------- Khắc hệ đặc biệt / hạ xuống đất ----------
  freezeDry: { effectiveness: { against: { water: 2 } } },
  flyingPress: { effectiveness: { extraElementIds: ['flying'] } },
  thousandArrows: {
    effectiveness: { against: { flying: 1 } },
    effects: [{ type: 'applyStatus', params: { statusId: 'smackedDown' } }]
  },
  smackDown: { effects: [{ type: 'applyStatus', params: { statusId: 'smackedDown' } }] },

  // ---------- Bảo vệ và đòn trả ----------
  protect: { target: 'self', effects: [protectEffect()] },
  detect: { target: 'self', effects: [protectEffect()] },
  endure: { target: 'self', effects: [protectEffect({ mode: 'endure' })] },
  kingsShield: {
    target: 'self',
    effects: [protectEffect({ blocks: 'damaging', onContact: [stageOther('attack', -1)] })]
  },
  spikyShield: {
    target: 'self',
    effects: [
      protectEffect({
        onContact: [
          { do: 'damage', to: 'other', amount: { hp: 'max', of: 'other', percent: 12.5 } }
        ]
      })
    ]
  },
  banefulBunker: {
    target: 'self',
    effects: [protectEffect({ onContact: [{ do: 'status', to: 'other', statusId: 'poison' }] })]
  },
  obstruct: {
    target: 'self',
    effects: [protectEffect({ blocks: 'damaging', onContact: [stageOther('defense', -2)] })]
  },
  silkTrap: {
    target: 'self',
    effects: [protectEffect({ blocks: 'damaging', onContact: [stageOther('speed', -1)] })]
  },
  burningBulwark: {
    target: 'self',
    effects: [
      protectEffect({
        blocks: 'damaging',
        onContact: [{ do: 'status', to: 'other', statusId: 'burn' }]
      })
    ]
  },
  counter: counterMove(2, ['physical']),
  mirrorCoat: counterMove(2, ['special']),
  metalBurst: counterMove(1.5),
  comeuppance: counterMove(1.5),

  // ---------- Chiêu nhiều lượt (ghi tay phần hàm Showdown) ----------
  skullBash: { charge: { onCharge: [selfStage('defense', 1)] } },
  meteorBeam: { charge: { onCharge: [selfStage('spAttack', 1)] }, effects: [] },
  electroShot: { charge: { onCharge: [selfStage('spAttack', 1)], skipInFieldIds: ['rain'] } },
  solarBeam: { charge: { skipInFieldIds: ['sun'] } },
  solarBlade: { charge: { skipInFieldIds: ['sun'] } },
  geomancy: { charge: {} },
  rollout: {
    lockIn: { kind: 'rollout', turns: { min: 5, max: 5 } },
    powerFormula: rolloutPower
  },
  iceBall: {
    lockIn: { kind: 'rollout', turns: { min: 5, max: 5 } },
    powerFormula: rolloutPower
  },
  uproar: { lockIn: { kind: 'uproar', turns: { min: 3, max: 3 }, blocksStatusIds: ['sleep'] } },
  furyCutter: {
    powerFormula: {
      type: 'steps',
      value: streak,
      steps: [
        { atLeast: 3, power: 160 },
        { atLeast: 2, power: 80 }
      ],
      otherwise: 40
    }
  },
  // Echoed Voice: đếm lượt liên tiếp có quái bất kỳ dùng (fieldStreak), không chỉ quái dùng.
  echoedVoice: {
    powerFormula: {
      type: 'linear',
      value: { of: 'counter', counter: { of: 'fieldStreak' } },
      times: 40,
      max: 200
    }
  },
  futureSight: { delayedTurns: 2 },
  doomDesire: { delayedTurns: 2 },
  focusPunch: {
    hold: undefined,
    chargeAtTurnStart: {},
    spell: { requires: [{ if: 'hitThisTurn', who: 'self', value: false }] }
  },
  beakBlast: {
    chargeAtTurnStart: { onContactHit: [{ do: 'status', to: 'other', statusId: 'burn' }] }
  },
  shellTrap: {
    hold: undefined,
    chargeAtTurnStart: {},
    spell: { requires: [{ if: 'hitThisTurn', who: 'self', categories: ['physical'] }] }
  },

  round: {
    spell: double([{ if: 'previousSkillThisTurn', skillIds: ['round'], sameSide: true }]),
    pullsAllySameSkill: true
  },
  // ---------- Luồng trận riêng (cụm 11–12, pokemon-moves.md) ----------
  pursuit: { pursuit: { damagePercent: 200 } },
  bide: {
    target: 'enemy',
    power: 1,
    priority: 1,
    typeless: true,
    contact: true,
    bide: { turns: 2 },
    fixedDamage: { kind: 'stored', multiplier: 2 }
  },
  skyDrop: {
    carriesTarget: { maxWeightKg: 200 },
    // Gen 6+: quái hệ Bay bị nhấc lên nhưng không mất máu.
    effectiveness: { against: { flying: 0 } }
  },
  pollenPuff: { onAlly: [{ type: 'heal', params: { percent: 50, who: 'target' } }] },
  auraWheel: { formOverrides: [{ speciesIds: ['morpekoHangry'], elementId: 'dark' }] },
  waterShuriken: {
    formOverrides: [{ speciesIds: ['greninjaAsh'], power: 20, hits: { min: 3, max: 3 } }]
  },
  teraStarstorm: {
    formOverrides: [
      {
        speciesIds: ['terapagosStellar'],
        stellar: true,
        target: 'allEnemies',
        categoryRule: 'higherAttack'
      }
    ]
  },
  // Order Up: chỉ số tăng theo dạng của Tatsugiri đang chỉ huy (Curly công, Droopy thủ, Stretchy tốc).
  orderUp: {
    spell: {
      after: [
        ['tatsugiri', 'attack'],
        ['tatsugiriDroopy', 'defense'],
        ['tatsugiriStretchy', 'speed']
      ].map(([speciesId, stat]) => ({
        do: 'stage',
        to: 'self',
        stats: [stat],
        delta: 1,
        if: [{ if: 'commanded', who: 'self', speciesIds: [speciesId] }]
      }))
    }
  },
  // Nihil Light (Legends Z-A): bỏ qua bậc chỉ số / né của mục tiêu, trúng cả hệ Tiên.
  nihilLight: { ignoresTargetStages: true, effectiveness: { against: { fairy: 1 } } },
  // Hồi máu theo thời tiết (như Showdown): nắng 2/3; mưa, bão cát, tuyết (và thời tiết cùng loại của
  // game: giông, bão tuyết, mưa tro, sương mù như thế hệ 4) 1/4; còn lại 1/2. Shore Up: bão cát 2/3.
  ...Object.fromEntries(
    ['moonlight', 'morningSun', 'synthesis'].map((id) => [
      id,
      {
        effects: [],
        spell: {
          after: weatherHeal([
            [['sun'], 66.67],
            [['rain', 'thunderstorm', 'sandstorm', 'ashfall', 'snow', 'blizzard', 'fog'], 25]
          ])
        }
      }
    ])
  ),
  shoreUp: { effects: [], spell: { after: weatherHeal([[['sandstorm', 'ashfall'], 66.67]]) } },
  relicSong: {
    spell: {
      after: [
        {
          do: 'changeForm',
          to: 'self',
          forms: { meloetta: 'meloettaPirouette' },
          toggle: true,
          untilLeave: true
        }
      ]
    }
  },
  fusionFlare: { spell: double([{ if: 'previousSkillThisTurn', skillIds: ['fusionBolt'] }]) },
  fusionBolt: { spell: double([{ if: 'previousSkillThisTurn', skillIds: ['fusionFlare'] }]) },

  // ---------- Giữ chân ----------
  meanLook: { target: 'enemy', effects: [trapTarget] },
  block: { target: 'enemy', effects: [trapTarget] },
  spiderWeb: { target: 'enemy', effects: [trapTarget] },
  thousandWaves: { effects: [trapTarget] },
  anchorShot: { effects: [trapTarget] },
  spiritShackle: { effects: [trapTarget] },
  jawLock: {
    effects: [trapTarget],
    spell: { onTarget: [{ do: 'status', to: 'self', statusId: 'cantEscape' }] }
  },
  octolock: {
    target: 'enemy',
    effects: [{ type: 'applyStatus', params: { statusId: 'octolocked' } }]
  },
  ingrain: { target: 'self', effects: [selfStatus('ingrained')] },
  aquaRing: { target: 'self', effects: [selfStatus('aquaRing')] },
  noRetreat: {
    effects: [
      ...['attack', 'defense', 'spAttack', 'spDefense', 'speed'].map((stat) => ({
        type: 'statStage',
        params: { who: 'self', stat, delta: 1 }
      })),
      selfStatus('noRetreat')
    ]
  },

  // ---------- Đồ cầm ----------
  thief: { spell: { onTarget: [stealItems] } },
  covet: { spell: { onTarget: [stealItems] } },
  corrosiveGas: { spell: { onTarget: [{ do: 'takeItems', from: 'other' }] } },
  incinerate: {
    spell: { onTarget: [{ do: 'takeItems', from: 'other', tags: ['berry'], consume: true }] }
  },
  bugBite: { spell: { onTarget: [{ do: 'eatItems', from: 'other', tags: ['berry'] }] } },
  pluck: { spell: { onTarget: [{ do: 'eatItems', from: 'other', tags: ['berry'] }] } },
  trick: { target: 'enemy', spell: { after: [{ do: 'swapItems', with: 'other' }] } },
  switcheroo: { target: 'enemy', spell: { after: [{ do: 'swapItems', with: 'other' }] } },
  bestow: {
    target: 'enemy',
    spell: {
      requires: [
        { if: 'holdsItem', who: 'self', value: true },
        { if: 'holdsItem', who: 'target', value: false }
      ],
      after: [{ do: 'swapItems', with: 'other' }]
    }
  },
  recycle: { target: 'self', spell: { after: [{ do: 'recycleItem', to: 'self' }] } },
  belch: {
    spell: { requires: [{ if: 'counterAtLeast', counter: { of: 'berriesEaten' }, min: 1 }] }
  },
  stuffCheeks: {
    target: 'self',
    effects: [{ type: 'statStage', params: { who: 'self', stat: 'defense', delta: 2 } }],
    spell: {
      requires: [{ if: 'holdsItem', who: 'self', value: true, tags: ['berry'] }],
      after: [{ do: 'eatItems', from: 'self', tags: ['berry'] }]
    }
  },
  fling: {
    powerFormula: {
      type: 'linear',
      value: { of: 'heldItem', field: 'flingPower', who: 'self' },
      times: 1
    },
    spell: {
      // Không cầm gì thì thất bại như Pokémon.
      requires: [{ if: 'holdsItem', who: 'self', value: true }],
      after: [
        { do: 'takeItems', from: 'self', firstWith: 'flingPower', consume: true, flingTo: 'other' }
      ]
    }
  },
  naturalGift: {
    elementFromHeldItem: true,
    powerFormula: {
      type: 'linear',
      value: { of: 'heldItem', field: 'naturalGiftPower', who: 'self' },
      times: 1
    },
    spell: {
      requires: [{ if: 'holdsItem', who: 'self', value: true, tags: ['berry'] }],
      after: [{ do: 'takeItems', from: 'self', firstWith: 'naturalGift', consume: true }]
    }
  },
  embargo: { target: 'enemy', effects: [{ type: 'applyStatus', params: { statusId: 'embargo' } }] },

  // ---------- Ép đổi quái ----------
  // Roar của game trước đây quy đổi thành −1 công mọi địch; gốc: đẩy một địch ra, priority −6.
  roar: { target: 'enemy', priority: -6, effects: [{ type: 'forceSwitch', params: {} }] },
  whirlwind: { target: 'enemy', priority: -6, effects: [{ type: 'forceSwitch', params: {} }] },

  // ---------- Chiêu trạng thái (cụm 10) ----------
  acupressure: {
    target: 'self',
    spell: { after: [{ do: 'randomStage', to: 'self', stats: ALL_STAGES, delta: 2 }] }
  },
  afterYou: {
    target: 'enemy',
    spell: { after: [{ do: 'timeline', to: 'other', position: 'top' }] }
  },
  quash: {
    target: 'enemy',
    spell: { after: [{ do: 'timeline', to: 'other', position: 'bottom' }] }
  },
  allySwitch: {
    target: 'self',
    priority: 2,
    spell: { after: [{ do: 'swapPositions', with: 'allies' }] }
  },
  attract: {
    target: 'enemy',
    effects: [statusOn('infatuated')],
    spell: { requires: [{ if: 'oppositeGender', who: 'target' }] }
  },
  bellyDrum: {
    target: 'self',
    selfDamagePercent: 50,
    effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 12 } }],
    spell: { requires: [{ if: 'hpAbove', who: 'self', percent: 50 }] }
  },
  conversion: {
    target: 'self',
    spell: { after: [{ do: 'identity', to: 'self', elementFromFirstSkill: true }] }
  },
  conversion2: {
    target: 'enemy',
    spell: { after: [{ do: 'identity', to: 'self', resistLastSkillOfOther: true }] }
  },
  copycat: { target: 'enemy', spell: { after: [{ do: 'cast', lastOf: 'battle', to: 'other' }] } },
  mirrorMove: { target: 'enemy', spell: { after: [{ do: 'cast', lastOf: 'other', to: 'other' }] } },
  meFirst: {
    target: 'enemy',
    spell: {
      requires: [{ if: 'pendingSkill', who: 'target', categories: ['physical', 'special'] }],
      after: [{ do: 'cast', pendingOf: 'other', to: 'other', damagePercent: 150 }]
    }
  },
  instruct: {
    target: 'enemy',
    spell: { after: [{ do: 'cast', lastOf: 'other', by: 'other' }] }
  },
  assist: {
    target: 'self',
    spell: { after: [{ do: 'cast', pool: 'party', excludeSkillIds: NOT_CALLABLE }] }
  },
  sleepTalk: {
    target: 'self',
    usableWhileStatusIds: ['sleep'],
    spell: {
      requires: [{ if: 'hasStatus', who: 'self', statusIds: ['sleep'] }],
      after: [{ do: 'cast', pool: 'own', excludeCharge: true, excludeSkillIds: NOT_CALLABLE }]
    }
  },
  snore: {
    usableWhileStatusIds: ['sleep'],
    spell: { requires: [{ if: 'hasStatus', who: 'self', statusIds: ['sleep'] }] }
  },
  naturePower: {
    target: 'enemy',
    spell: {
      after: [
        {
          do: 'cast',
          to: 'other',
          skillId: 'triAttack',
          byField: {
            grassyTerrain: 'energyBall',
            electricTerrain: 'thunderbolt',
            mistyTerrain: 'moonblast',
            psychicTerrain: 'psychic'
          }
        }
      ]
    }
  },
  curse: {
    target: 'enemy',
    spell: {
      after: [
        // Không phải hệ Ma: −1 tốc độ, +1 công, +1 thủ; hệ Ma: mất ½ máu, nguyền mục tiêu.
        { do: 'stage', to: 'self', stats: ['speed'], delta: -1, if: [notGhost] },
        { do: 'stage', to: 'self', stats: ['attack', 'defense'], delta: 1, if: [notGhost] },
        {
          do: 'damage',
          to: 'self',
          amount: { hp: 'max', of: 'self', percent: 50 },
          if: [isGhost]
        },
        { do: 'status', to: 'other', statusId: 'curse', if: [isGhost] }
      ]
    }
  },
  destinyBond: { target: 'self', spell: { after: [{ do: 'markVolatile', mark: 'destinyBond' }] } },
  grudge: { target: 'self', spell: { after: [{ do: 'markVolatile', mark: 'grudge' }] } },
  magicCoat: {
    target: 'self',
    priority: 4,
    spell: { after: [{ do: 'markVolatile', mark: 'magicCoat' }] }
  },
  snatch: {
    target: 'self',
    priority: 4,
    spell: { after: [{ do: 'markVolatile', mark: 'snatch' }] }
  },
  disable: { target: 'enemy', spell: { after: [{ do: 'disableSkill', to: 'other', turns: 4 }] } },
  // Spite: game không có PP, quy đổi thành khóa skill gần nhất 2 lượt.
  spite: { target: 'enemy', spell: { after: [{ do: 'disableSkill', to: 'other', turns: 2 }] } },
  encore: { target: 'enemy', spell: { after: [{ do: 'encore', to: 'other', turns: 3 }] } },
  doodle: { target: 'enemy', spell: { after: [{ do: 'setAbility', to: 'side', from: 'other' }] } },
  entrainment: {
    target: 'enemy',
    spell: { after: [{ do: 'setAbility', to: 'other', from: 'self' }] }
  },
  rolePlay: {
    target: 'enemy',
    spell: { after: [{ do: 'setAbility', to: 'self', from: 'other' }] }
  },
  skillSwap: { target: 'enemy', spell: { after: [{ do: 'swapAbilities', with: 'other' }] } },
  worrySeed: {
    target: 'enemy',
    spell: { after: [{ do: 'setAbility', to: 'other', abilityId: 'insomnia' }] }
  },
  simpleBeam: {
    target: 'enemy',
    spell: { after: [{ do: 'setAbility', to: 'other', abilityId: 'simple' }] }
  },
  gastroAcid: { target: 'enemy', spell: { after: [{ do: 'suppressAbility', to: 'other' }] } },
  coreEnforcer: {
    spell: {
      onTarget: [
        {
          do: 'suppressAbility',
          to: 'other',
          if: [{ if: 'actedThisTurn', who: 'target', value: true }]
        }
      ]
    }
  },
  electrify: { target: 'enemy', effects: [statusOn('electrified')] },
  floralHealing: {
    target: 'ally',
    spell: {
      after: [
        { ...healOther(75), if: [grassy] },
        { ...healOther(50), if: [{ if: 'not', condition: grassy }] }
      ]
    }
  },
  healPulse: { target: 'ally', spell: { after: [healOther(50)] } },
  followMe: { target: 'self', priority: 2, spell: { after: [{ do: 'provoke', to: 'self' }] } },
  ragePowder: { target: 'self', priority: 2, spell: { after: [{ do: 'provoke', to: 'self' }] } },
  spotlight: { target: 'enemy', priority: 3, spell: { after: [{ do: 'provoke', to: 'other' }] } },
  foresight: { target: 'enemy', effects: [statusOn('identified')] },
  odorSleuth: { target: 'enemy', effects: [statusOn('identified')] },
  miracleEye: { target: 'enemy', effects: [statusOn('miracleEyed')] },
  forestsCurse: {
    target: 'enemy',
    spell: { after: [{ do: 'identity', to: 'other', addElementIds: ['grass'] }] }
  },
  trickOrTreat: {
    target: 'enemy',
    spell: { after: [{ do: 'identity', to: 'other', addElementIds: ['ghost'] }] }
  },
  soak: {
    target: 'enemy',
    spell: { after: [{ do: 'identity', to: 'other', elementIds: ['water'] }] }
  },
  magicPowder: {
    target: 'enemy',
    spell: { after: [{ do: 'identity', to: 'other', elementIds: ['psychic'] }] }
  },
  reflectType: {
    target: 'enemy',
    spell: { after: [{ do: 'identity', to: 'self', elementFrom: 'other' }] }
  },
  grassWhistle: { target: 'enemy', effects: [statusOn('sleep')] },
  guardSplit: {
    target: 'enemy',
    spell: { after: [{ do: 'averageStats', with: 'other', stats: ['defense', 'spDefense'] }] }
  },
  powerSplit: {
    target: 'enemy',
    spell: { after: [{ do: 'averageStats', with: 'other', stats: ['attack', 'spAttack'] }] }
  },
  guardSwap: {
    target: 'enemy',
    spell: { after: [{ do: 'swapStages', with: 'other', stats: ['defense', 'spDefense'] }] }
  },
  powerSwap: {
    target: 'enemy',
    spell: { after: [{ do: 'swapStages', with: 'other', stats: ['attack', 'spAttack'] }] }
  },
  heartSwap: { target: 'enemy', spell: { after: [{ do: 'swapStages', with: 'other' }] } },
  speedSwap: {
    target: 'enemy',
    spell: { after: [{ do: 'swapStats', with: 'other', stats: ['speed'] }] }
  },
  powerTrick: {
    target: 'self',
    spell: { after: [{ do: 'swapOwnStats', to: 'self', stats: ['attack', 'defense'] }] }
  },
  // Power Shift (thế hệ 9): như Power Trick.
  powerShift: {
    target: 'self',
    spell: { after: [{ do: 'swapOwnStats', to: 'self', stats: ['attack', 'defense'] }] }
  },
  psychUp: { target: 'enemy', spell: { after: [{ do: 'copyStages', to: 'self', from: 'other' }] } },
  topsyTurvy: { target: 'enemy', spell: { after: [{ do: 'invertStages', to: 'other' }] } },
  painSplit: { target: 'enemy', spell: { after: [{ do: 'shareHp', with: 'other' }] } },
  healBlock: { target: 'allEnemies', effects: [statusOn('healBlocked')] },
  psychicNoise: {
    effects: [{ type: 'applyStatus', params: { statusId: 'healBlocked', turns: 2 } }]
  },
  healingWish: {
    target: 'self',
    selfFaint: 'always',
    spell: { after: [{ do: 'healReplacement', to: 'self' }] }
  },
  lunarDance: {
    target: 'self',
    selfFaint: 'always',
    spell: { after: [{ do: 'healReplacement', to: 'self' }] }
  },
  helpingHand: { target: 'ally', priority: 5, effects: [statusOn('helped')] },
  imprison: { target: 'self', effects: [statusOn('imprisoning')] },
  laserFocus: { target: 'self', effects: [statusOn('laserFocused')] },
  lockOn: { target: 'self', effects: [statusOn('lockedOn')] },
  mindReader: { target: 'self', effects: [statusOn('lockedOn')] },
  magnetRise: { target: 'self', effects: [statusOn('magnetRise')] },
  telekinesis: { target: 'enemy', effects: [statusOn('telekinesis')] },
  powder: { target: 'enemy', priority: 1, effects: [statusOn('powdered')] },
  mimic: { target: 'enemy', spell: { after: [{ do: 'learnSkill', to: 'self' }] } },
  sketch: {
    target: 'enemy',
    spell: { after: [{ do: 'learnSkill', to: 'self', permanent: true }] }
  },
  transform: {
    target: 'enemy',
    spell: { after: [{ do: 'transformInto', to: 'self', from: 'other' }] }
  },
  metronome: {
    target: 'self',
    spell: { after: [{ do: 'cast', skillIds: METRONOME_POOL }] }
  },
  nightmare: {
    target: 'enemy',
    effects: [statusOn('nightmare')],
    spell: { requires: [{ if: 'hasStatus', who: 'target', statusIds: ['sleep'] }] }
  },
  yawn: {
    target: 'enemy',
    effects: [statusOn('drowsy')],
    spell: { requires: [{ if: 'lacksStatus', who: 'target', statusIds: ['sleep'] }] }
  },
  psychoShift: {
    target: 'enemy',
    spell: { after: [{ do: 'moveStatuses', from: 'self', to: 'other', kind: 'debuff' }] }
  },
  purify: {
    target: 'enemy',
    spell: {
      requires: [{ if: 'statusCount', who: 'target', kind: 'debuff', min: 1 }],
      after: [
        { do: 'cure', to: 'other', kind: 'debuff', statusIds: MAJOR_STATUSES },
        { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 50 } }
      ]
    }
  },
  rest: {
    target: 'self',
    spell: {
      requires: [{ if: 'hpBelow', who: 'self', percent: 100 }],
      after: [
        { do: 'cure', to: 'self', kind: 'debuff', statusIds: MAJOR_STATUSES },
        { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 100 } },
        { do: 'status', to: 'self', statusId: 'sleep', turns: 2 }
      ]
    }
  },
  revivalBlessing: {
    target: 'self',
    spell: { after: [{ do: 'revive', to: 'faintedAlly', hpPercent: 50 }] }
  },
  stockpile: {
    target: 'self',
    spell: {
      requires: [{ if: 'counterBelow', counter: { of: 'stockpile' }, max: 3 }],
      after: [
        { do: 'stockpile', to: 'self', change: 'add' },
        { do: 'stage', to: 'self', stats: ['defense', 'spDefense'], delta: 1 }
      ]
    }
  },
  spitUp: {
    powerFormula: { type: 'linear', value: stockpiled, times: 100 },
    spell: {
      requires: [{ if: 'counterAtLeast', counter: { of: 'stockpile' }, min: 1 }],
      after: [{ do: 'stockpile', to: 'self', change: 'reset' }]
    }
  },
  swallow: {
    target: 'self',
    spell: {
      requires: [{ if: 'counterAtLeast', counter: { of: 'stockpile' }, min: 1 }],
      after: [
        swallowHeal(25, 1),
        swallowHeal(50, 2),
        swallowHeal(100, 3),
        { do: 'stockpile', to: 'self', change: 'reset' }
      ]
    }
  },
  strengthSap: {
    target: 'enemy',
    spell: {
      after: [
        { do: 'heal', to: 'self', amount: { stat: 'attack', of: 'other', percent: 100 } },
        { do: 'stage', to: 'other', stats: ['attack'], delta: -1 }
      ]
    }
  },
  venomDrench: {
    target: 'allEnemies',
    spell: {
      onTarget: [
        {
          do: 'stage',
          to: 'other',
          stats: ['attack', 'spAttack', 'speed'],
          delta: -1,
          if: [{ if: 'hasStatus', who: 'target', statusIds: ['poison', 'badPoison'] }]
        }
      ]
    }
  },
  torment: { target: 'enemy', effects: [statusOn('tormented')] },
  wish: { target: 'self', delayedTurns: 1, delayedHealPercent: 50 },

  camouflage: {
    target: 'self',
    spell: {
      after: [
        ...[
          ['grassyTerrain', 'grass'],
          ['electricTerrain', 'electric'],
          ['mistyTerrain', 'fairy'],
          ['psychicTerrain', 'psychic']
        ].map(([fieldId, elementId]) => ({
          do: 'identity',
          to: 'self',
          elementIds: [elementId],
          if: [{ if: 'fieldActive', layer: 'terrain', fieldIds: [fieldId] }]
        })),
        {
          do: 'identity',
          to: 'self',
          elementIds: ['normal'],
          if: [{ if: 'not', condition: { if: 'fieldActive', layer: 'terrain' } }]
        }
      ]
    }
  },
  refresh: {
    target: 'self',
    spell: {
      after: [
        {
          do: 'cure',
          to: 'self',
          kind: 'debuff',
          statusIds: ['burn', 'paralysis', 'poison', 'badPoison']
        }
      ]
    }
  },
  // Frustration: power = (255 − thân mật) × 10 / 25, quy theo % thân mật của game.
  frustration: {
    powerFormula: {
      type: 'linear',
      value: { of: 'affinityPercent', who: 'self' },
      times: -1.02,
      plus: 102
    }
  },

  // ---------- Còn lại trong `plain` (cụm 11) ----------
  // Bỏ "chờ lượt" (hold) game tự thêm cho chiêu mạnh: nay có cơ chế gốc (phản lực, máu, nạp).
  ...Object.fromEntries(
    [
      'chloroblast',
      'dragonEnergy',
      'eruption',
      'headSmash',
      'mindBlown',
      'vCreate',
      'waterSpout'
    ].map((id) => [id, { hold: undefined }])
  ),
  throatChop: { effects: [statusOn('throatChopped')] },
  saltCure: { effects: [statusOn('saltCure')] },
  // Leech Seed: trạng thái `seeded` (mất ⅛ máu cuối lượt, hồi cho quái gieo; hệ Cỏ miễn).
  leechSeed: { effects: [statusOn('seeded')] },
  // Minimize: trạng thái `minimized` (tới khi rời sân) cùng +2 né; các đòn đạp / đè luôn trúng và ×2
  // sát thương lên quái đã Minimize (bảng của Showdown).
  minimize: {
    effects: [
      { type: 'statStage', params: { who: 'self', stat: 'evasion', delta: 2 } },
      { type: 'applyStatus', params: { statusId: 'minimized' } }
    ]
  },
  // Chiêu Let's Go (số thế hệ 9 của Showdown).
  sappySeed: { effects: [statusOn('seeded')] },
  bouncyBubble: { effects: [{ type: 'drain', params: { percent: 50 } }] },
  glitzyGlow: {
    effects: [{ type: 'setSideField', params: { side: 'own', fieldId: 'lightScreen' } }]
  },
  baddyBad: { effects: [{ type: 'setSideField', params: { side: 'own', fieldId: 'reflect' } }] },
  freezyFrost: { effects: [{ type: 'resetStages', params: {} }] },
  sparklySwirl: { effects: [{ type: 'cureTeamStatus', params: {} }] },
  pikaPapow: {
    power: 1,
    powerFormula: { type: 'linear', value: { of: 'affinityPercent', who: 'self' }, times: 1.02 }
  },
  veeveeVolley: {
    power: 1,
    powerFormula: { type: 'linear', value: { of: 'affinityPercent', who: 'self' }, times: 1.02 }
  },
  syrupBomb: { effects: [statusOn('syrupy')] },
  burnUp: {
    spell: {
      requires: [{ if: 'element', who: 'self', elementIds: ['fire'] }],
      after: [{ do: 'identity', to: 'self', removeElementIds: ['fire'] }]
    }
  },
  doubleShock: {
    spell: {
      requires: [{ if: 'element', who: 'self', elementIds: ['electric'] }],
      after: [{ do: 'identity', to: 'self', removeElementIds: ['electric'] }]
    }
  },
  fellStinger: {
    spell: {
      onTarget: [
        {
          do: 'stage',
          to: 'self',
          stats: ['attack'],
          delta: 3,
          if: [{ if: 'fainted', who: 'other' }]
        }
      ]
    }
  },
  brickBreak: { breaksScreens: true },
  psychicFangs: { breaksScreens: true },
  sparklingAria: { curesTargetStatuses: ['burn'] },
  stoneAxe: {
    effects: [{ type: 'setSideField', params: { side: 'foe', fieldId: 'stealthRock' } }]
  },
  ceaselessEdge: {
    effects: [{ type: 'setSideField', params: { side: 'foe', fieldId: 'spikes' } }]
  },
  flameBurst: {
    spell: {
      onTarget: [
        { do: 'damage', to: 'otherFoes', amount: { hp: 'max', of: 'other', percent: 6.25 } }
      ]
    }
  },
  snipeShot: { ignoresRedirect: true },
  glaiveRush: { spell: { after: [{ do: 'status', to: 'self', statusId: 'glaiveRushed' }] } },
  clearSmog: { spell: { onTarget: [{ do: 'restoreStages', to: 'other', all: true }] } },
  synchronoise: { spell: { requires: [{ if: 'sameElement', who: 'target' }] } },
  secretPower: {
    spell: {
      onTarget: [
        ...[
          ['grassyTerrain', { do: 'status', to: 'other', statusId: 'sleep' }],
          ['electricTerrain', { do: 'status', to: 'other', statusId: 'paralysis' }],
          ['mistyTerrain', { do: 'stage', to: 'other', stats: ['spAttack'], delta: -1 }],
          ['psychicTerrain', { do: 'stage', to: 'other', stats: ['speed'], delta: -1 }]
        ].map(([fieldId, effect]) => ({
          ...effect,
          chance: 30,
          if: [{ if: 'fieldActive', layer: 'terrain', fieldIds: [fieldId] }]
        })),
        {
          do: 'status',
          to: 'other',
          statusId: 'paralysis',
          chance: 30,
          if: [{ if: 'not', condition: { if: 'fieldActive', layer: 'terrain' } }]
        }
      ]
    }
  },
  collisionCourse: {
    spell: { powerBonus: [{ percent: 100 / 3, when: [{ if: 'superEffective' }] }] }
  },
  electroDrift: {
    spell: { powerBonus: [{ percent: 100 / 3, when: [{ if: 'superEffective' }] }] }
  },
  // Hydro Steam: nắng không giảm mà còn ×1,5 (nắng giảm Nước ½ nên power ×3 khi nắng).
  hydroSteam: { fieldModifiers: [{ fieldId: 'sun', powerMultiplier: 3 }] },
  grassyGlide: { fieldModifiers: [{ fieldId: 'grassyTerrain', priority: 1 }] },

  // Power ngẫu nhiên (số gốc; Present 20% hồi máu mục tiêu ¼: quy đổi thành không gây gì).
  present: {
    randomPower: [
      { power: 40, weight: 40 },
      { power: 80, weight: 30 },
      { power: 120, weight: 10 },
      { power: 0, weight: 20 }
    ]
  },
  magnitude: {
    randomPower: [
      { power: 10, weight: 5 },
      { power: 30, weight: 10 },
      { power: 50, weight: 20 },
      { power: 70, weight: 30 },
      { power: 90, weight: 20 },
      { power: 110, weight: 10 },
      { power: 150, weight: 5 }
    ]
  },
  fickleBeam: {
    randomPower: [
      { power: 80, weight: 70 },
      { power: 160, weight: 30 }
    ]
  },
  // Hệ theo dạng của loài (đĩa / bộ nhớ / mặt nạ theo dạng).
  revelationDance: { elementFromUser: 'first' },
  judgment: { elementFromUser: 'first' },
  multiAttack: { elementFromUser: 'first' },
  ragingBull: { breaksScreens: true, elementFromUser: 'first' },
  ivyCudgel: { elementFromUser: 'last' },
  rage: { spell: { after: [{ do: 'status', to: 'self', statusId: 'raging' }] } },
  plasmaFists: { effects: [{ type: 'setRoom', params: { fieldId: 'ionDeluge' } }] },
  // Beat Up: mỗi đồng đội còn sống một đòn ~13 power (công gốc / 10 + 5) → power 13 × số quái.
  beatUp: { power: 13, spell: { powerTimes: { of: 'livingAllies' } } },

  lastResort: { spell: { requires: [{ if: 'usedOtherSkills', who: 'self' }] } },
  retaliate: { spell: double([{ if: 'allyFaintedLastTurn', who: 'self' }]) },
  // Trump Card: power theo PP còn sau lần dùng (5 PP: 40, 50, 60, 80, 200); game không có PP nên
  // theo số lần đã dùng trong trận, từ lần thứ 5 giữ 200.
  trumpCard: steps(
    { of: 'counter', counter: { of: 'skillUses' } },
    [
      { below: 1, power: 40 },
      { below: 2, power: 50 },
      { below: 3, power: 60 },
      { below: 4, power: 80 }
    ],
    200
  ),

  spectralThief: { stealsBoosts: true },
  guardianOfAlola: { fixedDamage: { kind: 'targetHpPercent', percent: 75 } },
  // Techno Blast: hệ theo Drive đang cầm (items.json `skillElement`).
  technoBlast: { elementFromHeldItem: true },
  hiddenPower: { elementFromGenes: true },
  // Pledge kết hợp: đồng đội vừa dùng Pledge khác trong lượt thì power 150 và tạo hiệu ứng theo
  // phe (Lửa sau Cỏ: Sea of Fire; Cỏ sau Nước: Swamp; Nước sau Lửa: Rainbow). Lệch gốc: chiêu
  // Pledge của đồng đội vẫn đánh riêng (gốc: hai chiêu gộp làm một).
  firePledge: {
    spell: {
      powerBonus: [{ percent: 87.5, when: [comboAfter(['grassPledge'])] }],
      after: [
        {
          do: 'placeSideField',
          side: 'foe',
          fieldId: 'seaOfFire',
          if: [comboAfter(['grassPledge'])]
        }
      ]
    }
  },
  grassPledge: {
    spell: {
      powerBonus: [{ percent: 87.5, when: [comboAfter(['waterPledge'])] }],
      after: [
        { do: 'placeSideField', side: 'foe', fieldId: 'swamp', if: [comboAfter(['waterPledge'])] }
      ]
    }
  },
  waterPledge: {
    spell: {
      powerBonus: [{ percent: 87.5, when: [comboAfter(['firePledge'])] }],
      after: [
        { do: 'placeSideField', side: 'own', fieldId: 'rainbow', if: [comboAfter(['firePledge'])] }
      ]
    }
  },
  // Gear Up / Magnetic Flux: phe mình, chỉ quái có ability Plus / Minus.
  gearUp: {
    target: 'self',
    effects: [],
    spell: {
      after: [
        {
          do: 'stage',
          to: 'side',
          stats: ['attack', 'spAttack'],
          delta: 1,
          if: [{ if: 'hasAbility', who: 'target', abilityIds: ['plus', 'minus'] }]
        }
      ]
    }
  },
  magneticFlux: {
    target: 'self',
    effects: [],
    spell: {
      after: [
        {
          do: 'stage',
          to: 'side',
          stats: ['defense', 'spDefense'],
          delta: 1,
          if: [{ if: 'hasAbility', who: 'target', abilityIds: ['plus', 'minus'] }]
        }
      ]
    }
  },

  // Cụm 12 (rà callback Showdown còn thiếu, 2026-10-30).
  barbBarrage: {
    spell: double([{ if: 'hasStatus', who: 'target', statusIds: ['poison', 'badPoison'] }])
  },
  infernalParade: {
    spell: double([{ if: 'hasStatus', who: 'target', statusIds: MAJOR_STATUSES }])
  },
  gravApple: { fieldModifiers: [{ fieldId: 'gravity', powerMultiplier: 1.5 }] },
  tripleAxel: { escalatingHits: true },
  tripleKick: { escalatingHits: true },

  // ---------- Power theo công thức ----------
  eruption: linear(hpOf('self'), 1.5),
  waterSpout: linear(hpOf('self'), 1.5),
  dragonEnergy: linear(hpOf('self'), 1.5),
  crushGrip: linear(hpOf('target'), 1.2),
  wringOut: linear(hpOf('target'), 1.2),
  hardPress: linear(hpOf('target'), 1),
  flail: steps(hpOf('self'), FLAIL_STEPS, 20),
  reversal: steps(hpOf('self'), FLAIL_STEPS, 20),
  gyroBall: linear(ratio(speedOf('target'), speedOf('self')), 25, { plus: 1, max: 150 }),
  electroBall: steps(ratio(speedOf('self'), speedOf('target')), ELECTRO_STEPS, 40),
  grassKnot: { ...steps(weightOf('target'), WEIGHT_STEPS, 20), spell: notDynamaxTarget },
  lowKick: { ...steps(weightOf('target'), WEIGHT_STEPS, 20), spell: notDynamaxTarget },
  heavySlam: {
    ...steps(ratio(weightOf('self'), weightOf('target')), WEIGHT_RATIO_STEPS, 40),
    spell: notDynamaxTarget
  },
  heatCrash: {
    ...steps(ratio(weightOf('self'), weightOf('target')), WEIGHT_RATIO_STEPS, 40),
    spell: notDynamaxTarget
  },
  storedPower: linear({ of: 'positiveStages', who: 'self' }, 20, { plus: 20 }),
  powerTrip: linear({ of: 'positiveStages', who: 'self' }, 20, { plus: 20 }),
  punishment: linear({ of: 'positiveStages', who: 'target' }, 20, { plus: 60, max: 200 }),
  lastRespects: linear({ of: 'counter', counter: { of: 'faintedAllies' } }, 50, { plus: 50 }),
  rageFist: linear({ of: 'counter', counter: { of: 'timesDamaged' } }, 50, { plus: 50, max: 350 }),
  // Return: power = thân mật × 10 / 25 (tối đa 102 ở thân mật tối đa), quy theo % thân mật của game.
  return: linear({ of: 'affinityPercent', who: 'self' }, 1.02),

  // ---------- Hiệu ứng khi mục tiêu vừa tăng bậc ----------
  alluringVoice: {
    spell: {
      onTarget: [
        {
          do: 'status',
          to: 'other',
          statusId: 'confusion',
          if: [{ if: 'statsChangedThisTurn', who: 'target', direction: 'raised' }]
        }
      ]
    }
  },
  burningJealousy: {
    spell: {
      onTarget: [
        {
          do: 'status',
          to: 'other',
          statusId: 'burn',
          if: [{ if: 'statsChangedThisTurn', who: 'target', direction: 'raised' }]
        }
      ]
    }
  }
}

const skills = JSON.parse(readFileSync(SKILLS, 'utf8'))
const byId = new Map(skills.map((skill) => [skill.id, skill]))
const showdownMoves = await fetchShowdown('moves.js')

// Đông lạnh (docs/rules/battle-statuses.md): chiêu gốc có hiệu ứng phụ đông lạnh thì gây `freeze`
// cùng tỉ lệ; cờ `defrost` (Flame Wheel...) rã đông quái dùng, `thawsTarget` (Scald...) rã đông mục tiêu.
let freezeMoves = 0
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string') continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  delete skill.curesUserStatuses
  delete skill.curesTargetStatuses
  if (move.flags?.defrost) skill.curesUserStatuses = ['freeze']
  if (move.thawsTarget) skill.curesTargetStatuses = ['freeze']
  const freeze = [move.secondary, ...(move.secondaries ?? [])].find((s) => s?.status === 'frz')
  skill.effects = skill.effects.filter(
    (e) => !(e.type === 'applyStatus' && e.params.statusId === 'freeze')
  )
  if (!freeze || skill.power <= 0) continue
  const params =
    freeze.chance && freeze.chance < 100
      ? { statusId: 'freeze', chance: freeze.chance }
      : { statusId: 'freeze' }
  skill.effects.push({ type: 'applyStatus', params })
  freezeMoves++
}
console.log(`Chiêu gây đông lạnh: ${freezeMoves}`)

// Chỉ số thay thế / bỏ qua bậc / bỏ qua ability theo trường của Showdown (cụm 3, pokemon-moves.md).
const STAT_BY_SHOWDOWN = {
  atk: 'attack',
  def: 'defense',
  spa: 'spAttack',
  spd: 'spDefense',
  spe: 'speed'
}
const MECHANIC_FIELDS = [
  'attackFrom',
  'defenseStat',
  'categoryRule',
  'ignoresTargetStages',
  'ignoresAbility'
]
let statMoves = 0
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string') continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  for (const field of MECHANIC_FIELDS) delete skill[field]
  const offensive = STAT_BY_SHOWDOWN[move.overrideOffensiveStat]
  if (offensive || move.overrideOffensivePokemon === 'target') {
    skill.attackFrom = {
      who: move.overrideOffensivePokemon === 'target' ? 'target' : 'self',
      stat: offensive ?? (move.category === 'Special' ? 'spAttack' : 'attack')
    }
  }
  const defensive = STAT_BY_SHOWDOWN[move.overrideDefensiveStat]
  if (defensive) skill.defenseStat = defensive
  if (move.ignoreDefensive || move.ignoreEvasion) skill.ignoresTargetStages = true
  if (move.ignoreAbility) skill.ignoresAbility = true
  if (skill.attackFrom || skill.defenseStat || skill.ignoresTargetStages || skill.ignoresAbility) {
    statMoves++
  }
}
// Loại đòn lúc đánh: hàm xử lý của Showdown không có trong bản client nên ghi tay.
for (const [id, rule] of [
  ['photonGeyser', 'higherAttack'],
  ['lightThatBurnsTheSky', 'higherAttack'],
  ['shellSideArm', 'betterRatio']
]) {
  const skill = byId.get(id)
  if (skill) skill.categoryRule = rule
}
console.log(`Chiêu chỉ số thay thế / bỏ qua bậc / ability: ${statMoves}`)

// Sát thương cố định / tự gục / hụt mất máu theo trường của Showdown (cụm 4, pokemon-moves.md).
const SELF_COST_FIELDS = ['fixedDamage', 'selfFaint', 'crashDamagePercent', 'selfDamagePercent']
let costMoves = 0
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string') continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  for (const field of SELF_COST_FIELDS) delete skill[field]
  if (move.damage === 'level') skill.fixedDamage = { kind: 'level' }
  else if (typeof move.damage === 'number')
    skill.fixedDamage = { kind: 'flat', amount: move.damage }
  if (move.ohko) {
    skill.fixedDamage = { kind: 'ohko' }
    // Sheer Cold: hệ Băng miễn; quái dùng không mang hệ Băng thì accuracy gốc 20.
    if (move.ohko === 'Ice') {
      skill.fixedDamage.immuneElementIds = ['ice']
      skill.fixedDamage.accuracyIfNotElement = { elementId: 'ice', accuracy: 20 }
    }
  }
  if (move.selfdestruct) skill.selfFaint = move.selfdestruct === 'ifHit' ? 'onHit' : 'always'
  if (move.hasCrashDamage) skill.crashDamagePercent = 50
  if (move.mindBlownRecoil) skill.selfDamagePercent = 50
  if (SELF_COST_FIELDS.some((field) => skill[field] !== undefined)) costMoves++
}
// Hàm damageCallback / onDamage của Showdown không có trong bản client nên ghi tay.
const MANUAL_COSTS = {
  superFang: { fixedDamage: { kind: 'targetHpPercent', percent: 50 } },
  naturesMadness: { fixedDamage: { kind: 'targetHpPercent', percent: 50 } },
  ruination: { fixedDamage: { kind: 'targetHpPercent', percent: 50 } },
  endeavor: { fixedDamage: { kind: 'hpDifference' } },
  finalGambit: { fixedDamage: { kind: 'userHp' } },
  psywave: { fixedDamage: { kind: 'level', minPercent: 50, maxPercent: 150 } },
  chloroblast: { selfDamagePercent: 50 },
  falseSwipe: { leavesOneHp: true },
  holdBack: { leavesOneHp: true }
}
for (const [id, fields] of Object.entries(MANUAL_COSTS)) {
  const skill = byId.get(id)
  if (skill) Object.assign(skill, fields)
}
console.log(`Chiêu sát thương cố định / chi phí tự thân: ${costMoves}`)

// Tiếp xúc / phá bảo vệ / xuyên bảo vệ theo cờ của Showdown (cụm 5, pokemon-moves.md).
let contactMoves = 0
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string' || move.isMax || move.isZ) continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  delete skill.contact
  delete skill.breaksProtect
  if (move.flags?.contact) {
    skill.contact = true
    contactMoves++
  }
  if (move.breaksProtect) skill.breaksProtect = true
}
console.log(`Chiêu tiếp xúc: ${contactMoves}`)

// Chiêu nhiều lượt theo cờ của Showdown (cụm 6, pokemon-moves.md): nạp (`flags.charge`), nghỉ
// (`self.volatileStatus: mustrecharge`), khóa (`lockedmove`). Power về số gốc (trước đây giảm để bù
// lượt nạp / nghỉ).
const MULTI_TURN_FIELDS = ['charge', 'recharge', 'lockIn', 'hitsInvulnerable', 'delayedTurns']
const INVULNERABLE_BY_MOVE = {
  fly: 'air',
  bounce: 'air',
  skyDrop: 'air',
  dig: 'underground',
  dive: 'underwater',
  phantomForce: 'vanished',
  shadowForce: 'vanished'
}
let multiTurnMoves = 0
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string' || move.isMax || move.isZ) continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  for (const field of MULTI_TURN_FIELDS) delete skill[field]
  const selfStatus = move.self?.volatileStatus
  if (move.flags?.charge) {
    const invulnerable = INVULNERABLE_BY_MOVE[skill.id]
    skill.charge = invulnerable ? { invulnerable } : {}
  }
  if (selfStatus === 'mustrecharge') skill.recharge = true
  if (selfStatus === 'lockedmove') {
    skill.lockIn = { kind: 'rampage', turns: { min: 2, max: 3 }, fatigueStatusId: 'confusion' }
  }
  if ((skill.charge || skill.recharge || move.selfdestruct) && move.basePower > 0) {
    skill.power = move.basePower
  }
  if (MULTI_TURN_FIELDS.some((field) => skill[field] !== undefined)) multiTurnMoves++
}
console.log(`Chiêu nhiều lượt: ${multiTurnMoves}`)

/** Chiêu đánh trúng quái bán vô hình (hàm onInvulnerability của Showdown, ghi tay). */
const HITS_INVULNERABLE = {
  gust: [{ kind: 'air', multiplier: 2 }],
  twister: [{ kind: 'air', multiplier: 2 }],
  skyUppercut: [{ kind: 'air' }],
  thunder: [{ kind: 'air' }],
  hurricane: [{ kind: 'air' }],
  smackDown: [{ kind: 'air' }],
  thousandArrows: [{ kind: 'air' }],
  earthquake: [{ kind: 'underground', multiplier: 2 }],
  magnitude: [{ kind: 'underground', multiplier: 2 }],
  fissure: [{ kind: 'underground' }],
  surf: [{ kind: 'underwater', multiplier: 2 }],
  whirlpool: [{ kind: 'underwater', multiplier: 2 }]
}
for (const [id, hits] of Object.entries(HITS_INVULNERABLE)) {
  const skill = byId.get(id)
  if (skill) skill.hitsInvulnerable = hits
}

// Trói (cụm 7, pokemon-moves.md): chiêu có `volatileStatus: partiallytrapped` của Showdown gây
// `bound` 100% (4–5 lượt, mất 1/8 máu, không thoát được, hết khi quái trói rời sân).
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string' || move.isMax || move.isZ) continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  skill.effects = skill.effects.filter(
    (e) => !(e.type === 'applyStatus' && e.params.statusId === 'bound')
  )
  if (move.volatileStatus === 'partiallytrapped') {
    skill.effects.push({ type: 'applyStatus', params: { statusId: 'bound' } })
  }
}

// Ép đổi quái theo cờ `forceSwitch` của Showdown (cụm 9, pokemon-moves.md): Roar, Whirlwind,
// Dragon Tail, Circle Throw đẩy mục tiêu ra sau đòn.
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string' || move.isMax || move.isZ) continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  skill.effects = skill.effects.filter((e) => e.type !== 'forceSwitch')
  if (move.forceSwitch) skill.effects.push({ type: 'forceSwitch', params: {} })
}

// Chiêu gọi chiêu khác (cụm 10): Metronome gọi chiêu có cờ `metronome` của Showdown; Sleep Talk /
// Assist không gọi chiêu thiếu cờ đó (Metronome, Sleep Talk, chiêu nạp...).
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string' || move.isMax || move.isZ) continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  if (move.flags?.metronome) METRONOME_POOL.push(skill.id)
  else NOT_CALLABLE.push(skill.id)
  delete skill.reflectable
  delete skill.snatchable
  if (move.flags?.reflectable) skill.reflectable = true
  if (move.flags?.snatch) skill.snatchable = true
}
METRONOME_POOL.sort()
NOT_CALLABLE.sort()

// Phản lực (`recoil` của Showdown: % sát thương gây ra) và cờ loại chiêu (`moveFlags`).
const MOVE_FLAGS = [
  'sound',
  'punch',
  'bite',
  'slicing',
  'pulse',
  'bullet',
  'wind',
  'dance',
  'powder'
]
let recoilMoves = 0
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string' || move.isMax || move.isZ) continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  delete skill.recoilPercent
  delete skill.sound
  delete skill.moveFlags
  if (Array.isArray(move.recoil)) {
    skill.recoilPercent = Math.round((move.recoil[0] / move.recoil[1]) * 10000) / 100
    recoilMoves++
  }
  const flags = MOVE_FLAGS.filter((flag) => move.flags?.[flag])
  if (flags.length > 0) skill.moveFlags = flags
}
console.log(`Chiêu phản lực: ${recoilMoves}`)

// Chiêu không học được, chỉ dùng khi không còn skill nào dùng được (config.battle.struggleSkillId):
// tạo nếu chưa có. Struggle: không hệ, 50 power, luôn trúng, mất ¼ max HP mỗi lần dùng.
const STRUGGLE = {
  id: 'struggle',
  elementId: 'normal',
  category: 'physical',
  power: 50,
  accuracy: 100,
  target: 'enemy',
  effects: [],
  priority: 0,
  contact: true,
  typeless: true,
  selfDamagePercent: 25
}
if (!byId.has(STRUGGLE.id)) {
  skills.push(STRUGGLE)
  byId.set(STRUGGLE.id, STRUGGLE)
}
for (const [language, name] of [
  ['en', 'Struggle'],
  ['vi', 'Giãy giụa']
]) {
  const file = new URL(`../../src/data/i18n/${language}/skills.json`, import.meta.url)
  const names = JSON.parse(readFileSync(file, 'utf8'))
  names[STRUGGLE.id] = name
  writeFileSync(file, JSON.stringify(names, null, 2) + '\n')
}

// Bảng ghi tay áp sau cùng: ghi đè trường do các vòng đọc Showdown ở trên đặt / xóa.
const missing = []
for (const [id, fields] of Object.entries(MECHANICS)) {
  const skill = byId.get(id)
  if (!skill) {
    missing.push(id)
    continue
  }
  Object.assign(skill, fields)
}

// Minimize (sau bảng, gộp vào spell sẵn có): đòn đạp / đè luôn trúng và ×2 lên quái đã Minimize.
const MINIMIZE_PUNISHERS = [
  'stomp',
  'steamroller',
  'bodySlam',
  'flyingPress',
  'dragonRush',
  'heatCrash',
  'heavySlam',
  'maliciousMoonsault',
  'supercellSlam'
]
for (const id of MINIMIZE_PUNISHERS) {
  const skill = byId.get(id)
  if (!skill) continue
  skill.alwaysHitsVsStatusIds = ['minimized']
  const bonus = {
    percent: 100,
    when: [{ if: 'hasStatus', who: 'target', statusIds: ['minimized'] }]
  }
  skill.spell = { ...skill.spell, powerBonus: [...(skill.spell?.powerBonus ?? []), bonus] }
}

// Luôn trúng, sau bảng: bảng có thể đổi mục tiêu (Defog thành nhắm địch).
// Khớp đúng id camelCase theo tên gốc và cùng hệ (spell nguồn khác trùng id như `shockwave`,
// `whirlwind` không bị ảnh hưởng); chỉ skill nhắm địch (accuracy chỉ xét khi nhắm địch).
const alwaysHits = []
for (const skill of skills) delete skill.alwaysHits
for (const move of Object.values(showdownMoves)) {
  if (move.accuracy !== true || typeof move.name !== 'string') continue
  const skill = byId.get(camelId(move.name))
  if (!skill || !['enemy', 'allEnemies'].includes(skill.target)) continue
  // Cùng hệ mới là chiêu Pokémon (id trùng của nguồn khác thường khác hệ).
  if (skill.elementId !== move.type.toLowerCase()) continue
  skill.alwaysHits = true
  alwaysHits.push(skill.id)
}
// Xuyên bảo vệ theo mục tiêu sau bảng (bảng có thể đổi mục tiêu): chiêu nhắm địch không có cờ
// protect của Showdown (Roar, Feint, Perish Song...) không bị bảo vệ chặn.
for (const move of Object.values(showdownMoves)) {
  if (typeof move.name !== 'string' || move.isMax || move.isZ) continue
  const skill = byId.get(camelId(move.name))
  if (!skill || skill.elementId !== move.type.toLowerCase()) continue
  if (!['enemy', 'allEnemies'].includes(skill.target)) continue
  if (move.flags?.protect) delete skill.ignoresProtect
  else skill.ignoresProtect = true
}

writeFileSync(SKILLS, JSON.stringify(skills, null, 2) + '\n')
console.log(
  `Đã ghi ${Object.keys(MECHANICS).length - missing.length} chiêu; thiếu: ${missing.join(', ') || 'không'}; luôn trúng: ${alwaysHits.length}`
)
