// Đọc file kịch bản của script mô phỏng (scenarios.json, mục "Script mô phỏng" ở simulation.md):
// kiểm tra từ unknown, gom mọi lỗi kèm đường dẫn trường rồi ném DataError. Kịch bản là tham số của
// script, không phải số cân bằng của game.

import {
  DataError,
  asObject,
  checkInteger,
  checkKnownFields,
  checkNumber,
  fieldList,
  POLES,
  TACTICS,
  type AiConfig,
  type Pole,
  type Tactic,
  type GameData,
  type RawGameData,
  type TraitInstance
} from '@core'
import type { BattleKind } from './battleRunner'
import type { BossPolicy, FarmSpec } from './bossPolicy'
import type { AssumedMasterySpec } from './mastery'

/** Gen của quái mẫu: "wild" = giữa khoảng gen quái hoang của tầng, hoặc một số cố định. */
export type GeneSpec = 'wild' | number

export interface MemberSpec {
  speciesId: string
  /** Level = level boss tầng + levelOffset (tối thiểu 1). */
  levelOffset: number
  genes: GeneSpec
  traits: TraitInstance[]
}

export interface TeamSpec {
  id: string
  members: MemberSpec[]
  /** Quét tầng bỏ phần trận boss của đội này (không ghi = false). */
  skipBoss: boolean
  /**
   * Exp thuần thục giả định mỗi tầng của đội này khi quét tầng (đè assumedMastery.expPerFloor; đội
   * ít quái dùng mỗi skill nhiều hơn). null = theo assumedMastery.
   */
  masteryExpPerFloor: number | null
}

/**
 * Dừng sớm khi quét tầng: sau ít nhất minBattles trận, dừng khi khoảng tin cậy Wilson 95% của tỉ
 * lệ thắng rộng ≤ ciWidth.
 */
export interface EarlyStopSpec {
  minBattles: number
  ciWidth: number
}

/** Trọng số AI dạng số (mọi khóa của config.ai trừ statusWeights). */
type AiNumberKey = Exclude<keyof AiConfig, 'statusWeights'>

/** Ghi đè một phần config của một mục (khóa phải có trong mục đó; giá trị do createGameData kiểm tra). */
export type ConfigOverride = Record<string, Record<string, unknown>>

/**
 * Biến thể (mục "Biến thể" ở simulation.md): quét tầng chạy lại với config đã ghi đè, để so A/B
 * một số cân bằng hoặc tắt một tính năng.
 */
export interface Variant {
  id: string
  /** Ghi đè một phần config.ai; statusWeights ghi đè từng trạng thái (gộp với trọng số gốc). */
  ai: Partial<Pick<AiConfig, AiNumberKey>> & { statusWeights?: Record<string, number> }
  /** Ghi đè nông các mục khác của config (mỗi mục gộp với giá trị gốc); không ghi = {}. */
  config: ConfigOverride
  /**
   * Bỏ trường này khỏi mọi skill (A/B synergy / hold); `reach`: mọi skill tầm xa (tắt tầm chiêu,
   * docs/rules/hit-locations.md); không ghi = [].
   */
  withoutSkillFields: SkillFieldToggle[]
  /** Bỏ mọi hiệu ứng của kỹ năng đồng hành (A/B, docs/rules/partner-skills.md); không ghi = false. */
  withoutPartnerSkills: boolean
  /** Chiến thuật của đội mẫu khi quét tầng (docs/rules/auto-battle.md); không ghi = balanced. */
  tactic: Tactic
  /**
   * Đội mẫu chưa khế ước khi quét tầng (A/B không nghe lệnh / cuồng bạo, docs/rules/tamer.md mục
   * "Khế ước"); không ghi = false.
   */
  uncontracted: boolean
  /**
   * Cảnh giới ngự thú sư khi quét tầng thay cho giả định theo tầng (A/B kỹ năng ngự thú sư mở muộn
   * như Song thú hợp thể, docs/rules/battle-merge.md); null = giả định theo tầng.
   */
  tamerRealm: number | null
  /**
   * Độ thuần giả định của đội mẫu khi quét tầng (docs/rules/bloodline.md): mỗi quái mang huyết mạch
   * chính là nhóm đầu của loài với độ thuần này (loài không thuộc nhóm nào thì không có); null = như
   * tung lúc dựng đội.
   */
  assumedPurity: number | null
  /**
   * Cực giả định của đội mẫu khi quét tầng (docs/rules/polarity.md): mọi quái mang cực này với trait
   * cực tính đầu pool; null = như tung lúc dựng đội (không cực).
   */
  assumedPolarity: Pole | null
  /**
   * Mức độ bất ổn tầng khi quét tầng (A/B độ khó / thưởng, docs/rules/instability.md): mọi tầng
   * dùng mức này với thuộc tính tung theo seed của trận, bỏ qua mức tối đa theo tầng; 0 = tắt.
   */
  instabilityLevel: number
}

/** Trường skill biến thể được bỏ (skill-synergy-hold.md, move-styles.md, hit-locations.md). */
export const SKILL_FIELD_TOGGLES = ['hold', 'synergy', 'styles', 'reach'] as const
export type SkillFieldToggle = (typeof SKILL_FIELD_TOGGLES)[number]

