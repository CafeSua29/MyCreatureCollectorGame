# Linh dịch

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như **Pokérus**: một loại "bệnh" **có lợi**, rất hiếm, lây trong đội. Bước 5u (2026-10-31). Số là **số tạm** (`balance.json` khóa `spiritVirus`; `balance-systems.md`).

Code: `monster/spiritVirus.ts` (nhiễm / lây, gen khi thắng, bớt ngày, fuse, kiểm tra trên quái), gọi ở `finish` / `applyWin` (`battle/outcome.ts`), việc theo ngày `spiritVirus` (`progression/time.ts`), điểm nỗ lực ở `battleEffortGain` (`monster/effort.ts`), `gameData/validateSpiritVirus.ts`.

## Luật

- **Trường trên quái** `spiritVirus`: `null` (chưa từng nhiễm) | `{ state: 'infected', daysLeft }` (`daysLeft` nguyên ≥ 1) | `{ state: 'immune' }` (save **v70**, migrate `null` cho mọi quái kể cả trứng).
- **Nhiễm** (như `RandomlyGivePartyPokerus` của Pokémon thế hệ 3+): sau **mỗi trận** (thắng, thua, chạy; mọi loại trận), tỉ lệ `infectPercent` (3/65536 ≈ 0,0046%, đúng số gốc) một quái **ngẫu nhiên trong đội** nhiễm, số ngày tung đều `minDays`–`maxDays` (1–4, như chủng Pokérus). Quái được chọn đã từng nhiễm (đang nhiễm / miễn dịch) thì không có gì (như gốc).
- **Lây** (như `PartySpreadPokerus`): sau đó, theo thứ tự đội, mỗi quái đang nhiễm có `spreadPercent` (1/3) lây sang **cả hai quái kề** trong đội chưa từng nhiễm, **cùng số ngày còn lại**; quái đứng sau vừa được lây thì bỏ qua (không lây tiếp trong cùng lượt). Quái vừa bắt đã vào đội cũng tính (chạy sau khi quái bắt vào đội).
- **Hết bệnh:** mỗi ngày game (`DAILY_TASKS.spiritVirus`) quái đang nhiễm **ở đội** bớt 1 ngày; về 0 thì thành **miễn dịch vĩnh viễn** (không nhiễm lại); lúc khỏi tung `marks.mutationOnVirusCurePercent` (10%) một đột biến nhỏ (`marks.md`, log ngoài trận `markGained`). Quái ở **kho không đếm** (như Pokémon trong PC; lưu số ngày còn lại nên không cần dịch ngày khi ra / vào kho).
- **Hiệu ứng khi đang nhiễm:**
  - **Điểm nỗ lực ×`effortMultiplier`** (2), nhân riêng sau hệ số hook `effortGainModifier` (như Pokémon: Đai Lực Sĩ + Pokérus = ×4; `effort-values.md`).
  - **EXP nhận +`infectedExpPercent`** (100%), cộng vào cùng tổng % với hook `expGainPercent` của trait (`traitExpMultiplier(data, monster, extraPercent)`), rồi nhân hệ số tuổi.
  - **Gen:** mỗi trận thắng mà quái nhận EXP (ra sân, còn sống), +`genesPerWin` (1) × hệ số gen của **tầng cao nhất** (`floorGeneMultiplier`, như thiên tài địa bảo, để giữ giá trị ở mọi tầng), làm tròn xuống, vào **một chỉ số ngẫu nhiên**.
- **Miễn dịch:** EXP nhận +`immuneExpPercent` (25%, cùng tổng % như trên); không nhân điểm nỗ lực, không thêm gen (như gốc: Pokémon đã khỏi không còn nhân đôi EV).
- **Breeding:** con không nhiễm. **Tiến hóa:** giữ. **Fuse:** giữ trạng thái **tốt hơn** của hai quái (đang nhiễm nhiều ngày hơn > đang nhiễm ít ngày > miễn dịch > chưa từng nhiễm). Quái hoang, boss, NPC: `null`.
- `MonsterView.spiritVirus` = trạng thái trên quái (UI hiện "đang nhiễm, còn N ngày" / "miễn dịch").

## Chỗ lệch bản gốc

- Pokérus gốc chỉ nhân đôi EV. **EXP +100% / +25% và gen +1 mỗi trận** là thiết kế riêng của game (chủ project chốt trong roadmap), để linh dịch có giá trị trong game scale vô hạn.
- Roadmap cũ ghi tỉ lệ nhiễm 1/3000 mỗi quái sau trận thắng; đổi theo gốc: 3/65536 mỗi trận (mọi kết quả), một quái ngẫu nhiên; lây sang **cả hai** quái kề như thế hệ 3+. Lưu `daysLeft` thay cho `untilDay` (gọn hơn và tự dừng khi ở kho).

## Dữ liệu

- `config.spiritVirus`: `infectPercent`, `spreadPercent` (số trong [0, 100]), `minDays`, `maxDays` (nguyên ≥ 1, min ≤ max), `infectedExpPercent`, `immuneExpPercent` (≥ −100), `effortMultiplier`, `genesPerWin` (≥ 0); trường lạ báo lỗi.

## Chưa có

- Báo người chơi khi quái nhiễm / khỏi (dòng log, hộp thoại kiểu y tá Pokémon Center): chờ UI (`ui-overhaul.md`).
- Vật phẩm / NPC chữa hoặc gây linh dịch: bản gốc không có, không làm.
