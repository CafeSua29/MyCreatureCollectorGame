// Thọ nguyên và tuổi (mục "Tuổi và thọ nguyên" ở lifespan.md). Điểm DUY NHẤT tính thọ nguyên,
// % đã sống, giai đoạn tuổi và hiệu ứng của nó; mọi thứ tính từ chính quái + dữ liệu (tuổi lưu trên
// quái: ageDays, aging) nên dùng được ở mọi nơi, kể cả bước % chỉ số của computeStats.
//
// Thọ nguyên (năm) = lifespan loài gốc × (1 + level cao nhất × levelPercent / 100)
//                    × tích các hệ số LIFESPAN_MODIFIERS + lifespanBonusYears.
// Mục sau thêm hệ số của mình (thức tỉnh, hóa hình, cảnh giới ngự thú sư, huyết mạch...) bằng một
// mục trong LIFESPAN_MODIFIERS, số đặt dưới khóa config của chính mục đó.

import { assertNever, DataError, maxBig, toBig, type Decimal } from '../shared'
import type { AgeStage, GameData, Monster } from '../model'
import { forEachTraitHook } from './traitHooks'
import { percentToMultiplier } from './traitHookUtils'

/** Hệ số nhân thọ nguyên của một nguồn (1 = không đổi; Decimal khi có thể lớn vô hạn). */
export type LifespanModifier = (data: GameData, monster: Monster) => number | Decimal

/** % thọ nguyên từ hook của quái (trait, trait race, trang bị...), cộng dồn. */
function traitLifespanMultiplier(data: GameData, monster: Monster): number {
  let percent = 0
  forEachTraitHook(data, monster, (handler, params, scale) => {
    percent += handler.lifespanPercent?.(params, scale) ?? 0
  })
  return percentToMultiplier(percent)
}

/** Mọi hệ số nhân thọ nguyên (nhân với nhau). */
export const LIFESPAN_MODIFIERS: Readonly<Record<string, LifespanModifier>> = {
  /** Boss bắt về sống lâu theo bossMultiplier. */
  boss: (_data, monster) => monster.bossMultiplier,
  traits: traitLifespanMultiplier,
  /** Khế ước (docs/rules/tamer.md): phần gốc + "đột phá tăng tuổi thọ"; chưa khế ước = 1. */
  contract: (data, monster) =>
    monster.contractRealm === null
      ? 1
      : 1 +
        (data.config.tamer.contract.baseLifespanPercent +
          monster.contractRealm * data.config.tamer.lifespanPercentPerRealm) /
          100,
  /** Bản mệnh thú (docs/rules/tamer.md mục "Bản mệnh thú"). */
  bond: (data, monster) => (monster.bond ? data.config.bond.lifespanMultiplier : 1),
  /** Tầng thức tỉnh (docs/rules/awakening.md): lifespanMultiplier ^ tầng, không trần. */
  awakening: (data, monster) =>
    toBig(data.config.awakening.lifespanMultiplier).pow(monster.awakening),
  /** Đã hóa hình, cả khi đang ở bản thể (docs/rules/human-form.md). */
  humanForm: (data, monster) =>
    monster.humanForm === 'locked' ? 1 : data.config.humanForm.lifespanMultiplier
}

/** Thọ nguyên gốc (năm) của loài gốc; loài thiếu thọ nguyên là dữ liệu hỏng. */
function speciesLifespan(data: GameData, monster: Monster): number {
  const species = data.species[monster.baseSpeciesId]
  if (species?.kind !== 'normal' || species.lifespan === undefined) {
    throw new DataError([`Loài "${monster.baseSpeciesId}" không có thọ nguyên`])
  }
  return species.lifespan
}

/** Thọ nguyên của quái (năm, Decimal, không trần). */
export function lifespanYears(data: GameData, monster: Monster): Decimal {
  const { levelPercent } = data.config.lifespan
  const multiplier = Object.values(LIFESPAN_MODIFIERS).reduce(
    (product: Decimal, modifier) => product.times(modifier(data, monster)),
    toBig(1)
  )
  // Level cao nhất từng đạt (luân hồi / phi thăng reset level không làm thọ nguyên tụt); lấy cả level
  // hiện tại phòng khi level được đặt thẳng (quái mẫu của mô phỏng, test).
  const level = Math.max(monster.level, monster.maxLevelReached)
  return toBig(speciesLifespan(data, monster))
    .times(toBig(level).times(levelPercent).div(100).plus(1))
    .times(multiplier)
    .plus(monster.lifespanBonusYears)
}

