// Ấp trứng có hoàn cảnh (docs/rules/breeding-eggs.md mục "Ấp trứng có hoàn cảnh"): đặt linh thạch
// vào trứng, ấp ở linh địa (map có hệ của quái trong trứng), Ôn Dưỡng Lò tiến trứng khi nghỉ.
// Quái trong trứng đã random sẵn, nên mọi hiệu ứng áp thẳng vào quái bên trong ngay lúc xảy ra.

import { ActionError, BIG_ONE, maxBig, rollPercent, type RngState } from '../shared'
import { addShinyStacks, mapBigStats } from '../monster'
import { charmEffect } from '../registries'
import { removeItems } from '../inventory'
import type { Biome, Egg, GameData, GameState, Monster } from '../model'
import { roomSteps } from './hatchery'
import { mutateGenes } from './genes'

/** Hệ của linh thạch `itemId` (config.alchemy.elementStoneItemIds); không phải linh thạch thì null. */
export function spiritStoneElement(data: GameData, itemId: string): string | null {
  const entry = Object.entries(data.config.alchemy.elementStoneItemIds).find(
    ([, stoneId]) => stoneId === itemId
  )
  return entry ? entry[0] : null
}

/** Linh thạch cùng hệ: mọi gen × (1 + genePercentPerInfusion %), làm tròn xuống, ít nhất +1. */
function boostGenes(data: GameData, monster: Monster): Monster {
  const percent = data.config.egg.incubation.genePercentPerInfusion
  const genes = mapBigStats((stat) => {
    const gene = monster.genes[stat]
    return gene.plus(maxBig(BIG_ONE, gene.times(percent).div(100).floor()))
  })
  return { ...monster, genes }
}

/** Linh thạch khác hệ: hệ Tera = hệ đó (loài có hệ Tera cố định thì giữ nguyên). */
function infuseTera(data: GameData, monster: Monster, elementId: string): Monster {
  const species = data.species[monster.speciesId]
  if (species?.kind === 'normal' && species.teraElementId !== undefined) return monster
  return { ...monster, teraElementId: elementId }
}

/**
 * Hiệu ứng một linh thạch hệ `elementId` lên quái trong trứng: cùng hệ thì tăng gen, khác hệ thì đổi
 * hệ Tera; tung thêm tỉ lệ shiny khi quái chưa shiny. Dùng cho infuseEgg và script mô phỏng.
 */
export function infuseMonster(
  data: GameData,
  rng: RngState,
  monster: Monster,
  elementId: string
): [Monster, RngState] {
  let infused = monster.elementIds.includes(elementId)
    ? boostGenes(data, monster)
    : infuseTera(data, monster, elementId)
  if (infused.shinyStacks === 0) {
    let shiny: boolean
    ;[shiny, rng] = rollPercent(rng, data.config.egg.incubation.infusionShinyChance)
    if (shiny) infused = addShinyStacks(data, infused, 1)
  }
  return [infused, rng]
}

/**
 * Đặt 1 linh thạch vào trứng (ngoài trận): cùng hệ với quái trong trứng thì tăng gen, khác hệ thì
 * đổi hệ Tera (lần đặt cuối thắng); mọi linh thạch cho thêm tỉ lệ ra shiny (tung ngay, chỉ khi quái
 * chưa shiny). Tối đa maxInfusions mỗi trứng.
 */
export function infuseEgg(
  data: GameData,
  state: GameState,
  { eggId, itemId }: { eggId: string; itemId: string }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const egg = state.eggs.find((candidate) => candidate.id === eggId)
  if (!egg) throw new ActionError('eggNotFound', { eggId })
  const elementId = spiritStoneElement(data, itemId)
  if (elementId === null) throw new ActionError('notSpiritStone', { itemId })
  const { maxInfusions } = data.config.egg.incubation
  if (egg.infusions.length >= maxInfusions) {
    throw new ActionError('eggInfusionsFull', { eggId, max: maxInfusions })
  }
  const inventory = removeItems(state.inventory, itemId, 1)
  const [monster, rng] = infuseMonster(data, state.rng, egg.monster, elementId)
  const infused: Egg = { ...egg, monster, infusions: [...egg.infusions, elementId] }
  return {
    ...state,
    rng,
    inventory,
    eggs: state.eggs.map((candidate) => (candidate === egg ? infused : candidate))
  }
}

/** Map là linh địa của trứng: có chung hệ với quái trong trứng. */
export function isSpiritLand(biome: Biome, egg: Egg): boolean {
  return (biome.elementIds ?? []).some((id) => egg.monster.elementIds.includes(id))
}

/**
 * Một trận thắng trôi qua ở map `biome`: mỗi trứng giảm `steps` bước; trứng ở linh địa giảm thêm
 * spiritLandExtraSteps và tung đột biến (chỉ tốn RNG với trứng ở linh địa). Tách trứng đến lúc nở.
 */
export function incubateEggs(
  data: GameData,
  rng: RngState,
  {
    eggs,
    steps,
    biome,
    room
  }: {
    eggs: readonly Egg[]
    steps: number
    biome: Biome
    /** Phòng ấp và tinh chất (docs/rules/hatchery.md): trứng trong phòng nhân bước theo sức lớn. */
    room?: Pick<GameState, 'hatchery' | 'essences' | 'storage'>
  }
): { eggs: Egg[]; hatched: Egg[]; rng: RngState } {
  const roomState = room ? { ...room, eggs } : undefined
  const { spiritLandExtraSteps, spiritLandMutationChance } = data.config.egg.incubation
  const remaining: Egg[] = []
  const hatched: Egg[] = []
  for (const egg of eggs) {
    let next = egg
    let amount = steps
    if (roomState) [amount, rng] = roomSteps(data, rng, { state: roomState, egg, steps })
    if (isSpiritLand(biome, egg)) {
      amount += spiritLandExtraSteps
      let mutated: boolean
      ;[mutated, rng] = rollPercent(rng, spiritLandMutationChance)
      if (mutated) {
        let genes: Monster['genes']
        ;[genes, rng] = mutateGenes(data, rng, egg.monster.genes)
        next = { ...egg, monster: { ...egg.monster, genes } }
      }
    }
    const battlesLeft = Math.max(0, egg.battlesLeft - amount)
    if (battlesLeft === 0) hatched.push({ ...next, battlesLeft })
    else remaining.push({ ...next, battlesLeft })
  }
  return { eggs: remaining, hatched, rng }
}

/**
 * Nghỉ với bùa kiểu Ôn Dưỡng Lò (`restEggSteps`): mọi trứng tiến thêm số bước đó nhưng dừng ở 1
 * (trứng chỉ nở sau trận thắng, nơi xử lý chỗ trong đội / kho).
 */
export function warmEggsAtRest(data: GameData, state: GameState): GameState {
  const steps = charmEffect(data, state.inventory, 'restEggSteps')
  if (steps === 0) return state
  const eggs = state.eggs.map((egg) =>
    egg.battlesLeft > 1 ? { ...egg, battlesLeft: Math.max(1, egg.battlesLeft - steps) } : egg
  )
  return { ...state, eggs }
}
