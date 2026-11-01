# Phẩm cấp loài

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Nhãn **phẩm cấp cho loài** (như rank G → X của Dragon Quest Monsters, "chủng tộc hạ / trung / thượng đẳng" trong truyện ngự thú). Khác **tư chất** (`aptitude.md`: chấm **từng con** theo gen): phẩm cấp chỉ phụ thuộc loài. **Không lưu** trong save, tính khi cần, **không đổi chỉ số**. Bước 6.5j2.

## Luật

- **Hàm duy nhất** `speciesRankOf(data, species)` (`registries/speciesRank.ts`, nhận loài thường): trả về bậc (`SpeciesRankDef`).
  1. Loài có trường `rank` (ghi đè của chủ project) thì lấy đúng bậc đó, bỏ qua mọi bước dưới.
  2. Không thì lấy bậc cao nhất có `from` ≤ **tổng chỉ số gốc** (`baseStatTotal`: cộng 6 chỉ số `baseStats`).
  3. Loài **huyền thoại** (`catchRate` ≤ `config.speciesRank.legendaryCatchRate`) cộng `legendaryBonus` bậc, tối đa bậc cao nhất.
- Quái: `monsterSpeciesRankOf(data, monster)` theo `baseSpeciesId` (quái fuse theo loài của quái gốc).
- Thứ hạng bậc: `speciesRankIndex` (thứ tự trong file, −1 nếu id lạ).
- Dạng loài (Mega, G-Max, vùng miền...) là loài riêng nên có bậc theo chỉ số của chính dạng đó.
- **Dùng ở:** hệ số thu phục `rankFalloff` ^ thứ hạng (`recruit.md`), `MonsterView.speciesRankId`, lọc `minSpeciesRankId` (từ bậc đó trở lên), sắp xếp `speciesRank` (`roster.md`). Bên ngoài core: `speciesRankOf`, `monsterSpeciesRankOf`, `baseStatTotal` xuất lại qua `roster/`.
- **Không có** điều kiện tiến hóa theo phẩm cấp loài (chủ project chốt 2026-10-24): bậc của loài cố định, nên điều kiện như vậy luôn đủ hoặc luôn thiếu.
- Điều kiện thành tựu `speciesRank { rankId }` (số loài đã sở hữu từ bậc) ở `achievements.md`.
- Chưa có (ghi ở roadmap của từng mục): hiển thị / lọc / sắp xếp ở màn hình Dex (chờ UI; Dex đã làm ở `dex.md`), trọng số gacha (chờ `gacha.md`), yêu cầu trao đổi NPC (chờ `npc-trades.md`). Mở khóa quái khởi đầu theo phẩm cấp dùng điều kiện thành tựu `speciesRank` (`starters.md`).

## Dữ liệu

- `speciesRanks.json`: danh sách `{ id, from }` theo thứ tự tăng dần (như `aptitudeTiers.json`), tên ở i18n `speciesRanks`. Có ít nhất một bậc, bậc đầu `from` = 0, `from` tăng dần ngặt, trường lạ báo lỗi, id không trùng.
- `config.speciesRank`: `legendaryCatchRate`, `legendaryBonus` (số nguyên ≥ 0).
- `species.json`: trường tùy chọn `rank` (id trong `speciesRanks.json`).

## Số

- Ngưỡng (tổng chỉ số gốc): **G** 0, **F** 305, **E** 415, **D** 440, **C** 475, **B** 510, **A** 535, **S** 555, **X** 605. Huyền thoại `catchRate` ≤ 5, +1 bậc.
- Cách chọn (chủ project chốt 2026-10-24: "bậc càng mạnh càng hiếm", Claude chọn số): dò ngưỡng trên toàn bộ loài thường (bỏ dạng loài, tính cả cộng bậc huyền thoại) sao cho số loài giảm dần theo bậc. Phân bố lúc chốt (8188 loài, trong đó 523 huyền thoại): G 20,0% / F 16,1% / E 12,9% / D 11,7% / C 9,7% / B 9,2% / A 7,5% / S 7,0% / X 5,7%. X cao hơn mức lý tưởng vì gần hết huyền thoại (trung vị tổng chỉ số 620) rơi vào S / X; muốn X hiếm hơn thì hạ `legendaryBonus` về 0 hoặc ghi đè `rank`.
- Dữ liệu thêm loài mới làm lệch phân bố thì dò lại ngưỡng theo cách trên.
- Không chạy script mô phỏng: phẩm cấp loài chưa có tác dụng trong trận / phần thưởng (chỉ là nhãn), chạy mô phỏng không đo được gì. Khi các tính năng ở mục "Chưa có" dùng tới thì đo ở đó.
