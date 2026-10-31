# Nội dung loài còn chờ (chưa làm)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Gán loài vào biome đã làm ở bước 5d (luật ở "Dữ liệu map ngẫu nhiên theo tầng" trong `docs/rules/content-data.md`). Còn lại:

- Các loài từng chờ danh sách (Yaoling, Batomon) và các dòng game soạn theo hiểu biết của Claude đã nhập lại từ API / wiki ngày 2026-10-26 (`docs/rules/content-sources-real.md`). Nhập thêm nguồn mới: viết `<nguồn>-fetch.mjs` ghi `sources/<nguồn>.json`, chạy `species-batch-import.mjs` rồi `biomes-import.mjs`.

## Việc từng hoãn vì hiểu nhầm máy dev offline (2026-10-26)

Đã làm: đối chiếu TWW3 với wiki (`content-sources-more.md` mục "Đối chiếu wiki"), danh sách loài từ API / wiki và chữ Dex (`content-sources-real.md`), tên đá Mega (khớp tên chính thức của PokeAPI, không phải sửa). Còn lại:

- **Tiến hóa cần vật phẩm / cơ chế chưa có:** Monster Sanctuary (catalyst), dạng quỷ Yaoling (Evolution Crystal), tiến hóa bằng fuse của Yo-kai Watch. Chờ: mục nội dung thêm vật phẩm tiến hóa tương ứng (có thể dùng `itemId` của tiến hóa bằng đá).
- **Cân nặng:** xem mục dưới.
- **Giờ hoạt động riêng của loài** (`activeTime`, `calendar.md`): đã nhập Pokémon Gen 2 / 4 (PokeAPI) và 705 động vật (EltonTraits, Wikidata). Còn thiếu: Pokémon Gen 5+ và dạng vùng miền (PokeAPI không có bảng gặp theo giờ của SM / SwSh / Legends / SV; chờ nguồn như Bulbapedia / Serebii theo khu vực), động vật tên chung không khớp được tên khoa học (danh sách `missing` ở `animal-active-time-report.json`). Đang suy theo race / hệ.

## Cân nặng thật

- Đã có số thật: Pokémon (PokeAPI, `scripts/data-import/pokemon-size-import.mjs`); động vật thật / tuyệt chủng 842 / 1.787 loài (`scripts/data-import/animal-size-import.mjs`: AnAge theo tên tiếng Anh, Wikidata → tên khoa học → PanTHERIA / AnAge, chi / họ / bộ lấy trung bình nhân, khối lượng Wikidata; con non = con trưởng thành × 0,15 cân nặng, × 0,5 chiều cao). Loài còn lại dùng ước lượng theo race và tổng chỉ số (`battle.md` mục "Bắt quái").
- AVONET (chim, `scripts/data-import/avonet-size-import.mjs`, 2026-10-26): thêm 17 loài chim có tên khoa học (script tự tải ELEData.zip từ figshare).
- Còn thiếu (928 loài, danh sách ở `scripts/data-import/animal-size-report.json`): chủ yếu **tên chung** ("Cobra", "Hawk", "Cow": nguồn nào cũng tra theo loài cụ thể, cần bảng ánh xạ tay tên chung → loài đại diện), khủng long / cổ sinh vật (không có cơ sở dữ liệu khối lượng), cá (FishBase không còn API / bản tải tự động), côn trùng. Monster Hunter: wiki chỉ ghi nhỏ / lớn, không có cân nặng. Digimon, Yo-kai, Dragon Quest, Monster Rancher, Siralim và đa số fantasy không có số: giữ ước lượng. Chờ: bảng ánh xạ tên chung (làm tay, không phải do thiếu mạng).

## Rà race loài mặc định

- Sau khi tách race (`content-data.md` mục "Tách race"), khoảng 1.300 chuỗi tiến hóa vẫn lấy race mặc định theo race cũ (danh sách ở `scripts/data-import/races-report.json` `byFallback`). Phần lớn hợp lý; còn nên rà tay theo tác phẩm gốc: Temtem, Cassette Beasts, Coromon, Monster Rancher, Ben 10, Kirby / Mario (quái nhỏ tròn đang là slime), Sơn Hải Kinh (cá → cá thường), D&D / Warcraft (ác quỷ, dị thể tên riêng). Thêm vào `races-overrides-fantasy.mjs`, thiếu race hợp lý thì thêm race mới ở `races-table.mjs` (kèm trait ở `races-traits-more.mjs`), rồi chạy lại `races-split.mjs`. Không chặn việc khác (chờ: thời gian rà tay, không chờ dữ liệu).

## Bộ phận và điểm yếu theo loài

- Tầm chiêu và vị trí ra đòn đã làm (`docs/rules/hit-locations.md`), nhưng bộ phận / điểm yếu mới ghi theo **nhóm race** (`raceGroups.json`). Nên ghi riêng cho race / loài lệch nhóm (chim không bay vẫn có cánh, rắn không có chân, cá không có chân, quái nhiều đầu...) và điểm yếu theo nguồn khi có (Monster Hunter: bảng hitzone theo bộ phận; Pokémon không có). Thêm `bodyParts` / `weakPoints` ở `races.json` / `species.json` (tối đa 2 điểm yếu), không cần sửa code. Chờ: nguồn hitzone Monster Hunter (wiki) và thời gian rà tay; không chặn việc khác.
