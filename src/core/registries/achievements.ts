// Thành tựu (docs/rules/achievements.md): mỗi loại điều kiện một handler (trường, kiểm tra params, tiến
// độ đọc từ state). Bậc theo danh sách rồi sinh tiếp theo công thức (không trần). Thêm loại điều kiện
// = thêm mục vào ACHIEVEMENT_CONDITIONS (TypeScript báo khi thiếu mục cho loại mới).

import {
  bestRealmReached,
  CHALLENGE_MODES,
  DIFFICULTIES,
  STAT_KEYS,
  type ChallengeMode,
  type Difficulty,
  type AchievementConditionType,
  type AchievementDef,
  type AchievementRewards,
  type GameData,
  type GameState
} from '../model'
import { checkIdList } from './paramChecks'
import { aptitudeFloor, hasAptitudeAtLeast } from './aptitude'
import { dexOwnedPercent } from './dex'
import { researchCompletedCount } from './research'
import { speciesRankIndex, speciesRankOf } from './speciesRank'
import { difficultyRank, hasChallengeMode } from './challenge'

/** Phần state điều kiện thành tựu đọc. */
export type AchievementScope = Pick<
  GameState,
  | 'stats'
  | 'dex'
  | 'research'
  | 'highestFloor'
  | 'ascension'
  | 'tamer'
  | 'tower'
  | 'trainers'
  | 'party'
  | 'storage'
  | 'options'
>

