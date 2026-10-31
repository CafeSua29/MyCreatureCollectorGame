# Phối hợp đội: cộng hưởng, trận pháp, hợp kích kỹ

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chiều sâu khi chọn đội và khi đánh 2v2: đội cùng race / hệ nhận buff tự động (**cộng hưởng**, kiểu auto-chess), người chơi chọn một **trận pháp** cho cả đội, và hai quái hợp nhau trên sân tung **hợp kích kỹ** (như Pledge của Pokémon). Bước 5g, save v31. Mọi số là **số tạm** do Claude cân bằng.

Code: `registries/teamBonuses.ts` (điều kiện quái `MONSTER_CONDITIONS`, yêu cầu trận pháp `FORMATION_REQUIREMENTS`, `activeTeamBonuses`, `teamBonusHooks`, `synergyTierOf`), nguồn hook `synergy` / `formation` trong `registries/traitHooks.ts`, `roster/formationActions.ts` (`learnFormation`, `setFormation`, `partyTeamBonuses`), `battle/combos.ts` (hợp kích kỹ), `gameData/validateTeam.ts`, `game/validateTeamState.ts`. Dữ liệu: `src/data/synergies.json`, `formations.json`, `comboSkills.json`; tên ở `i18n/<ngôn ngữ>/synergies.json`, `formations.json` (hợp kích kỹ ở `skills.json`).

## Điều kiện trên một quái (`MONSTER_CONDITIONS`)

- Dạng `{ type, ...tham số }`, dùng chung cho `match` của cộng hưởng / trận pháp và hai bên `pair` của hợp kích kỹ: `element { elementId }`, `race { raceId }`, `species { speciesIds }`. Xét trên hệ / race hiện tại của quái (trong trận có thể bị đổi bởi trait Siralim).
- Thêm loại = thêm handler (`fields`, `validateParams`, `parse`, `matches`); trường lạ hoặc loại lạ báo lỗi dữ liệu (`checkTypedParams`).
- Chưa có: `bloodline { groupId }` (chờ `docs/roadmap/bloodline.md`, ghi ở đó).

## Cộng hưởng (tự động)

- `synergies.json`: `{ id, match, tiers: [{ count, hooks }] }`. `count` nguyên ≥ 1, tăng dần, tối đa `partySize`; `hooks` là hook trait thường.
- **Đếm trên cả đội** (tối đa 6, kể cả quái gục và dự bị) lúc vào trận; **bậc cao nhất đủ điều kiện thắng** (không cộng dồn bậc). Áp cho **quái khớp đang trên sân**.
- Dữ liệu hiện có (sinh bởi script, số tạm): mỗi race `race<Id>` 2 / 4 / 6 quái → +5 / +12 / +20% chỉ số chính của race (`statBias` cao nhất không gồm hp; hòa thì mọi chỉ số hòa); mỗi hệ `element<Id>` 2 / 4 / 6 quái → +5 / +10 / +15% sát thương skill hệ đó (`elementDamageDealt`).

## Trận pháp (chọn)

