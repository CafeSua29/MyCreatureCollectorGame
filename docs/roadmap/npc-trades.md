# Trao đổi với NPC (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như trao đổi trong game Pokémon: NPC muốn một quái theo yêu cầu, đổi lại một quái hoặc vật phẩm đặc biệt. Số là **số tạm** (`balance.json`, khóa `trades`).

## Luật

- **Bảng trao đổi** ở thị trấn: 1–3 đề nghị, làm mới mỗi `refreshDays` (7) ngày (`day`). Mỗi đề nghị `{ want, give }` sinh bằng RNG core:
  - `want`: điều kiện quái (loài / race / hệ, level tối thiểu, tư chất tối thiểu...), theo `highestFloor`.
  - `give`: một quái sinh sẵn (loài hiếm hơn của tầng, có thể shiny / tính cách tốt / trait rare; lý lịch nguồn gốc `trade`: thêm nhánh `HistoryOrigin` + `ORIGIN_RULES`, `docs/rules/monster-history.md`) hoặc vật phẩm hiếm.
- `acceptTrade { offerId, monsterId }`: quái đưa đi mất (trang bị về túi như thả quái; bị chặn nếu là bản mệnh hoặc đang khóa: `roster-tools.md`); quái nhận về theo luật sức chứa. Mỗi đề nghị dùng một lần. Sức chứa đã có (`capacity.md`): quái đưa đi mất theo ý người chơi nên dùng `assertOverflowConfirmed` / `returnEquipmentWithinCapacity` (`discardOverflow`); quái nhận về kiểm tra `hasRosterRoom` (`rosterFull`).
- **Tăng version save** (bảng trao đổi).

- **Phẩm cấp loài** (`docs/rules/species-rank.md`, đã làm; dùng `speciesRankOf` / `speciesRankIndex`): `want` nhận thêm phẩm cấp loài tối thiểu; `give` có thể chọn loài theo bậc.

## Test

Sinh đề nghị (tất định), điều kiện quái đưa, chặn bản mệnh / quái khóa, nhận quái / vật phẩm, sức chứa, làm mới theo ngày, migrate.

## Tài liệu khi xong

Luật vào `docs/rules/` (gộp luật thị trấn), `state.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
