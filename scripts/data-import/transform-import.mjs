/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập dữ liệu biến hình trong trận (Mega, Dynamax / Gigantamax, Tera; mục "Dữ liệu biến hình" ở
// docs/rules/content-mechanics.md): config.transform, vật phẩm chìa khóa, đá Mega, Mảnh Tera, Max
// Soup / Dynamax Candy, chiêu Max / Max Guard / G-Max / Tera Blast, gmaxSkillId / megaSkillId của
// loài, powerSpot của map, tên vi / en. Chạy lại được (ghi đè các mục cùng id).
// Chạy: node scripts/data-import/transform-import.mjs rồi npx prettier --write src/data

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const write = (file, value) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')

const STELLAR = 'stellar'

// ---------- config ----------

const TRANSFORM_CONFIG = {
  keyItems: { mega: 'megaRing', dynamax: 'dynamaxBand', tera: 'teraOrb' },
  // Tầng nhận vật phẩm chìa khóa chuyển sang config.trainers.gym.keyItemFloors (docs/rules/trainers.md).
  mega: { stoneDropChance: 10 },
  dynamax: {
    turns: 3,
    hpMultiplierBase: 1.5,
    hpMultiplierPerLevel: 0.05,
    maxLevel: 10,
    powerTable: {
      steps: [
        { below: 45, power: 90 },
        { below: 55, power: 100 },
        { below: 65, power: 110 },
        { below: 75, power: 120 },
        { below: 110, power: 130 },
        { below: 150, power: 140 }
      ],
      top: 150
    },
    lowPowerTable: {
      steps: [
        { below: 45, power: 70 },
        { below: 55, power: 75 },
        { below: 65, power: 80 },
        { below: 75, power: 85 },
        { below: 110, power: 90 },
        { below: 150, power: 95 }
      ],
      top: 100
    },
    lowPowerElementIds: ['fighting', 'poison'],
    bossGmaxFactorChance: 50
  },
  tera: {
    sameStabMultiplier: 2,
    minPower: 60,
    stellarOriginalMultiplier: 2,
    stellarOtherMultiplier: 1.2,
    stellarBlastPower: 100,
    stellarBlastEffectiveness: 2,
    stellarBlastSelfStages: [
      { stat: 'attack', delta: -1 },
      { stat: 'spAttack', delta: -1 }
    ],
    changeCost: 50,
    bossOwnElementChance: 50,
    stellarFromFloor: 50,
    stellarChance: 1,
    shardDrop: { chance: 50, min: 3, max: 6 },
    relearnSkillIds: ['teraBlast']
  },
  boss: { base: 10, perFloor: 1, weights: { mega: 1, dynamax: 1, tera: 1, ultraBurst: 1 } },
  bossDrops: [
    { itemId: 'maxSoup', chance: 5 },
    { itemId: 'dynamaxCandy', chance: 10 }
  ]
}

// ---------- chiêu Max theo hệ (hiệu ứng như Pokémon; ánh sáng: Safeguard phe ta) ----------

const sideStage = (side, stat, delta) => ({
  type: 'sideStatStage',
  params: { side, stats: [stat], delta }
})
const setField = (layer, fieldId) => ({ type: 'setField', params: { layer, fieldId } })

const MAX_MOVES = [
  ['normal', 'maxStrike', 'Max Strike', 'Max Đột kích', sideStage('foe', 'speed', -1)],
  ['fire', 'maxFlare', 'Max Flare', 'Max Hỏa diễm', setField('weather', 'sun')],
  ['water', 'maxGeyser', 'Max Geyser', 'Max Mạch nước', setField('weather', 'rain')],
  [
    'electric',
    'maxLightning',
    'Max Lightning',
    'Max Sấm sét',
    setField('terrain', 'electricTerrain')
  ],
  [
    'grass',
    'maxOvergrowth',
    'Max Overgrowth',
    'Max Rừng rậm',
    setField('terrain', 'grassyTerrain')
  ],
  ['ice', 'maxHailstorm', 'Max Hailstorm', 'Max Bão tuyết', setField('weather', 'snow')],
  ['fighting', 'maxKnuckle', 'Max Knuckle', 'Max Quyền', sideStage('ally', 'attack', 1)],
  ['poison', 'maxOoze', 'Max Ooze', 'Max Dịch độc', sideStage('ally', 'spAttack', 1)],
  ['ground', 'maxQuake', 'Max Quake', 'Max Địa chấn', sideStage('ally', 'spDefense', 1)],
  ['flying', 'maxAirstream', 'Max Airstream', 'Max Luồng gió', sideStage('ally', 'speed', 1)],
  [
    'psychic',
    'maxMindstorm',
    'Max Mindstorm',
    'Max Bão tâm linh',
    setField('terrain', 'psychicTerrain')
  ],
  ['bug', 'maxFlutterby', 'Max Flutterby', 'Max Cánh bướm', sideStage('foe', 'spAttack', -1)],
  ['rock', 'maxRockfall', 'Max Rockfall', 'Max Đá lở', setField('weather', 'sandstorm')],
  ['ghost', 'maxPhantasm', 'Max Phantasm', 'Max Ảo ảnh', sideStage('foe', 'defense', -1)],
  ['dragon', 'maxWyrmwind', 'Max Wyrmwind', 'Max Long phong', sideStage('foe', 'attack', -1)],
  ['dark', 'maxDarkness', 'Max Darkness', 'Max Bóng tối', sideStage('foe', 'spDefense', -1)],
  ['steel', 'maxSteelspike', 'Max Steelspike', 'Max Gai thép', sideStage('ally', 'defense', 1)],
  ['fairy', 'maxStarfall', 'Max Starfall', 'Max Sao rơi', setField('terrain', 'mistyTerrain')],
  [
    'light',
    'maxRadiance',
    'Max Radiance',
    'Max Hào quang',
    { type: 'setSideField', params: { side: 'own', fieldId: 'safeguard' } }
  ]
]

const attackSkill = (id, elementId, extra = {}) => ({
  id,
  elementId,
  // Loại / power thay theo skill gốc lúc dùng (battle/maxMoves.ts); ghi giá trị danh nghĩa.
  category: 'physical',
  power: 100,
  accuracy: 100,
  target: 'enemy',
  effects: [],
  priority: 0,
  ...extra
})

// ---------- chiêu G-Max: làm được bằng hiệu ứng hiện có; còn lại vào skills-planned.json ----------

const DEFOG = [
  { type: 'clearSideFields', params: { side: 'foe' } },
  { type: 'clearSideFields', params: { side: 'own', hazardsOnly: true } },
  { type: 'clearField', params: { layer: 'terrain' } }
]

/** [loài gmax, id skill, hệ, tên en, tên vi, hiệu ứng | null (chờ), cơ chế cần nếu chờ, extra]. */
const GMAX_MOVES = [
  [
    'venusaurGmax',
    'gmaxVineLash',
    'grass',
    'G-Max Vine Lash',
    'G-Max Roi dây leo',
    [{ type: 'setSideField', params: { side: 'foe', fieldId: 'gmaxVineLash' } }]
  ],
  [
    'charizardGmax',
    'gmaxWildfire',
    'fire',
    'G-Max Wildfire',
    'G-Max Cháy rừng',
    [{ type: 'setSideField', params: { side: 'foe', fieldId: 'gmaxWildfire' } }]
  ],
  [
    'blastoiseGmax',
    'gmaxCannonade',
    'water',
    'G-Max Cannonade',
    'G-Max Pháo kích',
    [{ type: 'setSideField', params: { side: 'foe', fieldId: 'gmaxCannonade' } }]
  ],
  [
    'butterfreeGmax',
    'gmaxBefuddle',
    'bug',
    'G-Max Befuddle',
    'G-Max Mê hoặc',
    [
      {
        type: 'sideApplyStatus',
        params: { side: 'foe', statusIds: ['poison', 'paralysis', 'sleep'] }
      }
    ]
  ],
  [
    'pikachuGmax',
    'gmaxVoltCrash',
    'electric',
    'G-Max Volt Crash',
    'G-Max Sấm sập',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['paralysis'] } }]
  ],
  [
    'meowthGmax',
    'gmaxGoldRush',
    'normal',
    'G-Max Gold Rush',
    'G-Max Mưa vàng',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['confusion'] } }]
  ],
  [
    'machampGmax',
    'gmaxChiStrike',
    'fighting',
    'G-Max Chi Strike',
    'G-Max Khí kích',
    [{ type: 'sideApplyStatus', params: { side: 'ally', statusIds: ['chiStrike'] } }]
  ],
  [
    'gengarGmax',
    'gmaxTerror',
    'ghost',
    'G-Max Terror',
    'G-Max Khủng bố',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['cantEscape'] } }]
  ],
  [
    'kinglerGmax',
    'gmaxFoamBurst',
    'water',
    'G-Max Foam Burst',
    'G-Max Bọt nổ',
    [sideStage('foe', 'speed', -2)]
  ],
  [
    'laprasGmax',
    'gmaxResonance',
    'ice',
    'G-Max Resonance',
    'G-Max Cộng hưởng',
    [{ type: 'setSideField', params: { side: 'own', fieldId: 'auroraVeil' } }]
  ],
  [
    'eeveeGmax',
    'gmaxCuddle',
    'normal',
    'G-Max Cuddle',
    'G-Max Âu yếm',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['infatuated'] } }]
  ],
  [
    'snorlaxGmax',
    'gmaxReplenish',
    'normal',
    'G-Max Replenish',
    'G-Max Bổ sung',
    [],
    null,
    { spell: { after: [{ do: 'recycleItem', to: 'side', chance: 50 }] } }
  ],
  [
    'garbodorGmax',
    'gmaxMalodor',
    'poison',
    'G-Max Malodor',
    'G-Max Hôi thối',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['poison'] } }]
  ],
  [
    'melmetalGmax',
    'gmaxMeltdown',
    'steel',
    'G-Max Meltdown',
    'G-Max Nóng chảy',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['tormented'] } }]
  ],
  [
    'rillaboomGmax',
    'gmaxDrumSolo',
    'grass',
    'G-Max Drum Solo',
    'G-Max Độc tấu trống',
    [],
    null,
    { ignoresAbility: true }
  ],
  [
    'cinderaceGmax',
    'gmaxFireball',
    'fire',
    'G-Max Fireball',
    'G-Max Cầu lửa',
    [],
    null,
    { ignoresAbility: true }
  ],
  [
    'inteleonGmax',
    'gmaxHydrosnipe',
    'water',
    'G-Max Hydrosnipe',
    'G-Max Bắn tỉa nước',
    [],
    null,
    { ignoresAbility: true }
  ],
  ['corviknightGmax', 'gmaxWindRage', 'flying', 'G-Max Wind Rage', 'G-Max Cuồng phong', DEFOG],
  [
    'orbeetleGmax',
    'gmaxGravitas',
    'psychic',
    'G-Max Gravitas',
    'G-Max Trọng lực',
    [{ type: 'setRoom', params: { fieldId: 'gravity' } }]
  ],
  [
    'drednawGmax',
    'gmaxStonesurge',
    'water',
    'G-Max Stonesurge',
    'G-Max Sóng đá',
    [{ type: 'setSideField', params: { side: 'foe', fieldId: 'stealthRock' } }]
  ],
  [
    'coalossalGmax',
    'gmaxVolcalith',
    'rock',
    'G-Max Volcalith',
    'G-Max Đá núi lửa',
    [{ type: 'setSideField', params: { side: 'foe', fieldId: 'gmaxVolcalith' } }]
  ],
  [
    'flappleGmax',
    'gmaxTartness',
    'grass',
    'G-Max Tartness',
    'G-Max Chua gắt',
    [sideStage('foe', 'evasion', -1)]
  ],
  [
    'appletunGmax',
    'gmaxSweetness',
    'grass',
    'G-Max Sweetness',
    'G-Max Ngọt ngào',
    [{ type: 'sideCureStatus', params: { side: 'ally' } }]
  ],
  [
    'sandacondaGmax',
    'gmaxSandblast',
    'ground',
    'G-Max Sandblast',
    'G-Max Bão cát xoáy',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['bound'] } }]
  ],
  [
    'toxtricityGmax',
    'gmaxStunShock',
    'electric',
    'G-Max Stun Shock',
    'G-Max Sốc điện',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['poison', 'paralysis'] } }]
  ],
  [
    'toxtricityLowKeyGmax',
    'gmaxStunShockLowKey',
    'electric',
    'G-Max Stun Shock (Low Key)',
    'G-Max Sốc điện (Trầm)',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['poison', 'paralysis'] } }]
  ],
  [
    'centiskorchGmax',
    'gmaxCentiferno',
    'fire',
    'G-Max Centiferno',
    'G-Max Rết lửa',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['bound'] } }]
  ],
  [
    'hattereneGmax',
    'gmaxSmite',
    'fairy',
    'G-Max Smite',
    'G-Max Trừng phạt',
    [{ type: 'sideApplyStatus', params: { side: 'foe', statusIds: ['confusion'] } }]
  ],
  [
    'grimmsnarlGmax',
    'gmaxSnooze',
    'dark',
    'G-Max Snooze',
    'G-Max Ru ngủ',
    [{ type: 'applyStatus', params: { statusId: 'drowsy', chance: 50 } }]
  ],
  [
    'alcremieGmax',
    'gmaxFinale',
    'fairy',
    'G-Max Finale',
    'G-Max Khúc kết',
    [{ type: 'sideHeal', params: { side: 'ally', percent: 16.67 } }]
  ],
  [
    'copperajahGmax',
    'gmaxSteelsurge',
    'steel',
    'G-Max Steelsurge',
    'G-Max Gai thép',
    [{ type: 'setSideField', params: { side: 'foe', fieldId: 'gmaxSteelsurge' } }]
  ],
  [
    'duraludonGmax',
    'gmaxDepletion',
    'dragon',
    'G-Max Depletion',
    'G-Max Cạn kiệt',
    [],
    null,
    { spell: { after: [{ do: 'disableSkill', to: 'other', turns: 2 }] } }
  ],
  [
    'urshifuGmax',
    'gmaxOneBlow',
    'dark',
    'G-Max One Blow',
    'G-Max Nhất kích',
    [],
    null,
    { ignoresProtect: true }
  ],
  [
    'urshifuRapidStrikeGmax',
    'gmaxRapidFlow',
    'water',
    'G-Max Rapid Flow',
    'G-Max Liên lưu',
    [],
    null,
    { ignoresProtect: true }
  ]
]

