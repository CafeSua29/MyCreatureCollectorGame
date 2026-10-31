/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Dựng skill hoàn chỉnh từ mục chờ (skills-planned.json) và bảng quy đổi (partN.mjs): id, hệ,
// họ spell (tags) theo mô tả gốc. Dùng chung cho convert.mjs và conversions.test.ts.

import { readdirSync } from 'node:fs'

/** Họ spell theo mô tả / tên gốc (mục "Spell Siralim"). */
export function spellTags(planned) {
  const tags = []
  if (/Booze Spell/i.test(planned.description)) tags.push('booze')
  if (/Arsenal Spell/i.test(planned.description)) tags.push('arsenal')
  if (/ Arrow$/.test(planned.nameEn)) tags.push('arrow')
  if (/Ultimate spell/i.test(planned.description)) tags.push('ultimate')
  return tags
}

/** Skill của spell đã quy đổi (bỏ trường tạm `hits` khi không cần). */
export function buildSpellSkill(planned, conversion) {
  const tags = spellTags(planned)
  return {
    id: planned.id,
    elementId: planned.elementId,
    ...conversion,
    ...(tags.length ? { tags } : {})
  }
}

/** Gộp bảng quy đổi của mọi partN.mjs (báo lỗi nếu một spell quy đổi hai lần). */
export async function loadSpellConversions() {
  const dir = new URL('./', import.meta.url)
  const result = {}
  for (const file of readdirSync(dir)
    .filter((f) => /^part\d+\.mjs$/.test(f))
    .sort()) {
    const { CONVERSIONS } = await import(new URL(file, dir).href)
    for (const [id, value] of Object.entries(CONVERSIONS)) {
      if (id in result) throw new Error(`Spell "${id}" quy đổi hai lần (${file})`)
      result[id] = value
    }
  }
  return result
}
