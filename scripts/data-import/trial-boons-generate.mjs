/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Sinh ân huệ bí cảnh (docs/rules/trial-boons.md): src/data/trialBoons.json + tên ở
// src/data/i18n/{vi,en}/trialBoons.json. Nhóm sinh theo danh sách (ấn / giáp mỗi hệ, khắc tinh mỗi
// nhóm race) đọc thẳng dữ liệu nên thêm hệ / nhóm race thì chạy lại. GHI ĐÈ cả file: sửa tay trong
// JSON thì chép vào đây trước. Chạy từ gốc project: node scripts/data-import/trial-boons-generate.mjs
import fs from 'node:fs'

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'))
const tx = (lang, file) => readJson(`src/data/i18n/${lang}/${file}.json`)
const ELEMENTS = readJson('src/data/elements.json').map((e) => e.id)
const GROUPS = readJson('src/data/raceGroups.json').map((g) => g.id)

const list = []
const B = (id, rarity, effects, vi, en, maxStacks) =>
  list.push({ def: { id, rarity, effects, ...(maxStacks ? { maxStacks } : {}) }, vi, en })
const H = (...hooks) => ({
  type: 'hooks',
  hooks: hooks.map(([type, params]) => ({ type, params }))
})
const sm = (percent) => ['statModifier', { percent }]
const ALL = (p) => ({ attack: p, defense: p, spAttack: p, spDefense: p, speed: p })

// ---------- Totem chỉ số ----------
B('clawTotem', 'common', [H(sm({ attack: 20 }))], 'Totem Vuốt Sắc', 'Claw Totem')
B('spiritTotem', 'common', [H(sm({ spAttack: 20 }))], 'Totem Linh Hồn', 'Spirit Totem')
B('shellTotem', 'common', [H(sm({ defense: 20 }))], 'Totem Mai Cứng', 'Shell Totem')
B('scaleTotem', 'common', [H(sm({ spDefense: 20 }))], 'Totem Vảy Rồng', 'Scale Totem')
B('windTotem', 'common', [H(sm({ speed: 15 }))], 'Totem Gió Lốc', 'Wind Totem')
B('hunterTotem', 'rare', [H(sm({ attack: 20, spAttack: 20 }))], 'Totem Thợ Săn', 'Hunter Totem')
B('guardianTotem', 'rare', [H(sm({ defense: 20, spDefense: 20 }))], 'Totem Hộ Vệ', 'Guardian Totem')
B('raptorTotem', 'rare', [H(sm({ attack: 15, speed: 15 }))], 'Totem Chim Săn', 'Raptor Totem')
B('sageTotem', 'rare', [H(sm({ spAttack: 15, speed: 15 }))], 'Totem Pháp Sư', 'Sage Totem')
B('apexTotem', 'epic', [H(sm(ALL(20)))], 'Totem Chúa Tể', 'Apex Totem')

// ---------- Hồi phục ----------
B('herbPouch', 'common', [{ type: 'heal', percent: 20 }], 'Túi Thảo Dược', 'Herb Pouch')
B('springWater', 'rare', [{ type: 'heal', percent: 40 }], 'Nước Suối Thiêng', 'Sacred Spring', 2)
B('amberHeart', 'rare', [H(['regen', { percent: 4 }])], 'Tim Hổ Phách', 'Amber Heart')
B('bloodFang', 'rare', [H(['lifesteal', { percent: 15 }])], 'Nanh Huyết', 'Blood Fang')
B(
  'trophyBone',
  'common',
  [H(['healOnKnockout', { percent: 12 }])],
  'Xương Chiến Lợi Phẩm',
  'Trophy Bone'
)
B('restingNest', 'common', [H(['healOnLeave', { percent: 15 }])], 'Tổ Nghỉ', 'Resting Nest')
B(
  'cleansingDew',
  'common',
  [H(['turnEndCureStatus', { chance: 30 }])],
  'Sương Thanh Tẩy',
  'Cleansing Dew',
  3
)
B(
  'mendingMoss',
  'common',
  [H(['healingModifier', { received: 40 }])],
  'Rêu Hàn Gắn',
  'Mending Moss'
)

