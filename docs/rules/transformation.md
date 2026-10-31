# Biến hình trong trận: Mega, Dynamax / Gigantamax, Tera

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Ba cơ chế biến hình của Pokémon, làm giống Pokémon trên nền battle 2v2 (bước 5b, xong 2026-10-23). Mọi con số là **số tạm** trong `balance.json` khóa `transform` (xem `balance-content.md`). Khung chung cũng là nền cho "Hiện nguyên hình" của Hóa hình (`human-form.md`).

## Khung chung

- **Registry `TRANSFORMS`** (`battle/transformHandlers.ts`; đặt ở `battle/` vì cần tra dạng loài của `monster/`): mỗi loại (`TRANSFORM_KINDS` = `mega`, `dynamax`, `tera`, `trueForm`, `merge`, `ultraBurst`) khai báo điều kiện riêng `unavailable`, dạng chọn được `forms`, biến hình mới `start`, `endsOnLeave`, `allowedInTribulation`, `bySkillCommand` (xin bằng lệnh skill; `false` = loại đi đường riêng: Song thú hợp thể qua kỹ năng ngự thú sư, `battle-merge.md`, lệnh skill ghi `transform: 'merge'` là `malformedAction`, AI biến hình / kế hoạch boss bỏ qua). Luật chung ở `battle/transform.ts`. Thêm loại = thêm vào `TRANSFORM_KINDS` + một handler.
- **Luật chung:** loại có **vật phẩm chìa khóa** (`transform.keyItems`, không ghi = không cần) thì quái người chơi phải có trong túi, còn **quái hoang / boss không dùng được** (không có túi đồ, không cầm đá; chủ project chốt 2026-10-23); loại không cần vật phẩm thì mọi phe dùng được. Mỗi phe dùng **mỗi loại tối đa 1 lần mỗi trận** (`BattleState.transformsUsed`); **mỗi quái tối đa 1 biến hình mỗi trận** (kể cả Dynamax đã hết lượt).
- **Lệnh:** lệnh skill có `transform?: TransformKind` và `formSpeciesId?` (dạng Mega, bắt buộc khi quái có nhiều dạng dùng được; một dạng thì tự chọn). Không tốn lượt. Kiểm tra khi `submitTurn` (`validateTransformCommands`): sai thì `transformUnavailable { kind, reason }` (`noKeyItem`, `alreadyUsedBySide` (kể cả hai quái cùng xin một loại), `monsterAlreadyTransformed`, `notEligible`, `notPowerSpot`, `teraOrbEmpty`, `tribulation` (trận độ kiếp, xét trước mọi lý do khác, trừ loại có `allowedInTribulation`; `awakening.md`)). Loại thứ tư `trueForm` (Hiện nguyên hình của Hóa hình, không cần vật phẩm / power spot; `human-form.md`), loại lạ / dạng sai / `formSpeciesId` không kèm `transform` thì `malformedAction`.
- **Thứ tự lượt:** đổi quái → **biến hình** (theo tốc độ, Trick Room đảo, hòa thì random; kế hoạch của boss ở lượt đầu) → các lệnh còn lại (vật phẩm, phòng thủ, skill) **xếp thứ tự sau bước biến hình** (Mega đổi tốc độ có tác dụng ngay lượt đó). Lệnh xin biến hình mà tới bước biến hình quái đã rời sân / gục / đã biến hình thì bỏ qua.
- **Trên quái:** `Monster.battleTransform` (chỉ có trong trận, như `battleMaxHpDelta`): `{ kind, formSpeciesId?, teraElementId?, originalElementIds, turnsLeft?, ended?, stellarBoostedElementIds? }`. Lưu trên quái vì chỉ số gốc (Mega) và max HP (Dynamax) phải như nhau ở mọi nơi tính chỉ số / HP.
- **Hệ hiện tại:** biến hình đổi thẳng `monster.elementIds` (Mega: hệ dạng Mega; Tera: chỉ hệ Tera, Stellar giữ hệ gốc), hệ gốc thật giữ ở `originalElementIds`; mọi chỗ xét hệ (khắc hệ, miễn trạng thái, môi trường, mặt đất, hút bẫy, hook trait) tự đúng. Quái đang bị đổi hệ bởi trait Siralim thì phần trả lại khi rời sân cũng thành hệ mới. **Quái đã Tera không bị đổi hệ** bởi hiệu ứng đổi hệ Siralim (đổi race vẫn được).
- **Hết trận** (`revertTransforms`, đầu `applyWin` và `finish`): mọi quái (đội, địch, quái đã bắt) về dạng thường, hệ gốc, giữ tỉ lệ máu nếu đang Dynamax. Phần thưởng, EXP, tiến hóa tính trên dạng thường.
- **Log:** `transformed { monsterId, kind, formSpeciesId?, teraElementId? }`, `transformEnded { monsterId, kind }`, `protected { monsterId, userId }`, `skillFailed` lý do `protectFailed`, `keyItemReceived { itemId }`. (Sạc Tera Orb ở thị trấn không có log: action ngoài trận không có log; UI đọc `teraOrbCharged`.)

