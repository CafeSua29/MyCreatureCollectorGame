# Điểm nỗ lực

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như **EV** (Effort Values) của Pokémon: quái nhận **điểm nỗ lực** theo loài nó đánh bại, mỗi điểm tăng đúng chỉ số đó. Khác gen (`genes`, như IV nhưng không trần, đổi qua breeding / thiên tài địa bảo) và hồn tinh (`soul-levels.md`, người chơi tự chọn chỉ số, tốn điểm hồn tinh): điểm nỗ lực đến từ **việc đánh loài nào**, có trần như bản gốc. Làm ngày 2026-10-28 theo yêu cầu chủ project. Số là **số tạm** (`balance.json` khóa `effort`; `balance-systems.md`).

Code: `monster/effort.ts` (điểm loài, cộng / trừ có trần, điểm nhận sau trận, view), nguồn % `effort` ở `registries/statPercentSources.ts`, hook `effortGainBonus` / `effortGainModifier` ở `registries/rewardTraitHooks.ts` (tra cứu `traitEffortBonus` / `traitEffortMultiplier` ở `rewardTraitQueries.ts`), hiệu ứng vật phẩm `addEffort` / `resetEffort` ở `registries/itemEffects.ts`, cộng điểm ở `applyWin` (`battle/outcome.ts`), `gameData/validateEffort.ts`. Dữ liệu Pokémon nhập bằng `scripts/data-import/pokemon-effort-import.mjs`.

## Luật

- **Trường trên quái** `effortValues: { hp, attack, defense, spAttack, spDefense, speed }`: số nguyên ≥ 0 (save **v62**, migrate 0 cho mọi quái kể cả trứng, quái hoang, quái đang gặp ở khu bảo tồn).
- **Trần** (như Pokémon): mỗi chỉ số tối đa `maxPerStat` (252), tổng mọi chỉ số tối đa `maxTotal` (510). Trần chỉ áp **lúc cộng điểm** (`addEffortValues`: cộng theo thứ tự `hp`, `attack`, `defense`, `spAttack`, `spDefense`, `speed`, phần vượt bị bỏ; trừ không dưới 0). `validateMonster` chỉ kiểm tra số nguyên ≥ 0, không kiểm tra trần, để đổi trần trong config không làm hỏng save cũ.
- **Chỉ số:** mỗi điểm +`percentPerPoint` (0,1%) đúng chỉ số đó, **kể cả max HP**; nguồn % **`effort`** cộng vào tổng % ở bước áp trait (mục "Nguồn % chỉ số" ở `stats-traits.md`). 252 điểm = +25,2%, gần bằng tác dụng của 252 EV lên chỉ số level 100 của Pokémon. Dùng % (không cộng thẳng vào chỉ số gốc như Pokémon) để điểm nỗ lực giữ giá trị ở mọi tầng, vì gen và chỉ số tăng không trần.
- **Điểm loài** (`speciesEffortYield`): loài ghi `effortYield` (object chỉ số → điểm nguyên ≥ 1, như EV yield) thì dùng số đó; **Pokémon dùng số thật của PokeAPI** (1.316 loài và dạng). Loài không ghi thì suy từ chỉ số gốc: tổng điểm theo bậc tổng chỉ số gốc (`derivedYield`, bậc cao nhất có `minBaseStatTotal` ≤ tổng; hiện < 380: 1, 380–524: 2, ≥ 525: 3; mốc đặt theo phân bố EV yield thật của Pokémon), dồn vào chỉ số gốc cao nhất; nhiều chỉ số hòa cao nhất thì chia lần lượt theo thứ tự chỉ số. Quái fuse cho điểm của loài gốc (`baseSpeciesId`).
- **Nhận điểm** (`battleEffortGain`, gọi trong `applyWin`): thắng trận (mọi loại trận: quái hoang, boss, NPC, bí cảnh, thú triều...), mỗi quái ta **đã ra sân và còn sống** (cùng luật nhận EXP) nhận điểm của **mọi quái bị hạ và bị bắt** trong trận (như Pokémon từ thế hệ 6: bắt cũng cho EV). Với mỗi quái bị hạ / bị bắt: điểm loài + điểm thêm từ hook `effortGainBonus` của quái nhận; tổng nhân hệ số từ hook `effortGainModifier`, làm tròn xuống, rồi áp trần. Kẹo EXP, thám hiểm, hoạt động khác không cho điểm (như Pokémon).
- **Đồ cầm** (category `held`, `persistent: true`: hook liên tục, **không bao giờ tiêu hao**; mục "Trang bị và đồ cầm" ở `equipment.md`). Như Pokémon, mọi món dưới đây còn **giảm ½ tốc độ** khi cầm (`statModifier { percent: { speed: −50 } }`, nguồn % `equipment`):
  - `effortGainBonus { stat, amount }` (nguyên ≥ 1; không nhân hệ số cấp vì là số điểm cộng thẳng): 6 món **Power** (Quả Tạ / Vòng Tay / Đai / Kính / Băng Đầu / Vòng Chân Sức Mạnh: +8 điểm HP / công / thủ / đặc công / đặc thủ / tốc độ mỗi quái bị hạ, như thế hệ 7+).
  - `effortGainModifier { percent }` (khác 0; nhân hệ số cấp): **Đai Lực Sĩ** (Macho Brace, +100% = nhân đôi).
  - Trait / trang bị mang hai hook này cũng tác dụng (hook trait chung, `forEachTraitHook`).
