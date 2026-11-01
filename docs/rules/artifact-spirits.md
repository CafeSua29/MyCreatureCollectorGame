# Khí linh và Khí giới bí cảnh

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Gộp **Innocent + Item World của Disgaea** (sinh vật sống trong món đồ, mỗi con là một buff; thu phục thì mạnh gấp đôi; gộp / phối giống; vào thế giới bên trong món đồ để nâng cấp) và **khí linh (器灵) của truyện tu tiên** (linh hồn trong binh khí, có phẩm cấp, nuôi lớn, thức tỉnh; Dẫn Hồn Châu như Quỷ Cốc Bát Hoang). Chỉ áp cho **trang bị của quái**. Làm ở bước 7g (2026-11-01). Số là **số tạm** (`balance.json` khóa `artifactSpirits`; bảng số ở `balance-systems.md`).

Code: model `model/artifactSpirits.ts`; luật thuần `inventory/artifactSpirits.ts` (`spiritSlotCount`, `spiritGrade`, `isSpiritAwakened`, `spiritEffectValue`, `spiritHooks`, `rollSpirit`, `rollWildSpirits`, `breedSpiritPair`, `spiritMoveCost`), hook vào trang bị `registries/traitHooks.ts` (`equipmentHooks`); action Khí Linh Các `roster/spiritActions.ts`; Khí giới bí cảnh `battle/itemWorld.ts` (vào / đánh / rời), `world/itemWorld.ts` (`itemWorldPowerFloor`, `itemWorldBossTier`), việc sau trận `battle/trialOutcome.ts` (`TRIAL_KIND_RULES.itemWorld`); kiểm tra `gameData/validateArtifactSpirits.ts`, `inventory/validateEquipment.ts` (`validateArtifactSpirit`), `game/validateSpiritState.ts`, `game/validateTrialState.ts`; dữ liệu `src/data/artifactSpirits.json` (tên ở i18n `artifactSpirits`).

## Loại khí linh (`artifactSpirits.json`)

- `{ id, weight, hooks, awakenedHooks, softCap? }`: `hooks` / `awakenedHooks` là **hook trait có sẵn**, viết ở **value 1** (hệ số hook = value hiệu lực). Thêm loại = thêm dữ liệu.
- **10 loại**: Kiếm Linh (+1% công / value; thức tỉnh +0,2% chí mạng), Thuẫn Linh (thủ; miễn chí mạng), Phong Linh (tốc độ; 0,3% đi trước trong cùng mức priority), Thanh Linh (đặc công; +1% sát thương chí mạng), Tâm Linh (đặc thủ; miễn rối loạn), Huyết Linh (HP; +1% hồi máu nhận), Dược Linh (hồi 0,05% max HP cuối lượt, softCap 200; +0,5% hồi máu nhận), Kim Linh (+1% tiền thưởng; +0,5% tỉ lệ rơi đồ), Ngộ Linh (+1% EXP; +1% thân mật), Hộ Linh (−0,32% sát thương nhận, softCap 250; phản 0,05% max HP kẻ đánh cận chiến vật lý).
- **`softCap`** (lệch roadmap: thêm để không gò value): value hiệu lực giảm dần `v × cap / (v + cap)` (≈ v khi nhỏ, tiến tới cap khi v → ∞). Dùng cho hiệu ứng có trần tự nhiên (giảm sát thương, hồi máu): Hộ Linh tối đa −80% (chủ project chốt 2026-11-01: trần giảm sát thương 80%), không bao giờ thành miễn sát thương. Hiệu ứng chỉ số / tiền / EXP tuyến tính, không trần. Hiệu ứng tỉ lệ (chí mạng, đi trước) đã bị kẹp 100% ở handler.

## Khí linh trên món

