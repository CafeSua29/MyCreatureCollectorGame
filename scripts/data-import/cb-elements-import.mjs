/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Ba hệ của Cassette Beasts game chưa có: Thủy tinh (glass), Nhựa (plastic), Kim tuyến (glitter), xem
// docs/rules/element-reactions.md. Thêm hệ + khắc hệ theo bảng gốc, đồ theo hệ (chép mẫu của hệ đá),
// chiêu của ba hệ, đổi hệ các loài đúng gốc, học chiêu theo nhãn (tags) của bản gốc.
// Nguồn: Data:Moves, Data:Species của wiki, lưu ở cb-elements-source.json; `--fetch` tải lại.
// Chạy lại được: mục đã có thì giữ. Chạy trước element-reactions-import.mjs.
//
// Chạy: node scripts/data-import/cb-elements-import.mjs [--fetch]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import {
  addElementContent,
  addSkills,
  addStatuses,
  readJson,
  writeJson
} from './element-common.mjs'

const WIKI = 'https://wiki.cassettebeasts.com/wiki/'
const SOURCE = new URL('./cb-elements-source.json', import.meta.url)
const NEW_ELEMENTS = {
  glass: { suffix: 'Glass', vi: 'Thủy tinh', viTitle: 'Thủy Tinh', en: 'Glass' },
  plastic: { suffix: 'Plastic', vi: 'Nhựa', viTitle: 'Nhựa', en: 'Plastic' },
  glitter: { suffix: 'Glitter', vi: 'Kim tuyến', viTitle: 'Kim Tuyến', en: 'Glitter' }
}
const NEW_TYPES = { Glass: 'glass', Plastic: 'plastic', Glitter: 'glitter' }

// Khắc hệ từ bảng gốc: ô debuff = ×2, ô buff = ×0,5, ô biến hệ = ×1 (gốc +30% / −23%, quy về thang
// Pokémon của game); Glitter không khắc, không bị khắc như gốc.
const EFFECTIVENESS = {
  glass: { electric: 2 },
  plastic: { psychic: 2, electric: 2, fire: 0.5 },
  normal: { glass: 2 },
  steel: { glass: 2 },
  flying: { glass: 2 },
  ground: { plastic: 2 },
  electric: { plastic: 0.5 }
}

const attack = (id, elementId, category, power, fields = {}) => ({
  id,
  elementId,
  category,
  power,
  accuracy: 100,
  target: 'enemy',
  effects: [],
  priority: 0,
  ...(category === 'physical' ? { contact: true } : {}),
  ...fields
})
const support = (id, elementId, effects, fields = {}) => ({
  id,
  elementId,
  category: 'status',
  power: 0,
  accuracy: 100,
  target: 'self',
  effects,
  priority: 0,
  snatchable: true,
  ...fields
})
// Lớp phủ của gốc có thời hạn 3 lượt (như lớp phủ của phản ứng hệ).
// 1 AP của gốc = 10 thể lực (thanh AP gốc 10, thang thể lực 100).
const AP_STAMINA = 10
const COATING_TURNS = 3
const coating = (elementId) => [{ type: 'transmute', params: { elementId, turns: COATING_TURNS } }]
// Hệ gốc → hệ của game.
const CB_TYPES = {
  Air: 'flying',
  Astral: 'psychic',
  Beast: 'normal',
  Earth: 'ground',
  Fire: 'fire',
  Glass: 'glass',
  Ice: 'ice',
  Lightning: 'electric',
  Metal: 'steel',
  Plant: 'grass',
  Plastic: 'plastic',
  Poison: 'poison',
  Water: 'water'
}
const capitalized = (id) => `${id[0].toUpperCase()}${id.slice(1)}`
/** Trạng thái tường của hệ; mọi hệ của game đều có (Elemental Wall theo hệ quái dùng). */
const wallStatusId = (elementId) => `wall${capitalized(elementId)}`
// Tường của gốc: quái dùng mất 20% HP, chặn tối đa 3 đòn, tối đa 3 lượt; TARGET_ONE: mặc định chính
// quái, đặt được lên đồng đội hoặc địch.
const WALL_HITS = 3
const WALL_TURNS = 3
// Mọi loài cùng hệ học qua sách (tường / Coating / Camouflage; chủ project chốt 2026-11-06).
const BY_ELEMENT = { bookForElement: true }
const wallSkill = (id, elementId, params, hpCostPercent = 20) => {
  const effects = [{ type: 'wall', params: { ...params, hpCostPercent } }]
  return {
    ...support(id, elementId, effects, { snatchable: undefined, ...BY_ELEMENT }),
    onAlly: effects,
    onFoe: effects
  }
}
/** Coating của gốc (TARGET_ONE_ALLY): chính quái hoặc đồng đội. */
const coatingSkill = (id, elementId, params) => {
  const effects = [{ type: 'transmute', params: { ...params, turns: COATING_TURNS } }]
  return {
    ...support(id, elementId, effects, { snatchable: undefined, ...BY_ELEMENT }),
    onAlly: effects
  }
}
const applyStatus = (statusId) => [{ type: 'applyStatus', params: { statusId } }]
const debuff = (id, elementId, effects) => ({
  id,
  elementId,
  category: 'status',
  power: 0,
  accuracy: 100,
  target: 'enemy',
  effects,
  priority: 0,
  reflectable: true
})
/** Skill chỉ bị động (is_passive_only của gốc): không dùng bằng lệnh, tác dụng qua `passive`. */
const passiveOnly = (id, elementId, passive) => ({
  id,
  elementId,
  category: 'status',
  power: 0,
  accuracy: 100,
  target: 'self',
  effects: [],
  priority: 0,
  passive
})
/** Resistance của gốc: −50% sát thương hệ đó (trừ chí mạng), không chịu phản ứng của hệ đó. */
const resistance = (elementId) =>
  passiveOnly(`${elementId}Resistance`, elementId, {
    hooks: [
      {
        type: 'elementDamageTaken',
        params: { elementIds: [elementId], percent: -50, exceptCritical: true }
      },
      { type: 'blocksElementReactions', params: { elementIds: [elementId] } }
    ]
  })
