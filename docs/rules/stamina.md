# Thể lực cho skill

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Lấy từ **Stamina của Temtem**; thay luật "Không có PP". Code `battle/stamina.ts`. Số ở khóa `stamina` của `balance.json`. Quái hoang, boss, NPC cùng luật.

## Luật

- **Thể lực tối đa** `maxStamina`: thang cố định `stamina.max` (100) × hook trait `staminaMaxPercent`. Không phải chỉ số thứ 7 nên không phình theo scale.
- **Chỉ có trong trận**: lưu phần đã mất `BattleRecord.staminaUsed` (bỏ trống = đầy), hết trận tự đầy, không lưu trên quái.
- **Giá** `staminaCostOf`: trường skill `staminaCost` (nguyên ≥ 0, mục "Giá theo game gốc"), không có thì giá suy ra (`inferredStaminaCost`, mục "Giá suy ra"); × hook trait `staminaCostPercent` (`damaging: true`: chỉ skill gây sát thương, Efficient). Struggle tốn 0.
- **Tốn khi** quái dùng skill bằng lệnh của chính nó. Skill do trait / phản ứng / minion, hợp kích kỹ, skill đang chờ (hold) không tốn. Giá tính theo skill đã chọn (đang Dynamax vẫn theo skill gốc).
- **Cuối lượt** (`staminaAtTurnEnd`): quái còn trên sân hồi `regenPercent` (5)% tối đa + `regenFlat` (1), cộng `staminaPerTurn` của trạng thái đang mang (âm = mất). Kẹp trong [0, tối đa].
- **Lệnh `rest`** (Nghỉ): không làm gì, hồi thêm `restPercent` (15)%, log `rested`, sự kiện trait `rest` (cả lượt kiệt sức). Chung pha với phòng thủ, priority 0.
- **Quá sức** (`overexert`): dùng skill khi thể lực < giá: vẫn ra đòn (trong lúc ra đòn bản ghi trận có cờ `overexerting`, điều kiện trait `overexerting`), thể lực về 0, sau khi skill xong: sự kiện trait `overexert`, quái mất `overexertHpPercent` (2)% max HP **mỗi điểm thiếu** (tối đa 100%, có thể gục), log `overexerted { monsterId, deficit, damage }`, rồi **mất lượt kế tiếp** (`BattleRecord.exhaustedTurn`): lệnh nào của lượt đó cũng thành Nghỉ.
- **Hook `overexertion`** (gộp mọi hook của quái): `hpPercent` (% máu mất cộng thêm, âm = giảm, −100 = không mất), `skipsExhaustion` (không mất lượt), `cannotFaint` (máu mất do quá sức không làm gục, còn ít nhất 1 HP). Tireless của Temtem: `hpPercent −50` + `skipsExhaustion` + trigger `overexert` tăng công.
- **Hiệu ứng trait `exhaust`**: quái mất lượt kế tiếp như quá sức (Rush, Strangle, Petrify của Temtem).

## Giá theo game gốc

Script `scripts/data-import/stamina-cost-import.mjs` (chạy lại được; báo cáo `stamina-cost-report.json`), công thức chung `costFromUses` ở `staminaCost.mjs` (test `temtem/techniques.test.ts`):

- **Số lần dùng → giá** (PP của Pokémon, Charges của spell Siralim Ultimate): `20 × (15 / lần dùng) ^ 0,6`, làm tròn, kẹp [1, 100]. Mốc theo Temtem: chiêu ~90 power trung vị 20 thể lực ≈ Surf / Thunderbolt 15 PP; mũ 0,6 để PP 40 ≈ 11 và PP 5 ≈ 39, khớp khoảng 5–39 của Temtem. Chiêu Z / Max (PP 1) không tính (giá theo skill gốc). PP lấy từ Showdown `moves.js`, Charges từ siralimultimate.wiki.gg (10 spell lệch tên trang dùng giá suy ra, danh sách ở báo cáo).
- **Portals of Phereon**: 1 mana = 5 thể lực (`phereon/skills.mjs`); giới hạn lần dùng mỗi trận giờ chỉ theo hồi chiêu (cd ≥ 8: 1 lần, ≥ 5: 2 lần), bỏ phần theo mana.
- **Cassette Beasts**: AP gốc × 10 (`cb-elements-import.mjs`).
- **Temtem**: giá thật của gốc (thanh thể lực Temtem cùng cỡ thang 100; `content-sources-temtem.md`).
- **Palworld**: hồi chiêu CT (giây) → số lần dùng tương đương = 120 / CT rồi qua `costFromUses` (CT 8 ≈ 20, CT 30 ≈ 44, CT 2 ≈ 9; `PALWORLD_WINDOW` ở `staminaCost.mjs`), khớp tên tiếng Anh với bảng Active Skills / Unique / Boss của palworld.wiki.gg (bản render), 101 chiêu; chiêu trùng tên chiêu Pokémon lấy giá theo PP.
- Game khác không có tài nguyên theo chiêu đã nhập (WILDERLOCKE, TWW3 có hồi chiêu chứ không có giá, chiêu tự dựng...): giá suy ra.

