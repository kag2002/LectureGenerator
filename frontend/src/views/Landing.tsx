import React, { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Award, ShieldCheck, Layers, Send, ArrowRight, HelpCircle, CheckCircle, Zap, Menu, X, ChevronRight, ChevronLeft, Lock, AlertTriangle, Check } from 'lucide-react';
import { User } from '@/types';
import '../styles/Landing.css';

export interface LandingProps {
  user: User | null;
  onNavigate: (view: string) => void;
}

export default function Landing({ user, onNavigate }: LandingProps) {
  // Navigation scrolling check
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sandbox states
  const [sandboxInput, setSandboxInput] = useState('Kinh tế vi mô');
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  // Glossary cards flip state
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});

  // Contact form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Viện Khoa học Kỹ thuật');
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  const toggleCard = (id: string) => {
    setFlippedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSuggestionClick = (subj: string) => {
    setSandboxInput(subj);
  };

  const handleSandboxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxInput.trim()) return;

    setSandboxLoading(true);
    setSandboxResult(null);

    // Simulate multi-step compilation process (Rounds of debate style)
    const steps = [
      'Đang quét kho dữ liệu học liệu VinUni...',
      'Đang phân tích cấu trúc & liên kết mục tiêu chuẩn đầu ra CLO...',
      'Đang ánh xạ câu hỏi thi theo 6 cấp độ Thang đo Bloom...',
    ];

    setLoadingStep(steps[0]);
    
    setTimeout(() => {
      setLoadingStep(steps[1]);
      setTimeout(() => {
        setLoadingStep(steps[2]);
        setTimeout(() => {
          // Finish and generate mock output
          const query = sandboxInput.trim();
          let mockData = {
            subject: query,
            clos: [
              `CLO1: Trình bày các định lý cơ bản và phương pháp tính của ${query}.`,
              `CLO2: Giải thích và phân tích hành vi của các tác nhân trong hệ thống mô phỏng ${query}.`,
              `CLO3: Đánh giá độ chính xác và ứng dụng kiến thức của ${query} vào bài tập thực hành.`
            ],
            questions: [
              { level: 'B2 - Thông hiểu', text: `Giải thích tại sao cơ chế cốt lõi trong ${query} lại đóng vai trò quyết định trong việc tối ưu hóa hệ thống?` },
              { level: 'B4 - Phân tích', text: `Phân tích tác động của các yếu tố ngoại cảnh đối với quy trình vận hành lý thuyết của ${query}.` }
            ]
          };

          if (query.toLowerCase().includes('kinh tế vi mô')) {
            mockData = {
              subject: 'Kinh tế vi mô (Microeconomics)',
              clos: [
                'CLO1: Giải thích các khái niệm cơ bản về cung, cầu, thặng dư và trạng thái cân bằng thị trường.',
                'CLO2: Phân tích hành vi lựa chọn tối ưu của người tiêu dùng và quyết định sản xuất của doanh nghiệp.',
                'CLO3: Đánh giá tác động của các chính sách can thiệp kinh tế (thuế, giá trần, giá sàn) từ Chính phủ.'
              ],
              questions: [
                { level: 'B2 - Thông hiểu', text: 'Giải thích tại sao đường cầu của hầu hết hàng hóa lại dốc xuống dưới từ trái sang phải?' },
                { level: 'B4 - Phân tích', text: 'Phân tích tổn thất vô ích (Deadweight Loss) xuất hiện khi Chính phủ áp dụng mức thuế tiêu dùng đặc biệt lên sản phẩm.' }
              ]
            };
          } else if (query.toLowerCase().includes('lập trình web')) {
            mockData = {
              subject: 'Lập trình ứng dụng Web (Web Development)',
              clos: [
                'CLO1: Thiết kế giao diện web responsive đạt tiêu chuẩn thẩm mỹ hiện đại sử dụng HTML5, CSS3 và React.',
                'CLO2: Xây dựng API động Client-Server sử dụng RESTful kiến trúc Node.js/FastAPI kết nối cơ sở dữ liệu.',
                'CLO3: Áp dụng các giải pháp kiểm tra bảo mật OWASP cơ bản chống lại các lỗi bảo mật phổ biến.'
              ],
              questions: [
                { level: 'B3 - Vận dụng', text: 'Viết một React Component hoàn chỉnh sử dụng hooks để fetch và hiển thị danh sách bài giảng từ endpoint RESTful.' },
                { level: 'B5 - Đánh giá', text: 'So sánh và đánh giá hiệu quả sử dụng tài nguyên giữa Client-Side Rendering (CSR) và Server-Side Rendering (SSR) trong dự án Next.js.' }
              ]
            };
          } else if (query.toLowerCase().includes('triết học')) {
            mockData = {
              subject: 'Triết học Mác - Lênin',
              clos: [
                'CLO1: Trình bày thế giới quan và phương pháp luận duy vật biện chứng về tự nhiên, xã hội và tư duy.',
                'CLO2: Phân tích mối quan hệ biện chứng giữa lực lượng sản xuất và quan hệ sản xuất trong tiến trình lịch sử.',
                'CLO3: Vận dụng phương pháp luận biện chứng vào thực tiễn nhận thức và giải quyết các bài toán xã hội.'
              ],
              questions: [
                { level: 'B2 - Thông hiểu', text: 'Nêu và giải thích định nghĩa vật chất của V.I. Lênin và ý nghĩa phương pháp luận khoa học của nó.' },
                { level: 'B4 - Phân tích', text: 'Phân tích mâu thuẫn biện chứng giữa sự phát triển nhanh chóng của lực lượng sản xuất và tính tụt hậu của quan hệ sản xuất ở nước ta hiện nay.' }
              ]
            };
          }

          setSandboxResult(mockData);
          setSandboxLoading(false);
        }, 1000);
      }, 1000);
    }, 1000);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email) return;

    setContactLoading(true);
    setTimeout(() => {
      setContactSuccess(true);
      setContactLoading(false);
      setFullName('');
      setEmail('');
    }, 1200);
  };

  return (
    <div className="landing-body">
      {/* Navigation Bar */}
      <nav className={`landing-nav ${scrolled ? 'scrolled' : ''} ${mobileMenuOpen ? 'menu-open' : ''}`}>
        <div className="landing-logo-container" onClick={() => { setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <div className="landing-logo-badge">VINUNI</div>
          <div className="landing-logo-text">AI <span>Assistant</span></div>
        </div>

        <ul className={`landing-nav-links ${mobileMenuOpen ? 'show' : ''}`}>
          <li><a href="#features" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Tính năng</a></li>
          <li><a href="#pain-points" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Nỗi đau & Giải pháp</a></li>
          <li><a href="#glossary" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Giải nghĩa Thuật ngữ</a></li>
          <li><a href="#mission" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Sứ mệnh</a></li>
          <li><a href="#testimonials" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Đánh giá</a></li>
          <li><a href="#contact" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Hợp tác</a></li>
        </ul>

        <div className="landing-nav-actions">
          {user ? (
            <button className="landing-btn-primary" onClick={() => { setMobileMenuOpen(false); onNavigate('dashboard'); }}>
              Vào Dashboard
            </button>
          ) : (
            <>
              <button className="landing-btn-secondary" onClick={() => { setMobileMenuOpen(false); onNavigate('login'); }}>
                Đăng Nhập
              </button>
              <button className="landing-btn-primary" onClick={() => { setMobileMenuOpen(false); onNavigate('login'); }}>
                Thử nghiệm ngay
              </button>
            </>
          )}

          <button className="landing-mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation menu">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="landing-hero">
        <div className="landing-badge-premium">
          <Sparkles size={14} /> <span>HỆ THỐNG CAO CẤP</span> TÀI TRỢ BỞI VINUNI X VINGROUP
        </div>
        <h1 className="landing-hero-title">
          Nâng Tầm Giáo Trình Với <span>Trí Tuệ Nhân Tạo</span> Đồng Hành
        </h1>
        <p className="landing-hero-subtitle">
          Công cụ thiết kế bài giảng, đồng bộ giáo trình và tự động kiểm định ngân hàng câu hỏi thi chuẩn hóa đầu ra CLO & Thang nhận thức Bloom.
        </p>

        <div className="landing-hero-actions">
          <button className="landing-btn-primary" onClick={() => onNavigate('login')}>
            Bắt đầu Soạn thảo <ArrowRight size={16} style={{ marginLeft: 6, display: 'inline' }} />
          </button>
          <a href="#sandbox" className="landing-btn-secondary" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            Trải nghiệm thử
          </a>
        </div>

        {/* Interactive Sandbox Widget */}
        <div id="sandbox" className="landing-sandbox">
          <div className="landing-sandbox-header">
            <div>
              <h2 className="landing-sandbox-title">
                Học thử nghiệm nhanh <span>AI Sandbox</span>
              </h2>
              <p className="landing-sandbox-subtitle">
                Nhập tên môn học giảng dạy để xem AI thiết kế đầu ra chuẩn mực trong vài giây.
              </p>
            </div>
            <Sparkles size={24} style={{ color: '#c5a880' }} />
          </div>

          <form onSubmit={handleSandboxSubmit}>
            <div className="landing-sandbox-input-row">
              <input
                type="text"
                className="landing-sandbox-input"
                placeholder="Nhập tên môn học (Ví dụ: Kinh tế vi mô, Lập trình Web...)"
                value={sandboxInput}
                onChange={(e) => setSandboxInput(e.target.value)}
                disabled={sandboxLoading}
              />
              <button type="submit" className="landing-btn-primary" disabled={sandboxLoading}>
                {sandboxLoading ? 'Đang phân tích...' : 'Trải nghiệm nhanh'}
              </button>
            </div>
          </form>

          <div className="landing-sandbox-suggestions">
            <span style={{ fontSize: '13px', color: '#64748b', alignSelf: 'center' }}>Gợi ý nhanh:</span>
            <button className="landing-sandbox-suggestion-btn" onClick={() => handleSuggestionClick('Kinh tế vi mô')}>
              Kinh tế vi mô
            </button>
            <button className="landing-sandbox-suggestion-btn" onClick={() => handleSuggestionClick('Lập trình Web')}>
              Lập trình Web
            </button>
            <button className="landing-sandbox-suggestion-btn" onClick={() => handleSuggestionClick('Triết học Mác - Lênin')}>
              Triết học Mác - Lênin
            </button>
          </div>

          <div className="landing-sandbox-output-box">
            {sandboxLoading && (
              <div className="landing-sandbox-output-loading">
                <div className="animate-spin" style={{ width: 24, height: 24, border: '3px solid #8c1d40', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                <p style={{ margin: 0, fontWeight: 500 }}>{loadingStep}</p>
              </div>
            )}

            {!sandboxLoading && !sandboxResult && (
              <div className="landing-sandbox-output-empty">
                <HelpCircle size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '14px' }}>Nhấp "Trải nghiệm nhanh" ở trên để xem bản phác thảo giáo trình tự động.</p>
              </div>
            )}

            {!sandboxLoading && sandboxResult && (
              <div className="landing-sandbox-output-success">
                <h3 className="landing-sandbox-output-h3">
                  Kết quả phân tích môn học: {sandboxResult.subject}
                </h3>
                <div className="landing-sandbox-output-grid">
                  <div className="landing-sandbox-output-clo">
                    <div className="landing-sandbox-output-title">Liên kết CLOs của môn học</div>
                    <ul className="landing-sandbox-output-list">
                      {sandboxResult.clos.map((clo: string, idx: number) => (
                        <li key={idx}>{clo}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="landing-sandbox-output-questions">
                    <div className="landing-sandbox-output-title">Bộ câu hỏi thi chuẩn Bloom mẫu</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sandboxResult.questions.map((q: any, idx: number) => (
                        <div key={idx} style={{ fontSize: '14px', borderLeft: '3px solid #8c1d40', paddingLeft: 10 }}>
                          <span style={{ fontWeight: 700, color: '#8c1d40', fontSize: '12px', display: 'block', textTransform: 'uppercase' }}>
                            {q.level}
                          </span>
                          <span>{q.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Academic Glossary Section */}
      <section id="glossary" className="landing-section-glossary">
        <div className="landing-section-title-wrapper">
          <span className="landing-section-badge">Giải nghĩa thuật ngữ</span>
          <h2 className="landing-section-title">
            Khái niệm Cốt lõi <span>Dễ hiểu nhất</span>
          </h2>
          <p className="landing-section-subtitle-small">
            Chúng tôi đơn giản hóa các khái niệm để bất kỳ ai - dù là giảng viên hay người dùng tò mò từ mọi ngành nghề - cũng có thể nắm bắt giá trị thực tế của hệ thống.
          </p>
        </div>

        <div className="landing-glossary-grid-static">
          {/* Card 0: Syllabus */}
          <div className="landing-glossary-static-card item-syllabus">
            <div className="landing-glossary-card-header">
              <span className="landing-glossary-badge-type pedagogy">LỘ TRÌNH KHUNG</span>
              <h3 className="landing-glossary-title-static">Syllabus (Kế hoạch môn học)</h3>
            </div>
            <div className="landing-glossary-card-body">
              <p className="landing-glossary-desc-static">
                Là bản mô tả toàn bộ lộ trình học tập của một môn học, liệt kê rõ các chủ đề học tập từng tuần, danh mục tài liệu nghiên cứu bắt buộc, và các bài thi đánh giá.
              </p>
              <div className="landing-glossary-easy-explain">
                <span className="easy-label">Định nghĩa trực quan:</span>
                <p>Đóng vai trò như một "bản cam kết học tập" minh bạch giữa giảng viên, nhà trường và học viên trước khi bắt đầu khóa học.</p>
              </div>
              <div className="landing-glossary-example-static">
                <span className="example-label">Tại sao cần đánh giá?</span>
                <p>Đánh giá kế hoạch giúp đảm bảo nội dung giảng dạy thực tế bám sát đúng khung chương trình chuẩn quốc tế, phân bổ thời lượng hợp lý và không bị quá tải.</p>
              </div>
              <div className="landing-glossary-app">
                <strong>Hỗ trợ từ AI:</strong> Tự động phân tích file đề cương PDF để phác thảo sơ đồ chương học và phân bổ thời lượng giảng dạy chỉ trong vài giây.
              </div>
            </div>
          </div>

          {/* Card 1: CLO */}
          <div className="landing-glossary-static-card item-clo">
            <div className="landing-glossary-card-header">
              <span className="landing-glossary-badge-type pedagogy">NĂNG LỰC ĐẠT ĐƯỢC</span>
              <h3 className="landing-glossary-title-static">CLO (Kỹ năng thực tế sau khóa học)</h3>
            </div>
            <div className="landing-glossary-card-body">
              <p className="landing-glossary-desc-static">
                Là những kỹ năng, kiến thức và năng lực thực tế mà học viên chắc chắn sẽ sở hữu (chứ không chỉ là ghi nhớ lý thuyết) sau khi hoàn thành khóa học.
              </p>
              <div className="landing-glossary-easy-explain">
                <span className="easy-label">Định nghĩa trực quan:</span>
                <p>Trực quan hóa giá trị của việc học: "Học xong môn này, bạn có thể tự tay làm ra sản phẩm gì hoặc giải quyết được vấn đề gì?".</p>
              </div>
              <div className="landing-glossary-example-static">
                <span className="example-label">Tại sao cần đánh giá?</span>
                <p>Để đảm bảo đề thi và bài giảng luôn tập trung vào việc thực hành thực tế, tránh việc học lý thuyết suông thiếu tính ứng dụng.</p>
              </div>
              <div className="landing-glossary-app">
                <strong>Hỗ trợ từ AI:</strong> Tự động rà soát slide bài giảng và ngân hàng câu hỏi để kiểm tra xem đã giúp người học rèn luyện đúng kỹ năng thực tế chưa.
              </div>
            </div>
          </div>

          {/* Card 2: Bloom */}
          <div className="landing-glossary-static-card item-bloom">
            <div className="landing-glossary-card-header">
              <span className="landing-glossary-badge-type pedagogy">ĐỘ KHÓ TƯ DUY</span>
              <h3 className="landing-glossary-title-static">Thang đo Bloom (Mức độ thử thách tư duy)</h3>
            </div>
            <div className="landing-glossary-card-body">
              <p className="landing-glossary-desc-static">
                Là hệ thống phân cấp độ tư duy từ dễ đến khó: đi từ việc ghi nhớ lý thuyết cơ bản, thấu hiểu bản chất, vận dụng thực tế, cho đến phân tích sâu và sáng tạo giải pháp.
              </p>
              <div className="landing-glossary-easy-explain">
                <span className="easy-label">Định nghĩa trực quan:</span>
                <p>Thước đo chiều sâu nhận thức của học viên, giúp phát triển tư duy độc lập và phản biện.</p>
              </div>
              <div className="landing-glossary-example-static">
                <span className="example-label">Tại sao cần đánh giá?</span>
                <p>Giúp giảng viên thiết kế đề thi có độ phân hóa tốt, tránh việc đề thi quá dễ (chỉ học vẹt) hoặc quá khó (vượt ngoài kiến thức bài học).</p>
              </div>
              <div className="landing-glossary-app">
                <strong>Hỗ trợ từ AI:</strong> AI tự động điều chỉnh và làm mới câu hỏi trắc nghiệm theo các mức thử thách tư duy mong muốn của giảng viên.
              </div>
            </div>
          </div>

          {/* Card 3: RAG */}
          <div className="landing-glossary-static-card item-rag">
            <div className="landing-glossary-card-header">
              <span className="landing-glossary-badge-type tech">CÔNG NGHỆ CHỐNG ẢO TƯỞNG</span>
              <h3 className="landing-glossary-title-static">RAG (AI tra cứu tài liệu & Chống ảo tưởng)</h3>
            </div>
            <div className="landing-glossary-card-body">
              <p className="landing-glossary-desc-static">
                Là công nghệ giúp AI tự động tra cứu, đánh giá và trích xuất thông tin trực tiếp từ các tài liệu, sách giáo trình uy tín được tải lên trước khi tạo nội dung.
              </p>
              <div className="landing-glossary-easy-explain">
                <span className="easy-label">Định nghĩa trực quan:</span>
                <p>Hoạt động như một trợ lý mở đúng cuốn sách giáo khoa được chỉ định để trả lời, triệt tiêu hoàn toàn hiện tượng AI tự bịa đặt thông tin (ảo tưởng).</p>
              </div>
              <div className="landing-glossary-example-static">
                <span className="example-label">Tại sao cần thiết?</span>
                <p>Giúp tra cứu nhanh và đánh giá độ tin cậy của tài liệu tham khảo chính thống, đảm bảo bài giảng và đề kiểm tra luôn có nguồn gốc chuẩn học thuật uy tín.</p>
              </div>
              <div className="landing-glossary-app">
                <strong>Hỗ trợ từ AI:</strong> Đối chiếu bài viết với giáo trình và tài liệu nghiên cứu chuẩn để tự động biên soạn nội dung giảng dạy có trích dẫn nguồn rõ ràng.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points vs AI Solutions Section */}
      <section id="pain-points" className="landing-section-pain-points">
        <div className="landing-section-title-wrapper">
          <span className="landing-section-badge">Thách thức & Giải pháp</span>
          <h2 className="landing-section-title">
            Tháo Gỡ <span>Nỗi Đau Trong Giảng Dạy & Đào Tạo</span>
          </h2>
          <p className="landing-section-subtitle-small">
            Chúng tôi thiết kế hệ thống để trực tiếp tháo gỡ các trở ngại thực tế mà giảng viên và các nhà quản lý đào tạo gặp phải.
          </p>
        </div>

        <div className="landing-pain-grid">
          {/* Column 1: Pain Points */}
          <div className="landing-pain-col pain-side">
            <h3 className="landing-pain-col-title">
              <span>NỖI ĐAU CỦA GIẢNG VIÊN</span> (Thách thức hiện tại)
            </h3>
            
            <div className="landing-pain-card pain">
              <div className="landing-pain-icon-badge">
                <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              </div>
              <div className="landing-pain-content">
                <h4>1. Ngập trong công tác hành chính</h4>
                <p>Mất hàng tuần ròng rã tự soạn đề cương bài giảng, phân bổ thời lượng lý thuyết, thực hành và đong đếm số tiết học thủ công.</p>
              </div>
            </div>

            <div className="landing-pain-card pain">
              <div className="landing-pain-icon-badge">
                <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              </div>
              <div className="landing-pain-content">
                <h4>2. Đề thi có nhiều "Điểm mù" chất lượng</h4>
                <p>Khó kiểm định xem ngân hàng câu hỏi kiểm tra đã thực sự phủ hết 100% các Chuẩn đầu ra (CLO) hay chỉ tập trung ở vài chương dễ học.</p>
              </div>
            </div>

            <div className="landing-pain-card pain">
              <div className="landing-pain-icon-badge">
                <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              </div>
              <div className="landing-pain-content">
                <h4>3. Dạy một đường, thi đánh giá một nẻo</h4>
                <p>Nội dung bài học trên lớp chỉ dạy lý thuyết nhận biết (Bloom thấp) nhưng câu hỏi đề thi lại đòi hỏi phân tích, ứng dụng thực tế (Bloom cao).</p>
              </div>
            </div>

            <div className="landing-pain-card pain">
              <div className="landing-pain-icon-badge">
                <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              </div>
              <div className="landing-pain-content">
                <h4>4. Lo ngại rò rỉ bản quyền & Đề thi</h4>
                <p>Đưa tài liệu bài giảng nội bộ hoặc đề thi chưa công bố lên các AI công cộng (như ChatGPT, Gemini) có nguy cơ cao rò rỉ dữ liệu.</p>
              </div>
            </div>
          </div>

          {/* Column 2: Solutions */}
          <div className="landing-pain-col solution-side">
            <h3 className="landing-pain-col-title">
              <span>CÁCH AI ASSISTANT GIẢI QUYẾT</span> (Giải pháp vượt trội)
            </h3>

            <div className="landing-pain-card solution">
              <div className="landing-pain-icon-badge">
                <Check size={18} style={{ color: '#10b981' }} />
              </div>
              <div className="landing-pain-content">
                <h4>1. Tự động hóa thiết kế syllabus</h4>
                <p>Trích xuất đề cương tự động từ tài liệu của bạn trong 30 giây, gợi ý phân bổ thời lượng chương học chuẩn khoa học và thông minh.</p>
              </div>
            </div>

            <div className="landing-pain-card solution">
              <div className="landing-pain-icon-badge">
                <Check size={18} style={{ color: '#10b981' }} />
              </div>
              <div className="landing-pain-content">
                <h4>2. Ma trận bao phủ & Sinh bù đắp</h4>
                <p>Bản đồ nhiệt trực quan hóa độ phủ Bloom-CLO tức thì. Hàng đợi sinh tự động thông minh chạy ngầm để lấp đầy các ô bị thiếu câu hỏi.</p>
              </div>
            </div>

            <div className="landing-pain-card solution">
              <div className="landing-pain-icon-badge">
                <Check size={18} style={{ color: '#10b981' }} />
              </div>
              <div className="landing-pain-content">
                <h4>3. Chuẩn hóa thang đo nhận thức kép</h4>
                <p>Tự động ràng buộc liên kết chéo giữa câu hỏi kiểm tra và nội dung slide bài giảng theo đúng 6 cấp độ nhận thức Thang đo Bloom.</p>
              </div>
            </div>

            <div className="landing-pain-card solution">
              <div className="landing-pain-icon-badge">
                <Check size={18} style={{ color: '#10b981' }} />
              </div>
              <div className="landing-pain-content">
                <h4>4. Công nghệ RAG & Bảo mật 100%</h4>
                <p>AI đọc trực tiếp file tài liệu PDF qua hệ thống RAG nội bộ an toàn. Dữ liệu chạy cục bộ hoặc trên máy chủ riêng biệt khép kín của nhà trường.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values / Attractive Features Section */}
      <section id="features" className="landing-section-values">
        <div className="landing-section-title-wrapper">
          <span className="landing-section-badge">Tính năng hấp dẫn</span>
          <h2 className="landing-section-title">
            Trải nghiệm các <span>Công cụ Đột phá từ AI</span>
          </h2>
          <p className="landing-section-subtitle-small">
            Được phát triển với tiêu chuẩn khắt khe nhất của VinUni giúp giảng viên dạy nhẹ nhàng hơn và học viên học hiệu quả hơn.
          </p>
        </div>

        <div className="landing-values-grid">
          <div className="landing-value-card">
            <div className="landing-value-icon">
              <Layers size={24} />
            </div>
            <h3 className="landing-value-card-title">Soạn Giáo Án Zen Mode</h3>
            <p className="landing-value-card-desc">
              Giao diện viết giáo án tối giản kết hợp trợ lý AI thông minh gợi ý ý chính slide, tự động gắn thẻ chuẩn đầu ra CLO và Bloom theo thời gian thực.
            </p>
          </div>

          <div className="landing-value-card">
            <div className="landing-value-icon">
              <Zap size={24} />
            </div>
            <h3 className="landing-value-card-title">Hàng Đợi Khắc Phục Điểm Mù</h3>
            <p className="landing-value-card-desc">
              Một click khởi chạy hàng đợi sinh tự động hàng loạt để bù đắp các chuẩn đầu ra thiếu câu hỏi kiểm tra hoặc thiếu slide giảng dạy.
            </p>
          </div>

          <div className="landing-value-card">
            <div className="landing-value-icon">
              <BookOpen size={24} />
            </div>
            <h3 className="landing-value-card-title">Ma Trận Trực Quan Hóa</h3>
            <p className="landing-value-card-desc">
              Bản đồ nhiệt Bloom-CLO sinh động giúp giảng viên theo dõi sát sao mức độ bao phủ kiến thức giảng dạy và kiểm tra đánh giá của môn học.
            </p>
          </div>

          <div className="landing-value-card">
            <div className="landing-value-icon">
              <Lock size={24} />
            </div>
            <h3 className="landing-value-card-title">Bảo Mật Học Liệu PDF</h3>
            <p className="landing-value-card-desc">
              Hệ thống RAG nâng cao giúp AI trích dẫn chính xác bài giảng từ giáo trình riêng được nạp vào, cam kết bảo mật 100% sở hữu trí tuệ.
            </p>
          </div>
        </div>
      </section>



      {/* Sứ mệnh Section */}
      <section id="mission" className="landing-section-mission">
        <div className="landing-mission-container">
          <div className="landing-mission-text">
            <span className="landing-section-badge" style={{ display: 'block', marginBottom: 12 }}>Sứ mệnh của chúng tôi</span>
            <div className="landing-mission-quote">
              "Kiến tạo trải nghiệm giáo dục cá nhân hóa thông qua sức mạnh cộng tác giữa trí tuệ nhân tạo và chuyên môn giảng viên."
            </div>
            <p className="landing-mission-para">
              Hệ thống AI Lecture Assistant không thay thế vai trò cốt lõi của người Thầy. Ngược lại, chúng tôi giải phóng các giáo sư khỏi công việc thủ tục hành chính, giúp họ tập trung vào nghiên cứu và truyền cảm hứng thực sự cho sinh viên VinUni.
            </p>
            <p className="landing-mission-para">
              Hợp tác chặt chẽ cùng các công nghệ hiện đại nhất từ Vingroup, chúng tôi tự hào mang lại một môi trường học thuật số đạt tiêu chuẩn giáo dục quốc tế QS 5 sao.
            </p>

            <div className="landing-mission-logos">
              <span style={{ fontSize: '13px', color: '#64748b' }}>Đồng hành phát triển:</span>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ fontWeight: 'bold', color: '#0b2545', fontSize: '14px', letterSpacing: '1px' }}>VINUNI</div>
                <div style={{ fontWeight: 'normal', color: '#8c1d40', fontSize: '14px', fontStyle: 'italic' }}>VINGROUP</div>
              </div>
            </div>
          </div>

          <div className="landing-mission-image-wrapper">
            <img
              className="landing-mission-image"
              src="/vinuni_academic_hero.png"
              alt="Học thuật VinUni"
            />
            <div className="landing-mission-image-overlay">
              <p className="landing-mission-image-caption">Đồng hành cùng sự nghiệp số hóa giáo trình đại học</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="landing-section-testimonials">
        <div className="landing-section-title-wrapper">
          <span className="landing-section-badge">Đánh giá thực tế</span>
          <h2 className="landing-section-title">
            Chia sẻ từ các <span>Giáo sư & Giảng viên</span>
          </h2>
        </div>

        <div className="landing-testimonials-container">
          <div className="landing-testimonial-card">
            <p className="landing-testimonial-quote">
              "Việc soạn ngân hàng đề thi chuẩn Bloom trước đây ngốn của tôi hàng tuần. Giờ đây với AI Assistant, tôi chỉ cần duyệt và chỉnh sửa từ khung có sẵn trong vài giờ."
            </p>
            <div className="landing-testimonial-author">
              <div className="landing-testimonial-avatar">NK</div>
              <div className="landing-testimonial-info">
                <div className="landing-testimonial-name">GS. Nguyễn Khắt Khe</div>
                <div className="landing-testimonial-title">Khoa Khoa học Máy tính</div>
              </div>
            </div>
          </div>

          <div className="landing-testimonial-card">
            <p className="landing-testimonial-quote">
              "Khả năng tự động kiểm tra xem các slide bài giảng đã đạt chuẩn CLO hay chưa của hệ thống giúp chúng tôi tự tin hơn rất nhiều khi nộp báo cáo kiểm định chất lượng."
            </p>
            <div className="landing-testimonial-author">
              <div className="landing-testimonial-avatar">LT</div>
              <div className="landing-testimonial-info">
                <div className="landing-testimonial-name">TS. Lê Thị Thảo</div>
                <div className="landing-testimonial-title">Viện Khoa học Sức khỏe</div>
              </div>
            </div>
          </div>

          <div className="landing-testimonial-card">
            <p className="landing-testimonial-quote">
              "Học liệu PDF được nạp trực tiếp qua RAG vô cùng chính xác. AI trích dẫn đúng bài đọc bắt buộc giúp bài học có chiều sâu và tính xác thực học thuật rất cao."
            </p>
            <div className="landing-testimonial-author">
              <div className="landing-testimonial-avatar">VP</div>
              <div className="landing-testimonial-info">
                <div className="landing-testimonial-name">GS. Vũ Phong</div>
                <div className="landing-testimonial-title">Viện Quản trị Kinh doanh</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Consultation Form */}
      <section id="contact" className="landing-section-contact">
        <div className="landing-contact-card">
          <h2 className="landing-contact-title">Đăng Ký Tư Vấn & Hợp Tác</h2>
          <p className="landing-contact-subtitle">
            Hợp tác triển khai AI Assistant cho Khoa hoặc Viện đào tạo của bạn tại VinUni.
          </p>

          {contactSuccess ? (
            <div className="landing-contact-success-msg">
              <CheckCircle size={28} style={{ marginBottom: 8 }} />
              <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>Gửi đăng ký thành công!</p>
              <p style={{ margin: 0, fontSize: '14px' }}>Chúng tôi sẽ liên hệ tư vấn trực tiếp qua email của bạn trong vòng 24 giờ làm việc.</p>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="landing-contact-form">
              <div className="landing-form-group">
                <label className="landing-form-label">Họ và tên giảng viên</label>
                <input
                  type="text"
                  className="landing-form-input"
                  placeholder="Nhập họ và tên của bạn"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="landing-form-group">
                <label className="landing-form-label">Email công tác</label>
                <input
                  type="email"
                  className="landing-form-input"
                  placeholder="username@vinuni.edu.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="landing-form-group">
                <label className="landing-form-label">Đơn vị công tác</label>
                <select className="landing-form-select" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="Viện Khoa học Kỹ thuật">Viện Khoa học Kỹ thuật & Khoa học Máy tính</option>
                  <option value="Viện Quản trị Kinh doanh">Viện Quản trị Kinh doanh</option>
                  <option value="Viện Khoa học Sức khỏe">Viện Khoa học Sức khỏe</option>
                  <option value="Đơn vị khác">Đơn vị/Trường Đại học liên kết ngoài</option>
                </select>
              </div>

              <button type="submit" className="landing-contact-submit-btn" disabled={contactLoading}>
                {contactLoading ? 'Đang gửi thông tin...' : 'Gửi yêu cầu đăng ký'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <h4>AI Lecture Assistant</h4>
            <p>Hệ thống hỗ trợ giảng viên VinUni chuyển đổi số giáo trình, biên soạn câu hỏi thi và giáo án thông minh đạt chuẩn học thuật quốc tế.</p>
          </div>
          <div className="landing-footer-links-col">
            <h5>Liên kết nhanh</h5>
            <ul className="landing-footer-links">
              <li><a href="#features" className="landing-footer-link">Tính năng</a></li>
              <li><a href="#glossary" className="landing-footer-link">Thuật ngữ</a></li>
              <li><a href="#mission" className="landing-footer-link">Sứ mệnh</a></li>
            </ul>
          </div>
          <div className="landing-footer-links-col">
            <h5>Chính sách</h5>
            <ul className="landing-footer-links">
              <li><a href="#" className="landing-footer-link">Bảo mật dữ liệu học tập</a></li>
              <li><a href="#" className="landing-footer-link">Điều khoản dịch vụ</a></li>
              <li><a href="#" className="landing-footer-link">Hướng dẫn sử dụng</a></li>
            </ul>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <p>© 2026 VinUni AI Lecture Assistant Project. All rights reserved.</p>
          <p>Phát triển bởi Đội ngũ Công nghệ Đào tạo VinUni x Vingroup</p>
        </div>
      </footer>
    </div>
  );
}