- `formations.json`: `{ id, requires: [{ type, ... }], match?, hooks }`. Đội đủ **mọi** `requires` thì quái trên sân khớp `match` (bỏ trống = mọi quái) nhận `hooks`. Đội không đủ thì trận pháp **không có tác dụng** (không chặn trận).
- `FORMATION_REQUIREMENTS` (đếm trên cả đội, kể cả quái gục): `distinctElements { count }` (số hệ khác nhau, quái hai hệ đếm cả hai), `sameRace { count }` (một race bất kỳ có ≥ count quái), `race { raceId, count }`, `elements { elementIds }` (đội có đủ mọi hệ).
- Hiện có: Tứ Tượng Trận `fourSymbols` (≥ 4 hệ: +8% mọi chỉ số khác hp), Long Môn Trận `dragonGate` (≥ 3 quái race rồng: quái rồng +15% công / đặc công), Lục Hợp Trận `sixHarmonies` (≥ 6 hệ: +12% thủ / thủ đặc biệt), Ngũ Hành Trận `fiveElements` (đủ lửa / nước / cỏ / thép / đất: miễn bị hạ bậc mọi chỉ số, `statLowerImmunity`).
- **Trận đồ** (category `formationScroll { price, formationId }`, gộp chồng, không dùng trực tiếp): action `learnFormation { itemId }` (ngoài trận, ở đâu cũng được) tiêu 1 trận đồ, thêm trận pháp vào `formations.known`. Mỗi trận pháp đúng một trận đồ (kiểm tra dữ liệu). Trận đồ bán được, áp giá thị trường động. Lỗi: `inBattle`, `unknownItem`, `notFormationScroll`, `formationAlreadyKnown`, `notEnoughItem`.
- `setFormation { formationId | null }` (ngoài trận, miễn phí): chọn trận pháp đã học hoặc bỏ. Lỗi: `inBattle`, `formationNotKnown`, `formationUnchanged`.
- Nguồn trận đồ: boss tầng của map rơi (`config.formations.floorBossDrops`, mỗi trận đồ 3%; trong `EXTRA_DROP_TABLES`). Lần đầu thắng quán chủ đạo quán (một món trong `config.trainers.gym.firstClearItemIds`, `trainers.md`). Chợ đen (`events.md`); thưởng thắng hết thú triều (một trận đồ ngẫu nhiên).

## Áp trong trận

- Lúc mở trận, `BattleState.teamBonuses.player` = `activeTeamBonuses(data, party, formations.active)`: cộng hưởng ghi `{ kind: 'synergy', id, count }` (bậc tra lại theo dữ liệu), trận pháp ghi `{ kind: 'formation', id }`. Đội không đổi trong trận nên không tính lại. Cùng danh sách còn có mục kỹ năng đồng hành `{ kind: 'partner', ... }` (bật / tắt theo quái đầu đội gục / hồi sinh, hệ số hook = sức mạnh; `partner-skills.md`). Phe địch rỗng với quái hoang / boss; trận ngự thú sư NPC: `activeTeamBonuses(data, đội NPC, trận pháp của lớp)` (`trainers.md`).
- `MonsterBattleContext.teamBonuses` = danh sách của phe; `forEachTraitHook` thêm hook của mục khớp quái (sau hook của chính quái, trước hào quang), hệ số 1, nguồn hook `synergy` / `formation` (log `traitTriggered` có `source`, `traitId` = id cộng hưởng / trận pháp). % chỉ số vào nguồn `synergy` / `formation` của `STAT_PERCENT_SOURCES` (cộng chung một tổng). Không chịu `traitPotency`.
- **Chỉ trong trận:** hook không được đổi hp và không dùng loại gắn với chính quái / ngoài trận (`aura`, `catchRateModifier`, `fuseChanceBonus`), cùng luật với hook trong hào quang (`checkBattleOnlyHooks`). Ngoài trận chỉ số không đổi; UI màn đội lấy danh sách đang có bằng `partyTeamBonuses(data, state)`.
- Chặn hạ bậc do trait (`statLowerBlockingTrait`) xét cả bối cảnh trận nên hook từ cộng hưởng / trận pháp / hào quang cũng chặn được.

## Hợp kích kỹ

