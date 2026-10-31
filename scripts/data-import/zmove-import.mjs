/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập dữ liệu Z-Move (docs/rules/z-moves.md) từ dữ liệu Pokémon Showdown: config.transform.zMove,
// Vòng Z (tầng đạo quán), Z-Move theo hệ (+ hệ ánh sáng tự đặt), Z-Move riêng của loài, Z-Crystal hệ
// / loài, zPower (power Z-Move khác bảng) và zEffects (Z-Power của skill trạng thái), tên vi / en. Phần cần cơ chế chưa có ghi vào zmoves-planned.json, báo cáo ở
// zmoves-report.json. Chạy lại được (ghi đè các mục cùng id).
// File JS của Showdown được đọc bằng AST (acorn), không chạy code tải về.
// Chạy: node scripts/data-import/zmove-import.mjs rồi npx prettier --write src/data scripts/data-import

import fs from 'node:fs'
import path from 'node:path'
import { fetchShowdown, showdownId } from './showdown.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const write = (file, value) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')
const writeScript = (file, value) =>
  fs.writeFileSync(
    path.join(root, 'scripts/data-import', file),
    JSON.stringify(value, null, 2) + '\n'
  )

/** Tên loài Showdown ("Raichu-Alola", "Tapu Koko", "Kommo-o") → id loài của game. */
const speciesIdOf = (name) =>
  name
    .split(/[- ]/)
    .map((part, i) =>
      i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('')

// ---------- config (số như Pokémon) ----------

const ZMOVE_CONFIG = {
  keyItemId: 'zRing',
  powerTable: {
    steps: [
      { below: 60, power: 100 },
      { below: 70, power: 120 },
      { below: 80, power: 140 },
      { below: 90, power: 160 },
      { below: 100, power: 175 },
      { below: 110, power: 180 },
      { below: 120, power: 185 },
      { below: 130, power: 190 },
      { below: 140, power: 195 }
    ],
    top: 200
  },
  variableHitsPowerFactor: 3,
  protectDamagePercent: 25,
  crystalDropChance: 10
}
/** Tầng đạo quán nhận Vòng Z (sau Tera Orb 10, Vòng Mega 20, Dynamax Band 30). */
const ZRING_FLOOR = 40

/** Bảng power Z-Move như Showdown (skill đánh 2–5 đòn × 3 trước khi tra). */
function tablePower(power) {
  const { steps, top } = ZMOVE_CONFIG.powerTable
  return steps.find((step) => power < step.below)?.power ?? top
}

// ---------- Z-Move theo hệ: [hệ, id, en, vi] (ánh sáng không có trong Pokémon: tự đặt) ----------

const ELEMENT_ZMOVES = [
  ['normal', 'breakneckBlitz', 'Breakneck Blitz', 'Cuồng Tốc Tất Sát'],
  ['fighting', 'allOutPummeling', 'All-Out Pummeling', 'Liên Quyền Toàn Lực'],
  ['flying', 'supersonicSkystrike', 'Supersonic Skystrike', 'Siêu Thanh Thiên Kích'],
  ['poison', 'acidDownpour', 'Acid Downpour', 'Mưa Axit Diệt Vong'],
  ['ground', 'tectonicRage', 'Tectonic Rage', 'Địa Chấn Cuồng Nộ'],
  ['rock', 'continentalCrush', 'Continental Crush', 'Lục Địa Nghiền Nát'],
  ['bug', 'savageSpinOut', 'Savage Spin-Out', 'Kén Tơ Cuồng Bạo'],
  ['ghost', 'neverEndingNightmare', 'Never-Ending Nightmare', 'Ác Mộng Vô Tận'],
  ['steel', 'corkscrewCrash', 'Corkscrew Crash', 'Mũi Khoan Thép'],
  ['fire', 'infernoOverdrive', 'Inferno Overdrive', 'Hỏa Ngục Bùng Nổ'],
  ['water', 'hydroVortex', 'Hydro Vortex', 'Xoáy Nước Khổng Lồ'],
  ['grass', 'bloomDoom', 'Bloom Doom', 'Vạn Hoa Diệt Thế'],
  ['electric', 'gigavoltHavoc', 'Gigavolt Havoc', 'Giga Vôn Tàn Phá'],
  ['psychic', 'shatteredPsyche', 'Shattered Psyche', 'Tâm Trí Tan Vỡ'],
  ['ice', 'subzeroSlammer', 'Subzero Slammer', 'Băng Giá Tuyệt Đối'],
  ['dragon', 'devastatingDrake', 'Devastating Drake', 'Long Thần Hủy Diệt'],
  ['dark', 'blackHoleEclipse', 'Black Hole Eclipse', 'Hố Đen Nhật Thực'],
  ['fairy', 'twinkleTackle', 'Twinkle Tackle', 'Tinh Quang Lao Kích'],
  ['light', 'seraphicSunburst', 'Seraphic Sunburst', 'Thiên Sứ Quang Bộc']
]
/** Tên en crystal hệ không có trong Pokémon (hệ khác lấy tên của Showdown). */
const CRYSTAL_NAMES = { light: 'Luminium Z' }

// ---------- Z-Move riêng: số theo Showdown; phần cơ chế chưa có ghi ở `dropped` ----------

const ALL_STATS = ['attack', 'defense', 'spAttack', 'spDefense', 'speed']
const selfStages = (delta) =>
  ALL_STATS.map((stat) => ({ type: 'statStage', params: { who: 'self', stat, delta } }))

/** Showdown id → [id game, en, vi, phần dữ liệu riêng, phần bỏ (cơ chế chưa có)]. */
const SIGNATURES = {
  catastropika: ['catastropika', 'Catastropika', 'Thảm Họa Pika', {}],
  '10000000voltthunderbolt': [
    'tenMillionVoltThunderbolt',
    '10,000,000 Volt Thunderbolt',
    'Mười Triệu Vôn Sấm Sét',
    // critRatio 3 của Showdown = +2 bậc chí mạng.
    { critStage: 2 }
  ],
  stokedsparksurfer: [
    'stokedSparksurfer',
    'Stoked Sparksurfer',
    'Lướt Sóng Điện',
    { effects: [{ type: 'applyStatus', params: { statusId: 'paralysis' } }] }
  ],
  extremeevoboost: [
    'extremeEvoboost',
    'Extreme Evoboost',
    'Tiến Hóa Cực Đại',
    { target: 'self', effects: selfStages(2) }
  ],
  pulverizingpancake: ['pulverizingPancake', 'Pulverizing Pancake', 'Bánh Kếp Nghiền Nát', {}],
  genesissupernova: [
    'genesisSupernova',
    'Genesis Supernova',
    'Siêu Tân Tinh Sáng Thế',
    { effects: [{ type: 'setField', params: { layer: 'terrain', fieldId: 'psychicTerrain' } }] }
  ],
  sinisterarrowraid: ['sinisterArrowRaid', 'Sinister Arrow Raid', 'Mưa Tên U Linh', {}],
  maliciousmoonsault: ['maliciousMoonsault', 'Malicious Moonsault', 'Nguyệt Lộn Ác Độc', {}],
  oceanicoperetta: ['oceanicOperetta', 'Oceanic Operetta', 'Hải Dương Ca Kịch', {}],
  soulstealing7starstrike: [
    'soulStealing7StarStrike',
    'Soul-Stealing 7-Star Strike',
    'Thất Tinh Đoạt Hồn',
    {}
  ],
  clangoroussoulblaze: [
    'clangorousSoulblaze',
    'Clangorous Soulblaze',
    'Long Lân Hồn Diễm',
    // Tự tăng bậc một lần cho cả chiêu đánh mọi địch: hiệu ứng sau chiêu của spell.
    {
      target: 'allEnemies',
      spell: { after: [{ do: 'stage', to: 'self', stats: ALL_STATS, delta: 1 }] }
    }
  ],
  splinteredstormshards: [
    'splinteredStormshards',
    'Splintered Stormshards',
    'Bão Đá Vỡ Vụn',
    { effects: [{ type: 'clearField', params: { layer: 'terrain' } }] }
  ],
  letssnuggleforever: ['letsSnuggleForever', "Let's Snuggle Forever", 'Ôm Ấp Mãi Mãi', {}],
  searingsunrazesmash: [
    'searingSunrazeSmash',
    'Searing Sunraze Smash',
    'Nhật Quang Thiêu Đốt',
    { ignoresAbility: true }
  ],
  menacingmoonrazemaelstrom: [
    'menacingMoonrazeMaelstrom',
    'Menacing Moonraze Maelstrom',
    'Nguyệt Quang Hắc Xoáy',
    { ignoresAbility: true }
  ],
  // Light That Burns the Sky (Ultra Necrozma sau Ultra Burst): loại theo công / đặc công cao hơn,
  // bỏ qua ability như Photon Geyser.
  lightthatburnsthesky: [
    'lightThatBurnsTheSky',
    'Light That Burns the Sky',
    'Ánh Sáng Thiêu Rụi Bầu Trời',
    { ignoresAbility: true, categoryRule: 'higherAttack' }
  ],
  // Guardian of Alola: sát thương bằng 75% máu hiện tại của mục tiêu.
  guardianofalola: [
    'guardianOfAlola',
    'Guardian of Alola',
    'Thần Hộ Mệnh Alola',
    { power: 1, fixedDamage: { kind: 'targetHpPercent', percent: 75 } }
  ]
}
/** Z-Move riêng chờ cơ chế: Showdown id → [id, en, vi, cơ chế cần]. */
const PLANNED_SIGNATURES = {}
/**
 * Ultra Burst (transformation.md): crystal → loài biến được và dạng (như Pokémon: Necrozma Dusk Mane /
 * Dawn Wings cầm Ultranecrozium Z thành Ultra Necrozma).
 */
const ULTRA_BURST = {
  ultranecroziumz: {
    fromSpeciesIds: ['necrozmaDuskMane', 'necrozmaDawnWings'],
    formId: 'necrozmaUltra'
  }
}
/** Tên vi của crystal loài (en theo Showdown). */
const SIGNATURE_CRYSTAL_VI = {
  aloraichiumz: 'Pha Lê Z Raichu Alola',
  decidiumz: 'Pha Lê Z Decidueye',
  eeviumz: 'Pha Lê Z Eevee',
  inciniumz: 'Pha Lê Z Incineroar',
  kommoniumz: 'Pha Lê Z Kommo-o',
  lunaliumz: 'Pha Lê Z Lunala',
  lycaniumz: 'Pha Lê Z Lycanroc',
  marshadiumz: 'Pha Lê Z Marshadow',
  mewniumz: 'Pha Lê Z Mew',
  mimikiumz: 'Pha Lê Z Mimikyu',
  pikaniumz: 'Pha Lê Z Pikachu',
  pikashuniumz: 'Pha Lê Z Pikachu Mũ',
  primariumz: 'Pha Lê Z Primarina',
  snorliumz: 'Pha Lê Z Snorlax',
  solganiumz: 'Pha Lê Z Solgaleo',
  tapuniumz: 'Pha Lê Z Tapu',
  ultranecroziumz: 'Pha Lê Z Necrozma'
}

// ---------- Z-Power của skill trạng thái ----------

const BOOST_STATS = {
  atk: 'attack',
  def: 'defense',
  spa: 'spAttack',
  spd: 'spDefense',
  spe: 'speed',
  accuracy: 'accuracy',
  evasion: 'evasion'
}
/** Trạng thái buff Z-Power của bản nhập cũ (nay là bậc trận / Focus Energy): xóa khỏi dữ liệu. */
const OLD_ZPOWER_STATUSES = ['zCritical', 'zAccurate', 'zEvasive']

/** zMove của Showdown → zEffects ("ngôn ngữ" trait); null = Showdown không có Z-Power. */
function zEffectsOf(zMove, report, skillId) {
  if (!zMove) return null
  if (zMove.boost) {
    const byDelta = new Map()
    const effects = []
    for (const [stat, delta] of Object.entries(zMove.boost)) {
      if (BOOST_STATS[stat]) {
        byDelta.set(delta, [...(byDelta.get(delta) ?? []), BOOST_STATS[stat]])
      } else report.unsupported.push(`${skillId}: boost ${stat}`)
    }
    for (const [delta, stats] of byDelta) effects.unshift({ do: 'stage', to: 'self', stats, delta })
    return effects
  }
  switch (zMove.effect) {
    case 'heal':
      return [{ do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 100 } }]
    case 'clearnegativeboost':
      return [{ do: 'restoreStages', to: 'self' }]
    // +2 bậc chí mạng như Focus Energy (tới khi rời sân).
    case 'crit2':
      return [{ do: 'focus', to: 'self', stages: 2 }]
    case 'healreplacement':
      return [{ do: 'healReplacement', to: 'self' }]
    // Follow Me: khiêu khích (skill đơn mục tiêu của địch nhắm vào quái này).
    case 'redirect':
      return [{ do: 'provoke', to: 'self' }]
    // Curse: quái hệ Ma hồi đầy máu, hệ khác +1 công (như Pokémon).
    case 'curse': {
      const ghost = { if: 'element', who: 'self', elementIds: ['ghost'] }
      return [
        { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 100 }, if: [ghost] },
        {
          do: 'stage',
          to: 'self',
          stats: ['attack'],
          delta: 1,
          if: [{ if: 'not', condition: ghost }]
        }
      ]
    }
    default:
      report.unsupported.push(`${skillId}: Z-Power "${zMove.effect}"`)
      return null
  }
}

