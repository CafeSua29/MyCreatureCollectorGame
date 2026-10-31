# Bánh breed (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như bánh của Palworld 1.0: vật phẩm dùng **khi breed** để đổi kết quả. Nấu ở Đầu bếp (`cooking.md`), làm ngay sau nó. Số là **số tạm** (`balance.json`, khóa `breedingCakes`).

## Luật

- Category mới **`breedingAid`** (gộp chồng, không dùng trực tiếp, chỉ trong action breed, giống `fusionAid`, mục "Fuse thất bại và bùa fuse" ở `fusing.md`). Action breed thêm `aidItemIds?` (tối đa `maxCakes` = 2 món **khác loại**), tiêu khi breed.
- Hiệu ứng (registry `BREEDING_AID_EFFECTS`):

| Bánh                  | Hiệu ứng                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- |
| Bánh Linh Chi         | gen của con tung lệch lên: phần "tăng / giảm theo %" nghiêng về tăng (+10 điểm %)   |
| Bánh Song Sinh        | ra **2 trứng** (con thứ hai tung độc lập)                                           |
| Bánh Biến Dị          | tỉ lệ đột biến (gen mọi chỉ số tăng) ×3; tỉ lệ đột biến phản tổ ×2 (`bloodline.md`) |
| Bánh Truyền Thừa      | con giữ tối đa **3 trait** thay vì 2 (vẫn 1 trait mỗi bên + 1 random từ hai bên)    |
| Bánh Kim Quang (hiếm) | tỉ lệ shiny của con ×5                                                              |

- Nguồn: nấu ăn (nguyên liệu linh điền / đồ rơi), chợ đen (Kim Quang), đấu giá.
- Không đổi save (chỉ thêm category và tham số action).

## Test

Từng loại bánh, hai bánh khác loại, chặn trùng loại / quá số lượng, bánh bị tiêu, 2 trứng tung độc lập.

## Tài liệu khi xong

Luật vào `breeding-eggs.md`, `world-items.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
