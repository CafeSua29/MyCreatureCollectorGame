/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi skill chủ động của Portals of Phereon sang skill của game (content-sources-real.md). Gốc đánh trên
// lưới ô, tốn mana / AP, có hồi chiêu; quy đổi theo mô tả gốc (skills-source.json):
// - Sức mạnh theo công thức: mg / str = 70, 1–2 + mg = 80, mg + 5 = 100, 2× hoặc mg + str = 110, 3× = 140,
//   mg / 2 = 45; đánh nhiều mục tiêu (hàng, nón, bán kính, xung quanh) nhắm mọi địch, × 0,8.
// - str → vật lý, mg → đặc biệt; sát thương thật bỏ qua thủ. Hệ theo loại sát thương, không có thì theo từ khóa.
// - Ô địa hình → môi trường (bảng TILE); di chuyển trên lưới → +1 bậc né; đẩy / kéo không sát thương → −1 bậc
//   tốc độ của mục tiêu; triệu hồi → minion; "hút mana" → −1 bậc công đặc biệt.
// - Mana → thể lực (stamina.md): 1 mana = 5 thể lực (`staminaCost`). Hồi chiêu game không có: chiêu hồi lâu
//   thì giới hạn lần dùng mỗi trận (cd ≥ 8: 1 lần; cd ≥ 5: 2 lần).
// - Điều kiện đứng trên ô X của gốc không giữ (game 2v2 không có ô): chiêu dùng được ở mọi địa hình.

import { readFileSync } from 'node:fs'

import { E } from '../siralim-spells/sdsl.mjs'
import { ST, TILE } from './conversions.mjs'

export const SOURCE_ROWS = JSON.parse(
  readFileSync(new URL('./skills-source.json', import.meta.url), 'utf8')
)

/** Không nhập: lý do. */
export const REJECTED_SKILLS = {
  SkillController: 'lớp kỹ thuật của gốc, không phải skill',
  Conduit: 'cần nhân vật có tên riêng',
  EmpowerHebi: 'cần nhân vật có tên riêng',
  FamiliarBond: 'cần nhân vật có tên riêng',
  Overwhelming: 'cần nhân vật có tên riêng',
  Replenish: 'cần nhân vật có tên riêng',
  WaterRecall: 'cần nhân vật có tên riêng',
  Empower: 'gốc chỉ dùng cho nhân vật riêng',
  FinalPower: 'cần nghề Druid của nhân vật chính',
  Command: 'cần tính cách bướng của nhân vật gốc',
  Pet: 'chỉ đổi tinh thần (morale) của gốc',
  MagicCheer: 'chỉ đổi tinh thần (morale) của gốc',
  Motivate: 'chỉ đổi tinh thần (morale) của gốc',
  GeneExtract: 'mở khóa triệu hồi ở menu gốc',
  Reroll: 'đổi skill vĩnh viễn ngẫu nhiên ở menu gốc',
  CopySkill: 'đổi skill vĩnh viễn trong trận của gốc',
  Shift: 'gốc ghi không dùng được với đa số quái',
  SpawnSnake: 'triệu hồi nhân vật dạng người gợi dục của gốc',
  MagicTame: 'bắt quái trong trận: game có bóng và thu phục riêng',
  SealFriend: 'chiêu mộ trong trận: game có thu phục riêng',
  WormFriend: 'chiêu mộ trong trận: game có thu phục riêng',
  SuperSpeed: 'cần trait Supercharge dành riêng cho quái máy của gốc',
  Reclaim: 'cần quái triệu hồi trên lưới của gốc',
  InsectMarch: 'chỉ di chuyển đồng đội trên lưới',
  Quench: 'chỉ đổi ô dung nham và gỡ bỏng ở ô'
}

/** Sửa tay trường của skill sau khi quy đổi (ca mô tả không theo mẫu chung). */
const buff = (to, statusId, turns) => E.status(to, statusId, turns ? { turns } : {})
const shield = (to, percent) =>
  E.status(to, 'barrierBuff', { amount: { hp: 'max', of: 'target', percent } })
