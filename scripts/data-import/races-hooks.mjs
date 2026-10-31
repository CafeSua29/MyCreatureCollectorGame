/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Hàm dựng hook trait race dùng chung cho races-table.mjs và races-traits-more.mjs.

export const S = (stat, n) => ({ type: 'statModifier', params: { percent: { [stat]: n } } })
export const S2 = (a, b, n, m = n) => ({
  type: 'statModifier',
  params: { percent: { [a]: n, [b]: m } }
})
export const dodge = (n) => ({ type: 'dodge', params: { percent: n } })
export const crit = (n) => ({ type: 'critChanceModifier', params: { percent: n } })
export const critDmg = (n) => ({ type: 'critDamageModifier', params: { percent: n } })
export const acc = (n) => ({ type: 'accuracyModifier', params: { percent: n } })
export const tough = (n) => ({ type: 'damageTakenModifier', params: { percent: -n } })
export const fullHp = (n) => ({ type: 'damageTakenAtFullHp', params: { percent: -n } })
export const regen = (n) => ({ type: 'regen', params: { percent: n } })
export const resist = (el, n) => ({
  type: 'elementDamageTaken',
  params: { elementIds: [el], percent: -n }
})
export const boostEl = (el, n) => ({
  type: 'elementDamageDealt',
  params: { elementIds: [el], percent: n }
})
export const ally = (pct) => ({ type: 'statModifierWithAlly', params: { percent: pct } })
export const first = (turns, pct) => ({
  type: 'statModifierFirstTurns',
  params: { turns, percent: pct }
})
export const low = (below, pct) => ({
  type: 'statModifierWhileLowHp',
  params: { hpBelowPercent: below, percent: pct }
})
export const high = (above, pct) => ({
  type: 'statModifierWhileHighHp',
  params: { hpAbovePercent: above, percent: pct }
})
export const weather = (ids, pct) => ({
  type: 'statModifierInWeather',
  params: { weatherIds: ids, percent: pct }
})
export const onAtk = (cat, statusId, chance) => ({
  type: 'onAttackApplyStatus',
  params: { category: cat, statuses: [{ statusId, chance }] }
})
export const onHit = (statusId, chance) => ({
  type: 'onHitApplyStatus',
  params: { category: 'physical', statuses: [{ statusId, chance }] }
})
export const spikes = (n) => ({
  type: 'retaliateDamage',
  params: { category: 'physical', percentOfAttackerMaxHp: n }
})
export const leech = (n) => ({ type: 'lifesteal', params: { percent: n } })
export const heals = (n) => ({ type: 'healingModifier', params: { received: n } })
export const immune = (...ids) => ({ type: 'statusImmunity', params: { statusIds: ids } })
export const noLower = (...stats) => ({ type: 'statLowerImmunity', params: { stats } })
export const intimidate = (stat) => ({
  type: 'stageOnEntry',
  params: { target: 'allEnemies', stat, stages: -1 }
})
export const survive = () => ({ type: 'surviveLethal', params: { fromFullHp: true } })
export const exp = (n) => ({ type: 'expRewardModifier', params: { percent: n } })