## Vật phẩm chìa khóa

- Category `keyItem` (`megaRing`, `dynamaxBand`, `teraOrb`; Vòng Z `zRing` của Z-Move ở `z-moves.md`): không giá, **không bán / mua / vứt** (`keyItemLocked`), không dùng trực tiếp, không rơi từ quái.
- **Nhận khi lần đầu thắng quán chủ đạo quán** ở tầng `config.trainers.gym.keyItemFloors` (Tera Orb 10, Vòng Mega 20, Dynamax Band 30, Vòng Z 40; `trainers.md`), log `keyItemReceived` (`grantKeyItems(data, inventory, tầng đạo quán đã thắng)`). Dữ liệu đổi tầng: cấp phần còn thiếu khi load (`parseSave`). Ngự thú sư NPC lớp `transforms` coi như có đủ vật phẩm chìa khóa (`trainers.md`).
- **Tera Orb có sạc** (`GameState.teraOrbCharged`, game mới = `true`): dùng Tera (phe người chơi) thì hết sạc; **NPC hồi máu** (`healParty`) sạc lại, và được dùng NPC khi chỉ cần sạc Orb (đội đầy máu).
- Món có `requiresKeyItemId` chỉ vào danh sách hàng khi túi có vật phẩm chìa khóa đó (đá Mega, Mảnh Tera, Max Soup, Dynamax Candy).

## Mega

- **Đá Mega:** category `megaStone` (`formId`: loài dạng Mega; `auto: true`: đá tự kích hoạt kiểu Primal), gộp chồng, lắp vào ô như đồ cầm, không tiêu hao, không hook. Mỗi dạng một đá.
- **Điều kiện:** Vòng Mega, quái không fuse, đang cầm đá có dạng thuộc loài hiện tại (`formOf = speciesId`), hoặc dạng có `megaSkillId` mà quái biết skill đó (Rayquaza: `dragonAscent`, vẫn cần Vòng Mega). Dạng dùng được: `megaFormsByStone` (`monster/forms.ts`). Loài nhiều dạng (Charizard / Mewtwo / Raichu X–Y, Absol / Garchomp / Lucario thường–Z...) mỗi dạng một loài và một đá riêng; cầm nhiều đá thì lệnh chọn dạng.
- **Hiệu ứng tới hết trận** (đổi quái, gục vẫn giữ): chỉ số gốc lấy từ loài dạng Mega (bước đầu của `computeStats`), hệ theo dạng Mega; race, trait, skill, gen, level giữ nguyên.
- **Primal** (Blue / Red Orb, `auto`): tự biến khi ra sân (mở trận, đổi quái, thay quái gục; trước trait vào sân, `autoTransformOnEntry`), không cần Vòng Mega, không tính lượt Mega của phe, vẫn là biến hình của quái.
- **Nguồn đá:** hạ boss thuộc loài có dạng Mega rơi đá của một dạng (`mega.stoneDropChance`, × trait kiểu Pickup); cửa hàng trọng số thấp sau khi có Vòng Mega (đá Primal không cần).

