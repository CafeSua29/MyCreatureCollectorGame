/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Dữ liệu hệ thống lấy từ Portals of Phereon: kiểu luyện thể (bộ phận chiến đấu của Transform body, bỏ bộ
// phận người lớn), tinh chất (Essence, bỏ tinh chất người lớn / nhân vật riêng), số cân bằng. Số là số tạm
// theo gốc đã quy đổi; luật ở body-refinement.md, hatchery.md, essences.md, zones.md.

import { C, E, h, immune, trig } from '../siralim-spells/sdsl.mjs'

const stat = (percent) => h('statModifier', { percent })
const onAttack = (...effects) => trig('attack', 'self', effects)
const onHit = (...effects) => trig('damaged', 'self', effects)
const endTurn = (...effects) => trig('turnEnd', 'self', effects)
const entry = (...effects) => trig('entry', 'self', effects)
const status = (to, statusId, turns) => E.status(to, statusId, turns ? { turns } : {})
const field = (fieldId) => ({ do: 'placeField', fieldId })
const heal = (percent) => E.heal('self', { hp: 'max', of: 'self', percent })

// [id, bộ phận, nhãn, hook, hệ số giá, vi, en]. Theo CombatSubPart của gốc: chỉ số, skill / passive đi kèm.
export const REFINEMENTS = [
  [
    'refineClawArms',
    'arms',
    [],
    [stat({ attack: 8 }), onAttack({ ...status('other', 'bleeding', 2), chance: 25 })],
    1,
    'Tay vuốt',
    'Clawed Arms'
  ],
  ['refineScaledArms', 'arms', [], [stat({ attack: 5, defense: 8 })], 1, 'Tay vảy', 'Scaled Arms'],
  [
    'refineLavaArms',
    'arms',
    ['lava'],
    [stat({ spAttack: 8 }), onAttack({ ...status('other', 'burn'), chance: 20 })],
    1.5,
    'Tay dung nham',
    'Lava Arms'
  ],
  ['refineEnhancedArms', 'arms', [], [stat({ attack: 12 })], 2, 'Tay cường hóa', 'Enhanced Arms'],
  [
    'refinePincerArms',
    'arms',
    ['aquatic'],
    [stat({ attack: 10 }), onAttack({ ...status('other', 'bleeding', 2), chance: 15 })],
    1.5,
    'Càng thủy sinh',
    'Aquatic Pincers'
  ],
  [
    'refineTentacleArms',
    'arms',
    ['aquatic'],
    [onAttack({ ...status('other', 'snared', 1), chance: 20 })],
    1,
    'Tay xúc tu',
    'Tentacle Arms'
  ],
  [
    'refinePlantArms',
    'arms',
    ['plant'],
    [h('regen', { percent: 3 })],
    1,
    'Tay thực vật',
    'Plant Arms'
  ],
  [
    'refineShadowArms',
    'arms',
    ['shadow'],
    [stat({ spAttack: 10 }), onAttack({ ...status('other', 'eroded', 1), chance: 15 })],
    1.5,
    'Tay bóng tối',
    'Shadow Arms'
  ],
  [
    'refineLavaLegs',
    'legs',
    ['lava'],
    [
      endTurn({ ...field('volcanicTerrain'), chance: 25 }),
      h('fieldDamageImmunity', { fieldIds: ['volcanicTerrain'] })
    ],
    1.5,
    'Chân dung nham',
    'Lava Legs'
  ],
  [
    'refinePlantLegs',
    'legs',
    ['plant'],
    [endTurn({ ...field('grassyTerrain'), chance: 25 }), stat({ spDefense: 5 })],
    1,
    'Chân rễ',
    'Plant Legs'
  ],
  [
    'refineScaleLegs',
    'legs',
    [],
    [
      stat({ defense: 10 }),
      onHit({ ...E.dmg('other', { hp: 'max', of: 'target', percent: 5 }), chance: 30 })
    ],
    1.5,
    'Chân vảy gai',
    'Scaled Legs'
  ],
  [
    'refineFinLegs',
    'legs',
    ['aquatic'],
    [stat({ speed: 10 }), h('fieldDamageImmunity', { fieldIds: ['deepWater'] })],
    1,
    'Vây bơi',
    'Mermaid Fins'
  ],
  [
    'refineSpiderLegs',
    'legs',
    [],
    [stat({ speed: 8 }), onAttack({ ...status('other', 'snared', 1), chance: 20 })],
    1.5,
    'Chân nhện',
    'Spider Legs'
  ],
  [
    'refineMistLegs',
    'legs',
    ['shadow'],
    [entry(status('self', 'shadowForm', 1))],
    1.5,
    'Thân sương mù',
    'Mist Body'
  ],
  [
    'refineInsectWings',
    'wings',
    ['flying'],
    [stat({ speed: 10 })],
    1,
    'Cánh côn trùng',
    'Insect Wings'
  ],
  [
    'refineBatWings',
    'wings',
    ['flying', 'shadow'],
    [stat({ speed: 6, spAttack: 6 })],
    1,
    'Cánh dơi',
    'Bat Wings'
  ],
  [
    'refineFeatherWings',
    'wings',
    ['flying'],
    [stat({ speed: 8, spDefense: 5 })],
    1,
    'Cánh lông vũ',
    'Feathered Wings'
  ],
  [
    'refineMagicWings',
    'wings',
    ['flying'],
    [stat({ spAttack: 10 })],
    1.5,
    'Cánh ma lực',
    'Magic Wings'
  ],
  [
    'refineFluffyTail',
    'tail',
    [],
    [stat({ spDefense: 8 }), h('dodge', { percent: 5 })],
    1,
    'Đuôi bông',
    'Fluffy Tail'
  ],
  ['refineFinTail', 'tail', ['aquatic'], [stat({ speed: 6, hp: 5 })], 1, 'Đuôi cá', 'Mermaid Tail'],
  [
    'refineTailFeathers',
    'tail',
    ['flying'],
    [stat({ speed: 6 })],
    1,
    'Đuôi lông vũ',
    'Tail Feathers'
  ],
  ['refineMagicTail', 'tail', [], [stat({ spAttack: 8 })], 1, 'Đuôi ma lực', 'Magic Tail'],
  [
    'refineSnakeTail',
    'tail',
    [],
    [onAttack({ ...status('other', 'poison', 3), chance: 15 })],
    1.5,
    'Đuôi rắn',
    'Snake Tail'
  ],
  [
    'refineLifeTail',
    'tail',
    ['plant'],
    [h('regen', { percent: 4 })],
    1.5,
    'Đuôi sinh mệnh',
    'Life Tail'
  ],
  [
    'refineLavaTail',
    'tail',
    ['lava'],
    [stat({ attack: 6, spAttack: 6 })],
    1.5,
    'Đuôi dung nham',
    'Lava Tail'
  ],
  ['refineHorns', 'head', [], [stat({ attack: 8 })], 1, 'Sừng', 'Horns'],
  [
    'refineTwinHorns',
    'head',
    [],
    [stat({ attack: 12, defense: -3 })],
    1.5,
    'Sừng đôi',
    'Twin Horns'
  ],
  [
    'refineHalo',
    'head',
    [],
    [
      stat({ spDefense: 10 }),
      entry(E.status('self', 'barrierBuff', { amount: { hp: 'max', of: 'self', percent: 10 } }))
    ],
    2,
    'Vầng hào quang',
    'Halo'
  ],
  [
    'refineMagicEyes',
    'head',
    [],
    [h('seeInvisible', {}), stat({ spAttack: 5 })],
    1,
    'Mắt ma lực',
    'Magic Eyes'
  ],
  [
    'refineSensoryEars',
    'head',
    [],
    [h('dodge', { percent: 5 }), h('critChance', { percent: 5 })],
    1,
    'Giác quan nhạy',
    'Sensory Ears'
  ],
  ['refineBloodCore', 'torso', [], [h('lifesteal', { percent: 10 })], 2, 'Tim huyết', 'Blood Core'],
  [
    'refineStableCore',
    'torso',
    [],
    [stat({ defense: 8, spDefense: 8 })],
    1.5,
    'Lõi ổn định',
    'Stable Core'
  ],
  [
    'refineManaCore',
    'torso',
    [],
    [stat({ spAttack: 6, spDefense: 6 })],
    1.5,
    'Lõi ma lực',
    'Mana Core'
  ],
  [
    'refineLightCore',
    'torso',
    [],
    [entry({ ...status('foes', 'blind', 1), chance: 30 })],
    1.5,
    'Lõi ánh sáng',
    'Light Core'
  ],
  [
    'refinePoisonGlands',
    'torso',
    [],
    [immune('poison', 'badPoison'), onAttack({ ...status('other', 'poison', 3), chance: 10 })],
    1.5,
    'Tuyến độc',
    'Poison Glands'
  ],
  [
    'refineShadowCore',
    'torso',
    ['shadow'],
    [stat({ spAttack: 8 })],
    1.5,
    'Lõi bóng tối',
    'Shadow Core'
  ],
  [
    'refineLavaCore',
    'torso',
    ['lava'],
    [immune('burn'), stat({ attack: 5 })],
    1.5,
    'Lõi dung nham',
    'Lava Core'
  ],
  ['refinePlantCore', 'torso', ['plant'], [endTurn(heal(3))], 1, 'Lõi thực vật', 'Plant Core'],
  [
    'refineArmorPlates',
    'torso',
    [],
    [stat({ defense: 15, speed: -5 })],
    1.5,
    'Giáp xác',
    'Armored Plates'
  ],
  [
    'refineGills',
    'torso',
    ['aquatic'],
    [h('fieldDamageImmunity', { fieldIds: ['deepWater'] }), stat({ defense: 5 })],
    1,
    'Mang',
    'Gills'
  ]
]

/**
 * Thưởng bộ theo nhãn: đúng ngưỡng của gốc (EvolutionController: Flying ≥ 2 thành bay; Aquatic ≥ 2 WaterPath,
 * ≥ 4 CreateWater; Lava ≥ 2 CreateLava, ≥ 3 LavaPath; Shadow ≥ 2 ShadowStep, ≥ 4 Conceal). Skill đi trên lưới ô
 * của gốc quy thành hook. Không nhập: Plant ≥ 5 (OxygenProvider, ngoài trận), Lava ≥ 6 (MeteorStorm: game
 * chỉ có 4 bộ phận mang nhãn Lava), Lava + Aquatic (CreateStone: thưởng theo cặp nhãn chưa có).
 */
export const TAG_BONUSES = [
  { tag: 'flying', count: 2, hooks: [h('airborne', {})] },
  { tag: 'aquatic', count: 2, hooks: [stat({ speed: 15 })] },
  { tag: 'aquatic', count: 4, hooks: [stat({ speed: 15 }), entry(field('deepWater'))] },
  { tag: 'lava', count: 2, hooks: [entry(field('volcanicTerrain'))] },
  { tag: 'lava', count: 3, hooks: [entry(field('volcanicTerrain')), stat({ speed: 15 })] },
  { tag: 'shadow', count: 2, hooks: [h('dodge', { percent: 10 })] },
  {
    tag: 'shadow',
    count: 4,
    hooks: [h('dodge', { percent: 10 }), entry(status('self', 'shadowForm', 1))]
  }
]

/** Tinh chất tăng trưởng theo nhóm race (Spark của gốc: +0,5 tăng trưởng một chỉ số ≈ +15% gen chỉ số đó). */
const SPARK_PERCENT = 15
const spark = (id, vi, en, raceGroupId, stats) => [
  {
    id,
    rarity: 'common',
    effect: { kind: 'growth', stats, percent: SPARK_PERCENT, raceGroupIds: [raceGroupId] }
  },
  vi,
  en
]
const battle = (id, rarity, vi, en, hooks) => [
  { id, rarity, effect: { kind: 'battleTrait', traitId: `${id}Trait` } },
  vi,
  en,
  hooks
]

// [định nghĩa, vi, en, hook của trait tạm nếu là battleTrait].
export const ESSENCES = [
  spark('essenceBeastSpark', 'Tia lửa Thú', 'Beast Spark', 'beast', ['spDefense']),
  spark('essenceAvianSpark', 'Tia lửa Chim', 'Harpy Spark', 'avian', ['hp']),
  spark('essenceReptileSpark', 'Tia lửa Bò sát', 'Lizard Spark', 'reptile', ['spAttack']),
  spark('essenceElementalSpark', 'Tia lửa Dung nham', 'Lava Spark', 'elemental', ['speed']),
  spark('essenceAquaticSpark', 'Tia lửa Thủy sinh', 'Mermaid Spark', 'aquatic', ['spDefense']),
  spark('essenceSpiritSpark', 'Tia lửa Bóng tối', 'Shadow Spark', 'spirit', ['attack']),
  spark('essenceAmorphousSpark', 'Tia lửa Nhờn', 'Tanid Spark', 'amorphous', ['hp']),
  spark('essenceMineralSpark', 'Tia lửa Khoáng', 'Lymean Spark', 'mineral', ['attack']),
  [
    {
      id: 'essenceBalance',
      rarity: 'common',
      effect: { kind: 'growth', stats: 'lowest', percent: 10 }
    },
    'Cân bằng',
    'Balance'
  ],
  battle('essenceCorrosion', 'common', 'Ăn mòn', 'Corrosion', [
    h('aura', {
      scope: 'foes',
      hooks: [
        h('statWhen', { percent: { defense: -25 }, when: [C.has('self', ['poison', 'badPoison'])] })
      ]
    })
  ]),
  battle('essenceDefensiveHealing', 'common', 'Hồi phục phòng thủ', 'Defensive Healing', [
    h('statWhen', { percent: { defense: 30 }, when: [C.has('self', ['healingMist', 'mending'])] })
  ]),
  battle('essenceSpiritBond', 'common', 'Linh giao', 'Spirit Bond', [
    trig('entry', 'self', E.stage('self', ['attack', 'spAttack'], 1), {
      when: [C.race('self', ['elementalSpirit', 'natureSpirit', 'wisp'])]
    })
  ]),
  battle('essenceIngraining', 'common', 'Bám rễ', 'Ingraining', [
    trig('defend', 'self', E.stage('self', ['spAttack'], 1), { when: [C.el('self', ['grass'])] })
  ]),
  // Harpy Blessing gốc: trứng nở +1 tốc độ.
  [
    {
      id: 'essenceHarpyBlessing',
      rarity: 'rare',
      effect: { kind: 'growth', stats: ['speed'], percent: SPARK_PERCENT }
    },
    'Phúc lành Gió',
    'Harpy Blessing'
  ],
  battle('essenceAcid', 'rare', 'Axit', 'Acid', [
    h('statusDamageModifier', { statusIds: ['poison', 'badPoison'], percent: 100 })
  ]),
  battle('essenceEverFlame', 'rare', 'Lửa vĩnh cửu', 'Ever Flame', [
    h('statusDurationBonus', { turns: 3, statusIds: ['burn'] })
  ]),
  battle('essenceIllusionary', 'rare', 'Ảo ảnh', 'Illusionary', [
    h('aura', {
      scope: 'foes',
      hooks: [h('statWhen', { percent: { spAttack: -50 }, when: [C.has('self', ['blind'])] })]
    })
  ]),
  battle('essenceFear', 'rare', 'Sợ hãi', 'Fear', [
    h('aura', {
      scope: 'foes',
      hooks: [h('statWhen', { percent: { attack: -50 }, when: [C.has('self', ['eroded'])] })]
    })
  ]),
  battle('essenceShadowBlessing', 'rare', 'Phúc lành Bóng', 'Shadow Blessing', [
    h('statWhen', { percent: { defense: 40 }, when: [C.has('self', ['shadowForm'])] })
  ]),
  battle('essenceFocusStrength', 'rare', 'Tập trung Lực', 'Focus Strength', [
    h('statWhen', { percent: { attack: 25 }, when: [C.has('self', ['proficient'])] })
  ]),
  battle('essenceFocusMagic', 'rare', 'Tập trung Phép', 'Focus Magic', [
    h('statWhen', { percent: { spAttack: 25 }, when: [C.has('self', ['proficient'])] })
  ]),
  battle('essenceFocusArmor', 'rare', 'Tập trung Giáp', 'Focus Armor', [
    h('statWhen', { percent: { defense: 25 }, when: [C.has('self', ['proficient'])] })
  ]),
  battle('essencePowerArmor', 'rare', 'Giáp lực', 'Power Armor', [
    h('statWhen', { percent: { attack: 30 }, when: [C.has('self', ['hardenedSkin'])] })
  ]),
  battle('essenceLavaShield', 'rare', 'Khiên dung nham', 'Lava Shield', [
    h('fieldDamageImmunity', { fieldIds: ['volcanicTerrain'] })
  ]),
  [
    { id: 'essenceHarpyEggs', rarity: 'rare', effect: { kind: 'egg', growth: 0, stability: 20 } },
    'Tổ ấm',
    'Harpy Nest'
  ],
  [
    { id: 'essenceInsectEggs', rarity: 'rare', effect: { kind: 'egg', growth: 20, stability: 0 } },
    'Ổ trứng',
    'Insect Brood'
  ],
  [
    {
      id: 'essenceFusionMastery',
      rarity: 'rare',
      effect: { kind: 'fusionTraitChoices', extra: 1 }
    },
    'Tinh thông Fuse',
    'Fusion Mastery'
  ],
  battle('essenceTypeMastery', 'rare', 'Tinh thông Khắc hệ', 'Type Mastery', [
    h('effectivenessModifier', { percent: 25, side: 'dealt', when: 'superEffective' })
  ]),
  battle('essenceResistance', 'rare', 'Kháng cự', 'Resistance', [
    h('damageTakenWhen', { percent: -15, when: [{ if: 'notVeryEffective' }] })
  ]),
  battle('essenceWisdom', 'rare', 'Trí tuệ', 'Wisdom', [h('expRewardModifier', { percent: 100 })]),
  battle('essenceFungalMastery', 'rare', 'Tinh thông Nấm', 'Fungal Mastery', [
    trig('turnEnd', 'self', E.minion('self', 1, 'fungalSpores'), {
      when: [C.el('self', ['fungal'])]
    })
  ]),
  [
    {
      id: 'essenceBreedingBlessing',
      rarity: 'mythic',
      effect: { kind: 'egg', growth: 0, stability: 100 }
    },
    'Phúc lành Sinh sôi',
    'Breeding Blessing'
  ],
  [
    {
      id: 'essenceFusionBlessing',
      rarity: 'mythic',
      effect: { kind: 'fusionTraitChoices', extra: 10 }
    },
    'Phúc lành Fuse',
    'Fusion Blessing'
  ],
  [
    {
      id: 'essenceArcaneFocus',
      rarity: 'mythic',
      effect: { kind: 'growth', stats: ['spAttack'], percent: 50 }
    },
    'Chuyên tâm Phép',
    'Arcane Focus'
  ],
  [
    {
      id: 'essencePowerFocus',
      rarity: 'mythic',
      effect: { kind: 'growth', stats: ['attack'], percent: 50 }
    },
    'Chuyên tâm Lực',
    'Power Focus'
  ],
  [
    {
      id: 'essenceCapacityFocus',
      rarity: 'mythic',
      effect: { kind: 'growth', stats: ['hp', 'spDefense'], percent: 50 }
    },
    'Chuyên tâm Thể',
    'Capacity Focus'
  ]
]

export const BALANCE = {
  bodyRefinement: { costPerLevel: 200, removeCostPercent: 25, tagBonuses: TAG_BONUSES },
  hatchery: {
    roomCount: 3,
    eggsPerRoom: 4,
    defaultHabitatId: 'basic',
    habitats: [
      { id: 'basic', buildCost: 0 },
      { id: 'outside', buildCost: 2000 },
      { id: 'crystal', buildCost: 8000 },
      { id: 'lava', buildCost: 6000, hatchTraitId: 'lavaImmuneTraitPhereon' },
      { id: 'water', buildCost: 4000, hatchTraitId: 'waterBreathingTraitPhereon' },
      { id: 'slime', buildCost: 4000, hatchTraitId: 'slimeTraitPhereon' },
      { id: 'ice', buildCost: 6000, hatchTraitId: 'coldResistantTraitPhereon' }
    ],
    eggTypes: [
      'normal',
      'lava',
      'aquatic',
      'floral',
      'stone',
      'ice',
      'light',
      'dark',
      'slime',
      'crystal'
    ],
    eggTypeByElement: {
      fire: 'lava',
      water: 'aquatic',
      grass: 'floral',
      bug: 'floral',
      fungal: 'floral',
      rock: 'stone',
      ground: 'stone',
      steel: 'stone',
      ice: 'ice',
      light: 'light',
      fairy: 'light',
      psychic: 'light',
      dark: 'dark',
      ghost: 'dark',
      poison: 'slime',
      glass: 'crystal',
      plastic: 'crystal',
      glitter: 'crystal'
    },
    defaultEggType: 'normal',
    baseStability: 100,
    // Đúng số getStabilityBonus / getGrowthBonus của HatchingRoom gốc.
    rules: [
      { habitatIds: ['crystal'], growth: 10, stability: 10 },
      { habitatIds: ['ice'], stability: 25 },
      { habitatIds: ['outside'], notEggTypes: ['floral', 'stone'], growth: -25, stability: -25 },
      { habitatIds: ['slime'], notEggTypes: ['slime'], stability: -50 },
      { habitatIds: ['water'], notEggTypes: ['aquatic'], stability: -25 },
      { habitatIds: ['ice'], notEggTypes: ['ice'], growth: -40 },
      { habitatIds: ['lava'], eggTypes: ['stone'], growth: 15 },
      { habitatIds: ['water'], eggTypes: ['floral'], growth: 25 },
      { eggTypes: ['aquatic'], notHabitatIds: ['water'], stability: -50 },
      { eggTypes: ['slime'], stability: -50 },
      { eggTypes: ['slime'], habitatIds: ['slime'], growth: 50 },
      { eggTypes: ['slime'], notHabitatIds: ['slime'], growth: -50 },
      { eggTypes: ['lava'], growth: 25 },
      { eggTypes: ['lava'], notHabitatIds: ['lava'], stability: -35 },
      { eggTypes: ['stone'], growth: -25, stability: 50 },
      { eggTypes: ['ice'], stability: 50 },
      { eggTypes: ['ice'], notHabitatIds: ['ice'], growth: -50 }
    ],
    neighborRules: [
      { eggTypes: ['floral'], neighborEggTypes: ['floral'], growth: 10, stability: 20 },
      { eggTypes: ['floral'], neighborEggTypes: ['light'], growth: 20, stability: 10 },
      { notEggTypes: ['light'], neighborEggTypes: ['light'], growth: 10 },
      { notEggTypes: ['dark'], neighborEggTypes: ['dark'], growth: -10 },
      { eggTypes: ['dark'], notNeighborEggTypes: ['dark'], growth: 15 }
    ],
    minHatchChance: 5,
    genePercentPerExcessStability: 0.5,
    dailySteps: 1,
    // Sức ấp theo getBaseHatcherBonus: mỗi 10 điểm giảm × 0,75; mg gốc ~3–15 ≈ công đặc biệt loài / 10.
    hatcher: {
      statPerPoint: 10,
      diminishEvery: 10,
      diminishFactor: 0.75,
      sameEggTypeGrowth: 10,
      habitatEggTypes: {
        crystal: 'crystal',
        ice: 'ice',
        lava: 'lava',
        water: 'aquatic',
        slime: 'slime'
      },
      habitatGrowth: 10
    },
    upgradeCap: 3,
    // Advancement của gốc. Giá gốc là gỗ / đá / pha lê / tiền: quy về tiền (số tạm). Bỏ Freezing: game không có
    // trứng hỏng theo thời gian. Potential bỏ phần "lên cấp đầu chậm 10 lần" (game không có exp riêng từng quái).
    upgrades: [
      { id: 'growth', price: 3000, effects: [{ kind: 'bonus', growth: 10 }] },
      { id: 'stability', price: 3000, effects: [{ kind: 'bonus', stability: 10 }] },
      { id: 'symbiotic', price: 3000, effects: [{ kind: 'sameSpecies', growth: 10 }] },
      { id: 'supporting', price: 4000, effects: [{ kind: 'readyEggs', stability: 10 }] },
      { id: 'boosting', price: 5000, effects: [{ kind: 'boostOthers', steps: 1 }] },
      { id: 'energizing', price: 2000, effects: [{ kind: 'hatchCare' }] },
      {
        id: 'embiggening',
        price: 8000,
        effects: [{ kind: 'hatchTrait', traitId: 'giantTraitPhereon' }]
      },
      { id: 'potential', price: 12000, effects: [{ kind: 'hatchGenes', percent: 20 }] },
      {
        id: 'delayed',
        price: 6000,
        effects: [
          { kind: 'bonus', growthPercent: -50 },
          { kind: 'hatchLevels', levels: 9 }
        ]
      },
      {
        id: 'focusing',
        price: 6000,
        effects: [{ kind: 'excessGenes', target: 'highest', multiplier: 2 }]
      },
      {
        id: 'equalizing',
        price: 6000,
        effects: [{ kind: 'excessGenes', target: 'lowest', multiplier: 2 }]
      },
      { id: 'consuming', price: 3000, effects: [{ kind: 'onFail', spreadSteps: 2 }] },
      { id: 'continuous', price: 5000, effects: [{ kind: 'onFail', battlesLeft: 3 }] },
      { id: 'soulCollector', price: 5000, effects: [{ kind: 'onFail', soulPoints: 5 }] },
      { id: 'mutating', price: 9000, habitatIds: ['slime'], effects: [{ kind: 'randomTrait' }] },
      {
        id: 'obsidianFarm',
        price: 9000,
        habitatIds: ['lava'],
        effects: [{ kind: 'hatchItem', eggTypes: ['lava'], itemId: 'spiritStoneFire', count: 1 }]
      },
      {
        id: 'fruiting',
        price: 4000,
        habitatIds: ['outside'],
        effects: [{ kind: 'dailyItem', eggTypes: ['floral'], itemId: 'spiritStoneGrass', count: 1 }]
      }
    ]
  },
  essences: { offerSize: 3, rarityWeights: { common: 60, rare: 35, mythic: 5 } },
  portals: {
    spawnChance: 15,
    maxOpen: 3,
    durationDays: 7,
    steps: { min: 8, max: 12 },
    stepWeights: {
      battle: 45,
      elite: 8,
      treasure: 12,
      rareTreasure: 3,
      spring: 8,
      hive: 14,
      gather: 10
    },
    floorsPerHostility: 2,
    floorsPerHive: 1,
    startHives: 1,
    hivesPerDay: 1,
    maxHives: 8,
    stabilizeCost: 5000,
    stabilizeDays: 5,
    gatherRolls: 2
  }
}
