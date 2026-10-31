# Quái khởi đầu

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Ứng viên khởi đầu **random theo seed** từ các ô trong `config.starter.slots` (chủ project chốt 2026-10-31: không fix cứng, chỉ dạng đầu chưa tiến hóa, tối thiểu một loài phản tổ được, một loài Mega / Gigantamax, một loài đặc biệt). Màn chọn ở `ui.md`.

## Luật

- **Loài làm khởi đầu được** (`isStarterEligible`, `registries/starterConditions.ts`, điểm duy nhất): loài thường **dạng đầu** (không có dạng trước), **có tiến hóa**, không phải dạng chỉ có trong trận (`BATTLE_FORM_KINDS`: Mega, gmax, battleOnly); dạng vùng miền / dạng khác vẫn được.
- **Ô** `{ conditions }`: loài hợp lệ thỏa **mọi** điều kiện (rỗng = mọi loài hợp lệ); `starterSlotPool(data, slot)` trả danh sách theo thứ tự dữ liệu.
- **Điều kiện** (registry `STARTER_CONDITIONS`, thêm loại = thêm vào `STARTER_CONDITION_KINDS` + một handler):
  - `lineHasForm { formKinds }`: chính nó hoặc dạng sau có dạng thuộc `formKinds` (`formsOf`).
  - `evolvesToRank { rankId }`: chính nó hoặc dạng sau có phẩm cấp loài ≥ `rankId` (`species-rank.md`).
  - `species { speciesIds }`: thuộc danh sách (mỗi id phải là loài làm khởi đầu được).
  - `bloodline`: thuộc ít nhất một nhóm huyết mạch (`hasBloodline`, `bloodline.md`).
- `rollStarters(data, seed)`: mỗi ô theo thứ tự random **đều** một loài trong danh sách của ô, **trừ loài đã ra ở ô trước** (ô hết loài thì bỏ, nên số ứng viên ≤ số ô); rồi gen / trait / shiny / tuổi / độ thuần huyết mạch như quái hoang (`rollMonster`); cuối cùng **xáo vị trí hiển thị** (chủ project chốt 2026-10-31: không có "ô 1 luôn là Mega"). Quái khởi đầu loài **mang được Gmax Factor** (`canHaveGmaxFactor`) thì **luôn có** `gmaxFactor` (không tốn RNG; để ô Mega / Gigantamax thật sự Gigantamax được khi có Dynamax Band). Không tặng đá Mega (vẫn lấy theo luật `transformation.md`).
- `createNewGame` random lại từ cùng seed; loài không nằm trong ứng viên → `notStarter`.

## Dữ liệu (`balance.json` → `config.starter`)

Thứ tự ô trong config chỉ quyết định ô nào được chọn loài trước (để không trùng), không phải vị trí trên màn chọn.

| Ô | Điều kiện | Ý nghĩa |
| --- | --- | --- |
| 1 | `lineHasForm ["mega", "gmax"]` | biến hình mạnh: chuỗi có Mega hoặc Gigantamax (~86 loài) |
| 2 | `bloodline` | **phản tổ được**: thuộc ít nhất một nhóm huyết mạch (`bloodline.md`) |
| 3 | `evolvesToRank "S"` | **tiềm long** (Claude chọn làm "loài đặc biệt"): dạng cuối phẩm cấp S trở lên, kiểu bộ ba bán thần Dratini / Larvitar / Bagon, rồng con D&D (~152 loài) |
| 4 | không điều kiện | tự do: mọi loài dạng đầu có tiến hóa (~954 loài) |

- Kiểm tra dữ liệu (`gameData/validateStarters.ts`): ít nhất một ô; `conditions` là danh sách; điều kiện có `kind` đã biết, không trường lạ, params đúng; **ô phải có ít nhất một loài** (chỉ dựng danh sách khi phần dữ liệu khác không lỗi); `level` nguyên ≥ 1, `money` ≥ 0, vật phẩm tồn tại và gộp chồng theo id, số lượng nguyên ≥ 1; trường lạ của `config.starter` báo lỗi.
- **Không có nhãn ô** trên thẻ (chủ project chốt 2026-10-31: vị trí và loại ô đều random để người chơi tự khám phá).
- Chưa có: mở khóa thêm loài qua các lần chơi (chờ `starter-unlocks.md`).
