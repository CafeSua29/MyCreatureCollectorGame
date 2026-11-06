/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải chiêu (technique), trait, learnset và trạng thái (condition) của Temtem thành
// scripts/data-import/temtem-moves-source.json cho temtem-moves-import.mjs. Nguồn: temtem-api.mael.tech
// (số: sát thương, giá thể lực, hold, ưu tiên, synergy, mục tiêu) và wiki temtem.wiki.gg (phần mô tả có
// số bậc chỉ số `{{statchange|+1|spd}}` mà chữ của API đã mất). Wiki giới hạn tần suất: gọi API theo
// lô 50 trang, có User-Agent. Chạy: node scripts/data-import/temtem-moves-fetch.mjs (cần mạng).

import { writeFileSync } from 'node:fs'

const API = 'https://temtem-api.mael.tech/api/'
const WIKI_API = 'https://temtem.wiki.gg/api.php'
const USER_AGENT = 'CreatureCollectorDataImport/1.0 (offline game data tool)'
const OUT = new URL('./temtem-moves-source.json', import.meta.url)
const WIKI_BATCH = 50
const RETRY_DELAY_MS = 20000
const MAX_TRIES = 6

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (response.ok) {
      const body = await response.json()
      if (!body.error) return body
    }
    await wait(RETRY_DELAY_MS)
  }
  throw new Error(`Không tải được ${url}`)
}

/** Chỉ giữ phần infobox và mục "Effect" của trang wiki (bỏ lịch sử bản vá, trivia). */
function effectPart(text) {
  const infobox = text.match(/\{\{(Technique|Trait) Infobox[\s\S]*?\n\}\}/)?.[0] ?? ''
  const effect = text.match(/==\s*Effects?\s*==([\s\S]*?)(\n==[^=]|$)/)?.[1]?.trim() ?? ''
  return { infobox, effect }
}

async function fetchWiki(titles) {
  const pages = {}
  for (let i = 0; i < titles.length; i += WIKI_BATCH) {
    const batch = titles.slice(i, i + WIKI_BATCH)
    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      format: 'json',
      redirects: '1',
      titles: batch.join('|')
    })
    const body = await getJson(`${WIKI_API}?${params}`)
    const redirects = Object.fromEntries(
      [...(body.query.normalized ?? []), ...(body.query.redirects ?? [])].map((r) => [r.to, r.from])
    )
    for (const page of Object.values(body.query.pages)) {
      const text = page.revisions?.[0]?.slots?.main?.['*']
      if (!text) continue
      let title = page.title
      while (redirects[title]) title = redirects[title]
      pages[title] = effectPart(text)
    }
  }
  return pages
}

const pageTitle = (entry) => decodeURIComponent(entry.wikiUrl.split('/wiki/')[1]).replace(/_/g, ' ')

const techniques = await getJson(`${API}techniques`)
const traits = await getJson(`${API}traits`)
const conditions = await getJson(`${API}conditions`)
const temtems = await getJson(`${API}temtems?fields=number,name,techniques,traits`)
const wiki = await fetchWiki([...techniques, ...traits].map(pageTitle))
const withWiki = (entry) => ({ ...entry, wiki: wiki[pageTitle(entry)] ?? null })
const source = {
  techniques: techniques.map(withWiki),
  traits: traits.map(withWiki),
  conditions,
  temtems
}
writeFileSync(OUT, `${JSON.stringify(source, null, 1)}\n`)
const missing = [...source.techniques, ...source.traits].filter((e) => !e.wiki).map((e) => e.name)
console.log(
  `${techniques.length} chiêu, ${traits.length} trait, ${temtems.length} Temtem; thiếu wiki: ${missing.join(', ') || 'không'}`
)
