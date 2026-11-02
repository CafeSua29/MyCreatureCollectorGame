# Z-Move

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Z-Move của Pokémon (thế hệ 7), làm giống bản gốc nhất có thể trên nền battle 2v2 (2026-10-27). Số như Pokémon, đặt trong `balance.json` khóa `transform.zMove` (bảng số ở `balance-content.md`). Z-Move **không phải biến hình** (quái không đổi dạng), nên không nằm trong `TRANSFORMS`, nhưng đi cùng nhóm "sức mạnh trong trận" với Mega / Dynamax / Tera.

Code: luật trong trận `battle/zMoves.ts` (`zMoveFor`, `zMovePower`, `zMoveBlocker`, `validateZMoveCommands`, `startZMove`); crystal `inventory/zCrystals.ts` (`heldZCrystals`, `zCrystalFor`, `pickZCrystalFor`, `signatureZCrystalsOf`, `elementZCrystalOf`); Z-Power `registries/zEffects.ts`; kiểm tra dữ liệu `gameData/validateZMoves.ts` và mục `zCrystal` ở `gameData/itemCategories.ts`; nhập dữ liệu `scripts/data-import/zmove-import.mjs`.

## Vòng Z và Z-Crystal

- **Vòng Z** (`zRing`, category `keyItem`, `config.transform.zMove.keyItemId`): nhận khi lần đầu thắng quán chủ đạo quán tầng 40 (`config.trainers.gym.keyItemFloors.zRing`, sau Tera Orb 10, Vòng Mega 20, Dynamax Band 30; `trainers.md`). Không bán / vứt (luật vật phẩm chìa khóa).
- **Z-Crystal** (category `zCrystal`): gộp chồng, **lắp vào ô như đồ cầm**, không tiêu hao (dùng Z-Move không mất crystal), không hook, không dùng trực tiếp; bán / vứt / rơi được. Hai dạng (union trong `ZCrystalItem`):
  - **Crystal hệ** (`elementId`): skill hệ đó thành Z-Move của hệ. Mỗi hệ một crystal (18 hệ Pokémon, tên như Showdown "Normalium Z"...; hệ ánh sáng tự đặt: Luminium Z). Hệ phải có Z-Move theo hệ.
  - **Crystal loài** (`baseSkillId`, `zSkillId`, `speciesIds`): quái loài trong `speciesIds`, **không fuse** (như đá Mega), biết `baseSkillId` thì skill đó thành Z-Move riêng `zSkillId` (Pikanium Z: Pikachu + Volt Tackle → Catastropika...).
- **Nguồn:** chợ đen (`events.md`, sau khi có Vòng Z); cửa hàng (trọng số 1, `requiresKeyItemId: zRing`: chỉ bán khi đã có Vòng Z; crystal hệ giá 3000, crystal loài 5000 × tầng); hạ boss rơi một crystal `crystalDropChance` % (10, × trait kiểu Pickup), chọn đều trong crystal loài của loài boss và crystal các hệ của boss.

## Điều kiện dùng

- Lệnh skill ghi `zMove: true` (skillId vẫn là skill gốc). Mỗi phe **một Z-Move mỗi trận** (`BattleState.zMoveUsed`), kể cả hai quái cùng xin trong một lượt.
- Lý do không được (`zMoveUnavailable { monsterId, skillId, reason }`, `ZMoveFailReason`): `tribulation` (trận độ kiếp, như biến hình), `noKeyItem` (thiếu Vòng Z; **quái hoang / boss không dùng được**; NPC lớp `transforms` coi như có), `alreadyUsedBySide`, `dynamaxed` (quái đang Dynamax hoặc cùng lệnh xin Dynamax: chiêu Max thay chỗ Z-Move, như Pokémon thế hệ 8 không có Z-Move), `noCrystal` (không cầm crystal hợp skill; chiêu Max / Z-Move không thành Z-Move). `zMove` khác `true` hoặc kèm thế (`style`) thì `malformedAction`.
- Mega / Tera vẫn dùng chung được với Z-Move (game có nhiều ô đồ cầm nên quái cầm được cả đá Mega lẫn crystal; khác Pokémon chỉ cầm một món).
- Chọn crystal: crystal loài xét trước crystal hệ; crystal hệ khớp **hệ gốc của skill** (không theo môi trường: Weather Ball khi mưa vẫn cần crystal Thường, thành Breakneck Blitz, như Showdown).

## Skill thật

