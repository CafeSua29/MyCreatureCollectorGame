// Kiểm tra thông tin phụ của loài: không giới tính, dạng (formOf / formKind), nguồn gốc
// (origin / source). Mục "Dữ liệu" (docs/rules/data.md).

import {
  FORM_KINDS,
  ORIGIN_SOURCE_RULES,
  SPECIES_ORIGINS,
  type GameData,
  type NormalSpecies
} from '../model'
import { isTeraElement } from './checks'

/** formOf và formKind đi cùng nhau; formOf trỏ tới loài gốc (không phải một dạng), cùng race. */
function checkForm(data: GameData, species: NormalSpecies, where: string, issues: string[]): void {
  if (species.formOf === undefined && species.formKind === undefined) return
  if (species.formOf === undefined || species.formKind === undefined) {
    issues.push(`${where}: formOf và formKind phải đi cùng nhau`)
  }
  if (species.formKind !== undefined && !FORM_KINDS.includes(species.formKind)) {
    issues.push(`${where}: formKind phải là một trong ${FORM_KINDS.join(', ')}`)
  }
  if (species.formOf === undefined) return
  const base = data.species[species.formOf]
  if (species.formOf === species.id) {
    issues.push(`${where}: formOf không được trỏ tới chính nó`)
  } else if (base?.kind !== 'normal') {
    issues.push(`${where}: formOf trỏ tới loài không tồn tại "${species.formOf}"`)
  } else if (base.formOf !== undefined) {
    issues.push(`${where}: formOf "${base.id}" là một dạng khác, phải trỏ tới loài gốc`)
  } else if (base.raceId !== species.raceId) {
    issues.push(`${where}: dạng phải cùng race với loài gốc (${species.raceId} ≠ ${base.raceId})`)
  }
}

/** origin hợp lệ; source là chuỗi không rỗng, bắt buộc / bị cấm theo ORIGIN_SOURCE_RULES. */
function checkOrigin(species: NormalSpecies, where: string, issues: string[]): void {
  if (species.source !== undefined && (typeof species.source !== 'string' || !species.source)) {
    issues.push(`${where}: source phải là chuỗi không rỗng`)
  }
  if (species.origin === undefined) {
    if (species.source !== undefined) issues.push(`${where}: không có origin thì không có source`)
    return
  }
  if (!SPECIES_ORIGINS.includes(species.origin)) {
    issues.push(`${where}: origin phải là một trong ${SPECIES_ORIGINS.join(', ')}`)
    return
  }
  const rule = ORIGIN_SOURCE_RULES[species.origin]
  if (rule === 'required' && species.source === undefined) {
    issues.push(`${where}: origin "${species.origin}" cần source`)
  }
  if (rule === 'forbidden' && species.source !== undefined) {
    issues.push(`${where}: origin "${species.origin}" không được có source`)
  }
}

/** Loài gốc của loài (chính nó nếu không phải một dạng). */
const rootOf = (species: NormalSpecies): string => species.formOf ?? species.id

/**
 * fromSpeciesIds chỉ ở dạng Mega / gmax, trỏ loài thường cùng loài gốc; teraFormId là dạng battleOnly
 * cùng loài gốc; teraElementId là hệ Tera hợp lệ.
 */
function checkTransformLinks(
  data: GameData,
  species: NormalSpecies,
  where: string,
  issues: string[]
): void {
  if (species.fromSpeciesIds !== undefined) {
    if (species.formKind !== 'mega' && species.formKind !== 'gmax') {
      issues.push(`${where}: fromSpeciesIds chỉ dùng cho dạng mega / gmax`)
    }
    const ids = species.fromSpeciesIds
    if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) {
      issues.push(`${where}: fromSpeciesIds phải là danh sách id loài không rỗng, không trùng`)
    } else {
      for (const id of ids) {
        const from = data.species[id]
        if (from?.kind !== 'normal' || rootOf(from) !== species.formOf) {
          issues.push(
            `${where}: fromSpeciesIds "${id}" không phải loài cùng gốc "${species.formOf}"`
          )
        }
      }
    }
  }
  if (species.teraFormId !== undefined) {
    const form = data.species[species.teraFormId]
    if (
      form?.kind !== 'normal' ||
      form.formKind !== 'battleOnly' ||
      form.formOf !== rootOf(species)
    ) {
      issues.push(
        `${where}: teraFormId "${species.teraFormId}" không phải dạng trong trận cùng gốc`
      )
    }
  }
  if (species.teraElementId !== undefined && !isTeraElement(data, species.teraElementId)) {
    issues.push(`${where}: teraElementId không hợp lệ "${species.teraElementId}"`)
  }
}

export function checkSpeciesInfo(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    const where = `Loài "${species.id}"`
    // Chỉ ghi khi không giới tính (bỏ trống = có giới tính), để dữ liệu một cách viết duy nhất.
    if (species.genderless !== undefined && species.genderless !== true) {
      issues.push(`${where}: genderless chỉ được là true (bỏ trống = có giới tính)`)
    }
    checkForm(data, species, where, issues)
    checkTransformLinks(data, species, where, issues)
    checkOrigin(species, where, issues)
  }
}
