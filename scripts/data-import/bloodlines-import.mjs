/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập Huyết mạch (docs/rules/bloodline.md) từ bloodlines-source.json vào src/data: bloodlines.json
// (nhóm, loài tổ, luật thành viên), trait loại `bloodline` (traits.json), Tinh huyết mỗi nhóm
// (items.json), config `bloodline` (balance.json), tên i18n vi / en.
// Thành viên theo race / hệ ghi thành `raceIds` / `elementIds` (loài mới tự vào nhóm); loài khớp
// từ khóa / Pokémon thêm tay ghi vào `speciesIds`, bỏ các loài khớp nhầm ở FALSE_MATCHES.
// Chạy lại được (ghi đè các mục của chính nó): node scripts/data-import/bloodlines-import.mjs
// rồi npx prettier --write src/data

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

/** Loài khớp từ khóa tên nhưng không thuộc nhóm (Tiger Beetle không phải hổ...). */
const FALSE_MATCHES = {
  tiger: [
    'catBaLangur',
    'catOwl',
    'californiaSeaLion',
    'stellerSeaLion',
    'giantTigerPrawn',
    'goliathTigerfish',
    'leopardGecko',
    'leopardSlug',
    'lionsManeJellyfish',
    'pantherChameleon',
    'sandTigerShark',
    'tigerBeetle',
    'tigerSalamander',
    'tigerSnake',
    'tigerVespamon'
  ],
  wolf: ['wolfEel', 'wolfSpider', 'wolfbat', 'eelHound', 'aardwolf'],
  fox: ['flyingFox', 'foxSquirrel', 'giantGoldenCrownedFlyingFox'],
  qilin: ['giantStagBeetle', 'zebraShark', 'mouseDeer'],
  serpent: ['crestedSerpentEagle'],
  turtle: ['goldenTortoiseBeetle'],
  phoenix: ['peacockMantisShrimp'],
  roc: ['buzzardWasp', 'hummingbirdHawkMoth', 'tarantulaHawk', 'eagleRay']
}

/** Tỉ lệ boss rơi trận đồ của mỗi nhóm của nó; trận đồ nhiều nhóm rơi từ boss tầng như trận đồ khác. */
const TEAM_SCROLL_DROP_CHANCE = 3

/** Tinh huyết: giá, trọng số cửa hàng (thấp), độ thuần mỗi lần dùng. */
const ESSENCE = { price: 2000, shopWeight: 1, purity: 5 }

const source = read('scripts/data-import/bloodlines-source.json')
// Cộng hưởng / hợp kích / trận pháp theo huyết mạch (docs/rules/team.md).
const team = read('scripts/data-import/bloodline-team-source.json')
const species = new Map(read(`${DATA}/species.json`).map((s) => [s.id, s]))
const races = read(`${DATA}/races.json`)
const raceGroupOf = new Map(races.map((race) => [race.id, race.groupId]))

/** Dạng chỉ có trong trận (Mega, gmax...) không bao giờ là loài gốc của quái: không ghi vào nhóm. */
const BATTLE_FORM_KINDS = ['mega', 'gmax', 'battleOnly']
const isBattleForm = (id) => BATTLE_FORM_KINDS.includes(species.get(id).formKind)

const clanId = (groupId) => `${groupId}Clan`
const scrollId = (formationId) => `${formationId}Scroll`
const essenceId = (groupId) => `${groupId}Essence`

/** Loài khớp luật race / hệ của nhóm (cùng luật raceMatches: race hoặc nhóm race). */
function matchesRule(rule, speciesId) {
  const s = species.get(speciesId)
  if (!s) return false
  const raceHit = (rule.raceIds ?? []).some(
    (id) => s.raceId === id || raceGroupOf.get(s.raceId) === id
  )
  return raceHit || (rule.elementIds ?? []).some((id) => s.elementIds.includes(id))
}

const bloodlines = source.groups.map((group) => {
  const excluded = new Set([...(FALSE_MATCHES[group.id] ?? []), ...group.ancestorSpeciesIds])
  const speciesIds = group.memberSpeciesIds.filter(
    (id) =>
      species.has(id) && !isBattleForm(id) && !excluded.has(id) && !matchesRule(group.rule, id)
  )
  return {
    id: group.id,
    ancestorSpeciesIds: group.ancestorSpeciesIds,
    ...(group.rule.raceIds ? { raceIds: group.rule.raceIds } : {}),
    ...(group.rule.elementIds ? { elementIds: group.rule.elementIds } : {}),
    ...(speciesIds.length > 0 ? { speciesIds } : {}),
    traitId: group.trait.id,
    essenceItemId: essenceId(group.id),
    ...(team.groups[group.id] ? { scrollItemId: scrollId(clanId(group.id)) } : {})
  }
})
write(`${DATA}/bloodlines.json`, bloodlines)

