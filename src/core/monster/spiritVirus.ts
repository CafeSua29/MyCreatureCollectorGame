// Linh dịch, như Pokérus (docs/rules/spirit-virus.md): "bệnh" có lợi, hiếm, lây trong đội. Sau mỗi
// trận (mọi kết quả) có thể nhiễm ngẫu nhiên một quái rồi lây sang quái kề; đang nhiễm thì EXP, gen,
// điểm nỗ lực tăng; hết số ngày (chỉ đếm khi ở đội) thành miễn dịch vĩnh viễn.

import {
  STAT_NAMES,
  type BigStats,
  type GameData,
  type Monster,
  type SpiritVirus,
  type StatName
} from '../model'
import { asObject, checkInteger, nextInt, pick, rollPercent, type RngState } from '../shared'
import { floorGeneMultiplier } from '../registries'
import { mapBigStats } from './stats'

/** Quái đang nhiễm linh dịch (chưa khỏi). */
export const isSpiritVirusInfected = (monster: Pick<Monster, 'spiritVirus'>): boolean =>
  monster.spiritVirus?.state === 'infected'

/** % EXP nhận thêm do linh dịch: đang nhiễm / miễn dịch theo config, chưa từng nhiễm 0. */
export function spiritVirusExpPercent(data: GameData, monster: Monster): number {
  const config = data.config.spiritVirus
  switch (monster.spiritVirus?.state) {
    case undefined:
      return 0
    case 'infected':
      return config.infectedExpPercent
    case 'immune':
      return config.immuneExpPercent
  }
}

/** Hệ số nhân điểm nỗ lực do linh dịch (chỉ khi đang nhiễm, như Pokérus). */
export const spiritVirusEffortMultiplier = (data: GameData, monster: Monster): number =>
  isSpiritVirusInfected(monster) ? data.config.spiritVirus.effortMultiplier : 1

/** Một lần nhiễm mới: số ngày tung đều trong [minDays, maxDays]. */
function rollInfection(data: GameData, rng: RngState): [SpiritVirus, RngState] {
  const { minDays, maxDays } = data.config.spiritVirus
  const [daysLeft, next] = nextInt(rng, minDays, maxDays)
  return [{ state: 'infected', daysLeft }, next]
}

/**
 * Sau một trận: tỉ lệ infectPercent một quái ngẫu nhiên trong đội nhiễm (quái đó đã từng nhiễm thì
 * không có gì, như Pokémon); rồi mỗi quái đang nhiễm (theo thứ tự đội) có spreadPercent lây sang
 * hai quái kề chưa từng nhiễm, cùng số ngày còn lại. Quái vừa được lây không lây tiếp trong lượt
 * này (quái đứng sau bị bỏ qua như PartySpreadPokerus của bản gốc).
 */
export function spreadSpiritVirusAfterBattle(
  data: GameData,
  rng: RngState,
  party: readonly Monster[]
): [Monster[], RngState] {
  const result = [...party]
  if (result.length === 0) return [result, rng]
  const { infectPercent, spreadPercent } = data.config.spiritVirus
  let infected: boolean
  ;[infected, rng] = rollPercent(rng, infectPercent)
  if (infected) {
    let index: number
    ;[index, rng] = nextInt(rng, 0, result.length - 1)
    if (result[index].spiritVirus === null) {
      let virus: SpiritVirus
      ;[virus, rng] = rollInfection(data, rng)
      result[index] = { ...result[index], spiritVirus: virus }
    }
  }
  for (let i = 0; i < result.length; i++) {
    const virus = result[i].spiritVirus
    if (virus?.state !== 'infected') continue
    let spreads: boolean
    ;[spreads, rng] = rollPercent(rng, spreadPercent)
    if (!spreads) continue
    const catchFrom = (j: number): boolean => {
      if (j < 0 || j >= result.length || result[j].spiritVirus !== null) return false
      result[j] = { ...result[j], spiritVirus: { ...virus } }
      return true
    }
    catchFrom(i - 1)
    if (catchFrom(i + 1)) i++
  }
  return [result, rng]
}

/**
 * Gen nhận khi thắng trận lúc đang nhiễm: genesPerWin × hệ số gen của tầng cao nhất (như thiên tài
 * địa bảo, để giữ giá trị ở mọi tầng) vào một chỉ số ngẫu nhiên. Không nhiễm thì không tốn RNG.
 */
export function spiritVirusWinGenes(
  data: GameData,
  rng: RngState,
  { monster, highestFloor }: { monster: Monster; highestFloor: number }
): [Monster, RngState] {
  if (!isSpiritVirusInfected(monster)) return [monster, rng]
  const gain = floorGeneMultiplier(data, highestFloor)
    .times(data.config.spiritVirus.genesPerWin)
    .floor()
  if (gain.lte(0)) return [monster, rng]
  let stat: StatName
  ;[stat, rng] = pick(rng, STAT_NAMES)
  const genes: BigStats = mapBigStats((name) =>
    name === stat ? monster.genes[name].plus(gain) : monster.genes[name]
  )
  return [{ ...monster, genes }, rng]
}

/** Một ngày trôi khi quái ở đội: bớt một ngày nhiễm, hết thì thành miễn dịch. */
export function tickSpiritVirusDay(monster: Monster): Monster {
  const virus = monster.spiritVirus
  if (virus?.state !== 'infected') return monster
  const spiritVirus: SpiritVirus =
    virus.daysLeft > 1 ? { state: 'infected', daysLeft: virus.daysLeft - 1 } : { state: 'immune' }
  return { ...monster, spiritVirus }
}

/** Thứ hạng để fuse giữ trạng thái tốt hơn: nhiễm (nhiều ngày hơn) > miễn dịch > chưa từng nhiễm. */
function virusRank(virus: SpiritVirus | null): number {
  if (virus === null) return 0
  return virus.state === 'immune' ? 1 : 1 + virus.daysLeft
}

/** Trạng thái linh dịch tốt hơn của hai quái (fuse). */
export const betterSpiritVirus = (
  a: SpiritVirus | null,
  b: SpiritVirus | null
): SpiritVirus | null => (virusRank(b) > virusRank(a) ? b : a)

/** Kiểm tra trường spiritVirus trong save. */
export function validateSpiritVirus(value: unknown, at: string): string[] {
  if (value === null) return []
  const virus = asObject(value)
  if (virus?.state === 'immune' && Object.keys(virus).length === 1) return []
  if (virus?.state === 'infected' && Object.keys(virus).length === 2) {
    return checkInteger(virus.daysLeft, `${at}.daysLeft`, 1)
  }
  return [`${at} phải là null, { state: 'infected', daysLeft } hoặc { state: 'immune' }`]
}
