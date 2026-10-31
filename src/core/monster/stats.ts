// Hàm DUY NHẤT tính chỉ số quái. Thứ tự (xem CLAUDE.md):
//   (gốc loài pha huyết mạch + gen × geneWeight) × độ lệch race × bossMultiplier × hệ số thức tỉnh
//     (gốc pha huyết mạch: max(gốc, (1 − p) × gốc + p × gốc tổ), docs/rules/bloodline.md)
//   → × (1 + (level − 1) × growth[race][stat])
//   → + fusingBonusStats
//   → áp trait: cộng tổng flat, rồi nhân (1 + tổng percent / 100; percent cộng mọi nguồn của
//     STAT_PERCENT_SOURCES: trait, trang bị, trạng thái...), rồi cộng chỉ số thẳng trong
//     trận (flatStats của trait Siralim; max HP đổi trong trận battleMaxHpDelta)
//   → nhân hệ số trạng thái bất thường (ví dụ tê liệt: tốc độ × 0,5; còn cả ngoài trận)
//   → nhân hệ số môi trường (chỉ trong trận; ví dụ bão cát: thủ đặc biệt hệ đá × 1,5; hiệu ứng
//     theo phe của quái như Tailwind: tốc độ × 2), rồi room đổi thủ ↔ thủ đặc biệt (Wonder Room)
//   → biến hình (chỉ trong trận; Dynamax: max HP × hệ số theo cấp Dynamax; hợp thể: gộp với chỉ số
//     cùng bước của quái phụ, docs/rules/battle-merge.md)
//   → áp bậc tăng/giảm trong trận
// Giá trị trung gian giữ số thực (Decimal, docs/rules/big-numbers.md); chỉ bước final làm tròn
// xuống. Bậc trận nhân tử số rồi chia mẫu số (không nhân phân số đã làm tròn như 2/3).
// Bước trait và final có sàn 1 (trait bất lợi cấp cao không đẩy chỉ số về 0 hay âm).
// Mega: chỉ số gốc lấy từ loài dạng Mega thay cho loài gốc ở bước đầu (mục "Mega" ở
// transformation.md); mọi bước sau giữ nguyên.
// Shiny KHÔNG nhân vào chỉ số gốc: shiny chỉ tăng chỉ số một lần, qua trait "Ánh kim" ở bước
// áp trait (mục Thứ tự tính chỉ số). Hệ số shinyMultiplier chỉ dùng cho phần thưởng.

import { assertValidMonster, getBaseSpecies } from './validateMonster'
import { statusStatMultipliers } from './status'
import { isGrounded } from './grounded'
import { awakeningStatMultiplier } from './awakening'
import {
  areDefensesSwapped,
  fieldStatMultipliers,
  forEachTraitHook,
  HOOK_SOURCE_GROUPS,
  STAT_PERCENT_SOURCES,
  sizeStatMultiplier,
  type TraitContext,
  bloodlineBaseStats
} from '../registries'
import { DataError, maxBig, toBig, type BigValue, type Decimal } from '../shared'
import {
  STAT_NAMES,
  STAT_PERCENT_SOURCE_IDS,
  mergePartnerOf,
  type StatPercentSourceId,
  type BalanceConfig,
  type BattleField,
  type BattleSide,
  type BattleStages,
  type BattleTransform,
  type BigStats,
  type GameData,
  type Monster,
  type NormalSpecies,
  type MonsterBattleContext,
  type StatBreakdown,
  type StatName,
  type Stats
} from '../model'

export interface ComputeStatsOptions {
  /** Bậc trong trận; bỏ trống = 0. Giá trị ngoài [min, max] của config bị kẹp lại. */
  stages?: BattleStages
  /** Môi trường của trận; bỏ trống = ngoài trận (không có bước môi trường). */
  field?: BattleField
  /** Phe của quái trong trận, để tính hiệu ứng theo phe; bỏ trống = chỉ môi trường toàn sân. */
  side?: BattleSide
  /** Bối cảnh trận của quái (trait theo lượt trên sân, theo đồng đội); bỏ trống = không có. */
  battle?: MonsterBattleContext
}

