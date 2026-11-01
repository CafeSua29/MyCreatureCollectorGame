# Hiến tế (`sacrifice`)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Tên chọn để không lẫn với Fuse: quái phụ **hiến mình**, quái chính mạnh lên một chút. Khác Fuse (nhận ½ chỉ số quái phụ, đổi ô trait, đổi loài, có thể thất bại): hiến tế chỉ cộng một lượng nhỏ, cố định, luôn thành công. Làm ở bước 6b (save v75).

Code: `progression/sacrifice.ts` (`sacrifice`, `sacrificeCost`, `canSacrificeTo`, `absorbSacrifice`), độ thuần `monster/bloodline.ts` (`sacrificeBloodlines`), nguồn % `sacrifice` ở `registries/statPercentSources.ts` (`sacrificeStatPercent`).

## Luật

- Action `sacrifice { baseId, subIds }` ở **NPC fusing ở thị trấn**, ngoài trận. Quái chính và quái phụ ở đội hoặc kho, **không đang làm việc** (`assertNotBusy`). `subIds` khác rỗng, không trùng (`malformedAction`), không chứa quái chính (`sacrificeSameMonster`). Đội vẫn còn ít nhất 1 con sau khi mất các quái phụ (`partyWouldBeEmpty`). Bản mệnh thú không làm quái phụ (`isBondBeast`); làm quái chính được.
- **Điều kiện** (`canSacrificeTo`): hai quái **cùng race** và **`lineage` y hệt nhau** (so như tập hợp loài), không thì `sacrificeMismatch { baseId, subId }`. Quái thường có `lineage` rỗng nên hai quái thường cùng race luôn được; quái fuse chỉ hiến tế với quái fuse có đúng cùng `lineage` (không phải "race nằm trong lineage").
- **Hiến tế hàng loạt:** nhiều quái phụ trong **một action** (chọn theo bộ lọc ở UI, `bulk-actions.md`); mỗi con tính như một lần hiến tế, xử lý lần lượt theo thứ tự `subIds` (stack, giá, độ thuần cộng dồn).
- **Quái phụ mất đi.** Trang bị / đồ cầm trên quái phụ tự về túi (túi không đủ chỗ thì `bagOverflow`, cần `discardOverflow`; `capacity.md`). Quái phụ có hồn tinh thì hoàn `soulLevels.fuseRefundPercent` (50%) điểm đã dùng như quái phụ của fuse (`soul-levels.md`).
- **Cô đặc** (như Condenser của Palworld): đủ `dwelling.condenseStacks` (4) stack thì mọi chỉ số làm việc đang có + `condensePercent` (50) % chỉ số gốc TB (`dwelling.md`).
- **Giá** (`sacrificeCost`, `balance.json` khóa `sacrifice`, số tạm): mỗi quái phụ `costPerLevel × (level chính + level phụ)`, `costPerLevel` = **20** (rẻ hơn fuse 50 vì hiệu quả thấp hơn), cộng dồn, tính bằng `Decimal`. Thiếu tiền `notEnoughMoney`.
- **Hiệu quả:** trường **`Monster.sacrificeStacks`** (nguyên ≥ 0, không trần). Mỗi quái phụ: `sacrificeStacks(chính) += sacrificeStacks(phụ) + 1` (quái phụ đã từng được hiến tế truyền luôn stack của nó). Quái phụ shiny / boss **vẫn chỉ +1**. Stack lưu kiểu `number`: cộng vượt `Number.MAX_SAFE_INTEGER` thì `sacrificeStackLimit` (thực tế không bao giờ chạm).
- **Tính chỉ số:** mỗi stack **+`statPercentPerStack` (1)% mọi chỉ số kể cả max HP, tuyến tính** (100 stack = +100%), nguồn % `sacrifice` cộng chung vào **tổng %** ở bước áp trait (mục "Thứ tự tính chỉ số", `stats-traits.md`).
- **Huyết mạch** (`sacrificeBloodlines`, `bloodline.md`): ở các nhóm loài gốc của quái chính thuộc, quái chính nhận `bloodline.sacrificePurityPercent` (**25%**) độ thuần của quái phụ, nhưng **không vượt độ thuần cao hơn của hai quái** (`max(của mình, min(của phụ, của mình + 25% của phụ))`): quái phụ thuần kém hơn thì không cộng gì. Lệch roadmap (roadmap cộng thẳng như fuse): mô phỏng 2026-10-31 cho thấy cộng thẳng thì hiến tế 4 anh chị em cùng lứa breed (độ thuần gần bằng nhau) gần gấp đôi độ thuần mỗi đời, đẩy lên 100 sau khoảng 18 đời và tổng chỉ số đời 20 ×2,55 thay vì ×1,55 (`simulation-features.md` mục "Hiến tế").
- **Truyền qua fuse:** quái gốc giữ stack của mình **cộng stack của quái phụ** (không +1, vì đó là fuse; `fusing.md`).
- **Breeding không truyền:** con luôn có `sacrificeStacks = 0` (`breeding-eggs.md`). Lý do (đã chốt): breeding không làm mất bố mẹ, nếu truyền thì breed liên tục sẽ nhân bản stack miễn phí. Fuse thì được truyền vì quái phụ mất đi (stack chỉ chuyển chỗ). Quái hoang / boss / trứng boss 0 stack.
- **Lý lịch:** mốc `sacrificed { count }` (số quái phụ của lần đó) trên quái chính (`monster-history.md`).
- `MonsterView.sacrifice = { stacks, statPercent }` (`sacrificeStatPercent`). Kiểm tra save: `sacrificeStacks` nguyên ≥ 0 (`validateMonster`). Migrate v74 → v75 đặt 0 cho mọi quái (kể cả trứng).
- Chưa có: chặn quái đã khóa (`monsterLocked`, chờ `roster-tools.md`), bộ lọc chọn quái phụ hàng loạt ở UI (chờ `bulk-actions.md` / `ui-overhaul.md`).
- Mô phỏng: mục "Hiến tế" ở `simulation-features.md`.
