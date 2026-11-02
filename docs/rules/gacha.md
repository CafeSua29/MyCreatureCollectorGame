# Cây thần: gacha trứng quái

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

NPC ở thị trấn: trả tiền, nhận trứng quái random sẵn. Bước 10 (2026-11-02). Số là **số tạm** (`balance.json` khóa `gacha`; số hiện tại ở `balance-systems.md`).

Code: `model/gacha.ts` (kiểu), `progression/gacha.ts` (`gachaCost`, `gachaSpeciesPool`, `gachaTraitKindWeights`, `pullGacha`, `isGachaForm`), `gameData/validateGacha.ts`; trọng số loại trait riêng là `MonsterRollSpec.traitKindWeights` (`world/encounter.ts`).

## Quay

- `pullGacha { count }` (thị trấn, ngoài trận): `count` là một trong `pullOptions` (×1, ×10), khác thì `gachaInvalidCount { count }`. Thiếu tiền `notEnoughMoney`, bảng loài rỗng `gachaPoolEmpty`; lỗi thì state giữ nguyên.
- **Giá** = `costBase` × `costMultiplier` × `highestFloor` (`gachaCost`). ×10 có hệ số 9 (giảm 10%). **Không có bảo hiểm (pity).**
- Nhận `count` trứng (cơ chế chung ở `breeding-eggs.md`: nở sau 5–10 trận thắng, không giới hạn số trứng mang theo, id từ `nextMonsterId`). Bộ đếm `stats.gachaPulls` + `count` (`achievements.md`).

## Loài

- **Bảng loài** `gachaSpeciesPool` (chỉ phụ thuộc dữ liệu, cache theo `GameData`): mọi loài thường **dạng đầu** (`isGachaForm`: không có dạng trước, không phải dạng chỉ có trong trận), trọng số > 0:
  - loài có `gachaWeight` trong `species.json` thì lấy đúng số đó (0 = không bao giờ ra; > 0 = ra kể cả loài không gặp ở map nào);
  - không có thì theo **phẩm cấp loài** `rankWeights` (G→X; vượt danh sách lấy số cuối), kể cả loài không gặp ở map nào (chủ project chốt 2026-11-02: mọi kết quả hợp lệ đều có cơ hội).
- Lệch roadmap: roadmap yêu cầu khai `gachaWeight` từng loài và cấm loài không giới tính. Đổi thành trọng số mặc định theo phẩm cấp (hơn 16.000 loài dạng đầu, ghi tay không khả thi, roadmap cũng gợi ý hướng này) với `gachaWeight` là ghi đè; loài không giới tính ra được (`rollGender` trả `none`, mọi kết quả hợp lệ đều có cơ hội). X vẫn có cơ hội rất nhỏ (khác NPC trao đổi, là việc tung may rủi có trả tiền).

## Quái trong trứng

- Sinh qua `rollMonster` như mọi trứng: level 1, tuổi 0, thân mật `affinity.start.egg`, không trang bị, `bossMultiplier` 1, không trait Huyết thống boss, không cực, giới tính theo loài.
- **Gen** như quái hoang, khoảng gen nhân `floorGeneMultiplier(highestFloor)` (theo tầng cao nhất đã mở, không theo chỗ đang đứng).
- **Trait:** số lượng như quái hoang (`wild.traitCountWeights`), không lấy cặp loại trừ. Loại trait theo trọng số riêng (`gachaTraitKindWeights`): trọng số `traitKindWeights` × (1 + `traitKindFloorGrowth` × (`highestFloor` − 1)) / (1 + `traitKindFloorFalloff` × (`highestFloor` − 1)). Tầng càng cao càng dễ ra rare, càng ít negative.
  - Lệch roadmap: số gốc của roadmap (positive 60, negative 40, rare 2) làm trứng trả tiền ở tầng đầu **kém hơn** quái hoang (negative 39%, rare 2% so với 11%, 10%). Đổi điểm xuất phát bằng số của quái hoang; rare tăng 0,02 mỗi tầng thay 0,1 vì điểm xuất phát đã cao gấp 5.
- **Shiny:** `shiny.wildChance` × Bùa shiny × thưởng ngự thú sư × nghiên cứu loài (như trứng breeding; `dex.md` mục "Bùa"). Lệch roadmap: roadmap chỉ ghi tỉ lệ gốc.
- **Lý lịch:** nguồn gốc `gacha`, `metFloor` null (`monster-history.md`). Nở qua `hatchMonster` nên có mốc `hatched` và dưỡng dục (`imprinting.md`); đặt linh thạch / linh địa áp dụng như mọi trứng.

## Dữ liệu, save

- Kiểm tra dữ liệu (`checkGachaData`): `costBase` ≥ 0; `pullOptions` không rỗng, `count` nguyên ≥ 1 không trùng, `costMultiplier` ≥ 0; `rankWeights` là danh sách số ≥ 0 không rỗng; `traitKindWeights` như của quái hoang (`checkTraitKindWeights`); hệ số theo tầng khóa là loại trait, số ≥ 0; `gachaWeight` của loài là số ≥ 0, > 0 chỉ ở dạng đầu.
- Save v96: bộ đếm `stats.gachaPulls` (migrate 0), nguồn gốc lý lịch `gacha`.

## Mô phỏng

- Chơi liên tục, mỗi ngày ở thị trấn sau trao đổi (`runGacha`, `scripts/simulate/gacha.ts`): quay ×10 khi tiền ≥ 3 lần giá và kho còn đủ chỗ cho trứng đang ấp lẫn trứng mới (không để gacha chặn bắt quái). Ô `economy` của `progression.csv`: `gacha` (số trứng). Quái nở nằm ở kho, đội mẫu không dùng nên không đo sức mạnh, chỉ đo nhịp chi tiêu. Kịch bản nhanh (tầng 1–3) chưa đủ tiền để quay: đo bằng kịch bản mặc định (`--parts progression`); kết quả ở `balance-systems.md`.

## Chưa có

- UI Cây thần (chờ UI, `ui-overhaul.md`).
- Chế độ thử thách: gacha không bị giới hạn Nuzlocke (ghi ở `challenge-modes.md`).
