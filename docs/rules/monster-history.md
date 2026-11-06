# Lý lịch quái

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Ghi nguồn gốc và cột mốc của mỗi quái (như trainer memo của Pokémon), để người chơi nhớ "con này từ đâu ra". **Chỉ hiển thị**, không ảnh hưởng chỉ số, không dùng RNG. Làm ở bước 5c2 (save v25). Code: `model/history.ts` (type), `monster/history.ts` (`startHistory`, `addMilestone`, `validateHistory`).

## Cấu trúc

- `Monster.history: MonsterHistory | null`. Quái của người chơi (đội, kho, trứng, quái vừa bắt trong `battle.captured`) **luôn có** lý lịch; quái hoang chưa bắt (`battle.enemies`) **luôn null** (kiểm tra save `validateGameState` báo lỗi cả hai chiều).
- `MonsterHistory = { origin, metDay, metFloor, metLevel, milestones }`. Chỉ lưu id, chữ do UI dịch.
- **Lúc gặp** (`metDay` ngày game `dayOf(time)`, `metFloor` tầng hoặc null = thị trấn, `metLevel`): quái bắt là lúc bắt; trứng là lúc **nhận trứng** (lúc nở ghi mốc `hatched`). Save cũ: cả ba null.
- **Nguồn gốc** (`origin`, union theo `kind`, bảng kiểm tra `ORIGIN_RULES`):

| `kind`          | Trường                                                                                                                | Gắn ở                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `starter`       |                                                                                                                       | `createNewGame` (thị trấn, ngày của `clock.startHour`)                   |
| `wild` / `boss` | `ballItemId` (bóng đã bắt)                                                                                            | `throwBall` (tầng của trận, level lúc bắt)                               |
| `egg`           | `fatherSpeciesId`, `motherSpeciesId` (`baseSpeciesId` của bố mẹ: bố mẹ đã fuse thì loài fuse chung không cho biết gì) | `breed` (thị trấn)                                                       |
| `bossEgg`       | `bossSpeciesId`                                                                                                       | `createBossEgg` (tầng của trận)                                          |
| `expeditionEgg` | `expeditionId`                                                                                                        | `createExpeditionEgg` (tầng cao nhất lúc đội về; `expeditions.md`)       |
| `legacy`        | `parentSpeciesId` (loài gốc của quái đã chết)                                                                         | `createLegacyEgg` (ấp hồn phách, `soul-relics.md`)                       |
| `recruit`       | `method` (`afterBattle` / `intimidate` / `bossSubmit`)                                                                | quái thu phục (`recruit.md`)                                             |
| `safari`        |                                                                                                                       | `throwSafariBall` bắt được (thị trấn: `metFloor` null; `safari-zone.md`) |
| `trade`         | `npcNameId` (tên NPC, chủ cũ)                                                                                         | `acceptTrade` (thị trấn: `metFloor` null; `trades.md`)                   |
| `gacha`         |                                                                                                                       | `pullGacha` (thị trấn: `metFloor` null; `gacha.md`)                      |
| `unknown`       |                                                                                                                       | chỉ có ở save cũ (migrate v25)                                           |

Nguồn gốc `trade { npcNameId }`: quái nhận qua trao đổi với NPC (`trades.md`). Nguồn gốc mới thì thêm nhánh vào `HistoryOrigin` và một dòng `ORIGIN_RULES`.

- **Cột mốc** (`milestones`, cũ trước mới): mỗi mốc `{ day, kind, ...trường riêng }` (union `Milestone`, bảng kiểm tra `MILESTONE_RULES`). Tối đa `config.history.maxMilestones` (50, `balance.json`), đầy thì bỏ mốc cũ nhất. Mỗi tính năng tự gọi `addMilestone(data, monster, milestone)` (quái chưa có lý lịch thì giữ nguyên).

