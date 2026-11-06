# Dấu ấn trên quái: sẹo, đột biến, thích nghi, ám ảnh, chiến tích (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03 (bổ sung cùng ngày: chỉ sẹo / đột biến khi phá bộ phận thì đơn điệu, làm thêm). Ý từ **Mewgenics** (đột biến theo bộ phận cơ thể, nhiều đột biến hai mặt lợi / hại, di truyền khi lai; thương tật và rối loạn tâm lý sau trận), nối với hệ **phá bộ phận** (`hit-locations.md`). Chủ đề "trải qua sinh tử thì mạnh lên": quái mang dấu vết của những trận đã qua, mỗi con một khác. Số là **số tạm** (`balance.json` khóa `marks`).

## Năm loại dấu ấn

| Loại                      | Nghĩa                              | Tốt / xấu                                          | Nguồn chính                                                                                                  | Mất đi                                                             | Di truyền  |
| ------------------------- | ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------- |
| `scar` (sẹo)              | Thương tật vĩnh viễn ở một bộ phận | Xấu                                                | Bộ phận bị phá, bị chí mạng, gục trong trận, trạng thái nặng                                                 | Chữa (Thầy thuốc, đan), luân hồi, hoặc tự **chai thành sẹo chiến** | Không      |
| `mutation` (đột biến)     | Bộ phận biến dạng                  | Tốt hoặc **hai mặt** (+ một chỉ số, − chỉ số khác) | Bộ phận bị phá (hiếm), thắng khi suýt chết, môi trường / hiểm địa, đan dược, linh dịch, bẩm sinh             | Chỉ Thầy thuốc bỏ theo ý người chơi                                | Có         |
| `adaptation` (thích nghi) | Cơ thể quen dần với thứ hay gặp    | Tốt                                                | Bị đánh nhiều lần bởi một hệ / dính nhiều lần một trạng thái / đánh nhiều trận trong một thời tiết, địa hình | Không mất                                                          | Tỉ lệ thấp |
| `trauma` (ám ảnh)         | Nỗi sợ sau thất bại                | Xấu, chỉ khi gặp thứ gây ra nó                     | Gục nhiều lần dưới tay một loài / một hệ                                                                     | **Vượt qua**: hạ đúng thứ đó đủ số lần thì thành dấu `resolve`     | Không      |
| `trophy` (chiến tích)     | Huân chương của con quái           | Tốt, theo đối tượng                                | Hạ boss, boss thế giới, hạ nhiều quái một race, vượt ám ảnh (`resolve`), độ kiếp thành công                  | Không mất                                                          | Không      |

## Dữ liệu

- File mới `src/data/marks.json`, union theo `kind`: `{ id, kind, partId?, target?, hooks?, traitId?, weight, inheritPercent?, maxLevel? }`.
  - `partId`: bắt buộc với `scar` / `mutation` (dấu theo bộ phận).
  - `target`: với `adaptation` / `trauma` / `trophy`: `{ elementId }`, `{ statusId }`, `{ speciesId }`, `{ raceId }`, `{ weather }`, `{ terrain }`, `{ boss: true }`... Hook chỉ áp khi gặp đúng đối tượng (hook mới có điều kiện đối thủ / môi trường, dùng lại điều kiện hook trait có sẵn).
  - `hooks` = hook trait (% chỉ số, chính xác, sát thương / nhận sát thương theo hệ, sát thương skill dùng bộ phận đó, kháng trạng thái...). `traitId` = trait cấp 1 mà dấu cho (không chiếm ô trait).
  - `maxLevel` bỏ trống = không trần: dấu cùng id nhận lại thì **lên cấp** (hiệu ứng × hệ số cấp như trait cấp), hợp chủ đề scale vô hạn.
- Ngưỡng và tỉ lệ ở `balance.json` khóa `marks` (theo từng nguồn, bên dưới). Tên / mô tả ở i18n `marks`.
- **Nội dung đầu** (ví dụ, nhập đủ khi làm):
  - Sẹo: đầu "Mù một mắt" (−chính xác), sừng "Gãy sừng" (−sát thương skill dùng đầu), cánh "Cánh rách" (−sát thương skill dùng cánh, −né), chân "Què" (−tốc độ), thân "Vết bỏng sâu" (−thủ, từ bỏng nặng), "Vết độc ăn" (−máu tối đa, từ nhiễm độc nặng).
  - Đột biến: "Mắt thứ ba" (+chính xác, trait nhìn thấu), "Sừng đá" (+thủ), "Đuôi kép" (+tốc độ, −thủ: hai mặt), "Da đá" (+thủ, −tốc độ), "Cánh dơi" (bay, kiểu `airborne`), "Tay thứ ba" (+công), "Phổi lửa" (kháng lửa, −kháng nước).
  - Thích nghi: "Quen lửa" (giảm sát thương hệ lửa nhận), "Kháng độc", "Chịu nắng", "Bơi giỏi" (lợi trong địa hình nước).
  - Ám ảnh: "Sợ loài X" (−% chỉ số khi đối thủ là loài X), "Sợ hệ Y".
  - Chiến tích: "Kẻ diệt rồng" (+sát thương lên race dragon), "Kẻ hạ boss" (+sát thương lên boss), "Vượt qua nỗi sợ X" (`resolve`: +sát thương lên đúng thứ từng sợ).

