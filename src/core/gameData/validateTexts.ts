// Kiểm tra chữ nội dung theo ngôn ngữ (mục "Đa ngôn ngữ" trong docs/rules/data.md): mọi ngôn ngữ
// phải có đủ tên cho mọi id, không thừa id, không trùng tên trong cùng loại.

import { CONTENT_KINDS, SPECIES_INFO_KINDS, type ContentKind, type GameData } from '../model'
import { asObject } from '../shared'
import { contentIds } from './texts'

/** Mã ngôn ngữ: 2–3 chữ thường, có thể kèm vùng (ví dụ "vi", "en", "pt-BR"). */
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/

/** Một loại nội dung của một ngôn ngữ: đủ id, không thừa, không rỗng, không trùng tên. */
function checkContentText(
  ids: readonly string[],
  value: unknown,
  where: string,
  issues: string[]
): void {
  const names = asObject(value)
  if (!names) {
    issues.push(`${where}: thiếu file hoặc không phải object id → tên`)
    return
  }
  const known = new Set(ids)
  const owners = new Map<string, string>()
  for (const id of ids) {
    const name = names[id]
    if (typeof name !== 'string' || name.trim() === '') {
      issues.push(`${where}: thiếu tên cho "${id}"`)
      continue
    }
    const owner = owners.get(name)
    if (owner !== undefined) issues.push(`${where}: "${owner}" và "${id}" trùng tên "${name}"`)
    else owners.set(name, id)
  }
  for (const id of Object.keys(names)) {
    if (!known.has(id)) issues.push(`${where}: có tên cho id không tồn tại "${id}"`)
  }
}

function checkLanguagePack(data: GameData, code: string, value: unknown, issues: string[]): void {
  const where = `Ngôn ngữ "${code}"`
  if (!LANGUAGE_CODE_PATTERN.test(code)) {
    issues.push(`${where}: mã ngôn ngữ phải dạng "vi", "en" hoặc "pt-BR"`)
  }
  const pack = asObject(value)
  if (!pack) {
    issues.push(`${where}: không phải object`)
    return
  }
  if (typeof pack.name !== 'string' || pack.name.trim() === '') {
    issues.push(`${where}: thiếu tên ngôn ngữ (language.json → name)`)
  }
  const content = asObject(pack.content) ?? {}
  for (const kind of CONTENT_KINDS) {
    checkContentText(contentIds(data, kind), content[kind], `${where}.${kind}`, issues)
  }
  for (const file of Object.keys(content)) {
    if (!CONTENT_KINDS.some((kind) => kind === file)) {
      issues.push(`${where}: file "${file}.json" không phải loại nội dung nào`)
    }
  }
  checkSpeciesInfo(data, pack.speciesInfo, `${where}.speciesInfo`, issues)
}

/** Thông tin loài (không bắt buộc): loại đã biết, id là loài tồn tại, chữ không rỗng. */
function checkSpeciesInfo(data: GameData, value: unknown, where: string, issues: string[]): void {
  if (value === undefined) return
  const info = asObject(value)
  if (!info) {
    issues.push(`${where}: phải là object loại → (id loài → chữ)`)
    return
  }
  for (const [kind, texts] of Object.entries(info)) {
    if (!SPECIES_INFO_KINDS.some((known) => known === kind)) {
      issues.push(`${where}: file "${kind}.json" không phải loại thông tin loài nào`)
      continue
    }
    const entries = asObject(texts)
    if (!entries) {
      issues.push(`${where}.${kind}: phải là object id loài → chữ`)
      continue
    }
    for (const [id, text] of Object.entries(entries)) {
      if (!Object.hasOwn(data.species, id))
        issues.push(`${where}.${kind}: loài không tồn tại "${id}"`)
      else if (typeof text !== 'string' || text.trim() === '') {
        issues.push(`${where}.${kind}: chữ của "${id}" phải là chuỗi không rỗng`)
      }
    }
  }
}

/** Nội dung còn trường name: chữ đã chuyển sang src/data/i18n (vật phẩm đã báo ở checkItems). */
function checkNoInlineNames(data: GameData, issues: string[]): void {
  const kinds: readonly ContentKind[] = CONTENT_KINDS.filter((kind) => kind !== 'items')
  for (const kind of kinds) {
    const entries: readonly { id: string }[] = Object.values(data[kind])
    for (const entry of entries) {
      if ('name' in entry) {
        issues.push(
          `${kind} "${entry.id}": trường "name" phải chuyển sang src/data/i18n/<ngôn ngữ>`
        )
      }
    }
  }
}

/** Kiểm tra toàn bộ chữ nội dung. */
export function checkTexts(data: GameData, issues: string[]): void {
  checkNoInlineNames(data, issues)
  const text = asObject(data.text)
  const languages = asObject(text?.languages)
  if (!text || !languages || Object.keys(languages).length === 0) {
    issues.push('Ngôn ngữ: cần ít nhất một ngôn ngữ trong src/data/i18n')
    return
  }
  for (const [code, pack] of Object.entries(languages)) {
    checkLanguagePack(data, code, pack, issues)
  }
  if (typeof text.defaultLanguage !== 'string' || !(text.defaultLanguage in languages)) {
    issues.push(
      `Ngôn ngữ: defaultLanguage (src/data/i18n/config.json) phải là một ngôn ngữ có sẵn, ` +
        `nhận "${String(text.defaultLanguage)}"`
    )
  }
}
