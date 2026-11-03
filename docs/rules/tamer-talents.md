# Cây thiên phú ngự thú sư

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Perk Points của Siralim: ngự thú sư nhận **điểm thiên phú** (khác thiên phú quái ở `monster-talents.md`) để chọn hướng chơi qua 3 nhánh. Bước 9d (2026-11-02). Số là **số tạm** (`balance.json` khóa `tamerTalents`, `tamerTalents.json`; số hiện tại ở `balance-systems.md`).

Code: `model/tamerTalents.ts` (kiểu, `TAMER_BONUS_TYPES`), `registries/tamerTalents.ts` (điểm, `tamerTalentBlocker`), `registries/tamerBonuses.ts` (kênh thưởng `TAMER_BONUSES`, `tamerBonusAmount` / `tamerBonusMultiplier`), `registries/talents.ts` (phần chung với thiên phú quái: `RankedNode`, `rankedPointsSpent`, `rankedNodeBlocker`, `rankedNodeError`), `tamer/talents.ts` (action, `tamerTalentView`), `gameData/validateTamerTalents.ts` (kiểm tra dữ liệu, `checkTamerBonusEffects` dùng chung với danh hiệu). Dữ liệu: `src/data/tamerTalentBranches.json`, `src/data/tamerTalents.json`; tên ở `i18n/<ngôn ngữ>/tamerTalentBranches.json`, `tamerTalents.json`.

## Điểm

- **Không lưu điểm** (quy tắc 3, như thiên phú quái; lệch roadmap: roadmap ghi `talents: { points, ranks }`): **điểm nhận** `tamerTalentPointsEarned` = cảnh giới cao nhất từng đạt × `pointsPerRealm` (2, mỗi lần đột phá) + `stats.questsCompleted` × `pointsPerQuest` (1) + tổng `achievements.claimedTiers` × `pointsPerAchievementTier` (1) + `tamer.bonusTalentPoints`. Điểm đã dùng = Σ `costPerRank` × (1 + … + cấp); điểm còn = nhận − đã dùng (có thể âm nếu dữ liệu tăng giá sau khi nâng: chỉ không nâng thêm được).
- Bộ đếm mới **`questsCompleted`** (`STAT_KEYS`, `achievements.md`): + 1 mỗi lần `claimQuest` thành công.
- **Điểm thưởng đã lưu** `tamer.bonusTalentPoints` (nguyên ≥ 0, cộng thẳng vào điểm nhận): nguồn không suy ra được từ state, hiện là tông môn (nộp nhiệm vụ tông, thăng chức, vô địch tông chiến; `sects.md`); giữ khi rời tông.
- Phi thăng reset cảnh giới nên điểm theo cảnh giới tính bằng cảnh giới cao nhất từng đạt (`bestRealmReached`, `ascension.md`); cấp đã nâng giữ.

## Dữ liệu

- **Nhánh** (`tamerTalentBranches.json`) `{ id }`, chỉ để nhóm khi hiển thị: **Ngự Thú** `taming`, **Thu Phục** `capture`, **Kinh Doanh** `commerce`.
- **Nút** (`tamerTalents.json`) `{ id, branchId, requires?, maxRank?, costPerRank, effects }`: `requires` = `{ id nút: cấp tối thiểu }` (nhánh nào cũng được), `maxRank` bỏ trống = không trần, `effects` = danh sách kênh thưởng `{ type, params }`; hiệu ứng nhân hệ số = cấp (tuyến tính).
- **Kiểm tra dữ liệu:** trường lạ; `branchId` tồn tại; phần chung với thiên phú quái (`checkRankedNode`): `costPerRank` / `maxRank` nguyên ≥ 1, nút yêu cầu tồn tại, khác chính nút, cấp nguyên trong [1, `maxRank` của nút đó], không thành vòng; kênh có trong `TAMER_BONUSES`, params đúng. Config: số điểm nguyên ≥ 0, `resetItemId` là vật phẩm có thật.

## Kênh thưởng

Danh hiệu đang đeo (`achievements.md`), nút thiên phú ngự thú sư, buff chức vị tông môn (× (chức vị + 1), `sects.md`), nâng cấp Tiên giới và thiên mệnh (`ascension.md`, kèm bảng kênh riêng của mục đó) **cùng cộng vào một bộ kênh** (`TAMER_BONUS_TYPES`); nơi dùng chỉ hỏi `tamerBonusAmount(data, state, kênh)` (tổng % hoặc lượt) / `tamerBonusMultiplier` (1 + % / 100, không dưới 0), không biết nguồn nào cộng. Thêm kênh = thêm vào `TAMER_BONUS_TYPES` + một mục `TAMER_BONUSES` + gọi ở nơi dùng. Kênh `...Percent` có params `{ percent }` (khác 0, ≥ −100), `tamerSkillCooldown` có `{ turns }` (nguyên ≥ 1).

