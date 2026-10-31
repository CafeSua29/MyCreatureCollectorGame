# Câu cá và khai thác (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Hai hành động mới trên tầng, cách gặp quái và lấy nguyên liệu khác ngoài đánh quái hoang. Không phải minigame (game dạng chữ), chỉ là action có RNG. Làm sau "Luyện đan" (cần nguyên liệu). Số là **số tạm** (`balance.json`, khóa `gathering`).

## Luật

- Map khai báo trường mới `gathering: { fishing?: true, mining?: true }` trong `biomes.json` (map có nước / đá; script sinh map đề xuất theo môi trường, chủ project duyệt).
- **Câu cá** (`fish`, ở tầng có `fishing`): cần **cần câu** (`keyItem`: Cần câu thường / tốt / siêu, mua ở cửa hàng theo tầng). Kết quả theo bảng `fishingTable` của map: gặp **quái hệ nước** của map (trận như quái hoang; cần câu tốt hơn → loài hiếm hơn, level cao hơn), hoặc vật phẩm (nguyên liệu, thiên tài địa bảo hệ nước). `Mồi câu` (`consumable`) tăng tỉ lệ loài hiếm.
- **Khai thác** (`mine`, ở tầng có `mining`): cần **cuốc** (`keyItem`, ba cấp). Ra khoáng / linh thạch / Đá cường hóa; tỉ lệ `ambushChance` (20%) bị **quái hệ đất / đá phục kích** (trận không chạy được ở lượt đầu).
- Mỗi lần câu / khai thác **tính như một trận** cho đồng hồ (tốn giờ: thêm một mục vào `clock.hours`, số tạm như trận quái hoang) và thời hạn tính theo trận (quy ước đồng hồ ở `lifespan.md`). Không đổi save ngoài vật phẩm mới.

## Test

Điều kiện map / dụng cụ, bảng kết quả theo cấp dụng cụ, mồi câu, phục kích, đồng hồ.

## Tài liệu khi xong

Luật vào `world-items.md` (tầng và biome), `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
