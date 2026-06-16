# Implementation Plan: Lesson Planner & Slides

Tập trung vào tính thực dụng khi thiết kế kịch bản hoạt động giảng dạy (Storyboard) và nội dung slide bài giảng chi tiết. Hỗ trợ giảng viên kiểm soát trực quan bố cục và thời lượng bài dạy.

---

## 5 Chủ đề Debate (User vs UX/UI vs Tech Lead)

### Chủ đề 1: Dòng thời gian hoạt động bài giảng (Visual Lesson Timeline vs. Text Outline)
*   **User:** Tôi muốn nhìn thấy bức tranh tổng thể thời lượng giảng dạy của mình (chia nhóm, thuyết giảng, làm bài tập) phân bổ đã hợp lý chưa. Nhìn đống chữ liệt kê rất khó hình dung.
*   **UX/UI Designer:** Thiết kế một dòng thời gian nằm ngang (hoặc dọc). Mỗi slide là một khối có kích thước tỷ lệ thuận với thời lượng của nó. Các hoạt động được phân biệt bằng icon màu sắc rõ ràng (ví dụ: Màu xanh cho Thuyết giảng, màu cam cho Thảo luận).
*   **Tech Lead:** Cần cấu trúc lại bảng `chapter_materials` hoặc thêm bảng mới lưu trữ danh sách slide chi tiết. Mỗi slide chứa: `slide_number`, `title`, `duration` (phút), và `activity_type` (enum). Giao diện Timeline sẽ tính toán chiều rộng của từng khối dựa trên số phút để vẽ CSS Flexbox đơn giản.
*   **Trade-off:**
    *   *Hiệu năng:* Render bằng CSS thuần siêu nhẹ, không gây gánh nặng cho trình duyệt.
    *   *Trải nghiệm:* Cực kỳ trực quan, giảng viên phát hiện ngay lập tức nếu slide thảo luận bị quá dài.
*   **Kết luận:** Triển khai Visual Lesson Timeline bằng CSS Flexbox động bám sát thời lượng.

### Chủ đề 2: Điều chỉnh thời lượng slide (Interactive Drag Handles vs. Number Inputs)
*   **User:** Tôi muốn kéo giãn khối slide trên Timeline để tăng/giảm thời lượng bài giảng một cách nhanh chóng.
*   **UX/UI Designer:** Đặt các tay cầm kéo (Drag Handles) ở ranh giới các khối slide. Khi giảng viên kéo, số phút hiển thị sẽ thay đổi trực tiếp (real-time indicator) kèm hiệu ứng đổi màu nếu vượt quá thời gian tiêu chuẩn.
*   **Tech Lead:** Thao tác kéo giãn liên tục trên trình duyệt có thể gây giật nếu tính toán tọa độ phức tạp. Ta sẽ viết sự kiện mousemove ở frontend để cập nhật state cục bộ, chỉ khi giảng viên nhả chuột (mouseup), ta mới gửi PATCH request đồng bộ thời lượng mới lên backend.
*   **Trade-off:**
    *   *Hiệu năng:* Đảm bảo mượt mà nhờ cập nhật state cục bộ trước, gọi API sau khi nhả chuột.
    *   *Trải nghiệm:* Thao tác tương tác vật lý trực quan, loại bỏ việc phải gõ số thủ công.
*   **Kết luận:** Cho phép kéo giãn thời lượng slide, đồng bộ dữ liệu sau khi nhả chuột (onMouseUp).

### Chủ đề 3: Trình xem trước nội dung slide (React CSS Slide Preview vs. Backend Image Render)
*   **User:** Tôi muốn thấy bố cục chữ, tiêu đề, và các gạch đầu dòng hiển thị trên slide thực tế trông như thế nào để biết có bị tràn chữ hay không.
*   **UX/UI Designer:** Thiết kế một khung mô phỏng slide 16:9 ở chế độ Dark Mode tinh tế. Định dạng chữ to, căn lề thoáng đãng, giả lập giao diện PowerPoint thực tế.
*   **Tech Lead:** Không render slide thành ảnh ở backend (rất tốn tài nguyên và băng thông). Chúng ta sẽ dựng component React `SlidePreview` nhận nội dung Markdown từ API, parse thành cấu trúc HTML/CSS và hiển thị bên trong container tỉ lệ 16:9 được scale bằng CSS `transform: scale()`.
*   **Trade-off:**
    *   *Hiệu năng:* Tiết kiệm 100% tài nguyên CPU của server so với việc render ảnh.
    *   *Trải nghiệm:* Tải ngay lập tức, cho phép chỉnh sửa nội dung trực tiếp (inline edit) trên slide ảo.
