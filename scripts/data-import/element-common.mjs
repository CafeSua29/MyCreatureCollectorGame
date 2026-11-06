/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Phần chung khi thêm một hệ mới cho game (docs/rules/data.md mục "Thêm hệ mới"): hệ + khắc hệ, tên,
// đồ theo hệ (chép mẫu của hệ đá), công thức, dòng đồ, số cân bằng theo hệ, cộng hưởng đội đồng hệ.
// Dùng bởi cb-elements-import.mjs (Thủy tinh / Nhựa / Kim tuyến) và phereon-import.mjs (Nấm). Chạy
// lại được: mục đã có thì giữ.
//
// Mỗi hệ mới: { id, suffix, vi, viTitle, en, divineSkills: [skillId, skillId], workPercents }.

import { readFileSync, writeFileSync } from 'node:fs'

export const dataFile = (name) => new URL(`../../src/data/${name}`, import.meta.url)
export const readJson = (name) => JSON.parse(readFileSync(dataFile(name), 'utf8'))
export const writeJson = (name, value) =>
  writeFileSync(dataFile(name), JSON.stringify(value, null, 2) + '\n')

/** Thêm hệ (chưa có thì tạo rỗng) rồi gộp khắc hệ theo bảng `effectiveness` (hệ đánh → hệ bị đánh → hệ số). */
export function addElements(newElements, effectiveness) {
  const elements = readJson('elements.json')
  for (const { id } of newElements) {
    if (!elements.some((element) => element.id === id)) elements.push({ id, effectiveness: {} })
  }
  for (const element of elements) Object.assign(element.effectiveness, effectiveness[element.id])
  writeJson('elements.json', elements)
}

/** Thêm mục vào file tên i18n; đã có khóa thì giữ. */
export function addNames(file, entries) {
  for (const [language, names] of Object.entries(entries)) {
    const name = `i18n/${language}/${file}.json`
    writeJson(name, { ...names, ...readJson(name) })
  }
}

export const addElementNames = (newElements) =>
  addNames('elements', {
    vi: Object.fromEntries(newElements.map((el) => [el.id, el.vi])),
    en: Object.fromEntries(newElements.map((el) => [el.id, el.en]))
  })

// Đồ theo hệ: id mẫu của hệ đá → id của hệ mới, tên theo ngôn ngữ.
const ITEM_TEMPLATES = [
  [
    'rockGem',
    (el) => `${el.id}Gem`,
    (el) => `Đá quý hệ ${el.vi.toLowerCase()}`,
    (el) => `${el.en} Gem`
  ],
  [
    'rockTeraShard',
    (el) => `${el.id}TeraShard`,
    (el) => `Mảnh Tera ${el.viTitle}`,
    (el) => `${el.en} Tera Shard`
  ],
  [
    'rockZCrystal',
    (el) => `${el.id}ZCrystal`,
    (el) => `Pha Lê Z ${el.viTitle}`,
    (el) => `${el.en} Z-Crystal`
  ],
  [
    'demonCoreRock',
    (el) => `demonCore${el.suffix}`,
    (el) => `Yêu Đan ${el.viTitle}`,
    (el) => `${el.en} Demon Core`
  ],
  [
    'spiritStoneRock',
    (el) => `spiritStone${el.suffix}`,
    (el) => `Linh Thạch ${el.viTitle}`,
    (el) => `${el.en} Spirit Stone`
  ],
  [
    'awakeningPillRock',
    (el) => `awakeningPill${el.suffix}`,
    (el) => `Thức Tỉnh Đan (${el.viTitle})`,
    (el) => `Awakening Pill (${el.en})`
  ]
]

/** Đổi mọi tham chiếu hệ đá trong một mục mẫu sang hệ `el`. */
export const retarget = (value, el) =>
  JSON.parse(
    JSON.stringify(value)
      .replace(/"rock"/g, `"${el.id}"`)
      .replace(/rock(Gem|TeraShard|ZCrystal)/g, `${el.id}$1`)
      .replace(/(demonCore|spiritStone|awakeningPill|affixImbue)Rock/g, `$1${el.suffix}`)
  )

