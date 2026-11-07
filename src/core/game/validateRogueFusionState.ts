// Kiểm tra GameState.rogueFusion (docs/rules/rogue-fusion.md): điềm báo (nến: loài, hệ; găng), cờ quà,
// loài khởi đầu không chọn.

import type { GameData } from '../model'
import { asObject } from '../shared'
import { checkKnownFields } from '../gameData'

/** Kiểm tra GameState.rogueFusion. */
export function validateRogueFusionState(data: GameData, value: unknown): string[] {
  const where = 'rogueFusion'
  const state = asObject(value)
  if (!state) return [`${where} phải là object`]
  const issues: string[] = []
  checkKnownFields(
    state,
    ['omen', 'houseGiftClaimed', 'questGiftClaimed', 'starterAlternatives'],
    where,
    'Rogue Fusion',
    issues
  )
  for (const field of ['houseGiftClaimed', 'questGiftClaimed']) {
    if (typeof state[field] !== 'boolean') issues.push(`${where}.${field} phải là boolean`)
  }
  const omen = asObject(state.omen)
  if (!omen) return [...issues, `${where}.omen phải là object`]
  checkKnownFields(omen, ['candle', 'hack'], `${where}.omen`, 'điềm báo', issues)
  if (typeof omen.hack !== 'boolean') issues.push(`${where}.omen.hack phải là boolean`)
  if (omen.candle !== null) {
    const candle = asObject(omen.candle)
    const speciesId = candle?.speciesId
    if (typeof speciesId !== 'string' || !Object.hasOwn(data.species, speciesId)) {
      issues.push(`${where}.omen.candle.speciesId: loài không tồn tại "${String(speciesId)}"`)
    }
    const elementId = candle?.elementId
    if (
      elementId !== null &&
      (typeof elementId !== 'string' || !Object.hasOwn(data.elements, elementId))
    ) {
      issues.push(`${where}.omen.candle.elementId phải là null hoặc id hệ`)
    }
  }
  const alternatives = state.starterAlternatives
  if (
    !Array.isArray(alternatives) ||
    alternatives.some((id) => typeof id !== 'string' || !Object.hasOwn(data.species, id))
  ) {
    issues.push(`${where}.starterAlternatives phải là danh sách id loài`)
  }
  return issues
}
