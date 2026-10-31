// Luật của "người chơi" khi chơi liên tục (mục "Chơi liên tục" ở simulation.md): khi nào đánh boss
// tầng (bossPolicy) và farm quái hoang ở tầng nào (farm). Hàm thuần, progression.ts gọi sau mỗi trận.

/** Chính sách đánh boss tầng. */
export type BossPolicy =
  /** Luật cũ: đánh boss sau mỗi `wins` trận thắng quái hoang. */
  | { type: 'everyWins'; wins: number }
  /**
   * Farm tới khi level trung bình ≥ level boss tầng + margin; thua boss thì margin tăng, thắng ngay
   * lần đầu ở một tầng thì margin giảm (không dưới marginStart). margin vượt giới hạn
   * max(maxMargin, maxMarginPercent% × level boss tầng) thì "kẹt": level cần để vượt boss tầng tăng
   * gần tỉ lệ với tầng (bossMultiplier nhân chỉ số, margin chỉ cộng level), nên giới hạn tăng theo.
   */
  | {
      type: 'levelTarget'
      marginStart: number
      marginStepOnLoss: number
      minWinsBetween: number
      maxMargin: number
      /** % level boss tầng; 0 = chỉ dùng maxMargin. */
      maxMarginPercent: number
    }

export interface BossPolicyState {
  /** Mức chênh level đang dùng (0 với everyWins). Giữ nguyên khi sang tầng mới. */
  margin: number
  /** Số trận thắng quái hoang kể từ lần đánh boss trước (hoặc từ lúc mở tầng). */
  winsSinceBoss: number
  /** Số lần đã đánh boss ở tầng cao nhất hiện tại. */
  attemptsThisFloor: number
}

export function initialPolicyState(policy: BossPolicy): BossPolicyState {
  return {
    margin: policy.type === 'levelTarget' ? policy.marginStart : 0,
    winsSinceBoss: 0,
    attemptsThisFloor: 0
  }
}

/** Đã tới lúc đánh boss tầng cao nhất chưa. */
export function shouldChallengeBoss(
  policy: BossPolicy,
  state: BossPolicyState,
  team: { averageLevel: number; bossLevel: number }
): boolean {
  switch (policy.type) {
    case 'everyWins':
      return state.winsSinceBoss >= policy.wins
    case 'levelTarget':
      return (
        state.winsSinceBoss >= policy.minWinsBetween &&
        team.averageLevel >= team.bossLevel + state.margin
      )
  }
}

export function afterWildBattle(state: BossPolicyState, won: boolean): BossPolicyState {
  return won ? { ...state, winsSinceBoss: state.winsSinceBoss + 1 } : state
}

/** Sau trận boss tầng: đếm lại số trận thắng, chỉnh margin (trận hết lượt tính như thua). */
export function afterBossBattle(
  policy: BossPolicy,
  state: BossPolicyState,
  won: boolean
): BossPolicyState {
  const next = { ...state, winsSinceBoss: 0, attemptsThisFloor: state.attemptsThisFloor + 1 }
  if (policy.type !== 'levelTarget') return next
  if (!won) return { ...next, margin: state.margin + policy.marginStepOnLoss }
  if (state.attemptsThisFloor === 0) {
    return { ...next, margin: Math.max(policy.marginStart, state.margin - policy.marginStepOnLoss) }
  }
  return next
}

/** Mở tầng mới (thắng boss tầng hoặc gặp boss tầng ngẫu nhiên): đếm lại từ đầu, giữ margin. */
export function onFloorUnlocked(state: BossPolicyState): BossPolicyState {
  return { ...state, winsSinceBoss: 0, attemptsThisFloor: 0 }
}

/** Giới hạn margin ở tầng có boss level `bossLevel`; null với everyWins (không có giới hạn). */
export function marginLimit(policy: BossPolicy, bossLevel: number): number | null {
  if (policy.type !== 'levelTarget') return null
  return Math.max(policy.maxMargin, (bossLevel * policy.maxMarginPercent) / 100)
}

/** levelTarget: margin vượt giới hạn (marginLimit) thì dừng đội ("kẹt"). */
export function isPolicyStuck(
  policy: BossPolicy,
  state: BossPolicyState,
  bossLevel: number
): boolean {
  const limit = marginLimit(policy, bossLevel)
  return limit !== null && state.margin > limit
}

/**
 * Chọn tầng farm theo `window` trận quái hoang gần nhất ở tầng đang farm: tỉ lệ thắng (%) <
 * dropBelow thì xuống 1 tầng; đang ở tầng thấp mà ≥ returnAt thì về tầng cao nhất.
 */
export interface FarmSpec {
  window: number
  dropBelow: number
  returnAt: number
}

export interface FarmState {
  floor: number
  /** Kết quả (thắng hay không) các trận quái hoang gần nhất ở tầng đang farm, tối đa window trận. */
  recent: boolean[]
}

export const farmAt = (floor: number): FarmState => ({ floor, recent: [] })

/** Ghi một trận quái hoang rồi chọn tầng farm tiếp theo; null = luôn farm ở tầng cao nhất. */
export function nextFarmState(
  spec: FarmSpec | null,
  state: FarmState,
  { won, highestFloor }: { won: boolean; highestFloor: number }
): FarmState {
  if (!spec) return farmAt(highestFloor)
  const recent = [...state.recent, won].slice(-spec.window)
  // Chỉ xét khi đã đủ window trận ở tầng này (mỗi lần đổi tầng đếm lại từ đầu).
  if (recent.length < spec.window) return { floor: state.floor, recent }
  const rate = (recent.filter(Boolean).length / spec.window) * 100
  if (rate < spec.dropBelow && state.floor > 1) return farmAt(state.floor - 1)
  if (rate >= spec.returnAt && state.floor < highestFloor) return farmAt(highestFloor)
  return { floor: state.floor, recent }
}
