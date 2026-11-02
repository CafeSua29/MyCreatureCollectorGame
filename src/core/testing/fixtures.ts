// Dữ liệu và quái mẫu cho test, số tròn để dễ tính tay. Không dùng trong game.
// Mặc định tắt chí mạng và dao động sát thương để sát thương tính chính xác được;
// test nào cần thì sửa config trong makeRawData() rồi gọi createGameData.

import { createGameData } from '../gameData'
import { createGameState } from '../game'
import type { FloorSite } from '../world'
import { POLARITY_CHANGES, type PolarityChange } from '../monster'
import { defined } from './assertions'
import { soulRelicTestConfig, soulRelicTestItems } from './soulFixtures'
import { gatheringTestConfig, gatheringTestItems } from './gatheringFixtures'
import { toBig, type BigValue } from '../shared'
import {
  CONTENT_KINDS,
  STAT_NAMES,
  STELLAR,
  type BattleField,
  type BodyPartDef,
  type BattleState,
  type ContentText,
  type BigStats,
  type BookStack,
  type CrystalStack,
  type EquipmentInstance,
  type DamageArena,
  type GameData,
  type GameState,
  type Inventory,
  type Item,
  type Monster,
  type MonsterBattleContext,
  type RawGameData,
  type Skill,
  type StatName,
  type Stats,
  type TextData
} from '../model'

/** Khối thuộc tính bất ổn của luật fixture: trọng số 1, % thưởng cộng thêm. */
const unstable = (rewardPercent: number): { weight: number; rewardPercent: number } => ({
  weight: 1,
  rewardPercent
})

export function uniformStats(value: number): Stats {
  const result = {} as Stats
  for (const stat of STAT_NAMES) result[stat] = value
  return result
}

