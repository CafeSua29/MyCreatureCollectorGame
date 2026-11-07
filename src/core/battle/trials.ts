// Bí cảnh và tháp thí luyện (docs/rules/trials.md): vào bí cảnh bằng Bí Cảnh Lệnh, đánh lần lượt
// các trận (quái hoang mạnh / NPC / boss cuối), bỏ cuộc; tháp không trần, mỗi tầng một trận cố định.
// Việc sau trận ở trialOutcome.ts.

import { ActionError, rollPercent } from '../shared'
import { getItemCount, removeItems } from '../inventory'
import { isFainted } from '../monster'
import { battleRules, hasTrialRule, trialFighters } from '../registries'
import {
  assertNoTournament,
  generateAnyBossEncounter,
  generateEncounter,
  generateFloorBossEncounter,
  realmSite,
  revealInstability,
  rollBiomeTrainerClass,
  rollRegularTrainerClass,
  rollSecretRealm,
  towerFloorPlan,
  type FloorSite
} from '../world'
import type { BattleTrial, GameData, GameState, SecretRealm, TrialRule } from '../model'
import { openBattle } from './openBattle'
import { battleInstabilityFor, foreignEncounterSite } from './instability'
import { assertReadyForBattle, openTrainerBattle, requireTown } from './trainerBattles'

/** Còn quái được vào trận theo luật (luật một hệ); không thì noEligibleFighter. */
function assertEligibleFighters(
  data: GameData,
  state: GameState,
  rules: readonly TrialRule[]
): void {
  const fighters = trialFighters(data, state.party, rules).filter((m) => !isFainted(data, m))
  if (fighters.length > 0) return
  const elementIds = rules.flatMap((rule) => (rule.elementId === null ? [] : [rule.elementId]))
  throw new ActionError('noEligibleFighter', { elementIds })
}

/**
 * Vào bí cảnh ở thị trấn: tiêu một Bí Cảnh Lệnh, sinh bí cảnh (map chủ đề, luật, số trận), lộ thuộc
 * tính bất ổn ẩn (độ bất ổn áp cả trận bí cảnh, docs/rules/trial-boons.md). Chưa mở trận: người
 * chơi đánh từng trận bằng challengeTrial (lưu game giữa hai trận được).
 */
export function enterTrial(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  requireTown(state)
  assertNoTournament(state)
  const { tokenItemId } = data.config.trials
  const have = getItemCount(state.inventory, tokenItemId)
  if (have < 1) throw new ActionError('notEnoughItem', { itemId: tokenItemId, have, need: 1 })
  const fighters = state.party.filter((m) => !isFainted(data, m))
  const [trial, rng] = rollSecretRealm(data, state.rng, {
    highestFloor: state.highestFloor,
    fighters
  })
  return revealInstability({
    ...state,
    rng,
    trial,
    inventory: removeItems(state.inventory, tokenItemId, 1)
  })
}

/** Bí cảnh đang đi; không có thì noTrial. */
function requireRealm(state: GameState): SecretRealm {
  if (state.trial?.kind !== 'realm') throw new ActionError('noTrial')
  return state.trial
}

/** Bỏ bí cảnh giữa hai trận: mất lệnh, giữ phần thưởng các trận đã thắng. */
export function abandonTrial(state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  requireRealm(state)
  return { ...state, trial: null }
}

/**
 * Trận kế tiếp của bí cảnh: trận cuối là boss tầng của map chủ đề; luật bossOnly thì mọi trận là
 * boss; còn lại trainerChance % là ngự thú sư NPC của map, không thì quái hoang của map. Quái theo
 * tầng sức mạnh của bí cảnh.
 */
export function challengeTrial(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const realm = requireRealm(state)
  // Còn ân huệ chưa chọn thì chưa đánh trận kế (docs/rules/trial-boons.md).
  if (realm.boonChoices.length > 0) throw new ActionError('trialBoonPending')
  assertEligibleFighters(data, state, realm.rules)
  const site = realmSite(data, state, realm)
  const trial: BattleTrial = { kind: 'realm', biomeId: realm.biomeId, rules: realm.rules }
  const isLast = realm.cleared + 1 >= realm.battleCount
  if (isLast) {
    const encounter = generateFloorBossEncounter(data, state.rng, site, state.nextMonsterId)
    return openBattle(data, state, { site, encounter, trial })
  }
  if (hasTrialRule(data, realm.rules, 'bossOnly')) {
    const encounter = generateAnyBossEncounter(data, state.rng, site, state.nextMonsterId)
    return openBattle(data, state, { site, encounter, trial })
  }
  return openRealmBattle(data, state, { site, trial })
}

/** Trận thường của bí cảnh: NPC của map (trainerChance %) hoặc quái hoang của map. */
function openRealmBattle(
  data: GameData,
  state: GameState,
  { site, trial }: { site: FloorSite; trial: BattleTrial }
): GameState {
  const [met, afterChance] = rollPercent(state.rng, data.config.trials.realm.trainerChance)
  let rng = afterChance
  if (met) {
    const [trainerClass, next] = rollBiomeTrainerClass(data, rng, site.biome)
    rng = next
    if (trainerClass) {
      return openTrainerBattle(
        data,
        { ...state, rng },
        { site, trainerClass, mode: 'trial', trial }
      )
    }
  }
  // Thuộc tính bất ổn bảng gặp map khác (instability.md) cũng áp cho quái hoang của bí cảnh.
  const instability = battleInstabilityFor(state, {
    trial,
    tribulation: null,
    special: null,
    trainer: null
  })
  const [encounterSite, afterSite] = foreignEncounterSite(data, rng, {
    site,
    rules: battleRules({ trial: null, instability })
  })
  const encounter = generateEncounter(data, afterSite, encounterSite, state.nextMonsterId)
  return openBattle(data, state, { site, encounter, trial })
}

/**
 * Thách tầng tháp kế tiếp (tower.highest + 1) ở thị trấn: trận cố định theo số tầng (map, luật, đội
 * địch sinh từ RNG riêng của tầng), mỗi bossEvery tầng là boss tầng của map, còn lại ngự thú sư NPC
 * lớp thường. Thắng lên tầng, thua không mất gì.
 */
export function challengeTower(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  requireTown(state)
  assertNoTournament(state)
  const towerFloor = state.tower.highest + 1
  const plan = towerFloorPlan(data, state, towerFloor)
  const { site } = plan
  const trial: BattleTrial = {
    kind: 'tower',
    biomeId: site.biome.id,
    rules: plan.rules,
    towerFloor
  }
  if (plan.isBoss) {
    const generated = generateFloorBossEncounter(data, plan.rng, site, state.nextMonsterId)
    // Đội địch theo RNG của tầng; trận (và món unique của boss) chạy bằng RNG của save.
    const encounter = { ...generated, rng: state.rng }
    return openBattle(data, state, { site, encounter, trial })
  }
  const [trainerClass, teamRng] = rollRegularTrainerClass(data, plan.rng)
  return openTrainerBattle(data, state, {
    site,
    trainerClass,
    mode: 'trial',
    extraLevels: data.config.trials.tower.levelOffset,
    teamRng,
    trial
  })
}