## Nguồn và tỉ lệ

Mọi nguồn chỉ cho **quái của người chơi**, tung sau trận theo thứ tự cố định (để tất định), một hàm duy nhất `rollBattleMarks` gọi ở cuối `applyWin` / thua / chạy.

- **Bộ phận bị phá** (`battle.records[id].brokenParts`): mỗi bộ phận tung đột biến (`mutationOnBreakPercent` 0,5%), trượt thì sẹo (`scarOnBreakPercent` 8%), chọn mục theo `weight` trong các mục cùng `partId` / `kind`.
- **Bị chí mạng** mà mất ≥ `critScarHpPercent` (40) % máu trong một đòn: tung sẹo (`scarOnCritPercent` 2%) ở bộ phận bị nhắm (không nhắm thì `torso`).
- **Gục trong trận**: tung sẹo (`scarOnFaintPercent` 3%) ở bộ phận ngẫu nhiên.
- **Trạng thái nặng** hết trận vẫn còn (bỏng, nhiễm độc nặng, tê cóng): tung sẹo riêng của trạng thái (`scarOnStatusPercent` 2%).
- **Thắng khi suýt chết** (kết thúc trận với ≤ `nearDeathHpPercent` (5) % máu, đã ra sân): tung đột biến (`mutationOnNearDeathPercent` 2%). Phần thưởng cho chơi liều.
- **Thích nghi**: bộ đếm trên quái `markCounters` (chỉ khóa có trong dữ liệu dấu thích nghi): + 1 mỗi lần bị trúng đòn hệ X / mỗi lần dính trạng thái Y / mỗi trận đánh trong thời tiết, địa hình Z. Đủ `threshold × (cấp hiện tại + 1)` thì nhận / lên cấp dấu thích nghi tương ứng (ngưỡng tăng dần, không trần). Không tung RNG.
- **Ám ảnh**: bộ đếm gục dưới tay loài X / hệ Y; đủ `traumaThreshold` (3) lần **trong các trận gần đây** (đếm giảm 1 mỗi trận thắng không gặp lại) thì nhận dấu. Không tung RNG.
- **Vượt qua ám ảnh**: đang có ám ảnh X mà hạ đúng X (đòn hạ gục do chính quái đó) đủ `resolveThreshold` (3) lần thì **xóa ám ảnh, nhận chiến tích `resolve`** tương ứng (mạnh hơn chiến tích thường).
- **Chiến tích**: hạ boss tầng / boss thế giới (đòn hạ gục, hoặc ra sân trong trận thắng boss thế giới), hạ đủ `trophyThreshold × (cấp + 1)` quái một race, độ kiếp thành công (`awakening.md`).
- **Sẹo chai thành sẹo chiến**: mỗi sẹo đếm số trận thắng quái đó ra sân; đủ `scarHardenBattles` (100) thì tung `scarHardenPercent` (10%): sẹo đổi thành dấu tốt "Sẹo chiến" cùng bộ phận (mục `hardensInto` của sẹo). Cho người chơi chọn: trả tiền chữa ngay, hay giữ sẹo chờ cơ hội chai thành dấu tốt.
- **Nguồn ngoài trận**:
  - **Hiểm địa / event**: map có `markHazard` (đầm độc, vùng phóng xạ linh khí...) cho mỗi trận ở đó một tỉ lệ đột biến; event "Suối lạ", "Quả lạ" cho đột biến ngẫu nhiên (Mewgenics: ăn thứ lạ).
  - **Dị Biến Dịch** (đan dược luyện được, chợ đen): `useItem` lên quái, cho một đột biến ngẫu nhiên (có thể là loại hai mặt).
  - **Linh dịch** (`spirit-virus.md`): khi khỏi bệnh tung đột biến nhỏ (`mutationOnVirusCurePercent`).
  - **Cấy ghép** (`implant.md`): thất bại thì tung sẹo ở thân.