export interface AchievementConditionHandler {
  /** Trường của điều kiện ngoài `type` (trường lạ báo lỗi). */
  fields: readonly string[]
  validateParams(params: Readonly<Record<string, unknown>>, data: GameData): string[]
  /** Params đã qua validateParams. */
  parse(params: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>
  /** Tiến độ hiện tại (số ≥ 0) so với giá trị của bậc. */
  progress(
    params: Readonly<Record<string, unknown>>,
    state: AchievementScope,
    data: GameData
  ): number
  /** Tiến độ tối đa có thể đạt (bậc vượt quá là dữ liệu sai, không được có bậc lặp); null = không trần. */
  maxProgress(params: Readonly<Record<string, unknown>>, data: GameData): number | null
}

/** Điều kiện không có params, tiến độ đọc thẳng một số của state. */
const plain = (
  progress: (state: AchievementScope, data: GameData) => number,
  maxProgress: number | null = null
): AchievementConditionHandler => ({
  fields: [],
  validateParams: () => [],
  parse: (params) => params,
  progress: (_params, state, data) => progress(state, data),
  maxProgress: () => maxProgress
})

const checkKnownId = (value: unknown, known: object, label: string): string[] =>
  typeof value === 'string' && Object.hasOwn(known, value)
    ? []
    : [`${label} không tồn tại "${String(value)}"`]

export const ACHIEVEMENT_CONDITIONS: Readonly<
  Record<AchievementConditionType, AchievementConditionHandler>
> = {
  // { key }: một khóa của bộ đếm chung.
  stat: {
    fields: ['key'],
    validateParams: (params) =>
      STAT_KEYS.some((key) => key === params.key) ? [] : [`khóa bộ đếm lạ "${String(params.key)}"`],
    parse: (params) => params,
    // Ép kiểu: validateParams đảm bảo key thuộc STAT_KEYS.
    progress: (params, state) => state.stats[params.key as (typeof STAT_KEYS)[number]],
    maxProgress: () => null
  },
  // Số loài đã sở hữu / % loài của Dex / số loài đã có bản shiny (docs/rules/dex.md).
  dexOwned: plain((state) => state.dex.owned.length),
  dexPercent: plain((state, data) => dexOwnedPercent(data, state.dex), 100),
  shinySpecies: plain((state) => state.dex.shinyOwned.length),
  // Số loài đã Hoàn thành nghiên cứu (docs/rules/species-research.md; Bùa Lấp Lánh ở bậc 100).
  researchCompleted: plain((state, data) => researchCompletedCount(data, state.research)),
  // Tầng cao nhất từng đạt (cùng mốc với tư chất, đổi theo phi thăng ở một chỗ).
  highestFloor: plain((state) => aptitudeFloor(state)),
  // Cảnh giới cao nhất từng đạt (phi thăng reset cảnh giới).
  tamerRealm: plain((state) => bestRealmReached(state)),
  // Số lần phi thăng (docs/rules/ascension.md).
  ascensions: plain((state) => state.ascension.count),
  towerFloor: plain((state) => state.tower.highest),
  // Huy hiệu = đạo quán đã thắng quán chủ ít nhất một lần (docs/rules/trainers.md).
  gymBadges: plain((state) => state.trainers.gyms.filter((gym) => gym.wins > 0).length),
  arenaRank: plain((state) => state.trainers.arenaRank),
  // { speciesIds }: số loài trong danh sách đã từng sở hữu (Dex).
  ownSpecies: {
    fields: ['speciesIds'],
    validateParams: (params, data) =>
      checkIdList(params.speciesIds, 'speciesIds', data.species, { label: 'loài' }),
    parse: (params) => params,
    progress: (params, state) => {
      const owned = new Set(state.dex.owned)
      // Ép kiểu: validateParams đảm bảo danh sách id loài.
      return (params.speciesIds as string[]).filter((id) => owned.has(id)).length
    },
    maxProgress: (params) => (params.speciesIds as string[]).length
  },
  // { tierId }: số quái đang sở hữu (đội + kho) có tư chất từ bậc này (docs/rules/aptitude.md).
  aptitude: {
    fields: ['tierId'],
    validateParams: (params, data) =>
      checkKnownId(params.tierId, data.aptitudeTiers, 'bậc tư chất'),
    parse: (params) => params,
    progress: (params, state, data) => {
      const target = { floor: aptitudeFloor(state), minTierId: String(params.tierId) }
      return [...state.party, ...state.storage].filter((monster) =>
        hasAptitudeAtLeast(data, monster, target)
      ).length
    },
    maxProgress: () => null
  },
  // { rankId }: số loài đã sở hữu (Dex) có phẩm cấp từ bậc này (docs/rules/species-rank.md).
  speciesRank: {
    fields: ['rankId'],
    validateParams: (params, data) =>
      checkKnownId(params.rankId, data.speciesRanks, 'phẩm cấp loài'),
    parse: (params) => params,
    progress: (params, state, data) => {
      const min = speciesRankIndex(data, String(params.rankId))
      return state.dex.owned.filter((id) => {
        const species = data.species[id]
        return (
          species?.kind === 'normal' &&
          speciesRankIndex(data, speciesRankOf(data, species).id) >= min
        )
      }).length
    },
    maxProgress: () => null
  },
  // { difficulty?, modes? } (docs/rules/challenge-modes.md): tầng cao nhất khi chưa từng chơi dễ hơn
  // `difficulty` (mức thấp nhất từng dùng) và đang chơi đủ mọi chế độ trong `modes`; không thì 0.
  challengeFloor: {
    fields: ['difficulty', 'modes'],
    validateParams: (params) => [
      ...(params.difficulty === undefined || DIFFICULTIES.some((d) => d === params.difficulty)
        ? []
        : [`độ khó lạ "${String(params.difficulty)}"`]),
      ...(params.modes === undefined ||
      (Array.isArray(params.modes) &&
        params.modes.every((mode) => CHALLENGE_MODES.some((known) => known === mode)))
        ? []
        : [`modes phải là danh sách trong ${CHALLENGE_MODES.join(', ')}`])
    ],
    parse: (params) => params,
    progress: (params, state) => {
      // Ép kiểu: validateParams đảm bảo độ khó / chế độ hợp lệ.
      const difficulty = (params.difficulty ?? 'easy') as Difficulty
      const modes = (params.modes ?? []) as ChallengeMode[]
      const hardEnough =
        difficultyRank(state.options.lowestDifficulty) >= difficultyRank(difficulty)
      const inModes = modes.every((mode) => hasChallengeMode(state.options, mode))
      return hardEnough && inModes ? aptitudeFloor(state) : 0
    },
    maxProgress: () => null
  }
}

/** Tiến độ hiện tại của thành tựu. */
export function achievementProgress(
  data: GameData,
  state: AchievementScope,
  achievement: AchievementDef
): number {
  const { type, ...params } = achievement.condition
  return ACHIEVEMENT_CONDITIONS[type].progress(params, state, data)
}

/**
 * Giá trị bậc thứ `index` khi biết giá trị bậc trước `previous` (bỏ qua với bậc trong `tiers`): sau bậc
 * cuối, mỗi bậc = max(bậc trước + 1, ⌈bậc trước × factor⌉) (tăng ngặt, không trần). Không có `repeat`
 * hoặc vượt MAX_SAFE_INTEGER (tiến độ không bao giờ tới) = null.
 */
function tierValueAfter(
  achievement: AchievementDef,
  index: number,
  previous: number
): number | null {
  const { tiers, repeat } = achievement
  if (index < tiers.length) return tiers[index].value
  if (!repeat) return null
  const value = Math.max(previous + 1, Math.ceil(previous * repeat.factor))
  return value > Number.MAX_SAFE_INTEGER ? null : value
}

/** Giá trị cần của bậc thứ `index` (0 = bậc đầu); null = không có bậc đó. */
export function achievementTierValue(achievement: AchievementDef, index: number): number | null {
  let value: number | null = 0
  for (let i = 0; i <= index && value !== null; i++) value = tierValueAfter(achievement, i, value)
  return value
}

/** Thưởng của bậc thứ `index` (bậc sinh theo công thức dùng `repeat.rewards`). */
export function achievementTierRewards(
  achievement: AchievementDef,
  index: number
): AchievementRewards {
  if (index < achievement.tiers.length) return achievement.tiers[index].rewards
  return achievement.repeat?.rewards ?? {}
}

/** Số bậc đã đạt với tiến độ `progress` (bậc lặp tính lần lượt, dừng ở bậc đầu chưa đạt). */
export function achievementTiersReached(achievement: AchievementDef, progress: number): number {
  let count = 0
  let value = tierValueAfter(achievement, 0, 0)
  while (value !== null && value <= progress) {
    count++
    value = tierValueAfter(achievement, count, value)
  }
  return count
}
