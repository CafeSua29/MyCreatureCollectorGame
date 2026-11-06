# Luyện thể

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Theo Transform body của Portals of Phereon (chủ project yêu cầu 2026-11-05, chốt không gọi là "tiến hóa" vì game đã có tiến hóa loài). Mỗi bộ phận của quái lắp một **kiểu luyện thể**; đủ số bộ phận cùng nhãn thì có **thưởng bộ**.

Code: model `model/refinement.ts`; hook và thưởng bộ `registries/bodyRefinement.ts` (`refinementHooks`, `activeRefinementBonuses`, `refinementTagCounts`), `ownHooks` ở `registries/traitHooks.ts` gọi; action `progression/bodyRefinement.ts` (`refineBody`, `removeRefinement`, `refinementCost`, `availableRefinements`); kiểm tra `gameData/validateHatchery.ts`, `monster/validateMonster.ts`; dữ liệu `src/data/bodyRefinements.json` (tên ở i18n `bodyRefinements`), số ở `balance.json` khóa `bodyRefinement`, sinh bằng `phereon-import.mjs systems` (`phereon/systems.mjs`).

## Luật

- **Dữ liệu kiểu**: `{ id, partId, tags, hooks, costMultiplier }`. `partId` là bộ phận của `bodyParts.json` (`hit-locations.md`), `hooks` như trait cấp 1 (không đổi theo cấp), `tags` là nhãn của gốc (`aquatic`, `lava`, `shadow`, `flying`, `plant`).
- **Lắp** `refineBody { monsterId, refinementId }` (thị trấn, ngoài trận, quái không bận): quái phải có bộ phận đó (`monsterBodyPlan`). Giá = `costPerLevel` × level × `costMultiplier`. Bộ phận đang có kiểu khác thì thay (trả giá kiểu mới, không hoàn tiền kiểu cũ).
- **Gỡ** `removeRefinement { monsterId, partId }`: trả `removeCostPercent` % giá luyện của kiểu đó.
- **Thưởng bộ** `config.bodyRefinement.tagBonuses` `{ tag, count, hooks }`: mỗi nhãn lấy bậc có `count` cao nhất quái đạt, các bậc không cộng dồn (như cộng hưởng đội).
- **Chỉ số** qua hook `statModifier`: vào nhóm % `traits` (`HOOK_SOURCE_GROUPS`, nguồn hook `refinement`).
- **Save**: `Monster.refinements` (bộ phận → id kiểu). Fuse giữ của quái gốc (`...base`), breeding không truyền, quái hoang rỗng. Không lưu chỉ số cuối.
- **Lỗi**: `unknownRefinement`, `noSuchBodyPart`, `refinementAlreadyApplied`, `noRefinement`, `notInTown`, `inBattle`, `notEnoughMoney`, `monsterNotOwned`.

## Lệch gốc

- Gốc chỉ áp cho nhân vật chính dạng người, tốn thể lực, có cả bộ phận người lớn và bộ phận ngoại hình. Ở đây áp cho **mọi quái**, tốn **tiền** (số tạm), chỉ nhập bộ phận chiến đấu (tay, chân, cánh, đuôi, đầu, thân): 40 kiểu, skill của bộ phận quy thành hook (ví dụ Clawed: Claws + Bleed thành +8% công, 25% gây chảy máu). **Số của từng kiểu là số tạm**: chưa đọc được `StatChanges` của từng bộ phận trong file game.
- **Ngưỡng thưởng bộ đúng gốc** (`EvolutionController`), phần thưởng gốc là skill đi trên lưới ô nên quy thành hook: Flying ≥ 2 thành bay (`airborne`); Aquatic ≥ 2 WaterPath (+15% tốc), ≥ 4 CreateWater (thêm: vào sân đặt nước sâu); Lava ≥ 2 CreateLava (vào sân đặt địa hình núi lửa), ≥ 3 LavaPath (thêm +15% tốc); Shadow ≥ 2 ShadowStep (+10% né), ≥ 4 Conceal (thêm: vào sân Hình bóng 1 lượt).
- Không nhập: Plant ≥ 5 (OxygenProvider, chỉ có tác dụng ngoài trận), Lava ≥ 6 (MeteorStorm: game chỉ có 4 bộ phận mang nhãn Lava), Lava ≥ 2 + Aquatic ≥ 2 (CreateStone: chưa có thưởng theo cặp nhãn).

## Mô phỏng

Đội mẫu `duoRefined` (như `duo`, mỗi quái lắp kiểu lên mọi bộ phận có; `refinements` của `MemberSpec`). Kết quả ở `simulation-features.md` mục "Luyện thể".

## Chưa có

- Màn hình luyện thể (chờ UI, `ui-overhaul.md`).