export interface ProgressionSpec {
  teamIds: string[]
  /** Khi nào đánh boss tầng (bossPolicy.ts). */
  bossPolicy: BossPolicy
  /** Chọn tầng farm theo tỉ lệ thắng gần đây; null = luôn farm ở tầng cao nhất. */
  farm: FarmSpec | null
  /** Quá số trận này mà chưa tới tầng cuối thì ghi "kẹt". */
  maxBattles: number
  /**
   * Mở tầng mới thì nâng gen "wild" của đội mẫu lên mức gen quái hoang của tầng đó (chỉ tăng), như
   * người chơi bắt / breed quái gen cao hơn. Bỏ trống = false (giữ gen tầng 1).
   */
  genesFollowFloor: boolean
  /**
   * Chế độ dùng Thọ Nguyên Đan (mục "Thọ nguyên"): mỗi đội chạy một lần cho mỗi chế độ (true = dùng
   * đan khi quái đội mẫu sắp thọ tận). Bỏ trống = [true].
   */
  pillModes: boolean[]
  /**
   * Chế độ fuse / breeding (mục "Fuse, breeding" ở simulation-features.md): mỗi đội chạy một lần cho
   * mỗi chế độ (true = "người chơi" bắt quái, fuse, breeding, đưa con vào đội). Bỏ trống = [true].
   */
  growthModes: boolean[]
  /**
   * Quét tầng bằng đội thật (pha 2): mỗi tầng đã tới, đánh wildBattles / bossBattles trận với đội mẫu
   * lúc vừa tới tầng đó. null = tắt.
   */
  sweep: { wildBattles: number; bossBattles: number } | null
}

export interface BreedingSpec {
  speciesId: string
  /** Tầng lấy gen quái hoang (gen mẹ đầu tiên khi "wild", gen bố mọi đời). */
  floor: number
  /** Level dùng để đo chỉ số và tính giá breed. */
  measureLevel: number
  genes: GeneSpec
  generations: number
  offspringPerGeneration: number
}

export interface FusionSpec {
  speciesId: string
  floor: number
  level: number
  genes: GeneSpec
  fusions: number
}

/**
 * Tìm levelOffset nhỏ nhất để tỉ lệ thắng boss tầng ≥ mỗi mục tiêu (%), mỗi điểm đánh tối đa
 * `battles` trận (levelSearch.ts).
 */
export interface BossLevelSearchSpec {
  targets: number[]
  maxOffset: number
  battles: number
}

/**
 * Quét theo map: mỗi map (biome) × mỗi đội × mỗi tầng trong `floors` đánh `wildBattles` trận quái
 * hoang và `bossBattles` trận boss tầng ở map đó (biến thể đầu tiên), để so độ khó / thưởng giữa
 * các map.
 */
export interface BiomeSweepSpec {
  teamIds: string[]
  floors: number[]
  wildBattles: number
  bossBattles: number
}

/**
 * Độ kiếp (docs/rules/awakening.md): quái đầu của đội `teamId` đánh một mình với Thiên Kiếp, mỗi
 * (tầng sẽ lên × độ lệch level ≥ 0) `battles` trận; level = levelPerTier × tầng + độ lệch.
 */
export interface TribulationSpec {
  teamId: string
  tiers: number[]
  levelOffsets: number[]
  battles: number
}

/**
 * Cách chơi mỗi lần gặp: chỉ ném bóng; ném đá một lần rồi ném bóng; ném mồi thường một lần rồi ném
 * bóng; chỉ bắt loài hiếm (catchRate < RARE_CATCH_RATE của safari.ts), loài khác bỏ đi.
 */
export const SAFARI_POLICIES = ['balls', 'rock', 'bait', 'rareOnly'] as const

export type SafariPolicy = (typeof SAFARI_POLICIES)[number]

/** Khu bảo tồn (safari.ts): mỗi tầng × cách chơi vào khu `visits` lần. */
export interface SafariSpec {
  floors: number[]
  visits: number
  policies: SafariPolicy[]
}

/**
 * Đồ tiếp tế mang vào hiểm địa mỗi lượt (zones.ts): số món hồi sinh / hồi máu / chữa trạng thái, hồi
 * máu khi máu còn dưới `healBelowPercent` %.
 */
export interface ZoneSupplies {
  reviveItemId: string
  revives: number
  healItemId: string
  heals: number
  healBelowPercent: number
  cureItemId: string
  cures: number
}

/** Hiểm địa (zones.ts): đội `teamId` vào mỗi hiểm địa ở từng tầng của nó `visits` lần. */
export interface ZoneSpec {
  teamId: string
  /**
   * `leadSpeciesId`: đổi loài quái đầu đội cho hiểm địa này (điều kiện loài / dòng tiến hóa); bỏ trống =
   * đội như khai báo.
   */
  runs: { zoneId: string; floors: number[]; leadSpeciesId: string | null }[]
  visits: number
  supplies: ZoneSupplies
}

/**
 * Một cách chơi của phần thu thập (gathering.ts): câu cá / khai thác với dụng cụ (bùa) và mồi câu, hoặc
 * `wild` = trận quái hoang thường ở cùng map để so (không dụng cụ, không mồi).
 */
export interface GatheringRun {
  id: string
  method: 'fishing' | 'mining' | 'wild'
  toolItemId: string | null
  lureItemId: string | null
}

/** Câu cá và khai thác (gathering.ts): đội `teamId` ở mỗi tầng, mỗi cách chơi `casts` lần. */
export interface GatheringSpec {
  teamId: string
  floors: number[]
  casts: number
  runs: GatheringRun[]
}

/** Boss thế giới (worldBoss.ts): mỗi đội × tầng khiêu chiến `challenges` lần. */
export interface WorldBossSpec {
  teamIds: string[]
  floors: number[]
  challenges: number
}

