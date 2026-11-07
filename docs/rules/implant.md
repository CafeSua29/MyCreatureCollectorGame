# Phòng Thí Nghiệm: cấy ghép (`implant`)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

NPC **Phòng Thí Nghiệm** ở thị trấn bán **huyết thanh** (`serum`). Cấy huyết thanh vào quái để **cộng thẳng** vào chỉ số gốc hoặc nhận **hiệu ứng** (hook trait), có rủi ro thất bại. Tên "inject" đã dùng cho tinh thể trait nên tính năng này dùng tên `implant`. Khác thiên tài địa bảo (`treasures.md`: tăng gen, di truyền, không rủi ro). Làm ở bước 6c (save v76); huyết thanh hiệu ứng làm ngay sau đó (cùng v76, chưa phát hành).

Code: `progression/implant.ts` (`implant`, `implantCost`, `rollSerum`, `rollLabStock`, `restockLab`, `labDailyTask`, `newLabState`), registry loại hiệu ứng `registries/serumEffects.ts` (`SERUM_EFFECTS`, `rollSerumEffects`, `applySerumEffect`, `validateSerumEffects`), nguồn hook `implant` ở `registries/traitHooks.ts` (`ownHooks`), hiệu ứng `src/data/serumEffects.json` (tên ở i18n `serumEffects`), tỉ lệ `monster/implant.ts` (`implantChance`), bước gốc `monster/stats.ts`, type `model/implant.ts`, kiểm tra dữ liệu `gameData/validateImplant.ts`, kiểm tra save `game/validateLabState.ts`.

## Tính chỉ số

- Tổng cấy ghép của từng chỉ số (`Monster.implantBonusStats`, `Decimal`) cộng **cùng chỗ với gen**, **không nhân `geneWeight`**, trước mọi bước nhân (race, boss, thức tỉnh, level): `max(1, gốc loài pha huyết mạch + gen × geneWeight + implantBonusStats) × độ lệch race × bossMultiplier × thức tỉnh → ...` (mục "Thứ tự tính chỉ số", `stats-traits.md`). Tổng **có thể âm** (thất bại), nên tổng trước khi nhân có sàn 1.

## Huyết thanh và danh sách hàng

- **Registry loại hiệu ứng** (`SERUM_EFFECTS`, theo `SERUM_EFFECT_KINDS` ở `model/implant.ts`): mỗi loại tự random hiệu ứng theo bậc (`roll`), áp lên quái (`apply`; thành công dấu +, thất bại dấu −), kiểm tra trường riêng của bậc (`validateTier`) và hiệu ứng trong save (`validateEffects`). Thêm loại mới = thêm vào `SERUM_EFFECT_KINDS` + một handler (TypeScript báo thiếu). Hiện có `flatStat` (cộng thẳng chỉ số gốc, `implantBonusStats`) và `hookEffect` (cấp hiệu ứng trong `implantEffects`).
- Bậc huyết thanh ở `balance.json` khóa `implant.tiers`, union theo `kind` (số tạm; khoảng giá trị là ở tầng 1; bậc cộng chỉ số mạnh dần common < uncommon < rare < epic):

  | Bậc            | Loại         | Hiệu ứng           | Trọng số | Giá gốc |
  | -------------- | ------------ | ------------------ | -------- | ------- |
  | common         | `flatStat`   | 1 chỉ số +5–10     | 60       | 300     |
  | uncommon       | `flatStat`   | 1 chỉ số +10–20    | 25       | 800     |
  | rare           | `flatStat`   | 2 chỉ số +20–30    | 12       | 2.000   |
  | epic           | `flatStat`   | 3 chỉ số +30–45    | 3        | 6.000   |
  | mutagen        | `hookEffect` | 1 cấp một hiệu ứng | 8        | 1.000   |
  | greaterMutagen | `hookEffect` | 2 cấp một hiệu ứng | 2        | 3.000   |

- `flatStat`: `statCount` chỉ số **không trùng** (xáo `STAT_NAMES`), mỗi chỉ số nguyên trong khoảng của bậc **nhân `floorGeneMultiplier(highestFloor)`** (`geneGrowthPerFloor^(highestFloor − 1)`, dùng chung hệ số với gen quái hoang), làm tròn xuống, tối thiểu 1. Lý do scale: race, boss, level nhân đều cả gen lẫn cấy ghép, nên thứ quyết định giá trị của cấy ghép là tỉ trọng so với gen, mà gen thì tăng theo tầng.
- `hookEffect`: một hiệu ứng của `serumEffects.json` theo `weight`, `levels` cấp của bậc. Hiệu ứng là % nên **không scale theo tầng** (giá vẫn × tầng). Hiệu ứng hiện có (mỗi cấp; cấp âm là hiệu ứng ngược cùng độ lớn; Claude chọn 2026-10-31 theo hook có sẵn, Tái Sinh theo ví dụ của roadmap):

  | Id             | Tên        | Mỗi cấp (hook)                                   | Trọng số |
  | -------------- | ---------- | ------------------------------------------------ | -------- |
  | `regeneration` | Tái Sinh   | hồi 1% max HP cuối lượt (`regen`; ngược: mất 1%) | 3        |
  | `hardening`    | Cương Hóa  | sát thương nhận −5% (`damageTakenModifier`)      | 3        |
  | `ferocity`     | Cuồng Tính | sát thương gây +5% (`damageDealtModifier`)       | 3        |
  | `precision`    | Tinh Chuẩn | tỉ lệ chí mạng +3% (`critChanceModifier`)        | 2        |
  | `recovery`     | Hồi Phục   | hồi máu nhận +15% (`healingModifier.received`)   | 2        |

