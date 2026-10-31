# Extract / inject trait (tinh thể trait)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Code: `roster/traitCrystalActions.ts` (`extractTrait`, `injectTrait`), giá ở `inventory/itemPrices.ts` (`crystalExtractCost`, `crystalInjectCost`), đếm ô `monster/traitUtils.ts` (`usedTraitSlots`).

- Làm ở **NPC tinh thể trait ở thị trấn**, ngoài trận. Quái nguồn / đích ở đội hoặc kho, **không đang làm việc** (thám hiểm..., `assertNotBusy`: `monsterBusy`). Quái fuse, bản mệnh thú vẫn làm được (không có luật chặn).
- **Extract** (action `extractTrait { monsterId, traitId }`): lấy **nguyên cả trait** (đủ cấp) khỏi quái, quái mất trait đó (ô trống ra, số ô `traitSlots` không đổi). Túi nhận một **tinh thể trait** `{ traitId, level }`. Extract được cả trait xấu (`negative`).
- **Inject** (action `injectTrait { monsterId, item }`, `item` là định danh `{ storage: 'crystal', traitId, level }`): dùng một tinh thể lên quái đích, tiêu hao tinh thể. Inject được bất cứ lúc nào sau khi extract (miễn ở NPC). Xét theo thứ tự:
  1. Quái đích đã có trait cùng id: **gộp cấp** (cộng), không cần ô trống. Cấp sau khi gộp vượt `Number.MAX_SAFE_INTEGER` thì `traitLevelLimit` (cấp trait lưu kiểu `number`).
  2. Trait inject **loại trừ** (`exclusiveGroup`) với một trait đang có: **bỏ cả hai** (như luật fuse), tinh thể vẫn bị tiêu hao, không cần ô trống (ô được giải phóng). Đây cũng là một cách xóa trait xấu.
  3. Còn lại: quái đích phải **còn ô trống** (số trait chiếm ô `usedTraitSlots` < `traitSlots`; trait không chiếm ô như shiny / boss không tính), không thì `traitSlotsFull`.
- **Không extract / inject được:** trait loại `shiny`, `boss`, `race`, `bloodline`, `polarity` (mọi loại `hasCrystal` false trong `TRAIT_KIND_RULES`; extract báo `traitNotExtractable`, tinh thể của các loại này không tồn tại vì định danh bị `parseItemRef` chặn). Trait race / huyết mạch / cực tính không nằm trong `monster.traits` nên extract báo `traitNotOnMonster`. Loại `rare` được phép nhưng giá cao hơn.
- **Giá** (thu ở cả hai bước, không phụ thuộc level quái; mọi trait cùng loại và cùng cấp có cùng giá; tính bằng `Decimal`):
  - Extract: `extractCostBase × cấp² × hệ số loại`, với cấp của trait bị lấy.
  - Inject: `injectCostBase × (cấp sau khi gộp)² × hệ số loại`, nên dồn cấp càng cao càng đắt. Trường hợp bỏ cả hai: cấp của tinh thể.
  - Hệ số loại `config.crystal.kindCostMultipliers`: positive ×1, negative ×1, rare ×3. `extractCostBase` = `injectCostBase` = 100 (`balance.json`, số tạm; kiểm tra dữ liệu: số hữu hạn ≥ 0).
- Lỗi khác: thiếu tiền `notEnoughMoney`, thiếu tinh thể `notEnoughCrystals`, định danh không phải tinh thể `malformedAction`, trait không tồn tại `unknownTrait`, ngoài thị trấn `notInTown`, trong trận `inBattle`, quái không sở hữu `monsterNotOwned`. Lỗi thì state giữ nguyên (không mất tiền / tinh thể).
- **Lưu tinh thể** (xem "Item: mô hình chung" trong `world-items.md`): định nghĩa chung `traitCrystal` trong `items.json`, chồng trong `inventory.crystals` gộp theo `traitId` + `level`; dùng `addCrystals` / `removeCrystals` / `getCrystalCount` (`src/core/inventory/`). Không đổi cấu trúc state (không tăng version save).
- **Nguồn tinh thể:** extract và **mua ở cửa hàng** (mục "Cửa hàng và vứt vật phẩm" ở `world-items.md`). Chưa có: rơi đồ (để sau, chưa có thiết kế; không chờ mục nào).
- Tinh thể **vứt được** và **bán được** như vật phẩm (`discardItem` / `sellItem`); giá bán tinh thể = **50% giá extract** tương ứng (theo cấp và loại).
- Không ghi mốc lý lịch (`monster-history.md` không có mốc cho extract / inject).
- Mô phỏng: mục "Tinh thể trait" ở `simulation-features.md`.
