# Mở khóa quái khởi đầu (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Màn chọn quái khởi đầu (`ui.md`, hiện random theo ô `config.starter.slots`, `starters.md`) có thêm lựa chọn **mở khóa dần** qua các lần chơi. Đây là tiến trình **xuyên save** (meta), nên lưu **ngoài save game**. Làm sau "Thành tựu và danh hiệu".

## Lưu trữ

- File mới `saves/profile.json` (cạnh `saves/settings.json`, đọc / ghi ở main process qua IPC như cài đặt; hỏng thì coi như rỗng, không crash; copy USB vẫn mang theo). Nội dung: `unlockedStarterIds`, các mốc đã đạt. Core chỉ có hàm thuần: nhận state game + profile, trả danh sách mở khóa mới; ghi file là việc của main.

## Mở khóa

- Dữ liệu `config.starter.unlocks` (hoặc file mới `starterUnlocks.json`): `{ speciesId, condition }`, điều kiện theo registry: `dexCaught { count }` (Dex, ở bất kỳ save nào), `achievement { id, tier }`, `highestFloor { floor }`, `ascensions { count }`, `ownedSpecies { speciesId }` (từng sở hữu loài đó ở một save nào: mở chính loài đó làm khởi đầu, dạng đầu tiên của chuỗi).
- Mở khóa khi một action trong game đạt điều kiện; renderer ghi vào `profile.json`, hiện thông báo.
- **Màn chọn:** các ô random mặc định luôn có; loài đã mở thêm hiện theo nhóm (hệ / nguồn), có ô tìm kiếm. Quái khởi đầu theo luật cũ (level 5, gen / trait / shiny random theo seed); loài mở khóa từ `ownedSpecies` **không** mang theo gen của con cũ.
- Đề xuất mở khóa đầu: 3 bộ khởi đầu Pokémon mỗi thế hệ (theo `dexCaught`), rồng con D&D (`highestFloor 50`), một linh thú Sơn Hải Kinh (`ascensions 1`). Chủ project sửa danh sách trong JSON.
- Không đổi `GameState`.

- **Phẩm cấp loài** (`docs/rules/species-rank.md`, đã làm; dùng `speciesRankOf` / `speciesRankIndex`): điều kiện mở khóa có thể theo phẩm cấp loài (ví dụ loài khởi đầu bậc cao mở muộn hơn).

## Test

Từng điều kiện, profile hỏng / thiếu, mở khóa không trùng, màn chọn nhận loài đã mở, loài chưa mở bị từ chối ở `createNewGame` (`malformedAction`).

## Tài liệu khi xong

Luật vào `ui.md` (màn chọn quái khởi đầu), `saves.md` (`profile.json`), `data.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