/** Camouflage của gốc: dùng được, và tự dùng (không tốn gì) một lần lúc đầu trận. */
const camouflage = (id, elementId) => ({
  ...support(id, elementId, coating(elementId), { snatchable: undefined, ...BY_ELEMENT }),
  passive: { onBattleStart: coating(elementId), usable: true }
})
const lowerFoes = (stat) => [
  { type: 'sideStatStage', params: { side: 'foe', stats: [stat], delta: -1 } }
]

// Mọi chiêu gốc của ba hệ. [tên gốc, skill, vi, en]. Lệch gốc: Brick Blast đánh cả đội 2 đòn nên gộp
// power 80 (game chặn đánh nhiều lần trên skill nhắm mọi địch); Recycle đổi AP thành Sung sức (chưa có
// thể lực, stamina.md).
const NEW_ELEMENT_LABELS = {
  vi: (id) => readJson('i18n/vi/elements.json')[id].toLowerCase(),
  en: (id) => readJson('i18n/en/elements.json')[id]
}
const generatedMoves = () =>
  Object.entries(CB_TYPES).flatMap(([name, elementId]) => {
    const key = name.toLowerCase()
    const vi = NEW_ELEMENT_LABELS.vi(elementId)
    return [
      [
        `${name} Wall`,
        wallSkill(`${key}Wall`, elementId, { statusId: wallStatusId(elementId) }),
        `Tường hệ ${vi}`,
        `${name} Wall`
      ],
      [
        `${name} Coating`,
        coatingSkill(`${key}Coating`, elementId, { elementId }),
        `Phủ ${vi}`,
        `${name} Coating`
      ],
      [
        `${name} Camouflage`,
        camouflage(`${key}Camouflage`, elementId),
        `Ngụy trang ${vi}`,
        `${name} Camouflage`
      ]
    ]
  })

