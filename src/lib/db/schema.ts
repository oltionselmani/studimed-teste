// Single source of truth for the ExamOS database shape. Kept as a TypeScript
// module (rather than a .sql file read at runtime) so it is always present in
// the bundled server output and the packaged desktop app.
export const SCHEMA_SQL = `
-- ExamOS relational schema.
-- Every row that belongs to a person carries user_id so that access checks are
-- a WHERE clause, never an afterthought.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  name                  TEXT NOT NULL DEFAULT '',
  locale                TEXT NOT NULL DEFAULT 'en',
  theme                 TEXT NOT NULL DEFAULT 'system',
  university            TEXT NOT NULL DEFAULT '',
  program               TEXT NOT NULL DEFAULT '',
  tone                  TEXT NOT NULL DEFAULT 'direct',       -- direct | blunt
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_name    TEXT NOT NULL,
  course_code    TEXT NOT NULL DEFAULT '',
  exam_date      TEXT NOT NULL,                  -- ISO date, local to the student
  exam_time      TEXT NOT NULL DEFAULT '',       -- HH:MM, optional
  target_grade   REAL NOT NULL,
  current_grade  REAL,                           -- nullable: unknown is a real answer
  exam_weight    REAL,                           -- percent of final grade, nullable
  grading_scale  TEXT NOT NULL DEFAULT 'ubt_10', -- ubt_10 | percent | custom | unknown
  grade_min      REAL NOT NULL DEFAULT 5,
  grade_max      REAL NOT NULL DEFAULT 10,
  -- Percentage -> grade mapping. Defaults to the app's documented conversion,
  -- which the student can edit; it is never presented as an official rule.
  grade_bands    TEXT NOT NULL DEFAULT '',
  university     TEXT NOT NULL DEFAULT '',
  program        TEXT NOT NULL DEFAULT '',
  professor      TEXT NOT NULL DEFAULT '',
  language       TEXT NOT NULL DEFAULT 'en',     -- language of the course material
  notes          TEXT NOT NULL DEFAULT '',
  analysis_state TEXT NOT NULL DEFAULT 'empty',  -- empty | pending | ready | failed
  analysis_error TEXT NOT NULL DEFAULT '',
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_user ON exams(user_id, archived, exam_date);

-- An exam is assessed in one or more parts. A course examined by two
-- kolokviums and a final has three; a course with a single sitting has one,
-- created automatically from the exam itself.
--
-- Each part covers a subset of the course topics, has its own date and weight,
-- and is measured on its own — so "am I ready for kolokvium 1" is answered
-- from the topics kolokvium 1 actually covers, not from the whole course.
CREATE TABLE IF NOT EXISTS exam_parts (
  id             TEXT PRIMARY KEY,
  exam_id        TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'midterm',  -- midterm | final | other
  position       INTEGER NOT NULL DEFAULT 0,
  exam_date      TEXT NOT NULL,
  exam_time      TEXT NOT NULL DEFAULT '',
  weight         REAL,                             -- percent of the course grade
  target_grade   REAL,                             -- optional per-part target
  -- Topic names this part covers, as a JSON array. Empty means "everything
  -- not claimed by another part".
  topics_json    TEXT NOT NULL DEFAULT '',
  -- Filled in once the part has actually been sat, so the remaining parts can
  -- be planned against what is already banked.
  result_percent REAL,
  result_grade   REAL,
  status         TEXT NOT NULL DEFAULT 'upcoming', -- upcoming | taken
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_parts_exam ON exam_parts(exam_id, position);

CREATE TABLE IF NOT EXISTS materials (
  id               TEXT PRIMARY KEY,
  exam_id          TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,
  mime             TEXT NOT NULL DEFAULT '',
  size_bytes       INTEGER NOT NULL DEFAULT 0,
  kind             TEXT NOT NULL DEFAULT 'lecture', -- lecture|notes|assignment|textbook|previous_exam|practice_exam|other
  storage_path     TEXT NOT NULL,
  text_content     TEXT NOT NULL DEFAULT '',
  char_count       INTEGER NOT NULL DEFAULT 0,
  page_count       INTEGER NOT NULL DEFAULT 0,
  extraction_state TEXT NOT NULL DEFAULT 'pending', -- pending|ready|unsupported|failed
  extraction_error TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_exam ON materials(exam_id);

CREATE TABLE IF NOT EXISTS topics (
  id               TEXT PRIMARY KEY,
  exam_id          TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  importance       REAL NOT NULL DEFAULT 0.5,   -- 0..1, how central in the material
  source_type      TEXT NOT NULL DEFAULT 'course_material',
  source_reference TEXT NOT NULL DEFAULT '',
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  UNIQUE (exam_id, name)
);

CREATE TABLE IF NOT EXISTS topic_items (
  id               TEXT PRIMARY KEY,
  topic_id         TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  exam_id          TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,               -- subtopic|definition|formula|concept|example|algorithm|term|exercise
  content          TEXT NOT NULL,
  source_reference TEXT NOT NULL DEFAULT '',
  position         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_topic_items_topic ON topic_items(topic_id);

CREATE TABLE IF NOT EXISTS previous_exams (
  id            TEXT PRIMARY KEY,
  exam_id       TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  material_id   TEXT REFERENCES materials(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  year          TEXT NOT NULL DEFAULT '',
  source_type   TEXT NOT NULL,                  -- user_upload | verified_external
  source_url    TEXT NOT NULL DEFAULT '',
  source_note   TEXT NOT NULL DEFAULT '',
  analysis_json TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prev_exams_exam ON previous_exams(exam_id);

-- Results of a real web search run (Claude's server-side web_search tool).
-- Rows only exist when a search actually returned them; the URL is kept so the
-- student can check the source themselves.
CREATE TABLE IF NOT EXISTS research_sources (
  id           TEXT PRIMARY KEY,
  exam_id      TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  snippet      TEXT NOT NULL DEFAULT '',
  relevance    TEXT NOT NULL DEFAULT 'unverified', -- unverified | related | previous_exam
  note         TEXT NOT NULL DEFAULT '',
  retrieved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_exam ON research_sources(exam_id);

CREATE TABLE IF NOT EXISTS attempts (
  id                 TEXT PRIMARY KEY,
  exam_id            TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which part of the exam this test was generated for, when it was scoped.
  part_id            TEXT REFERENCES exam_parts(id) ON DELETE SET NULL,
  kind               TEXT NOT NULL,             -- diagnostic|targeted|mock|mistake_review
  title              TEXT NOT NULL,
  difficulty         TEXT NOT NULL DEFAULT 'university',
  delivery           TEXT NOT NULL DEFAULT 'undecided', -- undecided|online|print|scan
  status             TEXT NOT NULL DEFAULT 'ready',     -- ready|in_progress|submitted|graded|failed
  time_limit_minutes INTEGER NOT NULL DEFAULT 0,
  focus_topics       TEXT NOT NULL DEFAULT '',  -- comma separated topic names
  total_points       REAL NOT NULL DEFAULT 0,
  earned_points      REAL,
  score_10           REAL,
  started_at         TEXT,
  submitted_at       TEXT,
  graded_at          TEXT,
  grading_note       TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id, created_at);

CREATE TABLE IF NOT EXISTS questions (
  id                TEXT PRIMARY KEY,
  attempt_id        TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  exam_id           TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL,
  type              TEXT NOT NULL,              -- multiple_choice|true_false|short_answer|conceptual|calculation|code_reading|debugging|algorithm|problem_solving|long_answer
  topic_name        TEXT NOT NULL DEFAULT '',
  subtopic          TEXT NOT NULL DEFAULT '',
  difficulty        TEXT NOT NULL DEFAULT 'medium',
  prompt            TEXT NOT NULL,
  code_block        TEXT NOT NULL DEFAULT '',
  options_json      TEXT NOT NULL DEFAULT '',   -- JSON array for choice questions
  correct_option    INTEGER,                    -- index into options for choice questions
  expected_answer   TEXT NOT NULL DEFAULT '',
  grading_criteria  TEXT NOT NULL DEFAULT '',
  explanation       TEXT NOT NULL DEFAULT '',
  points            REAL NOT NULL DEFAULT 1,
  answer_lines      INTEGER NOT NULL DEFAULT 4, -- printed answer space
  source_type       TEXT NOT NULL,              -- course_material|previous_exam|verified_external|ai_generated
  source_reference  TEXT NOT NULL DEFAULT '',
  source_basis      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_questions_attempt ON questions(attempt_id, position);

CREATE TABLE IF NOT EXISTS answers (
  id                TEXT PRIMARY KEY,
  question_id       TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  attempt_id        TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_text     TEXT NOT NULL DEFAULT '',
  selected_option   INTEGER,
  flagged           INTEGER NOT NULL DEFAULT 0,
  input_source      TEXT NOT NULL DEFAULT 'online', -- online|scan|scan_corrected
  scan_confidence   TEXT NOT NULL DEFAULT '',       -- high|medium|low|unreadable
  scan_raw          TEXT NOT NULL DEFAULT '',
  scan_page         INTEGER,
  awarded_points    REAL,
  verdict           TEXT NOT NULL DEFAULT '',       -- correct|partial|incorrect|blank|uncertain
  feedback          TEXT NOT NULL DEFAULT '',
  evaluated_by      TEXT NOT NULL DEFAULT '',       -- deterministic|ai
  updated_at        TEXT NOT NULL,
  UNIQUE (question_id)
);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);

CREATE TABLE IF NOT EXISTS scan_pages (
  id           TEXT PRIMARY KEY,
  attempt_id   TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_index   INTEGER NOT NULL,
  filename     TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'uploaded', -- uploaded|read|failed
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_pages_attempt ON scan_pages(attempt_id, page_index);

CREATE TABLE IF NOT EXISTS mistakes (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id         TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id     TEXT REFERENCES questions(id) ON DELETE SET NULL,
  topic_name      TEXT NOT NULL DEFAULT '',
  question_prompt TEXT NOT NULL,
  user_answer     TEXT NOT NULL DEFAULT '',
  correct_concept TEXT NOT NULL DEFAULT '',
  why_lost_points TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'open',  -- open|improving|resolved
  times_missed    INTEGER NOT NULL DEFAULT 1,
  last_seen_at    TEXT NOT NULL,
  next_review_at  TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mistakes_exam ON mistakes(exam_id, status);

CREATE TABLE IF NOT EXISTS topic_mastery (
  id              TEXT PRIMARY KEY,
  exam_id         TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  topic_name      TEXT NOT NULL,
  questions_seen  INTEGER NOT NULL DEFAULT 0,
  points_earned   REAL NOT NULL DEFAULT 0,
  points_possible REAL NOT NULL DEFAULT 0,
  mastery         REAL,                          -- 0..1, NULL until tested
  attempts_count  INTEGER NOT NULL DEFAULT 0,
  last_tested_at  TEXT,
  updated_at      TEXT NOT NULL,
  UNIQUE (exam_id, topic_name)
);

-- One row per graded attempt: the history graph reads straight off this table.
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id             TEXT PRIMARY KEY,
  exam_id        TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  attempt_id     TEXT REFERENCES attempts(id) ON DELETE CASCADE,
  taken_at       TEXT NOT NULL,
  score_10       REAL,
  readiness_band TEXT NOT NULL DEFAULT '',
  readiness      REAL,
  recent_average REAL,
  coverage       REAL,
  consistency    REAL,
  metrics_json   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_snapshots_exam ON performance_snapshots(exam_id, taken_at);

CREATE TABLE IF NOT EXISTS study_plans (
  id                 TEXT PRIMARY KEY,
  exam_id            TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_at       TEXT NOT NULL,
  based_on_attempt   TEXT,
  horizon_days       INTEGER NOT NULL DEFAULT 7,
  rationale          TEXT NOT NULL DEFAULT '',
  priorities_json    TEXT NOT NULL DEFAULT '',
  avoid_json         TEXT NOT NULL DEFAULT '',
  is_current         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_plans_exam ON study_plans(exam_id, generated_at);

CREATE TABLE IF NOT EXISTS study_tasks (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  exam_id      TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  day_index    INTEGER NOT NULL DEFAULT 0,
  date         TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  topic_name   TEXT NOT NULL DEFAULT '',
  minutes      INTEGER NOT NULL DEFAULT 30,
  action       TEXT NOT NULL DEFAULT 'study',  -- study|practice|review|test|rest
  target_note  TEXT NOT NULL DEFAULT '',
  done         INTEGER NOT NULL DEFAULT 0,
  done_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_plan ON study_tasks(plan_id, day_index, position);

CREATE TABLE IF NOT EXISTS study_materials (
  id           TEXT PRIMARY KEY,
  exam_id      TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_name   TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL,
  language     TEXT NOT NULL DEFAULT 'en',
  content_json TEXT NOT NULL,
  source_note  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sheets_exam ON study_materials(exam_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id    TEXT REFERENCES exams(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title_key  TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