## Giá suy ra

`inferredStaminaCost(config, skill)` khi skill không ghi `staminaCost`:

- Skill gây sát thương: bảng `stamina.costByPower` (power tăng dần: ≤ 40: 10, ≤ 70: 15, ≤ 100: 20, ≤ 130: 25, còn lại 30).
- Skill trạng thái: `statusCost` (15) + điểm theo hiệu ứng (`stamina.statusEffectCost`): `perStage` (1) mỗi bậc chỉ số, `perHealPercent` (0,5) mỗi % hồi, `perStatus` (5) mỗi trạng thái gây ra, `perField` (10) mỗi môi trường đặt / xóa, `perEffect` (3) mỗi hiệu ứng khác; đọc cả `effects` lẫn hiệu ứng trong `spell` (`stage` × số chỉ số, `heal` có `percent`, `status` × `count`); kẹp ở `stamina.max`. Mốc theo giá PP của chiêu Pokémon cùng loại hiệu ứng (tăng / giảm chỉ số ≈ 17, hồi 50% ≈ 39, gây trạng thái ≈ 20, đặt môi trường ≈ 26).

## AI

Ứng viên `rest` điểm = phần thể lực đã mất × `restWeight` (0,6). Skill làm quá sức bị trừ điểm = phần máu hiện tại sẽ mất + `exhaustedPenalty` (0,5). Không chọn skill vượt sức khi còn lựa chọn có điểm cao hơn.

## Liên quan

- **AP của Cassette Beasts** quy đổi: 1 AP = 10 thể lực (thanh AP gốc 10, thang này 100): `energised` / `drained` (AP Boost / Drain) ±10 mỗi lượt, `gemstoneWall` +10 mỗi lượt, Recycle hồi 10 mỗi lượt tường còn lại (`cassette-mechanics.md`).
- **Trait:** hiệu ứng ngôn ngữ trait `stamina` (số điểm / % tối đa / kéo lên mức tối thiểu / % sát thương quy theo max HP `eventHpPercent` / hút từ quái khác), bộ đếm `stamina` (thể lực hiện tại), sự kiện `rest` / `overexert`, điều kiện `overexerting` / `skillHold`, hiệu ứng `exhaust` / `reduceHold` (`trait-dsl.md`). Thể lực tối đa / hiện tại tính ở `staminaMaxOf` / `staminaOf` (`registries/combatTraitQueries.ts`), `battle/stamina.ts` dùng lại. Trait Portals of Phereon: 1 AP / năng lượng = 10 thể lực, 1 mana = 5, 1 thể lực gốc (thanh 200) = 1 (`content-sources-real.md`). Trait Temtem (Efficient, Marathonist, Patient, Kinetic Transfer, Motivator, Tireless, Vigorous, Seppuku, các trait khi Nghỉ...): `content-sources-temtem.md`.
- **Trạng thái:** Exhausted / Invigorated của Temtem (giá +50% / −50%, hook `staminaCostPercent` trên trạng thái).
- **Hold** (`skill-synergy-hold.md`) chạy độc lập.
- **Mô phỏng:** cột `rests`, `overexerted` ở `floors.csv`, biến thể A/B `noStamina` (bỏ `staminaCost` của mọi skill, giá suy ra về 0; `simulation-features.md`).

## Lệch gốc

Temtem tính HP mất theo level; game theo % max HP vì scale vô hạn. Giá theo số lần dùng / bảng power / điểm hiệu ứng là mức xấp xỉ Temtem cho chiêu không có thể lực gốc.

## Chưa có

- Chiến thuật tự động đánh chưa có ngưỡng nghỉ riêng: dùng chung AI ở trên; làm khi có UI chiến thuật (`docs/roadmap/ui-overhaul.md`).
- Trait gốc chặn gục do quá sức: Temtem không có (Resilient của Temtem là "không gục vì đòn đánh", đã nhập); hook `overexertion.cannotFaint` sẵn cho trait / đồ sau này.
