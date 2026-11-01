// Đồng hồ game (mục "Đồng hồ game" ở lifespan.md): giờ thường, 24 giờ một ngày. Việc tốn giờ gọi
// advanceTime (điểm DUY NHẤT cho thời gian trôi); mỗi lần qua nửa đêm chạy mọi việc theo ngày
// (DAILY_TASKS). Mục sau có việc theo ngày (thị trường động, đấu giá, động phủ...) thêm một mục
// vào DAILY_TASKS, không sửa advanceTime.

import { tickSpiritVirusDay } from '../monster'
import {
  HOURS_PER_DAY,
  dayOf,
  hourOf,
  type DayEvent,
  type DayPhase,
  type GameData,
  type GameState,
  type MoonPhase,
  type Season
} from '../model'
import { dayPhaseOf, moonPhaseOf, seasonOf } from '../registries'
import { recoverMarket } from '../shop'
import { safariDailyTask } from '../world'
import { soulLinkDailyTask } from '../tamer'
import { ageOneDay } from './oldAge'
import { imprintOneDay } from './imprint'
import { dwellingDailyTask } from './dwelling'
import { expeditionDailyTask } from './expeditions'
import { beastTideDailyTask } from './beastTide'
import { labDailyTask } from './implant'
import { worldBossDailyTask } from './worldBoss'

/** Lịch của một mốc giờ cho UI / mô phỏng (docs/rules/calendar.md). */
export interface CalendarView {
  day: number
  hour: number
  dayPhase: DayPhase
  season: Season
  moonPhase: MoonPhase
}

/** Ngày, giờ, thời khắc, mùa, tuần trăng của mốc giờ `time` (suy ra, không lưu). */
export function calendarAt(data: GameData, time: number): CalendarView {
  return {
    day: dayOf(time),
    hour: hourOf(time),
    dayPhase: dayPhaseOf(data, time),
    season: seasonOf(data, time),
    moonPhase: moonPhaseOf(time)
  }
}

/**
 * Một việc theo ngày: nhận state (đồng hồ đã ở giờ cuối của lần trôi), ghi sự kiện vào `events`,
 * trả state mới. `day`: ngày đang chạy việc (lần trôi qua nhiều ngày chạy mỗi ngày một lần).
 */
export type DailyTask = (
  data: GameData,
  state: GameState,
  events: DayEvent[],
  day: number
) => GameState

/** Việc theo ngày, chạy theo thứ tự mỗi lần qua một ngày. */
export const DAILY_TASKS: Readonly<Record<string, DailyTask>> = {
  aging: ageOneDay,
  market: recoverMarket,
  // Sau aging: quái vừa nở từ trứng truyền thừa trong ngày đã có yêu cầu đầu tiên.
  imprint: imprintOneDay,
  // Động phủ: công trình sản xuất / chăm sóc, linh điền lớn và báo ô chín, thân mật quái làm việc
  // (docs/rules/dwelling.md).
  dwelling: dwellingDailyTask,
  // Thám hiểm: thân mật, đội về, làm mới bảng (docs/rules/expeditions.md).
  expeditions: expeditionDailyTask,
  // Thú triều: báo trước, bắt đầu khi tới ngày (docs/rules/events.md).
  beastTide: beastTideDailyTask,
  // Boss thế giới: rời đi khi hết thời gian (thưởng chờ nhận), xuất hiện khi tới chu kỳ
  // (docs/rules/world-boss.md).
  worldBoss: worldBossDailyTask,
  // Khu bảo tồn: làm mới danh sách loài khi tới ngày (docs/rules/safari-zone.md).
  safari: safariDailyTask,
  // Phòng Thí Nghiệm: đổi hàng huyết thanh khi tới ngày (docs/rules/implant.md).
  lab: labDailyTask,
  // Tâm linh tương thông: quái đã khế ước thêm một ngày khế ước (docs/rules/tamer.md mục "Khế ước").
  soulLink: soulLinkDailyTask,
  // Linh dịch: quái đang nhiễm ở đội bớt một ngày; kho đứng yên (docs/rules/spirit-virus.md).
  spiritVirus: (_data, state) => ({ ...state, party: state.party.map(tickSpiritVirusDay) })
}

/**
 * Thời gian trôi `hours` giờ: chạy DAILY_TASKS cho từng ngày vừa qua, dayEvents thay bằng sự kiện
 * của lần trôi này (không qua ngày nào thì rỗng).
 */
export function advanceTime(data: GameData, state: GameState, hours: number): GameState {
  if (!Number.isSafeInteger(hours) || hours < 0) {
    throw new RangeError(`Số giờ không hợp lệ: ${hours}`)
  }
  const time = state.time + hours
  const events: DayEvent[] = []
  let next: GameState = { ...state, time }
  for (let day = dayOf(state.time) + 1; day <= dayOf(time); day++) {
    for (const task of Object.values(DAILY_TASKS)) next = task(data, next, events, day)
  }
  return { ...next, dayEvents: events }
}

/** Số giờ ngủ tới giờ thức (config.clock.wakeHour) kế tiếp, luôn ≥ 1. */
export function hoursUntilWake(data: GameData, time: number): number {
  const { wakeHour } = data.config.clock
  const hour = hourOf(time)
  return hour < wakeHour ? wakeHour - hour : HOURS_PER_DAY - hour + wakeHour
}