// ---------- Phòng thủ ----------
B('hardHide', 'common', [H(['damageTakenModifier', { percent: -12 }])], 'Da Dày', 'Hard Hide', 5)
B('ironWill', 'rare', [H(['debuffResist', { chance: 25 }])], 'Ý Chí Sắt', 'Iron Will', 4)
B(
  'fullGuard',
  'common',
  [H(['damageTakenAtFullHp', { percent: -30 }])],
  'Thế Thủ Nguyên Vẹn',
  'Pristine Guard',
  3
)
B('shadowStep', 'common', [H(['dodge', { percent: 8 }])], 'Bước Bóng', 'Shadow Step', 4)
B(
  'weakSpotShield',
  'rare',
  [H(['effectivenessModifier', { side: 'taken', when: 'superEffective', percent: -20 }])],
  'Khiên Che Điểm Yếu',
  'Weak Spot Shield',
  3
)
B(
  'thornHide',
  'rare',
  [H(['retaliateDamage', { category: 'physical', percentOfAttackerMaxHp: 8 }])],
  'Da Gai',
  'Thorn Hide'
)
B('wardingCharm', 'epic', [H(['damageCap', { percent: 30 }])], 'Bùa Hộ Thân', 'Warding Charm', 1)
B('lastStand', 'epic', [H(['surviveLethal', { fromFullHp: true }])], 'Trụ Vững', 'Last Stand', 1)

// ---------- Tấn công ----------
B(
  'predatorEye',
  'common',
  [H(['critChanceModifier', { percent: 30 }])],
  'Mắt Thú Săn',
  'Predator Eye'
)
B('tyrantJaw', 'rare', [H(['critDamageModifier', { percent: 35 }])], 'Hàm Bạo Chúa', 'Tyrant Jaw')
B('luckyFeather', 'rare', [H(['critStage', { stages: 1 }])], 'Lông Vũ May Mắn', 'Lucky Feather', 1)
B(
  'primalFury',
  'rare',
  [H(['damageDealtModifier', { percent: 20 }])],
  'Cơn Giận Nguyên Thủy',
  'Primal Fury'
)
B(
  'huntersMark',
  'rare',
  [H(['ignoreDefensePercent', { percent: 12 }])],
  'Dấu Thợ Săn',
  "Hunter's Mark",
  5
)
B('focusStone', 'common', [H(['accuracyModifier', { percent: 15 }])], 'Đá Tập Trung', 'Focus Stone')
B(
  'firstStrike',
  'rare',
  [H(['actFirstChance', { chance: 15 }])],
  'Tiên Phát Chế Nhân',
  'First Strike',
  5
)
B(
  'weakSpotFang',
  'rare',
  [H(['effectivenessModifier', { side: 'dealt', when: 'superEffective', percent: 25 }])],
  'Nanh Tìm Điểm Yếu',
  'Weak Spot Fang'
)
B(
  'piercingHorn',
  'rare',
  [H(['effectivenessModifier', { side: 'dealt', when: 'notVeryEffective', percent: 40 }])],
  'Sừng Xuyên Phá',
  'Piercing Horn'
)
B(
  'kinshipStone',
  'rare',
  [H(['stabMultiplier', { multiplier: 1.25 }])],
  'Đá Đồng Tộc',
  'Kinship Stone'
)
B(
  'quickJab',
  'common',
  [H(['lowPowerSkillBoost', { maxPower: 60, percent: 40 }])],
  'Đòn Nhanh',
  'Quick Jab'
)
B(
  'executioner',
  'common',
  [H(['damageVsLowHp', { hpBelowPercent: 30, percent: 35 }])],
  'Đao Phủ',
  'Executioner'
)
B(
  'reaperScythe',
  'epic',
  [H(['executeLowHp', { hpBelowPercent: 10 }])],
  'Lưỡi Hái Thần Chết',
  "Reaper's Scythe",
  1
)
B(
  'meteorShard',
  'rare',
  [H(['turnEndDamageFoes', { percent: 4 }])],
  'Mảnh Thiên Thạch',
  'Meteor Shard'
)
B('trueAim', 'epic', [H(['sureHit', {}])], 'Bách Phát Bách Trúng', 'True Aim', 1)
B(
  'swiftHex',
  'epic',
  [H(['priorityModifier', { skillCategory: 'status', amount: 1 }])],
  'Chú Nhanh',
  'Swift Hex',
  1
)
B('recoilBand', 'common', [H(['recoilImmunity', {}])], 'Đai Chống Dội', 'Recoil Band', 1)

