# Bộ trang bị (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03 (bổ sung cùng ngày: **bậc trang bị nào cũng có bộ**, tham khảo thêm các game có set đồ nổi tiếng). Ghép hai kiểu bộ:

- **Bộ ngẫu nhiên** kiểu **rune set của Summoners War**: mọi rune đều thuộc một bộ; bộ 2 món (Energy: HP +15%, Guard: thủ +15%, Blade: tỉ lệ chí mạng +12%, Focus: chính xác +20%...) và bộ 4 món (Swift: tốc độ +25%, Fatal: công +35%, Rage: sát thương chí mạng +40%, Vampire: hút máu 35%, Despair: 25% làm choáng, Violent: 22% thêm lượt...); đeo nhiều bộ cùng loại thì **mỗi bộ đủ món đều tính**.
- **Bộ đặt tên** kiểu **Diablo II / Diablo III / Grim Dawn**: bộ gồm các **món cụ thể** có tên (Tal Rasha...), thưởng theo số món đang đeo, **thưởng từng phần cộng dồn** (đeo 3 món nhận cả thưởng 2 món lẫn 3 món, đủ bộ thêm thưởng trọn bộ); **món trùng không tính** (Diablo II); bộ có ở nhiều bậc độ hiếm (Grim Dawn có bộ hiếm / sử thi / huyền thoại; Diablo II có bộ cấp thấp lẫn cấp cao); món đặc biệt giảm số món cần cho bộ (Ring of Royal Grandeur của Diablo III).

Số là **số tạm** (`balance.json` khóa `equipmentSets`).

## Dữ liệu

- File mới `src/data/equipmentSets.json`, union theo `kind`:
  - `rolled` `{ id, kind: 'rolled', size, hooks, weight }`: bộ ngẫu nhiên. `size` 2 hoặc 4 như bản gốc (cho phép số khác ≥ 2). Kích hoạt `floor(số món / size)` lần.
  - `named` `{ id, kind: 'named', rarity, pieceItemIds, bonuses: { pieces, hooks }[] }`: bộ đặt tên. `pieceItemIds` = các món gốc thuộc bộ (món gốc ghi ngược `setId`; kiểm tra dữ liệu hai chiều khớp). `rarity` = bậc của bộ (mọi bậc `EQUIPMENT_RARITIES`, kể cả `unique`). `bonuses` sắp tăng theo `pieces`; mọi mốc ≤ số món đang đeo đều kích hoạt (cộng dồn), mốc `pieces` = số món của bộ là thưởng trọn bộ.
- `hooks` = hook trait như hook cố định của món. Tên bộ ở i18n `equipmentSets`.
- **Nội dung**:
  - Bộ ngẫu nhiên: quy đổi các bộ Summoners War sang hook có sẵn (% chỉ số, bậc chí mạng, sát thương chí mạng, hút máu, tỉ lệ gây trạng thái khi trúng...). Hook chưa có (thêm lượt kiểu Violent) thì thêm hook nếu làm được trong luật lượt, không thì quy đổi gần nhất và ghi chỗ lệch.
  - Bộ đặt tên: mỗi bậc vài bộ, chủ đề theo hệ / race / lối chơi (bộ 2–6 món). Lấy cảm hứng cấu trúc từ Diablo II / III, Grim Dawn nhưng **tên và món tự đặt** (không chép tên bộ của game khác). Bộ `unique` gắn với boss: món của bộ là món unique trong pool boss (`equipment.md`), gom đủ bằng cách hạ nhiều boss khác nhau.

## Luật

- Trường mới `EquipmentInstance.setId?`.
- **Bộ ngẫu nhiên cho mọi bậc**: món tung ra (rơi, cửa hàng, đúc, Khí giới bí cảnh, mọi bậc kể cả `unique`) mà món gốc **không thuộc bộ đặt tên** thì tung một bộ ngẫu nhiên theo `weight` (như bản gốc mọi rune có bộ). Tung **sau cùng** để không đổi RNG cũ. Món gốc có thể ghi cố định bộ ngẫu nhiên.
- **Món của bộ đặt tên**: món gốc có `setId` bộ `named` thì món tung ra luôn thuộc bộ đó và **bậc ép theo `rarity` của bộ** (không tung bậc). Nguồn: rơi như món thường của map (trọng số riêng `setPieceWeight`, thấp), boss (bộ `unique`), rương bí cảnh, đấu giá (`auction.md`).
- **Đếm bộ** (`equipmentSetBonuses`, một hàm duy nhất, gọi từ `equipmentHooks`): theo món đang lắp. Bộ ngẫu nhiên: số món cùng `setId`, kích hoạt `floor(n / size)` lần (hook % cộng dồn; hook không cộng dồn được thì một lần, khai trong handler). Bộ đặt tên: số **món gốc khác nhau** (món trùng chỉ tính một), mọi mốc ≤ số đó kích hoạt. Đồ cầm (`storage: 'stack'`) không có bộ.
- **Giảm số món cần** (hook mới `setPieceReduction { value }`, ví dụ món "Nhẫn Vương Giả" kiểu Ring of Royal Grandeur): số món đếm được của **bộ đặt tên có ≥ 3 món** + value (như Diablo III áp cho bộ từ 3 món), không vượt số món của bộ. Không áp cho bộ ngẫu nhiên.
- Ô trang bị tăng theo tầng không trần (`equipment.md`) nên số bộ đủ tăng theo, và đeo được nhiều bộ đặt tên cùng lúc.
- **Tẩy luyện / cường hóa** không đổi bộ. Thợ rèn thêm **đổi bộ ngẫu nhiên** (`rerollEquipmentSet`, tốn tiền theo bậc; món của bộ đặt tên không đổi được). Lệch bản gốc (Summoners War không đổi được bộ): để không kẹt món đẹp sai bộ và có chỗ tiêu tiền.
- Món thiếu `setId` (món cũ trong save) không thuộc bộ.
- `MonsterView.equipmentSets = [{ setId, kind, count, activeBonuses }]`. Bộ lọc túi theo bộ (`bulk-actions.md`). Dex trang bị / thành tựu "Gom đủ bộ X".

## Save

`setId?` trên món; kiểm tra id bộ tồn tại và khớp món gốc (bộ đặt tên); tăng version + migrate (món cũ không có bộ).

## Test

Tung bộ ngẫu nhiên cho mọi bậc (RNG phần trước không đổi), món bộ đặt tên ép bậc, đủ 2 / 4 món bộ ngẫu nhiên, nhiều bộ cùng loại, bộ đặt tên thưởng cộng dồn theo mốc, món trùng không tính, giảm số món cần (bộ < 3 món không áp, không vượt số món bộ), đồ cầm không tính, đổi bộ ở Thợ rèn (chặn bộ đặt tên), kiểm tra dữ liệu (size < 2, mốc không tăng dần, món gốc và bộ không khớp hai chiều).

## Tài liệu khi xong

Luật vào `docs/rules/equipment.md` (mục mới "Bộ trang bị", hoặc file riêng `equipment-sets.md` nếu dài), `equipment-forge.md` (đổi bộ), nội dung ở `content-mechanics.md`, dòng Tiến độ; xóa file này.
