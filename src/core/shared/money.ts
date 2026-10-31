// Tiền: giá tính theo level và trừ tiền khi trả (dùng chung cho nghỉ, breed, fuse, học lại skill).

import { toBig, type Decimal } from './big'
import { ActionError } from './errors'

/** Giá = giá mỗi level × tổng level, làm tròn lên (giá lẻ không bao giờ miễn phí). */
export function levelCost(costPerLevel: number, totalLevel: number): Decimal {
  return toBig(costPerLevel).times(totalLevel).ceil()
}

/** Trừ `cost` vào tiền; thiếu tiền thì ném ActionError notEnoughMoney. */
export function spendMoney<T extends { readonly money: Decimal }>(holder: T, cost: Decimal): T {
  if (holder.money.lt(cost)) {
    throw new ActionError('notEnoughMoney', { need: cost, have: holder.money })
  }
  return { ...holder, money: holder.money.minus(cost) }
}