/** Tạo bộ chỉ số number từ hàm cho từng chỉ số. */
export function mapStats(fn: (stat: StatName) => number): Stats {
  const result = {} as Stats
  for (const stat of STAT_NAMES) result[stat] = fn(stat)
  return result
}

/** Tạo bộ chỉ số Decimal từ hàm cho từng chỉ số. */
export function mapBigStats(fn: (stat: StatName) => Decimal): BigStats {
  const result = {} as BigStats
  for (const stat of STAT_NAMES) result[stat] = fn(stat)
  return result
}

/** Bộ chỉ số Decimal mọi chỉ số bằng value (ví dụ fusingBonusStats = 0 của quái mới). */
export function uniformBigStats(value: BigValue): BigStats {
  const big = toBig(value)
  return mapBigStats(() => big)
}

interface TraitModifiers {
  flat: Stats
  /** Tổng % của mọi nguồn. */
  percent: Stats
  percentBySource: Record<StatPercentSourceId, Stats>
  /** Có hook cần tỉ lệ máu (lượt này chưa có tỉ lệ máu thì phải tính lại). */
  needsHpRatio: boolean
}

function emptyPercentBySource(): Record<StatPercentSourceId, Stats> {
  const result = {} as Record<StatPercentSourceId, Stats>
  for (const id of STAT_PERCENT_SOURCE_IDS) result[id] = mapStats(() => 0)
  return result
}

/**
 * Tổng flat và percent của mọi hook trait có tác dụng lên quái (forEachTraitHook: trait, trang bị,
 * trạng thái, minion, hào quang của quái khác trên sân), đã nhân hệ số; trong trận thêm % chỉ số theo
 * bối cảnh (contextStatPercent: bộ đếm, điều kiện của trait Siralim). % gom theo nguồn
 * (STAT_PERCENT_SOURCES), cộng cả nguồn không đi qua hook.
 */
function sumTraitModifiers(data: GameData, ctx: TraitContext): TraitModifiers {
  const flat = mapStats(() => 0)
  const percentBySource = emptyPercentBySource()
  let needsHpRatio = false
  const addPercent = (source: StatPercentSourceId, stats: Partial<Stats>): void => {
    for (const stat of STAT_NAMES) percentBySource[source][stat] += stats[stat] ?? 0
  }
  const battle = ctx.battle
  // View chỉ dựng trong trận: điều kiện theo máu gọi getMaxHp (computeStats không bối cảnh), nên
  // không được chạy khi đang tính max HP ngoài trận (sẽ gọi lại chính nó).
  const view = battle ? { data, self: ctx.monster, selfCtx: battle } : undefined
  // Hợp thể: hook của quái phụ đã nằm trong chỉ số riêng của nó (mergeStep), không tính lần nữa.
  forEachTraitHook(
    data,
    ctx.monster,
    (handler, params, scale, _sourceId, hookSource) => {
      if (handler.needsHpRatio) needsHpRatio = true
      const source = HOOK_SOURCE_GROUPS[hookSource.kind]
      const modifier = handler.modifyStats?.(params, scale, ctx)
      if (modifier) {
        for (const stat of STAT_NAMES) flat[stat] += modifier.flat[stat] ?? 0
        addPercent(source, modifier.percent)
      }
      if (view && handler.contextStatPercent)
        addPercent(source, handler.contextStatPercent(params, scale, view))
    },
    battle,
    { withMergePartner: false }
  )
  for (const id of STAT_PERCENT_SOURCE_IDS) {
    const direct = STAT_PERCENT_SOURCES[id].percent?.(data, ctx.monster)
    if (direct) addPercent(id, direct)
  }
  const percent = mapStats((stat) =>
    STAT_PERCENT_SOURCE_IDS.reduce((sum, id) => sum + percentBySource[id][stat], 0)
  )
  return { flat, percent, percentBySource, needsHpRatio }
}