/** Power Z-Move của Showdown cho skill gây sát thương (số riêng, không thì bảng như Showdown). */
function showdownZPower(move) {
  if (move.zMove?.basePower) return move.zMove.basePower
  const power = Array.isArray(move.multihit) ? move.basePower * 3 : move.basePower
  return tablePower(power)
}

/** Power Z-Move game tự tính cho skill (không zPower), theo luật trong battle/zMoves.ts. */
function gamePower(skill) {
  const variable = skill.hits && skill.hits.min !== skill.hits.max
  return tablePower(variable ? skill.power * ZMOVE_CONFIG.variableHitsPowerFactor : skill.power)
}

// ---------- chạy ----------

const [moves, showdownItems] = await Promise.all([
  fetchShowdown('moves.js'),
  fetchShowdown('items.js')
])
const report = { matched: 0, zPower: 0, zEffects: 0, noZPower: [], unsupported: [], dropped: [] }

const balance = read('balance.json')
balance.transform.zMove = ZMOVE_CONFIG
balance.trainers.gym.keyItemFloors.zRing = ZRING_FLOOR
for (const id of OLD_ZPOWER_STATUSES) delete balance.ai.statusWeights[id]
write('balance.json', balance)

const texts = Object.fromEntries(
  ['en', 'vi'].map((language) => [
    language,
    {
      items: read(`i18n/${language}/items.json`),
      skills: read(`i18n/${language}/skills.json`),
      statuses: read(`i18n/${language}/statuses.json`)
    }
  ])
)
const elementEn = read('i18n/en/elements.json')
const elementVi = read('i18n/vi/elements.json')
const name = (kind, id, en, vi) => {
  texts.en[kind][id] = en
  texts.vi[kind][id] = vi
}

