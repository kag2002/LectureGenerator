# Implementation Plan: Elegant Landing Page for AI Lecture Assistant

Landing Page là mặt tiền của hệ thống **AI Lecture Assistant**, được thiết kế với giao diện theme trắng sang trọng, tối giản nhưng tinh tế. Mục tiêu chính là thu hút giảng viên sử dụng sản phẩm, giúp họ thấu hiểu các thuật ngữ chuyên môn phức tạp (CLO, Bloom's Taxonomy, RAG) thông qua các tương tác trực quan sinh động, đồng thời truyền tải sứ mệnh nâng tầm giáo dục của dự án.

---

## 1. Kiến trúc Thông tin (Information Architecture)

Landing Page được thiết kế dưới dạng Single Page Application (SPA) gồm các phân đoạn chính:
1.  **Navigation Bar**: Logo VinUni x AI Assistant, Menu liên kết nhanh, Nút "Thử nghiệm ngay" (Primary CTA) và Nút chuyển đổi ngôn ngữ.
2.  **Hero Section**: Slogan cuốn hút, mô tả ngắn gọn, nút CTA chính nổi bật trên nền hiệu ứng hạt (particle background) mượt mà.
3.  **Interactive Sandbox (Demo)**: Cho phép giảng viên nhập thử một chủ đề môn học và xem AI tạo ra đề cương hoặc câu hỏi Bloom thời gian thực.
4.  **Core Value Proposition**: Trình bày 3 lợi ích cốt lõi (Soạn giáo án siêu tốc, Chuẩn hóa CLO & Bloom, RAG thông minh từ tài liệu trường).
5.  **Interactive Academic Dictionary**: Module giải thích thuật ngữ (CLO, Bloom's Taxonomy, RAG, Vector DB) dạng thẻ tương tác lật.
6.  **Mission & Synergy Section**: Trình bày sứ mệnh giáo dục cá nhân hóa và sự hợp tác công nghệ giữa VinUni và Vingroup.
7.  **Testimonials & Proof**: Nhận xét từ các giảng viên đã thử nghiệm và số liệu chứng minh hiệu quả (ví dụ: Tiết kiệm 70% thời gian soạn bài).
8.  **Strategic Footer**: Bản quyền, liên kết chính sách bảo mật dữ liệu học thuật, mẫu đăng ký nhận tư vấn sâu.

---

## 2. Thiết kế Thẩm mỹ & Hiệu ứng UX/UI (White & Luxury)

-   **Bảng màu (Luxury White Palette)**:
    *   Màu nền: `#FAFAFA` (Off-white sang trọng) kết hợp `#FFFFFF` để phân tách section.
    *   Màu chữ chủ đạo: Xám than tối `#1A1A1A` (đảm bảo độ tương phản 4.5:1 chuẩn WCAG AA).
    *   Màu nhấn (Accent Colors): Đỏ hạt dẻ VinUni `#8C1D40` kết hợp vàng kim cát `#D4AF37` dạng gradient nhẹ cho các nút bấm và icon highlight.
-   **Typography**:
    *   Tiêu đề chính (Headings): Sử dụng Font Serif sang trọng **Playfair Display** hoặc **Outfit** mang hơi hướng học thuật, cao cấp.
    *   Nội dung (Body Text): Sử dụng font sans-serif **Inter** hoặc **Plus Jakarta Sans** dễ đọc trên mọi thiết bị.
-   **Hiệu ứng Động (GSAP & Framer Motion)**:
    *   *Text Reveal*: Dòng chữ Hero Section xuất hiện theo dạng trượt mượt mà (Fade-in-up) bằng GSAP.
    *   *Hover Glassmorphism*: Hiệu ứng thẻ nổi với border sáng nhẹ khi người dùng rê chuột qua.
    *   *ScrollTrigger*: Các section tự động fade-in nhẹ nhàng khi người dùng scroll đến, không giật lag.
    *   *Interactive Tooltips*: Rê chuột vào các từ khóa khó trong bản demo để hiển thị pop-up giải thích thuật ngữ sinh động.

---

## 3. Kiến trúc Backend & Tối ưu hóa Kỹ thuật

-   **Framework & Rendering**:
    *   Sử dụng **Next.js App Router (React)** kết hợp **SSG (Static Site Generation)** cho Landing Page chính để đạt tốc độ tải trang dưới 1.0 giây.
    *   Các thành phần tương tác như Demo Sandbox và Glossary sẽ được lazy-load nhằm giảm dung lượng JS bundle ban đầu.
-   **SEO & Web Vitals**:
    *   Đạt điểm Lighthouse tối thiểu **95+** cho cả Mobile và Desktop.
    *   Cung cấp đầy đủ Metadata, Open Graph, Sitemap tự động và JSON-LD Structured Data để tối ưu hóa SEO.
    *   Tối ưu hóa hình ảnh bằng định dạng `WebP`/`AVIF` và thiết lập kích thước rõ ràng để tránh hiện tượng CLS (Cumulative Layout Shift).
-   **Demo Sandboxing & Rate Limiting**:
    *   Tạo endpoint API riêng cho tính năng demo thử nghiệm tại `/api/v1/demo/generate`.
    *   Thiết lập Rate Limiting bằng Redis hoặc bộ nhớ đệm ở API Gateway (tối đa 3 request demo/IP/giờ) để tránh tình trạng spam và lãng phí tài nguyên LLM.
-   **Form Thu thập Thông tin & Email Queue**:
    *   Lưu thông tin đăng ký tư vấn vào bảng `landing_leads` trong SQLite/PostgreSQL.
    *   Đẩy tác vụ gửi email thông báo cho quản trị viên vào hàng đợi background job (Celery/Redis hoặc FastAPI BackgroundTasks) để không làm nghẽn luồng xử lý của người dùng.

---

## 4. Kịch bản Xác thực (Verification Plan)

### Kiểm thử tự động (Automated Tests)
1.  **Lighthouse Audit**: Chạy `lighthouse http://localhost:3000 --chrome-flags="--headless"` để kiểm tra hiệu năng, SEO, và khả năng tiếp cận (Accessibility).
2.  **API Rate Limiting Test**: Sử dụng script Python gửi liên tục 10 request lên endpoint demo để xác thực mã lỗi `429 Too Many Requests`.
3.  **UI Responsiveness**: Chạy bộ test Playwright giả lập thiết bị iPhone 15, iPad Air, và Macbook Pro để kiểm tra lỗi tràn viền hoặc vỡ Layout.

### Kiểm thử thủ công (Manual Verification)
1.  Người dùng truy cập Landing Page, kiểm tra hiệu ứng chuyển động có mượt mà trên các trình duyệt Safari, Chrome, Edge hay không.
2.  Thử nghiệm gõ chủ đề trong ô Sandbox để xem kết quả tạo gợi ý cấu trúc bài giảng có hiển thị đúng tiến trình (loading skeleton) hay không.
3.  Di chuột qua các từ viết tắt chuyên ngành (CLO, Bloom) để đảm bảo tooltip giải thích xuất hiện chính xác, dễ hiểu.
