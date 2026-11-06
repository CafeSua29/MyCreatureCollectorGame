/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Bổ sung Digimon của Digimon Story: Cyber Sleuth và Hacker's Memory mà digi-api (nguồn của
// digimon-fetch.mjs) thiếu. Danh sách: Field Guide của hai game trên digimon.fandom.com; tên lồng tiếng
// của game đổi về tên đã có qua DIGIMON_ALIASES và CS_ALIASES dưới; Digimon chưa có lấy cấp / type /
// thuộc tính / field / tiến hóa từ {{Digimon Infobox}} của wiki. Ghi sources/digimonCyberSleuth.json
// (source `digimon`). Chạy: node scripts/data-import/digimon-cs-fetch.mjs (cần mạng), rồi
// species-batch-import.mjs sources/digimonCyberSleuth.json. Luật ở content-sources-real.md mục "Digimon".

import { readFileSync } from 'node:fs'
import { DIGIMON_ALIASES } from './digimon-aliases.mjs'
import {
  DEFAULT_LEVEL,
  LEVELS,
  OLYMPUS,
  STYLE_BY_ATTRIBUTE,
  elementsOf
} from './digimon-shared.mjs'
import { digimonTypeRace, guessRace } from './raceGuess.mjs'
import {
  existingSpecies,
  infoboxParams,
  pagesWikitext,
  plainText,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://digimon.fandom.com/api.php')
const FIELD_GUIDES = [
  'Digimon Story: Cyber Sleuth/Field Guide',
  "Digimon Story: Cyber Sleuth - Hacker's Memory/Field Guide"
]
/**
 * Tên trong Cyber Sleuth → tên loài đã có (tên digi-api) khi khác ngoài khoảng trắng / dấu. Viết tắt
 * chế độ của game: BM = Burst / Blast Mode, FM = Falldown / Fighter Mode, SM = Satan / Sleep Mode,
 * NX = X-Antibody, CM = Crimson Mode, VA = Valdur Arm, LM = Leopard Mode.
 */
const CS_ALIASES = {
  'Agumon (Black)': 'BlackAgumon',
  Hououmon: 'Phoenixmon',
  BaoHuckmon: 'BaoHackmon',
  SaviorHuckmon: 'SaviorHackmon',
  Veedramon: 'V-dramon',
  AeroVeedramon: 'AeroV-dramon',
  BlackGatomon: 'BlackTailmon',
  FanBeemon: 'Funbeemon',
  Dracmon: 'Dracumon',
  GranDracmon: 'GrandDracumon',
  Cyclonemon: 'Cyclomon',
  ShogunGekomon: 'TonosamaGekomon',
  HippoGryphonmon: 'Hippogriffomon',
  Volcanomon: 'Volcamon',
  Matadormon: 'Matadrmon',
  MetalTyrannomon: 'MetalTyranomon',
  Crowmon: 'Yatagaramon',
  Dragomon: 'Dagomon',
  GrapLeomon: 'GrappuLeomon',
  KaiserGreymon: 'EmperorGreymon',
  ChaosGallantmon: 'ChaosDukemon',
  GroundLocomon: 'GrandLocomon',
  Creepymon: 'Daemon',
  Brakedramon: 'Breakdramon',
  Lotosmon: 'Lotusmon',
  Susanomon: 'Susanoomon',
  OmniShoutmon: 'OmegaShoutmon',
  'Kerpymon (Black)': 'Cherubimon (Vice)',
  'Kerpymon (Good)': 'Cherubimon',
  'MetalGreymon (Blue)': 'MetalGreymon (Virus)',
  'MagnaGarurumon (SV)': 'MagnaGarurumon',
  'Lucemon FM': 'Lucemon (Falldown Mode)',
  'Lucemon SM': 'Lucemon (Satan Mode)',
  'Imperialdramon DM': 'Imperialdramon',
  'Imperialdramon FM': 'Imperialdramon (Fighter Mode)',
  'Imperialdramon PM': 'Imperialdramon (Paladin Mode)',
  'ShineGreymon BM': 'ShineGreymon (Burst Mode)',
  'Leopardmon LM': 'Duftmon (Leopard Mode)',
  'Beelzemon BM': 'Beelzebumon (Blast Mode)',
  'Belphemon SM': 'Belphemon',
  'Belphemon RM': 'Belphemon (Rage Mode)',
  'MirageGaogamon BM': 'MirageGaogamon (Burst Mode)',
  'Ravemon BM': 'Ravmon (Burst Mode)',
  'Rosemon BM': 'Rosemon (Burst Mode)',
  'Omnimon Zwart': 'OmegamonZwart',
  'Chaosmon VA': 'Chaosmon (Valdur Arm)',
  'Gallantmon CM': 'Dukemon (Crimson Mode)',
  'Omnimon NX': 'Omegamon (X-Antibody)',
  'Gallantmon NX': 'Dukemon (X-Antibody)',
  'Leopardmon NX': 'Duftmon (X-Antibody)',
  'Sistermon Blanc (Awakened)': 'SistermonBlanc (Awake)',
  'Sistermon Noir (Awakened)': 'SistermonNoir (Awake)',
  'Sistermon Ciel (Awakened)': 'SistermonCiel (Awake)'
}
/** Tên trang wiki khác tên trong game (Alphamon X không có trang riêng: dùng trang Alphamon). */
const PAGE_TITLES = {
  Socerimon: 'Sorcermon',
  'Alphamon NX': 'Alphamon',
  'Crusadermon NX': 'Crusadermon X'
}
/** Bản X-Antibody: có được từ bản thường (nhiễm X-Antibody), không theo from / to của trang. */
const X_ANTIBODY_OF = { 'Alphamon NX': 'Alphamon', 'Crusadermon NX': 'Crusadermon' }
/** Merukimon là tên Cyber Sleuth của Mercurymon (Olympus XII). */
const OLYMPUS_ALIASES = new Set(['merukimon'])
/** Tên loài mới trong game (tên trên wiki đã quen thuộc hơn tên viết tắt của Cyber Sleuth). */
const DISPLAY_NAMES = {
  Socerimon: 'Sorcermon',
  'Alphamon NX': 'Alphamon (X-Antibody)',
  'Crusadermon NX': 'Crusadermon (X-Antibody)'
}
/** Cấp theo cách gọi lồng tiếng → cấp của digi-api (LEVELS). */
const DUB_LEVELS = {
  fresh: 'Baby I',
  'in-training': 'Baby II',
  rookie: 'Child',
  champion: 'Adult',
  armor: 'Armor',
  ultimate: 'Perfect',
  hybrid: 'Hybrid',
  mega: 'Ultimate',
  ultra: 'Ultimate'
}

const norm = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const existing = existingSpecies('digimon')
const enNames = JSON.parse(
  readFileSync(new URL('../../src/data/i18n/en/species.json', import.meta.url), 'utf8')
)
const existingByNorm = new Map(
  [...existing.values()].map((sp) => [norm(enNames[sp.id]), { name: enNames[sp.id], sp }])
)
/** Tên Cyber Sleuth → loài đã có (qua mọi bảng alias), không có thì undefined. */
const resolveExisting = (name) =>
  [CS_ALIASES[name], DIGIMON_ALIASES[name], name]
    .filter(Boolean)
    .map((candidate) => existingByNorm.get(norm(candidate)))
    .find(Boolean)

const guides = await pagesWikitext(api, FIELD_GUIDES)
const csNames = [
  ...new Set(
    [...guides.values()].flatMap((text) =>
      [...text.matchAll(/\{\{h\|([^}|]+)/g)].map((m) => m[1].trim())
    )
  )
]
const excluded = []
const missing = []
for (const name of csNames) {
  if (resolveExisting(name)) continue
  if (OLYMPUS.test(name.replace(/\s+/g, '')) || OLYMPUS_ALIASES.has(name.toLowerCase())) {
    excluded.push({ name, reason: 'thần Olympus XII (thần dạng người có tên riêng)' })
    continue
  }
  missing.push(name)
}

const pageOf = (name) => PAGE_TITLES[name] ?? name.replace(/^Arcadiamon (.+)$/, 'Arcadiamon ($1)')
const pages = await pagesWikitext(api, missing.map(pageOf))
const linkNames = (value) =>
  [...String(value ?? '').matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim())

const species = []
const evolutionsOfExisting = new Map()
const levelOfName = new Map()
const parsed = []
for (const name of missing) {
  const box = /\{\{Digimon Infobox([\s\S]*?)\n\}\}/i.exec(pages.get(pageOf(name)) ?? '')
  if (!box) {
    excluded.push({ name, reason: 'không có trang / infobox trên wiki' })
    continue
  }
  const p = infoboxParams(box[1])
  const level = LEVELS[DUB_LEVELS[plainText(p.level ?? '').toLowerCase()]] ?? DEFAULT_LEVEL
  const displayName = DISPLAY_NAMES[name] ?? name
  levelOfName.set(norm(displayName), level)
  levelOfName.set(norm(pageOf(name)), level)
  parsed.push({ name, displayName, p, level })
}

/** Tên trên wiki (liên kết from / to) → tên loài trong game (mới hoặc đã có), không có thì null. */
const nameInGame = (wikiName) => {
  const fresh = parsed.find(
    (e) => norm(pageOf(e.name)) === norm(wikiName) || norm(e.name) === norm(wikiName)
  )
  if (fresh) return fresh.displayName
  return resolveExisting(wikiName)?.name ?? null
}

for (const { name, displayName, p, level } of parsed) {
  const types = [plainText(p.type ?? '')].filter(Boolean)
  const fields = [p.family, p.family2].map((f) => plainText(f ?? '')).filter(Boolean)
  const evolutions = []
  const xBase = X_ANTIBODY_OF[name]
  for (const target of xBase ? [] : linkNames(p.to)) {
    const inGame = nameInGame(target)
    const targetLevel = levelOfName.get(norm(target)) ?? null
    if (!inGame || norm(inGame) === norm(displayName)) continue
    evolutions.push({ name: inGame, level: (targetLevel ?? LEVELS.Ultimate).evolveAt })
  }
  // Dạng trước đã có trong game: thêm hướng tiến hóa tới Digimon mới (chỉ thêm, `evolutions: 'add'`).
  for (const source of xBase ? [xBase] : linkNames(p.from)) {
    const found = resolveExisting(source)
    if (!found) continue
    const list = evolutionsOfExisting.get(found.name) ?? { sp: found.sp, evolutions: [] }
    list.evolutions.push({ name: displayName, level: level.evolveAt })
    evolutionsOfExisting.set(found.name, list)
  }
  const intro = /'''[^']+'''\s+is\s+an?\s+[^\n]+/.exec(pages.get(pageOf(name)) ?? '')?.[0]
  species.push({
    name: displayName,
    elements: elementsOf({ types, fields }),
    raceId: digimonTypeRace(types) ?? guessRace([displayName], 'eldritch'),
    tier: level.tier,
    style: STYLE_BY_ATTRIBUTE[plainText(p.attribute ?? '')] ?? 'balanced',
    evolutions: [...new Map(evolutions.map((e) => [e.name, e])).values()],
    category: types[0] ? `${types[0]} Digimon` : undefined,
    flavor: intro
      ? plainText(intro)
          .split(/(?<=\.)\s/)
          .slice(0, 2)
          .join(' ')
      : undefined
  })
}
// Loài đã có chỉ được thêm hướng tiến hóa; các trường khác chép lại cho file nguồn hợp lệ.
for (const [name, { sp, evolutions }] of evolutionsOfExisting) {
  species.push({ name, elements: sp.elementIds, raceId: sp.raceId, tier: 'medium', evolutions })
}
writeSource('digimonCyberSleuth', {
  source: 'digimon',
  origin: 'fantasy',
  update: { evolutions: 'add' },
  species,
  excluded
})
