// Rogue Fusion (docs/rules/rogue-fusion.md, Rogue Fusion của Cassette Beasts): trận trên tầng với hai
// quái hoang đã hợp thể sẵn (hợp thể `rogue`: không hết lượt, bị hạ thì tan ra). Biến thể Flood /
// Swarm / Orb, thành phần Bootleg, điềm báo của Ritual Candle / Hacking Glove, thưởng Fused Material.

import { getMaxHp, isFainted, rollBootleg, withBootleg, bootlegElementChoices } from '../monster'
import { isLargeMonster } from '../registries'
import { evolveMonster } from '../progression'
import { BIG_ZERO, pick, pickWeighted, rollPercent, type RngState } from '../shared'
import {
  ROGUE_FUSION_VARIANTS,
  dayOf,
  type GameData,
  type GameState,
  type Monster,
  type RogueFusionVariant
} from '../model'
import { battleBiome, generateWildMonster, type FloorSite } from '../world'
import { Draft, cloneDraft, findMonster, log, slotsOf } from './draft'
import { applyMerge, mergePairOf, unmerge } from './merge'
import { enterFieldTogether } from './environment'
import { openBattle } from './openBattle'
import { addItems } from '../inventory'

/** Bối cảnh sinh thành phần: map / tầng, loài đã gặp (Dex), ngày, nến đang thắp. */
interface ComponentContext {
  data: GameData
  site: FloorSite
  seen: readonly string[]
  day: number
  candle: GameState['rogueFusion']['omen']['candle']
}

/** Tung có gặp Rogue Fusion không (tỉ lệ 0 không tốn RNG). */
export const rollRogueFusionStart = (data: GameData, rng: RngState): [boolean, RngState] =>
  rollPercent(rng, data.config.rogueFusion.chance)

/** Hệ ngập của map (Flood Fusion): hệ chủ đạo của map thuộc floodElementIds; null nếu không có. */
const floodElementsOf = (data: GameData, site: FloorSite): string[] =>
  (site.biome.elementIds ?? []).filter((id) => data.config.rogueFusion.floodElementIds.includes(id))

/** Biến thể theo trọng số trong các biến thể có được (Flood cần map ngập, Orb cần tầng mở khóa). */
function rollVariant(
  data: GameData,
  rng: RngState,
  { site, highestFloor }: { site: FloorSite; highestFloor: number }
): [RogueFusionVariant, RngState] {
  const config = data.config.rogueFusion
  const allowed = ROGUE_FUSION_VARIANTS.filter((variant) => {
    if (config.variantWeights[variant] <= 0) return false
    if (variant === 'flood') return floodElementsOf(data, site).length > 0
    if (variant === 'orb') return highestFloor >= config.orbUnlockFloor
    return true
  })
  if (allowed.length === 0) return ['standard', rng]
  return pickWeighted(rng, allowed, (variant) => config.variantWeights[variant])
}

/** Map giả có một loài: sinh quái loài đó với level / gen / độ khó như quái hoang của tầng. */
const siteWithSpecies = (site: FloorSite, speciesId: string): FloorSite => ({
  ...site,
  biome: { ...site.biome, encounters: [{ speciesId, weight: 1 }] }
})

/** Loài thường đã gặp (Dex) có thể làm thành phần. */
function seenSpeciesIds(data: GameData, seen: readonly string[]): string[] {
  return seen.filter((id) => data.species[id]?.kind === 'normal')
}

/**
 * Một thành phần: quái hoang của map (hoặc loài `speciesId`), `seenSpeciesChance` % đổi thành loài đã
 * gặp, `remaster` % tiến hóa lên dạng kế tiếp (gốc: remaster).
 */
