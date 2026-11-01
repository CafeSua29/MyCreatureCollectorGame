// Hồ sơ xuyên save (saves/profile.json, docs/rules/saves.md): loài khởi đầu đã mở khóa. Nằm ngoài
// save game nên không có migrate theo SAVE_VERSION; file hỏng / thiếu coi như hồ sơ rỗng.

import { isStarterEligible, newStarterUnlocks, type StarterUnlockScope } from '../registries'
import { asObject } from '../shared'
import type { GameData } from '../model'

/** Version cấu trúc profile.json (đổi cấu trúc thì tăng và đọc được bản cũ trong parseProfile). */
export const PROFILE_VERSION = 1

export interface PlayerProfile {
  version: typeof PROFILE_VERSION
  /** Loài đã mở làm khởi đầu, theo thứ tự mở. */
  unlockedStarterIds: string[]
}

/** Hồ sơ rỗng (chưa mở gì). */
export function emptyProfile(): PlayerProfile {
  return { version: PROFILE_VERSION, unlockedStarterIds: [] }
}

/**
 * Đọc nội dung profile.json (null = chưa có file). Không bao giờ ném lỗi: JSON hỏng / sai cấu trúc
 * thì hồ sơ rỗng; id không phải chuỗi hoặc trùng thì bỏ. Id loài không còn trong dữ liệu vẫn giữ
 * (dữ liệu có thể thêm lại), chỗ dùng tự lọc.
 */
export function parseProfile(text: string | null): PlayerProfile {
  if (text === null) return emptyProfile()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // File hỏng: coi như chưa mở gì (hồ sơ chỉ là phần thưởng meta, không chặn game).
    return emptyProfile()
  }
  const ids = asObject(raw)?.unlockedStarterIds
  if (!Array.isArray(ids)) return emptyProfile()
  const unique = new Set(ids.filter((id): id is string => typeof id === 'string'))
  return { version: PROFILE_VERSION, unlockedStarterIds: [...unique] }
}

/** Nội dung ghi ra profile.json. */
export function serializeProfile(profile: PlayerProfile): string {
  return JSON.stringify(profile, null, 2)
}

/**
 * Ghi nhận loài khởi đầu mới mở từ state game hiện tại: trả hồ sơ mới và danh sách loài vừa mở
 * (rỗng thì hồ sơ giữ nguyên object cũ, không cần ghi file).
 */
export function recordStarterUnlocks(
  data: GameData,
  state: StarterUnlockScope,
  profile: PlayerProfile
): { profile: PlayerProfile; unlocked: string[] } {
  const unlocked = newStarterUnlocks(data, state, profile.unlockedStarterIds)
  if (unlocked.length === 0) return { profile, unlocked }
  return {
    profile: { ...profile, unlockedStarterIds: [...profile.unlockedStarterIds, ...unlocked] },
    unlocked
  }
}

/** Loài đã mở mà vẫn làm khởi đầu được với dữ liệu hiện tại (màn chọn hiển thị danh sách này). */
export function usableUnlockedStarters(data: GameData, profile: PlayerProfile): string[] {
  return profile.unlockedStarterIds.filter((id) => isStarterEligible(data, id))
}