export interface Scenarios {
  seed: number
  floors: { from: number; to: number }
  wildBattlesPerFloor: number
  bossBattlesPerFloor: number
  /** Trận chạm trần số lượt ghi là "hết lượt". */
  maxTurns: number
  /** Trần số lượt của trận boss (không ghi = maxTurns). */
  maxTurnsBoss: number
  /** null = tắt (đánh đủ số trận). */
  earlyStop: EarlyStopSpec | null
  teams: TeamSpec[]
  variants: Variant[]
  /** Thuần thục giả định khi quét tầng; null = không giả định (mọi skill cấp 1). */
  assumedMastery: AssumedMasterySpec | null
  progression: ProgressionSpec
  /** null = không tìm level cần để thắng boss. */
  bossLevelSearch: BossLevelSearchSpec | null
  /** null = không quét theo map. */
  biomeSweep: BiomeSweepSpec | null
  /** null = không đo độ kiếp. */
  tribulation: TribulationSpec | null
  /** null = không đo khu bảo tồn. */
  safari: SafariSpec | null
  /** null = không đo hiểm địa. */
  zones: ZoneSpec | null
  /** null = không đo câu cá / khai thác. */
  gathering: GatheringSpec | null
  /** null = không đo boss thế giới. */
  worldBoss: WorldBossSpec | null
  breeding: BreedingSpec
  fusion: FusionSpec
}

const SCENARIO_FIELDS = fieldList<Scenarios>({
  seed: true,
  floors: true,
  wildBattlesPerFloor: true,
  bossBattlesPerFloor: true,
  maxTurns: true,
  maxTurnsBoss: true,
  earlyStop: true,
  teams: true,
  variants: true,
  assumedMastery: true,
  progression: true,
  bossLevelSearch: true,
  biomeSweep: true,
  tribulation: true,
  safari: true,
  zones: true,
  gathering: true,
  worldBoss: true,
  breeding: true,
  fusion: true
})
const MEMBER_FIELDS = fieldList<MemberSpec>({
  speciesId: true,
  levelOffset: true,
  genes: true,
  traits: true
})
const BREEDING_FIELDS = fieldList<BreedingSpec>({
  speciesId: true,
  floor: true,
  measureLevel: true,
  genes: true,
  generations: true,
  offspringPerGeneration: true
})
const FUSION_FIELDS = fieldList<FusionSpec>({
  speciesId: true,
  floor: true,
  level: true,
  genes: true,
  fusions: true
})
const PROGRESSION_FIELDS = fieldList<ProgressionSpec>({
  teamIds: true,
  bossPolicy: true,
  farm: true,
  maxBattles: true,
  genesFollowFloor: true,
  pillModes: true,
  growthModes: true,
  sweep: true
})

/** Đọc từng trường, ghi lỗi vào issues; trường sai trả giá trị thay thế để đọc tiếp. */
class Reader {
  readonly issues: string[] = []

  constructor(private readonly data: GameData) {}

  object(value: unknown, path: string, fields?: readonly string[]): Record<string, unknown> {
    const obj = asObject(value)
    if (!obj) {
      this.issues.push(`${path} phải là object`)
      return {}
    }
    if (fields) checkKnownFields(obj, fields, path, 'kịch bản', this.issues)
    return obj
  }

  integer(value: unknown, path: string, min: number): number {
    const errors = checkInteger(value, path, min)
    this.issues.push(...errors)
    return errors.length > 0 ? min : (value as number)
  }

  number(value: unknown, path: string, min: number, max: number): number {
    const errors = checkNumber(value, path, min, max)
    this.issues.push(...errors)
    return errors.length > 0 ? min : (value as number)
  }

  boolean(value: unknown, path: string): boolean {
    if (typeof value === 'boolean') return value
    this.issues.push(`${path} phải là true / false`)
    return false
  }

  string(value: unknown, path: string): string {
    if (typeof value === 'string' && value.length > 0) return value
    this.issues.push(`${path} phải là chuỗi khác rỗng`)
    return ''
  }

  array(value: unknown, path: string): unknown[] {
    if (Array.isArray(value)) return value
    this.issues.push(`${path} phải là danh sách`)
    return []
  }

  genes(value: unknown, path: string): GeneSpec {
    if (value === 'wild') return value
    return this.integer(value, path, 1)
  }

  /** Loài thường có trong dữ liệu (loài fuse không dựng trực tiếp được). */
  speciesId(value: unknown, path: string): string {
    const id = this.string(value, path)
    if (id && this.data.species[id]?.kind !== 'normal') {
      this.issues.push(`${path}: loài "${id}" không có hoặc không phải loài thường`)
    }
    return id
  }
}