/** Chỉ số cộng thẳng trong trận (flatStats) và max HP đổi trong trận (battleMaxHpDelta). */
function battleFlatStats(monster: Monster, battle: MonsterBattleContext | undefined): BigStats {
  const flatStats = battle?.volatiles[monster.id]?.flatStats ?? {}
  return mapBigStats((stat) => {
    if (stat === 'hp') return monster.battleMaxHpDelta ?? toBig(0)
    return flatStats[stat] ?? toBig(0)
  })
}

const applyTraits = (
  withFusingBonus: BigStats,
  traits: TraitModifiers,
  battleFlat: BigStats
): BigStats =>
  mapBigStats((stat) =>
    maxBig(
      1,
      withFusingBonus[stat]
        .plus(traits.flat[stat])
        .times(toBig(traits.percent[stat]).div(100).plus(1))
        .plus(battleFlat[stat])
    )
  )

/**
 * Bước trait. Trait theo máu cần max HP, mà max HP là kết quả của chính bước này: tính một lượt
 * không có tỉ lệ máu (hook theo máu không tác dụng, và hook có điều kiện không được đổi HP nên HP
 * đã đúng), rồi nếu có hook cần tỉ lệ máu thì tính lại với tỉ lệ máu từ HP đó.
 */
function traitStep(
  data: GameData,
  monster: Monster,
  withFusingBonus: BigStats,
  options: ComputeStatsOptions
): { withTraits: BigStats; percentBySource: Record<StatPercentSourceId, Stats> } {
  const { field, battle } = options
  const ctx: TraitContext = {
    data,
    monster,
    field,
    grounded: field !== undefined && isGrounded(data, monster, field),
    battle
  }
  const battleFlat = battleFlatStats(monster, battle)
  const first = sumTraitModifiers(data, ctx)
  const withTraits = applyTraits(withFusingBonus, first, battleFlat)
  if (!first.needsHpRatio) return { withTraits, percentBySource: first.percentBySource }
  const maxHp = withTraits.hp
  const hpRatio = maxBig(0, maxHp.minus(monster.damageTaken)).div(maxHp).toNumber()
  const second = sumTraitModifiers(data, { ...ctx, hpRatio })
  return {
    withTraits: applyTraits(withFusingBonus, second, battleFlat),
    percentBySource: second.percentBySource
  }
}

/** Hệ số bậc trận dạng phân số [tử, mẫu]: (base + s) / base khi s ≥ 0, base / (base − s) khi s < 0. */
export function stageRatio(
  config: BalanceConfig,
  stage: number,
  base: number = config.battleStage.base
): [number, number] {
  const { min, max } = config.battleStage
  const clamped = Math.min(max, Math.max(min, Math.trunc(stage)))
  return clamped >= 0 ? [base + clamped, base] : [base, base - clamped]
}

/**
 * Hệ số tỉ lệ trúng theo bậc (như Pokémon): bậc chính xác của quái dùng trừ bậc né của mục tiêu, kẹp
 * trong giới hạn bậc, (3 + s) / 3 hoặc 3 / (3 − s).
 */
export function accuracyStageFactor(
  config: BalanceConfig,
  { accuracy = 0, evasion = 0 }: { accuracy?: number; evasion?: number }
): number {
  const [numerator, denominator] = stageRatio(
    config,
    accuracy - evasion,
    config.battleStage.accuracyBase
  )
  return numerator / denominator
}

/**
 * Tính chỉ số của quái, trả về kết quả sau từng bước.
 * Ném DataError nếu quái không hợp lệ so với dữ liệu game. Không sửa monster.
 */
