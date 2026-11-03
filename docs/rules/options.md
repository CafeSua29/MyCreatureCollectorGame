# Tùy chọn luật chơi theo từng game

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Công tắc luật chơi **theo từng game**, lưu trong save (`GameState.options`), không ở `saves/settings.json`. 2026-10-31.

Code: `model/time.ts` (`GAME_OPTION_FLAGS`, `GameOptions`), `progression/gameOptions.ts` (`setGameOption`, bảng `GAME_OPTION_RULES`, `defaultGameOptions`), `battle/permadeath.ts` (chết thật), `game/validateTimeState.ts` (kiểm tra).

## Chung

- Danh sách tùy chọn: hằng `GAME_OPTION_FLAGS` (hiện có `lifespanEnabled`, `permadeathEnabled`), mỗi tùy chọn là boolean. `options` còn có độ khó và chế độ thử thách (`difficulty`, `lowestDifficulty`, `nuzlocke`, `hardcore`, `randomizer`; luật ở `challenge-modes.md`, khóa ở `CHALLENGE_OPTION_KEYS`).
- **Game mới mặc định tắt hết** (chủ project chốt 2026-10-31); chọn bật lúc tạo game: `createNewGame({ lifespanEnabled, permadeathEnabled })`. `createGameState` (test / mô phỏng) cũng mặc định tắt.
- Đổi **bất cứ lúc nào ngoài trận**, ở đâu cũng được: action `setGameOption { option, enabled }`. Lỗi: `inBattle`; đúng như đang có `optionUnchanged { option, enabled }`; tùy chọn lạ / `enabled` không phải boolean `malformedAction`.
- Thêm tùy chọn mới: thêm vào `GAME_OPTION_FLAGS` và một mục `GAME_OPTION_RULES` (việc làm thêm trên state khi đổi; TypeScript báo thiếu), tăng version + migrate.
- Item có giá có thể ghi `requiresOption` (một tùy chọn) để chỉ vào cửa hàng / bảng rơi khi tùy chọn bật (`isItemOffered`, `world-items.md`).

## Thọ nguyên (`lifespanEnabled`)

Luật ở `lifespan.md` mục "Bật / tắt thọ nguyên". Đổi thì mọi quái đang sở hữu (cả trong trứng) đổi cờ `aging`.

## Chết thật (`permadeathEnabled`)

- Khi bật: quái ta **đã ra sân trong trận** mà còn **gục lúc trận kết thúc** (thắng, thua, chạy, mọi loại trận: quái hoang, boss, NPC, bí cảnh, event, độ kiếp) thì **chết hẳn**, không hồi lại được bằng NPC / nghỉ / thuốc như khi tắt.
- Xử lý lúc trận kết thúc (`finish`, sau khi tách hợp thể / bỏ biến hình, trước khi quái vừa bắt vào đội; `buryFallen`): log `diedInBattle { monsterId }`, `dieForever` với `cause: 'battle'` (đồ đang lắp / đồ cầm về túi, **hồn phách** vào túi, lý lịch thêm mốc `died`; `soul-relics.md`), rời đội và mọi chỗ trận còn trỏ tới. Bản mệnh chết thì ngự thú sư bị đạo thương như tọa hóa (`bondBroken`).
- Quái chết rời đội trước nên quái vừa bắt được vào chỗ trống trong đội. **Đội trống** sau đó (cả đội chết, không bắt được con nào) thì có quái thay như tọa hóa (`refillEmptyParty`, dùng chung với `lifespan.md` mục "Thọ tận"): quái level cao nhất trong kho vào đội (log trận `monsterAutoJoined`), kho cũng trống thì hồn phách mới nhất nở ngay thành trứng truyền thừa (`legacyEggHatched`). Nuzlocke thì kho trống là **thua game** thay cho trứng truyền thừa (`challenge-modes.md`).
- Quái **đã gục từ trước trận** (bật chết thật khi đang có quái gục) không ra sân được nên không chết; vẫn hồi được như thường.
- Ngoài trận không có gì làm quái gục nên chỉ xét lúc trận kết thúc.
- **Độ kiếp** (`awakening.md`): quái độ kiếp gục khi bật chết thật thì chết hẳn ngay (không tính thêm lần thất bại); thua vì hết lượt (còn máu) vẫn theo luật độ kiếp.
- **Tự farm** (`auto-battle.md`): trận có quái chết thật thì dừng với lý do `monsterDied`.
- Bật / tắt không đổi gì trên quái (chỉ ghi vào `options`).

## Kiểm tra và save

- `validateTimeState`: `options` đủ mọi tùy chọn của `GAME_OPTION_FLAGS`, mỗi tùy chọn boolean, không tùy chọn lạ; `aging` của mọi quái bằng `options.lifespanEnabled`.
- Save `version: 72` (v71 → v72: `options.permadeathEnabled = false`; save cũ giữ nguyên `lifespanEnabled`); v100 thêm phần thử thách (`challenge-modes.md`). `state-versions.md`.
- Nuzlocke ép bật chết thật: tắt báo `nuzlockeLocked { option }`.

## Mô phỏng

- Mô phỏng chạy với thọ nguyên **bật** (đặt rõ ở mọi `createGameState` của `scripts/simulate`, giữ cách đo cũ) và chết thật **tắt**; cột `battleFallen` ở `lifespan.csv` đếm số lần quái đội mẫu gục lúc trận kết thúc = số quái sẽ chết nếu bật chết thật (`simulation-features.md`).
- **Kết quả 2026-10-31** (`--parts progression`): 19–86 lần trong 72–132 trận mỗi lần chơi (đội 2 con 19–69, đội 6 con 76–86). "Người chơi" mô phỏng không né gục (đánh tới khi thua rồi hồi máu) nên chết thật là chế độ thử thách khó đúng ý; tùy chọn mặc định tắt nên không đổi số cân bằng. Chưa có "người chơi" biết né gục (rút quái máu thấp, không đánh boss khi chưa chắc thắng) để đo chết thật với lối chơi cẩn thận (chờ: biến thể mô phỏng của chế độ thử thách, xem `docs/roadmap/challenge-extras.md`).
