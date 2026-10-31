// Bảng nhiệm vụ trong chơi liên tục (mục "Nhiệm vụ" ở simulation-features.md,
// docs/rules/quests.md): mỗi lần ở thị trấn, "người chơi" nhận thưởng mọi nhiệm vụ đã xong, hủy
// nhiệm vụ mô phỏng không làm được (bắt, fuse, breed: chơi liên tục không làm các việc đó), rồi
// nhận nhiệm vụ làm được trên bảng cho đủ số tối đa (theo thứ tự bảng; bảng không có thì nhận rồi
// hủy để đổi nhiệm vụ).

import { type GameData, type GameState, type QuestInstance } from '@core'
import { simAct } from './events'

/** Loại nhiệm vụ chơi liên tục tự tiến triển được (hạ quái, hạ boss tầng, trứng nở). */
const DOABLE_TYPES: readonly string[] = ['defeat', 'defeatFloorBoss', 'hatch']

const doable = (quest: QuestInstance): boolean => DOABLE_TYPES.includes(quest.objective.type)

/** Số lần nhận-rồi-hủy tối đa mỗi lần ở thị trấn để đổi bảng. */
const CHURN_LIMIT = 10

/** Nhận thưởng nhiệm vụ đã xong, nhận thêm cho đủ; trả state và số nhiệm vụ đã nhận thưởng. */
export function runQuests(data: GameData, state: GameState): { state: GameState; claimed: number } {
  let claimed = 0
  for (const quest of state.quests.active) {
    if (quest.progress >= quest.target) {
      state = simAct(data, state, { type: 'claimQuest', questId: quest.id })
      claimed++
    } else if (!doable(quest)) {
      state = simAct(data, state, { type: 'abandonQuest', questId: quest.id })
    }
  }
  // Bảng không có nhiệm vụ làm được: nhận rồi hủy nhiệm vụ đầu bảng để bảng ra nhiệm vụ mới (như
  // người chơi thật), tối đa CHURN_LIMIT lần mỗi lần ở thị trấn.
  for (let churn = 0; state.quests.active.length < data.config.quests.maxActive;) {
    const next = state.quests.board.find(doable)
    if (next) {
      state = simAct(data, state, { type: 'acceptQuest', questId: next.id })
      continue
    }
    const first = state.quests.board[0]
    if (!first || churn++ >= CHURN_LIMIT) break
    state = simAct(data, state, { type: 'acceptQuest', questId: first.id })
    state = simAct(data, state, { type: 'abandonQuest', questId: first.id })
  }
  return { state, claimed }
}
