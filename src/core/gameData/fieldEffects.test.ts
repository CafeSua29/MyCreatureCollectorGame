// Kiểm tra dữ liệu môi trường (mục "Môi trường" ở battle-environment.md, luật ở data.md): fieldEffects.json,
// config.field, môi trường của biome, setField, fieldModifiers, hook trait theo môi trường.

import { describe, expect, it } from 'vitest'
import {
  dataIssues,
  dataIssuesAfter,
  makeEnvironmentRawData,
  makeSideFieldRawData,
  withFixtureText
} from '../testing'
import type { RawGameData } from '../model'

const issuesText = (issues: string[]): string => issues.join('\n')

/** Lỗi sau khi sửa dữ liệu môi trường mẫu (chữ tạo lại cho mọi nội dung). */
function envIssues(edit: (raw: RawGameData) => void): string {
  const raw = makeEnvironmentRawData()
  edit(raw)
  return issuesText(dataIssues(withFixtureText(raw)))
}

describe('fieldEffects.json', () => {
  it('dữ liệu mẫu hợp lệ', () => {
    expect(dataIssues(makeEnvironmentRawData())).toEqual([])
  })

  it('lớp lạ báo lỗi; lớp side và room đã hỗ trợ', () => {
    const issues = envIssues((raw) => {
      raw.fieldEffects.push(
        { id: 'tailwind2', layer: 'side', hooks: [] },
        { id: 'trickRoom', layer: 'room', hooks: [] },
        // Ép kiểu để thử dữ liệu sai.
        { id: 'odd', layer: 'sky' as 'weather', hooks: [] }
      )
    })
    expect(issues).not.toMatch(/tailwind2|trickRoom/)
    expect(issues).toMatch(/"odd": layer không hợp lệ "sky"/)
  })

  it('hook lạ, params sai, duration sai, trường lạ', () => {
    const issues = envIssues((raw) => {
      raw.fieldEffects.push(
        { id: 'badHook', layer: 'weather', hooks: [{ type: 'nope', params: {} }] },
        {
          id: 'badParams',
          layer: 'weather',
          hooks: [
            { type: 'statMultiplier', params: { stat: 'hp', multiplier: 2, elementIds: ['fire'] } },
            { type: 'turnEndDamage', params: { percent: 0, immuneElementIds: ['lava'] } },
            { type: 'blockStatus', params: { statusIds: ['dizzy'], grounded: false } },
            {
              type: 'elementDamageMultiplier',
              params: { elementIds: [], multiplier: 1, grounded: 'x' }
            }
          ],
          duration: 0
        }
      )
      Object.assign(raw.fieldEffects[0], { name: 'Trời quang' })
    })
    expect(issues).toMatch(/"badHook": hook "nope" chưa có trong registry/)
    expect(issues).toMatch(/stat phải là chỉ số khác hp/)
    expect(issues).toMatch(/immuneElementIds: hệ không tồn tại "lava"/)
    expect(issues).toMatch(/statusIds: trạng thái không tồn tại "dizzy"/)
    expect(issues).toMatch(/grounded chỉ được là true/)
    expect(issues).toMatch(/grounded phải là "attacker" hoặc "defender"/)
    expect(issues).toMatch(/elementIds phải là danh sách không rỗng/)
    expect(issues).toMatch(/"badParams": duration/)
    expect(issues).toMatch(/Môi trường "clear": trường "name" không thuộc môi trường/)
  })

  it('môi trường thiếu tên ở một ngôn ngữ báo lỗi', () => {
    const raw = makeEnvironmentRawData()
    delete raw.text.languages.en.content.fieldEffects.rain
    expect(issuesText(dataIssues(raw))).toMatch(/rain/)
  })
})

describe('config.field.defaults', () => {
  it('thiếu lớp, sai lớp, có hook hoặc duration đều báo lỗi', () => {
    expect(
      issuesText(dataIssuesAfter((raw) => (raw.config.field.defaults.weather = 'grassy')))
    ).toMatch(/defaults.weather: "grassy" không thuộc lớp weather/)
    expect(
      issuesText(dataIssuesAfter((raw) => (raw.config.field.defaults.terrain = 'lava')))
    ).toMatch(/defaults.terrain: môi trường không tồn tại "lava"/)
    expect(
      issuesText(dataIssuesAfter((raw) => (raw.config.field.defaults.weather = 'rain')))
    ).toMatch(/môi trường mặc định không được có hook/)
  })
})

