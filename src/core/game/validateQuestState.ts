// Kiểm tra bảng nhiệm vụ trong save (docs/rules/quests.md).

import { QUEST_TYPES } from '../quests'
import type { GameData } from '../model'
import { asObject, checkBig, checkInteger } from '../shared'

function checkInstance(
  data: GameData,
  value: unknown,
  { at, active }: { at: string; active: boolean },
  issues: string[]
): string | null {
  const quest = asObject(value)
  if (!quest) {
    issues.push(`${at} phải là object`)
    return null
  }
  if (typeof quest.id !== 'string' || !/^q\d+$/.test(quest.id)) {
    issues.push(`${at}.id phải có dạng "q<số>"`)
  }
  if (typeof quest.templateId !== 'string' || !Object.hasOwn(data.quests, quest.templateId)) {
    issues.push(`${at}.templateId: mẫu nhiệm vụ không tồn tại "${String(quest.templateId)}"`)
  }
  const type = asObject(quest.objective)?.type
  if (typeof type !== 'string' || !Object.hasOwn(QUEST_TYPES, type)) {
    issues.push(`${at}.objective.type: loại nhiệm vụ lạ "${String(type)}"`)
  }
  issues.push(...checkInteger(quest.target, `${at}.target`, 1))
  const reward = asObject(quest.reward)
  issues.push(...checkBig(reward?.money, `${at}.reward.money`, 0))
  if (!Array.isArray(reward?.items)) issues.push(`${at}.reward.items phải là danh sách`)
  if (active) {
    issues.push(...checkInteger(quest.progress, `${at}.progress`, 0))
    if (typeof quest.progress === 'number' && typeof quest.target === 'number') {
      if (quest.progress > quest.target) issues.push(`${at}.progress không được vượt target`)
    }
  } else if ('progress' in quest) {
    issues.push(`${at}: nhiệm vụ trên bảng không có progress`)
  }
  return typeof quest.id === 'string' ? quest.id : null
}

/**
 * quests: bảng ≤ boardSize, đang nhận ≤ maxActive, nhiệm vụ tông ≤ missions.count, id không trùng
 * (cả ba danh sách) và nhỏ hơn nextQuestId.
 */
export function validateQuestState(data: GameData, value: unknown): string[] {
  const quests = asObject(value)
  if (!quests) return ['quests phải là object']
  const issues = checkInteger(quests.nextQuestId, 'quests.nextQuestId', 1)
  const ids: string[] = []
  for (const [key, max, active] of [
    ['board', data.config.quests.boardSize, false],
    ['active', data.config.quests.maxActive, true],
    // Nhiệm vụ tông môn (docs/rules/sects.md): tự nhận nên có tiến độ như nhiệm vụ đang nhận.
    ['sect', data.config.sects.missions.count, true]
  ] as const) {
    const list = quests[key]
    if (!Array.isArray(list)) {
      issues.push(`quests.${key} phải là danh sách`)
      continue
    }
    if (list.length > max) issues.push(`quests.${key}: tối đa ${max} nhiệm vụ`)
    list.forEach((entry, i) => {
      const id = checkInstance(data, entry, { at: `quests.${key}[${i}]`, active }, issues)
      if (id !== null) ids.push(id)
    })
  }
  if (new Set(ids).size !== ids.length) issues.push('quests: id nhiệm vụ bị trùng')
  const next = typeof quests.nextQuestId === 'number' ? quests.nextQuestId : Infinity
  if (ids.some((id) => Number(id.slice(1)) >= next)) {
    issues.push('quests.nextQuestId phải lớn hơn mọi id nhiệm vụ')
  }
  return issues
}
