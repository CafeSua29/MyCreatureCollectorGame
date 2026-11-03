# Nghiên cứu loài

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Research Tasks của Pokémon Legends: Arceus: mỗi loài có **nhiệm vụ nghiên cứu**; điểm cộng dồn thành **cấp nghiên cứu**, cấp mở thông tin trang Dex và cho lợi ích **riêng loài đó**. Mở rộng Dex (`dex.md`), bước 8d (2026-11-01). Số là **số tạm** ở `balance.json` khóa `research`.

Code: `model/research.ts` (type, `RESEARCH_TASK_KINDS`, `RESEARCH_TASK_SCOPES`, loại lợi ích), `registries/research.ts` (nhiệm vụ của loài, điểm, cấp, lợi ích, cộng bộ đếm; điểm duy nhất), `roster/research.ts` (action `claimResearchReward`, `researchStatus` cho UI), `gameData/validateResearch.ts`, `game/validateResearchState.ts`.

## Nhiệm vụ

- `config.research.tasks`: **mẫu nhiệm vụ chung** `{ kind, thresholds, points, scope? }` áp cho mọi loài thuộc Dex (`isDexSpecies`); mỗi mốc `thresholds` (nguyên ≥ 1, tăng ngặt) bộ đếm đạt tới cho `points` điểm. `scope` theo registry `RESEARCH_TASK_SCOPES` (thêm phạm vi = thêm mục): `all` (mặc định), `evolvedForm` (loài có dạng trước, `preEvolutionsOf`).
- `config.research.speciesTasks: { [speciesId]: { kind, thresholds, points }[] }`: **nhiệm vụ riêng** thêm sau mẫu chung (tùy chọn, chủ project thêm dần; loài phải thuộc Dex). Nhiều nhiệm vụ cùng loại việc dùng chung một bộ đếm.
- Lệch roadmap: mẫu nhiệm vụ để trong `balance.json` thay file `researchTasks.json` riêng (toàn là số cân bằng, không có chữ; đỡ một loại file dữ liệu).

| Loại việc (`kind`)     | Chỗ đếm                                                                                                    | Mẫu (số tạm)               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| `caught`               | quái bắt bằng bóng / Thị Uy (hết trận, mọi kết quả), quái xin theo (`recordRecruit`), khu bảo tồn          | 1 / 3 / 5 / 10 / 25 × 10 đ |
| `defeated`             | quái địch đã gục khi trận kết thúc (mọi kết quả, cả quái của NPC)                                          | 5 / 20 / 50 / 100 × 10 đ   |
| `mainElementSkillSeen` | số lần mỗi quái trong trận (**cả hai phe**) dùng bằng lệnh skill cùng hệ chính (hệ đầu) của loài nó (`skillUses`) | 5 / 20 × 10 đ       |
| `evolvedInto`          | tiến hóa (cả dị biến) ra loài đó: sau trận thắng, chọn hướng, kẹo / đá tiến hóa (`recordEvolutionResearch` đọc log tiến hóa) | 1 / 3 × 20 đ, `evolvedForm` |
| `hatched`              | trứng nở sau trận thắng, trứng truyền thừa nở                                                              | 1 / 5 × 20 đ               |
| `caughtWithStatus`     | bắt bằng bóng khi quái đang có trạng thái `debuff` (xét trước khi Heal Ball chữa)                          | 1 / 5 × 10 đ               |
| `caughtShiny`          | quái bắt (như `caught`) có shiny                                                                           | 1 × 50 đ                   |

- Cộng chỉ qua `recordResearch` / `recordMonsterResearch` / `recordCaughtResearch` / `recordEvolutionResearch` ở chỗ phát sinh (như `bumpStat` của thành tựu). Quái tính **loài hiện tại và loài gốc** (`dexSpeciesOf`, chung với Dex: quái fuse tính loài gốc), chỉ loài thuộc Dex. Bộ đếm nguyên, dừng ở `MAX_SAFE_INTEGER`.
- Thêm loại việc: thêm vào `RESEARCH_TASK_KINDS` + gọi hàm cộng ở chỗ phát sinh.

## Cấp nghiên cứu

- Điểm = tổng `points` × số mốc đã đạt của mọi nhiệm vụ của loài (`researchPoints`). Cấp = số mốc `levelPoints` đã đạt (`researchLevel`; 0 = chưa nghiên cứu). Số tạm `[10, 20, 30, 45, 60, 75, 90, 105, 120, 130]`: cấp 1 = bắt 1 lần, **Hoàn thành** (cấp 10, `isResearchComplete`) = 130 điểm, đạt được chỉ bằng bắt / hạ / skill / trạng thái nên loài không breed được, dạng đầu, không shiny vẫn hoàn thành được (như PLA cần 100 điểm, không bắt buộc mọi nhiệm vụ).
- Cấp **suy ra từ bộ đếm**, không lưu (lệch roadmap `{ counters, level }`: lưu cấp là lưu số suy ra được). Lên cấp ghi log ngoài trận `researchLevelUp { speciesId, level }` (cấp mới) ở `gameReducer` sau mọi action (`researchLevelUps`, chỉ xét loài có mục đổi; bộ đếm tăng cả trong lẫn ngoài trận; `game-log.md`).

