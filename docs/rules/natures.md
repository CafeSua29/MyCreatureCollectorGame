# Tính cách

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Mỗi quái có một **tính cách** (性格, như Nature của Pokémon): +`config.nature.percent`% một chỉ số, −`config.nature.percent`% một chỉ số khác. Làm ở bước 5i (2026-10-24).

Code: `registries/statPercentSources.ts` (nguồn % `nature`), `monster/nature.ts` (`rollNature`, `rollChildNature`), `world/encounter.ts` (`rollMonster`), `progression/breeding.ts` (`makeOffspring`), `registries/rewardTraitHooks.ts` (hook `inheritNature`), `registries/rewardTraitQueries.ts` (`passesNature`), `registries/itemEffects.ts` (`setNature`), `battle/outcome.ts` (`natureBossDrops`), `roster/roster.ts` (`NatureView`), `gameData/validateNatures.ts`, `game/migrate.ts` (`addNatures`).

## Dữ liệu

- `src/data/natures.json`: 25 tính cách như Pokémon, mỗi mục `{ id, up?, down? }`. `up` / `down` là chỉ số **khác hp**, phải **cùng có hoặc cùng bỏ trống** (bỏ trống = trung tính: `hardy`, `docile`, `serious`, `bashful`, `quirky`). Tên ở `i18n/<ngôn ngữ>/natures.json` (loại nội dung `natures`; tên tiếng Việt chủ project duyệt 2026-10-24).
- `config.nature`: `percent` (10, ≥ 0), `bossDrops` (Bạc Hà rơi từ boss).
- Kiểm tra dữ liệu: ít nhất một tính cách, trường lạ, `up` / `down` đủ cặp và khác hp; `config.nature` (trường lạ, `percent` ≥ 0, bảng rơi hợp lệ).

## Luật

- Trường `Monster.natureId` (bắt buộc, id trong `natures.json`; `validateMonster` báo lỗi id lạ). Save **v36**: migrate gán tính cách theo **băm của id quái** (`hashToUnit('nature', id)` trên danh sách id theo thứ tự trong JSON; tất định, không dùng RNG của save) cho mọi quái: đội, kho, trứng, quái hoang và quái đã bắt trong trận.
- **Chỉ số:** nguồn % `nature` của `STAT_PERCENT_SOURCES` (`stats-traits.md`): `up` +`percent`, `down` −`percent`, cộng vào cùng tổng % ở bước áp trait (không nhân với nguồn khác). Không bao giờ đổi HP (kiểm tra dữ liệu cấm `hp`). Trung tính không có mục nào.
- **Sinh ra:** mọi quái đi qua `rollMonster` (quái hoang, boss, quái khởi đầu, quái trong trứng boss / trứng truyền thừa) tung **đều** một tính cách (`rollNature`), **sau cùng** trong thứ tự tung để các giá trị random phía trước không đổi. Gacha (`gacha.md`) dùng `rollMonster` nên tự có.
- **Breeding** (`rollChildNature`, tung sau hệ Tera): bố / mẹ mang hook **`inheritNature`** (Bất Biến Thạch lắp ô chung) thì con nhận tính cách của bên đó; cả hai cùng mang thì tung 50/50; không ai mang thì tung đều. Hook xét qua `forEachTraitHook` nên trait / trang bị có hook này cũng truyền được.
- **Fuse:** quái gốc giữ tính cách. **Tiến hóa** (kể cả Mega / biến hình): giữ.
- **Bất Biến Thạch** (`everstone`, category `held`, hook `inheritNature {}`): **không tiêu hao** (`persistent: true`; hook không có `heldUse` nên tác dụng liên tục, đồ không bao giờ mất khỏi ô; mục "Trang bị và đồ cầm" ở `equipment.md`). Không có tác dụng trong trận. Hook chung nên trait / trang bị mang hook cũng truyền được (chủ project duyệt 2026-10-24; 2026-10-28 bỏ kiểu `heldUse: 'kept'` khi bỏ giới hạn hook đồ cầm).
- **Bạc Hà Tính Cách** (25 món `mint<Tính cách>`, `consumable`, `use: "field"`, `target: "ally"`, hiệu ứng `setNature { natureId }`): đặt `natureId` mới; quái đã đúng tính cách thì không có tác dụng (`itemNoEffect`, không mất bạc hà). Nguồn: cửa hàng (giá × tầng, trọng số thấp), mọi boss rơi (`config.nature.bossDrops`), chợ đen (`events.md`), nấu ở Đầu bếp (2 dược liệu theo chỉ số tăng + 1 Linh Mật, `cooking.md`).
- `MonsterView.nature` (`NatureView { id, up, down, percent }`; `up` / `down` null khi trung tính), `statPercents.nature`.

## Số tạm

Ở `balance-content.md` (mục "Tính cách").
