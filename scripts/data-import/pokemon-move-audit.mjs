/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Rà chiêu Pokémon so với bản gốc (docs/rules/pokemon-moves-flow.md): tải data/moves.ts của
// Pokémon Showdown (bản server, còn đủ hàm xử lý; bản client ở showdown.mjs đã bỏ phần lớn), tìm
// chiêu có cơ chế riêng (hàm / trường ngoài số cơ bản) mà skill cùng id trong game chưa có hiệu ứng
// nào, và chiêu chính thức chưa nhập. Chỉ đọc chữ bằng regex, không chạy code tải về.
// Chạy: node scripts/data-import/pokemon-move-audit.mjs → pokemon-move-audit-report.json

import { readFileSync, writeFileSync } from 'node:fs'
import { camelId } from './showdown.mjs'

const SOURCE = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts'
const SKILLS = new URL('../../src/data/skills.json', import.meta.url)
const REPORT = new URL('./pokemon-move-audit-report.json', import.meta.url)

// Trường chỉ là số / hiệu ứng cơ bản mà lúc nhập đã quy đổi (bậc, hồi, hút, phản, trạng thái...).
const BASIC_KEYS = new Set([
  'num',
  'accuracy',
  'basePower',
  'category',
  'name',
  'pp',
  'priority',
  'flags',
  'target',
  'type',
  'contestType',
  'zMove',
  'maxMove',
  'secondary',
  'desc',
  'shortDesc',
  'isNonstandard',
  'boosts',
  'recoil',
  'drain',
  'heal',
  'status',
  'multihit',
  'critRatio',
  'willCrit',
  'self',
  'secondaries',
  'gen',
  'isZ',
  'isMax',
  'realMove',
  'noPPBoosts',
  'pressureTarget',
  'ignoreImmunity',
  'hasSheerForce',
  'weather',
  'terrain',
  'callsMove',
  'overrideMove'
])
// Chiêu fan làm (CAP, Custom) không nhập; chiêu Let's Go, chiêu sự kiện / NPC (Unobtainable) và chiêu
// mới (Future: Nihil Light của Legends Z-A) đều đã nhập.
const SKIPPED_NONSTANDARD = /isNonstandard: "(CAP|Custom)"/

/** Có hiệu ứng nào trong game không (không thì skill đang chạy như đòn thường). */
const hasGameMechanic = (skill) =>
  skill.effects.length > 0 ||
  skill.spell !== undefined ||
  skill.powerFormula !== undefined ||
  skill.fieldModifiers !== undefined ||
  skill.hits !== undefined ||
  skill.firstTurnOnly !== undefined ||
  skill.maxMove !== undefined ||
  skill.zMove !== undefined

// Callback / trường Showdown → trường cơ chế game xử lý nó (pokemon-moves.md). Khóa nào có hàm trả
// true với skill là đã xử lý; khóa không có trong bảng thì cần xem tay.
const anyEffect = (skill) =>
  skill.effects.length > 0 ||
  skill.spell?.after !== undefined ||
  skill.spell?.onTarget !== undefined ||
  skill.delayedTurns !== undefined
const powerRule = (skill) =>
  flowRule(skill) ||
  skill.powerFormula !== undefined ||
  skill.randomPower !== undefined ||
  skill.spell?.powerBonus !== undefined ||
  skill.spell?.powerTimes !== undefined ||
  skill.fieldModifiers !== undefined ||
  skill.hitsInvulnerable !== undefined ||
  skill.escalatingHits !== undefined
const flowRule = (skill) =>
  skill.bide !== undefined ||
  skill.carriesTarget !== undefined ||
  skill.onAlly !== undefined ||
  skill.pursuit !== undefined ||
  skill.pullsAllySameSkill !== undefined ||
  skill.formOverrides !== undefined ||
  skill.powerFormula?.value?.counter?.of === 'fieldStreak'
const tryRule = (skill) =>
  flowRule(skill) ||
  skill.spell?.requires !== undefined ||
  skill.charge !== undefined ||
  skill.chargeAtTurnStart !== undefined ||
  skill.firstTurnOnly !== undefined ||
  skill.breaksScreens !== undefined ||
  skill.stealsBoosts !== undefined ||
  skill.selfFaint !== undefined ||
  skill.lockIn !== undefined ||
  skill.delayedTurns !== undefined ||
  skill.targetsLastAttacker !== undefined ||
  skill.effects.some((effect) => effect.type === 'protect') ||
  anyEffect(skill)
