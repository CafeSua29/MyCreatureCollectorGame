// State event lúc bắt đầu game (docs/rules/events.md).

import type { EventState } from '../model'

/** Không có event chờ, modifier, chuỗi, cửa hàng tạm, thú triều; cửa hàng mở. */
export const newEventState = (): EventState => ({
  pending: null,
  modifiers: [],
  chains: [],
  tempShop: null,
  battle: null,
  beastTide: null,
  shopClosedUntilDay: null
})
