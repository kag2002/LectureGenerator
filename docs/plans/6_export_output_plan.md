# Implementation Plan: Output Generation & Export

Tập trung vào tính thực dụng, độ chính xác khi chuyển đổi tài liệu sang định dạng PowerPoint (.pptx) và Word (.docx), giảm tối đa ma sát tải file và đảm bảo tính thẩm mỹ chuẩn công tác học thuật.

---

## 5 Chủ đề Debate (User vs UX/UI vs Tech Lead)

### Chủ đề 1: Giao diện trang tải thành quả (Clean Responsive Grid vs. Flashy 3D Mockup Gallery)
*   **User:** Tôi không cần các hiệu ứng 3D màu mè hay xoay lật vô bổ làm chậm trình duyệt. Tôi chỉ cần nhìn thấy rõ danh sách các tài liệu có sẵn để tải về, dung lượng file bao nhiêu và nút bấm tải xuống rõ ràng.
*   **UX/UI Designer:** Em đồng ý. Chúng ta bỏ hoàn toàn ý tưởng mô hình 3D xoay lật. Thay vào đó thiết kế giao diện Grid dạng thẻ (Card Grid) phẳng, tối giản nhưng cao cấp. Mỗi thẻ đại diện cho một định dạng: Word, PowerPoint, JSON. Sử dụng badge màu hiển thị trạng thái *"Đã sẵn sàng"* hoặc *"Đang tạo..."* kèm icon tải xuống lớn, rõ ràng.
*   **Tech Lead:** Tuyệt vời. Bỏ 3D giúp trang tải siêu nhanh, giảm kích thước file bundle frontend đi hơn 200KB vì không cần load Three.js hay Canvas 3D.
*   **Trade-off:**
    *   *Hiệu năng:* Tải trang tức thì, chạy mượt trên mọi cấu hình máy tính.
    *   *Trải nghiệm:* Thực dụng, rõ ràng, tập trung vào mục tiêu chính là tải file.
*   **Kết luận:** Sử dụng giao diện Grid phẳng tối giản, hiển thị đầy đủ metadata và trạng thái file.

### Chủ đề 2: Đảm bảo định dạng file PowerPoint khớp 100% với Web (Master Template PPTX vs. Dynamic Shape Draw)
*   **User:** Tôi sợ tải Slide PPTX về bị vỡ khung chữ hoặc lệch font tiếng Việt. Slide tải về phải dùng được ngay trên giảng đường.
*   **UX/UI Designer:** Thiết kế sẵn một bộ Slide Master (.potx) chuẩn VinUni (font Inter, logo ở góc, màu sắc hạt dẻ Maroon chuẩn). Chúng ta định nghĩa các slide layout rõ ràng ở backend: *Slide Tiêu đề, Slide 2 cột, Slide So sánh, Slide danh sách*.
*   **Tech Lead:** Khi xuất file, thư viện `python-pptx` ở backend sẽ load file Slide Master `.potx` này để nhân bản các slide mới. Thay vì vẽ shape động bằng code phức tạp và dễ lệch, ta sẽ insert text trực tiếp vào các placeholder định sẵn trong Slide Master layout. Cách này đảm bảo an toàn 100% về bố cục và font chữ.
*   **Trade-off:**
    *   *Hiệu năng:* Xuất file nhanh hơn vì không cần tính toán tọa độ vẽ hình phức tạp.
    *   *Trải nghiệm:* Slide tải về mở bằng PowerPoint sẽ chuẩn khít thiết kế, dễ dàng chỉnh sửa lại chữ nếu muốn.
*   **Kết luận:** Sử dụng Master Template (.potx) có sẵn placeholder để tạo file PPTX.

### Chủ đề 3: Công thức toán học và khoa học trong Word (LaTeX to OMML XML vs. Static Image)
*   **User:** Tài liệu của tôi chứa nhiều công thức khoa học (LaTeX). Khi xuất sang file Word (.docx), các công thức này có chỉnh sửa bằng công thức Word gốc được không, hay bị biến thành ảnh tĩnh chết cứng?
*   **UX/UI Designer:** Công thức phải hiển thị sắc nét như chữ thường, không được nhòe hay vỡ hạt khi zoom file Word.
*   **Tech Lead:** Dùng công thức ảnh tĩnh thì đơn giản cho dev nhưng trải nghiệm cực tệ. Ta sẽ dùng thư viện Python để chuyển đổi các đoạn LaTeX công thức sang cấu trúc XML chuẩn của Word (`OMML - Office Math Markup Language`). Khi giảng viên mở file Word, công thức hiển thị dưới dạng đối tượng Equation gốc của Microsoft Office và có thể click vào để sửa trực tiếp.
*   **Trade-off:**
    *   *Hiệu năng:* Backend cần thêm thư viện parse XML nhưng chi phí CPU không đáng kể.
    *   *Trải nghiệm:* Tuyệt hảo cho giới học thuật, công thức editable và hiển thị sắc nét.
