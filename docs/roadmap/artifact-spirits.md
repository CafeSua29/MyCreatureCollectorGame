# Khí linh và Khí giới bí cảnh (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Gộp hai nguồn (chủ project yêu cầu): **Innocent + Item World của Disgaea** (sinh vật sống trong món đồ, mỗi con là một buff; thu phục thì mạnh gấp đôi; gộp / phối giống; vào "thế giới bên trong món đồ" để nâng cấp) và **khí linh (器灵) của truyện tu tiên / huyền huyễn** (linh hồn sống trong binh khí, có phẩm cấp, nuôi lớn được, thức tỉnh; Quỷ Cốc Bát Hoang thu khí linh bằng Dẫn Hồn Châu). Chỉ áp cho **trang bị của quái** (chủ project đã bỏ pháp bảo ngự thú sư). Làm sau "Cường hóa, tẩy luyện, phân giải" (đã xong, `equipment-forge.md`) và "Bí cảnh và tháp thí luyện". Số là **số tạm** (`balance.json`, khóa `artifactSpirits`).

## Khí linh

- Dữ liệu mới `src/data/artifactSpirits.json`: loại khí linh `{ id, effects, awakenedEffects, dual? }`; `effects` dùng hook trang bị / trait có sẵn (ví dụ Kiếm Linh +% công, Thuẫn Linh +% thủ, Phong Linh +% tốc độ, Thanh Linh +% đặc công, Dược Linh hồi % HP cuối lượt, Kim Linh +% tiền rơi, Ngộ Linh +% EXP, Hộ Linh giảm sát thương nhận). Tên ở `i18n`.
- Trên mỗi **trang bị instance** thêm `spirits: [{ typeId, value, subdued }]`. **Số ô khí linh** theo bậc (common 1, uncommon 2, rare 3, epic 4, legendary 5, unique / hồn khí 6) + 1 mỗi 100 cấp của món (không trần).
- **Hiệu lực** = hiệu ứng gốc của loại × `value` (cộng vào tổng % ở bước áp trait như mọi nguồn); khí linh **chưa thu phục** ("dã linh") chỉ có nửa hiệu lực, **đã thu phục** đủ hiệu lực (như Innocent ×2).
- **Phẩm cấp khí linh** theo `value` (ngưỡng trong `balance.json`): Phàm → Linh → Bảo → Tiên → Thần (không trần qua mốc "Thần + n"). Đạt **Bảo** trở lên thì **thức tỉnh**: thêm `awakenedEffects` của loại đó (ví dụ Kiếm Linh thức tỉnh: +chí mạng).
- **Nguồn:**
  - Trang bị rơi / mua có tỉ lệ sẵn 0–2 **dã linh** (cửa hàng thì không có, như Disgaea).
  - **Dẫn Hồn Châu** (vật phẩm, boss rơi, chợ đen): dùng ở NPC **Khí Linh Các** để triệu một khí linh ngẫu nhiên (đã thu phục, `value` theo tầng) vào kho khí linh.
  - Khí giới bí cảnh (dưới).
- **Kho khí linh** `GameState.spiritStorage` (khí linh đã thu phục chưa gắn vào món nào), **tính chung sức chứa túi trang bị** (`docs/rules/capacity.md`, đã làm: mỗi khí linh trong kho chiếm 1 chỗ; đầy thì khí linh mới từ Dẫn Hồn Châu / phân giải bị chặn hoặc mất như luật túi đầy). **Tăng version save**. Khi làm: cộng số khí linh trong kho vào `bagUsed` (`registries/capacity.ts`).

## Thao tác ở Khí Linh Các (thị trấn)

- **Di dời:** chuyển khí linh **đã thu phục** giữa các món / kho, tốn tiền theo `value`.
- **Gộp:** hai khí linh **cùng loại, đã thu phục** gộp thành một, `value` cộng lại (không trần). Thăng phẩm cấp khi qua ngưỡng.
- **Nuôi dưỡng:** cho khí linh "ăn" nguyên liệu (`material`) hoặc hồn phách (`soul-relics.md`) để tăng `value`.
- **Phối linh** (như Innocent Farm): đặt hai khí linh **khác loại** vào **Linh trì** `days` (7) ngày (`day`), sinh **khí linh kép** (`dual`: có hiệu ứng của cả hai loại, `value` = trung bình), hai khí linh gốc trả lại.
- **Phân giải trang bị** (đã làm, `docs/rules/equipment-forge.md`): khí linh đã thu phục **về kho**, dã linh mất.

## Khí giới bí cảnh (như Item World)

- Action `enterItemWorld { instanceId }` ở Khí Linh Các: vào **thế giới bên trong món đồ** (món đang lắp phải tháo trước). Mỗi món có `depth` (tầng đã qua, lưu trên món).
- Mỗi **tầng** là một trận (quái sinh theo bậc + cấp + `depth` của món, không theo tầng thế giới). Qua mỗi tầng: món **+1 cấp** (cách nâng cấp miễn phí thay cho tiền / đá của cường hóa; cùng một trường cấp), thưởng nhỏ.
- **Dã linh:** mỗi tầng có `spiritChance` (30%) gặp một dã linh của món (hoặc khí linh mới nếu còn ô trống) trong trận; **hạ nó trong trận** thì khí linh đó **được thu phục**.
- **Khí Tướng** mỗi 10 tầng (thắng: thêm một lần random dòng phụ của món hoặc +`value` cho mọi khí linh), **Khí Vương** tầng 30 / 60 / 90, **Khí Thần** tầng 100 (sau đó lặp mạnh dần, không trần).
- **Rời đi:** sau mỗi 10 tầng, hoặc dùng **Phá Giới Phù** (vật phẩm) bất kỳ lúc nào. Vào lại thì tiếp tục từ tầng chưa qua. Thua: ra ngoài, không mất món, không mất `depth`.
- **Cân bằng với cường hóa:** script mô phỏng so tốc độ lên cấp món bằng Khí giới bí cảnh (tốn ngày, trận, rủi ro) và bằng cường hóa (tốn tiền, đá), chỉnh độ khó tầng theo `depth` để hai cách không cách nào làm cách kia vô dụng.
- Mỗi trận tốn giờ như trận thường (`clock.hours`, quy ước đồng hồ ở `lifespan.md`). Không áp độ bất ổn tầng. Dùng chung khung chuỗi trận của bí cảnh (`docs/rules/trials.md`: `GameState.trial`, `battle.trial`, `TRIAL_KIND_RULES` thêm một loại).

## Test

Ô khí linh theo bậc / cấp, hiệu lực dã linh / thu phục, phẩm cấp và thức tỉnh, Dẫn Hồn Châu, di dời / gộp / nuôi / phối linh theo ngày, phân giải trả về kho, Khí giới bí cảnh (lên cấp mỗi tầng, gặp và thu phục dã linh, boss mỗi 10 tầng, rời đi / vào lại, thua không mất món), migrate.

## Tài liệu khi xong

Luật vào luật trang bị trong `docs/rules/` (hoặc file mới `artifact-spirits.md`, thêm vào Mục lục), `stats-traits.md` (nguồn %), `state.md`, `world-items.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.

## Việc chờ từ mục đã làm

- Khí giới bí cảnh thưởng **Kẹo EXP** (luật kẹo ở `docs/rules/exp-candy.md`; chờ mục này).
