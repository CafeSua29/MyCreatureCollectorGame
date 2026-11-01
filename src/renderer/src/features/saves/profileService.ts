// Hồ sơ xuyên save (profile.json qua window.api.saves): đọc khi mở app, ghi khi mở khóa loài khởi đầu.
// Nội dung kiểm tra ở core (parseProfile: hỏng / thiếu = hồ sơ rỗng).

import { parseProfile, serializeProfile, type PlayerProfile } from '@core'

const api = (): typeof window.api.saves => window.api.saves

export async function loadProfile(): Promise<PlayerProfile> {
  return parseProfile(await api().readProfile())
}

export async function saveProfile(profile: PlayerProfile): Promise<void> {
  await api().writeProfile(serializeProfile(profile))
}
