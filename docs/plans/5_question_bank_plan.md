# Implementation Plan: Question Bank & Chatbot

Tập trung vào tính thực dụng khi thiết kế đề kiểm tra và tương tác trợ lý ảo thông minh. Giúp giảng viên nhanh chóng tinh chỉnh câu hỏi và theo dõi mức độ bao phủ chuẩn đầu ra (CLO).

---

## 5 Chủ đề Debate (User vs UX/UI vs Tech Lead)

### Chủ đề 1: Cách hiển thị danh sách câu hỏi (Accordion Stack Cards vs. Data Table)
*   **User:** Tôi muốn quét nhanh nội dung tất cả câu hỏi, xem đáp án nào đúng và giải thích mà không phải click mở từng trang. Nhưng nếu dài quá thì cuộn mỏi tay.
*   **UX/UI Designer:** Thiết kế danh sách thẻ dạng Accordion xếp chồng. Mỗi thẻ hiển thị sẵn Câu hỏi, mức Bloom và mã CLO. Chỉ phần giải thích chi tiết (explanation) mới nằm ẩn, click nhẹ để trượt mở ra.
*   **Tech Lead:** Dữ liệu câu hỏi được lấy từ endpoint `/api/questions/{chapter_id}`. Component React Accordion sẽ xử lý hoàn toàn ở client, không cần gọi lại API khi bấm mở/đóng thẻ, giúp phản hồi tức thì.
*   **Trade-off:**
    *   *Hiệu năng:* Render client cực nhanh, không tốn API call.
    *   *Trải nghiệm:* Vừa gọn gàng vừa dễ xem đáp án nhanh.
*   **Kết luận:** Sử dụng Accordion Stack Cards cho danh sách câu hỏi.

### Chủ đề 2: Cách điều chỉnh độ khó câu hỏi (AI Regeneration Slider vs. Text Chat Prompt)
*   **User:** Tôi muốn câu hỏi này khó hơn hoặc dễ đi mà không cần phải viết câu lệnh chat phức tạp nhờ AI sửa.
*   **UX/UI Designer:** Đặt một thanh trượt (Slider) 3 mức: *"Dễ | Trung bình | Khó"* ngay trên thẻ câu hỏi. Kéo thả slider sẽ kích hoạt hoạt cảnh AI quét qua và cập nhật câu hỏi mới.
*   **Tech Lead:** Khi slider chuyển mức, ta gọi API `/api/questions/{id}/regenerate` truyền tham số `difficulty`. Backend sử dụng LangGraph node để viết lại nội dung câu hỏi và các phương án nhiễu tương ứng, ghi đè vào SQLite và trả về.
*   **Trade-off:**
    *   *Hiệu năng:* Tốn 1 lượt gọi LLM API (~2-3 giây).
    *   *Trải nghiệm:* Vô cùng tiện lợi, giảng viên không cần suy nghĩ câu lệnh để chat.
*   **Kết luận:** Sử dụng Slider 3 cấp độ khó để yêu cầu AI tự chỉnh sửa câu hỏi trực tiếp.