function skill(overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill {
  return {
    elementId: 'normal',
    category: 'physical',
    power: 50,
    accuracy: 100,
    priority: 0,
    target: 'enemy',
    effects: [],
    ...overrides
  }
}

/** Trait race (không tác dụng) của mọi race trong fixture. */
export const FIXTURE_RACE_TRAIT_ID = 'raceMark'
/** Kỹ năng đồng hành rỗng của mọi race fixture (docs/rules/partner-skills.md). */
export const FIXTURE_PARTNER_SKILL_ID = 'noPartner'
/** Hiểm địa fixture (docs/rules/zones.md). */
export const FIXTURE_ZONE_ID = 'den'
/** Công trình Linh điền của fixture (docs/rules/dwelling.md). */
export const FIXTURE_GARDEN_BUILDING_ID = 'field'
/** Ngự thú sư NPC fixture (docs/rules/trainers.md): lớp mọi hệ và quán chủ. */
export const FIXTURE_TRAINER_ID = 'rookie'
/** Trait cực tính fixture (docs/rules/polarity.md). */
export const FIXTURE_YIN_TRAIT_IDS = ['yinCalm', 'yinShell']
export const FIXTURE_YANG_TRAIT_IDS = ['yangFlame']
/** Đá chuyển cực fixture theo cách đổi. */
export const FIXTURE_POLARITY_STONE_IDS: Readonly<Record<PolarityChange, string>> = {
  yin: 'yinStone',
  yang: 'yangStone',
  swap: 'poleSwapStone',
  clear: 'poleResetStone'
}
export const FIXTURE_GYM_LEADER_ID = 'leader'
/** Bí Cảnh Lệnh fixture (docs/rules/trials.md). */
export const FIXTURE_TRIAL_TOKEN_ID = 'realmToken'
/** Thần linh của fixture (docs/rules/deities.md): thần hệ lửa, tín vật và Hương nến. */
export const FIXTURE_DEITY_ID = 'fireGod'
export const FIXTURE_DEITY_TOKEN_ID = 'fireToken'
export const FIXTURE_INCENSE_ID = 'incense'
/** Khí linh của fixture (docs/rules/artifact-spirits.md): hai loại, Dẫn Hồn Châu, Phá Giới Phù. */
export const FIXTURE_SPIRIT_IDS = ['swordSpirit', 'guardSpirit'] as const
export const FIXTURE_SPIRIT_ORB_ID = 'spiritOrb'
/** Thành tựu / danh hiệu của fixture (docs/rules/achievements.md). */
export const FIXTURE_ACHIEVEMENT_IDS = { wins: 'winner', pair: 'pairOwner' } as const
export const FIXTURE_TITLE_IDS = { veteran: 'veteran', lucky: 'lucky' } as const
export const FIXTURE_BREAK_TALISMAN_ID = 'breakTalisman'

/** Hồn tinh của fixture (docs/rules/soul-levels.md): 1 điểm và 5 điểm. */
export const FIXTURE_SOUL_SMALL_ID = 'soulSmall'
export const FIXTURE_SOUL_LARGE_ID = 'soulLarge'
/** Đá cường hóa / Tẩy luyện thạch của fixture (docs/rules/equipment-forge.md). */
export const FIXTURE_ENHANCE_STONE_ID = 'enhanceStone'
export const FIXTURE_REFINING_STONE_ID = 'refiningStone'
/** Nhóm "yêu đan bất kỳ" của fixture (config.itemGroups) và hai món trong nhóm. */
export const FIXTURE_CORE_GROUP_ID = 'demonCore'
export const FIXTURE_CORE_IDS = ['coreFire', 'coreWater'] as const

export function makeRawData(): RawGameData {
  const content: Omit<RawGameData, 'text' | 'raceGroups'> = {
    config: {
      geneWeight: 2,
      shinyMultiplier: 1.5,
      levelEffectStep: 0.2,
      traitSlots: { initial: 3, max: 6 },
      fuseCostPerLevel: 50,
      // Fuse luôn thành công (100%, không tốn RNG) để test khác tất định; test tỉ lệ tự đổi.
      fuseChance: { raceChances: { same: 100, breedable: 100, other: 100 }, lineageFactor: 1 },
      fusion: { inheritSkills: 2 },
      // Hiến tế (docs/rules/sacrifice.md): số như dữ liệu thật.
      sacrifice: { costPerLevel: 20, statPercentPerStack: 1 },
      // Luân hồi (docs/rules/rebirth.md): số như dữ liệu thật.
      rebirth: {
        minLevelBase: 100,
        costBase: 10000,
        pillItemId: 'rebirthPill',
        pillsPerRebirth: 1,
        statPercentPerRebirth: 10,
        genePercent: 10,
        floorBossDrops: []
      },
      // Sức chứa (docs/rules/capacity.md): số như dữ liệu thật.
      capacity: {
        storage: { base: 200, perExpansion: 50, costBase: 1000, realmBonus: 50 },
        bag: { base: 100, perExpansion: 50, costBase: 1500, realmBonus: 25 }
      },
      // Cấy ghép (docs/rules/implant.md): số như dữ liệu thật.
      implant: {
        tiers: [
          { id: 'common', kind: 'flatStat', statCount: 1, min: 5, max: 10, weight: 60, price: 300 },
          {
            id: 'uncommon',
            kind: 'flatStat',
            statCount: 1,
            min: 10,
            max: 20,
            weight: 25,
            price: 800
          },
          { id: 'rare', kind: 'flatStat', statCount: 2, min: 20, max: 30, weight: 12, price: 2000 },
          { id: 'epic', kind: 'flatStat', statCount: 3, min: 30, max: 45, weight: 3, price: 6000 },
          { id: 'mutagen', kind: 'hookEffect', levels: 1, weight: 8, price: 1000 },
          { id: 'greaterMutagen', kind: 'hookEffect', levels: 2, weight: 2, price: 3000 }
        ],
        stockMin: 5,
        stockMax: 10,
        restockDays: 10,
        baseChance: 90,
        chanceFalloff: 0.9,
        maxFails: 3
      },
      crystal: {
        extractCostBase: 100,
        injectCostBase: 100,
        kindCostMultipliers: { positive: 1, negative: 1, rare: 3 }
      },
      // Không kệ sách, boss không rơi sách để test cũ không đổi RNG; test sách tự đổi.
      skillBook: {
        priceBase: 200,
        pricePerPower: 5,
        reusablePriceMultiplier: 10,
        universalElementIds: ['normal'],
        rarities: [
          { id: 'common', minLearners: 3, priceMultiplier: 1, shopWeight: 60 },
          { id: 'rare', minLearners: 1, priceMultiplier: 2, shopWeight: 30 },
          { id: 'legendary', minLearners: 0, priceMultiplier: 5, shopWeight: 10 }
        ],
        rarityPowerSteps: [100],
        shopMin: 0,
        shopMax: 0,
        shopMaxPower: 80,
        shopRareSkillFactor: 0,
        partyMultiplier: 5,
        bossDropChance: 0,
        reusableDropChance: 2
      },
      // Cửa hàng luôn 3 món; test số món tự đổi stockMin / stockMax.
      shop: {
        stockMin: 3,
        stockMax: 3,
        sellPercent: 50,
        crystalBuyMultiplier: 2,
        crystalWeights: { positive: 10, negative: 5, rare: 5 }
      },
      // Thị trường trung tính (không tụt, không dao động) để test giá cũ không đổi; test thị
      // trường tự dùng withMarket.
      market: {
        minFactor: 0.3,
        recoveryPerDay: 0.8,
        removeBelow: 0.5,
        dayFactorMin: 1,
        dayFactorMax: 1,
        hotMultiplier: 1,
        dropTiers: [{ dropPerUnit: 0 }]
      },
      // Số giống balance thật. Biome fixture không có equipmentDrops và boss fixture không có pool
      // unique nên test cũ không tốn thêm RNG; test trang bị dùng withEquipmentFixtures.
      equipment: {
        baseSlots: 3,
        floorMilestones: [20, 50],
        dropChance: 3,
        bossDropChance: 25,
        rarityWeights: { common: 60, uncommon: 25, rare: 12, epic: 3, legendary: 0.5 },
        bossRarityWeights: { common: 20, uncommon: 30, rare: 30, epic: 15, legendary: 5 },
        shopRarityWeights: { common: 60, uncommon: 30, rare: 8, epic: 2 },
        floorBoostFrom: 'rare',
        floorRarityFactor: 0.1,
        rarityPriceMultipliers: {
          common: 1,
          uncommon: 2,
          rare: 4,
          epic: 10,
          legendary: 25,
          unique: 50
        },
        affixCounts: { common: 0, uncommon: 0, rare: 1, epic: 2, legendary: 3, unique: 2 },
        uniqueCarriedDropChance: 10,
        uniquePoolDropChance: 5
      },
      starter: {
        // Mỗi ô một loài cố định để test tất định.
        slots: [
          { conditions: [{ kind: 'species', speciesIds: ['weakling'] }] },
          { conditions: [{ kind: 'species', speciesIds: ['twig'] }] }
        ],
        unlocks: [],
        unlockOwnedLines: false,
        level: 5,
        money: 500,
        items: { ball: 5, potion: 3 }
      },
      battleStage: { min: -6, max: 6, base: 2, accuracyBase: 3 },
      fusedSpeciesId: 'fused',
      partySize: 6,
      maxSkills: 4,
      battle: {
        damageFactor: 0.3,
        stabMultiplier: 1.5,
        critChance: 0,
        critStageChances: [12.5, 50, 100],
        critMultiplier: 1.5,
        randomMin: 1,
        randomMax: 1,
        spreadMultiplier: 0.75,
        fleeChance: 75,
        hitCountWeights: [{ min: 2, max: 5, weights: [35, 35, 15, 15] }],
        defend: { priority: 4, damageTakenPercent: -50 },
        provoke: { priority: 4, damageTakenPercent: -25 },
        traitChain: { maxDepth: 3, maxActions: 10, maxRepeats: 10 },
        stagePercentSteps: [35, 75]
      },
      status: { bossDamageMultiplier: 0.5 },
      field: { defaults: { weather: 'clear', terrain: 'none' }, sunWeatherId: 'sun' },
      ai: {
        koBonus: 0.5,
        lowHpTargetWeight: 0.2,
        stageValuePerStep: 0.15,
        healWeight: 1,
        statusWeights: { poison: 0.3, burn: 0.25, paralysis: 0.2, sleep: 0.35 },
        fieldWeight: 0.3,
        defendWeight: 0,
        provokeWeight: 0,
        minionWeight: 0.2,
        spellEffectWeight: 0.15,
        transformMinGain: 0.1,
        reviveBonus: 0.5,
        tamerSkillMinScore: 0.2,
        holdTurnWeight: 0.15
      },
      rewards: { expFactor: 0.5, minExp: 1, moneyPerLevel: 5, losePenaltyPercent: 10 },
      wild: { geneMin: 10, geneMax: 10, traitCountWeights: [1], traitKindWeights: { positive: 1 } },
      // levelPerFloor 2 để level tất định: tầng N quái thường level 2N − 1, boss tầng level 2N.
      // Gen không tăng theo tầng; test gen theo tầng tự đổi geneGrowthPerFloor.
      floors: { levelPerFloor: 2, geneGrowthPerFloor: 1 },
      restCostPerLevel: 2,
      weight: { defaultRaceKg: 50, referenceStatTotal: 180, statExponent: 2 },
      size: {
        largeWeightKg: 1000,
        statMultipliers: { hp: 2 },
        damageMultiplier: 2,
        largePartySlots: 2
      },
      // Vị trí ra đòn như dữ liệu thật (docs/rules/hit-locations.md); race fixture không ghi
      // điểm yếu nên AI không nhắm và test cũ không đổi.
      hitLocations: {
        defaultBodyParts: ['head', 'torso', 'legs'],
        maxWeakPoints: 2,
        weakPointDamagePercent: 50,
        weakPointChanceMultiplier: 2,
        weakPointBreakMultiplier: 2,
        swoopTurns: 1,
        offBalanceTurns: 1,
        offBalanceCritStage: 1,
        aiUnknownWeakPercent: 100
      },
      // Một lần kiểm, không chí mạng: RNG của test bắt quái cũ không đổi.
      capture: {
        hpFloorPercent: 10,
        pityPercentPerMiss: 5,
        shakeChecks: 1,
        criticalTiers: [],
        criticalDivisor: 6
      },
      // Bộ sưu tập (docs/rules/dex.md): không mốc thưởng; thưởng sưu tập như dữ liệu thật; thưởng
      // Dex map 100 × tầng, không vật phẩm.
      // Nghiên cứu loài: số giống balance thật (docs/rules/species-research.md).
      research: {
        levelPoints: [10, 20, 30, 45, 60, 75, 90, 105, 120, 130],
        tasks: [
          { kind: 'caught', thresholds: [1, 3, 5, 10, 25], points: 10 },
          { kind: 'defeated', thresholds: [5, 20, 50, 100], points: 10 },
          { kind: 'mainElementSkillSeen', thresholds: [5, 20], points: 10 },
          { kind: 'evolvedInto', thresholds: [1, 3], points: 20, scope: 'evolvedForm' },
          { kind: 'hatched', thresholds: [1, 5], points: 20 },
          { kind: 'caughtWithStatus', thresholds: [1, 5], points: 10 },
          { kind: 'caughtShiny', thresholds: [1], points: 50 }
        ],
        speciesTasks: {},
        benefits: [
          { level: 2, type: 'revealProfile' },
          { level: 4, type: 'revealLearnset' },
          { level: 5, type: 'catchRatePercent', percent: 10 },
          { level: 6, type: 'revealWeakPoints' },
          { level: 7, type: 'expPercent', percent: 20 },
          { level: 10, type: 'shinyChancePercent', percent: 100 }
        ],
        levelRewards: [
          { level: 5, items: [{ itemId: 'potion', count: 2 }] },
          { level: 10, items: [{ itemId: 'potion', count: 5 }] }
        ]
      },
      dex: {
        milestones: [],
        collectionStep: 100,
        collectionStatPercent: 1,
        regionalReward: { moneyPerFloor: 100, items: {} }
      },
      maxNicknameLength: 12,
      history: { maxMilestones: 50 },
      relearnCostPerLevel: 10,
      // Tắt shiny quái hoang để test khác không bị ảnh hưởng; test shiny tự bật.
      shiny: { traitId: 'shiny', wildChance: 0 },
      // Không biome nào có boss ngẫu nhiên trừ "lair" (tầng 2) luôn ra boss; boss ở "lair" ×3.
      boss: { traitId: 'bossBlood', chance: 0, multiplierMin: 2, multiplierMax: 5, eggChance: 100 },
      // Ấp trứng có hoàn cảnh: đột biến / shiny mặc định 0 để test tất định; test tự bật khi cần.
      egg: {
        hatchBattlesMin: 5,
        hatchBattlesMax: 10,
        incubation: {
          maxInfusions: 3,
          genePercentPerInfusion: 10,
          infusionShinyChance: 0,
          spiritLandExtraSteps: 1,
          spiritLandMutationChance: 0
        }
      },
      // Tỉ lệ shiny / đột biến mặc định 0 để test tất định; test tự bật khi cần.
      breeding: {
        costPerLevel: 20,
        shinyChance: 0,
        shinyChanceOneParent: 0,
        mutationChance: 0,
        geneDownPercent: 10,
        geneUpPercent: 15
      },
      abilities: { wildHiddenChance: 5, inheritChance: 80, inheritHiddenChance: 60 },
      // Biến hình: vật phẩm chìa khóa ở tầng cao để không đổi test mở tầng; boss không biến hình,
      // không rơi gì thêm (test tự bật).
      // Đồng hồ và thọ nguyên: số giống balance thật (mục "Tuổi và thọ nguyên"); loài fixture thọ
      // 100 năm, quái fixture mặc định không già đi (aging false) nên test cũ không đổi.
      clock: {
        startHour: 6,
        wakeHour: 6,
        hours: {
          wildBattle: 2,
          bossBattle: 4,
          travel: 1,
          healParty: 1,
          event: 1,
          safari: 24,
          zoneStep: 1,
          fishing: 1,
          mining: 2,
          worldBoss: 24
        }
      },
      // Ngày đêm và mùa: giờ thời khắc và hệ số giống balance thật, nhưng không suy giờ hoạt động
      // theo race / hệ và không có hệ số mùa, để trọng số gặp / thời tiết của test cũ không đổi
      // (test lịch tự bật).
      calendar: {
        phaseStartHours: { dawn: 6, day: 7, dusk: 17, night: 18 },
        activeTimeMultipliers: {
          diurnal: { dawn: 1, day: 2, dusk: 1, night: 0.5 },
          nocturnal: { dawn: 1, day: 0.5, dusk: 1, night: 2 },
          crepuscular: { dawn: 2, day: 1, dusk: 2, night: 1 },
          cathemeral: { dawn: 1, day: 1, dusk: 1, night: 1 }
        },
        activeTimeByRace: {},
        activeTimeByElement: {},
        seasonWeatherMultipliers: { spring: {}, summer: {}, autumn: {}, winter: {} }
      },
      lifespan: {
        daysPerYear: 10,
        levelPercent: 1,
        youngBelowPercent: 10,
        oldFromPercent: 70,
        young: { statPercent: -15, expPercent: 50 },
        old: { statPercentAtEnd: -30, expPercent: -30 },
        warnPercent: 90,
        spawnAgePercent: { wild: { min: 10, max: 40 }, boss: { min: 30, max: 80 }, starter: 10 },
        fuseAbsorbPercent: 25,
        legacyEgg: { genePercent: 50 },
        pillResistance: 0.8,
        bossDrops: [],
        floorBossDrops: []
      },
      transform: {
        keyItems: { mega: 'megaRing', dynamax: 'dynamaxBand', tera: 'teraOrb' },
        mega: { stoneDropChance: 0 },
        dynamax: {
          turns: 3,
          hpMultiplierBase: 1.5,
          hpMultiplierPerLevel: 0.05,
          maxLevel: 10,
          powerTable: {
            steps: [
              { below: 45, power: 90 },
              { below: 55, power: 100 },
              { below: 65, power: 110 },
              { below: 75, power: 120 },
              { below: 110, power: 130 },
              { below: 150, power: 140 }
            ],
            top: 150
          },
          lowPowerTable: {
            steps: [
              { below: 45, power: 70 },
              { below: 55, power: 75 },
              { below: 65, power: 80 },
              { below: 75, power: 85 },
              { below: 110, power: 90 },
              { below: 150, power: 95 }
            ],
            top: 100
          },
          lowPowerElementIds: ['ghost'],
          bossGmaxFactorChance: 0
        },
        tera: {
          sameStabMultiplier: 2,
          minPower: 60,
          stellarOriginalMultiplier: 2,
          stellarOtherMultiplier: 1.2,
          stellarBlastPower: 100,
          stellarBlastEffectiveness: 2,
          stellarBlastSelfStages: [
            { stat: 'attack', delta: -1 },
            { stat: 'spAttack', delta: -1 }
          ],
          changeCost: 50,
          bossOwnElementChance: 100,
          stellarFromFloor: 50,
          stellarChance: 0,
          shardDrop: { chance: 0, min: 3, max: 6 },
          relearnSkillIds: ['teraBlast']
        },
        zMove: {
          keyItemId: 'zRing',
          powerTable: {
            steps: [
              { below: 60, power: 100 },
              { below: 70, power: 120 },
              { below: 80, power: 140 },
              { below: 90, power: 160 },
              { below: 100, power: 175 },
              { below: 110, power: 180 },
              { below: 120, power: 185 },
              { below: 130, power: 190 },
              { below: 140, power: 195 }
            ],
            top: 200
          },
          variableHitsPowerFactor: 3,
          protectDamagePercent: 25,
          crystalDropChance: 0
        },
        merge: { turns: 3, lowerSharePercent: 50, minAffinity: 200 },
        boss: {
          base: 0,
          perFloor: 0,
          weights: { mega: 1, dynamax: 1, tera: 1, trueForm: 0, merge: 0, ultraBurst: 1 }
        },
        bossDrops: []
      },
      // Kẹo không rơi để test đồ rơi khác không đổi; test kẹo tự bật.
      expCandy: { bossDropTiers: [{ fromFloor: 1, drops: [] }], floorBossDrops: [] },
      // Không rơi Dị Biến Thạch để không đổi RNG của test khác.
      evolution: { bossDrops: [], floorBossDrops: [] },
      // Số tròn để tính tay; Phá Cảnh Đan không rơi để không đổi RNG của test khác.
      tamer: {
        expShare: 10,
        floorUnlockExpPercent: 100,
        expBase: 100,
        expPower: 2,
        breakthrough: {
          costBase: 1000,
          itemId: 'breakthroughPill',
          baseChance: 100,
          chanceStep: 10,
          minChance: 30
        },
        statPercentPerRealm: 3,
        lifespanPercentPerRealm: 10,
        // Khế ước (docs/rules/tamer.md mục "Khế ước"): cộng hưởng gốc 0 để chỉ số / thọ nguyên của
        // test cũ (đội khế ước cảnh giới 0) không đổi; số khác như dữ liệu thật.
        contract: {
          levelBase: 100,
          levelPerRealm: 100,
          slotsBase: 8,
          slotsPerRealm: 4,
          baseStatPercent: 0,
          baseLifespanPercent: 0,
          chance: {
            base: 90,
            levelPenalty: 40,
            rankPenalty: 4,
            bossPenalty: 15,
            affinityBonus: 20,
            min: 10,
            max: 100
          },
          failure: { affinityLoss: 30, backlashDays: 3, escapeChance: 20 },
          dissolveAffinityLoss: 50,
          dissolveBacklashDays: 2,
          soulLinkTiers: [
            { id: 'attuned', days: 7, minAffinity: 100, statPercent: 2, manaCostReduction: 10 },
            { id: 'resonant', days: 30, minAffinity: 150, statPercent: 4, manaCostReduction: 20 },
            { id: 'oneMind', days: 100, minAffinity: 200, statPercent: 7, manaCostReduction: 30 }
          ],
          disobey: { base: 1, levelScale: 5, overLimitScale: 30, max: 50, affinityReduction: 0.8 }
        },
        manaBase: 50,
        manaPerRealm: 10,
        realmMilestones: [2, 5, 10],
        floorBossDrops: []
      },
      // Số như dữ liệu thật; vật phẩm thân mật không rơi để không đổi RNG của test khác.
      affinity: {
        max: 255,
        start: { starter: 70, caught: 50, egg: 120, recruit: 70 },
        gain: { win: 1, participated: 2, rest: 1, potion: 2, candy: 1 },
        loss: { faint: 1 },
        wildDrops: [],
        bossDrops: [],
        floorBossDrops: []
      },
      imprint: {
        requestEveryDays: 2,
        fallbackDays: 30,
        maxStatPercent: 15,
        foods: ['spiritFruit', 'potion'],
        favoriteFoodWeight: 3,
        requestWeights: { feed: 1, battle: 1, rest: 1, pet: 1 }
      },
      formations: { floorBossDrops: [] },
      combo: { minAffinity: 150 },
      nature: { percent: 10, bossDrops: [] },
      speciesRank: { legendaryCatchRate: 5, legendaryBonus: 1 },
      partnerSkill: { strengthPerTier: 0.25 },
      quests: { boardSize: 5, maxActive: 3 },
      // Tự động đánh: balanced trung tính để AI của test cũ không đổi.
      autoBattle: {
        tactics: {
          balanced: { damage: 1, foeEffects: 1, allyEffects: 1, penalty: 1, guard: 1 },
          allOut: { damage: 1.5, foeEffects: 0.7, allyEffects: 0.5, penalty: 1, guard: 0.3 },
          cautious: { damage: 0.8, foeEffects: 0.8, allyEffects: 1.5, penalty: 2, guard: 1.5 },
          support: { damage: 0.6, foeEffects: 1.5, allyEffects: 1.5, penalty: 1, guard: 1 },
          manual: { damage: 1, foeEffects: 1, allyEffects: 1, penalty: 1, guard: 1 }
        }
      },
      // Ngự thú sư NPC: không gặp trên tầng (encounterChance 0) để RNG của test cũ không đổi; test
      // NPC tự bật. Không đồ thưởng chung.
      trainers: {
        encounterChance: 0,
        nonWildSpeciesWeight: 0,
        offThemeClassWeight: 0,
        rewardDrops: [],
        ai: { switchRatio: 0.35, switchMinScore: 0.3 },
        gym: {
          every: 10,
          trainerCount: { min: 2, max: 2 },
          leaderClassId: FIXTURE_GYM_LEADER_ID,
          repeatRewardPercent: 25,
          firstClearItemIds: ['potion'],
          keyItemFloors: { teraOrb: 50, megaRing: 60, dynamaxBand: 70 }
        },
        tournament: {
          everyDays: 30,
          rounds: [
            { levelOffset: 0, rewardMultiplier: 2 },
            { levelOffset: 2, rewardMultiplier: 3 },
            { levelOffset: 4, rewardMultiplier: 5 }
          ],
          championRewards: [{ itemId: 'potion', count: 3 }]
        },
        arena: {
          levelPerRank: 0.5,
          milestoneEvery: 10,
          milestoneRewards: [{ itemId: 'potion', count: 1 }]
        }
      },
      // Hồn tinh (docs/rules/soul-levels.md): không rơi để RNG của test cũ không đổi.
      soulLevels: {
        percentPerLevel: 3,
        costBase: 100,
        fuseRefundPercent: 50,
        wildDrops: [],
        bossDrops: []
      },
      cooking: { expBase: 10, expPower: 2, levelBonusPercent: 1 },
      // Điểm nỗ lực (docs/rules/effort-values.md): số như dữ liệu thật.
      effort: {
        maxPerStat: 252,
        maxTotal: 510,
        percentPerPoint: 0.1,
        derivedYield: [
          { minBaseStatTotal: 0, points: 1 },
          { minBaseStatTotal: 400, points: 2 },
          { minBaseStatTotal: 500, points: 3 }
        ]
      },
      // Linh dịch (docs/rules/spirit-virus.md): tỉ lệ nhiễm / lây 0 (không tốn RNG) để test cũ không
      // đổi; test linh dịch tự bật. Hiệu ứng như dữ liệu thật.
      spiritVirus: {
        infectPercent: 0,
        spreadPercent: 0,
        minDays: 1,
        maxDays: 4,
        infectedExpPercent: 100,
        immuneExpPercent: 25,
        effortMultiplier: 2,
        genesPerWin: 1
      },
      // Âm / Dương (docs/rules/polarity.md): số như dữ liệu thật trừ tỉ lệ quái hoang / boss có cực
      // và đồ rơi (0 / rỗng để RNG của test cũ không đổi; test Âm / Dương tự bật).
      polarity: {
        statPercents: {
          yin: { hp: 5, defense: 10, spDefense: 10 },
          yang: { attack: 10, spAttack: 10, speed: 5 }
        },
        opposeBonus: 10,
        unlockFloor: 30,
        wildChance: 0,
        bossChance: 0,
        traitIds: { yin: FIXTURE_YIN_TRAIT_IDS, yang: FIXTURE_YANG_TRAIT_IDS },
        bossDrops: []
      },
      // Huyết mạch (docs/rules/bloodline.md): số như dữ liệu thật; fixture mặc định không có nhóm nào
      // (withBloodlines thêm nhóm mẫu) nên RNG của test cũ không đổi.
      bloodline: {
        wildPurityWeights: [
          { min: 0, max: 0, weight: 70 },
          { min: 1, max: 10, weight: 25 },
          { min: 11, max: 30, weight: 5 }
        ],
        bossPurityBonus: 20,
        breedDownPoints: 5,
        breedUpPoints: 8,
        atavismMutationChance: 1,
        atavismMutationPoints: 30,
        ancestorBirthChance: 0.1,
        ancestorBirthMinPurity: 50,
        essenceDropChance: 25,
        scrollDropChance: 3,
        bossKillPurity: 1,
        ancestorKillPurity: 3,
        fusePurityPercent: 50,
        sacrificePurityPercent: 25,
        mixAtFullPurity: 1,
        milestones: [25, 50, 75, 100],
        atavismCostPerLevel: 100
      },
      // Thiên phú (docs/rules/monster-talents.md): không rơi để RNG của test cũ không đổi.
      talents: { levelsPerPoint: 5, pointsPerAwakening: 1, pointsPerRebirth: 3, bossDrops: [] },
      tamerTalents: {
        pointsPerRealm: 2,
        pointsPerQuest: 1,
        pointsPerAchievementTier: 1,
        resetItemId: 'restorationPill'
      },
      // Cây thần (docs/rules/gacha.md): trọng số loài và loại trait không đổi theo tầng.
      gacha: {
        costBase: 100,
        pullOptions: [
          { count: 1, costMultiplier: 1 },
          { count: 10, costMultiplier: 9 }
        ],
        rankWeights: [1],
        traitKindWeights: { positive: 1 },
        traitKindFloorGrowth: {},
        traitKindFloorFalloff: {}
      },
      teamPresets: { slots: 2 },
      // Trao đổi với NPC (docs/rules/trades.md): luôn 2 đề nghị, chỉ yêu cầu đúng loài.
      trades: {
        refreshDays: 7,
        offerCount: { min: 2, max: 2 },
        wantWeights: { species: 1, race: 0, element: 0 },
        giveWeights: { monster: 1, item: 1 },
        wantLevelPercent: 50,
        giveRankWeights: [1],
        giveLevelOffset: 0,
        giveGeneMultiplier: 1,
        giveShinyMultiplier: 1,
        itemWeightPower: 0.5,
        expBonusPercent: 50
      },
      // Tông môn (docs/rules/sects.md): số nhỏ dễ đếm trong test.
      sects: {
        rejoinCooldownDays: 30,
        rankBase: 100,
        rankPower: 2,
        memberCount: 4,
        memberRankWeights: [1, 1],
        memberDailyContribution: { min: 10, max: 10 },
        masterRankLead: 2,
        missions: { count: 2, refreshDays: 7, contributionPerCount: 10, talentPointChance: 0 },
        duel: { perDay: 2, levelPerRank: 1, contribution: 20 },
        promotion: { levelOffset: 0, levelPerRank: 0, talentPoints: 1 },
        war: {
          everyDays: 60,
          rounds: [
            { levelOffset: 0, rewardMultiplier: 1, contribution: 30 },
            { levelOffset: 0, rewardMultiplier: 1, contribution: 50 }
          ],
          championContribution: 100,
          championTalentPoints: 2,
          championRewards: [{ itemId: 'rareCandy', count: 1 }]
        }
      },
      // Bản mệnh thú (docs/rules/tamer.md): số như dữ liệu thật.
      bond: {
        minAffinity: 200,
        resonanceMultiplier: 3,
        lifespanMultiplier: 2,
        manaCostPercent: 50,
        rebindCostPerRealm: 5000,
        rebindAffinityLoss: 100,
        rebindCooldownDays: 30,
        woundDays: 30,
        woundManaPercent: 50
      },
      soulRelic: soulRelicTestConfig(),
      // Thợ rèn (docs/rules/equipment-forge.md): số như dữ liệu thật; boss không rơi đá để RNG của
      // test cũ không đổi.
      forge: {
        enhanceStoneItemId: FIXTURE_ENHANCE_STONE_ID,
        refiningStoneItemId: FIXTURE_REFINING_STONE_ID,
        enhanceBase: 50,
        rerollCost: { common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 5, unique: 8 },
        salvageStones: { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16, unique: 30 },
        salvageRefundPercent: 50,
        salvageRefiningChance: {
          common: 2,
          uncommon: 5,
          rare: 15,
          epic: 30,
          legendary: 60,
          unique: 100
        },
        salvageSoulPoints: { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8, unique: 12 },
        bossDrops: [],
        // Luyện khí và đúc trang bị: số như dữ liệu thật.
        expBase: 10,
        expPower: 2,
        levelBonusPercent: 1,
        enhanceExp: 1,
        coreEnhance: { groupId: FIXTURE_CORE_GROUP_ID, fromLevel: 10, step: 10 },
        cast: {
          minLevel: 1,
          maxCores: 10,
          money: 200,
          exp: 10,
          rarityWeights: { common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 1 },
          coreFactor: 0.3,
          levelFactor: 0.05
        },
        // Phụ linh: fixture không có dòng linh hệ (test phụ linh tự thêm).
        imbue: {
          lineIds: {},
          cores: { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8, unique: 12 },
          money: 300,
          exp: 5
        }
      },
      itemGroups: { [FIXTURE_CORE_GROUP_ID]: [...FIXTURE_CORE_IDS] },
      // Thu phục (docs/rules/recruit.md): tỉ lệ 0 để thắng trận không tốn RNG như test cũ; test thu
      // phục tự bật tỉ lệ. Thị Uy như dữ liệu thật.
      recruit: {
        baseChance: 0,
        bossChance: 0,
        rankFalloff: 0.85,
        baitFavoriteMultiplier: 2,
        intimidate: {
          slope: 0.5,
          offset: -0.25,
          maxChance: 0.8,
          failStages: { attack: 1, spAttack: 1 }
        }
      },
      // Khu bảo tồn (docs/rules/safari-zone.md): số như dữ liệu thật.
      safari: {
        entryFeeBase: 500,
        balls: 30,
        encounters: 20,
        ballCatchMultiplier: 3,
        rotationDays: 7,
        rosterSize: 10,
        unmappedChance: 5,
        rarityWeightBase: 20,
        rarityExponent: 2,
        rankFalloff: 0.7,
        fleeBase: 10,
        fleeRarity: 20,
        lures: {
          bait: { catchMultiplier: 0.8, fleeMultiplier: 0.5, turns: 3 },
          rock: { catchMultiplier: 2, fleeMultiplier: 1.5, turns: 3 }
        }
      },
      // Hiểm địa (docs/rules/zones.md): 3 bước (bước 3 là boss canh giữ), chỉ có bước trận để
      // test đoán được; test bước khác tự đổi stepWeights.
      zones: {
        floorOffset: 0,
        steps: { min: 3, max: 3 },
        stepWeights: { battle: 1, elite: 0, treasure: 0, rareTreasure: 0, spring: 0 },
        springHealPercent: 50,
        guardianRareRolls: 2,
        cooldownDays: 3
      },
      gathering: gatheringTestConfig(),
      // Cuồng bạo (docs/rules/frenzy.md): ngưỡng 0 = không bao giờ kích hoạt để RNG / số của test cũ
      // không đổi; test cuồng bạo tự đặt số.
      frenzy: {
        roles: {
          tamed: { hpThresholdPercent: 0, statPercent: 30, extraActionChance: 25 },
          unbound: { hpThresholdPercent: 0, statPercent: 15, extraActionChance: 10 },
          wild: { hpThresholdPercent: 0, statPercent: 15, extraActionChance: 10 },
          boss: { hpThresholdPercent: 0, statPercent: 20, extraActionChance: 15 },
          worldBoss: { hpThresholdPercent: 0, statPercent: 30, extraActionChance: 0, fromTurn: 5 }
        }
      },
      // Boss thế giới (docs/rules/world-boss.md): chu kỳ rất dài (xuất hiện ở ngày 99 999) để test cũ
      // không gặp boss (việc theo ngày không tốn RNG); test boss thế giới tự đặt chu kỳ ngắn.
      worldBoss: {
        everyDays: 100_000,
        activeDays: 1,
        turns: 10,
        levelOffset: 0,
        bossMultiplier: 3,
        rankWeights: [1],
        largeWeight: 3,
        tiers: [
          {
            id: 'C',
            minHpMultiple: 0.5,
            moneyMultiple: 5,
            items: [{ itemId: 'potion', count: 1 }],
            skillBooks: 0,
            eggChance: 0
          },
          {
            id: 'S',
            minHpMultiple: 2,
            moneyMultiple: 20,
            items: [{ itemId: 'rareCandy', count: 2 }],
            skillBooks: 1,
            eggChance: 100
          }
        ]
      },
      // Khí linh (docs/rules/artifact-spirits.md): số như dữ liệu thật; đồ rơi không có dã linh,
      // boss không rơi Dẫn Hồn Châu, Khí giới bí cảnh không gặp dã linh (không tốn RNG) để RNG của test
      // cũ không đổi; test khí linh tự bật.
      artifactSpirits: {
        slots: { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, unique: 6 },
        soulRelicSlots: 6,
        levelsPerSlot: 100,
        wildPotencyPercent: 50,
        valueRanges: {
          common: { min: 1, max: 3 },
          uncommon: { min: 2, max: 5 },
          rare: { min: 3, max: 8 },
          epic: { min: 5, max: 12 },
          legendary: { min: 8, max: 18 },
          unique: { min: 10, max: 25 }
        },
        dropSpiritWeights: [1],
        gradeThresholds: [10, 25, 60, 150],
        gradeStep: 150,
        awakenGrade: 2,
        moveMoneyPerValue: 20,
        feed: {
          groupId: FIXTURE_CORE_GROUP_ID,
          coreValue: 2,
          soulValue: { common: 2, uncommon: 4, rare: 8, epic: 15, legendary: 25, unique: 40 }
        },
        breed: { days: 7 },
        summon: { orbItemId: FIXTURE_SPIRIT_ORB_ID, rarityWeights: { common: 1 } },
        orbBossDrops: [],
        itemWorld: {
          rarityFloors: { common: 1, uncommon: 3, rare: 6, epic: 10, legendary: 15, unique: 20 },
          floorsPerDepth: 0.5,
          floorsPerLevel: 0.25,
          spiritChance: 0,
          newSpiritDepthPercent: 1,
          healPercent: 50,
          leaveEvery: 10,
          breakItemId: FIXTURE_BREAK_TALISMAN_ID,
          floorRewards: [{ itemId: 'potion', count: 1 }],
          bosses: [
            { id: 'general', every: 10, multiplier: 1, bonusRolls: 1, rewards: [] },
            {
              id: 'king',
              every: 30,
              multiplier: 1.5,
              bonusRolls: 2,
              rewards: [{ itemId: 'rareCandy', count: 1 }]
            }
          ],
          bonus: { affixChance: 50, spiritValue: 5 }
        }
      },
      // Hệ thống event (docs/rules/events.md): fixture không có event nào (không tốn RNG) và thú
      // triều tỉ lệ 0 để RNG của test cũ không đổi; test event tự thêm event / bật tỉ lệ.
      events: {
        wildBattleChance: 10,
        exploreChance: 30,
        townChance: 15,
        blackMarket: {
          count: { min: 3, max: 3 },
          minItemPrice: 1,
          itemWeightPower: 0,
          extraItemIds: [],
          equipment: { weight: 0, rarityWeights: { rare: 1 }, minRollPercent: 50 },
          skillBooks: { weight: 0, reusableChance: 0 }
        },
        beastTide: {
          intervalDays: { min: 30, max: 30 },
          warningDays: 3,
          waves: { min: 2, max: 2 },
          kingAfterPercent: 50,
          kingStrength: 1.5,
          floorOffset: 0,
          strengthPerWavePercent: 10,
          lossMoneyPercent: 10,
          closedDays: 3,
          waveDrops: [],
          completion: {
            items: [{ itemId: 'potion', count: 2 }],
            pickOneItemIds: [],
            skillBooks: 0,
            egg: false
          }
        }
      },
      // Bí cảnh / tháp (docs/rules/trials.md): boss không rơi lệnh để RNG của test cũ không đổi;
      // rương chỉ có thuốc, không trang bị / sách (test rương tự bật).
      trials: {
        tokenItemId: FIXTURE_TRIAL_TOKEN_ID,
        tokenBossDrops: [],
        realm: {
          floorOffset: 1,
          battleCount: { min: 3, max: 3 },
          ruleCount: { min: 0, max: 0 },
          trainerChance: 0,
          healPercent: 50,
          chest: {
            itemRolls: 1,
            itemRollsPerBattle: 0,
            items: [{ itemId: 'potion', weight: 1, min: 2, max: 2 }],
            equipmentCount: 0,
            equipmentRarityWeights: { rare: 1 },
            skillBookCount: 0,
            reusableBookChance: 0
          }
        },
        tower: {
          ruleCount: { min: 0, max: 0 },
          floorScale: 1,
          levelOffset: 0,
          bossEvery: 5,
          floorRewards: [{ itemId: 'potion', count: 1 }],
          milestoneEvery: 10,
          milestoneRewards: [{ itemId: 'potion', count: 5 }]
        }
      },
      // Độ bất ổn tầng (docs/rules/instability.md): số như dữ liệu thật, giá đổi nhỏ cho test.
      instability: {
        floorsPerLevel: 10,
        visiblePerLevel: 1,
        hiddenPerLevel: 1,
        rewardPercentPerLevel: 25,
        rerollCostPerLevel: 100
      },
      // Thần linh (docs/rules/deities.md): ân sủng như dữ liệu thật, bậc r cần 10 × r² ân sủng.
      deities: {
        favorPerWin: 1,
        favorPerBossWin: 10,
        favorPerCapture: 3,
        incenseItemId: FIXTURE_INCENSE_ID,
        favorPerIncense: 200,
        rankBase: 10,
        rankPower: 2,
        tokenWildChance: 50,
        tokenBossChance: 100
      },
      expeditions: {
        boardMin: 3,
        boardMax: 5,
        refreshDays: 7,
        minSuccess: 0.5,
        maxSuccess: 1.5,
        expPerDayPerFloor: 10,
        injuryChance: 5,
        affinityPerDay: 1
      },
      // Động phủ (docs/rules/dwelling.md): % chỉ số gốc TB (weakling: tổng 180 → TB 30): lửa luyện,
      // nước tưới, bay vận chuyển 100% = 30; sai việc 12,5% = 3,75; chỉ số 15 = 1 đơn vị sức (lửa ở
      // level 16: 30 / 15 × 4 = sức 8).
      dwelling: {
        workStatPercents: {
          elements: {
            fire: { kindling: 100 },
            water: { watering: 100 },
            flying: { transporting: 100 }
          },
          races: {}
        },
        wrongWorkPercent: 12.5,
        powerStatUnit: 15,
        transportRatio: 0.5,
        levelExponent: 0.5,
        baseWorkSpeed: 100,
        minWorkSpeed: 10,
        condenseStacks: 4,
        condensePercent: 50,
        soulWorkSpeedPercentPerLevel: 3,
        // Đói / tinh thần như dữ liệu thật; món ăn: 'potion' (no 40) để test không cần thêm vật phẩm.
        needs: {
          max: 100,
          hungerPerDay: 30,
          sanityPerDay: 10,
          eatBelow: 70,
          starvingSanityPerDay: 20,
          starvingWorkPercent: 50,
          lowSanity: 30,
          lowSanityWorkPercent: 70,
          idleRecoveryPerDay: 50,
          nocturnalWorkPercent: 50,
          nocturnalDrainPercent: 50,
          sickSanity: 50,
          sickChanceMax: 20,
          starvingSickChance: 10,
          idleCureDays: 7,
          faintAilmentChance: 20,
          brokenPartAilmentChance: 30
        },
        foods: { potion: { fullness: 40, sanity: 0 } },
        // Quái mới không có trait làm việc (một lựa chọn số trait: không tốn RNG, test cũ không đổi);
        // tối đa 4 trait như dữ liệu thật.
        workTraits: {
          countWeights: [1, 0, 0, 0, 0],
          inheritChance: 50,
          mutationChance: 0,
          shinyTraitId: null
        },
        workerAffinity: 1,
        workerAffinityDays: 3
      },
      // Luyện đan: số như dữ liệu thật; nguyên liệu không rơi để không đổi RNG của test khác.
      alchemy: {
        expBase: 10,
        expPower: 2,
        levelBonusPercent: 1,
        raceEssenceItemIds: {},
        elementStoneItemIds: {},
        essenceChance: 0,
        stoneChance: 0,
        wildDrops: [],
        bossDrops: []
      },
      // Thiên tài địa bảo: số như dữ liệu thật, không rơi để không đổi RNG của test khác.
      treasures: {
        resistance: 0.9,
        favoriteMultiplier: 2,
        favoriteAffinity: 5,
        wildDrops: [],
        bossDrops: [],
        demonCoreItemIds: {},
        demonCoreChance: 0,
        demonCoreWildChance: 0
      },
      // Hóa hình: số như dữ liệu thật; Hóa Hình Đan là breakthroughPill, không rơi.
      humanForm: {
        minAwakening: 1,
        pillItemId: 'breakthroughPill',
        costPerLevel: 200,
        lifespanMultiplier: 1.5,
        statPercents: { hp: -10, attack: -5, defense: -10, spAttack: 15, spDefense: 10, speed: 15 },
        trueForm: { statPercentBase: 20, statPercentPerAwakening: 5 },
        dropFromFloor: 20,
        floorBossDrops: []
      },
      // Thức tỉnh: số như dữ liệu thật; Thức tỉnh đan của mọi hệ là breakthroughPill (material),
      // không rơi để không đổi RNG của test khác; Thiên Kiếp là strongling, môi trường mặc định.
      awakening: {
        statStepPercent: 10,
        lifespanMultiplier: 1.5,
        levelPerTier: 50,
        costBase: 1000,
        pillItemIds: Object.fromEntries(
          ['normal', 'fire', 'grass', 'ghost', 'water', 'flying'].map((id) => [
            id,
            'breakthroughPill'
          ])
        ),
        pillsPerTier: 1,
        milestones: [
          { tier: 1, reward: 'skill' },
          { tier: 3, reward: 'traitSlot' },
          { tier: 5, reward: 'skill' },
          { tier: 10, reward: 'traitSlot' }
        ],
        repeatEvery: 5,
        divineSkills: { fire: ['blast'], grass: ['sap'] },
        maxFailures: 5,
        injuryStatPercent: -20,
        injuryBattles: 5,
        bossDrops: [],
        floorBossDrops: [],
        bossPillChance: 0,
        floorBossPillChance: 0,
        tribulation: {
          speciesId: 'strongling',
          levelOffset: 0,
          multiplierBase: 2,
          multiplierPerTier: 0.25,
          weather: 'clear',
          terrain: 'none',
          maxTurns: 50
        }
      },
      mastery: {
        baseExp: 4,
        expPower: 2.5,
        useExp: 1,
        knockoutExp: 2,
        powerStep: 0.05,
        accuracyPerLevel: 1,
        milestones: [
          { level: 10, secondaryChancePercent: 10 },
          { level: 25, secondaryChancePercent: 10 },
          { level: 50, minHitsBonus: 1 }
        ]
      },
      moveStyles: {
        unlockMastery: 10,
        strong: {
          powerMultiplier: 1.3,
          secondaryChanceShift: 20,
          stageBonus: 1,
          statusTurnsBonus: 1,
          priorityShift: -1,
          nextTurnSpeedMultiplier: 0.7
        },
        agile: {
          powerMultiplier: 0.7,
          secondaryChanceShift: -10,
          stageBonus: 0,
          statusTurnsBonus: 0,
          priorityShift: 1,
          nextTurnSpeedMultiplier: 1.3
        }
      }
    },
    // Miễn nhiễm trạng thái theo hệ như dữ liệu thật: lửa miễn bỏng, cỏ miễn độc.
    elements: [
      { id: 'normal', effectiveness: { ghost: 0 } },
      { id: 'fire', effectiveness: { grass: 2 }, statusImmunities: ['burn'] },
      { id: 'grass', effectiveness: { fire: 0.5 }, statusImmunities: ['poison'] },
      { id: 'ghost', effectiveness: {} },
      { id: 'water', effectiveness: { fire: 2 } },
      // Hệ không chạm đất (như hệ Bay): địa hình không tác dụng.
      { id: 'flying', effectiveness: {}, airborne: true }
    ],
    // Môi trường mẫu, số tròn để tính tay. Không biome nào có môi trường tự nhiên (mặc định
    // trời quang / không địa hình, không tốn RNG); test môi trường tự thêm vào biome.
    fieldEffects: [
      { id: 'clear', layer: 'weather', hooks: [] },
      { id: 'none', layer: 'terrain', hooks: [] },
      {
        id: 'rain',
        layer: 'weather',
        duration: 5,
        hooks: [
          { type: 'elementDamageMultiplier', params: { elementIds: ['water'], multiplier: 1.5 } },
          { type: 'elementDamageMultiplier', params: { elementIds: ['fire'], multiplier: 0.5 } }
        ]
      },
      {
        id: 'sun',
        layer: 'weather',
        duration: 5,
        hooks: [
          { type: 'elementDamageMultiplier', params: { elementIds: ['fire'], multiplier: 1.5 } },
          { type: 'elementDamageMultiplier', params: { elementIds: ['water'], multiplier: 0.5 } }
        ]
      },
      {
        // Như bão cát: mất 10% max HP cuối lượt trừ hệ lửa; hệ lửa thủ đặc biệt × 1,5.
        id: 'storm',
        layer: 'weather',
        duration: 5,
        hooks: [
          { type: 'turnEndDamage', params: { percent: 10, immuneElementIds: ['fire'] } },
          {
            type: 'statMultiplier',
            params: { stat: 'spDefense', multiplier: 1.5, elementIds: ['fire'] }
          }
        ]
      },
      {
        id: 'fog',
        layer: 'weather',
        duration: 5,
        hooks: [{ type: 'accuracyMultiplier', params: { multiplier: 0.5 } }]
      },
      {
        id: 'grassy',
        layer: 'terrain',
        duration: 5,
        hooks: [
          {
            type: 'elementDamageMultiplier',
            params: { elementIds: ['grass'], multiplier: 1.5, grounded: 'attacker' }
          },
          { type: 'turnEndHeal', params: { percent: 10, grounded: true } }
        ]
      },
      {
        id: 'calm',
        layer: 'terrain',
        duration: 5,
        hooks: [{ type: 'blockStatus', params: { statusIds: ['sleep'], grounded: true } }]
      },
      {
        id: 'misty',
        layer: 'terrain',
        duration: 5,
        hooks: [
          {
            type: 'elementDamageMultiplier',
            params: { elementIds: ['normal'], multiplier: 0.5, grounded: 'defender' }
          },
          { type: 'blockStatus', params: { grounded: true } }
        ]
      }
    ],
    // Số giống balance thật; ngủ 1–3 lượt (tung), còn lại cố định.
    minions: [],
    equipmentAffixes: [],
    // Kỹ năng ngự thú sư mẫu: mỗi mục tiêu một kỹ năng, số tròn.
    tamerSkills: [
      {
        id: 'mend',
        unlockRealm: 0,
        manaCost: 20,
        cooldown: 2,
        target: 'ally',
        effects: [{ type: 'healPercent', params: { percent: 25 } }]
      },
      {
        id: 'cleanse',
        unlockRealm: 0,
        manaCost: 10,
        cooldown: 0,
        target: 'ally',
        effects: [{ type: 'cureStatus', params: {} }]
      },
      {
        id: 'cheer',
        unlockRealm: 1,
        manaCost: 25,
        cooldown: 1,
        target: 'allyOnField',
        effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 1 } }]
      },
      {
        id: 'slowFoes',
        unlockRealm: 0,
        manaCost: 30,
        cooldown: 0,
        target: 'field',
        effects: [{ type: 'sideStatStage', params: { side: 'foe', stats: ['speed'], delta: -1 } }]
      },
      {
        id: 'recall',
        unlockRealm: 0,
        manaCost: 40,
        cooldown: 0,
        usesPerBattle: 1,
        target: 'ally',
        effects: [{ type: 'revive', params: { percent: 25 } }]
      }
    ],
    tamerRealms: [{ id: 'apprentice' }, { id: 'novice' }, { id: 'master' }],
    // Phối hợp đội: fixture không có; test cộng hưởng / trận pháp / hợp kích tự thêm (teamFixtures).
    synergies: [],
    formations: [],
    comboSkills: [],
    // Tính cách mẫu: quái fixture mặc định trung tính (hardy) để test cũ không đổi chỉ số.
    natures: [
      { id: 'hardy' },
      { id: 'brave', up: 'attack', down: 'speed' },
      { id: 'modest', up: 'spAttack', down: 'attack' }
    ],
    bodyParts: fixtureBodyParts(),
    // Bậc tư chất như dữ liệu thật (docs/rules/aptitude.md).
    aptitudeTiers: [
      { id: 'mortal', from: 0 },
      { id: 'good', from: 0.3 },
      { id: 'superior', from: 0.6 },
      { id: 'refined', from: 0.9 },
      { id: 'heavenly', from: 1.2 },
      { id: 'divine', from: 2 }
    ],
    // Phẩm cấp loài mẫu (docs/rules/species-rank.md): fixture uniformStats(30) = 180 là G,
    // uniformStats(60) = 360 là E.
    // Kỹ năng đồng hành: race fixture dùng kỹ năng rỗng để test cũ không đổi (test đồng hành tự
    // thêm hiệu ứng, partner.test.ts).
    partnerSkills: [{ id: FIXTURE_PARTNER_SKILL_ID, effects: [] }],
    // Công thức luyện đan: fixture không có; test luyện đan tự thêm.
    recipes: [],
    // Mẫu nhiệm vụ: fixture không có (bảng rỗng); test nhiệm vụ tự thêm.
    quests: [],
    // Mẫu thám hiểm: fixture không có; test thám hiểm tự thêm.
    expeditions: [],
    // Công trình động phủ: chỉ Linh điền (2 ô lúc đầu, mỗi ô thêm 5000 × 2^n như dữ liệu thật);
    // test động phủ tự thêm công trình khác.
    // Trait làm việc: fixture không có (test trait làm việc tự thêm).
    workTraits: [],
    // Bệnh: fixture không có (test bệnh tự thêm).
    ailments: [],
    buildings: [
      {
        id: FIXTURE_GARDEN_BUILDING_ID,
        workType: 'farming',
        startLevel: 2,
        slotsPerLevel: 0,
        cost: { money: 5000, moneyGrowth: 2, items: [] },
        effect: { type: 'garden', plotsPerLevel: 1 }
      }
    ],
    // Ngự thú sư NPC: một lớp mọi hệ và quán chủ (docs/rules/trainers.md).
    // Luật bí cảnh: mỗi loại một luật (fixture tung 0 luật; test luật tự gán / bật ruleCount).
    // Event: fixture không có (test event tự thêm, docs/rules/events.md).
    events: [],
    eventModifiers: [],
    // Hiểm địa (docs/rules/zones.md): một hiểm địa cần tầng 1 (luôn đạt), map như `field` nhưng có
    // boss tinh anh; rương 1 Potion / 1 Master Ball.
    zones: [
      {
        id: FIXTURE_ZONE_ID,
        map: {
          doubleChance: 0,
          encounters: [{ speciesId: 'weakling', weight: 1 }],
          drops: [],
          bossDrops: [],
          bossChance: 0,
          floorBossSpeciesId: 'strongling',
          bosses: [{ speciesId: 'strongling', weight: 1, drops: [] }]
        },
        requirements: [{ type: 'minFloor', floor: 1 }],
        treasure: { rolls: 1, items: [{ itemId: 'potion', weight: 1, min: 1, max: 1 }] },
        rareTreasure: { rolls: 1, items: [{ itemId: 'masterBall', weight: 1, min: 1, max: 1 }] }
      }
    ],
    // Hiệu ứng cấy ghép (docs/rules/implant.md): hồi / mất 1% max HP mỗi lượt, giảm / tăng sát thương
    // nhận 10%.
    // Thần linh (docs/rules/deities.md): không map nào của fixture có thần (đồ rơi / RNG của test cũ
    // không đổi); test tự gán deityId cho map. Ba chúc phúc lặp lại theo bậc.
    deities: [
      {
        id: FIXTURE_DEITY_ID,
        elementId: 'fire',
        tokenItemId: FIXTURE_DEITY_TOKEN_ID,
        blessings: [
          { effects: [{ type: 'expPercent', params: { percent: 10 } }] },
          { effects: [{ type: 'elementStatPercent', params: { percent: 10 } }] },
          {
            effects: [
              { type: 'moneyPercent', params: { percent: 100 } },
              { type: 'dropRatePercent', params: { percent: 50 } },
              { type: 'catchRatePercent', params: { percent: 50 } },
              { type: 'recruitPercent', params: { percent: 100 } },
              { type: 'shinyChancePercent', params: { percent: 100 } }
            ]
          }
        ],
        shop: [
          { itemId: 'potion', price: 2, minRank: 0 },
          { itemId: 'masterBall', price: 5, minRank: 2 }
        ]
      }
    ],
    // Khí linh (docs/rules/artifact-spirits.md): Kiếm Linh +1% công mỗi value (thức tỉnh: +0,2%
    // chí mạng), Hộ Linh giảm 0,3% sát thương nhận mỗi value có softCap 200.
    artifactSpirits: [
      {
        id: FIXTURE_SPIRIT_IDS[0],
        weight: 1,
        hooks: [{ type: 'statModifier', params: { percent: { attack: 1 } } }],
        awakenedHooks: [{ type: 'critChance', params: { percent: 0.2 } }]
      },
      {
        id: FIXTURE_SPIRIT_IDS[1],
        weight: 1,
        softCap: 200,
        hooks: [{ type: 'damageTakenModifier', params: { percent: -0.3 } }],
        awakenedHooks: []
      }
    ],
    // Thành tựu và danh hiệu (docs/rules/achievements.md): thắng trận (bậc 1 / 3, rồi lặp × 2, bậc 3
    // thưởng danh hiệu), sở hữu đủ hai loài (có trần), danh hiệu đủ mọi kênh %.
    achievements: [
      {
        id: FIXTURE_ACHIEVEMENT_IDS.wins,
        condition: { type: 'stat', key: 'battlesWon' },
        tiers: [
          { value: 1, rewards: { moneyPerFloor: 100, items: [{ itemId: 'potion', count: 2 }] } },
          { value: 3, rewards: { titleId: FIXTURE_TITLE_IDS.veteran } }
        ],
        repeat: { factor: 2, rewards: { moneyPerFloor: 1000 } }
      },
      {
        id: FIXTURE_ACHIEVEMENT_IDS.pair,
        condition: { type: 'ownSpecies', speciesIds: ['weakling', 'strongling'] },
        tiers: [{ value: 2, rewards: { titleId: FIXTURE_TITLE_IDS.lucky } }]
      }
    ],
    // Tông môn mẫu (docs/rules/sects.md): hai tông đối địch nhau, buff % EXP / tiền theo chức vị.
    sects: [
      {
        id: 'sword',
        minRealm: 0,
        rankBonuses: [{ type: 'expPercent', params: { percent: 10 } }],
        trainerClassIds: [FIXTURE_TRAINER_ID],
        shop: [
          { itemId: 'potion', cost: 10, minRank: 0 },
          { itemId: 'rareCandy', cost: 50, minRank: 1 },
          { skillId: 'strike', reusable: false, cost: 40, minRank: 0 },
          { skillId: 'strike', reusable: true, cost: 300, minRank: 2 }
        ],
        rivalSectIds: ['beast']
      },
      {
        id: 'beast',
        minRealm: 2,
        rankBonuses: [{ type: 'moneyPercent', params: { percent: 5 } }],
        trainerClassIds: [FIXTURE_TRAINER_ID],
        shop: [],
        rivalSectIds: ['sword']
      }
    ],
    sectRanks: [{ id: 'outer' }, { id: 'inner' }, { id: 'elder' }],
    npcNames: [{ id: 'linFeng' }, { id: 'yeXue' }, { id: 'xiaoHao' }],
    titles: [
      {
        id: FIXTURE_TITLE_IDS.veteran,
        effects: [{ type: 'expPercent', params: { percent: 50 } }]
      },
      {
        id: FIXTURE_TITLE_IDS.lucky,
        effects: [
          { type: 'moneyPercent', params: { percent: 100 } },
          { type: 'dropRatePercent', params: { percent: 100 } },
          { type: 'catchRatePercent', params: { percent: 100 } },
          { type: 'recruitPercent', params: { percent: 100 } },
          { type: 'shinyChancePercent', params: { percent: 100 } },
          { type: 'alchemySuccessPercent', params: { percent: 20 } }
        ]
      }
    ],
    serumEffects: [
      {
        id: 'regeneration',
        weight: 1,
        hooks: [{ type: 'regen', params: { percent: 1 } }],
        failHooks: [{ type: 'regen', params: { percent: -1 } }]
      },
      {
        id: 'hardening',
        weight: 1,
        hooks: [{ type: 'damageTakenModifier', params: { percent: -10 } }],
        failHooks: [{ type: 'damageTakenModifier', params: { percent: 10 } }]
      }
    ],
    trialRules: [
      { id: 'noItems', type: 'noItems', params: {}, weight: 1, instability: unstable(5) },
      { id: 'monoElement', type: 'monoElement', params: {}, weight: 1 },
      {
        id: 'rainField',
        type: 'fixedField',
        params: { weather: 'rain' },
        weight: 1,
        instability: unstable(0)
      },
      { id: 'bossOnly', type: 'bossOnly', params: {}, weight: 1 },
      { id: 'noTransforms', type: 'noTransforms', params: {}, weight: 1 },
      { id: 'noTamerSkills', type: 'noTamerSkills', params: {}, weight: 1 },
      {
        id: 'enemyDouble',
        type: 'enemyMultiplier',
        params: { value: 2 },
        weight: 1,
        instability: unstable(20)
      },
      { id: 'noHealing', type: 'noHealing', params: {}, weight: 1 },
      // Thuộc tính chỉ dành cho độ bất ổn (weight 0: không đổi RNG tung luật bí cảnh của test cũ).
      {
        id: 'enemyRegen',
        type: 'sideHooks',
        params: { side: 'enemy', hooks: [{ type: 'regen', params: { percent: 10 } }] },
        weight: 0,
        instability: unstable(10)
      },
      {
        id: 'playerSlow',
        type: 'sideHooks',
        params: {
          side: 'player',
          hooks: [{ type: 'statModifier', params: { percent: { speed: -10 } } }]
        },
        weight: 0,
        instability: unstable(10)
      },
      {
        id: 'playerNoCrit',
        type: 'sideHooks',
        params: { side: 'player', hooks: [{ type: 'cannotCrit', params: {} }] },
        weight: 0,
        instability: unstable(10)
      },
      {
        id: 'extraTrait',
        type: 'extraEnemyTraits',
        params: { count: 1 },
        weight: 0,
        instability: unstable(10)
      },
      {
        id: 'fusedWild',
        type: 'fusedEnemies',
        params: { percent: 100 },
        weight: 0,
        instability: unstable(10)
      },
      {
        id: 'foreignWild',
        type: 'foreignSpecies',
        params: { percent: 100 },
        weight: 0,
        instability: unstable(10)
      }
    ],
    trainers: [
      {
        id: FIXTURE_TRAINER_ID,
        kind: 'regular',
        elementIds: [],
        teamSize: { min: 2, max: 3 },
        levelOffset: 0,
        rewardMultiplier: 2,
        tamerRealmOffset: 0,
        tamerSkillIds: ['mend'],
        aiProfile: 'standard',
        equipmentSlots: 0,
        transforms: false,
        formationIds: []
      },
      {
        id: FIXTURE_GYM_LEADER_ID,
        kind: 'gymLeader',
        elementIds: [],
        teamSize: { min: 3, max: 3 },
        levelOffset: 5,
        rewardMultiplier: 5,
        tamerRealmOffset: 0,
        tamerSkillIds: ['mend'],
        aiProfile: 'switcher',
        equipmentSlots: 0,
        transforms: false,
        formationIds: []
      }
    ],
    bloodlines: [],
    speciesRanks: [
      { id: 'G', from: 0 },
      { id: 'F', from: 200 },
      { id: 'E', from: 300 },
      { id: 'S', from: 500 },
      { id: 'X', from: 600 }
    ],
    // Thiên phú mẫu (docs/rules/monster-talents.md): nhánh chung `offense` và nhánh race `bruteArts`
    // (chỉ race brute); quái fixture mặc định chưa nâng nút nào nên test cũ không đổi.
    talentBranches: [{ id: 'offense' }, { id: 'bruteArts', raceIds: ['brute'] }],
    talents: [
      {
        id: 'might',
        branchId: 'offense',
        costPerRank: 1,
        hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }]
      },
      {
        id: 'keenEye',
        branchId: 'offense',
        requires: { might: 2 },
        maxRank: 2,
        costPerRank: 2,
        hooks: [{ type: 'critChance', params: { percent: 5 } }]
      },
      {
        id: 'bruteRage',
        branchId: 'bruteArts',
        costPerRank: 1,
        hooks: [{ type: 'statModifier', params: { percent: { attack: 5 } } }]
      }
    ],
    // Thiên phú ngự thú sư mẫu (docs/rules/tamer-talents.md): đủ mọi kênh thưởng để test từng nơi
    // dùng; game fixture mặc định chưa nâng nút nào nên test cũ không đổi.
    tamerTalentBranches: [{ id: 'taming' }, { id: 'capture' }, { id: 'commerce' }],
    tamerTalents: [
      {
        id: 'drill',
        branchId: 'taming',
        costPerRank: 1,
        effects: [{ type: 'teamStatPercent', params: { percent: 10 } }]
      },
      {
        id: 'focus',
        branchId: 'taming',
        maxRank: 3,
        costPerRank: 1,
        effects: [{ type: 'manaPercent', params: { percent: 50 } }]
      },
      {
        id: 'haste',
        branchId: 'taming',
        requires: { focus: 1 },
        maxRank: 2,
        costPerRank: 1,
        effects: [{ type: 'tamerSkillCooldown', params: { turns: 1 } }]
      },
      {
        id: 'charm',
        branchId: 'capture',
        costPerRank: 1,
        effects: [
          { type: 'catchRatePercent', params: { percent: 10 } },
          { type: 'recruitPercent', params: { percent: 10 } },
          { type: 'shinyChancePercent', params: { percent: 100 } },
          { type: 'contractLevelPercent', params: { percent: 50 } }
        ]
      },
      {
        id: 'trade',
        branchId: 'commerce',
        costPerRank: 1,
        effects: [
          { type: 'expPercent', params: { percent: 10 } },
          { type: 'moneyPercent', params: { percent: 10 } },
          { type: 'dropRatePercent', params: { percent: 10 } },
          { type: 'shopPricePercent', params: { percent: -10 } },
          { type: 'dwellingOutputPercent', params: { percent: 50 } },
          { type: 'alchemySuccessPercent', params: { percent: 10 } },
          { type: 'smithingSuccessPercent', params: { percent: 10 } },
          { type: 'cookingSuccessPercent', params: { percent: 10 } }
        ]
      }
    ],
    // Mức thân mật mẫu: quái fixture mặc định thân mật 0 (mức stranger, không hook).
    affinityTiers: [
      { id: 'stranger', from: 0, hooks: [] },
      {
        id: 'familiar',
        from: 100,
        hooks: [{ type: 'expRewardModifier', params: { percent: 10 } }]
      },
      {
        id: 'bonded',
        from: 200,
        hooks: [
          { type: 'expRewardModifier', params: { percent: 20 } },
          { type: 'surviveLethal', params: { fromFullHp: false, chance: 100, exceptFullHp: true } }
        ]
      }
    ],
    statuses: [
      {
        id: 'poison',
        kind: 'debuff',
        duration: { min: 4, max: 4 },
        hooks: [{ type: 'turnEndDamage', params: { percent: 10 } }]
      },
      {
        id: 'burn',
        kind: 'debuff',
        duration: { min: 3, max: 3 },
        hooks: [
          { type: 'turnEndDamage', params: { percent: 6.25 } },
          { type: 'damageDealtMultiplier', params: { category: 'physical', multiplier: 0.5 } }
        ]
      },
      {
        id: 'paralysis',
        kind: 'debuff',
        duration: { min: 3, max: 3 },
        hooks: [
          { type: 'skipTurn', params: { chance: 25 } },
          { type: 'statMultiplier', params: { stat: 'speed', multiplier: 0.5 } }
        ]
      },
      {
        id: 'sleep',
        kind: 'debuff',
        duration: { min: 1, max: 3 },
        hooks: [{ type: 'skipTurn', params: { chance: 100 } }]
      }
    ],
    races: [
      {
        id: 'neutral',
        groupId: 'neutralGroup',
        statBias: uniformStats(1),
        growth: uniformStats(0.1),
        breedsWith: ['neutral'],
        traitIds: [FIXTURE_RACE_TRAIT_ID],
        partnerSkillId: FIXTURE_PARTNER_SKILL_ID,
        humanForm: true
      },
      {
        id: 'brute',
        groupId: 'bruteGroup',
        statBias: { ...uniformStats(1), attack: 1.5, speed: 0.5 },
        growth: { ...uniformStats(0.1), attack: 0.2 },
        // brute breed được với neutral (một chiều cũng đủ); cùng race luôn breed được.
        breedsWith: ['neutral'],
        traitIds: [FIXTURE_RACE_TRAIT_ID],
        partnerSkillId: FIXTURE_PARTNER_SKILL_ID,
        // Race "vốn hình người": không hóa hình (docs/rules/human-form.md).
        humanForm: false
      }
    ],
    species: [
      {
        kind: 'normal',
        id: 'weakling',
        raceId: 'neutral',
        elementIds: ['grass'],
        baseStats: uniformStats(30),
        evolutions: [{ speciesId: 'strongling', level: 10 }],
        learnset: [
          { level: 1, skillId: 'strike' },
          { level: 1, skillId: 'growl' },
          { level: 5, skillId: 'blast' },
          { level: 8, skillId: 'pumpUp' },
          { level: 12, skillId: 'sap' }
        ],
        catchRate: 50,
        lifespan: 100
      },
      {
        kind: 'normal',
        id: 'strongling',
        raceId: 'neutral',
        elementIds: ['fire'],
        baseStats: uniformStats(60),
        evolutions: [],
        learnset: [
          { level: 1, skillId: 'strike' },
          { level: 1, skillId: 'wave' }
        ],
        catchRate: 20,
        lifespan: 100
      },
      {
        // Loài mẫu cho tiến hóa: 2 nhánh chỉ cần level (cùng level 5) + 1 nhánh cần đá lửa.
        kind: 'normal',
        id: 'twig',
        raceId: 'neutral',
        elementIds: ['grass'],
        baseStats: uniformStats(20),
        evolutions: [
          { speciesId: 'oak', level: 5 },
          { speciesId: 'pine', level: 5 },
          { speciesId: 'cinder', level: 3, itemId: 'fireStone' }
        ],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 50,
        lifespan: 100
      },
      {
        kind: 'normal',
        id: 'oak',
        raceId: 'neutral',
        elementIds: ['grass'],
        baseStats: uniformStats(40),
        evolutions: [],
        learnset: [
          { level: 1, skillId: 'strike' },
          { level: 1, skillId: 'growl' },
          { level: 2, skillId: 'blast' },
          { level: 3, skillId: 'pumpUp' },
          { level: 4, skillId: 'sap' },
          { level: 50, skillId: 'quick' }
        ],
        catchRate: 30,
        lifespan: 100
      },
      {
        kind: 'normal',
        id: 'pine',
        raceId: 'neutral',
        elementIds: ['grass'],
        baseStats: uniformStats(40),
        evolutions: [],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 30,
        lifespan: 100
      },
      {
        kind: 'normal',
        id: 'cinder',
        raceId: 'neutral', // cùng race với twig (test tiến hóa đổi race tự sửa race)
        elementIds: ['fire'],
        baseStats: uniformStats(40),
        evolutions: [],
        learnset: [{ level: 1, skillId: 'blast' }],
        catchRate: 30,
        lifespan: 100
      },
      {
        kind: 'normal',
        id: 'brawler',
        raceId: 'brute',
        elementIds: ['fire'],
        baseStats: uniformStats(40),
        evolutions: [],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 30,
        lifespan: 100
      },
      {
        // Loài không giới tính tiến hóa thành loài có giới tính (tung 50/50 lúc tiến hóa).
        kind: 'normal',
        id: 'pebble',
        raceId: 'neutral',
        elementIds: ['normal'],
        baseStats: uniformStats(30),
        evolutions: [{ speciesId: 'boulder', level: 10 }],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 50,
        lifespan: 100,
        genderless: true,
        origin: 'myth',
        source: 'testLore'
      },
      {
        kind: 'normal',
        id: 'boulder',
        raceId: 'neutral',
        elementIds: ['normal'],
        baseStats: uniformStats(50),
        evolutions: [],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 30,
        lifespan: 100,
        origin: 'myth',
        source: 'testLore'
      },
      {
        // Loài có giới tính tiến hóa thành loài không giới tính.
        kind: 'normal',
        id: 'nymph',
        raceId: 'neutral',
        elementIds: ['grass'],
        baseStats: uniformStats(30),
        evolutions: [{ speciesId: 'husk', level: 10 }],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 50,
        lifespan: 100,
        origin: 'living'
      },
      {
        kind: 'normal',
        id: 'husk',
        raceId: 'neutral',
        elementIds: ['grass'],
        baseStats: uniformStats(50),
        evolutions: [],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 30,
        lifespan: 100,
        genderless: true,
        origin: 'living'
      },
      {
        // Một dạng của weakling (chưa dùng trong luật chơi, chỉ để kiểm tra dữ liệu).
        kind: 'normal',
        id: 'megaWeakling',
        raceId: 'neutral',
        elementIds: ['grass'],
        baseStats: uniformStats(45),
        evolutions: [],
        learnset: [{ level: 1, skillId: 'strike' }],
        catchRate: 10,
        formOf: 'weakling',
        formKind: 'mega'
      },
      { kind: 'fused', id: 'fused' }
    ],
    traits: [
      {
        id: 'fast',
        kind: 'positive',
        exclusiveGroup: 'speed',
        hooks: [{ type: 'statModifier', params: { percent: { speed: 50 } } }]
      },
      {
        id: 'slow',
        kind: 'negative',
        exclusiveGroup: 'speed',
        hooks: [{ type: 'statModifier', params: { percent: { speed: -50 } } }]
      },
      {
        id: 'armored',
        kind: 'positive',
        hooks: [{ type: 'statModifier', params: { flat: { defense: 10 } } }]
      },
      {
        id: 'mighty',
        kind: 'positive',
        hooks: [{ type: 'statModifier', params: { flat: { attack: 10 }, percent: { attack: 50 } } }]
      },
      {
        id: 'cursed',
        kind: 'negative',
        hooks: [{ type: 'statModifier', params: { percent: { hp: -90 } } }]
      },
      {
        id: 'bruteSlayer',
        kind: 'rare',
        hooks: [{ type: 'damageVsRace', params: { raceIds: ['brute'], percent: 50 } }]
      },
      {
        id: 'thickSkin',
        kind: 'rare',
        hooks: [{ type: 'damageTakenModifier', params: { percent: -50 } }]
      },
      {
        id: 'regen',
        kind: 'rare',
        hooks: [{ type: 'regen', params: { percent: 10 } }]
      },
      {
        id: 'friendly',
        kind: 'rare',
        hooks: [{ type: 'catchRateModifier', params: { percent: 50 } }]
      },
      {
        id: 'shiny',
        kind: 'shiny',
        hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }]
      },
      {
        id: 'bossBlood',
        kind: 'boss',
        hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }]
      },
      {
        id: 'immunity',
        kind: 'rare',
        hooks: [{ type: 'statusImmunity', params: { statusIds: ['poison', 'sleep'] } }]
      },
      // Trait cực tính (docs/rules/polarity.md): Âm hai trait, Dương một trait.
      {
        id: FIXTURE_YIN_TRAIT_IDS[0],
        kind: 'polarity',
        hooks: [{ type: 'statusImmunity', params: { statusIds: ['sleep'] } }]
      },
      {
        id: FIXTURE_YIN_TRAIT_IDS[1],
        kind: 'polarity',
        hooks: [{ type: 'statModifier', params: { percent: { hp: 20 } } }]
      },
      {
        id: FIXTURE_YANG_TRAIT_IDS[0],
        kind: 'polarity',
        hooks: [{ type: 'elementDamageDealt', params: { elementIds: ['fire'], percent: 15 } }]
      },
      // Trait race dùng chung cho mọi race fixture, cố ý không có tác dụng để test khác không
      // phải tính tới trait race; test trait race tự thêm trait có tác dụng.
      {
        id: FIXTURE_RACE_TRAIT_ID,
        kind: 'race',
        hooks: [{ type: 'fuseChanceBonus', params: { points: 0 } }]
      }
    ],
    skills: [
      skill({ id: 'strike' }),
      skill({ id: 'quick', power: 10, priority: 1 }),
      skill({ id: 'shaky', accuracy: 50 }),
      skill({ id: 'blast', elementId: 'fire', category: 'special' }),
      skill({ id: 'wave', category: 'special', power: 40, target: 'allEnemies' }),
      skill({
        id: 'sap',
        elementId: 'grass',
        category: 'special',
        effects: [{ type: 'drain', params: { percent: 50 } }]
      }),
      skill({
        id: 'growl',
        category: 'status',
        power: 0,
        target: 'allEnemies',
        effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }]
      }),
      skill({
        id: 'pumpUp',
        category: 'status',
        power: 0,
        target: 'self',
        effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 2 } }]
      }),
      skill({ id: 'idle', category: 'status', power: 0, target: 'self' }),
      // Đánh nhiều lần: 2–5 theo bảng hitCountWeights, 2–4 chia đều, cố định 2 / 3 đòn.
      skill({ id: 'flurry', power: 20, hits: { min: 2, max: 5 } }),
      skill({ id: 'barrage', power: 20, hits: { min: 2, max: 4 } }),
      skill({
        id: 'twinFang',
        power: 20,
        hits: { min: 2, max: 2 },
        effects: [{ type: 'drain', params: { percent: 50 } }]
      }),
      skill({
        id: 'scaleShot',
        power: 20,
        hits: { min: 3, max: 3 },
        effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 1 } }]
      }),
      skill({
        id: 'cheer',
        category: 'status',
        power: 0,
        target: 'ally',
        effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: 1 } }]
      }),
      // Gây trạng thái: chắc chắn (toxin, hypnosis) hoặc theo tỉ lệ (sting: đánh kèm 30% độc).
      skill({
        id: 'toxin',
        category: 'status',
        power: 0,
        effects: [{ type: 'applyStatus', params: { statusId: 'poison' } }]
      }),
      skill({
        id: 'hypnosis',
        category: 'status',
        power: 0,
        effects: [{ type: 'applyStatus', params: { statusId: 'sleep', chance: 100 } }]
      }),
      skill({
        id: 'sting',
        power: 20,
        hits: { min: 2, max: 2 },
        effects: [{ type: 'applyStatus', params: { statusId: 'poison', chance: 30 } }]
      }),
      // Biến hình: Tera Blast, chiêu Max mỗi hệ (power / loại thay theo skill gốc lúc dùng), Max Guard.
      skill({ id: 'teraBlast', category: 'special', power: 80, teraBlast: true }),
      skill({
        id: 'maxStrike',
        power: 100,
        maxMove: 'max',
        effects: [{ type: 'sideStatStage', params: { side: 'foe', stats: ['speed'], delta: -1 } }]
      }),
      skill({ id: 'maxFlare', elementId: 'fire', power: 100, maxMove: 'max' }),
      skill({
        id: 'maxOvergrowth',
        elementId: 'grass',
        power: 100,
        maxMove: 'max',
        effects: [{ type: 'setField', params: { layer: 'terrain', fieldId: 'grassy' } }]
      }),
      skill({ id: 'maxPhantasm', elementId: 'ghost', power: 100, maxMove: 'max' }),
      skill({
        id: 'maxGeyser',
        elementId: 'water',
        power: 100,
        maxMove: 'max',
        effects: [{ type: 'setField', params: { layer: 'weather', fieldId: 'rain' } }]
      }),
      skill({
        id: 'maxAirstream',
        elementId: 'flying',
        power: 100,
        maxMove: 'max',
        effects: [{ type: 'sideStatStage', params: { side: 'ally', stats: ['speed'], delta: 1 } }]
      }),
      skill({
        id: 'maxGuard',
        category: 'status',
        power: 0,
        priority: 4,
        target: 'self',
        maxMove: 'guard',
        effects: [{ type: 'protect', params: { consecutiveChanceDivisor: 3 } }]
      })
    ],
    items: [
      {
        id: 'potion',
        category: 'consumable',
        price: 50,
        shop: true,
        shopWeight: 100,
        use: 'both',
        target: 'ally',
        effects: [{ type: 'healPercent', params: { percent: 50 } }]
      },
      // Món ăn dưỡng dục không hiệu ứng (không bán, để không đổi hàng cửa hàng của test cũ).
      {
        id: 'spiritFruit',
        category: 'consumable',
        price: 50,
        use: 'field',
        target: 'ally',
        effects: []
      },
      {
        id: 'revive',
        category: 'consumable',
        price: 300,
        use: 'both',
        target: 'ally',
        effects: [{ type: 'revive', params: { percent: 50 } }]
      },
      {
        id: 'genderPotion',
        category: 'consumable',
        price: 300,
        use: 'field',
        target: 'ally',
        effects: [{ type: 'swapGender', params: {} }]
      },
      // Tính cách (docs/rules/natures.md): Bạc Hà đổi sang brave, Bất Biến Thạch truyền khi breed.
      {
        id: 'mintBrave',
        category: 'consumable',
        price: 1000,
        use: 'field',
        target: 'ally',
        effects: [{ type: 'setNature', params: { natureId: 'brave' } }]
      },
      // Đá chuyển cực (docs/rules/polarity.md).
      ...POLARITY_CHANGES.map((change) => ({
        id: FIXTURE_POLARITY_STONE_IDS[change],
        category: 'consumable' as const,
        price: 3000,
        use: 'field' as const,
        target: 'ally' as const,
        effects: [{ type: 'setPolarity', params: { change } }]
      })),
      // Hoàn Nguyên Đan (docs/rules/tamer-talents.md): tẩy thiên phú ngự thú sư.
      { id: 'restorationPill', category: 'material', price: 5000 },
      // Vong Ưu Thủy (docs/rules/monster-talents.md): tẩy thiên phú.
      {
        id: 'forgetWater',
        category: 'consumable',
        price: 500,
        use: 'field',
        target: 'ally',
        effects: [{ type: 'resetTalents', params: {} }]
      },
      {
        id: 'everstone',
        category: 'held',
        price: 500,
        hooks: [{ type: 'inheritNature', params: {} }],
        persistent: true
      },
      {
        id: 'antidote',
        category: 'consumable',
        price: 100,
        shop: true,
        shopWeight: 50,
        use: 'both',
        target: 'ally',
        effects: [{ type: 'cureStatus', params: { statusIds: ['poison'] } }]
      },
      {
        id: 'fullHeal',
        category: 'consumable',
        price: 400,
        use: 'both',
        target: 'ally',
        effects: [{ type: 'cureStatus', params: {} }]
      },
      // Vật phẩm ném: chắc trúng (poisonBomb) và chắc trượt (dudBomb).
      {
        id: 'poisonBomb',
        category: 'consumable',
        price: 150,
        use: 'battle',
        target: 'enemy',
        effects: [{ type: 'applyStatus', params: { statusId: 'poison', chance: 100 } }]
      },
      {
        id: 'dudBomb',
        category: 'consumable',
        price: 1,
        use: 'battle',
        target: 'enemy',
        effects: [{ type: 'applyStatus', params: { statusId: 'sleep', chance: 0 } }]
      },
      // Kẹo EXP và Kẹo Hiếm: không bán, không rơi để không đổi test khác.
      {
        id: 'expCandyS',
        category: 'consumable',
        price: 3200,
        use: 'field',
        target: 'ally',
        effects: [{ type: 'addExp', params: { baseExp: 800 } }]
      },
      {
        id: 'rareCandy',
        category: 'consumable',
        price: 5000,
        use: 'field',
        target: 'ally',
        effects: [{ type: 'levelUp', params: { levels: 1 } }]
      },
      { id: 'fireStone', category: 'evolutionStone', price: 500, fixedPrice: true },
      { id: 'ball', category: 'ball', price: 20, shop: true, shopWeight: 100, catchMultiplier: 1 },
      {
        id: 'masterBall',
        category: 'ball',
        price: 999,
        catchMultiplier: 1000
      },
      { id: 'traitCrystal', category: 'traitCrystal' },
      { id: 'skillBook', category: 'skillBook' },
      // Nguyên liệu đột phá: không bán để không đổi danh sách hàng của test khác.
      { id: 'breakthroughPill', category: 'material', price: 100 },
      { id: 'rebirthPill', category: 'material', price: 5000 },
      // Bí Cảnh Lệnh (docs/rules/trials.md): không bán ở cửa hàng để hàng của test cũ không đổi.
      { id: FIXTURE_TRIAL_TOKEN_ID, category: 'material', price: 100 },
      // Hồn tinh: không bán, không rơi (bảng rơi rỗng) để RNG / hàng của test cũ không đổi.
      { id: FIXTURE_SOUL_SMALL_ID, category: 'soulCrystal', price: 10, points: 1 },
      // Hương nến và tín vật (docs/rules/deities.md): không bán để hàng của test cũ không đổi.
      { id: FIXTURE_INCENSE_ID, category: 'material', price: 100 },
      { id: FIXTURE_DEITY_TOKEN_ID, category: 'material', price: 10 },
      // Dẫn Hồn Châu, Phá Giới Phù (docs/rules/artifact-spirits.md): không bán.
      { id: FIXTURE_SPIRIT_ORB_ID, category: 'material', price: 100 },
      { id: FIXTURE_BREAK_TALISMAN_ID, category: 'material', price: 100 },
      // Đá của Thợ rèn: không bán để hàng của test cũ không đổi.
      { id: FIXTURE_ENHANCE_STONE_ID, category: 'material', price: 100 },
      { id: FIXTURE_REFINING_STONE_ID, category: 'material', price: 1500 },
      // Yêu đan của nhóm FIXTURE_CORE_GROUP_ID (ăn được như dữ liệu thật): không bán.
      ...FIXTURE_CORE_IDS.map((id) => ({
        id,
        category: 'consumable' as const,
        price: 500,
        use: 'field' as const,
        target: 'ally' as const,
        effects: [{ type: 'addGenesTopStat', params: { amount: 5 } }]
      })),
      { id: FIXTURE_SOUL_LARGE_ID, category: 'soulCrystal', price: 50, points: 5 },
      // Bùa fuse: không bán ở cửa hàng để không đổi danh sách hàng của test khác.
      // Vật phẩm chìa khóa và Mảnh Tera (mỗi hệ + Stellar) của biến hình.
      { id: 'megaRing', category: 'keyItem' },
      { id: 'dynamaxBand', category: 'keyItem' },
      { id: 'teraOrb', category: 'keyItem' },
      { id: 'zRing', category: 'keyItem' },
      ...['normal', 'fire', 'grass', 'ghost', 'water', 'flying', STELLAR].map(
        (elementId): Item => ({
          id: `${elementId}TeraShard`,
          category: 'teraShard',
          price: 100,
          elementId
        })
      ),
      {
        id: 'fusionCharm',
        category: 'fusionAid',
        price: 2000,
        effects: [{ type: 'fuseChanceBonus', params: { points: 10 } }]
      },
      {
        id: 'fusionAmulet',
        category: 'fusionAid',
        price: 10000,
        effects: [{ type: 'fuseProtect', params: {} }]
      },
      ...soulRelicTestItems(),
      ...gatheringTestItems()
    ],
    // Thứ tự = tầng: field = tầng 1 (level 1), lair = tầng 2 (level 3, boss tầng level 4),
    // pairs = tầng 3 (level 5). Tầng 4 quay lại field.
    biomes: [
      {
        id: 'field',
        doubleChance: 0,
        encounters: [{ speciesId: 'weakling', weight: 1 }],
        drops: [{ itemId: 'potion', chance: 100 }],
        bossDrops: [],
        floorBossSpeciesId: 'strongling',
        bosses: [{ speciesId: 'strongling', drops: [{ itemId: 'masterBall', chance: 100 }] }],
        // Câu cá / khai thác (docs/rules/gathering.md); quái và bảng vật phẩm ở config.gathering.
        gathering: { fishing: true, mining: true }
      },
      {
        id: 'lair',
        doubleChance: 0,
        encounters: [{ speciesId: 'weakling', weight: 1 }],
        drops: [{ itemId: 'potion', chance: 100 }],
        bossChance: 100,
        bossMultiplierMin: 3,
        bossMultiplierMax: 3,
        bossDrops: [],
        floorBossSpeciesId: 'strongling',
        bosses: [
          { speciesId: 'strongling', weight: 1, drops: [{ itemId: 'masterBall', chance: 100 }] }
        ]
      },
      {
        id: 'pairs',
        doubleChance: 100,
        encounters: [{ speciesId: 'weakling', weight: 1 }],
        drops: [],
        bossDrops: [],
        floorBossSpeciesId: 'weakling',
        bosses: [{ speciesId: 'weakling', drops: [] }]
      }
    ]
  }
  // Mỗi race fixture một nhóm riêng (mặc định như race, không trait nhóm, không breed chéo nhóm).
  const raceGroups = content.races.map((race) => ({
    id: race.groupId,
    statBias: race.statBias ?? uniformStats(1),
    growth: race.growth ?? uniformStats(0.1),
    traitIds: [],
    breedsWith: [],
    partnerSkillId: race.partnerSkillId ?? FIXTURE_PARTNER_SKILL_ID,
    humanForm: race.humanForm ?? true
  }))
  const withGroups = { ...content, raceGroups }
  return { ...withGroups, text: fixtureText(withGroups) }
}