*   **Kết luận:** Chuyển đổi LaTeX sang định dạng OMML gốc trong file Word (.docx).

### Chủ đề 4: Cách thức đóng gói file tải về (Single ZIP Package vs. Individual Downloads)
*   **User:** Tôi muốn tải một phát được toàn bộ các file (Slide, Bài đọc, Câu hỏi) cùng một lúc cho tiện, thay vì phải click tải từng file riêng biệt.
*   **UX/UI Designer:** Thiết kế một nút lớn *"Tải toàn bộ bài giảng (ZIP)"* đặt nổi bật trên đầu. Khi click, hệ thống tự động gom hết file vào một tệp nén duy nhất.
*   **Tech Lead:** Ta sẽ viết thêm một endpoint `/api/export/all-zip` nhận `course_id`/`chapter_id`. Backend sẽ tạo một file nén zip trong RAM bằng thư viện `zipfile` của Python để ghi dữ liệu trực tiếp và trả về, không cần ghi file zip ra đĩa cứng của server để tối ưu hóa IOPS và tránh rác bộ nhớ.
*   **Trade-off:**
    *   *Hiệu năng:* Tạo zip trong bộ nhớ RAM cực nhanh, tự giải phóng khi kết thúc request.
    *   *Trải nghiệm:* Tải toàn bộ trong 1 click, cực kỳ tiện lợi cho giảng viên.
*   **Kết luận:** Hỗ trợ tính năng nén ZIP toàn bộ tài liệu trực tiếp trong bộ nhớ RAM để tải về nhanh.

### Chủ đề 5: Hiển thị tiến độ xuất file (SSE Progress Bar vs. Simple Static Spinner)
*   **User:** Quá trình tạo slide và tài liệu Word có thể mất khoảng 5 giây. Tôi muốn biết hệ thống đang đóng gói file nào, không muốn nhìn spinner quay vô định.
*   **UX/UI Designer:** Hiển thị một modal tiến trình nhỏ gọn. Danh sách các file cần xuất hiện ra với các tick xanh sáng dần lên khi hoàn thành: *"Đang tạo Slide... (OK)" -> "Đang tạo Bài đọc... (OK)" -> "Đang đóng gói ZIP..."*.
*   **Tech Lead:** Sử dụng Server-Sent Events (SSE) để backend liên tục gửi tín hiệu hoàn thành từng phần việc về client. Khi client nhận tín hiệu cuối cùng, nó sẽ tắt tiến trình và kích hoạt tải file.
*   **Trade-off:**
    *   *Hiệu năng:* SSE tiêu tốn tài nguyên kết nối rất ít, lập trình frontend rõ ràng.
    *   *Trải nghiệm:* Giảng viên nắm rõ tiến trình đóng gói, tăng cảm giác tin cậy vào hệ thống.
*   **Kết luận:** Tích hợp tiến trình SSE biểu diễn trạng thái đóng gói file từng bước.

---

## Kế hoạch triển khai kỹ thuật chi tiết

### Phía Frontend
1.  **Nâng cấp [QuestionBank.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/QuestionBank.tsx) & Thêm trang Export:**
    *   Xây dựng UI Grid thẻ phẳng tối giản hiển thị kích thước file, định dạng và trạng thái.
    *   Tích hợp modal hiển thị tiến độ xuất bản từng bước qua EventSource (SSE).

### Phía Backend
1.  **Chỉnh sửa [export.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/api/export.py):**
    *   Tích hợp template Slide Master `.potx` của VinUni vào luồng tạo PPTX.
    *   Viết code chuyển đổi LaTeX sang OMML XML cho file Word.
    *   Xây dựng API `/api/export/all-zip` nén dữ liệu trong RAM.