## Ultra Burst

- Loại `ultraBurst` (làm 2026-10-30): quái loài `ultraBurst.fromSpeciesIds` của Z-Crystal đang cầm (Ultranecrozium Z: Necrozma Dusk Mane / Dawn Wings) biến thành dạng `formId` (Ultra Necrozma) như Mega: chỉ số gốc, hệ và ability theo dạng (`statSpecies` / `abilitySpecies` xét `mega` và `ultraBurst`), giữ tới hết trận. Không cần vật phẩm chìa khóa (như Pokémon: chỉ cần cầm crystal), mỗi phe một lần, quái không fuse; lý do không được: `notEligible`. Crystal loài của dạng (Light That Burns the Sky) chỉ dùng được sau khi biến (crystal hợp loài hiện tại hoặc dạng biến hình đang có, `zCrystals.ts`). Trọng số boss `boss.weights.ultraBurst` 1 (boss hoang không cầm crystal nên thực tế chỉ NPC).

## Dynamax / Gigantamax

- **Chỉ ở power spot:** trận boss, hoặc map có `powerSpot: true` (`biomes.json`); không thì `notPowerSpot`.
- **Thời hạn** `dynamax.turns` (3) lượt tính cả lượt biến, kết thúc ở cuối lượt cuối (bước cuối của cuối lượt); **rời sân** (đổi quái, rút về, gục, bị bắt) thì kết thúc ngay. Kết thúc vẫn tính đã biến hình (`ended`).
- **Máu:** bước "biến hình" của `computeStats` nhân max HP × (`hpMultiplierBase` 1,5 + `hpMultiplierPerLevel` 0,05 × cấp Dynamax). Bắt đầu / kết thúc **giữ tỉ lệ máu**: máu đã mất theo tỉ lệ, làm tròn xuống (có lợi cho quái), còn sống thì tối thiểu 1 HP, đã gục vẫn gục.
- **Chiêu Max** (`maxMoveFor`, `battle/maxMoves.ts`; mọi lần dùng skill đi qua `battleSkill`): skill gây sát thương thành chiêu Max cùng hệ (hệ sau môi trường, kiểu Weather Ball), cùng loại vật lý / đặc biệt, power theo bảng `powerTable` (skill đánh nhiều lần lấy power một đòn; hệ `lowPowerElementIds` giác đấu / độc dùng `lowPowerTable`), **một mục tiêu** (`enemy`), priority 0, **luôn trúng** (bỏ qua accuracy và né), mất hiệu ứng / `fieldModifiers` của skill gốc, chỉ có hiệu ứng của chiêu Max (cả chiêu, chạy khi trúng, kể cả mục tiêu gục). Lệnh và log khóa skill (Choice, Seal, Scorned) vẫn theo skill gốc; log `useSkill` ghi chiêu Max.
  - Hiệu ứng theo hệ (dữ liệu `skills.json`, `maxMove: "max"`): như Pokémon; ánh sáng (Max Radiance, không có trong Pokémon): Safeguard phe ta. Hiệu ứng lên cả phe từ chiêu tấn công: `sideStatStage`, `sideHeal`, `sideCureStatus`, `sideApplyStatus` (mục "Skill" ở `battle.md`).
- **Max Guard** (skill trạng thái khi Dynamax, `maxMove: "guard"`, priority +4): hiệu ứng skill **`protect { consecutiveChanceDivisor }`** chặn mọi skill của quái khác nhắm vào quái đó tới hết lượt (log `protected`); dùng thành công ở lượt ngay trước thì tỉ lệ ÷ 3 mỗi lần liên tiếp, thất bại thì `skillFailed` `protectFailed` và chuỗi về 0. Skill `ignoresProtect` đánh xuyên; Z-Move gây sát thương xuyên một phần (`z-moves.md`). AI không chủ động chọn (điểm 0, như thế thân). Dùng lại được cho Protect / Detect (nội dung: hỏi chủ project).
- **Gigantamax:** quái có `gmaxFactor`, không fuse, loài có dạng gmax: Dynamax hiển thị dạng gmax (`formSpeciesId`, chỉ số như Dynamax thường); chiêu Max cùng hệ với chiêu G-Max của dạng (`gmaxSkillId`) thành chiêu G-Max (`maxMove: "gmax"`). Chiêu G-Max cần cơ chế chưa có thì nằm ở `scripts/data-import/skills-planned.json`, dạng đó dùng chiêu Max thường.
- **Không ném bóng** vào quái đang Dynamax (`cannotCatchDynamaxed` khi ra lệnh; quái vừa Dynamax ở bước biến hình thì lệnh ném thành `noTarget`, không mất bóng).
- Miễn nhiễm khi Dynamax (choáng, bị ép đổi quái, skill theo cân nặng): game chưa có các cơ chế này; làm cơ chế nào thì thêm miễn nhiễm vào đó.

