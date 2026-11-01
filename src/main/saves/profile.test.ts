import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROFILE_FILE, readProfile, writeProfile } from './profile'
import { listSaves } from './saves'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-profile-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('profile.json', () => {
  it('chưa có file: null', () => {
    expect(readProfile(dir)).toBeNull()
    expect(readProfile(path.join(dir, 'missing'))).toBeNull()
  })

  it('ghi rồi đọc lại đúng nội dung, ghi đè được, không để lại file tạm', () => {
    writeProfile(dir, '{"a":1}')
    writeProfile(dir, '{"a":2}')
    expect(readProfile(dir)).toEqual('{"a":2}')
    expect(fs.readdirSync(dir)).toEqual([PROFILE_FILE])
  })

  it('nội dung hỏng vẫn trả chữ (core tự coi là rỗng); profile.json không lẫn vào danh sách save', () => {
    fs.writeFileSync(path.join(dir, PROFILE_FILE), '{hỏng')
    expect(readProfile(dir)).toEqual('{hỏng')
    expect(listSaves(dir)).toEqual([])
  })

  it('là thư mục / không đọc được: null', () => {
    fs.mkdirSync(path.join(dir, PROFILE_FILE))
    expect(readProfile(dir)).toBeNull()
  })
})
