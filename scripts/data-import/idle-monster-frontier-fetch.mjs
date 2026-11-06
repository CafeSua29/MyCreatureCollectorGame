/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Idle Monster Frontier từ idle-monster-frontier.fandom.com (bảng theo tộc trên trang
// "Monsters" và bảng trang "Dark Carnival", cùng boss cuối mỗi vùng) thành sources/idleMonsterFrontier.json.
// Boss vẫn lấy dù game gốc không bắt được (luật "boss bắt được" ở content-data.md), trừ boss mang tên
// riêng (Ramesses: luật nhân vật độc nhất). Game không có hệ: hệ theo tộc (Beast Thường, Human Giác đấu, Demon
// Bóng tối, Undead Ma, Accursed Tâm linh) cộng từ khóa tên. Chỉ số: VIT → HP, STR → công, INT → đặc
// công, tốc độ Low / Med / Hi. Chạy: node scripts/data-import/idle-monster-frontier-fetch.mjs (cần mạng),
// rồi species-batch-import.mjs sources/idleMonsterFrontier.json. Luật ở content-sources-real.md mục "Idle Monster Frontier".

import { guessRace } from './raceGuess.mjs'
import { existingSpecies, plainText, wikiApi, writeSource } from './sourceHelpers.mjs'
import { guessElements } from './smallSources.mjs'

const api = wikiApi('https://idle-monster-frontier.fandom.com/api.php')
const TRIBES = {
  Beasts: { element: 'normal', race: null },
  Humans: { element: 'fighting', race: 'human' },
  Demons: { element: 'dark', race: 'fiend' },
  Undead: { element: 'ghost', race: 'zombie' },
  Accursed: { element: 'psychic', race: 'eldritch' }
}
const TRIBE_OF = {
  Beast: 'Beasts',
  Human: 'Humans',
  Demon: 'Demons',
  Undead: 'Undead',
  Accursed: 'Accursed'
}
const RARITY_TIER = {
  Common: 'small',
  Rare: 'medium',
  Epic: 'peak',
  Legendary: 'large',
  Master: 'mythic'
}
const TIER_TOTAL = { small: 290, medium: 420, peak: 520, large: 560, mythic: 630 }
const SPEED = { low: 1, med: 1.5, hi: 2, high: 2 }

const wikitext = async (page) =>
  (await api({ action: 'parse', page, prop: 'wikitext' }))?.parse?.wikitext?.['*'] ?? ''

/** Một hàng bảng → các ô (bỏ ảnh [[File:...]]). */
function rowCells(row) {
  return row
    .split(/\n\|(?!-)/)
    .slice(1)
    .map((cell) => plainText(cell.replace(/\[\[File:[^\]]*\]\]/g, '')).trim())
}

function parseRow(row, tribeName) {
  const cells = rowCells(`\n${row}`)
  const name = cells[0]
  const rarity = cells.find((c) => RARITY_TIER[c])
  const cls = cells.find((c) => c === 'Warrior' || c === 'Mage')
  if (!name || !rarity || !cls) return null
  const tribe = cells.map((c) => TRIBE_OF[c]).find(Boolean) ?? tribeName
  const statCell = cells.find((c) => /Vit\s*\d/i.test(c))
  let vit, str, int, spd
  if (statCell) {
    ;[vit, str, int] = ['Vit', 'Str', 'Int'].map((k) =>
      Number(new RegExp(`${k}\\s*(\\d+)`, 'i').exec(statCell)?.[1])
    )
    spd = /Spd\s*(\w+)/i.exec(statCell)?.[1]
  } else {
    const numbers = cells
      .slice(cells.indexOf(cls) + 1)
      .filter((c) => /^\d+$/.test(c))
      .map(Number)
    ;[vit, str, int] = numbers
    spd = cells.slice(cells.indexOf(cls) + 1).find((c) => SPEED[c.toLowerCase()] !== undefined)
  }
  return { name, rarity, cls, tribe, vit, str, int, spd, trait: cells[1] }
}