const BASE_MOVES = [
  [
    'Elemental Wall',
    wallSkill('elementalWall', 'normal', { elementFromUser: true }),
    'Tường nguyên tố',
    'Elemental Wall'
  ],
  [
    'Elemental Coating',
    coatingSkill('elementalCoating', 'normal', { elementFromUser: true }),
    'Phủ nguyên tố',
    'Elemental Coating'
  ],
  [
    'Gemstone Wall',
    wallSkill('gemstoneWall', 'ground', { statusId: 'gemstoneWall' }),
    'Tường đá quý',
    'Gemstone Wall'
  ],
  [
    'Abramacabra',
    wallSkill('abramacabra', 'normal', { statusId: 'abramacabra' }),
    'Abramacabra',
    'Abramacabra'
  ],
  [
    'Temptation',
    // Của Archangel Mourningstar: tường Apple Tree, mất 10% HP (gốc).
    wallSkill('temptation', 'grass', { statusId: 'appleTree' }, 10),
    'Cám dỗ',
    'Temptation'
  ],
  [
    'Judgement',
    // Đòn thiên thần của Mourningstar: sét 200 power cả đội địch, không né được, phá tường, 10 AP.
    attack('judgement', 'electric', 'special', 200, {
      target: 'allEnemies',
      alwaysHits: true,
      destroysWalls: true,
      staminaCost: 100
    }),
    'Thiên phạt',
    'Judgement'
  ],
  [
    'Crossfade',
    // Gốc: đổi dạng (băng cassette) mà giữ hệ bằng lớp phủ, priority cao nhất; game: rút về, quái vào
    // thay nhận lớp phủ hệ của quái rút về.
    support(
      'crossfade',
      'normal',
      [{ type: 'switchOut', params: { coatIncomingTurns: COATING_TURNS } }],
      {
        snatchable: undefined,
        typeless: true,
        priority: 5
      }
    ),
    'Giao thoa',
    'Crossfade'
  ],
  [
    'Paint Swipe',
    // Gốc Typeless: lấy hệ quái dùng (đang phủ thì là hệ của lớp phủ); chỉ dùng khi có lớp phủ, luôn
    // đi sau cùng, chuyển lớp phủ sang mục tiêu.
    attack('paintSwipe', 'normal', 'physical', 90, {
      elementFromUser: 'first',
      requiresCoating: true,
      priority: -7,
      effects: [{ type: 'transferCoating', params: {} }]
    }),
    'Quệt sơn',
    'Paint Swipe'
  ],
  [
    'Crumble',
    support(
      'crumble',
      'ground',
      [{ type: 'crumbleWalls', params: { power: 30, elementId: 'ground' } }],
      {
        snatchable: undefined
      }
    ),
    'Sụp đổ',
    'Crumble'
  ],
  [
    'Hurricane',
    attack('cbHurricane', 'flying', 'special', 90, {
      target: 'allEnemies',
      destroysWalls: true,
      effects: [{ type: 'setField', params: { layer: 'weather', fieldId: 'strongWinds' } }]
    }),
    'Cuồng phong phá tường',
    'Hurricane (CB)'
  ],
  [
    'Cosmic Kunai',
    attack('cosmicKunai', 'psychic', 'special', 150, { target: 'allEnemies', destroysWalls: true }),
    'Phi tiêu vũ trụ',
    'Cosmic Kunai'
  ],
  [
    'Throw',
    attack('wallThrow', 'normal', 'special', 50, { elementFromUser: 'first', consumesWall: true }),
    'Ném tường',
    'Throw (CB)'
  ],
  [
    'Ricochet',
    passiveOnly('cbRicochet', 'normal', {
      hooks: [{ type: 'wallIgnoreChance', params: { percent: 50 } }]
    }),
    'Bật nảy',
    'Ricochet (CB)'
  ],
  ['Window', debuff('window', 'glass', applyStatus('window')), 'Cửa sổ', 'Window'],
  [
    'Revolving Door',
    debuff('revolvingDoor', 'glass', [{ type: 'stealWall', params: {} }]),
    'Cửa xoay',
    'Revolving Door'
  ],
  [
    'Glass Bonds',
    debuff('glassBonds', 'glass', applyStatus('glassBonds')),
    'Xiềng thủy tinh',
    'Glass Bonds'
  ],
  [
    'Recycle',
    support('plasticRecycle', 'plastic', [
      { type: 'recycleWall', params: { staminaPerTurn: AP_STAMINA } }
    ]),
    'Tái chế nhựa',
    'Recycle (Plastic)'
  ],
  [
    'Sticker Trick',
    debuff('stickerTrick', 'glitter', [{ type: 'stickerTrick', params: { turns: 3, power: 30 } }]),
    'Trò dán nhãn',
    'Sticker Trick'
  ],
  [
    'Spring-Load',
    passiveOnly('springLoad', 'plastic', { onEntry: applyStatus('springLoaded') }),
    'Nạp lò xo',
    'Spring-Load'
  ],
  [
    'Prismatic',
    passiveOnly('prismatic', 'glitter', { turnEnd: [{ type: 'transmuteRandom', params: {} }] }),
    'Lăng kính',
    'Prismatic'
  ],
  ['Glass Resistance', resistance('glass'), 'Kháng thủy tinh', 'Glass Resistance'],
  ['Plastic Resistance', resistance('plastic'), 'Kháng nhựa', 'Plastic Resistance'],
  ['Glitter Resistance', resistance('glitter'), 'Kháng kim tuyến', 'Glitter Resistance'],
  [
    'Crystal Lens',
    attack('crystalLens', 'glass', 'special', 60),
    'Thấu kính pha lê',
    'Crystal Lens'
  ],
  [
    'Glass Cannon',
    attack('glassCannon', 'glass', 'special', 120, { recoilPercent: 25 }),
    'Pháo thủy tinh',
    'Glass Cannon'
  ],
  ['Silicon Slash', attack('siliconSlash', 'glass', 'physical', 60), 'Chém silic', 'Silicon Slash'],
  [
    'Bottle Volley',
    attack('bottleVolley', 'glass', 'special', 40, { hits: { min: 1, max: 3 } }),
    'Loạt chai',
    'Bottle Volley'
  ],
  ['Toy Hammer', attack('toyHammer', 'plastic', 'physical', 60), 'Búa đồ chơi', 'Toy Hammer'],
  [
    'Clockwork Mouse',
    attack('clockworkMouse', 'plastic', 'physical', 120),
    'Chuột lên dây cót',
    'Clockwork Mouse'
  ],
  [
    'Suction Cup Dart',
    attack('suctionCupDart', 'plastic', 'special', 120, { accuracy: 75 }),
    'Phi tiêu giác hút',
    'Suction Cup Dart'
  ],
  [
    'Brick Blast',
    attack('brickBlast', 'plastic', 'special', 80, { target: 'allEnemies' }),
    'Bão gạch nhựa',
    'Brick Blast'
  ],
  [
    'Plastic Knife',
    attack('plasticKnife', 'plastic', 'physical', 40, { hits: { min: 2, max: 2 } }),
    'Dao nhựa',
    'Plastic Knife'
  ],
  [
    'Traffic Jam',
    support('trafficJam', 'plastic', lowerFoes('speed'), { snatchable: undefined }),
    'Tắc đường',
    'Traffic Jam'
  ],
  ['Glitter Bomb', attack('glitterBomb', 'glitter', 'special', 30), 'Bom kim tuyến', 'Glitter Bomb']
]