/**
 * Chữ nội dung cho fixture: tiếng Việt = id, tiếng Anh = id + "-en" (tên không trùng, dễ đoán
 * trong test). Ngôn ngữ mặc định "vi".
 */
/**
 * Bộ phận ra đòn của fixture: số như dữ liệu thật (bodyParts.json), hiệu ứng chỉ dùng trạng thái có
 * trong fixture (đầu: tê liệt thay cho flinch, phá đầu: −1 bậc chính xác; cánh: không có hiệu ứng).
 */
const fixtureBodyParts = (): BodyPartDef[] => [
  {
    id: 'head',
    accuracyPercent: -25,
    damagePercent: 0,
    critStage: 1,
    hitEffects: [{ type: 'applyStatus', params: { statusId: 'paralysis', chance: 10 } }],
    breakPercent: 30,
    breakEffects: [{ type: 'statStage', params: { who: 'target', stat: 'accuracy', delta: -1 } }],
    breakDropPercent: 25,
    knockoutCorePercent: -50
  },
  {
    id: 'torso',
    accuracyPercent: 0,
    damagePercent: 0,
    critStage: 0,
    hitEffects: [],
    breakPercent: 50,
    breakEffects: [{ type: 'statStage', params: { who: 'target', stat: 'defense', delta: -1 } }],
    breakDropPercent: 25,
    knockoutCorePercent: 0
  },
  {
    id: 'arms',
    accuracyPercent: -10,
    damagePercent: -10,
    critStage: 0,
    hitEffects: [
      { type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1, chance: 20 } }
    ],
    breakPercent: 30,
    breakEffects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: -2 } }],
    breakDropPercent: 25,
    knockoutCorePercent: 0
  },
  {
    id: 'legs',
    accuracyPercent: -10,
    damagePercent: -10,
    critStage: 0,
    hitEffects: [
      { type: 'statStage', params: { who: 'target', stat: 'speed', delta: -1, chance: 20 } }
    ],
    breakPercent: 30,
    breakEffects: [{ type: 'statStage', params: { who: 'target', stat: 'speed', delta: -2 } }],
    breakDropPercent: 25,
    knockoutCorePercent: 0
  },
  {
    id: 'wings',
    accuracyPercent: -15,
    damagePercent: -10,
    critStage: 0,
    hitEffects: [],
    breakPercent: 25,
    breakEffects: [],
    breakDropPercent: 25,
    knockoutCorePercent: 0
  },
  {
    id: 'tail',
    accuracyPercent: -15,
    damagePercent: -10,
    critStage: 0,
    hitEffects: [
      { type: 'statStage', params: { who: 'target', stat: 'evasion', delta: -1, chance: 20 } }
    ],
    breakPercent: 25,
    breakEffects: [{ type: 'statStage', params: { who: 'target', stat: 'evasion', delta: -1 } }],
    breakDropPercent: 50,
    knockoutCorePercent: 0
  }
]

