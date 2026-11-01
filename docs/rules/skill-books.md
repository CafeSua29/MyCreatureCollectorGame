# Sách kỹ năng

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Dạy skill **ngoài learnset** (技能书, như TM / TR / Move Tutor của Pokémon). **Bí kíp** dùng một lần, **Chân kinh** dùng mãi (rất hiếm). Số ở `balance.json` khóa `skillBook` (số tạm, ghi ở `balance-content.md`).

## Vật phẩm và túi

- **Một item chung có tham số** (như tinh thể trait): đúng một định nghĩa category `skillBook` trong `items.json` (kiểm tra dữ liệu: đúng một, không có trường riêng, không `price`). Skill và loại sách nằm ở từng chồng trong túi: `Inventory.books: { skillId, reusable, count }[]`, gộp theo `skillId` + `reusable` (mỗi cặp tối đa một chồng; `reusable` false = Bí kíp, true = Chân kinh).
- Định danh: `ItemRef` `{ storage: 'book', skillId, reusable }` (phần túi `book` của `itemStorage`). Thao tác túi: `addBooks` / `removeBooks` / `getBookCount` (`inventory/inventory.ts`) hoặc theo định danh `addByRef` / `removeByRef`. Lỗi: `unknownSkill`, `notEnoughBooks`.
- **Skill có sách** (`isBookableSkill`): mọi skill trừ chiêu Max / G-Max / Max Guard (`maxMove`) và hợp kích kỹ (`comboSkills`). Định danh / save trỏ skill không có sách thì báo lỗi. Thần thông thức tỉnh là skill thường mạnh nhất của hệ nên vẫn có sách (chủ project chốt 2026-10-24, `awakening.md`).
- Bán (giá thị trường động, key `book:<skillId>`, Bí kíp và Chân kinh chung key), mua, vứt như item gộp chồng; không dùng trực tiếp qua `useItem`, không lắp được (`notEquippable` với id item chung).

## Độ hiếm và giá

- **Độ hiếm theo game gốc**: số loài học được skill bằng level (learnset) hoặc sách (`bookSkillIds`: TM / TR / Move Tutor của game gốc), mỗi loài tính một lần (`skillLearnerCount`; chiêu phổ biến ở game gốc có nhiều loài học, chiêu riêng chỉ một loài). Chiêu trứng (`eggSkillIds`) không tính. Bậc trong `skillBook.rarities` xếp từ phổ biến tới hiếm, mỗi bậc `minLearners` (giảm dần): skill thuộc bậc phổ biến nhất có `minLearners` ≤ số loài học. Sau đó **theo sức mạnh**: mỗi mốc `rarityPowerSteps` mà power đạt (≥) thì hiếm thêm một bậc, tối đa bậc cuối (`skillBookRarityOf`). Không lưu, tính khi cần (cache theo bộ dữ liệu).
- Bậc hiện có: common (≥ 31 loài) / uncommon (≥ 11) / rare (≥ 4) / epic (≥ 2) / legendary (≤ 1, kể cả chiêu không loài nào học như Happy Hour); mốc power 100 và 130. Tên bậc hiển thị: làm cùng UI.
- **Giá gốc** (`skillBookPrice`): `(priceBase + power × pricePerPower) × priceMultiplier của bậc × highestFloor`, Chân kinh × `reusablePriceMultiplier`, làm tròn xuống. Mua = giá gốc, bán = `sellPercent` % theo thị trường động.

## Nguồn

- **Kệ sách cửa hàng** (`rollBookShelf` trong `rollShopStock`, tung sau hàng thường, thêm vào cuối danh sách hàng): số Bí kíp tung đều trong [`shopMin`, `shopMax`] (tách khỏi hàng thường để sách không lấn thuốc / bóng), không trùng. Ứng viên: skill có sách, `power ≤ shopMaxPower`, có ít nhất một loài học (learnset hoặc `bookSkillIds`; chiêu không loài nào học không bán). Trọng số: `shopWeight` của bậc chia đều cho các skill của bậc (thêm skill không làm bậc khác khó kiếm hơn), **nhân `partyMultiplier` nếu có quái trong đội học được mà chưa biết / chưa chờ** (hơn 1.800 skill nên chọn đều thì gần như không gặp đúng skill cần). `shopMax` = 0 thì không có kệ, không tốn RNG. Không bán Chân kinh.
- **Boss rơi** (`dropSkillBook` ở `battle/outcome.ts`, sau đồ rơi biến hình): mỗi boss bị hạ `bossDropChance` % (× hệ số rơi như đồ rơi khác) rơi một cuốn; skill chọn theo trọng số trong learnset (mọi level) và `bookSkillIds` của loài gốc của boss (trừ skill không có sách): mỗi skill 1, skill quái trong đội học được mà chưa biết × `partyMultiplier` (dùng chung với kệ sách, `isSkillBookUsefulForParty`; chủ project giao Claude cân: chọn đều thì gần như mọi cuốn rơi ra đều khác hệ với đội, mô phỏng 2026-10-24 chỉ dùng được 1 / 17 cuốn); `reusableDropChance` % là Chân kinh. Log `skillBookDropped`. Tỉ lệ 0 thì không tốn RNG.
- Chợ đen (Bí kíp power > `shopMaxPower` hoặc chiêu không loài nào học: chiêu sự kiện của game gốc như Happy Hour / Celebrate; Chân kinh 3%) và thưởng thắng hết thú triều (sách theo map): `events.md`. Thưởng boss thế giới: sách trong learnset của loài boss theo bậc (`world-boss.md`). Chưa có: đấu giá (chờ `auction.md`), Tàng Bảo Các (chờ `sects.md`).
- **Tàng thư các** của động phủ (hiệu ứng `research`, `dwelling.md`): mỗi ngày kỳ vọng `booksPerPower × sức` cuốn vào kho động phủ, skill trong learnset loài của map tầng cao nhất (`rollSkillBooks`), Chân kinh 5%.