// Chiêu game cần theo hệ mà gốc không có: chiêu Max, Z-Move, thần thông mạnh của hệ Kim tuyến (gốc chỉ
// có một đòn 30 power).
const SYSTEM_SKILLS = [
  [
    {
      ...attack('maxShatter', 'glass', 'physical', 100),
      contact: undefined,
      effects: lowerFoes('defense'),
      maxMove: 'max',
      alwaysHits: true
    },
    'Max Vỡ vụn',
    'Max Shatter'
  ],
  [
    {
      ...attack('maxMold', 'plastic', 'physical', 100),
      contact: undefined,
      effects: lowerFoes('speed'),
      maxMove: 'max',
      alwaysHits: true
    },
    'Max Khuôn đúc',
    'Max Mold'
  ],
  [
    {
      ...attack('maxGlitz', 'glitter', 'physical', 100),
      contact: undefined,
      effects: lowerFoes('accuracy'),
      maxMove: 'max',
      alwaysHits: true
    },
    'Max Lấp lánh',
    'Max Glitz'
  ],
  [
    {
      ...attack('shatteringShardstorm', 'glass', 'physical', 100),
      contact: undefined,
      zMove: 'z',
      alwaysHits: true
    },
    'Bão Mảnh Thủy Tinh',
    'Shattering Shardstorm'
  ],
  [
    {
      ...attack('titanicToybox', 'plastic', 'physical', 100),
      contact: undefined,
      zMove: 'z',
      alwaysHits: true
    },
    'Rương Đồ Chơi Khổng Lồ',
    'Titanic Toybox'
  ],
  [
    {
      ...attack('glitterfallCascade', 'glitter', 'physical', 100),
      contact: undefined,
      zMove: 'z',
      alwaysHits: true
    },
    'Thác Kim Tuyến',
    'Glitterfall Cascade'
  ],
  [attack('glitterStorm', 'glitter', 'special', 120), 'Bão kim tuyến', 'Glitter Storm'],
  // Đòn của tường Abramacabra (gốc: 30 power, hệ Beast, tầm xa), không ai học.
  [attack('macabraMissile', 'normal', 'special', 30), 'Tên lửa Macabra', 'Macabra Missile']
]

