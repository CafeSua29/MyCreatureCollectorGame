# Sức chứa kho quái và túi trang bị

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Kho quái và túi trang bị có giới hạn, mở rộng không giới hạn bằng tiền và theo cảnh giới ngự thú sư. Làm ngày 2026-10-31 (save v77).

Code: `registries/capacity.ts` (điểm duy nhất: `capacityOf`, `bagUsed`, `bagFreeSlots`, `hasBagRoom`, `assertBagRoom`, `hasRosterRoom`, `hasStorageRoom`, `canReceiveMonster`, `equipmentOverflow`, `assertOverflowConfirmed`, `returnEquipmentWithinCapacity`, `capacityExpandCost`, `capacityView`), action `roster/capacityActions.ts` (`expandCapacity`, `newCapacityState`), type `model/capacity.ts`, kiểm tra dữ liệu `gameData/validateCapacity.ts`, kiểm tra save `game/validateCapacityState.ts`.

## Sức chứa

- Hai loại (`CAPACITY_KINDS`): **kho quái** (`storage`, không tính đội) và **túi trang bị** (`bag`: món trang bị trong túi + hồn phách `inventory.souls`; không tính món đang lắp). Khí linh trong kho sau này tính chung túi (`artifact-spirits.md`). **Item gộp chồng** (thuốc, bóng, đá, đồ cầm tiêu hao, tinh thể...) **không giới hạn**.
- `capacityOf` = `base` + `perExpansion` × số lần đã mở rộng + `realmBonus` × số mốc cảnh giới đã đạt (`countMilestonesReached` với `tamer.realmMilestones` 2, 5, 10 rồi gấp đôi mãi, như ô đồ cầm). Cảnh giới không bao giờ giảm nên sức chứa không giảm. Số ở `balance.json` khóa `capacity` (số tạm của roadmap):

  | Loại    | Ban đầu | Mỗi lần mở rộng | Giá lần thứ k | Mỗi mốc cảnh giới (không gian ngự thú) |
  | ------- | ------- | --------------- | ------------- | -------------------------------------- |
  | storage | 200     | +50             | 1.000 × k²    | +50                                    |
  | bag     | 100     | +50             | 1.500 × k²    | +25                                    |

- **Mở rộng** (`expandCapacity { kind }`, NPC kho đồ ở thị trấn, ngoài trận): giá `costBase × k²` (`capacityExpandCost`, `Decimal`, k = số lần đã mở + 1, không nhân tầng như roadmap), +`perExpansion`. Lỗi: `inBattle`, `notInTown`, `malformedAction` (loại lạ), `notEnoughMoney`.
- `capacityView(data, state)`: `{ storage, bag }` mỗi loại `{ used, capacity, nextCost }` cho UI.

## Kho quái đầy

"Đầy" = không còn chỗ cho quái mới: đội không đủ ô (kể cả quái lớn 2 ô) **và** kho đã đủ sức chứa (`hasRosterRoom`, tính cả quái đã bắt / Thị Uy trong trận chưa vào đội / kho `battle.captured`).

- **Ném bóng** (`validateItemCommand`): báo lỗi `rosterFull { capacity }` ngay lúc gửi lệnh, không mất bóng. Hai bóng cùng lượt mà bóng trước đã lấp chỗ cuối: bóng sau không ném, không mất bóng, log `rosterFull { monsterId }` (`throwBall`).
- **Thu phục** (`recruit.md`): `recruitChance` = 0 (không xin theo / quy phục, không tốn RNG); `acceptRecruit` khi hết chỗ báo `rosterFull`. **Thị Uy** báo `rosterFull` lúc gửi lệnh như ném bóng; lúc chạy mà hết chỗ (đã kiểm tra lúc gửi lệnh nên gần như không xảy ra) thì không có tác dụng, log `rosterFull`.
- **Khu bảo tồn** (`safari-zone.md`): `enterSafari` báo `rosterFull` (không mất phí) khi không còn chỗ cho quái nào (`canReceiveMonster`: kho chưa đầy hoặc đội còn ô); đang trong khu mà hết chỗ thì `throwSafariBall` báo `rosterFull` (vẫn ném mồi / đá, bỏ đi, rời khu được).
- **Trứng** tới lúc nở mà hết chỗ: **vẫn là trứng**, bộ đếm dừng ở 0 (`battlesLeft` 0 hợp lệ trong save), log `eggWaiting { eggId }`, nở ở trận thắng sau khi có chỗ. Breed, event, thám hiểm cho trứng vẫn được (trứng không tính vào kho).
- **Event cho quái** (Quái Bị Thương đi theo...): không nhận được, log kết quả event `monsterRefused { speciesId }` (`events.md`).
- **Cất vào kho** (`moveToStorage`): kho đầy báo `rosterFull`; đổi chỗ đội ↔ kho (`swapWithStorage`) vẫn được.
- Hiểm địa: bắt quái như trận thường (`zones.md`).
- Không chặn: quái vào đội từ kho, quái nở từ trứng truyền thừa khi đội trống (`refillEmptyParty`), quái đi thám hiểm về (vẫn ở kho).

