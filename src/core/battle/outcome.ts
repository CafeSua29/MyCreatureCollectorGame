// Kết thúc trận: thắng (thưởng, rơi đồ, trứng, mở tầng, tiến hóa, trứng nở), thua, đưa quái đã bắt vào đội / kho.

import { recordQuestEvent, refillQuestBoard } from '../quests'
import { autoEvolve, createBossEgg, hatchMonster, tickEggs } from '../progression'
import {
  addEffortValues,
  applyPurityGains,
  addMilestone,
  battleEffortGain,
  bossKillPurityGains,
  expReward,
  fulfillImprint,
  gainExp,
  getMaxHp,
  isFainted,
  moneyReward,
  spiritVirusExpPercent,
  spiritVirusWinGenes,
  spreadSpiritVirusAfterBattle
} from '../monster'
import { BIG_ZERO, maxBig, nextInt, pick, pickWeighted, rollPercent, type Decimal } from '../shared'
import {
  ageExpMultiplier,
  ancestorGroupsOf,
  bloodlineGroupsOf,
  charmEffect,
  changeAffinity,
  sideMoneyMultiplier,
  traitDropMultiplier,
  traitEggHatchExtra,
  traitExpMultiplier,
  traitMoneyMultiplier,
  hasPartyRoom,
  partyAfterJoining
} from '../registries'
import {
  addBooks,
  elementZCrystalOf,
  isBookableSkill,
  isSkillBookUsefulForParty,
  isItemOffered,
  megaStonesOf,
  rollRarity,
  signatureZCrystalsOf,
  teraShardFor,
  uniquePoolOf
} from '../inventory'
import { enterTown } from '../shop'
import { partnerAmount, partnerMultiplier, tamerExpShare } from '../tamer'
import {
  battleBiome,
  evolutionScene,
  findBiomeBoss,
  isGymFloor,
  rollFloorBiome,
  rollGym
} from '../world'
import {
  dayOf,
  type BattleOutcome,
  type Biome,
  type DropEntry,
  type Egg,
  type EquipmentItem,
  type GameData,
  type Gym,
  type MegaStoneItem,
  type ZCrystalItem,
  type Monster,
  type NormalRarity,
  type WeightedItem
} from '../model'
import { Draft, log, restoreIdentity } from './draft'
import { revertBattleForms } from './battleForms'
import { revertTransforms } from './transform'
import { clearBattleOnlyStatuses } from './statuses'
import { cureOnBattleEnd } from './turnEndTraits'
import { TRAINER_MODE_RULES, dropTrainerRewards, trainerMoneyMultiplier } from './trainerModes'
import { gainDrop, gainEquipment, gainNewEquipment } from './rewards'
import { TRIAL_KIND_RULES } from './trialOutcome'
import { rollRecruitOffer, tickRecruitBait } from './recruit'
import {
  countChainWin,
  countsAsFloorBattle,
  floorModifierMultiplier,
  specialRule,
  tickModifiers
} from './specialBattles'
import { restoreItemLedger } from './itemLedger'
import { brokenPartDropMultiplier, knockoutCoreMultiplier } from './hitLocations'
import { buryFallen, refillAfterBattleDeaths } from './permadeath'

/** Kết thúc trận; quái đã bắt vào đội (còn chỗ) hoặc vào kho. */
export function finish(data: GameData, d: Draft, outcome: BattleOutcome): void {
  revertTransforms(data, d)
  revertBattleForms(data, d)
  // Món bị lấy / tráo trong trận (Knock Off, Trick) về chủ cũ như Pokémon thế hệ 5+.
  restoreItemLedger(d)
  // Trước khi dọn trạng thái tạm: quái ta trên sân có trait kiểu Natural Cure được chữa.
  cureOnBattleEnd(data, d)
  d.battle.phase = 'ended'
  d.battle.outcome = outcome
  // Trận trên tầng (thắng, thua, chạy) đếm một trận cho thời hạn modifier (docs/rules/events.md)
  // và cho mồi dụ (docs/rules/recruit.md).
  tickModifiers(d)
  tickRecruitBait(d)
  for (const monsterId of Object.keys(d.battle.volatiles)) restoreIdentity(d, monsterId)
  d.battle.stages = {}
  d.battle.volatiles = {}
  clearBattleOnly(data, d)
  // Chết thật (docs/rules/options.md): quái gục rời đội trước để quái vừa bắt có chỗ trong đội.
  buryFallen(data, d)
  // Cùng thứ tự với lúc báo nơi về khi bắt (partyAfterJoining).
  const joined = partyAfterJoining(data, d.party, d.battle.captured)
  d.storage.push(...d.battle.captured.filter((monster) => !joined.includes(monster)))
  d.party = joined
  refillAfterBattleDeaths(data, d)
  // Linh dịch (docs/rules/spirit-virus.md): như Pokérus, sau mọi trận (thắng, thua, chạy) có thể
  // nhiễm rồi lây trong đội (kể cả quái vừa bắt đã vào đội).
  ;[d.party, d.rng] = spreadSpiritVirusAfterBattle(data, d.rng, d.party)
}

