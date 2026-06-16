# Implementation Plan: Login & Onboarding

Tập trung vào tính thực dụng, tốc độ tải trang, và giảm tối đa ma sát (friction) cho giảng viên khi bắt đầu sử dụng VinUni AI Lecture Assistant.

---

## 5 Chủ đề Debate (User vs UX/UI vs Tech Lead)

### Chủ đề 1: Giao diện Đăng nhập (Glassmorphism vs. Simple Clean Form)
*   **User:** Tôi muốn trang đăng nhập mang đậm phong cách VinUni (Maroon & Gold) nhưng phải tải nhanh, không bị giật lag trên máy tính cấu hình yếu của giảng đường.
*   **UX/UI Designer:** Em đề xuất dùng Glassmorphism tối giản với hiệu ứng mờ ảo (backdrop-filter) kết hợp màu Maroon làm chủ đạo. Bỏ qua các hiệu ứng động 3D phức tạp để giữ giao diện thanh lịch và nhẹ nhàng.
*   **Tech Lead:** Đồng ý. Không dùng thư viện 3D như Three.js. Chúng ta sẽ viết bằng CSS thuần với `backdrop-filter: blur(10px)`. Điều này giúp file CSS chỉ nặng khoảng 2KB và render trực tiếp trên trình duyệt cực nhanh mà vẫn đảm bảo tính sang trọng.
*   **Trade-off:**
    *   *Hiệu năng:* Tải tức thì (< 0.5s), không tốn tài nguyên GPU.
    *   *Trải nghiệm:* Sang trọng, mang nhận diện VinUni, không bị lòe loẹt.
*   **Kết luận:** Chọn Glassmorphism tối giản bằng CSS thuần.

### Chủ đề 2: Tự động điền tài khoản Demo (One-click Demo Profile vs. Nhập liệu thủ công)
*   **User:** Tôi mệt mỏi vì phải gõ tài khoản demo dài ngoằng mỗi lần test hệ thống. Tôi muốn đăng nhập nhanh bằng 1 click nhưng vẫn phải kiểm soát được luồng bảo mật.
*   **UX/UI Designer:** Thiết kế một nút "Dùng thử với Prof. Khe" nhỏ gọn ở góc dưới form đăng nhập. Khi click, các trường input sẽ tự động điền giá trị và kích hoạt submit ngay lập tức với hiệu ứng chuyển đổi mượt mà.
*   **Tech Lead:** Về code, ta sẽ thêm nút này trong component [Login.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/Login.tsx). Khi click, client gọi endpoint `/api/auth/login` với credentials mặc định đã hash trong DB. Điều này hoàn toàn tương thích với cơ chế auth JWT hiện tại mà không làm giảm độ bảo mật của các tài khoản thực tế.
*   **Trade-off:**
    *   *Hiệu năng:* Không ảnh hưởng.
    *   *Trải nghiệm:* Giảm ma sát đăng nhập xuống mức 0 đối với các buổi demo.
*   **Kết luận:** Tích hợp nút One-click Demo cho tài khoản giảng viên mẫu.

### Chủ đề 3: Luồng Onboarding người dùng mới (Interactive Guide vs. Tooltips tối giản)
*   **User:** Tôi ghét các pop-up nhảy lên liên tục che mất giao diện chính. Nhưng tôi vẫn cần biết hệ thống hoạt động như thế nào.
*   **UX/UI Designer:** Tránh xa các tour guide che khuất màn hình. Thay vào đó, khi tài khoản mới đăng nhập lần đầu, chúng ta hiển thị các chấm tròn màu Gold nhấp nháy nhẹ (pulse effect) bên cạnh các nút chức năng chính (Cấu hình môn học -> Thiết kế lộ trình -> Soạn bài giảng). Khi click vào nút, chấm tròn biến mất.
*   **Tech Lead:** Dữ liệu trạng thái onboarding sẽ được lưu ở `localStorage` để giảm thiểu truy vấn DB. Ta dùng một biến `visited_steps` dạng array (ví dụ: `['config', 'roadmap']`). Khi đủ các bước, hệ thống sẽ tắt hoàn toàn hướng dẫn.
*   **Trade-off:**
    *   *Hiệu năng:* Không truy cập DB, xử lý hoàn toàn ở client.
    *   *Trải nghiệm:* Không làm phiền giảng viên, hướng dẫn tự nhiên qua hành vi click.