function rollComponent(
  ctx: ComponentContext,
  rng: RngState,
  { id, speciesId, remasterChance }: { id: string; speciesId?: string; remasterChance: number }
): [Monster, RngState] {
  const { data } = ctx
  let site = speciesId ? siteWithSpecies(ctx.site, speciesId) : ctx.site
  if (!speciesId) {
    const seen = seenSpeciesIds(data, ctx.seen)
    let fromDex: boolean
    ;[fromDex, rng] = rollPercent(
      rng,
      seen.length > 0 ? data.config.rogueFusion.seenSpeciesChance : 0
    )
    if (fromDex) {
      let picked: string
      ;[picked, rng] = pick(rng, seen)
      site = siteWithSpecies(ctx.site, picked)
    }
  }
  let monster: Monster
  ;[monster, rng] = generateWildMonster(data, rng, site, id)
  const species = data.species[monster.speciesId]
  const targets = species?.kind === 'normal' ? species.evolutions.map((e) => e.speciesId) : []
  let remaster: boolean
  ;[remaster, rng] = rollPercent(rng, targets.length > 0 ? remasterChance : 0)
  if (!remaster) return [monster, rng]
  let toSpeciesId: string
  ;[toSpeciesId, rng] = pick(rng, targets)
  const evolved = evolveMonster(data, monster, { toSpeciesId, rng, day: ctx.day })
  return [evolved.monster, evolved.rng]
}

/** Loài thường gặp ở các map mang hệ `elementId` (thành phần ngập của Flood Fusion). */
function floodSpeciesIds(data: GameData, elementId: string): string[] {
  const ids = new Set<string>()
  for (const biome of Object.values(data.biomes)) {
    for (const entry of biome.encounters) {
      const species = data.species[entry.speciesId]
      if (species?.kind === 'normal' && species.elementIds.includes(elementId)) ids.add(species.id)
    }
  }
  return [...ids]
}

/** Thành phần thứ `index` thành Bootleg hệ ngẫu nhiên (loài không còn hệ khác thì giữ nguyên). */
function makeBootleg(
  data: GameData,
  rng: RngState,
  components: Monster[],
  index: number
): [Monster[], RngState] {
  const species = data.species[components[index].speciesId]
  if (species?.kind !== 'normal') return [components, rng]
  const [elementId, next] = rollBootleg(data, rng, { species, chance: 100 })
  const result = [...components]
  result[index] = withBootleg(result[index], elementId)
  return [result, next]
}

/** Kết quả sinh thành phần: hai quái, RNG, bộ đếm id, điềm báo đã dùng. */
interface ComponentsResult {
  components: Monster[]
  rng: RngState
  nextMonsterId: number
  usedCandle: boolean
}

/**
 * Hai thành phần của biến thể: Flood có một quái ngập cùng hệ map (Bootleg 5% ở chính nó), Swarm có
 * một quái bầy (`swarmSpeciesId`, remaster 50%) cùng một quái khác của map hoặc chính loài đó; Bootleg
 * theo `bootlegChances`, rồi Hacking Glove (đè) hoặc Ritual Candle.
 */
export function rollComponents(
  ctx: ComponentContext,
  state: Pick<GameState, 'rng' | 'nextMonsterId' | 'rogueFusion'>,
  { variant, swarmSpeciesId }: { variant: RogueFusionVariant; swarmSpeciesId?: string }
): ComponentsResult {
  const { data } = ctx
  const config = data.config.rogueFusion
  let { rng, nextMonsterId } = state
  const nextId = (): string => `m${nextMonsterId++}`
  const components: Monster[] = []
  const [first, afterFirst] = rollComponent(ctx, rng, {
    id: nextId(),
    speciesId: swarmSpeciesId,
    remasterChance: swarmSpeciesId ? config.swarmRemasterChance : config.remasterChance
  })
  rng = afterFirst
  components.push(first)
  let secondSpecies: string | undefined
  if (variant === 'flood') {
    let elementId: string
    ;[elementId, rng] = pick(rng, floodElementsOf(data, ctx.site))
    const pool = floodSpeciesIds(data, elementId)
    if (pool.length > 0) [secondSpecies, rng] = pick(rng, pool)
  }
  const [second, afterSecond] = rollComponent(ctx, rng, {
    id: nextId(),
    speciesId: secondSpecies,
    remasterChance: config.remasterChance
  })
  components.push(second)
  let result = components
  const [bootleg, afterBootleg] = rollPercent(afterSecond, config.bootlegChances[variant])
  rng = afterBootleg
  if (bootleg) {
    let index = 1
    if (variant !== 'flood') [index, rng] = pick(rng, [0, 1])
    ;[result, rng] = makeBootleg(data, rng, result, index)
  }
  const omen = state.rogueFusion.omen
  let usedCandle = false
  if (omen.hack) {
    let index: number
    ;[index, rng] = pick(rng, [0, 1])
    ;[result, rng] = makeBootleg(data, rng, result, index)
  } else if (omen.candle) {
    usedCandle = true
    ;[result, rng, nextMonsterId] = applyCandle(ctx, { rng, nextMonsterId }, result)
  }
  return { components: result, rng, nextMonsterId, usedCandle }
}