| `kind`                        | Trường                                                                          | Ghi ở                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hatched`                     |                                                                                 | trứng nở: sau trận thắng (`applyWin`), trứng truyền thừa từ hồn phách nở ngay khi đội trống (`refillEmptyParty`); `hatchMonster` (`progression/eggs.ts`) |
| `evolved`                     | `fromSpeciesId`, `toSpeciesId`                                                  | `evolveMonster` (tự tiến hóa, chọn hướng, đá tiến hóa)                                                                                                   |
| `fused` / `fuseFailed`        | `subSpeciesId` (loài gốc của quái phụ)                                          | `fuse`: thành công / thất bại có Bùa Hộ Mệnh, ghi trên quái gốc                                                                                          |
| `sacrificed`                  | `count` (số quái phụ của lần đó)                                                | `sacrifice`: hiến tế (kể cả hàng loạt), ghi trên quái chính (`sacrifice.md`)                                                                             |
| `implanted` / `implantFailed` | `tierId` (bậc huyết thanh); `implantFailed` thêm `fails` (lần thất bại thứ mấy) | `implant`: cấy thành công / thất bại (`implant.md`); lần thất bại cuối có trong lý lịch của hồn phách, ngay trước `died { cause: 'implant' }`            |
| `floorBossDefeated`           | `floor`                                                                         | mở tầng (`unlockNextFloor`): mọi quái đã tham chiến trong đội, kể cả đã gục; mở tầng chỉ một lần nên là "lần đầu"                                        |
| `awakened`                    | `tier`                                                                          | độ kiếp thành công (`awakening.md`)                                                                                                                      |
| `tribulationFailed`           | `tier`, `failures`                                                              | độ kiếp thất bại (`awakening.md`)                                                                                                                        |
| `contracted`                  | `realm` (cảnh giới lúc khế ước)                                                 | `formContract` thành công (`tamer.md` mục "Khế ước")                                                                                                     |
| `humanFormed`                 |                                                                                 | hóa hình (`human-form.md`)                                                                                                                               |
| `reborn`                      | `count`                                                                         | luân hồi (`rebirth.md`): số lần sau khi luân hồi                                                                                                         |
| `mutatedEvolution`            | `fromSpeciesId`, `toSpeciesId`                                                  | tiến hóa dị biến (`evolveMonster`, `evolution-skills.md`)                                                                                                |
| `imprintPerfected`            |                                                                                 | dưỡng dục chốt đúng 100% (`advanceImprint` ở `monster/imprint.ts`, `imprinting.md`)                                                                      |
| `atavized`                    | `fromSpeciesId`, `toSpeciesId`                                                  | phản tổ (`bloodline.md`)                                                                                                                                 |
| `died`                        | `cause` (`DEATH_CAUSES`: `oldAge`, `tribulation`)                               | chết hẳn (`createSoul`, `soul-relics.md`): chỉ có trong lý lịch của hồn phách / hồn khí                                                                  |

Mốc "chờ" có sẵn trong type, nhưng save chứa nó bị kiểm tra chặn ("chưa hỗ trợ (chờ X)", `MilestoneRule.pendingRoadmap`). Làm xong tính năng: gọi `addMilestone` đúng chỗ, bỏ `pendingRoadmap` của mốc đó, chuyển dòng sang "Ghi ở".

## Theo quái

- Breed: con ghi loài bố mẹ (nguồn `egg`). Fuse: quái gốc giữ lý lịch của mình, thêm mốc; lý lịch quái phụ mất theo nó. Tiến hóa giữ lý lịch, thêm mốc. Chết hẳn: hồn phách chép lý lịch (thêm mốc `died`), luyện hồn khí thì chép sang `soul.history` của món (`soul-relics.md`).
- `MonsterView.history`: bản sao lý lịch đầy đủ (`roster.md`).
- Kiểm tra save: kind hợp lệ, đủ trường, không trường lạ, loài thường / bóng tồn tại, ngày nguyên ≥ 0, tầng / level / số nguyên ≥ 1, trường gặp cùng null hoặc cùng có giá trị, số mốc ≤ `maxMilestones`.
