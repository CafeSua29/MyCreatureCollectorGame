# Thần linh và ân sủng (đã chốt thiết kế, danh sách thần cần chủ project duyệt)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Gods / Favor của Siralim: mỗi map do một **thần** cai quản; hoạt động trong map tăng **ân sủng** với thần đó, mở **chúc phúc** chỉ có tác dụng trong các map của thần. Làm sau "Độ bất ổn tầng". Số là **số tạm** (`balance.json`, khóa `deities`).

## Dữ liệu

- File mới `src/data/deities.json`: khoảng 20 thần (theo hệ / chủ đề: Hỏa Đức Tinh Quân, Thủy Thần, Sơn Thần, Lôi Công...; **không dùng nhân vật độc nhất có tên riêng** theo luật nhập dữ liệu ở `content-data.md`, chỉ dùng chức danh), mỗi thần `{ id, blessings: [{ rank, effects }], shop }`. Tên ở `i18n`. **Danh sách đưa chủ project duyệt.**
- `biomes.json` thêm `deityId` cho mỗi map (script sinh map gán theo hệ / môi trường chính).

## Luật

- `GameState.favor: { [deityId]: Decimal }`. Tăng khi: thắng trận (+1), bắt / thu phục quái (+3), hạ boss (+10) **trong map của thần đó**; dâng **Hương nến** (vật phẩm) ở **Miếu** trong thị trấn (+200).
- **Bậc ân sủng** theo ngưỡng (đường cong đa thức, không trần): mỗi bậc mở một chúc phúc (+% đồ rơi, +% shiny, +% chỉ số quái cùng hệ với thần, +% tỉ lệ thu phục...), **chỉ áp trong map của thần đó**; % cộng như mọi nguồn.
- **Tín vật** (vật phẩm, chỉ rơi trong map của thần) là tiền tệ của cửa hàng thần đó (đồ hiếm theo chủ đề: trận đồ, đan phương, thiên tài địa bảo hệ của thần).
- **Tăng version save**.

## Test

Tăng ân sủng theo hoạt động và map, bậc và chúc phúc chỉ áp đúng map, Hương nến, tín vật và cửa hàng, migrate.

## Tài liệu khi xong

Luật vào `docs/rules/` (file mới), `world-items.md`, `state.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