/**
 * Ritual Candle: `candleSpeciesPercent` % thành phần đầu thay bằng loài quái đã hiến, Bootleg hệ ngẫu
 * nhiên; còn lại một thành phần (loài không mang hệ đó) thành Bootleg đúng hệ đầu của quái đã hiến.
 */
function applyCandle(
  ctx: ComponentContext,
  { rng, nextMonsterId }: { rng: RngState; nextMonsterId: number },
  components: Monster[]
): [Monster[], RngState, number] {
  const { data } = ctx
  const candle = ctx.candle
  if (!candle) return [components, rng, nextMonsterId]
  let bySpecies: boolean
  ;[bySpecies, rng] = rollPercent(
    rng,
    candle.elementId === null ? 100 : data.config.rogueFusion.candleSpeciesPercent
  )
  if (bySpecies && data.species[candle.speciesId]?.kind === 'normal') {
    let replaced: Monster
    ;[replaced, rng] = rollComponent(ctx, rng, {
      id: components[0].id,
      speciesId: candle.speciesId,
      remasterChance: 0
    })
    return [...makeBootleg(data, rng, [replaced, components[1]], 0), nextMonsterId]
  }
  const elementId = candle.elementId
  const index = components.findIndex((monster) => {
    const species = data.species[monster.speciesId]
    return (
      elementId !== null &&
      species?.kind === 'normal' &&
      bootlegElementChoices(data, species).includes(elementId)
    )
  })
  if (index < 0 || elementId === null) return [components, rng, nextMonsterId]
  const result = [...components]
  result[index] = withBootleg(result[index], elementId)
  return [result, rng, nextMonsterId]
}

/**
 * Hợp thể Rogue Fusion phe địch (hai quái hoang trên sân): như hợp thể thường nhưng không hết lượt,
 * không tính lượt hợp thể của phe; Orb thêm trạng thái quả cầu (Barrier `orbBarrierPercent` % max HP,
 * HP cao hơn, skill không tốn thể lực như Archangel).
 */
export function rogueMerge(data: GameData, d: Draft, variant: RogueFusionVariant): void {
  if (!mergePairOf(data, d, 'enemy')) return
  applyMerge(data, d, 'enemy')
  d.battle.transformsUsed.enemy = d.battle.transformsUsed.enemy.filter((kind) => kind !== 'merge')
  const leadId = slotsOf(d.battle, 'enemy')[0]
  if (!leadId) return
  const lead = findMonster(d, leadId)
  const transform = lead.battleTransform
  if (transform) {
    const { turnsLeft: _turnsLeft, ...rest } = transform
    lead.battleTransform = { ...rest, rogue: true }
  }
  if (variant !== 'orb') return
  const { orbStatusId, orbBarrierPercent } = data.config.rogueFusion
  lead.statuses = [...lead.statuses, { statusId: orbStatusId, turnsLeft: null }]
  const amount = getMaxHp(data, lead).times(orbBarrierPercent).div(100).floor()
  lead.statuses = lead.statuses.map((status) =>
    status.statusId === orbStatusId ? { ...status, amount } : status
  )
}

