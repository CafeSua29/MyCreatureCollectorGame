/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Trạng thái (condition) của Temtem → trạng thái của game (content-sources-real.md mục "Temtem: chiêu, trait").
// Số theo mô tả gốc (temtem-api /conditions). Poisoned của gốc (mất 1/8 HP mỗi lượt, hệ Độc miễn) trùng
// `poison` của game nên dùng lại. Thời hạn gốc do chiêu / trait ghi; `duration` ở đây là mặc định khi không ghi.

const hook = (type, params = {}) => ({ type, params })
const turns = (count) => ({ min: count, max: count })

/** Nhóm loại trừ: Burned xóa Cold / Frozen và ngược lại; Exhausted và Invigorated xóa nhau. */
const HEAT = { exclusiveGroup: 'temtemHeat', overwritesGroup: true }
const VIGOR = { exclusiveGroup: 'temtemVigor', overwritesGroup: true }

/** [id, vi, en, trọng số AI, định nghĩa] cho addStatuses (element-common.mjs). */
export const STATUSES = [
  [
    'asleepTemtem',
    'Ngủ',
    'Asleep',
    0.25,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [hook('skipTurn', { chance: 100 }), hook('endsOnDamage')],
      battleOnly: true,
      // Gốc: tỉnh dậy (cả khi bị đánh) thì Alerted; game chỉ áp khi hết hạn (lệch gốc, content-sources-real.md).
      onEndStatusId: 'alertedTemtem',
      catchMultiplier: 2.5
    }
  ],
  [
    'burnedTemtem',
    'Bỏng',
    'Burned',
    0.2,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [hook('turnEndDamage', { percent: 6.25 })],
      traitHooks: [hook('statModifier', { percent: { attack: -30, spAttack: -30 } })],
      battleOnly: true,
      ...HEAT,
      catchMultiplier: 1.5
    }
  ],
  [
    'coldTemtem',
    'Lạnh',
    'Cold',
    0.1,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [],
      battleOnly: true,
      stacksInto: 'frozenTemtem',
      ...HEAT
    }
  ],
  [
    'frozenTemtem',
    'Đông cứng',
    'Frozen',
    0.25,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [hook('skipTurn', { chance: 100 })],
      battleOnly: true,
      ...HEAT,
      catchMultiplier: 2.5
    }
  ],
  [
    'exhaustedTemtem',
    'Kiệt quệ',
    'Exhausted',
    0.15,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [],
      traitHooks: [hook('staminaCostPercent', { percent: 50 })],
      battleOnly: true,
      ...VIGOR
    }
  ],
  [
    'invigoratedTemtem',
    'Sung sức',
    'Invigorated',
    0.15,
    {
      kind: 'buff',
      duration: turns(2),
      hooks: [],
      traitHooks: [hook('staminaCostPercent', { percent: -50 })],
      battleOnly: true,
      ...VIGOR
    }
  ],
  [
    'isolatedTemtem',
    'Cô lập',
    'Isolated',
    0.05,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [],
      traitHooks: [hook('abilityFlag', { flag: 'blocksSynergy' })],
      battleOnly: true
    }
  ],
  [
    'seizedTemtem',
    'Tịch thu',
    'Seized',
    0.05,
    { kind: 'debuff', duration: turns(2), hooks: [], battleOnly: true, disablesItems: true }
  ],
  [
    'trappedTemtem',
    'Mắc bẫy',
    'Trapped',
    0.1,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [],
      traitHooks: [hook('trapped')],
      battleOnly: true
    }
  ],
  [
    'alertedTemtem',
    'Cảnh giác',
    'Alerted',
    0.05,
    {
      kind: 'buff',
      duration: turns(2),
      hooks: [],
      traitHooks: [hook('statusImmunity', { statusIds: ['asleepTemtem'] })],
      battleOnly: true
    }
  ],
  [
    'regeneratedTemtem',
    'Tái tạo',
    'Regenerated',
    0.2,
    {
      kind: 'buff',
      duration: turns(2),
      hooks: [],
      traitHooks: [hook('regen', { percent: 10 })],
      battleOnly: true
    }
  ],
  [
    'evadingTemtem',
    'Né tránh',
    'Evading',
    0.2,
    {
      kind: 'buff',
      duration: turns(2),
      // Né đòn kế tiếp rồi mất; bị mất máu cũng mất (gốc).
      hooks: [hook('endsOnDamage')],
      traitHooks: [
        hook('dodge', { percent: 100 }),
        hook('trigger', {
          on: 'dodged',
          scope: 'self',
          effects: [{ do: 'cure', to: 'self', kind: 'buff', statusIds: ['evadingTemtem'] }]
        })
      ],
      battleOnly: true
    }
  ],
  [
    'immuneTemtem',
    'Miễn nhiễm',
    'Immune',
    0.15,
    {
      kind: 'buff',
      duration: turns(2),
      hooks: [],
      traitHooks: [
        hook('statusGainBlock', { kind: 'debuff' }),
        hook('statusGainBlock', { kind: 'buff' })
      ],
      battleOnly: true
    }
  ],
  [
    'nullifiedTemtem',
    'Vô hiệu hệ',
    'Nullified',
    0.05,
    {
      kind: 'debuff',
      duration: turns(2),
      hooks: [],
      traitHooks: [hook('effectiveness', { mode: 'neutralTaken' })],
      battleOnly: true
    }
  ],
  [
    'traitSuppressedTemtem',
    'Mất đặc tính',
    'Trait Suppressed',
    0.15,
    // Không phải condition của gốc: hiệu ứng của Intimidator (trait không tác dụng trong 3 lượt đầu quái mang
    // ở trên sân: hết khi quái mang rời sân).
    {
      kind: 'debuff',
      duration: turns(3),
      hooks: [],
      battleOnly: true,
      suppressesAbility: true,
      endsWhenSourceLeaves: true,
      excludeFromRandom: true
    }
  ],
  [
    'gearSuppressedTemtem',
    'Mất trang bị',
    'Gear Suppressed',
    0.1,
    // Hiệu ứng của Frightening: đồ không tác dụng trong 3 lượt đầu quái mang ở trên sân.
    {
      kind: 'debuff',
      duration: turns(3),
      hooks: [],
      battleOnly: true,
      disablesItems: true,
      endsWhenSourceLeaves: true,
      excludeFromRandom: true
    }
  ],
  [
    'inhibitedTemtem',
    'Bị ức chế',
    'Inhibited',
    0.2,
    // Inhibiter: trait không tác dụng tới hết trận (không có thời hạn, không mất khi rời sân).
    {
      kind: 'debuff',
      hooks: [],
      battleOnly: true,
      suppressesAbility: true,
      excludeFromRandom: true
    }
  ],
  [
    'transmogGuardTemtem',
    'Giáp biến hình',
    'Transmog Guard',
    0.05,
    // Striking Transmog: thủ / đặc thủ ×1,3 tới hết lượt.
    {
      kind: 'buff',
      duration: turns(1),
      hooks: [],
      traitHooks: [hook('statModifier', { percent: { defense: 30, spDefense: 30 } })],
      battleOnly: true,
      excludeFromRandom: true
    }
  ],
  [
    'doomedTemtem',
    'Diệt vong',
    'Doomed',
    0.3,
    { kind: 'debuff', duration: turns(4), hooks: [], battleOnly: true, faintsOnEnd: true }
  ]
]