/**
 * Hết trận: quái ta mất trạng thái chỉ có trong trận (buff / debuff Siralim) và max HP đổi trong
 * trận (máu đã mất kẹp để quái còn sống vẫn còn ít nhất 1 máu).
 */
function clearBattleOnly(data: GameData, d: Draft): void {
  clearBattleOnlyStatuses(data, [...d.party, ...d.battle.captured])
  for (const monster of [...d.party, ...d.battle.captured]) {
    if (monster.battleMaxHpDelta === undefined) continue
    const alive = !isFainted(data, monster)
    delete monster.battleMaxHpDelta
    const maxHp = getMaxHp(data, monster)
    if (alive && monster.damageTaken.gte(maxHp)) monster.damageTaken = maxHp.minus(1)
  }
}

export function applyWin(data: GameData, d: Draft): void {
  // Phần thưởng, EXP, tiến hóa tính trên dạng thường (mục "Biến hình trong trận").
  revertTransforms(data, d)
  revertBattleForms(data, d)
  // enemies lúc này chỉ còn quái bị hạ; quái bắt được chỉ cho EXP (không tiền, không rơi đồ).
  const { enemies, participants } = d.battle
  // Hiệu ứng theo phe người chơi (kiểu Happy Hour), trait của quái đã tham chiến (kể cả đã gục,
  // như Amulet Coin) rồi kỹ năng đồng hành (quái đầu đội còn sống lúc thắng) nhân tiền thưởng.
  const fought = d.party.filter((monster) => participants.includes(monster.id))
  const money = enemies
    .reduce((sum, enemy) => sum.plus(moneyReward(data, enemy)), BIG_ZERO)
    .times(sideMoneyMultiplier(data, d.battle.field, 'player'))
    .times(traitMoneyMultiplier(data, fought))
    .times(partnerMultiplier(data, d.party, 'moneyPercent'))
    .times(trainerMoneyMultiplier(data, d.battle))
    .times(floorModifierMultiplier(data, d, 'moneyPercent'))
    .times(d.battle.special ? specialRule(d.battle.special).moneyMultiplier(d.battle.special) : 1)
    .floor()
  const exp = battleExp(data, d)
  d.money = d.money.plus(money)
  log(d, { type: 'won', money })
  gainTamerExp(d, tamerExpShare(exp, data.config.tamer.expShare))

  // Thân mật: mọi quái trong đội tăng, quái đã ra sân tăng nhiều hơn (docs/rules/affinity.md).
  const { win, participated } = data.config.affinity.gain
  d.party = d.party.map((monster) =>
    changeAffinity(data, monster, participants.includes(monster.id) ? participated : win)
  )

  // Dưỡng dục: thắng trận khi ở trong đội là xong yêu cầu "cùng chiến đấu" (imprinting.md).
  d.party = d.party.map((monster) => {
    const cared = fulfillImprint(monster, { kind: 'battle' })
    if (cared !== monster && cared.imprint) {
      const { completed, total } = cared.imprint
      log(d, { type: 'imprintProgress', monsterId: cared.id, completed, total })
    }
    return cared
  })

  // Chỉ quái đã tham chiến và còn sống mới nhận EXP và điểm nỗ lực; mỗi con nhận đủ. Kỹ năng đồng
  // hành nhân EXP của cả trận (trước trait / tuổi của từng con). Điểm nỗ lực theo loài của quái bị
  // hạ và bị bắt (docs/rules/effort-values.md); quái đang nhiễm linh dịch thêm gen
  // (docs/rules/spirit-virus.md).
  const partnerExp = exp.times(partnerMultiplier(data, d.party, 'expPercent')).floor()
  const defeated = [...enemies, ...d.battle.captured]
  d.party = d.party.map((monster) => {
    if (!participants.includes(monster.id) || isFainted(data, monster)) return monster
    const trained = addEffortValues(data, monster, battleEffortGain(data, monster, defeated))
    const result = gainExp(data, trained, expWithTraits(data, trained, partnerExp))
    for (const event of result.events) log(d, event)
    let infected: Monster
    ;[infected, d.rng] = spiritVirusWinGenes(data, d.rng, {
      monster: result.monster,
      highestFloor: d.highestFloor
    })
    return infected
  })

  // Thắng trận boss: quái đã ra sân (kể cả đã gục) tính thêm một boss đã hạ (điều kiện tiến hóa),
  // nhận độ thuần ở nhóm huyết mạch chung với boss (docs/rules/bloodline.md); loài tổ bị hạ / bị bắt
  // chắc chắn rơi Tinh huyết của nhóm mình.
  if (d.battle.isBoss) {
    const gains = bossKillPurityGains(data, defeated)
    d.party = d.party.map((monster) =>
      participants.includes(monster.id)
        ? applyPurityGains(data, { ...monster, bossDefeats: monster.bossDefeats + 1 }, gains)
        : monster
    )
    grantAncestorEssences(data, d, defeated)
  }

  // Tự tiến hóa: mọi quái trong đội đủ điều kiện (kể cả không ra sân hoặc đã gục); điều kiện map /
  // môi trường xét theo trận này (môi trường lúc trận kết thúc).
  // Đội trong bối cảnh cập nhật sau từng quái: hai quái cùng tiến hóa thành quái lớn không vượt số ô
  // đội (docs/rules/monster-size.md).
  const baseScene = evolutionScene(data, d)
  d.party = d.party.reduce<Monster[]>((party, monster, index) => {
    const scene = { ...baseScene, party }
    const result = autoEvolve(data, monster, { rng: d.rng, day: dayOf(d.time), scene })
    d.rng = result.rng
    for (const event of result.events) log(d, event)
    return party.map((m, i) => (i === index ? result.monster : m))
  }, d.party)

  // Trọng thương sau độ kiếp thua (docs/rules/awakening.md): mỗi trận thắng có quái trong đội giảm 1.
  d.party = d.party.map((monster) =>
    monster.injuryBattlesLeft > 0
      ? { ...monster, injuryBattlesLeft: monster.injuryBattlesLeft - 1 }
      : monster
  )

  // Trứng đang ấp: trận thắng này trôi qua (trứng rơi trong chính trận này chưa tính); trait của
  // bất kỳ quái nào trong đội (kiểu Flame Body) cho trứng giảm thêm, không cộng dồn; kỹ năng đồng
  // hành và bùa trứng (docs/rules/dex.md) cộng thêm.
  const eggSteps =
    1 +
    traitEggHatchExtra(data, d.party) +
    partnerAmount(data, d.party, 'eggStepBonus') +
    charmEffect(data, d.inventory, 'eggStepBonus')
  const ticked = tickEggs(d.eggs, eggSteps)
  d.eggs = ticked.eggs

  // Mỗi quái bị hạ tung bảng rơi của biome; trận boss tung thêm bảng đồ rơi chung cho boss của
  // biome, bảng đồ rơi riêng của boss đó và tỉ lệ rơi trứng. Trait của cả đội (kiểu Pickup, cả
  // quái chưa ra sân) và kỹ năng đồng hành nhân tỉ lệ mọi món, không nhân tỉ lệ rơi trứng.
  const biome = battleBiome(data, d, d.battle)
  const dropMultiplier =
    traitDropMultiplier(data, d.party) *
    partnerMultiplier(data, d.party, 'dropRatePercent') *
    floorModifierMultiplier(data, d, 'dropRatePercent')
  // Trận NPC: đồ thưởng chung của trận thay cho đồ rơi của từng quái (docs/rules/trainers.md).
  if (d.battle.trainer) dropTrainerRewards(data, d, dropMultiplier)
  for (const enemy of d.battle.trainer ? [] : enemies) {
    // Bộ phận bị phá trong trận tăng mọi đồ rơi của quái đó (docs/rules/hit-locations.md).
    const enemyDropMultiplier =
      dropMultiplier * brokenPartDropMultiplier(data, d.battle.records[enemy.id])
    const bossDrops = d.battle.isBoss
      ? [...biome.bossDrops, ...(findBiomeBoss(biome, enemy.speciesId)?.drops ?? [])]
      : []
    const extraDrops = EXTRA_DROP_TABLES.flatMap((table) => table(data, d, enemy))
    for (const drop of [...biome.drops, ...bossDrops, ...extraDrops]) {
      // Món chỉ có khi bật tùy chọn (kiểu Thọ Nguyên Đan): tắt thì không tung, không tốn RNG.
      if (!isItemOffered(data.items[drop.itemId], d.options)) continue
      let dropped: boolean
      ;[dropped, d.rng] = rollPercent(d.rng, Math.min(100, drop.chance * enemyDropMultiplier))
      if (dropped) gainDrop(d, drop.itemId, 1)
    }
    dropEquipment(data, d, { enemy, biome, dropMultiplier: enemyDropMultiplier })
    if (d.battle.isBoss) {
      dropTransformItems(data, d, { boss: enemy, dropMultiplier: enemyDropMultiplier })
    }
    if (d.battle.isBoss) {
      dropSkillBook(data, d, { boss: enemy, dropMultiplier: enemyDropMultiplier })
    }
    if (d.battle.isBoss) {
      let eggDropped: boolean
      ;[eggDropped, d.rng] = rollPercent(d.rng, data.config.boss.eggChance)
      if (eggDropped) {
        let egg: Egg
        ;[egg, d.rng] = createBossEgg(data, d.rng, {
          boss: enemy,
          id: `m${d.nextMonsterId}`,
          floor: d.battle.floor,
          aging: d.options.lifespanEnabled,
          day: dayOf(d.time)
        })
        d.nextMonsterId++
        d.eggs.push(egg)
        log(d, { type: 'eggDropped', eggId: egg.id })
      }
    }
  }
  recordDefeats(data, d)
  unlockNextFloor(data, d)
  countChainWin(d)
  if (d.battle.trainer) TRAINER_MODE_RULES[d.battle.trainer.mode].onWin(data, d)
  if (d.battle.special) specialRule(d.battle.special).onWin(data, d, dropMultiplier)
  const baitInBattle = d.recruit.bait
  finish(data, d, 'won')
  // Bí cảnh / tháp (docs/rules/trials.md): sau finish để hồi máu giữa các trận tính trên max HP
  // ngoài trận.
  if (d.battle.trial) TRIAL_KIND_RULES[d.battle.trial.kind].onWin(data, d)

  // Trứng nở sau khi quái vừa bắt đã vào đội / kho.
  for (const egg of ticked.hatched) {
    let monster: Monster
    ;[monster, d.rng] = hatchMonster(data, d.rng, { monster: egg, day: dayOf(d.time) })
    const destination = hasPartyRoom(data, d.party, monster) ? 'party' : 'storage'
    if (destination === 'party') d.party.push(monster)
    else d.storage.push(monster)
    log(d, { type: 'eggHatched', monsterId: monster.id, destination })
    d.quests = recordQuestEvent(data, d.quests, { type: 'hatched' })
  }
  // Thu phục (docs/rules/recruit.md): sau cùng (quái bị hạ đã trả hệ / race gốc ở finish); mồi dụ
  // tính theo lúc trận diễn ra (finish đã bớt trận này, trận cuối của mồi vẫn có tác dụng).
  rollRecruitOffer(data, d, baitInBattle)
}