- **Linh dịch** (như Pokérus): quái đang nhiễm nhận điểm ×2, nhân riêng sau hệ số hook (Đai Lực Sĩ + linh dịch = ×4; `spirit-virus.md`).
- **Vật phẩm** (tiêu hao, `use: "field"`, nhắm quái ta; không dùng nhiều cái một lần để không mất phần vượt trần):
  - `addEffort { stat, amount }` (nguyên khác 0): 6 **vitamin** (+10: Tăng Lực HP, Đạm Tố, Thiết Tố, Canxi Tố, Kẽm Tố, Đường Tố như HP Up / Protein / Iron / Calcium / Zinc / Carbos), 6 **lông vũ** (+1, Health / Muscle / Resist / Genius / Clever / Swift Feather), 6 **quả mọng giảm** (−10 điểm + `addAffinity` 2: Pomeg, Kelpsy, Qualot, Hondew, Grepa, Tamato Berry). Đã chạm trần (tăng) / 0 điểm (giảm) thì hiệu ứng đó không có tác dụng; quả mọng vẫn tăng thân mật nên vẫn dùng được (như Pokémon).
  - `resetEffort {}`: **Bánh Mochi Tẩy Tủy** (Fresh-Start Mochi): mọi điểm về 0; chưa có điểm thì không có tác dụng.
  - Mọi món bán ở cửa hàng (`shop`), giá thị trường động như vật phẩm khác.
- **Breeding:** con 0 điểm (như Pokémon). **Tiến hóa:** giữ. **Fuse:** quái gốc giữ điểm của mình, quái phụ mất theo nó (phần chỉ số của quái phụ vẫn vào `fusingBonusStats` theo luật fuse). Quái hoang, boss, NPC, trứng: 0.
- `MonsterView.effort`: `{ values, total, maxPerStat, maxTotal, yield }` (`yield` = điểm loài của quái cho khi bị hạ, như Pokédex); % theo chỉ số ở `statPercents.effort` như mọi nguồn.

## Dữ liệu

- `config.effort`: `maxPerStat`, `maxTotal` (nguyên ≥ 0), `percentPerPoint` (≥ 0), `derivedYield` (danh sách `{ minBaseStatTotal, points }` không rỗng: `points` nguyên ≥ 0, mốc ≥ 0 tăng dần ngặt, bậc đầu mốc 0); trường lạ báo lỗi.
- `effortYield` của loài: object không rỗng, chỉ số hợp lệ, điểm nguyên ≥ 1.
- Hook: `effortGainBonus` (`stat` là chỉ số, `amount` nguyên ≥ 1), `effortGainModifier` (`percent` khác 0).

## Chưa có

- Điểm nỗ lực thật cho loài ngoài Pokémon (Digimon World, Monster Rancher có hệ thống huấn luyện riêng, không phải EV): hiện suy từ chỉ số gốc; chưa có nguồn tương đương.
- UI hiển thị điểm nỗ lực (chờ UI, `ui-overhaul.md`).
