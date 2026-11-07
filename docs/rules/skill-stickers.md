# Sticker skill

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Làm 2026-11-07 (save v112), lấy từ **Sticker của Cassette Beasts** (chủ project yêu cầu 2026-11-03; bảng thuộc tính theo trang `Sticker_Attributes` của `wiki.cassettebeasts.com`). Game ghép vào **sách kỹ năng** (`skill-books.md`): Bí kíp là sticker thường. Số là **số tạm** (`balance.json` khóa `stickers`, `stickerAttributes.json`; giá trị ở `balance-content.md`).

Code: type `model/stickers.ts`; registry hiệu ứng `inventory/stickerEffects.ts` (`STICKER_EFFECTS`); điểm duy nhất tung / nhận / hiệu lực `registries/stickers.ts`; dán / bóc `monster/skillStickers.ts`, trả sticker khi quên skill `monster/stickerSlots.ts`; trong trận `battle/stickers.ts` (cùng các điểm gắn ở `damage.ts`, `environment.ts`, `executeSkill.ts`, `turn.ts`, `walls.ts`, `ai.ts`); kiểm tra dữ liệu `gameData/validateStickers.ts`, kiểm tra save `inventory/validateStickers.ts`.

## Độ hiếm và nguồn

- **Mọi nguồn nhận sách đi qua `receiveBooks`** (hoặc `receiveByRef` cho item gộp chồng): boss rơi, sách theo map (rương bí cảnh, thú triều), boss thế giới, lấy sách từ kho động phủ (`collectDwelling`), mua ở cửa hàng / cửa hàng tạm / chợ đen, thắng đấu giá, Tàng Bảo Các tông môn. Không tung: Chân kinh (dùng mãi, không phải sticker), sách theo phi thăng từ kho động phủ về túi và đồ ký gửi đấu giá trả lại (không phải nhận mới).
- **Mỗi cuốn Bí kíp tung độ hiếm** (`rollStickerRarity`): một lần tung, mỗi độ hiếm đúng **tỉ lệ tuyệt đối** của nó như gốc (`rarityChances`: 1,25% rare, 5% uncommon), còn lại là Bí kíp thường gộp chồng như cũ. Tổng tỉ lệ 0 không tốn RNG; kiểm tra dữ liệu bắt tổng ≤ 100. Quái Bootleg dùng Bí kíp thường thì tung theo `bootleg.stickerRarityChances` (`bootleg.md`).
- Uncommon / rare thành **món riêng** `StickerInstance { id: "s<số>", skillId, rarity, rolls }` trong `inventory.stickers`, id chung bộ đếm `nextItemId` với trang bị, **tính vào sức chứa túi trang bị** (`capacity.md`). **Túi đầy thì cuốn đó là Bí kíp thường** (không mất sách); số cực lớn không lặp từng cuốn: tỉ lệ 0 hoặc túi đầy thì phần còn lại vào chồng một lần.
- Log trận `skillBookDropped` thêm `sticker { id, rarity }` khi cuốn rơi là sticker.

## Thuộc tính

- **Số thuộc tính như gốc**: uncommon 1 (3/5) hoặc 2 (2/5) thuộc tính uncommon; rare 1 (1/3) hoặc 2 (2/3) thuộc tính uncommon + 1 thuộc tính rare (`uncommonCounts`, `rareCounts`); tối đa `maxAttributes` (3). Không trùng thuộc tính; mỗi thuộc tính tung theo `weight` trong các thuộc tính cùng độ hiếm **hợp với skill**; hết thuộc tính hợp thì dừng.
- **Hợp với skill** (`isAttributeCompatible`): `elementIds` (skill thuộc một trong các hệ) và mọi điều kiện `requires`: `damaging` (power > 0), `hasAccuracy` (không luôn trúng), `singleTarget` (nhắm một quái), `hasSecondary` (có hiệu ứng phụ theo tỉ lệ), `inflictsStatus` (hiệu ứng skill gây trạng thái, cờ `inflictsStatus` của handler), `costsStamina` (giá thể lực khác 0).
- **Định nghĩa** (`stickerAttributes.json`): `{ id, rarity, weight, effect: { type, params }, valueParam?, range?, perEmptySlot?, choices?, elementIds?, requires? }`. Giá trị tung nguyên trong `range`, ghi vào `effect.params` theo `valueParam` như dòng trang bị (`lineParams`, danh sách đường dẫn = ghi nhiều chỗ). `perEmptySlot`: giá trị × số ô skill còn trống của quái (`emptySkillSlots`, gốc "per empty slot"). `choices`: tung đều một trạng thái lúc tạo sticker, thay chỗ giữ `$choice`; `$skill` trong params thay bằng skill mang sticker.
- **Loại hiệu ứng** (registry `STICKER_EFFECTS`, thêm cơ chế = thêm mục): cộng số `{ value }` vào hiệu lực của **đúng skill mang sticker** (`StickerSkillBonus`): `power`, `accuracy`, `critChance`, `critDamage`, `effectChance`, `splash`, `priorityChance`, `extraHits`, `statusTurns`, `heal`, `repeatChance`, `multitargetChance`, `wallChance`; `staminaRefund { chance, amount | all }`; `attackStat { stat }`; cờ `typeAdvantageCrit`, `ignoresWalls`, `destroysWalls`, `compatibility`, `extraSlot`; `trait { hooks }`: hook trait lên quái (nguồn hook `sticker`, nhóm % `equipment`, như trait cấp 1; kiểm tra bằng `TRAIT_HOOKS` lúc khởi động).

