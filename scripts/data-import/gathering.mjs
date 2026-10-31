/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Luật đề xuất cờ `gathering` (câu cá / khai thác) của biome (docs/rules/gathering.md mục "Nội
// dung"), dùng chung cho biomes-import.mjs và gathering-import.mjs. Tất định theo dữ liệu. Map làm
// được một cách khi hệ chủ đạo của map (elementIds) có hệ của cách đó trong config.gathering, hoặc
// ≥ MIN_SHARE số loài của map hợp cách đó (cùng luật chọn quái gatheringEncounters ở core: hệ trong
// elementIds hoặc nhóm race trong raceGroupIds).

/** Tỉ lệ loài hợp cách thu thập tối thiểu để map không có hệ chủ đạo đó vẫn câu / đào được. */
const MIN_SHARE = 0.15

/** Thêm hệ ice vào hệ chủ đạo cho câu cá: câu cá trên băng (ice fishing). */
const EXTRA_MAP_ELEMENTS = { fishing: ['ice'], mining: [] }

/** Số loài của map hợp cách thu thập (hệ hoặc nhóm race theo config). */
function matchingCount(biome, config, { byId, groupOf }) {
  return biome.encounters.filter(({ speciesId }) => {
    const species = byId.get(speciesId)
    if (!species) return false
    return (
      species.elementIds.some((id) => config.elementIds.includes(id)) ||
      config.raceGroupIds.includes(groupOf.get(species.raceId))
    )
  }).length
}

/**
 * Cờ gathering của một biome (undefined = map không câu / đào được). `lookup`: { byId: Map id →
 * loài, groupOf: Map id race → id nhóm race, config: balance.gathering }.
 */
export function mapGathering(biome, lookup) {
  const mapElements = biome.elementIds ?? []
  const flags = {}
  for (const [method, config] of Object.entries(lookup.config)) {
    const count = matchingCount(biome, config, lookup)
    if (count === 0) continue
    const themed = [...config.elementIds, ...(EXTRA_MAP_ELEMENTS[method] ?? [])]
    const isThemed = mapElements.some((id) => themed.includes(id))
    if (isThemed || count >= MIN_SHARE * biome.encounters.length) flags[method] = true
  }
  return Object.keys(flags).length > 0 ? flags : undefined
}

/** Biome kèm cờ gathering đã tính lại (map không câu / đào được thì không có trường). */
export function withGathering(biome, lookup) {
  const rest = { ...biome }
  delete rest.gathering
  const gathering = mapGathering(rest, lookup)
  return gathering ? { ...rest, gathering } : rest
}
