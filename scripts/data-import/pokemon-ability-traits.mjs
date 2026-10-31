/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Thêm ability Pokémon còn thiếu thành trait (docs/rules/abilities.md)
// vào src/data/traits.json + tên vi / en (tên en theo PokeAPI ability_names). Chỉ ability biểu diễn
// được bằng hook / ngôn ngữ trait sẵn có, số theo bản gốc thế hệ 9. Ghi đè trait cùng id (chạy lại
// được); sau đó chạy pokemon-abilities-import.mjs để gắn vào loài. Cần mạng.

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv } from './pokeapi.mjs'

const TRAITS_PATH = new URL('../../src/data/traits.json', import.meta.url)
const I18N = (lang) => new URL(`../../src/data/i18n/${lang}/traits.json`, import.meta.url)

const MAJOR = ['burn', 'paralysis', 'poison', 'badPoison', 'sleep', 'freeze']
const hook = (type, params = {}) => ({ type, params })
const immune = (...statusIds) => hook('statusImmunity', { statusIds })
const noLower = (stats) => hook('statLowerImmunity', { stats })
const flagged = (flags) => [{ if: 'moveFlag', flags }]
const dealtWhen = (percent, when, categories) =>
  hook('damageDealtModifier', { percent, when, ...(categories ? { categories } : {}) })
const takenWhen = (percent, when, categories) =>
  hook('damageTakenWhen', {
    percent,
    ...(when ? { when } : {}),
    ...(categories ? { categories } : {})
  })
const weather = (fieldIds) => ({ if: 'fieldActive', layer: 'weather', fieldIds })
const terrain = (fieldIds) => ({ if: 'fieldActive', layer: 'terrain', fieldIds })
const elementDealt = (elementIds, percent) => hook('elementDamageDealt', { elementIds, percent })
const elementTaken = (elementIds, percent) => hook('elementDamageTaken', { elementIds, percent })
const trigger = (on, effects, extra = {}) =>
  hook('trigger', { on, scope: 'self', effects, ...extra })
const selfStage = (stats, delta) => ({ do: 'stage', to: 'self', stats, delta })
const hitBy = (elementIds) => [{ if: 'skillElement', elementIds }]
const stageOn = (event, stat, stages) => hook(event, { stat, stages })
const statusWhen = (statusIds) => [{ if: 'hasStatus', who: 'self', statusIds }]
const onEntry = (target, stat, stages) => hook('stageOnEntry', { target, stat, stages })
const absorb = (elementIds, stat, delta) =>
  hook('absorbElement', { elementIds, healPercent: 0, stages: [{ stat, delta }] })
const plusMinusAura = () =>
  hook('aura', {
    scope: 'allies',
    hooks: [
      hook('statWhen', {
        percent: { spAttack: 50 },
        when: [{ if: 'hasAbility', who: 'self', abilityIds: ['plus', 'minus'] }]
      })
    ]
  })
const ruin = (stat) =>
  hook('aura', { scope: 'foes', hooks: [hook('statModifier', { percent: { [stat]: -25 } })] })

const MIMICRY_TERRAINS = [
  ['grassyTerrain', 'grass'],
  ['electricTerrain', 'electric'],
  ['mistyTerrain', 'fairy'],
  ['psychicTerrain', 'psychic']
]
const flag = (name) => hook('abilityFlag', { flag: name })
// Sand Veil / Sand Rush / Sand Force miễn sát thương bão cát (như Pokémon).
const sandImmune = () => hook('fieldDamageImmunity', { fieldIds: ['sandstorm'] })
// Protosynthesis / Quark Drive đã bật bằng Booster Energy thì không cộng thêm theo môi trường.
const notBoosted = {
  if: 'not',
  condition: { if: 'hasStatus', who: 'self', statusIds: ['boosterEnergy'] }
}
const ELEMENT_IDS = JSON.parse(
  readFileSync(new URL('../../src/data/elements.json', import.meta.url), 'utf8')
).map((element) => element.id)
const convert = (fromElementIds, toElementId) =>
  hook('convertSkillElement', { fromElementIds, toElementId, percent: 20 })
const notBroken = [{ if: 'not', condition: { if: 'abilityOnField', abilityIds: ['auraBreak'] } }]
const fieldAura = (elementId) => [
  hook('aura', { scope: 'side', when: notBroken, hooks: [elementDealt([elementId], 33)] }),
  hook('aura', { scope: 'foes', when: notBroken, hooks: [elementDealt([elementId], 33)] })
]
/** Cùng hiệu ứng cho nhiều sự kiện (vào sân, môi trường đổi, cuối lượt...). */
const onEvents = (events, effects, extra = {}) => events.map((on) => trigger(on, effects, extra))
const toForm = (forms, extra = {}) => ({ do: 'changeForm', to: 'self', forms, ...extra })
const REVERT = { do: 'changeForm', to: 'self', revert: true }
const inForm = (speciesIds) => ({ if: 'inForm', who: 'self', speciesIds })
const hpAbove = (percent) => ({ if: 'hpAbove', who: 'self', percent })
const hpBelow = (percent) => ({ if: 'hpBelow', who: 'self', percent })
const hpFellBelow = (percent) => ({ if: 'hpFellBelow', who: 'self', percent })
const FIELD_EVENTS = ['entry', 'fieldChanged', 'turnEnd']
/** Forecast: dạng theo thời tiết (Castform), không có thời tiết hợp thì về dạng thường. */
const FORECAST = [
  ['sun', 'castformSunny'],
  ['rain', 'castformRainy'],
  ['snow', 'castformSnowy']
]
const onceAtHalf = (effects) =>
  trigger('damaged', effects, {
    when: [{ if: 'hpBelow', who: 'self', percent: 50 }],
    oncePerBattle: true
  })

