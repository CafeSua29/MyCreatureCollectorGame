// Tải toàn bộ Temtem (temtem-api.mael.tech: hệ, chỉ số, tỉ lệ bắt, tiến hóa, chiều cao / cân nặng,
// mô tả Tempedia) thành scripts/data-import/sources/temtem.json. Chạy:
// node scripts/data-import/temtem-fetch.mjs (cần mạng), rồi species-batch-import.mjs sources/temtem.json.

import { guessRace } from './raceGuess.mjs'
import { existingSpecies, fetchJson, unifyChainRaces, writeSource } from './sourceHelpers.mjs'

/** Hệ Temtem → hệ game (content-sources.md mục "Game thuần hóa quái"). */
const TYPES = {
  Neutral: 'normal',
  Wind: 'flying',
  Earth: 'ground',
  Water: 'water',
  Fire: 'fire',
  Nature: 'grass',
  Electric: 'electric',
  Mental: 'psychic',
  Digital: 'steel',
  Melee: 'fighting',
  Crystal: 'rock',
  Toxic: 'poison'
}

const list = await fetchJson(
  'https://temtem-api.mael.tech/api/temtems?fields=number,name,types,stats,evolution,details,gameDescription,catchRate'
)
if (!list) throw new Error('Không tải được Temtem API')
const existing = existingSpecies('temtem')
const species = list.map((tem) => {
  const tree = tem.evolution?.evolutionTree ?? []
  const stage = tree.findIndex((node) => node.number === tem.number)
  const next = stage >= 0 ? tree.filter((node) => node.stage === tree[stage].stage + 1) : []
  return {
    name: tem.name,
    elements: tem.types.map((t) => TYPES[t]),
    raceId: guessRace([tem.name, tem.gameDescription?.split('.')[0]], 'wildBeast'),
    stats: {
      hp: tem.stats.hp,
      attack: tem.stats.atk,
      defense: tem.stats.def,
      spAttack: tem.stats.spatk,
      spDefense: tem.stats.spdef,
      speed: tem.stats.spd
    },
    catchRate255: tem.catchRate,
    evolutions: next
      .filter((node) => node.type === 'levels' && node.level > 0)
      .map((node) => ({ name: node.name, level: node.level })),
    heightM: tem.details?.height?.cm ? tem.details.height.cm / 100 : undefined,
    weightKg: tem.details?.weight?.kg || undefined,
    flavor: tem.gameDescription || undefined
  }
})
unifyChainRaces(species, existing)
writeSource('temtem', {
  source: 'temtem',
  origin: 'fantasy',
  update: { race: true, stats: true, elements: true, evolutions: true, catchRate: true },
  species
})
