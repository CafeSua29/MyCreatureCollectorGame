// Độ khó và chế độ thử thách của từng game (docs/rules/challenge-modes.md): độ khó, Nuzlocke,
// Hardcore, Randomizer. Lựa chọn nằm trong GameState.options, tiến độ Nuzlocke trong
// GameState.challenge.

/** Các mức độ khó, từ dễ tới khó (thứ tự dùng để so "mức thấp nhất từng dùng"). */
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'] as const

export type Difficulty = (typeof DIFFICULTIES)[number]

/** Chế độ thử thách chọn lúc tạo game (không tắt được), dùng cho điều kiện thành tựu. */
export const CHALLENGE_MODES = ['nuzlocke', 'hardcore', 'randomizer'] as const

export type ChallengeMode = (typeof CHALLENGE_MODES)[number]

/** Nuzlocke: dupesClause = gặp loài (chuỗi tiến hóa) đã sở hữu thì không tính là con đầu tiên. */
export interface NuzlockeOptions {
  dupesClause: boolean
}

/** Randomizer: seed của bảng ánh xạ loài → loài (cố định cả game), có xáo learnset không. */
export interface RandomizerOptions {
  seed: number
  /** Xáo learnset: mỗi loài học theo learnset của một loài khác cùng bậc (gameDataFor). */
  learnsets: boolean
}

/** Lựa chọn độ khó / chế độ thử thách trong GameState.options. */
export interface ChallengeOptions {
  difficulty: Difficulty
  /** Mức thấp nhất từng dùng trong game này (thành tựu / danh hiệu theo độ khó đọc mức này). */
  lowestDifficulty: Difficulty
  /** null = không chơi Nuzlocke. */
  nuzlocke: NuzlockeOptions | null
  /** Chỉ tự lưu, chỉ mở được save mới nhất, không đổi seed khi mở. */
  hardcore: boolean
  /** null = không Randomizer. */
  randomizer: RandomizerOptions | null
}

/** Khóa của ChallengeOptions trong GameState.options (kiểm tra save báo khóa lạ). */
export const CHALLENGE_OPTION_KEYS = [
  'difficulty',
  'lowestDifficulty',
  'nuzlocke',
  'hardcore',
  'randomizer'
] as const satisfies readonly (keyof ChallengeOptions)[]

/** Tiến độ thử thách trong save. */
export interface ChallengeState {
  /**
   * Nuzlocke: khu đã dùng lượt gặp đầu tiên (không trùng): `floor:<tầng>` hoặc `zone:<id hiểm địa>`
   * (nuzlockeAreaOf).
   */
  nuzlockeAreas: string[]
  /** Nuzlocke: đội và kho trống hoàn toàn = thua game, save chỉ còn xem. */
  gameOver: boolean
}

/** Số của một mức độ khó (config.challenge.difficulties). */
export interface DifficultyNumbers {
  /**
   * % level quái địch (cộng, làm tròn, tối thiểu 1): theo % để có tác dụng như nhau ở mọi tầng (game
   * không trần level).
   */
  levelPercent: number
  /** Nhân khoảng gen quái địch. */
  geneMultiplier: number
  /** Cộng vào ngưỡng HP cuồng bạo (điểm %) của vai trò wild / boss. */
  frenzyThresholdPercent: number
  /** Cộng vào tỉ lệ hành động thêm khi cuồng bạo (điểm %) của vai trò wild / boss. */
  frenzyExtraActionPercent: number
  /** % thưởng thêm (tiền, tỉ lệ đồ rơi), cộng với % của độ bất ổn. */
  rewardPercent: number
  /**
   * % EXP thêm của trận thắng (thay rewardPercent cho EXP), cộng với % của độ bất ổn: bù phần EXP
   * quái level cao tự cho thêm để EXP mỗi trận gần như Thường (simulation-features.md mục "Độ khó").
   */
  expPercent: number
}

/** config.challenge (balance.json). */
export interface ChallengeConfig {
  difficulties: Record<Difficulty, DifficultyNumbers>
  randomizer: {
    /** Số loài mỗi bậc sức mạnh (xếp theo tổng chỉ số gốc); loài chỉ đổi sang loài cùng bậc. */
    tierSize: number
  }
}
