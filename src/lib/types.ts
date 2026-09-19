/** Row shapes mirrored from the database schema. */

export type Locale = 'en' | 'sq';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  locale: string;
  theme: string;
  university: string;
  program: string;
  tone: string;
  notifications_enabled: number;
  created_at: string;
}

export interface Exam {
  id: string;
  user_id: string;
  course_name: string;
  course_code: string;
  exam_date: string;
  exam_time: string;
  target_grade: number;
  current_grade: number | null;
  exam_weight: number | null;
  grading_scale: string;
  grade_min: number;
  grade_max: number;
  grade_bands: string;
  university: string;
  program: string;
  professor: string;
  language: string;
  notes: string;
  analysis_state: 'empty' | 'pending' | 'ready' | 'failed';
  analysis_error: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

export type MaterialKind =
  | 'lecture'
  | 'notes'
  | 'assignment'
  | 'textbook'
  | 'previous_exam'
  | 'practice_exam'
  | 'other';

export interface Material {
  id: string;
  exam_id: string;
  user_id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  kind: MaterialKind;
  storage_path: string;
  text_content: string;
  char_count: number;
  page_count: number;
  extraction_state: 'pending' | 'ready' | 'unsupported' | 'failed';
  extraction_error: string;
  created_at: string;
}

export interface Topic {
  id: string;
  exam_id: string;
  name: string;
  description: string;
  importance: number;
  source_type: string;
  source_reference: string;
  position: number;
  created_at: string;
}

export type TopicItemKind =
  | 'subtopic'
  | 'definition'
  | 'formula'
  | 'concept'
  | 'example'
  | 'algorithm'
  | 'term'
  | 'exercise';

export interface TopicItem {
  id: string;
  topic_id: string;
  exam_id: string;
  kind: TopicItemKind;
  content: string;
  source_reference: string;
  position: number;
}

export type AttemptKind = 'diagnostic' | 'targeted' | 'mock' | 'mistake_review';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'university' | 'previous_exam_style';

export interface Attempt {
  id: string;
  exam_id: string;
  user_id: string;
  kind: AttemptKind;
  title: string;
  difficulty: Difficulty;
  delivery: 'undecided' | 'online' | 'print' | 'scan';
  status: 'ready' | 'in_progress' | 'submitted' | 'graded' | 'failed';
  time_limit_minutes: number;
  focus_topics: string;
  total_points: number;
  earned_points: number | null;
  score_10: number | null;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  grading_note: string;
  created_at: string;
}

export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'conceptual'
  | 'calculation'
  | 'code_reading'
  | 'debugging'
  | 'algorithm'
  | 'problem_solving'
  | 'long_answer';

/** Where a question actually came from. Never guessed, never decorative. */
export type SourceType =
  | 'course_material'
  | 'previous_exam'
  | 'verified_external'
  | 'ai_generated';

export interface Question {
  id: string;
  attempt_id: string;
  exam_id: string;
  position: number;
  type: QuestionType;
  topic_name: string;
  subtopic: string;
  difficulty: string;
  prompt: string;
  code_block: string;
  options_json: string;
  correct_option: number | null;
  expected_answer: string;
  grading_criteria: string;
  explanation: string;
  points: number;
  answer_lines: number;
  source_type: SourceType;
  source_reference: string;
  source_basis: string;
}

export type Verdict = 'correct' | 'partial' | 'incorrect' | 'blank' | 'uncertain';

export interface Answer {
  id: string;
  question_id: string;
  attempt_id: string;
  user_id: string;
  response_text: string;
  selected_option: number | null;
  flagged: number;
  input_source: 'online' | 'scan' | 'scan_corrected';
  scan_confidence: '' | 'high' | 'medium' | 'low' | 'unreadable';
  scan_raw: string;
  scan_page: number | null;
  awarded_points: number | null;
  verdict: Verdict | '';
  feedback: string;
  evaluated_by: '' | 'deterministic' | 'ai';
  updated_at: string;
}

export interface ScanPage {
  id: string;
  attempt_id: string;
  user_id: string;
  page_index: number;
  filename: string;
  storage_path: string;
  state: 'uploaded' | 'read' | 'failed';
  note: string;
  created_at: string;
}

export interface Mistake {
  id: string;
  user_id: string;
  exam_id: string;
  question_id: string | null;
  topic_name: string;
  question_prompt: string;
  user_answer: string;
  correct_concept: string;
  why_lost_points: string;
  status: 'open' | 'improving' | 'resolved';
  times_missed: number;
  last_seen_at: string;
  next_review_at: string;
  created_at: string;
}

export interface TopicMastery {
  id: string;
  exam_id: string;
  topic_name: string;
  questions_seen: number;
  points_earned: number;
  points_possible: number;
  mastery: number | null;
  attempts_count: number;
  last_tested_at: string | null;
  updated_at: string;
}

export interface PerformanceSnapshot {
  id: string;
  exam_id: string;
  attempt_id: string | null;
  taken_at: string;
  score_10: number | null;
  readiness_band: string;
  readiness: number | null;
  recent_average: number | null;
  coverage: number | null;
  consistency: number | null;
  metrics_json: string;
}

export interface StudyPlan {
  id: string;
  exam_id: string;
  user_id: string;
  generated_at: string;
  based_on_attempt: string | null;
  horizon_days: number;
  rationale: string;
  priorities_json: string;
  avoid_json: string;
  is_current: number;
}

export interface StudyTask {
  id: string;
  plan_id: string;
  exam_id: string;
  day_index: number;
  date: string;
  position: number;
  title: string;
  detail: string;
  topic_name: string;
  minutes: number;
  action: 'study' | 'practice' | 'review' | 'test' | 'rest';
  target_note: string;
  done: number;
  done_at: string | null;
}

export interface StudyMaterialRow {
  id: string;
  exam_id: string;
  user_id: string;
  topic_name: string;
  title: string;
  language: string;
  content_json: string;
  source_note: string;
  created_at: string;
}

export interface PreviousExamRow {
  id: string;
  exam_id: string;
  material_id: string | null;
  title: string;
  year: string;
  source_type: 'user_upload' | 'verified_external';
  source_url: string;
  source_note: string;
  analysis_json: string;
  created_at: string;
}

export interface ResearchSource {
  id: string;
  exam_id: string;
  title: string;
  url: string;
  snippet: string;
  relevance: 'unverified' | 'related' | 'previous_exam';
  note: string;
  retrieved_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  exam_id: string | null;
  kind: string;
  title_key: string;
  params_json: string;
  created_at: string;
  read_at: string | null;
}

/** Shape of a generated study sheet, stored as JSON in study_materials. */
export interface StudySheetContent {
  topic: string;
  summary: string;
  key_concepts: { term: string; explanation: string }[];
  formulas: { name: string; expression: string; when_to_use: string }[];
  worked_examples: { problem: string; solution: string }[];
  common_mistakes: string[];
  active_recall: { question: string; answer: string }[];
  mini_quiz: { question: string; answer: string }[];
  checklist: string[];
  source_note: string;
}
