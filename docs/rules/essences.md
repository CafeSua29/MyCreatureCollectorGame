# Tinh chất

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Theo Essence của Portals of Phereon (chủ project yêu cầu 2026-11-05): lợi ích lâu dài của cả save, chọn một trong vài tinh chất tung ngẫu nhiên.

Code: model `model/essences.ts`; logic `progression/essences.ts` (`rollEssenceOffer`, `grantEssenceOffer`, `chooseEssence`, `essenceGrowthPercents`, `applyEssenceGrowth`, `essenceFusionTraitChoices`, `essenceEggBonus`, `essenceBattleTraitIds`); kiểm tra `gameData/validateEssences.ts` (`ESSENCE_EFFECT_CHECKS`), `game/validatePhereonState.ts`; dữ liệu `src/data/essences.json` (tên ở i18n `essences`), số ở `balance.json` khóa `essences`, sinh bằng `phereon-import.mjs systems`.

## Luật

- **Nhận**: hạ boss canh giữ của một cổng thế giới (`zones.md` mục "Cổng thế giới") thì có một lựa chọn (`GameState.essences.offer`); đang có lựa chọn chờ thì giữ lựa chọn cũ; đã có hết tinh chất thì không có lựa chọn.
- **Tung** (`rollEssenceOffer`): `offerSize` (3) ô, mỗi ô chọn độ hiếm theo `rarityWeights` (common 60, rare 35, mythic 5; chỉ các độ hiếm còn tinh chất chưa có) rồi một tinh chất đều trong độ hiếm đó, không trùng trong lựa chọn, không gồm tinh chất đã có. Mỗi tinh chất chỉ có một lần.
- **Chọn** `chooseEssence { essenceId }`: phải có lựa chọn (`noEssenceOffer`) và tinh chất thuộc lựa chọn (`essenceNotOffered`).
- **Hiệu ứng** (union theo `kind`; thêm loại = thêm một mục vào `EssenceEffect`, `ESSENCE_EFFECT_KINDS`, `ESSENCE_EFFECT_CHECKS`):

| Loại                 | Trường                                                                 | Tác dụng                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `growth`             | `stats` (danh sách / `lowest`), `percent`, `raceIds?`, `raceGroupIds?` | Quái **vừa nở** (mọi trứng) hoặc **vừa fuse** khớp race / nhóm race: gen các chỉ số × (1 + %), làm tròn xuống, ít nhất +1; `lowest` = chỉ số gen thấp nhất |
| `battleTrait`        | `traitId`                                                              | Vào trận: mọi quái có thể ra sân của người chơi nhận trait tạm tới hết trận (`applyEssenceTraits` ở `battle/openBattle.ts`)                                |
| `fusionTraitChoices` | `extra`                                                                | Chọn giữ thêm trait khi fuse (`fusing.md`), cộng dồn                                                                                                       |
| `egg`                | `growth`, `stability`                                                  | Cộng sức lớn / độ ổn định của trứng trong phòng ấp (`hatchery.md`), cộng dồn                                                                               |

- **Save**: `GameState.essences = { owned, offer }` (game mới `{ owned: [], offer: null }`). Kiểm tra: id tồn tại, `owned` không lặp. Trait tạm của tinh chất dùng `kind: boss` như lợi thế boss (không tung ngẫu nhiên, không chiếm ô): id `essence<Tên>Trait`, tên có hậu tố "(Tinh chất)".

## Quy đổi từ gốc (36 tinh chất)

- **Spark** (+0,5 tăng trưởng một chỉ số cho một dòng loài) → `growth` +15% gen của chỉ số đó theo nhóm race (số tạm: tăng trưởng gốc trung bình 1,0, gen của game không trần). Dòng loài gốc là dạng người nên quy về nhóm race gần nhất. Spark cộng chỉ số dục vọng của gốc không nhập.
- **HarpyBlessing** (trứng nở +1 tốc độ) → `growth` tốc độ +15%; lệch gốc: áp cả quái vừa fuse như mọi `growth`.
- **Balance** → `growth` `lowest` +10%. **ArcaneFocus / PowerFocus / CapacityFocus** (+50% một nhóm tăng trưởng) → `growth` +50%; **lệch gốc: bỏ phần −50% của ArcaneFocus / PowerFocus** vì gen âm % không hợp với gen không trần, chỉnh lại nếu mô phỏng cho thấy quá mạnh.
- **FusionMastery** (+1), **FusionBlessing** (tối đa 10) → `fusionTraitChoices`. **Harpy_1** (+20% ổn định), **Insect_1** (+20% sức lớn), **BreedingBlessing** (+100 ổn định) → `egg`.
- Còn lại → `battleTrait`: Corrosion, DefensiveHealing, SpiritBond, Ingraining, Acid, EverFlame, Illusionary, Fear, ShadowBlessing, FocusStrength / Magic / Armor, PowerArmor, LavaShield, TypeMastery, Resistance, Wisdom, FungalMastery.

## Không nhập

- **Người lớn**: SuccubusSpark, LustFul, Wildness, Conversion, AwakenLust, Succubus_1 / 2...
- **Nhân vật / cốt truyện riêng**: Wife_*, Fae, Veila, XyleriasBlessing, HumanSupport, *_Threat (bất lợi theo phe của cốt truyện).
- **Hệ thống ngoài trận của gốc không có ở game**: thể lực trên bản đồ, tầm nhìn, tài nguyên ngày (gỗ, đá, thức ăn), hẹn hò, cưỡi.
- **Chờ hệ thống**: tinh chất về AP / mana / năng lượng chờ thể lực (`stamina.md`).

## Chưa có

- Tinh chất còn lại của gốc theo tăng dần (EggMastery, GiantSoul): chưa nhập, cần bộ đếm riêng.
- Màn hình chọn tinh chất (chờ UI, `ui-overhaul.md`).