/**
 * Rogue Fusion bị hạ (gọi từ loseHp khi thực thể vừa gục): tan ra như gốc, hai thành phần hồi đầy máu
 * về ô của mình, mỗi trạng thái của thực thể về ngẫu nhiên một thành phần (trừ quả cầu), cả hai chùn
 * bước lượt sau. Trả true nếu đã tan (không gục).
 */
export function dissolveRogueFusion(data: GameData, d: Draft, lead: Monster): boolean {
  if (lead.battleTransform?.rogue !== true || lead.battleTransform.ended) return false
  const partnerId = lead.battleTransform.mergePartner?.monster.id
  if (!partnerId) return false
  const { orbStatusId, flinchStatusId } = data.config.rogueFusion
  const statuses = lead.statuses.filter((status) => status.statusId !== orbStatusId)
  lead.damageTaken = BIG_ZERO
  lead.statuses = []
  unmerge(data, d, lead, { placePartner: true })
  const partner = findMonster(d, partnerId)
  partner.damageTaken = BIG_ZERO
  partner.statuses = []
  for (const status of statuses) {
    let owner: Monster
    ;[owner, d.rng] = pick(d.rng, [lead, partner])
    owner.statuses = [...owner.statuses, status]
  }
  for (const monster of [lead, partner]) {
    // 2 lần cuối lượt: còn qua cuối lượt này, có tác dụng ở lượt sau như gốc.
    monster.statuses = [...monster.statuses, { statusId: flinchStatusId, turnsLeft: 2 }]
  }
  log(d, { type: 'rogueFusionDissolved', monsterId: lead.id, partnerId })
  return true
}

/**
 * Swarm (gọi khi phân xử cuối lượt): đã hạ ít nhất `swarmFusionAfter` quái bầy thì quái bầy còn lại bỏ
 * đi, hợp thể xuất hiện (một thành phần là loài bầy). Trả true nếu vừa xuất hiện.
 */
export function spawnSwarmFusion(data: GameData, d: Draft): boolean {
  const special = d.battle.special
  if (special?.kind !== 'rogueFusion' || !special.swarmPending) return false
  const defeated = d.battle.enemies.filter((enemy) => isFainted(data, enemy)).length
  if (defeated < data.config.rogueFusion.swarmFusionAfter) return false
  const swarmSpeciesId = d.battle.enemies[0]?.speciesId
  // Quái bầy còn sống bỏ đi (không tính là bị hạ, không thưởng).
  d.battle.enemies = d.battle.enemies.filter((enemy) => isFainted(data, enemy))
  d.battle.enemySlots = d.battle.enemySlots.map(() => null)
  const site: FloorSite = {
    floor: d.battle.floor,
    biome: battleBiome(data, d, d.battle),
    aging: d.options.lifespanEnabled,
    time: d.time,
    difficulty: d.battle.difficulty,
    randomizer: d.options.randomizer
  }
  const ctx = componentContext(data, d, site)
  const rolled = rollComponents(ctx, d, { variant: 'swarm', swarmSpeciesId })
  d.rng = rolled.rng
  d.nextMonsterId = rolled.nextMonsterId
  d.battle.enemies = [...d.battle.enemies, ...rolled.components]
  enterFieldTogether(
    data,
    d,
    'enemy',
    rolled.components.map((monster, slot) => ({ slot, monster }))
  )
  rogueMerge(data, d, 'swarm')
  d.battle.special = { ...special, swarmPending: false }
  log(d, { type: 'rogueFusionAppeared', monsterId: rolled.components[0].id, variant: 'swarm' })
  return true
}

/** Bối cảnh sinh thành phần từ state. */
const componentContext = (data: GameData, state: GameState, site: FloorSite): ComponentContext => ({
  data,
  site,
  seen: state.dex.seen,
  day: dayOf(state.time),
  candle: state.rogueFusion.omen.candle
})

/**
 * Mở trận Rogue Fusion trên tầng (thay trận hoang thường): biến thể, thành phần (Swarm: bầy
 * `swarmSize` quái trước), hợp thể; điềm báo hết (nến chỉ hết khi được dùng, găng luôn hết). Thành
 * phần là quái lớn thì null (nơi gọi mở trận thường).
 */