const lifespanDays = (data: GameData, monster: Monster): Decimal =>
  lifespanYears(data, monster).times(data.config.lifespan.daysPerYear)

/** Tuổi (năm, có phần lẻ) của quái. */
export const ageYears = (data: GameData, monster: Monster): Decimal =>
  toBig(monster.ageDays).div(data.config.lifespan.daysPerYear)

/** Số năm còn lại trước khi thọ tận (≥ 0). */
export const yearsLeft = (data: GameData, monster: Monster): Decimal =>
  maxBig(0, lifespanYears(data, monster).minus(ageYears(data, monster)))

/** % thọ nguyên đã sống (≥ 0; thọ nguyên 0 coi như đã sống hết 100%). */
export function lifePercent(data: GameData, monster: Monster): number {
  const total = lifespanDays(data, monster)
  if (total.lte(0)) return 100
  return toBig(monster.ageDays).div(total).times(100).toNumber()
}

/** Đã hết thọ nguyên (tuổi ≥ thọ nguyên); quái không già đi (tắt thọ nguyên) thì không bao giờ. */
export const hasReachedLifespanEnd = (data: GameData, monster: Monster): boolean =>
  monster.aging && toBig(monster.ageDays).gte(lifespanDays(data, monster))

/** Giai đoạn tuổi theo % thọ nguyên đã sống. */
function stageAt(data: GameData, percent: number): AgeStage {
  const { youngBelowPercent, oldFromPercent } = data.config.lifespan
  if (percent < youngBelowPercent) return 'young'
  return percent >= oldFromPercent ? 'old' : 'adult'
}

/** Giai đoạn tuổi; null khi quái không già đi (tắt thọ nguyên: như thành niên). */
export function ageStage(data: GameData, monster: Monster): AgeStage | null {
  return monster.aging ? stageAt(data, lifePercent(data, monster)) : null
}

/**
 * % mọi chỉ số theo giai đoạn tuổi (nguồn % chỉ số "age"): ấu niên cố định; lão niên giảm tuyến
 * tính từ 0 ở mốc lão niên tới statPercentAtEnd ở 100% thọ nguyên.
 */
export function ageStatPercent(data: GameData, monster: Monster): number {
  // Hàm nóng (mỗi lần computeStats): tính % đã sống một lần.
  if (!monster.aging) return 0
  const percent = lifePercent(data, monster)
  const { young, old, oldFromPercent } = data.config.lifespan
  const stage = stageAt(data, percent)
  switch (stage) {
    case 'young':
      return young.statPercent
    case 'adult':
      return 0
    case 'old':
      return old.statPercentAtEnd * Math.min(1, (percent - oldFromPercent) / (100 - oldFromPercent))
    default:
      return assertNever(stage, 'giai đoạn tuổi')
  }
}

/** Hệ số EXP quái nhận theo giai đoạn tuổi. */
export function ageExpMultiplier(data: GameData, monster: Monster): number {
  const stage = ageStage(data, monster)
  const { young, old } = data.config.lifespan
  if (stage === 'young') return percentToMultiplier(young.expPercent)
  return stage === 'old' ? percentToMultiplier(old.expPercent) : 1
}

/** Bố / mẹ ấu niên không breed được (tắt thọ nguyên thì không xét). */
export const isTooYoungToBreed = (data: GameData, monster: Monster): boolean =>
  ageStage(data, monster) === 'young'

/**
 * Tuổi (ngày) ứng với `percent` thọ nguyên của quái, làm tròn lên (để đạt đúng mốc, ví dụ quái khởi
 * đầu 10% là thành niên), không vượt số nguyên an toàn (thọ nguyên không trần).
 */
export function ageDaysAtPercent(data: GameData, monster: Monster, percent: number): number {
  const days = lifespanDays(data, monster).times(percent).div(100).ceil()
  return days.gte(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : days.toNumber()
}
