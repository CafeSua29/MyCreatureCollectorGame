# Độ thuần thục skill

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Bước 5h (2026-10-24, save v32; tổng exp tính ngược ra cấp: save v33). Skill dùng càng nhiều càng mạnh, **không trần**. Số đều là **số tạm** (`balance.json`, khóa `mastery`; giá trị ở `balance-content.md`). Code: `monster/mastery.ts` (công thức, hiệu lực, kiểm tra), `model/mastery.ts` (type), exp trong trận `gainMastery` (`battle/executeSkill.ts`), kiểm tra config `gameData/validateMastery.ts`.

## Trên quái

- Trường `skillMastery`: `{ [skillId]: { level, exp } }` (`level` nguyên ≥ 1, `exp` `Decimal` ≥ 0 là **tổng exp đã tích**, như EXP của quái). **Skill chưa có mục là cấp 1, exp 0** (`masteryOf`): mục chỉ được tạo khi skill nhận exp lần đầu, nên học skill không phải ghi gì.
- Quên skill vẫn giữ mục; học lại (`learnPendingSkill`, `relearnSkill`, tiến hóa học thêm) dùng tiếp cấp cũ.
- Tiến hóa giữ. **Fuse:** quái gốc giữ của mình (của quái phụ mất), trừ skill kế thừa: nhận ½ cấp của quái phụ (làm tròn xuống, tối thiểu 1; cấp quái gốc cao hơn thì giữ; mục "Kế thừa skill" ở `fusing.md`). **Breeding:** con không thừa hưởng (`{}`). Quái mới (hoang, boss, trứng) `{}`.
- Kiểm tra save (`validateSkillMastery`, gọi trong `validateMonster`): object, id skill tồn tại, `level` nguyên ≥ 1, `exp` Decimal ≥ 0, trường lạ báo lỗi. Không ép `level` khớp `exp` (đổi config không làm hỏng save).
- `MonsterView.skills[].mastery` (`SkillMasteryView`): cấp, tổng exp, tổng exp của cấp kế tiếp (`expForNextLevel`) và phần còn thiếu (`expToNextLevel`), mốc kế tiếp (`nextMilestone`, null khi đã qua hết mốc).

## Tăng thuần thục

- Sau mỗi **lệnh dùng skill trong trận** của quái (trúng, trượt, bị chặn hay thất bại đều tính; mọi loại trận): `useExp` (1) **một lần cho cả lệnh** (kể cả khi trait lặp skill kiểu Multicast), cộng `knockoutExp` (2) cho **mỗi quái phe địch** đang đứng mà bị hạ trong lần dùng đó.
- Chỉ tính skill quái **đang biết** (`skillIds`), dùng bằng lệnh của chính nó (kể cả hành động thêm / Timeline). **Không tính:** skill do trait / minion / ô spell gây ra (`reactive`), hợp kích kỹ. Exp vào **skill gốc đã chọn**: quái đang Dynamax dùng chiêu Max thì skill gốc vẫn nhận exp; trait đổi skill ngẫu nhiên thì skill thật được dùng nhận.
- Quái hoang cũng tích thuần thục trong trận (bắt về thì giữ).
- **Tổng exp để đạt cấp L** = `⌈baseExp × (L − 1)^expPower⌉` (4 × (L − 1)^2,5; cấp 1 = 0), `masteryExpForLevel` (bọc `curveExpForLevel` chung, `shared/levelCurve.ts`). Đa thức như EXP của quái (quy tắc 7) nên **tính ngược** được ra cấp (`masteryLevelFromExp`: căn bậc `expPower` rồi sửa sai số làm tròn, như `levelFromExp`; cấp vượt số nguyên an toàn là dữ liệu hỏng, `DataError`). Số chọn để exp cần cho mỗi cấp ≈ 10 × n^1,5 như thiết kế ban đầu (đạo hàm của 4 × n^2,5).
- Cộng exp (`addMasteryExp`): tổng exp + lượng, cấp = cấp tính ngược từ tổng mới, **không bao giờ hạ** (lấy max với cấp đang lưu). Lượng exp lớn tùy ý tính một lần, không lặp từng cấp. Lên cấp thì ghi **một** log `masteryLevelUp { monsterId, skillId, level }` với cấp mới.

## Hiệu lực (`masteryBonusAt` / `skillMasteryBonus`)

- **Power** × `levelEffectScale(powerStep, cấp)` = `1 + 0,05 × (cấp − 1)` (hàm tuyến tính chung `shared/levelEffect.ts`), nhân trong `rawDamage` nên đánh thật và AI dự đoán (`expectedDamage`) cùng tính.
- **Accuracy** gốc (hoặc accuracy thay thế của môi trường) + `accuracyPerLevel × (cấp − 1)`, kẹp 100, **trước** các hệ số môi trường / trait (`skillAccuracy` khi có `user`). Skill luôn trúng giữ nguyên.
- **Mốc** (`milestones`, cấp tăng dần, thưởng **cộng dồn** các mốc đã đạt): cấp 10 tỉ lệ hiệu ứng phụ +10%, cấp 25 thêm +10% (tổng +20%), cấp 50 skill đánh nhiều lần +1 số đòn tối thiểu.
  - Hiệu ứng phụ (hiệu ứng có `chance` < 100): tỉ lệ × `1 + %/100`, **nhân** với hệ số trait kiểu Serene Grace (`chanceMultiplier`), kẹp 100; đánh thật và điểm AI cùng tính.
  - Số đòn tối thiểu: tung số đòn như cũ (cùng RNG) rồi nâng số đòn thấp hơn lên `min + bonus` (không vượt `max`); số đòn kỳ vọng của AI theo đúng phân bố đã nâng (`rollHitCount` / `expectedHitCount` nhận `minHitsBonus`). Skill số đòn cố định không đổi.
- **Không áp:** chiêu Max (`skill.maxMove`; chiêu Max là skill khác skill gốc), hợp kích kỹ (`DamageFormulaInput.partner`; skill hợp kích không nằm trong skill của quái). Tera Blast và skill được Tera nâng power tính theo thuần thục của chính skill đó.

## Kiểm tra config (`checkMasteryConfig`)

`baseExp` > 0; `expPower`, `useExp`, `knockoutExp`, `powerStep`, `accuracyPerLevel` số ≥ 0; mốc: `level` nguyên ≥ 2 tăng dần, ít nhất một thưởng, `secondaryChancePercent` số ≥ 0, `minHitsBonus` nguyên ≥ 0; trường lạ báo lỗi.

Thuần thục ≥ `moveStyles.unlockMastery` (10) mở thế mạnh / thế nhanh của skill có `styles` (`move-styles.md`).

Món tăng exp thuần thục: Ngộ Đạo Trà (hiệu ứng `addMasteryExp`, skill chọn lúc dùng; `treasures.md`).