/** Tên trong mô tả wiki (`{{condition|x}}`, chữ thường, cả dạng rút gọn) → id trạng thái của game. */
export const STATUS_ALIASES = {
  asleep: 'asleepTemtem',
  sleep: 'asleepTemtem',
  burn: 'burnedTemtem',
  burned: 'burnedTemtem',
  cold: 'coldTemtem',
  frozen: 'frozenTemtem',
  exhaust: 'exhaustedTemtem',
  exhausted: 'exhaustedTemtem',
  vigor: 'invigoratedTemtem',
  invigorated: 'invigoratedTemtem',
  isolated: 'isolatedTemtem',
  isolation: 'isolatedTemtem',
  seize: 'seizedTemtem',
  seized: 'seizedTemtem',
  trap: 'trappedTemtem',
  trapped: 'trappedTemtem',
  alert: 'alertedTemtem',
  alerted: 'alertedTemtem',
  regenerate: 'regeneratedTemtem',
  regenerated: 'regeneratedTemtem',
  evading: 'evadingTemtem',
  immune: 'immuneTemtem',
  nullify: 'nullifiedTemtem',
  nullified: 'nullifiedTemtem',
  doom: 'doomedTemtem',
  doomed: 'doomedTemtem',
  poison: 'poison',
  poisoned: 'poison'
}

/** Miễn nhiễm theo hệ của gốc: Fire không Burned, Mental không Asleep (Toxic không Poisoned đã có ở `poison`). */
export const ELEMENT_IMMUNITIES = { fire: ['burnedTemtem'], psychic: ['asleepTemtem'] }

/** Mọi trạng thái xấu của Temtem có thể chữa (Neutrality, Splitter, Resistant...). */
export const NEGATIVE = STATUSES.filter(([, , , , def]) => def.kind === 'debuff').map(([id]) => id)