/** Thay các mục có id trong `ids` bằng `entries` (giữ vị trí cũ nếu có, không thì thêm cuối). */
function upsert(list, entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const result = list.map((entry) => byId.get(entry.id) ?? entry)
  const present = new Set(list.map((entry) => entry.id))
  return [...result, ...entries.filter((entry) => !present.has(entry.id))]
}

const traits = source.groups.map(({ trait }) => ({
  id: trait.id,
  kind: 'bloodline',
  hooks: trait.hooks
}))
write(`${DATA}/traits.json`, upsert(read(`${DATA}/traits.json`), traits))

const essences = source.groups.map((group) => ({
  id: essenceId(group.id),
  category: 'consumable',
  price: ESSENCE.price,
  shop: true,
  shopWeight: ESSENCE.shopWeight,
  use: 'field',
  target: 'ally',
  effects: [{ type: 'addPurity', params: { groupId: group.id, amount: ESSENCE.purity } }]
}))
write(`${DATA}/items.json`, upsert(read(`${DATA}/items.json`), essences))

// Độ thuần của Tinh huyết nằm ở params vật phẩm; phần hiến tế chờ sacrifice.md.
const config = { ...source.proposedConfig.bloodline }
delete config.essencePurity
delete config.sacrificePurityPercent
const balance = read(`${DATA}/balance.json`)
balance.bloodline = { ...config, scrollDropChance: TEAM_SCROLL_DROP_CHANCE }
write(`${DATA}/balance.json`, balance)

/** Ghi tên vào i18n/<lang>/<file>.json (thêm / ghi đè theo id). */
function writeNames(lang, file, names) {
  const path = `${DATA}/i18n/${lang}/${file}.json`
  // File mới (bloodlines.json lần đầu chạy) thì bắt đầu rỗng.
  const current = existsSync(path) ? read(path) : {}
  write(path, { ...current, ...names })
}

const namesOf = (pick) => Object.fromEntries(source.groups.map((group) => pick(group)))
writeNames(
  'vi',
  'bloodlines',
  namesOf((g) => [g.id, g.name])
)
writeNames(
  'en',
  'bloodlines',
  namesOf((g) => [g.id, g.nameEn])
)
writeNames(
  'vi',
  'traits',
  namesOf((g) => [g.trait.id, g.trait.name])
)
writeNames(
  'en',
  'traits',
  namesOf((g) => [g.trait.id, g.trait.nameEn])
)
writeNames(
  'vi',
  'items',
  namesOf((g) => [essenceId(g.id), `Tinh huyết ${g.name}`])
)
writeNames(
  'en',
  'items',
  namesOf((g) => [essenceId(g.id), `${g.nameEn} Essence`])
)

// ---------- Phối hợp đội theo huyết mạch ----------

const BATTLE_ONLY_EXCLUDED = new Set(['hp'])
const round1 = (value) => Math.round(value * 10) / 10

/**
 * Hook trận được của trait huyết mạch × scale: bỏ phần hp (cộng hưởng / trận pháp không đổi max HP),
 * statusImmunity chỉ khi withImmunity.
 */
function battleHooks(hooks, scale, withImmunity) {
  return hooks.flatMap((hook) => {
    const params = hook.params
    switch (hook.type) {
      case 'statModifier': {
        const percent = Object.fromEntries(
          Object.entries(params.percent)
            .filter(([stat]) => !BATTLE_ONLY_EXCLUDED.has(stat))
            .map(([stat, value]) => [stat, round1(value * scale)])
        )
        return Object.keys(percent).length > 0 ? [{ type: hook.type, params: { percent } }] : []
      }
      case 'regen':
      case 'damageTakenModifier':
        return [{ type: hook.type, params: { ...params, percent: round1(params.percent * scale) } }]
      case 'statusImmunity':
        return withImmunity ? [hook] : []
      default:
        throw new Error(`bloodlines-import: chưa biết cách scale hook "${hook.type}"`)
    }
  })
}