### Bảng quy đổi (gốc → game)

| Gốc (uncommon)                           | Game                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Alternative Attack (6 chỉ số)            | `attackStat`: chỉ số đó làm công nếu cao hơn công thường (Melee → `attack`, Ranged → `spAttack`) |
| Extra Hit                                | `extraHits` +1 đòn đủ sát thương (log `hitCount`; AI tính số đòn kỳ vọng)                   |
| Heal (1–10%)                             | `heal`: hồi % max HP sau khi dùng skill                                                     |
| Stat Damage / per slot                   | `power` %: nhân power (cùng chỗ với thuần thục, `rawDamage`)                                |
| Stat Exp / per slot                      | `exp`: % EXP quái nhận khi thắng, chỉ khi skill mang sticker được dùng / kích hoạt trong trận (bộ đếm EXP theo chiêu) |
| Stat Accuracy / per slot                 | `accuracy` %: nhân tỉ lệ trúng cuối (gốc nhân)                                              |
| Stat Crit Rate / per slot                | `critChance`: cộng thẳng điểm % chí mạng (gốc cộng)                                         |
| Stat Crit Damage / per slot              | `critDamage`: cộng % vào hệ số chí mạng (gốc cộng)                                          |
| Stat Effect Chance / per slot            | `effectChance` %: nhân tỉ lệ hiệu ứng phụ (như Serene Grace, thuần thục; AI cùng tính)      |
| Stat Splash Damage / per slot            | `splash` %: đồng đội trên sân của mục tiêu phe địch mất % sát thương đòn (log `splashDamage`) |
| Stat Priority Chance / per slot          | `priorityChance` %: tung lúc xếp thứ tự, trúng thì skill +1 priority lượt đó                |
| Status Duration Boost                    | `statusTurns` +1 lượt cho trạng thái skill gây (cộng như thế mạnh của skill)               |
| Type Advantage Crit                      | `typeAdvantageCrit`: đòn khắc hệ (> 1) luôn chí mạng                                        |

