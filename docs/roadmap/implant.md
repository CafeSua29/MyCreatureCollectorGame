# Phòng Thí Nghiệm: cấy ghép (`implant`) (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

NPC **Phòng Thí Nghiệm** ở thị trấn bán **huyết thanh** (`serum`). Cấy huyết thanh vào quái để **cộng thẳng** vào chỉ số gốc, có rủi ro thất bại. Tên "inject" đã dùng cho tinh thể trait nên tính năng này dùng tên `implant`.

- **Cách tính chỉ số:** tổng cấy ghép của từng chỉ số (`implantBonusStats`) được cộng **cùng chỗ với gen**, **không nhân `geneWeight`**, trước mọi bước nhân (race, boss, level), rồi mới tới các bước % phía sau (xem "Thứ tự tính chỉ số"). Tổng này **có thể âm** (do thất bại). Kết quả của bước gốc vẫn tối thiểu 1.
- **Huyết thanh** khai báo trong `serums.json` theo bậc. Số tạm, khoảng giá trị là ở tầng 1. Chủ project chốt thứ tự mạnh dần: uncommon > common, rare > uncommon trên mỗi chỉ số, epic > rare:

  | Bậc      | Số chỉ số | Mỗi chỉ số | Trọng số xuất hiện | Giá gốc |
  | -------- | --------- | ---------- | ------------------ | ------- |
  | common   | 1         | +5–10      | 60                 | 300     |
  | uncommon | 1         | +10–20     | 25                 | 800     |
  | rare     | 2         | +20–30     | 12                 | 2.000   |
  | epic     | 3         | +30–45     | 3                  | 6.000   |
  - Chỉ số nào được tăng và tăng bao nhiêu được **random lúc Phòng Thí Nghiệm đổi hàng**, và hiển thị sẵn cho người chơi. Các chỉ số trong một huyết thanh không trùng nhau. Giá trị là số nguyên ≥ 1.
  - **Giá trị scale theo tầng:** khoảng giá trị nhân `geneGrowthPerFloor^(highestFloor − 1)` (dùng chung hệ số với gen quái hoang), làm tròn xuống, tối thiểu 1. Lý do: race, boss, level nhân đều cả gen lẫn cấy ghép, nên thứ quyết định giá trị của cấy ghép là tỉ trọng so với gen, mà gen thì tăng theo tầng và breeding.

- **Danh sách hàng:**
  - Mỗi lần có **5–10 huyết thanh**, chọn theo trọng số bậc. Mỗi huyết thanh **dùng không giới hạn số lần** cho tới lần đổi hàng sau. Một quái được cấy cùng một huyết thanh nhiều lần.
  - **Đổi hàng sau mỗi `labRestockDays` (10) ngày** theo đồng hồ `day` (`lifespan.md`, quy ước đồng hồ: việc theo thời gian dùng `day`). Game mới random danh sách ngay lúc tạo.
  - Danh sách hàng và bộ đếm trận lưu trong state (`labStock`, `labRestockDay`), random bằng RNG của core. Load lại không đổi được hàng.
- **Cấy** (action `implant { monsterId, serumIndex }`, ở thị trấn, ngoài trận, quái ở đội hoặc kho):
  - **Giá** = giá gốc × `highestFloor`. Giá không tăng theo số lần đã cấy. Thất bại vẫn mất tiền.
  - **Tỉ lệ thành công** = `90 × 0,9^(implantAttempts)` %. `implantAttempts` là số lần đã cấy trên quái đó (gộp mọi chỉ số, cả thành công lẫn thất bại). Mọi bậc dùng **cùng tỉ lệ** và mỗi lần cấy tính 1 lần, bất kể bậc. Theo công thức: lần 1 là 90%, lần 5 khoảng 59%, lần 10 khoảng 35%. Tính tỉ lệ qua **một hàm duy nhất** có hook (`modifyImplantChance`) để sau này thêm vật phẩm hay trait làm đổi tỉ lệ. Hiện chưa có vật phẩm hỗ trợ.
  - **Thành công:** cộng mọi chỉ số của huyết thanh vào `implantBonusStats`.
  - **Thất bại:** **trừ** đúng mọi giá trị định cộng (huyết thanh nhiều chỉ số thì trừ cả nhiều chỉ số), và `implantFails` + 1. Số lần thất bại **không bao giờ reset**.
  - **Thất bại lần thứ 3:** **mất quái** (chết hẳn): gọi `dieForever` với `cause: 'implant'` (thêm vào `DEATH_CAUSES` ở `model/soul.ts`; đồ về túi + để lại hồn phách, `soul-relics.md`; túi đầy thì hỏi xác nhận, như thả quái). Đội vẫn phải còn ít nhất 1 con nếu quái này mất, nên kiểm tra trước khi cấy; vi phạm thì ném `ActionError`. Log ghi `implantFailed` / `implantLostMonster`.
  - **Load lại để thử lại:** chấp nhận, như luật fuse.
- **Lưu trên quái:** `implantBonusStats` (`Decimal`, mỗi chỉ số được phép âm; `validateMonster` chỉ kiểm tra hữu hạn và không NaN), `implantAttempts`, `implantFails` (số nguyên ≥ 0). Đổi state nên **tăng version save**; migrate đặt 0 cho mọi quái.
- **Tương tác:**
  - **Fuse:** quái phụ đã cấy thì phần cấy ghép nằm sẵn trong chỉ số `withFusingBonus` của nó, nên ½ phần đó tự truyền qua `fusingBonusStats`. Số lần cấy và số lần thất bại của quái phụ mất theo nó. Quái gốc giữ nguyên `implantBonusStats`, `implantAttempts`, `implantFails`.
  - **Breeding:** không truyền, con có cả ba trường bằng 0. Lý do như hiến tế: bố mẹ không mất đi nên truyền là nhân bản miễn phí.
  - **Tiến hóa:** giữ nguyên. Quái hoang, boss, trứng, gacha: luôn 0.
- `MonsterView` hiện `implantBonusStats`, tỉ lệ thành công lần cấy tiếp theo, số lần thất bại / 3.
- **Sau này (chưa chốt, hỏi chủ project khi làm):** huyết thanh có **hiệu ứng** thay vì cộng chỉ số, ví dụ hồi khoảng 1% max HP mỗi lượt trong trận. Thất bại thì thành hiệu ứng ngược (mất 1% max HP mỗi lượt). Cần cân bằng. Để chuẩn bị, định nghĩa huyết thanh dùng danh sách `effects` qua registry (hiện chỉ có handler `flatStat`), để thêm hiệu ứng mới chỉ cần thêm handler. Cách lưu hiệu ứng cấy trên quái (cộng dồn, có trần hay không) chốt khi làm.