/**
 * Đan rơi từ boss (mục "Thọ Nguyên Đan"): bảng của mọi boss, thêm bảng của boss tầng khi đây là
 * boss tầng của map.
 */
function lifespanBossDrops(data: GameData, d: Draft, boss: Monster): DropEntry[] {
  const { bossDrops, floorBossDrops } = data.config.lifespan
  return isFloorBossOfMap(data, d, boss) ? [...bossDrops, ...floorBossDrops] : bossDrops
}

/**
 * Kẹo rơi từ boss (mục "Kẹo EXP và Kẹo Hiếm"): bảng của bậc tầng đang đánh (bậc cuối có fromFloor
 * ≤ tầng), thêm bảng của boss tầng (Kẹo Hiếm) khi đây là boss tầng của map.
 */
function expCandyBossDrops(data: GameData, d: Draft, boss: Monster): DropEntry[] {
  const { bossDropTiers, floorBossDrops } = data.config.expCandy
  const tier = bossDropTiers.findLast((t) => t.fromFloor <= d.battle.floor)
  const drops = tier?.drops ?? []
  return isFloorBossOfMap(data, d, boss) ? [...drops, ...floorBossDrops] : drops
}

/** Phá Cảnh Đan rơi từ boss tầng của map (docs/rules/tamer.md). */
const tamerBossDrops = (data: GameData, d: Draft, boss: Monster): DropEntry[] =>
  isFloorBossOfMap(data, d, boss) ? data.config.tamer.floorBossDrops : []