- **Món trang bị** (`EquipmentInstance`) có trường tùy chọn `spirits?: ArtifactSpirit[]` (không có = chưa có khí linh; rỗng thì bỏ trường) và `depth?` (tầng Khí giới bí cảnh đã qua; không có = 0). Lệch roadmap: trường tùy chọn thay trường bắt buộc để không phải migrate mọi món ở mọi chỗ trong save.
- **Khí linh** `{ typeIds, value, subdued }`: một loại, hoặc **khí linh kép** hai loại khác nhau (phối linh; hiệu ứng của cả hai). `value` nguyên ≥ 1, không trần.
- **Số ô** (`spiritSlotCount`): theo bậc món common 1 / uncommon 2 / rare 3 / epic 4 / legendary 5 / unique 6, hồn khí `soulRelicSlots` 6, **+1 mỗi `levelsPerSlot` (100) cấp món** (không trần; cấp không giảm nên ô không giảm). Không kiểm tra số khí linh ≤ số ô trong save (dữ liệu có thể đổi giữa phiên bản).
- **Hiệu lực** (`spiritEffectValue`): `value`, **dã linh** (`subdued` false) chỉ `wildPotencyPercent` (50%) như Innocent chưa thu phục; softCap nếu có. Hook chạy qua `equipmentHooks` như dòng trang bị (nguồn `equipment`, id nguồn = món gốc; % chỉ số cộng vào cùng tổng % ở bước áp trait, `stats-traits.md`), **không nhân hệ số cấp món**. Magic Room tắt cả khí linh (tắt mọi món).
- **Phẩm cấp** (`spiritGrade`, theo value): Phàm (0) → Linh (10) → Bảo (25) → Tiên (60) → Thần (150), sau Thần mỗi `gradeStep` (150) value thêm một bậc "Thần + n" (không trần). Từ **Bảo** (`awakenGrade` 2) **thức tỉnh**: thêm `awakenedHooks` (cùng hệ số value).
- Dã linh / khí linh không hiện số trong log trận (UI tự đọc món).

## Nguồn

- **Đồ rơi** (quái hoang / boss, rương bí cảnh; `gainNewEquipment`): mang sẵn 0 / 1 / 2 **dã linh** theo trọng số `dropSpiritWeights` [60, 30, 10], không quá số ô; value đều trong `valueRanges[bậc món]` (common 1–3, uncommon 2–5, rare 3–8, epic 5–12, legendary 8–18, unique 10–25). **Cửa hàng, đúc trang bị, chợ đen không có** (như Disgaea). Món unique của boss rơi theo đường riêng nên không có dã linh.
- **Dẫn Hồn Châu** (`soulGuidingOrb`, material, giá 4.000): boss rơi `orbBossDrops` 10% (× hệ số rơi; bảng cuối của `EXTRA_DROP_TABLES`), chợ đen, thưởng Khí Thần. Action `summonSpirit` ở **Khí Linh Các**: tiêu một châu, một khí linh **đã thu phục** loại ngẫu nhiên (theo `weight`) vào kho; value theo bậc tung bằng `summon.rarityWeights` × hệ số bậc theo tầng cao nhất (`rollRarity`, như đồ rơi) ("value theo tầng" của roadmap).
- **Khí giới bí cảnh** (dưới).

## Kho khí linh

- `inventory.spirits` (lệch roadmap `GameState.spiritStorage`: đặt trong túi để `bagUsed` đếm chung một chỗ): khí linh **đã thu phục** chưa gắn vào món. Mỗi khí linh chiếm **1 chỗ túi trang bị** (`capacity.md`). Đầy: triệu / di dời về kho chặn bằng `bagFull`; phân giải làm túi vượt sức chứa (khí linh về nhiều hơn chỗ món giải phóng) cũng chặn.

## Khí Linh Các (thị trấn, ngoài trận)

Mọi action: `inBattle` / `notInTown`. Vị trí khí linh `SpiritLocation`: `{ kind: 'storage', index }` hoặc `{ kind: 'equipment', instanceId, index }` (món trong túi **hoặc đang lắp** trên quái đội / kho, như Thợ rèn; `roster/locateEquipment.ts`). Sai dạng: `malformedAction`; không có: `spiritNotFound { instanceId | null, index }`; dã linh: `spiritNotSubdued`.

