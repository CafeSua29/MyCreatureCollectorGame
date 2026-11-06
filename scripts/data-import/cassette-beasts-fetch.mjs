/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải loài Cassette Beasts từ Data:Species của wiki.cassettebeasts.com thành sources/cassetteBeasts.json:
// thêm loài còn thiếu, cập nhật chỉ số thật (cận chiến → công / thủ, tầm xa → đặc công / đặc thủ) và
// thêm hướng remaster còn thiếu. Hệ của loài đã có giữ nguyên (đã đổi đúng gốc ở cb-elements-import.mjs).
// Chạy: node scripts/data-import/cassette-beasts-fetch.mjs (cần mạng), rồi
// species-batch-import.mjs sources/cassetteBeasts.json. Luật ở content-sources-real.md mục "Cassette Beasts".

import { guessRace } from './raceGuess.mjs'
import { existingSpecies, fetchJson, unifyChainRaces, writeSource } from './sourceHelpers.mjs'

const API = 'https://wiki.cassettebeasts.com/api.php'
/** Tổng 6 chỉ số gốc (540–840) × hệ số này ≈ thang bậc của game (bé / vừa / lớn). */
const STAT_SCALE = 0.65
/** Remaster cần băng đạt hạng 5; game này quy thành level như các hướng remaster đã nhập. */
const REMASTER_LEVEL = 30

const body = await fetchJson(
  `${API}?${new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    titles: 'Data:Species',
    format: 'json'
  })}`
)
const raw = JSON.parse(Object.values(body.query.pages)[0].revisions[0].slots.main['*'])
const entries = Array.isArray(raw) ? raw : Object.values(raw)
const existing = existingSpecies('cassetteBeasts')

// Hệ của loài mới theo hệ gốc: lấy hệ game mà loài đã có cùng hệ gốc đang dùng nhiều nhất.
const typeVotes = new Map()
for (const entry of entries) {
  const sp = existing.get(entry.name.toLowerCase())
  if (!sp) continue
  const votes = typeVotes.get(entry.elemental_type) ?? new Map()
  const first = sp.elementIds[0]
  votes.set(first, (votes.get(first) ?? 0) + 1)
  typeVotes.set(entry.elemental_type, votes)
}
const elementOfType = (type) =>
  [...(typeVotes.get(type) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'normal'

// Archangel: không có trong Data:Species; chỉ số theo trang wiki của loài (2026-11-06). Không hệ như
// gốc (data.md mục "Loài không hệ"), bậc thần thoại.
const ARCHANGELS = [
  {
    name: 'Mourningstar',
    elemental_type: null,
    description: 'serpent God',
    bestiary_bios: [
      'The malevolent Mourningstar feeds on the devotion of others, sometimes to a lethal extent if the individual’s commitment is strong enough. It whispers from its underground station, hoping that its acolytes will eventually find their way down to it - and their deaths.'
    ],
    stats: {
      max_hp: 600,
      melee_attack: 200,
      melee_defense: 200,
      ranged_attack: 200,
      ranged_defense: 200,
      speed: 100
    },
    raceId: 'angel',
    tier: 'mythic'
  }
]

const species = [...entries, ...ARCHANGELS]
  .filter((entry) => entry.name && entry.stats)
  .map((entry) => {
    const s = entry.stats
    const shape = {
      hp: s.max_hp,
      attack: s.melee_attack,
      defense: s.melee_defense,
      spAttack: s.ranged_attack,
      spDefense: s.ranged_defense,
      speed: s.speed
    }
    const sp = existing.get(entry.name.toLowerCase())
    const flavor = entry.bestiary_bios?.[0]
    return {
      name: entry.name,
      elements: sp
        ? sp.elementIds
        : entry.elemental_type === null
          ? []
          : [elementOfType(entry.elemental_type)],
      raceId:
        sp?.raceId ??
        entry.raceId ??
        guessRace([entry.name, entry.description, flavor], null) ??
        'mythicBeast',
      stats: Object.fromEntries(
        Object.entries(shape).map(([k, v]) => [k, Math.max(1, Math.round(v * STAT_SCALE))])
      ),
      tier: entry.tier ?? (entry.evolves_from?.length ? 'peak' : 'medium'),
      evolutions: (entry.evolves_to ?? []).map((e) => ({
        name: e.evolved_form,
        level: REMASTER_LEVEL
      })),
      category: entry.description
        ? `${entry.description[0].toUpperCase()}${entry.description.slice(1)}`
        : undefined,
      flavor
    }
  })
unifyChainRaces(species, existing)
writeSource('cassetteBeasts', {
  source: 'cassetteBeasts',
  origin: 'fantasy',
  update: { stats: true, evolutions: 'add' },
  species
})
