# Hồn tinh

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Pal Souls / Statue of Power của Palworld: dùng **Hồn tinh** nâng **từng chỉ số riêng** theo cấp, tăng %. Khác hiến tế (`sacrifice.md`: hy sinh quái, +% **mọi** chỉ số) và thiên tài địa bảo (`treasures.md`: tăng gen): hồn tinh chọn đúng chỉ số muốn đẩy, không mất quái. Đã làm ở bước 5l+.10. Số là **số tạm** (`balance.json`, khóa `soulLevels`; `balance-systems.md`).

Code: `monster/soulLevels.ts` (giá, điểm đã dùng, hoàn lại, view), `inventory/soulCrystals.ts` (điểm trong túi), `roster/soulLevelActions.ts` (action), nguồn % `soulLevel` ở `registries/statPercentSources.ts`, `gameData/validateSoulLevels.ts`, dữ liệu nhập bằng `scripts/data-import/soul-levels-import.mjs`.

## Luật

- **Trường trên quái** `soulLevels: { hp, attack, defense, spAttack, spDefense, speed }`: số nguyên ≥ 0, **không trần** (save v47, migrate 0 cho mọi quái kể cả trứng / quái hoang).
- **Chỉ số:** mỗi cấp +`percentPerLevel` (3%) đúng chỉ số đó (kể cả max HP), nguồn % **`soulLevel`** cộng vào tổng % ở bước áp trait (mục "Nguồn % chỉ số" ở `stats-traits.md`).
- **Hồn tinh** là category item **`soulCrystal`** (gộp chồng, không dùng trực tiếp, bán / vứt được, rơi được, giá thị trường động): trường `points` (nguyên ≥ 1). **Điểm dùng chung mọi chỉ số**; Hồn tinh nhỏ = 1 điểm, Hồn tinh lớn = 5 điểm. Kiểm tra dữ liệu: có hồn tinh thì phải có loại 1 điểm (để trả dư / hoàn lại chính xác).
- **Nâng cấp** `upgradeSoulLevel { monsterId, stat }` (NPC **Tượng Lực** ở thị trấn; ngoài trận; quái đội hoặc kho, không đang thám hiểm): cấp n → n + 1 tốn **n + 1 điểm** hồn tinh và **`costBase × (n + 1)²`** tiền (`Decimal`). Trừ điểm: dùng viên nhỏ trước (giữ viên to); còn thiếu phần lẻ thì đập một viên to hơn, trả dư bằng viên nhỏ. Lỗi: `notEnoughSoulCrystals { need, have }` (điểm), `notEnoughMoney`, `notInTown`, `inBattle`, `monsterBusy`, chỉ số lạ `malformedAction`.
- **Fuse:** quái gốc giữ cấp của mình. Mỗi quái bị tiêu hao (quái phụ; cả quái gốc khi thất bại không có Bùa Hộ Mệnh) **hoàn lại `fuseRefundPercent` (50%) số điểm đã dùng** (1 + 2 + … + cấp mỗi chỉ số, làm tròn xuống) vào túi, viên to trước. `previewFusion.soulCrystalRefund` = phần của quái phụ. Quái phụ hiến tế cũng hoàn như quái phụ fuse (`sacrifice.md`). Thả quái không hoàn (luật thả: không nhận gì).
- **Breeding:** con 0. **Tiến hóa:** giữ. Quái hoang / boss: 0.
- **Nguồn hồn tinh:** mọi quái bị hạ (`soulLevels.wildDrops`), boss thêm (`soulLevels.bossDrops`), rương bí cảnh (`trials.realm.chest.items`), thưởng mốc tháp (`trials.tower.milestoneRewards`), đồ mang về của một số chuyến thám hiểm (`expeditions.json`). Thú triều: mỗi đợt thắng (`events.beastTide.waveDrops`) và thưởng thắng hết (`events.md`). Phân giải hồn khí (`forge.salvageSoulPoints`, `equipment-forge.md`). Đấu boss thế giới sẽ thêm ở mục của nó (`world-boss.md`).
- **Không có công thức gộp 5 nhỏ → 1 lớn** (lệch roadmap cũ): điểm dùng chung và tự trả dư nên gộp không có tác dụng.
- `MonsterView.soulLevels`: theo từng chỉ số `{ level, percent, next: { points, money } }`; `statPercents.soulLevel` như mọi nguồn.

## Chưa có

- UI Tượng Lực (chờ UI, `ui-overhaul.md`).
