# Luân hồi quái (`rebirth`)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Reincarnation của Disgaea và "luân hồi chuyển thế" trong truyện tu tiên: quái level cao **về level 1** để nhận **hệ số vĩnh viễn** và **trẻ lại**, mỗi lần mạnh hơn lần trước. Làm ở bước 6m (save v80). Số ở `balance.json` khóa `rebirth` (số tạm, số hiện tại ở `balance-systems.md` mục "Luân hồi").

Code: `progression/rebirth.ts` (`rebirthMonster`, `rebirthRequirements`, `applyRebirth`), nguồn % `rebirth` ở `registries/statPercentSources.ts` (`rebirthStatPercent`), điểm thiên phú `registries/talents.ts` (`talentPointsEarned`), đồ rơi `rebirthBossDrops` (`battle/outcome.ts`), kiểm tra dữ liệu `gameData/validateRebirth.ts`.

## Luật

- Trường **`Monster.rebirths`** (nguyên ≥ 0, không trần). Quái hoang, boss, trứng, quái mới 0.
- Action **`rebirthMonster { monsterId }`** ở **NPC luân hồi ở thị trấn**, ngoài trận (`notInTown`, `inBattle`). Quái ở đội hoặc kho (`monsterNotOwned`), không đang làm việc (`monsterBusy`). Bản mệnh thú luân hồi được.
- **Điều kiện lần thứ n = `rebirths + 1`** (`rebirthRequirements`):
  - level **hiện tại** ≥ `minLevelBase × n` (100, 200, 300...), không thì `levelTooLowForRebirth { need, have }`;
  - `pillsPerRebirth × n` **Luân Hồi Đan** (`pillItemId`, category `material`; thiếu `notEnoughItem`, kiểm tra trước tiền); `pillsPerRebirth` = 0 thì không cần đan;
  - tiền `costBase × n²` (`Decimal`, thiếu `notEnoughMoney`).
- **Reset:** level 1, EXP về mức của level 1 theo nhóm tăng trưởng (`expForLevel(1, …)`). **`maxLevelReached` giữ nguyên** nên thọ nguyên và điểm thiên phú theo level không tụt. Hồi đầy máu, bỏ mọi trạng thái (thân xác mới; max HP tụt theo level nên giữ máu đã mất thì quái gục ngay). Lệch roadmap (roadmap không nói tới máu): thêm để quái không gục sau luân hồi.
- **Dấu ấn** (`marks.md`): luân hồi xóa sẹo, ám ảnh và bộ đếm ám ảnh (thân xác mới, log ngoài trận `markRemoved`); đột biến, thích nghi, chiến tích giữ.
- **Giữ:** loài (không về dạng gốc) và **mọi thuộc tính khác trên quái** (skill, thuần thục, gen phần cũ, trait, thức tỉnh, hiến tế, hồn tinh, cấy ghép, trang bị, thân mật, hóa hình, dưỡng dục, thiên phú, tính cách, Âm / Dương, huyết mạch, khế ước, bản mệnh...). `applyRebirth` chỉ đổi đúng các trường kể ở đây, nên **trường mới thêm vào `Monster` mặc định giữ** khi luân hồi. Không dưỡng dục lại (`imprinting.md`: `startImprint` bỏ qua quái đã có `imprint`).
- **Nhận mỗi lần:**
  - +`statPercentPerRebirth` (10)% mọi chỉ số kể cả max HP mỗi lần đã luân hồi, **tuyến tính** (nguồn % `rebirth`, cộng vào tổng % ở bước áp trait, `stats-traits.md`);
  - gen mọi chỉ số + `genePercent` (10)% gen hiện tại, làm tròn xuống, **ít nhất +1** (như linh thạch khi ấp trứng);
  - +`talents.pointsPerRebirth` (3) điểm thiên phú: `talentPointsEarned` cộng `rebirths × pointsPerRebirth` (điểm không lưu, `monster-talents.md`);
  - **trẻ lại:** `ageDays = 0` (ấu niên lại, `lifespan.md`); thọ nguyên tắt (`aging` false) vẫn đặt 0;
  - mốc lý lịch `reborn { count }` (`count` = số lần sau khi luân hồi, `monster-history.md`).
- **Breeding:** con `rebirths = 0` (bố mẹ không mất, như hiến tế). **Fuse:** quái gốc giữ của mình + ⌊½ của quái phụ⌋ (`fusing.md`).
- **Luân Hồi Đan** (`rebirthPill`, giá gốc 5.000, không bán ở cửa hàng thường): boss tầng của map rơi (`rebirth.floorBossDrops`, 10%), chợ đen (trọng số 2, 1 viên), luyện đan cấp 8 (3 Hà Thủ Ô + 2 Tuyết Liên + 3 yêu đan cùng loại + 5.000 tiền, 60%; `alchemy.md`).
- `MonsterView.rebirth = { count, statPercent, next }` (`next` = `rebirthRequirements` của lần sau). Kiểm tra save: `rebirths` nguyên ≥ 0 (`validateMonster`). Migrate v79 → v80 đặt 0 cho mọi quái (kể cả trứng). Kiểm tra dữ liệu: `config.rebirth` đủ trường, không trường lạ, số không âm (`minLevelBase` nguyên ≥ 1, `pillsPerRebirth` nguyên ≥ 0), đan là `material`, bảng rơi hợp lệ; `talents.pointsPerRebirth` nguyên ≥ 0.
- Mô phỏng: mục "Luân hồi" ở `simulation-features.md`.