- Huyết thanh trong state: `Serum { tierId, effects }`, mỗi hiệu ứng `{ kind: 'flatStat', stat, amount }` hoặc `{ kind: 'hookEffect', effectId, levels }`.
- Danh sách hàng `GameState.lab = { stock, restockDay }`: **`stockMin`–`stockMax` (5–10) huyết thanh**, random bằng RNG của core lúc đổi hàng và hiển thị sẵn (chỉ số, lượng). Mỗi huyết thanh **dùng không giới hạn số lần** tới lần đổi hàng sau; một quái cấy cùng một huyết thanh nhiều lần được. Load lại không đổi được hàng.
- **Đổi hàng** (`restockLab`) khi `day` ≥ `restockDay`, rồi `restockDay` = ngày đó + **`restockDays` (10)**: việc theo ngày `lab` (`DAILY_TASKS`, `lifespan.md` mục "Đồng hồ game"). Game mới đổi hàng ngay lúc tạo (tung sau cùng, không đổi quái khởi đầu / hàng / bảng). `createGameState` (test) và save cũ: chưa có hàng, `restockDay` 0, đổi ở lần qua ngày đầu tiên.

## Cấy

- Action `implant { monsterId, serumIndex }` ở **thị trấn**, ngoài trận; quái ở đội hoặc kho, **không đang làm việc** (`assertNotBusy`). Lỗi: `inBattle`, `notInTown`, `malformedAction` (`serumIndex` không nguyên), `serumNotFound { serumIndex }`, `monsterNotOwned`, `monsterBusy`, `notEnoughMoney`, `partyWouldBeEmpty`.
- **Giá** (`implantCost`) = giá gốc của bậc × `highestFloor` (`Decimal`), không tăng theo số lần đã cấy. Thất bại vẫn mất tiền.
- **Tỉ lệ thành công** (`implantChance`, điểm duy nhất) = `baseChance × chanceFalloff^(implantAttempts)` % = `90 × 0,9^n`, mọi bậc như nhau, mỗi lần cấy tính 1 lần bất kể bậc: lần 1 90%, lần 5 khoảng 59%, lần 10 khoảng 35%. Vật phẩm / trait đổi tỉ lệ sau này thêm vào hàm này (chưa có).
- **Thành công:** áp mọi hiệu ứng của huyết thanh với dấu + (cộng chỉ số vào `implantBonusStats`, cộng cấp vào `implantEffects`), `implantAttempts` + 1; mốc lý lịch `implanted { tierId }`.
- **Thất bại:** áp với dấu −: **trừ** đúng mọi lượng định cộng, **trừ cấp** hiệu ứng (cấp âm = hiệu ứng ngược), `implantAttempts` + 1, `implantFails` + 1 (**không bao giờ reset**); mốc `implantFailed { tierId, fails }`. Còn sống thì tung `marks.scarOnImplantFailPercent` (25%) một sẹo ở thân (`marks.md`).
- **Thất bại lần thứ `maxFails` (3): mất quái** (chết hẳn): `dieForever` với `cause: 'implant'` (đồ về túi, hồn phách vào túi, lý lịch của hồn phách có `implantFailed` rồi `died`; `soul-relics.md`), quái rời đội / kho. Đội phải còn quái nếu mất con này, nên khi lần cấy có thể là lần thất bại cuối mà quái là con duy nhất của đội thì `partyWouldBeEmpty` (kiểm tra trước khi cấy). Quái đang khóa không cấy được ở lần có thể mất quái (`monsterLocked`, `roster.md`).
- **Bản mệnh thú** cấy được (không chặn như thả / quái phụ). Chết vì cấy ghép thì ngự thú sư bị **đạo thương** như tọa hóa / độ kiếp (`woundIfBondDied`; `tamer.md` mục "Bản mệnh thú"); UI đọc `tamer.woundUntilDay`.
- Kết quả cho UI: log ngoài trận `implanted { monsterId, tierId, success, fails, died }` (`died` = thất bại lần cuối, quái chết hẳn; một loại thay cho `implantFailed` / `implantLostMonster` của roadmap); bản mệnh chết thêm `bondBroken { monsterId, woundUntilDay }` (`game-log.md`). Quái vẫn có mốc lý lịch `implanted` / `implantFailed`, hồn phách `died { cause: 'implant' }`.
- **Load lại để thử lại:** chấp nhận, như luật fuse.
- Túi đầy (`capacity.md`): lần cấy có thể mất quái mà món đang lắp không đủ chỗ về túi thì `bagOverflow`, cần `discardOverflow: true`; hồn phách luôn vào túi.