/**
 * Vật phẩm thân mật (docs/rules/affinity.md): mọi quái bị hạ, thêm bảng của boss, thêm bảng của boss
 * tầng của map.
 */
function affinityDrops(data: GameData, d: Draft, enemy: Monster): DropEntry[] {
  const { wildDrops, bossDrops, floorBossDrops } = data.config.affinity
  if (!d.battle.isBoss) return wildDrops
  const floorBoss = isFloorBossOfMap(data, d, enemy) ? floorBossDrops : []
  return [...wildDrops, ...bossDrops, ...floorBoss]
}

/** Dị Biến Thạch rơi từ boss, thêm bảng của boss tầng của map (evolution-skills.md). */
function evolutionBossDrops(data: GameData, d: Draft, boss: Monster): DropEntry[] {
  const { bossDrops, floorBossDrops } = data.config.evolution
  return isFloorBossOfMap(data, d, boss) ? [...bossDrops, ...floorBossDrops] : bossDrops
}

/** Chỉ trận boss mới tung bảng của boss. */
const onlyInBossBattle =
  (table: DropTable): DropTable =>
  (data, d, enemy) =>
    d.battle.isBoss ? table(data, d, enemy) : []

type DropTable = (data: GameData, d: Draft, enemy: Monster) => DropEntry[]

/** Trận đồ rơi từ boss tầng của map (docs/rules/team.md). */
const formationBossDrops = (data: GameData, d: Draft, boss: Monster): DropEntry[] =>
  isFloorBossOfMap(data, d, boss) ? data.config.formations.floorBossDrops : []

/**
 * Bảng rơi chung theo tính năng (ngoài bảng rơi của biome và boss), tung theo thứ tự này cho mỗi
 * quái bị hạ. Thêm tính năng có đồ rơi: thêm một mục (cuối danh sách để không đổi RNG của bảng cũ).
 */
/** Bạc Hà Tính Cách rơi từ mọi boss (docs/rules/natures.md). */
const natureBossDrops = (data: GameData): DropEntry[] => data.config.nature.bossDrops

