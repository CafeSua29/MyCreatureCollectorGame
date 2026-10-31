/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Dạng Pokémon đợt nhập loài bỏ vì cùng chỉ số với dạng gốc (docs/rules/battle-forms.md,
// content-sources.md): chép từ loài gốc (learnset, sách...); dạng khác lấy chỉ số / hệ / cân nặng
// theo Pokémon Showdown. Ability do pokemon-abilities-import.mjs ghi (chạy sau script này).
// - Dạng trong trận chỉ khác hình mà ability đổi dạng cần (Gulp Missile, Hunger Switch, Flower Gift,
//   Disguise), dạng Tera của Ogerpon: `formKind: battleOnly`.
// - Dạng khác có luật riêng (`alternate`, gặp / bắt như loài thường): Partner / mũ / cosplay của
//   Pikachu, Totem (USUM: Totem Sticker), Greninja Bond, Basculin sọc xanh / trắng, Toxtricity Low
//   Key, Meowstic cái, Tatsugiri, Squawkabilly vàng / trắng, Magearna Original.
// Dạng chỉ khác màu / hoa văn không nhập (Vivillon, Zarude Dada, Maushold bốn con...).
// Chạy lại được (ghi đè dạng cùng id). Chạy: node scripts/data-import/battle-forms-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchShowdown, showdownId } from './showdown.mjs'

const path = (file) => new URL(`../../src/data/${file}`, import.meta.url)
const read = (file) => JSON.parse(readFileSync(path(file), 'utf8'))
const write = (file, value) => writeFileSync(path(file), JSON.stringify(value, null, 2) + '\n')

/** Dạng trong trận: id dạng → [loài chép, tên en (như Showdown), tên vi]. */
const FORMS = {
  cramorantGulping: ['cramorant', 'Cramorant-Gulping', 'Cramorant-Gulping'],
  cramorantGorging: ['cramorant', 'Cramorant-Gorging', 'Cramorant-Gorging'],
  morpekoHangry: ['morpeko', 'Morpeko-Hangry', 'Morpeko-Hangry'],
  cherrimSunshine: ['cherrim', 'Cherrim-Sunshine', 'Cherrim-Sunshine'],
  mimikyuBusted: ['mimikyu', 'Mimikyu-Busted', 'Mimikyu-Busted'],
  mimikyuBustedTotem: ['mimikyuTotem', 'Mimikyu-Busted-Totem', 'Mimikyu-Busted Totem'],
  ogerponTealTera: ['ogerpon', 'Ogerpon-Teal-Tera', 'Ogerpon-Teal Tera'],
  ogerponWellspringTera: [
    'ogerponWellspring',
    'Ogerpon-Wellspring-Tera',
    'Ogerpon-Wellspring Tera'
  ],
  ogerponHearthflameTera: [
    'ogerponHearthflame',
    'Ogerpon-Hearthflame-Tera',
    'Ogerpon-Hearthflame Tera'
  ],
  ogerponCornerstoneTera: [
    'ogerponCornerstone',
    'Ogerpon-Cornerstone-Tera',
    'Ogerpon-Cornerstone Tera'
  ]
}

/**
 * Dạng Partner của Let's Go (Pikachu / Eevee): dạng khác chỉ số (`alternate`, gặp / bắt như loài
 * thường), không tiến hóa, học chiêu Let's Go (learn-sources-import.mjs). Chỉ số theo Showdown.
 * id dạng → [loài gốc, tên en, tên vi, chỉ số].
 */
const PARTNERS = {
  pikachuStarter: [
    'pikachu',
    'Pikachu-Starter',
    'Pikachu-Starter',
    { hp: 45, attack: 80, defense: 50, spAttack: 75, spDefense: 60, speed: 120 }
  ],
  eeveeStarter: [
    'eevee',
    'Eevee-Starter',
    'Eevee-Starter',
    { hp: 65, attack: 75, defense: 70, spAttack: 65, spDefense: 85, speed: 75 }
  ]
}

/**
 * Pikachu đội mũ của Ash (cùng chỉ số Pikachu, không tiến hóa): dạng khác (`alternate`) để
 * Pikashunium Z dùng được như gốc.
 */
const CAPS = ['Original', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Partner', 'World']

/**
 * Dạng khác lấy chỉ số / hệ / cân nặng từ Showdown: id dạng → [loài chép, tên en (như Showdown),
 * tên vi, chiêu riêng học ở level 1]. Loài chép là dạng gần nhất (Totem Alola chép dạng Alola).
 */
const SHOWDOWN_FORMS = {
  raticateAlolaTotem: ['raticateAlola', 'Raticate-Alola-Totem', 'Raticate Alola Totem'],
  marowakAlolaTotem: ['marowakAlola', 'Marowak-Alola-Totem', 'Marowak Alola Totem'],
  gumshoosTotem: ['gumshoos', 'Gumshoos-Totem', 'Gumshoos Totem'],
  vikavoltTotem: ['vikavolt', 'Vikavolt-Totem', 'Vikavolt Totem'],
  ribombeeTotem: ['ribombee', 'Ribombee-Totem', 'Ribombee Totem'],
  araquanidTotem: ['araquanid', 'Araquanid-Totem', 'Araquanid Totem'],
  lurantisTotem: ['lurantis', 'Lurantis-Totem', 'Lurantis Totem'],
  salazzleTotem: ['salazzle', 'Salazzle-Totem', 'Salazzle Totem'],
  togedemaruTotem: ['togedemaru', 'Togedemaru-Totem', 'Togedemaru Totem'],
  mimikyuTotem: ['mimikyu', 'Mimikyu-Totem', 'Mimikyu Totem'],
  kommoOTotem: ['kommoO', 'Kommo-o-Totem', 'Kommo-o Totem'],
  greninjaBond: ['greninja', 'Greninja-Bond', 'Greninja Bond'],
  basculinBlueStriped: ['basculin', 'Basculin-Blue-Striped', 'Basculin sọc xanh'],
  basculinWhiteStriped: ['basculin', 'Basculin-White-Striped', 'Basculin sọc trắng'],
  toxtricityLowKey: ['toxtricity', 'Toxtricity-Low-Key', 'Toxtricity Low Key'],
  meowsticF: ['meowstic', 'Meowstic-F', 'Meowstic (cái)'],
  tatsugiriDroopy: ['tatsugiri', 'Tatsugiri-Droopy', 'Tatsugiri rủ'],
  tatsugiriStretchy: ['tatsugiri', 'Tatsugiri-Stretchy', 'Tatsugiri duỗi'],
  squawkabillyYellow: ['squawkabilly', 'Squawkabilly-Yellow', 'Squawkabilly lông vàng'],
  squawkabillyWhite: ['squawkabilly', 'Squawkabilly-White', 'Squawkabilly lông trắng'],
  magearnaOriginal: ['magearna', 'Magearna-Original', 'Magearna Original'],
  // Pikachu cosplay (ORAS): mỗi bộ đồ một chiêu riêng.
  pikachuCosplay: ['pikachu', 'Pikachu-Cosplay', 'Pikachu cosplay'],
  pikachuRockStar: ['pikachu', 'Pikachu-Rock-Star', 'Pikachu ngôi sao rock', 'meteorMash'],
  pikachuBelle: ['pikachu', 'Pikachu-Belle', 'Pikachu quý cô', 'icicleCrash'],
  pikachuPopStar: ['pikachu', 'Pikachu-Pop-Star', 'Pikachu ngôi sao nhạc pop', 'drainingKiss'],
  pikachuPhD: ['pikachu', 'Pikachu-PhD', 'Pikachu tiến sĩ', 'electricTerrain'],
  pikachuLibre: ['pikachu', 'Pikachu-Libre', 'Pikachu đô vật', 'flyingPress']
}

/**
 * Tiến hóa vào dạng mới (như gốc): Toxel theo tính cách (Amped / Low Key), Espurr theo giới tính,
 * Basculin sọc trắng → Basculegion theo giới tính (gốc: chịu 294 sát thương phản lại; quy đổi level
 * 30 như "điều kiện khác" của dạng đầu, content-sources.md).
 */
const AMPED = ['hardy', 'brave', 'adamant', 'naughty', 'docile', 'impish', 'lax', 'hasty', 'jolly']
const AMPED_MORE = ['naive', 'rash', 'sassy', 'quirky']
const LOW_KEY = ['lonely', 'bold', 'relaxed', 'timid', 'serious', 'modest', 'mild', 'quiet']
const LOW_KEY_MORE = ['bashful', 'calm', 'gentle', 'careful']
const natureEvolution = (speciesId, natureIds) => ({
  speciesId,
  level: 30,
  conditions: [{ type: 'nature', params: { natureIds } }]
})
const genderEvolution = (speciesId, level, gender) => ({
  speciesId,
  level,
  conditions: [{ type: 'gender', params: { gender } }]
})
const EVOLUTIONS = {
  toxel: [
    natureEvolution('toxtricity', [...AMPED, ...AMPED_MORE]),
    natureEvolution('toxtricityLowKey', [...LOW_KEY, ...LOW_KEY_MORE])
  ],
  espurr: [genderEvolution('meowstic', 25, 'male'), genderEvolution('meowsticF', 25, 'female')],
  basculinWhiteStriped: [
    genderEvolution('basculegion', 30, 'male'),
    genderEvolution('basculegionF', 30, 'female')
  ]
}

/** Dạng Mega / gmax chỉ của một dạng (fromSpeciesIds). */
const FROM_SPECIES = {
  meowsticMMega: ['meowstic'],
  meowsticFMega: ['meowsticF'],
  tatsugiriCurlyMega: ['tatsugiri'],
  tatsugiriDroopyMega: ['tatsugiriDroopy'],
  tatsugiriStretchyMega: ['tatsugiriStretchy'],
  magearnaMega: ['magearna'],
  magearnaOriginalMega: ['magearnaOriginal'],
  toxtricityGmax: ['toxtricity'],
  toxtricityLowKeyGmax: ['toxtricityLowKey']
}

/** Hệ Tera cố định và dạng Tera theo loài (Ogerpon theo mặt nạ, Terapagos). */
const TERA = {
  ogerpon: { teraElementId: 'grass', teraFormId: 'ogerponTealTera' },
  ogerponWellspring: { teraElementId: 'water', teraFormId: 'ogerponWellspringTera' },
  ogerponHearthflame: { teraElementId: 'fire', teraFormId: 'ogerponHearthflameTera' },
  ogerponCornerstone: { teraElementId: 'rock', teraFormId: 'ogerponCornerstoneTera' },
  terapagos: { teraElementId: 'stellar' },
  terapagosTerastal: { teraFormId: 'terapagosStellar' }
}

/** Trường của loài gốc không chép sang dạng trong trận (không có tuổi thọ / tiến hóa riêng). */
const DROPPED = ['lifespan', 'abilities', 'hiddenAbility', 'rank', 'origin', 'source']
/** Trường theo từng loài, không chép sang dạng. */
const OWN_FIELDS = ['teraElementId', 'teraFormId', 'fromSpeciesIds']
const STAT_KEYS = {
  hp: 'hp',
  atk: 'attack',
  def: 'defense',
  spa: 'spAttack',
  spd: 'spDefense',
  spe: 'speed'
}

const species = read('species.json')
const names = { en: read('i18n/en/species.json'), vi: read('i18n/vi/species.json') }
const dex = await fetchShowdown('pokedex.js')
const dexByName = new Map(Object.values(dex).map((entry) => [showdownId(entry.name ?? ''), entry]))
const find = (id) => species.find((entry) => entry.id === id)

/** Thay loài cùng id hoặc chèn sau loài chép. */
function place(form, base, [en, vi]) {
  const index = species.findIndex((entry) => entry.id === form.id)
  if (index >= 0) species[index] = form
  else species.splice(species.indexOf(base) + 1, 0, form)
  names.en[form.id] = en
  names.vi[form.id] = vi
}

/** Bản chép của loài `base` thành dạng `id` (dạng của một dạng trỏ về loài gốc). */
function copyOf(base, id, formKind, dropped) {
  const form = {
    ...structuredClone(base),
    id,
    evolutions: [],
    formOf: base.formOf ?? base.id,
    formKind
  }
  for (const field of [...dropped, ...OWN_FIELDS]) delete form[field]
  return form
}

// Dạng khác theo Showdown (trước dạng trong trận: Mimikyu Busted Totem chép Mimikyu Totem).
for (const [id, [baseId, en, vi, extraSkillId]] of Object.entries(SHOWDOWN_FORMS)) {
  const base = find(baseId)
  const source = dexByName.get(showdownId(en))
  if (!base || !source) throw new Error(`Thiếu loài ${baseId} hoặc dạng Showdown ${en}`)
  const form = copyOf(base, id, 'alternate', ['abilities', 'hiddenAbility', 'rank'])
  form.elementIds = source.types.map((type) => type.toLowerCase())
  form.baseStats = Object.fromEntries(
    Object.entries(source.baseStats).map(([key, value]) => [STAT_KEYS[key], value])
  )
  form.weightKg = source.weightkg
  form.heightM = source.heightm
  if (extraSkillId && !form.learnset.some((entry) => entry.skillId === extraSkillId)) {
    form.learnset.unshift({ level: 1, skillId: extraSkillId })
  }
  place(form, base, [en, vi])
}
for (const [id, [baseId, en, vi]] of Object.entries(FORMS)) {
  const base = find(baseId)
  if (!base) throw new Error(`Thiếu loài gốc ${baseId}`)
  place(copyOf(base, id, 'battleOnly', DROPPED), base, [en, vi])
}
const pikachu = find('pikachu')
for (const cap of CAPS) {
  PARTNERS[`pikachu${cap}`] = ['pikachu', `Pikachu-${cap}`, `Pikachu-${cap}`, pikachu.baseStats]
}
for (const [id, [baseId, en, vi, baseStats]] of Object.entries(PARTNERS)) {
  const base = find(baseId)
  if (!base) throw new Error(`Thiếu loài gốc ${baseId}`)
  const old = find(id)
  const form = copyOf(base, id, 'alternate', ['hiddenAbility', 'rank', 'origin', 'source'])
  // Chạy lại giữ learnset / sách đã nhập cho dạng (các script sau ghi vào).
  if (old) {
    form.learnset = old.learnset
    if (old.bookSkillIds) form.bookSkillIds = old.bookSkillIds
    else delete form.bookSkillIds
  }
  form.baseStats = baseStats
  place(form, base, [en, vi])
}
for (const [speciesId, evolutions] of Object.entries(EVOLUTIONS)) {
  const entry = find(speciesId)
  if (!entry) throw new Error(`Thiếu loài ${speciesId}`)
  entry.evolutions = evolutions
}
for (const [formId, fromSpeciesIds] of Object.entries(FROM_SPECIES)) {
  const entry = find(formId)
  if (!entry) throw new Error(`Thiếu dạng ${formId}`)
  entry.fromSpeciesIds = fromSpeciesIds
}
for (const [speciesId, fields] of Object.entries(TERA)) {
  const entry = find(speciesId)
  if (!entry) throw new Error(`Thiếu loài ${speciesId}`)
  Object.assign(entry, fields)
}
// Mũ Alola của Pikachu là dạng mũ (đợt nhập loài ghi nhầm là dạng vùng miền).
const alolaCap = find('pikachuAlola')
if (alolaCap) alolaCap.formKind = 'alternate'
write('species.json', species)
write('i18n/en/species.json', names.en)
write('i18n/vi/species.json', names.vi)
console.log(
  `Đã ghi ${Object.keys(FORMS).length} dạng trong trận, ` +
    `${Object.keys(PARTNERS).length + Object.keys(SHOWDOWN_FORMS).length} dạng khác`
)
