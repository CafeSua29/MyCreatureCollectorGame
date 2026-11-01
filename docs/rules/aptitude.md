# Phẩm cấp tư chất

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Nhãn **tư chất** (资质) cho biết gen của quái tốt cỡ nào **so với mặt bằng hiện tại** của người chơi, như truyện ngự thú chấm phẩm cấp. **Không lưu** trong save, tính khi cần, **không đổi chỉ số**. Bước 6.5j.

## Luật

- **Hàm duy nhất** `aptitudeOf(data, monster, floor)` (`registries/aptitude.ts`): tỉ lệ (`Decimal`) = tổng gen của quái ÷ **tổng gen tối đa của quái hoang ở tầng mốc** (`wildGeneMaxTotal`: mỗi chỉ số `floor(geneMax × floorGeneMultiplier)`, cùng công thức khoảng gen theo tầng ở "Tầng và biome" của `world-items.md`). Trả về tỉ lệ và bậc.
- **Tầng mốc** `aptitudeFloor(state)` = `bestFloorReached(state)` = `highestFloor` (tầng cao nhất từng đạt; dùng chung với mức bất ổn tối đa, `instability.md`). Khi làm phi thăng (`ascension.md`) đổi `bestFloorReached` sang `bestFloor` để **không đổi bậc sau phi thăng**; nơi khác không phải sửa.
- **Bậc** (`src/data/aptitudeTiers.json`, theo thứ tự tăng dần, như `affinityTiers.json`; tên ở i18n `aptitudeTiers`): bậc cao nhất có `from` ≤ tỉ lệ (ngưỡng thuộc bậc trên). Hiện có: **Phàm** `mortal` < 0,3; **Lương** `good` 0,3–0,6; **Ưu** `superior` 0,6–0,9; **Tinh** `refined` 0,9–1,2; **Thiên** `heavenly` 1,2–2; **Thần** `divine` ≥ 2 (chỉ đạt qua breeding / thiên tài địa bảo / đột biến). Thứ hạng bậc: `aptitudeTierRank` (thứ tự trong file); đạt từ bậc nào: `hasAptitudeAtLeast`.
- Chỉ xét **gen** (fuse không đổi gen nên không đổi tư chất; `fusingBonusStats` không tính).
- Vì so với tầng cao nhất từng đạt, quái cũ **tụt bậc** khi người chơi lên tầng cao: đúng ý "tư chất so với thời đại", báo hiệu nên breed / thay quái.
- **Dùng ở:**
  - `MonsterView.aptitude` (`{ ratio, tierId }`), lọc `minAptitudeTierId` (từ bậc đó trở lên), sắp xếp `aptitude` (theo tỉ lệ) ở `roster.md`. `buildMonsterView` lấy tầng mốc từ `scene.aptitudeFloor`.
  - Bậc hồn khí theo tư chất lúc chết (`soulRelic.rarityByAptitude`, `soul-relics.md`; đổi bộ bậc tư chất thì sửa bảng này theo).
  - Điều kiện tiến hóa `aptitude { min: <id bậc> }` (`evolution-skills.md`); hoàn cảnh xét tiến hóa `EvolutionScene` có `aptitudeFloor` (`evolutionScene` lấy từ state).
  - Bên ngoài core: `aptitudeOf` / `aptitudeFloor` xuất lại qua `roster/`, `floorGeneMultiplier` qua `world/floors.ts`.
- Chưa có: điều kiện tư chất cho thành tựu (chờ `titles.md`), hiển thị tư chất đối thủ NPC (chờ UI; `trainers.md`).

## Dữ liệu

- `aptitudeTiers.json`: danh sách `{ id, from }`, trường lạ báo lỗi, id không trùng. Có ít nhất một bậc, bậc đầu `from` = 0 (quái nào cũng có bậc), `from` là số tăng dần ngặt (`checkAptitudeTiers`).
- Điều kiện tiến hóa `aptitude`: `min` phải là id bậc, không được là bậc thấp nhất (luôn đủ).

## Số (số tạm theo roadmap) và mô phỏng

- Ngưỡng 0,3 / 0,6 / 0,9 / 1,2 / 2 như trên.
- **Script mô phỏng** (`lineage.csv` thêm cột `aptitude` / `aptitudeRatio`, tầng mốc = tầng của kịch bản; kịch bản mặc định 2026-10-24): quái hoang gen giữa khoảng là **Lương** (0,53); quái hoang gen tối đa là Tinh (1,0); breed (5 con mỗi đời, bố quái hoang) lên **Ưu** sau 1 đời, **Tinh** sau 4 đời, **Thiên** sau 10 đời, 20 đời được 1,58 (chưa tới Thần). Đúng ý thiết kế (Thần hiếm, cần nhiều nguồn), giữ số.
