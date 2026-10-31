// Việc sau trận bí cảnh / tháp thí luyện (docs/rules/trials.md): tiến độ bí cảnh, hồi máu giữa các
// trận, rương bí cảnh, thất bại; tầng tháp đã thắng và thưởng. Thêm loại phó bản = thêm một mục vào
// TRIAL_KIND_RULES.

import { rollChestItems, rollRarity } from '../inventory'
import { hasTrialRule } from '../registries'
import { pickWeighted } from '../shared'
import type {
  Biome,
  GameData,
  ItemReward,
  NormalRarity,
  SecretRealm,
  TrialKind,
  WeightedItem
} from '../model'
import { battleBiome } from '../world'
import { Draft, log } from './draft'
import {
  gainBiomeSkillBooks,
  gainNewEquipment,
  grantItemRewards,
  healPartyPercent
} from './rewards'

interface TrialKindRule {
  /** Thắng trận (sau finish: máu, trạng thái chỉ có trong trận đã dọn). */
  onWin(data: GameData, d: Draft): void
  /** Thua trận (sau phần thua chung, không mất tiền). */
  onLoss(data: GameData, d: Draft): void
}

/** Bí cảnh đang đi của trận bí cảnh (trận bí cảnh luôn có). */
function realmOf(d: Draft): SecretRealm {
  if (!d.trial) throw new Error('Trận bí cảnh nhưng không có bí cảnh đang đi')
  return d.trial
}

/**
 * Hồi healPercent % max HP cho mọi quái trong đội, kể cả quái đã gục (đứng dậy với phần máu đó;
 * không thì bí cảnh dài chỉ còn vài quái cho boss cuối). Luật noHealing tắt.
 */
function healBetweenBattles(data: GameData, d: Draft, realm: SecretRealm): void {
  if (hasTrialRule(data, realm.rules, 'noHealing')) return
  healPartyPercent(data, d, data.config.trials.realm.healPercent)
}

/** Rương: tung món theo trọng số (bỏ món chỉ có theo tùy chọn đang tắt), số lượng đều trong khoảng. */
function chestItems(data: GameData, d: Draft, realm: SecretRealm): void {
  const chest = data.config.trials.realm.chest
  let rewards: ItemReward[]
  ;[rewards, d.rng] = rollChestItems(data, d.rng, {
    entries: chest.items,
    rolls: chest.itemRolls + chest.itemRollsPerBattle * realm.battleCount,
    options: d.options
  })
  grantItemRewards(d, rewards)
}

/** Rương: trang bị theo danh sách rơi của map chủ đề, bậc theo bảng của rương (rare trở lên). */
function chestEquipment(
  data: GameData,
  d: Draft,
  { biome, floor }: { biome: Biome; floor: number }
): void {
  const chest = data.config.trials.realm.chest
  const candidates = (biome.equipmentDrops ?? []).filter((entry) => entry.weight > 0)
  if (candidates.length === 0) return
  for (let i = 0; i < chest.equipmentCount; i++) {
    let entry: WeightedItem
    ;[entry, d.rng] = pickWeighted(d.rng, candidates, (candidate) => candidate.weight)
    let rarity: NormalRarity
    ;[rarity, d.rng] = rollRarity(data, d.rng, chest.equipmentRarityWeights, floor)
    gainNewEquipment(data, d, { itemId: entry.itemId, rarity })
  }
}

/** Hoàn thành bí cảnh: rương (món, trang bị, sách kỹ năng). */
function openChest(data: GameData, d: Draft, realm: SecretRealm): void {
  const biome = battleBiome(data, d, d.battle)
  chestItems(data, d, realm)
  chestEquipment(data, d, { biome, floor: realm.floor })
  const { skillBookCount, reusableBookChance } = data.config.trials.realm.chest
  gainBiomeSkillBooks(data, d, {
    biome,
    count: skillBookCount,
    reusableChance: reusableBookChance
  })
}

export const TRIAL_KIND_RULES: Record<TrialKind, TrialKindRule> = {
  realm: {
    onWin(data, d) {
      const realm = realmOf(d)
      const cleared = realm.cleared + 1
      log(d, { type: 'trialProgress', cleared, total: realm.battleCount })
      if (cleared < realm.battleCount) {
        d.trial = { ...realm, cleared }
        healBetweenBattles(data, d, realm)
        return
      }
      log(d, { type: 'trialCompleted' })
      openChest(data, d, realm)
      d.trial = null
    },
    onLoss(_data, d) {
      log(d, { type: 'trialFailed' })
      d.trial = null
    }
  },
  tower: {
    onWin(data, d) {
      const trial = d.battle.trial
      if (trial?.kind !== 'tower') return
      const floor = trial.towerFloor
      d.tower = { highest: floor }
      log(d, { type: 'towerFloorCleared', floor })
      const { floorRewards, milestoneEvery, milestoneRewards } = data.config.trials.tower
      grantItemRewards(d, floorRewards)
      if (floor % milestoneEvery === 0) grantItemRewards(d, milestoneRewards)
    },
    // Thua không mất gì (không mất tiền, giữ tầng).
    onLoss: () => {}
  }
}
