# Ấp trứng có hoàn cảnh (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Trứng hiện nở sau 5–10 trận thắng quái hoang (`breeding-eggs.md`). Mục này cho **hoàn cảnh ấp** ảnh hưởng con nở ra, như truyện ngự thú (ấp bằng linh thạch, ấp ở linh địa). Làm sau "Luyện đan" (cần linh thạch là nguyên liệu). Số là **số tạm** (`balance.json`, khóa `incubation`).

## Luật

- **Đặt linh thạch vào trứng:** action `infuseEgg { eggId, itemId }` (ngoài trận), tiêu 1 linh thạch hệ X (`material` của `alchemy.md`), tối đa `maxInfusions` (3) mỗi trứng, lưu trên trứng (`infusions: elementId[]`).
  - Mỗi linh thạch **cùng hệ với loài trong trứng**: gen khi nở +`genePercentPerInfusion` (10%).
  - Linh thạch hệ khác: hệ Tera khi nở = hệ đó (lần đặt cuối), không tăng gen.
- **Linh địa:** mỗi trận thắng ở map có hệ / môi trường khớp hệ của loài trong trứng (map khai báo hệ hoặc thời tiết ưa thích trong `biomes.json`) thì trứng tiến **2** bước thay vì 1, và +`linhDiaMutationChance` (1%) tỉ lệ đột biến (gen mọi chỉ số tăng như đột biến breed hiện có).
- **Ôn Dưỡng Lò** (`keyItem`, `transformation.md` có category này): có trong túi thì trứng tiến thêm 1 bước mỗi lần nghỉ ở thị trấn. Mua ở cửa hàng giá cao một lần.
- Shiny khi nở +`infusionShinyBonus` × số linh thạch (số tạm nhỏ).
- Trứng truyền thừa (`lifespan.md`), trứng boss, trứng breeding đều áp dụng.
- **Tăng version save** (trứng thêm `infusions`, migrate rỗng).

## Test

Đặt linh thạch (giới hạn, cùng / khác hệ), gen và hệ Tera khi nở, linh địa (bước đôi, đột biến), Ôn Dưỡng Lò, shiny, migrate.

## Tài liệu khi xong

Luật vào `breeding-eggs.md`, `state.md`, `world-items.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