| Gốc (rare)                               | Game                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| AP Refund 1 / All                        | `staminaRefund`: hoàn 10 thể lực (1 AP) / toàn bộ giá skill, chỉ khi skill dùng bằng lệnh có trả giá |
| Use Smack / Spit after Attack            | `trait` trigger `attack` / `cast` + điều kiện `skill` = skill mang sticker: dùng Smack / Spit |
| Use at Battle Start                      | `trait` trigger `entry` `oncePerBattle`: tự dùng skill mang sticker                         |
| Use at Round Ending                      | `trait` trigger `turnEnd`: tự dùng skill mang sticker                                       |
| Use after Attacks                        | `trait` trigger `attack` / `cast` phạm vi `allies`: đồng đội dùng skill thì tự dùng skill mang sticker |
| Use when hit                             | `trait` trigger `attacked`: tự dùng skill mang sticker                                      |
| Buff User                                | `trait` trigger khi dùng skill: tự nhận trạng thái tung lúc tạo sticker (`choices`)        |
| Buff User Contact Damage                 | `trait` trigger khi dùng skill: tự nhận trạng thái phản đòn theo hệ skill (độc `tipped`, điện `staticCharged`, thủy tinh `shattered`; mỗi hệ một thuộc tính có `elementIds`) |
| Buff User Wall                           | `wallChance`: dựng tường thường theo hệ skill lên chính mình, không mất máu như gốc        |
| Compatibility                            | `compatibility`: dán được lên quái không tương thích                                        |
| Debuff Target                            | `trait` trigger khi dùng skill: mục tiêu đầu nhận trạng thái tung lúc tạo sticker          |
| Destroys / Ignores Walls                 | `destroysWalls` (gỡ mọi tường rồi trúng, như cờ skill) / `ignoresWalls` (đi xuyên tường)    |
| Extra Slots                              | `extraSlot`: +1 ô skill (`skillCapacity`), cả tổng không vượt `maxSkillSlots` (16 như gốc) |
| Multitarget                              | `multitargetChance`: skill nhắm một quái thành nhắm cả phe đó, đủ sát thương mỗi quái      |
| Shared                                   | `trait` trigger `entry` phạm vi `side`: đồng đội nhận skill tạm (`tempSkill`) tới hết trận  |
| Heal per empty slot                      | `heal` × ô trống                                                                            |
| Passive stat / per slot (8 chỉ số)       | `trait` `statModifier` (6 chỉ số), `accuracyModifier`, `evasion`                            |
| Use again                                | `repeatChance`: thêm một lần dùng (100% hiệu quả, như lặp của trait; log `stickerTriggered`) |
| Use random                               | `trait` trigger khi dùng skill: dùng thêm một skill ngẫu nhiên (`cast` `pool: global`)      |

- **Smack / Spit** (`smack`, `spit`): nhập theo gốc (không hệ, 30 power, 100% chính xác, 0 AP = 0 thể lực; Smack cận chiến vật lý, Spit tầm xa đặc biệt). Chỉ dùng qua thuộc tính sticker (không loài nào học; có sách theo luật chung).
- **Trạng thái của Buff User / Debuff Target** (`choices`, lấy trạng thái Cassette Beasts có sẵn, `element-reactions.md`): buff `potentiated`, `bulkedUp`, `agile`, `softSpeedUp`, `healingMist`, `energised`, `conducted`; debuff `extinguished`, `eroded`, `buried`, `chilled`, `disturbed`, `drained`, `grounded`, `poison`, `burn`, `confused`, `sleep`.
- **Không áp**: hợp kích kỹ (skill chung của hai quái), chiêu Max / Z-Move (skill khác skill gốc nên không có sticker). Skill dùng do trait / minion / sticker khác (cùng id) vẫn áp như gốc ("sticker áp mỗi khi chiêu được dùng").

### Diễn giải và lệch gốc

- **Bộ đếm EXP theo chiêu** (`BattleRecord.activatedSkills`): số lần mỗi skill được dùng / kích hoạt trong trận bằng mọi cách (lệnh, trait, sticker; không tính hợp kích kỹ). Thuộc tính Exp chỉ cộng % EXP khi skill mang nó có trong bộ đếm (`stickerExpPercent`, cộng vào cùng tổng % EXP với trait và linh dịch), như gốc "chỉ áp khi chiêu được dùng hoặc kích hoạt".
- Gốc không ghi rõ: "Use after Attacks" hiểu là khi **đồng đội** dùng skill; khoảng AP Refund All ghi "1–6%\*" mà giá trị hay gặp 20% nên dùng 1–60%.
- Contact Damage chỉ có cho hệ có trạng thái phản đòn trong game (độc, điện, thủy tinh); hệ khác chưa có trạng thái tương ứng (chờ trạng thái phản đòn theo hệ, xem `element-reactions.md`).

## Dán và bóc

- **`applySticker { monsterId, stickerId, replaceSkillId? }`** (ngoài trận, ở đâu cũng được, quái trong đội hoặc kho):
  - Quái **đã biết** skill: dán lên, sticker cũ trên skill đó về túi.
  - Chưa biết: phải tương thích như sách (`isSkillBookCompatible`), trừ sticker có `compatibility` (lỗi `stickerIncompatible`); còn ô thì học ngay (ô tính cả Extra Slots của chính sticker này), đủ ô thì phải có `replaceSkillId` (`mustForgetSkill`, `skillNotKnown`, còn ô mà vẫn gửi thì `skillSlotFree`); skill ghi vào `extraSkillIds` (học lại ở NPC), rời danh sách chờ học nếu đang chờ.
  - Lưu trên quái `Monster.skillStickers: Record<skillId, StickerInstance>`.
