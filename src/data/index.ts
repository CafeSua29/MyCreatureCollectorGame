// Gom dữ liệu JSON thành RawGameData. Phải qua createGameData / tryCreateGameData (@core) để
// kiểm tra trước khi dùng.

import type { RawGameData } from '@core'
import config from './balance.json'
import elements from './elements.json'
import items from './items.json'
import raceGroups from './raceGroups.json'
import races from './races.json'
import skills from './skills.json'
import species from './species.json'
import traits from './traits.json'
import biomes from './biomes.json'
import statuses from './statuses.json'
import minions from './minions.json'
import fieldEffects from './fieldEffects.json'
import equipmentAffixes from './equipmentAffixes.json'
import tamerSkills from './tamerSkills.json'
import tamerRealms from './tamerRealms.json'
import affinityTiers from './affinityTiers.json'
import talentBranches from './talentBranches.json'
import talents from './talents.json'
import synergies from './synergies.json'
import formations from './formations.json'
import comboSkills from './comboSkills.json'
import natures from './natures.json'
import bodyParts from './bodyParts.json'
import aptitudeTiers from './aptitudeTiers.json'
import speciesRanks from './speciesRanks.json'
import partnerSkills from './partnerSkills.json'
import recipes from './recipes.json'
import quests from './quests.json'
import expeditions from './expeditions.json'
import trainers from './trainers.json'
import trialRules from './trialRules.json'
import events from './events.json'
import eventModifiers from './eventModifiers.json'
import zones from './zones.json'
import textConfig from './i18n/config.json'

// Mỗi ngôn ngữ là một folder i18n/<mã>/ (language.json + một file cho mỗi loại nội dung). Tự tìm
// mọi folder để thêm ngôn ngữ chỉ cần thêm file (mục "Đa ngôn ngữ"); thiếu / thừa file hay id thì
// createGameData báo lỗi.
const textFiles = import.meta.glob<unknown>('./i18n/*/*.json', { eager: true, import: 'default' })
// Thông tin loài (không bắt buộc): i18n/<mã>/speciesInfo/<loại>.json (docs/rules/dex.md).
const speciesInfoFiles = import.meta.glob<unknown>('./i18n/*/speciesInfo/*.json', {
  eager: true,
  import: 'default'
})

function collectLanguages(): Record<string, Record<string, unknown>> {
  const languages: Record<string, Record<string, unknown>> = {}
  for (const [path, value] of Object.entries(textFiles)) {
    const match = /^\.\/i18n\/([^/]+)\/([^/]+)\.json$/.exec(path)
    if (!match) continue
    const [, language, file] = match
    languages[language] ??= { content: {} }
    if (file === 'language') Object.assign(languages[language], value)
    else (languages[language].content as Record<string, unknown>)[file] = value
  }
  for (const [path, value] of Object.entries(speciesInfoFiles)) {
    const match = /^\.\/i18n\/([^/]+)\/speciesInfo\/([^/]+)\.json$/.exec(path)
    if (!match) continue
    const [, language, kind] = match
    languages[language] ??= { content: {} }
    const info = (languages[language].speciesInfo ??= {}) as Record<string, unknown>
    info[kind] = value
  }
  return languages
}

// JSON được suy kiểu rộng (ví dụ kind: string), nên ép kiểu ở đây; createGameData kiểm tra lại toàn bộ.
export const rawGameData = {
  config,
  elements,
  raceGroups,
  races,
  species,
  traits,
  skills,
  items,
  biomes,
  statuses,
  minions,
  fieldEffects,
  equipmentAffixes,
  tamerSkills,
  tamerRealms,
  affinityTiers,
  talentBranches,
  talents,
  synergies,
  formations,
  comboSkills,
  natures,
  bodyParts,
  aptitudeTiers,
  speciesRanks,
  partnerSkills,
  recipes,
  quests,
  expeditions,
  trainers,
  trialRules,
  events,
  eventModifiers,
  zones,
  text: { ...textConfig, languages: collectLanguages() }
} as unknown as RawGameData
