// Dữ liệu test cho hệ thống event (docs/rules/events.md): mỗi loại kết quả một event nhỏ, chuỗi
// event, modifier mẫu. Chỉ `treasure` (khám phá) và `stranger` (thị trấn) có trọng số > 0 để test
// tung event biết trước kết quả; event khác test tự đặt làm event đang chờ (withPendingEvent). Có
// trang bị mẫu (makeEquipmentData) cho kết quả trang bị / chợ đen.

import type {
  EventDef,
  EventModifierDef,
  EventResultDef,
  GameData,
  GameState,
  RawGameData
} from '../model'
import { makeEquipmentData } from './equipmentFixtures'

const r = (type: EventResultDef['type'], params: Record<string, unknown> = {}): EventResultDef => ({
  type,
  params
})

/** Lựa chọn một kết quả chắc chắn. */
const sure = (id: string, results: EventResultDef[]): EventDef['options'][number] => ({
  id,
  outcomes: [{ weight: 1, results }]
})

const leave = sure('leave', [])

/** Event khám phá trọng số 0 (chỉ xuất hiện khi test đặt làm event chờ). */
const explore = (
  id: string,
  options: EventDef['options'],
  extra: Partial<EventDef> = {}
): EventDef => ({
  id,
  group: 'explore',
  weight: 0,
  minFloor: 1,
  options,
  ...extra
})

export const EVENT_TEST_EVENTS: EventDef[] = [
  explore(
    'treasure',
    [
      sure('take', [
        r('giveItems', { items: [{ itemId: 'potion', weight: 1, min: 2, max: 2 }], rolls: 1 }),
        r('giveMoney', { battles: 2 })
      ]),
      leave
    ],
    { weight: 1 }
  ),
  explore('spring', [sure('drink', [r('healParty')])]),
  explore('swamp', [sure('continue', [r('applyStatus', { statusId: 'poison', count: 2 })])]),
  explore('merchant', [
    sure('browse', [
      r('openTempShop', { pool: 'regular', priceMultiplier: 0.5, count: { min: 2, max: 2 } })
    ]),
    leave
  ]),
  explore('market', [
    sure('browse', [r('openTempShop', { pool: 'blackMarket', priceMultiplier: 2 })])
  ]),
  {
    id: 'stranger',
    group: 'town',
    weight: 1,
    minFloor: 1,
    options: [
      sure('browse', [
        r('openTempShop', {
          pool: 'crystal',
          priceMultiplier: 2,
          traitKind: 'rare',
          level: 1,
          count: 1
        })
      ]),
      sure('decline', [])
    ]
  },
  explore('omen', [sure('accept', [r('addModifier', { modifierId: 'lucky' })])]),
  {
    id: 'festival',
    group: 'town',
    weight: 0,
    minFloor: 1,
    options: [sure('visit', [r('addModifier', { modifierId: 'sale' })])]
  },
  explore('bandits', [
    sure('pay', [r('loseMoneyPercent', { percent: 10 })]),
    sure('fight', [
      r('startBattle', {
        kind: 'wild',
        count: 2,
        noFlee: true,
        moneyMultiplier: 3,
        onWin: [
          r('giveItems', { items: [{ itemId: 'potion', weight: 1, min: 1, max: 1 }], rolls: 1 })
        ],
        onLoss: [r('loseMoneyPercent', { percent: 50 })]
      })
    ])
  ]),
  explore('injured', [
    { ...sure('heal', [r('giveMonster')]), costItems: [{ itemId: 'potion', count: 1 }] },
    sure('attack', [
      r('startBattle', { kind: 'wild', count: 1, enemyHpPercent: 30, noFlee: false })
    ])
  ]),
  explore('nest', [sure('steal', [r('giveEgg', { source: 'wild' })])]),
  explore('bossNest', [
    sure('fight', [r('startBattle', { kind: 'boss', noFlee: true, strength: 2 })])
  ]),
  explore('duel', [
    sure('accept', [r('startBattle', { kind: 'trainer', levelOffset: 5, noFlee: true })])
  ]),
  explore('map', [
    sure('read', [r('startChain', { chainId: 'hunt', eventId: 'cave', battles: 2 })])
  ]),
  {
    id: 'cave',
    group: 'chain',
    weight: 0,
    minFloor: 1,
    options: [
      sure('enter', [
        r('startBattle', {
          kind: 'wild',
          count: 1,
          noFlee: true,
          onWin: [r('advanceChain', { eventId: 'hoard', battles: 0 })]
        })
      ]),
      leave
    ]
  },
  {
    id: 'hoard',
    group: 'chain',
    weight: 0,
    minFloor: 1,
    options: [
      sure('open', [
        r('giveMoney', { battles: 10 }),
        r('giveEquipment', { count: 1, rarityWeights: { rare: 1 } })
      ])
    ]
  },
  explore('deep', [leave], { weight: 1, minFloor: 5, biomeIds: ['lair'] }),
  explore('gamble', [
    {
      id: 'try',
      outcomes: [
        { weight: 1, results: [r('giveMoney', { battles: 1 })] },
        { weight: 1, results: [r('loseMoneyPercent', { percent: 50 })] }
      ]
    }
  ])
]

export const EVENT_TEST_MODIFIERS: EventModifierDef[] = [
  {
    id: 'lucky',
    effects: [{ type: 'shinyChancePercent', params: { percent: 400 } }],
    duration: { kind: 'battles', count: 2 }
  },
  {
    id: 'sale',
    effects: [{ type: 'shopPricePercent', params: { percent: -50 } }],
    duration: { kind: 'town' }
  },
  {
    id: 'bloodMoon',
    effects: [{ type: 'bossChancePercent', params: { percent: 900 } }],
    duration: { kind: 'battles', count: 3 }
  },
  {
    id: 'downpour',
    effects: [{ type: 'fixedField', params: { weather: 'rain' } }],
    duration: { kind: 'battles', count: 2 }
  },
  {
    id: 'bounty',
    effects: [
      { type: 'moneyPercent', params: { percent: 100 } },
      { type: 'dropRatePercent', params: { percent: 100 } }
    ],
    duration: { kind: 'battles', count: 1 }
  },
  {
    id: 'lure',
    effects: [{ type: 'eventChancePercent', params: { percent: 100 } }],
    duration: { kind: 'battles', count: 5 }
  }
]

/** Thêm bản sao event / modifier mẫu vào raw (test sửa raw không đổi mẫu dùng chung). */
export function withEventFixtures(raw: RawGameData): void {
  raw.events.push(...structuredClone(EVENT_TEST_EVENTS))
  raw.eventModifiers.push(...structuredClone(EVENT_TEST_MODIFIERS))
}

/** GameData fixture có event mẫu và trang bị mẫu; `edit` sửa raw sau khi thêm event. */
export function makeEventData(edit: (raw: RawGameData) => void = () => {}): GameData {
  return makeEquipmentData((raw) => {
    withEventFixtures(raw)
    edit(raw)
  })
}

/** Đặt event đang chờ (bỏ qua bước tung); floor null = ở thị trấn. */
export function withPendingEvent(
  state: GameState,
  eventId: string,
  { floor = null, chainId = null }: { floor?: number | null; chainId?: string | null } = {}
): GameState {
  return { ...state, events: { ...state.events, pending: { eventId, floor, chainId } } }
}