describe('môi trường tự nhiên của biome', () => {
  it('đúng lớp, trọng số > 0, không trùng, trường lạ báo lỗi; danh sách rỗng hợp lệ', () => {
    const issues = issuesText(
      dataIssuesAfter((raw) => {
        raw.biomes[0].weather = [
          { fieldId: 'grassy', weight: 1 },
          { fieldId: 'rain', weight: 0 },
          { fieldId: 'rain', weight: 1 }
        ]
        Object.assign(raw.biomes[1], { terrain: [{ fieldId: 'calm', weight: 1, chance: 5 }] })
      })
    )
    expect(issues).toMatch(/Biome "field": weather: "grassy" không thuộc lớp weather/)
    expect(issues).toMatch(/Biome "field": weather bị lặp/)
    expect(issues).toMatch(/weather\[1\].weight/)
    expect(issues).toMatch(/Biome "lair".terrain\[0\]: trường "chance"/)
    expect(dataIssuesAfter((raw) => (raw.biomes[0].weather = []))).toEqual([])
  })
})

describe('hiệu ứng setField và fieldModifiers của skill', () => {
  it('setField: lớp, đúng lớp, không phải mặc định, cần turns khi môi trường không có duration', () => {
    const issues = envIssues((raw) => {
      const setField = (params: unknown): RawGameData['skills'][number] => ({
        id: `set${raw.skills.length}`,
        elementId: 'normal',
        category: 'status',
        power: 0,
        accuracy: 100,
        priority: 0,
        target: 'self',
        effects: [{ type: 'setField', params }]
      })
      raw.fieldEffects.push({ id: 'drizzle', layer: 'weather', hooks: [] })
      raw.skills.push(setField({ layer: 'side', fieldId: 'rain' }))
      raw.skills.push(setField({ layer: 'terrain', fieldId: 'rain' }))
      raw.skills.push(setField({ layer: 'weather', fieldId: 'clear', turns: 2 }))
      raw.skills.push(setField({ layer: 'weather', fieldId: 'drizzle' }))
      raw.skills.push(setField({ layer: 'weather', fieldId: 'rain', turns: 1.5 }))
    })
    expect(issues).toMatch(/layer phải là "weather" hoặc "terrain"/)
    expect(issues).toMatch(/fieldId: "rain" không thuộc lớp terrain/)
    expect(issues).toMatch(/"clear" là môi trường mặc định/)
    expect(issues).toMatch(/cần turns vì môi trường "drizzle" không có duration/)
    expect(issues).toMatch(/turns/)
  })

  it('fieldModifiers: môi trường tồn tại, không trùng, hệ số > 0, accuracy 1–100, trường lạ', () => {
    const issues = envIssues((raw) => {
      const thunder = raw.skills.find((skill) => skill.id === 'thunder')
      if (!thunder) throw new Error('thiếu thunder')
      thunder.fieldModifiers = [
        { fieldId: 'rain', powerMultiplier: 0, power: -5 },
        { fieldId: 'rain', accuracy: 150 },
        { fieldId: 'lava', hitsAlways: true },
        // Ép kiểu để thử dữ liệu sai.
        { fieldId: 'fog', bonus: 1 } as unknown as { fieldId: string }
      ]
    })
    expect(issues).toMatch(/fieldModifiers\[0\].powerMultiplier/)
    expect(issues).toMatch(/fieldModifiers\[0\].power phải/)
    expect(issues).toMatch(/fieldModifiers\[1\]: môi trường "rain" bị lặp/)
    expect(issues).toMatch(/fieldModifiers\[1\].accuracy/)
    expect(issues).toMatch(/fieldModifiers\[2\]: môi trường không tồn tại "lava"/)
    expect(issues).toMatch(/fieldModifiers\[3\]: cần ít nhất power, powerMultiplier/)
    expect(issues).toMatch(/fieldModifiers\[3\]: trường "bonus"/)
  })
})

describe('hook trait theo hệ và môi trường', () => {
  it('params sai báo lỗi', () => {
    const issues = envIssues((raw) => {
      const trait = (id: string, type: string, params: unknown): void => {
        raw.traits.push({ id, kind: 'rare', hooks: [{ type, params }] })
      }
      trait('t1', 'statModifierInWeather', { weatherIds: ['grassy'], percent: { speed: 10 } })
      trait('t2', 'terrainStatModifier', { terrainIds: ['calm'] })
      trait('t3', 'elementDamageTaken', { elementIds: ['normal'], percent: -150 })
      trait('t4', 'airborne', { always: true })
      trait('t5', 'regenInWeather', { weatherIds: [], percent: 5 })
      trait('t6', 'setFieldOnEntry', { layer: 'weather', fieldId: 'clear' })
    })
    expect(issues).toMatch(/"t1".*weatherIds: "grassy" không thuộc lớp weather/)
    expect(issues).toMatch(/"t2".*cần percent/)
    expect(issues).toMatch(/"t3".*percent/)
    expect(issues).toMatch(/"t4".*hook này không có params/)
    expect(issues).toMatch(/"t5".*weatherIds phải là danh sách không rỗng/)
    expect(issues).toMatch(/"t6".*môi trường mặc định/)
  })

  it('airborne của hệ chỉ được là true', () => {
    const issues = issuesText(
      dataIssuesAfter((raw) => Object.assign(raw.elements[0], { airborne: false }))
    )
    expect(issues).toMatch(/Hệ "normal": airborne chỉ được là true/)
  })
})