/** Kiểm tra và đọc kịch bản; sai thì ném DataError liệt kê mọi lỗi. */
export function parseScenarios(data: GameData, value: unknown): Scenarios {
  const r = new Reader(data)
  const root = r.object(value, 'scenarios', SCENARIO_FIELDS)
  const floorsObj = r.object(root.floors, 'floors', ['from', 'to'])
  const floors = {
    from: r.integer(floorsObj.from, 'floors.from', 1),
    to: r.integer(floorsObj.to, 'floors.to', 1)
  }
  if (floors.to < floors.from) r.issues.push('floors.to phải ≥ floors.from')

  const teams = r.array(root.teams, 'teams').map((team, i) => readTeam(r, team, `teams[${i}]`))
  checkUniqueIds(r, teams, 'teams')
  if (teams.length === 0) r.issues.push('teams phải có ít nhất một đội')
  const variants = r
    .array(root.variants, 'variants')
    .map((variant, i) => readVariant(r, data, variant, `variants[${i}]`))
  checkUniqueIds(r, variants, 'variants')
  if (variants.length === 0) r.issues.push('variants phải có ít nhất một biến thể')

  const maxTurns = r.integer(root.maxTurns, 'maxTurns', 1)
  const scenarios: Scenarios = {
    seed: r.integer(root.seed, 'seed', 0),
    floors,
    wildBattlesPerFloor: r.integer(root.wildBattlesPerFloor, 'wildBattlesPerFloor', 0),
    bossBattlesPerFloor: r.integer(root.bossBattlesPerFloor, 'bossBattlesPerFloor', 0),
    maxTurns,
    maxTurnsBoss:
      root.maxTurnsBoss === undefined ? maxTurns : r.integer(root.maxTurnsBoss, 'maxTurnsBoss', 1),
    earlyStop: root.earlyStop === undefined ? null : readEarlyStop(r, root.earlyStop),
    teams,
    variants,
    assumedMastery:
      root.assumedMastery === undefined ? null : readAssumedMastery(r, root.assumedMastery),
    progression: readProgression(r, root.progression, teams),
    bossLevelSearch:
      root.bossLevelSearch === undefined ? null : readBossLevelSearch(r, root.bossLevelSearch),
    biomeSweep: root.biomeSweep === undefined ? null : readBiomeSweep(r, root.biomeSweep, teams),
    tribulation:
      root.tribulation === undefined ? null : readTribulation(r, root.tribulation, teams),
    safari: root.safari === undefined ? null : readSafari(r, root.safari),
    zones: root.zones === undefined ? null : readZones(r, data, root.zones, teams),
    gathering: root.gathering === undefined ? null : readGathering(r, data, root.gathering, teams),
    worldBoss: root.worldBoss === undefined ? null : readWorldBoss(r, root.worldBoss, teams),
    breeding: readBreeding(r, root.breeding),
    fusion: readFusion(r, root.fusion)
  }
  if (r.issues.length > 0) throw new DataError(r.issues)
  return scenarios
}

function readTeam(r: Reader, value: unknown, path: string): TeamSpec {
  const obj = r.object(value, path, ['id', 'members', 'skipBoss', 'masteryExpPerFloor'])
  const members = r
    .array(obj.members, `${path}.members`)
    .map((member, i) => readMember(r, member, `${path}.members[${i}]`))
  if (members.length === 0) r.issues.push(`${path}.members phải có ít nhất một quái`)
  return {
    id: r.string(obj.id, `${path}.id`),
    members,
    skipBoss: obj.skipBoss === undefined ? false : r.boolean(obj.skipBoss, `${path}.skipBoss`),
    masteryExpPerFloor:
      obj.masteryExpPerFloor === undefined
        ? null
        : r.number(obj.masteryExpPerFloor, `${path}.masteryExpPerFloor`, 0, Number.MAX_SAFE_INTEGER)
  }
}

function readEarlyStop(r: Reader, value: unknown): EarlyStopSpec {
  const obj = r.object(value, 'earlyStop', ['minBattles', 'ciWidth'])
  const ciWidth = r.number(obj.ciWidth, 'earlyStop.ciWidth', 0, 1)
  if (ciWidth === 0) r.issues.push('earlyStop.ciWidth phải > 0')
  return { minBattles: r.integer(obj.minBattles, 'earlyStop.minBattles', 1), ciWidth }
}

function readMember(r: Reader, value: unknown, path: string): MemberSpec {
  const obj = r.object(value, path, MEMBER_FIELDS)
  const traits = r.array(obj.traits ?? [], `${path}.traits`).map((trait, i) => {
    const traitObj = r.object(trait, `${path}.traits[${i}]`, ['id', 'level'])
    return {
      id: r.string(traitObj.id, `${path}.traits[${i}].id`),
      level: r.integer(traitObj.level, `${path}.traits[${i}].level`, 1)
    }
  })
  return {
    speciesId: r.speciesId(obj.speciesId, `${path}.speciesId`),
    levelOffset: r.integer(obj.levelOffset, `${path}.levelOffset`, -Number.MAX_SAFE_INTEGER),
    genes: r.genes(obj.genes, `${path}.genes`),
    traits
  }
}

function readVariant(r: Reader, data: GameData, value: unknown, path: string): Variant {
  const obj = r.object(value, path, [
    'id',
    'ai',
    'config',
    'withoutSkillFields',
    'withoutPartnerSkills',
    'tactic',
    'uncontracted',
    'tamerRealm',
    'assumedPurity',
    'assumedPolarity',
    'instabilityLevel'
  ])
  return {
    id: r.string(obj.id, `${path}.id`),
    ai: obj.ai === undefined ? {} : readAiOverride(r, data, obj.ai, `${path}.ai`),
    config:
      obj.config === undefined ? {} : readConfigOverride(r, data, obj.config, `${path}.config`),
    withoutSkillFields:
      obj.withoutSkillFields === undefined
        ? []
        : readSkillFieldToggles(r, obj.withoutSkillFields, `${path}.withoutSkillFields`),
    withoutPartnerSkills:
      obj.withoutPartnerSkills === undefined
        ? false
        : r.boolean(obj.withoutPartnerSkills, `${path}.withoutPartnerSkills`),
    tactic: obj.tactic === undefined ? 'balanced' : readTactic(r, obj.tactic, `${path}.tactic`),
    uncontracted:
      obj.uncontracted === undefined ? false : r.boolean(obj.uncontracted, `${path}.uncontracted`),
    tamerRealm:
      obj.tamerRealm === undefined ? null : r.integer(obj.tamerRealm, `${path}.tamerRealm`, 0),
    assumedPurity:
      obj.assumedPurity === undefined
        ? null
        : r.number(obj.assumedPurity, `${path}.assumedPurity`, 1, 100),
    assumedPolarity:
      obj.assumedPolarity === undefined
        ? null
        : readPole(r, obj.assumedPolarity, `${path}.assumedPolarity`),
    instabilityLevel:
      obj.instabilityLevel === undefined
        ? 0
        : r.integer(obj.instabilityLevel, `${path}.instabilityLevel`, 0)
  }
}

