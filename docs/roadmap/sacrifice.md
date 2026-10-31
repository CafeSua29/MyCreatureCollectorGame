# Hiến tế (`sacrifice`) (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Tên chọn để không lẫn với Fuse: quái phụ **hiến mình**, quái chính mạnh lên một chút. Khác Fuse (nhận ½ chỉ số quái phụ, đổi ô trait, đổi loài): Hiến tế chỉ cộng một lượng nhỏ, cố định.

- Làm ở **NPC thị trấn** (dùng chung NPC với fusing), ngoài trận. Quái chính và quái phụ ở đội hoặc kho, là hai con khác nhau; đội vẫn còn ít nhất 1 con sau khi quái phụ mất.
- **Điều kiện:** hai quái **cùng race** **và** có **`lineage` y hệt nhau** (so như tập hợp loài). Quái thường có `lineage` rỗng nên hai quái thường cùng race luôn được; quái fuse chỉ hiến tế với quái fuse có đúng cùng `lineage` (không phải "race nằm trong lineage").
- **Quái phụ mất đi.** Trang bị / đồ cầm trên quái phụ tự về túi (túi đầy: hỏi xác nhận như luật fuse).
- **Giá** (số tạm, `balance.json`): `sacrificeCostPerLevel × (level chính + level phụ)`, `sacrificeCostPerLevel` = **20** (rẻ hơn fuse 50 vì hiệu quả thấp hơn).
- **Hiệu quả:** quái chính có trường mới **`sacrificeStacks`** (số nguyên ≥ 0, không có trần). Mỗi lần hiến tế:
  - `sacrificeStacks(chính) += sacrificeStacks(phụ) + 1` (quái phụ đã từng được hiến tế thì truyền luôn stacks của nó, cộng thêm 1 cho chính nó).
  - Quái phụ là shiny hay boss **vẫn chỉ tính +1** như mọi quái khác.
- **Tính chỉ số:** mỗi stack **+1% mọi chỉ số, tuyến tính** (100 stacks = +100%). Cộng chung vào **tổng %** ở bước "áp trait" của thứ tự tính chỉ số (như trang bị). Hệ số 1% đặt trong `balance.json`.
- **Truyền qua fuse:** quái gốc giữ stacks của mình **cộng thêm stacks của quái phụ** (không +1 thêm, vì đó là fuse chứ không phải hiến tế).
- **Breeding không truyền:** con luôn có `sacrificeStacks = 0`. Lý do (đã chốt): breeding không làm mất bố mẹ, nếu truyền thì breed liên tục sẽ nhân bản stacks miễn phí. Fuse thì được truyền vì quái phụ mất đi (stacks chỉ chuyển chỗ, không nhân bản).
- **Hiến tế hàng loạt:** chọn nhiều quái phụ theo bộ lọc (mục "Thao tác hàng loạt"), mỗi con tính như một lần hiến tế (stacks và giá cộng dồn), là **một action** của core.
- **Huyết mạch** (`docs/rules/bloodline.md`, đã làm): quái phụ cùng nhóm huyết mạch thì quái chính nhận `sacrificePurityPercent` (25%, thêm vào `config.bloodline`) độ thuần của quái phụ ở các nhóm loài gốc của quái chính thuộc (cộng qua `withPurity` như `fuseBloodlines`).
- `MonsterView` hiện `sacrificeStacks` và % đang được cộng. State đổi (trường mới trên quái) nên **tăng version save**, migrate đặt `sacrificeStacks = 0` cho mọi quái.
