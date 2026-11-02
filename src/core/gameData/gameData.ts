// Tạo GameData từ JSON: đánh chỉ mục theo id và kiểm tra toàn bộ (lúc khởi động và trong test).
// Gom toàn bộ lỗi rồi ném một DataError, để sửa JSON một lần là đủ.

import { DataError, asObject } from '../shared'
import {
  type Biome,
  type ComboSkillDef,
  type GameData,
  type RawGameData,
  type Skill,
  type ZoneDef
} from '../model'
import { checkConfig } from './validateConfig'
import {
  checkElements,
  checkEvolutionGraph,
  checkRaces,
  checkSkills,
  checkSpecies,
  checkTraits,
  checkBiomes
} from './validateContent'
import { checkItems } from './itemCategories'
import { checkTexts } from './validateTexts'
import { checkContentFields } from './contentFields'
import { checkSpeciesInfo } from './validateSpeciesInfo'
import { checkLifespanData } from './validateLifespan'
import { checkCalendarData } from './validateCalendar'
import { checkExpCandyConfig } from './validateExpCandy'
import { checkSkillBookData } from './validateSkillBooks'
import { checkEvolutionConfig } from './validateEvolutions'
import { checkTamerData } from './validateTamer'
import { checkAffinityData } from './validateAffinity'
import { checkImprintData } from './validateImprint'
import { checkElementStatusImmunities, checkStatuses } from './validateStatuses'
import { checkTeamData } from './validateTeam'
import { checkMasteryConfig } from './validateMastery'
import { checkSynergyHold } from './validateSynergyHold'
import { checkMoveStylesConfig, checkSkillStyles } from './validateMoveStyles'
import { checkFrenzyData } from './validateFrenzy'
import { checkRecruitData } from './validateRecruit'
import { checkSafariData } from './validateSafari'
import { checkImplantData } from './validateImplant'
import { checkCapacityData } from './validateCapacity'
import { checkWeights } from './validateWeight'
import { checkDexData } from './validateDex'
import { resolveRaces } from './races'
import { checkMinions } from './validateMinions'
import { checkNatureData } from './validateNatures'
import { checkBodyPartData } from './validateBodyParts'
import { checkAptitudeTiers } from './validateAptitude'
import { checkSpeciesRankData } from './validateSpeciesRank'
import { checkBloodlineData } from './validateBloodlines'
import { checkStarterData } from './validateStarters'
import { checkPartnerSkillData } from './validatePartnerSkills'
import { checkAwakeningData } from './validateAwakening'
import { checkHumanFormData } from './validateHumanForm'
import { checkTreasureData } from './validateTreasures'
import { checkSoulLevelData } from './validateSoulLevels'
import { checkRebirthData } from './validateRebirth'
import { checkEffortData } from './validateEffort'
import { checkSpiritVirusConfig } from './validateSpiritVirus'
import { checkPolarityData } from './validatePolarity'
import { checkGrowthRates } from './validateGrowthRate'
import { checkAbilityData } from './validateAbilities'
import { checkTalentData } from './validateTalents'
import { checkTamerTalentData } from './validateTamerTalents'
import { checkSectData } from './validateSects'
import { checkTeamPresetData, checkTradeData } from './validateTrades'
import { checkGachaData } from './validateGacha'
import { checkSoulRelicData } from './validateSoulRelics'
import { checkForgeConfig } from './validateForge'
import { checkItemGroups } from './validateItemGroups'
import { checkAlchemyData } from './validateAlchemy'
import { checkQuestData } from './validateQuests'
import { checkExpeditionData } from './validateExpeditions'
import { checkDwellingData } from './validateDwelling'
import { checkTrainerData } from './validateTrainers'
import { checkTrialData } from './validateTrials'
import { checkZoneData } from './validateZones'
import { checkGatheringData } from './validateGathering'
import { checkWorldBossData } from './validateWorldBoss'
import { checkDeityData } from './validateDeities'
import { checkAchievementData } from './validateAchievements'
import { checkResearchData } from './validateResearch'
import { checkArtifactSpiritData } from './validateArtifactSpirits'
import { checkEventData } from './validateEvents'
import { checkAutoBattleData } from './validateAutoBattle'
import { checkTransformData } from './validateTransform'
import { checkZMoveData } from './validateZMoves'
import {
  checkBiomeEquipmentDrops,
  checkEquipmentAffixes,
  checkEquipmentConfig
} from './validateEquipment'
import {
  checkBiomeFields,
  checkBossFields,
  checkFieldConfig,
  checkFieldEffects,
  checkSkillsFieldModifiers
} from './validateFieldEffects'

/** Đánh chỉ mục theo id, báo lỗi id rỗng hoặc trùng. */
function indexById<T extends { id: string }>(
  items: T[],
  label: string,
  issues: string[]
): Record<string, T> {
  const index: Record<string, T> = {}
  if (!Array.isArray(items)) {
    issues.push(`${label}: phải là danh sách`)
    return index
  }
  for (const item of items) {
    if (typeof item.id !== 'string' || item.id === '') {
      issues.push(`${label}: có phần tử thiếu id`)
    } else if (item.id in index) {
      issues.push(`${label}: id "${item.id}" bị trùng`)
    } else {
      index[item.id] = item
    }
  }
  return index
}

