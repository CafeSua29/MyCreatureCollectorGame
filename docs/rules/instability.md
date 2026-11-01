# Độ bất ổn tầng

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Realm Instability / Realm Properties của Siralim: người chơi **tự chọn** làm tầng khó hơn bằng các **thuộc tính bất lợi**, đổi lại tiền, EXP và đồ rơi nhiều hơn. Bước 7d (2026-11-01). Số là số tạm ở `balance.json` khóa `instability` (bảng ở `balance-systems.md`).

Code: thuộc tính là luật trong `trialRules.json`, **cùng registry `TRIAL_RULES`** với bí cảnh (`registries/trialRules.ts`: cờ phạm vi của handler, tung `rollInstabilityRules`, % thưởng `instabilityRewardPercent`, mọi luật của trận `battleRules`); đặt mức / đổi / lộ `world/instability.ts`; tác dụng trong trận `battle/instability.ts` (trận nào nhận, hook theo phe, đổi quái địch, bảng gặp map khác); kiểm tra dữ liệu `gameData/validateTrials.ts`, kiểm tra save `game/validateInstabilityState.ts`.

## Thuộc tính (`trialRules.json`)

- Luật có khối `instability: { weight, rewardPercent }` là thuộc tính bất ổn (`weight` = trọng số khi tung, `rewardPercent` = % thưởng cộng thêm; luật khó hơn % cao hơn). Thiếu khối = không phải thuộc tính. `weight` (bí cảnh) và `instability.weight` độc lập: một luật có thể ở cả hai.
- Cờ phạm vi theo loại (handler `TRIAL_RULES`): `inRealm` (có ở bí cảnh; false thì `weight` phải 0), `inTower`, `inInstability` (loại dùng được làm thuộc tính; khối `instability` ở loại khác báo lỗi), `stackable` (tung trùng được, tác dụng cộng dồn).

| Loại               | Bất ổn | Bí cảnh | Tháp | Stackable | Tác dụng khi là thuộc tính bất ổn                                                                                                     |
| ------------------ | ------ | ------- | ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `noItems`          | có     | có      | có   | không     | Không dùng vật phẩm trong trận (`trialRestricted { command: 'item' }`); ngoài trận không chặn (phần đó chỉ của bí cảnh)               |
| `fixedField`       | có     | có      | có   | không     | Môi trường cố định cả trận (sau môi trường của map và modifier)                                                                       |
| `noTransforms`     | có     | có      | có   | không     | Không phe nào biến hình                                                                                                               |
| `noTamerSkills`    | có     | có      | có   | không     | Không ngự thú sư trong trận                                                                                                           |
| `enemyMultiplier`  | có     | có      | có   | có        | Chỉ số quái địch × value (nhân vào `bossMultiplier`, nhiều lần nhân dồn)                                                              |
| `sideHooks`        | có     | có      | có   | có        | Hook trait chỉ trong trận cho mọi quái của `side` (`player` / `enemy`), như cộng hưởng đội; luật trùng gộp thành hệ số `count` của hook |
| `extraEnemyTraits` | có     | có      | không | có       | Quái hoang / boss thêm `count` trait random kiểu quái hoang, mỗi trait thêm một ô (không vượt trần ô); **giữ khi bắt**              |
| `fusedEnemies`     | có     | có      | không | có       | Mỗi quái hoang thường (không boss, không quái lớn) `percent` % là quái fuse với một quái hoang **khác loài** của map (`fuseMonsters`) |
| `foreignSpecies`   | có     | không   | không | có       | `percent` % trận quái hoang (`startWildBattle`) lấy bảng gặp quái thường của một map khác (đều); boss, đồ rơi, môi trường vẫn của map |
| `monoElement`, `bossOnly`, `noHealing` | không | có | (`bossOnly`, `noHealing` có) | không | Cần đội lúc vào bí cảnh / chuỗi trận                                                                         |

- `percent` của `fusedEnemies` / `foreignSpecies` trong (0, 100], nhiều lần thì cộng (kẹp 100); `count` nguyên ≥ 1; `sideHooks.hooks` kiểm tra như hook chỉ trong trận (`checkBattleOnlyHooks`: không hào quang, không đổi hp).
- Thuộc tính trong dữ liệu (2026-11-01): `noItems`, 8 môi trường cố định, `noTransforms`, `noTamerSkills`, `fierceFoes` (×1,5), `tyrantFoes` (×2), và mới: `enemyRegen` (quái hoang hồi 5% max HP cuối lượt, hook `regen`), `enemyHardened` (+15% thủ / đặc thủ), `enemySwift` (+15% tốc độ), `enemyRage` (ngưỡng cuồng bạo +10 điểm %, hook `frenzyThresholdBonus`, `frenzy.md`), `playerSlowed` (tốc độ phe ta −10%), `playerWeakened` (công / đặc công phe ta −10%), `playerNoCrit` (phe ta không chí mạng, hook `cannotCrit`), `extraTraits` (+1 trait), `fusedWilds` (20%), `foreignWilds` (25%). Luật `sideHooks` / `extraTraits` / `fusedWilds` mới cũng có ở bí cảnh (trọng số nhỏ).
- Nguồn % chỉ số của hook `sideHooks`: `rules` (`STAT_PERCENT_SOURCES`, loại nguồn hook `rule`).

## Đặt mức ở Đền dịch chuyển

