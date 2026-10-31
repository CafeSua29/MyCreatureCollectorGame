# Nghiên cứu loài (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Research Tasks của Pokémon Legends: Arceus: mỗi loài có **nhiệm vụ nghiên cứu**; lên **cấp nghiên cứu** thì mở thông tin và nhận lợi ích **riêng cho loài đó**. Mở rộng Dex (`dex.md`), làm sau "Mở khóa quái khởi đầu". Số là **số tạm** (`balance.json`, khóa `research`).

## Nhiệm vụ (mẫu chung, không khai báo từng loài)

- Dữ liệu `src/data/researchTasks.json`: các **mẫu nhiệm vụ** áp cho mọi loài thường, mỗi mẫu có các mốc và điểm: bắt (1 / 3 / 5 / 10 / 25), hạ (5 / 20 / 50 / 100), thấy loài đó dùng skill hệ chính (5 / 20), tiến hóa ra loài đó (1 / 3), nở từ trứng (1 / 5), bắt khi đang có trạng thái (1 / 5), bắt shiny (1). Mẫu có điều kiện áp dụng (ví dụ "tiến hóa ra" chỉ cho loài không phải dạng đầu). Loài có thể có **nhiệm vụ riêng** ghi thêm (tùy chọn, chủ project thêm dần).
- Bộ đếm theo loài: `GameState.research: { [speciesId]: { counters, level } }` (chỉ loài đã tương tác). Quái fuse tính theo loài gốc. **Tăng version save**; migrate tạo cấp theo Dex (đã sở hữu = đã bắt 1).

## Cấp nghiên cứu và lợi ích

- Điểm cộng dồn → **cấp 1–10** (ngưỡng trong `balance.json`); **Hoàn thành** = cấp 10. Log `researchLevelUp { speciesId, level }`.
- Lợi ích theo loài (số tạm): cấp 2 hiện chỉ số gốc / race / hệ trong Dex; cấp 4 hiện learnset và tiến hóa; cấp 5 tỉ lệ bắt loài đó +10%; cấp 7 EXP khi hạ loài đó +20%; cấp 10 **tỉ lệ shiny của loài đó +100%** (cộng như mọi nguồn).
- **Bùa Lấp Lánh** (vật phẩm chìa khóa, như Shiny Charm): nhận khi **hoàn thành** đủ `charmSpecies` (100) loài, tỉ lệ shiny toàn cục +100%. Mốc 500 / 1000 loài: thêm danh hiệu (`titles.md`).
- Giữ qua phi thăng (như Dex).

## Test

Từng mẫu nhiệm vụ và điều kiện áp dụng, nhiệm vụ riêng, cộng điểm / lên cấp, lợi ích theo cấp chỉ áp đúng loài, Bùa Lấp Lánh, quái fuse, migrate.

## Tài liệu khi xong

Luật vào luật Dex trong `docs/rules/`, `state.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.

## Việc chờ từ mục đã làm

- Thưởng nghiên cứu loài có **Kẹo Hiếm** (luật kẹo ở `docs/rules/exp-candy.md`; chờ mục này).
- Điểm yếu của loài (`docs/rules/hit-locations.md` mục "Khám phá điểm yếu") đã phải khám phá bằng cách đánh trúng (Dex `hitParts`, 2026-10-31); khi làm mục này, cân nhắc thêm cách biết điểm yếu từ một cấp nghiên cứu (ghi thêm vào `dex.hitParts` hoặc trường riêng), đổi luật thì sửa `hit-locations.md`.
