# Ngày đêm và mùa

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Bước 5t (2026-10-28). Code: `registries/calendar.ts` (điểm duy nhất: thời khắc, mùa, tuần trăng, giờ hoạt động của loài, hệ số theo lịch), `progression/time.ts` (`calendarAt` cho UI / mô phỏng), `world/encounter.ts` (trọng số gặp), `battle/environment.ts` (thời tiết theo mùa), `events/encounters.ts` (`isEventEligible`), `registries/evolutionConditions.ts` (điều kiện tiến hóa `moment`), `gameData/validateCalendar.ts`. Số tạm ở `balance.json`, khóa `calendar`.

## Luật

- Mọi thứ **suy từ `GameState.time`** (giờ game, `lifespan.md`), không lưu thêm gì; `GameState` không đổi (không tăng version).
- **Thời khắc** (`DAY_PHASES`: `dawn`, `day`, `dusk`, `night`): mỗi thời khắc bắt đầu ở `calendar.phaseStartHours` (0–23, khác nhau) và kéo tới giờ bắt đầu của thời khắc kế tiếp, qua nửa đêm thì vòng lại (`dayPhaseOf`). Số hiện tại: bình minh 6:00, ngày 7:00–16:59, hoàng hôn 17:00, đêm 18:00–5:59, để **"ban ngày" của Pokémon (Gen 7: 6:00–17:59) = bình minh + ngày + hoàng hôn**, "ban đêm" (18:00–5:59) = đêm, "evening" của Lycanroc Dusk (17:00–17:59) = hoàng hôn. Game mới bắt đầu 6:00 (bình minh).
- **Mùa** (`SEASONS`: `spring`, `summer`, `autumn`, `winter`) = ⌊(ngày mod `lifespan.daysPerYear`) × 4 / `daysPerYear`⌋ (`seasonOf`, tính bằng số nguyên để không lệch vì số thực). 10 ngày một năm: xuân ngày 0–2, hạ 3–4, thu 5–7, đông 8–9.
- **Tuần trăng** (`MOON_PHASES`, 8 pha từ trăng non `new` tới `waningCrescent`): mỗi ngày một pha, 8 ngày một vòng, ngày 0 trăng non, trăng tròn (`full`) ngày 4, 12, 20... (`moonPhaseOf`). Thêm so với roadmap để có Ursaluna (Peat Block đêm trăng tròn, Legends: Arceus).
- `calendarAt(data, time)` trả `{ day, hour, dayPhase, season, moonPhase }` cho UI và mô phỏng (bên ngoài core không gọi được `registries`).

## Quái xuất hiện theo thời khắc

- Trọng số gặp của từng loài × `calendar.activeTimeMultipliers[giờ hoạt động][thời khắc]` (`activeTimeMultiplier`), áp cho mọi lần sinh quái theo tầng (`floorRollSpec`: quái hoang, boss ngẫu nhiên, boss tầng, bí cảnh, hiểm địa, trận event). Không áp: đội ngự thú sư NPC (không phải quái hoang), khu bảo tồn (cả lượt vào tính là một ngày, loài chọn đều trong danh sách theo đợt; `safari-zone.md`). Số hiện tại: ban ngày (`diurnal`) ×2 ban ngày, ×0,5 ban đêm; ban đêm (`nocturnal`) ngược lại; chạng vạng (`crepuscular`) ×2 lúc bình minh / hoàng hôn, còn lại ×1; mọi giờ (`cathemeral`) ×1. Hệ số > 0 (0 là bỏ loài, không phải hệ số).
- **Giờ hoạt động của loài** (`speciesActiveTime`): trường tùy chọn `activeTime` trong `species.json` (`diurnal` / `nocturnal` / `crepuscular` / `cathemeral`; `cathemeral` = gặp như nhau mọi giờ, ghi rõ khi nguồn nói vậy để không suy theo race / hệ); bỏ trống thì theo `calendar.activeTimeByRace` (id race trước, rồi id nhóm race), rồi theo `calendar.activeTimeByElement` (các hệ có ghi phải cùng một giờ, lệch nhau như cỏ + ma thì không có); không suy được thì ×1 mọi giờ. Hiện có: race undead, demon, ghost, wisp, chiropteran (dơi), owl → đêm; nhóm avian → ngày; cervid, lagomorph (hươu, thỏ: chạng vạng như động vật thật); hệ ma, bóng tối → đêm; cỏ, bọ → ngày.
- **Nguồn `activeTime` của từng loài** (2026-10-28, ưu tiên game gốc; nhập lại bằng script, số loài lấy từ báo cáo):
  - Pokémon: `pokemon-active-time-import.mjs` (PokeAPI `encounters` + `encounter_condition_value_map` + `encounter_slots`, báo cáo `pokemon-active-time-report.json`). Chỉ xét cách gặp có đổi theo giờ của bản có gặp theo giờ (Gold / Silver / Crystal, DPPt, HGSS: sáng / ngày / đêm); húc cây, câu cá, lướt sóng không tính. Mỗi ô gặp cộng độ hiếm vào các giờ nó xuất hiện (ô không ghi giờ là cả ba); ngày = max(sáng, ngày); đêm ≥ 2 × ngày → `nocturnal`, ngày ≥ 2 × đêm → `diurnal`, còn lại `cathemeral` (đa số Pokémon gặp mọi giờ, như bản gốc). Kết quả: 308 loài trực tiếp (Hoothoot, Spinarak, Gastly, Murkrow, Oddish... đêm; Ledyba, Pidgey, Hoppip, Caterpie... ngày), 158 loài theo dòng tiến hóa (dạng trước gần nhất có dữ liệu, không có thì dạng sau; dạng khác không phải vùng miền theo loài gốc). Bỏ trống (suy theo race / hệ): Pokémon Gen 5+ và loài không gặp ngoài tự nhiên ở các bản đó, dạng vùng miền (PokeAPI không có bảng gặp theo giờ của Alola / Galar / Hisui / Paldea).
  - Động vật thật / tuyệt chủng: `animal-active-time-import.mjs` (báo cáo `animal-active-time-report.json`): EltonTraits 1.0 (thú: cờ đêm / chạng vạng / ngày, đêm + ngày → `cathemeral`, đêm (± chạng vạng) → `nocturnal`, ngày (± chạng vạng) → `diurnal`, chỉ chạng vạng → `crepuscular`; chim: cờ Nocturnal) theo tên tiếng Anh / tên khoa học (Wikidata P225), chi / họ lấy giờ chiếm ≥ 2/3 số loài, tên chung của chim ("Sparrow") theo các loài có tên kết thúc bằng từ đó; rồi Wikidata "diel cycle" P9566; con non theo con trưởng thành. Kết quả: 705 / 1.789 loài.
  - Nguồn game khác (Digimon, Yo-kai, Temtem, Monster Hunter...) và thần thoại không có dữ liệu giờ gặp theo loài: suy theo race / hệ.