- **`peelSticker { monsterId, skillId }`**: sticker về túi, quái **vẫn giữ skill** (lỗi `noSticker`, túi đầy `bagFull`).
- **Quên skill** (học skill chờ / học lại ở NPC thay skill, dán sticker thay skill, kế thừa skill khi fuse): sticker trên skill đã quên về túi; túi đầy thì `bagFull` (trừ fuse: như đồ tự về túi). **Mất ô Extra Slots** (bóc, quên skill mang nó) mà quái còn nhiều skill hơn số ô thì `stickerSlotInUse` (fuse kiểm tra trước khi tung). Ô nhân hình (`human-form.md`) là ô cuối, sau ô Extra Slots.
- **Mất quái** (thả, quái phụ fuse / hiến tế, chết hẳn...): sticker về túi như trang bị (`returnEquipment`, `returnEquipmentWithinCapacity`; `equipmentOverflow` đếm cả sticker, cần `discardOverflow` khi túi không đủ chỗ).

## Tẩy luyện

- **`rerollSticker { stickerId, lockedIndexes? }`** ở Thợ rèn (thị trấn, ngoài trận; `equipment-forge.md`): sticker trong túi hoặc đang dán trên quái. Tung lại mọi thuộc tính **không khóa**, mỗi ô **giữ độ hiếm** của thuộc tính cũ (ô rare vẫn ra thuộc tính rare), hợp với skill, không trùng thuộc tính còn lại, giữ vị trí (`rerollStickerRolls`, như tẩy luyện dòng phụ trang bị); không còn thuộc tính hợp thì giữ cũ.
- Giá (`stickerRerollCost`): (1 + số ô khóa) × `stickers.reroll.stones[độ hiếm]` Tẩy luyện thạch + (1 + số ô khóa) × `moneyPerFloor[độ hiếm]` × `highestFloor` tiền (nguồn tiêu tiền; roadmap chỉ nói dùng lại luật tẩy luyện, game thêm phần tiền).
- Lỗi: `notInTown`, `inBattle`, `stickerNotFound`, khóa hết `nothingToReroll`, vị trí khóa sai / trùng `malformedAction`, `notEnoughItem`, `notEnoughMoney`; sticker đang dán mất Extra Slots mà quái còn đủ skill `stickerSlotInUse`.

## Save, dữ liệu

- Save v112: `inventory.stickers`, `Monster.skillStickers`. Kiểm tra save (`validateStickerInstance`, `validateSkillStickers`): id `s<số>`, skill có sách, độ hiếm, thuộc tính tồn tại / không trùng / giá trị nguyên trong khoảng / lựa chọn thuộc `choices`, khóa là skill quái đang biết và trùng `skillId` của sticker; id không trùng với trang bị, `nextItemId` lớn hơn mọi id. Migrate v111 → v112: túi rỗng, quái chưa dán.
- Kiểm tra dữ liệu (`checkStickerConfig`, `checkStickerAttributes`): tỉ lệ 0–100, số thuộc tính / trọng số hợp lệ, `maxSkillSlots` > `maxSkills`; thuộc tính: độ hiếm, trọng số ≥ 0, loại hiệu ứng, params ở hai đầu khoảng (và hook trait), `range` đi cùng `valueParam`, `perEmptySlot` cần `range`, `choices` là trạng thái, `elementIds` là hệ, `requires` hợp lệ, trường lạ.
- Mô phỏng: "người chơi" dán sticker trong túi lên quái đội mẫu đã biết skill mà chưa có sticker, không thì dạy như sách (đủ ô thay skill yếu nhất không mang sticker); tính chung cột `books` (`simulation.md` mục "Sách kỹ năng"). Chạy `--parts progression` 2026-11-07 hai lần (sau sticker: 439 giây, mọi đội 0–1 huy hiệu; sau Bootleg, tẩy luyện, tỉ lệ độ hiếm tuyệt đối, bộ đếm EXP theo chiêu: 276 giây, mọi đội 1 huy hiệu, sách / sticker dùng 11–54 mỗi đội, thua 3–32), không lỗi; chênh giữa hai lần trong mức dao động RNG của cỡ mẫu này. Chưa có số cùng kịch bản trước khi có sticker nên không kết luận lệch cân bằng, không chỉnh số.
- Bootleg (tỉ lệ thuộc tính cao hơn): `bootleg.md` mục "Sticker".