const capitalize = (id) => id[0].toUpperCase() + id.slice(1)
const synergyId = (groupId) => `bloodline${capitalize(groupId)}`
const groupsWithTeam = source.groups.filter((group) => team.groups[group.id])
const SYNERGY_COUNTS = [2, 4, 6]

const synergies = groupsWithTeam.map((group) => ({
  id: synergyId(group.id),
  match: { type: 'bloodline', groupId: group.id },
  tiers: SYNERGY_COUNTS.map((count, i) => ({
    count,
    hooks: battleHooks(group.trait.hooks, team.tierScales[i], i > 0)
  }))
}))
write(`${DATA}/synergies.json`, upsert(read(`${DATA}/synergies.json`), synergies))

const side = (groupId) => ({ type: 'bloodline', groupId, minPurity: team.comboMinPurity })
const comboOf = (spec, groups) => ({
  id: spec.id,
  pair: groups.map(side),
  elementId: spec.elementId,
  category: spec.category,
  power: spec.power,
  accuracy: 100,
  priority: 0,
  target: spec.target,
  effects: spec.effects
})
const combos = [
  ...groupsWithTeam.map((group) => comboOf(team.groups[group.id].combo, [group.id, group.id])),
  ...team.crossCombos.map((spec) => comboOf(spec, spec.groups))
]
write(`${DATA}/comboSkills.json`, upsert(read(`${DATA}/comboSkills.json`), combos))

const formations = [
  ...groupsWithTeam.map((group) => ({
    id: clanId(group.id),
    requires: [{ type: 'bloodline', groupId: group.id, count: 3 }],
    match: { type: 'bloodline', groupId: group.id },
    hooks: battleHooks(group.trait.hooks, team.clanScale, true)
  })),
  ...team.formations.map(({ id, requires, hooks }) => ({ id, requires, hooks }))
]
write(`${DATA}/formations.json`, upsert(read(`${DATA}/formations.json`), formations))

const scrolls = formations.map((formation) => ({
  id: scrollId(formation.id),
  category: 'formationScroll',
  price: team.scrollPrice,
  fixedPrice: true,
  formationId: formation.id
}))
write(`${DATA}/items.json`, upsert(read(`${DATA}/items.json`), scrolls))

// Trận đồ nhiều nhóm rơi từ boss tầng như trận đồ cũ (config.formations.floorBossDrops, 3%).
const withFloorDrops = read(`${DATA}/balance.json`)
const floorDrops = withFloorDrops.formations.floorBossDrops
for (const { id } of team.formations) {
  if (!floorDrops.some((drop) => drop.itemId === scrollId(id))) {
    floorDrops.push({ itemId: scrollId(id), chance: TEAM_SCROLL_DROP_CHANCE })
  }
}
write(`${DATA}/balance.json`, withFloorDrops)

/** Tên trận pháp: nhóm lấy từ team.groups[...].clan, trận nhiều nhóm từ team.formations. */
const formationNames = (lang) =>
  Object.fromEntries([
    ...groupsWithTeam.map((group) => {
      const clan = team.groups[group.id].clan
      return [clanId(group.id), lang === 'vi' ? clan.name : clan.nameEn]
    }),
    ...team.formations.map((f) => [f.id, lang === 'vi' ? f.name : f.nameEn])
  ])
for (const lang of ['vi', 'en']) {
  const vi = lang === 'vi'
  writeNames(
    lang,
    'synergies',
    Object.fromEntries(
      groupsWithTeam.map((g) => [
        synergyId(g.id),
        vi ? `Đồng huyết: ${g.name}` : `Kindred Blood: ${g.nameEn}`
      ])
    )
  )
  const names = formationNames(lang)
  writeNames(lang, 'formations', names)
  writeNames(
    lang,
    'items',
    Object.fromEntries(
      Object.entries(names).map(([id, name]) => [
        scrollId(id),
        vi ? `Trận đồ: ${name}` : `Formation Scroll: ${name}`
      ])
    )
  )
  writeNames(
    lang,
    'skills',
    Object.fromEntries(
      [...groupsWithTeam.map((g) => team.groups[g.id].combo), ...team.crossCombos].map((spec) => [
        spec.id,
        vi ? spec.name : spec.nameEn
      ])
    )
  )
}

console.log(
  `${bloodlines.length} nhóm; loài thêm tay: ${bloodlines.reduce((n, b) => n + (b.speciesIds?.length ?? 0), 0)}`
)
