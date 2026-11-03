# Ngự thú sư và khế ước

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Người chơi là **ngự thú sư** có **cảnh giới** riêng (không trần). **Khế ước** là một bước riêng (như fuse, breed), không gắn với cách có quái: quái nào cũng bắt / thu phục được, sau đó người chơi chọn khế ước hay không (mục "Khế ước"). Cảnh giới cao thì quái đã khế ước mạnh hơn, sống lâu hơn, khế ước được quái level cao hơn và nhiều quái hơn, có thêm ô đồ cầm và **kỹ năng ngự thú sư** dùng trong trận. Mọi số ở `balance.json` khóa `tamer` (và `ai.reviveBonus`, `ai.tamerSkillMinScore`); số hiện tại và lịch sử chỉnh ở `balance-content.md`.

Code: `tamer/realm.ts` (mọi công thức theo cảnh giới), `tamer/contract.ts` (tỉ lệ khế ước, số quái đang khế ước, nâng khế ước), `roster/contractActions.ts` (action khế ước / giải trừ), `tamer/breakthrough.ts` (đột phá), `battle/tamerSkills.ts` (kỹ năng trong trận, AI), `gameData/validateTamer.ts` (kiểm tra dữ liệu), `game/validateTamerState.ts` (kiểm tra save). Dữ liệu: `src/data/tamerSkills.json`, `src/data/tamerRealms.json`, tên ở `src/data/i18n/<ngôn ngữ>/tamerSkills.json` / `tamerRealms.json`.

## State

- `GameState.tamer = { realm, exp }`: `realm` nguyên ≥ 0, chỉ tăng bằng đột phá; `exp` `Decimal` ≥ 0. Game mới cảnh giới 0, EXP 0. Save cũ (v26) nhận cảnh giới `⌊(highestFloor − 1) / 10⌋` (mục "Lịch sử version" ở `state.md`).
- **Cảnh giới khế ước của quái** `Monster.contractRealm` (chủ project chốt 2026-10-24: **không bắt buộc bằng cảnh giới ngự thú sư**, quái có thể cao hơn, "carry" ngự thú sư):
  - `null` = chưa khế ước: quái hoang, boss, và **mọi quái mới về tay người chơi** (bắt bóng, khu bảo tồn, thu phục, trứng breeding / boss / thám hiểm / truyền thừa, quái event; chủ project chốt 2026-10-25: tách bắt và khế ước). Số nguyên ≥ 0 = đã khế ước ở cảnh giới đó. Quái của NPC luôn đã khế ước với NPC (`validateGameState`).
  - Chỉ **quái khởi đầu** khế ước ngay (cảnh giới 0, `bindContract` ở `createNewGame`, như lễ khế ước đầu tiên trong truyện); `createGameState` (test, mô phỏng) khế ước cả đội truyền vào.
  - Đột phá thành công: `raiseOwnedContracts` nâng mọi quái **đã khế ước** (đội, kho, trứng) lên ít nhất cảnh giới mới; quái chưa khế ước giữ nguyên. Không hạ khi còn khế ước (phi thăng sau này reset ngự thú sư, quái vẫn giữ); giải trừ thì về `null`.
  - Lý do lưu trên quái (như cờ `aging`): chỉ số, max HP và thọ nguyên đều tính từ `(data, monster)`; quái của ngự thú sư NPC mang cảnh giới của NPC đó (`trainers.md`).
- Tên cảnh giới: `tamerRealms.json` theo thứ tự (cảnh giới 0 = tên đầu). Quá tên cuối thì "tên cuối + n" (`tamerRealmTitle` trả `{ realmId, plus }`, UI ghép chữ theo ngôn ngữ). 10 tên: Học Đồ, Sơ Cấp, Trung Cấp, Cao Cấp, Đại Sư, Tông Sư, Vương Giả, Hoàng Giả, Thánh Giả, Thần Giả.

## EXP và đột phá

