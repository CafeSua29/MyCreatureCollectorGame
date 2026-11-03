# Thể lực cho skill (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Stamina của Temtem**. Ở bản gốc: mỗi chiêu tốn thể lực; thiếu thể lực vẫn dùng được nhưng **quá sức** (overexert): mất HP theo phần thiếu và **mất lượt kế tiếp** (chỉ được nghỉ); cuối mỗi lượt hồi khoảng 5% + 1 thể lực tối đa, lệnh **Nghỉ** hồi thêm 15%; hết trận hồi đầy. Thay cho luật "Không có PP, dùng vô hạn" ở `battle.md`. Số là **số tạm** (`balance.json` khóa `stamina`), chỉnh theo mô phỏng.

## Thể lực

- Không thêm chỉ số thứ 7 (sẽ phải sửa gen, race, mọi hệ thống chỉ số). Thể lực tối đa là **thang cố định** `stamina.max` (100) cho mọi quái, nhân hook trait mới `staminaMaxPercent` (trait, trang bị, thiên phú...). Thang cố định nên không phình theo scale vô hạn.
- Thể lực hiện tại chỉ có trong trận (`BattleFighter.stamina`), vào trận đầy, **hết trận hồi đầy** như Temtem (không lưu trên quái).
- **Cuối mỗi lượt**: quái còn trên sân hồi `regenPercent` (5) % tối đa + `regenFlat` (1).
- **Lệnh mới `rest`** (Nghỉ): không làm gì, hồi thêm `restPercent` (15) %.

## Giá skill

- Trường skill `staminaCost` (nguyên ≥ 0). Bỏ trống thì suy theo bảng `stamina.costByPower` (theo uy lực, skill trạng thái một mức riêng; giống mức chiêu Temtem cùng uy lực), để không phải ghi tay hàng nghìn skill. Struggle và skill của trait / vật phẩm tốn 0.
- Hook trait / sticker mới `staminaCostPercent` (giảm / tăng giá; `skill-stickers.md`).

## Quá sức

- Dùng skill khi thể lực < giá: vẫn ra đòn, thể lực về 0, quái mất `overexertHpPercent` (2) % max HP **mỗi điểm thiếu** (tỉ lệ theo max HP nên không lệch theo scale; Temtem tính 2–5 HP mỗi điểm theo level), log `overexerted { monsterId, deficit, damage }`, rồi **mất lượt kế tiếp** (trạng thái tạm `exhaustedUntilTurn`, lệnh lượt đó tự là `rest`). Quá sức có thể làm quái gục.
- Trait kiểu Resilient (Temtem: chặn gục do quá sức một lần mỗi trận và bỏ phạt mất lượt) thêm bằng hook mới khi nhập trait.

## Liên quan

- **Tự động đánh / AI**: AI tính thể lực khi chấm điểm (phạt ứng viên làm quá sức theo phần HP mất và lượt mất, cộng điểm cho `rest` khi thể lực thấp). Chiến thuật tự động đánh thêm ngưỡng nghỉ.
- **Hold / thời gian chờ** (`skill-synergy-hold.md`) giữ nguyên, chạy độc lập.
- Quái hoang, boss, NPC cùng luật. Boss có thể có hệ số hồi riêng (`bossRegenPercent`) nếu mô phỏng cho thấy boss bị kẹt.
- **Mô phỏng**: chạy kịch bản mặc định đầy đủ (đổi luật trận dùng chung), thêm cột tỉ lệ lượt nghỉ / quá sức.

## Save

Trường trận (`stamina`, `exhaustedUntilTurn`), kiểm tra save trận; tăng version + migrate (trận đang dở: thể lực đầy).

## Test

Tốn đúng giá, hồi cuối lượt, nghỉ, quá sức (mất HP theo phần thiếu, mất lượt, gục do quá sức), hết trận hồi đầy, giá suy theo uy lực, hook giảm giá, AI không tự làm quá sức khi có lựa chọn khác, số cực lớn (max HP lớn vẫn đúng tỉ lệ).

## Tài liệu khi xong

Luật vào file mới `docs/rules/stamina.md` (thêm vào Mục lục), sửa dòng "Không có PP" ở `battle.md`, `auto-battle.md`, `balance-systems.md`, dòng Tiến độ; xóa file này.