*   **Kết luận:** Sử dụng chấm thông báo nhấp nháy (Pulse Indicators) và lưu trạng thái ở LocalStorage.

### Chủ đề 4: Tải dữ liệu trang Dashboard (Lazy Loading vs. Prefetching dữ liệu)
*   **User:** Sau khi click đăng nhập, tôi muốn thấy số liệu dashboard ngay lập tức, không muốn nhìn màn hình loading trắng.
*   **UX/UI Designer:** Khi chuyển cảnh từ Login sang Dashboard, dùng hiệu ứng chuyển đổi mờ dần (fade-in) để che giấu thời gian API đang tải dữ liệu.
*   **Tech Lead:** Khi click nút Login, trước khi redirect route, ta sẽ trigger gọi prefetch song song các API chính: `/api/courses` và `/api/v1/user/me`. Dữ liệu sẽ được lưu tạm vào React Context. Khi Dashboard render, nó lấy ngay dữ liệu từ context để hiển thị mà không cần gửi thêm request mới.
*   **Trade-off:**
    *   *Hiệu năng:* Tận dụng thời gian trễ của hiệu ứng chuyển cảnh để load dữ liệu.
    *   *Trải nghiệm:* Cảm giác ứng dụng phản hồi ngay lập tức (instant feel).
*   **Kết luận:** Áp dụng prefetching dữ liệu trong lúc chuyển cảnh.

### Chủ đề 5: Cơ chế lưu phiên đăng nhập (JWT Local Storage vs. Cookie HTTP-only)
*   **User:** Tôi muốn thỉnh thoảng tắt tab đi mở lại không phải đăng nhập lại, nhưng phải an toàn.
*   **UX/UI Designer:** Không ảnh hưởng trực tiếp đến giao diện, nhưng cần đảm bảo khi token hết hạn, người dùng được thông báo tinh tế và có nút đăng nhập lại nhanh.
*   **Tech Lead:** Hiện tại [Login.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/Login.tsx#L32) đang lưu token ở `localStorage`. Để an toàn và tương thích ngược với API FastAPI hiện tại (đọc token từ Header `Authorization: Bearer`), ta tiếp tục duy trì `localStorage` nhưng thêm axios interceptor để tự động bắt lỗi `401 Unauthorized` và bật modal đăng nhập nhanh (Quick Re-auth popup) thay vì đẩy user ra trang login trống.
*   **Trade-off:**
    *   *Hiệu năng:* Không tốn tài nguyên.
    *   *Trải nghiệm:* Giữ mạch làm việc của giảng viên không bị gián đoạn khi hết hạn token.
*   **Kết luận:** Giữ cơ chế lưu localStorage, bổ sung Axios Interceptor và Quick Re-auth Modal.

---

## Kế hoạch triển khai kỹ thuật chi tiết

### Phía Frontend
1.  **Chỉnh sửa [Login.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/Login.tsx):**
    *   Tái cấu trúc HTML và áp dụng CSS Glassmorphism trong `Login.css`.
    *   Thêm nút "Dùng thử nhanh" điền tự động tài khoản demo `prof.khatkhe@vinuni.edu.vn`.
2.  **Chỉnh sửa [App.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/App.tsx):**
    *   Bổ sung Axios Interceptor để bắt lỗi 401.
    *   Tạo React Context để quản lý trạng thái Onboarding toàn cục.

### Phía Backend
1.  Đảm bảo dữ liệu demo cho tài khoản `prof.khatkhe@vinuni.edu.vn` luôn được khởi tạo sẵn trong database SQLite/PostgreSQL.
