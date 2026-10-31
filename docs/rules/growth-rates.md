# Nhóm tăng trưởng EXP

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như 6 nhóm tăng trưởng (growth rate) của Pokémon: mỗi loài lên level nhanh / chậm khác nhau. Làm 2026-10-28 (chủ project chốt làm giống gốc). Code: `monster/growthRates.ts` (`expForLevel`, `levelFromExp`, `monsterGrowthRate`, `monsterExpForLevel`), kiểm tra `gameData/validateGrowthRate.ts`, dữ liệu Pokémon nhập bằng `scripts/data-import/pokemon-growth-import.mjs`.

## Luật

- **Trường loài** `growthRate`: `erratic` / `fast` / `mediumFast` / `mediumSlow` / `slow` / `fluctuating` (`GROWTH_RATES`); bỏ trống = `mediumFast` (level³, đường cong cũ của game). Sai giá trị thì kiểm tra dữ liệu báo lỗi.
- **Level 1–100: đúng công thức gốc** (Bulbapedia "Experience", thế hệ 5+), làm tròn xuống, không âm (Medium Slow level 1 ra âm thì là 0):
  - Erratic: n < 50: n³(100 − n)/50; 50–67: n³(150 − n)/100; 68–97: n³⌊(1911 − 10n)/3⌋/500; 98–100: n³(160 − n)/100.
  - Fast: 4n³/5. Medium Fast: n³. Medium Slow: 6n³/5 − 15n² + 100n − 140. Slow: 5n³/4.
  - Fluctuating: n < 15: n³(⌊(n + 1)/3⌋ + 24)/50; 15–35: n³(n + 14)/50; 36–100: n³(⌊n/2⌋ + 32)/50.
- **Sau level 100** (gốc không có, game không có trần level): EXP(n) = ⌊EXP(100) × n³ / 100³⌋, tức mỗi nhóm giữ tỉ lệ so với n³ ở level 100 (Erratic 0,6; Fast 0,8; Medium Fast 1; Medium Slow ≈ 1,06; Slow 1,25; Fluctuating 1,64). Vẫn là đa thức bậc 3 (quy tắc 7 ở `CLAUDE.md`) và liền mạch ở level 100. Lệch gốc: không kéo dài công thức bậc 4 của Erratic / Fluctuating (Erratic âm sau level 160, Fluctuating tăng nhanh hơn mọi nhóm khác khi level rất cao).
- **Quái dùng nhóm của loài gốc** (`baseSpeciesId`; quái fuse theo loài gốc của nó). Lên level (`gainExp`) theo nhóm đó; tiến hóa sang loài khác nhóm thì level không bao giờ giảm (`max(level hiện tại, level theo EXP)`).
- Quái mới sinh (quái hoang, trứng nở level 1) có EXP đúng mức tối thiểu của level theo nhóm loài; Kẹo Hiếm lên đúng mức tối thiểu của level đích theo nhóm; `MonsterView.expForNextLevel` theo nhóm.
- EXP nhận khi thắng (`expReward`) không đổi theo nhóm (như Pokémon: nhóm chỉ đổi lượng EXP cần).

## Dữ liệu

- Pokémon: số thật của PokeAPI (`pokemon_species.growth_rate_id`; 1.316 loài và dạng lúc nhập, dạng không khớp lấy theo loài gốc). Medium Fast không ghi (mặc định).
- Loài nguồn khác: chưa có nguồn tương đương nên để mặc định Medium Fast.
