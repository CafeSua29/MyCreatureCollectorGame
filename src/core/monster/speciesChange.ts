// Đổi loài của một quái đã có (điểm duy nhất cho tiến hóa, thoái hóa, phản tổ): mọi trường theo loài
// đổi cùng một luật, mỗi tính năng chỉ thêm phần riêng (tiêu đồ cầm, mốc lý lịch, giá...).

import { keepValidBloodlines } from '../registries'
import type { RngState } from '../shared'
import type { BattleEvent, GameData, Monster, NormalSpecies } from '../model'
import { speciesElementsFor } from './bootleg'
import { genderAfterEvolution } from './gender'
import { isFainted, keepAlive } from './hp'
import { offerSkills } from './skills'

/** Kết quả đổi loài: quái mới, sự kiện học skill, RNG sau khi tung giới tính. */
export interface SpeciesChangeResult {
  monster: Monster
  events: BattleEvent[]
  rng: RngState
}

/** Skill trong learnset của loài ở level ≤ level quái, theo thứ tự level. */
function learnedUpTo(species: NormalSpecies, level: number): string[] {
  return species.learnset
    .filter((entry) => entry.level <= level)
    .sort((a, b) => a.level - b.level)
    .map((entry) => entry.skillId)
}

/**
 * Đổi quái thành loài `target` (mục "Tiến hóa" ở evolution-skills.md): đổi loài, loài gốc, race,
 * hệ (giữ Bootleg), giới tính theo loài mới; race mới không có nhân hình thì về bản thể; bỏ hướng
 * tiến hóa chờ và cờ vừa thoái hóa; bỏ nhóm huyết mạch loài mới không thuộc; skill của loài mới ở
 * level ≤ level quái qua offerSkills. Giữ level, EXP, gen, trait, skill cũ, trang bị, máu đã mất
 * (quái còn sống không gục vì max HP tụt).
 */
export function changeSpecies(
  data: GameData,
  monster: Monster,
  { target, rng }: { target: NormalSpecies; rng: RngState }
): SpeciesChangeResult {
  const [gender, nextRng] = genderAfterEvolution(data, rng, monster, target.id)
  const changed: Monster = {
    ...monster,
    gender,
    speciesId: target.id,
    baseSpeciesId: target.id,
    raceId: target.raceId,
    humanForm:
      monster.humanForm === 'human' && !data.races[target.raceId].humanForm
        ? 'beast'
        : monster.humanForm,
    elementIds: speciesElementsFor(target, monster),
    pendingEvolutionIds: [],
    devolvedFromSpeciesId: null,
    // Nhóm huyết mạch theo cả chuỗi tiến hóa nên thường giữ đủ; nhóm loài mới không thuộc thì bỏ.
    bloodlines: keepValidBloodlines(data, monster.bloodlines, target.id)
  }
  const offered = offerSkills(data, changed, learnedUpTo(target, monster.level))
  const alive = keepAlive(data, !isFainted(data, monster), offered.monster)
  return { monster: alive, events: offered.events, rng: nextRng }
}
