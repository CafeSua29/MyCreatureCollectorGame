// Z-Crystal (docs/rules/z-moves.md): crystal quái đang cầm, crystal hợp với một skill, crystal rơi từ
// boss và crystal của quái NPC. Luật dùng Z-Move trong trận ở battle/zMoves.ts.

import {
  isBattleOnlyMove,
  type GameData,
  type Monster,
  type Skill,
  type ZCrystalItem
} from '../model'

/** Z-Crystal quái đang lắp ở ô đồ cầm, theo thứ tự ô. */
export function heldZCrystals(data: GameData, monster: Monster): ZCrystalItem[] {
  return monster.equipment.flatMap((entry) => {
    if (entry.storage !== 'stack') return []
    const item = data.items[entry.itemId]
    return item?.category === 'zCrystal' ? [item] : []
  })
}

/**
 * Crystal loài hợp quái: đúng loài hiện tại hoặc dạng biến hình đang có (Ultra Necrozma sau Ultra
 * Burst), quái không fuse (như đá Mega).
 */
function fitsSpecies(crystal: ZCrystalItem, monster: Monster): boolean {
  if (monster.fused) return false
  const transform = monster.battleTransform
  const formId = transform && !transform.ended ? transform.formSpeciesId : undefined
  return [monster.speciesId, formId].some(
    (id) => id !== undefined && crystal.speciesIds?.includes(id)
  )
}

/**
 * Crystal quái đang cầm cho skill thành Z-Move: crystal loài (quái đúng loài, skill là skill gốc
 * của crystal) xét trước crystal hệ (cùng hệ gốc của skill, như Pokémon: không theo môi trường).
 * Chiêu chỉ có trong trận (chiêu Max, Z-Move) không thành Z-Move. undefined = không có.
 */
export function zCrystalFor(
  data: GameData,
  monster: Monster,
  skill: Skill
): ZCrystalItem | undefined {
  if (isBattleOnlyMove(skill)) return undefined
  const crystals = heldZCrystals(data, monster)
  return (
    crystals.find((crystal) => crystal.baseSkillId === skill.id && fitsSpecies(crystal, monster)) ??
    crystals.find((crystal) => crystal.elementId === skill.elementId)
  )
}

/** Crystal loài của loài `speciesId` (crystal rơi từ boss), theo thứ tự dữ liệu. */
export function signatureZCrystalsOf(data: GameData, speciesId: string): ZCrystalItem[] {
  return Object.values(data.items).filter(
    (item): item is ZCrystalItem =>
      item.category === 'zCrystal' && (item.speciesIds?.includes(speciesId) ?? false)
  )
}

/** Crystal hệ của hệ `elementId` (undefined nếu dữ liệu không có). */
export function elementZCrystalOf(data: GameData, elementId: string): ZCrystalItem | undefined {
  return Object.values(data.items).find(
    (item): item is ZCrystalItem => item.category === 'zCrystal' && item.elementId === elementId
  )
}

/**
 * Crystal nên cầm để quái dùng Z-Move (quái NPC, docs/rules/trainers.md; người chơi tự chọn), không
 * tốn RNG: crystal loài nếu quái biết skill gốc của nó; không thì crystal hệ `preferredElementId`
 * (hệ đạo quán) nếu quái biết skill gây sát thương hệ đó; không thì crystal hệ của skill gây sát
 * thương power cao nhất. `isAvailable`: chỉ xét crystal có sẵn (trong túi). undefined = không có
 * crystal nào hợp.
 */
export function pickZCrystalFor(
  data: GameData,
  monster: Monster,
  {
    preferredElementId,
    isAvailable = () => true
  }: { preferredElementId?: string; isAvailable?: (crystal: ZCrystalItem) => boolean } = {}
): ZCrystalItem | undefined {
  const signature = signatureZCrystalsOf(data, monster.speciesId).find(
    (crystal) =>
      crystal.baseSkillId !== undefined &&
      fitsSpecies(crystal, monster) &&
      monster.skillIds.includes(crystal.baseSkillId) &&
      isAvailable(crystal)
  )
  if (signature) return signature
  const attacks = monster.skillIds
    .map((id) => data.skills[id])
    .filter((skill) => skill.power > 0 && !isBattleOnlyMove(skill))
    .sort((a, b) => b.power - a.power)
  const preferred = attacks.find((skill) => skill.elementId === preferredElementId)
  for (const skill of preferred ? [preferred, ...attacks] : attacks) {
    const crystal = elementZCrystalOf(data, skill.elementId)
    if (crystal && isAvailable(crystal)) return crystal
  }
  return undefined
}