export function computeStats(
  data: GameData,
  monster: Monster,
  options: ComputeStatsOptions = {}
): StatBreakdown {
  assertValidMonster(data, monster)
  const { config } = data
  const species = statSpecies(data, monster)
  // assertValidMonster đã kiểm tra baseSpeciesId là loài thường; guard để TypeScript biết chắc.
  if (!species) throw new DataError([`Loài gốc không tồn tại "${monster.baseSpeciesId}"`])
  const { base, leveled, withFusingBonus } = coreSteps(data, monster, species)

  const { withTraits, percentBySource } = traitStep(data, monster, withFusingBonus, options)

  const statusMultipliers = statusStatMultipliers(data, monster)
  const withStatuses = mapBigStats((stat) => withTraits[stat].times(statusMultipliers[stat]))

  const fieldMultipliers =
    options.field && fieldStatMultipliers(data, options.field, monster, options.side)
  const multiplied = fieldMultipliers
    ? mapBigStats((stat) => withStatuses[stat].times(fieldMultipliers[stat]))
    : withStatuses
  // Wonder Room đổi giá trị hai chỉ số thủ; bậc trận vẫn theo tên chỉ số (như Pokémon).
  const withField =
    options.field && areDefensesSwapped(data, options.field)
      ? { ...multiplied, defense: multiplied.spDefense, spDefense: multiplied.defense }
      : multiplied

  // Quái lớn (docs/rules/monster-size.md) nhân chỉ số cùng bước với max HP của Dynamax.
  const hpMultiplier = transformHpMultiplier(config, monster)
  const merged = mergeStep(data, monster, withField, options)
  const withTransform = mapBigStats((stat) => {
    const factor = (stat === 'hp' ? hpMultiplier : 1) * sizeStatMultiplier(data, monster, stat)
    return factor === 1 ? merged[stat] : merged[stat].times(factor)
  })

  const stages = options.stages ?? {}
  const final = mapBigStats((stat) => {
    const [numerator, denominator] = stageRatio(config, stat === 'hp' ? 0 : (stages[stat] ?? 0))
    return maxBig(1, withTransform[stat].times(numerator).div(denominator).floor())
  })

  return {
    base,
    leveled,
    withFusingBonus,
    withTraits,
    percentBySource,
    withStatuses,
    withField,
    withTransform,
    final
  }
}

/**
 * Hợp thể (docs/rules/battle-merge.md): gộp chỉ số tới bước môi trường của quái chính với của quái
 * phụ (tính cùng bối cảnh trận, chịu trạng thái của thực thể): HP cộng, chỉ số khác = cao hơn +
 * lowerSharePercent % thấp hơn. Bậc trận áp sau, lên thực thể. Không hợp thể thì giữ nguyên.
 */
function mergeStep(
  data: GameData,
  monster: Monster,
  withField: BigStats,
  { field, side, battle }: ComputeStatsOptions
): BigStats {
  const partner = mergePartnerOf(monster)
  if (!partner) return withField
  const other = computeStats(
    data,
    { ...partner, statuses: monster.statuses },
    { field, side, battle }
  ).withField
  const share = data.config.transform.merge.lowerSharePercent / 100
  return mapBigStats((stat) => {
    const [own, partnerStat] = [withField[stat], other[stat]]
    if (stat === 'hp') return own.plus(partnerStat)
    const [high, low] = own.gte(partnerStat) ? [own, partnerStat] : [partnerStat, own]
    return high.plus(low.times(share))
  })
}

/** Kết quả ba bước đầu (gốc, level, fuse) và đúng các đầu vào của chúng. */
interface CoreStepsEntry {
  data: GameData
  species: NormalSpecies
  raceId: string
  bossMultiplier: number
  awakening: number
  bloodlines: Monster['bloodlines']
  level: number
  genes: BigStats
  fusingBonusStats: BigStats
  steps: CoreSteps
}

interface CoreSteps {
  base: BigStats
  leveled: BigStats
  withFusingBonus: BigStats
}

/**
 * Nhớ ba bước đầu theo gen HP (Decimal bất biến, cloneData giữ nguyên tham chiếu nên vẫn trúng sau
 * khi chép state); chỉ dùng lại khi mọi đầu vào trùng (số bằng giá trị, Decimal bằng tham chiếu).
 * Các bước này chỉ là phép nhân Decimal nhưng chạy ở mỗi lần tính chỉ số nên rất nóng.
 */
const coreStepsCache = new WeakMap<Decimal, CoreStepsEntry>()

const sameBigStats = (a: BigStats, b: BigStats): boolean =>
  STAT_NAMES.every((stat) => a[stat] === b[stat])

