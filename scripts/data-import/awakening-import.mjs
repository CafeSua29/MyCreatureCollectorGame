/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập dữ liệu Thức tỉnh (docs/rules/awakening.md) từ awakening-source.json vào src/data: khóa
// config `awakening` (balance.json), Thức tỉnh đan (items.json), loài Thiên Kiếp (species.json),
// tên i18n. Thần thông theo hệ = 2 skill gây sát thương mạnh nhất của hệ trong skills.json (power
// cao nhất, hòa thì accuracy cao hơn, rồi theo id; bỏ chiêu Max), chủ project chốt 2026-10-24.
// Chạy lại được (ghi đè các mục của chính nó): node scripts/data-import/awakening-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

const source = read('scripts/data-import/awakening-source.json')
const skills = read(`${DATA}/skills.json`)
const elements = read(`${DATA}/elements.json`)

/** 2 skill gây sát thương mạnh nhất của mỗi hệ. */
function divineSkills() {
  const result = {}
  for (const element of elements) {
    const ranked = skills
      .filter((skill) => skill.elementId === element.id && skill.power > 0 && !skill.maxMove)
      .sort((a, b) => b.power - a.power || b.accuracy - a.accuracy || a.id.localeCompare(b.id))
    if (ranked.length > 0) result[element.id] = ranked.slice(0, 2).map((skill) => skill.id)
  }
  return result
}

const proposed = source.proposedConfig.awakening
const balance = read(`${DATA}/balance.json`)
balance.awakening = {
  statStepPercent: proposed.statStepPercent,
  lifespanMultiplier: 1.5,
  levelPerTier: proposed.levelPerTier,
  costBase: proposed.costBase,
  pillItemId: proposed.pillItemId,
  pillsPerTier: proposed.pillsPerTier,
  milestones: proposed.milestones,
  repeatEvery: proposed.repeatEvery,
  divineSkills: divineSkills(),
  maxFailures: proposed.maxFailures,
  injuryStatPercent: proposed.injuryStatPercent,
  injuryBattles: proposed.injuryBattles,
  // Boss ngẫu nhiên 10%, boss tầng thêm 20% (khoảng 28% có ít nhất một viên; file nguồn đề xuất 30%).
  bossDrops: [{ itemId: proposed.pillItemId, chance: 10 }],
  floorBossDrops: [{ itemId: proposed.pillItemId, chance: 20 }],
  // Chỉnh theo mô phỏng 2026-10-24 (balance-systems.md): đề xuất gốc ×2 + 0,25 mỗi tầng làm độ kiếp
  // gần như không thắng được.
  tribulation: { ...proposed.tribulation, multiplierBase: 1, multiplierPerTier: 0.15 }
}
write(`${DATA}/balance.json`, balance)

const [pill] = source.proposedItems
const items = read(`${DATA}/items.json`).filter((item) => item.id !== pill.id)
items.push({ id: pill.id, category: 'material', price: pill.price, shop: true, shopWeight: 5 })
write(`${DATA}/items.json`, items)

const [tribulation] = source.proposedSpecies
const species = read(`${DATA}/species.json`).filter((entry) => entry.id !== tribulation.id)
species.push({
  kind: 'normal',
  id: tribulation.id,
  raceId: tribulation.raceId,
  elementIds: tribulation.elementIds,
  // Chỉnh theo mô phỏng 2026-10-24: chỉ số gốc 35 mỗi chỉ số (đề xuất gốc tổng 630 hạ một đòn).
  baseStats: { hp: 35, attack: 35, defense: 35, spAttack: 35, spDefense: 35, speed: 35 },
  evolutions: [],
  learnset: tribulation.learnset.map((entry) => {
    const [skillId, level] = entry.split('@')
    return { level: Number(level), skillId }
  }),
  catchRate: tribulation.catchRate,
  // Không bắt được nên thọ nguyên không có ý nghĩa; lấy mức của loài nguyên tố.
  lifespan: 1000,
  genderless: true,
  origin: 'fantasy',
  source: 'generic'
})
write(`${DATA}/species.json`, species)

for (const [language, pick] of [
  ['vi', (entry) => entry.name],
  ['en', (entry) => entry.nameEn]
]) {
  const itemNames = read(`${DATA}/i18n/${language}/items.json`)
  itemNames[pill.id] = pick(pill)
  write(`${DATA}/i18n/${language}/items.json`, itemNames)
  const speciesNames = read(`${DATA}/i18n/${language}/species.json`)
  speciesNames[tribulation.id] = pick(tribulation)
  write(`${DATA}/i18n/${language}/species.json`, speciesNames)
}