const evade = E.stage('self', ['evasion'], 1)
export const OVERRIDES = {
  TimeStop: { target: 'self', spell: { after: [E.extra('self')] }, maxUsesPerBattle: 1 },
  Ressurrect: { target: 'self', spell: { after: [E.revive('faintedAlly', 50)] } },
  AnimateDead: { target: 'self', spell: { after: [E.revive('faintedAlly', 50)] } },
  DarkRevive: { target: 'self', spell: { after: [E.revive('faintedAlly', 25)] } },
  Invigorate: { target: 'ally', spell: { onTarget: [buff('other', ST.haste, 1)] } },
  Energize: {
    target: 'ally',
    spell: { onTarget: [shield('other', 15), buff('other', ST.haste, 1)] }
  },
  Quicken: { target: 'ally', spell: { onTarget: [buff('other', ST.haste, 1)] } },
  Fission: {
    target: 'self',
    spell: { after: [E.stage('side', ['spAttack'], 1), buff('foes', ST.radiation, 3)] }
  },
  Sacrifice: {
    target: 'self',
    selfFaint: 'always',
    spell: { after: [E.stage('allies', ['attack', 'spAttack'], 2), buff('foes', ST.radiation, 3)] }
  },
  DrainMana: {
    target: 'ally',
    spell: {
      onTarget: [E.stage('other', ['spAttack'], -1)],
      after: [E.stage('self', ['spAttack'], 1)]
    }
  },
  DrainEssence: {
    target: 'enemy',
    spell: {
      onTarget: [E.stage('other', ['spAttack'], -1)],
      after: [E.stage('self', ['spAttack'], 1)]
    }
  },
  ExtractMana: {
    target: 'enemy',
    spell: {
      onTarget: [E.stage('other', ['spAttack'], -1)],
      after: [E.stage('self', ['spAttack'], 1), buff('self', ST.slow, 4)]
    }
  },
  TransferMana: { target: 'ally', spell: { onTarget: [E.stage('other', ['spAttack'], 1)] } },
  InnerHealing: {
    target: 'ally',
    spell: { onTarget: [E.heal('other', { hp: 'max', of: 'other', percent: 25 })] }
  },
  Switch: { target: 'self', effects: [{ type: 'switchOut', params: {} }] },
  FungalShift: { target: 'self', effects: [{ type: 'switchOut', params: {} }] },
  ShadowBond: { target: 'self', effects: [{ type: 'switchOut', params: {} }] },
  HolySwitch: { target: 'self', effects: [{ type: 'switchOut', params: {} }] },
  Taunt: { target: 'self', spell: { after: [buff('self', 'taunting')] } },
  Cover: { target: 'ally', spell: { onTarget: [buff('other', ST.invulnerable, 1)] } },
  Guard: {
    target: 'self',
    spell: { after: [buff('self', ST.defend, 1), buff('self', ST.weak, 2)] }
  },
  Meditate: {
    target: 'self',
    spell: { after: [buff('self', ST.enlighten, 3), buff('self', ST.defend, 2)] }
  },
  Cure: { target: 'self', spell: { after: [E.cure('self', 'debuff')] } },
  Cleanse: { target: 'ally', spell: { onTarget: [E.cure('other', 'debuff')] } },
  Dispel: { target: 'enemy', spell: { onTarget: [E.remove('other', 'buff', 'barrierBuff')] } },
  DrainEffects: { target: 'enemy', spell: { onTarget: [E.move('other', 'self', 'buff')] } },
  Antidote: {
    target: 'ally',
    spell: {
      onTarget: [E.remove('other', 'debuff', 'poison', 'badPoison'), buff('other', ST.regen, 3)]
    }
  },
  ChargeUp: { target: 'self', spell: { after: [buff('self', ST.magic, 99)] } },
  Bedazzle: { target: 'enemy', spell: { onTarget: [buff('other', ST.blind, 2)] } },
  FrostTouch: { target: 'enemy', spell: { onTarget: [buff('other', ST.freeze, 2)] } },
  Shatter: {
    target: 'enemy',
    spell: {
      onTarget: [
        E.remove('other', 'debuff', ST.freeze),
        E.dmg('other', { hp: 'current', of: 'other', percent: 50 })
      ]
    }
  },
  Encase: {
    target: 'enemy',
    spell: { onTarget: [buff('other', 'disarmed', 2), shield('other', 25)] }
  },
  Replicate: {
    target: 'self',
    selfDamagePercent: 50,
    spell: { after: [E.minion('self', 2, 'portalSpirits')] }
  },
  Hatch: { target: 'allEnemies', elementId: 'fire', category: 'special', power: 60, spell: {} },
  Consume: {
    target: 'enemy',
    spell: { onTarget: [E.kill('other', 25)], after: [buff('self', ST.regen, 2)] }
  },
  Rapture: { target: 'enemy', spell: { onTarget: [E.kill('other', 15)] } },
  Evaporate: { target: 'enemy', maxUsesPerBattle: 1, spell: { onTarget: [E.kill('other', 30)] } },
  PortalSlice: { target: 'enemy', spell: { onTarget: [E.kill('other', 15)] } },
  Integrate: {
    target: 'ally',
    selfFaint: 'always',
    spell: {
      onTarget: [buff('other', ST.hardened, 99), E.stage('other', ['attack', 'spAttack'], 1)]
    }
  },
  Liquify: {
    target: 'enemy',
    selfFaint: 'always',
    spell: {
      onTarget: [E.dmg('other', { hp: 'max', of: 'other', percent: 50 })],
      after: [{ do: 'placeField', fieldId: TILE.slime }]
    }
  },
  ParasiteAttach: {
    target: 'enemy',
    selfFaint: 'always',
    spell: { onTarget: [buff('other', ST.poison, 5), buff('other', ST.slow, 5)] }
  },
  SymbioteAttach: {
    target: 'ally',
    selfFaint: 'always',
    spell: { onTarget: [buff('other', ST.regen, 5), buff('other', ST.strength, 5)] }
  },
  SilentHunt: {
    target: 'enemy',
    spell: { onTarget: [E.kill('other', 15)], after: [buff('self', ST.focus, 1)] }
  },
  Portal: { target: 'self', spell: { after: [evade, E.stage('allies', ['evasion'], 1)] } },
  Transport: { target: 'self', spell: { after: [evade, E.stage('allies', ['evasion'], 1)] } },
  Rescue: { target: 'ally', spell: { onTarget: [shield('other', 30)] } },
  ElementalPower: { target: 'self', spell: { after: [E.random('self', 'buff')] } },
  Adapt: { target: 'ally', spell: { onTarget: [E.stage('other', ['attack', 'spAttack'], 1)] } },
  Rage: {
    target: 'self',
    spell: { after: [buff('self', ST.strength, 2), buff('self', ST.vulnerable, 2)] }
  },
  AbsorbSeed: {
    target: 'self',
    selfDamagePercent: 25,
    spell: { after: [E.stage('self', ['attack', 'spAttack'], 1)] }
  },
  BulbConduit: { target: 'self', spell: { after: [E.move('self', 'allies', 'buff')] } },
  BulbShot: {
    target: 'enemy',
    elementId: 'water',
    category: 'special',
    power: 70,
    reach: 'ranged'
  },
  Charge: { target: 'enemy', category: 'physical', power: 80, reach: 'melee', contact: true },
  CreateStone: {
    target: 'self',
    elementId: 'rock',
    spell: { after: [{ do: 'placeField', fieldId: 'crystalTerrain' }] }
  },
  DrainShadow: {
    target: 'self',
    elementId: 'dark',
    spell: { after: [buff('self', ST.strength, 1), buff('self', ST.magic, 1)] }
  },
  DrainSlime: {
    target: 'self',
    elementId: 'poison',
    spell: { after: [E.stage('self', ['spAttack'], 1)] }
  },
  FungalSpeed: {
    target: 'self',
    elementId: 'fungal',
    spell: { after: [buff('allies', ST.haste, 1)] }
  },
  RemoveSlime: {
    target: 'self',
    elementId: 'poison',
    spell: { after: [{ do: 'clearFields', layers: ['terrain'] }] }
  },
  TentacleSwarm: {
    target: 'self',
    elementId: 'poison',
    spell: { after: [E.minion('self', 2, 'portalTentacles')] }
  }
}