## Tera

- **Hệ Tera trên quái** (`teraElementId`: id hệ hoặc `stellar`): quái hoang, trứng, con breeding random một trong hệ của chính nó (tung cuối cùng trong `rollMonster`); boss tung lại (`rollBossTransformTraits`): từ tầng `stellarFromFloor` có `stellarChance`% Stellar, không thì `bossOwnElementChance`% hệ của chính nó, còn lại random mọi hệ. Tiến hóa, fuse (quái gốc) giữ; bắt boss giữ.
- **Hệ Tera cố định theo loài** (trường loài `teraElementId`, như Pokémon: Ogerpon theo mặt nạ Cỏ / Nước / Lửa / Đá, Terapagos Stellar): quái mới / con breeding / boss luôn mang hệ đó (không tốn lượt tung), không đổi được (`teraElementFixed { speciesId }`), save sai hệ bị chặn (`validateMonster`).
- **Dạng Tera theo loài** (trường `teraFormId`: dạng `battleOnly` cùng loài gốc, xét theo dạng hiện tại): Tera thì quái đổi sang dạng đó tới hết trận (`changeBattleForm`, ability theo dạng mới) trước khi bắn sự kiện `transformed`: Ogerpon → 4 dạng Tera (Embody Aspect), Terapagos Terastal → Stellar (Teraform Zero).
- **Dạng Mega / gmax chỉ của một dạng** (trường `fromSpeciesIds` của dạng Mega / gmax: loài cùng gốc biến được; bỏ trống = chỉ loài gốc `formOf`; `formsOf` ở `monster/forms.ts`): Mega Meowstic đực / cái, Mega Tatsugiri 3 dạng, Mega Magearna / Magearna Original, Gmax Toxtricity Amped / Low Key.
- **Đổi hệ Tera:** action `changeTeraElement { monsterId, elementId }` ở thị trấn (đội hoặc kho), tốn `tera.changeCost` (50) Mảnh Tera của hệ đích (kể cả Stellar); trùng hệ đang có: `teraElementUnchanged`. Mảnh Tera: category `teraShard` (`elementId`), mỗi hệ + Stellar đúng một mảnh; rơi khi hạ boss theo hệ Tera của boss (`tera.shardDrop`), bán ở cửa hàng sau khi có Tera Orb.
- **Điều kiện:** Tera Orb đang sạc (`teraOrbEmpty`). Không cần power spot.
- **Hiệu ứng tới hết trận** (đổi quái vẫn giữ):
  - Phòng thủ: hệ chỉ còn hệ Tera (Stellar giữ hệ gốc).
  - STAB (`stabMultiplierOf`, công thức sát thương và AI dùng chung): hệ gốc 1,5; hệ Tera 1,5; hệ Tera trùng hệ gốc `sameStabMultiplier` (2); trait kiểu Adaptability nâng phần STAB như cũ.
  - Skill cùng hệ Tera power < `minPower` (60), không đánh nhiều lần, priority ≤ 0 thì power thành 60.
  - **Stellar:** mỗi hệ một lần mỗi trận ở lần đầu dùng skill gây sát thương trúng mục tiêu: hệ gốc × `stellarOriginalMultiplier` (2, thay STAB), hệ khác × `stellarOtherMultiplier` (1,2); sau đó như không Tera.