// Trạng thái buff cũ của Z-Power
const statuses = read('statuses.json')
write(
  'statuses.json',
  statuses.filter((s) => !OLD_ZPOWER_STATUSES.includes(s.id))
)
for (const language of ['en', 'vi']) {
  for (const id of OLD_ZPOWER_STATUSES) delete texts[language].statuses[id]
}

// Skill: zPower / zEffects theo Showdown (chỉ skill cùng hệ và loại với move Showdown cùng tên)
const allSkills = read('skills.json')
const zMoveIds = new Set([
  ...ELEMENT_ZMOVES.map(([, id]) => id),
  ...Object.values(SIGNATURES).map(([id]) => id),
  ...Object.values(PLANNED_SIGNATURES).map(([id]) => id)
])
const skills = allSkills.filter((skill) => !zMoveIds.has(skill.id))
for (const skill of skills) {
  delete skill.zPower
  delete skill.zEffects
  const move = moves[showdownId(skill.id)]
  if (skill.maxMove || !move || move.isZ || move.isMax) continue
  if (move.type.toLowerCase() !== skill.elementId || move.category.toLowerCase() !== skill.category)
    continue
  report.matched++
  if (skill.category === 'status') {
    const effects = zEffectsOf(move.zMove, report, skill.id)
    if (effects === null) report.noZPower.push(skill.id)
    else if (effects.length > 0) {
      skill.zEffects = effects
      report.zEffects++
    }
    continue
  }
  const power = showdownZPower(move)
  if (power !== gamePower(skill)) {
    skill.zPower = power
    report.zPower++
  }
}
const newSkills = []
for (const [elementId, id, en, vi] of ELEMENT_ZMOVES) {
  newSkills.push({
    id,
    elementId,
    // Loại / power thay theo skill gốc lúc dùng (battle/zMoves.ts); ghi giá trị danh nghĩa.
    category: 'physical',
    power: 100,
    accuracy: 100,
    target: 'enemy',
    effects: [],
    priority: 0,
    zMove: 'z'
  })
  name('skills', id, en, vi)
}
const signatureIds = {}
for (const [showdown, [id, en, vi, extra, dropped]] of Object.entries(SIGNATURES)) {
  const move = moves[showdown]
  const category = move.category.toLowerCase()
  newSkills.push({
    id,
    elementId: move.type.toLowerCase(),
    category,
    power: category === 'status' ? 0 : move.basePower,
    accuracy: 100,
    target: 'enemy',
    effects: [],
    priority: move.priority,
    ...extra,
    zMove: 'signature'
  })
  name('skills', id, en, vi)
  signatureIds[move.isZ] = id
  if (dropped) report.dropped.push(`${id}: ${dropped}`)
}
const planned = Object.entries(PLANNED_SIGNATURES).map(([showdown, [id, en, vi, needs]]) => {
  const move = moves[showdown]
  for (const language of ['en', 'vi']) delete texts[language].skills[id]
  return {
    id,
    elementId: move.type.toLowerCase(),
    category: move.category.toLowerCase(),
    power: move.basePower,
    zCrystal: move.isZ,
    nameEn: en,
    nameVi: vi,
    needs
  }
})
write('skills.json', [...skills, ...newSkills])

