// Thời gian game, tùy chọn luật chơi theo từng game và sự kiện khi thời gian trôi (mục "Tuổi và thọ
// nguyên" ở lifespan.md).

import type { Decimal } from '../shared'
import type { ImprintRequest } from './imprint'

/** Số giờ một ngày game (giờ thường). */
export const HOURS_PER_DAY = 24

/** Ngày game (từ 0) của một mốc giờ. */
export const dayOf = (time: number): number => Math.floor(time / HOURS_PER_DAY)

/** Giờ trong ngày (0–23). */
export const hourOf = (time: number): number => time % HOURS_PER_DAY

/**
 * Thời khắc trong ngày (docs/rules/calendar.md), suy từ giờ theo config.calendar.phaseStartHours;
 * thứ tự là thứ tự trong ngày.
 */
export const DAY_PHASES = ['dawn', 'day', 'dusk', 'night'] as const

export type DayPhase = (typeof DAY_PHASES)[number]

/** Mùa trong năm (một năm = lifespan.daysPerYear ngày, chia đều 4 mùa). */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const

export type Season = (typeof SEASONS)[number]

/** Tuần trăng: mỗi ngày một pha, hết danh sách thì lặp (ngày 0 là trăng non). */
export const MOON_PHASES = [
  'new',
  'waxingCrescent',
  'firstQuarter',
  'waxingGibbous',
  'full',
  'waningGibbous',
  'lastQuarter',
  'waningCrescent'
] as const

export type MoonPhase = (typeof MOON_PHASES)[number]

/**
 * Giờ hoạt động của loài (`activeTime` trong species.json): quyết định hệ số gặp theo thời khắc.
 * `cathemeral` = gặp mọi giờ, ghi rõ khi nguồn gốc nói vậy để không suy theo race / hệ nữa.
 */
export const ACTIVE_TIMES = ['diurnal', 'nocturnal', 'crepuscular', 'cathemeral'] as const

export type ActiveTime = (typeof ACTIVE_TIMES)[number]

/**
 * Tùy chọn luật chơi bật / tắt của từng game (lưu trong save, đổi bằng action `setGameOption`; game
 * mới mặc định tắt hết, docs/rules/options.md).
 */
export const GAME_OPTION_FLAGS = ['lifespanEnabled', 'permadeathEnabled'] as const

export type GameOptionFlag = (typeof GAME_OPTION_FLAGS)[number]

/** Tùy chọn luật chơi của một game (mục sau thêm tùy chọn mới vào đây). */
export type GameOptions = Record<GameOptionFlag, boolean>

/** Việc làm tốn giờ game (số giờ ở config.clock.hours); nghỉ thì ngủ tới sáng nên không có ở đây. */
export const TIMED_ACTIVITIES = [
  'wildBattle',
  'bossBattle',
  'travel',
  'healParty',
  'event',
  // Cả lượt vào khu bảo tồn (docs/rules/safari-zone.md), tính lúc ra khu.
  'safari',
  // Một bước khám phá hiểm địa không phải trận (docs/rules/zones.md); trận tính như trận thường.
  'zoneStep',
  // Một lần câu cá / khai thác không mở trận (docs/rules/gathering.md); trận tính như trận thường.
  'fishing',
  'mining'
] as const

export type TimedActivity = (typeof TIMED_ACTIVITIES)[number]

/** Giai đoạn tuổi theo % thọ nguyên đã sống. */
export const AGE_STAGES = ['young', 'adult', 'old'] as const

export type AgeStage = (typeof AGE_STAGES)[number]

/**
 * Đội trống vì quái chết hẳn (tọa hóa, chết thật trong trận): quái mạnh nhất trong kho tự vào đội;
 * kho cũng trống thì hồn phách mới nhất tự ấp thành trứng truyền thừa và nở ngay vào đội. Có ở cả
 * sự kiện theo ngày lẫn log trận.
 */
export type PartyRefillEvent =
  { type: 'legacyEggHatched'; monsterId: string } | { type: 'monsterAutoJoined'; monsterId: string }

/**
 * Sự kiện xảy ra khi thời gian trôi (việc theo ngày), ngoài log trận. GameState.dayEvents giữ các
 * sự kiện của lần trôi thời gian gần nhất để UI báo người chơi.
 */
export type DayEvent =
  /**
   * Quái tọa hóa (hết thọ nguyên); đã rời đội / kho, để lại hồn phách id = monsterId
   * (docs/rules/soul-relics.md).
   */
  | { type: 'diedOfOldAge'; monsterId: string; speciesId: string; nickname: string | null }
  | PartyRefillEvent
  /** Lần đầu vượt mốc cảnh báo (% thọ nguyên đã sống). */
  | { type: 'nearingLifespanEnd'; monsterId: string; yearsLeft: Decimal }
  /** Quái đang dưỡng dục đòi chăm sóc (docs/rules/imprinting.md). */
  | { type: 'imprintRequest'; monsterId: string; request: ImprintRequest }
  /** Hết thời gian dưỡng dục: buff vĩnh viễn theo percent (0–100). */
  | { type: 'imprintFinished'; monsterId: string; percent: number }
  /** Đội thám hiểm về (docs/rules/expeditions.md): độ thành công (%), quái bị trọng thương. */
  | {
      type: 'expeditionReturned'
      activeId: string
      expeditionId: string
      successPercent: number
      injuredIds: string[]
      /** Trứng hiếm mang về (id trứng); null = không có. */
      eggId: string | null
    }
  /** Ô linh điền vừa chín (docs/rules/alchemy.md). */
  | { type: 'cropRipe'; plotIndex: number; seedItemId: string }
  /** Bản mệnh thú chết hẳn (tọa hóa): ngự thú sư bị đạo thương tới hết ngày `woundUntilDay`. */
  | { type: 'bondBroken'; monsterId: string; woundUntilDay: number }
  /** Báo trước thú triều (docs/rules/events.md): đến khi vào thị trấn từ ngày `day`. */
  | { type: 'beastTideWarning'; day: number }
  /** Thú triều bắt đầu (đang ở thị trấn đúng ngày đó). */
  | { type: 'beastTideArrived'; waves: number }