| Kênh | Nơi dùng |
| ---- | -------- |
| `expPercent`, `moneyPercent`, `dropRatePercent` | nhân EXP / tiền / tỉ lệ đồ rơi sau trận thắng (`applyWin`) |
| `catchRatePercent` | nhân tỉ lệ bắt trong trận và khu bảo tồn |
| `recruitPercent` | cộng vào `recruitBonusPercent` (thu phục, Thị Uy; `recruit.md`) |
| `shinyChancePercent` | nhân tỉ lệ shiny ở mọi chỗ Bùa Lấp Lánh nhân |
| `alchemySuccessPercent`, `smithingSuccessPercent`, `cookingSuccessPercent` | cộng vào % thành công của nơi luyện tương ứng (`CRAFT_STATION_RULES.bonusChannel`, `craftChance`) |
| `shopPricePercent` | nhân giá mua ở cửa hàng thị trấn (`shopBuyPrice`, cùng modifier event) và cửa hàng tạm của event (`tempShopPrice`); âm = rẻ hơn |
| `dwellingOutputPercent` | cộng vào cùng tổng % với công trình `outputBoost` (Linh mạch) ở `buildingPowers` (mọi công trình trừ `outputBoost`; `dwelling.md`) |
| `teamStatPercent` | % mọi chỉ số quái **phe người chơi trong trận**, nguồn % mới **`tamerBonus`** (`STAT_PERCENT_SOURCES`, qua `MonsterBattleContext.tamerBonusStatPercent`, như thưởng sưu tập) |
| `manaPercent` | linh lực tối đa đầu trận của người chơi × (1 + % / 100) (`newBattleTamer`, trước khi áp đạo thương / phản phệ) |
| `contractLevelPercent` | giới hạn level khế ước × (1 + % / 100), làm tròn xuống (`contractLevelLimit` / `realmToContract` nhận `levelPercent`; `playerContractLevelLimit` cho khế ước, tỉ lệ khế ước, không nghe lệnh; `tamer.md`) |
| `tamerSkillCooldown` | hồi chiêu kỹ năng ngự thú sư của người chơi − số lượt, không dưới 0 (`tamerSkillCooldown`, `battle/tamerSkills.ts`) |

- Danh hiệu dùng được mọi kênh (trước đây chỉ 7 kênh `TITLE_EFFECT_TYPES`; bỏ, thay bằng `TAMER_BONUS_TYPES`; `titlePercent` / `titleMultiplier` thay bằng `tamerBonusAmount` / `tamerBonusMultiplier`).

## Action

- **`allocateTamerTalent { nodeId }`**: ngoài trận, ở đâu cũng được. Cấp n → n + 1 tốn `costPerRank × (n + 1)`; phải đủ nút yêu cầu, chưa đạt `maxRank`. Lỗi (dùng chung mã với thiên phú quái): `unknownTalent { nodeId }`, `talentMaxRank { nodeId, maxRank }`, `talentRequires { nodeId, requiredId, rank }`, `notEnoughTalentPoints { need, have }`, `inBattle`, `malformedAction`.
- **`resetTamerTalents`** (tẩy): ngoài trận, ở đâu cũng được; tiêu 1 **Hoàn Nguyên Đan** `restorationPill` (`config.tamerTalents.resetItemId`; nguyên liệu, giá 20.000 × tầng, cửa hàng trọng số 1), xóa mọi cấp nên hoàn đủ điểm. Chưa nâng nút nào: `tamerTalentsEmpty` (không mất vật phẩm); thiếu vật phẩm: `notEnoughItem`. Lệch roadmap ("tẩy như thiên phú quái" bằng hiệu ứng vật phẩm): hiệu ứng vật phẩm luôn nhắm một quái, nên tẩy là action riêng tiêu vật phẩm (như Phá Cảnh Đan khi đột phá).
- `tamerTalentView(data, state)` cho UI / mô phỏng: `{ earned, spent, available, nodes }`, mỗi nút `{ nodeId, branchId, rank, nextCost, blocker }` theo thứ tự dữ liệu.

## State, save

- `GameState.tamer.talentRanks: { [nodeId]: cấp ≥ 1 }` (nút chưa nâng không có mục); kiểm tra save (`validateRanks`, chung với thiên phú quái): nút tồn tại, cấp nguyên ≥ 1, không quá `maxRank` (không xét điểm).
- Save v93: migrate `tamer.talentRanks = {}`, `stats.questsCompleted = 0` (nhiệm vụ trước đây không đếm); điểm theo cảnh giới / bậc thành tựu tự có.

## Mô phỏng

- Chơi liên tục: mỗi lần về thị trấn sau đột phá, "người chơi" dùng hết điểm, mỗi lần nâng nút nâng được rẻ nhất (hòa theo thứ tự dữ liệu, cùng cách với thiên phú quái; `allocateTamerTalents`, `scripts/simulate/talents.ts`); cột `tamerTalent` ở ô kinh tế = số lần nâng.

## Chưa có

- Ngự thú sư NPC có cây thiên phú (chưa có luật; NPC không có kênh thưởng).
- UI cây thiên phú (chờ UI, `ui-overhaul.md`).