- **Quái hoang / boss** sinh ra có tỉ lệ nhỏ đã mang sẹo / đột biến (`wildMarkPercent`, tung sau cùng), để bắt được quái có dấu sẵn.
- **Bẩm sinh**: con khi breeding có `birthMutationPercent` (1%) đột biến ngẫu nhiên mới.

## Luật chung

- Trường mới `Monster.marks: { markId, level, origin: { source, floor, opponentSpeciesId? } }[]` và `Monster.markCounters: Record<string, number>` (chỉ khóa đang dùng). Mỗi bộ phận tối đa **một sẹo và một đột biến**; nhận thêm đột biến cùng id ở bộ phận đã có thì **lên cấp**, khác id thì không ra (giữ cái cũ). Dấu không theo bộ phận: mỗi id một mục, nhận lại thì lên cấp.
- **Tính chỉ số**: hook của dấu áp ở bước áp trait như trang bị (nguồn % mới `marks`, cộng chung, `stats-traits.md`); trait của dấu gộp vào trait hiệu lực. Hook theo đối tượng chỉ áp trong trận khi gặp đúng đối tượng (ngoài trận không có).
- **Bộ phận không còn** trong `monsterBodyPlan` (tiến hóa đổi race) thì dấu của bộ phận đó **giữ nhưng không có tác dụng** cho tới khi có lại.
- **Thầy thuốc** (NPC mới ở thị trấn): `treatMark { monsterId, markId }` chữa sẹo hoặc bỏ đột biến / ám ảnh (bỏ ám ảnh bằng tiền thì **không** nhận chiến tích `resolve`), giá `treatCostPerLevel × level`. **Sinh Cơ Đan** (luyện đan, chợ đen) chữa một sẹo. Thích nghi / chiến tích không bỏ được.
- **Di truyền** khi breeding: mỗi đột biến của bố / mẹ truyền với `inheritPercent` của mục (mặc định 25%), thích nghi 5%, chỉ khi con có bộ phận đó; mỗi bộ phận vẫn tối đa một đột biến (mẹ trước). Sẹo / ám ảnh / chiến tích không truyền. Tung sau các bước breeding cũ.
- **Fuse**: quái gốc giữ dấu của mình, của quái phụ mất. **Luân hồi** (`rebirth.md`, trẻ lại): xóa sẹo và ám ảnh, giữ phần còn lại. **Hiến tế / bậc sao / thoái hóa**: không ảnh hưởng dấu của quái chính.
- **Lý lịch** (`monster-history.md`): mốc `markGained { markId, level, source, floor, opponentSpeciesId? }` ("Gãy sừng ở trận với X, tầng Y"; "Vượt qua nỗi sợ loài X"), `markRemoved`. Log ngoài trận `markGained` (`game-log.md`).
- **Dex / thành tựu**: thành tựu theo số loại dấu đã có, chiến tích `resolve`, đột biến cấp cao.
- `MonsterView.marks` (theo loại, bộ phận, cấp, có tác dụng hay không, tiến độ bộ đếm gần nhất).
- **AI**: không cần đổi (dấu chỉ đổi chỉ số / hook).
- **Mô phỏng**: đo số dấu trung bình mỗi quái theo tầng, tỉ lệ tốt / xấu; chỉnh tỉ lệ để sẹo không làm quái chính yếu đi rõ.

## Save

`marks`, `markCounters` trên quái (kiểm tra id, `partId` khớp mục, không trùng loại trên một bộ phận, cấp ≤ `maxLevel`, bộ đếm nguyên ≥ 0); tăng version + migrate (rỗng).

## Test

Từng nguồn ra đúng loại và tỉ lệ (phá bộ phận, chí mạng, gục, trạng thái, suýt chết, hiểm địa, đan, linh dịch, cấy ghép, bẩm sinh, quái hoang), quái NPC không nhận, đột biến cùng id lên cấp / khác id không ra, thích nghi theo ngưỡng tăng dần, ám ảnh đếm giảm khi không gặp, vượt ám ảnh thành chiến tích, sẹo chai thành sẹo chiến, hook theo đối tượng chỉ áp khi gặp, bộ phận không còn thì mất tác dụng, Thầy thuốc / đan, di truyền, fuse, luân hồi, mốc lý lịch, cấp cực lớn.

## Tài liệu khi xong

Luật vào file mới `docs/rules/marks.md` (thêm Mục lục), dòng ở `hit-locations.md`, `breeding-eggs.md`, `rebirth.md`, `monster-history.md`, `alchemy.md` (đan), `events.md` (event dấu ấn), `zones.md` (hiểm địa), `stats-traits.md` (nguồn %), dòng Tiến độ; xóa file này.