// ---------- Điều kiện ----------
B(
  'desperation',
  'common',
  [H(['statModifierWhileLowHp', { hpBelowPercent: 50, percent: { attack: 30, spAttack: 30 } }])],
  'Liều Chết',
  'Desperation'
)
B(
  'vigor',
  'common',
  [H(['statModifierWhileHighHp', { hpAbovePercent: 50, percent: { attack: 15, spAttack: 15 } }])],
  'Sung Sức',
  'Vigor'
)
B(
  'ambush',
  'rare',
  [H(['statModifierFirstTurns', { turns: 2, percent: { attack: 30, spAttack: 30, speed: 30 } }])],
  'Phục Kích',
  'Ambush'
)
B(
  'gutsTotem',
  'common',
  [H(['statModifierWhileStatused', { percent: { attack: 35, spAttack: 35 } }])],
  'Totem Gan Dạ',
  'Guts Totem'
)

// ---------- Thể lực ----------
B(
  'enduranceTotem',
  'common',
  [H(['staminaCostPercent', { percent: -15 }])],
  'Totem Bền Bỉ',
  'Endurance Totem',
  4
)
B('deepLungs', 'common', [H(['staminaMaxPercent', { percent: 20 }])], 'Lá Phổi Sâu', 'Deep Lungs')

// ---------- Thưởng ----------
B(
  'goldIdol',
  'common',
  [{ type: 'reward', channel: 'reward', percent: 15 }],
  'Tượng Vàng',
  'Gold Idol'
)
B(
  'sageSkull',
  'common',
  [{ type: 'reward', channel: 'exp', percent: 15 }],
  'Sọ Hiền Giả',
  'Sage Skull'
)
B(
  'fortuneRelic',
  'rare',
  [{ type: 'reward', channel: 'reward', percent: 35 }],
  'Di Vật Phú Quý',
  'Fortune Relic'
)
B(
  'scholarRelic',
  'rare',
  [{ type: 'reward', channel: 'exp', percent: 35 }],
  'Di Vật Học Giả',
  'Scholar Relic'
)
B('treasureMap', 'rare', [{ type: 'chest', rolls: 1 }], 'Bản Đồ Kho Báu', 'Treasure Map')
B(
  'dragonHoard',
  'epic',
  [
    { type: 'chest', rolls: 3 },
    { type: 'reward', channel: 'reward', percent: 25 }
  ],
  'Kho Báu Rồng',
  "Dragon's Hoard"
)

// ---------- Đánh đổi (kiểu ân huệ hỗn mang của roguelike) ----------
B(
  'bloodRage',
  'rare',
  [H(sm({ attack: 35, spAttack: 35, defense: -15, spDefense: -15 }))],
  'Huyết Cuồng',
  'Blood Rage'
)
B('stoneSkin', 'rare', [H(sm({ defense: 35, spDefense: 35, speed: -15 }))], 'Da Đá', 'Stone Skin')
B(
  'windBorne',
  'rare',
  [H(sm({ speed: 30, defense: -10, spDefense: -10 }))],
  'Cưỡi Gió',
  'Windborne'
)
B(
  'glassCannon',
  'rare',
  [H(['damageDealtModifier', { percent: 30 }], ['damageTakenModifier', { percent: 15 }])],
  'Pháo Thủy Tinh',
  'Glass Cannon',
  3
)
B(
  'berserkPact',
  'rare',
  [H(['lifesteal', { percent: 20 }], ['damageTakenModifier', { percent: 10 }])],
  'Khế Ước Cuồng Chiến',
  'Berserk Pact',
  3
)

// ---------- Combo epic ----------
B(
  'ancientBlood',
  'epic',
  [H(sm(ALL(15)), ['regen', { percent: 3 }])],
  'Huyết Mạch Thượng Cổ',
  'Ancient Blood'
)
B(
  'apexPredator',
  'epic',
  [H(['critStage', { stages: 1 }], ['critDamageModifier', { percent: 50 }])],
  'Vua Săn Mồi',
  'Apex Predator',
  1
)
B(
  'meteorTotem',
  'epic',
  [H(['turnEndDamageFoes', { percent: 6 }], ['damageDealtModifier', { percent: 12 }])],
  'Totem Thiên Thạch',
  'Meteor Totem'
)
B(
  'phoenixFeather',
  'epic',
  [H(['surviveLethal', { fromFullHp: true }], ['healOnKnockout', { percent: 20 }])],
  'Lông Phượng Hoàng',
  'Phoenix Feather',
  1
)
B(
  'kingsCrown',
  'epic',
  [
    H(sm(ALL(12))),
    { type: 'reward', channel: 'reward', percent: 25 },
    { type: 'reward', channel: 'exp', percent: 25 }
  ],
  'Vương Miện',
  "King's Crown"
)
B(
  'worldTree',
  'epic',
  [
    H(['regen', { percent: 5 }], ['damageTakenModifier', { percent: -12 }]),
    { type: 'heal', percent: 25 }
  ],
  'Lá Cây Thế Giới',
  'World Tree Leaf',
  3
)