function readPole(r: Reader, value: unknown, path: string): Pole | null {
  if ((POLES as readonly unknown[]).includes(value)) {
    // Ép kiểu: vừa kiểm tra thuộc POLES.
    return value as Pole
  }
  r.issues.push(`${path} phải là ${POLES.join(' / ')}`)
  return null
}

function readTactic(r: Reader, value: unknown, path: string): Tactic {
  if ((TACTICS as readonly unknown[]).includes(value)) {
    // Ép kiểu: vừa kiểm tra thuộc TACTICS.
    return value as Tactic
  }
  r.issues.push(`${path} phải là ${TACTICS.join(' / ')}`)
  return 'balanced'
}

function readSkillFieldToggles(r: Reader, value: unknown, path: string): SkillFieldToggle[] {
  return r.array(value, path).flatMap((field, i) => {
    if ((SKILL_FIELD_TOGGLES as readonly unknown[]).includes(field)) {
      // Ép kiểu: vừa kiểm tra thuộc SKILL_FIELD_TOGGLES.
      return [field as SkillFieldToggle]
    }
    r.issues.push(`${path}[${i}] phải là một trong ${SKILL_FIELD_TOGGLES.join(', ')}`)
    return []
  })
}

/**
 * Ghi đè config ngoài ai: mỗi mục phải là mục object của config (không phải ai, dùng trường `ai`),
 * khóa con phải có trong mục đó.
 */
function readConfigOverride(
  r: Reader,
  data: GameData,
  value: unknown,
  path: string
): ConfigOverride {
  const sections = Object.keys(data.config).filter(
    (key) => key !== 'ai' && asObject(data.config[key as keyof GameData['config']]) !== null
  )
  const obj = r.object(value, path, sections)
  const override: ConfigOverride = {}
  for (const [section, fields] of Object.entries(obj)) {
    // Ép kiểu: section đã được checkKnownFields giới hạn trong các mục object của config.
    const current = data.config[section as keyof GameData['config']] as Record<string, unknown>
    override[section] = r.object(fields, `${path}.${section}`, Object.keys(current))
  }
  return override
}

function readAssumedMastery(r: Reader, value: unknown): AssumedMasterySpec {
  const obj = r.object(value, 'assumedMastery', ['expPerFloor'])
  return {
    expPerFloor: r.number(obj.expPerFloor, 'assumedMastery.expPerFloor', 0, Number.MAX_SAFE_INTEGER)
  }
}

function readAiOverride(r: Reader, data: GameData, value: unknown, path: string): Variant['ai'] {
  const aiObj = r.object(value, path, Object.keys(data.config.ai))
  const ai: Variant['ai'] = {}
  const readWeight = (weight: unknown, at: string): number | undefined => {
    const errors = checkNumber(weight, at, 0)
    r.issues.push(...errors)
    return errors.length === 0 ? (weight as number) : undefined
  }
  for (const [key, value] of Object.entries(aiObj)) {
    if (key === 'statusWeights') {
      const at = `${path}.statusWeights`
      const statusObj = r.object(value, at, Object.keys(data.config.ai.statusWeights))
      const statusWeights: Record<string, number> = {}
      for (const [statusId, weight] of Object.entries(statusObj)) {
        const checked = readWeight(weight, `${at}.${statusId}`)
        if (checked !== undefined) statusWeights[statusId] = checked
      }
      ai.statusWeights = statusWeights
      continue
    }
    const checked = readWeight(value, `${path}.${key}`)
    // Ép kiểu: key đã được checkKnownFields giới hạn trong các khóa của config.ai.
    if (checked !== undefined) ai[key as AiNumberKey] = checked
  }
  return ai
}

function readProgression(r: Reader, value: unknown, teams: readonly TeamSpec[]): ProgressionSpec {
  const obj = r.object(value, 'progression', PROGRESSION_FIELDS)
  const teamIds = r.array(obj.teamIds, 'progression.teamIds').map((id, i) => {
    const teamId = r.string(id, `progression.teamIds[${i}]`)
    if (teamId && !teams.some((team) => team.id === teamId)) {
      r.issues.push(`progression.teamIds[${i}]: không có đội "${teamId}"`)
    }
    return teamId
  })
  return {
    teamIds,
    bossPolicy: readBossPolicy(r, obj.bossPolicy),
    farm: obj.farm === undefined ? null : readFarm(r, obj.farm),
    maxBattles: r.integer(obj.maxBattles, 'progression.maxBattles', 1),
    genesFollowFloor:
      obj.genesFollowFloor === undefined
        ? false
        : r.boolean(obj.genesFollowFloor, 'progression.genesFollowFloor'),
    pillModes:
      obj.pillModes === undefined
        ? [true]
        : r
            .array(obj.pillModes, 'progression.pillModes')
            .map((mode, i) => r.boolean(mode, `progression.pillModes[${i}]`)),
    growthModes:
      obj.growthModes === undefined
        ? [true]
        : r
            .array(obj.growthModes, 'progression.growthModes')
            .map((mode, i) => r.boolean(mode, `progression.growthModes[${i}]`)),
    sweep: obj.sweep === undefined ? null : readProgressionSweep(r, obj.sweep)
  }
}

