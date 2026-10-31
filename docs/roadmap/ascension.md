# Phi thăng (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

**Prestige toàn game** (như game idle, và "phi thăng" trong truyện tu tiên): reset tiến trình chính để nhận **Tiên nguyên**, mua **nâng cấp vĩnh viễn** cho mọi lần chơi sau. Giữ game dài hơi khi số đã lớn. Làm **sau cùng** trong phần core (chạm gần hết hệ thống). Số là **số tạm** (`balance.json`, khóa `ascension`).

## Điều kiện và phần thưởng

- Mở khi `highestFloor ≥ minFloor` (100). Action `ascend` ở thị trấn, UI hỏi xác nhận rõ những gì mất.
- **Tiên nguyên nhận** = ⌊`k` × √(`highestFloor` / `minFloor`) × (1 + tổng tầng thức tỉnh cao nhất / 100)⌋ − tổng tiên nguyên đã nhận ở các lần trước tính theo cùng công thức trên **thành tích cao nhất từng đạt** (đường cong căn bậc hai như Realm Grinder: phải đi xa hơn lần trước mới được thêm; lặp lại cùng mức thì không được gì).
- `GameState.ascension: { count, tienNguyen, upgrades: { [id]: rank }, bestFloor, bestRealm }` (`bestFloor` / `bestRealm` có ngay từ đầu, trước khi làm mục này các mục khác đọc `highestFloor` / `realm` qua một hàm chung để khi thêm phi thăng chỉ sửa một chỗ).

## Reset / giữ

- **Reset:** `highestFloor` = 1, vị trí về thị trấn, tiền, item gộp chồng thường (giữ vật phẩm chìa khóa), **level / EXP mọi quái về 1** (giữ loài), cảnh giới ngự thú sư về 0 (giữ điểm thiên phú ngự thú sư đã nâng), đạo quán / đấu trường / tháp, động phủ về cấp 1, độ bất ổn về 0.
- **Giữ:** **mọi thuộc tính vĩnh viễn trên quái** trừ level / EXP (gen, trait, skill, thuần thục, thức tỉnh, hóa hình, hiến tế, hồn tinh, cấy ghép, luân hồi, thân mật, tuổi, dưỡng dục, thiên phú, tính cách, Âm / Dương, linh dịch, lý lịch, `maxLevelReached`...; mục nào thêm trường mới trên quái thì mặc định **giữ**, chỉ ghi rõ khi muốn reset), trang bị, hồn phách, Dex, nghiên cứu loài, thành tựu, danh hiệu, tông môn (cống hiến reset, chức vị giữ), ân sủng thần linh.
- **Thiên mệnh** chọn lại sau mỗi lần phi thăng (`destiny.md`).
- **Ngự thú sư (đã làm ở `docs/rules/tamer.md`):** hiện mọi chỗ đọc thẳng `state.tamer.realm` (ô đồ cầm `equipmentSlotCount`, kỹ năng đã mở qua `BattleTamer.realm`, giới hạn bắt, linh lực); khi làm mục này: mở khóa (ô, kỹ năng) đổi sang `bestRealm`, sức mạnh (giới hạn bắt, linh lực) giữ cảnh giới hiện tại. Cộng hưởng và thọ nguyên đi theo `Monster.contractRealm` của từng quái, không hạ khi reset cảnh giới (quái giữ cảnh giới khế ước cũ).
- **Mở khóa vĩnh viễn theo giá trị cao nhất từng đạt** (`ascension.bestFloor`, `ascension.bestRealm`, cập nhật liên tục kể cả trước lần phi thăng đầu): số ô đồ cầm ("Trang bị và đồ cầm" ở `equipment.md`), vật phẩm chìa khóa (giữ), kỹ năng ngự thú sư đã mở, ô thám hiểm, mức bất ổn tối đa, tư chất (`aptitude.md`: đổi `aptitudeFloor` sang `bestFloor`). **Sức mạnh theo giá trị hiện tại** (chơi lại tiến trình): cộng hưởng khế ước, giới hạn bắt, linh lực. **Thọ nguyên theo cảnh giới dùng `bestRealm`** (dùng cảnh giới hiện tại thì quái tụt thọ nguyên và có thể chết hàng loạt sau phi thăng). Level quái reset nhưng `maxLevelReached` giữ (`lifespan.md`), nên thọ nguyên và điểm thiên phú không tụt.

## Tiên giới (nâng cấp vĩnh viễn)

- Dữ liệu `src/data/ascensionUpgrades.json`: nâng cấp mua bằng tiên nguyên, nhiều cái không trần: +% EXP, +% tiền, +% đồ rơi, +% mọi chỉ số quái ta, +ô thiên mệnh, bắt đầu lại ở tầng cao hơn (tầng khởi đầu = tối đa 50% `bestFloor`), giữ lại một phần tiền... % cộng như mọi nguồn.
- **Tăng version save**.

## Test

Điều kiện, công thức tiên nguyên (không được thêm khi không vượt thành tích), danh sách reset / giữ, nâng cấp tiên giới, tầng khởi đầu, chọn lại thiên mệnh, migrate.

## Tài liệu khi xong

Luật vào `docs/rules/ascension.md` (file mới, thêm vào Mục lục), `state.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
