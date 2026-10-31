# Độ khó và chế độ thử thách (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Tùy chọn luật chơi **theo từng game**, lưu trong `GameState.options` như công tắc thọ nguyên / chết thật (`docs/rules/options.md`, `settings.md`). Làm gần cuối vì chạm nhiều hệ thống. Số là **số tạm** (`balance.json`, khóa `challenge`).

## Độ khó

- `options.difficulty`: **Dễ / Thường / Khó / Ác mộng**. Ảnh hưởng: level quái địch (−5 / 0 / +5 / +10), khoảng gen địch (×0,7 / ×1 / ×1,3 / ×1,8), tỉ lệ cuồng bạo của địch (ngưỡng / tỉ lệ hành động thêm của vai trò `wild` / `boss` ở `config.frenzy`, `docs/rules/frenzy.md`), phần thưởng (−20% / 0 / +20% / +50%, cộng).
- Đổi được **bất cứ lúc nào ngoài trận**; đổi xuống thấp hơn mức thấp nhất từng dùng thì ghi lại (`lowestDifficultyUsed`) để thành tựu / danh hiệu biết.

## Nuzlocke (chọn lúc tạo game, không tắt được)

- Quái **gục ở bất kỳ trận nào thì chết hẳn** sau trận: **đã làm** thành tùy chọn chết thật `permadeathEnabled` (`docs/rules/options.md`); Nuzlocke chỉ cần ép bật và khóa không cho tắt (`setGameOption` báo lỗi khi Nuzlocke), thêm "thua game" khi đội trống thay cho `refillEmptyParty`.
- Mỗi tầng chỉ bắt / thu phục được **con đầu tiên gặp** (theo `highestFloor` từng tầng; trùng loài đã có thì được gặp lại, tùy chọn "dupes clause" mặc định bật). Giới hạn này tính chung cho **bắt bằng bóng, thu phục, Thị Uy, câu cá** trên tầng; **khu bảo tồn** tính 1 con mỗi lần vào khu; quà / trứng / gacha / trao đổi NPC **không** bị giới hạn (như luật Nuzlocke phổ biến cho quà).
- Đội trống hoàn toàn (cả kho) = thua game (save đánh dấu kết thúc, chỉ còn xem).

## Hardcore (chọn lúc tạo game)

- Chỉ có tự lưu, **không lưu tay / không tải save cũ** của game đó (chặn chiêu load lại để thử lại fuse / cấy ghép).

## Randomizer (chọn lúc tạo game)

- `options.randomizerSeed`: ánh xạ tất định **loài → loài** trong cùng bậc sức mạnh (tổng chỉ số gốc gần nhau) cho quái hoang / boss / quà, và tùy chọn xáo learnset, trait quái hoang. **Không sửa dữ liệu JSON**: lớp ánh xạ áp lúc sinh quái (`rollMonster`).

## Chung

- Màn Game mới chọn các tùy chọn; `MonsterView` / màn ngự thú sư hiện chế độ đang chơi. Thành tựu riêng cho từng chế độ (`titles.md`).
- **Tăng version save** (`options` thêm trường; save cũ: Thường, tắt các chế độ).

## Test

Độ khó (số liệu, đổi giữa chừng, mức thấp nhất), Nuzlocke (chết sau trận, con đầu mỗi tầng, dupes, thua game), Hardcore chặn tải, Randomizer tất định và cùng bậc, migrate.

## Tài liệu khi xong

Luật vào `docs/rules/options.md` (đã có: công tắc thọ nguyên, chết thật), `saves.md`, `state.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
