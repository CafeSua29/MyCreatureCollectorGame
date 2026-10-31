// Nạp dữ liệu game cho renderer. Main process đã kiểm tra dữ liệu lúc khởi động (thoát nếu lỗi),
// nên ở đây gần như luôn ok; vẫn giữ kết quả lỗi để UI hiển thị thay vì crash.

import { tryCreateGameData } from '@core'
import { rawGameData } from '@data'

export const gameDataResult = tryCreateGameData(rawGameData)

/** Seed mới cho game mới. Renderer được dùng nguồn ngẫu nhiên của trình duyệt; core thì không. */
export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}
