/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập WILDERLOCKE (bản demo, game chưa phát hành) từ game-files/extract.py. Chạy theo thứ tự:
//   (đã nhập rồi, chỉ sửa quy đổi chiêu / lợi thế boss: node scripts/data-import/wilderlocke-import.mjs refresh)
//   node scripts/data-import/wilderlocke-import.mjs content   (skill, trait, trạng thái, vật phẩm, sources/wilderlocke.json)
//   node scripts/data-import/species-batch-import.mjs sources/wilderlocke.json
//   node scripts/data-import/wilderlocke-import.mjs species   (learnset, sách kỹ năng, ability)
//   node scripts/data-import/race-review-collectors.mjs; node scripts/data-import/biomes-import.mjs
// Luật ở content-sources-real.md mục "WILDERLOCKE".

import { readFileSync, writeFileSync } from 'node:fs'
import { readDumpJson } from './game-files/gameFiles.mjs'
import { guessRace } from './raceGuess.mjs'
import { writeSource } from './sourceHelpers.mjs'
import { ELEMENTS, REJECTED, convertMove } from './wilderlocke/moves.mjs'
import { PASSIVE_NAMES, PASSIVES, REJECTED_PASSIVES } from './wilderlocke/passives.mjs'

const DATA = new URL('../../src/data/', import.meta.url)
const read = (path) => JSON.parse(readFileSync(new URL(path, DATA), 'utf8'))
const write = (path, value) =>
  writeFileSync(new URL(path, DATA), `${JSON.stringify(value, null, 2)}\n`)
const LABEL = 'WILDERLOCKE'
/** Chỉ số gốc 25–70 của game gốc × hệ số để cùng cỡ thang của game này. */
const STAT_SCALE = 1.7
/** Game gốc tối đa level 10: level học chiêu, tiến hóa × 3 để hợp thang của game này. */
const LEVEL_SCALE = 3
const TIER_BY_STAGE = ['small', 'medium', 'peak']