## Luật học

- Action `useSkillBook { monsterId, item }` (ngoài trận, ở đâu cũng được, quái trong đội hoặc kho; hàm `applySkillBook` ở `monster/skillBooks.ts`). `item` phải là định danh `book`, túi phải có ít nhất một cuốn.
- **Tương thích** (`isSkillBookCompatible`, `inventory/skillBooks.ts`) khi một điều kiện đúng: skill cùng hệ với quái (`elementIds`); skill thuộc hệ dùng chung `skillBook.universalElementIds` (hệ thường); skill có trong learnset hoặc `bookSkillIds` của **một loài trong chuỗi tiến hóa** của loài gốc (`baseSpeciesId`; chuỗi = chính nó, mọi dạng trước, mọi dạng sau, **không gồm nhánh anh em**: Vaporeon gồm Eevee nhưng không gồm Flareon; `evolutionLineOf`).
- **Không có tác dụng, không mất sách** (`skillBookNoEffect`, `reason`): quái đã biết hoặc đang chờ học skill (`known`), không tương thích (`incompatible`).
- Học theo luật có sẵn (`offerSkills`): còn ô thì học ngay, đủ ô thì vào skill chờ học (`evolution-skills.md`). Bí kíp mất ngay cả khi skill chỉ vào danh sách chờ; Chân kinh không mất.
- Skill học từ sách ghi vào **`extraSkillIds`** của quái (skill ngoài learnset, không trùng, theo thứ tự học), nên **NPC học lại skill** dạy lại được ở mọi level, cùng giá (`relearnableSkills`). Dùng chung cho kế thừa skill khi fuse (mục "Kế thừa skill" ở `fusing.md`).
- Tiến hóa và fuse (quái gốc) giữ `extraSkillIds`; con breeding chỉ có chiêu trứng đã học lúc nở (`breeding-eggs.md`); quái hoang rỗng.

## Loài học thêm qua sách (`bookSkillIds`)

- Trường tùy chọn của loài: skill học được qua sách ngoài learnset (TM / TR / Move Tutor của game gốc), mở thêm luật tương thích và tính vào độ hiếm. Kiểm tra dữ liệu: danh sách skill tồn tại, có sách, không trùng (dùng chung với `eggSkillIds`).
- **Loài Pokémon**: chiêu TM / TR / tutor của game gốc (bỏ chiêu đã có trong learnset của chính loài), nhập bằng `scripts/data-import/learn-sources-import.mjs` (dữ liệu ở `content-mechanics.md` mục "Dữ liệu nguồn học skill"). Chiêu chỉ học qua TM (Dragon Cheer, Pounce, Trailblaze...) có sách nhờ trường này.
- **Chiêu tutor Legends: Arceus**: Draco Meteor (`dracoMeteor`, như Overheat: tự hạ 2 bậc công đặc biệt), Steel Beam (`steelBeam`, bỏ phần mất máu như Mind Blown), Volt Tackle (`voltTackle`, bỏ phản lực, 10% tê liệt) chỉ học qua sách, không thêm vào learnset (`scripts/data-import/la-moves-import.mjs`, có thế mạnh / thế nhanh). Mục `bookSkillIds` Draco Meteor / Steel Beam của mọi dạng Arceus giữ nguyên khi nhập TM / tutor; từ đợt nhập nguồn học, các loài học ba chiêu này qua tutor / TM ở game gốc (rồng với Draco Meteor, Pikachu với Volt Tackle...) cũng có trong `bookSkillIds`.

## Kiểm tra

- Dữ liệu (`gameData/validateSkillBooks.ts`): `config.skillBook` (số ≥ 0, tỉ lệ 0–100, `shopMax ≥ shopMin`, `partyMultiplier ≥ 1`, hệ dùng chung tồn tại, bậc có id không trùng / `minLearners` giảm dần / `priceMultiplier` > 0, mốc power tăng dần, trường lạ), `bookSkillIds`, `eggSkillIds`.
- Save: `inventory.books` (skill tồn tại và có sách, `reusable` boolean, số lượng ≥ 1, không trùng chồng), `extraSkillIds` của quái (skill tồn tại, có sách, không trùng). Version 37 (`state.md`).
