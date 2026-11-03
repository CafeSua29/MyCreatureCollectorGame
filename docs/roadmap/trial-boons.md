# Ân huệ trong lượt bí cảnh (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Dinotica** (totem / relic chọn trong mỗi lượt chơi roguelike) và kiểu chọn buff giữa các phòng của roguelike: trong một lượt bí cảnh / tháp, sau mỗi trận thắng được chọn **một trong vài ân huệ tạm thời**, hết lượt thì mất. Số là **số tạm** (`balance.json` khóa `trialBoons`).

## Dữ liệu

- File mới `src/data/trialBoons.json`: `{ id, rarity, hooks, weight, maxStacks?, scope? }`. `hooks` = hook trait chỉ trong trận cho mọi quái phe người chơi (dùng lại cơ chế `sideHooks` của luật bí cảnh, `trials.md`). `rarity` (`common` / `rare` / `epic`) quyết định trọng số và màu UI. Chọn lại ân huệ đã có thì **cộng cấp** (hiệu ứng × hệ số cấp như trait cấp) tới `maxStacks` (bỏ trống = không trần).
- Tên / mô tả ở i18n `trialBoons`.
- Nội dung đầu: % chỉ số theo từng chỉ số, hồi máu đầu trận, bậc chí mạng, giảm sát thương nhận, tăng tỉ lệ gây trạng thái, hồi thể lực (`stamina.md`), thêm đồ rơi rương... (khoảng 20–30 mục, quy đổi từ totem / relic của Dinotica theo nghĩa).

## Luật

- Áp cho các loại phó bản có cờ `boons: true` trong `TRIAL_KIND_RULES` (bí cảnh và tháp thí luyện; Khí giới bí cảnh không, vì là lên cấp món chứ không phải lượt chơi).
- **Sau mỗi trận thắng** (trừ trận cuối): tung `choiceCount` (3) ân huệ **khác nhau** theo `weight` (ân huệ đã max cấp không tung), lưu `GameState.trial.boonChoices`. Log `trialBoonOffered`.
- Action `chooseTrialBoon { boonId }` (phải nằm trong lựa chọn) hoặc `skipTrialBoon` (bỏ, nhận `skipMoney` nhỏ). Còn lựa chọn chưa chọn thì không đánh trận kế (`trialBoonPending`).
- Ân huệ đã chọn lưu `GameState.trial.boons: { boonId, stacks }[]`; mọi trận trong lượt áp hook. **Hết lượt** (hoàn thành, thua, bỏ cuộc) thì mất hết.
- **Tháp thí luyện**: tầng tất định nhưng lựa chọn ân huệ tung bằng RNG của state như mọi chỗ khác.
- Luật bí cảnh mới (`trialRules.json`) có thể khóa ân huệ (`noBoons`) hoặc tăng số lựa chọn; độ bất ổn tầng có thể thêm ân huệ hiếm.
- Mô phỏng: "người chơi" chọn ân huệ có điểm cao nhất theo hệ số đơn giản; đo tỉ lệ qua bí cảnh / tầng tháp cao nhất trước / sau.

## Save

`trial.boonChoices`, `trial.boons` (union `TrialRun`); kiểm tra id, stacks ≤ max; tăng version + migrate (rỗng).

## Test

Tung sau trận thắng, không tung sau trận cuối, không trùng, chọn / bỏ, chặn trận kế khi chưa chọn, cộng cấp, max cấp không tung, hết lượt mất, Khí giới bí cảnh không có, hook áp trong trận.

## Tài liệu khi xong

Luật vào `docs/rules/trials.md` (mục mới "Ân huệ"), dòng Tiến độ, mô phỏng ở `simulation-features.md`; xóa file này.