const enums = readDumpJson('wilderlocke/enums.json')
const terms = readDumpJson('wilderlocke/terms.json')
const moves = readDumpJson('wilderlocke/moves.json')
const rawSpecies = readDumpJson('wilderlocke/species.json').filter((s) => s.id > 0)
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const camelId = (name) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .map((word, i) => (i ? word[0].toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join('')
const moveName = (move) => terms[`move/${move.id}/name`]

/**
 * Mọi chiêu thành skill riêng, kể cả chiêu trùng tên skill có sẵn (Splash, Flash... của game gốc khác hẳn
 * bản Pokémon): luật "làm giống gốc trước". Trùng tên thì thêm nhãn tác phẩm.
 */
function importSkills() {
  const skills = read('skills.json')
  const namesVi = read('i18n/vi/skills.json')
  const namesEn = read('i18n/en/skills.json')
  const takenNames = new Set(Object.values(namesEn).map(nameKey))
  const ids = new Set(skills.map((skill) => skill.id))
  const counts = { added: 0, labeled: 0, rejected: 0 }
  const moveIds = {}
  for (const move of moves) {
    if (REJECTED[move.id]) {
      counts.rejected++
      continue
    }
    const name = moveName(move)
    if (!name) throw new Error(`Chiêu ${move.id} không có tên`)
    const taken = takenNames.has(nameKey(name))
    let id = camelId(name)
    if (ids.has(id)) id = `${id}Wilderlocke`
    if (ids.has(id)) throw new Error(`Id skill trùng: ${id}`)
    ids.add(id)
    const shown = taken ? `${name} (${LABEL})` : name
    takenNames.add(nameKey(shown))
    skills.push({ id, ...convertMove(move, enums) })
    namesEn[id] = shown
    namesVi[id] = shown
    moveIds[move.id] = id
    counts.added++
    if (taken) counts.labeled++
  }
  write('skills.json', skills)
  write('i18n/vi/skills.json', namesVi)
  write('i18n/en/skills.json', namesEn)
  writeFileSync(
    new URL('./wilderlocke/move-ids.json', import.meta.url),
    JSON.stringify(moveIds, null, 1)
  )
  console.log('skills', counts)
}

function importTraits() {
  const traits = read('traits.json')
  const namesVi = read('i18n/vi/traits.json')
  const namesEn = read('i18n/en/traits.json')
  const taken = new Set(traits.map((trait) => trait.id))
  const takenNames = new Set(Object.values(namesEn).map(nameKey))
  const passiveIds = {}
  for (const [id, hooks] of Object.entries(PASSIVES)) {
    const name = terms[`passive/${id}/name`] || PASSIVE_NAMES[id]
    if (!name) throw new Error(`Passive ${id} không có tên`)
    let traitId = `${camelId(name)}Wilderlocke`
    while (taken.has(traitId)) traitId += 'X'
    taken.add(traitId)
    const shown = takenNames.has(nameKey(name)) ? `${name} (${LABEL})` : name
    takenNames.add(nameKey(shown))
    traits.push({ id: traitId, kind: 'rare', hooks })
    namesEn[traitId] = shown
    namesVi[traitId] = shown
    passiveIds[id] = traitId
  }
  write('traits.json', traits)
  write('i18n/vi/traits.json', namesVi)
  write('i18n/en/traits.json', namesEn)
  writeFileSync(
    new URL('./wilderlocke/passive-ids.json', import.meta.url),
    JSON.stringify(passiveIds, null, 1)
  )
  console.log(
    'traits',
    Object.keys(passiveIds).length,
    'loại',
    Object.keys(REJECTED_PASSIVES).length
  )
}

const hook = (type, params) => ({ type, params })
const taken = (percent, ...elementIds) =>
  hook('damageTakenWhen', {
    percent,
    when: [{ if: 'skillElement', elementIds }]
  })
const turnsOf = (turns) => ({ min: turns, max: turns })
/** Trạng thái thêm mới: [id, vi, en, loại, số lượt, hook trait, phần thêm]; số theo StatusDB, MoveSpecificEffectDB. */
const NEW_STATUSES = [
  ['dazed', 'Choáng váng', 'Dazed', 'debuff', 1, [hook('damageDealtModifier', { percent: -75 })]],
  [
    'frostbite',
    'Bỏng lạnh',
    'Frostbite',
    'debuff',
    3,
    ['attack', 'cast'].map((on) =>
      hook('trigger', {
        on,
        scope: 'self',
        effects: [{ do: 'damage', to: 'self', amount: { event: true, percent: 30 } }]
      })
    )
  ],
  [
    'prioPlus',
    'Đi trước',
    'Prio+',
    'buff',
    1,
    [hook('priorityModifier', { skillCategory: 'any', amount: 1 })]
  ],
  [
    'anticipating',
    'Dự liệu',
    'Anticipating',
    'buff',
    2,
    [hook('damageDealtModifier', { percent: 25 })]
  ],
  ['liquefied', 'Hóa lỏng', 'Liquefied', 'debuff', 6, [], { forcesSpecialDamage: true }],
  ['jinxed', 'Trúng tà', 'Jinxed', 'debuff', 6, [hook('effectiveness', { mode: 'noResist' })]],
  [
    'overgrown',
    'Um tùm',
    'Overgrown',
    'debuff',
    5,
    [
      hook('convertSkillElement', {
        fromElementIds: ['normal', 'fire', 'water', 'ground', 'electric', 'ice', 'flying'],
        toElementId: 'grass',
        percent: 0
      })
    ]
  ],
  [
    'oilSlick',
    'Váng dầu',
    'Oil Slick',
    'debuff',
    4,
    [
      hook('trigger', {
        on: 'damaged',
        scope: 'self',
        when: [{ if: 'skillElement', elementIds: ['fire'] }],
        effects: [{ do: 'damage', to: 'subjectAllies', amount: { event: true, percent: 100 } }]
      })
    ]
  ],
  ['drenched', 'Ướt sũng', 'Drenched', 'debuff', 3, [taken(100, 'electric'), taken(-50, 'fire')]],
  ['updraft', 'Luồng khí nóng', 'Updraft', 'debuff', 5, [taken(50, 'fire', 'flying')]],
  [
    'featherGuard',
    'Giáp lông',
    'Feather Guard',
    'buff',
    5,
    [hook('indirectDamage', { percent: -75 })]
  ],
  [
    'caltrops',
    'Chông sắt',
    'Caltrops',
    'debuff',
    8,
    [
      hook('trigger', {
        on: 'turnEnd',
        scope: 'self',
        effects: [{ do: 'damage', to: 'self', amount: { hp: 'max', of: 'self', percent: 4 } }]
      })
    ]
  ],
  [
    'fogged',
    'Sương mù',
    'Fogged',
    'debuff',
    4,
    [hook('statGainBlock', {}), hook('stageMultiplier', { loss: 0 })]
  ],
  [
    'fertilized',
    'Bón phân',
    'Fertilized',
    'buff',
    5,
    [
      hook('damageDealtModifier', {
        percent: 50,
        when: [{ if: 'skillElement', elementIds: ['grass'] }]
      }),
      hook('damageDealtModifier', {
        percent: 25,
        when: [{ if: 'not', condition: { if: 'skillElement', elementIds: ['grass'] } }]
      })
    ]
  ],
  [
    'lightUp',
    'Thắp sáng',
    'Light Up',
    'debuff',
    4,
    [
      hook('trigger', {
        on: 'damaged',
        scope: 'self',
        effects: [{ do: 'stage', to: 'other', stats: ['attack', 'spAttack'], delta: 1 }]
      })
    ]
  ],
  [
    'bloodlust',
    'Khát máu',
    'Bloodlust',
    'buff',
    5,
    [
      hook('damageDealtModifier', { percent: 50 }),
      hook('trigger', {
        on: 'turnEnd',
        scope: 'self',
        effects: [{ do: 'damage', to: 'self', amount: { hp: 'max', of: 'self', percent: 4 } }]
      })
    ]
  ],
  ['assisted', 'Được trợ', 'Assisted', 'buff', 1, [hook('damageDealtModifier', { percent: 40 })]]
]

function importStatuses() {
  const statuses = read('statuses.json')
  const namesVi = read('i18n/vi/statuses.json')
  const namesEn = read('i18n/en/statuses.json')
  const balance = read('balance.json')
  for (const [id, vi, en, kind, turns, traitHooks, extra] of NEW_STATUSES) {
    statuses.push({
      id,
      kind,
      duration: turnsOf(turns),
      hooks: [],
      ...(traitHooks.length ? { traitHooks } : {}),
      battleOnly: true,
      ...extra
    })
    namesVi[id] = vi
    namesEn[id] = en
    balance.ai.statusWeights[id] = 0.25
  }
  write('statuses.json', statuses)
  write('i18n/vi/statuses.json', namesVi)
  write('i18n/en/statuses.json', namesEn)
  write('balance.json', balance)
}

/**
 * Lợi thế boss (Battle Advantage của game gốc): trait kind boss. Chủ project yêu cầu khó hơn gốc
 * (2026-11-05) vì trận boss của game này ngắn (khoảng 4 lượt) nên số gốc gần như không có tác dụng:
 * Crescendo +8% / lượt (gốc 2%), Rainstorm mưa ngay khi vào sân và mỗi 2 lượt (gốc 4) kèm +25% sát
 * thương khi mưa (thêm), Suppression mỗi lượt (gốc 2) kèm −1 bậc tốc độ (thêm), Garden hồi 8% (gốc 3).
 * Số ở BOSS_ADVANTAGE (shiny-boss.md mục "Lợi thế boss").
 */
const BOSS_ADVANTAGE = {
  crescendoPercentPerTurn: 15,
  rainEveryTurns: 2,
  rainDamagePercent: 40,
  suppressionEveryTurns: 1,
  gardenRegenPercent: 12,
  randomChance: 100,
  /** 1 / 2 / 3 lợi thế (lần lượt). */
  countWeights: [85, 13, 2]
}
function importBossAdvantages() {
  const traits = read('traits.json')
  const namesVi = read('i18n/vi/traits.json')
  const namesEn = read('i18n/en/traits.json')
  const every = (turns) => ({
    if: 'counterMultipleOf',
    counter: { of: 'turnsOnField' },
    every: turns
  })
  const rain = { if: 'fieldActive', layer: 'weather', fieldIds: ['rain'] }
  const placeRain = [{ do: 'placeField', fieldId: 'rain' }]
  const added = [
    [
      'crescendoAdvantage',
      'Crescendo',
      'Cao trào',
      [
        hook('scaling', {
          per: { of: 'turnsOnField' },
          effect: { damageDealt: BOSS_ADVANTAGE.crescendoPercentPerTurn }
        })
      ]
    ],
    [
      'rainstormAdvantage',
      'Rainstorm',
      'Bão mưa',
      [
        hook('trigger', { on: 'entry', scope: 'self', effects: placeRain }),
        hook('trigger', {
          on: 'turnEnd',
          scope: 'self',
          when: [every(BOSS_ADVANTAGE.rainEveryTurns)],
          effects: placeRain
        }),
        hook('damageDealtModifier', { percent: BOSS_ADVANTAGE.rainDamagePercent, when: [rain] })
      ]
    ],
    [
      'suppressionAdvantage',
      'Suppression',
      'Áp chế',
      [
        hook('trigger', {
          on: 'turnEnd',
          scope: 'self',
          when: [every(BOSS_ADVANTAGE.suppressionEveryTurns)],
          effects: [
            { do: 'status', to: 'foes', statusId: 'cantEscape' },
            { do: 'stage', to: 'foes', stats: ['speed', 'attack', 'spAttack'], delta: -1 }
          ]
        })
      ]
    ],
    [
      'gardenAdvantage',
      'Garden',
      'Khu vườn',
      [hook('regen', { percent: BOSS_ADVANTAGE.gardenRegenPercent })]
    ]
  ]
  // Chạy lại được: thay trait cũ cùng id.
  const ids = new Set(added.map(([id]) => id))
  traits.splice(0, traits.length, ...traits.filter((trait) => !ids.has(trait.id)))
  for (const [id, en, vi, hooks] of added) {
    traits.push({ id, kind: 'boss', hooks })
    namesEn[id] = en
    namesVi[id] = vi
  }
  write('traits.json', traits)
  write('i18n/vi/traits.json', namesVi)
  write('i18n/en/traits.json', namesEn)
  const balance = read('balance.json')
  balance.boss.advantages = {
    randomChance: BOSS_ADVANTAGE.randomChance,
    countWeights: BOSS_ADVANTAGE.countWeights,
    entries: added.map(([traitId]) => ({ traitId, weight: 1 }))
  }
  balance.boss.scoutPricePerFloor = 200
  write('balance.json', balance)
}

/** Lớp đối thủ của game gốc thành lớp NPC có đội cố định; Lewis, Sylvia gộp thành Champion. */
function importTrainers() {
  const moveIds = JSON.parse(
    readFileSync(new URL('./wilderlocke/move-ids.json', import.meta.url), 'utf8')
  )
  const species = read('species.json')
  const en = read('i18n/en/species.json')
  const speciesId = new Map(
    species
      .filter((s) => s.source === 'wilderlocke')
      .map((s) => [nameKey(en[s.id].replace(/ \(.*\)$/, '')), s.id])
  )
  const rawById = new Map(rawSpecies.map((s) => [s.id, s]))
  const challengers = readDumpJson('wilderlocke/challengers.json')
  const CLASSES = {
    sportsgirl: ['Sportsgirl', 'Nữ vận động viên'],
    hikergirl: ['Hiker', 'Nhà leo núi'],
    fisherman: ['Fisherman', 'Ngư phủ'],
    bugcatchergirl: ['Bug Catcher', 'Người bắt bọ'],
    studentguy: ['Student', 'Học sinh'],
    strongman: ['Strongman', 'Lực sĩ']
  }
  const trainers = read('trainers.json')
  const namesVi = read('i18n/vi/trainers.json')
  const namesEn = read('i18n/en/trainers.json')
  const teamsOf = (rows) =>
    rows
      .map((row) =>
        row.monsters.flatMap((monster) => {
          const raw = rawById.get(monster.speciesNumber)
          const id = raw && speciesId.get(nameKey(terms[`monster/${raw.id}/name`] ?? ''))
          return id
            ? [
                {
                  speciesId: id,
                  skillIds: monster.moves.flatMap((move) => moveIds[move] ?? []).slice(0, 4)
                }
              ]
            : []
        })
      )
      .filter((team) => team.length > 0)
  const add = (id, enName, viName, rows, extra) => {
    trainers.push({
      id,
      kind: 'regular',
      elementIds: [],
      teamSize: { min: 1, max: 4 },
      levelOffset: extra.levelOffset,
      rewardMultiplier: extra.rewardMultiplier,
      tamerRealmOffset: 0,
      tamerSkillIds: ['healingArt'],
      aiProfile: 'standard',
      equipmentSlots: 0,
      transforms: false,
      formationIds: [],
      fixedTeams: teamsOf(rows)
    })
    namesEn[id] = enName
    namesVi[id] = viName
  }
  for (const [key, [enName, viName]] of Object.entries(CLASSES)) {
    const rows = challengers.filter((row) => enums.ChallengerClass[row.challengerClass] === key)
    add(`wl${enName.replace(/ /g, '')}`, `${enName} (${LABEL})`, `${viName} (${LABEL})`, rows, {
      levelOffset: 0,
      rewardMultiplier: 1.5
    })
  }
  const champions = challengers.filter(
    (row) => enums.ChallengerType[row.challengerType] === 'Champion'
  )
  add('wlChampion', `Champion (${LABEL})`, `Nhà vô địch (${LABEL})`, champions, {
    levelOffset: 5,
    rewardMultiplier: 3
  })
  write('trainers.json', trainers)
  write('i18n/vi/trainers.json', namesVi)
  write('i18n/en/trainers.json', namesEn)
  console.log('trainers', Object.keys(CLASSES).length + 1, 'đội', challengers.length)
}

/** Dựng lại mọi skill WILDERLOCKE đã nhập theo bảng quy đổi hiện tại (giữ id), không đụng dữ liệu khác. */
function refreshSkills() {
  const moveIds = JSON.parse(
    readFileSync(new URL('./wilderlocke/move-ids.json', import.meta.url), 'utf8')
  )
  const skills = read('skills.json')
  const index = new Map(skills.map((skill, i) => [skill.id, i]))
  let count = 0
  for (const move of moves) {
    const id = moveIds[move.id]
    if (id === undefined || !index.has(id)) continue
    skills[index.get(id)] = { id, ...convertMove(move, enums) }
    count++
  }
  write('skills.json', skills)
  console.log('skills refreshed', count)
}

function importItems() {
  const items = read('items.json')
  const namesVi = read('i18n/vi/items.json')
  const namesEn = read('i18n/en/items.json')
  // Salve hồi 25 / 50 / 100 HP của game gốc (HP gốc khoảng 100) quy về %; Taproot cho 50 / 90 / 160 XP
  // trong khi lên một level đầu cần vài chục XP: tương đương Kẹo EXP XS / S / M.
  const added = [
    ['basicSalve', 'Basic Salve', 'Thuốc mỡ thường', 'healPercent', { percent: 25 }, 30],
    ['greaterSalve', 'Greater Salve', 'Thuốc mỡ tốt', 'healPercent', { percent: 50 }, 60],
    ['perfectSalve', 'Perfect Salve', 'Thuốc mỡ hoàn hảo', 'healPercent', { percent: 100 }, 150],
    ['smallTaproot', 'Small Taproot', 'Rễ cái nhỏ', 'addExp', { baseExp: 100 }, 400],
    ['regularTaproot', 'Regular Taproot', 'Rễ cái', 'addExp', { baseExp: 800 }, 3200],
    ['largeTaproot', 'Large Taproot', 'Rễ cái lớn', 'addExp', { baseExp: 3000 }, 12000]
  ]
  for (const [id, en, vi, type, params, price] of added) {
    if (items.some((item) => item.id === id)) continue
    items.push({
      id,
      category: 'consumable',
      price,
      use: type === 'addExp' ? 'field' : 'both',
      target: 'ally',
      effects: [{ type, params }]
    })
    namesEn[id] = en
    namesVi[id] = vi
  }
  write('items.json', items)
  write('i18n/vi/items.json', namesVi)
  write('i18n/en/items.json', namesEn)
}

/** Tầng tiến hóa (0, 1, 2) của mỗi loài theo chuỗi `evolutions`. */
function stageOf() {
  const stages = new Map(rawSpecies.map((s) => [s.__path, 0]))
  for (let pass = 0; pass < 3; pass++)
    for (const species of rawSpecies)
      for (const evolution of species.evolutions)
        stages.set(
          evolution.evolvesInto.m_PathID,
          Math.max(stages.get(evolution.evolvesInto.m_PathID) ?? 0, stages.get(species.__path) + 1)
        )
  return stages
}

function writeSpeciesSource() {
  const byPath = new Map(rawSpecies.map((s) => [s.__path, s]))
  const stages = stageOf()
  const nameOf = (s) => terms[`monster/${s.id}/name`] ?? s.m_Name.replace(/^\d+/, '')
  const species = rawSpecies.map((s) => {
    const name = nameOf(s)
    const types = [s.type1, s.type2]
      .map((t) => enums.MonsterType[t])
      .filter((t) => t && t !== 'none')
    const stats = {
      attack: s.physAtk,
      spAttack: s.speAtk,
      defense: s.physDef,
      spDefense: s.speDef,
      speed: s.speed
    }
    // Game gốc không có chỉ số HP riêng trong dữ liệu loài: lấy trung bình 5 chỉ số.
    const hp = Object.values(stats).reduce((a, b) => a + b, 0) / 5
    const scaled = Object.fromEntries(
      Object.entries({ hp, ...stats }).map(([key, value]) => [
        key,
        Math.max(1, Math.round(value * STAT_SCALE))
      ])
    )
    return {
      name,
      elements: types.map((t) => ELEMENTS[t]),
      raceId: guessRace([name], null) ?? 'mythicBeast',
      tier: TIER_BY_STAGE[stages.get(s.__path) ?? 0],
      stats: scaled,
      category: `${types.join(' / ')} monster`,
      evolutions: s.evolutions.flatMap((evolution) => {
        const target = byPath.get(evolution.evolvesInto.m_PathID)
        return target
          ? [{ name: nameOf(target), level: evolution.evolutionLevel * LEVEL_SCALE }]
          : []
      })
    }
  })
  writeSource('wilderlocke', {
    source: 'wilderlocke',
    origin: 'fantasy',
    update: { evolutions: 'add' },
    species
  })
}

/** Learnset, sách kỹ năng, ability của loài vừa nhập (sau species-batch-import). */
function updateSpecies() {
  const moveIds = JSON.parse(
    readFileSync(new URL('./wilderlocke/move-ids.json', import.meta.url), 'utf8')
  )
  const passiveIds = JSON.parse(
    readFileSync(new URL('./wilderlocke/passive-ids.json', import.meta.url), 'utf8')
  )
  const species = read('species.json')
  const en = read('i18n/en/species.json')
  const byName = new Map(
    species
      .filter((s) => s.source === 'wilderlocke')
      .map((s) => [nameKey(en[s.id].replace(/ \(.*\)$/, '')), s])
  )
  const counts = { species: 0, learnset: 0, books: 0, abilities: 0 }
  for (const raw of rawSpecies) {
    const target = byName.get(
      nameKey(terms[`monster/${raw.id}/name`] ?? raw.m_Name.replace(/^\d+/, ''))
    )
    if (!target) throw new Error(`Không thấy loài ${raw.m_Name}`)
    counts.species++
    const learnset = raw.resolvedMoves.flatMap(({ moveId, level }) =>
      moveIds[moveId] ? [{ level: Math.max(1, level * LEVEL_SCALE), skillId: moveIds[moveId] }] : []
    )
    const seen = new Set()
    target.learnset = learnset
      .sort((a, b) => a.level - b.level)
      .filter((entry) => !seen.has(entry.skillId) && seen.add(entry.skillId))
    // Mọi loài cần chiêu ở level 1: chiêu học sớm nhất của game gốc về level 1.
    if (target.learnset[0]) target.learnset[0].level = 1
    counts.learnset += target.learnset.length
    const books = [...new Set(raw.resolvedRunes.flatMap((id) => moveIds[id] ?? []))].filter(
      (id) => !seen.has(id)
    )
    if (books.length) target.bookSkillIds = books
    counts.books += books.length
    // Game gốc chọn 2 trong 6 passive: 2 ô đầu là ô thường, passive kế là ô ẩn.
    const passives = raw.learnablePassives.flatMap((id) => passiveIds[id] ?? [])
    if (passives.length) {
      target.abilities = passives.slice(0, 2)
      if (passives[2]) target.hiddenAbility = passives[2]
      counts.abilities++
    }
  }
  write('species.json', species)
  console.log(counts)
}

const step = process.argv[2]
if (step === 'content') {
  importStatuses()
  importSkills()
  importTraits()
  importBossAdvantages()
  importItems()
  writeSpeciesSource()
} else if (step === 'refresh') {
  refreshSkills()
  importBossAdvantages()
} else if (step === 'species') {
  updateSpecies()
  importTrainers()
} else throw new Error('Cần đối số content hoặc species')
