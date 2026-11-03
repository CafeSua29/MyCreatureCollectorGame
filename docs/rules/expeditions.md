# Phái quái đi thám hiểm

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Quái **trong kho** được phái đi đào khoáng, hái thuốc, săn bắt, thám hiểm; sau vài ngày mang đồ về. Số ở `balance.json` khóa `expeditions` và `src/data/expeditions.json`; số hiện tại ở `balance-systems.md`.

Code: kiểu `model/expeditions.ts`, yêu cầu đội `EXPEDITION_REQUIREMENTS` (`registries/expeditionRequirements.ts`), logic `progression/expeditions.ts` (`expeditionSlots`, `unmetRequirement`, `startExpedition`, `recallExpedition`, `expeditionSuccess`, `rollExpeditionBoard`, việc theo ngày `expeditionDailyTask`), khóa quái `assertNotBusy` (`monster/assignment.ts`), kiểm tra dữ liệu `gameData/validateExpeditions.ts`, kiểm tra save `game/validateExpeditionState.ts`. Nhập dữ liệu: `scripts/data-import/expeditions-import.mjs`.

## Dữ liệu

- `expeditions.json` (tên ở i18n): `{ id, kind, durationDays, requirements, powerPerFloor, moneyPerFloor, drops }`; `kind`: `mining` / `herbs` / `hunting` / `exploring`; `requirements` là danh sách `{ type, ...params }` theo `EXPEDITION_REQUIREMENTS`: `minLevel { level }` (mọi quái), `element { elementId }` / `race { raceId }` (ít nhất một quái), `teamSize { min, max }`; `drops`: `{ itemId, chance (%), min, max }`; `eggChance` (% mang về trứng hiếm, × độ thành công, tối đa 100; 0 = không).
- Hiện có 6 mẫu: Mỏ đồng hoang, Hang pha lê (khoáng: linh thạch, tinh phách khoáng thể, Kẹo EXP S), Thung lũng dược thảo, Tuyết sơn (dược liệu, hạt giống, Thiên Linh Quả), Săn thú (tinh phách thú / điểu, Hổ Cốt Quả), Di tích cổ (tinh phách yêu linh / xác sống, Kẹo EXP M, Ngộ Đạo Trà, Bí Cảnh Lệnh 15%, `trials.md`). Trứng hiếm: Săn thú 4%, Di tích cổ 6% (đào khoáng / hái thuốc 0).

## Luật

- **Việc của quái** `Monster.assignment`: `null` | `{ kind: 'expedition' | 'dwelling', id }` (một quái một việc; `dwelling` = làm việc ở công trình động phủ, `dwelling.md`). Quái có việc **bị khóa** (`monsterBusy { monsterId }`): không vào đội (`moveToParty`, `swapWithStorage`), không thả, không fuse / breed (cả quái gốc lẫn quái phụ), không dùng Kẹo EXP / Kẹo Hiếm (vật phẩm dùng nhiều cái một lần). Quái trong đội không được có việc (kiểm tra save).
- **Bảng thám hiểm** `GameState.expeditions.board`: [boardMin, boardMax] mẫu khác nhau chọn đều, làm mới vào ngày `refreshDay` rồi `refreshDays` ngày sau (game mới tung ngay).
- **Phái đi** `startExpedition { expeditionId, monsterIds }` (thị trấn): mẫu trên bảng (`expeditionNotOffered`), còn ô (`expeditionSlotsFull { slots }`; ô = 1 + ⌊cảnh giới ngự thú sư / 2⌋, `tamer.md`), mọi quái trong kho (`monsterNotInStorage`), rảnh, không gục, không trọng thương (`injured`), đủ mọi yêu cầu (`expeditionRequirementUnmet { expeditionId, requirement }`); `monsterIds` rỗng / lặp là `malformedAction`. Đội `{ id: "x<số>", expeditionId, monsterIds, endDay = hôm nay + durationDays }`, quái nhận việc.
- **Gọi về** `recallExpedition { expeditionActiveId }` (ngoài trận): gỡ việc, không thưởng; id lạ `expeditionNotFound`.
- **Việc theo ngày** `expeditions` (`DAILY_TASKS`): quái đang đi + `affinityPerDay` thân mật (`changeAffinity`); vẫn già đi như quái trong kho. Đội tới `endDay` thì về:
  - **Độ thành công** = tổng mọi chỉ số cuối của đội ÷ (`powerPerFloor` × tầng cao nhất) × kỹ năng đồng hành `expeditionPowerPercent` (quái đầu đội; `partner-skills.md`), kẹp [`minSuccess`, `maxSuccess`] (0,5–1,5).
  - Tiền `moneyPerFloor × tầng cao nhất × độ thành công`; mỗi món trong `drops` tung tỉ lệ, số lượng random đều trong [min, max] × độ thành công (làm tròn xuống, tối thiểu 1 khi trúng).
  - Mỗi quái + EXP `expPerDayPerFloor × durationDays × tầng cao nhất` (`gainExp`); mỗi quái `injuryChance`% bị trọng thương (`awakening.injuryBattles` trận, `awakening.md`), **không chết**. Gỡ việc.
  - **Trứng hiếm** (`createExpeditionEgg`, `progression/eggs.ts`): tung min(100, `eggChance` × độ thành công) % (0 không tốn RNG); trứng chứa loài đều trong mọi boss của map tầng cao nhất (dạng đầu tiên chưa tiến hóa), level 1, gen như quái hoang tầng đó, shiny theo tỉ lệ chung, **không** có trait "Huyết thống boss", thân mật trứng, chưa khế ước, lý lịch nguồn gốc `expeditionEgg { expeditionId }`; vào `eggs`, id từ `nextMonsterId`. Map không có boss thì không có trứng.
  - Log ngoài trận: `expeditionReturned { activeId, expeditionId, successPercent, injuredIds, eggId }` (`eggId` null = không có trứng).
  - Quái tọa hóa khi đang đi rời kho như thường; đội về chỉ tính quái còn lại (không còn ai thì không thưởng).
- **Kiểm tra save** (`validateExpeditionState`): bảng là mẫu tồn tại không lặp, `refreshDay` / `nextId` nguyên, đội có id `x<số>` không trùng và nhỏ hơn `nextId`, mẫu tồn tại, `monsterIds` không rỗng không lặp, quái của đội còn trong kho phải mang đúng việc; quái có việc thám hiểm phải thuộc một đội (việc động phủ kiểm ở `validateDwellingState`).

## Mô phỏng

- Chơi liên tục: mỗi lần ở thị trấn "người chơi" phái quái rảnh trong kho (trứng nở vào kho) đi các thám hiểm trên bảng khi còn ô (đội gồm quái level cao nhất, đủ số tối đa của `teamSize`). Cột `expeditions` ở `progression.csv` (`scripts/simulate/expeditions.ts`, `simulation-features.md`).
