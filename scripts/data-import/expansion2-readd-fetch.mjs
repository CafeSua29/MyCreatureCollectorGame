/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Thêm lại 12 loài đợt mở rộng 2 từng bỏ vì trùng tên loài nguồn khác (chủ project duyệt 2026-10-27:
// Claude đoán tác phẩm theo tên, dữ liệu sinh của đợt đó không còn). Mỗi tác phẩm / origin một file
// nguồn sources/extra-<khóa>.json; mô tả lấy từ đoạn mở đầu trang wiki khi có. Hệ / race / bậc do Claude
// gán như đợt mở rộng 2 (bảng dưới). Gecko không thêm: đã có bản động vật thật. Chạy:
// node scripts/data-import/expansion2-readd-fetch.mjs (cần mạng), rồi species-batch-import.mjs cho
// từng file sources/extra-*.json.

import { fetchJson, writeSource } from './sourceHelpers.mjs'

/** Khóa file → { origin, source?, wiki?, species: [{ name, page?, elements, raceId, tier }] }. */
const GROUPS = {
  elderScrolls: {
    origin: 'fantasy',
    source: 'elderScrolls',
    wiki: 'https://elderscrolls.fandom.com/api.php',
    species: [
      {
        name: 'Mud Crab',
        page: 'Mudcrab',
        elements: ['water', 'rock'],
        raceId: 'crustacean',
        tier: 'small'
      },
      { name: 'Sabrecat', page: 'Sabre Cat', elements: ['normal'], raceId: 'felid', tier: 'peak' }
    ]
  },
  dnd: {
    origin: 'fantasy',
    source: 'dnd',
    wiki: 'https://forgottenrealms.fandom.com/api.php',
    species: [
      { name: 'Ghast', elements: ['ghost', 'dark'], raceId: 'ghoul', tier: 'medium' },
      { name: 'Ki-rin', elements: ['light', 'flying'], raceId: 'divineBeast', tier: 'large' },
      { name: 'Devourer', elements: ['ghost', 'psychic'], raceId: 'wraith', tier: 'large' }
    ]
  },
  warcraft: {
    origin: 'fantasy',
    source: 'warcraft',
    wiki: 'https://wowpedia.fandom.com/api.php',
    species: [
      { name: 'Felbat', elements: ['dark', 'flying'], raceId: 'fiend', tier: 'medium' },
      { name: 'Corruptor', elements: ['poison', 'dark'], raceId: 'imp', tier: 'small' },
      { name: 'Granite Golem', elements: ['rock'], raceId: 'golem', tier: 'peak' }
    ]
  },
  // Thiên Khuyển 天犬 bản dân gian Trung Hoa (bản Sơn Hải Kinh đã có): cùng hệ / race.
  chineseFolklore: {
    origin: 'myth',
    source: 'chineseFolklore',
    species: [
      { name: 'Tianquan', elements: ['fire', 'light'], raceId: 'mythicBeast', tier: 'large' }
    ]
  },
  cryptid: {
    origin: 'cryptid',
    species: [
      {
        name: 'Ningyo (Cryptid)',
        elements: ['water', 'psychic'],
        raceId: 'merfolk',
        tier: 'medium'
      }
    ]
  },
  living: {
    origin: 'living',
    species: [
      {
        name: 'Blood Python (Snake)',
        elements: ['normal', 'poison'],
        raceId: 'serpent',
        tier: 'medium'
      },
      { name: 'Silverfish (Insect)', elements: ['bug'], raceId: 'insectoid', tier: 'small' }
    ]
  }
}

/** Câu mở đầu trang wiki (TextExtracts); không có thì undefined. */
async function introOf(wiki, page) {
  if (!wiki) return undefined
  const body = await fetchJson(
    `${wiki}?${new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exsentences: '2',
      redirects: '1',
      titles: page,
      format: 'json'
    })}`
  )
  const extract = Object.values(body?.query?.pages ?? {})[0]?.extract?.trim()
  return extract || undefined
}

for (const [key, group] of Object.entries(GROUPS)) {
  const species = []
  for (const { page, ...entry } of group.species) {
    species.push({ ...entry, flavor: await introOf(group.wiki, page ?? entry.name) })
  }
  writeSource(`extra-${key}`, {
    ...(group.source ? { source: group.source } : {}),
    origin: group.origin,
    species
  })
}
