export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface Course {
  id: number;
  code?: string;
  name?: string;
  course_code?: string;
  course_name?: string;
  description?: string;
  target_audience?: string;
  credits?: number;
  weekly_lessons?: number;
}

export interface Chapter {
  id: number;
  course_id: number;
  title: string;
  weekly_lessons?: number;
  hours?: number;
  description?: string;
  sort_order?: number;
}

export interface CLO {
  id: number;
  code?: string;
  clo_code?: string;
  description: string;
  bloom_level?: number;
}

export interface Question {
  id?: number;
  content?: string;
  options?: string[] | string;
  answer?: string;
  question_text?: string;
  options_json?: string;
  correct_answer?: string;
  bloom_level: number;
  clo_id: number;
  chapter_id?: number | null;
  explanation?: string;
  created_by?: string | null;
  status?: string | null;
}

export interface QueueItem {
  status: 'pending' | 'generating' | 'success' | 'failed';
  activeStageMessage?: string;
  errorMsg?: string;
  cloId: number;
  cloCode: string;
  bloomLevel: number;
  chapterId?: number;
}
