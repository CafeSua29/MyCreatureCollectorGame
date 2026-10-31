// Lấy danh sách lỗi kiểm tra dữ liệu cho test (dùng chung, không chép ở từng file test).

import { createGameData } from '../gameData'
import { DataError } from '../shared'
import type { RawGameData } from '../model'
import { makeRawData, withFixtureText } from './fixtures'

/** Lỗi kiểm tra dữ liệu của raw (rỗng nếu hợp lệ). Lỗi không phải DataError ném tiếp. */
export function dataIssues(raw: RawGameData): string[] {
  try {
    createGameData(raw)
    return []
  } catch (error) {
    if (error instanceof DataError) return error.issues
    throw error
  }
}

/**
 * Sửa dữ liệu thô của fixture rồi trả về lỗi kiểm tra dữ liệu. `regenerateText`: tạo lại chữ
 * fixture sau khi sửa, dùng khi test thêm / bớt nội dung mà không kiểm tra phần chữ.
 */
export function dataIssuesAfter(
  edit: (raw: RawGameData) => void,
  { regenerateText = false }: { regenerateText?: boolean } = {}
): string[] {
  const raw = makeRawData()
  edit(raw)
  return dataIssues(regenerateText ? withFixtureText(raw) : raw)
}
