# Cơ chế trận của Cassette Beasts

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Các cơ chế chiêu của Cassette Beasts và của phản ứng hệ, làm theo gốc (2026-11-04, tường / Camouflage làm lại đúng gốc 2026-11-05; nguồn `Data:Moves`, `Data:StatusEffects`, `Data:Species` và trang trạng thái của `wiki.cassettebeasts.com`). Loài Cassette Beasts học đúng danh sách chiêu của gốc (`moves.initial`, `moves.upgrades`), loài có nhãn trùng học qua sách. Save v105, v108, v109.

## Tường (Wall)

- **Tường là trạng thái có hệ riêng** (`StatusDef.wall { elementId, hits, special?, attackSkillId? }`, `battle/walls.ts`): lượt chặn còn lại ở `StatusInstance.amount`, thời hạn theo lượt như mọi trạng thái, mất khi rời sân, gỡ được như trạng thái (gốc "removable"). Mỗi hệ của game một trạng thái `wall<Hệ>` (gốc 14 hệ, game thêm cho hệ riêng để Elemental Wall dùng được), chặn 3 đòn, 3 lượt.
- **Skill tường** (hiệu ứng `wall { statusId | elementFromUser, turns?, hpCostPercent? }`): quái dùng mất 20% max HP dù đặt cho ai. Gốc TARGET_ONE, mặc định chính quái: đặt được lên đồng đội (`targetAlly`, `onAlly`) hoặc địch (`targetFoe`, `onFoe`). Đủ chiêu: 13 tường theo hệ, Elemental Wall (tường theo hệ đầu của quái dùng). Log `wallRaised`.
- **Tường đặc biệt** (`special`): dựng thì gỡ tường thường đang có; tường thường thay nhau (nhóm loại trừ) và không gỡ tường đặc biệt, nên tồn tại song song như gốc. Tường mới nhất nhận đòn trước. Gemstone Wall: +1 AP mỗi lượt = +10 thể lực (`staminaPerTurn`). Abramacabra: đầu lượt của quái đánh một địch ngẫu nhiên bằng Macabra Missile (30 power, tầm xa, `attackSkillId`, `wallAttacksOnAction`).
- **Chặn** (`wallAbsorbs`, mỗi đòn của `strikeOnce`, sau thế thân): đòn gây sát thương của phe địch thì không gây sát thương, tường mất một lần chặn (log `wallBlocked`, hết thì `wallBroken`). Đòn đánh nhiều lần: mỗi đòn một lần chặn. **Đòn khắc hệ của tường** (không phải hệ của quái; hệ số > 1) phá tường ngay rồi trúng như thường. Miễn nhiễm không đụng tường. Skill trạng thái không bị chặn.
- Đòn bị chặn trọn thì như thế thân: hiệu ứng đổi bậc / trạng thái / biến hệ / cộng hưởng / bẫy lên mục tiêu bị bỏ, phản ứng hệ không xảy ra.
- **Đi xuyên tường:** Window (`seeThroughWall`, trạng thái trên chủ tường, 3 lượt): tường không chặn skill tầm xa. Ricochet (`cbRicochet`, bị động, hook `wallIgnoreChance` 50%): đòn tầm xa của quái có 50% đi xuyên.
- **Phá tường:** Hurricane (`cbHurricane`, 90 power, mọi địch, đặt Strong Winds), Cosmic Kunai (150, mọi địch): cờ `destroysWalls` gỡ mọi tường rồi trúng. Crumble (`crumbleWalls { power: 30, elementId }`): phá mọi tường trên sân, mỗi quái có tường mất máu theo đòn `power` × lượt còn lại × khắc hệ, quái không tường không sao.
- **Dùng tường:** Throw (`wallThrow`, 50 power, cờ `consumesWall`): phá tường của chính quái, sát thương × lượt còn lại, không có tường thì thất bại; hệ theo quái dùng như chiêu Typeless của gốc. Revolving Door (`stealWall`): tường mới nhất của mục tiêu sang quái dùng, giữ lượt chặn và thời hạn (log `wallStolen`). Recycle (`recycleWall { staminaPerTurn: 10 }`, id `plasticRecycle` vì trùng chiêu Recycle của Pokémon): phá tường của chính quái, hồi 10 thể lực mỗi lượt còn lại (gốc 1 AP mỗi lượt); không có tường thì thất bại.
- AI: dựng tường = số đòn chặn × `stageValuePerStep` − phần máu mất (đã có tường thì 0, đặt cho địch thì âm); lấy tường địch gấp đôi; Recycle có điểm khi tường còn nhiều lượt hơn số đòn chặn; Crumble theo số tường địch − phe mình. AI dự đoán sát thương không xét tường (như thế thân), không tự đặt tường lên địch.
- **Diễn giải vì gốc không ghi rõ:** đòn khắc hệ phá tường rồi vẫn trúng; tường không chặn skill trạng thái.
- **Apple Tree** (Temptation `temptation`: mất 10% HP, tường đặc biệt hệ cỏ): mỗi lần chặn một đòn, kẻ đánh "hái táo": 33% bị độc, 67% hồi 10% máu **hiện tại** (`StatusDef.wall.onBlocked`: danh sách `{ weight, effects }` tung một kết quả theo trọng số, hiệu ứng skill với quái dùng = chủ tường, mục tiêu = kẻ đánh; `heal` thêm `basis: 'current'`). Gốc chỉ Archangel Mourningstar có chiêu; game cho Mourningstar học ở level 5, loài khác học qua sách theo hệ cỏ như mọi tường.
- **Mourningstar** (2026-11-06, Archangel, **không hệ** như gốc, `data.md` mục "Loài không hệ"): chỉ số trang wiki (HP 600, công / thủ hai loại 200, tốc độ 100) × 0,65 như loài Cassette Beasts khác, race thiên thần, bậc thần thoại (tỉ lệ bắt 5). Học Temptation (level 5), Crumble (11), **Judgement** (`judgement`, "Thiên phạt", 17): sét 200 power cả đội địch, luôn trúng, phá tường, 100 thể lực (10 AP). Chiêu khác trong bộ của gốc chưa có trong game nên theo learnset sinh chung. Gặp ở Núi lửa, Sa mạc Haina, Bãi thủy tinh theo luật gán map chung (race thiên thần; gốc chỉ ở dưới Mourningtown, game chưa có map hợp chủ đề).