- **Tera Blast** (`teraBlast`, skill có cờ `teraBlast: true`): đã Tera thì hệ Tera, vật lý nếu công > đặc công (chỉ số cuối, tính bậc trận). Stellar: power `stellarBlastPower` (100), khắc chế cố định `stellarBlastEffectiveness` (×2) lên quái đang Tera, trung tính với quái khác, sau chiêu tự đổi bậc `stellarBlastSelfStages` (−1 công, −1 đặc công). **Mọi quái học được ở NPC học lại skill** khi có Tera Orb (`tera.relearnSkillIds`).

## Boss và AI

- **Boss** (`rollBossTransformPlan`, lúc mở trận boss): tung min(100, `boss.base` + `boss.perFloor` × tầng)% có biến hình; loại chọn theo `boss.weights` trong các loại boss dùng được (**chỉ loại không cần vật phẩm**; Mega / Dynamax / Tera hiện đều cần nên boss chưa biến hình, khung giữ cho loại sau này như "Hiện nguyên hình"; trận boss luôn là power spot), dạng random đều. Biến ở **lượt đầu** (`BattleState.plannedTransform`, dùng xong về `null`). Quái hoang thường không biến hình. Boss vẫn có hệ Tera, Gmax Factor (`dynamax.bossGmaxFactorChance` nếu loài mang được), cấp Dynamax random 0–`maxLevel` riêng (giữ khi bắt được).
- **Đồ rơi khi hạ boss:** đá Mega, Mảnh Tera (trên), bảng `transform.bossDrops` (Max Soup, Dynamax Candy); tỉ lệ × trait kiểu Pickup.
- **AI phe người chơi** (`suggestBattleCommands`, `battle/transformAi.ts`): lợi của mỗi loại = (điểm lệnh tốt nhất sau biến hình − trước) + phần tỉ lệ máu đỡ được trước đòn mạnh nhất của từng địch; chỉ biến khi lợi ≥ `config.ai.transformMinGain`; **Mega luôn dùng ngay**. Mỗi loại một quái, mỗi quái một loại, chọn lợi lớn nhất trước. AI chấm skill thật khi đang biến hình (chiêu Max, Tera Blast), lệnh vẫn ghi skill gốc.

## Trên quái, vật phẩm, save

- Trường mới của quái: `teraElementId`, `gmaxFactor`, `dynamaxLevel` (0–`dynamax.maxLevel`). Kiểm tra (`validateMonster`): hệ Tera hợp lệ, cấp trong khoảng, `gmaxFactor` chỉ khi loài mang được (`canHaveGmaxFactor`: chính nó có dạng gmax hoặc tiến hóa thành loài có; quái fuse giữ cờ cũ), `battleTransform` hợp lệ.
- Breeding: con random hệ Tera theo hệ của nó, `gmaxFactor = false`, `dynamaxLevel = 0`. Fuse: quái gốc giữ cả ba trường. Quái hoang thường: `gmaxFactor = false`, `dynamaxLevel = 0`.
- Vật phẩm: Max Soup (hiệu ứng `toggleGmaxFactor`: bật / tắt Gmax Factor của loài mang được, quái fuse không dùng được), Dynamax Candy (`dynamaxLevelUp { levels }`, tối đa `maxLevel`); dùng ngoài trận.
- `MonsterView`: `teraElementId`, `gmaxFactor`, `dynamaxLevel`, `megaFormIds` (dạng Mega dùng được với đá / skill hiện có, kể cả dạng tự biến).
- Save `version: 23` (luật migrate ở `state.md`).

## Ngoài phạm vi

- Dạng trong trận do ability / chiêu (`formKind: "battleOnly"`: Castform, Aegislash, Terapagos...): đã làm 2026-10-30, độc lập với biến hình (`battle-forms.md`).
- Z-Move (không phải biến hình, nhưng cùng vật phẩm chìa khóa / đạo quán, dùng chung được với Mega / Tera, không dùng khi Dynamax; xuyên Max Guard 25%): `z-moves.md`.