- **EXP ngự thú sư** (chỉ khi phe người chơi có ngự thú sư trong trận, `battle.tamers.player`):
  - thắng trận: `expShare`% **EXP gốc của trận** (tổng `expReward` của quái bị hạ và quái bắt được, đúng số mỗi quái tham chiến nhận trước khi nhân trait; chủ project chốt: không cộng theo số quái nhận, không nhân trait EXP), làm tròn xuống;
  - lần đầu mở tầng mới (hạ boss tầng ở `highestFloor`): thêm `floorUnlockExpPercent`% EXP gốc của trận đó.
  - Mỗi phần ghi log `tamerExpGained { amount }` (0 thì không ghi).
- EXP cần lên cảnh giới n + 1: `expBase × (n + 1)^expPower` (đa thức, quy tắc 7; `expToNextRealm`).
- **Đột phá** (`tamerBreakthrough`, không tham số; chỉ ở thị trấn, ngoài trận):
  - Điều kiện: EXP ≥ cần (thiếu: `tamerExpTooLow { need, have }`), tiền `costBase × (n + 1)²` (`notEnoughMoney`), `n + 1` cái nguyên liệu `breakthrough.itemId` (Phá Cảnh Đan, `notEnoughItem`). Kiểm tra theo thứ tự này; lỗi thì state giữ nguyên.
  - Tỉ lệ thành công `max(minChance, baseChance − n × chanceStep)` (tung RNG của state).
  - Thất bại: mất tiền và đan, **giữ EXP** và cảnh giới. Không có rủi ro chết.
  - Thành công: `realm + 1`, trừ EXP cần (dư giữ lại), nâng khế ước mọi quái đang sở hữu.
  - Kết quả: log ngoài trận `breakthrough { success, realm }` (realm = cảnh giới sau lần thử; `game-log.md`).
- **Phá Cảnh Đan** (`breakthroughPill`, category `material`, `world-items.md`): rơi khi hạ **boss tầng của map** (`tamer.floorBossDrops`, cùng chỗ với bảng rơi Thọ Nguyên Đan / Kẹo Hiếm của boss tầng), bán ở cửa hàng (trọng số thấp, giá × tầng như vật phẩm thường). Luyện được (`alchemy.md`): cần **3 yêu đan cùng một hệ** (hệ nào cũng được; ngự thú sư không có hệ nên không ép một hệ cụ thể) + Tinh Phách Thiên Giới + 2 Nhân Sâm.

## Hiệu lực theo cảnh giới

- **Cộng hưởng khế ước:** quái đã khế ước được `contract.baseStatPercent + contractRealm × statPercentPerRealm`% mọi chỉ số (kể cả max HP; 5 + 3 × cảnh giới), chưa khế ước 0, nguồn `contract` trong `STAT_PERCENT_SOURCES`, cộng vào tổng % ở bước áp trait (`stats-traits.md`). Áp cho **mọi quái đã khế ước** (đội, kho, trứng; chủ project chốt, thay cho "chỉ quái trong đội" của thiết kế ban đầu: chỉ số không biết quái đang ở đâu, quái trong kho không đánh trận). Quái hoang / boss (`null`) không có. Chữ ký max HP (`maxHpSignature`) gồm `contractRealm`.
- **Thọ nguyên:** quái đã khế ước × (1 + (`contract.baseLifespanPercent` + `contractRealm` × `lifespanPercentPerRealm`) / 100) (phần gốc 0 + 10 × cảnh giới), mục `contract` trong `LIFESPAN_MODIFIERS` (`lifespan.md`). Đột phá không làm thọ nguyên tụt; giải trừ khế ước thì mất phần này.
- Phần gốc thọ nguyên để 0: tăng thọ nguyên lúc khế ước làm quái vừa có (tuổi khởi đầu ≈ 10% thọ nguyên) tụt về ấu niên (−15% chỉ số); mô phỏng cho thấy đội mẫu yếu đi 4–9 điểm tỉ lệ thắng (`balance-content.md`).
- **Giới hạn khế ước** (chỉ áp cho **khế ước**, không áp cho bắt bóng / thu phục / khu bảo tồn): mục "Khế ước" dưới.
- **Ô đồ cầm:** `equipmentSlotCount` cộng số mốc cảnh giới đã đạt (`realmMilestones` 2, 5, 10 rồi gấp đôi mãi: 20, 40…; `countMilestonesReached`, `world-items.md`).
- **Linh lực** (kỹ năng trong trận): tối đa `manaBase + manaPerRealm × realm` (người chơi × (1 + kênh thưởng `manaPercent` / 100), thiên phú ngự thú sư, `tamer-talents.md`), đầy lại mỗi đầu trận.
- Cảnh giới chỉ giảm khi phi thăng. Phi thăng reset cảnh giới: mở khóa (kỹ năng, ô) theo **cảnh giới cao nhất từng đạt**, sức mạnh (giới hạn level, số ô khế ước, linh lực) theo cảnh giới hiện tại (`ascension.md`).
- Chưa có (ghi ở roadmap của mục đó): ô thám hiểm `1 + ⌊cảnh giới / 2⌋` (`expeditions.md`). Mốc cảnh giới cộng sức chứa kho / túi trang bị (đã làm, `capacity.md`).

