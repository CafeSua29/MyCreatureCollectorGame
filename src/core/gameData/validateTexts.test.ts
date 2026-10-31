import { describe, expect, it } from 'vitest'
import { rawGameData } from '@data'
import { tryCreateGameData } from './gameData'
import { dataIssuesAfter, makeRawData, withFixtureText } from '../testing'
import type { RawGameData } from '../model'

/** Lỗi dữ liệu sau khi sửa raw (fixture hợp lệ trước khi sửa). */
const issuesAfter = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join('\n')

describe('checkTexts', () => {
  it('fixture (vi + en) hợp lệ; chỉ một ngôn ngữ cũng hợp lệ', () => {
    expect(issuesAfter(() => {})).toBe('')
    expect(issuesAfter((raw) => delete raw.text.languages.en)).toBe('')
  })

  it('dữ liệu thật có đủ chữ ở mọi ngôn ngữ', () => {
    const result = tryCreateGameData(rawGameData)
    expect(result.ok ? [] : result.issues).toEqual([])
    expect(result.ok && Object.keys(result.data.text.languages).length).toBeGreaterThanOrEqual(2)
  })

  it('thiếu tên ở một ngôn ngữ (thiếu id hoặc chuỗi rỗng) thì báo lỗi', () => {
    const text = issuesAfter((raw) => {
      delete raw.text.languages.en.content.species.weakling
      raw.text.languages.vi.content.skills.strike = '  '
    })
    expect(text).toMatch(/Ngôn ngữ "en"\.species: thiếu tên cho "weakling"/)
    expect(text).toMatch(/Ngôn ngữ "vi"\.skills: thiếu tên cho "strike"/)
  })

  it('thêm nội dung mà quên thêm chữ thì báo lỗi; tạo lại chữ thì hết', () => {
    const raw = makeRawData()
    raw.biomes.push({ ...raw.biomes[0], id: 'newBiome' })
    const missing = tryCreateGameData(raw)
    expect(missing.ok ? '' : missing.issues.join()).toMatch(/biomes: thiếu tên cho "newBiome"/)
    expect(tryCreateGameData(withFixtureText(raw)).ok).toBe(true)
  })

  it('tên cho id không tồn tại, file lạ, thiếu cả file thì báo lỗi', () => {
    const text = issuesAfter((raw) => {
      raw.text.languages.vi.content.items.ghostItem = 'Ma'
      const content = raw.text.languages.en.content as unknown as Record<string, unknown>
      content.monsters = {}
      delete content.races
    })
    expect(text).toMatch(/"vi"\.items: có tên cho id không tồn tại "ghostItem"/)
    expect(text).toMatch(/"en": file "monsters\.json" không phải loại nội dung nào/)
    expect(text).toMatch(/"en"\.races: thiếu file/)
  })

  it('hai nội dung cùng loại trùng tên thì báo lỗi; khác loại thì được', () => {
    const text = issuesAfter((raw) => {
      raw.text.languages.vi.content.species.twig = 'weakling'
    })
    expect(text).toMatch(/"vi"\.species: "weakling" và "twig" trùng tên "weakling"/)
    expect(
      issuesAfter((raw) => {
        raw.text.languages.vi.content.races.neutral = 'weakling'
      })
    ).toBe('')
  })

  it('ngôn ngữ mặc định phải tồn tại; mã ngôn ngữ đúng dạng; thiếu tên ngôn ngữ', () => {
    expect(issuesAfter((raw) => (raw.text.defaultLanguage = 'fr'))).toMatch(
      /defaultLanguage .* phải là một ngôn ngữ có sẵn, nhận "fr"/
    )
    const text = issuesAfter((raw) => {
      raw.text.languages['Viet Nam'] = raw.text.languages.vi
      raw.text.languages.en.name = ''
    })
    expect(text).toMatch(/Ngôn ngữ "Viet Nam": mã ngôn ngữ phải dạng/)
    expect(text).toMatch(/Ngôn ngữ "en": thiếu tên ngôn ngữ/)
    expect(issuesAfter((raw) => (raw.text.languages['pt-BR'] = raw.text.languages.en))).toBe('')
  })

  it('không có ngôn ngữ nào thì báo lỗi', () => {
    expect(issuesAfter((raw) => (raw.text.languages = {}))).toMatch(/cần ít nhất một ngôn ngữ/)
  })

  it('nội dung còn trường name (chữ phải nằm trong i18n) thì báo lỗi', () => {
    const text = issuesAfter((raw) => {
      Object.assign(raw.species[0], { name: 'Yếu' })
      Object.assign(raw.biomes[0], { name: 'Cánh đồng' })
      Object.assign(raw.items[0], { name: 'Thuốc' })
    })
    expect(text).toMatch(/species "weakling": trường "name" phải chuyển sang src\/data\/i18n/)
    expect(text).toMatch(/biomes "field": trường "name" phải chuyển sang/)
    expect(text).toMatch(/Vật phẩm "potion": trường "name" không thuộc category/)
  })
})
