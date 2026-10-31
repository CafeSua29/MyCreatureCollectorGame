// Shiny: shinyStacks và trait shiny luôn đi cùng nhau.
// - shinyStacks = 0: không có trait shiny.
// - shinyStacks = N > 0: có đúng trait config.shiny.traitId ở cấp N.
// Mọi nơi làm quái thành shiny (quái hoang, breeding, fusing) đều dùng addShinyStacks.

import { toBig, type Decimal } from '../shared'
import type { GameData, Monster } from '../model'

/** Cộng thêm stacks vào shinyStacks và đặt cấp trait shiny cho khớp. */
export function addShinyStacks(data: GameData, monster: Monster, stacks: number): Monster {
  const shinyStacks = monster.shinyStacks + stacks
  const traitId = data.config.shiny.traitId
  const others = monster.traits.filter((t) => t.id !== traitId)
  return {
    ...monster,
    shinyStacks,
    traits: shinyStacks > 0 ? [...others, { id: traitId, level: shinyStacks }] : others
  }
}

/** Hệ số thưởng từ shiny: shinyMultiplier^shinyStacks (Decimal vì stacks cộng dồn không trần). */
export function shinyFactor(data: GameData, monster: Monster): Decimal {
  return toBig(data.config.shinyMultiplier).pow(monster.shinyStacks)
}

/** Kiểm tra shinyStacks và trait shiny khớp nhau. Trả về danh sách lỗi. */
export function checkShinyConsistency(data: GameData, monster: Monster): string[] {
  const issues: string[] = []
  const traitId = data.config.shiny.traitId
  const shinyTraits = monster.traits.filter((t) => data.traits[t.id]?.kind === 'shiny')
  for (const trait of shinyTraits) {
    if (trait.id !== traitId)
      issues.push(`trait shiny phải là "${traitId}", không phải "${trait.id}"`)
  }
  const own = monster.traits.find((t) => t.id === traitId)
  if (monster.shinyStacks > 0 && own?.level !== monster.shinyStacks) {
    issues.push(
      `quái shiny ×${monster.shinyStacks} phải có trait "${traitId}" cấp ${monster.shinyStacks}`
    )
  }
  if (monster.shinyStacks === 0 && own) {
    issues.push(`quái không shiny không được có trait "${traitId}"`)
  }
  return issues
}
