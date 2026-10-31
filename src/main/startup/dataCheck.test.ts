import { describe, expect, it } from 'vitest'
import { tryCreateGameData } from '@core'
import type { RawGameData } from '@core'
import { makeRawData } from '@core/testing'
import { rawGameData } from '@data'
import { MAX_ISSUE_LINES, formatDataIssues, summarizeGameData } from './dataCheck'

describe('kiểm tra dữ liệu lúc khởi động', () => {
  it('dữ liệu thật hợp lệ, có tóm tắt', () => {
    const result = tryCreateGameData(rawGameData)
    expect(result.ok).toBe(true)
    if (result.ok) expect(summarizeGameData(result)).toMatch(/^Dữ liệu game hợp lệ: \d+ loài/)
  })

  it('dữ liệu sai: trả về danh sách lỗi, không ném', () => {
    const raw = makeRawData()
    raw.races[0].breedsWith = ['ghost']
    raw.config.geneWeight = -1
    const result = tryCreateGameData(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.join('\n')).toMatch(/geneWeight/)
      expect(result.issues.join('\n')).toMatch(/"ghost"/)
    }
  })

  it('JSON thiếu hẳn một khối: lỗi bất ngờ cũng được gom thành issue', () => {
    const broken = { ...makeRawData(), config: undefined } as unknown as RawGameData
    const result = tryCreateGameData(broken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatch(/Lỗi không mong đợi/)
  })

  it('nội dung hộp thoại: tối đa N dòng, phần thừa ghi "... và X lỗi khác"', () => {
    const issues = Array.from({ length: 25 }, (_, i) => `lỗi ${i + 1}`)
    const text = formatDataIssues(issues)
    expect(text).toMatch(/có 25 lỗi/)
    expect(text).toContain('• lỗi 20')
    expect(text).not.toContain('• lỗi 21')
    expect(text).toContain('... và 5 lỗi khác')
    expect(MAX_ISSUE_LINES).toBe(20)
    expect(formatDataIssues(['a', 'b'], 5)).not.toContain('lỗi khác')
  })
})