- **Skill gây sát thương + crystal hệ** → Z-Move của hệ đó (`zMove: "z"`, một skill mỗi hệ): cùng loại vật lý / đặc biệt với skill gốc, **một mục tiêu** (`enemy`), priority 0 (mất priority của skill gốc, kiểu Z-Quick Attack), **luôn trúng** (bỏ qua accuracy và né, như chiêu Max), mất hiệu ứng / `fieldModifiers` / thế / synergy của skill gốc.
  - **Power** (`zMovePower`): `zPower` của skill nếu có (số riêng của Showdown: Mega Drain 120, Weather Ball 160, Hyper Beam 200, V-create 220...), không thì bảng `powerTable` theo power: < 60 → 100, < 70 → 120, < 80 → 140, < 90 → 160, < 100 → 175, < 110 → 180, < 120 → 185, < 130 → 190, < 140 → 195, còn lại 200. Skill đánh nhiều lần **số đòn thay đổi** (2–5) nhân power × `variableHitsPowerFactor` (3) trước khi tra bảng; số đòn cố định thì không.
- **Skill trạng thái + crystal hệ** → chính skill đó, chạy thêm **Z-Power** (`zEffects`: hiệu ứng "ngôn ngữ" trait lên quái dùng) **trước** skill, kể cả khi skill sau đó trượt. Theo Showdown: tăng bậc chỉ số (Z-Swords Dance +1 công...), hồi đầy máu (`heal` 100% max), bỏ bậc âm (`restoreStages`), +2 bậc chí mạng (`focus`, như Focus Energy: tới khi rời sân, đã có thì không cộng), +1 bậc chính xác / né (bậc trận thật: Z-Defense Curl, Z-Trick Room, Z-Focus Energy, Z-Sweet Scent +1 chính xác; Z-Sand Attack, Z-Smokescreen, Z-Lucky Chant +1 né), hồi đầy quái vào thay (`healReplacement`, Z-Memento / Z-Parting Shot), khiêu khích (`provoke`, Follow Me: chưa có skill nào). Skill trạng thái không có Z-Power (skill Pokémon thế hệ 8+, skill ngoài Pokémon) vẫn dùng Z-Move được, chỉ không có thêm gì.
- **Crystal loài** → Z-Move riêng (`zMove: "signature"`), số cố định của nó (Catastropika 210, 10,000,000 Volt Thunderbolt 195 và +2 bậc chí mạng, Extreme Evoboost +2 mọi chỉ số, Clangorous Soulblaze đánh mọi địch và +1 mọi chỉ số một lần cho cả chiêu (hiệu ứng sau chiêu của spell), Genesis Supernova đặt Psychic Terrain, Splintered Stormshards dọn địa hình, Stoked Sparksurfer gây tê liệt...). Luôn trúng như Z-Move theo hệ.
- Z-Move (cả hai loại) chỉ có trong trận (`isBattleOnlyMove`, `model/content.ts`): không nằm trong learnset, không có sách, không có thế / synergy / hold, không thành hợp kích kỹ, không áp thuần thục. Exp thuần thục vào skill gốc.
- **Xuyên bảo vệ:** Z-Move gây sát thương gặp hiệu ứng `protect` (Max Guard) thì vẫn đánh, chỉ gây `protectDamagePercent` % (25) sát thương lên mục tiêu đó (log `protectPierced`); skill thường vẫn bị chặn (`protected`). Skill `ignoresProtect` đánh xuyên nguyên.
- Bậc chính xác / né / chí mạng của Z-Power theo luật chung (`battle.md` mục "Bậc trận", "Chí mạng"), như Pokémon (sửa 2026-10-27: bản đầu dùng 3 trạng thái buff tới hết trận vì game chưa có các bậc này).

## Trong lượt

