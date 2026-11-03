import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SaveSummary } from '@core'
import {
  AUTOSAVE_SLOTS,
  deleteGame,
  deleteSave,
  listSaves,
  readSave,
  resolveSaveDir,
  writeAutosave,
  writeManualSave
} from './saves'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-saves-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Summary hợp lệ (chỉ id và số) để listSaves đọc được; money ghi chuỗi như save thật. */
const summary = (money: number, hardcore = false): SaveSummary => ({
  leaderNickname: null,
  leaderSpeciesId: 'weakling',
  highestLevel: 1,
  partySize: 1,
  totalMonsters: 1,
  money: String(money),
  location: { type: 'town' },
  inBattle: false,
  challenge: {
    difficulty: 'normal',
    nuzlocke: false,
    hardcore,
    randomizer: false,
    gameOver: false
  }
})

const save = (savedAt: string, money = 0, hardcore = false): string =>
  JSON.stringify({ savedAt, summary: summary(money, hardcore), state: {} })

describe('tự lưu xoay vòng', () => {
  it(`dùng tối đa ${AUTOSAVE_SLOTS} file, ghi đè file cũ nhất`, () => {
    const ids = ['01', '02', '03', '04', '05'].map((minute, i) =>
      writeAutosave(dir, 'g-a', save(`2026-10-18T10:${minute}:00.000Z`, i))
    )
    expect(ids).toEqual([
      'g-a/auto-1.json',
      'g-a/auto-2.json',
      'g-a/auto-3.json',
      'g-a/auto-1.json',
      'g-a/auto-2.json'
    ])
    const files = fs.readdirSync(path.join(dir, 'g-a')).sort()
    expect(files).toEqual(['auto-1.json', 'auto-2.json', 'auto-3.json'])
    // Mới nhất trước.
    expect(listSaves(dir).map((e) => e.summary?.money)).toEqual(['4', '3', '2'])
  })

  it('summary dạng cũ (có chữ hiển thị) hoặc sai dạng thì đọc thành null', () => {
    const old = { leaderName: 'Bé', locationName: 'Thị trấn', money: '5' }
    writeAutosave(dir, 'g-a', JSON.stringify({ savedAt: '2026-10-18T10:00:00.000Z', summary: old }))
    expect(listSaves(dir).map((e) => e.summary)).toEqual([null])
  })

  it('ghi an toàn: không để lại file tạm', () => {
    writeAutosave(dir, 'g-a', save('2026-10-18T10:00:00.000Z'))
    expect(fs.readdirSync(path.join(dir, 'g-a')).some((f) => f.endsWith('.tmp'))).toBe(false)
  })
})

describe('lưu tay, đọc, xóa', () => {
  it('lưu tay luôn tạo file mới, kể cả cùng thời điểm', () => {
    const a = writeManualSave(dir, 'g-a', save('2026-10-18T10:00:00.000Z'), 1000)
    const b = writeManualSave(dir, 'g-a', save('2026-10-18T10:00:00.000Z'), 1000)
    expect(a).toBe('g-a/manual-1000.json')
    expect(b).toBe('g-a/manual-1000-1.json')
    expect(readSave(dir, b)).toContain('2026-10-18')
  })

  it('liệt kê nhiều game; file hỏng vẫn hiện kèm lỗi', () => {
    writeAutosave(dir, 'g-a', save('2026-10-18T10:00:00.000Z'))
    writeManualSave(dir, 'g-b', save('2026-10-18T11:00:00.000Z'), 1)
    fs.writeFileSync(path.join(dir, 'g-b', 'manual-2.json'), '{ hỏng')
    fs.writeFileSync(path.join(dir, 'g-b', 'ghi-chu.txt'), 'bỏ qua')
    const entries = listSaves(dir)
    expect(entries.map((e) => [e.id, e.kind])).toEqual([
      ['g-b/manual-1.json', 'manual'],
      ['g-a/auto-1.json', 'auto'],
      ['g-b/manual-2.json', 'manual']
    ])
    expect(entries[2].error).toMatch(/hỏng/)
  })

  it('xóa một save; xóa save cuối thì xóa luôn thư mục game; xóa cả game', () => {
    const id = writeManualSave(dir, 'g-a', save('2026-10-18T10:00:00.000Z'), 1)
    deleteSave(dir, id)
    expect(fs.existsSync(path.join(dir, 'g-a'))).toBe(false)
    writeAutosave(dir, 'g-b', save('2026-10-18T10:00:00.000Z'))
    writeManualSave(dir, 'g-b', save('2026-10-18T10:00:00.000Z'), 2)
    deleteGame(dir, 'g-b')
    expect(listSaves(dir)).toEqual([])
  })

  it('chặn id / gameId lạ (path traversal)', () => {
    expect(() => readSave(dir, '../secret/auto-1.json')).toThrow(/không hợp lệ/)
    expect(() => readSave(dir, 'g-a/../../x.json')).toThrow(/không hợp lệ/)
    expect(() => writeAutosave(dir, '../x', '{}')).toThrow(/không hợp lệ/)
    expect(() => deleteGame(dir, '..')).toThrow(/không hợp lệ/)
  })
})

describe('Hardcore (docs/rules/challenge-modes.md)', () => {
  it('không lưu tay được; game thường vẫn lưu tay', () => {
    expect(() => writeManualSave(dir, 'g-h', save('2026-10-18T10:00:00.000Z', 0, true), 1)).toThrow(
      'Hardcore'
    )
    expect(fs.existsSync(path.join(dir, 'g-h'))).toBe(false)
    expect(writeManualSave(dir, 'g-n', save('2026-10-18T10:00:00.000Z'), 1)).toBe('g-n/manual-1.json')
  })

  it('chỉ mở được save mới nhất của game Hardcore; game thường mở được mọi save', () => {
    const old = writeAutosave(dir, 'g-h', save('2026-10-18T10:00:00.000Z', 1, true))
    const newest = writeAutosave(dir, 'g-h', save('2026-10-18T10:05:00.000Z', 2, true))
    expect(() => readSave(dir, old)).toThrow('Hardcore')
    expect(JSON.parse(readSave(dir, newest)).summary.money).toBe('2')
    const normalOld = writeAutosave(dir, 'g-n', save('2026-10-18T10:00:00.000Z', 1))
    writeAutosave(dir, 'g-n', save('2026-10-18T10:05:00.000Z', 2))
    expect(JSON.parse(readSave(dir, normalOld)).summary.money).toBe('1')
  })
})

describe('resolveSaveDir', () => {
  it('chọn thư mục đầu tiên ghi được', () => {
    const blocked = path.join(dir, 'file-chu-khong-phai-thu-muc')
    fs.writeFileSync(blocked, 'x')
    const chosen = resolveSaveDir([path.join(blocked, 'saves'), path.join(dir, 'ok', 'saves')])
    expect(chosen).toBe(path.join(dir, 'ok', 'saves'))
    expect(fs.existsSync(chosen)).toBe(true)
  })
})