// ---------- đá Mega (tên chính thức "<loài>ite"; dạng có tên riêng ghi đè) ----------

const STONE_NAMES = {
  venusaurMega: 'Venusaurite',
  charizardMegaX: 'Charizardite X',
  charizardMegaY: 'Charizardite Y',
  blastoiseMega: 'Blastoisinite',
  alakazamMega: 'Alakazite',
  slowbroMega: 'Slowbronite',
  gengarMega: 'Gengarite',
  kangaskhanMega: 'Kangaskhanite',
  pinsirMega: 'Pinsirite',
  gyaradosMega: 'Gyaradosite',
  aerodactylMega: 'Aerodactylite',
  mewtwoMegaX: 'Mewtwonite X',
  mewtwoMegaY: 'Mewtwonite Y',
  ampharosMega: 'Ampharosite',
  steelixMega: 'Steelixite',
  scizorMega: 'Scizorite',
  heracrossMega: 'Heracronite',
  houndoomMega: 'Houndoominite',
  tyranitarMega: 'Tyranitarite',
  sceptileMega: 'Sceptilite',
  blazikenMega: 'Blazikenite',
  swampertMega: 'Swampertite',
  gardevoirMega: 'Gardevoirite',
  sableyeMega: 'Sablenite',
  mawileMega: 'Mawilite',
  aggronMega: 'Aggronite',
  medichamMega: 'Medichamite',
  manectricMega: 'Manectite',
  sharpedoMega: 'Sharpedonite',
  cameruptMega: 'Cameruptite',
  altariaMega: 'Altarianite',
  banetteMega: 'Banettite',
  absolMega: 'Absolite',
  absolMegaZ: 'Absolite Z',
  glalieMega: 'Glalitite',
  salamenceMega: 'Salamencite',
  metagrossMega: 'Metagrossite',
  latiasMega: 'Latiasite',
  latiosMega: 'Latiosite',
  lopunnyMega: 'Lopunnite',
  garchompMega: 'Garchompite',
  garchompMegaZ: 'Garchompite Z',
  lucarioMega: 'Lucarionite',
  lucarioMegaZ: 'Lucarionite Z',
  abomasnowMega: 'Abomasite',
  galladeMega: 'Galladite',
  audinoMega: 'Audinite',
  diancieMega: 'Diancite',
  beedrillMega: 'Beedrillite',
  pidgeotMega: 'Pidgeotite',
  raichuMegaX: 'Raichunite X',
  raichuMegaY: 'Raichunite Y',
  meganiumMega: 'Meganiumite',
  feraligatrMega: 'Feraligite',
  dragoniteMega: 'Dragoninite',
  starmieMega: 'Starminite',
  excadrillMega: 'Excadrite',
  scolipedeMega: 'Scolipite',
  scraftyMega: 'Scraftinite',
  hawluchaMega: 'Hawluchanite',
  drampaMega: 'Drampanite',
  staraptorMega: 'Staraptite',
  darkraiMega: 'Darkranite',
  crabominableMega: 'Crabominite',
  golisopodMega: 'Golisopite',
  glimmoraMega: 'Glimmoranite',
  baxcaliburMega: 'Baxcalibrite',
  chimechoMega: 'Chimechite',
  skarmoryMega: 'Skarmorite',
  barbaracleMega: 'Barbaracite',
  meowsticMMega: 'Meowsticite (Male)',
  meowsticFMega: 'Meowsticite (Female)',
  tatsugiriCurlyMega: 'Tatsugirinite (Curly)',
  tatsugiriDroopyMega: 'Tatsugirinite (Droopy)',
  tatsugiriStretchyMega: 'Tatsugirinite (Stretchy)',
  magearnaMega: 'Magearnite',
  magearnaOriginalMega: 'Magearnite (Original Color)',
  kyogrePrimal: 'Blue Orb',
  groudonPrimal: 'Red Orb'
}
const STONE_NAMES_VI = { kyogrePrimal: 'Ngọc Xanh', groudonPrimal: 'Ngọc Đỏ' }
/** Không cần đá: biết skill này thì Mega được. */
const MEGA_SKILLS = { rayquazaMega: 'dragonAscent' }
const AUTO_STONES = ['kyogrePrimal', 'groudonPrimal']

