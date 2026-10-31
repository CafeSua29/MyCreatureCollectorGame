// Độ kiếp trong mô phỏng (mục "Độ kiếp" ở simulation-features.md, docs/rules/awakening.md): quái
// đầu của một đội mẫu, đã thức tỉnh tới tầng trước, đánh một mình với Thiên Kiếp bằng action thật
// (startTribulation, AI chung chọn lệnh); đo tỉ lệ thắng theo tầng sẽ lên và độ lệch level.

import {
  awakeningPillIds,
  awakeningRequirements,
  createGameState,
  createRng,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import { runBattle } from './battleRunner'
import { floorMapsFor } from './floorSweep'
import type { TeamSpec, TribulationSpec } from './scenarios'
import { assumedTamerRealm } from './tamer'
import { withAssumedAffinity } from './affinity'
import { teamMastery, withAssumedMastery, type AssumedMasterySpec } from './mastery'
import { buildMonster, deriveSeed, geneValue } from './team'

export interface TribulationRow {
  /** Tầng sẽ lên. */
  tier: number
  levelOffset: number
  level: number
  battles: number
  won: number
  lost: number
  totalTurns: number
}

/** Tầng ứng với level của quái (gen, thân mật, thuần thục giả định như quái người chơi ở tầng đó). */
const floorForLevel = (data: GameData, level: number): number =>
  Math.max(1, Math.ceil(level / data.config.floors.levelPerFloor))

interface TribulationRun {
  spec: TribulationSpec
  team: TeamSpec
  /** Tầng sẽ lên. */
  tier: number
  seed: number
  mastery: AssumedMasterySpec | null
}

/** Quái độ kiếp: quái đầu của đội mẫu ở level đã cho, thức tỉnh tới tầng trước. */
function tribulationMonster(
  data: GameData,
  { team, tier, seed, mastery }: TribulationRun,
  level: number
): Monster {
  const [member] = team.members
  const floor = floorForLevel(data, level)
  const [built] = buildMonster(data, createRng(seed), {
    id: 'm1',
    speciesId: member.speciesId,
    level,
    genes: geneValue(data, floor, member.genes),
    traits: member.traits
  })
  // Đã thức tỉnh thì đã hóa hình (nếu race cho phép; docs/rules/human-form.md): Hiện nguyên hình được.
  const humanForm =
    tier - 1 >= data.config.humanForm.minAwakening && data.races[built.raceId].humanForm
      ? 'human'
      : 'locked'
  const [withAffinity] = withAssumedAffinity(
    data,
    [{ ...built, awakening: tier - 1, humanForm }],
    floor
  )
  const [prepared] = withAssumedMastery(data, [withAffinity], floor, teamMastery(team, mastery))
  return prepared
}

/** State ở thị trấn, vừa đủ tiền và Thức tỉnh đan cho lần độ kiếp. */
function townState(data: GameData, monster: Monster, seed: number): GameState {
  const floor = floorForLevel(data, monster.level)
  const config = data.config.awakening
  const need = awakeningRequirements(config, monster.awakening)
  const state = createGameState({
    seed,
    party: [monster],
    location: { type: 'town' },
    floorBiomeIds: floorMapsFor(data, { floor, biomeId: null, seed }),
    tamerRealm: assumedTamerRealm(floor)
  })
  // Đan của hệ đầu (đủ cho lần độ kiếp; quái không có hệ có đan thì không cần đan).
  const pillId = awakeningPillIds(config, monster)[0]
  const stacks =
    pillId === undefined
      ? state.inventory.stacks
      : { ...state.inventory.stacks, [pillId]: need.pills }
  return { ...state, money: need.money, inventory: { ...state.inventory, stacks } }
}

/** Một tầng sẽ lên: mỗi độ lệch level đánh `battles` lần độ kiếp. */
export function runTribulationSweep(data: GameData, run: TribulationRun): TribulationRow[] {
  const { spec, team, tier, seed } = run
  // Game tự xử thua khi hết lượt; trần của mô phỏng chỉ để không kẹt.
  const maxTurns = data.config.awakening.tribulation.maxTurns + 1
  return spec.levelOffsets.map((levelOffset) => {
    const level = Math.max(1, data.config.awakening.levelPerTier * tier + levelOffset)
    const monster = tribulationMonster(
      data,
      { ...run, seed: deriveSeed(seed, 'tribulation', team.id, tier, levelOffset) },
      level
    )
    const row: TribulationRow = {
      tier,
      levelOffset,
      level,
      battles: spec.battles,
      won: 0,
      lost: 0,
      totalTurns: 0
    }
    for (let i = 0; i < spec.battles; i++) {
      const battleSeed = deriveSeed(seed, 'tribulationBattle', team.id, tier, levelOffset, i)
      const { stats } = runBattle(data, townState(data, monster, battleSeed), {
        kind: 'boss',
        maxTurns,
        start: { type: 'startTribulation', monsterId: monster.id }
      })
      if (stats.outcome === 'won') row.won++
      else row.lost++
      row.totalTurns += stats.turns
    }
    return row
  })
}
