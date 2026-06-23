# UX/UI Review & Development Notes: Visual Flowchart Editor (React Flow)

Dưới đây là nhận xét chuyên nghiệp từ vai trò **Senior UX/UI Developer** về các vấn đề hiện tại của giao diện biên tập sơ đồ trực quan, các lỗi bố cục/màu sắc/tương tác đã được khắc phục, và các định hướng cải tiến biểu tượng (icons) từ thư viện ngoài.

---

## 1. Phân Tích Lỗi Giao Diện & Tương Tác Hiện Tại

### 🔴 Lỗi 1: Unstyled React Flow Components (Bố cục vỡ nát & Clumping)
- **Hiện tượng**: Khung điều khiển (Controls), chấm tròn kết nối (Handles), và nhãn bản quyền "React Flow" bị dồn đống ở góc trên bên trái, đè lên các nút sắp xếp. Các chấm kết nối (Handles) xếp dọc dạng danh sách trên các khối `TIẾN TRÌNH C` và `TIẾN TRÌNH D` thay vì nằm ở 4 mép cạnh.
- **Nguyên nhân**: Stylesheet mặc định của React Flow (`@xyflow/react/dist/style.css`) không được Next.js áp dụng khi import cục bộ trong Client Component. Lớp layout absolute bị mất khiến trình duyệt render chúng dưới dạng inline-block bình thường.
- **Giải pháp khắc phục**: Đã chuyển lệnh import CSS lên file layout gốc [layout.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/app/layout.tsx) để Next.js tối ưu hóa và đưa vào bundle style toàn cục. Ngay khi load CSS toàn cục, các handle sẽ tự động bo tròn và bám chuẩn vào 4 góc mép, bộ điều khiển Controls sẽ snap về góc dưới bên trái và nhãn React Flow sẽ thu về góc dưới bên phải.

### 🔴 Lỗi 2: Onboarding Highlight Misplacement (Lệch khung hướng dẫn)
- **Hiện tượng**: Vòng viền highlight màu cam bao quanh không khớp với các nút và sidebar, bay lơ lửng trên màn hình hoặc đè chéo lên tiêu đề.
- **Nguyên nhân**: Sử dụng các tọa độ kích thước màn hình cứng (`fixed top/left/width/height` bằng px) không thích nghi được với các kích thước màn hình và tỷ lệ zoom khác nhau của trình duyệt.
- **Giải pháp khắc phục**: Thay đổi thuật toán tính toán vùng highlight sang **Dynamic Boundary Detection**. Sử dụng `document.querySelector` để đo trực tiếp kích thước thực tế (`getBoundingClientRect()`) của `.flow-sidebar-palette` và `.flow-top-toolbar` trên màn hình người dùng tại thời điểm hiển thị để tạo khung highlight và popover chỉ dẫn bám sát 100%.

### 🟡 Nhận xét về Màu sắc & Tương tác (Aesthetics & Interaction Critique)
- **Màu sắc nền**: Hiện tại nền canvas đang là màu xanh lục đen đậm `#0B132B` với lưới nền trắng mờ. Về mặt tương tác, lưới chấm cần giảm độ sáng xuống (`rgba(255,255,255,0.05)`) để người dùng tập trung hoàn toàn vào các khối chính.
- **Độ tương phản**: Chữ trên khối có màu vàng cát/đồng vàng `#8C6239` trên nền tối thỉnh thoảng hơi khó đọc. Cần bổ sung độ tương phản cao cho văn bản tiêu đề của khối.
- **Trạng thái hover**: Chưa có hiệu ứng thay đổi con trỏ chuột (`cursor: pointer` trên node, `cursor: grab` khi di chuyển, `cursor: crosshair` khi kéo nối handle).

---

## 2. Lưu Ý Về Việc Sử Dụng Thư Viện Biểu Tượng (Icons Customization)

> [!WARNING]
> **Không sử dụng Icon mặc định của hệ thống**: Không lạm dụng các icon cơ bản có sẵn trong Lucide (như bánh răng, dấu cộng, nút play chung chung). Việc sử dụng các biểu tượng thô này làm giảm tính chuyên nghiệp của sản phẩm giáo dục.

### Định hướng thay đổi biểu tượng sắp tới:
1. **Phân loại Icon theo mục tiêu Sư phạm**:
   - **Đầu vào (Input)**: Dùng icon đại diện cho tài liệu, video, hoặc học liệu nguồn (ví dụ: `BookOpen`, `FileText`, hoặc SVG riêng cho Giáo án).
   - **Tiến trình (Process)**: Dùng các icon hành động học tập thực tế (ví dụ: `PenTool` cho viết bài, `Users` cho thảo luận nhóm, `Brain` cho tư duy phản biện).
   - **Quyết định (Decision)**: Dùng icon có tính định hướng rẽ nhánh điều kiện rõ ràng (như `GitSplit`, `HelpCircle`).
   - **Kết quả (Output)**: Dùng icon thể hiện thành tựu, bài kiểm tra hoàn thành (như `Trophy`, `GraduationCap`, `Award`).

2. **Cách nhúng Thư viện Icon ngoài**:
   - Khai báo một Object ánh xạ (Mapping) từ loại khối (`data.type`) sang Component Icon tùy chỉnh.
   - Thay vì dùng `lucide-react` trực tiếp, ta có thể tự tạo các Component SVG Inline hoặc dùng Font Awesome / React Icons với các biểu tượng chuyên sâu hơn cho giáo dục.
   - Ví dụ cấu trúc mapping trong tương lai:
     ```tsx
     const IconLib = {
       input: <CustomInputIcon className="w-4 h-4 text-emerald-400" />,
       process: <CustomProcessIcon className="w-4 h-4 text-amber-500" />,
       decision: <CustomDecisionIcon className="w-4 h-4 text-orange-500" />,
       output: <CustomOutputIcon className="w-4 h-4 text-blue-400" />
     };
     ```

*Thầy/cô có thể ghi chú thêm các lưu ý và danh sách icon mong muốn vào file này để cập nhật dần trong các giai đoạn phát triển tiếp theo.*