/**
 * Thiên tài địa bảo (docs/rules/treasures.md): mọi quái bị hạ, thêm bảng của boss; yêu đan của hệ đầu
 * (quái hoang tỉ lệ demonCoreWildChance, boss demonCoreChance; hạ gục bằng đòn vào đầu thì yêu đan
 * dễ vỡ, docs/rules/hit-locations.md).
 */
function treasureDrops(data: GameData, d: Draft, enemy: Monster): DropEntry[] {
  const config = data.config.treasures
  const coreId = config.demonCoreItemIds[enemy.elementIds[0]]
  const chance =
    (d.battle.isBoss ? config.demonCoreChance : config.demonCoreWildChance) *
    knockoutCoreMultiplier(data, d.battle.records[enemy.id])
  // Tỉ lệ 0: không tung (không tốn RNG).
  const core = coreId === undefined || chance <= 0 ? [] : [{ itemId: coreId, chance }]
  if (!d.battle.isBoss) return [...config.wildDrops, ...core]
  return [...config.wildDrops, ...config.bossDrops, ...core]
}

/**
 * Nguyên liệu luyện đan (docs/rules/alchemy.md): mọi quái bị hạ rơi tinh phách theo race và linh
 * thạch theo hệ đầu, dược liệu; boss rơi thêm đan phương.
 */
function alchemyDrops(data: GameData, d: Draft, enemy: Monster): DropEntry[] {
  const config = data.config.alchemy
  const drops: DropEntry[] = [...config.wildDrops]
  // Tinh phách theo race, race chưa có mục riêng thì theo nhóm race (mục "Race" ở stats-traits.md).
  const essence =
    config.raceEssenceItemIds[enemy.raceId] ??
    config.raceEssenceItemIds[data.races[enemy.raceId]?.groupId ?? '']
  if (essence !== undefined) drops.push({ itemId: essence, chance: config.essenceChance })
  const stone = config.elementStoneItemIds[enemy.elementIds[0]]
  if (stone !== undefined) drops.push({ itemId: stone, chance: config.stoneChance })
  return d.battle.isBoss ? [...drops, ...config.bossDrops] : drops
}

/** Hóa Hình Đan rơi từ boss tầng của map từ tầng dropFromFloor (docs/rules/human-form.md). */
function humanFormBossDrops(data: GameData, d: Draft, boss: Monster): DropEntry[] {
  const { dropFromFloor, floorBossDrops } = data.config.humanForm
  return d.battle.floor >= dropFromFloor && isFloorBossOfMap(data, d, boss) ? floorBossDrops : []
}

/**
 * Thức tỉnh đan của hệ đầu rơi từ boss (tỉ lệ cộng thêm khi là boss tầng của map) và bảng đồ rơi
 * thêm (docs/rules/awakening.md).
 */
function awakeningBossDrops(data: GameData, d: Draft, boss: Monster): DropEntry[] {
  const config = data.config.awakening
  const isFloorBoss = isFloorBossOfMap(data, d, boss)
  const drops = isFloorBoss ? [...config.bossDrops, ...config.floorBossDrops] : config.bossDrops
  const pillId = config.pillItemIds[boss.elementIds[0]]
  const chance = config.bossPillChance + (isFloorBoss ? config.floorBossPillChance : 0)
  // Tỉ lệ 0 hoặc hệ không có đan: không tung (không tốn RNG).
  return pillId === undefined || chance <= 0 ? drops : [...drops, { itemId: pillId, chance }]
}

/** Bí Cảnh Lệnh rơi từ mọi boss (docs/rules/trials.md). */
const trialTokenBossDrops = (data: GameData): DropEntry[] => data.config.trials.tokenBossDrops

/** Hồn tinh (docs/rules/soul-levels.md): mọi quái bị hạ, boss thêm bảng riêng. */
function soulCrystalDrops(data: GameData, d: Draft): DropEntry[] {
  const { wildDrops, bossDrops } = data.config.soulLevels
  return d.battle.isBoss ? [...wildDrops, ...bossDrops] : wildDrops
}

/** Vong Ưu Thủy rơi từ boss (docs/rules/monster-talents.md). */
const talentBossDrops = (data: GameData): DropEntry[] => data.config.talents.bossDrops

/** Đá cường hóa / Tẩy luyện thạch rơi từ boss (docs/rules/equipment-forge.md). */
const forgeBossDrops = (data: GameData): DropEntry[] => data.config.forge.bossDrops

/**
 * Tinh huyết và trận đồ huyết mạch rơi từ boss: mỗi nhóm huyết mạch của loài boss một bảng Tinh huyết
 * và (nhóm có trận đồ) một bảng trận đồ (docs/rules/bloodline.md).
 */
function bloodlineBossDrops(data: GameData, _d: Draft, boss: Monster): DropEntry[] {
  const { essenceDropChance, scrollDropChance } = data.config.bloodline
  return bloodlineGroupsOf(data, boss.baseSpeciesId).flatMap((groupId) => {
    const { essenceItemId, scrollItemId } = data.bloodlines[groupId]
    const essence = { itemId: essenceItemId, chance: essenceDropChance }
    return scrollItemId ? [essence, { itemId: scrollItemId, chance: scrollDropChance }] : [essence]
  })
}