/** Số hệ tối thiểu để coi một món là "tăng mọi hệ" (Life Orb...): món đó phải có đủ hệ mới. */
const ALL_ELEMENTS_MIN = 19

export function addItems(newElements) {
  const items = readJson('items.json')
  const known = new Set(items.map((item) => item.id))
  const names = { vi: {}, en: {} }
  for (const el of newElements) {
    for (const [templateId, idOf, viOf, enOf] of ITEM_TEMPLATES) {
      const id = idOf(el)
      names.vi[id] = viOf(el)
      names.en[id] = enOf(el)
      if (known.has(id)) continue
      const template = items.find((item) => item.id === templateId)
      if (!template) throw new Error(`Không có item mẫu "${templateId}"`)
      items.push(retarget(template, el))
    }
  }
  for (const item of items) {
    const ids = item.mainLine?.hook?.params?.elementIds
    if (!Array.isArray(ids) || ids.length < ALL_ELEMENTS_MIN) continue
    for (const el of newElements) if (!ids.includes(el.id)) ids.push(el.id)
  }
  writeJson('items.json', items)
  addNames('items', names)
}

export function addRecipes(newElements) {
  const recipes = readJson('recipes.json')
  const templates = recipes.filter((recipe) =>
    /(demonCore|spiritStone|awakeningPill)Rock/.test(JSON.stringify(recipe))
  )
  for (const el of newElements) {
    for (const template of templates) {
      const recipe = retarget(template, el)
      if (!recipes.some((entry) => entry.id === recipe.id)) recipes.push(recipe)
    }
  }
  writeJson('recipes.json', recipes)
}

export function addAffixes(newElements) {
  const affixes = readJson('equipmentAffixes.json')
  const template = affixes.find((affix) => affix.id === 'affixImbueRock')
  for (const el of newElements) {
    const affix = retarget(template, el)
    if (!affixes.some((entry) => entry.id === affix.id)) affixes.push(affix)
  }
  writeJson('equipmentAffixes.json', affixes)
}

/** Cộng hưởng đội đồng hệ (chép mẫu hệ đá, `team.md`). */
export function addSynergies(newElements) {
  const synergies = readJson('synergies.json')
  const template = synergies.find((entry) => entry.id === 'elementRock')
  if (!template) throw new Error('Không có cộng hưởng mẫu "elementRock"')
  const names = { vi: {}, en: {} }
  for (const el of newElements) {
    const id = `element${el.suffix}`
    names.vi[id] = `Đồng hệ: ${el.viTitle}`
    names.en[id] = `Same element: ${el.en}`
    if (synergies.some((entry) => entry.id === id)) continue
    synergies.push({ ...retarget(template, el), id })
  }
  writeJson('synergies.json', synergies)
  addNames('synergies', names)
}

/** Thêm phần tử ngay sau `"key": {` / `"key": [` trong text (không ghi lại cả balance.json). */
export function insertAfterKey(text, key, body) {
  const pattern = new RegExp(`"${key}":\\s*[{\\[]`)
  if (!pattern.test(text)) throw new Error(`balance.json không có khóa "${key}"`)
  return text.replace(pattern, (head) => `${head}\n${body},\n`)
}

/** Chép mục phẳng chứa itemId mẫu thành mục của hệ mới, ngay sau mục mẫu. */
function cloneFlatEntry(text, itemId, el) {
  const pattern = new RegExp(`\\{[^{}]*"itemId":\\s*"${itemId}"[^{}]*\\}`)
  const found = pattern.exec(text)
  if (!found) throw new Error(`balance.json không có mục "${itemId}"`)
  const clone = JSON.stringify(retarget(JSON.parse(found[0]), el))
  return text.replace(found[0], () => `${found[0]},\n${clone}`)
}

