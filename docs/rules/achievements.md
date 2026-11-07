# Thành tựu và danh hiệu

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

**Thành tựu** ghi nhận cột mốc theo bậc; bậc đạt rồi thì nhận thưởng (tiền, vật phẩm, **danh hiệu**). Ngự thú sư đeo một danh hiệu để nhận buff nhỏ toàn cục. Bước 8b (2026-11-01, sau Bộ sưu tập). Số thưởng / buff là **số tạm** trong `achievements.json` / `titles.json`.

Code: `model/achievements.ts` (type, `STAT_KEYS`, `ACHIEVEMENT_CONDITION_TYPES`, `TAMER_BONUS_TYPES` ở `model/tamerTalents.ts`), `registries/gameStats.ts` (bộ đếm), `registries/achievements.ts` (điều kiện, bậc), `registries/tamerBonuses.ts` (hiệu ứng danh hiệu = kênh thưởng ngự thú sư, `tamer-talents.md`), `roster/achievements.ts` (action, tình trạng cho UI), `gameData/validateAchievements.ts`, `game/validateAchievementState.ts`.

## Bộ đếm

- `GameState.stats`: số nguyên ≥ 0 theo khóa `STAT_KEYS` (đếm số lần làm việc nên là `number`, dừng ở `MAX_SAFE_INTEGER`). Chỉ đếm việc **không suy ra được từ state**; số suy ra được (tầng cao nhất, cảnh giới, huy hiệu, bậc đấu trường, tầng tháp, Dex) điều kiện đọc thẳng state. Cộng chỉ qua `bumpStat` / `countCaught`, gọi ở chỗ phát sinh:

| Khóa                                               | Chỗ cộng                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `battlesWon`, `bossesDefeated`, `trainersDefeated` | `finish` (`battle/outcome.ts`) khi thắng; boss không tính Thiên Kiếp (độ kiếp đếm riêng); NPC = trận có `battle.trainer` (mọi chế độ) |
| `monstersCaught`, `shinyCaught`                    | `finish` (quái bắt bằng bóng / Thị Uy, mọi kết quả trận), nhận quái xin theo (`recordRecruit`), khu bảo tồn (`takeCaught`)            |
| `eggsHatched`                                      | trứng nở sau trận thắng, trứng truyền thừa nở khi đội trống (`refillEmptyParty`)                                                      |
| `fusions`, `breeds`                                | fuse thành công, nhận trứng breed                                                                                                     |
| `tribulationsPassed`                               | độ kiếp thắng (`battle/tribulation.ts`)                                                                                               |
| `tournamentsWon`                                   | vô địch giải đấu                                                                                                                      |
| `pillsCrafted`, `itemsForged`, `dishesCooked`      | số lần luyện thành công theo nơi luyện (`CRAFT_STATION_RULES.craftedStat`); đúc trang bị cộng `itemsForged`                           |
| `oldAgeDeaths`                                     | quái tọa hóa (`ageOneDay`)                                                                                                            |
| `questsCompleted`                                  | nhận thưởng nhiệm vụ (`claimQuest`; điểm thiên phú ngự thú sư, `tamer-talents.md`; save v93)                                          |
| `gachaPulls`                                       | số trứng quay ở Cây thần (`pullGacha`, `gacha.md`; save v96)                                                                          |

- Thêm khóa: thêm vào `STAT_KEYS` + gọi `bumpStat` ở chỗ phát sinh + migrate thêm khóa 0 (kiểm tra save đòi đủ khóa).

## Thành tựu

- `src/data/achievements.json`: `{ id, condition, tiers: [{ value, rewards }], repeat? }`, tên ở i18n `achievements`.
- **Điều kiện** `{ type, ...params }` theo registry `ACHIEVEMENT_CONDITIONS` (thêm loại = thêm mục; mỗi mục có trường, kiểm tra params, tiến độ đọc từ state, trần tiến độ):

| Loại                                     | Tiến độ                                                                                                                                                                         | Trần                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `stat { key }`                           | bộ đếm                                                                                                                                                                          | không                 |
| `dexOwned`                               | số loài đã sở hữu (Dex)                                                                                                                                                         | không                 |
| `dexPercent`                             | % loài đã sở hữu (`dexOwnedPercent`)                                                                                                                                            | 100                   |
| `shinySpecies`                           | số loài đã có bản shiny                                                                                                                                                         | không                 |
| `bootlegForms`                           | số Bootleg (loài + hệ) đã sở hữu (`bootleg.md`)                                                                                                                                  | không                 |
| `researchCompleted`                      | số loài đã Hoàn thành nghiên cứu (`researchCompletedCount`, `species-research.md`)                                                                                              | không                 |
| `highestFloor`                           | tầng cao nhất từng đạt (`aptitudeFloor`, kể cả trước khi phi thăng)                                                                                                             | không                 |
| `tamerRealm`                             | cảnh giới ngự thú sư                                                                                                                                                            | không                 |
| `towerFloor`                             | tầng tháp thí luyện cao nhất (`tower.highest`)                                                                                                                                  | không                 |
| `gymBadges`                              | số huy hiệu (đạo quán `wins > 0`)                                                                                                                                               | không                 |
| `arenaRank`                              | bậc đấu trường                                                                                                                                                                  | không                 |
| `ownSpecies { speciesIds }`              | số loài trong danh sách đã từng sở hữu (Dex)                                                                                                                                    | số loài của danh sách |
| `aptitude { tierId }`                    | số quái đang sở hữu (đội + kho) có tư chất từ bậc này (`hasAptitudeAtLeast`)                                                                                                    | không                 |
| `speciesRank { rankId }`                 | số loài đã sở hữu có phẩm cấp từ bậc này (`speciesRankOf` / `speciesRankIndex`)                                                                                                 | không                 |
| `challengeFloor { difficulty?, modes? }` | tầng cao nhất nếu mức thấp nhất từng dùng không dễ hơn `difficulty` và đang chơi đủ chế độ `modes` (`nuzlocke` / `hardcore` / `randomizer`), không thì 0 (`challenge-modes.md`) | không                 |

