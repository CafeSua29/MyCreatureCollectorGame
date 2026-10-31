// API công khai DUY NHẤT của core cho main / renderer / data: import từ '@core'.
// Không import sâu vào từng folder (ESLint chặn). Helper test: '@core/testing' (chỉ trong file test).
//
// Chiều phụ thuộc (hướng dẫn): shared → model → inventory → registries / gameData → shop
//   → monster → tamer / quests → battle / world / progression / roster → events → game.

export * from './shared'
export * from './model'
export * from './inventory'
export * from './gameData'
export * from './shop'
export * from './monster'
export * from './tamer'
export * from './quests'
export * from './battle'
export * from './world'
export * from './progression'
export * from './roster'
export * from './events'
export * from './game'