/** id trait → { vi: tên tiếng Việt, hooks, kind? (mặc định positive) }. */
const ABILITIES = {
  // ---------- Miễn trạng thái / hạ bậc ----------
  keenEye: { vi: 'Mắt tinh', hooks: [noLower(['accuracy'])] },
  illuminate: { vi: 'Chiếu sáng', hooks: [noLower(['accuracy'])] },
  mindsEye: { vi: 'Tâm nhãn', hooks: [noLower(['accuracy'])] },
  hyperCutter: { vi: 'Kìm sắc', hooks: [noLower(['attack'])] },
  bigPecks: { vi: 'Ngực nở', hooks: [noLower(['defense'])] },
  clearBody: { vi: 'Thân trong suốt', hooks: [noLower('all')] },
  whiteSmoke: { vi: 'Khói trắng', hooks: [noLower('all')] },
  fullMetalBody: { vi: 'Thân kim loại', hooks: [noLower('all')] },
  innerFocus: { vi: 'Tập trung nội tâm', hooks: [immune('flinch')] },
  ownTempo: { vi: 'Nhịp riêng', hooks: [immune('confusion')] },
  oblivious: { vi: 'Vô tư lự', hooks: [immune('infatuated')] },
  vitalSpirit: { vi: 'Tinh thần sung mãn', hooks: [immune('sleep', 'drowsy')] },
  magmaArmor: { vi: 'Giáp dung nham', hooks: [immune('freeze')] },
  comatose: { vi: 'Hôn mê', hooks: [immune(...MAJOR)] },
  purifyingSalt: {
    vi: 'Muối thanh tẩy',
    hooks: [immune(...MAJOR), elementTaken(['ghost'], -50)]
  },
  pastelVeil: {
    vi: 'Màn phấn hồng',
    hooks: [hook('aura', { scope: 'side', hooks: [immune('poison', 'badPoison')] })]
  },
  sweetVeil: {
    vi: 'Màn ngọt ngào',
    hooks: [hook('aura', { scope: 'side', hooks: [immune('sleep', 'drowsy')] })]
  },
  aromaVeil: {
    vi: 'Màn hương thơm',
    hooks: [
      hook('aura', { scope: 'side', hooks: [immune('tormented', 'healBlocked', 'infatuated')] })
    ]
  },
  shellArmor: { vi: 'Vỏ sò cứng', hooks: [hook('critImmunity')] },
  thermalExchange: {
    vi: 'Trao đổi nhiệt',
    hooks: [
      immune('burn'),
      trigger('damaged', [selfStage(['attack'], 1)], { when: hitBy(['fire']) })
    ]
  },
  waterBubble: {
    vi: 'Bong bóng nước',
    hooks: [immune('burn'), elementDealt(['water'], 100), elementTaken(['fire'], -50)]
  },

  // ---------- Sức mạnh theo loại chiêu ----------
  ironFist: { vi: 'Nắm đấm sắt', hooks: [dealtWhen(20, flagged(['punch']))] },
  strongJaw: { vi: 'Hàm khỏe', hooks: [dealtWhen(50, flagged(['bite']))] },
  megaLauncher: { vi: 'Bệ phóng lớn', hooks: [dealtWhen(50, flagged(['pulse']))] },
  sharpness: { vi: 'Sắc bén', hooks: [dealtWhen(50, flagged(['slicing']))] },
  toughClaws: { vi: 'Vuốt cứng', hooks: [dealtWhen(30, flagged(['contact']))] },
  reckless: { vi: 'Liều lĩnh', hooks: [dealtWhen(20, flagged(['recoil']))] },
  punkRock: {
    vi: 'Nhạc rock',
    hooks: [dealtWhen(30, flagged(['sound'])), takenWhen(-50, flagged(['sound']))]
  },
  sandForce: {
    vi: 'Sức mạnh cát',
    hooks: [
      dealtWhen(30, [
        weather(['sandstorm']),
        { if: 'skillElement', elementIds: ['rock', 'ground', 'steel'] }
      ]),
      sandImmune()
    ]
  },
  analytic: {
    vi: 'Phân tích',
    hooks: [dealtWhen(30, [{ if: 'actedThisTurn', who: 'target', value: true }])]
  },
  neuroforce: { vi: 'Lực thần kinh', hooks: [dealtWhen(25, [{ if: 'superEffective' }])] },
  steelworker: { vi: 'Thợ thép', hooks: [elementDealt(['steel'], 50)] },
  transistor: { vi: 'Bóng bán dẫn', hooks: [elementDealt(['electric'], 30)] },
  dragonsMaw: { vi: 'Hàm rồng', hooks: [elementDealt(['dragon'], 50)] },
  rockyPayload: { vi: 'Tải đá', hooks: [elementDealt(['rock'], 50)] },
  steelySpirit: {
    vi: 'Tinh thần thép',
    hooks: [hook('aura', { scope: 'side', hooks: [elementDealt(['steel'], 50)] })]
  },
  battery: {
    vi: 'Pin',
    hooks: [hook('aura', { scope: 'allies', hooks: [dealtWhen(30, [], ['special'])] })]
  },
  powerSpot: {
    vi: 'Điểm năng lượng',
    hooks: [hook('aura', { scope: 'allies', hooks: [dealtWhen(30, [])] })]
  },
  // Như gốc: công × 2 (trước đây +40% để cân bằng; đổi theo luật giống gốc 2026-10-30).
  purePower: {
    vi: 'Sức mạnh thuần khiết',
    kind: 'rare',
    exclusiveGroup: 'offense',
    hooks: [hook('statModifier', { percent: { attack: 100 } })]
  },
  hugePower: {
    vi: 'Sức mạnh khổng lồ',
    kind: 'rare',
    exclusiveGroup: 'offense',
    hooks: [hook('statModifier', { percent: { attack: 100 } })]
  },
  gorillaTactics: {
    vi: 'Chiến thuật khỉ đột',
    kind: 'rare',
    hooks: [hook('statModifier', { percent: { attack: 50 } }), hook('choiceLock')]
  },
  parentalBond: {
    vi: 'Tình mẫu tử',
    kind: 'rare',
    hooks: [hook('extraHits', { count: 1, damagePercent: 25, categories: ['physical', 'special'] })]
  },
  merciless: {
    vi: 'Tàn nhẫn',
    hooks: [
      hook('critChance', {
        percent: 100,
        when: [{ if: 'hasStatus', who: 'target', statusIds: ['poison', 'badPoison'] }]
      })
    ]
  },
  supremeOverlord: {
    vi: 'Chúa tể tối cao',
    kind: 'rare',
    hooks: [hook('scaling', { per: { of: 'faintedAllies' }, effect: { damageDealt: 10 } })]
  },

  // ---------- Phòng thủ ----------
  fluffy: {
    vi: 'Lông xù',
    hooks: [takenWhen(-50, flagged(['contact'])), elementTaken(['fire'], 100)]
  },
  furCoat: { vi: 'Lông dày', kind: 'rare', hooks: [takenWhen(-50, undefined, ['physical'])] },
  iceScales: { vi: 'Vảy băng', kind: 'rare', hooks: [takenWhen(-50, undefined, ['special'])] },
  filter: {
    vi: 'Bộ lọc',
    hooks: [hook('effectivenessModifier', { side: 'taken', when: 'superEffective', percent: -25 })]
  },
  prismArmor: {
    vi: 'Giáp lăng kính',
    hooks: [hook('effectivenessModifier', { side: 'taken', when: 'superEffective', percent: -25 })]
  },
  shadowShield: {
    vi: 'Khiên u ảnh',
    kind: 'rare',
    hooks: [hook('damageTakenAtFullHp', { percent: -50 })]
  },
  soundproof: { vi: 'Cách âm', hooks: [takenWhen(-100, flagged(['sound']))] },
  bulletproof: { vi: 'Chống đạn', hooks: [takenWhen(-100, flagged(['bullet']))] },
  overcoat: {
    vi: 'Áo khoác',
    hooks: [hook('fieldDamageImmunity'), hook('moveFlagImmunity', { flags: ['powder'] })]
  },
  windRider: {
    vi: 'Cưỡi gió',
    hooks: [
      takenWhen(-100, flagged(['wind'])),
      trigger('damagedAny', [selfStage(['attack'], 1)], { when: flagged(['wind']) })
    ]
  },
  wonderGuard: {
    vi: 'Bảo hộ kỳ diệu',
    kind: 'rare',
    hooks: [
      takenWhen(-100, [{ if: 'not', condition: { if: 'superEffective' } }], ['physical', 'special'])
    ]
  },
  drySkin: {
    vi: 'Da khô',
    hooks: [
      hook('absorbElement', { elementIds: ['water'], healPercent: 25 }),
      elementTaken(['fire'], 25),
      hook('regenInWeather', { weatherIds: ['rain'], percent: 12.5 }),
      trigger(
        'turnEnd',
        [{ do: 'damage', to: 'self', amount: { hp: 'max', of: 'self', percent: 12.5 } }],
        { when: [weather(['sun'])] }
      )
    ]
  },
  earthEater: {
    vi: 'Ăn đất',
    hooks: [hook('absorbElement', { elementIds: ['ground'], healPercent: 25 })]
  },
  lightningRod: { vi: 'Cột thu lôi', hooks: [absorb(['electric'], 'spAttack', 1)] },
  stormDrain: { vi: 'Hút dòng nước', hooks: [absorb(['water'], 'spAttack', 1)] },
  motorDrive: { vi: 'Động cơ điện', hooks: [absorb(['electric'], 'speed', 1)] },
  wellBakedBody: { vi: 'Thân nướng chín', hooks: [absorb(['fire'], 'defense', 2)] },
  sheerForce: {
    vi: 'Sức mạnh thô',
    hooks: [hook('secondaryEffectChance', { percent: -100 }), dealtWhen(30, flagged(['secondary']))]
  },
  rockHead: { vi: 'Đầu đá', hooks: [hook('recoilImmunity')] },
  suctionCups: { vi: 'Giác hút', hooks: [hook('anchored')] },
  noGuard: { vi: 'Không phòng bị', hooks: [hook('sureHit'), hook('surelyHit')] },
  iceBody: {
    vi: 'Thân băng',
    hooks: [hook('regenInWeather', { weatherIds: ['snow'], percent: 6.25 })]
  },
  poisonHeal: {
    vi: 'Hồi phục bằng độc',
    hooks: [hook('statusHeals', { statusIds: ['poison', 'badPoison'], percent: 100 })]
  },

  // ---------- Tốc độ, né, chính xác theo môi trường / trạng thái ----------
  sandRush: {
    vi: 'Lướt cát',
    hooks: [
      hook('statModifierInWeather', { weatherIds: ['sandstorm'], percent: { speed: 100 } }),
      sandImmune()
    ]
  },
  slushRush: {
    vi: 'Lướt tuyết',
    hooks: [hook('statModifierInWeather', { weatherIds: ['snow'], percent: { speed: 100 } })]
  },
  sandVeil: {
    vi: 'Màn cát',
    hooks: [hook('dodge', { percent: 20, when: [weather(['sandstorm'])] }), sandImmune()]
  },
  snowCloak: { vi: 'Áo tuyết', hooks: [hook('dodge', { percent: 20, when: [weather(['snow'])] })] },
  tangledFeet: {
    vi: 'Rối chân',
    hooks: [hook('dodge', { percent: 50, when: statusWhen(['confusion']) })]
  },
  quickFeet: {
    vi: 'Chân nhanh',
    hooks: [hook('statWhen', { percent: { speed: 50 }, when: statusWhen(MAJOR) })]
  },
  toxicBoost: {
    vi: 'Độc tăng lực',
    hooks: [
      hook('statWhen', { percent: { attack: 50 }, when: statusWhen(['poison', 'badPoison']) })
    ]
  },
  flareBoost: {
    vi: 'Lửa tăng lực',
    hooks: [hook('statWhen', { percent: { spAttack: 50 }, when: statusWhen(['burn']) })]
  },
  victoryStar: {
    vi: 'Sao chiến thắng',
    hooks: [hook('aura', { scope: 'side', hooks: [hook('accuracyModifier', { percent: 10 })] })]
  },

  // ---------- Bậc chỉ số ----------
  defiant: { vi: 'Bất khuất', hooks: [stageOn('stageOnStatLowered', 'attack', 2)] },
  competitive: { vi: 'Hiếu thắng', hooks: [stageOn('stageOnStatLowered', 'spAttack', 2)] },
  chillingNeigh: { vi: 'Tiếng hí băng giá', hooks: [stageOn('stageOnKnockout', 'attack', 1)] },
  grimNeigh: { vi: 'Tiếng hí u ám', hooks: [stageOn('stageOnKnockout', 'spAttack', 1)] },
  // As One = Unnerve + Chilling / Grim Neigh.
  asOneGlastrier: {
    vi: 'Hợp nhất (Băng)',
    kind: 'rare',
    hooks: [stageOn('stageOnKnockout', 'attack', 1), flag('blocksFoeBerries')]
  },
  asOneSpectrier: {
    vi: 'Hợp nhất (Ma)',
    kind: 'rare',
    hooks: [stageOn('stageOnKnockout', 'spAttack', 1), flag('blocksFoeBerries')]
  },
  intrepidSword: { vi: 'Kiếm dũng cảm', kind: 'rare', hooks: [onEntry('self', 'attack', 1)] },
  dauntlessShield: { vi: 'Khiên kiên cường', kind: 'rare', hooks: [onEntry('self', 'defense', 1)] },
  supersweetSyrup: { vi: 'Siro siêu ngọt', hooks: [onEntry('allEnemies', 'evasion', -1)] },
  contrary: { vi: 'Ngược đời', hooks: [hook('stageMultiplier', { gain: -1, loss: -1 })] },
  // Plus / Minus: +50% đặc công khi đồng đội trên sân có Plus / Minus (hào quang lên đồng đội).
  plus: { vi: 'Cực dương', hooks: [plusMinusAura()] },
  minus: { vi: 'Cực âm', hooks: [plusMinusAura()] },
  // ---------- Đợt 2 (2026-10-30): cờ ability, đổi hệ skill, sự kiện ----------
  moldBreaker: { vi: 'Phá khuôn', hooks: [flag('ignoresTargetAbility')] },
  turboblaze: { vi: 'Lửa cuồng phong', kind: 'rare', hooks: [flag('ignoresTargetAbility')] },
  teravolt: { vi: 'Điện tera', kind: 'rare', hooks: [flag('ignoresTargetAbility')] },
  myceliumMight: { vi: 'Sức mạnh sợi nấm', hooks: [flag('ignoresTargetAbility')] },
  magicBounce: { vi: 'Phản phép', kind: 'rare', hooks: [flag('bouncesStatusMoves')] },
  stickyHold: { vi: 'Bám dính', hooks: [flag('keepsItems')] },
  skillLink: { vi: 'Liên hoàn', hooks: [flag('maxHits')] },
  shieldDust: { vi: 'Bụi khiên', hooks: [flag('blocksSecondaryEffects')] },
  unseenFist: { vi: 'Quyền vô ảnh', kind: 'rare', hooks: [flag('contactIgnoresProtect')] },
  stalwart: { vi: 'Vững vàng', hooks: [flag('ignoresRedirect')] },
  propellerTail: { vi: 'Đuôi chân vịt', hooks: [flag('ignoresRedirect')] },
  unaware: { vi: 'Vô tri', hooks: [flag('ignoresOpponentStages')] },
  infiltrator: { vi: 'Lẻn qua màn chắn', hooks: [flag('ignoresScreens')] },
  scrappy: { vi: 'Liều mạng', hooks: [hook('hitsImmune', { elementIds: ['normal', 'fighting'] })] },
  pixilate: { vi: 'Tiên hóa', hooks: [convert(['normal'], 'fairy')] },
  aerilate: { vi: 'Không hóa', hooks: [convert(['normal'], 'flying')] },
  refrigerate: { vi: 'Băng hóa', hooks: [convert(['normal'], 'ice')] },
  galvanize: { vi: 'Điện hóa thân', hooks: [convert(['normal'], 'electric')] },
  dragonize: { vi: 'Long hóa', hooks: [convert(['normal'], 'dragon')] },
  normalize: {
    vi: 'Thường hóa',
    hooks: [
      convert(
        ELEMENT_IDS.filter((id) => id !== 'normal'),
        'normal'
      )
    ]
  },
  rattled: {
    vi: 'Hoảng sợ',
    hooks: [
      trigger('damaged', [selfStage(['speed'], 1)], { when: hitBy(['bug', 'ghost', 'dark']) })
    ]
  },
  rivalry: {
    vi: 'Kình địch',
    hooks: [
      dealtWhen(25, [{ if: 'not', condition: { if: 'oppositeGender', who: 'target' } }]),
      dealtWhen(-25, [{ if: 'oppositeGender', who: 'target' }])
    ]
  },
  unburden: {
    vi: 'Trút gánh',
    hooks: [
      hook('statWhen', { percent: { speed: 100 }, when: [{ if: 'consumedItem', who: 'self' }] })
    ]
  },
  beastBoost: {
    vi: 'Thú tăng cường',
    kind: 'rare',
    hooks: [trigger('kill', [selfStage('highest', 1)])]
  },
  harvest: {
    vi: 'Thu hoạch',
    hooks: [
      trigger('turnEnd', [{ do: 'recycleItem', to: 'self', chance: 50 }], {
        when: [{ if: 'not', condition: weather(['sun']) }]
      }),
      trigger('turnEnd', [{ do: 'recycleItem', to: 'self' }], { when: [weather(['sun'])] })
    ]
  },
  berserk: { vi: 'Nổi điên', hooks: [onceAtHalf([selfStage(['spAttack'], 1)])] },
  angerShell: {
    vi: 'Vỏ phẫn nộ',
    hooks: [
      onceAtHalf([
        selfStage(['attack', 'spAttack', 'speed'], 1),
        selfStage(['defense', 'spDefense'], -1)
      ])
    ]
  },
  angerPoint: {
    vi: 'Điểm giận',
    hooks: [trigger('damaged', [selfStage(['attack'], 12)], { when: [{ if: 'critical' }] })]
  },
  soulHeart: {
    vi: 'Trái tim linh hồn',
    kind: 'rare',
    hooks: [hook('trigger', { on: 'faint', scope: 'any', effects: [selfStage(['spAttack'], 1)] })]
  },
  cottonDown: {
    vi: 'Bông xốp',
    hooks: [trigger('damaged', [{ do: 'stage', to: 'foes', stats: ['speed'], delta: -1 }])]
  },
  quickDraw: { vi: 'Rút nhanh', hooks: [hook('actFirstChance', { chance: 30 })] },
  fairyAura: { vi: 'Hào quang tiên', kind: 'rare', hooks: fieldAura('fairy') },
  darkAura: { vi: 'Hào quang bóng tối', kind: 'rare', hooks: fieldAura('dark') },
  // Aura Break: có Fairy / Dark Aura trên sân thì đòn hệ đó ×0,75 thay vì ×1,33 (hào quang kia tắt).
  auraBreak: {
    vi: 'Phá hào quang',
    kind: 'rare',
    hooks: ['fairy', 'dark'].flatMap((elementId) =>
      ['side', 'foes'].map((scope) =>
        hook('aura', {
          scope,
          when: [{ if: 'abilityOnField', abilityIds: [`${elementId}Aura`] }],
          hooks: [elementDealt([elementId], -25)]
        })
      )
    )
  },
  guardDog: { vi: 'Chó canh', hooks: [hook('anchored')] },
  sandSpit: {
    vi: 'Phun cát',
    hooks: [trigger('damaged', [{ do: 'placeField', fieldId: 'sandstorm' }])]
  },
  seedSower: {
    vi: 'Gieo hạt',
    hooks: [trigger('damaged', [{ do: 'placeField', fieldId: 'grassyTerrain' }])]
  },
  toxicDebris: {
    vi: 'Mảnh vụn độc',
    hooks: [trigger('attacked', [{ do: 'placeSideField', side: 'foe', fieldId: 'toxicSpikes' }])]
  },
  honeyGather: { vi: 'Hái mật', hooks: [hook('extraDropChance', { percent: 5 })] },
  leafGuard: {
    vi: 'Lá chắn',
    hooks: [hook('debuffImmunity', { when: [weather(['sun'])] })]
  },
  protean: {
    vi: 'Đa hình',
    kind: 'rare',
    hooks: [
      trigger('attack', [{ do: 'identity', to: 'self', elementFromSkill: true }], {
        oncePerBattle: true
      }),
      trigger('cast', [{ do: 'identity', to: 'self', elementFromSkill: true }], {
        oncePerBattle: true
      })
    ]
  },
  libero: {
    vi: 'Tự do',
    kind: 'rare',
    hooks: [
      trigger('attack', [{ do: 'identity', to: 'self', elementFromSkill: true }], {
        oncePerBattle: true
      }),
      trigger('cast', [{ do: 'identity', to: 'self', elementFromSkill: true }], {
        oncePerBattle: true
      })
    ]
  },
  // ---------- Đợt 3 (2026-10-30) ----------
  damp: { vi: 'Ẩm ướt', hooks: [flag('blocksSelfFaint')] },
  goodAsGold: { vi: 'Quý như vàng', kind: 'rare', hooks: [flag('blocksStatusMoves')] },
  stakeout: {
    vi: 'Mai phục',
    hooks: [
      dealtWhen(100, [
        { if: 'counterBelow', counter: { of: 'turnsOnField', who: 'target' }, max: 1 }
      ])
    ]
  },
  magnetPull: {
    vi: 'Nam châm hút',
    hooks: [hook('aura', { scope: 'foes', hooks: [hook('trapped', { elementIds: ['steel'] })] })]
  },
  liquidVoice: {
    vi: 'Giọng nước',
    hooks: [hook('convertSkillElement', { moveFlags: ['sound'], toElementId: 'water', percent: 0 })]
  },
  heavyMetal: { vi: 'Kim loại nặng', hooks: [hook('weightMultiplier', { multiplier: 2 })] },
  lightMetal: { vi: 'Kim loại nhẹ', hooks: [hook('weightMultiplier', { multiplier: 0.5 })] },
  receiver: {
    vi: 'Tiếp nhận',
    hooks: [
      hook('trigger', {
        on: 'faint',
        scope: 'allies',
        effects: [{ do: 'setAbility', to: 'self', from: 'subject' }]
      })
    ]
  },
  powerOfAlchemy: {
    vi: 'Sức mạnh giả kim',
    hooks: [
      hook('trigger', {
        on: 'faint',
        scope: 'allies',
        effects: [{ do: 'setAbility', to: 'self', from: 'subject' }]
      })
    ]
  },
  synchronize: {
    vi: 'Đồng bộ',
    hooks: [
      trigger('statusGained', [
        {
          do: 'moveStatuses',
          from: 'self',
          to: 'other',
          copy: true,
          kind: 'debuff',
          statusIds: ['burn', 'paralysis', 'poison', 'badPoison']
        }
      ])
    ]
  },
  earlyBird: {
    vi: 'Dậy sớm',
    hooks: [hook('statusDuration', { statusIds: ['sleep'], on: 'received', turns: 1 })]
  },
  // Không có tác dụng trong game: chỉ thông tin (Frisk, Forewarn, Ball Fetch), dạng đã là loài
  // riêng (Multitype, RKS System), theo PP mà game không có (Pressure).
  // `pokeapiId`: id trait trùng trait race khác nghĩa thì ability dùng id riêng (bí danh ở
  // pokemon-abilities-import.mjs `ABILITY_ALIASES`).
  frisk: { vi: 'Dò xét', hooks: [], noBattleEffect: true },
  forewarn: { vi: 'Linh cảm', hooks: [], noBattleEffect: true },
  ballFetch: { vi: 'Nhặt bóng', hooks: [], noBattleEffect: true },
  multitype: { vi: 'Đa dạng', kind: 'rare', hooks: [], noBattleEffect: true },
  rksSystem: { vi: 'Hệ thống RKS', kind: 'rare', hooks: [], noBattleEffect: true },
  pressure: { vi: 'Áp lực', hooks: [], noBattleEffect: true },
  // ---------- Đợt 4 (2026-10-30) ----------
  grassPelt: {
    vi: 'Lông cỏ',
    hooks: [hook('statWhen', { percent: { defense: 50 }, when: [terrain(['grassyTerrain'])] })]
  },
  colorChange: {
    vi: 'Đổi màu',
    hooks: [trigger('damaged', [{ do: 'identity', to: 'self', elementFromSkill: true }])]
  },
  hospitality: {
    vi: 'Hiếu khách',
    hooks: [
      trigger('entry', [
        { do: 'heal', to: 'allies', amount: { hp: 'max', of: 'target', percent: 25 } }
      ])
    ]
  },
  innardsOut: {
    vi: 'Lộn ruột',
    hooks: [
      trigger('faint', [{ do: 'damage', to: 'other', amount: { event: true, percent: 100 } }])
    ]
  },
  poisonPuppeteer: {
    vi: 'Rối độc',
    kind: 'rare',
    hooks: [
      trigger('statusInflicted', [{ do: 'status', to: 'other', statusId: 'confusion' }], {
        statusIds: ['poison', 'badPoison']
      })
    ]
  },
  electromorphosis: {
    vi: 'Điện hóa thân thể',
    hooks: [trigger('damaged', [{ do: 'status', to: 'self', statusId: 'charged' }])]
  },
  windPower: {
    vi: 'Phong điện',
    hooks: [
      trigger('damagedAny', [{ do: 'status', to: 'self', statusId: 'charged' }], {
        when: flagged(['wind'])
      })
    ]
  },
  galeWings: {
    vi: 'Cánh cuồng phong',
    hooks: [hook('conditionalPriority', { amount: 1, elementIds: ['flying'], fullHp: true })]
  },
  triage: {
    vi: 'Phân loại cấp cứu',
    hooks: [hook('conditionalPriority', { amount: 3, healing: true })]
  },
  queenlyMajesty: { vi: 'Uy nghi nữ hoàng', hooks: [flag('blocksPriorityMoves')] },
  dazzling: { vi: 'Chói lóa', hooks: [flag('blocksPriorityMoves')] },
  armorTail: { vi: 'Đuôi giáp', hooks: [flag('blocksPriorityMoves')] },
  neutralizingGas: { vi: 'Khí trung hòa', kind: 'rare', hooks: [flag('suppressesAbilities')] },
  klutz: { vi: 'Vụng về', hooks: [flag('ignoresOwnItems')] },
  liquidOoze: { vi: 'Dịch nhầy độc', hooks: [flag('drainHurts')] },
  wonderSkin: { vi: 'Da kỳ diệu', hooks: [flag('halvesStatusAccuracy')] },
  screenCleaner: { vi: 'Lau màn chắn', hooks: [trigger('entry', [{ do: 'clearScreens' }])] },
  protosynthesis: {
    vi: 'Quang hợp cổ đại',
    kind: 'rare',
    hooks: [
      hook('highestStatBoost', {
        percent: 30,
        speedPercent: 50,
        when: [weather(['sun']), notBoosted]
      })
    ]
  },
  quarkDrive: {
    vi: 'Động cơ quark',
    kind: 'rare',
    hooks: [
      hook('highestStatBoost', {
        percent: 30,
        speedPercent: 50,
        when: [terrain(['electricTerrain']), notBoosted]
      })
    ]
  },

  // ---------- Sửa ability có sẵn cho đúng gốc (2026-10-30) ----------
  sturdy: {
    vi: 'Cứng cáp',
    exclusiveGroup: 'toughness',
    hooks: [hook('surviveLethal', { fromFullHp: true })]
  },
  sapSipper: { vi: 'Ăn cỏ', kind: 'rare', hooks: [absorb(['grass'], 'attack', 1)] },
  staminaAbility: {
    pokeapiId: 'stamina',
    vi: 'Gan chịu đựng',
    hooks: [trigger('damaged', [selfStage(['defense'], 1)])]
  },
  steadfast: {
    vi: 'Kiên định',
    hooks: [trigger('statusGained', [selfStage(['speed'], 1)], { when: statusWhen(['flinch']) })]
  },
  telepathyAbility: {
    pokeapiId: 'telepathy',
    vi: 'Thần giao cách cảm',
    hooks: [takenWhen(-100, [{ if: 'sameSide', who: 'other' }])]
  },
  hydration: {
    vi: 'Bù nước',
    hooks: [
      trigger('turnEnd', [{ do: 'cure', to: 'self', kind: 'debuff', statusIds: MAJOR }], {
        when: [weather(['rain'])]
      })
    ]
  },
  anticipation: { vi: 'Đón trước', hooks: [], noBattleEffect: true },
  // Schooling: từ level 20, còn trên 25% máu thì thành dạng đàn (vào sân, cuối lượt).
  schoolingAbility: {
    pokeapiId: 'schooling',
    vi: 'Họp đàn',
    hooks: [
      ...onEvents(['entry', 'turnEnd'], [toForm({ wishiwashi: 'wishiwashiSchool' })], {
        when: [hpAbove(25), { if: 'levelAtLeast', who: 'self', level: 20 }]
      }),
      ...onEvents(['entry', 'turnEnd'], [REVERT], {
        when: [{ if: 'not', condition: hpAbove(25) }]
      })
    ]
  },
  mimicryAbility: {
    pokeapiId: 'mimicry',
    vi: 'Mô phỏng địa hình',
    // Như Pokémon: đổi hệ ngay khi vào sân / địa hình đổi, hết địa hình thì về hệ cũ.
    hooks: ['entry', 'fieldChanged'].flatMap((on) => [
      ...MIMICRY_TERRAINS.map(([fieldId, elementId]) =>
        trigger(on, [{ do: 'identity', to: 'self', elementIds: [elementId] }], {
          when: [terrain([fieldId])]
        })
      ),
      trigger(on, [{ do: 'identity', to: 'self', restoreElements: true }], {
        when: [{ if: 'not', condition: terrain(MIMICRY_TERRAINS.map(([fieldId]) => fieldId)) }]
      })
    ])
  },
  badDreams: {
    vi: 'Mơ xấu',
    kind: 'rare',
    hooks: [
      trigger('turnEnd', [
        {
          do: 'damage',
          to: 'foes',
          amount: { hp: 'max', of: 'target', percent: 12.5 },
          if: [{ if: 'hasStatus', who: 'target', statusIds: ['sleep'] }]
        }
      ])
    ]
  },
  hustle: {
    vi: 'Hăng hái',
    hooks: [
      hook('statModifier', { percent: { attack: 50 } }),
      hook('accuracyModifier', { percent: -20 })
    ]
  },
  solarPower: {
    vi: 'Năng lượng mặt trời',
    hooks: [
      hook('statModifierInWeather', { weatherIds: ['sun'], percent: { spAttack: 50 } }),
      trigger(
        'turnEnd',
        [{ do: 'damage', to: 'self', amount: { hp: 'max', of: 'self', percent: 12.5 } }],
        { when: [weather(['sun'])] }
      )
    ]
  },
  rainDish: {
    vi: 'Hứng mưa',
    hooks: [hook('regenInWeather', { weatherIds: ['rain'], percent: 6.25 })]
  },
  shedSkin: { vi: 'Lột da', hooks: [hook('turnEndCureStatus', { chance: 33 })] },
  regenerator: { vi: 'Tái sinh', hooks: [hook('healOnLeave', { percent: 33.33 })] },
  insomnia: { vi: 'Mất ngủ', hooks: [immune('sleep', 'drowsy')] },
  simple: { vi: 'Đơn giản', hooks: [hook('stageMultiplier', { gain: 2, loss: 2 })] },
  justified: {
    vi: 'Chính nghĩa',
    hooks: [trigger('damaged', [selfStage(['attack'], 1)], { when: hitBy(['dark']) })]
  },
  steamEngine: {
    vi: 'Động cơ hơi nước',
    hooks: [trigger('damaged', [selfStage(['speed'], 6)], { when: hitBy(['fire', 'water']) })]
  },
  waterCompaction: {
    vi: 'Nén nước',
    hooks: [trigger('damaged', [selfStage(['defense'], 2)], { when: hitBy(['water']) })]
  },
  weakArmor: {
    vi: 'Giáp yếu',
    hooks: [trigger('attacked', [selfStage(['defense'], -1), selfStage(['speed'], 2)])]
  },
  moody: {
    vi: 'Thất thường',
    hooks: [trigger('turnEnd', [selfStage('random', 2), selfStage('random', -1)])]
  },

  // ---------- Khi chạm / khi đánh ----------
  ironBarbs: {
    vi: 'Gai sắt',
    hooks: [hook('retaliateDamage', { category: 'physical', percentOfAttackerMaxHp: 12.5 })]
  },
  aftermath: {
    vi: 'Dư chấn',
    hooks: [hook('retaliateOnKnockout', { percentOfAttackerMaxHp: 25 })]
  },
  cuteCharm: {
    vi: 'Duyên dáng',
    hooks: [
      hook('onHitApplyStatus', {
        category: 'physical',
        statuses: [{ statusId: 'infatuated', chance: 30 }]
      })
    ]
  },
  poisonTouch: {
    vi: 'Chạm độc',
    hooks: [
      hook('onAttackApplyStatus', {
        category: 'physical',
        statuses: [{ statusId: 'poison', chance: 30 }]
      })
    ]
  },
  toxicChain: {
    vi: 'Xích độc',
    hooks: [
      hook('onAttackApplyStatus', {
        category: 'any',
        statuses: [{ statusId: 'badPoison', chance: 30 }]
      })
    ]
  },
  stench: {
    vi: 'Mùi hôi',
    hooks: [
      hook('onAttackApplyStatus', {
        category: 'any',
        statuses: [{ statusId: 'flinch', chance: 10 }]
      })
    ]
  },
  gooey: {
    vi: 'Nhầy nhụa',
    hooks: [trigger('attacked', [{ do: 'stage', to: 'other', stats: ['speed'], delta: -1 }])]
  },
  tanglingHair: {
    vi: 'Tóc rối',
    hooks: [trigger('attacked', [{ do: 'stage', to: 'other', stats: ['speed'], delta: -1 }])]
  },
  spicySpray: {
    vi: 'Xịt cay',
    hooks: [trigger('damaged', [{ do: 'status', to: 'other', statusId: 'burn' }])]
  },
  cursedBody: {
    vi: 'Thân bị nguyền',
    hooks: [trigger('damaged', [{ do: 'disableSkill', to: 'other', turns: 4, chance: 30 }])]
  },
  mummy: {
    vi: 'Xác ướp',
    hooks: [trigger('attacked', [{ do: 'setAbility', to: 'other', abilityId: 'mummy' }])]
  },
  lingeringAroma: {
    vi: 'Hương dai dẳng',
    hooks: [trigger('attacked', [{ do: 'setAbility', to: 'other', abilityId: 'lingeringAroma' }])]
  },
  wanderingSpirit: {
    vi: 'Hồn lang thang',
    hooks: [trigger('attacked', [{ do: 'swapAbilities', with: 'other' }])]
  },
  pickpocket: {
    vi: 'Móc túi',
    hooks: [trigger('attacked', [{ do: 'takeItems', from: 'other', to: 'self' }])]
  },
  magician: {
    vi: 'Ảo thuật gia',
    hooks: [trigger('attack', [{ do: 'takeItems', from: 'other', to: 'self' }])]
  },

  // ---------- Vào sân, cuối lượt ----------
  grassySurge: {
    vi: 'Sóng cỏ',
    hooks: [hook('setFieldOnEntry', { layer: 'terrain', fieldId: 'grassyTerrain' })]
  },
  electricSurge: {
    vi: 'Sóng điện',
    hooks: [hook('setFieldOnEntry', { layer: 'terrain', fieldId: 'electricTerrain' })]
  },
  psychicSurge: {
    vi: 'Sóng tâm linh',
    hooks: [hook('setFieldOnEntry', { layer: 'terrain', fieldId: 'psychicTerrain' })]
  },
  mistySurge: {
    vi: 'Sóng sương',
    hooks: [hook('setFieldOnEntry', { layer: 'terrain', fieldId: 'mistyTerrain' })]
  },
  primordialSea: {
    vi: 'Biển nguyên thủy',
    kind: 'rare',
    hooks: [hook('setFieldOnEntry', { layer: 'weather', fieldId: 'heavyRain' })]
  },
  desolateLand: {
    vi: 'Đất hoang tàn',
    kind: 'rare',
    hooks: [hook('setFieldOnEntry', { layer: 'weather', fieldId: 'harshSunlight' })]
  },
  deltaStream: {
    vi: 'Dòng delta',
    kind: 'rare',
    hooks: [hook('setFieldOnEntry', { layer: 'weather', fieldId: 'mysteriousWinds' })]
  },
  orichalcumPulse: {
    vi: 'Nhịp Orichalcum',
    kind: 'rare',
    hooks: [
      hook('setFieldOnEntry', { layer: 'weather', fieldId: 'sun' }),
      hook('statModifierInWeather', { weatherIds: ['sun'], percent: { attack: 33 } })
    ]
  },
  hadronEngine: {
    vi: 'Động cơ Hadron',
    kind: 'rare',
    hooks: [
      hook('setFieldOnEntry', { layer: 'terrain', fieldId: 'electricTerrain' }),
      hook('terrainStatModifier', { terrainIds: ['electricTerrain'], percent: { spAttack: 33 } })
    ]
  },
  trace: {
    vi: 'Sao chép',
    hooks: [trigger('entry', [{ do: 'setAbility', to: 'self', from: 'randomFoe' }])]
  },
  imposter: {
    vi: 'Kẻ mạo danh',
    kind: 'rare',
    hooks: [trigger('entry', [{ do: 'transformInto', to: 'self', from: 'randomFoe' }])]
  },
  costar: {
    vi: 'Bạn diễn',
    hooks: [trigger('entry', [{ do: 'copyStages', to: 'self', from: 'randomAlly' }])]
  },
  curiousMedicine: {
    vi: 'Thuốc lạ',
    hooks: [trigger('entry', [{ do: 'restoreStages', to: 'allies', all: true }])]
  },
  healer: {
    vi: 'Thầy thuốc',
    hooks: [
      trigger('turnEnd', [
        { do: 'cure', to: 'allies', kind: 'debuff', statusIds: MAJOR, chance: 30 }
      ])
    ]
  },
  shadowTag: {
    vi: 'Giẫm bóng',
    kind: 'rare',
    hooks: [hook('aura', { scope: 'foes', hooks: [hook('trapped')] })]
  },
  arenaTrap: { vi: 'Bẫy cát', hooks: [hook('aura', { scope: 'foes', hooks: [hook('trapped')] })] },
  tabletsOfRuin: { vi: 'Thẻ tai ương', kind: 'rare', hooks: [ruin('attack')] },
  swordOfRuin: { vi: 'Kiếm tai ương', kind: 'rare', hooks: [ruin('defense')] },
  vesselOfRuin: { vi: 'Đỉnh tai ương', kind: 'rare', hooks: [ruin('spAttack')] },
  beadsOfRuin: { vi: 'Ngọc tai ương', kind: 'rare', hooks: [ruin('spDefense')] },

  // ---------- Đổi dạng trong trận (docs/rules/battle-forms.md) ----------
  forecast: {
    vi: 'Dự báo thời tiết',
    hooks: [
      ...FORECAST.flatMap(([weatherId, formId]) =>
        onEvents(FIELD_EVENTS, [toForm({ castform: formId }, { untilLeave: true })], {
          when: [weather([weatherId])]
        })
      ),
      ...onEvents(FIELD_EVENTS, [REVERT], {
        when: [{ if: 'not', condition: weather(FORECAST.map(([weatherId]) => weatherId)) }]
      })
    ]
  },
  flowerGift: {
    vi: 'Quà của hoa',
    hooks: [
      hook('aura', {
        scope: 'side',
        hooks: [
          hook('statModifierInWeather', {
            weatherIds: ['sun'],
            percent: { attack: 50, spDefense: 50 }
          })
        ]
      }),
      ...onEvents(FIELD_EVENTS, [toForm({ cherrim: 'cherrimSunshine' }, { untilLeave: true })], {
        when: [weather(['sun'])]
      }),
      ...onEvents(FIELD_EVENTS, [REVERT], { when: [{ if: 'not', condition: weather(['sun']) }] })
    ]
  },
  zenMode: {
    vi: 'Chế độ thiền',
    hooks: [
      trigger(
        'turnEnd',
        [
          toForm(
            { darmanitan: 'darmanitanZen', darmanitanGalar: 'darmanitanGalarZen' },
            { untilLeave: true }
          )
        ],
        { when: [hpBelow(50)] }
      ),
      trigger('turnEnd', [REVERT], { when: [hpAbove(50)] })
    ]
  },
  stanceChange: {
    vi: 'Đổi thế',
    hooks: [
      hook('formOnSkill', {
        forms: { aegislash: 'aegislashBlade' },
        revertSkillIds: ['kingsShield']
      })
    ]
  },
  shieldsDown: {
    vi: 'Hạ khiên',
    hooks: [
      ...onEvents(['entry', 'turnEnd'], [toForm({ minior: 'miniorMeteor' })], {
        when: [hpAbove(50)]
      }),
      ...onEvents(['entry', 'turnEnd'], [REVERT], { when: [hpBelow(50)] }),
      // Dạng Meteor miễn trạng thái chính và buồn ngủ.
      hook('aura', {
        scope: 'side',
        receiverWhen: [inForm(['miniorMeteor'])],
        hooks: [immune(...MAJOR, 'drowsy')]
      })
    ]
  },
  iceFace: {
    vi: 'Mặt băng',
    hooks: [
      hook('disguise', {
        forms: { eiscue: 'eiscueNoice' },
        categories: ['physical'],
        hpCostPercent: 0
      }),
      ...onEvents(['entry', 'fieldChanged'], [REVERT], {
        when: [weather(['snow']), inForm(['eiscueNoice'])]
      })
    ]
  },
  disguiseAbility: {
    pokeapiId: 'disguise',
    vi: 'Lớp ngụy trang',
    kind: 'rare',
    hooks: [
      hook('disguise', {
        forms: { mimikyu: 'mimikyuBusted', mimikyuTotem: 'mimikyuBustedTotem' },
        categories: ['physical', 'special'],
        hpCostPercent: 12.5
      })
    ]
  },
  gulpMissile: {
    vi: 'Tên lửa nuốt chửng',
    hooks: [
      ...['attack', 'cast'].flatMap((on) => [
        trigger(on, [toForm({ cramorant: 'cramorantGulping' })], {
          when: [{ if: 'skill', skillIds: ['surf', 'dive'] }, hpAbove(50)]
        }),
        trigger(on, [toForm({ cramorant: 'cramorantGorging' })], {
          when: [{ if: 'skill', skillIds: ['surf', 'dive'] }, hpBelow(50)]
        })
      ]),
      trigger(
        'damaged',
        [
          { do: 'damage', to: 'other', amount: { hp: 'max', of: 'other', percent: 25 } },
          { do: 'stage', to: 'other', stats: ['defense'], delta: -1 },
          REVERT
        ],
        { when: [inForm(['cramorantGulping'])] }
      ),
      trigger(
        'damaged',
        [
          { do: 'damage', to: 'other', amount: { hp: 'max', of: 'other', percent: 25 } },
          { do: 'status', to: 'other', statusId: 'paralysis' },
          REVERT
        ],
        { when: [inForm(['cramorantGorging'])] }
      )
    ]
  },
  hungerSwitch: {
    vi: 'Chuyển đói',
    hooks: [
      trigger('turnEnd', [toForm({ morpeko: 'morpekoHangry' }, { toggle: true, untilLeave: true })])
    ]
  },
  battleBond: {
    vi: 'Mối liên kết',
    kind: 'rare',
    // Greninja có Battle Bond là dạng riêng (Greninja Bond, như Showdown).
    hooks: [trigger('kill', [toForm({ greninjaBond: 'greninjaAsh' })])]
  },
  powerConstruct: {
    vi: 'Cấu trúc sức mạnh',
    kind: 'rare',
    hooks: [
      trigger(
        'turnEnd',
        [toForm({ zygarde: 'zygardeComplete', zygarde10Percent: 'zygardeComplete' })],
        { when: [hpBelow(50)] }
      )
    ]
  },
  zeroToHero: {
    vi: 'Từ số không thành anh hùng',
    kind: 'rare',
    hooks: [hook('formOnLeave', { forms: { palafin: 'palafinHero' } })]
  },
  commander: {
    vi: 'Chỉ huy',
    hooks: ['self', 'allies'].map((scope) =>
      hook('trigger', {
        on: 'entry',
        scope,
        effects: [{ do: 'command', partnerSpeciesIds: ['dondozo'], stages: 2 }]
      })
    )
  },
  teraShift: {
    vi: 'Chuyển Tera',
    kind: 'rare',
    hooks: [
      // Tera → Stellar theo loài (teraFormId của Terapagos Terastal, battle-forms-import.mjs).
      trigger('entry', [toForm({ terapagos: 'terapagosTerastal' })])
    ]
  },
  // Embody Aspect: Ogerpon đã Tera (dạng Tera có ability này) +1 bậc theo mặt nạ mỗi lần vào sân.
  ...Object.fromEntries(
    [
      ['Teal', 'Hiện thân (Ngọc lam)', 'speed'],
      ['Hearthflame', 'Hiện thân (Lò lửa)', 'attack'],
      ['Wellspring', 'Hiện thân (Suối nguồn)', 'spDefense'],
      ['Cornerstone', 'Hiện thân (Đá tảng)', 'defense']
    ].map(([mask, vi, stat]) => [
      `embodyAspect${mask}`,
      {
        vi,
        kind: 'rare',
        hooks: [
          trigger('entry', [selfStage([stat], 1)]),
          trigger('transformed', [selfStage([stat], 1)], {
            when: [{ if: 'transformed', who: 'self', kinds: ['tera'] }]
          })
        ]
      }
    ])
  ),
  teraShell: {
    vi: 'Vỏ Tera',
    kind: 'rare',
    hooks: [hook('effectivenessCapAtFullHp', { cap: 0.5 })]
  },
  teraformZero: {
    vi: 'Tera hóa số không',
    kind: 'rare',
    hooks: [
      trigger('transformed', [{ do: 'clearFields', layers: ['weather', 'terrain'] }], {
        when: [{ if: 'transformed', who: 'self', kinds: ['tera'] }]
      })
    ]
  },
  illusion: {
    vi: 'Ảo ảnh',
    kind: 'rare',
    hooks: [
      trigger('entry', [{ do: 'illusion' }]),
      trigger('damaged', [{ do: 'illusion', end: true }], {
        when: [{ if: 'category', categories: ['physical', 'special'] }]
      })
    ]
  },

  // ---------- Thời tiết, chỉ số địch, berry ----------
  cloudNine: { vi: 'Chín tầng mây', hooks: [flag('suppressesWeather')] },
  airLock: { vi: 'Khóa khí', kind: 'rare', hooks: [flag('suppressesWeather')] },
  megaSol: { vi: 'Mặt trời Mega', kind: 'rare', hooks: [flag('actsInSun')] },
  download: {
    vi: 'Tải xuống',
    hooks: [
      trigger('entry', [selfStage(['attack'], 1)], {
        when: [{ if: 'foeStatSumLower', stat: 'defense', than: 'spDefense' }]
      }),
      trigger('entry', [selfStage(['spAttack'], 1)], {
        when: [
          { if: 'not', condition: { if: 'foeStatSumLower', stat: 'defense', than: 'spDefense' } }
        ]
      })
    ]
  },
  unnerve: { vi: 'Gây căng thẳng', hooks: [flag('blocksFoeBerries')] },
  ripen: { vi: 'Chín mọng', hooks: [flag('ripensBerries')] },
  gluttonyAbility: { pokeapiId: 'gluttony', vi: 'Tham ăn', hooks: [flag('eatsBerriesEarly')] },
  symbiosis: { vi: 'Cộng sinh', hooks: [flag('passesItemToAlly')] },
  cheekPouch: {
    vi: 'Túi má',
    hooks: [
      trigger('berryEaten', [
        { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 33.33 } }
      ])
    ]
  },
  cudChew: {
    vi: 'Nhai lại',
    hooks: [trigger('berryEaten', [{ do: 'markVolatile', mark: 'cudChew' }])]
  },

  // ---------- Khác ----------
  flowerVeil: {
    vi: 'Màn hoa',
    hooks: [
      hook('aura', {
        scope: 'side',
        receiverWhen: [{ if: 'element', who: 'self', elementIds: ['grass'] }],
        hooks: [noLower('all'), immune(...MAJOR, 'drowsy')]
      })
    ]
  },
  dancer: {
    vi: 'Vũ công',
    hooks: ['attack', 'cast'].map((on) =>
      hook('trigger', {
        on,
        scope: 'any',
        when: [
          { if: 'moveFlag', flags: ['dance'] },
          { if: 'notSelf', who: 'subject' },
          { if: 'reactive', value: false }
        ],
        effects: [{ do: 'cast', to: 'randomFoe', sameSkill: true }]
      })
    )
  },
  longReach: { vi: 'Tầm xa', hooks: [flag('noContact')] },
  mirrorArmor: { vi: 'Giáp gương', kind: 'rare', hooks: [flag('reflectsStatDrops')] },
  wimpOut: {
    vi: 'Nhát gan',
    hooks: [trigger('damagedAny', [{ do: 'retreat', to: 'self' }], { when: [hpFellBelow(50)] })]
  },
  emergencyExit: {
    vi: 'Thoát hiểm',
    hooks: [trigger('damagedAny', [{ do: 'retreat', to: 'self' }], { when: [hpFellBelow(50)] })]
  },
  perishBody: {
    vi: 'Thân diệt vong',
    hooks: [
      trigger(
        'attacked',
        [
          { do: 'perish', to: 'self', turns: 3 },
          { do: 'perish', to: 'other', turns: 3 }
        ],
        { when: flagged(['contact']) }
      )
    ]
  },
  opportunist: { vi: 'Cơ hội chủ nghĩa', hooks: [flag('copiesFoeBoosts')] },
  corrosionAbility: {
    pokeapiId: 'corrosion',
    vi: 'Ăn mòn hóa học',
    hooks: [flag('ignoresElementStatusImmunity')]
  },
  auraGuard: {
    vi: 'Hào quang hộ thân',
    kind: 'rare',
    hooks: [takenWhen(-50, flagged(['contact']))]
  },
  piercingDrill: { vi: 'Mũi khoan xuyên', kind: 'rare', hooks: [flag('contactPiercesProtect')] },
  eelevate: {
    vi: 'Lươn bay',
    kind: 'rare',
    hooks: [hook('airborne'), trigger('kill', [selfStage('highest', 1)])]
  },
  fireMane: { vi: 'Bờm lửa', kind: 'rare', hooks: [elementDealt(['fire'], 50)] }
}