const HANDLED = {
  basePowerCallback: powerRule,
  onBasePower: powerRule,
  damageCallback: (skill) => skill.fixedDamage !== undefined,
  damage: (skill) => skill.fixedDamage !== undefined,
  ohko: (skill) => skill.fixedDamage?.kind === 'ohko',
  onModifyType: (skill) =>
    flowRule(skill) ||
    skill.elementFromUser !== undefined ||
    skill.elementFromGenes !== undefined ||
    skill.elementFromHeldItem !== undefined ||
    (skill.fieldModifiers ?? []).some((modifier) => modifier.elementId !== undefined) ||
    skill.zMove !== undefined,
  onTry: tryRule,
  onTryHit: (skill) => tryRule(skill) || skill.powerFormula !== undefined,
  onTryMove: tryRule,
  onPrepareHit: (skill) => tryRule(skill) || skill.elementFromUser !== undefined,
  onTryImmunity: (skill) => tryRule(skill) || skill.fixedDamage !== undefined,
  onHit: (skill) => anyEffect(skill) || flowRule(skill),
  onAfterHit: anyEffect,
  onAfterMoveSecondarySelf: anyEffect,
  onAfterMoveSecondary: anyEffect,
  onAfterSubDamage: anyEffect,
  onHitField: anyEffect,
  onHitSide: anyEffect,
  onAfterMove: (skill) =>
    anyEffect(skill) ||
    skill.selfFaint !== undefined ||
    skill.crashDamagePercent !== undefined ||
    skill.curesTargetStatuses !== undefined ||
    skill.lockIn !== undefined ||
    skill.chargeAtTurnStart !== undefined,
  volatileStatus: (skill) => anyEffect(skill) || flowRule(skill),
  // Trạng thái riêng của chiêu: nạp / bán vô hình, khóa, chuỗi dùng liên tiếp, đòn trả, nạp đầu lượt.
  condition: (skill) =>
    flowRule(skill) ||
    anyEffect(skill) ||
    skill.charge !== undefined ||
    skill.lockIn !== undefined ||
    skill.chargeAtTurnStart !== undefined ||
    skill.powerFormula !== undefined ||
    skill.fixedDamage !== undefined,
  sideCondition: anyEffect,
  pseudoWeather: anyEffect,
  slotCondition: anyEffect,
  selfdestruct: (skill) => skill.selfFaint !== undefined,
  mindBlownRecoil: (skill) => skill.selfDamagePercent !== undefined,
  hasCrashDamage: (skill) => skill.crashDamagePercent !== undefined,
  onMoveFail: (skill) =>
    flowRule(skill) ||
    skill.crashDamagePercent !== undefined ||
    skill.selfDamagePercent !== undefined,
  ignoreDefensive: (skill) => skill.ignoresTargetStages === true,
  ignoreEvasion: (skill) => skill.ignoresTargetStages === true || skill.alwaysHits === true,
  overrideOffensiveStat: (skill) => skill.attackFrom !== undefined,
  overrideOffensivePokemon: (skill) => skill.attackFrom !== undefined,
  overrideDefensiveStat: (skill) => skill.defenseStat !== undefined,
  onModifyMove: (skill) =>
    flowRule(skill) ||
    skill.categoryRule !== undefined ||
    skill.randomPower !== undefined ||
    skill.lockIn !== undefined ||
    skill.fieldModifiers !== undefined ||
    skill.spell !== undefined ||
    skill.alwaysHits === true ||
    anyEffect(skill),
  breaksProtect: (skill) => skill.breaksProtect === true,
  stallingMove: (skill) =>
    skill.effects.some((effect) => effect.type === 'protect' || effect.type === 'setSideField'),
  thawsTarget: (skill) => skill.curesTargetStatuses !== undefined,
  selfSwitch: (skill) =>
    skill.effects.some((effect) => effect.type === 'switchOut') ||
    (skill.spell?.after ?? []).some((effect) => effect.do === 'revive'),
  forceSwitch: (skill) => skill.effects.some((effect) => effect.type === 'forceSwitch'),
  sleepUsable: (skill) => skill.usableWhileStatusIds !== undefined,
  stealsBoosts: (skill) => skill.stealsBoosts === true,
  ignoreAbility: (skill) => skill.ignoresAbility === true,
  onDamage: (skill) => skill.leavesOneHp === true,
  onEffectiveness: (skill) => skill.effectiveness !== undefined,
  priorityChargeCallback: (skill) =>
    skill.chargeAtTurnStart !== undefined ||
    skill.effects.some((effect) => effect.type === 'switchOut'),
  beforeMoveCallback: (skill) => skill.chargeAtTurnStart !== undefined || tryRule(skill),
  onModifyPriority: (skill) => (skill.fieldModifiers ?? []).some((m) => m.priority !== undefined),
  multiaccuracy: (skill) => skill.hits !== undefined,
  smartTarget: (skill) => skill.hits !== undefined,
  // Chỉ là thông báo / dữ liệu phụ của Showdown, không đổi kết quả.
  onUseMoveMessage: () => true,
  beforeTurnCallback: (skill) => skill.fixedDamage?.kind === 'counter' || flowRule(skill),
  onModifyTarget: (skill) =>
    skill.targetsLastAttacker !== undefined ||
    (skill.fieldModifiers ?? []).some((m) => m.target !== undefined),
  onDamagePriority: (skill) => skill.leavesOneHp === true,
  chloroblastRecoil: (skill) => skill.selfDamagePercent !== undefined,
  onDisableMove: (skill) => skill.spell?.requires !== undefined,
  selfBoost: (skill) => skill.effects.length > 0 || skill.spell?.after !== undefined,
  hasSheerForceBoost: () => true,
  tags: () => true,
  placeholderFor: () => true,
  noSketch: () => true,
  tracksTarget: () => true,
  struggleRecoil: () => true,
  isFutureMove: (skill) => skill.delayedTurns !== undefined
}

