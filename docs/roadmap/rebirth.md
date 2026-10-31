# Luân hồi quái (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Reincarnation của Disgaea và "luân hồi chuyển thế" trong truyện tu tiên: quái level cao **về level 1** để nhận **hệ số vĩnh viễn** và **trẻ lại**, mỗi lần mạnh hơn lần trước. Hợp chủ đề scale vô hạn. Làm sau "Thức tỉnh". Số là **số tạm** (`balance.json`, khóa `rebirth`).

## Luật

- Trường mới `rebirths` (số nguyên ≥ 0, không trần). **Tăng version save**, migrate 0.
- **Điều kiện** (`rebirthMonster { monsterId }`, NPC thị trấn, ngoài trận): level ≥ `minLevelBase × (rebirths + 1)` (100, 200, 300...), tiền `costBase × (rebirths + 1)²` + `rebirths + 1` viên **Luân Hồi Đan** (boss tầng rơi, chợ đen, luyện đan). Bản mệnh cũng luân hồi được.
- **Reset:** level 1, EXP 0 (`maxLevelReached` **giữ nguyên**, nên thọ nguyên và điểm thiên phú không tụt; lần luân hồi sau vẫn xét theo level hiện tại). **Giữ:** loài (không về dạng gốc) và **mọi thuộc tính khác trên quái** (skill, thuần thục, gen, trait, thức tỉnh, hiến tế, hồn tinh, cấy ghép, trang bị, thân mật, hóa hình, dưỡng dục, thiên phú, tính cách, Âm / Dương...; mục nào thêm trường mới trên quái thì mặc định giữ khi luân hồi). Không dưỡng dục lại (`docs/rules/imprinting.md`: `startImprint` bỏ qua quái đã có `imprint`).
- **Nhận:**
  - +`statPercentPerRebirth` (10%) mọi chỉ số mỗi lần luân hồi, **cộng** vào tổng % ở bước áp trait.
  - Gen mọi chỉ số + `genePercent` (10%) gen hiện tại (`Decimal`).
  - +3 điểm thiên phú (`docs/rules/monster-talents.md`): thêm `talents.pointsPerRebirth` (3) vào config và cộng `rebirths × pointsPerRebirth` trong `talentPointsEarned` (`registries/talents.ts`; điểm không lưu nên không cần migrate điểm).
  - **Trẻ lại:** `ageDays = 0` (tuổi 0, ấu niên lại; `lifespan.md`). Khi thọ nguyên tắt (`aging` false) vẫn đặt 0, hiệu ứng tuổi chỉ có khi bật lại.
  - Mốc lý lịch `reborn { count }` (type và kiểm tra đã có từ bước 5c2: gọi `addMilestone`, bỏ `pendingRoadmap` của mốc trong `MILESTONE_RULES`; `docs/rules/monster-history.md`).
- **Breeding:** con `rebirths = 0`. **Fuse:** quái gốc giữ của mình + ½ của quái phụ (làm tròn xuống).
- `MonsterView`: số lần luân hồi, điều kiện lần sau, % đang cộng.

## Test

Điều kiện, reset / giữ đúng danh sách, các phần nhận, trẻ lại (có / không thọ nguyên), fuse ½, migrate.

## Tài liệu khi xong

Luật vào `docs/rules/` (file mới hoặc gộp luật thức tỉnh), `stats-traits.md`, `state.md`, `world-items.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