## Hiệu ứng trên quái

- `Monster.implantEffects`: id hiệu ứng → cấp nguyên **khác 0** (về 0 thì bỏ khỏi object). Cấp dương: `hooks` × cấp; cấp âm: `failHooks` × |cấp|. Không trần cấp: giới hạn thực tế là tỉ lệ cấy giảm theo số lần, chung bộ đếm với huyết thanh cộng chỉ số.
- Hook đi qua `forEachTraitHook` với nguồn hook **`implant`** (`HOOK_SOURCE_KINDS`; log `traitTriggered` có `source: 'implant'`, id = id hiệu ứng); hook % chỉ số tính vào nguồn % `implant` (`STAT_PERCENT_SOURCES`).
- Kiểm tra dữ liệu (`serumEffects.json`): trọng số > 0, `hooks` và `failHooks` khác rỗng, tham số đúng (`checkEffects` với `TRAIT_HOOKS`), có tên ở mọi ngôn ngữ; bậc `hookEffect` cần ít nhất một hiệu ứng.

## Lưu trên quái, tương tác

- `implantBonusStats` (`Decimal`, mỗi chỉ số được âm; `validateMonster` chỉ kiểm tra hữu hạn, không NaN), `implantEffects` (id tồn tại, cấp nguyên khác 0), `implantAttempts`, `implantFails` (nguyên ≥ 0, `implantFails` ≤ `implantAttempts` và < `maxFails`).
- **Fuse:** quái gốc giữ nguyên các trường cấy ghép. Phần cộng chỉ số của quái phụ đã nằm trong chỉ số `withFusingBonus` của nó, nên ½ phần đó tự truyền qua `fusingBonusStats`; hiệu ứng, số lần cấy / thất bại của quái phụ mất theo nó (`fusing.md`).
- **Breeding:** không truyền, con không có cấy ghép nào (bố mẹ không mất đi nên truyền là nhân bản miễn phí, như hiến tế; `breeding-eggs.md`).
- **Tiến hóa:** giữ nguyên. Quái hoang, boss, trứng, gacha: luôn 0.
- `MonsterView.implant = { bonusStats, effects, attempts, nextChance, fails, maxFails }`.

## Save, dữ liệu

- Save v76 (`state-versions.md`): mọi quái (kể cả trứng) chưa cấy (`implantBonusStats` 0, `implantEffects` `{}`, số lần 0), `lab = { stock: [], restockDay: 0 }`. `amount` của hiệu ứng `flatStat` là `Decimal` (`game/bigFields.ts`).
- Kiểm tra save (`validateLabState`): bậc tồn tại, hiệu ứng theo `validateEffects` của loại của bậc (`flatStat`: đúng `statCount` chỉ số không trùng, tên hợp lệ, lượng nguyên ≥ 1; `hookEffect`: đúng 1 hiệu ứng tồn tại, `levels` bằng của bậc); `restockDay` nguyên ≥ 0.
- Kiểm tra dữ liệu (`config.implant`): ít nhất một bậc, id không trùng, `kind` hợp lệ, không trường lạ (trường chung + `tierFields` của loại), trọng số > 0 (mọi bậc có cơ hội), giá ≥ 0, trường riêng theo loại (`flatStat`: `1 ≤ statCount ≤ 6`, `1 ≤ min ≤ max` nguyên; `hookEffect`: `levels` nguyên ≥ 1); `1 ≤ stockMin ≤ stockMax`, `restockDays` ≥ 1, `baseChance` 0–100, `chanceFalloff` 0–1, `maxFails` ≥ 1.
- Lệch roadmap: bậc huyết thanh ở `balance.json` thay cho file `serums.json` (chỉ là số cân bằng, cùng chỗ với các bảng bậc khác như `skillBook.rarities`); hiệu ứng (nội dung có tên, hook) ở file riêng `serumEffects.json`. Hiệu ứng lưu theo cấp có dấu (thất bại trừ cấp) thay cho danh sách hiệu ứng / hiệu ứng ngược riêng: thành công rồi thất bại cùng hiệu ứng thì bù trừ, như cộng / trừ chỉ số.
- Mô phỏng: mục "Cấy ghép" ở `simulation-features.md`; số ở `balance-systems.md` mục "Cấy ghép".