// Splash, Celebrate: không làm gì; Tera Blast: xử lý riêng ở battle/transform.ts (battleSkill).
const NO_EFFECT = new Set(['splash', 'celebrate', 'holdHands', 'teraBlast'])

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`Tải moves.ts lỗi ${response.status}`)
const source = await response.text()
const skills = JSON.parse(readFileSync(SKILLS, 'utf8'))
const byId = new Map(skills.map((skill) => [skill.id, skill]))
const byLowerId = new Map(skills.map((skill) => [skill.id.toLowerCase(), skill.id]))

const plain = {}
const partial = {}
const missing = []
for (const block of source.split(/\n\t(?=[a-z0-9]+: \{)/)) {
  const id = block.match(/^([a-z0-9]+): \{/)?.[1]
  if (!id || SKIPPED_NONSTANDARD.test(block)) continue
  const keys = [...new Set([...block.matchAll(/\n\t\t(\w+)(?:\(|: )/g)].map((m) => m[1]))]
  const special = keys.filter((key) => !BASIC_KEYS.has(key))
  const name = block.match(/\n\t\tname: "([^"]+)"/)?.[1] ?? ''
  const type = block.match(/\n\t\ttype: "([^"]+)"/)?.[1]?.toLowerCase()
  // Khớp id camelCase theo tên gốc và cùng hệ (id trùng của nguồn khác thường khác hệ).
  // Chiêu G-Max: id game viết `gmax...`; Hidden Power theo hệ gộp thành một chiêu theo gen.
  const gameId = id.startsWith('hiddenpower')
    ? 'hiddenPower'
    : /isMax: /.test(block)
      ? (byLowerId.get(id) ?? camelId(name))
      : camelId(name)
  const found = byId.get(gameId)
  const merged = gameId === 'hiddenPower' && found !== undefined
  const skill = found?.elementId === type || merged ? found : undefined
  if (!skill) {
    missing.push(id)
    continue
  }
  if (special.length === 0) continue
  // Chiêu không làm gì (Splash, Celebrate) đúng là không có hiệu ứng.
  if (NO_EFFECT.has(skill.id)) continue
  const unhandled = special.filter((key) => !(HANDLED[key]?.(skill) ?? false))
  if (unhandled.length === 0) continue
  if (hasGameMechanic(skill)) partial[skill.id] = unhandled
  else plain[skill.id] = unhandled
}

writeFileSync(
  REPORT,
  JSON.stringify(
    {
      note: 'Chỉ liệt kê callback / trường Showdown chưa có trường cơ chế game tương ứng (bảng HANDLED). plain: skill chưa có hiệu ứng nào; partial: có một phần; missing: id Showdown chưa nhập',
      counts: {
        plain: Object.keys(plain).length,
        partial: Object.keys(partial).length,
        missing: missing.length
      },
      plain,
      partial,
      missing
    },
    null,
    2
  ) + '\n'
)
console.log(
  `plain ${Object.keys(plain).length}, partial ${Object.keys(partial).length}, missing ${missing.length}`
)