## Túi trang bị đầy

- **Đồ rơi** (quái hoang, boss, trận NPC, rương bí cảnh / tháp; `gainEquipment`): món **bị mất**, log trận `equipmentLost { itemId, rarity }`. Event tặng trang bị: mất, log kết quả event `equipmentLost`.
- **Không mua** món trang bị ở cửa hàng / cửa hàng tạm, **không đúc** (`castEquipment`), **không tháo** món trang bị từ quái về túi: `bagFull { capacity }` (state giữ nguyên, không mất tiền). Đồ cầm gộp chồng vẫn tháo được. Luyện hồn khí đổi một hồn phách lấy một món nên không bị chặn.
- **Mất quái theo ý người chơi** (thả `releaseMonster`, quái phụ fuse, fuse có thể mất quái gốc khi không có Bùa Hộ Mệnh, quái phụ hiến tế, cấy ghép mà lần thất bại kế tiếp sẽ mất quái): món đang lắp không đủ chỗ về túi thì báo `bagOverflow { lost }` (số món sẽ mất, `equipmentOverflow`, xét trường hợp xấu nhất); gửi lại action với **`discardOverflow: true`** (xác nhận) thì món trang bị về túi tới khi đầy, phần còn lại **mất** (`returnEquipmentWithinCapacity`); đồ gộp chồng luôn về túi.
- **Mất quái ngoài ý người chơi** (tọa hóa, chết trong độ kiếp, chết thật trong trận, quái bỏ trốn khi khế ước thất bại, tự tháo vì hết điều kiện lắp): đồ vẫn về túi và **được vượt sức chứa**; hồn phách luôn vào túi (kể cả cấy ghép). Túi đang vượt thì mọi đường thêm món ở trên vẫn bị chặn tới khi bán / phân giải bớt.

## Save, dữ liệu

- `GameState.capacity = { storage, bag }`: số lần đã mở rộng (nguyên ≥ 0). Kiểm tra save (`validateCapacityState`): đủ hai loại, không trường lạ; **kho quái không vượt sức chứa** (mọi đường vào kho đều chặn). Túi không kiểm tra vượt (được vượt ở trên).
- Migrate v76 → v77: không mất gì; số lần mở rộng sẵn đủ chứa những gì đang có (`max(0, ⌈(đang dùng − sức chứa chưa mở rộng) / perExpansion⌉)`, tức sức chứa làm tròn lên bội số 50).
- Kiểm tra dữ liệu (`config.capacity`): đủ hai loại, `base` / `realmBonus` nguyên ≥ 0, `perExpansion` nguyên ≥ 1, `costBase` ≥ 0.
- Lệch roadmap: túi được vượt khi đồ tự về lúc quái chết ngoài ý người chơi (roadmap chỉ nói về thả / fuse); hồn phách không bao giờ mất (là nguyên liệu trứng truyền thừa / hồn khí). Vào khu bảo tồn xét "còn chỗ cho ít nhất một quái" vì chưa biết quái sẽ gặp lớn hay nhỏ.
- Mô phỏng: "người chơi" mở rộng khi còn ≤ 5 chỗ và giá ≤ 20% tiền (`expandCapacityWhenFull`, `simulation-features.md` mục "Kinh tế"); số đo ở `balance-systems.md` mục "Sức chứa".