- **Bậc**: `tiers` không rỗng, `value` số dương tăng ngặt, không vượt trần của điều kiện. **Không trần**: `repeat { factor, rewards }` sinh tiếp sau bậc cuối, mỗi bậc = max(bậc trước + 1, ⌈bậc trước × factor⌉) (`factor` > 1); bậc lặp không thưởng danh hiệu (mỗi danh hiệu một nguồn); điều kiện có trần không được có `repeat`. Bậc vượt `MAX_SAFE_INTEGER` coi như không có (tiến độ không bao giờ tới).
- **Thưởng** `rewards { moneyPerFloor?, items?: [{ itemId, count }], titleId? }`: tiền = `moneyPerFloor × highestFloor` (như Dex), vật phẩm gộp chồng, danh hiệu (đã có thì thôi).
- **Nhận thưởng** `claimAchievement { achievementId }` (ngoài trận, ở đâu cũng được): nhận **mọi bậc đã đạt mà chưa nhận** một lần, `achievements.claimedTiers[id]` = số bậc đã nhận. Thưởng nhận bằng action (như mốc Dex, nhiệm vụ) thay cho tự cộng kèm log `achievementUnlocked` của roadmap: tiến độ đọc từ state nên UI tự biết bậc nào chờ nhận; đạt bậc không ghi log ngoài trận vì phải tính lại mọi thành tựu sau mỗi action (`game-log.md`) (`achievementStatus`: tiến độ, bậc đã đạt / đã nhận, giá trị bậc kế tiếp). Lỗi: `inBattle`, `achievementNotFound { achievementId }`, `achievementNotReached { achievementId, need, have }`, `achievementCompleted { achievementId }` (đã nhận hết bậc của thành tựu có trần).
- Tiến độ của `aptitude` là số quái **hiện có** (thả quái thì giảm); bậc đã nhận không mất.

## Danh hiệu

- `src/data/titles.json`: `{ id, effects: [{ type, params: { percent } }] }` (danh sách có thể rỗng: danh hiệu chỉ để trưng), tên ở i18n `titles`. Nguồn: thưởng bậc thành tựu (gồm thành tựu đạo quán / giải đấu / tháp / Dex / nghiên cứu loài, thay cho nguồn riêng ở từng tính năng).
- Hiệu ứng là **kênh thưởng ngự thú sư** (`TAMER_BONUSES`, dùng chung với cây thiên phú ngự thú sư; bảng kênh và nơi dùng ở mục "Kênh thưởng" của `tamer-talents.md`; kiểm tra `checkTamerBonusEffects`), chỉ danh hiệu **đang đeo** có tác dụng; nơi dùng hỏi tổng của mọi nguồn qua `tamerBonusAmount` / `tamerBonusMultiplier`, lượng của riêng một danh hiệu `titleBonusAmount`. Danh hiệu dùng được mọi kênh, kể cả % chỉ số đội (`teamStatPercent`, nguồn % `tamerBonus`); dữ liệu hiện chỉ dùng các kênh EXP / tiền / đồ rơi / bắt / thu phục / shiny / luyện đan.
- **Đeo** `setTitle { titleId | null }` (ngoài trận, miễn phí; null = tháo; đeo lại cái đang đeo thì state giữ nguyên). Lỗi: `inBattle`, `titleNotFound { titleId }`, `titleNotOwned { titleId }`, `malformedAction`.

## State, save

- `GameState.stats` (đủ khóa `STAT_KEYS`, nguyên ≥ 0, không khóa lạ), `achievements = { claimedTiers: { [id]: số bậc ≥ 1 } }` (thành tựu tồn tại, bậc có thật), `titles = { owned, active }` (danh hiệu tồn tại, không trùng; `active` null hoặc thuộc `owned`); kiểm tra ở `validateAchievementState`. Save v86: migrate thêm bộ đếm 0 (việc trước đây không được đếm), chưa nhận bậc nào, chưa có danh hiệu (`state-versions.md`).

## Mô phỏng

- Chơi liên tục (`progression`) nhận mọi bậc đã đạt sau mỗi lần về thị trấn rồi đeo danh hiệu EXP cao nhất (bằng thì tiền) (`claimAchievementsWhenPossible`, `scripts/simulate/economy.ts`); cột `achievement` trong ô kinh tế = số bậc đã nhận.

## Chưa có

- Màn hình thành tựu / danh hiệu (chờ UI, bước 7).
- Thành tựu theo chế độ thử thách (chờ `challenge-modes.md`), event thưởng danh hiệu (chưa có event nào cần: thêm loại kết quả event khi có).