- **Di dời** `moveSpirit { from, to }` (`to`: kho hoặc `{ kind: 'equipment', instanceId }`): khí linh **đã thu phục**, tốn `moveMoneyPerValue` (20) × value × tầng cao nhất tiền. Món đích đủ ô: `spiritSlotsFull { instanceId, slots }`; cùng nơi: `malformedAction`; về kho cần chỗ túi.
- **Gộp** `mergeSpirits { first, second }`: hai khí linh đã thu phục **cùng tập loại** (`spiritTypesDiffer`), value cộng dồn vào `first` (không trần), `second` mất. Miễn phí.
- **Nuôi dưỡng** `feedSpirit { target, food }`: khí linh đã thu phục ăn **yêu đan bất kỳ** (`{ kind: 'cores', count }`, nhóm `feed.groupId`, + `coreValue` 2 mỗi viên; `notEnoughGroupItem`) hoặc **một hồn phách** (`{ kind: 'soul', soulId }`, + `soulValue` theo bậc hồn khí của tư chất lúc chết: 2 / 4 / 8 / 15 / 25 / 40; `soulNotFound`). Lệch roadmap ("nguyên liệu material"): chỉ yêu đan để nuôi không rẻ như đá thường có hàng nghìn.
- **Phối linh** `breedSpirits { first, second }` (vị trí trong kho): hai khí linh **một loại, khác loại nhau** (`spiritNotBreedable`) vào **Linh trì** `breed.days` (7) ngày (`GameState.spiritPools: { first, second, readyDay }[]`, không giới hạn số cặp; khí linh trong Linh trì không tính chỗ túi). `collectSpiritPool { index }` từ ngày `readyDay` (`spiritPoolNotReady { index, readyDay }`, `spiritPoolNotFound`): nhận **khí linh kép** (`typeIds` cả hai, value = trung bình làm tròn xuống) + **hai khí linh gốc** về kho, cần 3 chỗ túi (`bagFull`).
- **Phân giải trang bị** (Thợ rèn, `equipment-forge.md`): khí linh đã thu phục về kho, dã linh mất.

## Khí giới bí cảnh (như Item World)

- **Vào** `enterItemWorld { instanceId }` (thị trấn, ngoài trận, còn quái đánh được, không dự giải, không trong phó bản khác): món **trong túi** (đang lắp: `equipmentEquipped`; không có: `equipmentNotFound`) **rời túi vào lượt đi** `GameState.trial = { kind: 'itemWorld', instance, cleared }` (không lắp / bán / phân giải được trong lúc đi). Dùng chung khung phó bản với bí cảnh (`GameState.trial` là union `TrialRun`, `trials.md`): đang đi thì không nghỉ, không rời thị trấn, không vào trận / phó bản khác (`trialInProgress`, `assertNoInstance`). Lưu game giữa hai trận được.
- **Đánh** `challengeItemWorld` (thị trấn): tầng `depth + 1` của món. Map đều trên mọi map (RNG của save); **tầng sức mạnh** = `rarityFloors[bậc]` (1 / 3 / 6 / 10 / 15 / 20) + ⌈`floorsPerDepth` (1) × tầng + `floorsPerLevel` (0,5) × (cấp − 1)⌉ (`itemWorldPowerFloor`; không theo tầng thế giới, món hiếm / cấp cao / đi sâu thì khó hơn; cường hóa cũng làm khó hơn như Item World). Trận thường: quái hoang của map (`generateEncounter`). **Boss** (`itemWorldBossTier`, bậc cuối trong `bosses` có `every` chia hết tầng): **Khí Tướng** mỗi 10 tầng, **Khí Vương** tầng chia hết 30 (× 1,5 bossMultiplier), **Khí Thần** tầng chia hết 100 (× 2); lặp mãi (tầng 200, 300… cũng là Khí Thần), mạnh dần theo tầng sức mạnh. Boss là boss tầng của map. **Không áp độ bất ổn**, không có luật bí cảnh (`battle.trial.rules` rỗng). Trận: `BattleState.trial = { kind: 'itemWorld', biomeId, rules: [], depth, bossTierId, spirit }`; không bắt, không chạy (`trialRestricted`). Phần thưởng mỗi trận như trận thường (tiền, EXP, đồ rơi); giờ như trận quái hoang / boss.
- **Dã linh** (`rollFloorSpirit`): mỗi tầng `spiritChance` (30%) gặp một **dã linh có sẵn** trên món (đều); món không có dã linh thì một **khí linh mới** (dã linh, value theo bậc món × (1 + `newSpiritDepthPercent` (1) × tầng %)) gắn ngay lên món nếu còn ô; hết ô thì không gặp. Một quái địch (đều) **mang dã linh** (`battle.trial.spirit = { carrierId, index }`); **thắng trận mà quái đó đã bị hạ** thì khí linh đó **được thu phục** (log `spiritSubdued`). Thua thì khí linh mới vẫn ở trên món (dã linh).
- **Thắng một tầng** (log `itemWorldFloorCleared { depth, level }`): món **+1 cấp** (cùng trường cấp với cường hóa, miễn phí thay cho tiền / đá) và **+1 tầng đã qua**, `floorRewards` (Kẹo EXP S ×1), cả đội kể cả quái đã gục hồi `healPercent` (50) % max HP như bí cảnh. Boss thêm `rewards` của bậc (Khí Tướng: Kẹo EXP M; Khí Vương: Kẹo EXP L + Phá Giới Phù; Khí Thần: Kẹo Hiếm ×2 + Dẫn Hồn Châu) và `bonusRolls` lần **thưởng Khí Tướng** (Tướng 1, Vương 2, Thần 3): `bonus.affixChance` (50) % **thêm một dòng phụ** mới (không trùng, theo trọng số trong khoảng của bậc; `addRandomAffix`, không trần số dòng tới khi hết loại dòng), còn lại **+`bonus.spiritValue` (5) value cho mọi khí linh** trên món; không có khí linh thì thử thêm dòng, không còn dòng để thêm thì + value (log `itemWorldBonus`).
- **Rời** `leaveItemWorld { useTalisman? }` (ngoài trận): miễn phí khi **chưa qua tầng nào trong lượt này** hoặc tầng đã qua chia hết `leaveEvery` (10); ở mốc thì không tốn phù dù có gửi `useTalisman`; còn lại phải dùng **Phá Giới Phù** (`realmBreakTalisman`, material, bán ở cửa hàng, chợ đen, thưởng Khí Vương; thiếu: `notEnoughItem`), không thì `itemWorldLeaveLocked { depth, leaveEvery }`. Món về túi (được vượt sức chứa như đồ tự về túi), giữ cấp, tầng đã qua, khí linh. **Vào lại** thì tiếp từ tầng chưa qua.
- **Thua**: ra ngoài (log `itemWorldFailed`), món về túi, **không mất món, cấp, tầng đã qua**, không mất tiền.
- Không trong Khí giới bí cảnh: `noItemWorld` (rời, đánh); `abandonTrial` chỉ cho bí cảnh (`noTrial`).