function coreSteps(data: GameData, monster: Monster, species: NormalSpecies): CoreSteps {
  const cached = coreStepsCache.get(monster.genes.hp)
  if (
    cached &&
    cached.data === data &&
    cached.species === species &&
    cached.raceId === monster.raceId &&
    cached.bossMultiplier === monster.bossMultiplier &&
    cached.awakening === monster.awakening &&
    cached.bloodlines === monster.bloodlines &&
    cached.level === monster.level &&
    sameBigStats(cached.genes, monster.genes) &&
    sameBigStats(cached.fusingBonusStats, monster.fusingBonusStats)
  ) {
    // Bản sao nông: nơi gọi nhận object riêng như khi tính mới.
    const { base, leveled, withFusingBonus } = cached.steps
    return { base: { ...base }, leveled: { ...leveled }, withFusingBonus: { ...withFusingBonus } }
  }
  const steps = computeCoreSteps(data, monster, species)
  coreStepsCache.set(monster.genes.hp, {
    data,
    species,
    raceId: monster.raceId,
    bossMultiplier: monster.bossMultiplier,
    awakening: monster.awakening,
    bloodlines: monster.bloodlines,
    level: monster.level,
    genes: { ...monster.genes },
    fusingBonusStats: { ...monster.fusingBonusStats },
    steps: {
      base: { ...steps.base },
      leveled: { ...steps.leveled },
      withFusingBonus: { ...steps.withFusingBonus }
    }
  })
  return steps
}

/** Gốc loài + gen × geneWeight, nhân race / boss / thức tỉnh → nhân level → cộng fuse. */
function computeCoreSteps(data: GameData, monster: Monster, species: NormalSpecies): CoreSteps {
  const { config } = data
  const race = data.races[monster.raceId]
  // Thức tỉnh nhân ở bước gốc cùng bossMultiplier (docs/rules/awakening.md).
  const awakeningMultiplier = awakeningStatMultiplier(config.awakening, monster.awakening)
  const speciesBase = bloodlineBaseStats(data, monster, species.baseStats)

  const base = mapBigStats((stat) =>
    monster.genes[stat]
      .times(config.geneWeight)
      .plus(speciesBase[stat])
      .times(race.statBias[stat])
      .times(monster.bossMultiplier)
      .times(awakeningMultiplier)
  )

  const leveled = mapBigStats((stat) =>
    base[stat].times(
      toBig(monster.level - 1)
        .times(race.growth[stat])
        .plus(1)
    )
  )

  const withFusingBonus = mapBigStats((stat) => leveled[stat].plus(monster.fusingBonusStats[stat]))
  return { base, leveled, withFusingBonus }
}

/** Biến hình đang có tác dụng (chưa kết thúc) của quái; undefined = không biến hình. */
export function activeTransform(monster: Monster): BattleTransform | undefined {
  const transform = monster.battleTransform
  return transform && !transform.ended ? transform : undefined
}

/**
 * Loài cho chỉ số gốc: dạng Mega khi đang Mega, rồi dạng trong trận (docs/rules/battle-forms.md),
 * không thì loài gốc (baseSpeciesId).
 */
function statSpecies(data: GameData, monster: Monster): NormalSpecies | undefined {
  const transform = activeTransform(monster)
  if ((transform?.kind === 'mega' || transform?.kind === 'ultraBurst') && transform.formSpeciesId) {
    const form = data.species[transform.formSpeciesId]
    if (form?.kind === 'normal') return form
  }
  const battleForm = monster.battleForm && data.species[monster.battleForm.speciesId]
  if (battleForm?.kind === 'normal') return battleForm
  return getBaseSpecies(data, monster)
}

/** Hệ số max HP của biến hình: Dynamax × (base + perLevel × cấp Dynamax), còn lại 1. */
export function transformHpMultiplier(config: BalanceConfig, monster: Monster): number {
  if (activeTransform(monster)?.kind !== 'dynamax') return 1
  const { hpMultiplierBase, hpMultiplierPerLevel } = config.transform.dynamax
  return hpMultiplierBase + hpMultiplierPerLevel * monster.dynamaxLevel
}
