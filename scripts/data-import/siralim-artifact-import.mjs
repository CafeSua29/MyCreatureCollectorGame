/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Chuyển 19 trait và 4 spell Siralim hoãn tới "Trang bị và đồ cầm" (deferredTo: "equipment" trong
// traits-planned.json / skills-planned.json) vào src/data, thêm spell Summon Animated Weapon và minion
// Animated Weapon. Hook theo mô tả gốc, quy đổi Artifact ở "Quy đổi trait / spell Siralim" của
// docs/rules/content-data.md. Chạy: node scripts/data-import/siralim-artifact-import.mjs (chạy lại an
// toàn: bỏ qua mục đã có).

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const writeJson = (file, value) =>
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n')

const traits = readJson('src/data/traits.json')
const skills = readJson('src/data/skills.json')
const species = readJson('src/data/species.json')
const minions = readJson('src/data/minions.json')
const plannedTraits = readJson('scripts/data-import/traits-planned.json')
const plannedSkills = readJson('scripts/data-import/skills-planned.json')
const i18n = {}
for (const lang of ['vi', 'en']) {
  for (const kind of ['traits', 'skills', 'minions', 'species']) {
    i18n[`${lang}/${kind}`] = readJson(`src/data/i18n/${lang}/${kind}.json`)
  }
}

const hook = (type, params = {}) => ({ type, params })
const aura = (scope, hooks) => hook('aura', { scope, hooks })
/** Chỉ số "Attack, Intelligence, Defense, Speed" của Siralim (Defense = cả hai loại thủ). */
const SIRALIM_STATS = ['attack', 'spAttack', 'defense', 'spDefense', 'speed']
// Race của game theo race Siralim (speciesBySiralimRace của siralim-report.json).
const IMLING_RACE = 'demon'
const IMLER_RACE = 'mineral'

const TRAIT_HOOKS = {
  overcome: [hook('extraSpellSlotRoll', { chance: 50 })],
  reticence: [
    aura('foes', [
      hook('equipmentLinePotency', { tags: ['stat'], percent: -35, excludeHpLines: true })
    ])
  ],
  iAmAbove: [
    hook('trigger', {
      on: 'cast',
      scope: 'side',
      when: [
        { if: 'reactive', value: false },
        { if: 'skillTag', tags: ['arsenal'] }
      ],
      effects: [{ do: 'castSpellSlot', to: 'subjectAllies', chance: 35 }]
    })
  ],
  celebrateDecline: [aura('side', [hook('spellSlotExtraCasts', { count: 1 })])],
  leadByExample: [
    aura('allies', [
      hook('equipmentShare', {
        percent: 25,
        stats: SIRALIM_STATS,
        as: 'stats',
        raceIds: [IMLING_RACE]
      })
    ])
  ],
  ingenuity: [
    aura('allies', [
      hook('equipmentShare', {
        percent: 25,
        stats: SIRALIM_STATS,
        as: 'stats',
        raceIds: [IMLER_RACE]
      })
    ])
  ],
  unbreakable: [
    aura('side', [hook('equipmentLinePotency', { tags: ['elementStrengthTaken'], percent: 50 })])
  ],
  dissection: [
    aura('side', [hook('equipmentShare', { percent: 50, stats: ['attack'], as: 'damage' })])
  ],
  foolsAxiom: [
    aura('side', [
      hook('equipmentShare', { percent: 50, stats: ['defense', 'spDefense'], as: 'stats' })
    ])
  ],
  battleBorn: [aura('side', [hook('spellSlotChanceBonus', { points: 10 })])],
  honedBlades: [
    aura('allies', [hook('equipmentShare', { percent: 15, stats: SIRALIM_STATS, as: 'stats' })])
  ],
  braze: [
    aura('side', [hook('equipmentLinePotency', { tags: ['elementStrengthDealt'], percent: 50 })])
  ],
  imbue: [aura('side', [hook('equipmentLinePotency', { tags: ['stat'], percent: 15 })])],
  warForged: [
    aura('side', [hook('equipmentLinePotency', { tags: ['buffOnDamage'], percent: 100 })])
  ],
  incursion: [
    aura('side', [hook('equipmentLinePotency', { tags: ['debuffOnDamage'], percent: 100 })])
  ],
  warcraft: [hook('equipmentLinePotency', { tags: ['stat'], percent: 40 })],
  masterOfSmiths: [
    hook('trigger', {
      on: 'entry',
      scope: 'self',
      when: [{ if: 'partyAllRace' }],
      effects: [{ do: 'shareEquipmentTraits', to: 'leftAlly' }]
    })
  ],
  auraBoost: [hook('equipmentLinePotency', { tags: ['stat'], percent: 400, firstOnly: true })],
  perishingSalvo: [
    hook('trigger', {
      on: 'faint',
      scope: 'self',
      effects: [
        {
          do: 'damage',
          to: 'foes',
          amount: {
            stat: 'spAttack',
            of: 'self',
            percent: 15,
            per: { of: 'equipmentStatLines', stat: 'attack' }
          }
        }
      ]
    })
  ]
}

const spellSkill = (planned, { target, after, onTarget, tags }) => ({
  id: planned.id,
  elementId: planned.elementId,
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: 0,
  target,
  effects: [],
  spell: { ...(onTarget ? { onTarget } : {}), ...(after ? { after } : {}) },
  ...(tags ? { tags } : {})
})
const SPELLS = {
  emeraldPower: (p) =>
    spellSkill(p, { target: 'ally', after: [{ do: 'copySpellSlot', from: 'other', to: 'side' }] }),
  goldenStout: (p) =>
    spellSkill(p, {
      target: 'self',
      after: [{ do: 'castSpellSlot', to: 'self' }],
      tags: ['booze']
    }),
  rubyPower: (p) =>
    spellSkill(p, { target: 'ally', after: [{ do: 'castSpellSlot', to: 'other', by: 'self' }] }),
  sapphirePower: (p) =>
    spellSkill(p, { target: 'ally', onTarget: [{ do: 'guaranteeSpellSlot', to: 'subject' }] })
}

const report = { traits: [], spells: [], learnset: 0 }
for (const planned of plannedTraits.filter((t) => t.deferredTo === 'equipment')) {
  const hooks = TRAIT_HOOKS[planned.id]
  if (!hooks) throw new Error(`Chưa có hook cho trait "${planned.id}"`)
  if (!traits.some((t) => t.id === planned.id))
    traits.push({ id: planned.id, kind: planned.kind, hooks })
  i18n['vi/traits'][planned.id] = planned.name
  // Trùng tên tiếng Anh với trait TWW3 "Unbreakable": thêm "(Siralim)" như Gravity.
  i18n['en/traits'][planned.id] =
    planned.id === 'unbreakable' ? `${planned.nameEn} (Siralim)` : planned.nameEn
  report.traits.push(planned.id)
}
const speciesById = new Map(species.map((s) => [s.id, s]))
const addLearn = (speciesId, level, skillId) => {
  const sp = speciesById.get(speciesId)
  if (!sp || sp.learnset.some((entry) => entry.skillId === skillId)) return
  sp.learnset.push({ level, skillId })
  report.learnset++
}
for (const planned of plannedSkills.filter((s) => s.deferredTo === 'equipment')) {
  const build = SPELLS[planned.id]
  if (!build) throw new Error(`Chưa có spell "${planned.id}"`)
  if (!skills.some((s) => s.id === planned.id)) skills.push(build(planned))
  i18n['vi/skills'][planned.id] = planned.name
  i18n['en/skills'][planned.id] = planned.nameEn
  for (const { speciesId, level } of planned.learnset) addLearn(speciesId, level, planned.id)
  report.spells.push(planned.id)
}

// Summon Animated Weapon: minion đánh theo công của chủ cộng % công từ trang bị (chủ project chốt).
if (!minions.some((m) => m.id === 'animatedWeapon')) {
  minions.push({
    id: 'animatedWeapon',
    maxStacks: 3,
    leaveChance: 25,
    hooks: [
      hook('trigger', {
        on: 'turnEnd',
        scope: 'self',
        effects: [
          {
            do: 'damage',
            to: 'randomFoe',
            amount: {
              stat: 'attack',
              of: 'self',
              percent: 1,
              per: { of: 'equipmentStatPercent', stat: 'attack', bonus: 20 }
            }
          }
        ]
      })
    ]
  })
}
i18n['vi/minions'].animatedWeapon = 'Vũ khí sống'
i18n['en/minions'].animatedWeapon = 'Animated Weapon'
if (!skills.some((s) => s.id === 'summonAnimatedWeapon')) {
  skills.push({
    id: 'summonAnimatedWeapon',
    elementId: 'steel',
    category: 'status',
    power: 0,
    accuracy: 100,
    priority: 0,
    target: 'self',
    effects: [],
    spell: { after: [{ do: 'minion', to: 'self', minionId: 'animatedWeapon', stacks: 1 }] },
    tags: ['minion']
  })
}
i18n['vi/skills'].summonAnimatedWeapon = 'Triệu hồi vũ khí sống'
i18n['en/skills'].summonAnimatedWeapon = 'Summon Animated Weapon'
// Học bởi các loài Smith của Siralim (race người lùn), level 26 như spell triệu hồi mạnh.
for (const sp of species) {
  const name = i18n['en/species'][sp.id] ?? ''
  if (sp.source === 'siralim' && /Smith|Crafter/.test(name))
    addLearn(sp.id, 26, 'summonAnimatedWeapon')
}
report.spells.push('summonAnimatedWeapon')

writeJson('src/data/traits.json', traits)
writeJson('src/data/skills.json', skills)
writeJson('src/data/species.json', species)
writeJson('src/data/minions.json', minions)
for (const [key, value] of Object.entries(i18n)) {
  if (!key.endsWith('/species')) writeJson(`src/data/i18n/${key}.json`, value)
}
writeJson(
  'scripts/data-import/traits-planned.json',
  plannedTraits.filter((t) => t.deferredTo !== 'equipment')
)
writeJson(
  'scripts/data-import/skills-planned.json',
  plannedSkills.filter((s) => s.deferredTo !== 'equipment')
)
console.log(JSON.stringify(report))