const STATUS_RULES = [
  [/\bburn/, 'burn', 0],
  [/\bpoison|toxin/, 'poison', 3],
  [/\bblind/, 'blind', 2],
  [/\bstun/, 'stun', 1],
  [/\bfreez|\bfrozen/, 'freeze', 2],
  [/\bcurse/, 'curse', 3],
  [/\bslow/, 'slow', 2],
  [/\bweaken/, 'weak', 2],
  [/\bvulnerable/, 'vulnerable', 2],
  [/\bbleed/, 'bleed', 3],
  [/\binfect/, 'infect', 3],
  [/\bentangle/, 'entangle', 2],
  [/\bspore/, 'spore', 3],
  [/\bradiation|irradiate/, 'radiation', 2],
  [/\bsoak/, 'soaked', 2]
]
const BUFF_RULES = [
  [/strengthbuff|strength buff|\bstrengthen|increase strength/, 'strength', 2],
  [/magic buff|magicbuff|increase magic/, 'magic', 2],
  [/hardened skin|increases armor|increase armor|harden/, 'hardened', 2],
  [/\benlighten/, 'enlighten', 2],
  [/shadow ?form/, 'shadowForm', 1],
  [/\bhaste/, 'haste', 1],
  [/\bdefend/, 'defend', 1],
  [/\bimmunity|immune to all/, 'immunity', 2],
  [/regeneration|rejuvenat|\bregenerate for/, 'regen', 3],
  [/\bfocus/, 'focus', 2]
]
const TILE_RULES = [
  [/into lava|to lava|\bheat|create lava|lavatrail|lava trail/, 'lava'],
  [/into water|create water|water tiles|watertrail/, 'water'],
  [/into grass|to grass|grass ?trail|grass tiles/, 'grass'],
  [/into slime|slime ?trail|spread slime|darkslime/, 'slime'],
  [/into shadow|spread shadow|shadow trail|shadowtrail|grow shadow|create one/, 'shadow'],
  [/into snow|cool|freezes? tile|freeze water/, 'ice'],
  [/into sand|sand tiles/, 'sand'],
  [/clears? shadow|remove all shadow|into earth|wasteland/, 'clear']
]
const ELEMENT_BY_DAMAGE = {
  Fire: 'fire',
  Water: 'water',
  Frost: 'ice',
  Electric: 'electric',
  Poison: 'poison',
  Radiant: 'light',
  Shadow: 'dark'
}
const ELEMENT_WORDS = [
  [/fungal|spore/, 'fungal'],
  [/lava|fire|burn|flame|magma|heat/, 'fire'],
  [/shadow|dark|curse|night/, 'dark'],
  [/frost|\bice\b|snow|freez/, 'ice'],
  [/water|aqua|wave|scald|tsunami|drown/, 'water'],
  [/electr|lightning|spark|volt|zap/, 'electric'],
  [/light|holy|enlighten|sun|solar|radiant|bless/, 'light'],
  [/poison|toxin|venom|infect|slime/, 'poison'],
  [/grass|plant|vine|root|seed|flower|bloom|growth|sprout|nature/, 'grass'],
  [/sand|earth|quake|burrow|tremor/, 'ground'],
  [/rock|stone|crystal/, 'rock'],
  [/mind|soul|portal|psy/, 'psychic'],
  [/fly|flight|wind|storm/, 'flying'],
  [/insect|hive|swarm/, 'bug'],
  [/claw|punch|strike|crush|push|ram|rend|slice/, 'fighting']
]
const POWER_RULES = [
  [/3\s*\*\s*\(?(mg|str)|(mg|str)\s*\*\s*3/, 140],
  [/2\s*\*\s*\(?(combined|mg|str)|(mg|str)\s*\*\s*2/, 110],
  [/mg\s*\+\s*str|str\s*\+\s*mg/, 110],
  [/(mg|str)\s*\+\s*5/, 100],
  [/\d\s*\+\s*(mg|str)|(mg|str)\s*\+\s*\d/, 80],
  [/(mg|str)\s*\/\s*2/, 45],
  [/\b(mg|str)\b/, 70],
  [/\b(\d+)\s+(\w+\s+)?(dmg|damage)/, 60],
  [/\b(basic|free|melee|swing) (melee )?attack/, 70]
]
const SUMMON_RULES = [
  [/worm/, 'portalWorms'],
  [/drone|parasite|symbiote|bug|insect/, 'portalDrones'],
  [/bulb/, 'portalBulbs'],
  [/tentacle/, 'portalTentacles'],
  [/flower|plant|vine|seed/, 'portalFlora'],
  [/spore/, 'fungalSpores'],
  [/.*/, 'portalSpirits']
]
const MULTI =
  /all (other )?(characters|enemies|surrounding)|every |in a line|in a cone|in an arc|radius|range \d|surrounding (characters|enemies|allies)|adjacent characters|neighbours|anyone|up to \d|each direction/
const MOVE = /teleport|\bjump|\bfly\b|\bmove (to|from|away)|\bdive\b|burrow|blink|\bdodge/
const SHOVE = /\bpush|\bpull|\bthrow|\bmoves to a random/
const ALL_ALLIES = /all allies|every ally|each (other )?ally|allies around|surrounding ally/

const turnsNear = (text, match, fallback) => {
  const after = text.slice(match.index, match.index + 45)
  const found = /(\d+)\s*(effective )?(turns?|rounds?)|for a turn|for mg/.exec(after)
  if (!found) return fallback
  return found[1] ? Number(found[1]) : found[0] === 'for a turn' ? 1 : fallback
}
const roundTo5 = (value) => Math.round(value / 5) * 5

function powerOf(text) {
  if (!/dmg|damage|attack/.test(text)) return 0
  for (const [re, power] of POWER_RULES) if (re.test(text)) return power
  return 0
}

function elementOf(row, text) {
  for (const type of row.dmg) if (ELEMENT_BY_DAMAGE[type]) return ELEMENT_BY_DAMAGE[type]
  const hay = `${row.id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${text}`
  for (const [re, elementId] of ELEMENT_WORDS) if (re.test(hay)) return elementId
  return 'normal'
}

function shieldPercent(text) {
  if (!/shield/.test(text)) return 0
  const percent = /(\d+)%\s*shield/.exec(text)
  if (percent) return Number(percent[1])
  if (/2\s*\*\s*mg|mg\s*\*\s*2/.test(text)) return 30
  if (/fully shield/.test(text)) return 100
  const flat = /(\d+)\s*shield|shield\s*(?:target |them )?(?:for |by )?(\d+)/.exec(text)
  if (flat) return Math.min(100, Number(flat[1] ?? flat[2]) * 5)
  return 15
}

function healPercent(text) {
  if (/fully (heal|restore)/.test(text)) return 100
  if (!/\bheals?\b|\brestore .*hp|restore hp/.test(text)) return 0
  // "5hp hoặc 10%, lấy cao hơn": lấy phần cao hơn sau khi quy đổi.
  const percent = /(\d+)%/.exec(text)
  const flat = /(?:for|by)\s*(\d+)/.exec(text)
  const best = Math.max(percent ? Number(percent[1]) : 0, flat ? Number(flat[1]) * 5 : 0)
  return best > 0 ? Math.min(100, best) : 25
}

function tileEffect(text) {
  for (const [re, tile] of TILE_RULES) {
    if (!re.test(text)) continue
    return tile === 'clear'
      ? { do: 'clearFields', layers: ['terrain'] }
      : { do: 'placeField', fieldId: TILE[tile] }
  }
  return null
}

/** 1 mana của gốc = 5 thể lực (thanh mana gốc ~20, thang thể lực 100; stamina.md). */
export const MANA_STAMINA = 5

/** Giới hạn lần dùng mỗi trận thay hồi chiêu (game không có hồi chiêu). */
export const usesLimit = (row) =>
  row.cd >= 8 ? { maxUsesPerBattle: 1 } : row.cd >= 5 ? { maxUsesPerBattle: 2 } : {}

const hasDebuff = (text) => STATUS_RULES.some(([re]) => re.test(text))

function targetOf(row, text, power) {
  if (power > 0) return MULTI.test(text) ? 'allEnemies' : 'enemy'
  if (ALL_ALLIES.test(text)) return 'allAllies'
  if (row.target === 'targetAlly' || row.target === 'targetOtherAlly') return 'ally'
  if (row.target === 'targetEnemy') return MULTI.test(text) ? 'allEnemies' : 'enemy'
  if (hasDebuff(text) || SHOVE.test(text) || /destroy target/.test(text)) {
    return MULTI.test(text) || /\ball\b/.test(text) ? 'allEnemies' : 'enemy'
  }
  return 'self'
}

/** Bỏ phần không phải hiệu ứng chính: chú thích số trong ngoặc, nhánh điều kiện "Enlightened" của gốc. */
const cleanText = (desc) =>
  desc
    .toLowerCase()
    .replace(/\(dmg[^)]*\)/g, '')
    .replace(/enlightened (characters?|target)[^.]*\.?/g, '')
    .replace(/enlightened: .*$/, '')

/** Một skill gốc → skill của game (chưa có id / tên, script thêm). null nếu không nhận ra hiệu ứng nào. */
export function convertSkill(row) {
  const text = cleanText(row.desc)
  const isSummon =
    /^spawn|^summon|livingammo|ghostbulb|shootbulb/i.test(row.id) || /^spawns?\b/.test(text)
  const power = isSummon ? 0 : powerOf(text)
  const target = isSummon ? 'self' : targetOf(row, text, power)
  const spread = target === 'allEnemies' && power > 0
  const physical = power > 0 && (row.attacks || (/\bstr\b/.test(text) && !/\bmg\b/.test(text)))
  const onTarget = []
  const after = []
  const effects = []
  const skill = {
    elementId: elementOf(row, text),
    category: power === 0 ? 'status' : physical ? 'physical' : 'special',
    power: spread ? roundTo5(power * 0.8) : power,
    accuracy: 100,
    target,
    effects,
    priority: 0,
    staminaCost: row.mana * MANA_STAMINA,
    ...usesLimit(row),
    ...(physical && row.range !== null && row.range <= 1 ? { contact: true } : {}),
    ...(power > 0 ? { reach: row.range !== null && row.range <= 1 ? 'melee' : 'ranged' } : {})
  }
  const enemyTarget = target === 'enemy' || target === 'allEnemies'
  // Trạng thái lên địch.
  if (enemyTarget) {
    for (const [re, key, fallback] of STATUS_RULES) {
      const match = re.exec(text)
      if (!match) continue
      // Mô tả nhắc tới trạng thái để điều kiện ("cursed enemy", "enemy needs to bleed") thì không gây.
      if (
        /teleport to a|needs to|target burning|remove burn|with spores/.test(
          text.slice(Math.max(0, match.index - 25), match.index + 10)
        )
      )
        continue
      onTarget.push(buff('other', ST[key], turnsNear(text, match, fallback) || undefined))
    }
  }
  // Hiệu ứng tốt: lên đồng đội được nhắm / cả đội / bản thân.
  const receiver = target === 'ally' ? 'other' : target === 'allAllies' ? 'side' : 'self'
  const addGood = (effect) => (receiver === 'other' ? onTarget : after).push(effect)
  for (const [re, key, fallback] of BUFF_RULES) {
    const match = re.exec(text)
    if (match) addGood(buff(receiver, ST[key], turnsNear(text, match, fallback)))
  }
  const shieldAmount = shieldPercent(text)
  if (shieldAmount > 0) addGood(shield(receiver, shieldAmount))
  const healAmount = power > 0 ? 0 : healPercent(text)
  if (healAmount > 0) addGood(E.heal(receiver, { hp: 'max', of: 'target', percent: healAmount }))
  // Sát thương hút máu, mất máu, hi sinh.
  if (power > 0 && /restore hp|restores? .*hp|heal .* by half/.test(text)) {
    effects.push({ type: 'drain', params: { percent: 50 } })
  }
  const lose = /lose (\d+) hp/.exec(text)
  if (lose) skill.selfDamagePercent = Math.min(100, Number(lose[1]) * 5)
  if (/sacrifice half/.test(text)) skill.selfDamagePercent = 50
  if (/sacrifice self|destroy self|destroys self/.test(text)) skill.selfFaint = 'always'
  // Giết ngay dưới ngưỡng máu.
  if (/destroy target/.test(text)) onTarget.push(E.kill('other', 25))
  // Di chuyển / đẩy trên lưới.
  if (power === 0 && MOVE.test(text)) after.push(E.stage('self', ['evasion'], 1))
  if (power === 0 && SHOVE.test(text) && enemyTarget) onTarget.push(E.stage('other', ['speed'], -1))
  // Ô địa hình.
  const tile = tileEffect(text)
  if (tile) after.push(tile)
  // Triệu hồi.
  if (isSummon) {
    const hay = `${row.id} ${text}`.toLowerCase()
    const [, minionId] = SUMMON_RULES.find(([re]) => re.test(hay))
    after.push(E.minion('self', 1, minionId))
  }
  const spell = {}
  if (onTarget.length) spell.onTarget = onTarget
  if (after.length) spell.after = after
  if (row.dmg.includes('True') || /true dmg|true damage/.test(text))
    spell.ignoreDefensePercent = 100
  if (Object.keys(spell).length) skill.spell = spell
  const override = OVERRIDES[row.id]
  if (override) {
    Object.assign(skill, override)
    if (override.target && !['enemy', 'allEnemies'].includes(override.target) && power === 0) {
      skill.category = 'status'
    }
    if (skill.spell && Object.keys(skill.spell).length === 0) delete skill.spell
  }
  const hasEffect =
    skill.power > 0 || skill.effects.length > 0 || skill.spell !== undefined || skill.selfFaint
  return hasEffect ? skill : null
}
