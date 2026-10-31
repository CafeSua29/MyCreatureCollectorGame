// Kiểm tra dữ liệu hồn khí (docs/rules/soul-relics.md): config.soulRelic, mỗi chỉ số đúng một món gốc
// hồn khí (luyện hồn khí cần món gốc theo chỉ số gốc cao nhất của quái). Luật riêng của từng món gốc
// ở checkEquipmentItem (validateEquipment.ts).

import { EQUIPMENT_RARITIES, STAT_NAMES, type GameData } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

/** config.soulRelic: giá luyện; bảng bậc theo tư chất đủ mọi bậc tư chất, giá trị là bậc trang bị. */
function checkSoulRelicConfig(data: GameData, issues: string[]): void {
  const field = 'config.soulRelic'
  const config = asObject(data.config.soulRelic)
  if (!config) {
    issues.push(`${field} phải là object`)
    return
  }
  checkKnownFields(config, ['forgeCostPerLevel', 'rarityByAptitude'], field, 'config', issues)
  issues.push(...checkNumber(config.forgeCostPerLevel, `${field}.forgeCostPerLevel`, 0))
  const table = asObject(config.rarityByAptitude)
  if (!table) {
    issues.push(`${field}.rarityByAptitude phải là object bậc tư chất → bậc trang bị`)
    return
  }
  for (const tierId of Object.keys(data.aptitudeTiers)) {
    if (table[tierId] === undefined) issues.push(`${field}.rarityByAptitude thiếu bậc "${tierId}"`)
  }
  for (const [tierId, rarity] of Object.entries(table)) {
    if (!Object.hasOwn(data.aptitudeTiers, tierId)) {
      issues.push(`${field}.rarityByAptitude: bậc tư chất không tồn tại "${tierId}"`)
    }
    if (!EQUIPMENT_RARITIES.some((entry) => entry === rarity)) {
      issues.push(
        `${field}.rarityByAptitude.${tierId}: bậc trang bị không hợp lệ "${String(rarity)}"`
      )
    }
  }
}

/** Kiểm tra dữ liệu hồn khí. */
export function checkSoulRelicData(data: GameData, issues: string[]): void {
  checkSoulRelicConfig(data, issues)
  for (const stat of STAT_NAMES) {
    const bases = Object.values(data.items).filter(
      (item) => item.category === 'equipment' && item.soulRelicStat === stat
    )
    if (bases.length !== 1) {
      issues.push(
        `Hồn khí: cần đúng một món gốc có soulRelicStat "${stat}" (đang có ${bases.length})`
      )
    }
  }
}
