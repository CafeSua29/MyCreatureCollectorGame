# Thoái hóa (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **De-digivolve của Digimon Story Cyber Sleuth**: quay về dạng trước để đi sang nhánh tiến hóa khác. Ở bản gốc cả tiến hóa lẫn thoái hóa đều về level 1 và giữ một phần chỉ số (ABI). Game này **tiến hóa giữ level** (`evolution-skills.md`) nên thoái hóa cũng giữ level: phần "giữ một phần chỉ số" là giữ level, gen, trait, cấy ghép, hiến tế..., chỉ đổi chỉ số gốc theo loài. Không cho thêm % chỉ số mỗi lần thoái hóa (luân hồi `rebirth.md` đã là cách về level 1 lấy % vĩnh viễn; thêm ở đây thành vòng lặp tiến / thoái lấy chỉ số miễn phí). Số là **số tạm** (`balance.json` khóa `devolution`).

## Luật

- Action `devolve { monsterId, speciesId }` ở **Phòng Thí Nghiệm** (`implant.md`), ngoài trận, quái ở đội hoặc kho, không đang làm việc, không khóa (`monsterLocked`).
- `speciesId` phải là dạng trước **trực tiếp** (`preEvolutionsOf`, `inventory/evolutionLine.ts`); không phải thì `notPreEvolution { monsterId, speciesId }`. Loài có nhiều dạng trước thì chọn một. Thoái hóa nhiều bậc = làm nhiều lần.
- Quái fuse không thoái hóa được (như không tiến hóa được; `fusedCannotEvolve`). Dạng dị biến về dạng trước như bình thường.
- **Giá**: `costPerLevel × level` tiền (Decimal). Thiếu: `notEnoughMoney`.
- **Khi thoái hóa** (dùng chung hàm đổi loài với tiến hóa, `changeSpecies`): đổi `speciesId`, `baseSpeciesId`, hệ (qua `speciesElementsFor`, giữ Bootleg, `docs/rules/bootleg.md`), race, giới tính (`genderAfterEvolution`), nhân hình như tiến hóa. **Giữ** level, EXP, gen, trait, skill (kể cả skill của dạng sau), shiny, boss, trang bị (tháo món không đủ điều kiện như khi đổi race), máu đã mất (kẹp theo max HP mới). Bỏ `pendingEvolutionIds` đang chờ.
- **Tiến hóa lại**: theo luật tiến hóa thường (tự sau trận thắng / đá). Để chọn được nhánh khác dù chỉ một nhánh đủ điều kiện, quái vừa thoái hóa có cờ `devolvedFromSpeciesId`: lần xét tiến hóa kế tiếp **luôn hỏi người chơi** (`pendingEvolutionIds`, kể cả khi chỉ một hướng đủ điều kiện), người chơi có thể bỏ qua (`skipEvolution`) để chờ đủ điều kiện nhánh khác. Cờ mất khi tiến hóa.
- Lý lịch: mốc `devolved { fromSpeciesId, toSpeciesId }` (`monster-history.md`). Dex không bỏ ghi đã sở hữu dạng sau.
- Quái quá thọ nguyên / giai đoạn tuổi không đổi (tuổi theo quái, không theo loài).

## Save

`devolvedFromSpeciesId?` trên quái; tăng version + migrate.

## Test

Về dạng trước đúng trường giữ / đổi, sai dạng trước, quái fuse, quái khóa / đang làm việc, thiếu tiền, Bootleg giữ hệ, lần xét tiến hóa sau luôn hỏi, bỏ qua tiến hóa, đổi race tháo trang bị, max HP nhỏ hơn máu đã mất.

## Tài liệu khi xong

Luật vào `docs/rules/evolution-skills.md` (mục mới "Thoái hóa"), `implant.md` (NPC), `monster-history.md`, `state.md` (mã lỗi), dòng Tiến độ; xóa file này.
