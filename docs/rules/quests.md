# Bảng nhiệm vụ

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

NPC ở thị trấn có **bảng nhiệm vụ** luôn đủ `boardSize` (5) nhiệm vụ; người chơi **nhận tối đa `maxActive`** (3) cùng lúc. Số ở `balance.json` khóa `quests` và `src/data/quests.json`; số hiện tại ở `balance-systems.md`.

Code: module `quests/` (`quests.ts`: registry `QUEST_TYPES`, `rollQuest`, `refillQuestBoard`, `acceptQuest`, `abandonQuest`, `claimQuest`, `recordQuestEvent`), kiểu `model/quests.ts`, kiểm tra dữ liệu `gameData/validateQuests.ts`, kiểm tra save `game/validateQuestState.ts`. Nhập dữ liệu: `scripts/data-import/quests-import.mjs`. Module `quests/` nằm dưới battle / world / progression (chỉ phụ thuộc shared, model, inventory) để các nơi phát sự kiện gọi được.

## Mẫu nhiệm vụ (`quests.json`, tên ở `i18n/<ngôn ngữ>/quests.json`)

- `{ id, type, params, countMin, countMax, weight, reward: { moneyPerFloor, items: [{ itemId, count }] } }`: `type` theo registry `QUEST_TYPES` (params kiểm tra theo handler), số lần cần nguyên trong [countMin, countMax], trọng số > 0, thưởng tiền ≥ 0 × tầng, vật phẩm gộp chồng.
- **Loại** (thêm loại = thêm handler `{ validateParams, rollObjective, matches }`):

| Loại              | params                                | Mục tiêu tung lúc ra nhiệm vụ                        | Sự kiện tính                           |
| ----------------- | ------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| `catchElement`    | không                                 | hệ ngẫu nhiên (đều trên mọi hệ)                      | bắt quái có hệ đó (hệ lúc bắt)         |
| `catchRace`       | không                                 | race ngẫu nhiên (đều trên mọi race)                  | bắt quái race đó                       |
| `defeat`          | `floorOffset` nguyên ≥ 0 (dữ liệu: 2) | tầng tối thiểu = max(1, tầng cao nhất − floorOffset) | mỗi quái bị hạ ở tầng ≥ tầng tối thiểu |
| `defeatFloorBoss` | không                                 |                                                      | hạ boss tầng của map (bất kỳ tầng)     |
| `hatch`           | không                                 |                                                      | mỗi trứng nở                           |
| `fuse`            | không                                 |                                                      | mỗi lần fuse **thành công**            |
| `breed`           | không                                 |                                                      | mỗi lần breed                          |

## Luật

- **Ra nhiệm vụ** (`rollQuest`): mẫu theo trọng số, mục tiêu, số lần cần, thưởng (tiền = `moneyPerFloor × highestFloor` lúc ra nhiệm vụ, `Decimal`; vật phẩm theo mẫu) đều tung sẵn bằng RNG của state. Id `q<số>` theo `quests.nextQuestId`.
- **Bảng bổ sung cho đủ** (`refillQuestBoard`): lúc tạo game mới, vào thị trấn (`travel`, thua trận về thị trấn), sau khi nhận nhiệm vụ. Không có mẫu nào thì bảng rỗng.
- `acceptQuest { questId }` (thị trấn): nhiệm vụ rời bảng thành đang nhận, tiến độ 0; quá số tối đa `tooManyQuests { maxActive }`, id lạ `questNotFound { questId }`.
- `abandonQuest { questId }` (ngoài trận, ở đâu cũng được): bỏ, không mất gì.
- **Tiến độ chỉ tính sau khi nhận** (`recordQuestEvent`, + 1 mỗi sự kiện khớp, không vượt số cần): bắt quái (`throwBall` thành công, cả quái thu phục: Thị Uy, nhận lời xin theo, `recruit.md`; cả quái bắt ở khu bảo tồn, `safari-zone.md`), quái bị hạ / boss tầng bị hạ (`applyWin`), trứng nở (sau trận thắng), fuse thành công (`fuse`), breed (`breed`).
- `claimQuest { questId }` (về thị trấn): nhiệm vụ đã đủ tiến độ thì nhận tiền + vật phẩm, rời danh sách đang nhận; chưa xong `questNotComplete { questId, progress, target }`.
- **State** `GameState.quests: { board, active, nextQuestId }`; kiểm tra save: bảng ≤ boardSize, đang nhận ≤ maxActive, mẫu / loại tồn tại, `target` nguyên ≥ 1, tiến độ 0..target (chỉ ở nhiệm vụ đang nhận), tiền thưởng `Decimal` ≥ 0 (vị trí `Decimal` trong `bigFields.ts`), id không trùng và nhỏ hơn `nextQuestId`.
- Thưởng có Kẹo EXP (`exp-candy.md`) theo mẫu.

## Mô phỏng

- Chơi liên tục: "người chơi" nhận thưởng nhiệm vụ xong, hủy loại mô phỏng không làm được, nhận loại làm được; bảng không có thì nhận rồi hủy để đổi nhiệm vụ. Cột `quests` ở `progression.csv` (`scripts/simulate/quests.ts`, `simulation-features.md`).

- Nhiệm vụ tông môn dùng lại registry ở danh sách riêng `quests.sect` (tự nhận, thưởng cống hiến; `recordQuestEvent` tính cả hai danh sách; `sects.md`). `claimQuest` cộng bộ đếm `questsCompleted` (điểm thiên phú ngự thú sư, `tamer-talents.md`).