// ---------- Nhắm boss: trận cuối của bí cảnh luôn là boss (điều kiện DSL bossBattle) ----------
const BOSS = [{ if: 'bossBattle', value: true }]
B(
  'leaderFocus',
  'common',
  [H(['damageDealtModifier', { percent: 12, when: BOSS }])],
  'Tập Trung Thủ Lĩnh',
  'Leader Focus'
)
B(
  'chieftainMark',
  'common',
  [{ type: 'bossWeaken', percent: 5 }],
  'Dấu Hạ Thủ Lĩnh',
  "Chieftain's Mark"
)
B(
  'giantSlayer',
  'rare',
  [H(['damageDealtModifier', { percent: 25, when: BOSS }])],
  'Kẻ Diệt Khổng Lồ',
  'Giant Slayer'
)
B(
  'kingsguardShield',
  'rare',
  [H(['damageTakenWhen', { percent: -20, when: BOSS }])],
  'Khiên Ngự Vương',
  'Kingsguard Shield',
  3
)
B(
  'kingslayerCurse',
  'epic',
  [{ type: 'bossWeaken', percent: 15 }],
  'Lời Nguyền Hạ Bệ',
  "Kingslayer's Curse"
)
B(
  'titanTotem',
  'epic',
  [
    H(
      ['damageDealtModifier', { percent: 20, when: BOSS }],
      ['damageTakenWhen', { percent: -15, when: BOSS }]
    )
  ],
  'Totem Diệt Titan',
  'Titan Totem',
  3
)

// ---------- Theo hệ: ấn (sát thương) và giáp (chịu đòn) ----------
const viEl = tx('vi', 'elements')
const enEl = tx('en', 'elements')
for (const e of ELEMENTS) {
  B(
    `${e}Sigil`,
    'common',
    [H(['elementDamageDealt', { elementIds: [e], percent: 25 }])],
    `Ấn ${viEl[e]}`,
    `${enEl[e]} Sigil`
  )
  B(
    `${e}Ward`,
    'common',
    [H(['elementDamageTaken', { elementIds: [e], percent: -20 }])],
    `Giáp ${viEl[e]}`,
    `${enEl[e]} Ward`,
    4
  )
}

// ---------- Theo nhóm race: sát thủ ----------
const viRg = tx('vi', 'raceGroups')
const enRg = tx('en', 'raceGroups')
for (const g of GROUPS) {
  B(
    `${g}Bane`,
    'common',
    [H(['damageVsRace', { raceIds: [g], percent: 30 }])],
    `Khắc Tinh ${viRg[g]}`,
    `${enRg[g]} Bane`
  )
}

// ---------- Thời tiết / địa hình: tế đàn ----------
const viF = tx('vi', 'fieldEffects')
const enF = tx('en', 'fieldEffects')
const WEATHER = {
  rain: { speed: 25 },
  sun: { spAttack: 20 },
  sandstorm: { spDefense: 25 },
  snow: { defense: 25 },
  fog: { spDefense: 20, defense: 10 }
}
for (const [w, percent] of Object.entries(WEATHER)) {
  B(
    `${w}Altar`,
    'rare',
    [
      H(
        ['setFieldOnEntry', { layer: 'weather', fieldId: w }],
        ['statModifierInWeather', { weatherIds: [w], percent }]
      )
    ],
    `Tế Đàn ${viF[w]}`,
    `${enF[w]} Altar`,
    3
  )
}
const TERRAIN = {
  grassyTerrain: { defense: 20 },
  electricTerrain: { speed: 25 },
  mistyTerrain: { spDefense: 25 },
  psychicTerrain: { spAttack: 20 }
}
for (const [tr, percent] of Object.entries(TERRAIN)) {
  B(
    `${tr}Altar`,
    'rare',
    [
      H(
        ['setFieldOnEntry', { layer: 'terrain', fieldId: tr }],
        ['terrainStatModifier', { terrainIds: [tr], percent }]
      )
    ],
    `Tế Đàn ${viF[tr]}`,
    `${enF[tr]} Altar`,
    3
  )
}