export function fixtureText(content: Omit<RawGameData, 'text'>): TextData {
  const names = (suffix: string): ContentText => {
    const text = {} as ContentText
    for (const kind of CONTENT_KINDS) {
      // Hợp kích kỹ nằm chung chỉ mục skill nên tên ở loại skills.
      const entries: readonly { id: string }[] =
        kind === 'skills' ? [...content.skills, ...content.comboSkills] : content[kind]
      text[kind] = Object.fromEntries(entries.map((entry) => [entry.id, `${entry.id}${suffix}`]))
    }
    return text
  }
  return {
    defaultLanguage: 'vi',
    languages: {
      vi: { name: 'Tiếng Việt', content: names('') },
      en: { name: 'English', content: names('-en') }
    }
  }
}

/** Tạo lại chữ cho raw sau khi test thêm / bớt nội dung (để kiểm tra chữ không báo lỗi). */
export function withFixtureText(raw: RawGameData): RawGameData {
  return { ...raw, text: fixtureText(raw) }
}

export function makeData(): GameData {
  return createGameData(makeRawData())
}

/** Đổi bộ chỉ số number (hoặc trộn number / Decimal) sang Decimal. */
export function toBigStats(stats: Readonly<Record<StatName, BigValue>>): BigStats {
  const result = {} as BigStats
  for (const stat of STAT_NAMES) result[stat] = toBig(stats[stat])
  return result
}