- `GameState.instability: { level, properties: [{ ruleId, hidden }] }`; game mới `{ 0, [] }` (tắt).
- `setInstability { level }` (thị trấn, ngoài trận, không dự giải, không trong bí cảnh / hiểm địa): mức nguyên ≥ 0 (sai dạng: `malformedAction`), tối đa ⌊tầng cao nhất từng đạt / `floorsPerLevel` (10)⌋ (`maxInstabilityLevel`, tầng qua `bestFloorReached`, đổi sang `bestFloor` khi có phi thăng; không trần). Vượt: `instabilityLevelTooHigh { level, max }`; bằng mức đang có: `instabilityUnchanged { level }`.
  - **Tăng mức giữ thuộc tính cũ**, tung thêm cho từng mức mới; **giảm mức** bỏ thuộc tính của các mức trên; 0 = tắt.
  - Mỗi mức `visiblePerLevel` (1) thuộc tính **hiện** rồi `hiddenPerLevel` (1) thuộc tính **ẩn**, tung theo `instability.weight`; loại không stackable mỗi loại tối đa một lần (tính cả thuộc tính đã có). Hết thuộc tính hợp lệ thì mức đó ít thuộc tính hơn (dữ liệu hiện có luôn còn loại stackable nên không xảy ra).
- `rerollInstability` (cùng chỗ): trả `rerollCostPerLevel` (2.500) × mức tiền (`levelCost`, thiếu: `notEnoughMoney`), tung lại toàn bộ thuộc tính của mọi mức (ẩn lại như mới). Mức 0: `instabilityOff`. Giá tuyến tính theo mức vì tiền một trận quái hoang tăng tuyến tính theo tầng (level), nên đổi luôn tốn khoảng cùng số trận ở tầng mở mức đó.
- **Ẩn / hiện**: thuộc tính ẩn **lộ khi rời thị trấn ra tầng** (`travel` tới tầng, `revealInstability`). Ẩn chỉ là thông tin cho UI: thuộc tính ẩn vẫn có tác dụng.

## Áp dụng

- Trận nhận độ bất ổn (`battleInstabilityFor`): mức > 0 và trận **quái hoang / boss trên tầng** (`countsAsFloorBattle` và không NPC): `startWildBattle`, `challengeBoss`, trận quái hoang do event mở, trận câu cá / khai thác. **Không** áp cho NPC (kể cả gặp trên tầng), bí cảnh, tháp, độ kiếp, thú triều, hiểm địa, khu bảo tồn (không qua `openBattle`). Boss thế giới không áp (`world-boss.md`).
- Lúc mở trận chụp `BattleState.instability = { level, ruleIds }` (mọi thuộc tính, kể cả ẩn) và log `instability { level, ruleIds }`. Mọi nơi áp luật trong trận lấy luật qua `battleRules(battle)` (luật bí cảnh + thuộc tính bất ổn); đổi mức / thuộc tính sau đó không đổi trận đang đánh (chỉ đổi được ở thị trấn).
- Thứ tự lúc mở trận (`openBattle`): bảng gặp map khác (trước khi sinh quái, chỉ `startWildBattle`), rồi quái fuse, thêm trait (`applyEnemyRules`, chỉ quái hoang / boss), món unique của boss, hệ số địch, rồi luật `sideHooks` thành mục phối hợp đội `{ kind: 'rule', id, count }` của phe (`ruleTeamBonuses`). Không có luật nào thì không tốn RNG.
- Hook cuối lượt `regen` (và các hook `onTurnEnd`) gom kèm bối cảnh trận, nên hook của phe (cộng hưởng, trận pháp, `sideHooks`) cũng tác dụng (trước 2026-11-01 chỉ hook của chính quái).

## Thưởng

- % thưởng = mức × `rewardPercentPerLevel` (25) + tổng `rewardPercent` của từng thuộc tính (trùng thì tính mỗi lần) (`instabilityRewardPercent`, cộng, không nhân). Tiền thắng, EXP (cả trận, trước trait / tuổi của từng con) và hệ số tỉ lệ đồ rơi (mọi món rơi của trận) cùng × (1 + % / 100).
- Ví dụ mức 2 với `noItems` (8) và `fierceFoes` (10): +68%. `rewardPercent` của thuộc tính hiện 3–20 (trung bình theo trọng số ~5), nhỏ so với phần theo mức để thưởng chủ yếu theo mức người chơi chọn.

## Save

- `GameState.instability`, `BattleState.instability` (null = không áp). Kiểm tra: mức nguyên trong [0, mức tối đa theo tầng cao nhất]; tối đa (`visiblePerLevel` + `hiddenPerLevel`) × mức thuộc tính; mỗi thuộc tính là luật có khối `instability` và loại dùng được, `hidden` boolean, loại không stackable không trùng; trận có độ bất ổn chỉ là trận quái hoang / boss trên tầng (không NPC / bí cảnh / độ kiếp / trận đặc biệt không phải trên tầng), mức ≥ 1. `battle.teamBonuses` có mục `rule` (luật `sideHooks` tồn tại, đúng phe, `count` ≥ 1); quái hoang chỉ có mục `rule`.
- v82 migrate: `instability: { level: 0, properties: [] }`, trận dở `instability: null` (`state-versions.md`).

## Mô phỏng

Biến thể `instabilityLevel` (quét tầng, mọi tầng dùng mức đó, thuộc tính tung theo seed của trận, đều lộ, bỏ qua mức tối đa theo tầng; `sweepInstability`); kịch bản mặc định có `instability3`. Kết quả và mục tiêu ở `balance-systems.md`.

## Chưa có

- Hiển thị (Đền dịch chuyển, danh sách thuộc tính hiện / ẩn): chờ UI (`ui-overhaul.md`).
- "Người chơi" chơi liên tục chưa dùng độ bất ổn (chỉ đo bằng biến thể quét tầng): thêm khi cần cân bằng nhịp tiến trình có độ bất ổn.
