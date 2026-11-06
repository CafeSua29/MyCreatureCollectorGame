/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi passive, special trait, gen của Portals of Phereon sang trait của game (content-sources-real.md
// mục "Portals of Phereon"). Gốc đánh trên lưới ô, có AP / mana / thể lực; game đánh 2v2 theo lượt nên:
// - Quy đổi số: quái gốc ~20 HP nên 1 điểm sát thương / hồi / khiên = 5% max HP; sát thương theo
//   sức mạnh / phép (str / mg ~3) = 15% max HP. Charge sức mạnh / phép: 1–2 = +1 bậc công / công đặc
//   biệt, 3–4 = +2, 5+ = +3. "Một lượt" = 1 lượt trạng thái của game.
// - Ô địa hình → môi trường: lava = volcanicTerrain, nước = deepWater, cỏ = grassyTerrain, chất nhờn =
//   swampTerrain, bóng tối = cursedGround, băng / tuyết = frozenGround, ánh sáng = holyGround, cát =
//   sandstorm. "Đứng trên ô X" = môi trường đó đang có.
// - AP, mana, năng lượng, thể lực của gốc: quy về một thanh thể lực (stamina.md, 100). 1 AP / 1
//   năng lượng / 1 lần hút mana = 10 thể lực; 1 mana = 5 (thanh mana gốc ~15–20); 1 thể lực gốc
//   (thanh 200) = 1. Hành vi đọc từ mã game (`Passives.cs`, `Stats.cs`, `GeneticTrait.cs`).
// - Loại hẳn: nội dung người lớn, hệ thống overworld (cưỡi, tầm nhìn, chở đồ...), nhân vật có tên riêng.
// Mỗi passive gốc là một hành động; kiểu kích hoạt (onMove, onAttack...) ghi trên loài, xem TRIGGERS.

import { C, E, REJECT, h, immune, trig } from '../siralim-spells/sdsl.mjs'

const ADULT = REJECT('nội dung người lớn của gốc')
const OVERWORLD = REJECT(
  'chỉ có tác dụng ngoài trận ở bản đồ gốc (cưỡi, tầm nhìn, chở đồ, cổng...)'
)
const NAMED = REJECT('cần nhân vật có tên riêng của gốc')
const GRID = REJECT('chỉ đổi vị trí trên lưới ô của gốc, game 2v2 không có ô')

// ---------- Quy đổi ----------

export const TILE = {
  lava: 'volcanicTerrain',
  water: 'deepWater',
  grass: 'grassyTerrain',
  slime: 'swampTerrain',
  shadow: 'cursedGround',
  ice: 'frozenGround',
  light: 'holyGround',
  sand: 'sandstorm'
}
const WEATHER = new Set(['sandstorm'])
const onTile = (tile) => ({
  if: 'fieldActive',
  layer: WEATHER.has(TILE[tile]) ? 'weather' : 'terrain',
  fieldIds: [TILE[tile]]
})
const notOnTile = (tile) => ({ if: 'not', condition: onTile(tile) })
const place = (tile) => ({ do: 'placeField', fieldId: TILE[tile] })

/** Trạng thái gốc → trạng thái game. */
export const ST = {
  strength: 'phereonStrength',
  magic: 'phereonMagic',
  weak: 'weak',
  vulnerable: 'vulnerable',
  slow: 'drained',
  haste: 'energised',
  focus: 'proficient',
  curse: 'eroded',
  entangle: 'snared',
  stun: 'flinch',
  freeze: 'frozen',
  blind: 'blind',
  poison: 'poison',
  burn: 'burn',
  bleed: 'bleeding',
  infect: 'phereonInfected',
  radiation: 'blighted',
  spore: 'spored',
  defend: 'protected',
  immunity: 'immune',
  invulnerable: 'phereonInvulnerable',
  enlighten: 'enlightened',
  shadowForm: 'shadowForm',
  hardened: 'hardenedSkin',
  regen: 'healingMist',
  soaked: 'soaked'
}
const st = (to, key, turns) => E.status(to, ST[key], turns ? { turns } : {})
const of = (who, percent) => ({ hp: 'max', of: who, percent })
const POINT = 5
const STAT_HIT = 15
const pts = (n) => n * POINT
const hit = (to, percent, who = 'target') => E.dmg(to, of(who, percent))
const heal = (to, percent) => E.heal(to, of('self', percent))
const shield = (to, percent) => E.status(to, 'barrierBuff', { amount: of('self', percent) })
const charges = (n) => (n <= 2 ? 1 : n <= 4 ? 2 : 3)
const str = (to, n) => E.stage(to, ['attack'], charges(n))
const mg = (to, n) => E.stage(to, ['spAttack'], charges(n))
const both = (to, n) => E.stage(to, ['attack', 'spAttack'], charges(n))
const armor = (to, n) => E.stage(to, ['defense', 'spDefense'], n > 0 ? charges(n) : -charges(-n))
// 1 AP / 1 lần hút mana của gốc = 10 thể lực (thanh 100).
const AP_STAMINA = 10
const extra = E.stamina('self', AP_STAMINA)
const manaDrain = (to) => E.stamina(to, -AP_STAMINA)
const MANA_STAMINA = 5
const hasStamina = C.atLeast({ of: 'stamina' }, AP_STAMINA)
const race = (who, ...raceIds) => C.race(who, raceIds)
const INSECTS = [
  'beetle',
  'lepidopteran',
  'hymenopteran',
  'arachnid',
  'orthopteran',
  'odonate',
  'myriapod',
  'larva',
  'insectoid'
]
const BEASTS = ['wildBeast', 'fangedBeast', 'mythicBeast', 'felid', 'canid']
const allyRace = (raceIds) => ({ if: 'race', who: 'target', raceIds })
const fungal = (who) => C.el(who, ['fungal'])
/** Chỉ áp lên mục tiêu thỏa điều kiện. */
const onlyIf = (effect, ...conditions) => ({ ...effect, if: conditions })
/** Hào quang lên mọi quái trên sân ("All characters" của gốc): một hào quang mỗi phe. */
const everyone = (...hooks) => [
  h('aura', { scope: 'side', hooks }),
  h('aura', { scope: 'foes', hooks })
]
const allMinusPercent = (elementId, percent) =>
  everyone(h('damageDealtModifier', { percent, when: [C.skillElement([elementId])] }))

// ---------- Kiểu kích hoạt (Passives.Type của gốc) → hook ----------

/** `T` của hiệu ứng = quái bên kia của sự kiện (mục tiêu khi đánh, kẻ đánh khi bị đánh). */
export const TRIGGERS = {
  onMove: (effects) => [trig('turnEnd', 'self', effects)],
  onTurnStart: (effects) => [trig('turnEnd', 'self', effects)],
  onTurnEnd: (effects) => [trig('turnEnd', 'self', effects)],
  onAttack: (effects) => [
    trig('attack', 'self', effects),
    trig('cast', 'self', effects, { when: [C.cat('special')] })
  ],
  onGettingAttacked: (effects) => [trig('damaged', 'self', effects)],
  onDeath: (effects) => [trig('faint', 'self', effects)],
  CombatStart: (effects) => [trig('entry', 'self', effects)],
  Always: (effects) => [trig('turnEnd', 'self', effects)]
}
/** Kiểu kích hoạt bằng hành động người lớn của gốc: không nhập. */
export const ADULT_TRIGGERS = new Set(['onFuck', 'onGettingFucked', 'onSeduce', 'onGettingSeduced'])
export const TRIGGER_LABELS = {
  onMove: ['khi di chuyển', 'on move'],
  onTurnStart: ['đầu lượt', 'turn start'],
  onTurnEnd: ['cuối lượt', 'turn end'],
  onAttack: ['khi đánh', 'on attack'],
  onGettingAttacked: ['khi bị đánh', 'when attacked'],
  onDeath: ['khi gục', 'on death'],
  CombatStart: ['vào trận', 'combat start'],
  Always: ['luôn luôn', 'always']
}

// ---------- Passive: hành động (effects) hoặc hook cố định (hooks) ----------

const fx = (...effects) => ({ effects })
const hk = (...hooks) => ({ hooks: hooks.flat() })

/**
 * Passive gốc → { effects } (chạy theo kiểu kích hoạt), { hooks } (cố định, bỏ qua kiểu kích hoạt),
 * REJECT / DEFER. Kiểu mặc định khi không loài nào mang: `trigger` của mục (theo mô tả gốc), không
 * có thì onAttack nếu hiệu ứng nhắm `other`, không thì CombatStart (`defaultTrigger` của
 * phereon-import.mjs).
 */
export const PASSIVES = {
  BloodPower: hk(trig('damagedAny', 'side', str('subject', 1))),
  SandShaper: hk(h('damageDealtModifier', { percent: 20, when: [onTile('sand')] })),
  Cleansing: fx(E.remove('self', 'debuff', 'burn', 'poison', 'bleeding')),
  // "Bị đánh thì tiêu 1 năng lượng hồi đầy máu": hồi trước (cần đủ thể lực, chưa đầy máu), máu đầy
  // rồi mới trừ thể lực, để hai hiệu ứng cùng một điều kiện "đã hồi".
  EnergyRegeneration: {
    ...fx(
      onlyIf(heal('self', 100), hasStamina, C.hpBelow('self', 100)),
      onlyIf(E.stamina('self', -AP_STAMINA), hasStamina, C.hpAbove('self', 99.99))
    ),
    trigger: 'onGettingAttacked'
  },
  AbsorbTerrain: hk(
    h('convertSkillElement', {
      fromElementIds: ['normal'],
      toElementId: 'fire',
      percent: 0,
      when: [onTile('lava')]
    }),
    h('convertSkillElement', {
      fromElementIds: ['normal'],
      toElementId: 'water',
      percent: 0,
      when: [onTile('water')]
    }),
    h('convertSkillElement', {
      fromElementIds: ['normal'],
      toElementId: 'grass',
      percent: 0,
      when: [onTile('grass')]
    })
  ),
  Freeze: fx(st('other', 'freeze', 2)),
  DrainPowder: fx(manaDrain('other'), onlyIf(st('other', 'weak'), C.hpBelow('target', 50))),
  SeepingPoison: hk(
    h('aura', {
      scope: 'foes',
      hooks: [h('statusDamageModifier', { statusIds: ['poison', 'badPoison'], percent: 100 })],
      when: [onTile('water')]
    })
  ),
  ProtectiveGrass: hk(
    h('aura', {
      scope: 'side',
      hooks: [h('damageTakenWhen', { percent: -50, when: [onTile('grass')] })]
    })
  ),
  ProtectiveMagic: hk(
    trig('damaged', 'side', E.stage('subject', ['spAttack'], -1), {
      oncePerTurn: true
    }),
    h('aura', { scope: 'side', hooks: [h('damageTakenWhen', { percent: -25 })] })
  ),
  LastingWarmth: hk(h('aura', { scope: 'side', hooks: [immune('drained', 'softSpeedDown')] })),
  ShadowVeil: fx(st('side', 'shadowForm', 1), { ...extra, oncePerBattle: true }),
  InsectPower: fx(onlyIf(both('side', 2), allyRace(INSECTS))),
  LightBlessed: fx(st('side', 'enlighten', 1), st('side', 'haste', 1)),
  HealingWater: hk(
    h('aura', {
      scope: 'side',
      hooks: [h('healingModifier', { received: 100, when: [onTile('water')] })]
    })
  ),
  Navigator: GRID,
  DarkFlames: hk(h('inflictPotency', { statusIds: ['burn', 'eroded'], percent: 50 })),
  ChitinStrikes: hk(
    h('aura', {
      scope: 'side',
      hooks: [h('statWhen', { percent: { attack: 40 }, when: [C.has('self', ['hardenedSkin'])] })]
    })
  ),
  LightBarrier: hk(
    trig('damaged', 'side', E.remove('subject', 'buff', 'enlightened'), {
      when: [C.has('subject', ['enlightened'])]
    }),
    h('aura', {
      scope: 'side',
      hooks: [h('damageTakenWhen', { percent: -50, when: [C.has('self', ['enlightened'])] })]
    })
  ),
  SpeedSparks: hk(trig('turnEnd', 'side', E.dmg('randomFoe', of('target', 5)))),
  WeaponSupply: OVERWORLD,
  KineticForce: hk(trig('turnEnd', 'self', st('foes', 'vulnerable', 1), { chance: 50 })),
  KineticCurse: hk(trig('turnEnd', 'self', st('foes', 'weak', 2), { chance: 50 })),
  GreenAgility: hk(
    h('aura', {
      scope: 'side',
      hooks: [h('dodge', { percent: 25 })],
      when: [C.el('self', ['grass'])]
    })
  ),
  BeastPack: hk(
    trig(
      'attack',
      'side',
      { ...extra, chance: 25, oncePerTurn: true },
      { when: [race('subject', ...BEASTS)] }
    )
  ),
  WormPower: hk(
    trig('turnEnd', 'self', st('self', 'strength', 2), { when: [race('self', 'annelid')] })
  ),
  WormSupport: hk(
    trig('turnEnd', 'self', st('self', 'focus', 1), { when: [race('self', 'annelid')] })
  ),
  VoltMaster: REJECT('đổi thể lực sang AP: game gộp AP và thể lực thành một thanh'),
  LightningRod: hk(
    h('aura', {
      scope: 'side',
      hooks: [h('damageTakenWhen', { percent: -50, when: [C.skillElement(['electric'])] })]
    })
  ),
  HumanPower: REJECT('chỉ áp cho người (humanoid) của gốc'),
  AlchemyKnowledge: OVERWORLD,
  VitalTargeting: hk(
    h('aura', {
      scope: 'foes',
      hooks: [h('statusDamageModifier', { statusIds: ['bleeding'], percent: 100 })]
    })
  ),
  ElectricSafety: hk(
    h('aura', {
      scope: 'side',
      hooks: [h('hpFloor', { percent: 1, when: [C.skillElement(['electric'])] })]
    })
  ),
  BloodSuppression: hk(
    everyone(h('statusDamageModifier', { statusIds: ['bleeding'], percent: -50 }))
  ),
  AngelShield: hk(trig('damaged', 'side', heal('subject', 100), { oncePerBattle: true })),
  SurvivalFocus: hk(
    trig('turnEnd', 'side', heal('subject', 25), {
      when: [C.hpBelow('subject', 50)],
      oncePerBattle: true
    })
  ),
  PoisonShards: hk(
    h('aura', {
      scope: 'foes',
      hooks: [
        h('damageTakenWhen', {
          percent: 100,
          when: [C.skillElement(['ice']), C.has('self', ['poison', 'badPoison'])]
        })
      ]
    })
  ),
  AcidMastery: hk(h('inflictPotency', { statusIds: ['poison', 'badPoison'], percent: 50 })),
  TamingMastery: REJECT('chỉ áp cho ngự thú sư người của gốc'),
  PortalMastery: REJECT('cần skill Portal của nhân vật chính gốc'),
  DodgeMastery: hk(h('aura', { scope: 'side', hooks: [h('dodge', { percent: 10 })] })),
  MagicMastery: hk(
    trig('cast', 'side', { ...extra, oncePerTurn: true }, { when: [C.cat('special')], chance: 25 })
  ),
  Disappoint: REJECT('chỉ đặt hồi chiêu của chính mình, game không có hồi chiêu'),
  Intimidate: fx(
    onlyIf(st('foes', 'weak', 2), { if: 'statHigher', stat: 'attack', than: 'target' })
  ),
  Proliferate: REJECT('cho gen ManaBuffer (gen người lớn của gốc)'),
  Connected: hk(
    trig('entry', 'self', both('self', 1), {
      when: [{ if: 'counterAtLeast', counter: { of: 'sameRaceOnSide' }, min: 1 }]
    })
  ),
  Symbiosis: hk(
    trig('entry', 'self', mg('self', 1), {
      when: [{ if: 'counterAtLeast', counter: { of: 'alliesOnField' }, min: 1 }]
    })
  ),
  OverWhelm: fx(
    onlyIf(st('other', 'vulnerable', 1), { if: 'statHigher', stat: 'attack', than: 'target' })
  ),
  ChainCurse: fx(onlyIf(st('otherFoes', 'curse', 1), C.has('other', ['eroded']))),
  ChoiceRefresh: REJECT('game không có hồi chiêu'),
  ChaosRefresh: REJECT('game không có hồi chiêu'),
  BurstRefresh: REJECT('game không có hồi chiêu'),
  ManaBurst: fx(E.stamina('allies', 5 * MANA_STAMINA), E.stamina('foes', 5 * MANA_STAMINA)),
  MassSiphon: fx(manaDrain('foes')),
  ManaShield: REJECT('cần quái mana-tank của gốc'),
  StrongRegeneration: fx(E.heal('self', { hp: 'missing', of: 'self', percent: 50 })),
  Fragility: fx(armor('self', -2)),
  ArmorBreak: fx(E.stage('other', ['defense'], -6)),
  Egg: hk(h('reviveOnce', { hpPercent: 50 })),
  Displace: GRID,
  GenerateSpores: fx(E.minion('self', 1, 'fungalSpores')),
  LavaStrength: fx(onlyIf(str('self', 2), onTile('lava'))),
  LastingMagic: fx(st('randomAlly', 'magic', 99)),
  Empower: fx(both('randomAlly', 2)),
  LastingStrength: fx(st('randomAlly', 'strength', 99)),
  PlantArmor: fx(onlyIf(armor('self', 2), onTile('grass'))),
  FrostMagic: fx(onlyIf(mg('self', 2), onTile('ice'))),
  Invigorate: fx(E.stamina('other', 2 * AP_STAMINA)),
  GrassEnergy: REJECT('cần nghề Druid của nhân vật chính gốc'),
  CreatureAmbush: fx(st('side', 'strength', 1)),
  SpreadSlime: fx(onlyIf(place('slime'), onTile('slime'))),
  SlimePower: fx(onlyIf(both('side', 3), allyRace(['slime']))),
  EnergizeSeals: fx(onlyIf({ ...extra, to: 'side' }, allyRace(['pinniped']))),
  ArmorCharge: fx(E.stage('side', ['attack', 'spAttack'], 1)),
  FrostPower: fx(onlyIf(mg('side', 2), C.el('target', ['ice']))),
  TentacleShift: fx(st('self', 'strength', 99), st('self', 'focus', 99)),
  TakeStance: fx(E.stage('self', 'highest', 1)),
  FungalBond: hk(
    trig('turnEnd', 'self', both('self', 1), {
      when: [
        { if: 'counterAtLeast', counter: { of: 'elementOnSide', elementIds: ['fungal'] }, min: 1 }
      ]
    }),
    trig('turnEnd', 'self', shield('side', 10), {
      when: [
        { if: 'counterAtLeast', counter: { of: 'elementOnSide', elementIds: ['fungal'] }, min: 1 }
      ]
    })
  ),
  CelestialPower: hk(
    everyone(h('damageDealtModifier', { percent: 10, when: [C.skillElement(['dark', 'light'])] }))
  ),
  SealStrength: fx(onlyIf(str('side', 2), allyRace(['pinniped']))),
  SealMagic: fx(onlyIf(mg('side', 2), allyRace(['pinniped']))),
  SealShield: fx(onlyIf(shield('side', STAT_HIT), allyRace(['pinniped']))),
  SealPoison: hk(
    h('aura', {
      scope: 'side',
      hooks: [
        trig('attack', 'self', st('other', 'poison', 3), { when: [race('self', 'pinniped')] })
      ]
    })
  ),
  SealArmor: fx(onlyIf(st('side', 'hardened', 99), allyRace(['pinniped']))),
  SpreadShadow: fx(onlyIf(place('shadow'), onTile('shadow'))),
  GrowShadow: fx(place('shadow')),
  Strengthen: fx(st('randomAlly', 'strength', 1)),
  Armor: fx(armor('randomAlly', 2)),
  Focus: fx(st('self', 'focus', 1)),
  Exploding: fx(hit('foes', STAT_HIT, 'target')),
  WispManaDrain: fx(manaDrain('foes')),
  SlimeTrail: fx(place('slime')),
  DarkSlime: fx(place('slime'), st('foes', 'curse', 1)),
  SandAffinity: fx(place('sand'), onlyIf(shield('self', pts(2)), onTile('sand'))),
  LargeSlimeTrail: fx(place('slime')),
  HugeSlimeTrail: fx(place('slime')),
  ShadowTrail: fx(place('shadow')),
  LargeShadowTrail: fx(place('shadow')),
  LargeWaterTrail: fx(place('water')),
  HugeWaterTrail: fx(place('water')),
  Recharging: fx(mg('self', 2)),
  StaticCharge: fx(mg('self', 1), onlyIf(mg('self', 1), onTile('shadow'))),
  Cooldown: fx(E.stage('self', ['spAttack'], -1), shield('self', pts(3))),
  LavaCharge: fx(mg('self', 1)),
  LargeGrassTrail: fx(place('grass')),
  SpreadSpores: fx(st('foes', 'spore', 3)),
  Cooling: fx({ do: 'clearFields', layers: ['terrain'] }),
  GrassTrail: fx(place('grass')),
  GrassStrike: fx(place('slime')),
  WaterTrail: fx(place('water')),
  LavaTrail: fx(place('lava')),
  Burn: fx(st('other', 'burn')),
  StrongBurn: fx(st('other', 'burn'), hit('other', pts(3))),
  Entangle: fx(st('other', 'entangle', 1)),
  DefenseBreak: fx(E.remove('other', 'buff', 'protected', 'defensive')),
  MistForm: fx(st('self', 'shadowForm', 1)),
  Ignite: fx(st('self', 'burn')),
  Flames: fx(onlyIf(hit('foes', pts(2), 'other'), C.has('self', ['burn']))),
  Bleed: fx(st('other', 'bleed', 2)),
  Siphon: fx(manaDrain('foes')),
  TakeDamage: REJECT('quái token của gốc tự mất máu theo thời gian, không hợp với quái bắt được'),
  DestroySelf: REJECT('quái token của gốc tự hủy theo thời gian, không hợp với quái bắt được'),
  Expose: fx(st('self', 'vulnerable', 1), st('self', 'entangle', 1)),
  StealthEntry: fx(st('self', 'defend', 1), st('self', 'strength', 1), st('self', 'entangle', 1)),
  Regenerating: fx(heal('self', pts(4))),
  OrcRegeneration: fx(heal('self', pts(10))),
  Instability: fx(E.cast({ to: 'randomFoe', pool: 'own', categories: ['special'] })),
  // Mana = sức mạnh phép (~3).
  Replenish: fx(E.stamina('self', 3 * MANA_STAMINA)),
  AbsorbWater: fx(
    onlyIf({ do: 'clearFields', layers: ['terrain'] }, onTile('water')),
    onlyIf(shield('self', pts(2)), onTile('water'))
  ),
  AbsorbLife: fx(
    onlyIf({ do: 'clearFields', layers: ['terrain'] }, onTile('grass')),
    onlyIf(shield('self', pts(2)), onTile('grass'))
  ),
  DarkenWater: fx(
    onlyIf(place('shadow'), onTile('water')),
    onlyIf(shield('self', pts(2)), onTile('water'))
  ),
  EnhanceMagic: fx(st('self', 'magic', 1)),
  LifeSteal: fx(hit('other', pts(1), 'other'), heal('self', pts(1))),
  DisperseHeat: fx(E.remove('randomAlly', 'debuff', 'burn')),
  ShieldEnemy: fx(shield('other', 100)),
  Interrupt: REJECT('game không có hồi chiêu'),
  Reverberate: hk(
    trig('attack', 'self', hit('other', STAT_HIT * 2, 'other'), {
      when: [{ if: 'notVeryEffective' }]
    })
  ),
  // Sát thương thêm = năng lượng của mình: mỗi 10 thể lực = 1 điểm (5% max HP mục tiêu).
  EnergyStrike: fx(
    E.dmg('other', { ...of('target', pts(1)), per: { of: 'stamina', divisor: AP_STAMINA } })
  ),
  Needle: fx(st('other', 'stun', 2)),
  Stun: fx(st('other', 'stun', 2)),
  StunEnemy: fx(st('other', 'stun', 2)),
  DrainStamina: fx(E.drainStamina('self', 'other', 1)),
  LoseStamina: fx(E.stamina('self', -1)),
  DrainAll: fx(E.staminaPercent('other', -100)),
  Heal: fx(heal('self', STAT_HIT)),
  Restore: fx(E.heal('lowestHpAlly', of('self', STAT_HIT))),
  Shadow: fx(place('shadow')),
  StrongLifeSteal: fx(hit('other', pts(3), 'other'), heal('self', pts(3))),
  SlowEffect: fx(st('other', 'slow', 2)),
  LastingSlow: fx(st('other', 'slow', 5)),
  Poison: fx(st('other', 'poison', 3)),
  AdvancedPoison: fx(
    st('other', 'poison', 4),
    onlyIf(hit('other', pts(2), 'other'), C.has('target', ['poison', 'badPoison']))
  ),
  Blind: fx(st('other', 'blind', 2)),
  Infect: fx(st('other', 'infect', 3)),
  ManaExplosion: fx(hit('foes', STAT_HIT, 'other'), E.stage('self', ['spAttack'], -1)),
  ShadowReplenish: fx(onlyIf(place('grass'), onTile('shadow'))),
  SuckMana: fx(manaDrain('other'), mg('self', 1)),
  SuckLife: fx(E.maxHp('other', of('target', pts(1)), true), E.maxHp('self', of('self', pts(1)))),
  LightningStrike: fx(E.dmg('otherFoes', { stat: 'spAttack', of: 'self', percent: 50 })),
  Berserker: fx(str('self', 1)),
  SelfStrengthen: fx(st('self', 'strength', 1)),
  Dissolve: fx(st('other', 'radiation', 2)),
  SlowStart: fx(E.stage('self', ['spAttack'], -1)),
  DrainMana: fx(manaDrain('other')),
  Infuse: fx(st('randomAlly', 'magic', 2)),
  DrainEnergy: fx(E.drainStamina('self', 'other', 100)),
  StrongManaDrain: fx(manaDrain('other')),
  HyperManaDrain: fx(E.stage('other', ['spAttack'], -2)),
  PoisonSkin: fx(st('other', 'poison', 2)),
  Channeling: fx(manaDrain('other')),
  ChargeMagic: fx(mg('self', 1)),
  Thorns: fx(hit('other', pts(1), 'target')),
  Immunity: fx(st('self', 'immunity', 99)),
  Electric: fx(st('other', 'slow', 1)),
  TransferLife: fx(E.heal('lowestHpAlly', of('self', 25)), E.dmg('self', of('self', 25))),
  TransferEnergy: fx(E.stamina('other', AP_STAMINA)),
  TransferMana: fx(E.stage('randomAlly', ['spAttack'], 1)),
  SlimeStrike: fx(place('slime')),
  Evaporate: fx(onlyIf(place('shadow'), onTile('water'))),
  SlimePool: fx(place('slime')),
  SlimeHeal: fx(onlyIf(heal('self', pts(5)), onTile('slime'))),
  Pierce: fx(E.atk('otherFoes', 100)),
  FrostPierce: fx(E.atk('otherFoes', 100), st('foes', 'slow', 2)),
  Swing: fx(E.atk('otherFoes', 100)),
  SoulHarvest: fx(E.kill('other', STAT_HIT)),
  Devour: fx(E.kill('other', 25), heal('self', 25)),
  Push: GRID,
  ConstructPylon: REJECT('dựng vật cản trên lưới ô của gốc'),
  PowerUp: fx(both('self', 1)),
  SecondStrike: fx(E.atk('other', 100)),
  MagicStrike: fx(E.dmg('other', { stat: 'spAttack', of: 'self', percent: 50 })),
  Spore: fx(st('other', 'spore', 3)),
  ShadowBurn: fx(onlyIf(hit('other', pts(3), 'other'), C.has('target', ['burn']))),
  RemoveTentacles: fx(E.rmMinions('side')),
  Curse: fx(st('other', 'curse', 3)),
  StrongCurse: fx(st('other', 'curse', 10)),
  FireAura: fx(st('foes', 'burn')),
  ToxicAura: fx(st('foes', 'poison', 3)),
  CurseAura: fx(st('foes', 'curse', 1)),
  HopeShield: fx(shield('self', STAT_HIT)),
  Burnout: fx(st('self', 'burn'), st('self', 'haste', 1), extra),
  Delayed: fx(st('self', 'slow', 1), st('self', 'weak', 1)),
  Terraform: GRID,
  FreeStrike: fx(E.dmg('randomFoe', { stat: 'attack', of: 'self', percent: 50 })),
  Growth: fx(both('self', 1)),
  ZilAura: NAMED,
  LavaFishPresence: fx(place('lava'), st('foes', 'burn')),
  SlimeEntrance: fx(place('slime')),
  ShadowEntrance: fx(place('shadow')),
  SpiritCompanion: fx(E.minion('self', 1, 'portalSpirits')),
  SpiritCompanion2: fx(E.minion('self', 2, 'portalSpirits')),
  SpiritCompanion3: fx(E.minion('self', 3, 'portalSpirits')),
  SpiritArmy: fx(E.minionUp('side', 1)),
  ForestsGrasp: fx(
    onlyIf(st('foes', 'entangle', 3), onTile('grass')),
    onlyIf(st('foes', 'poison', 3), onTile('grass')),
    place('grass')
  ),
  Retreat: REJECT('dịch ô xa địch trên lưới của gốc'),
  Flee: REJECT('rời trận, không có tác dụng chiến đấu'),
  DropLoot: REJECT('thêm đồ rơi của gốc (game có bảng đồ rơi riêng)'),
  Decay: fx(E.lose('other', ['attack'], { stat: 'attack', of: 'target', percent: 10 })),
  MagmaPush: fx(place('lava')),
  WaterPush: fx(place('water')),
  Wave: fx(place('water')),
  Defend: fx(st('self', 'defend', 1)),
  ChaosBuff: fx(E.random('self', 'buff')),
  Reclaim: REJECT('cần quái gốc (original) của bản sao trên lưới'),
  ShadowArmor: fx(onlyIf(st('self', 'defend', 1), onTile('shadow'))),
  ShadowBound: fx(
    onlyIf(st('self', 'slow', 1), notOnTile('shadow')),
    onlyIf(st('self', 'weak', 1), notOnTile('shadow'))
  ),
  DarkPower: fx(mg('self', 1)),
  Reckless: fx(st('self', 'strength', 1), st('self', 'magic', 1), st('self', 'vulnerable', 1)),
  ToxicPower: fx(st('self', 'magic', 99), st('self', 'poison', 99)),
  ManaSpark: fx(E.staminaAtLeast('self', 25)),
  ManaCharm: fx(E.stamina('self', 5 * MANA_STAMINA)),
  ManaAccess: fx(E.staminaPercent('self', 100)),
  FullHeal: fx(heal('self', 100)),
  Illuminate: fx(onlyIf({ do: 'clearFields', layers: ['terrain'] }, onTile('shadow'))),
  Enlighten: fx(st('randomAlly', 'enlighten', 1)),
  Harden: fx(st('self', 'hardened', 2)),
  LightPower: fx(onlyIf(st('self', 'enlighten', 1), C.hpAbove('self', 99))),
  IgniteWeapons: hk(
    h('aura', { scope: 'side', hooks: [trig('attack', 'self', st('other', 'burn', 3))] })
  ),
  LightControl: fx(onlyIf(st('self', 'enlighten', 99), C.hpAbove('self', 99))),
  Dampen: hk(allMinusPercent('water', 10), allMinusPercent('fire', -10)),
  FeatherBond: NAMED,
  SealMastery: fx(onlyIf(both('side', 5), allyRace(['pinniped']))),
  ShadowSupport: fx(onlyIf(mg('allies', 3), C.el('target', ['dark', 'ghost']))),
  ElementalPower: hk(
    allMinusPercent('water', 10),
    allMinusPercent('fire', 10),
    allMinusPercent('poison', 10)
  ),
  Darkness: hk(allMinusPercent('dark', 10), trig('entry', 'self', place('shadow'))),
  Drought: fx(place('sand')),
  Haste: fx(st('self', 'haste', 1)),
  SunShine: hk(allMinusPercent('light', 10), allMinusPercent('dark', -10)),
  Heat: hk(allMinusPercent('fire', 10), allMinusPercent('ice', -10)),
  SpiritHeat: hk(h('damageDealtModifier', { percent: 10, when: [C.skillElement(['fire'])] })),
  Immolation: hk(
    h('damageDealtModifier', { percent: 3, when: [C.skillElement(['fire'])] }),
    trig('turnEnd', 'self', E.dmg('foes', of('target', pts(2))), { chance: 10 })
  ),
  Frost: hk(
    allMinusPercent('ice', 20),
    allMinusPercent('poison', -10),
    trig('entry', 'self', place('ice'))
  ),
  FullShield: fx(st('self', 'invulnerable', 1)),
  StrongShield: fx(shield('self', 50)),
  GoodShield: fx(shield('self', 25)),
  Shield: fx(shield('self', pts(1))),
  LoveShield: REJECT('chỉ khi mục tiêu là nhân vật chính gốc'),
  LovePower: REJECT('chỉ khi mục tiêu là nhân vật chính gốc'),
  LoveEnergy: REJECT('chỉ khi mục tiêu là nhân vật chính gốc')
}

/** Passive gốc bị lọc vì mô tả có chữ người lớn nhưng phần trong trận vẫn hợp lệ: chỉ nhập phần đó. */
export const RESCUED_PASSIVES = {
  ShadowSynthesis: hk(
    h('aura', {
      scope: 'side',
      hooks: [
        h('statWhen', {
          percent: { spAttack: 30 },
          when: [onTile('shadow'), C.el('self', ['grass'])]
        })
      ]
    })
  ),
  Sensitivity: hk(
    h('aura', {
      scope: 'foes',
      hooks: [h('damageTakenWhen', { percent: 50, when: [C.has('self', ['flinch', 'frozen'])] })]
    })
  ),
  BloodLust: hk(
    trig(
      'turnEnd',
      'self',
      { ...extra, oncePerTurn: true },
      {
        when: [
          {
            if: 'counterAtLeast',
            counter: { of: 'foesWithStatus', statusIds: ['bleeding'] },
            min: 1
          }
        ]
      }
    )
  ),
  Pollination: fx(
    onlyIf(mg('side', 5), C.el('target', ['grass'])),
    onlyIf(st('side', 'haste', 1), C.el('target', ['grass']))
  ),
  MushroomPresence: fx(
    onlyIf(shield('side', pts(1)), fungal('target')),
    hit('foes', pts(1), 'target')
  ),
  CalmingWater: fx(onlyIf(shield('self', pts(5)), onTile('water'))),
  Exert: REJECT('chỉ giảm tinh thần (morale) của gốc'),
  Alpha: hk(
    trig('entry', 'self', both('self', 3), {
      when: [{ if: 'statHigher', stat: 'defense', than: 'allFoes' }]
    })
  ),
  Possessed: hk(h('reviveOnce', { hpPercent: 100 })),
  LizardThreat: fx(heal('self', 100))
}

// ---------- Trạng thái mới (giống gốc hơn trạng thái sẵn có) ----------

export const STATUSES = [
  [
    'phereonStrength',
    'Cường lực',
    'Strength Buff',
    0.1,
    {
      kind: 'buff',
      duration: { min: 1, max: 1 },
      hooks: [],
      traitHooks: [h('statModifier', { percent: { attack: 50 } })],
      battleOnly: true
    }
  ],
  [
    'phereonMagic',
    'Cường phép',
    'Magic Buff',
    0.1,
    {
      kind: 'buff',
      duration: { min: 1, max: 1 },
      hooks: [],
      traitHooks: [h('statModifier', { percent: { spAttack: 50 } })],
      battleOnly: true
    }
  ],
  [
    'hardenedSkin',
    'Da cứng',
    'Hardened Skin',
    0.1,
    {
      kind: 'buff',
      duration: { min: 2, max: 2 },
      hooks: [],
      traitHooks: [h('statModifier', { percent: { defense: 50, spDefense: 50 } })],
      battleOnly: true
    }
  ],
  [
    'enlightened',
    'Khai sáng',
    'Enlightened',
    0.1,
    {
      kind: 'buff',
      duration: { min: 1, max: 1 },
      hooks: [],
      traitHooks: [h('statModifier', { percent: { spAttack: 30, attack: -30 } })],
      battleOnly: true
    }
  ],
  [
    'shadowForm',
    'Hình bóng',
    'Shadow Form',
    0.15,
    {
      kind: 'buff',
      duration: { min: 1, max: 1 },
      hooks: [],
      traitHooks: [
        h('dodge', { percent: 50 }),
        h('statModifier', { percent: { spAttack: 20, speed: 40 } })
      ],
      battleOnly: true
    }
  ],
  [
    'soaked',
    'Ướt đẫm',
    'Soaked',
    0.1,
    {
      kind: 'debuff',
      duration: { min: 1, max: 1 },
      hooks: [],
      traitHooks: [h('statModifier', { percent: { attack: -30, spAttack: -30, defense: -20 } })],
      battleOnly: true
    }
  ],
  [
    'phereonInfected',
    'Nhiễm trùng',
    'Infected',
    0.15,
    {
      kind: 'debuff',
      duration: { min: 3, max: 3 },
      hooks: [h('turnEndDamage', { percent: 10 })],
      battleOnly: true
    }
  ],
  [
    'spored',
    'Bào tử',
    'Spore',
    0.1,
    {
      kind: 'debuff',
      duration: { min: 3, max: 3 },
      hooks: [],
      traitHooks: [trig('faint', 'self', E.minion('randomFoe', 1, 'fungalSpores'))],
      battleOnly: true
    }
  ],
  [
    'phereonInvulnerable',
    'Bất khả xâm phạm',
    'Invulnerable',
    0.3,
    {
      kind: 'buff',
      duration: { min: 1, max: 1 },
      hooks: [],
      traitHooks: [h('negateDamage', { chance: 100 })],
      battleOnly: true
    }
  ]
]

/** Quân triệu hồi của gốc (Spawn*): bám vào quái, mỗi lượt đánh một địch ngẫu nhiên theo stack. */
const summoned = (id, vi, en, percent, maxStacks = 3) => [
  {
    id,
    maxStacks,
    leaveChance: 15,
    hooks: [
      trig(
        'turnEnd',
        'self',
        E.dmg('randomFoe', { hp: 'max', of: 'target', percent, per: { of: 'minionStacks' } })
      )
    ]
  },
  vi,
  en
]

/** Minion mới: bào tử nấm (Spore của hệ Nấm), linh thể đi theo (SpiritCompanion), quân triệu hồi. */
export const MINIONS = [
  summoned('portalWorms', 'Giun cổng', 'Portal Worms', 5),
  summoned('portalDrones', 'Bầy trùng cổng', 'Portal Drones', 3, 5),
  summoned('portalBulbs', 'Bầu nhờn', 'Slime Bulbs', 3),
  summoned('portalTentacles', 'Xúc tu cổng', 'Portal Tentacles', 4),
  summoned('portalFlora', 'Hoa triệu hồi', 'Summoned Flora', 3),
  [
    {
      id: 'fungalSpores',
      maxStacks: 5,
      leaveChance: 20,
      hooks: [
        trig(
          'turnEnd',
          'self',
          E.dmg('randomFoe', { hp: 'max', of: 'other', percent: 3, per: { of: 'minionStacks' } })
        )
      ]
    },
    'Bào tử nấm',
    'Fungal Spores'
  ],
  [
    {
      id: 'portalSpirits',
      maxStacks: 3,
      leaveChance: 10,
      hooks: [
        trig(
          'attack',
          'self',
          E.dmg('randomFoe', {
            stat: 'spAttack',
            of: 'self',
            percent: 10,
            per: { of: 'minionStacks' }
          })
        )
      ]
    },
    'Linh thể cổng',
    'Portal Spirits'
  ]
]

// ---------- Special trait (SpecialTraits của gốc) ----------

const TAG = REJECT('nhãn phân loại của gốc (race / dạng sống), game dùng race thay')
export const SPECIAL_TRAITS = {
  Photosynthesis: [
    h('regen', { percent: 3 }),
    trig('turnEnd', 'self', heal('self', 6), {
      when: [{ if: 'fieldActive', layer: 'weather', fieldIds: ['sun', 'harshSunlight'] }]
    })
  ],
  Slime: [h('statusHeals', { statusIds: ['phereonInfected'], percent: 100 })],
  NonBlocking: REJECT('luật chặn đường trên lưới ô của gốc'),
  NonAttacking: REJECT('quái gốc không đánh thường (game có learnset riêng)'),
  NonDefending: REJECT('quái gốc không thủ (game không có lệnh thủ theo loài)'),
  LavaImmune: [h('fieldDamageImmunity', { fieldIds: ['volcanicTerrain'] }), immune('burn')],
  Agile: [h('dodge', { percent: 15 })],
  LandMount: OVERWORLD,
  AirMount: OVERWORLD,
  LavaMount: OVERWORLD,
  WaterMount: OVERWORLD,
  OxygenProvider: OVERWORLD,
  PackMule: OVERWORLD,
  BadAnatomy: ADULT,
  Abdomen: ADULT,
  SexAffinity: ADULT,
  Collector: ADULT,
  Glowing: [trig('entry', 'self', st('foes', 'blind', 1))],
  Insectoid: TAG,
  Worm: TAG,
  Seal: TAG,
  Spirit: TAG,
  Seedling: TAG,
  Fungal: TAG,
  Pet: REJECT('chỉ tăng tinh thần lúc cắm trại của gốc'),
  Evolving: REJECT('đánh dấu loài tiến hóa được (game ghi ở evolutions)'),
  Aquatic: [h('statWhen', { percent: { speed: 30 }, when: [onTile('water')] })],
  WaterBreathing: [h('fieldDamageImmunity', { fieldIds: ['deepWater'] })],
  Elite: [
    h('statModifier', {
      percent: { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 10 }
    })
  ],
  HeightenedSense: [h('seeInvisible', {}), h('accuracyModifier', { percent: 10 })],
  MagicVision: [h('seeInvisible', {})],
  ShadowBound: [trig('turnEnd', 'self', [onlyIf(st('self', 'slow', 1), notOnTile('shadow'))])],
  Giant: [h('statModifier', { percent: { hp: 30 } })],
  PoisonImmune: [immune('poison', 'badPoison')],
  SlimeBulb: [trig('faint', 'self', place('slime'))],
  ColdResistant: [
    immune('frozen', 'freeze', 'chilled'),
    h('damageTakenWhen', { percent: -25, when: [C.skillElement(['ice'])] })
  ],
  QuickShooter: [h('actFirstChance', { chance: 20 })],
  Sniper: [h('critChance', { percent: 15 })],
  HardenedSkin: [immune('bleeding', 'blighted')],
  Lucky: [h('critChance', { percent: 10 }), h('dodge', { percent: 5 })],
  TrueSight: [h('seeInvisible', {}), h('undodgeable', {})],
  CrystalArmor: [h('damageTakenWhen', { percent: -20, when: [C.cat('special')] })],
  SandWalker: [
    h('fieldDamageImmunity', { fieldIds: ['sandstorm'] }),
    h('statWhen', { percent: { speed: 30 }, when: [onTile('sand')] })
  ]
}

// ---------- Gen (GeneticTraitType của gốc): trait tung ngẫu nhiên ----------

const gene = (kind, ...hooks) => ({ kind, hooks })
const statPct = (percent) => h('statModifier', { percent })
/** Gen gốc: common → positive (gen xấu → negative), rare / legendary → rare (`trait` thường tung). */
export const GENES = {
  FungalAlly: gene('positive', statPct({ spDefense: 20 })),
  HopeShield: gene('positive', trig('entry', 'self', shield('self', STAT_HIT))),
  Glacial: gene('positive', h('absorbElement', { elementIds: ['ice'], healPercent: 25 })),
  SandArmor: gene(
    'positive',
    h('damageTakenWhen', { percent: -30, when: [notOnTile('sand')] }),
    trig('damaged', 'self', place('sand'), { oncePerTurn: true })
  ),
  Terraformer: REJECT('chép ô sang ô bên cạnh trên lưới của gốc'),
  DelayedStart: gene(
    'rare',
    trig('entry', 'self', [st('self', 'slow', 1), st('self', 'weak', 1)]),
    trig('turnEnd', 'self', both('self', 1))
  ),
  Burnout: gene('rare', trig('entry', 'self', [st('self', 'burn'), st('self', 'haste', 1), extra])),
  FairSkin: gene(
    'rare',
    statPct({ defense: 10, spDefense: 10 }),
    h('effectiveness', { mode: 'neutral' })
  ),
  CurseAura: gene('rare', trig('turnEnd', 'self', st('foes', 'curse', 1))),
  Robust: gene('positive', h('damageCap', { percent: 25 })),
  Flexible: REJECT('đổi skill tự do ở menu gốc (game có học lại skill)'),
  MagicConverter: gene(
    'positive',
    h('attackStat', { stat: 'spAttack', weight: 100, categories: ['physical'] })
  ),
  Insulated: gene(
    'positive',
    h('damageTakenWhen', { percent: -50, when: [C.skillElement(['electric'])] })
  ),
  Delicate: gene('positive', statPct({ spAttack: 25, hp: -50 })),
  Amplified: gene('positive', h('stageMultiplier', { gain: 1.5 })),
  OverSized: gene('positive', statPct({ hp: 15 })),
  Connected: gene(
    'positive',
    trig('entry', 'self', both('self', 1), {
      when: [{ if: 'counterAtLeast', counter: { of: 'sameRaceOnSide' }, min: 1 }]
    })
  ),
  Symbiosis: gene(
    'positive',
    trig('entry', 'self', mg('self', 1), {
      when: [{ if: 'counterAtLeast', counter: { of: 'alliesOnField' }, min: 1 }]
    })
  ),
  Focusing: OVERWORLD,
  Defensive: gene(
    'positive',
    trig('entry', 'self', st('self', 'defend', 1)),
    statPct({ attack: -10 })
  ),
  Chaotic: gene('positive', trig('entry', 'self', E.random('self', 'buff'))),
  Floating: OVERWORLD,
  Charging: gene(
    'rare',
    trig('entry', 'self', [
      st('self', 'strength', 1),
      st('self', 'magic', 1),
      st('self', 'vulnerable', 1)
    ])
  ),
  // Gốc: đầu trận mana ít nhất 25%; −20% mana / phép. Thể lực game đầy khi vào trận nên mức tối
  // thiểu chạy mỗi lần vào sân (có tác dụng khi quay lại sân sau khi đã tiêu).
  ManaSpark: gene(
    'rare',
    trig('entry', 'self', E.staminaAtLeast('self', 25)),
    h('staminaMaxPercent', { percent: -20 }),
    statPct({ spAttack: -20 })
  ),
  ToxicPower: gene(
    'rare',
    trig('entry', 'self', [st('self', 'magic', 99), st('self', 'poison', 99)])
  ),
  Shielding: gene('rare', trig('entry', 'self', shield('self', 50))),
  Possessed: gene('rare', statPct({ spAttack: 20 }), h('reviveOnce', { hpPercent: 50 })),
  Volatile: gene(
    'rare',
    trig('faint', 'self', E.dmg('foes', { stat: 'spAttack', of: 'self', percent: 100 }))
  ),
  QuickHatching: gene(
    'rare',
    h('eggGrowthPercent', { percent: 25 }),
    h('eggStabilityPercent', { percent: -20 })
  ),
  SlowHatching: gene(
    'rare',
    h('eggGrowthPercent', { percent: -10 }),
    h('eggStabilityPercent', { percent: 40 })
  ),
  Diluted: gene('rare', statPct({ attack: -75, spAttack: -75, spDefense: 75 })),
  Condensed: gene('rare', statPct({ attack: 50, spAttack: 50, spDefense: -50 })),
  Sprouting: gene('positive', trig('turnEnd', 'self', place('grass'))),
  PiercingClaws: gene('rare', h('ignoreDefensePercent', { percent: 100 })),
  Consistent: gene('positive', h('damageTakenWhen', { percent: -25, when: [C.defending('self')] })),
  Reserving: REJECT('khiên gốc tự giảm dần, khiên của game không giảm'),
  Wild: gene('rare', statPct({ attack: 50, speed: 15 })),
  Strong: gene('positive', statPct({ attack: 15 })),
  Arcane: gene('rare', statPct({ spAttack: 15, spDefense: 15 })),
  Empowered: gene('positive', statPct({ hp: 20, attack: 20, spAttack: 20, spDefense: 20 })),
  God: gene('positive', statPct({ hp: 50, attack: 50, spAttack: 50, spDefense: 50 })),
  Catalyst: gene('rare', h('fuseChanceBonus', { points: 50 })),
  Weak: gene('negative', statPct({ attack: -15 })),
  Heavy: gene('positive', statPct({ attack: 20, hp: 20, speed: -15 })),
  ShortSighted: OVERWORLD,
  EagleEyed: OVERWORLD,
  Intelligent: gene('positive', h('expRewardModifier', { percent: 50 })),
  Nimble: gene('rare', statPct({ hp: -25 }), trig('turnEnd', 'self', st('self', 'focus', 1))),
  Lumbering: gene('rare', statPct({ hp: 50, attack: 10, speed: -30 })),
  Frail: gene('negative', statPct({ hp: -25 })),
  Resilient: gene('positive', statPct({ hp: 25 })),
  Fast: gene('positive', statPct({ speed: 15 })),
  Slow: gene('negative', statPct({ speed: -15 })),
  Stable: gene('rare', h('eggStabilityPercent', { percent: 10 })),
  Scales: gene('rare', statPct({ defense: 15, hp: 5 })),
  Poisonous: gene('rare', trig('attack', 'self', st('other', 'poison', 3))),
  LifeBound: gene('rare', statPct({ hp: 50 })),
  Ethereal: gene(
    'rare',
    h('damageTakenWhen', { percent: -50 }),
    statPct({ spAttack: -25, defense: 10 })
  ),
  // Lệch gốc: gốc tăng tốc lên chỉ số mỗi level; game không có tăng trưởng riêng từng quái nên +10% mọi chỉ số.
  Potential: gene(
    'rare',
    statPct({ hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 10 })
  ),
  Telekinetic: gene(
    'rare',
    h('attackStat', { stat: 'spAttack', weight: 100, categories: ['physical'] })
  ),
  Prodigy: REJECT('bắt đầu ở nửa level tối đa (game không có level tối đa)'),
  Channeling: gene('positive', trig('damaged', 'self', manaDrain('other'))),
  BloodLine: REJECT(
    'khóa fuse và gen của trứng theo luật gen gốc (game có huyết mạch riêng, bloodline.md)'
  ),
  WindShaper: gene(
    'rare',
    h('damageDealtModifier', {
      percent: 15,
      when: [{ if: 'not', condition: { if: 'moveFlag', flags: ['contact'] } }]
    })
  ),
  SealedPower: gene('positive', trig('damaged', 'self', both('self', 1))),
  Growing: REJECT('+5 level tối đa (game không có level tối đa)'),
  Reconstructing: gene('positive', h('reviveOnce', { hpPercent: 50 })),
  Regenerating: gene('positive', h('regen', { percent: 5 })),
  Berserker: gene('positive', trig('attack', 'self', str('self', 1))),
  Siphon: gene('positive', trig('turnEnd', 'self', manaDrain('foes'))),
  PoisonSkin: gene(
    'positive',
    trig('damaged', 'self', st('other', 'poison', 2), {
      when: [{ if: 'moveFlag', flags: ['contact'] }]
    })
  ),
  Electric: gene(
    'positive',
    trig('damaged', 'self', st('other', 'slow', 1), {
      when: [{ if: 'moveFlag', flags: ['contact'] }]
    })
  ),
  Manabound: gene('positive', statPct({ spAttack: 20, attack: -50 })),
  Savage: gene(
    'positive',
    statPct({ attack: 25, defense: 10, speed: 15 }),
    h('blockManual', { categories: ['status'] })
  ),
  HeatResistant: gene(
    'rare',
    h('fieldDamageImmunity', { fieldIds: ['volcanicTerrain'] }),
    immune('burn'),
    h('damageTakenWhen', { percent: -50, when: [C.skillElement(['fire'])] })
  ),
  Burning: gene(
    'rare',
    h('statusDamageModifier', { statusIds: ['burn'], percent: 100 }),
    trig('turnEnd', 'self', st('self', 'burn'))
  ),
  Gills: gene('positive', h('fieldDamageImmunity', { fieldIds: ['deepWater'] })),
  Infused: gene('positive', statPct({ spAttack: 25 })),
  PowerMagic: gene('positive', trig('attack', 'self', st('self', 'magic', 1))),
  FungalAffinity: gene('positive', trig('turnEnd', 'self', E.minion('self', 1, 'fungalSpores'))),
  FireAffinity: gene('positive', trig('turnEnd', 'self', onlyIf(str('self', 2), onTile('lava')))),
  GrassAffinity: gene(
    'positive',
    trig('turnEnd', 'self', onlyIf(armor('self', 1), onTile('grass')))
  ),
  IceAffinity: gene('positive', trig('turnEnd', 'self', onlyIf(mg('self', 2), onTile('ice')))),
  ShadowAffinity: gene(
    'positive',
    trig('turnEnd', 'self', [
      onlyIf(st('self', 'defend', 1), onTile('shadow')),
      onlyIf(st('self', 'vulnerable', 1), notOnTile('shadow'))
    ])
  ),
  LightAffinity: gene(
    'positive',
    h('expRewardModifier', { percent: 50 }),
    trig('turnEnd', 'self', onlyIf(st('self', 'enlighten', 1), C.hpAbove('self', 99)))
  ),
  ElectricAffinity: gene(
    'positive',
    trig('damaged', 'self', E.cure('self', 'debuff'), { when: [C.skillElement(['electric'])] })
  ),
  StoneSkin: gene('positive', statPct({ defense: 25 })),
  Incubating: gene('positive', statPct({ spAttack: 5 }), h('hatcherBonus', { percent: 100 })),
  MagicSpeed: gene('positive', statPct({ speed: 30, spDefense: -50 })),
  Infusing: REJECT('gốc ghi "not assigned?" (chưa có tác dụng)'),
  RadiationImmunity: gene('positive', immune('blighted')),
  Reactive: gene(
    'positive',
    trig('damaged', 'self', st('self', 'focus', 1)),
    statPct({ attack: -20 })
  ),
  Intimidating: gene(
    'positive',
    trig(
      'turnEnd',
      'self',
      onlyIf(st('foes', 'weak', 1), { if: 'statHigher', stat: 'attack', than: 'target' })
    )
  ),
  Overwhelming: gene(
    'positive',
    trig(
      'attack',
      'self',
      onlyIf(st('other', 'vulnerable', 1), { if: 'statHigher', stat: 'attack', than: 'target' })
    )
  ),
  Hardening: gene('positive', trig('damaged', 'self', st('self', 'hardened', 2))),
  Vitality: gene(
    'positive',
    statPct({ hp: 15 }),
    trig('defend', 'self', st('self', 'immunity', 1))
  ),
  ChoiceCaster: REJECT('game không có hồi chiêu'),
  BurstCaster: REJECT('game không có hồi chiêu'),
  ChaosCaster: REJECT('game không có hồi chiêu'),
  HighMetabolism: REJECT('thể lực / thức ăn hằng ngày ở bản đồ gốc'),
  Generalist: gene('positive', statPct({ attack: 10, spAttack: 10, hp: 10, spDefense: 10 }))
}

/** Gen bị lọc vì mô tả có chữ người lớn / thuộc hệ sinh sản của gốc nhưng phần trong trận vẫn hợp lệ. */
export const RESCUED_GENES = {
  Engineered: REJECT(
    'cộng tăng trưởng theo gen 0 của gốc (game không có gen theo chỉ số kiểu gốc)'
  ),
  InnerHealing: gene(
    'rare',
    statPct({ hp: -25, attack: -25, spAttack: -25 }),
    h('healOnLeave', { percent: 100 })
  ),
  AncientPower: gene(
    'rare',
    statPct({ hp: 20, attack: 20, spAttack: 20, spDefense: 20 }),
    h('expRewardModifier', { percent: -80 })
  ),
  Dumb: gene('negative', h('expRewardModifier', { percent: -25 })),
  Mutating: gene(
    'rare',
    h('traitInheritBonus', { percent: 50 }),
    h('eggStabilityPercent', { percent: -10 })
  ),
  Unstable: REJECT('loài trứng ngẫu nhiên khi phối giống ở gốc (game phối giống theo loài cha mẹ)'),
  WaterAffinity: gene(
    'positive',
    trig('turnEnd', 'self', onlyIf(shield('self', pts(5)), onTile('water')))
  ),
  Alpha: gene(
    'rare',
    trig('entry', 'self', both('self', 3), {
      when: [{ if: 'statHigher', stat: 'defense', than: 'allFoes' }]
    })
  ),
  Stud: gene('rare', h('traitInheritBonus', { percent: 20 }))
}