## Crossfade, Paint Swipe

- **Crossfade** (`crossfade`, không hệ, priority 5 = cao nhất của game cho priority 10 của gốc, 10 thể lực = 1 AP): gốc đổi sang dạng băng khác mà giữ hệ bằng lớp phủ; game: quái rút về như U-turn (chọn quái vào thay bằng `switchTo`), quái vào thay nhận lớp phủ hệ của quái rút về 3 lượt (`switchOut { coatIncomingTurns }`). Bị chiêu / trait khác gọi thì không có tác dụng như gốc. Folklord, Pyromeleon học.
- **Paint Swipe** (`paintSwipe`, 90 power, cận chiến, priority −7 = đi sau cùng): chỉ dùng được khi đang có lớp phủ (`requiresCoating`, chặn ở `isSkillBlocked` nên AI tự bỏ); đòn theo hệ quái dùng như chiêu Typeless của gốc (đang phủ thì là hệ lớp phủ); trúng thì lớp phủ chuyển sang mục tiêu còn nguyên lượt, quái dùng trở lại hệ gốc (`transferCoating`, `battle/coatings.ts`). Brushroom, Fungogh học.
- **Học qua sách theo hệ** (chủ project chốt 2026-11-06): mọi tường, Coating, Camouflage, Temptation có cờ `bookForElement` (skill-books.md), mọi loài cùng hệ học qua sách; Elemental Wall / Coating, Crossfade, Paint Swipe hệ thường nên mọi loài học qua sách (hệ dùng chung).

## Sticker Trick / Booby Trap