/** Ghi đè cho makeMonster: trường Decimal nhận cả number cho tiện viết test. */
export type MonsterOverrides = Partial<
  Omit<
    Monster,
    | 'exp'
    | 'damageTaken'
    | 'genes'
    | 'fusingBonusStats'
    | 'lifespanBonusYears'
    | 'implantBonusStats'
  >
> & {
  exp?: BigValue
  damageTaken?: BigValue
  lifespanBonusYears?: BigValue
  genes?: Readonly<Record<StatName, BigValue>>
  fusingBonusStats?: Readonly<Record<StatName, BigValue>>
  implantBonusStats?: Readonly<Record<StatName, BigValue>>
}

/**
 * Quái level 1, gen 10, không trait, không shiny, không boss, đầy máu.
 * Có shinyStacks > 0 mà chưa có trait shiny thì tự gắn trait shiny cấp = shinyStacks
 * (đúng luật shiny), để test không phải lặp lại.
 */
export function makeMonster(overrides: MonsterOverrides = {}): Monster {
  const monster = baseMonster(overrides)
  if (monster.shinyStacks > 0 && !monster.traits.some((t) => t.id === 'shiny')) {
    monster.traits = [...monster.traits, { id: 'shiny', level: monster.shinyStacks }]
  }
  return monster
}