- `comboSkills.json`: mỗi mục là một **skill** (mọi trường và luật kiểm tra của skill thường, trừ không là chiêu Max / Tera Blast, không có `synergy` / `hold`: `skill-synergy-hold.md`) cộng `pair: [điều kiện A, điều kiện B]`. `createGameData` tách: phần skill vào `GameData.skills` (tra được bằng id ở mọi nơi; id trùng skill thường báo lỗi), cặp điều kiện vào `GameData.comboSkills`. Không nằm trong learnset (kiểm tra dữ liệu), quái không giữ được như skill riêng (`validateMonster`), không vào pool skill ngẫu nhiên của trait (spell toàn cục, skill tạm).
- **Điều kiện dùng** (`comboBlocker`): phe có ngự thú sư (`noTamer`; quái hoang / boss không dùng được), hai quái thỏa hai bên `pair` theo thứ tự bất kỳ (`pairMismatch`), phe người chơi: thân mật mỗi quái ≥ `config.combo.minAffinity` (150; `affinityTooLow`; ngự thú sư NPC bỏ qua). Quái lớn (`monster-size.md`) chỉ một lệnh, không có đồng đội nên không hợp kích.
- **Lệnh** `{ slot, kind: 'combo', comboId, target? }`: cả hai ô trên sân phải ra lệnh này, cùng `comboId` và `target` (thiếu, hoặc hai ô là cùng một thực thể Song thú hợp thể: `comboUnavailable { reason: 'noPartner' }`, `battle-merge.md`); `comboId` lạ / ô mục tiêu sai: `malformedAction`. Kiểm tra trước khi đổi state (`validateComboCommands`). **Tốn lượt cả hai.**
- **Thứ tự:** priority = priority của skill hợp kích (`skillPriority`); hai lệnh xếp thứ tự như skill thường. Quái tới lượt trước (nhanh hơn) chỉ **sẵn sàng** (log `comboReady`); quái tới lượt sau (chậm hơn) tung chiêu cùng đồng đội (log `combo { monsterId, partnerId }` rồi `useSkill`). Quái đã sẵn sàng ghi theo bản nháp (WeakMap, không vào state).
- **Hủy** (log `comboFailed`): quái nào mất lượt (trait, trạng thái); đồng đội đã sẵn sàng mà quái sau không còn tới lượt (gục, rời sân) thì hủy lúc hết pha hành động (`failUnfinishedCombos`); cặp điều kiện không còn thỏa lúc tung (hệ bị đổi giữa lượt).
- **Sát thương:** công thức chung với **công / đặc công = trung bình của hai quái** (chỉ số trong trận, gồm bậc trận và bối cảnh của từng quái), **STAB lớn hơn của hai quái**; mọi bước trait / trạng thái / môi trường / chí mạng / accuracy theo quái chậm hơn (quái tung). Không đổi theo biến hình (không thành chiêu Max), không khóa skill kiểu Choice Band. Độ thuần thục (`skill-mastery.md`) không áp.
- **AI** (`chooseCombo` trong `battle/ai.ts`): phe có đúng 2 quái trên sân và có hợp kích dùng được: chấm mỗi hợp kích như một skill của quái chậm hơn có đồng đội (cách nhắm tốt nhất), rồi tung theo trọng số giữa "đánh riêng" (tổng điểm lựa chọn tốt nhất của hai quái) và từng hợp kích. Không có hợp kích điểm > 0 thì không tốn RNG. Hành động thêm của trait không chọn hợp kích (`allowCombos: false`).
- Hiện có (số tạm): Hỏa Lâm Liệu Nguyên `comboWildfire` (lửa + cỏ; lửa, special 150, đặt Biển lửa `seaOfFire` lên phe địch: 4 lượt, mất 12,5% max HP cuối lượt, hệ lửa miễn), Thủy Hỏa Vân Yên `comboSteamCloud` (nước + lửa; nước 150, sương mù), Thanh Mộc Xuân Vũ `comboSpringRain` (cỏ + nước; cỏ 150, mưa), Lôi Phong Kích `comboThunderGale` (điện + bay; điện 140 cả địch, −1 tốc độ), Song Long Xuất Hải `comboTwinDragons` (rồng + rồng; rồng physical 160), Thánh Quang Phổ Chiếu `comboHolyRadiance` (ánh sáng + tiên; ánh sáng 130 cả địch, Safeguard phe ta).
- Chưa có: UI tự điền lệnh cho quái còn lại (bước UI), hợp kích theo huyết mạch (chờ `bloodline.md`).

## State và save

- `GameState.formations: { known: string[], active: string | null }` (`known` không lặp, id tồn tại; `active` null hoặc thuộc `known`; `validateFormationState`). `BattleState.teamBonuses: Record<BattleSide, TeamBonus[]>` (id tồn tại, `count` tới bậc đầu, không lặp; phe địch rỗng trừ trận ngự thú sư NPC (`activeTeamBonuses` của đội NPC, không có kỹ năng đồng hành, `trainers.md`); `checkTeamBonuses`).
- Migrate v30 → v31: `formations` rỗng; trận đang dở `teamBonuses` rỗng hai phe.