## Lợi ích theo cấp

`config.research.benefits: { level, type, percent? }[]` (cấp trong [1, cấp tối đa]); loại mở thông tin không có `percent`, loại % có `percent` khác 0, ≥ −100, cộng dồn các lợi ích cùng loại đã đạt rồi nhân `1 + % / 100` (`researchMultiplier`), nhân cùng mọi nguồn khác của kênh đó.

| Cấp (tạm) | Loại                         | Tác dụng                                                                                                                  |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 2         | `revealProfile`              | trang Dex mở chỉ số gốc / race / hệ (`dexEntry.profileRevealed`; UI ẩn khi chưa mở)                                         |
| 4         | `revealLearnset`             | trang Dex mở learnset và tiến hóa (`learnsetRevealed`)                                                                     |
| 5         | `catchRatePercent` 10        | tỉ lệ bắt loài đó (`battleCatchChance`, `safariCatchChance`)                                                               |
| 6         | `revealWeakPoints`           | biết mọi điểm yếu của loài (Dex `revealedParts` = mọi bộ phận; AI phe người chơi dùng qua `revealedBodyParts`), thêm cách biết điểm yếu ngoài đánh trúng (`hit-locations.md`) |
| 7         | `expPercent` 20              | EXP từ quái loài đó bị hạ / bị bắt (`battleExp`, từng quái; cả EXP ngự thú sư lấy từ EXP trận)                              |
| 10        | `shinyChancePercent` 100     | tỉ lệ shiny của loài đó ở mọi chỗ Bùa Lấp Lánh nhân: quái hoang / boss tầng (`EncounterOdds.speciesShinyMultiplier`, nhân theo loài vừa tung), khu bảo tồn, con breeding (theo loài con) |

## Thưởng theo cấp

- `config.research.levelRewards: { level, items: [{ itemId, count }] }[]` (cấp tăng ngặt, vật phẩm gộp chồng). Số tạm: cấp 5 → 2 Bóng cao cấp, cấp 10 → 1 **Kẹo Hiếm** (`exp-candy.md`).
- **`claimResearchReward { speciesId }`** (ngoài trận, ở đâu cũng được): nhận mọi thưởng có cấp > `claimedLevel` và ≤ cấp hiện tại, rồi `claimedLevel` = cấp hiện tại. Nhận bằng action như mốc Dex / thành tựu. Lỗi: `inBattle`, `researchSpeciesNotFound { speciesId }` (không phải loài thuộc Dex), `researchNoReward { speciesId, level }`.

## Bùa Lấp Lánh và danh hiệu

- Thành tựu `speciesResearch` (điều kiện `researchCompleted` = số loài đã Hoàn thành, `achievements.md`): 10 / 50 loài tiền; **100 loài: Bùa Lấp Lánh** (`shinyCharm`, như Shiny Charm của PLA khi hoàn thành nghiên cứu); 500 loài danh hiệu **Nhà Nghiên Cứu** (`researcher`, tỉ lệ bắt +5%); 1000 loài **Giáo Sư** (`professor`, shiny +10%); sau đó lặp ×2 thưởng tiền. Bùa Lấp Lánh còn có ở mốc Dex 100% (`dex.md`); có nhiều bùa vẫn tính một lần.
- Lệch roadmap: Bùa / danh hiệu qua thành tựu (dùng chung cách nhận thưởng) thay cho luật riêng `charmSpecies`.

## Mô phỏng

- Chơi liên tục nhận thưởng cấp ở thị trấn (`claimResearchRewardsWhenPossible`, `simulation-features.md`); cột `research` / `researchLv` trong ô kinh tế. Mô phỏng 2026-11-01 (`--parts progression`, kịch bản mặc định): tới tầng 10 cấp nghiên cứu cao nhất của một loài là 2–3 (chưa tới cấp 5 có lợi ích %), chưa nhận thưởng cấp nào; số trận quái hoang và level ở tầng 10 của mọi đội trùng hệt lần chạy trước. **Mục tiêu**: thưởng dài hạn cho loài farm / bắt nhiều, không quyết định tiến trình đầu game: khớp.

## UI

- `researchStatus(data, research, speciesId)`: cấp, cấp tối đa, điểm, điểm cấp kế tiếp (null = Hoàn thành), từng nhiệm vụ (loại, bộ đếm, mốc, điểm), còn thưởng chờ nhận. `dexEntry` kèm `research`, `profileRevealed`, `learnsetRevealed`. Màn hình chờ UI (bước 7).

## State, save

- `GameState.research: { [speciesId]: { counters: { [kind]?: number }, claimedLevel } }` (chỉ loài đã tương tác). Kiểm tra save (`validateResearchState`): loài thuộc Dex, bộ đếm theo loại đã biết (nguyên ≥ 0), `claimedLevel` nguyên trong [0, cấp tối đa]. Save v87: migrate tạo `caught: 1` cho mỗi loài đã sở hữu trong Dex (`state-versions.md`).
- Giữ qua phi thăng (như Dex; `ascension.md`).

## Chưa có

- Màn hình nghiên cứu / trang Dex theo cấp (chờ UI, bước 7). Nhiệm vụ riêng của loài cụ thể (chủ project thêm dần vào `speciesTasks`).
