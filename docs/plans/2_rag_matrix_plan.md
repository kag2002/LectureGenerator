# Implementation Plan: RAG Document Upload & CLO-Bloom Matrix

Tập trung vào trải nghiệm xử lý tài liệu thông minh (không gây cảm giác chờ đợi vô định) và trực quan hóa ma trận liên kết giữa Chuẩn đầu ra (CLO) và Thang tư duy Bloom.

---

## 5 Chủ đề Debate (User vs UX/UI vs Tech Lead)

### Chủ đề 1: Trải nghiệm kéo thả File học liệu (Drag-and-Drop Zone vs. Standard Input)
*   **User:** Tôi muốn kéo trực tiếp tệp slide bài giảng hoặc đề cương môn học (PDF/DOCX) thả vào trình duyệt để tải lên, tránh phải click qua nhiều thư mục.
*   **UX/UI Designer:** Thiết kế một vùng kéo thả rộng ở trang Knowledge Base. Khi kéo file đè lên vùng này, toàn bộ vùng sẽ chuyển sang màu xanh dương nhạt với viền đứt nét chuyển động xoay tròn nhẹ nhàng để thông báo sẵn sàng nhận file.
*   **Tech Lead:** Dùng API kéo thả HTML5 tiêu chuẩn để tránh cài thêm thư viện nặng. Tương thích trực tiếp với luồng API `/api/courses/{course_id}/materials` hiện tại. Chúng ta sẽ giới hạn dung lượng file tối đa là 50MB ở phía client để tránh làm treo RAM của server SQLite khi parse tài liệu.
*   **Trade-off:**
    *   *Hiệu năng:* Tận dụng HTML5 API cực nhẹ.
    *   *Trải nghiệm:* Thao tác kéo thả tự nhiên, phản hồi trực quan cao.
*   **Kết luận:** Triển khai vùng kéo thả HTML5 kết hợp giới hạn kích thước file 50MB.

### Chủ đề 2: Theo dõi trạng thái trích xuất Vector RAG (SSE Stream vs. API Polling)
*   **User:** Tài liệu nặng cần thời gian để AI đọc và phân tích. Tôi không muốn nhìn spinner quay tròn mà không biết tiến độ tải và phân tích đang ở mức nào.
*   **UX/UI Designer:** Thiết kế một thanh tiến trình (Progress Bar) chạy mượt mà cùng các trạng thái vi mô: *"Đang đọc file..."*, *"Đang chia nhỏ dữ liệu..."*, *"Đang lưu vào bộ nhớ RAG..."*.
*   **Tech Lead:** Không dùng Polling (gọi API liên tục mỗi 2 giây) vì sẽ gây overload cho DB SQLite khi nhiều giảng viên cùng dùng. Thay vào đó, ta sẽ sử dụng Server-Sent Events (SSE) kết hợp với FastAPI BackgroundTasks. Backend sẽ bắn event về frontend mỗi khi một nhóm chunks được xử lý xong trong ChromaDB.
*   **Trade-off:**
    *   *Hiệu năng:* SSE duy trì 1 connection duy nhất, tiết kiệm băng thông và CPU của server so với Polling.
    *   *Trải nghiệm:* Giảng viên thấy được tiến trình thật, giảm bớt sự do dự và cảm giác chờ đợi.
*   **Kết luận:** Sử dụng Server-Sent Events (SSE) để truyền trạng thái xử lý RAG.

### Chủ đề 3: Đối chiếu nguồn dữ liệu CLO (Integrated Split-Screen vs. Modal Popups)
*   **User:** Khi AI trích xuất ra CLO từ tài liệu, tôi muốn xem nhanh CLO này nằm ở trang nào của tài liệu gốc để đối chiếu độ chính xác.
*   **UX/UI Designer:** Giao diện chia đôi màn hình (Split-screen). Bên trái hiển thị danh sách CLO, bên phải hiển thị trình đọc PDF tích hợp. Click vào CLO nào, PDF tự động cuộn đến trang đó và highlight văn bản tương ứng.
*   **Tech Lead:** Do trình đọc PDF gốc của trình duyệt chiếm nhiều tài nguyên, ta sẽ sử dụng thư viện `react-pdf` hoặc thẻ `iframe` đơn giản hiển thị PDF, kết hợp với metadata `page_number` lưu trong ChromaDB RAG.
*   **Trade-off:**
    *   *Hiệu năng:* `react-pdf` có thể hơi nặng, ta sẽ tối ưu bằng cách lazy-load component này, chỉ tải khi user click vào nút "Đối chiếu".
    *   *Trải nghiệm:* Độc lập và trực quan, không phải chuyển tab hay mở file PDF ngoài.