/** Tên đá theo quy tắc chung: tên loài gốc (en) + "ite" (bỏ đuôi -e / -a để đọc như tên chính thức). */
const defaultStoneName = (baseName) => `${baseName.replace(/[ae]$/, '')}ite`

// ---------- map power spot (sân đấu, di tích, map vùng Galar...; ~10% số map) ----------

const POWER_SPOTS = [
  'wildArea',
  'isleOfArmor',
  'crownTundra',
  'dynamaxAdventureDen',
  'slumberingWeald',
  'glimwoodTangle',
  'victoryRoadKanto',
  'spearPillar',
  'skyPillar',
  'relicCastle',
  'dragonspiralTower',
  'distortionWorld',
  'ultraSpace',
  'areaZero',
  'forbiddenFortress',
  'blackPyramidOfNagash',
  'eyeOfTheVortex',
  'pokemonTower',
  'karakEightPeaks'
]

// ---------- chạy ----------

const balance = read('balance.json')
// Giữ phần cấu hình thêm sau (zMove, merge, trọng số boss của loại mới) và số đã chỉnh theo mô phỏng.
balance.ai.transformMinGain ??= 0.15
balance.transform = {
  ...TRANSFORM_CONFIG,
  ...Object.fromEntries(
    Object.entries(balance.transform ?? {}).filter(([key]) => !(key in TRANSFORM_CONFIG))
  ),
  boss: {
    ...TRANSFORM_CONFIG.boss,
    weights: { ...balance.transform?.boss?.weights, ...TRANSFORM_CONFIG.boss.weights }
  }
}
write('balance.json', balance)

