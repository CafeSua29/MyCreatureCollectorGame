# Sức chứa kho quái và túi trang bị (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- **Có giới hạn, mở rộng không giới hạn bằng tiền.** Ban đầu (số tạm trong `balance.json`): **kho quái 200 con** (không tính đội 6 con), **túi trang bị 100 món** (không tính món đang lắp trên quái).
- **Mở rộng** ở **NPC kho đồ ở thị trấn**, mỗi lần **+50**. Giá lần thứ k (đa thức, số tạm): kho quái `1.000 × k²`, túi trang bị `1.500 × k²`. Sức chứa hiện tại lưu trong state (tăng version save).
- **Không gian ngự thú** (như truyện ngự thú, chủ project yêu cầu): ngoài mở rộng bằng tiền, **mỗi mốc cảnh giới ngự thú sư** (2, 5, 10, 20, 40… gấp đôi, theo cảnh giới cao nhất từng đạt; `docs/rules/tamer.md`, `ascension.md`) (đếm bằng `countMilestonesReached` với `tamer.realmMilestones`, như ô đồ cầm) cộng thêm **+50 kho quái** và **+25 túi trang bị**. Sức chứa = phần mua + phần theo cảnh giới (một hàm duy nhất), không bao giờ giảm.
- **Kho khí linh** (`artifact-spirits.md`) và **hồn phách** (`inventory.souls`, `soul-relics.md`) tính chung sức chứa túi trang bị.
- **Item gộp chồng** (thuốc, bóng, đá, đồ cầm tiêu hao, tinh thể...) **không giới hạn**.
- **Kho quái đầy (và đội đủ 6):**
  - **Không ném bóng được**: lệnh báo lỗi ngay, không mất bóng.
  - **Thu phục** (đã làm, `docs/rules/recruit.md`): không xin theo / quy phục (tỉ lệ 0 trong `recruitChance`), Thị Uy báo lỗi như ném bóng.
  - **Khu bảo tồn** (đã làm, `docs/rules/safari-zone.md`): không vào khu được (`enterSafari` báo lỗi, không mất phí); đang trong khu mà đầy thì `throwSafariBall` báo lỗi (vẫn ném mồi / đá, bỏ đi, rời khu được).
  - Trứng đến lúc nở thì **vẫn là trứng**, chờ có chỗ mới nở (bộ đếm dừng ở 0). Breed, gacha, event cho trứng vẫn được (trứng không tính vào kho).
  - Event cho quái trực tiếp (ví dụ Quái bị thương đi theo): không nhận được, ghi log.
- **Túi trang bị đầy:**
  - Trang bị rơi ra **bị mất**, ghi log.
  - **Không mua** trang bị ở cửa hàng, **không tháo** trang bị từ quái về túi.
  - **Thả quái** / dùng làm **quái phụ khi fuse** vẫn làm được: trang bị trên quái đó không còn chỗ về túi thì **hỏi xác nhận**, đồng ý thì **mất** các món đó.
- **Save cũ:** không mất quái nào. Sức chứa kho khởi tạo = `max(200, số quái trong kho)` làm tròn lên bội số 50 (túi trang bị tương tự khi đã có trang bị).
