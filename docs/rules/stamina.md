# Thể lực cho skill

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Lấy từ **Stamina của Temtem**; thay luật "Không có PP". Code `battle/stamina.ts`. Số ở khóa `stamina` của `balance.json`. Quái hoang, boss, NPC cùng luật.

## Luật

- **Thể lực tối đa** `maxStamina`: thang cố định `stamina.max` (100) × hook trait `staminaMaxPercent`. Không phải chỉ số thứ 7 nên không phình theo scale.
- **Chỉ có trong trận**: lưu phần đã mất `BattleRecord.staminaUsed` (bỏ trống = đầy), hết trận tự đầy, không lưu trên quái.
- **Giá** `staminaCostOf`: trường skill `staminaCost` (nguyên ≥ 0), không có thì theo bảng `stamina.costByPower` (power tăng dần: ≤ 40: 10, ≤ 70: 15, ≤ 100: 20, ≤ 130: 25, còn lại 30), skill trạng thái `statusCost` (10); × hook trait `staminaCostPercent`. Struggle tốn 0.
- **Tốn khi** quái dùng skill bằng lệnh của chính nó. Skill do trait / phản ứng / minion, hợp kích kỹ, skill đang chờ (hold) không tốn. Giá tính theo skill đã chọn (đang Dynamax vẫn theo skill gốc).
- **Cuối lượt** (`staminaAtTurnEnd`): quái còn trên sân hồi `regenPercent` (5)% tối đa + `regenFlat` (1), cộng `staminaPerTurn` của trạng thái đang mang (âm = mất). Kẹp trong [0, tối đa].
- **Lệnh `rest`** (Nghỉ): không làm gì, hồi thêm `restPercent` (15)%, log `rested`. Chung pha với phòng thủ, priority 0.
- **Quá sức** (`overexert`): dùng skill khi thể lực < giá: vẫn ra đòn, thể lực về 0, sau khi skill xong quái mất `overexertHpPercent` (2)% max HP **mỗi điểm thiếu** (tối đa 100%, có thể gục), log `overexerted { monsterId, deficit, damage }`, rồi **mất lượt kế tiếp** (`BattleRecord.exhaustedTurn`): lệnh nào của lượt đó cũng thành Nghỉ.

## AI

Ứng viên `rest` điểm = phần thể lực đã mất × `restWeight` (0,6). Skill làm quá sức bị trừ điểm = phần máu hiện tại sẽ mất + `exhaustedPenalty` (0,5). Không chọn skill vượt sức khi còn lựa chọn có điểm cao hơn.

## Liên quan

- **AP của Cassette Beasts** quy đổi: 1 AP = 10 thể lực (thanh AP gốc 10, thang này 100): giá chiêu Cassette Beasts đã nhập = AP gốc × 10 (`cb-elements-import.mjs`), `energised` / `drained` (AP Boost / Drain) ±10 mỗi lượt, `gemstoneWall` +10 mỗi lượt, Recycle hồi 10 mỗi lượt tường còn lại (`cassette-mechanics.md`).
- **Trait:** hiệu ứng ngôn ngữ trait `stamina` (số điểm / % tối đa / kéo lên mức tối thiểu / hút từ quái khác) và bộ đếm `stamina` (thể lực hiện tại; `trait-dsl.md`). Thể lực tối đa / hiện tại tính ở `staminaMaxOf` / `staminaOf` (`registries/combatTraitQueries.ts`), `battle/stamina.ts` dùng lại. Trait Portals of Phereon: 1 AP / năng lượng = 10 thể lực, 1 mana = 5, 1 thể lực gốc (thanh 200) = 1 (`content-sources-real.md`).
- **Hold** (`skill-synergy-hold.md`) chạy độc lập.
- **Mô phỏng:** cột `rests`, `overexerted` ở `floors.csv`, biến thể A/B `noStamina` (`simulation-features.md`).

## Lệch gốc

Temtem tính HP mất theo level; game theo % max HP vì scale vô hạn. Giá theo bảng power là mức xấp xỉ Temtem cho chiêu không có số riêng (chiêu Pokémon / game khác không có thể lực gốc).

## Chưa có

- Trait kiểu Resilient (chặn gục do quá sức một lần mỗi trận): chờ nhập trait Temtem có hook này.
- Chiến thuật tự động đánh chưa có ngưỡng nghỉ riêng: dùng chung AI ở trên; làm khi có UI chiến thuật (`docs/roadmap/ui-overhaul.md`).