const species = read('species.json')
const elements = read('elements.json').map((element) => element.id)
const texts = {
  en: { items: read('i18n/en/items.json'), skills: read('i18n/en/skills.json') },
  vi: { items: read('i18n/vi/items.json'), skills: read('i18n/vi/skills.json') }
}
const speciesEn = read('i18n/en/species.json')
const elementVi = read('i18n/vi/elements.json')
const elementEn = read('i18n/en/elements.json')
const name = (kind, id, en, vi) => {
  texts.en[kind][id] = en
  texts.vi[kind][id] = vi
}

// Skill
const skills = read('skills.json')
const newSkills = []
for (const [elementId, id, en, vi, effect] of MAX_MOVES) {
  newSkills.push(attackSkill(id, elementId, { maxMove: 'max', effects: [effect] }))
  name('skills', id, en, vi)
}
newSkills.push({
  id: 'maxGuard',
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  target: 'self',
  effects: [{ type: 'protect', params: { consecutiveChanceDivisor: 3 } }],
  priority: 4,
  maxMove: 'guard'
})
name('skills', 'maxGuard', 'Max Guard', 'Max Phòng thủ')
newSkills.push({
  id: 'teraBlast',
  elementId: 'normal',
  category: 'special',
  power: 80,
  accuracy: 100,
  target: 'enemy',
  effects: [],
  priority: 0,
  teraBlast: true
})
name('skills', 'teraBlast', 'Tera Blast', 'Bùng nổ Tera')
const planned = []
const gmaxSkillOf = {}
for (const [formId, id, elementId, en, vi, effects, needs, extra] of GMAX_MOVES) {
  const skill = attackSkill(id, elementId, { maxMove: 'gmax', ...(extra ?? {}) })
  if (effects === null) {
    planned.push({ ...skill, gmaxOf: formId, nameEn: en, nameVi: vi, needs })
    for (const language of ['en', 'vi']) delete texts[language].skills[id]
    continue
  }
  newSkills.push({ ...skill, effects })
  name('skills', id, en, vi)
  gmaxSkillOf[formId] = id
}
// Bỏ cả skill nay chuyển sang chờ (lần chạy trước có thể đã thêm vào game).
const newSkillIds = new Set([...newSkills, ...planned].map((skill) => skill.id))
write('skills.json', [...skills.filter((skill) => !newSkillIds.has(skill.id)), ...newSkills])
fs.writeFileSync(
  path.join(root, 'scripts/data-import/skills-planned.json'),
  JSON.stringify(planned, null, 2) + '\n'
)