## Khế ước

Như truyện ngự thú: bắt là một việc, **khế ước** là việc khác (chủ project chốt 2026-10-25). Khế ước để tăng chỉ số / thọ nguyên (mục trên) và mở khóa tính năng (hiện có: bản mệnh thú; mục sau có thể yêu cầu quái đã khế ước). Số ở `config.tamer.contract` (số tạm, `balance-capture.md`).

- **`formContract { monsterId }`** (thị trấn, ngoài trận, quái trong đội / kho đang rảnh): tung tỉ lệ `contractChance`. Kiểm tra trước (`assertCanContract`, UI dùng để hiện nút), lỗi thì state giữ nguyên:
  - đã khế ước: `alreadyContracted { monsterId }`;
  - **giới hạn level**: level > `levelBase + levelPerRealm × cảnh giới` (100 + 100 × cảnh giới; `contractLevelLimit`, × (1 + kênh thưởng `contractLevelPercent` / 100) của thiên phú ngự thú sư qua `playerContractLevelLimit`, `tamer-talents.md`; tỉ lệ khế ước và không nghe lệnh dùng cùng giới hạn này) thì `tamerRealmTooLow { monsterId, needRealm }` (`realmToContract`). Tầng N có quái level khoảng 10N nên cảnh giới r khế ước được quái tới hết tầng 10(r + 1);
  - **số ô**: số quái đang khế ước (đội, kho, trứng; `contractedCount`) ≥ `slotsBase + slotsPerRealm × cảnh giới` (8 + 4 × cảnh giới; `maxContracts`) thì `contractSlotsFull { max }`. Cảnh giới càng cao khế ước càng nhiều; đột phá không bao giờ làm số đang có vượt ô (ô chỉ tăng). Quái fuse làm quái phụ, chết, thả, bỏ trốn thì trả ô;
  - đang bị thương (phản phệ hoặc đạo thương): `tamerWounded { untilDay }`; ngoài ra `notInTown`, `inBattle`, `monsterNotOwned`, `monsterBusy`.