// ---------- Trạng thái: gây khi đánh, gai phản, miễn, tăng sát thương trạng thái ----------
const viS = tx('vi', 'statuses')
const enS = tx('en', 'statuses')
const INFLICT = {
  poison: 12,
  burn: 12,
  paralysis: 10,
  freeze: 6,
  sleep: 6,
  bleeding: 12,
  blind: 10,
  confused: 10,
  cursed: 10,
  vulnerable: 12,
  weak: 12,
  silenced: 8,
  snared: 10,
  feared: 8,
  blighted: 10,
  disarmed: 10
}
for (const [st, chance] of Object.entries(INFLICT)) {
  const rarity = chance <= 8 ? 'rare' : 'common'
  B(
    `${st}Fang`,
    rarity,
    [H(['onAttackApplyStatus', { category: 'any', statuses: [{ statusId: st, chance }] }])],
    `Nanh ${viS[st]}`,
    `${enS[st]} Fang`
  )
}
for (const [st, chance] of Object.entries({ burn: 25, poison: 25, paralysis: 20, bleeding: 25 })) {
  B(
    `${st}Spines`,
    'common',
    [H(['onHitApplyStatus', { category: 'physical', statuses: [{ statusId: st, chance }] }])],
    `Gai ${viS[st]}`,
    `${enS[st]} Spines`
  )
}
const IMMUNE = {
  poison: ['poison', 'badPoison'],
  burn: ['burn'],
  paralysis: ['paralysis'],
  sleep: ['sleep', 'sleeping', 'drowsy'],
  freeze: ['freeze', 'frozen'],
  confused: ['confused', 'confusion'],
  bleeding: ['bleeding'],
  blind: ['blind']
}
for (const [st, statusIds] of Object.entries(IMMUNE)) {
  B(
    `${st}Charm`,
    'common',
    [H(['statusImmunity', { statusIds }])],
    `Bùa Kháng ${viS[st]}`,
    `${enS[st]} Charm`,
    1
  )
}
for (const st of ['poison', 'burn', 'bleeding']) {
  B(
    `${st}Essence`,
    'common',
    [H(['statusDamageModifier', { statusIds: [st], percent: 35 }])],
    `Tinh Chất ${viS[st]}`,
    `${enS[st]} Essence`
  )
}

// ---------- Bậc trận: uy hiếp khi vào sân, hăng máu khi hạ địch ----------
const STAT_VI = {
  attack: 'Công',
  defense: 'Thủ',
  spAttack: 'Đặc Công',
  spDefense: 'Đặc Thủ',
  speed: 'Tốc'
}
const STAT_EN = {
  attack: 'Attack',
  defense: 'Defense',
  spAttack: 'Sp. Atk',
  spDefense: 'Sp. Def',
  speed: 'Speed'
}
for (const stat of Object.keys(STAT_VI)) {
  B(
    `${stat}Roar`,
    'rare',
    [H(['stageOnEntry', { target: 'allEnemies', stat, stages: -1 }])],
    `Tiếng Gầm Giảm ${STAT_VI[stat]}`,
    `${STAT_EN[stat]} Roar`,
    1
  )
  B(
    `${stat}Surge`,
    'rare',
    [H(['stageOnEntry', { target: 'self', stat, stages: 1 }])],
    `Khí Thế ${STAT_VI[stat]}`,
    `${STAT_EN[stat]} Surge`,
    1
  )
  B(
    `${stat}Trophy`,
    'common',
    [H(['stageOnKnockout', { stat, stages: 1 }])],
    `Chiến Tích ${STAT_VI[stat]}`,
    `${STAT_EN[stat]} Trophy`,
    1
  )
}

const ids = list.map((x) => x.def.id)
if (new Set(ids).size !== ids.length) throw new Error('trùng id')
fs.writeFileSync(
  'src/data/trialBoons.json',
  JSON.stringify(
    list.map((x) => x.def),
    null,
    2
  ) + '\n'
)
for (const lang of ['vi', 'en']) {
  const names = Object.fromEntries(list.map((x) => [x.def.id, x[lang]]))
  fs.writeFileSync(`src/data/i18n/${lang}/trialBoons.json`, JSON.stringify(names, null, 2) + '\n')
}
const by = {}
for (const x of list) by[x.def.rarity] = (by[x.def.rarity] ?? 0) + 1
console.log(list.length, JSON.stringify(by))
