// Hồn phách (docs/rules/soul-relics.md): quái chết hẳn (tọa hóa, độ kiếp thất bại lần cuối) để lại
// hồn phách trong túi. Điểm duy nhất cho mọi cái chết vĩnh viễn: dieForever.

import { aptitudeOf } from '../registries'
import { addSoul, returnEquipment } from '../inventory'
import {
  usesTraitSlot,
  type DeathCause,
  type GameData,
  type Inventory,
  type Monster,
  type SoulRemnant
} from '../model'
import { addMilestone } from './history'

/** Lúc chết: tầng mốc tư chất (tầng cao nhất), ngày, kiểu chết. */
export interface DeathInfo {
  aptitudeFloor: number
  day: number
  cause: DeathCause
}

/** Hồn phách của quái vừa chết hẳn: ảnh chụp các trường cần cho trứng truyền thừa / hồn khí. */
export function createSoul(data: GameData, monster: Monster, death: DeathInfo): SoulRemnant {
  const withDeath = addMilestone(data, monster, {
    day: death.day,
    kind: 'died',
    cause: death.cause
  })
  return {
    id: monster.id,
    speciesId: monster.speciesId,
    baseSpeciesId: monster.baseSpeciesId,
    raceId: monster.raceId,
    nickname: monster.nickname,
    level: monster.level,
    genes: { ...monster.genes },
    traits: monster.traits
      .filter((trait) => usesTraitSlot(data.traits[trait.id].kind))
      .map((trait) => ({ ...trait })),
    shinyStacks: monster.shinyStacks,
    contractRealm: monster.contractRealm,
    aptitudeTierId: aptitudeOf(data, monster, death.aptitudeFloor).tier.id,
    history: withDeath.history
  }
}

/**
 * Quái chết hẳn: đồ đang lắp về túi, hồn phách vào túi. Nơi gọi tự bỏ quái khỏi đội / kho và xử lý
 * bản mệnh.
 */
export function dieForever(
  data: GameData,
  inventory: Inventory,
  monster: Monster,
  death: DeathInfo
): Inventory {
  return addSoul(returnEquipment(inventory, monster), createSoul(data, monster, death))
}