- **Tỉ lệ** (`contractChance`, %): kẹp(`base` − `levelPenalty` × level / giới hạn level − `rankPenalty` × thứ hạng phẩm cấp loài − `bossPenalty` nếu quái mang hệ số boss + `affinityBonus` × thân mật / thân mật tối đa, `min`, `max`) = kẹp(90 − 40 × tỉ lệ level − 4 × bậc − 15 (boss) + 20 × thân mật / 255, 10, 100). Quái càng mạnh (level sát giới hạn, phẩm cấp cao, boss) càng khó; nuôi thân mật trước thì dễ hơn; đột phá (giới hạn cao hơn) cũng dễ hơn.
- **Thành công:** `contractRealm` = cảnh giới hiện tại, mốc lý lịch `contracted { realm }` (`monster-history.md`).
- **Thất bại (phản phệ, như truyện):** quái − `failure.affinityLoss` (30) thân mật; ngự thú sư **bị thương** tới hết ngày hôm nay + `backlashDays` − 1 (3 ngày; dùng chung `tamer.woundUntilDay` với đạo thương, không rút ngắn vết cũ): trong lúc đó không khế ước, không đột phá được, linh lực đầu trận còn `bond.woundManaPercent` %. Rồi tung **bỏ trốn** `escapeChance × (1 − thân mật / 255)` % (20%; tính với thân mật sau khi mất; `contractEscapeChance`): bỏ trốn thì quái rời đội / kho, đồ đang lắp về túi (như thả). Quái duy nhất trong đội không bỏ trốn.
- **Quái chưa khế ước khó điều khiển** (chủ project chốt 2026-10-25: bắt về dùng được ngay với rất ít rủi ro, như Pokémon đổi về khi chưa đủ huy hiệu):
  - **Không nghe lệnh:** lệnh skill người chơi ra cho quái chưa khế ước có `disobeyChance` % bỏ lượt (log `disobey { monsterId }`, kiểm sau trait / trạng thái mất lượt): `min(max, base + levelScale × min(r, 1) + overLimitScale × max(0, r − 1)) × (1 − affinityReduction × thân mật / 255)`, `r` = level / giới hạn level khế ước của cảnh giới hiện tại = `min(50, 1 + 5 × min(r, 1) + 30 × max(0, r − 1)) × (1 − 0,8 × thân mật / 255)`: trong giới hạn level chỉ 1–6% (thân mật cao còn 0,2–1,2%), vượt giới hạn tăng nhanh (level gấp đôi giới hạn: 36%). Hành động thêm / lệnh do AI chọn (cuồng bạo) không xét; tỉ lệ 0 không tốn RNG.
  - **Dễ cuồng bạo:** vai trò `unbound` (`frenzy.md`): ngưỡng 25% HP, mất điều khiển như quái race khó kiểm soát.
  - Mô phỏng A/B biến thể `unbound` (đội mẫu chưa khế ước, `balance-capture.md`).
- **Kết quả** cho UI: log ngoài trận `contractAttempted { monsterId, outcome }`, outcome `success` / `failed` / `escaped` (`game-log.md`).
- **`dissolveContract { monsterId }`** (thị trấn, ngoài trận, quái rảnh): giải trừ, `contractRealm` = null, mất tâm linh tương thông (`contractDays` = 0), quái − `dissolveAffinityLoss` (50) thân mật, **ngự thú sư bị phản phệ** `dissolveBacklashDays` (2) ngày (như thất bại khế ước: không khế ước / đột phá, linh lực đầu trận giảm; không rút ngắn vết cũ); trả ô.
- **Tâm linh tương thông** (chủ project chốt 2026-10-25): `Monster.contractDays` = số ngày đã khế ước liên tục (việc theo ngày `soulLink`: +1 mỗi ngày cho quái đã khế ước ở đội / kho; khế ước thành công / giải trừ đặt 0; chưa khế ước luôn 0). Mức (`contract.soulLinkTiers`, tăng dần theo `days`; `soulLinkTier`, điểm duy nhất ở `registries/soulLink.ts`) đạt khi đủ cả số ngày và thân mật, lấy mức cao nhất:

  | Mức (id)   | Ngày | Thân mật | % mọi chỉ số | Giảm linh lực kỹ năng |
  | ---------- | ---- | -------- | ------------ | --------------------- |
  | `attuned`  | 7    | 100      | +2           | 10%                   |
  | `resonant` | 30   | 150      | +4           | 20%                   |
  | `oneMind`  | 100  | 200      | +7           | 30%                   |
  - % chỉ số cộng vào nguồn `contract` (không nhân bản mệnh). Giảm linh lực: kỹ năng ngự thú sư của người chơi tốn × (1 − mức cao nhất trong các quái còn sống trên sân / 100), nhân với giảm của bản mệnh, làm tròn lên (`tamerSkillManaCost`). Tên mức: UI tra theo id (chờ UI). Chưa khế ước: `notContracted`; bản mệnh thú: `isBondBeast` (đổi bản mệnh trước).

- **Save:** không đổi cấu trúc (quái của người chơi được phép `contractRealm` null; save cũ giữ khế ước đang có, kể cả khi vượt số ô).
- **Mô phỏng:** "người chơi" khế ước quái đội mẫu chưa khế ước ở thị trấn khi khế ước được và tỉ lệ ≥ 60% (`contractTeamWhenPossible`), thất bại thì dừng tới lần về thị trấn sau; cột `economy` của `progression.csv` thêm `contract` / `contractFail` / `escape` (`simulation-features.md`).