function baseMonster(overrides: MonsterOverrides): Monster {
  const {
    exp,
    damageTaken,
    genes,
    fusingBonusStats,
    lifespanBonusYears,
    implantBonusStats,
    ...rest
  } = overrides
  return {
    ...baseFields(),
    // Level cao nhất từng đạt mặc định bằng level (quái hợp lệ).
    maxLevelReached: rest.level ?? 1,
    ...rest,
    exp: toBig(exp ?? 1),
    damageTaken: toBig(damageTaken ?? 0),
    lifespanBonusYears: toBig(lifespanBonusYears ?? 0),
    genes: toBigStats(genes ?? uniformStats(10)),
    fusingBonusStats: toBigStats(fusingBonusStats ?? uniformStats(0)),
    implantBonusStats: toBigStats(implantBonusStats ?? uniformStats(0))
  }
}

function baseFields(): Omit<
  Monster,
  'exp' | 'damageTaken' | 'genes' | 'fusingBonusStats' | 'lifespanBonusYears' | 'implantBonusStats'
> {
  return {
    id: 'm1',
    nickname: null,
    speciesId: 'weakling',
    baseSpeciesId: 'weakling',
    level: 1,
    gender: 'female',
    traits: [],
    shinyStacks: 0,
    bossMultiplier: 1,
    fused: false,
    lineage: [],
    raceId: 'neutral',
    elementIds: ['grass'],
    skillIds: ['strike'],
    traitSlots: 3,
    pendingSkillIds: [],
    pendingEvolutionIds: [],
    statuses: [],
    equipment: [],
    teraElementId: 'grass',
    gmaxFactor: false,
    dynamaxLevel: 0,
    ageDays: 0,
    aging: false,
    maxLevelReached: 1,
    itemUseCounts: {},
    // Quái của người chơi luôn có lý lịch; quái hoang của test tự đặt null nếu cần.
    history: {
      origin: { kind: 'starter' },
      metDay: 0,
      metFloor: null,
      metLevel: 1,
      milestones: []
    },
    // Quái của người chơi đã khế ước (cảnh giới 0: không cộng hưởng); quái hoang tự đặt null.
    contractRealm: 0,
    // Thân mật 0: mức thấp nhất, không hook, để test cũ không đổi.
    affinity: 0,
    imprint: null,
    bossDefeats: 0,
    awakening: 0,
    tribulationFailures: 0,
    injuryBattlesLeft: 0,
    humanForm: 'locked',
    assignment: null,
    tactic: 'balanced',
    skillMastery: {},
    natureId: 'hardy',
    extraSkillIds: [],
    soulLevels: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    effortValues: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    abilitySlot: 'first',
    bond: false,
    contractDays: 0,
    talentRanks: {},
    spiritVirus: null,
    bloodlines: [],
    polarity: null,
    sacrificeStacks: 0,
    rebirths: 0,
    implantEffects: {},
    implantAttempts: 0,
    implantFails: 0,
    workTraits: [],
    workPoints: {},
    workSoulLevel: 0,
    // No / tinh thần đầy (needs.max của fixture = 100).
    fullness: 100,
    sanity: 100,
    ailment: null,
    locked: false,
    favorite: false
  }
}