function readProgressionSweep(r: Reader, value: unknown): NonNullable<ProgressionSpec['sweep']> {
  const path = 'progression.sweep'
  const obj = r.object(value, path, ['wildBattles', 'bossBattles'])
  return {
    wildBattles: r.integer(obj.wildBattles, `${path}.wildBattles`, 0),
    bossBattles: r.integer(obj.bossBattles, `${path}.bossBattles`, 0)
  }
}

function readBossPolicy(r: Reader, value: unknown): BossPolicy {
  const path = 'progression.bossPolicy'
  const type = r.object(value, path).type
  if (type === 'everyWins') {
    const obj = r.object(value, path, ['type', 'wins'])
    return { type, wins: r.integer(obj.wins, `${path}.wins`, 0) }
  }
  if (type === 'levelTarget') {
    const obj = r.object(value, path, [
      'type',
      'marginStart',
      'marginStepOnLoss',
      'minWinsBetween',
      'maxMargin',
      'maxMarginPercent'
    ])
    const marginStart = r.integer(obj.marginStart, `${path}.marginStart`, -Number.MAX_SAFE_INTEGER)
    const maxMargin = r.integer(obj.maxMargin, `${path}.maxMargin`, -Number.MAX_SAFE_INTEGER)
    if (maxMargin < marginStart) r.issues.push(`${path}.maxMargin phải ≥ marginStart`)
    return {
      type,
      marginStart,
      marginStepOnLoss: r.integer(obj.marginStepOnLoss, `${path}.marginStepOnLoss`, 1),
      minWinsBetween: r.integer(obj.minWinsBetween, `${path}.minWinsBetween`, 0),
      maxMargin,
      maxMarginPercent:
        obj.maxMarginPercent === undefined
          ? 0
          : r.number(obj.maxMarginPercent, `${path}.maxMarginPercent`, 0, Number.MAX_SAFE_INTEGER)
    }
  }
  r.issues.push(`${path}.type phải là "everyWins" hoặc "levelTarget", nhận ${String(type)}`)
  return { type: 'everyWins', wins: 0 }
}

function readFarm(r: Reader, value: unknown): FarmSpec {
  const obj = r.object(value, 'progression.farm', ['window', 'dropBelow', 'returnAt'])
  const dropBelow = r.number(obj.dropBelow, 'progression.farm.dropBelow', 0, 100)
  const returnAt = r.number(obj.returnAt, 'progression.farm.returnAt', 0, 100)
  if (returnAt < dropBelow) r.issues.push('progression.farm.returnAt phải ≥ dropBelow')
  return { window: r.integer(obj.window, 'progression.farm.window', 1), dropBelow, returnAt }
}

function readBossLevelSearch(r: Reader, value: unknown): BossLevelSearchSpec {
  const obj = r.object(value, 'bossLevelSearch', ['targets', 'maxOffset', 'battles'])
  const targets = r
    .array(obj.targets, 'bossLevelSearch.targets')
    .map((target, i) => r.number(target, `bossLevelSearch.targets[${i}]`, 0, 100))
  if (targets.length === 0) r.issues.push('bossLevelSearch.targets phải có ít nhất một mục tiêu')
  return {
    targets,
    maxOffset: r.integer(obj.maxOffset, 'bossLevelSearch.maxOffset', 0),
    battles: r.integer(obj.battles, 'bossLevelSearch.battles', 1)
  }
}

function readTribulation(r: Reader, value: unknown, teams: readonly TeamSpec[]): TribulationSpec {
  const path = 'tribulation'
  const obj = r.object(value, path, ['teamId', 'tiers', 'levelOffsets', 'battles'])
  const teamId = r.string(obj.teamId, `${path}.teamId`)
  if (teamId && !teams.some((team) => team.id === teamId)) {
    r.issues.push(`${path}.teamId: không có đội "${teamId}"`)
  }
  const tiers = r
    .array(obj.tiers, `${path}.tiers`)
    .map((tier, i) => r.integer(tier, `${path}.tiers[${i}]`, 1))
  if (tiers.length === 0) r.issues.push(`${path}.tiers phải có ít nhất một tầng`)
  const levelOffsets = r
    .array(obj.levelOffsets, `${path}.levelOffsets`)
    // Level dưới mức cần thì không độ kiếp được: độ lệch ≥ 0.
    .map((offset, i) => r.integer(offset, `${path}.levelOffsets[${i}]`, 0))
  if (levelOffsets.length === 0) r.issues.push(`${path}.levelOffsets phải có ít nhất một mục`)
  return { teamId, tiers, levelOffsets, battles: r.integer(obj.battles, `${path}.battles`, 1) }
}

