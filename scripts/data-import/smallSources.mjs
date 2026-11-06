/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Hàm dùng chung cho nguồn nhỏ không có dữ liệu hệ (chỉ có tên / mô tả từ guide Steam, wiki thưa):
// tải trang HTML thành chữ, đoán hệ theo từ khóa trong tên / mô tả. Dùng cho beastmancer-fetch,
// vision-of-the-ant-fetch, void-monsters-fetch, creature-clicker-fetch, pochimoon-fetch, dinotica-fetch,
// koltera-fetch (content-sources-real.md).

import { readFileSync } from 'node:fs'

const HEADERS = { 'User-Agent': 'Mozilla/5.0 creature-collector-data-import/1.0' }

/** Trang HTML → các dòng chữ (bỏ script / style / thẻ). */
export async function pageLines(url) {
  const html = await (await fetch(url, { headers: HEADERS })).text()
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(div|p|li|h\d|td|tr)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Từ khóa → hệ (thứ tự là ưu tiên). */
const KEYWORD_ELEMENTS = [
  [/fire|flame|pyro|magma|lava|torch|ember|burn|inferno|smoke|volcan/i, 'fire'],
  [
    /water|aqua|sea|ocean|river|swamp|shell|whale|wale|fish|sushi|merfolk|finfolk|undine|carcin|dagon|tide/i,
    'water'
  ],
  [/ice|snow|frost|glacier|frozen|cold/i, 'ice'],
  [/thunder|lightning|dynamo|electr|spark|volt/i, 'electric'],
  [
    /plant|vine|leaf|flora|petal|moss|tree|treant|forest|bloom|flower|pumpk|sprout|root|shroom|truff|triffid/i,
    'grass'
  ],
  [
    /stone|rock|golem|boulder|cliff|obsidian|gargoyle|colossus|golom|earth|sand|desert|granite/i,
    'rock'
  ],
  [
    /ghost|phantom|spectre|specter|wraith|haunt|soul|spirit|grave|skull|bone|ghoul|tomb|horror|umbra/i,
    'ghost'
  ],
  [/demon|devil|abaddon|shadow|dark|night|curse|plague|nox/i, 'dark'],
  [/bot|robo|mech|automo|steel|iron|metal|knight|armor/i, 'steel'],
  [/poison|toxic|venom|sludge|slum|leech/i, 'poison'],
  [/bird|hawk|bat|wing|flutter|beak|feather|garud|moth|wind|sky|air/i, 'flying'],
  [/stinger|spider|arach|ant\b|formican|beetle|bee|insect|scorp/i, 'bug'],
  [/dragon|drake|wyrm|wyvern|raptor|rex|tyrant/i, 'dragon'],
  [/wizard|magus|mage|shaman|druid|djinn|mind|psy|dream/i, 'psychic'],
  [
    /minotaur|warrior|brigand|raider|assassin|soldier|guard|captain|general|champion|chief/i,
    'fighting'
  ]
]

/**
 * Hệ đoán theo tên rồi mô tả (tối đa 2). Không khớp thì không hệ (danh sách rỗng, data.md mục "Loài
 * không hệ"): nguồn không có hệ thì không gán tạm hệ Thường.
 */
export function guessElements(...texts) {
  const result = []
  for (const text of texts.filter(Boolean)) {
    for (const [pattern, element] of KEYWORD_ELEMENTS) {
      if (pattern.test(text) && !result.includes(element)) result.push(element)
      if (result.length === 2) return result
    }
  }
  return result
}

/**
 * Thành tựu Steam của một game (JSON nhúng trong trang achievements): [{ key (api_name viết thường),
 * text (mô tả) }]. Steam hay ngắt kết nối: `savedPage` là file trang đã lưu thì đọc file đó.
 */
export async function loadSteamAchievements(appId, savedPage) {
  const html = savedPage
    ? readFileSync(savedPage, 'utf8')
    : await (
        await fetch(`https://steamcommunity.com/stats/${appId}/achievements/`, {
          headers: { ...HEADERS, Cookie: 'Steam_Language=english' }
        })
      ).text()
  const pattern = /"api_name":"([^"]+)","name":"[^"]*","description":"([^"]*)"/g
  const list = [...html.replace(/\\"/g, '"').matchAll(pattern)].map((m) => ({
    key: m[1].toLowerCase(),
    text: m[2].replace(/\\t/g, '').trim()
  }))
  if (list.length === 0) throw new Error(`Không đọc được thành tựu của app ${appId}`)
  return list
}
