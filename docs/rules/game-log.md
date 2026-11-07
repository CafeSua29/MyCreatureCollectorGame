# Log ngoài trận

Code: `model/gameLog.ts` (kiểu `GameLogEntry`, `appendLog`), `game/reducer.ts` (xóa log trước mỗi action, ghi `researchLevelUp`), `game/validateGameLog.ts` (kiểm tra save), `game/bigFields.ts` (`LOG_BIG_FIELDS`). Test: `game/gameLog.test.ts` và test của từng tính năng ghi log.

## Luật

- `GameState.log: GameLogEntry[]` (save v98) = **những gì action gần nhất gây ra mà không nằm trong log trận** (`BattleState.log`), để UI báo người chơi. UI đọc `state.log` ngay sau mỗi action.
- **Chỉ `gameReducer` xóa log**: trước khi xử lý action, log về rỗng; hàm action chỉ **ghi thêm** bằng `appendLog(state, ...entries)` (không tự xóa, không thay log). Một action có thể ghi nhiều nguồn theo thứ tự xảy ra (ví dụ khu bảo tồn rồi sự kiện qua ngày lúc ra khu; nghiên cứu lên cấp luôn ghi cuối).
- Action **lỗi** (`ActionError`) hoặc **không đổi gì** (trả lại đúng state) giữ nguyên state, kể cả log cũ.
- Action trong trận (`submitTurn`...) cũng xóa log: diễn biến trận ở log trận; log ngoài trận của action đó chỉ có thứ ngoài trận (thời gian trôi lúc rời trận, kết quả event sau trận, nghiên cứu lên cấp...).
- Gọi thẳng hàm action (test, mô phỏng không qua reducer) thì log cộng dồn; mô phỏng luôn đi qua `gameReducer`.
- Thứ chỉ cần trạng thái hiện tại (đang có / chưa có) **không** ghi log mà đọc từ state: thành tựu đạt bậc chờ nhận (`achievementStatus`; tính lại mọi thành tựu sau mỗi action để ghi log thì tốn, `achievements.md`), thưởng nghiên cứu chờ nhận (`researchStatus.hasUnclaimedReward`), Tera Orb đã sạc (`teraOrbCharged`), hóa hình (`humanForm` của quái).

## Loại dòng log

Union theo chủ đề (thêm loại = thêm vào union con đúng chủ đề + một mục ở `GAME_LOG_FIELDS`; TypeScript báo nếu thiếu):