const [abilityRows, nameRows] = await Promise.all([
  fetchPokeApiCsv('abilities'),
  fetchPokeApiCsv('ability_names')
])
const camel = (identifier) =>
  identifier
    .split('-')
    .map((word, i) => (i === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('')
const idOfRow = new Map(abilityRows.map((row) => [row.id, camel(row.identifier)]))
const english = new Map(
  nameRows
    .filter((row) => row.local_language_id === '9')
    .map((row) => [idOfRow.get(row.ability_id), row.name])
)

// Tên PokeAPI trùng nhau (cả hai dạng As One) thì ghi kèm dạng.
const EN_OVERRIDES = {
  asOneGlastrier: 'As One (Glastrier)',
  asOneSpectrier: 'As One (Spectrier)',
  ...Object.fromEntries(
    ['Teal', 'Hearthflame', 'Wellspring', 'Cornerstone'].map((mask) => [
      `embodyAspect${mask}`,
      `Embody Aspect (${mask})`
    ])
  )
}

const traits = JSON.parse(readFileSync(TRAITS_PATH, 'utf8'))
const names = {
  vi: JSON.parse(readFileSync(I18N('vi'), 'utf8')),
  en: JSON.parse(readFileSync(I18N('en'), 'utf8'))
}
for (const [
  id,
  { vi, kind = 'positive', exclusiveGroup, hooks, noBattleEffect, pokeapiId }
] of Object.entries(ABILITIES)) {
  const trait = {
    id,
    kind,
    ...(exclusiveGroup ? { exclusiveGroup } : {}),
    hooks,
    ...(noBattleEffect ? { noBattleEffect } : {})
  }
  const index = traits.findIndex((t) => t.id === id)
  if (index >= 0) traits[index] = trait
  else traits.push(trait)
  names.vi[id] = vi
  names.en[id] = EN_OVERRIDES[id] ?? english.get(pokeapiId ?? id) ?? id
}
writeFileSync(TRAITS_PATH, JSON.stringify(traits, null, 2) + '\n')
for (const lang of ['vi', 'en'])
  writeFileSync(I18N(lang), JSON.stringify(names[lang], null, 2) + '\n')
console.log(`Đã ghi ${Object.keys(ABILITIES).length} ability`)
