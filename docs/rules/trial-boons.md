# Ân huệ trong lượt bí cảnh

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Lấy từ **Dinotica** (totem / relic chọn trong mỗi lượt chơi roguelike) và kiểu chọn buff giữa các phòng của roguelike (chủ project yêu cầu 2026-11-03, làm 2026-11-07): trong một lượt bí cảnh, sau mỗi trận thắng được chọn **một trong vài ân huệ tạm thời**, hết lượt thì mất. Số là **số tạm** (`balance.json` khóa `trials.boons`).

Code: model `model/trials.ts` (`TrialBoonDef`, `TrialBoonEffect`, `SecretRealm.boons` / `boonChoices`); registry hiệu ứng `registries/trialBoons.ts` (`TRIAL_BOON_EFFECTS`, tra tổng `trialBoonRewardPercent` / `trialBoonHealPercent` / `trialBoonChestRolls`, tung `rollTrialBoonChoices`, trọng số theo độ bất ổn `trialBoonRarityWeight`); hook trận của ân huệ `trialBoonHooks` ở `registries/teamBonuses.ts`; action và ân huệ của trận `battle/trialBoons.ts`; tung sau trận / hồi máu / rương `battle/trialOutcome.ts`; % thưởng `battle/outcome.ts` (`battleRewardMultiplier`); kiểm tra dữ liệu `gameData/validateTrialBoons.ts`, save `game/validateTrialState.ts` / `game/validateTeamState.ts`; dữ liệu `src/data/trialBoons.json` (tên ở i18n `trialBoons`).

## Dữ liệu (`trialBoons.json`)

- `{ id, rarity, effects, maxStacks? }`. `rarity` (`common` / `rare` / `epic`, `TRIAL_BOON_RARITIES`) quyết định trọng số khi tung (`config.trials.boons.rarityWeights` 50 / 30 / 15 cho mỗi ân huệ, mọi bậc > 0 để mọi ân huệ có cơ hội) và màu UI. `maxStacks` = cấp tối đa (bỏ trống = không trần); ân huệ có hook không nhân theo cấp (`critStage`, cờ bật / tắt như `surviveLethal`) hoặc dễ chạm trần (giảm sát thương nhận, giảm thể lực) có `maxStacks`.
- `effects`: union theo `type`, mọi số nhân **cấp** (stacks) của ân huệ (registry `TRIAL_BOON_EFFECTS`; thêm loại = thêm một handler; trường lạ báo lỗi):