/**
 * Boss là loài tổ (bị hạ hoặc bị bắt): chắc chắn một Tinh huyết và trận đồ (nếu có) mỗi nhóm nó là
 * tổ, không tốn RNG.
 */
function grantAncestorEssences(data: GameData, d: Draft, defeated: readonly Monster[]): void {
  for (const boss of defeated) {
    for (const groupId of ancestorGroupsOf(data, boss.baseSpeciesId)) {
      const { essenceItemId, scrollItemId } = data.bloodlines[groupId]
      gainDrop(d, essenceItemId, 1)
      if (scrollItemId) gainDrop(d, scrollItemId, 1)
    }
  }
}

/** Đá chuyển cực rơi từ boss từ tầng mở khóa Âm / Dương (docs/rules/polarity.md). */
const polarityBossDrops = (data: GameData, d: Draft): DropEntry[] =>
  d.battle.floor >= data.config.polarity.unlockFloor ? data.config.polarity.bossDrops : []

const EXTRA_DROP_TABLES: readonly DropTable[] = [
  onlyInBossBattle(lifespanBossDrops),
  onlyInBossBattle(expCandyBossDrops),
  onlyInBossBattle(tamerBossDrops),
  affinityDrops,
  onlyInBossBattle(evolutionBossDrops),
  onlyInBossBattle(formationBossDrops),
  onlyInBossBattle(natureBossDrops),
  onlyInBossBattle(awakeningBossDrops),
  onlyInBossBattle(humanFormBossDrops),
  treasureDrops,
  alchemyDrops,
  onlyInBossBattle(trialTokenBossDrops),
  soulCrystalDrops,
  onlyInBossBattle(forgeBossDrops),
  onlyInBossBattle(talentBossDrops),
  onlyInBossBattle(bloodlineBossDrops),
  onlyInBossBattle(polarityBossDrops)
]

/** EXP gốc của trận: tổng EXP của quái bị hạ và quái bắt được (mỗi quái tham chiến nhận đủ). */
const battleExp = (data: GameData, d: Draft): Decimal =>
  [...d.battle.enemies, ...d.battle.captured].reduce(
    (sum, enemy) => sum.plus(expReward(data, enemy)),
    BIG_ZERO
  )

/**
 * Cộng EXP ngự thú sư (phe người chơi có ngự thú sư trong trận; luật noTamerSkills của bí cảnh thì
 * không có) và ghi log; 0 thì bỏ qua.
 */
function gainTamerExp(d: Draft, amount: Decimal): void {
  if (!d.battle.tamers.player || amount.lte(0)) return
  d.tamer = { ...d.tamer, exp: d.tamer.exp.plus(amount) }
  log(d, { type: 'tamerExpGained', amount })
}

const isFloorBossOfMap = (data: GameData, d: Draft, boss: Monster): boolean =>
  boss.speciesId === battleBiome(data, d, d.battle).floorBossSpeciesId

/**
 * Trang bị rơi từ một quái bị hạ (mục "Trang bị và đồ cầm"): một món thường theo danh sách của map
 * (tỉ lệ và bảng bậc của quái hoang / boss, bậc hiếm dễ ra hơn ở tầng cao); boss tung thêm rơi món
 * unique đang mang và rơi một món mới khác trong pool của loài. Trait tăng đồ rơi (kiểu Pickup)
 * nhân mọi tỉ lệ. Map không có danh sách / boss không có pool thì không tốn RNG.
 */
function dropEquipment(
  data: GameData,
  d: Draft,
  { enemy, biome, dropMultiplier }: { enemy: Monster; biome: Biome; dropMultiplier: number }
): void {
  const config = data.config.equipment
  const isBoss = d.battle.isBoss
  const chanceOf = (chance: number): number => Math.min(100, chance * dropMultiplier)
  const candidates = (biome.equipmentDrops ?? []).filter((entry) => entry.weight > 0)
  let dropped: boolean
  if (candidates.length > 0) {
    ;[dropped, d.rng] = rollPercent(
      d.rng,
      chanceOf(isBoss ? config.bossDropChance : config.dropChance)
    )
    if (dropped) {
      let entry: WeightedItem
      ;[entry, d.rng] = pickWeighted(d.rng, candidates, (candidate) => candidate.weight)
      let rarity: NormalRarity
      const weights = isBoss ? config.bossRarityWeights : config.rarityWeights
      ;[rarity, d.rng] = rollRarity(data, d.rng, weights, d.battle.floor)
      gainNewEquipment(data, d, { itemId: entry.itemId, rarity })
    }
  }
  if (!isBoss) return
  const carried = enemy.equipment.flatMap((entry) =>
    entry.storage === 'instance' && entry.instance.rarity === 'unique' ? [entry.instance] : []
  )
  for (const instance of carried) {
    ;[dropped, d.rng] = rollPercent(d.rng, chanceOf(config.uniqueCarriedDropChance))
    if (!dropped) continue
    // Món rời boss (id món không được nằm hai chỗ).
    enemy.equipment = enemy.equipment.filter(
      (entry) => entry.storage !== 'instance' || entry.instance !== instance
    )
    gainEquipment(d, instance)
  }
  const pool = uniquePoolOf(data, enemy.speciesId)
  if (pool.length === 0) return
  ;[dropped, d.rng] = rollPercent(d.rng, chanceOf(config.uniquePoolDropChance))
  if (!dropped) return
  // "Món khác" trong pool: bỏ món boss đang mang nếu pool còn món khác.
  const others = pool.filter((item) => !carried.some((c) => c.baseItemId === item.id))
  let item: EquipmentItem
  ;[item, d.rng] = pick(d.rng, others.length > 0 ? others : pool)
  gainNewEquipment(data, d, { itemId: item.id, rarity: 'unique' })
}

