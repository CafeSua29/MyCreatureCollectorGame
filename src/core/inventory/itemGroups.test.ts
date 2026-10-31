// Nhóm vật phẩm (docs/rules/alchemy.md): đếm, bớt theo chồng nhiều nhất trước, thiếu thì lỗi, nguyên
// liệu công thức dạng món / nhóm, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import {
  FIXTURE_CORE_GROUP_ID as GROUP,
  FIXTURE_CORE_IDS,
  dataIssuesAfter,
  expectActionError,
  makeInventory,
  makeRawData
} from '../testing'
import {
  getItemCount,
  groupItemCount,
  recipeInputCount,
  removeGroupItems,
  removeRecipeInput
} from '.'

const data = createGameData(makeRawData())
const [FIRE, WATER] = FIXTURE_CORE_IDS

describe('nhóm vật phẩm', () => {
  it('đếm tổng mọi món của nhóm; nhóm lạ = 0', () => {
    const inventory = makeInventory({ [FIRE]: 2, [WATER]: 3, potion: 9 })
    expect(groupItemCount(data, inventory, GROUP)).toBe(5)
    expect(groupItemCount(data, inventory, 'ghost')).toBe(0)
    expect(groupItemCount(data, makeInventory(), GROUP)).toBe(0)
  })

  it('bớt từ chồng nhiều nhất trước, hết chồng mới sang chồng sau', () => {
    const inventory = makeInventory({ [FIRE]: 2, [WATER]: 3 })
    const once = removeGroupItems(data, inventory, GROUP, 4)
    expect(getItemCount(once, WATER)).toBe(0)
    expect(getItemCount(once, FIRE)).toBe(1)
    expect(getItemCount(inventory, WATER)).toBe(3)
  })

  it('hòa số lượng thì theo thứ tự trong nhóm', () => {
    const next = removeGroupItems(data, makeInventory({ [FIRE]: 2, [WATER]: 2 }), GROUP, 1)
    expect(getItemCount(next, FIRE)).toBe(1)
    expect(getItemCount(next, WATER)).toBe(2)
  })

  it('bớt đúng hết; số cực lớn', () => {
    const big = Number.MAX_SAFE_INTEGER
    const inventory = makeInventory({ [FIRE]: big })
    expect(groupItemCount(data, makeInventory({ [FIRE]: big, [WATER]: big }), GROUP)).toBe(big)
    expect(groupItemCount(data, removeGroupItems(data, inventory, GROUP, big), GROUP)).toBe(0)
  })

  it('lỗi: thiếu thì notEnoughGroupItem; số lượng sai thì malformedAction', () => {
    const inventory = makeInventory({ [FIRE]: 1 })
    expectActionError(() => removeGroupItems(data, inventory, GROUP, 2), 'notEnoughGroupItem', {
      groupId: GROUP,
      have: 1,
      need: 2
    })
    expectActionError(() => removeGroupItems(data, inventory, GROUP, 0), 'malformedAction')
  })

  it('nguyên liệu công thức: món hoặc nhóm', () => {
    const inventory = makeInventory({ [FIRE]: 2, potion: 1 })
    expect(recipeInputCount(data, inventory, { groupId: GROUP, count: 1 })).toBe(2)
    expect(recipeInputCount(data, inventory, { itemId: 'potion', count: 1 })).toBe(1)
    const next = removeRecipeInput(data, inventory, { groupId: GROUP, count: 1 }, 2)
    expect(getItemCount(next, FIRE)).toBe(0)
    expectActionError(
      () => removeRecipeInput(data, inventory, { itemId: 'potion', count: 1 }, 2),
      'notEnoughItem'
    )
  })

  it('kiểm tra dữ liệu: nhóm rỗng, món không tồn tại / không gộp chồng, trùng', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.itemGroups = {
        ...raw.config.itemGroups,
        empty: [],
        ghost: ['nope'],
        twice: [FIRE, FIRE]
      }
    }).join('\n')
    for (const fragment of [
      'config.itemGroups.empty',
      'config.itemGroups.ghost',
      'config.itemGroups.twice bị trùng'
    ]) {
      expect(issues, fragment).toContain(fragment)
    }
  })
})
