# Implementation Plan: Course Outline & Roadmap Generator

Tập trung vào tính thực dụng khi thiết kế và điều chỉnh đề cương môn học chi tiết. Giúp giảng viên linh hoạt chỉnh sửa cấu trúc chương mục một cách nhanh chóng mà không làm mất dữ liệu đã có.

---

## 5 Chủ đề Debate (User vs UX/UI vs Tech Lead)

### Chủ đề 1: Sinh đề cương chi tiết bằng AI (Streaming Chapters vs. Full Loading Block)
*   **User:** Đợi AI sinh xong toàn bộ 10-15 chương môn học mất rất nhiều thời gian (thường 20-30 giây). Tôi muốn nhìn thấy cấu trúc chương mục hiện lên dần dần.
*   **UX/UI Designer:** Khi AI sinh đến chương nào, chương đó sẽ trượt nhẹ xuất hiện ngay trên danh sách. Tránh màn hình trắng hoặc màn hình khóa (blocking loading).
*   **Tech Lead:** API của OpenAI/Gemini/Claude đều hỗ trợ stream tokens. Ta sẽ parse stream ở backend [outline.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/api/outline.py) và trả về từng block JSON của chương qua Server-Sent Events (SSE). Frontend chỉ cần cập nhật danh sách State liên tục.
*   **Trade-off:**
    *   *Hiệu năng:* Phải parse stream JSON động ở client (phức tạp hơn một chút vì JSON có thể bị đứt quãng giữa chừng).
    *   *Trải nghiệm:* Cực kỳ tốt. Giảng viên thấy hệ thống hoạt động ngay lập tức, không cảm thấy sốt ruột.
*   **Kết luận:** Triển khai cơ chế SSE Streaming cho danh sách chương mục đề cương.

### Chủ đề 2: Thao tác sắp xếp lại thứ tự chương (Drag-and-Drop vs. Up/Down Buttons)
*   **User:** Tôi muốn kéo thả tự do các chương để đổi chỗ thay vì phải click nút lên/xuống phiền phức.
*   **UX/UI Designer:** Dùng thư viện kéo thả để tạo các thẻ chương động (Draggable Cards). Khi kéo, các thẻ khác tự động dịch chuyển tạo không gian trực quan.
*   **Tech Lead:** Dùng `dnd-kit` (thư viện kéo thả hiện đại cho React, nhẹ và hỗ trợ tốt thiết bị di động). Mỗi chương có một cột `sort_order` trong bảng `chapters`.
*   **Trade-off:**
    *   *Hiệu năng:* `dnd-kit` chạy mượt mà ở mức 60 FPS, không gây lag.
    *   *Trải nghiệm:* Tự nhiên, nhanh chóng và giống các ứng dụng hiện đại.
*   **Kết luận:** Sử dụng `dnd-kit` cho thao tác kéo thả sắp xếp chương.

### Chủ đề 3: Chỉnh sửa trực tiếp tên/mô tả chương (Inline Editing vs. Detail Modal)
*   **User:** Tôi muốn sửa nhanh tên chương ngay trên giao diện danh sách chứ không muốn mở pop-up chi tiết đè lên màn hình.
*   **UX/UI Designer:** Khi double-click vào tên chương, nó biến thành một ô input có viền phát sáng nhẹ. Khi click ra ngoài (focus-out) hoặc nhấn Enter, nó tự lưu và trở lại dạng text thường.
*   **Tech Lead:** Việc này rất đơn giản ở frontend bằng cách chuyển đổi trạng thái `isEditing: boolean` của thẻ chương. Khi lưu, gửi PATCH request đến `/api/outline/chapters/{id}`.
*   **Trade-off:**
    *   *Hiệu năng:* Không tốn tài nguyên, giảm tải render modal phức tạp.
    *   *Trải nghiệm:* Biên tập nhanh, không bị đứt gãy mạch làm việc.
*   **Kết luận:** Sử dụng Inline Editing cho tên chương mục.

### Chủ đề 4: Đồng bộ hóa dữ liệu xuống Database (Auto-save on Drop vs. Manual Save Button)
*   **User:** Tôi sợ hệ thống bị mất điện hoặc mất mạng khi đang kéo thả chỉnh sửa đề cương. Tôi muốn nó tự lưu.
*   **UX/UI Designer:** Mỗi khi kéo thả hoặc sửa chữ, hiển thị một icon tích xanh nhỏ lấp lánh biểu thị *"Đã tự động lưu"* ở góc màn hình.
*   **Tech Lead:** Nếu tự động lưu liên tục sau mỗi lượt kéo thả (Auto-save on Drop), SQLite sẽ bị ghi đè dồn dập. Giải pháp là sử dụng cơ chế *Debounced Save*: Khi user kéo thả hoặc gõ, ta đợi họ dừng thao tác 1.5 giây rồi mới gửi request đồng bộ mảng thứ tự mới xuống DB SQLite trong một single transaction để tối ưu hóa IOPS.
*   **Trade-off:**
    *   *Hiệu năng:* Tránh nghẽn DB nhờ cơ chế Debounce.
    *   *Trải nghiệm:* An toàn, giảng viên không cần phải lo bấm nút "Lưu" thủ công.
*   **Kết luận:** Triển khai cơ chế Tự động lưu có Debounce (1.5 giây) sau khi người dùng thay đổi thứ tự.

### Chủ đề 5: Chèn nhanh chương mới và yêu cầu AI tự sinh (Inline Add Chapter vs. Full Regenerate)
*   **User:** Tôi muốn chèn một chương mới vào giữa bài học và nhờ AI viết hộ nội dung chương đó bám sát ngữ cảnh các chương xung quanh.
*   **UX/UI Designer:** Hiển thị một nút `(+) Thêm chương mới` mỏng và tinh tế nằm giữa các chương. Khi click, mở ra ô viết tên chương mục và nút AI lấp lánh để sinh nội dung chương tại chỗ.
*   **Tech Lead:** Backend sẽ tạo endpoint `/api/outline/chapters/generate-single`. API này gọi LLM với prompt cung cấp nội dung chương trước và chương sau của nó (RAG ngữ cảnh hẹp) để sinh ra mục tiêu và mô tả chương mới tương thích, sau đó lưu vào SQLite.
*   **Trade-off:**
    *   *Hiệu năng:* Tiết kiệm token LLM cực lớn so với việc sinh lại toàn bộ đề cương.
    *   *Trải nghiệm:* Giúp giảng viên mở rộng bài giảng linh hoạt mà không làm xáo trộn các phần đã hoàn chỉnh.
*   **Kết luận:** Hỗ trợ tính năng chèn chương và sinh nội dung chương đơn lẻ bám sát ngữ cảnh.

---

## Kế hoạch triển khai kỹ thuật chi tiết

### Phía Frontend
1.  **Nâng cấp [CourseRoadmap.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/CourseRoadmap.tsx):**
    *   Tích hợp thư viện `@hello-pangea/dnd` hoặc `dnd-kit` cho kéo thả thẻ chương.
    *   Thêm các nút Inline Edit và Inline Add (+) giữa các thẻ chương.
    *   Tích hợp debounced API call để đồng bộ thứ tự chương.

### Phía Backend
1.  **Chỉnh sửa [outline.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/api/outline.py):**
    *   Hỗ trợ endpoint PATCH cập nhật thứ tự chương (`reorder`).
    *   Viết API `/api/outline/chapters/generate-single` để sinh nội dung chương đơn lẻ bám sát ngữ cảnh.