| Union con                             | Nguồn                                                        | Loại                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DayEvent` (`model/time.ts`)          | thời gian trôi (`advanceTime`, việc theo ngày)               | `diedOfOldAge`, `legacyEggHatched`, `monsterAutoJoined`, `gameOver` (Nuzlocke, `challenge-modes.md`), `nearingLifespanEnd`, `imprintRequest`, `imprintFinished`, `expeditionReturned`, `cropRipe`, `bondBroken`, `beastTideWarning`, `beastTideArrived`, `worldBossAppeared`, `worldBossLeft`, `auctionWon`, `auctionLost`, `consignmentSold`, `consignmentReturned` (`auction.md`; `lifespan.md` và mục của từng việc) |
| `EventLogEntry` (`model/events.ts`)   | chọn lựa chọn event, sau trận event, thú triều (`events.md`) | `eventResolved`, `itemGained`, `itemSpent`, `moneyGained`, `moneyLost`, `equipmentGained`, `eggGained`, `monsterJoined`, `monsterRefused`, `equipmentLost`, `partyHealed`, `statusApplied`, `statusImmune`, `modifierAdded`, `tempShopOpened`, `chainStarted`, `chainAdvanced`, `chainEnded`, `battleStarted`, `beastTideArrived` (lúc vào thị trấn), `beastTideRetreated`                                              |
| `SafariLogEntry` (`model/safari.ts`)  | action khu bảo tồn (`safari-zone.md`)                        | `safariEncounter`, `safariThrowBall`, `safariBreakFree`, `safariCaught`, `safariLure`, `safariFled`, `safariSkipped`, `safariVisitEnded`                                                                                                                                                                                                                                                                                |
| `ActionLogEntry` (`model/gameLog.ts`) | action khác                                                  | xem bảng dưới                                                                                                                                                                                                                                                                                                                                                                                                           |

| Loại                            | Trường                                                                          | Action (file luật)                                        |
| ------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `gathered`                      | `method, tier, lureItemId, items, encounter`                                    | `fish` / `mine` (`gathering.md`)                          |
| `presetMissing`                 | `presetId, monsterIds, items`                                                   | `applyTeamPreset` khi có quái / món bỏ qua (`roster.md`)  |
| `crafted`                       | `station, recipeId, successes, failures`                                        | `craft` (`alchemy.md`, `cooking.md`)                      |
| `trialBoonChosen`               | `boonId, stacks`                                                                | `chooseTrialBoon` (`trial-boons.md`)                      |
| `trialBoonSkipped`              | `money` (`Decimal`)                                                             | `skipTrialBoon` (`trial-boons.md`)                        |
| `zoneStep`                      | `zoneId, result` (`ZoneStepResult`)                                             | `exploreZone` (`zones.md`)                                |
| `portalOpened` / `portalClosed` | `portalId, zoneId`                                                              | việc theo ngày (`zones.md` mục "Cổng thế giới")           |
| `fused`                         | `baseId, outcome` (`success` / `failed` / `protected`)                          | `fuse` (`fusing.md`)                                      |
| `breakthrough`                  | `success, realm` (cảnh giới sau lần thử)                                        | `tamerBreakthrough` (`tamer.md`)                          |
| `contractAttempted`             | `monsterId, outcome` (`success` / `failed` / `escaped`)                         | `formContract` (`tamer.md`)                               |
| `implanted`                     | `monsterId, tierId, success, fails, died`                                       | `implant` (`implant.md`); bản mệnh chết thêm `bondBroken` |
| `markGained` / `markRemoved`    | `monsterId, markId, targetId?, level, source` / `..., reason`                   | `treatMark`, `useItem`, `rebirthMonster`, `implant`, linh dịch theo ngày, event `mutateParty` (`marks.md`; cùng dạng `MarkLogEntry` với log trận)|
| `researchLevelUp`               | `speciesId, level` (cấp mới)                                                    | mọi action, ghi ở `gameReducer` (`species-research.md`)   |
| `equipmentCast`                 | `instanceId, itemId, rarity`                                                    | `castEquipment` (`equipment-forge.md`)                    |
| `equipmentSalvaged`             | `instanceIds, enhanceStones, refiningStones, soulPoints, spirits` (tổng cả lần) | `salvageEquipment` (`equipment-forge.md`)                 |
| `gachaPulled`                   | `eggIds` (theo thứ tự)                                                          | `pullGacha` (`gacha.md`)                                  |

## Save

- Trường `Decimal` trong log khai báo ở `LOG_BIG_FIELDS` (`bigFields.ts`, kiểu suy từ union: thêm dòng có `Decimal` mà quên khai báo thì TypeScript báo): `nearingLifespanEnd.yearsLeft`, `moneyGained.amount`, `moneyLost.amount`, `beastTideRetreated.moneyLost`.
- Kiểm tra (`validateGameLog`): `log` là danh sách; mỗi dòng có loại đã biết, đủ trường bắt buộc (`GAME_LOG_FIELDS`), trường `Decimal` hợp lệ. Không tra chéo id (log chỉ để báo, quái / món trong log có thể đã mất).
- v98 (migrate `addGameLog`): bỏ `dayEvents`, `events.log`, `safari.log`, `gathering` (`{ lastResult }`), `teamPresets.lastMissing`, `lastCraft` của `alchemy` / `smithing` / `cooking`, `zones.visit.lastStep`; `log = []` (log chỉ là kết quả của action gần nhất).
- Đã bỏ hàm suy kết quả từ state trước / sau (`fuseOutcome`, `breakthroughOutcome`, `contractOutcome`): UI và mô phỏng đọc log.