export function openRogueFusion(
  data: GameData,
  state: GameState,
  { site, rng }: { site: FloorSite; rng: RngState }
): GameState | null {
  let variant: RogueFusionVariant
  ;[variant, rng] = rollVariant(data, rng, { site, highestFloor: state.highestFloor })
  const ctx = componentContext(data, state, site)
  if (variant === 'swarm') return openSwarm(data, state, { site, rng, ctx })
  const rolled = rollComponents(ctx, { ...state, rng }, { variant })
  if (rolled.components.some((monster) => isLargeMonster(data, monster))) return null
  const omen = {
    candle: rolled.usedCandle ? null : state.rogueFusion.omen.candle,
    hack: false
  }
  const opened = openBattle(
    data,
    {
      ...state,
      rng: rolled.rng,
      nextMonsterId: rolled.nextMonsterId,
      rogueFusion: { ...state.rogueFusion, omen }
    },
    {
      site,
      encounter: {
        enemies: rolled.components,
        isBoss: false,
        rng: rolled.rng,
        nextMonsterId: rolled.nextMonsterId
      },
      special: { kind: 'rogueFusion', variant, swarmPending: false }
    }
  )
  const d = cloneDraft(opened)
  rogueMerge(data, d, variant)
  log(d, { type: 'rogueFusionAppeared', monsterId: rolled.components[0].id, variant })
  return d
}

/** Swarm: trận với `swarmSize` quái bầy cùng loài của map; hợp thể xuất hiện sau (spawnSwarmFusion). */
function openSwarm(
  data: GameData,
  state: GameState,
  { site, rng, ctx }: { site: FloorSite; rng: RngState; ctx: ComponentContext }
): GameState | null {
  let first: Monster
  let nextMonsterId = state.nextMonsterId
  ;[first, rng] = generateWildMonster(data, rng, site, `m${nextMonsterId++}`)
  if (isLargeMonster(data, first)) return null
  const swarm: Monster[] = [first]
  const swarmSite = siteWithSpecies(ctx.site, first.speciesId)
  for (let i = 1; i < data.config.rogueFusion.swarmSize; i++) {
    let monster: Monster
    ;[monster, rng] = generateWildMonster(data, rng, swarmSite, `m${nextMonsterId++}`)
    swarm.push(monster)
  }
  return openBattle(
    data,
    { ...state, rng, nextMonsterId },
    {
      site,
      encounter: { enemies: swarm, isBoss: false, rng, nextMonsterId },
      special: { kind: 'rogueFusion', variant: 'swarm', swarmPending: true }
    }
  )
}

/**
 * Thưởng khi thắng trận Rogue Fusion: `fusedMaterial[biến thể]` Fused Material, `cyberChances` % một
 * Cyber Material; lần đầu có Cyber Material thì nhận Hacking Glove (gốc: Codey tặng).
 */
export function grantRogueFusionRewards(
  data: GameData,
  d: Draft,
  variant: RogueFusionVariant
): void {
  const config = data.config.rogueFusion
  const fused = config.fusedMaterial[variant]
  if (fused > 0) d.inventory = addItems(d.inventory, config.fusedMaterialItemId, fused)
  let cyber: boolean
  ;[cyber, d.rng] = rollPercent(d.rng, config.cyberChances[variant])
  if (!cyber) return
  d.inventory = addItems(d.inventory, config.cyberMaterialItemId, 1)
  if ((d.inventory.stacks[config.hackingGloveItemId] ?? 0) === 0) {
    d.inventory = addItems(d.inventory, config.hackingGloveItemId, 1)
    log(d, { type: 'hackingGloveGained' })
  }
}

/** Fused Material khi hạ boss (gốc: trận tĩnh). */
export function grantBossFusedMaterial(data: GameData, d: Draft): void {
  const { bossFusedMaterial, fusedMaterialItemId } = data.config.rogueFusion
  if (bossFusedMaterial > 0)
    d.inventory = addItems(d.inventory, fusedMaterialItemId, bossFusedMaterial)
}