| Loại         | Trường                                  | Tác dụng                                                                                                                                                                                                                                                           |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks`      | `hooks`                                 | Hook trait chỉ trong trận cho mọi quái phe người chơi (như luật `sideHooks`; kiểm tra `checkBattleOnlyHooks`, không đổi HP), hệ số hook = cấp                                                                                                                      |
| `reward`     | `channel` (`reward` / `exp`), `percent` | % thưởng của trận bí cảnh: `reward` = tiền và tỉ lệ đồ rơi, `exp` = EXP; cộng vào cùng tổng với % độ khó / độ bất ổn rồi nhân một lần                                                                                                                              |
| `heal`       | `percent`                               | % max HP hồi thêm cho cả đội sau mỗi trận thắng (cộng `healPercent`, kẹp 100); luật `noHealing` tắt, nên bí cảnh có luật đó không tung ân huệ này                                                                                                                  |
| `chest`      | `rolls`                                 | Lượt tung món thêm của rương bí cảnh (tổng làm tròn xuống)                                                                                                                                                                                                         |
| `bossWeaken` | `percent` (0–100)                       | Quái địch của **trận boss** bí cảnh (trận cuối; mọi trận với luật `bossOnly`) vào trận đã mất % max HP, sau lợi thế boss; tổng kẹp `bossWeakenCapPercent` (30, chủ project chốt 2026-11-07) nên không gục vì ân huệ; log trận `bossWeakened { monsterId, amount }` |

- Nội dung (193 ân huệ: 125 common, 53 rare, 15 epic; chủ project yêu cầu "càng nhiều càng tốt" để ít lặp; quy đổi theo nghĩa vì không có danh sách totem / relic của Dinotica công khai (game có 39 totem, 70 relic; tăng chỉ số quái, đổi đòn đánh)). Tên do Claude đặt, chủ project duyệt 2026-11-07. Nhóm:
  - Totem chỉ số: % một / hai / mọi chỉ số (không đổi HP).
  - Hồi phục: hồi máu sau trận, regen, hút máu, hồi khi hạ địch, hồi khi rút về, chữa trạng thái cuối lượt, tăng hồi nhận.
  - Phòng thủ: giảm sát thương nhận, kháng debuff, giảm sát thương khi đầy máu, né, giảm đòn khắc hệ, gai phản đòn, trần sát thương mỗi đòn, trụ một đòn chí tử.
  - Tấn công: chí mạng (tỉ lệ / sát thương / bậc), tăng sát thương, xuyên thủ, chính xác, đi trước, đòn khắc hệ / bị kháng mạnh hơn, STAB, chiêu yếu mạnh hơn, đánh kẻ yếu máu, kết liễu, sát thương cuối lượt lên địch, luôn trúng, chiêu trạng thái ưu tiên, miễn dội.
  - Điều kiện: máu thấp / cao, vài lượt đầu, khi mang trạng thái.
  - Nhắm boss (chủ project chốt 2026-11-07, vì bí cảnh thua chủ yếu ở boss cuối): +% sát thương / −% sát thương nhận trong trận boss (hook `damageDealtModifier` / `damageTakenWhen` với điều kiện DSL `bossBattle`), boss mất máu đầu trận (`bossWeaken`).
  - Thể lực (`stamina.md`), thưởng (% tiền + đồ rơi, % EXP, thêm lượt rương), đánh đổi (tăng mạnh một mặt, giảm mặt khác, kiểu ân huệ hỗn mang của roguelike), combo epic.
  - Sinh theo danh sách bằng `scripts/data-import/trial-boons-generate.mjs` (sinh cả file và tên vi / en; thêm hệ / nhóm race thì chạy lại; sửa tay trong JSON thì chép vào script trước vì script ghi đè): ấn mỗi hệ (+% sát thương hệ đó) và giáp mỗi hệ (−% sát thương nhận), khắc tinh mỗi nhóm race, tế đàn thời tiết / địa hình (đặt môi trường khi vào sân + % chỉ số trong môi trường đó), nanh trạng thái (gây khi đánh), gai trạng thái (gây khi bị đánh vật lý), bùa kháng trạng thái, tinh chất trạng thái (+% sát thương trạng thái), tiếng gầm (−1 bậc địch khi vào sân), khí thế (+1 bậc mình khi vào sân), chiến tích (+1 bậc khi hạ địch).

## Luật

- **Chỉ bí cảnh** có ân huệ: tháp thí luyện không có lượt chơi (mỗi tầng một trận riêng, thua không mất gì) nên ân huệ không có chỗ "hết lượt"; Khí giới bí cảnh là lên cấp món, không phải lượt chơi. Lệch roadmap (roadmap tính cả tháp).
- **Sau mỗi trận thắng** bí cảnh trừ trận cuối (`TRIAL_KIND_RULES.realm.onWin`): tung `choiceCount` (3) + tổng `count` của luật `boonChoices` ân huệ **khác nhau** theo trọng số bậc hiếm (`rollTrialBoonChoices`; trọng số = `rarityWeights` × (1 + mức độ bất ổn × `instabilityRarityPercent` / 100), mặc định rare +25%, epic +50% mỗi mức, common không đổi); không tung ân huệ đã tới `maxStacks`, bậc có trọng số 0, hay ân huệ không còn hiệu ứng nào có tác dụng với luật của bí cảnh (`worksWith` của handler); hết ân huệ thì ít hơn. Lưu `trial.boonChoices`, log trận `trialBoonOffered { boonIds }`. Luật `noBoons` hoặc không tung được ân huệ nào: không có lựa chọn, không tốn RNG.
- Ở thị trấn, ngoài trận: `chooseTrialBoon { boonId }` (phải nằm trong lựa chọn: `notTrialBoonChoice { boonId }`) thêm ân huệ cấp 1 hoặc **+ 1 cấp** nếu đã có, log `trialBoonChosen { boonId, stacks }`; hoặc `skipTrialBoon` nhận tiền = `moneyPerLevel` × level tối đa của tầng sức mạnh × `skipMoneyPercent` % (100: khoảng tiền một quái hoang), log `trialBoonSkipped { money }`. Cả hai xóa lựa chọn. Không có lựa chọn: `noTrialBoonChoice`; không trong bí cảnh: `noTrial`; đang trong trận: `inBattle`.
- Còn lựa chọn chưa chọn thì `challengeTrial` báo `trialBoonPending` (việc khác ở thị trấn vẫn làm được, kể cả bỏ cuộc).
- Ân huệ đã chọn lưu `trial.boons: { boonId, stacks }[]`, áp cho **mọi trận còn lại của lượt**: hook thành mục phối hợp đội phe người chơi `{ kind: 'boon', id, stacks }` lúc mở trận (`battleTrialBoons` / `trialBoonTeamBonuses`, nguồn hook `boon`, nguồn % chỉ số `boons`, nguồn log `traitTriggered` `boon`); % thưởng, hồi máu, rương đọc thẳng từ bí cảnh đang đi. **Hết lượt** (hoàn thành, thua, bỏ cuộc) thì mất hết cùng `trial`.
- Luật bí cảnh (`trials.md`): `noBoons` (không tung ân huệ), `boonChoices { count }` (thêm lựa chọn). Cả hai không có ở tháp, không làm thuộc tính bất ổn.

## Độ bất ổn tầng

Độ bất ổn (`instability.md`) đặt miễn phí ở thị trấn, nên nếu chỉ tăng ân huệ hiếm thì người chơi bật trước khi vào bí cảnh rồi tắt. Vì vậy độ bất ổn **áp cả trận quái hoang / boss trong bí cảnh** (thuộc tính, % thưởng, bảng gặp map khác; không NPC), vào bí cảnh lộ thuộc tính ẩn, và mỗi mức nâng trọng số ân huệ rare / epic (đánh đổi: bí cảnh khó hơn, ân huệ hiếm hơn). Mức lấy từ `GameState.instability` lúc tung; giữa lượt không đổi được (`setInstability` bị chặn khi đang đi bí cảnh) nên không lưu riêng.

## Save

v117: `SecretRealm.boons`, `SecretRealm.boonChoices` (migrate: bí cảnh đang đi thêm hai danh sách rỗng). Kiểm tra: ân huệ tồn tại, cấp nguyên ≥ 1 và ≤ `maxStacks`, không trùng ân huệ; lựa chọn là id tồn tại, không trùng. `battle.teamBonuses` mục `boon`: ân huệ tồn tại, chỉ phe người chơi, `stacks` nguyên ≥ 1.

## Mô phỏng

Chơi liên tục (`scripts/simulate/trials.ts`, `simulation-features.md`): sau mỗi trận thắng có lựa chọn, "người chơi" chọn ân huệ điểm cao nhất (`bestTrialBoon`: 10 điểm mỗi bậc hiếm, +3 nếu nhắm boss (`bossWeaken` hoặc hook có điều kiện `bossBattle`), −5 mỗi hook tình huống như giáp hệ / khắc tinh race / bùa kháng, −15 nếu là ấn hệ mà đội không có hệ đó; bằng thì lựa chọn đầu). **Đo cặp**: mỗi bí cảnh chạy thêm bản đối chứng tắt ân huệ từ cùng state lúc vào (cùng bí cảnh, cùng RNG), chỉ đếm; cột `trials` (có ân huệ) và `trialsNoBoons` (đối chứng) của `progression.csv`. **Mục tiêu** (chủ project chốt 2026-11-07): có ân huệ hoàn thành bí cảnh cao hơn đối chứng ít nhất 10 điểm %. Kết quả ở `balance-systems.md` mục "Ân huệ bí cảnh".

## Chưa có

- Hiển thị (màn chọn ân huệ, màu theo bậc): chờ UI (`ui-overhaul.md`).
