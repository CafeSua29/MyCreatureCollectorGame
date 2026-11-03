# Biến thể Bootleg (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Bootleg của Cassette Beasts**. Ở bản gốc: quái Bootleg mang **hệ khác** hệ thường của loài, màu khác; tỉ lệ mặc định **1/1000**; tiến hóa (remaster) vẫn giữ hệ Bootleg; Bootleg có tỉ lệ ra thuộc tính sticker cao hơn. Độc lập với shiny (một quái có thể vừa shiny vừa Bootleg). Số là **số tạm** (`balance.json` khóa `bootleg`).

## Luật

- Trường mới `Monster.bootlegElementId?` (id hệ). Hệ của quái Bootleg = **đúng một hệ** `bootlegElementId` thay toàn bộ hệ của loài (bản gốc quái một hệ).
- Một hàm duy nhất `speciesElementsFor(data, monster)` trả hệ theo loài hiện tại, có Bootleg thì trả hệ Bootleg. Mọi chỗ đặt `elementIds` theo loài (sinh quái, tiến hóa, thoái hóa `devolution.md`, đổi dạng) gọi hàm này, nên **tiến hóa giữ Bootleg** như bản gốc.
- **Quái hoang** (cả boss): tung `bootleg.wildChance` (0,1%) **sau shiny** (sau cùng, để thêm luật không đổi kết quả RNG cũ của loài / gen / trait / shiny). Hệ Bootleg tung đều trong mọi hệ trừ các hệ thường của loài. Map / event có thể tăng tỉ lệ (`bootlegChance` của biome như `shinyChance`; thú triều, độ bất ổn).
- **Breeding**: con có tỉ lệ `bootleg.inheritPercent` (25) % nhận hệ Bootleg của bố hoặc mẹ (mẹ trước), không thì tung như quái hoang.
- **Fuse**: quái gốc giữ Bootleg của mình (như `elementIds` của quái gốc).
- **Gacha, trứng boss, trao đổi NPC, khu bảo tồn**: đi qua hàm sinh quái chung nên có tỉ lệ như quái hoang.
- Gặp quái Bootleg: log `bootlegAppeared` (UI làm hiệu ứng). Thưởng EXP / tiền × `bootleg.rewardMultiplier` như shiny.
- **Dex**: ghi đã gặp / sở hữu Bootleg theo hệ (`dex.md`); mốc thưởng sưu tập Bootleg. Thành tựu "Bộ sưu tập Bootleg".
- **Sticker**: quái Bootleg học sticker thì tỉ lệ thuộc tính theo `bootleg.stickerRarityWeights` (bản gốc 66,6% uncommon, 16,7% rare khi lên sao; ở đây áp khi tung thuộc tính lúc dán sticker thường lên quái Bootleg), xem `skill-stickers.md`.
- Không có đá đổi hệ Bootleg ở bước đầu (giữ độ hiếm); thêm sau nếu cần nguồn tiêu tiền.

## Save

`bootlegElementId` tùy chọn trên quái (kiểm tra là id hệ tồn tại); tăng version + migrate (không có).

## Test

Tỉ lệ quái hoang, hệ khác hệ loài, tiến hóa giữ, breeding truyền, fuse giữ quái gốc, thứ tự RNG không đổi quái cũ, Tera vẫn đè hệ trong trận, Dex ghi.

## Tài liệu khi xong

Luật vào `docs/rules/shiny-boss.md` (đổi tên mục thành "Shiny, Bootleg và boss") hoặc file mới `bootleg.md` nếu dài; `breeding-eggs.md`, `dex.md`, dòng Tiến độ; xóa file này.
