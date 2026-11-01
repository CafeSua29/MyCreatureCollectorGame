// Việc sau trận bí cảnh / tháp thí luyện (docs/rules/trials.md): tiến độ bí cảnh, hồi máu giữa các
// trận, rương bí cảnh, thất bại; tầng tháp đã thắng và thưởng; tầng Khí giới bí cảnh
// (docs/rules/artifact-spirits.md). Thêm loại phó bản = thêm một mục vào TRIAL_KIND_RULES.

import {
  addEquipment,
  addRandomAffix,
  rollChestItems,
  rollRarity,
  spiritsOf,
  withSpirits
} from '../inventory'
import { isFainted } from '../monster'
import { hasTrialRule } from '../registries'
import { pickWeighted, rollPercent } from '../shared'
import type {
  Biome,
  EquipmentInstance,
  GameData,
  ItemWorldRun,
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
  if (d.trial?.kind !== 'realm') throw new Error('Trận bí cảnh nhưng không có bí cảnh đang đi')
  return d.trial
}

/** Lượt Khí giới bí cảnh của trận Khí giới bí cảnh (luôn có). */
function itemWorldOf(d: Draft): ItemWorldRun {
  if (d.trial?.kind !== 'itemWorld') throw new Error('Trận Khí giới bí cảnh nhưng không có lượt đi')
  return d.trial
}

/** Thu phục dã linh của trận nếu quái mang nó đã bị hạ (thắng trận). */
function subdueSpirit(data: GameData, d: Draft, instance: EquipmentInstance): EquipmentInstance {
  const trial = d.battle.trial
  const spirit = trial?.kind === 'itemWorld' ? trial.spirit : null
  if (!spirit) return instance
  const carrier = d.battle.enemies.find((enemy) => enemy.id === spirit.carrierId)
  const target = spiritsOf(instance)[spirit.index]
  if (!carrier || !isFainted(data, carrier) || !target || target.subdued) return instance
  log(d, {
    type: 'spiritSubdued',
    index: spirit.index,
    typeIds: target.typeIds,
    value: target.value
  })
  const spirits = spiritsOf(instance).map((entry, i) =>
    i === spirit.index ? { ...entry, subdued: true } : entry
  )
  return withSpirits(instance, spirits)
}

/**
 * Một lần thưởng Khí Tướng: bonus.affixChance % thêm một dòng phụ (không còn dòng phụ để thêm thì +
 * value), còn lại + bonus.spiritValue value cho mọi khí linh trên món (món chưa có khí linh thì thử
 * thêm dòng phụ).
 */
function grantBossBonus(data: GameData, d: Draft, instance: EquipmentInstance): EquipmentInstance {
  const { bonus } = data.config.artifactSpirits.itemWorld
  let wantsAffix: boolean
  ;[wantsAffix, d.rng] = rollPercent(d.rng, bonus.affixChance)
  const spirits = spiritsOf(instance)
  if (wantsAffix || spirits.length === 0) {
    let added: EquipmentInstance | null
    ;[added, d.rng] = addRandomAffix(data, d.rng, instance)
    if (added) {
      log(d, { type: 'itemWorldBonus', bonus: 'affix' })
      return added
    }
  }
  if (spirits.length === 0) return instance
  log(d, { type: 'itemWorldBonus', bonus: 'spiritValue' })
  return withSpirits(
    instance,
    spirits.map((spirit) => ({ ...spirit, value: spirit.value + bonus.spiritValue }))
  )
}

/**
 * Qua một tầng Khí giới bí cảnh: món + 1 cấp và + 1 tầng đã qua, thu phục dã linh đã hạ, thưởng boss
 * (bonusRolls lần + vật phẩm), thưởng tầng (Kẹo EXP), hồi máu cả đội như bí cảnh.
 */
function clearItemWorldFloor(data: GameData, d: Draft): void {
  const run = itemWorldOf(d)
  const trial = d.battle.trial
  if (trial?.kind !== 'itemWorld') return
  const config = data.config.artifactSpirits.itemWorld
  let instance: EquipmentInstance = {
    ...subdueSpirit(data, d, run.instance),
    level: run.instance.level + 1,
    depth: trial.depth
  }
  log(d, { type: 'itemWorldFloorCleared', depth: trial.depth, level: instance.level })
  const tier = config.bosses.find((entry) => entry.id === trial.bossTierId)
  if (tier) {
    for (let i = 0; i < tier.bonusRolls; i++) instance = grantBossBonus(data, d, instance)
    grantItemRewards(d, tier.rewards)
  }
  grantItemRewards(d, config.floorRewards)
  d.trial = { ...run, instance, cleared: run.cleared + 1 }
  healPartyPercent(data, d, config.healPercent)
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
  },
  itemWorld: {
    onWin: clearItemWorldFloor,
    // Thua: ra ngoài, món về túi (được vượt sức chứa), không mất cấp / tầng đã qua / khí linh.
    onLoss(_data, d) {
      const run = itemWorldOf(d)
      log(d, { type: 'itemWorldFailed' })
      d.inventory = addEquipment(d.inventory, run.instance)
      d.trial = null
    }
  }
}
