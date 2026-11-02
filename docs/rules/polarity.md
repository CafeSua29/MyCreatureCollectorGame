# Âm / Dương hóa

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Light / Dark Shift của Monster Sanctuary, đổi sang chất tu tiên: **mọi loài** có thể chuyển vĩnh viễn sang **Âm** hoặc **Dương**, tăng chỉ số theo hướng và nhận một **trait cực tính**. Làm ở bước 5v (2026-10-31). Số ở `balance.json` khóa `polarity` (số tạm, số hiện tại ở `balance-systems.md`).

Code: kiểu `POLES` / `Pole` / `MonsterPolarity` (`model/monster.ts`), `PolarityConfig` (`model/config.ts`); tra cứu hiệu ứng `registries/polarity.ts` (`polarityStatPercent`, `polarityTraitOf`, `polarityDamageMultiplier`); nhận / đổi / tung cực `monster/polarity.ts` (`POLARITY_CHANGES`, `rollPolarity`, `changePolarity`, `rollSpawnPolarity`, `childPolarity`, `validatePolarity`); hiệu ứng vật phẩm `setPolarity` (`registries/itemEffects.ts`); kiểm tra dữ liệu `gameData/validatePolarity.ts`.

## Trên quái

- `Monster.polarity`: `null` (không cực) hoặc `{ pole: 'yin' | 'yang', traitId }`. Save v74 (migrate: mọi quái `null`). Kiểm tra save: đúng hai trường, `pole` thuộc `POLES`, `traitId` là trait loại `polarity` (không kiểm có trong pool hiện tại, để đổi pool trong dữ liệu không làm hỏng save).
- `MonsterView.polarity`: `{ pole, traitId, statPercents }` (% chỉ số đang cộng theo cực) hoặc `null`.

## Hiệu ứng

- **% chỉ số theo cực** (nguồn % `polarity` trong `STAT_PERCENT_SOURCES`, cộng vào tổng % ở bước áp trait; `config.polarity.statPercents`):
  - **Dương:** +10% công, +10% đặc công, +5% tốc độ.
  - **Âm:** +10% thủ, +10% thủ đặc biệt, +5% HP (có trong chữ ký max HP).
- **Trait cực tính:** trait loại mới `polarity`, pool riêng theo cực ở `config.polarity.traitIds`, random đều khi nhận cực. **Không chiếm ô trait**, **luôn cấp 1**, không có nhóm loại trừ, **không có tinh thể** (không extract / inject / mua / bán), không lưu trong `monster.traits` (`TRAIT_KIND_RULES.polarity`: `usesSlot`, `hasCrystal`, `wildRollable`, `inTraitList` đều false). Tác dụng ở mọi pha hook như trait race (nguồn hook `polarity`, nhóm % `traits`, không ghi log kích hoạt).
  - Pool hiện có: Dương: Liệt Dương `blazingYang` (+15% sát thương hệ lửa / ánh sáng), Thuần Dương `pureYang` (miễn bỏng), Chí Dương `utmostYang` (+30% tỉ lệ chí mạng); Âm: U Minh `netherYin` (+15% sát thương hệ ma / bóng tối), Hàn Âm `frigidYin` (miễn đóng băng và ngủ), Thái Âm `greatYin` (hồi 3% max HP cuối lượt).
- **Âm dương tương khắc:** quái Âm đánh quái Dương (và ngược lại) sát thương × (1 + `opposeBonus` / 100) (10%) trong công thức sát thương (`polarityDamageMultiplier`, nhân cùng chỗ các hệ số khác của `damageFormula`); cùng cực hoặc một bên không cực thì không đổi.

## Nhận / đổi cực

- **Đá chuyển cực** (tiêu hao, dùng ngoài trận lên quái ta; hiệu ứng `setPolarity { change }`, có ngẫu nhiên nên đi `applyRandom`):
  - **Âm Thạch** `yinStone` / **Dương Thạch** `yangStone` (`change: yin / yang`): quái **chưa có cực** nhận cực, trait cực tính random.
  - **Hoán Cực Thạch** `poleSwapStone` (`swap`): đổi Âm ↔ Dương, trait cực tính random lại trong pool của cực mới.
  - **Quy Nguyên Thạch** `poleResetStone` (`clear`): về không cực, mất trait cực tính.
  - Không đổi được (Âm / Dương Thạch lên quái đã có cực, Hoán Cực / Quy Nguyên lên quái không cực): `itemNoEffect`, không mất đá, không tốn RNG.
- **Nguồn đá:** boss rơi (`config.polarity.bossDrops`, chỉ khi **tầng đang đánh ≥ `unlockFloor`**; nhân hệ số rơi như đồ khác), chợ đen (`events.md`), cửa hàng (`shop: true`, trọng số thấp 0,2–0,3, giá 3.000 × tầng), luyện đan (`recipes.json`: Âm Thạch 2 linh thạch bóng tối + ma + băng; Dương Thạch 2 lửa + ánh sáng + điện; Hoán Cực Thạch bóng tối + ánh sáng + 2 siêu linh; Quy Nguyên Thạch 4 linh thạch thường; cấp 10, 50%).
- **Quái hoang / boss có sẵn cực** (`rollSpawnPolarity`, tung sau cùng, sau tuổi): khi **tầng đang đánh ≥ `unlockFloor`** (dữ liệu: 1, tức mọi tầng; luật "mọi kết quả hợp lệ đều có cơ hội", 2026-11-02, trước đây 30; số đo ở `balance-systems.md`), quái hoang có `wildChance` (10%), boss / boss tầng `bossChance` (25%) đã có cực (Âm / Dương đều nhau, trait random). Dưới tầng mở khóa không tốn RNG. Bắt được thì giữ cực.
  - **Lệch roadmap:** roadmap ghi "từ `highestFloor ≥ unlockFloor`"; đổi thành tầng đang đánh (`FloorSite.floor`) để nội dung theo tầng như mọi thứ khác (quay về tầng thấp không gặp quái có cực) và đồ rơi cùng một luật.

## Breeding, trứng, fuse, tiến hóa

- **Breeding** (`childPolarity`, tung sau cùng trong `makeOffspring`): bố mẹ **cùng cực** thì con cùng cực đó (trait cực tính random lại); khác cực hoặc một bên không cực thì con không cực (không tốn RNG).
- **Trứng boss** theo cực của boss (trait random lại); trứng loài / thám hiểm / event không cực.
- **Fuse:** quái gốc giữ cực **và trait cực tính** của mình; cực của quái phụ mất.
- **Tiến hóa, thức tỉnh:** giữ.

## Kiểm tra dữ liệu

`config.polarity`: trường đã biết; `statPercents` / `traitIds` đúng một mục mỗi cực (cực lạ báo lỗi); `statPercents` là % theo chỉ số; `opposeBonus` ≥ 0; `unlockFloor` nguyên ≥ 1; `wildChance`, `bossChance` trong [0, 100]; mỗi pool không rỗng, trait tồn tại loại `polarity`, không lặp; `bossDrops` hợp lệ. Mỗi trait loại `polarity` phải nằm trong ít nhất một pool và không có `exclusiveGroup`. `setPolarity.change` phải thuộc `POLARITY_CHANGES`.