### Chủ đề 3: Cấu trúc cơ sở dữ liệu cho nhiều loại câu hỏi (JSON Field vs. Relational Tables)
*   **User:** Tôi cần tạo nhiều dạng câu hỏi: Chọn một đáp án, chọn nhiều đáp án, điền vào chỗ trống, hoặc câu hỏi tự luận ngắn.
*   **UX/UI Designer:** Khi click "Thêm câu hỏi mới", hiển thị dropdown chọn dạng câu hỏi. Form điền sẽ thay đổi linh hoạt theo dạng được chọn.
*   **Tech Lead:** Thay vì tạo nhiều bảng phụ phức tạp trong SQLite, ta tiếp tục dùng bảng [Question](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/database/models.py#L84) hiện tại nhưng đổi trường `options_json` lưu mảng JSON tùy biến (cho MCQ/MSQ), trường `correct_answer` lưu text (cho tự luận/điền từ). Thêm trường `question_type` để phân loại.
*   **Trade-off:**
    *   *Hiệu năng:* Không cần kết nối nhiều bảng (JOINs), truy vấn danh sách câu hỏi cực nhanh.
    *   *Trải nghiệm:* Đáp ứng đa dạng nhu cầu kiểm tra đánh giá của giảng viên.
*   **Kết luận:** Dùng cấu trúc cột JSON linh hoạt trong SQLite để lưu trữ các định dạng câu hỏi khác nhau.

### Chủ đề 4: Giám sát độ phủ chuẩn đầu ra CLO (Live Sidebar Coverage vs. Separate Statistics Page)
*   **User:** Tôi muốn biết ngay bộ câu hỏi hiện tại đã phủ đủ CLO của khóa học chưa khi tôi đang sửa câu hỏi.
*   **UX/UI Designer:** Đặt một sidebar nhỏ cố định bên phải hiển thị danh sách mã CLO và các thanh tiến trình nhỏ (Progress Bars) chuyển màu động (Đỏ -> Vàng -> Xanh) dựa trên số câu hỏi tương ứng.
*   **Tech Lead:** Viết một hook React lắng nghe sự thay đổi của danh sách câu hỏi ở client-side. Mỗi khi giảng viên thêm/sửa/xóa câu hỏi hoặc đổi CLO, React sẽ tự động đếm lại số câu theo CLO ở local và cập nhật thanh tiến trình tức thì mà không cần gọi API.
*   **Trade-off:**
    *   *Hiệu năng:* Tái tính toán ở client-side siêu nhẹ, không tốn request mạng.
    *   *Trải nghiệm:* Trực quan hóa tiến trình liên tục, giảng viên biết khi nào đề thi đạt chuẩn để dừng lại.
*   **Kết luận:** Xây dựng Sidebar giám sát độ phủ CLO cập nhật thời gian thực ở Client-side.

### Chủ đề 5: Khung Chat trợ lý ảo đồng hành (AI Side Drawer vs. Floating Chat Window)
*   **User:** Tôi muốn chat với AI để hỏi về kiến thức hoặc nhờ giải thích nội dung, nhưng cửa sổ chat không được che khuất phần soạn câu hỏi chính.
*   **UX/UI Designer:** Thiết kế một thanh kéo nhỏ ở mép màn hình. Click vào sẽ trượt ra một Side Drawer chiếm 25% màn hình từ bên phải. Có nút thu gọn/mở rộng nhanh.
*   **Tech Lead:** Side Drawer sẽ được quản lý ở layout ngoài cùng của Dashboard. Khi hoạt động, nó sẽ tự động gửi kèm payload `current_page_context` (ví dụ: `chapter_id`, `active_question_id`) trong mỗi tin nhắn chat để AI hiểu rõ ngữ cảnh giảng viên đang ở trang nào mà không cần hỏi lại.
*   **Trade-off:**
    *   *Hiệu năng:* Không ảnh hưởng.
    *   *Trải nghiệm:* Trợ lý ảo hiểu ngữ cảnh cực tốt, chuyển tiếp thông tin mượt mà.
*   **Kết luận:** Triển khai Chatbot dạng Side Drawer tích hợp gửi kèm ngữ cảnh trang hiện tại.

---

## Kế hoạch triển khai kỹ thuật chi tiết

### Phía Frontend
1.  **Nâng cấp [QuestionBank.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/QuestionBank.tsx):**
    *   Tái cấu trúc giao diện theo kiểu thẻ Accordion Stack.
    *   Thêm Slider thay đổi độ khó câu hỏi và Form chọn dạng câu hỏi mới.
    *   Tích hợp Sidebar đếm và vẽ thanh tiến trình bao phủ CLO ở client-side.
2.  **Nâng cấp [ChatBot.tsx](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/frontend/src/views/ChatBot.tsx):**
    *   Chuyển đổi Chatbot thành component Side Drawer mở rộng/thu gọn mượt mà.
    *   Đính kèm metadata trang hiện tại khi gọi API chat.

### Phía Backend
1.  **Chỉnh sửa [questions.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/api/questions.py):**
    *   Hỗ trợ API `/api/questions/{id}/regenerate` để viết lại câu hỏi theo độ khó.
    *   Cập nhật logic CRUD câu hỏi hỗ trợ các trường `question_type`, `options_json` linh hoạt.