/** Túi đồ cho test: số lượng theo id, kèm tinh thể, trang bị, sách nếu cần. */
export function makeInventory(
  stacks: Record<string, number> = {},
  crystals: CrystalStack[] = [],
  equipment: EquipmentInstance[] = [],
  books: BookStack[] = []
): Inventory {
  return { stacks, crystals, books, equipment, souls: [], spirits: [] }
}

/**
 * Môi trường của trận cho test: mặc định trời quang, không địa hình, cả trận, chưa có hiệu ứng
 * theo phe hay room. turns: thời hạn của môi trường không mặc định (bỏ trống = cả trận).
 */
export function makeField(
  {
    weather = 'clear',
    terrain = 'none',
    sides = {},
    rooms = []
  }: {
    weather?: string
    terrain?: string
    sides?: Partial<BattleField['sides']>
    rooms?: BattleField['rooms']
  } = {},
  turns: number | null = null
): BattleField {
  return {
    weather: { id: weather, turnsLeft: weather === 'clear' ? null : turns },
    terrain: { id: terrain, turnsLeft: terrain === 'none' ? null : turns },
    sides: { player: sides.player ?? [], enemy: sides.enemy ?? [] },
    rooms
  }
}

/** Bối cảnh trận cho công thức sát thương: quái ta đánh quái hoang, phe nhận có 1 quái trên sân. */
export function makeArena(
  field: BattleField = makeField(),
  overrides: Partial<DamageArena> = {}
): DamageArena {
  return {
    field,
    attackerSide: 'player',
    defenderSide: 'enemy',
    defenderSideCount: 1,
    ...overrides
  }
}