const allMoves = () => [...BASE_MOVES, ...generatedMoves()]

const DIVINE_SKILLS = {
  glass: ['glassCannon', 'siliconSlash'],
  plastic: ['clockworkMouse', 'suctionCupDart'],
  glitter: ['glitterStorm', 'glitterBomb']
}
const WORK_PERCENTS = {
  glass: { mining: 50 },
  plastic: { transporting: 50 },
  glitter: { caring: 50 }
}
// Cấp học của quái cùng hệ (gốc học qua băng cassette, game có learnset theo level).
const LEARN_LEVELS = {
  crystalLens: 10,
  siliconSlash: 16,
  bottleVolley: 22,
  glassWall: 26,
  glassCoating: 30,
  glassCannon: 40,
  toyHammer: 10,
  plasticKnife: 16,
  plasticCoating: 22,
  plasticWall: 26,
  brickBlast: 32,
  glassResistance: 5,
  plasticResistance: 5,
  window: 12,
  glassCamouflage: 14,
  plasticCamouflage: 14,
  glassBonds: 20,
  plasticRecycle: 30,
  revolvingDoor: 34
}

// Trạng thái riêng của chiêu ba hệ: [id, vi, en, trọng số AI, định nghĩa].
const wallStatus = (wall) => ({
  kind: 'buff',
  duration: { min: WALL_TURNS, max: WALL_TURNS },
  hooks: [],
  battleOnly: true,
  endsOnLeave: true,
  wall: { hits: WALL_HITS, ...wall },
  // Tường thường thay nhau; tường đặc biệt tồn tại song song (gỡ tường thường ở trận).
  ...(wall.special ? {} : { exclusiveGroup: 'wall', overwritesGroup: true })
})
const wallStatuses = () =>
  readJson('elements.json').map(({ id }) => [
    wallStatusId(id),
    `Tường ${NEW_ELEMENT_LABELS.vi(id)}`,
    `${NEW_ELEMENT_LABELS.en(id)} Wall`,
    0.1,
    wallStatus({ elementId: id })
  ])
const STATUSES = () => [
  ...wallStatuses(),
  [
    'appleTree',
    'Cây táo',
    'Apple Tree',
    0.15,
    wallStatus({
      elementId: 'grass',
      special: true,
      // Gốc: kẻ đánh "hái táo": 33% bị độc, 67% hồi 10% máu hiện tại.
      onBlocked: [
        { weight: 33, effects: [{ type: 'applyStatus', params: { statusId: 'poison' } }] },
        {
          weight: 67,
          effects: [{ type: 'heal', params: { percent: 10, who: 'target', basis: 'current' } }]
        }
      ]
    })
  ],
  [
    'gemstoneWall',
    'Tường đá quý',
    'Gemstone Wall',
    0.15,
    { ...wallStatus({ elementId: 'ground', special: true }), staminaPerTurn: AP_STAMINA }
  ],
  [
    'abramacabra',
    'Abramacabra',
    'Abramacabra',
    0.15,
    wallStatus({ elementId: 'normal', special: true, attackSkillId: 'macabraMissile' })
  ],
  [
    'window',
    'Cửa sổ',
    'Window',
    0.05,
    {
      kind: 'debuff',
      duration: { min: 3, max: 3 },
      hooks: [],
      battleOnly: true,
      seeThroughWall: true
    }
  ],
  [
    'glassBonds',
    'Xiềng thủy tinh',
    'Glass Bonds',
    0.1,
    {
      kind: 'debuff',
      duration: { min: 3, max: 3 },
      hooks: [],
      battleOnly: true,
      damageOnTransform: 25
    }
  ],
  [
    'springLoaded',
    'Lên dây cót',
    'Spring-Loaded',
    0.1,
    { kind: 'buff', hooks: [], battleOnly: true, endsOnLeave: true, meleeAsRanged: true }
  ]
]
const newElements = () =>
  Object.entries(NEW_ELEMENTS).map(([id, el]) => ({
    id,
    ...el,
    divineSkills: DIVINE_SKILLS[id],
    workPercents: WORK_PERCENTS[id]
  }))