function parseTables(text, defaultTribe) {
  const rows = []
  let tribe = defaultTribe
  for (const block of text.split(/\n(?===)/)) {
    const heading = /^===\s*([A-Za-z]+)\s*===/.exec(block)?.[1]
    if (heading) tribe = heading
    if (/^==\s*Boss/i.test(block)) break
    for (const row of block.split(/\n\|-/).slice(1)) {
      const parsed = parseRow(row, tribe)
      if (parsed) rows.push(parsed)
    }
  }
  return rows
}

/** Boss có tên riêng (luật nhân vật độc nhất, content-data.md). */
const UNIQUE_BOSSES = new Set(['Ramesses'])
/** Boss bậc lớn; chỉ số dựng theo bậc, kiểu theo class (game không ghi chỉ số boss). */
const BOSS_TIER = 'large'
const CLASS_STYLE = { warrior: 'bruiser', mage: 'caster' }
/** Race boss theo hình dạng (tên không đoán đúng: Cyclops là người khổng lồ một mắt). */
const BOSS_RACE = { Cyclops: 'giant', Skelesnake: 'skeleton' }

/** Mục "=== Tên (Tộc) ===" + "X is a <tộc> <class>." ở phần Boss của trang Monsters. */
function parseBosses(text) {
  const bossPart = text.split(/==\s*Boss\s*==/)[1] ?? ''
  return [
    ...bossPart.matchAll(/===\s*([^=(]+?)\s*\((\w+)\)\s*===[\s\S]*?is an? \w+ (warrior|mage)/gi)
  ]
    .filter((m) => !UNIQUE_BOSSES.has(m[1]))
    .map((m) => ({ name: m[1], tribe: m[2], cls: m[3].toLowerCase() }))
}

const monstersText = await wikitext('Monsters')
const rows = [
  ...parseTables(monstersText.split(/==\s*List of Monsters\s*==/)[1] ?? '', 'Beasts'),
  ...parseTables(await wikitext('Dark_Carnival'), 'Beasts')
]
const existing = existingSpecies('idleMonsterFrontier')
const species = []
for (const row of rows) {
  if (species.some((s) => s.name === row.name)) continue
  const tribe = TRIBES[row.tribe] ?? TRIBES.Beasts
  const tier = RARITY_TIER[row.rarity]
  const speed = (SPEED[String(row.spd).toLowerCase()] ?? 1) * 5
  const shape = {
    hp: row.vit || 5,
    attack: row.str || 5,
    defense: ((row.vit || 5) + (row.str || 5)) / 2,
    spAttack: row.int || 5,
    spDefense: ((row.vit || 5) + (row.int || 5)) / 2,
    speed
  }
  const sum = Object.values(shape).reduce((a, b) => a + b, 0)
  const named = guessElements(row.name)
  species.push({
    name: row.name,
    elements: [...new Set([named[0] ?? tribe.element, tribe.element])].slice(0, 2),
    raceId:
      existing.get(row.name.toLowerCase())?.raceId ??
      guessRace([row.name], null) ??
      tribe.race ??
      'mythicBeast',
    stats: Object.fromEntries(
      Object.entries(shape).map(([k, v]) => [
        k,
        Math.max(1, Math.round((v * TIER_TOTAL[tier]) / sum))
      ])
    ),
    tier,
    category: `${row.rarity} ${row.cls} (${row.tribe})`,
    flavor: row.trait ? `Core trait: ${row.trait}.` : undefined
  })
}
for (const boss of parseBosses(monstersText)) {
  if (species.some((s) => s.name === boss.name)) continue
  const tribe = TRIBES[boss.tribe] ?? TRIBES.Beasts
  const named = guessElements(boss.name)
  species.push({
    name: boss.name,
    elements: [...new Set([named[0] ?? tribe.element, tribe.element])].slice(0, 2),
    raceId:
      existing.get(boss.name.toLowerCase())?.raceId ??
      BOSS_RACE[boss.name] ??
      guessRace([boss.name], null) ??
      tribe.race ??
      'mythicBeast',
    tier: BOSS_TIER,
    style: CLASS_STYLE[boss.cls],
    category: `Boss ${boss.cls} (${boss.tribe})`
  })
}
writeSource('idleMonsterFrontier', { source: 'idleMonsterFrontier', origin: 'fantasy', species })