// Vật phẩm: Vòng Z, crystal hệ, crystal loài (bỏ crystal của Z-Move chờ)
const species = new Set(read('species.json').map((entry) => entry.id))
const skillIds = new Set(skills.map((skill) => skill.id))
const items = read('items.json')
const newItems = [{ id: 'zRing', category: 'keyItem' }]
name('items', 'zRing', 'Z-Ring', 'Vòng Z')
const priced = (price) => ({ price, shop: true, shopWeight: 1, requiresKeyItemId: 'zRing' })
for (const [elementId] of ELEMENT_ZMOVES) {
  const id = `${elementId}ZCrystal`
  newItems.push({ id, category: 'zCrystal', ...priced(3000), elementId })
  const showdown = Object.values(showdownItems).find(
    (item) => item.zMove === true && item.zMoveType === elementEn[elementId]
  )
  name('items', id, showdown?.name ?? CRYSTAL_NAMES[elementId], `Pha Lê Z ${elementVi[elementId]}`)
}
for (const [showdown, item] of Object.entries(showdownItems)) {
  if (typeof item.zMove !== 'string') continue
  const zSkillId = signatureIds[showdown]
  if (!zSkillId) {
    report.dropped.push(`${item.name}: Z-Move riêng chờ cơ chế (zmoves-planned.json)`)
    continue
  }
  const baseId = [...skillIds].find((id) => showdownId(id) === showdownId(item.zMoveFrom))
  const speciesIds = item.itemUser.map(speciesIdOf).filter((id) => species.has(id))
  const missing = item.itemUser.filter((user) => !species.has(speciesIdOf(user)))
  if (missing.length > 0) report.dropped.push(`${item.name}: loài chưa có ${missing.join(', ')}`)
  if (!baseId || speciesIds.length === 0) {
    report.dropped.push(`${item.name}: thiếu skill gốc "${item.zMoveFrom}" hoặc loài`)
    continue
  }
  const id = `${showdown.replace(/z$/, '')}ZCrystal`
  newItems.push({
    id,
    category: 'zCrystal',
    ...priced(5000),
    baseSkillId: baseId,
    zSkillId,
    speciesIds,
    ...(ULTRA_BURST[showdown] ? { ultraBurst: ULTRA_BURST[showdown] } : {})
  })
  name('items', id, item.name, SIGNATURE_CRYSTAL_VI[showdown] ?? `Pha Lê Z ${item.name}`)
}
const newItemIds = new Set(newItems.map((item) => item.id))
const oldZItems = (item) => newItemIds.has(item.id) || item.category === 'zCrystal'
write('items.json', [...items.filter((item) => !oldZItems(item)), ...newItems])
for (const language of ['en', 'vi']) {
  for (const id of Object.keys(texts[language].items)) {
    if (id.endsWith('ZCrystal') && !newItemIds.has(id)) delete texts[language].items[id]
  }
  write(`i18n/${language}/items.json`, texts[language].items)
  write(`i18n/${language}/skills.json`, texts[language].skills)
  write(`i18n/${language}/statuses.json`, texts[language].statuses)
}

writeScript('zmoves-planned.json', planned)
writeScript('zmoves-report.json', report)
console.log(
  `Skill khớp Showdown ${report.matched} (zPower ${report.zPower}, zEffects ${report.zEffects}), ` +
    `Z-Move ${newSkills.length} (+${planned.length} chờ), vật phẩm ${newItems.length}, ` +
    `phần chưa hỗ trợ ${report.unsupported.length}, bỏ ${report.dropped.length}`
)
