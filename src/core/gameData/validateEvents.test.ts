// Kiểm tra dữ liệu hệ thống event (docs/rules/events.md): event, lựa chọn, kết quả theo loại,
// modifier, config.events.

import { describe, expect, it } from 'vitest'
import { dataIssues, defined, makeRawData, withEventFixtures, withFixtureText } from '../testing'
import type { EventDef, RawGameData } from '../model'

/** Lỗi dữ liệu sau khi thêm event mẫu rồi sửa (chữ tạo lại cho khớp). */
function issuesAfter(edit: (raw: RawGameData) => void): string[] {
  const raw = makeRawData()
  withEventFixtures(raw)
  edit(raw)
  return dataIssues(withFixtureText(raw))
}

const eventOf = (raw: RawGameData, id: string): EventDef =>
  defined(
    raw.events.find((event) => event.id === id),
    `event ${id}`
  )

/** Đặt kết quả đầu của lựa chọn đầu của một event. */
function setFirstResult(raw: RawGameData, id: string, result: unknown): void {
  // Ép kiểu: test cố ý ghi dữ liệu sai dạng.
  eventOf(raw, id).options[0].outcomes[0].results = [
    result as EventDef['options'][0]['outcomes'][0]['results'][0]
  ]
}

describe('dữ liệu event', () => {
  it('event mẫu hợp lệ', () => {
    expect(issuesAfter(() => {})).toEqual([])
  })

  it('nhóm, tầng tối thiểu, map, lựa chọn trùng / rỗng, trường lạ', () => {
    const issues = issuesAfter((raw) => {
      Object.assign(eventOf(raw, 'treasure'), {
        group: 'sky',
        minFloor: 0,
        biomeIds: ['moon'],
        extra: 1
      })
      eventOf(raw, 'spring').options.push({ id: 'drink', outcomes: [{ weight: 1, results: [] }] })
      eventOf(raw, 'swamp').options = []
      eventOf(raw, 'omen').options[0].outcomes[0].weight = 0
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Event "treasure": group'),
        expect.stringContaining('Event "treasure": minFloor'),
        expect.stringContaining('map không tồn tại "moon"'),
        expect.stringContaining('trường "extra"'),
        expect.stringContaining('id "drink" bị trùng'),
        expect.stringContaining('Event "swamp": options phải là danh sách không rỗng'),
        expect.stringContaining('Event "omen".options[0]: tổng weight')
      ])
    )
  })

  it('kết quả: loại lạ, params sai theo loại, startBattle không ở cuối / trong onWin', () => {
    const issues = issuesAfter((raw) => {
      setFirstResult(raw, 'treasure', { type: 'teleport', params: {} })
      setFirstResult(raw, 'swamp', { type: 'applyStatus', params: { statusId: 'nope', count: 0 } })
      setFirstResult(raw, 'omen', { type: 'addModifier', params: { modifierId: 'nope' } })
      setFirstResult(raw, 'nest', { type: 'giveEgg', params: { source: 'shop' } })
      eventOf(raw, 'bandits').options[1].outcomes[0].results.push({ type: 'healParty', params: {} })
      setFirstResult(raw, 'duel', {
        type: 'startBattle',
        params: {
          kind: 'dragon',
          noFlee: 'yes',
          onWin: [{ type: 'startBattle', params: { kind: 'wild', noFlee: true } }]
        }
      })
      setFirstResult(raw, 'market', {
        type: 'openTempShop',
        params: { pool: 'regular', priceMultiplier: 0 }
      })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('.type phải là một trong'),
        expect.stringContaining('statusId: trạng thái không tồn tại "nope"'),
        expect.stringContaining('count phải là số nguyên ≥ 1'),
        expect.stringContaining('modifierId: modifier không tồn tại "nope"'),
        expect.stringContaining('source phải là một trong'),
        expect.stringContaining('startBattle phải là kết quả cuối'),
        expect.stringContaining('kind phải là một trong'),
        expect.stringContaining('noFlee phải là boolean'),
        expect.stringContaining('startBattle không có trong onWin / onLoss'),
        expect.stringContaining('priceMultiplier phải > 0'),
        expect.stringContaining('count phải là { min, max }')
      ])
    )
  })

  it('chuỗi: bước phải là event nhóm chain; advanceChain chỉ ở event nhóm chain', () => {
    const issues = issuesAfter((raw) => {
      setFirstResult(raw, 'map', {
        type: 'startChain',
        params: { chainId: '', eventId: 'treasure', battles: -1 }
      })
      setFirstResult(raw, 'omen', {
        type: 'advanceChain',
        params: { eventId: 'hoard', battles: 1 }
      })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('chainId phải là chuỗi không rỗng'),
        expect.stringContaining('"treasure" không thuộc nhóm chain'),
        expect.stringContaining('battles phải là số nguyên ≥ 0'),
        expect.stringContaining('advanceChain chỉ có ở event nhóm chain')
      ])
    )
  })

  it('trạng thái chỉ có trong trận không dùng được cho applyStatus', () => {
    const issues = issuesAfter((raw) => {
      defined(
        raw.statuses.find((status) => status.id === 'poison'),
        'độc'
      ).battleOnly = true
    })
    expect(issues).toEqual(
      expect.arrayContaining([expect.stringContaining('"poison" chỉ có trong trận')])
    )
  })

  it('modifier: loại hiệu ứng lạ, params sai, thời hạn sai', () => {
    const issues = issuesAfter((raw) => {
      raw.eventModifiers[0].effects = [{ type: 'flyChance', params: {} }]
      raw.eventModifiers[1].effects = [{ type: 'moneyPercent', params: { percent: 0 } }]
      raw.eventModifiers[2].effects = [{ type: 'fixedField', params: { weather: 'nope' } }]
      Object.assign(raw.eventModifiers[3], { duration: { kind: 'battles', count: 0 } })
      Object.assign(raw.eventModifiers[4], { duration: { kind: 'forever' } })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('loại hiệu ứng lạ "flyChance"'),
        expect.stringContaining('percent phải khác 0'),
        expect.stringContaining('"nope"'),
        expect.stringContaining('duration.count'),
        expect.stringContaining('duration phải là')
      ])
    )
  })

  it('config.events: tỉ lệ 0–100, chợ đen, thú triều', () => {
    const issues = issuesAfter((raw) => {
      raw.config.events.exploreChance = 150
      raw.config.events.blackMarket.minItemPrice = -1
      raw.config.events.blackMarket.equipment.minRollPercent = 120
      raw.config.events.beastTide.intervalDays = { min: 0, max: 5 }
      raw.config.events.beastTide.waves = { min: 3, max: 1 }
      raw.config.events.beastTide.completion.pickOneItemIds = ['nope']
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('config.events.exploreChance'),
        expect.stringContaining('config.events.blackMarket.minItemPrice'),
        expect.stringContaining('minRollPercent'),
        expect.stringContaining('config.events.beastTide.intervalDays.min'),
        expect.stringContaining('config.events.beastTide.waves: max phải ≥ min'),
        expect.stringContaining('pickOneItemIds')
      ])
    )
  })

  it('chữ: event và modifier phải có tên ở mọi ngôn ngữ', () => {
    const raw = makeRawData()
    withEventFixtures(raw)
    const text = withFixtureText(raw).text
    delete text.languages.en.content.events.treasure
    expect(dataIssues({ ...raw, text })).toEqual([
      expect.stringContaining('thiếu tên cho "treasure"')
    ])
  })
})