function readZones(
  r: Reader,
  data: GameData,
  value: unknown,
  teams: readonly TeamSpec[]
): ZoneSpec {
  const path = 'zones'
  const obj = r.object(value, path, ['teamId', 'runs', 'visits', 'supplies'])
  const teamId = r.string(obj.teamId, `${path}.teamId`)
  if (teamId && !teams.some((team) => team.id === teamId)) {
    r.issues.push(`${path}.teamId: không có đội "${teamId}"`)
  }
  const runs = r.array(obj.runs, `${path}.runs`).map((entry, i) => {
    const at = `${path}.runs[${i}]`
    const run = r.object(entry, at, ['zoneId', 'floors', 'leadSpeciesId'])
    const zoneId = r.string(run.zoneId, `${at}.zoneId`)
    if (zoneId && !Object.hasOwn(data.zones, zoneId)) {
      r.issues.push(`${at}.zoneId: không có hiểm địa "${zoneId}"`)
    }
    const floors = r
      .array(run.floors, `${at}.floors`)
      .map((floor, j) => r.integer(floor, `${at}.floors[${j}]`, 1))
    if (floors.length === 0) r.issues.push(`${at}.floors phải có ít nhất một tầng`)
    let leadSpeciesId: string | null = null
    if (run.leadSpeciesId !== undefined) {
      leadSpeciesId = r.string(run.leadSpeciesId, `${at}.leadSpeciesId`)
      if (leadSpeciesId && !Object.hasOwn(data.species, leadSpeciesId)) {
        r.issues.push(`${at}.leadSpeciesId: không có loài "${leadSpeciesId}"`)
      }
    }
    return { zoneId, floors, leadSpeciesId }
  })
  if (runs.length === 0) r.issues.push(`${path}.runs phải có ít nhất một hiểm địa`)
  return {
    teamId,
    runs,
    visits: r.integer(obj.visits, `${path}.visits`, 1),
    supplies: readZoneSupplies(r, data, obj.supplies)
  }
}

const GATHERING_RUN_METHODS = ['fishing', 'mining', 'wild'] as const

function readGatheringRun(r: Reader, data: GameData, value: unknown, at: string): GatheringRun {
  const run = r.object(value, at, ['id', 'method', 'toolItemId', 'lureItemId'])
  const id = r.string(run.id, `${at}.id`)
  const method = GATHERING_RUN_METHODS.find((known) => known === run.method)
  if (!method) r.issues.push(`${at}.method phải là ${GATHERING_RUN_METHODS.join(', ')}`)
  const item = (field: 'toolItemId' | 'lureItemId'): string | null => {
    if (run[field] === undefined) return null
    const itemId = r.string(run[field], `${at}.${field}`)
    if (itemId && !Object.hasOwn(data.items, itemId)) {
      r.issues.push(`${at}.${field}: không có vật phẩm "${itemId}"`)
    }
    return itemId
  }
  return {
    id,
    method: method ?? 'wild',
    toolItemId: item('toolItemId'),
    lureItemId: item('lureItemId')
  }
}

function readGathering(
  r: Reader,
  data: GameData,
  value: unknown,
  teams: readonly TeamSpec[]
): GatheringSpec {
  const path = 'gathering'
  const obj = r.object(value, path, ['teamId', 'floors', 'casts', 'runs'])
  const teamId = r.string(obj.teamId, `${path}.teamId`)
  if (teamId && !teams.some((team) => team.id === teamId)) {
    r.issues.push(`${path}.teamId: không có đội "${teamId}"`)
  }
  const floors = r
    .array(obj.floors, `${path}.floors`)
    .map((floor, i) => r.integer(floor, `${path}.floors[${i}]`, 1))
  if (floors.length === 0) r.issues.push(`${path}.floors phải có ít nhất một tầng`)
  const runs = r
    .array(obj.runs, `${path}.runs`)
    .map((entry, i) => readGatheringRun(r, data, entry, `${path}.runs[${i}]`))
  if (runs.length === 0) r.issues.push(`${path}.runs phải có ít nhất một cách chơi`)
  if (new Set(runs.map((run) => run.id)).size !== runs.length) {
    r.issues.push(`${path}.runs: id cách chơi bị trùng`)
  }
  return { teamId, floors, casts: r.integer(obj.casts, `${path}.casts`, 1), runs }
}

function readWorldBoss(r: Reader, value: unknown, teams: readonly TeamSpec[]): WorldBossSpec {
  const path = 'worldBoss'
  const obj = r.object(value, path, ['teamIds', 'floors', 'challenges'])
  const teamIds = r.array(obj.teamIds, `${path}.teamIds`).map((id, i) => {
    const teamId = r.string(id, `${path}.teamIds[${i}]`)
    if (teamId && !teams.some((team) => team.id === teamId)) {
      r.issues.push(`${path}.teamIds[${i}]: không có đội "${teamId}"`)
    }
    return teamId
  })
  if (teamIds.length === 0) r.issues.push(`${path}.teamIds phải có ít nhất một đội`)
  const floors = r
    .array(obj.floors, `${path}.floors`)
    .map((floor, i) => r.integer(floor, `${path}.floors[${i}]`, 1))
  if (floors.length === 0) r.issues.push(`${path}.floors phải có ít nhất một tầng`)
  return { teamIds, floors, challenges: r.integer(obj.challenges, `${path}.challenges`, 1) }
}

function readZoneSupplies(r: Reader, data: GameData, value: unknown): ZoneSupplies {
  const path = 'zones.supplies'
  const obj = r.object(value, path, [
    'reviveItemId',
    'revives',
    'healItemId',
    'heals',
    'healBelowPercent',
    'cureItemId',
    'cures'
  ])
  const item = (field: string): string => {
    const itemId = r.string(obj[field], `${path}.${field}`)
    if (itemId && !Object.hasOwn(data.items, itemId)) {
      r.issues.push(`${path}.${field}: không có vật phẩm "${itemId}"`)
    }
    return itemId
  }
  return {
    reviveItemId: item('reviveItemId'),
    revives: r.integer(obj.revives, `${path}.revives`, 0),
    healItemId: item('healItemId'),
    heals: r.integer(obj.heals, `${path}.heals`, 0),
    healBelowPercent: r.number(obj.healBelowPercent, `${path}.healBelowPercent`, 0, 100),
    cureItemId: item('cureItemId'),
    cures: r.integer(obj.cures, `${path}.cures`, 0)
  }
}