- Thứ tự: lệnh Z-Move xếp theo priority của skill thật (Z-Move gây sát thương: 0; Z-status: priority của skill gốc).
- Lúc tới lượt (sau mất lượt vì trạng thái / trait, không nghe lệnh, skill đang chờ): `startZMove` xét lại điều kiện, phe hết lượt Z-Move, log `zMoveUsed { monsterId, skillId, zSkillId }`, chạy Z-Power, rồi dùng skill thật. Quái không ra đòn được (ngủ, choáng, gục trước) thì **không mất lượt Z-Move** (như Showdown). Trait đổi skill (chọn skill ngẫu nhiên...) thì không còn là Z-Move. Z-Move **không lặp** theo trait (kiểu Multicast) và **không nhận đòn thêm** của trait (kiểu Multistrike), cả Z-Move gây sát thương lẫn Z-status: như Pokémon (Parental Bond không áp lên Z-Move, Instruct / Copycat không gọi lại được Z-Move).
- **Hồi quái vào thay** (`healReplacement`, `VolatileState.healsReplacement`): lần tới quái đó rời ô bằng đổi quái / rút về (Parting Shot rút về ngay), quái vào ô đó hồi đầy máu (log `replacementHealed`; không chữa trạng thái). Memento của game không làm quái dùng gục nên hiệu ứng chờ tới khi quái rời ô; quái gục thì mất hiệu ứng (trạng thái tạm mất khi gục).

## AI và NPC

- AI (`battle/ai.ts`): mỗi skill có Z-Move dùng được là một ứng viên riêng (`Candidate.zMove`), chấm theo skill thật (skill trạng thái cộng điểm Z-Power như hiệu ứng spell); tung theo trọng số như mọi ứng viên. Quái trước đã chọn Z-Move thì quái sau không chọn. AI biến hình không thêm Dynamax cho lệnh đã chọn Z-Move. Dùng cho tự đánh / mô phỏng và cho NPC.
- **NPC** (`trainers.md`): lớp `transforms` (quán chủ) có Vòng Z; khi sinh đội, quái cuối đội (chủ lực) cầm một crystal (`pickZCrystalFor`, không tốn RNG): crystal loài nếu biết skill gốc, không thì crystal hệ đạo quán nếu biết skill gây sát thương hệ đó, không thì crystal hệ của skill gây sát thương power cao nhất (như Kahuna của Alola dùng Z-Move).

## Dữ liệu (`scripts/data-import/zmove-import.mjs`)

- Đọc `moves.js` / `items.js` của Pokémon Showdown bằng AST (acorn, không chạy code tải về). Skill game khớp move Showdown cùng tên **và** cùng hệ, cùng loại (tránh skill trùng tên của nguồn khác, như `protect` của Siralim).
- `zPower`: ghi khi power Z-Move của Showdown (số riêng, hoặc bảng trên power Showdown) khác power game tự tính (bảng trên power của game). Nhiều chiêu game đã đổi power (chiêu phải nạp / nghỉ lượt nửa power...) nên Z-Move vẫn theo số gốc của Pokémon.
- `zEffects`: theo `zMove.boost` / `zMove.effect` của Showdown (chuyển sang "ngôn ngữ" trait).
- Tên: en theo Pokémon / Showdown; vi tự đặt theo nghĩa (Cuồng Tốc Tất Sát, Thảm Họa Pika...), crystal "Pha Lê Z <hệ / loài>" (chủ project duyệt 2026-10-27).
- Báo cáo `scripts/data-import/zmoves-report.json` (số skill khớp, phần bỏ); Z-Move riêng cần cơ chế chưa có ở `scripts/data-import/zmoves-planned.json`.
- Guardian of Alola (Tapunium Z): sát thương 75% máu hiện tại (`fixedDamage targetHpPercent`); Searing Sunraze Smash / Menacing Moonraze Maelstrom bỏ qua ability mục tiêu (`ignoresAbility`).
- Light That Burns the Sky (Ultranecrozium Z, 2026-10-30): crystal có `ultraBurst` (biến Ultra Burst, `transformation.md`), Z-Move dùng được ở dạng Ultra Necrozma, loại theo công / đặc công cao hơn, bỏ qua ability. Mimikium Z nhận cả Mimikyu lộ mặt (dạng trong trận). Z-Power của Curse: hệ Ma hồi đầy máu, hệ khác +1 công.
- Pikachu mũ (Original, Hoenn, Sinnoh, Unova, Kalos, Partner, Alola; mũ World không dùng được như gốc) nhập 2026-10-30 (`battle-forms-import.mjs`, dạng `alternate`) nên Pikashunium Z dùng được. Dạng Totem Kommo-o / Mimikyu (nhập 2026-10-31) dùng được Kommonium / Mimikium Z như gốc (danh sách loài theo Showdown `itemUser`).

## Save

- `BattleState.zMoveUsed: { player, enemy }` (boolean); `VolatileState.healsReplacement?: true`. Kiểm tra: đúng kiểu. Save `version: 61` (v60 → v61: trận đang diễn ra `zMoveUsed` cả hai phe `false`; `state-versions.md`).
