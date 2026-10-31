# Cây thần: gacha trứng quái (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- **NPC ở thị trấn**, ngoài trận. Trả bằng **tiền**, nhận **trứng** (dùng chung cơ chế trứng: quái random sẵn lúc tạo trứng, nở sau 5–10 trận thắng, nở ra **level 1**).
- **Giá:** quay ×1 = `gachaCostBase × highestFloor`. Quay ×10 = **9 ×** giá quay ×1 (giảm 10%). **Không có bảo hiểm (pity).** Hệ số trong `balance.json` (số tạm).
- **Pool loài:** chỉ loài có **`gachaWeight` > 0** trong `species.json`, chọn theo trọng số đó (loài hiếm có trọng số thấp). Kiểm tra dữ liệu: báo lỗi nếu loài **không giới tính** hoặc loài **không phải dạng đầu tiên** (đã tiến hóa) có `gachaWeight`. Loài chỉ làm boss thì không khai `gachaWeight` nên không bao giờ ra.
- **Gen:** random như quái hoang, khoảng gen nhân `geneGrowthPerFloor^(highestFloor − 1)` (theo tầng cao nhất đã mở, không theo vị trí đang đứng).
- **Trait:** số lượng như quái hoang (0 / 1 / 2 với trọng số 50 / 35 / 15). Loại trait chọn theo trọng số riêng của gacha (số tạm trong JSON), **tầng càng cao càng dễ ra trait xịn**:
  - positive 60;
  - negative 40, nhân `1 / (1 + 0,05 × (highestFloor − 1))`;
  - **rare** 2, nhân `1 + 0,1 × (highestFloor − 1)`.
  - Không lấy cặp loại trừ (như quái hoang).
- **Shiny:** tỉ lệ `config.shiny.wildChance`. **`bossMultiplier` = 1**, không có trait Huyết thống boss. **Không mang trang bị.** Giới tính 50/50.
- Dùng chung `rollMonster` (điểm duy nhất sinh quái) với tham số trọng số loại trait riêng; không viết hàm sinh quái thứ hai.
- **Phẩm cấp loài** (`docs/rules/species-rank.md`, đã làm; dùng `speciesRankOf` / `speciesRankIndex`): cân nhắc đặt `gachaWeight` mặc định theo bậc (bậc cao trọng số thấp) thay vì ghi tay từng loài; hỏi chủ project khi làm.
