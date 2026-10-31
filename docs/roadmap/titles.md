# Thành tựu và danh hiệu (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

**Thành tựu** ghi nhận cột mốc; một số thưởng **danh hiệu** cho ngự thú sư, đeo một danh hiệu để nhận buff nhỏ. Làm sau "Bộ sưu tập (Dex)" (dùng số liệu Dex). Số là **số tạm**.

## Thành tựu

- **Bộ đếm chung** `GameState.stats` (số trận thắng, boss hạ, quái bắt, shiny bắt, fuse, breed, đột phá, độ kiếp thành công, tọa hóa, đan luyện, huy hiệu, bậc đấu trường, tầng tháp...): một hàm `bumpStat` gọi ở mỗi chỗ phát sinh.
- File mới `src/data/achievements.json`: `{ id, condition, tiers: [{ value, rewards }] }`; điều kiện theo registry (`stat { key }`, `dexPercent`, `highestFloor`, `tamerRealm`, `ownSpecies { speciesIds }`, sở hữu quái tư chất từ bậc nào `aptitude { min }` dùng `hasAptitudeAtLeast` + `aptitudeFloor` của `aptitude.md`...). Bậc tăng dần (ví dụ bắt 10 / 100 / 1000 / 10000 quái), nhiều thành tựu **không trần** (bậc sinh theo công thức).
- Đạt bậc: nhận thưởng (tiền, vật phẩm, danh hiệu), log `achievementUnlocked`.

- **Phẩm cấp loài** (`docs/rules/species-rank.md`, đã làm; dùng `speciesRankOf` / `speciesRankIndex`): thêm loại điều kiện thành tựu theo phẩm cấp loài (ví dụ sở hữu N loài từ bậc S).

## Danh hiệu

- File mới `src/data/titles.json`: `{ id, effects }` (buff nhỏ toàn cục: EXP +5%, tiền +5%, tỉ lệ bắt +5%, thu phục +x% (cộng vào `recruitBonusPercent`, `battle/recruit.ts`; `docs/rules/recruit.md`), tỉ lệ shiny +x%, thành công luyện đan +3%...). Tên ở `i18n`.
- `GameState.titles: { owned: id[], active: id | null }`; đổi ngoài trận, miễn phí. Nguồn: thành tựu, đạo quán / giải đấu (`docs/rules/trainers.md`), tháp thí luyện, event.
- **Tăng version save** (`stats`, `titles`, `achievements` đã nhận).

## Test

Bộ đếm, từng loại điều kiện, bậc không trần, thưởng một lần, danh hiệu đeo / đổi và hiệu ứng, migrate.

## Tài liệu khi xong

Luật vào `docs/rules/` (file mới hoặc gộp với luật Dex), `state.md`, `data.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