/**
 * Tách hợp kích kỹ (docs/rules/team.md): phần skill vào chung chỉ mục skill (kiểm tra như skill
 * thường, tra được bằng id ở mọi nơi), cặp điều kiện vào `comboSkills`. Id trùng skill thường báo
 * lỗi.
 */
function splitComboSkills(
  raw: RawGameData,
  skills: Record<string, Skill>,
  issues: string[]
): Record<string, ComboSkillDef> {
  const combos: Record<string, ComboSkillDef> = {}
  for (const [id, { pair, ...skill }] of Object.entries(
    indexById(raw.comboSkills, 'comboSkills', issues)
  )) {
    if (id in skills) {
      issues.push(`comboSkills: id "${id}" trùng skill thường`)
      continue
    }
    skills[id] = skill
    combos[id] = { id, pair }
  }
  return combos
}

/**
 * Hiểm địa (docs/rules/zones.md): map của hiểm địa nhận id = id hiểm địa để dùng chung mọi hàm của
 * biome (sinh quái, đồ rơi, môi trường; kiểm tra như biome). Map không phải object báo lỗi.
 */
function indexZones(raw: RawGameData, issues: string[]): Record<string, ZoneDef> {
  const zones: Record<string, ZoneDef> = {}
  for (const [id, zone] of Object.entries(indexById(raw.zones, 'zones', issues))) {
    const map = asObject(zone.map)
    if (!map) {
      issues.push(`Hiểm địa "${id}": map phải là object`)
      continue
    }
    // Ép kiểu: trường của map được kiểm tra đầy đủ ở các hàm kiểm tra biome (allMaps).
    zones[id] = { ...zone, map: { ...map, id } as Biome }
  }
  return zones
}