*   **Kết luận:** Sử dụng React CSS-based Slide Preview tỉ lệ 16:9 ở client-side.

### Chủ đề 4: Tự do chọn chủ đề thiết kế (Theme Switcher vs. Static Unified Style)
*   **User:** Tôi muốn slide của mình có màu sắc và nhận diện thương hiệu chuẩn của trường VinUni (Maroon & Gold) hoặc các phong cách đơn giản khác.
*   **UX/UI Designer:** Thiết kế 3 theme cơ bản: VinUni Theme (đỏ hạt dẻ chủ đạo), Light Theme (trắng tinh tế), Dark Theme (xám công nghệ). Giảng viên chọn theme bằng cách click vào các vòng tròn màu.
*   **Tech Lead:** Dữ liệu theme sẽ được lưu trong bảng `courses` (trường `theme_style`). Khi xuất bản slide sang PowerPoint bằng `python-pptx`, backend sẽ đọc trường này để áp dụng template `.potx` tương ứng.
*   **Trade-off:**
    *   *Hiệu năng:* CSS theme chỉ cần đổi class ở lớp ngoài cùng của SlidePreview component.
    *   *Trải nghiệm:* Tăng tính cá nhân hóa tài liệu giảng dạy mà không làm phức tạp hóa hệ thống.
*   **Kết luận:** Hỗ trợ 3 Theme màu cơ bản và đồng bộ sang Master Slide PowerPoint lúc xuất bản.

### Chủ đề 5: Soạn thảo tài liệu đọc chi tiết (Notion-like Editor vs. Simple Markdown Textarea)
*   **User:** Bài đọc chi tiết cho sinh viên chuẩn bị trước giờ học thường rất dài. Tôi muốn soạn thảo dễ dàng như dùng Notion hoặc Medium thay vì gõ Markdown thô sơ.
*   **UX/UI Designer:** Thiết kế trình soạn thảo kiểu khối (Block-based). Gõ `/` để gọi menu chèn nhanh bảng biểu, khối code, hoặc ghi chú nổi bật.
*   **Tech Lead:** Dùng thư viện Editor.js hoặc MDXEditor (mã nguồn mở, nhẹ). Nó giúp lưu trữ dữ liệu dưới dạng JSON cấu trúc sạch sẽ thay vì HTML thô, giúp dễ dàng chuyển đổi sang file Word (.docx) ở backend.
*   **Trade-off:**
    *   *Hiệu năng:* File JS tải về sẽ nặng thêm khoảng 40KB cho editor. Ta sẽ dùng Code Splitting để chỉ tải editor này khi user vào tab Soạn Bài đọc.
    *   *Trải nghiệm:* Đỉnh cao, chuyên nghiệp, tạo cảm hứng soạn giáo trình.
*   **Kết luận:** Sử dụng trình soạn thảo Markdown/Block-based Editor tối giản (MDXEditor) được lazy-load.

---

## Kế hoạch triển khai kỹ thuật chi tiết

### Phía Frontend
1.  **Nâng cấp [LessonPlanner.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/LessonPlanner.tsx):**
    *   Xây dựng component `LessonTimeline` vẽ thanh thời gian Flexbox.
    *   Xây dựng component `SlidePreviewer` giả lập khung hình slide 16:9 bằng CSS.
    *   Tích hợp trình soạn thảo Markdown trực quan MDXEditor cho tài liệu đọc chi tiết.

### Phía Backend
1.  **Chỉnh sửa [materials.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/api/materials.py):**
    *   Bổ sung trường `theme_style` và danh sách slide cấu trúc JSON trong cơ sở dữ liệu SQLite.
    *   Hỗ trợ API cập nhật nội dung slide và thời lượng hoạt động riêng biệt.