- **Tháp thí luyện ngoài lịch** (`FloorSite.time` null): cùng tầng tháp luôn cùng đội (`trials.md`), nên không nhân hệ số thời khắc và chỉ gặp event không giới hạn lịch.

## Thời tiết tự nhiên theo mùa

- Vào trận: trọng số thời tiết của map × `calendar.seasonWeatherMultipliers[mùa][id thời tiết]` (thiếu = 1; `rollNaturalField`). Chỉ nhân thời tiết map đã có (map không có tuyết thì mùa đông cũng không có tuyết); địa hình không theo mùa. Số hiện tại: xuân mưa ×2; hạ nắng ×2, giông ×2; thu sương mù ×2; đông tuyết ×3, bão tuyết ×3.

## Tiến hóa theo giờ / mùa / trăng

- Điều kiện phạm vi `moment` trong `EVOLUTION_CONDITIONS` (`evolution-skills.md`), xét theo giờ game lúc tiến hóa (`EvolutionScene.time`, như Pokémon): `timeOfDay { phases }`, `hourRange { fromHour, toHour }` (cả hai đầu, `fromHour > toHour` là qua nửa đêm), `season { seasons }`, `moonPhase { phases }`. Danh sách không rỗng, không trùng, đúng giá trị.
- Chọn hướng tiến hóa đang chờ (`chooseEvolution`) coi điều kiện `place` và `moment` là đã đủ (`assumeScene`, trước đây `assumePlace`): đã đủ lúc trận thắng đặt hướng chờ.
- Nội dung (script `evolution-conditions-import.mjs` chạy lại 2026-10-28): 19 hướng Pokémon theo giờ (Espeon / Umbreon, Lycanroc / Midnight, Weavile, Sneasler, Gliscor, Tyrantrum / Aurorus, Raticate / Marowak Alola, Obstagoon, Roselia, Chimecho, Chansey, Lucario, Gumshoos, Lurantis, Frosmoth, Houndstone) cộng điều kiện giờ vào điều kiện cũ, không đổi level; Ursaluna: Peat Block + đêm + trăng tròn. Mogwai → gremlin: `hourRange 0–5` (sau nửa đêm, trước bình minh). Lycanroc Dusk vẫn là dị biến (quyết định cũ).

## Event

- `EventDef` có thêm `dayPhases`, `seasons`, `moonPhases` (tùy chọn, bỏ trống = mọi lúc): event chỉ xuất hiện khi giờ game lúc tung event đúng lịch (`isEventEligible`, cả bước chuỗi đến hạn). Event thị trấn xét lúc vừa tới thị trấn. Hiện có: Trăng máu (`bloodMoon`) chỉ ban đêm.

## Kiểm tra dữ liệu

- `checkCalendarData`: `phaseStartHours` đủ thời khắc, giờ nguyên 0–23, không trùng; `activeTimeMultipliers` đủ giờ hoạt động × thời khắc, số > 0; `activeTimeByRace` id là race / nhóm race, `activeTimeByElement` id là hệ, giá trị thuộc `ACTIVE_TIMES`; `seasonWeatherMultipliers` đủ 4 mùa (object, rỗng được), id là thời tiết, hệ số > 0; `activeTime` của loài thuộc `ACTIVE_TIMES`. Trường lịch của event kiểm tra ở `validateEvents.ts`.

## Mô phỏng

- Quét tầng trải trận theo giờ: trận thứ i ở giờ `startHour + 13 × i` (13 nguyên tố cùng nhau với 24: đủ mọi giờ và mọi ngày trong năm); `floor-fields.csv` có thêm lớp `dayPhase` và `season` (`simulation.md`). Mục tiêu: tỉ lệ thắng giữa các thời khắc / mùa chênh ≤ 5 điểm; kết quả 2026-10-28 đêm 68,1% / ngày 70,9% (`simulation-features.md`).

## Chưa có

- `activeTime` của Pokémon Gen 5+ / dạng vùng miền và 1.084 động vật tên chung (Deer, Sheep, Jackal...: không có tên khoa học cấp loài hoặc chi / họ không thống nhất): chờ nguồn (`docs/roadmap/biome-content.md`); hiện suy theo race / hệ.
- UI hiện thời khắc, mùa, tuần trăng (dùng `calendarAt`): chờ UI (`docs/roadmap/ui-overhaul.md`).