// Loài: chiêu G-Max, skill thay đá (Rayquaza)
for (const entry of species) {
  delete entry.gmaxSkillId
  delete entry.megaSkillId
  if (gmaxSkillOf[entry.id]) entry.gmaxSkillId = gmaxSkillOf[entry.id]
  if (MEGA_SKILLS[entry.id]) entry.megaSkillId = MEGA_SKILLS[entry.id]
}
write('species.json', species)

// Vật phẩm
const items = read('items.json')
const newItems = []
for (const [id, en, vi] of [
  ['megaRing', 'Mega Ring', 'Vòng Mega'],
  ['dynamaxBand', 'Dynamax Band', 'Vòng Dynamax'],
  ['teraOrb', 'Tera Orb', 'Ngọc Tera']
]) {
  newItems.push({ id, category: 'keyItem' })
  name('items', id, en, vi)
}
for (const form of species.filter((entry) => entry.formKind === 'mega')) {
  if (MEGA_SKILLS[form.id]) continue
  const baseName = speciesEn[form.formOf] ?? form.formOf
  const en = STONE_NAMES[form.id] ?? defaultStoneName(baseName)
  const id = `${form.id}Stone`
  const auto = AUTO_STONES.includes(form.id)
  newItems.push({
    id,
    category: 'megaStone',
    price: 5000,
    shop: true,
    shopWeight: 1,
    requiresKeyItemId: auto ? undefined : 'megaRing',
    formId: form.id,
    ...(auto ? { auto: true } : {})
  })
  name('items', id, en, STONE_NAMES_VI[form.id] ?? `Đá ${en}`)
}
for (const elementId of [...elements, STELLAR]) {
  const id = `${elementId}TeraShard`
  newItems.push({
    id,
    category: 'teraShard',
    price: 500,
    shop: true,
    shopWeight: 2,
    requiresKeyItemId: 'teraOrb',
    elementId
  })
  const en = elementId === STELLAR ? 'Stellar' : elementEn[elementId]
  const vi = elementId === STELLAR ? 'Tinh tú' : elementVi[elementId]
  name('items', id, `${en} Tera Shard`, `Mảnh Tera ${vi}`)
}
for (const [id, en, vi, price, effect] of [
  ['maxSoup', 'Max Soup', 'Súp Max', 2000, { type: 'toggleGmaxFactor', params: {} }],
  [
    'dynamaxCandy',
    'Dynamax Candy',
    'Kẹo Dynamax',
    3000,
    { type: 'dynamaxLevelUp', params: { levels: 1 } }
  ]
]) {
  newItems.push({
    id,
    category: 'consumable',
    price,
    shop: true,
    shopWeight: 2,
    requiresKeyItemId: 'dynamaxBand',
    use: 'field',
    target: 'ally',
    effects: [effect]
  })
  name('items', id, en, vi)
}
const newItemIds = new Set(newItems.map((item) => item.id))
// JSON.stringify bỏ trường undefined (đá tự kích hoạt không cần Vòng Mega để vào cửa hàng).
write('items.json', [...items.filter((item) => !newItemIds.has(item.id)), ...newItems])

// Map power spot
const biomes = read('biomes.json')
for (const biome of biomes) {
  delete biome.powerSpot
  if (POWER_SPOTS.includes(biome.id)) biome.powerSpot = true
}
write('biomes.json', biomes)

for (const language of ['en', 'vi']) {
  write(`i18n/${language}/items.json`, texts[language].items)
  write(`i18n/${language}/skills.json`, texts[language].skills)
}

console.log(
  `Chiêu Max ${MAX_MOVES.length}, G-Max ${Object.keys(gmaxSkillOf).length} (+${planned.length} chờ), ` +
    `vật phẩm ${newItems.length}, power spot ${POWER_SPOTS.length}`
)
