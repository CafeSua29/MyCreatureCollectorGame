import { describe, expect, it } from 'vitest'
import { contentIds, contentName, languageCodes, speciesInfoText } from './texts'
import { createGameData } from './gameData'
import { dataIssues, makeData, makeRawData } from '../testing'
import type { RawGameData } from '../model'

const data = makeData()

describe('contentName', () => {
  it('tra tên theo ngôn ngữ, loại nội dung và id', () => {
    expect(contentName(data, 'vi', 'species', 'weakling')).toBe('weakling')
    expect(contentName(data, 'en', 'species', 'weakling')).toBe('weakling-en')
    expect(contentName(data, 'en', 'biomes', 'lair')).toBe('lair-en')
    expect(contentName(data, 'en', 'items', 'potion')).toBe('potion-en')
  })

  it('ngôn ngữ không có thì dùng ngôn ngữ mặc định; id lạ thì trả lại id', () => {
    expect(contentName(data, 'fr', 'traits', 'fast')).toBe('fast')
    expect(contentName(data, 'en', 'skills', 'noSuchSkill')).toBe('noSuchSkill')
  })
})

describe('contentIds / languageCodes', () => {
  it('biome giữ thứ tự tầng; các loại khác theo chỉ mục', () => {
    expect(contentIds(data, 'biomes')).toEqual(['field', 'lair', 'pairs'])
    expect(contentIds(data, 'races')).toContain('neutral')
    expect(languageCodes(data)).toEqual(['vi', 'en'])
  })
})

/** Fixture có thông tin loài: tiếng Anh đủ, tiếng Việt chỉ có phân loại của weakling. */
function infoRaw(): RawGameData {
  const raw = makeRawData()
  raw.text.languages.en.speciesInfo = {
    category: { weakling: 'Sprout Monster' },
    flavor: { weakling: 'It hides in tall grass.' }
  }
  raw.text.languages.vi.speciesInfo = { category: { weakling: 'Quái mầm' } }
  return raw
}

describe('speciesInfoText', () => {
  const info = createGameData(infoRaw())

  it('theo ngôn ngữ; thiếu thì lấy ngôn ngữ mặc định rồi ngôn ngữ khác; dạng khác lấy loài gốc', () => {
    expect(speciesInfoText(info, 'vi', 'category', 'weakling')).toBe('Quái mầm')
    expect(speciesInfoText(info, 'en', 'category', 'weakling')).toBe('Sprout Monster')
    expect(speciesInfoText(info, 'vi', 'flavor', 'weakling')).toBe('It hides in tall grass.')
    expect(speciesInfoText(info, 'fr', 'category', 'weakling')).toBe('Quái mầm')
    expect(speciesInfoText(info, 'en', 'flavor', 'megaWeakling')).toBe('It hides in tall grass.')
    expect(speciesInfoText(info, 'en', 'flavor', 'twig')).toBeNull()
    expect(speciesInfoText(data, 'vi', 'category', 'weakling')).toBeNull()
  })

  it('kiểm tra: loại lạ, loài không tồn tại, chữ rỗng', () => {
    expect(dataIssues(infoRaw())).toEqual([])
    const raw = infoRaw()
    raw.text.languages.en.speciesInfo = {
      category: { ghost: 'Boo', weakling: ' ' },
      // Ép kiểu: cố ý thêm loại thông tin lạ để kiểm tra luật kiểm tra dữ liệu.
      ...({ habitat: { weakling: 'grass' } } as object)
    }
    const issues = dataIssues(raw).join('\n')
    expect(issues).toMatch(/speciesInfo\.category: loài không tồn tại "ghost"/)
    expect(issues).toMatch(/chữ của "weakling" phải là chuỗi không rỗng/)
    expect(issues).toMatch(/"habitat.json" không phải loại thông tin loài/)
  })
})
