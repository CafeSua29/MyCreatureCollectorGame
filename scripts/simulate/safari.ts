// Khu bảo tồn trong mô phỏng (mục "Khu bảo tồn" ở simulation-features.md, docs/rules/safari-zone.md):
// mỗi (tầng × cách chơi) vào khu `visits` lần bằng action thật, đo số quái bắt được mỗi lượt vào
// khu, bóng đã dùng, quái chạy mất, độ hiếm của quái bắt được và phí trên mỗi quái.

import {
  createGameState,
  createRng,
  gameReducer,
  safariEntryFee,
  speciesRankOf,
  type GameAction,
  type GameData,
  type GameState,
  type GameLogEntry
} from '@core'
import { floorMapsFor } from './floorSweep'
import { assumedTamerRealm } from './tamer'
import { buildMonster, deriveSeed, geneValue } from './team'
import type { SafariPolicy } from './scenarios'

/** Loài hiếm của cách chơi rareOnly (SAFARI_POLICIES ở scenarios.ts) (catchRate thang 0–100). */
const RARE_CATCH_RATE = 30

export interface SafariRow {
  floor: number
  policy: SafariPolicy
  visits: number
  encounters: number
  caught: number
  ballsThrown: number
  fled: number
  /** Tổng catchRate / thứ hạng phẩm cấp của loài quái bắt được (chia caught ra trung bình). */
  catchRateSum: number
  rankSum: number
  /** Quái bắt được thuộc loài không có trong map nào đã mở. */
  unmappedCaught: number
  /** Phí một lần vào khu (number: tầng mô phỏng nhỏ). */
  fee: number
}

const catchRateOf = (data: GameData, speciesId: string): number => {
  const species = data.species[speciesId]
  return species?.kind === 'normal' ? species.catchRate : 100
}

/** Lệnh cho quái đang gặp theo cách chơi (`lured`: đã ném mồi / đá lần này chưa). */
function nextAction(
  data: GameData,
  state: GameState,
  { policy, lured }: { policy: SafariPolicy; lured: boolean }
): GameAction {
  const encounter = state.safari.visit?.encounter
  if (!encounter) throw new Error('Mô phỏng khu bảo tồn: không có quái đang gặp')
  if (policy === 'rareOnly' && catchRateOf(data, encounter.monster.speciesId) >= RARE_CATCH_RATE) {
    return { type: 'skipSafariEncounter' }
  }
  if (policy === 'rock' && !lured) return { type: 'throwSafariRock' }
  if (policy === 'bait' && !lured) return { type: 'throwSafariBait' }
  return { type: 'throwSafariBall' }
}

/** Ghi các sự kiện của một action vào hàng kết quả. */
function tally(
  data: GameData,
  row: SafariRow,
  { events, mapped }: { events: readonly GameLogEntry[]; mapped: ReadonlySet<string> },
  state: GameState
): void {
  const ranks = Object.keys(data.speciesRanks)
  for (const event of events) {
    if (event.type === 'safariEncounter') row.encounters++
    else if (event.type === 'safariThrowBall') row.ballsThrown++
    else if (event.type === 'safariFled') row.fled++
    else if (event.type === 'safariCaught') {
      row.caught++
      const monster = [...state.party, ...state.storage].find((m) => m.id === event.monsterId)
      const species = monster ? data.species[monster.baseSpeciesId] : undefined
      if (species?.kind !== 'normal') continue
      row.catchRateSum += species.catchRate
      row.rankSum += Math.max(0, ranks.indexOf(speciesRankOf(data, species).id))
      if (!mapped.has(species.id)) row.unmappedCaught++
    }
  }
}

/** Loài quái thường của các map đã mở. */
function mappedSpeciesIds(data: GameData, floorBiomeIds: readonly string[]): Set<string> {
  const ids = new Set<string>()
  for (const biomeId of floorBiomeIds) {
    for (const entry of data.biomes[biomeId]?.encounters ?? []) ids.add(entry.speciesId)
  }
  return ids
}

/** Một (tầng × cách chơi): `visits` lượt vào khu liên tiếp (danh sách loài đổi theo ngày như thật). */
export function runSafari(
  data: GameData,
  {
    floor,
    policy,
    visits,
    seed
  }: { floor: number; policy: SafariPolicy; visits: number; seed: number }
): SafariRow {
  const runSeed = deriveSeed(seed, 'safari', floor, policy)
  const floorBiomeIds = floorMapsFor(data, { floor, biomeId: null, seed: runSeed })
  // Đội một quái loài đầu tiên của map (chỉ để có kỹ năng đồng hành như người chơi thật).
  const [partyMonster] = buildMonster(data, createRng(runSeed), {
    id: 'm1',
    speciesId: data.biomes[floorBiomeIds[0]].encounters[0].speciesId,
    level: 1,
    genes: geneValue(data, floor, 'wild'),
    traits: []
  })
  const start = createGameState({
    // Mô phỏng đo với thọ nguyên bật (game mới mặc định tắt, docs/rules/options.md).
    lifespanEnabled: true,
    seed: runSeed,
    party: [partyMonster],
    floorBiomeIds,
    tamerRealm: assumedTamerRealm(floor)
  })
  const fee = safariEntryFee(data, start)
  const mapped = mappedSpeciesIds(data, floorBiomeIds)
  const row: SafariRow = {
    floor,
    policy,
    visits,
    encounters: 0,
    caught: 0,
    ballsThrown: 0,
    fled: 0,
    catchRateSum: 0,
    rankSum: 0,
    unmappedCaught: 0,
    fee: fee.toNumber()
  }
  let state: GameState = start
  for (let i = 0; i < visits; i++) {
    // Mỗi lượt vào khu đủ tiền; quái bắt được bỏ ra sau mỗi lượt để state gọn; event / thú triều
    // (việc theo ngày) không đo ở phần này nên bỏ.
    state = { ...state, money: fee, party: start.party, storage: [], events: start.events }
    state = gameReducer(data, state, { type: 'enterSafari' })
    tally(data, row, { events: state.log, mapped }, state)
    let lured = false
    let encounterId = state.safari.visit?.encounter.monster.id
    while (state.safari.visit) {
      const action = nextAction(data, state, { policy, lured })
      if (action.type === 'throwSafariRock' || action.type === 'throwSafariBait') lured = true
      state = gameReducer(data, state, action)
      tally(data, row, { events: state.log, mapped }, state)
      const current = state.safari.visit?.encounter.monster.id
      if (current !== encounterId) {
        encounterId = current
        lured = false
      }
    }
  }
  return row
}