/** Đánh chỉ mục và kiểm tra toàn bộ dữ liệu game. Ném DataError nếu có lỗi. */
export function createGameData(raw: RawGameData): GameData {
  const issues: string[] = []
  const skills = indexById(raw.skills, 'skills', issues)
  const comboSkills = splitComboSkills(raw, skills, issues)
  const raceGroups = indexById(raw.raceGroups, 'raceGroups', issues)
  const data: GameData = {
    config: raw.config,
    elements: indexById(raw.elements, 'elements', issues),
    raceGroups,
    // Race đủ trường: trộn mặc định của nhóm (mục "Race" ở stats-traits.md).
    races: resolveRaces(Object.values(indexById(raw.races, 'races', issues)), {
      groups: raceGroups,
      issues
    }),
    species: indexById(raw.species, 'species', issues),
    traits: indexById(raw.traits, 'traits', issues),
    skills,
    items: indexById(raw.items, 'items', issues),
    biomes: indexById(raw.biomes, 'biomes', issues),
    statuses: indexById(raw.statuses, 'statuses', issues),
    minions: indexById(raw.minions, 'minions', issues),
    fieldEffects: indexById(raw.fieldEffects, 'fieldEffects', issues),
    equipmentAffixes: indexById(raw.equipmentAffixes, 'equipmentAffixes', issues),
    tamerSkills: indexById(raw.tamerSkills, 'tamerSkills', issues),
    tamerRealms: indexById(raw.tamerRealms, 'tamerRealms', issues),
    affinityTiers: indexById(raw.affinityTiers, 'affinityTiers', issues),
    talentBranches: indexById(raw.talentBranches, 'talentBranches', issues),
    talents: indexById(raw.talents, 'talents', issues),
    tamerTalentBranches: indexById(raw.tamerTalentBranches, 'tamerTalentBranches', issues),
    tamerTalents: indexById(raw.tamerTalents, 'tamerTalents', issues),
    synergies: indexById(raw.synergies, 'synergies', issues),
    formations: indexById(raw.formations, 'formations', issues),
    comboSkills,
    natures: indexById(raw.natures, 'natures', issues),
    bodyParts: indexById(raw.bodyParts, 'bodyParts', issues),
    aptitudeTiers: indexById(raw.aptitudeTiers, 'aptitudeTiers', issues),
    speciesRanks: indexById(raw.speciesRanks, 'speciesRanks', issues),
    bloodlines: indexById(raw.bloodlines, 'bloodlines', issues),
    partnerSkills: indexById(raw.partnerSkills, 'partnerSkills', issues),
    recipes: indexById(raw.recipes, 'recipes', issues),
    quests: indexById(raw.quests, 'quests', issues),
    expeditions: indexById(raw.expeditions, 'expeditions', issues),
    buildings: indexById(raw.buildings, 'buildings', issues),
    workTraits: indexById(raw.workTraits, 'workTraits', issues),
    ailments: indexById(raw.ailments, 'ailments', issues),
    trainers: indexById(raw.trainers, 'trainers', issues),
    trialRules: indexById(raw.trialRules, 'trialRules', issues),
    events: indexById(raw.events, 'events', issues),
    eventModifiers: indexById(raw.eventModifiers, 'eventModifiers', issues),
    zones: indexZones(raw, issues),
    serumEffects: indexById(raw.serumEffects, 'serumEffects', issues),
    deities: indexById(raw.deities, 'deities', issues),
    achievements: indexById(raw.achievements, 'achievements', issues),
    titles: indexById(raw.titles, 'titles', issues),
    sects: indexById(raw.sects, 'sects', issues),
    sectRanks: indexById(raw.sectRanks, 'sectRanks', issues),
    npcNames: indexById(raw.npcNames, 'npcNames', issues),
    artifactSpirits: indexById(raw.artifactSpirits, 'artifactSpirits', issues),
    text: raw.text
  }
  checkConfig(data, issues)
  checkElements(data, issues)
  checkStatuses(data, issues)
  checkElementStatusImmunities(data, issues)
  checkFieldEffects(data, issues)
  checkFieldConfig(data, issues)
  checkRaces(data, issues)
  checkContentFields(data, issues)
  checkSpecies(data, issues)
  checkSpeciesInfo(data, issues)
  checkSkills(data, issues)
  checkSkillsFieldModifiers(data, issues)
  checkSynergyHold(data, issues)
  checkSkillStyles(data, issues)
  checkEquipmentConfig(data, issues)
  checkEquipmentAffixes(data, issues)
  checkItems(data, issues)
  checkBiomeEquipmentDrops(data, issues)
  checkBiomes(data, issues)
  checkBiomeFields(data, issues)
  checkBossFields(data, issues)
  checkTraits(data, issues)
  checkMinions(data, issues)
  checkEvolutionGraph(data, issues)
  checkTransformData(data, issues)
  checkZMoveData(data, issues)
  checkLifespanData(data, issues)
  checkCalendarData(data, issues)
  checkExpCandyConfig(data, issues)
  checkSkillBookData(data, issues)
  checkEvolutionConfig(data, issues)
  checkTamerData(data, issues)
  checkAffinityData(data, issues)
  checkImprintData(data, issues)
  checkTeamData(data, issues)
  checkMasteryConfig(data, issues)
  checkMoveStylesConfig(data, issues)
  checkNatureData(data, issues)
  checkBodyPartData(data, issues)
  checkAptitudeTiers(data, issues)
  checkSpeciesRankData(data, issues)
  checkBloodlineData(data, issues)
  checkPartnerSkillData(data, issues)
  checkAwakeningData(data, issues)
  checkHumanFormData(data, issues)
  checkTreasureData(data, issues)
  checkSoulLevelData(data, issues)
  checkEffortData(data, issues)
  checkSpiritVirusConfig(data, issues)
  checkPolarityData(data, issues)
  checkGrowthRates(data, issues)
  checkAbilityData(data, issues)
  checkTalentData(data, issues)
  checkTamerTalentData(data, issues)
  checkSectData(data, issues)
  checkTradeData(data, issues)
  checkTeamPresetData(data, issues)
  checkGachaData(data, issues)
  checkSoulRelicData(data, issues)
  checkItemGroups(data, issues)
  checkForgeConfig(data, issues)
  checkFrenzyData(data, issues)
  checkRecruitData(data, issues)
  checkSafariData(data, issues)
  checkImplantData(data, issues)
  checkRebirthData(data, issues)
  checkCapacityData(data, issues)
  checkWeights(data, issues)
  checkDexData(data, issues)
  checkResearchData(data, issues)
  checkAlchemyData(data, issues)
  checkQuestData(data, issues)
  checkExpeditionData(data, issues)
  checkDwellingData(data, issues)
  checkAutoBattleData(data, issues)
  checkTrainerData(data, issues)
  checkTrialData(data, issues)
  checkZoneData(data, issues)
  checkGatheringData(data, issues)
  checkWorldBossData(data, issues)
  checkDeityData(data, issues)
  checkAchievementData(data, issues)
  checkArtifactSpiritData(data, issues)
  checkEventData(data, issues)
  // Sau cùng: danh sách loài của ô khởi đầu chỉ dựng khi phần dữ liệu khác hợp lệ.
  checkStarterData(data, issues)
  checkTexts(data, issues)
  if (issues.length > 0) throw new DataError(issues)
  return data
}

export type GameDataResult = { ok: true; data: GameData } | { ok: false; issues: string[] }

/**
 * Như createGameData nhưng không ném lỗi: dùng lúc khởi động app để báo lỗi dữ liệu.
 * Lỗi bất ngờ (ví dụ JSON thiếu hẳn một khối khiến code đọc vào undefined) cũng được gom thành issue.
 */
export function tryCreateGameData(raw: RawGameData): GameDataResult {
  try {
    return { ok: true, data: createGameData(raw) }
  } catch (error) {
    if (error instanceof DataError) return { ok: false, issues: error.issues }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, issues: [`Lỗi không mong đợi khi đọc dữ liệu: ${message}`] }
  }
}
