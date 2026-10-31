/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Đối chiếu spell / ability / passive TWW3 có cờ verifyName / effectGuessed trong tww3-source.json với
// Total War: WARHAMMER wiki (totalwarwarhammer.fandom.com). Chạy:
// node scripts/data-import/tww3-verify.mjs (cần mạng). Ghi scripts/data-import/tww3-verify-report.json:
// mỗi mục có tên trang tìm được (theo tiêu đề, chuyển hướng, rồi tìm kiếm) và đoạn mô tả trên wiki để
// rà tay. Kết quả rà (tên / hint đã sửa, cờ đã bỏ) ghi ngược vào tww3-source.json bằng tay.

import { readFileSync, writeFileSync } from 'node:fs'

const API = 'https://totalwarwarhammer.fandom.com/api.php'
const HEADERS = { 'User-Agent': 'creature-collector-data-import/1.0 (offline game data build)' }
const source = JSON.parse(readFileSync(new URL('./tww3-source.json', import.meta.url), 'utf8'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS })
      if (response.ok) return await response.json()
    } catch {
      // thử lại sau
    }
    await sleep(1500 * (attempt + 1))
  }
  throw new Error(`Wiki không trả lời: ${url}`)
}

/** Mọi mục có cờ cần rà, kèm nhóm (spell / ability / passive). */
function flaggedEntries() {
  const entries = []
  for (const lore of source.lores) {
    for (const spell of lore.spells) entries.push({ group: 'spell', lore: lore.name, ...spell })
  }
  for (const ability of source.abilities) entries.push({ group: 'ability', ...ability })
  for (const passive of source.passives) entries.push({ group: 'passive', ...passive })
  return entries.filter((e) => e.verifyName || e.effectGuessed)
}

/** Bỏ cú pháp wiki, giữ chữ đọc được. */
function plainText(wikitext) {
  return wikitext
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Dòng hiệu ứng gọn: hàng "| Khóa | Giá trị" của bảng spell trên trang lore, tham số `effects=` /
 * `type=` của infobox, hoặc gạch đầu dòng mục "Effect(s)".
 */
function effectLines(wikitext, name) {
  const lower = wikitext.toLowerCase()
  const header = lower.indexOf(`=== ${name.toLowerCase()} ===`)
  if (header >= 0) {
    const table = wikitext.slice(header, wikitext.indexOf('|}', header))
    const rows = [...table.matchAll(/\|-\s*\n?\s*\|\s*([^|\n]+?)\s*\|\|?\s*([^|\n]+)/g)]
    const notes = [...table.matchAll(/colspan="2"\s*\|\s*([^|\n]+)/g)].map((m) => m[1].trim())
    return [...rows.map((m) => `${m[1].trim()}: ${m[2].trim()}`), ...notes.slice(1)]
      .map(plainText)
      .filter(Boolean)
  }
  const lines = []
  const infobox = wikitext.match(/\|\s*(type|effects|imbues)\s*=([^|]*(?:\n\*[^\n]*)*)/gi) ?? []
  lines.push(...infobox.map(plainText))
  const section = wikitext.match(/==\s*Effects?\s*==([\s\S]*?)(?:\n==[^=]|$)/i)
  if (section)
    lines.push(
      ...section[1]
        .split('\n')
        .filter((l) => l.startsWith('*'))
        .map(plainText)
    )
  return lines.filter(Boolean).slice(0, 14)
}

/** Đoạn liên quan: phần quanh tên mục (trang lore chứa nhiều spell) hoặc đầu trang. */
function excerpt(wikitext, name) {
  const lower = wikitext.toLowerCase()
  const at = lower.indexOf(name.toLowerCase())
  const start = at > 0 ? Math.max(0, at - 50) : 0
  return plainText(wikitext.slice(start, start + 2500)).slice(0, 700)
}

async function resolveTitles(names) {
  const found = new Map()
  for (let i = 0; i < names.length; i += 40) {
    const batch = names.slice(i, i + 40)
    const body = await api({ action: 'query', titles: batch.join('|'), redirects: '1' })
    const redirects = new Map((body.query.redirects ?? []).map((r) => [r.from, r.to]))
    const normalized = new Map((body.query.normalized ?? []).map((r) => [r.from, r.to]))
    const existing = new Set(
      Object.values(body.query.pages)
        .filter((p) => !('missing' in p))
        .map((p) => p.title)
    )
    for (const name of batch) {
      const title = normalized.get(name) ?? name
      const target = redirects.get(title) ?? title
      if (existing.has(target)) found.set(name, target)
    }
    await sleep(300)
  }
  return found
}

const entries = flaggedEntries()
const titles = await resolveTitles([...new Set(entries.map((e) => e.name))])
const pages = new Map()
const report = []
for (const entry of entries) {
  let title = titles.get(entry.name) ?? null
  let via = title ? 'title' : null
  if (!title) {
    const body = await api({ action: 'query', list: 'search', srsearch: entry.name, srlimit: '3' })
    title = body.query.search[0]?.title ?? null
    via = title ? 'search' : null
    await sleep(300)
  }
  if (title && !pages.has(title)) {
    const body = await api({ action: 'parse', page: title, prop: 'wikitext' })
    pages.set(title, body.parse?.wikitext?.['*'] ?? '')
    await sleep(300)
  }
  const wikitext = title ? pages.get(title) : ''
  report.push({
    group: entry.group,
    id: entry.id,
    name: entry.name,
    verifyName: entry.verifyName,
    effectGuessed: entry.effectGuessed,
    hint: entry.hint,
    wikiTitle: title,
    via,
    nameOnPage: Boolean(wikitext) && wikitext.toLowerCase().includes(entry.name.toLowerCase()),
    effects: wikitext ? effectLines(wikitext, entry.name) : [],
    wiki: wikitext ? excerpt(wikitext, entry.name) : ''
  })
}
writeFileSync(
  new URL('./tww3-verify-report.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`
)
const onPage = report.filter((r) => r.nameOnPage).length
console.log(`Mục cần rà: ${report.length}; tên có trên wiki: ${onPage}`)