*   **Kết luận:** Sử dụng Split-screen với thư viện `react-pdf` được lazy-load để tối ưu hiệu năng.

### Chủ đề 4: Giao diện thiết lập ma trận CLO x Bloom (Heatmap Grid vs. Checklist Excel)
*   **User:** Thiết kế ma trận bằng checkbox trông rất thô và mỏi mắt. Tôi muốn một thứ trực quan hơn để đánh giá độ phủ.
*   **UX/UI Designer:** Thiết kế dạng lưới (Grid Matrix) với các ô màu gradient. Màu sắc sẽ đậm dần tương ứng với số câu hỏi/nội dung phủ cho ô đó. Khi hover vào một ô, hiển thị danh sách tóm tắt nội dung liên quan.
*   **Tech Lead:** Về dữ liệu, ta lưu mối liên kết trong bảng `clos` (có sẵn trường `bloom_level` từ 1-6). Ta sẽ query nhanh danh sách này để vẽ Heatmap. Khi giảng viên click đổi mức Bloom của CLO, ta sẽ gọi API PATCH để update và render lại màu ô lưới tương ứng ngay lập tức.
*   **Trade-off:**
    *   *Hiệu năng:* Render Grid CSS thuần siêu nhẹ, không tốn tài nguyên.
    *   *Trải nghiệm:* Trực quan hóa độ phủ kiến trúc môn học tức thì.
*   **Kết luận:** Xây dựng lưới ma trận dạng Heatmap bằng CSS Grid thuần.

### Chủ đề 5: Tính toán tỷ lệ bao phủ ma trận (Client-side vs. Server-side Calculation)
*   **User:** Khi tôi đổi cấu hình CLO, tôi muốn chỉ số "độ phủ lý thuyết/thực hành" cập nhật ngay mà không bị trễ.
*   **UX/UI Designer:** Kim đo độ phủ (Gauge Chart) xoay chuyển động mượt mà thời gian thực khi có bất kỳ thay đổi nào trong bảng ma trận.
*   **Tech Lead:** Thay vì gửi API request lên server tính toán lại rồi trả về (mất ~100ms), ta sẽ thực hiện tính toán tỷ lệ phần trăm trực tiếp bằng Javascript ở frontend. Chỉ khi giảng viên dừng thao tác chỉnh sửa, ta mới gửi dữ liệu tổng hợp một lần lên backend để lưu vào database.
*   **Trade-off:**
    *   *Hiệu năng:* Tiết kiệm hàng chục API calls lên server khi user bấm chọn liên tục.
    *   *Trải nghiệm:* Mượt mà 100%, không bị giật hay chờ API phản hồi.
*   **Kết luận:** Tính toán tỷ lệ bao phủ động tại Client-side, lưu đồng bộ định kỳ (debounced save).

---

## Kế hoạch triển khai kỹ thuật chi tiết

### Phía Frontend
1.  **Nâng cấp [KnowledgeBase.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/KnowledgeBase.tsx):**
    *   Thay thế input file cũ bằng vùng kéo thả HTML5.
    *   Tích hợp EventSource (SSE client) để nhận trạng thái xử lý RAG từ backend.
2.  **Nâng cấp [MatrixDashboard.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/MatrixDashboard.tsx):**
    *   Xây dựng Grid Heatmap bằng CSS Grid.
    *   Tích hợp biểu đồ hình tròn/kim đo bằng SVG thuần (không cài thêm chart library lớn).

### Phía Backend
1.  **Chỉnh sửa [courses.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/api/courses.py):**
    *   Tích hợp SSE endpoint phát tín hiệu tiến trình ghi vector.
    *   Đảm bảo metadata của ChromaDB lưu trữ đúng số trang tài liệu để phục vụ split-screen.