## Bản mệnh thú

Như truyện ngự thú: ngự thú sư chọn **một quái làm bản mệnh** (本命兽), mạnh lên cùng cảnh giới, mất nó thì bị **đạo thương**. Code: `tamer/bond.ts` (đạo thương, chặn, ngự thú sư mới), `roster/bondActions.ts` (`bindBond`, `bondMonsterOf`, `rebindCost`). Số ở `balance.json` khóa `bond` (số tạm, `balance-systems.md`).

- **Lưu trên quái** `Monster.bond: boolean` (lệch roadmap `tamer.bondMonsterId`, Claude chốt 2026-10-25): chỉ số và thọ nguyên tính chỉ từ `(data, monster)` như `contractRealm`. Tối đa một quái sở hữu (đội, kho) là bản mệnh; quái mới, quái hoang, con breeding, trứng truyền thừa `false`; tiến hóa, fuse (quái gốc), thức tỉnh giữ. `GameState.tamer` thêm `bondDay` (ngày kết gần nhất, null = chưa từng) và `woundUntilDay` (null = không đạo thương). `MonsterView.isBond`.
- **Kết** `bindBond { monsterId }` (thị trấn, ngoài trận, quái rảnh, **đã khế ước**: chưa thì `notContracted`): thân mật ≥ `minAffinity` (200, Tri kỷ; `bondAffinityTooLow { monsterId, need, have }`), quái đang là bản mệnh thì `bondAlreadyBound`. Lần đầu miễn phí.
- **Đổi bản mệnh** (đang có bản mệnh khác): tốn `rebindCostPerRealm × (cảnh giới + 1)` (5.000), bản mệnh cũ − `rebindAffinityLoss` (100) thân mật và hết là bản mệnh. Đã từng kết thì phải chờ `rebindCooldownDays` (30) ngày kể từ lần kết trước, kể cả khi bản mệnh cũ đã chết (`bondCooldown { readyDay }`).
- **Lợi ích:** cộng hưởng khế ước × `resonanceMultiplier` (3; nguồn % `contract`, `stats-traits.md`); thọ nguyên × `lifespanMultiplier` (2; mục `bond` của `LIFESPAN_MODIFIERS`, `lifespan.md`); bản mệnh còn sống trên sân thì kỹ năng ngự thú sư tốn `manaCostPercent` % linh lực (50%, làm tròn lên; `tamerSkillManaCost`, giá tính trước khi kỹ năng chạy); không giảm thân mật khi gục.
- **Chặn:** thả (`releaseMonster`), làm quái phụ fuse / hiến tế (`sacrifice.md`): `isBondBeast { monsterId }` (đổi bản mệnh trước). Trao đổi NPC làm sau tự gọi `assertNotBond`. Cấy ghép **không chặn** bản mệnh (chọn liều là việc của người chơi, như độ kiếp; `implant.md`).
- **Bản mệnh chết hẳn** (tọa hóa, chết trong độ kiếp, cấy ghép thất bại lần cuối; đều gọi `woundIfBondDied`): đạo thương tới hết ngày `hôm nay + woundDays − 1` (30 ngày); log `bondBroken { monsterId, woundUntilDay }` (log ngoài trận khi tọa hóa / cấy ghép thất bại lần cuối, log trận khi độ kiếp). Trong đạo thương: **không đột phá** (`tamerWounded { untilDay }`) và linh lực đầu trận chỉ còn `woundManaPercent` % (50%). Roadmap ghi "mất cộng hưởng khế ước": Claude đổi thành giảm linh lực (2026-10-25) vì cộng hưởng tính trên từng quái từ `(data, monster)`, không đọc được state ngự thú sư.
- **Save** (v50): `bond` boolean trên mọi quái; một bản mệnh tối đa, quái trong trứng / quái địch không là bản mệnh, có bản mệnh thì `bondDay` khác null (`validateBondState`).
- **Mô phỏng:** "người chơi" kết bản mệnh với quái đội mẫu mạnh nhất đủ thân mật khi chưa có (`bindBondWhenPossible`, `simulation-features.md`).