/** Số cân bằng theo hệ trong balance.json: thần thông, đan / yêu đan / linh thạch, dòng đồ, giá. */
export function addBalance(newElements) {
  const file = dataFile('balance.json')
  let text = readFileSync(file, 'utf8')
  const config = JSON.parse(text)
  const pending = newElements.filter((el) => !(el.id in config.awakening.divineSkills))
  for (const el of pending) {
    const entry = (value) => `${JSON.stringify(el.id)}: ${JSON.stringify(value)}`
    text = insertAfterKey(text, 'divineSkills', entry(el.divineSkills))
    text = insertAfterKey(text, 'pillItemIds', entry(`awakeningPill${el.suffix}`))
    text = insertAfterKey(text, 'demonCoreItemIds', entry(`demonCore${el.suffix}`))
    text = insertAfterKey(text, 'elementStoneItemIds', entry(`spiritStone${el.suffix}`))
    text = insertAfterKey(text, 'lineIds', entry(`affixImbue${el.suffix}`))
    text = insertAfterKey(text, 'demonCore', JSON.stringify(`demonCore${el.suffix}`))
    text = insertAfterKey(text, 'extraItemIds', JSON.stringify(`${el.id}ZCrystal`))
    // Khóa "elements" chỉ dùng cho % chỉ số làm việc theo hệ.
    text = text.replace(
      /("workStatPercents":\s*\{[^]*?"elements":\s*\{)/,
      (head) => `${head}\n${entry(el.workPercents)},\n`
    )
    for (const itemId of [
      'awakeningPillRock',
      'spiritStoneRock',
      'rockTeraShard',
      'demonCoreRock'
    ]) {
      text = cloneFlatEntry(text, itemId, el)
    }
  }
  JSON.parse(text)
  writeFileSync(file, text)
}

/** Mọi bước dữ liệu chung của hệ mới (trừ skill và loài, do script nguồn tự làm). */
export function addElementContent(newElements, effectiveness) {
  addElements(newElements, effectiveness)
  addElementNames(newElements)
  addItems(newElements)
  addRecipes(newElements)
  addAffixes(newElements)
  addSynergies(newElements)
  addBalance(newElements)
}

/** Thêm / ghi đè trạng thái: `[id, vi, en, trọng số AI, định nghĩa]`; trọng số AI chỉ thêm khi chưa có. */
export function addStatuses(list) {
  const statuses = readJson('statuses.json')
  for (const [id, , , , definition] of list) {
    const value = { id, ...definition }
    const at = statuses.findIndex((entry) => entry.id === id)
    if (at >= 0) statuses[at] = value
    else statuses.push(value)
  }
  writeJson('statuses.json', statuses)
  addNames('statuses', {
    vi: Object.fromEntries(list.map(([id, vi]) => [id, vi])),
    en: Object.fromEntries(list.map(([id, , en]) => [id, en]))
  })
  const file = dataFile('balance.json')
  let text = readFileSync(file, 'utf8')
  const known = JSON.parse(text).ai.statusWeights
  for (const [id, , , weight] of list) {
    if (id in known) continue
    text = insertAfterKey(text, 'statusWeights', `${JSON.stringify(id)}: ${weight}`)
  }
  JSON.parse(text)
  writeFileSync(file, text)
}

/** Thêm / ghi đè skill: `[skill, vi, en]`. */
export function addSkills(list) {
  const skills = readJson('skills.json')
  const names = { vi: {}, en: {} }
  for (const [skill, vi, en] of list) {
    names.vi[skill.id] = vi
    names.en[skill.id] = en
    // Ghi qua JSON để bỏ trường undefined của các mẫu; skill của script thì ghi đè bản cũ.
    const value = JSON.parse(JSON.stringify(skill))
    const at = skills.findIndex((entry) => entry.id === skill.id)
    if (at >= 0) skills[at] = value
    else skills.push(value)
  }
  writeJson('skills.json', skills)
  addNames('skills', names)
}
