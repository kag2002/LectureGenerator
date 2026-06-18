// ============================================================
//  mascotActions.ts — ODIN Mascot Execution Mode Action Registry
//  Định nghĩa toàn bộ pre-defined actions cho Mode 2 (Execution)
// ============================================================

export type WizardFieldType =
  | 'chapter_select'
  | 'clo_multiselect'
  | 'bloom_select'
  | 'number_input'
  | 'confirm_only';

export interface WizardStep {
  key: string;
  label: string;
  type: WizardFieldType;
  placeholder?: string;
  default?: string | number;
  min?: number;
  max?: number;
  required?: boolean;
}

export type ActionType = 'navigation' | 'execution';
export type ActionBadge = 'Nhanh' | 'Cần cấu hình' | 'Nâng cao';

export interface MascotAction {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  type: ActionType;
  group: string;
  badge: ActionBadge;
  /** Backend action_type string sent to /api/chatbot/direct-action */
  backendAction?: string;
  /** Navigation target view name for type=navigation */
  navigateTo?: string;
  /** Extra: trigger a side-effect after navigate */
  triggerEvent?: string;
  /** Wizard steps to collect params — empty for 1-click actions */
  wizard: WizardStep[];
}

// ============================================================
//  ACTION REGISTRY
// ============================================================
export const ACTION_REGISTRY: MascotAction[] = [
  // ── GROUP: Bài giảng ──────────────────────────────────────
  {
    id: 'generate_storyboard',
    label: 'Soạn Storyboard Chương',
    description: 'ODIN tự soạn toàn bộ storyboard slide cho một chương học',
    icon: 'BookOpen',
    type: 'execution',
    group: 'Bài giảng',
    badge: 'Cần cấu hình',
    backendAction: 'generate_chapter_storyboard_action',
    wizard: [
      {
        key: 'chapter_id',
        label: 'Chọn Chương',
        type: 'chapter_select',
        required: true,
      },
    ],
  },
  {
    id: 'generate_materials',
    label: 'Soạn Nội Dung Chi Tiết',
    description: 'Tạo tài liệu học tập và nội dung chi tiết cho từng slide',
    icon: 'FileText',
    type: 'execution',
    group: 'Bài giảng',
    badge: 'Cần cấu hình',
    backendAction: 'generate_chapter_materials_action',
    wizard: [
      {
        key: 'chapter_id',
        label: 'Chọn Chương',
        type: 'chapter_select',
        required: true,
      },
    ],
  },

  // ── GROUP: Đề thi ─────────────────────────────────────────
  {
    id: 'generate_questions',
    label: 'Tạo Câu Hỏi MCQ',
    description: 'Sinh câu hỏi trắc nghiệm theo CLO và thang Bloom',
    icon: 'HelpCircle',
    type: 'execution',
    group: 'Đề thi',
    badge: 'Cần cấu hình',
    backendAction: 'generate_chapter_questions_action',
    wizard: [
      {
        key: 'chapter_id',
        label: 'Chọn Chương',
        type: 'chapter_select',
        required: true,
      },
      {
        key: 'clo_ids',
        label: 'Chọn CLO (có thể nhiều)',
        type: 'clo_multiselect',
        required: false,
      },
      {
        key: 'bloom_level',
        label: 'Bloom Level (1–6)',
        type: 'bloom_select',
        required: false,
      },
      {
        key: 'count',
        label: 'Số câu cần tạo',
        type: 'number_input',
        default: 5,
        min: 1,
        max: 30,
        required: true,
      },
    ],
  },

  // ── GROUP: Phân tích ──────────────────────────────────────
  {
    id: 'open_matrix',
    label: 'Xem Ma Trận CLO × Bloom',
    description: 'Mở bảng ma trận phân bổ chuẩn đầu ra × thang Bloom',
    icon: 'BarChart2',
    type: 'navigation',
    group: 'Phân tích',
    badge: 'Nhanh',
    navigateTo: 'matrix_dashboard',
    wizard: [],
  },

  // ── GROUP: Cấu hình ───────────────────────────────────────
  {
    id: 'open_pedagogical',
    label: 'Cấu Hình Sư Phạm Lớp Học',
    description: 'Thiết lập bối cảnh sư phạm: sĩ số, phòng học, thiết bị...',
    icon: 'Settings',
    type: 'navigation',
    group: 'Cấu hình',
    badge: 'Nhanh',
    navigateTo: 'lesson_planner',
    triggerEvent: 'trigger-pedagogical-config',
    wizard: [],
  },
  {
    id: 'open_syllabus',
    label: 'Bóc Tách Syllabus',
    description: 'Nạp và phân tích đề cương môn học để trích xuất CLO',
    icon: 'Upload',
    type: 'navigation',
    group: 'Cấu hình',
    badge: 'Nhanh',
    navigateTo: 'course_config',
    wizard: [],
  },

  // ── GROUP: Autopilot ──────────────────────────────────────
  {
    id: 'autopilot_storyboard',
    label: 'Autopilot: Storyboard + Câu Hỏi',
    description: 'ODIN tự soạn storyboard VÀ câu hỏi cho một chương — toàn bộ pipeline',
    icon: 'Zap',
    type: 'execution',
    group: 'Autopilot',
    badge: 'Nâng cao',
    backendAction: 'autopilot_full_chapter',
    wizard: [
      {
        key: 'chapter_id',
        label: 'Chọn Chương',
        type: 'chapter_select',
        required: true,
      },
    ],
  },
];

// ============================================================
//  HELPERS
// ============================================================

/** Lấy danh sách group names theo thứ tự ưu tiên */
export const ACTION_GROUPS = ['Bài giảng', 'Đề thi', 'Phân tích', 'Cấu hình', 'Autopilot'];

/** Lấy actions theo group */
export const getActionsByGroup = (group: string): MascotAction[] =>
  ACTION_REGISTRY.filter((a) => a.group === group);

/** Lấy action theo id */
export const getActionById = (id: string): MascotAction | undefined =>
  ACTION_REGISTRY.find((a) => a.id === id);

export const BLOOM_LEVELS = [
  { value: 1, label: 'B1 — Nhớ (Remember)' },
  { value: 2, label: 'B2 — Hiểu (Understand)' },
  { value: 3, label: 'B3 — Vận dụng (Apply)' },
  { value: 4, label: 'B4 — Phân tích (Analyze)' },
  { value: 5, label: 'B5 — Đánh giá (Evaluate)' },
  { value: 6, label: 'B6 — Sáng tạo (Create)' },
];
