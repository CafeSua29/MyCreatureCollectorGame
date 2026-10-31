// Trận đấu 2v2: action public (lượt, chạy, thay quái, rời trận), sát thương, tỉ lệ bắt, gợi ý
// lệnh của AI cho phe người chơi. Các file khác trong folder (draft, turn, outcome...) và phần còn
// lại của ai.ts là chi tiết nội bộ.

export * from './battleActions'
export { suggestBattleCommands, type SuggestOptions } from './ai'
export * from './autoBattle'
export { suggestTamerCommand, tamerSkillBlocker } from './tamerSkills'
export { battleCatchChance } from './battleItems'
export * from './damage'
export {
  challengeArena,
  challengeGym,
  challengeTournament,
  enterTournament,
  forfeitTournament
} from './trainerBattles'
export { abandonTrial, challengeTower, challengeTrial, enterTrial } from './trials'
export { enterZone, exploreZone, leaveZone } from './zones'
export { assertReadyForBattle } from './trainerBattles'
export { failBeastTide } from './specialBattles'
export {
  acceptRecruit,
  declineRecruit,
  intimidateChance,
  isRecruitBattle,
  recruitChance
} from './recruit'
export * from './eventBattles'
