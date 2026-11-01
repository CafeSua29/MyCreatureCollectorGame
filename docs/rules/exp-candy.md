# Kẹo EXP và Kẹo Hiếm

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Vật phẩm cho EXP ngoài trận, **làm giống Kẹo EXP (Exp. Candy) và Kẹo Hiếm (Rare Candy) của Pokémon** (chủ project chốt). Bước 5c4 (2026-10-23). Số là **số tạm** (`items.json`, `balance.json` khóa `expCandy`; ghi ở `balance-content.md`).

Code: `registries/itemEffects.ts` (hiệu ứng `addExp`, `levelUp`, `allowsCount`, `itemAllowsCount`, tiến hóa sau khi lên level trong `applyItemToMonster`), `monster/exp.ts` (`expCandyScale`), `world/field.ts` (`applyItem`: action `useItem`), `battle/outcome.ts` (`expCandyBossDrops`), `gameData/validateExpCandy.ts`.

## Vật phẩm

`consumable`, `use: "field"`, `target: "ally"`:

| Vật phẩm   | id           | Hiệu ứng                    | EXP gốc             |
| ---------- | ------------ | --------------------------- | ------------------- |
| Kẹo EXP XS | `expCandyXS` | `addExp { baseExp: 100 }`   | 100                 |
| Kẹo EXP S  | `expCandyS`  | `addExp { baseExp: 800 }`   | 800                 |
| Kẹo EXP M  | `expCandyM`  | `addExp { baseExp: 3000 }`  | 3.000               |
| Kẹo EXP L  | `expCandyL`  | `addExp { baseExp: 10000 }` | 10.000              |
| Kẹo EXP XL | `expCandyXL` | `addExp { baseExp: 30000 }` | 30.000              |
| Kẹo Hiếm   | `rareCandy`  | `levelUp { levels: 1 }`     | đủ lên đúng 1 level |

- **`addExp { baseExp }`** (`baseExp` > 0): EXP nhận = ⌊`baseExp` × `expCandyScale(highestFloor)` × số cái⌋. Khác Pokémon một chỗ (bắt buộc vì level không trần): hệ số theo **tầng cao nhất từng đạt**, lấy lúc dùng, `Decimal`.
- **`expCandyScale(F)`** = EXP quái hoang (`expFactor × level²`, phần gốc của `expReward`, chưa nhân shiny / boss) ở **level giữa tầng F** / ở level giữa tầng 1. Level giữa = `levelPerFloor × (F − 0,5)` (trung điểm `floorLevelRange`, tính bằng `Decimal`). Với `levelPerFloor` 10: hệ số = (2F − 1)² (tầng 1 ×1, tầng 10 ×361, tầng 100 ×39.601), nên mỗi loại kẹo luôn bằng khoảng cùng số trận quái hoang ở tầng cao nhất (XS ≈ 8 trận). `expFactor` = 0 thì hệ số 1.
- **`levelUp { levels }`** (nguyên ≥ 1): như Kẹo Hiếm của Pokémon, **luôn +`levels` level bất kể level**: EXP lên đúng mức tối thiểu của level đích (`expForLevel`). Level đích vượt số nguyên an toàn thì "không có tác dụng" (`itemNoEffect`, không mất kẹo).
- EXP từ kẹo **không nhân** các % EXP (trait EXP, giai đoạn tuổi...; không qua `expWithTraits`), giống Pokémon.
- **Thân mật:** mỗi viên kẹo (`addExp`, `levelUp`) +`affinity.gain.candy` (1) thân mật, dùng n viên một lần thì +n (chủ project chốt 2026-10-24; `affinity.md`).
- Lên level bằng kẹo chạy **đúng luồng lên level** (`gainExp`): học skill mới (đủ ô thì vào chờ học), tăng `maxLevelReached` (thọ nguyên; điểm thiên phú tính theo trường này, `monster-talents.md`).
- **Tiến hóa ngay** sau khi dùng: vật phẩm tiêu hao làm level tăng thì xét `autoEvolve` (một hướng level thì tiến hóa luôn, nhiều hướng thì đặt `pendingEvolutionIds` để chọn như cũ). Không lên level thì không xét. Mỗi lần dùng chỉ lên một bậc tiến hóa (như sau trận thắng).

## Dùng

- Action `useItem { itemId, monsterId, count? }` (ngoài trận): quái **trong đội hoặc kho** (áp cho **mọi** vật phẩm dùng ngoài trận, không chỉ kẹo; quái không phải của ta báo `monsterNotOwned`). Quái đã gục vẫn dùng kẹo được (như Pokémon).
- **Dùng nhiều cái một lần** (`count`, bỏ trống = 1, số nguyên ≥ 1, sai dạng thì `malformedAction`): chỉ vật phẩm tiêu hao mà mọi hiệu ứng có `allowsCount` (`itemAllowsCount`; hiện `addExp`, `levelUp`), khác thì `itemCountNotAllowed`. Thiếu kẹo thì `notEnoughItem { have, need }`. Handler tự nhân theo `count` và áp **một lần** (không lặp từng cái), nên dùng rất nhiều kẹo vẫn nhanh; tiến hóa xét một lần sau cả lượt dùng (kết quả cuối như dùng từng viên).
- Chưa có: **chặn quái đang có `assignment`** (thám hiểm / động phủ; chờ "Thám hiểm", ghi ở `docs/roadmap/expeditions.md`).

## Nguồn

- **Cửa hàng:** chỉ Kẹo XS (trọng số 2) và S (trọng số 1), giá × `highestFloor` như mọi vật phẩm; bán lại theo giá thị trường động.
- **Boss rơi** (`config.expCandy`, trait kiểu Pickup nhân tỉ lệ như mọi đồ rơi):
  - `bossDropTiers`: mỗi bậc `{ fromFloor, drops }`; mọi boss (boss tầng và boss ngẫu nhiên) tung bảng của bậc cuối có `fromFloor` ≤ tầng đang đánh. Kiểm tra dữ liệu: ít nhất một bậc, bậc đầu `fromFloor` 1, tăng dần, không trường lạ, đồ rơi hợp lệ.
  - `floorBossDrops`: tung thêm khi hạ **boss tầng** của map (Kẹo Hiếm).
- Thưởng nhiệm vụ có Kẹo EXP S (`quests.md`); thám hiểm có Kẹo EXP S / M (`expeditions.md`). Kẹo không dùng lên quái đang thám hiểm (`monsterBusy`).
- Ngự thú sư NPC (`trainers.md`): mỗi trận thắng tung `trainers.rewardDrops` (Kẹo EXP S / M), vô địch giải đấu Kẹo EXP L ×3 + Kẹo Hiếm ×1, mốc đấu trường Kẹo EXP M ×3.
- Boss thế giới: Kẹo M–XL theo bậc thưởng (`world-boss.md`; nguồn Kẹo XL ngoài chợ đen).
- Chưa có (mỗi file roadmap đã ghi): Khí giới bí cảnh (`artifact-spirits.md`), nghiên cứu loài (Kẹo Hiếm, `species-research.md`). Đã có: Kẹo Hiếm, Kẹo L / XL ở chợ đen, Kẹo Hiếm trong thưởng thú triều (`events.md`).
- Phi thăng: kẹo là item gộp chồng thường nên bị reset theo luật `ascension.md`.