function readSafari(r: Reader, value: unknown): SafariSpec {
  const path = 'safari'
  const obj = r.object(value, path, ['floors', 'visits', 'policies'])
  const floors = r
    .array(obj.floors, `${path}.floors`)
    .map((floor, i) => r.integer(floor, `${path}.floors[${i}]`, 1))
  if (floors.length === 0) r.issues.push(`${path}.floors phải có ít nhất một tầng`)
  const policies = r.array(obj.policies, `${path}.policies`).flatMap((policy, i) => {
    const known = SAFARI_POLICIES.find((entry) => entry === policy)
    if (!known) r.issues.push(`${path}.policies[${i}]: cách chơi lạ "${String(policy)}"`)
    return known ? [known] : []
  })
  if (policies.length === 0) r.issues.push(`${path}.policies phải có ít nhất một cách chơi`)
  return { floors, visits: r.integer(obj.visits, `${path}.visits`, 1), policies }
}

function readBiomeSweep(r: Reader, value: unknown, teams: readonly TeamSpec[]): BiomeSweepSpec {
  const path = 'biomeSweep'
  const obj = r.object(value, path, ['teamIds', 'floors', 'wildBattles', 'bossBattles'])
  const teamIds = r.array(obj.teamIds, `${path}.teamIds`).map((id, i) => {
    const teamId = r.string(id, `${path}.teamIds[${i}]`)
    if (teamId && !teams.some((team) => team.id === teamId)) {
      r.issues.push(`${path}.teamIds[${i}]: không có đội "${teamId}"`)
    }
    return teamId
  })
  const floors = r
    .array(obj.floors, `${path}.floors`)
    .map((floor, i) => r.integer(floor, `${path}.floors[${i}]`, 1))
  if (teamIds.length === 0) r.issues.push(`${path}.teamIds phải có ít nhất một đội`)
  if (floors.length === 0) r.issues.push(`${path}.floors phải có ít nhất một tầng`)
  return {
    teamIds,
    floors,
    wildBattles: r.integer(obj.wildBattles, `${path}.wildBattles`, 0),
    bossBattles: r.integer(obj.bossBattles, `${path}.bossBattles`, 0)
  }
}

function readBreeding(r: Reader, value: unknown): BreedingSpec {
  const obj = r.object(value, 'breeding', BREEDING_FIELDS)
  return {
    speciesId: r.speciesId(obj.speciesId, 'breeding.speciesId'),
    floor: r.integer(obj.floor, 'breeding.floor', 1),
    measureLevel: r.integer(obj.measureLevel, 'breeding.measureLevel', 1),
    genes: r.genes(obj.genes, 'breeding.genes'),
    generations: r.integer(obj.generations, 'breeding.generations', 0),
    offspringPerGeneration: r.integer(
      obj.offspringPerGeneration,
      'breeding.offspringPerGeneration',
      1
    )
  }
}

function readFusion(r: Reader, value: unknown): FusionSpec {
  const obj = r.object(value, 'fusion', FUSION_FIELDS)
  return {
    speciesId: r.speciesId(obj.speciesId, 'fusion.speciesId'),
    floor: r.integer(obj.floor, 'fusion.floor', 1),
    level: r.integer(obj.level, 'fusion.level', 1),
    genes: r.genes(obj.genes, 'fusion.genes'),
    fusions: r.integer(obj.fusions, 'fusion.fusions', 0)
  }
}

function checkUniqueIds(r: Reader, entries: readonly { id: string }[], path: string): void {
  const seen = new Set<string>()
  for (const { id } of entries) {
    if (seen.has(id)) r.issues.push(`${path}: id "${id}" bị trùng`)
    seen.add(id)
  }
}

/** Trần số lượt theo loại trận. */
export function turnLimit(
  limits: Pick<Scenarios, 'maxTurns' | 'maxTurnsBoss'>,
  kind: BattleKind
): number {
  return kind === 'boss' ? limits.maxTurnsBoss : limits.maxTurns
}

/** Dữ liệu thô với config đã ghi đè theo biến thể; nơi gọi kiểm tra lại bằng createGameData. */
export function rawWithVariant(raw: RawGameData, variant: Variant): RawGameData {
  const config: Record<string, unknown> = { ...raw.config }
  for (const [section, fields] of Object.entries(variant.config)) {
    config[section] = { ...(asObject(config[section]) ?? {}), ...fields }
  }
  const base = raw.config.ai
  const statusWeights = { ...base.statusWeights, ...variant.ai.statusWeights }
  config.ai = { ...base, ...variant.ai, statusWeights }
  const skills = raw.skills.map((skill) => {
    const copy = { ...skill }
    for (const field of variant.withoutSkillFields) delete copy[field]
    // Tầm chiêu mặc định theo cờ tiếp xúc: tắt hẳn = mọi skill tầm xa.
    if (variant.withoutSkillFields.includes('reach')) copy.reach = 'ranged'
    return copy
  })
  const partnerSkills = variant.withoutPartnerSkills
    ? raw.partnerSkills.map((skill) => ({ ...skill, effects: [] }))
    : raw.partnerSkills
  // Ép kiểu: chỉ ghi đè khóa đã có của config; createGameData kiểm tra lại toàn bộ.
  return { ...raw, skills, partnerSkills, config: config as unknown as RawGameData['config'] }
}