## Kỹ năng ngự thú sư (trong trận)

- Dữ liệu `tamerSkills.json`: `{ id, unlockRealm, manaCost, cooldown, usesPerBattle?, target, effects }` (luật kiểm tra ở `data.md`). `target` quyết định registry của `effects` (chủ project chốt):
  - `ally`: một quái trong đội (kể cả dự bị, đã gục; `targetId` bắt buộc), hiệu ứng **vật phẩm** `ITEM_EFFECTS` (`healPercent`, `revive`, `cureStatus`...), áp bằng `applyItemEffects` như thuốc; log `heal` / `statusCured` như thuốc (`logRecovery`).
  - `allyOnField`: một quái ta còn sống trên sân (`targetId` bắt buộc), hiệu ứng **skill** `SKILL_EFFECTS` chạy như chính quái đó dùng lên chính nó (`runSkillEffects`, user = target), ví dụ `statStage { who: 'self' }`.
  - `field`: không có `targetId`, hiệu ứng skill loại `perSkill` (theo phe / cả phe: `setSideField`, `sideStatStage`...), quái ta còn sống đầu tiên trên sân đứng ra dùng.
- **Lệnh:** `submitTurn { commands, tamer? }`, `tamer = { skillId, targetId? }`, **tối đa một lệnh mỗi lượt** (trường riêng, không nằm trong `commands` vì không gắn với ô nào), **không chiếm lượt quái**.
- **Kiểm tra lệnh** (trước khi xử lý lượt, state chưa đổi; `validateTamerCommand`): lệnh không phải object / kỹ năng lạ / mục tiêu sai dạng (`allyOnField` không trên sân, `field` / `merge` có `targetId`) là `malformedAction`; điều kiện hợp thể sai là `transformUnavailable { kind: 'merge', reason }` (`battle-merge.md`); mục tiêu `ally` không trong đội là `monsterNotInParty`; không dùng được là `tamerSkillUnavailable { skillId, reason }` theo thứ tự `tamerSkillBlocker`: `noTamer` (phe không có ngự thú sư) → `locked` (`unlockRealm` > cảnh giới) → `onCooldown` → `noUsesLeft` (đủ `usesPerBattle`) → `notEnoughMana`; mục tiêu `ally` mà hiệu ứng không có tác dụng (đầy máu, không trạng thái, chưa gục với hồi sinh) là `noEffect`.
- **Thứ tự lượt:** đổi quái → **kỹ năng ngự thú sư** → biến hình → vật phẩm / ném bóng → skill (`battle.md`). Hai phe đều có ngự thú sư (trận NPC, `trainers.md`): cảnh giới cao đi trước, hòa thì tung 50%.
- **Lúc chạy:** có tác dụng thì log `tamerSkill { side, skillId, targetId? }`, trừ linh lực, đặt hồi chiêu, đếm lần dùng. Không có tác dụng lúc tới lượt (mục tiêu đã rời sân, không còn quái trên sân, hiệu ứng vật phẩm không tác dụng) thì log `tamerSkillNoEffect`, **không tốn linh lực, không tính hồi chiêu** (như vật phẩm không tác dụng).
- **Hồi chiêu:** `cooldown` = số lượt sau lượt dùng bị chặn (2 = chặn hai lượt kế tiếp; người chơi − kênh thưởng `tamerSkillCooldown`, không dưới 0, `tamerSkillCooldown` ở `battle/tamerSkills.ts`, `tamer-talents.md`). Lưu `cooldowns[id] = hồi chiêu + 1` lúc dùng, cuối mỗi lượt giảm 1 (`tamersAtTurnEnd`), về 0 thì xóa; nên giữa hai lượt số lưu = số lượt còn bị chặn. Mỗi trận làm mới (`BattleState.tamers` dựng lúc vào trận bằng `newBattleTamer`).
- **`BattleState.tamers`** `Record<BattleSide, BattleTamer | null>`, `BattleTamer = { realm, mana, cooldowns, uses }`. Trận quái hoang / boss: phe người chơi có ngự thú sư (cảnh giới hiện tại, linh lực đầy), phe địch `null`.
- **Trận không cho dùng kỹ năng** (chủ project chốt, thay cho mã `notAllowedInBattleKind`): phe đó đặt `tamers.<phe> = null` (lỗi `noTamer`, không nhận EXP ngự thú sư). Đang dùng: trận độ kiếp (`awakening.md`).
- **AI** (`chooseAiTamerCommand`, gợi ý cho người chơi `suggestTamerCommand(data, state)`: không đổi state, không tốn RNG): xét mọi kỹ năng dùng được × mọi mục tiêu, điểm = tổng `aiValue` của hiệu ứng (hiệu ứng vật phẩm: `healPercent` = máu hồi thực / max HP × `healWeight`, `revive` = % hồi × `healWeight` + `reviveBonus` khi mục tiêu đã gục, `cureStatus` = tổng `statusWeights` của trạng thái được chữa; hiệu ứng skill dùng `aiValue` sẵn có với user = target = quái đứng ra dùng). Chọn lệnh điểm cao nhất nếu ≥ `ai.tamerSkillMinScore`, không thì không dùng. Phe địch có ngự thú sư (NPC sau này) tự chọn trong lượt.
- Kỹ năng hiện có (số tạm, `balance-content.md`): Linh Dược Thuật (`healingArt`, hồi 25% một quái ta), Thanh Tâm Chú (`clarityChant`, chữa mọi trạng thái), Cổ Vũ (`encourage`, +1 công và +1 đặc công một quái ta trên sân), Hộ Thể Thuật (`guardArt`, Reflect phe ta 3 lượt), Định Thân Thuật (`bindingArt`, −1 tốc độ cả phe địch), Kim Cang Hộ Thuẫn (`diamondShield`, Light Screen phe ta 3 lượt), Hồi Hồn Chú (`soulRecall`, hồi sinh 25%, 1 lần mỗi trận), Khế Ước Cộng Minh (`pactResonance`, +1 tốc độ cả phe ta), Tĩnh Tâm Chú (`calmMind`, cảnh giới 3, 20 linh lực, hồi chiêu 3: giảm 1 lượt chờ mọi skill đang chờ của một quái ta trên sân, hiệu ứng `reduceHold`; `skill-synergy-hold.md`).
- Ngự thú sư NPC (`trainers.md`): `BattleTamer.skillIds` = kỹ năng của lớp NPC (`tamerSkillBlocker` coi kỹ năng ngoài danh sách là `locked`); người chơi `null` = mọi kỹ năng đã mở.
- **Thị Uy** (`intimidate`, mục tiêu `wildFoe`, cảnh giới 0, 30 linh lực, 1 lần mỗi trận): chỉ lượt đầu trận quái hoang thường, thành công thì quái hoang theo về; luật ở `recruit.md`. Mục tiêu `wildFoe` không có `effects` (`validateTamer`: trường lạ), AI không chọn.
- **Song Thú Hợp Thể** (`twinBeastMerge`, mục tiêu `merge`, cảnh giới 3, 60 linh lực, 1 lần mỗi trận): hợp hai quái ta trên sân thành một thực thể vài lượt; không có `effects`, không ghi `targetId`; lỗi điều kiện là `transformUnavailable { kind: 'merge' }`; AI chọn theo `mergeGain`. Luật ở `battle-merge.md`.

## Mô phỏng

- Phe người chơi dùng `suggestTamerCommand` mỗi lượt; dùng kỹ năng đếm vào bảng nhóm skill (`ai.csv`) với nhóm `tamer:<id>`.
- Quét tầng / quét map / tìm level: ngự thú sư ở cảnh giới giả định `⌊(tầng − 1) / 10⌋`. Chơi liên tục: cảnh giới thật, "người chơi" về thị trấn đột phá khi đủ EXP (mua đan nếu thiếu và cửa hàng có bán); `progression.csv` thêm cột `realm` (cảnh giới lúc mở tầng) và `breakthroughFails`. Luật ở mục "Ngự thú sư" của `simulation-features.md`.
