// Độ bất ổn tầng trong trận (docs/rules/instability.md): trận nào nhận độ bất ổn, luật sideHooks
// thành hook theo phe, quái địch thêm trait / là quái fuse lúc mở trận, bảng gặp của map khác.
// Luật còn lại (cấm vật phẩm, môi trường cố định...) áp qua battleRules như luật bí cảnh.

import { pick, rollPercent, type RngState } from '../shared'
import {
  extraEnemyTraitCount,
  isLargeMonster,
  trialRuleDefsOf,
  trialRulePercent
} from '../registries'
import { addRandomTraits, generateWildMonster, type Encounter, type FloorSite } from '../world'
import { traitSlotCap } from '../monster'
import { fuseMonsters } from '../progression'
import type {
  BattleInstability,
  BattleSide,
  BattleState,
  GameData,
  GameState,
  Monster,
  TeamBonus,
  TrialRule
} from '../model'
import { countsAsFloorBattle } from './specialBattles'

/**
 * Độ bất ổn của trận sắp mở: chỉ trận quái hoang / boss trên tầng (không NPC, bí cảnh, tháp, độ
 * kiếp, thú triều, hiểm địa); độ bất ổn tắt thì null.
 */
export function battleInstabilityFor(
  state: Pick<GameState, 'instability'>,
  battle: Pick<BattleState, 'trial' | 'tribulation' | 'special' | 'trainer'>
): BattleInstability | null {
  const { level, properties } = state.instability
  if (level === 0 || battle.trainer || !countsAsFloorBattle(battle)) return null
  return { level, ruleIds: properties.map((property) => property.ruleId) }
}

/** Luật sideHooks của phe thành mục phối hợp đội (gộp luật trùng thành count). */
export function ruleTeamBonuses(
  data: GameData,
  rules: readonly TrialRule[],
  side: BattleSide
): TeamBonus[] {
  const counts = new Map<string, number>()
  for (const def of trialRuleDefsOf(data, rules, 'sideHooks')) {
    if (def.params.side === side) counts.set(def.id, (counts.get(def.id) ?? 0) + 1)
  }
  return [...counts].map(([id, count]) => ({ kind: 'rule', id, count }))
}

/**
 * Luật foreignSpecies: `percent` % trận lấy bảng gặp quái thường của một map khác (boss ngẫu nhiên,
 * đồ rơi, môi trường vẫn theo map của tầng). Không có luật thì không tốn RNG.
 */
export function foreignEncounterSite(
  data: GameData,
  rng: RngState,
  { site, rules }: { site: FloorSite; rules: readonly TrialRule[] }
): [FloorSite, RngState] {
  const percent = trialRulePercent(data, rules, 'foreignSpecies')
  if (percent === 0) return [site, rng]
  const others = Object.values(data.biomes).filter(
    (biome) => biome.id !== site.biome.id && biome.encounters.length > 0
  )
  if (others.length === 0) return [site, rng]
  let foreign: boolean
  ;[foreign, rng] = rollPercent(rng, percent)
  if (!foreign) return [site, rng]
  let other: (typeof others)[number]
  ;[other, rng] = pick(rng, others)
  return [{ ...site, biome: { ...site.biome, encounters: other.encounters } }, rng]
}

/**
 * Luật fusedEnemies: quái hoang thường (không boss, không quái lớn) `percent` % fuse với một quái
 * hoang khác loài của map (quái phụ chỉ dùng để fuse, không vào trận).
 */
function fuseEnemy(
  data: GameData,
  encounter: Encounter,
  { enemy, site, percent }: { enemy: Monster; site: FloorSite; percent: number }
): [Monster, Encounter] {
  if (encounter.isBoss || isLargeMonster(data, enemy)) return [enemy, encounter]
  const encounters = site.biome.encounters.filter((entry) => entry.speciesId !== enemy.speciesId)
  if (encounters.length === 0) return [enemy, encounter]
  const [fused, afterRoll] = rollPercent(encounter.rng, percent)
  if (!fused) return [enemy, { ...encounter, rng: afterRoll }]
  const { nextMonsterId } = encounter
  const subSite = { ...site, biome: { ...site.biome, encounters } }
  const [sub, afterSub] = generateWildMonster(data, afterRoll, subSite, `m${nextMonsterId}`)
  const [result, rng] = fuseMonsters(data, afterSub, enemy, sub)
  return [result, { ...encounter, rng, nextMonsterId: nextMonsterId + 1 }]
}

/**
 * Luật thay đổi quái địch lúc mở trận (trận quái hoang / boss, không NPC / độ kiếp): quái fuse rồi
 * thêm trait random. Không có luật thì giữ nguyên encounter (không tốn RNG).
 */
export function applyEnemyRules(
  data: GameData,
  encounter: Encounter,
  { site, rules }: { site: FloorSite; rules: readonly TrialRule[] }
): Encounter {
  const percent = trialRulePercent(data, rules, 'fusedEnemies')
  const extraTraits = extraEnemyTraitCount(data, rules)
  if (percent === 0 && extraTraits === 0) return encounter
  let current: Encounter = { ...encounter, enemies: [] }
  for (const original of encounter.enemies) {
    let enemy = original
    if (percent > 0) [enemy, current] = fuseEnemy(data, current, { enemy, site, percent })
    if (extraTraits > 0) {
      let rng: RngState
      ;[enemy, rng] = addRandomTraits(data, current.rng, {
        monster: enemy,
        count: extraTraits,
        slotCap: traitSlotCap(data, enemy)
      })
      current = { ...current, rng }
    }
    current = { ...current, enemies: [...current.enemies, enemy] }
  }
  return current
}