describe('hiệu ứng theo phe (lớp side) và setSideField', () => {
  /** Lỗi sau khi sửa dữ liệu hiệu ứng theo phe mẫu. */
  function sideIssues(edit: (raw: RawGameData) => void): string {
    const raw = makeSideFieldRawData()
    edit(raw)
    return issuesText(dataIssues(withFixtureText(raw)))
  }

  it('dữ liệu mẫu hợp lệ', () => {
    expect(dataIssues(makeSideFieldRawData())).toEqual([])
  })

  it('hook dùng sai lớp; maxLayers chỉ cho lớp side, nguyên ≥ 2, khớp số mục theo tầng', () => {
    const issues = sideIssues((raw) => {
      raw.fieldEffects.push(
        {
          id: 'hazardRain',
          layer: 'weather',
          maxLayers: 2,
          hooks: [{ type: 'entryDamage', params: { percentByLayer: [5, 10] } }]
        },
        {
          id: 'sideBoost',
          layer: 'side',
          hooks: [
            { type: 'elementDamageMultiplier', params: { elementIds: ['fire'], multiplier: 2 } }
          ]
        },
        {
          id: 'shortSpikes',
          layer: 'side',
          maxLayers: 3,
          hooks: [{ type: 'entryDamage', params: { percentByLayer: [5, 10] } }]
        },
        {
          id: 'oneLayer',
          layer: 'side',
          maxLayers: 1,
          hooks: [{ type: 'entryStatus', params: { statusIdByLayer: ['poison'] } }]
        }
      )
    })
    expect(issues).toMatch(/"hazardRain": hooks\[0\] "entryDamage" không dùng được ở lớp weather/)
    expect(issues).toMatch(/"hazardRain": maxLayers chỉ dùng cho lớp side/)
    expect(issues).toMatch(
      /"sideBoost": hooks\[0\] "elementDamageMultiplier" không dùng được ở lớp side/
    )
    expect(issues).toMatch(/"shortSpikes": hooks\[0\] có 2 mục theo tầng, cần 3 \(maxLayers\)/)
    expect(issues).toMatch(/"oneLayer": maxLayers phải là số nguyên ≥ 2/)
  })

  it('params của hook theo phe', () => {
    const issues = sideIssues((raw) => {
      raw.fieldEffects.push(
        {
          id: 'badScreen',
          layer: 'side',
          hooks: [
            {
              type: 'damageTakenMultiplier',
              params: { categories: ['status'], multiplier: -1, allyMultiplier: 0.5 }
            }
          ]
        },
        {
          id: 'badHazards',
          layer: 'side',
          hooks: [
            { type: 'entryDamage', params: { percentByLayer: [], elementId: 'lava' } },
            {
              type: 'entryStatus',
              params: { statusIdByLayer: ['plague'], absorbedByElementIds: ['x'] }
            },
            { type: 'entryStage', params: { stat: 'hp', delta: 0 } },
            { type: 'blockStatLower', params: { extra: 1 } }
          ]
        }
      )
    })
    expect(issues).toMatch(/categories phải là danh sách không lặp gồm "physical" \/ "special"/)
    expect(issues).toMatch(/multiplier phải là số/)
    expect(issues).toMatch(/percentByLayer phải là danh sách không rỗng/)
    expect(issues).toMatch(/elementId: hệ không tồn tại "lava"/)
    expect(issues).toMatch(/statusIdByLayer\[0\]: trạng thái không tồn tại "plague"/)
    expect(issues).toMatch(/absorbedByElementIds: hệ không tồn tại "x"/)
    expect(issues).toMatch(/stat phải là chỉ số khác hp/)
    expect(issues).toMatch(/delta phải khác 0/)
  })

  it('setSideField: phe own / foe, môi trường lớp side, turns, môi trường yêu cầu toàn sân', () => {
    const issues = sideIssues((raw) => {
      raw.skills.push({
        id: 'badSide',
        elementId: 'normal',
        category: 'status',
        power: 0,
        accuracy: 100,
        priority: 0,
        target: 'self',
        effects: [
          { type: 'setSideField', params: { side: 'both', fieldId: 'rain', turns: 0 } },
          {
            type: 'setSideField',
            params: { side: 'own', fieldId: 'reflect', requiresFieldId: 'mist' }
          },
          { type: 'setSideField', params: { side: 'foe', fieldId: 'nothing' } }
        ]
      })
    })
    expect(issues).toMatch(/side phải là "own" hoặc "foe"/)
    expect(issues).toMatch(/fieldId: "rain" không thuộc lớp side/)
    expect(issues).toMatch(/turns phải là số nguyên ≥ 1/)
    expect(issues).toMatch(/requiresFieldId: "mist" phải là môi trường toàn sân/)
    expect(issues).toMatch(/fieldId: môi trường không tồn tại "nothing"/)
  })
})
