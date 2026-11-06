// Luyện thể (docs/rules/body-refinement.md, theo Transform body của Portals of Phereon; không gọi là
// "tiến hóa" vì game đã có tiến hóa loài): mỗi bộ phận của quái lắp một kiểu luyện thể của bộ phận đó,
// kiểu cho hook như trait cấp 1; đủ số bộ phận cùng nhãn thì có thưởng bộ (bậc cao nhất đạt được).
// Điểm duy nhất hỏi hook luyện thể của quái (traitHooks.ownHooks gọi).

import type { GameData, Monster, RefinementTagBonus, TraitHookDef } from '../model'

/** Số bộ phận đang lắp mang từng nhãn. */
export function refinementTagCounts(data: GameData, monster: Monster): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const refinementId of Object.values(monster.refinements)) {
    for (const tag of data.bodyRefinements[refinementId]?.tags ?? []) {
      counts[tag] = (counts[tag] ?? 0) + 1
    }
  }
  return counts
}

/** Thưởng bộ đang có: mỗi nhãn lấy bậc có `count` cao nhất mà quái đạt. */
export function activeRefinementBonuses(data: GameData, monster: Monster): RefinementTagBonus[] {
  const counts = refinementTagCounts(data, monster)
  const best = new Map<string, RefinementTagBonus>()
  for (const bonus of data.config.bodyRefinement.tagBonuses) {
    if ((counts[bonus.tag] ?? 0) < bonus.count) continue
    const current = best.get(bonus.tag)
    if (!current || bonus.count > current.count) best.set(bonus.tag, bonus)
  }
  return [...best.values()]
}

/** Hook của luyện thể: mọi kiểu đang lắp rồi thưởng bộ; sourceId = id kiểu / "nhãn:số". */
export function refinementHooks(
  data: GameData,
  monster: Monster
): { hooks: readonly TraitHookDef[]; sourceId: string }[] {
  const parts = Object.values(monster.refinements).flatMap((refinementId) => {
    const refinement = data.bodyRefinements[refinementId]
    return refinement ? [{ hooks: refinement.hooks, sourceId: refinement.id }] : []
  })
  const bonuses = activeRefinementBonuses(data, monster).map((bonus) => ({
    hooks: bonus.hooks,
    sourceId: `${bonus.tag}:${bonus.count}`
  }))
  return [...parts, ...bonuses]
}