## Save

- v85 (`state-versions.md`): `inventory.spirits: []`, `spiritPools: []`, bí cảnh đang đi thêm `kind: 'realm'`. Kiểm tra: khí linh (1–2 loại tồn tại không trùng, value nguyên ≥ 1, `subdued` boolean, trường lạ), kho và Linh trì chỉ khí linh đã thu phục, cặp Linh trì một loại khác nhau, `readyDay` nguyên ≥ 0; `depth` nguyên ≥ 0; lượt đi `{ kind, instance, cleared }` (món kiểm tra như món trong túi, id không trùng mọi món khác của save); trận Khí giới bí cảnh: không luật, tầng = tầng kế tiếp của món khi trận chưa kết thúc, `spirit` null hoặc `{ carrierId, index }`.

## Cân bằng

- **Mục tiêu** (thay câu "không cách nào làm cách kia vô dụng" của roadmap bằng ngưỡng đo được): món mới lên miễn phí tới **tường ≈ (tầng của đội − `rarityFloors[bậc]`) / 1,5 cấp** (món mới: tầng sức mạnh tăng ~1,5 mỗi cấp), vượt tường chỉ bằng cường hóa (cường hóa cũng làm Khí giới bí cảnh của món khó hơn); trong tường, giờ lên cấp bằng Khí giới bí cảnh không quá ~5 lần nhanh hơn số giờ farm tiền để cường hóa cùng số cấp với món thường. Mô phỏng phần `itemWorld` (`simulation-features.md`), kết quả ở `balance-systems.md`.

## Chưa có

- Hiển thị khí linh, phẩm cấp, Khí Linh Các, Khí giới bí cảnh (chờ `ui-overhaul.md`); di dời / gộp hàng loạt (chờ `bulk-actions.md`); khí linh của pháp bảo ngự thú sư (chủ project đã bỏ pháp bảo).