/**
 * EXP quái nhận theo trait của chính nó (kiểu Chăm chỉ / Lười biếng) cộng linh dịch và giai đoạn
 * tuổi (mục "Tuổi và thọ nguyên"), làm tròn xuống; hệ số còn > 0 thì không dưới minExp (quái level thấp vẫn có EXP).
 */
function expWithTraits(data: GameData, monster: Monster, exp: Decimal): Decimal {
  const multiplier =
    traitExpMultiplier(data, monster, spiritVirusExpPercent(data, monster)) *
    ageExpMultiplier(data, monster)
  if (multiplier === 1) return exp
  if (multiplier <= 0) return BIG_ZERO
  return maxBig(data.config.rewards.minExp, exp.times(multiplier).floor())
}

/** Nhiệm vụ (docs/rules/quests.md): mỗi quái bị hạ, boss tầng của map bị hạ. */
function recordDefeats(data: GameData, d: Draft): void {
  const { floor } = d.battle
  for (const enemy of d.battle.enemies) {
    d.quests = recordQuestEvent(data, d.quests, { type: 'defeated', floor })
    if (d.battle.isBoss && isFloorBossOfMap(data, d, enemy)) {
      d.quests = recordQuestEvent(data, d.quests, { type: 'floorBossDefeated', floor })
    }
  }
}

/**
 * Mở tầng (mục "Tầng và biome"): trận boss ở tầng highestFloor mà boss tầng bị hạ hoặc bị bắt
 * (gọi bằng challengeBoss hay tình cờ gặp ngẫu nhiên đều được). Boss loài khác không mở tầng.
 * Tầng mới được tung map ngay lúc mở rồi cố định mãi.
 */
function unlockNextFloor(data: GameData, d: Draft): void {
  const { floor, isBoss, enemies, captured } = d.battle
  // Boss của bí cảnh / tháp thí luyện (docs/rules/trials.md), thú triều, hiểm địa không mở tầng.
  if (!isBoss || floor !== d.highestFloor || !countsAsFloorBattle(d.battle)) return
  const { floorBossSpeciesId } = battleBiome(data, d, d.battle)
  if (![...enemies, ...captured].some((m) => m.speciesId === floorBossSpeciesId)) return
  let biomeId: string
  ;[biomeId, d.rng] = rollFloorBiome(data, d.rng)
  d.highestFloor = floor + 1
  d.floorBiomeIds = [...d.floorBiomeIds, biomeId]
  log(d, { type: 'floorUnlocked', floor: d.highestFloor, biomeId })
  // Lần đầu mở tầng: ngự thú sư nhận thêm phần EXP gốc của trận boss tầng (docs/rules/tamer.md).
  gainTamerExp(d, tamerExpShare(battleExp(data, d), data.config.tamer.floorUnlockExpPercent))
  // Mốc lý lịch cho mọi quái đã tham chiến (kể cả đã gục); mở tầng chỉ một lần nên là lần đầu.
  const day = dayOf(d.time)
  d.party = d.party.map((monster) =>
    d.battle.participants.includes(monster.id)
      ? addMilestone(data, monster, { day, kind: 'floorBossDefeated', floor })
      : monster
  )
  // Tầng có đạo quán: hệ của đạo quán tung ngay lúc mở như map (docs/rules/trainers.md).
  if (isGymFloor(data, d.highestFloor)) {
    let gym: Gym
    ;[gym, d.rng] = rollGym(data, d.rng, d.highestFloor)
    d.trainers = { ...d.trainers, gyms: [...d.trainers.gyms, gym] }
    log(d, { type: 'gymOpened', floor: gym.floor, elementId: gym.elementId })
  }
}

/**
 * Đồ rơi của biến hình khi hạ boss (mục "Biến hình trong trận"): đá của một dạng Mega của loài,
 * Mảnh Tera theo hệ Tera của boss, Z-Crystal (z-moves.md), bảng transform.bossDrops. Trait kiểu
 * Pickup nhân tỉ lệ.
 */
