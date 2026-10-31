/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Hàm dùng chung cho các script *-fetch.mjs (đợt "Dữ liệu nguồn thật", content-sources-more.md):
// tải JSON / wiki có thử lại, đọc loài đã có của một nguồn, gom race theo chuỗi tiến hóa, ghi file
// nguồn chuẩn hóa scripts/data-import/sources/<nguồn>.json cho species-batch-import.mjs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const DATA = new URL('../../src/data/', import.meta.url)
const SOURCES = new URL('./sources/', import.meta.url)
const HEADERS = { 'User-Agent': 'creature-collector-data-import/1.0 (offline game data build)' }
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** GET JSON có thử lại; 404 hoặc hết lượt thử trả null. */
export async function fetchJson(url, { attempts = 4 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS })
      if (response.ok) return await response.json()
      if (response.status === 404) return null
    } catch {
      // thử lại sau
    }
    await sleep(1500 * (attempt + 1))
  }
  console.warn(`Không tải được ${url}`)
  return null
}

/** Gọi MediaWiki API (fandom, wiki.gg...) của một wiki. */
export const wikiApi = (base) => (params) =>
  fetchJson(`${base}?${new URLSearchParams({ format: 'json', ...params })}`)

/** Mọi trang của một category (bỏ category con). */
export async function categoryMembers(api, category) {
  const titles = []
  let cont
  do {
    const body = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '500',
      cmnamespace: '0',
      ...(cont ? { cmcontinue: cont } : {})
    })
    titles.push(...(body?.query?.categorymembers ?? []).map((m) => m.title))
    cont = body?.continue?.cmcontinue
  } while (cont)
  return titles
}

/** Wikitext của nhiều trang (gom 50 trang một lần gọi). */
export async function pagesWikitext(api, titles) {
  const result = new Map()
  for (let i = 0; i < titles.length; i += 50) {
    const body = await api({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: '1',
      titles: titles.slice(i, i + 50).join('|')
    })
    for (const page of Object.values(body?.query?.pages ?? {})) {
      const text = page.revisions?.[0]?.slots?.main?.['*']
      if (text) result.set(page.title, text)
    }
    await sleep(300)
  }
  return result
}

/** Category của nhiều trang (gom 50 trang một lần gọi): tiêu đề → tên category (không tiền tố). */
export async function pageCategories(api, titles) {
  const result = new Map()
  for (let i = 0; i < titles.length; i += 50) {
    let cont
    do {
      const body = await api({
        action: 'query',
        prop: 'categories',
        cllimit: 'max',
        redirects: '1',
        titles: titles.slice(i, i + 50).join('|'),
        ...(cont ? { clcontinue: cont } : {})
      })
      for (const page of Object.values(body?.query?.pages ?? {})) {
        const list = result.get(page.title) ?? []
        list.push(...(page.categories ?? []).map((c) => c.title.replace(/^Category:/, '')))
        result.set(page.title, list)
      }
      cont = body?.continue?.clcontinue
    } while (cont)
    await sleep(300)
  }
  return result
}

/**
 * Tham số infobox `| key = value` → object (khóa viết thường; khóa lặp lấy lần đầu; giá trị dừng ở
 * dấu `|` kế tiếp ngoài [[liên kết]] hoặc cuối dòng).
 */
export function infoboxParams(wikitext) {
  const params = {}
  const pattern = /\|\s*([A-Za-z0-9 _-]+?)\s*=\s*((?:\[\[[^\]]*\]\]|[^|\n])*)/g
  for (const match of wikitext.matchAll(pattern)) {
    const key = match[1].trim().toLowerCase()
    if (!(key in params)) params[key] = match[2].trim()
  }
  return params
}

/** Bỏ cú pháp wiki, giữ chữ đọc được. */
export function plainText(wikitext) {
  return String(wikitext)
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Loài đã có của một nguồn: tên tiếng Anh (thường) → loài. */
export function existingSpecies(source) {
  const species = JSON.parse(readFileSync(new URL('species.json', DATA), 'utf8'))
  const names = JSON.parse(readFileSync(new URL('i18n/en/species.json', DATA), 'utf8'))
  return new Map(
    species
      .filter((s) => s.source === source && names[s.id])
      .map((s) => [names[s.id].toLowerCase(), s])
  )
}

/**
 * Gom race theo chuỗi tiến hóa cho nguồn không có khái niệm race (Temtem, Yo-kai...: cùng một sinh vật
 * lớn lên): race của loài đã có đầu tiên trong chuỗi,
 * không có thì race đoán của dạng đầu tiên trong danh sách.
 */
export function unifyChainRaces(entries, existing) {
  const parent = new Map(entries.map((e) => [e.name.toLowerCase(), e.name.toLowerCase()]))
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)))
  for (const entry of entries) {
    for (const evolution of entry.evolutions ?? []) {
      const a = find(entry.name.toLowerCase())
      const b = parent.has(evolution.name.toLowerCase()) ? find(evolution.name.toLowerCase()) : null
      if (b && a !== b) parent.set(b, a)
    }
  }
  const chainRace = new Map()
  for (const entry of entries) {
    const root = find(entry.name.toLowerCase())
    const known = existing.get(entry.name.toLowerCase())?.raceId
    if (known && !chainRace.has(root)) chainRace.set(root, known)
  }
  for (const entry of entries) {
    const root = find(entry.name.toLowerCase())
    if (!chainRace.has(root)) chainRace.set(root, entry.raceId)
    entry.raceId = chainRace.get(root)
  }
}

/** Ghi file nguồn chuẩn hóa. */
export function writeSource(name, value) {
  mkdirSync(SOURCES, { recursive: true })
  writeFileSync(new URL(`${name}.json`, SOURCES), `${JSON.stringify(value, null, 1)}\n`)
  console.log(`${name}: ${value.species.length} loài, loại ${value.excluded?.length ?? 0}`)
}