/** Map của tầng trong save cũ (trước v16, luật cũ): xoay vòng Đồng cỏ / Núi lửa. */
export const LEGACY_BIOME_IDS: readonly string[] = ['meadow', 'volcano']

/** Fixture thêm hai biome của save cũ (bản sao field / lair) để state sau migrate hợp lệ. */
export function makeLegacyData(): GameData {
  const raw = makeRawData()
  raw.biomes.push({ ...raw.biomes[0], id: 'meadow' }, { ...raw.biomes[1], id: 'volcano' })
  return createGameData(withFixtureText(raw))
}

/** Id biome của fixture (makeRawData) theo thứ tự trong JSON. */
export const FIXTURE_BIOME_IDS: readonly string[] = ['field', 'lair', 'pairs']

/**
 * Map của `count` tầng đầu cho test: xoay vòng theo danh sách (mặc định biome của fixture: tầng 1
 * field, tầng 2 lair, tầng 3 pairs, tầng 4 lại field), để test không phụ thuộc map tung ngẫu nhiên.
 */
export function fixtureFloorBiomeIds(
  count: number,
  biomeIds: readonly string[] = FIXTURE_BIOME_IDS
): string[] {
  return Array.from({ length: count }, (_, i) => biomeIds[i % biomeIds.length])
}

/** Tầng kèm map cho test sinh quái: tầng N lấy biome thứ (N − 1) mod độ dài danh sách. */
export function fixtureSite(
  data: GameData,
  floor: number,
  biomeIds: readonly string[] = FIXTURE_BIOME_IDS
): FloorSite {
  const biome = defined(data.biomes[biomeIds[(floor - 1) % biomeIds.length]], 'biome')
  // Quái fixture mặc định không già đi (makeMonster, makeGameState): sinh quái cũng vậy.
  return { floor, biome, aging: false, time: 0 }
}

/** Tùy chọn của makeGameState: như createGameState, map của tầng có mặc định. */
export type GameStateOptions = Omit<Parameters<typeof createGameState>[0], 'floorBiomeIds'> & {
  /** Mặc định: 1, hoặc tầng của location nếu cao hơn; bỏ qua khi có floorBiomeIds. */
  highestFloor?: number
  /** Mặc định: fixtureFloorBiomeIds(highestFloor). */
  floorBiomeIds?: readonly string[]
}

/** createGameState cho test: map các tầng đã mở mặc định theo fixtureFloorBiomeIds. */
export function makeGameState(options: GameStateOptions): GameState {
  const { highestFloor, floorBiomeIds, ...rest } = options
  const opened = Math.max(
    highestFloor ?? 1,
    options.location?.type === 'floor' ? options.location.floor : 1
  )
  // Mặc định tắt thọ nguyên để khớp quái fixture (aging false); test thọ nguyên tự bật.
  const state = createGameState({
    lifespanEnabled: false,
    ...rest,
    floorBiomeIds: floorBiomeIds ?? fixtureFloorBiomeIds(opened)
  })
  // Động phủ như game mới của fixture (Linh điền cấp 2, 2 ô trống; khớp migrate linh điền cũ).
  return {
    ...state,
    dwelling: {
      ...state.dwelling,
      buildings: { [FIXTURE_GARDEN_BUILDING_ID]: { level: 2, workers: [] } },
      plots: [null, null]
    }
  }
}

/**
 * State đứng ở một tầng (để startWildBattle / challengeBoss); mở tầng đó nếu chưa mở (các tầng mở
 * thêm lấy map theo fixtureFloorBiomeIds).
 */
export function atFloor(state: GameState, floor: number): GameState {
  const highestFloor = Math.max(state.highestFloor, floor)
  return {
    ...state,
    location: { type: 'floor', floor },
    highestFloor,
    floorBiomeIds: [
      ...state.floorBiomeIds,
      ...fixtureFloorBiomeIds(highestFloor).slice(state.floorBiomeIds.length)
    ]
  }
}

/**
 * State đang ở giữa trận với đội hình và quái địch cho trước (không qua sinh ngẫu nhiên).
 * Hai con đầu của mỗi bên ra sân.
 */
export function makeBattleState(
  party: Monster[],
  enemyList: Monster[],
  overrides: Partial<BattleState> = {}
): GameState {
  // Quái hoang chưa bắt không có lý lịch (mục "Lý lịch quái"), chưa khế ước.
  const enemies = enemyList.map((enemy) => ({ ...enemy, history: null, contractRealm: null }))
  const slots = (list: Monster[]): (string | null)[] => [list[0]?.id ?? null, list[1]?.id ?? null]
  const playerSlots = slots(party)
  const floor = overrides.floor ?? 1
  return {
    // Đang giữa trận thì người chơi đứng ở tầng của trận, như state thật.
    ...makeGameState({
      seed: 1234,
      party,
      nextMonsterId: 100,
      location: { type: 'floor', floor }
    }),
    battle: {
      floor,
      isBoss: false,
      tribulation: null,
      phase: 'chooseActions',
      outcome: null,
      turn: 1,
      enemies,
      playerSlots,
      enemySlots: slots(enemies),
      field: makeField(),
      stages: {},
      volatiles: Object.fromEntries(
        [...playerSlots, ...slots(enemies)].flatMap((id) =>
          id === null ? [] : [[id, { firstTurn: 1 }]]
        )
      ),
      usedOnce: {},
      records: {},
      counters: { casts: { player: 0, enemy: 0 }, lastCastSkillId: null, deaths: 0 },
      participants: playerSlots.filter((id): id is string => id !== null),
      captured: [],
      recruitOfferId: null,
      transformsUsed: { player: [], enemy: [] },
      plannedTransform: null,
      zMoveUsed: { player: false, enemy: false },
      // Ngự thú sư cảnh giới 0, linh lực đầy (manaBase của fixture); quái hoang không có.
      tamers: {
        player: { realm: 0, mana: 50, cooldowns: {}, uses: {}, skillIds: null },
        enemy: null
      },
      teamBonuses: { player: [], enemy: [] },
      trainer: null,
      trial: null,
      instability: null,
      special: null,
      log: [],
      ...overrides
    }
  }
}

/** Bối cảnh trận của quái cho test công thức (mặc định: lượt 1, không đồng đội / địch). */
export function makeBattleContext(
  overrides: Partial<MonsterBattleContext> = {}
): MonsterBattleContext {
  return {
    turnsOnField: 1,
    allies: [],
    knockouts: 0,
    absorbBoosts: [],
    side: 'player',
    battleTurn: 1,
    stages: {},
    isBossBattle: false,
    foes: [],
    volatiles: {},
    record: {
      turnsTaken: 0,
      attacks: 0,
      casts: 0,
      timesDamaged: 0,
      defends: 0,
      provokes: 0,
      deaths: 0,
      revivals: 0,
      damageTaken: toBig(0),
      damageDealt: toBig(0),
      healingReceived: toBig(0),
      lastAction: null,
      traitsGained: 0,
      usedTriggers: [],
      catchMisses: 0
    },
    records: {},
    teamIds: [],
    counters: { casts: { player: 0, enemy: 0 }, lastCastSkillId: null, deaths: 0 },
    faintedAllies: 0,
    faintedFoes: 0,
    livingAllies: 1,
    livingFoes: 1,
    field: makeField(),
    itemsDisabled: false,
    berriesBlocked: false,
    teamBonuses: [],
    frenzyStatPercent: 0,
    mealStatPercent: {},
    collectionStatPercent: 0,
    tamerBonusStatPercent: 0,
    ...overrides
  }
}