function dropTransformItems(
  data: GameData,
  d: Draft,
  { boss, dropMultiplier }: { boss: Monster; dropMultiplier: number }
): void {
  const { mega, tera, bossDrops } = data.config.transform
  const roll = (chance: number): boolean => {
    let dropped: boolean
    ;[dropped, d.rng] = rollPercent(d.rng, Math.min(100, chance * dropMultiplier))
    return dropped
  }
  const stones = megaStonesOf(data, boss.speciesId)
  if (stones.length > 0 && roll(mega.stoneDropChance)) {
    let stone: MegaStoneItem
    ;[stone, d.rng] = pick(d.rng, stones)
    gainDrop(d, stone.id, 1)
  }
  const shard = teraShardFor(data, boss.teraElementId)
  if (shard && roll(tera.shardDrop.chance)) {
    let count: number
    ;[count, d.rng] = nextInt(d.rng, tera.shardDrop.min, tera.shardDrop.max)
    gainDrop(d, shard.id, count)
  }
  const crystals = bossZCrystals(data, boss)
  if (crystals.length > 0 && data.config.transform.zMove.crystalDropChance > 0) {
    if (roll(data.config.transform.zMove.crystalDropChance)) {
      let crystal: ZCrystalItem
      ;[crystal, d.rng] = pick(d.rng, crystals)
      gainDrop(d, crystal.id, 1)
    }
  }
  for (const drop of bossDrops) if (roll(drop.chance)) gainDrop(d, drop.itemId, 1)
}

/** Z-Crystal boss có thể rơi: crystal loài của loài boss và crystal các hệ của boss (rơi đều). */
const bossZCrystals = (data: GameData, boss: Monster): ZCrystalItem[] => [
  ...signatureZCrystalsOf(data, boss.speciesId),
  ...boss.elementIds.flatMap((elementId) => elementZCrystalOf(data, elementId) ?? [])
]

/**
 * Sách kỹ năng rơi khi hạ boss (docs/rules/skill-books.md): bossDropChance % (× hệ số rơi) rơi một
 * cuốn, skill chọn theo trọng số trong learnset + bookSkillIds loài gốc của boss (trừ skill không có sách): mỗi
 * skill 1, skill quái trong đội học được mà chưa biết × partyMultiplier. reusableDropChance % là
 * Chân kinh. Tỉ lệ 0 thì không tốn RNG.
 */
function dropSkillBook(
  data: GameData,
  d: Draft,
  { boss, dropMultiplier }: { boss: Monster; dropMultiplier: number }
): void {
  const { bossDropChance, reusableDropChance, partyMultiplier } = data.config.skillBook
  const species = data.species[boss.baseSpeciesId]
  if (species?.kind !== 'normal') return
  // Skill loài học được bằng level hoặc sách (TM / tutor của game gốc).
  const learnable = [
    ...species.learnset.map((entry) => entry.skillId),
    ...(species.bookSkillIds ?? [])
  ]
  const skillIds = [...new Set(learnable)].filter((id) => isBookableSkill(data, data.skills[id]))
  if (skillIds.length === 0) return
  let dropped: boolean
  ;[dropped, d.rng] = rollPercent(d.rng, Math.min(100, bossDropChance * dropMultiplier))
  if (!dropped) return
  const weightOf = (id: string): number =>
    isSkillBookUsefulForParty(data, d.party, id) ? partyMultiplier : 1
  let skillId: string
  ;[skillId, d.rng] = pickWeighted(d.rng, skillIds, weightOf)
  let reusable: boolean
  ;[reusable, d.rng] = rollPercent(d.rng, reusableDropChance)
  d.inventory = addBooks(d.inventory, { skillId, reusable }, 1)
  log(d, { type: 'skillBookDropped', skillId, reusable })
}

/**
 * Thua: mất % tiền và về thị trấn (cửa hàng random lại hàng), không tự hồi máu (mục Battle). Không bị kẹt vì NPC hồi máu
 * ở thị trấn miễn phí và hồi cả quái đã gục. Bí cảnh / tháp không mất tiền (docs/rules/trials.md);
 * thú triều mất % riêng (docs/rules/events.md).
 */
export function applyLoss(data: GameData, d: Draft): void {
  // Trận đặc biệt có phạt riêng (thú triều, docs/rules/events.md).
  const special = d.battle.special ? specialRule(d.battle.special).lossPenaltyPercent(data) : null
  const penalty = d.battle.trial ? 0 : (special ?? data.config.rewards.losePenaltyPercent)
  const moneyLost = d.money.times(penalty).div(100).floor()
  d.money = d.money.minus(moneyLost)
  Object.assign(d, enterTown(data, d))
  Object.assign(d, refillQuestBoard(data, d))
  log(d, { type: 'lost', moneyLost })
  if (d.battle.trainer) TRAINER_MODE_RULES[d.battle.trainer.mode].onLoss(data, d)
  if (d.battle.trial) TRIAL_KIND_RULES[d.battle.trial.kind].onLoss(data, d)
  if (d.battle.special) specialRule(d.battle.special).onLoss(data, d)
  finish(data, d, 'lost')
}