- Hiệu ứng `stickerTrick { turns, power }` (`afterHits`): skill vừa dùng gần nhất của mục tiêu (`skillStreak`) bị thay bằng Booby Trap trong `turns` lượt (`VolatileState.boobyTraps`, mỗi skill một bẫy, thời hạn riêng; log `boobyTrapped`). Mục tiêu chưa dùng skill nào hoặc skill đó đã bị bẫy thì thất bại (gốc: thất bại khi skill vừa dùng là Booby Trap). Gốc không ghi thời hạn: số tạm 3 lượt.
- Quái dùng skill bị bẫy bằng lệnh của mình (`springBoobyTrap`, `battle/boobyTraps.ts`): skill không chạy, Booby Trap tự đánh nó (đòn vật lý không hệ `power` 30 như gốc, công / thủ của chính nó, `statDamage`; log `boobyTrapSprung`, `selfDamage`). AI không chọn skill đã bị bẫy.

## Skill bị động

- Trường skill `passive { hooks?, onEntry?, onBattleStart?, turnEnd?, usable? }` (`battle/passiveSkills.ts`): quái biết skill thì được `hooks` như trait (nguồn hook `passiveSkill`, nhóm % `traits`), chạy hiệu ứng skill lên chính nó khi vào sân (`onEntry`), một lần mỗi trận (`onBattleStart`), cuối mỗi lượt (`turnEnd`). Skill chỉ bị động (không `usable`, `is_passive_only` của gốc) phải là skill trạng thái power 0 nhắm self, không dùng bằng lệnh (`ActionError` `skillIsPassive`), bị chặn khi dùng do trait (`isSkillBlocked`), vẫn chiếm ô skill như gốc.
- **Resistance** (Thủy tinh / Nhựa / Kim tuyến): hook `elementDamageTaken { percent: −50, exceptCritical: true }` (không áp cho đòn chí mạng như gốc; `DamageContext.critical`) và `blocksElementReactions { elementIds }` (không chịu phản ứng của skill hệ đó).
- **Camouflage** (đủ 13 hệ của gốc, Glitter gốc không có): dùng được bằng lệnh (`usable`) và tự chạy **một lần mỗi trận, không tốn thể lực** (`onBattleStart`, gốc "Automatically used at the start of battle for 0 AP"): lớp phủ hệ của nó 3 lượt. Quái dự bị chạy ở lần đầu ra sân (`BattleRecord.battleStartPassivesDone`), vào lại sân không chạy nữa. Dùng bằng lệnh tốn 20 thể lực (2 AP).
- **Spring-Load**: khi vào sân nhận trạng thái `springLoaded` (cờ `meleeAsRanged`, tới khi rời sân): skill cận chiến thành tầm xa, không tiếp xúc (`springLoaded` trong `executeSkill.ts`).
- **Prismatic**: cuối mỗi lượt thành một hệ ngẫu nhiên (`transmuteRandom`; bỏ trống `elementIds` = mọi hệ của game, kể cả hệ đang mang, thay cho 14 hệ của gốc).

## Glass Bonds

- Trạng thái cờ `damageOnTransform` (25, như gốc): mỗi lần quái biến hình (Mega / Dynamax / Tera...), hợp thể hoặc đổi dạng trong trận thì mất 25% max HP, ít nhất 1 (`punishTransform`, `battle/statuses.ts`). Chiêu Glass Bonds gây trạng thái 3 lượt.

## Lớp phủ hệ có thời hạn

- `transmute { elementId | elementFromUser, turns? }` / `transmuteRandom { elementIds?, turns? }`: có `turns` thì biến hệ hết sau ngần ấy lượt (`VolatileState.coatingTurnsLeft`, `battle/coatings.ts`): trả hệ gốc, log `identityChanged`; không có `turns` thì tới khi rời sân (Soak). Lớp phủ của gốc (phản ứng hệ, Coating, Camouflage): 3 lượt. Gỡ được như trạng thái (`cureAllStatuses`, gốc "removable").
- **Coating** (đủ 13 hệ + Elemental Coating theo hệ quái dùng): gốc TARGET_ONE_ALLY: chính quái hoặc đồng đội (`targetAlly`, `onAlly`).
