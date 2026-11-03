// Công thức theo cảnh giới ngự thú sư (docs/rules/tamer.md): EXP cần, giá đột phá, tỉ lệ thành
// công, linh lực, giới hạn level và số ô khế ước, tên cảnh giới. Số ở config.tamer.

import { toBig, type Decimal } from '../shared'
import type { BattleTamer, GameData, TamerSkill } from '../model'

/** EXP cần để đột phá từ cảnh giới `realm` lên `realm + 1` = expBase × (realm + 1)^expPower. */
export function expToNextRealm(data: GameData, realm: number): Decimal {
  const { expBase, expPower } = data.config.tamer
  return toBig(expBase)
    .times(toBig(realm + 1).pow(expPower))
    .ceil()
}

/** Tiền đột phá từ cảnh giới `realm` = costBase × (realm + 1)². */
export function breakthroughCost(data: GameData, realm: number): Decimal {
  return toBig(data.config.tamer.breakthrough.costBase)
    .times(toBig(realm + 1).pow(2))
    .ceil()
}

/** Số nguyên liệu đột phá (Phá Cảnh Đan) cần từ cảnh giới `realm` = realm + 1. */
export const breakthroughItemCount = (realm: number): number => realm + 1

/** % thành công khi đột phá từ cảnh giới `realm` = max(minChance, baseChance − realm × chanceStep). */
export function breakthroughChance(data: GameData, realm: number): number {
  const { baseChance, chanceStep, minChance } = data.config.tamer.breakthrough
  return Math.max(minChance, baseChance - realm * chanceStep)
}

/** Linh lực tối đa ở cảnh giới `realm` (đầy lại mỗi đầu trận). */
export function maxMana(data: GameData, realm: number): number {
  const { manaBase, manaPerRealm } = data.config.tamer
  return manaBase + manaPerRealm * realm
}

/**
 * Level cao nhất khế ước được ở cảnh giới `realm` = ⌊(levelBase + levelPerRealm × realm) × (1 +
 * levelPercent / 100)⌋ (`levelPercent`: kênh thưởng `contractLevelPercent`, docs/rules/
 * tamer-talents.md). Bắt bằng bóng không giới hạn level.
 */
export function contractLevelLimit(data: GameData, realm: number, levelPercent = 0): number {
  const { levelBase, levelPerRealm } = data.config.tamer.contract
  return Math.floor((levelBase + levelPerRealm * realm) * Math.max(0, 1 + levelPercent / 100))
}

/** Cảnh giới thấp nhất khế ước được quái level `level` (cùng `levelPercent` với contractLevelLimit). */
export function realmToContract(data: GameData, level: number, levelPercent = 0): number {
  const { levelBase, levelPerRealm } = data.config.tamer.contract
  const factor = 1 + levelPercent / 100
  if (contractLevelLimit(data, 0, levelPercent) >= level) return 0
  // levelPerRealm = 0 hoặc hệ số ≤ 0: không cảnh giới nào khế ước được; trả về số lớn nhất an toàn.
  if (levelPerRealm <= 0 || factor <= 0) return Number.MAX_SAFE_INTEGER
  let realm = Math.max(0, Math.ceil((level / factor - levelBase) / levelPerRealm))
  // Chỉnh lệch làm tròn số thực: realm là số nhỏ nhất có giới hạn ≥ level.
  while (realm > 0 && contractLevelLimit(data, realm - 1, levelPercent) >= level) realm--
  while (contractLevelLimit(data, realm, levelPercent) < level) realm++
  return realm
}

/** Số quái khế ước tối đa ở cảnh giới `realm` = slotsBase + slotsPerRealm × realm. */
export function maxContracts(data: GameData, realm: number): number {
  const { slotsBase, slotsPerRealm } = data.config.tamer.contract
  return slotsBase + slotsPerRealm * realm
}

/**
 * Tên cảnh giới: id tên trong tamerRealms.json và phần "+ n" khi vượt tên cuối (cảnh giới 12 với 10
 * tên = tên cuối + 3). UI ghép chữ theo ngôn ngữ (contentName 'tamerRealms').
 */
export function tamerRealmTitle(data: GameData, realm: number): { realmId: string; plus: number } {
  const ids = Object.keys(data.tamerRealms)
  const last = ids.length - 1
  return realm <= last
    ? { realmId: ids[realm], plus: 0 }
    : { realmId: ids[last], plus: realm - last }
}

/** Kỹ năng ngự thú sư đã mở ở cảnh giới `realm`, theo thứ tự dữ liệu. */
export function unlockedTamerSkills(data: GameData, realm: number): TamerSkill[] {
  return Object.values(data.tamerSkills).filter((skill) => skill.unlockRealm <= realm)
}

/** Phần EXP của ngự thú sư: percent% EXP gốc của trận, làm tròn xuống (không âm). */
export function tamerExpShare(battleExp: Decimal, percent: number): Decimal {
  return battleExp.times(percent).div(100).floor()
}

/**
 * Ngự thú sư của một phe lúc vào trận: linh lực đầy, chưa hồi chiêu, chưa dùng kỹ năng nào.
 * `skillIds`: kỹ năng được dùng (ngự thú sư NPC); null = mọi kỹ năng đã mở. `manaBonusPercent`: %
 * linh lực tối đa cộng thêm (kênh thưởng `manaPercent`, docs/rules/tamer-talents.md). `manaPercent`:
 * linh lực đầu trận còn % này của tối đa (đạo thương, mục "Bản mệnh thú"); mặc định đầy. `manaRealm`:
 * cảnh giới tính linh lực khi khác cảnh giới mở kỹ năng (sau phi thăng, docs/rules/ascension.md).
 */
export function newBattleTamer(
  data: GameData,
  realm: number,
  {
    skillIds = null,
    manaBonusPercent = 0,
    manaPercent = 100,
    manaRealm = realm
  }: {
    skillIds?: string[] | null
    manaBonusPercent?: number
    manaPercent?: number
    manaRealm?: number
  } = {}
): BattleTamer {
  const max = Math.floor(maxMana(data, manaRealm) * Math.max(0, 1 + manaBonusPercent / 100))
  const mana = Math.floor((max * manaPercent) / 100)
  return { realm, mana, cooldowns: {}, uses: {}, skillIds }
}
