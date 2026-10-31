# Extract / inject trait (đã chốt thiết kế, thay cho mục "Inject trait" cũ)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- Làm ở **một NPC ở thị trấn**, ngoài trận. Quái nguồn / đích ở đội hoặc kho.
- **Extract:** lấy **nguyên cả trait** (đủ cấp) khỏi quái, quái mất trait đó (ô trống ra). Tạo một **tinh thể trait** `{ traitId, level }` vào túi. Extract được cả trait xấu (`negative`).
- **Inject:** dùng một tinh thể lên quái đích, tiêu hao tinh thể. Inject được bất cứ lúc nào sau khi extract (miễn ở NPC).
  - Quái đích đã có trait cùng id: **gộp cấp** (cộng), không cần ô trống.
  - Chưa có: quái đích phải **còn ô trống**, không thì báo lỗi.
  - Trait inject **loại trừ** với một trait đang có: **bỏ cả hai** (như luật fuse), tinh thể vẫn bị tiêu hao. Đây cũng là một cách xóa trait xấu.
- **Không extract / inject được:** trait loại `shiny`, `boss`, `race`. Loại `rare` được phép nhưng giá cao hơn.
- **Giá** (thu ở cả hai bước, không phụ thuộc level quái; mọi trait cùng loại và cùng cấp có cùng giá):
  - Extract: `extractCostBase × cấp² × hệ số loại`, với cấp của trait bị lấy.
  - Inject: `injectCostBase × (cấp sau khi gộp)² × hệ số loại`, nên dồn cấp càng cao càng đắt.
  - Hệ số loại: positive ×1, negative ×1, rare ×3. `extractCostBase` = `injectCostBase` = 100. Số tạm, đặt trong `balance.json`. **Đã có** (làm cùng cửa hàng): `config.crystal.extractCostBase`, `config.crystal.kindCostMultipliers` và hàm `crystalExtractCost` (`inventory/itemPrices.ts`); khi làm bước này chỉ thêm `injectCostBase`.
- **Lưu tinh thể** (**đã làm** ở bước 3.1, xem "Item: mô hình chung" trong `docs/rules/world-items.md`): định nghĩa chung `traitCrystal` trong `items.json`, chồng trong `inventory.crystals` gộp theo `traitId` + `level`; dùng `addCrystals` / `removeCrystals` / `getCrystalCount` (`src/core/inventory/`). Khi làm bước này: thêm loại `race` vào `CRYSTAL_EXCLUDED_TRAIT_KINDS` nếu "Trait theo race" đã làm.
- **Nguồn tinh thể:** extract và **mua ở cửa hàng** (đã làm, mục "Cửa hàng và vứt vật phẩm" ở `docs/rules/world-items.md`). Rơi đồ: để sau.
- Tinh thể **vứt được** và **bán được** như vật phẩm (đã làm, `discardItem` / `sellItem`); giá bán tinh thể = **50% giá extract** tương ứng (theo cấp và loại).