const SIGNATURE_LEVEL = 36
// Archangel không có trong Data:Species: chiêu của game này có trong bộ chiêu gốc của loài (trang wiki).
// Chiêu riêng của Archangel cũng không có trong Data:Moves (nhãn = tên loài để học như chiêu riêng).
const ARCHANGEL_MOVES = [
  { name: 'Temptation', elemental_type: 'Plant', tags: ['mourningstar'] },
  { name: 'Judgement', elemental_type: 'Lightning', tags: ['mourningstar'], ap_cost: 10 }
]
const ARCHANGELS = [
  {
    name: 'Mourningstar',
    elemental_type: 'Typeless',
    tags: [],
    known: ['Temptation', 'Crumble', 'Judgement']
  }
]
const LISTED_BASE_LEVEL = 5
const LISTED_LEVEL_STEP = 6
// Nhãn chung của gốc không nói về nội dung chiêu nên không dùng để ghép loài.
const GENERIC_TAGS = new Set(['any', 'offense', 'support', 'passive', 'unsellable'])

const asId = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

async function fetchJson(page) {
  const response = await fetch(`${WIKI}${page}?action=raw`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  if (!response.ok) throw new Error(`Tải ${page} lỗi ${response.status}`)
  return response.json()
}

async function loadSource() {
  if (!process.argv.includes('--fetch') && existsSync(SOURCE)) {
    return JSON.parse(readFileSync(SOURCE, 'utf8'))
  }
  const [moves, species] = await Promise.all([fetchJson('Data:Moves'), fetchJson('Data:Species')])
  const source = {
    moves: moves.map(({ name, elemental_type, tags, ap_cost }) => ({
      name,
      elemental_type,
      tags,
      ap_cost
    })),
    species: species.map((entry) => ({
      name: entry.name,
      elemental_type: entry.elemental_type,
      tags: entry.moves.tags,
      known: [...entry.moves.initial, ...entry.moves.upgrades]
    }))
  }
  writeFileSync(SOURCE, JSON.stringify(source, null, 2) + '\n')
  return source
}

/** Đổi hệ các loài đúng gốc; quái cùng hệ học chiêu, loài có nhãn trùng học qua sách. */
function updateSpecies(source) {
  const species = readJson('species.json')
  const byKey = new Map(
    species
      .filter((entry) => entry.source === 'cassetteBeasts')
      .map((entry) => [asId(entry.id), entry])
  )
  const moves = [...source.moves, ...ARCHANGEL_MOVES]
    .map((move) => ({ ...move, skill: allMoves().find(([name]) => name === move.name)?.[1] }))
    .filter((move) => move.skill)
  const report = []
  for (const entry of [...source.species, ...ARCHANGELS]) {
    const target = byKey.get(asId(entry.name))
    if (!target) continue
    const elementId = NEW_TYPES[entry.elemental_type]
    if (elementId) {
      target.elementIds = [elementId]
      report.push(target.id)
    }
    for (const move of moves) {
      const { skill, tags } = move
      const shared = tags.filter((tag) => !GENERIC_TAGS.has(tag) && entry.tags.includes(tag))
      const signature = tags.includes(asId(entry.name))
      // Loài có chiêu trong danh sách gốc học theo thứ tự danh sách; không thì theo hệ / nhãn riêng.
      const listed = entry.known.indexOf(move.name)
      const level =
        listed >= 0
          ? LISTED_BASE_LEVEL + listed * LISTED_LEVEL_STEP
          : skill.elementId === elementId
            ? LEARN_LEVELS[skill.id]
            : undefined
      const known = target.learnset.some((learn) => learn.skillId === skill.id)
      if (signature || level !== undefined) {
        if (!known) target.learnset.push({ level: level ?? SIGNATURE_LEVEL, skillId: skill.id })
      } else if (shared.length > 0 && !known) {
        const books = (target.bookSkillIds ??= [])
        if (!books.includes(skill.id)) books.push(skill.id)
      }
    }
  }
  writeJson('species.json', species)
  return report
}

/** Giá thể lực của chiêu gốc theo AP của gốc. */
function withApCost(source, name, skill) {
  const ap = source.moves.find((move) => move.name === name)?.ap_cost
  return Number.isInteger(ap) ? { ...skill, staminaCost: ap * AP_STAMINA } : skill
}

const source = await loadSource()
addElementContent(newElements(), EFFECTIVENESS)
addStatuses(STATUSES())
addSkills([
  ...allMoves().map(([name, skill, vi, en]) => [withApCost(source, name, skill), vi, en]),
  ...SYSTEM_SKILLS
])
const changed = updateSpecies(source)
console.log(`Đổi hệ ${changed.length} loài: ${changed.join(', ')}`)
