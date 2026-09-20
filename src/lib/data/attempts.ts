import 'server-only';
import { randomUUID } from 'node:crypto';
import { all, one, run, transaction } from '@/lib/db';
import { percentToGrade, readBands } from '@/lib/engine/grading-scale';
import { computeReadiness } from '@/lib/engine/readiness';
import type { GeneratedQuestion } from '@/lib/ai/schemas';
import type { GradedAnswer } from '@/lib/ai/grading';
import type {
  Answer,
  Attempt,
  AttemptKind,
  Difficulty,
  Exam,
  Question,
  ScanPage,
  Topic,
  TopicMastery,
} from '@/lib/types';

export async function listAttempts(examId: string): Promise<Attempt[]> {
  return all<Attempt>('SELECT * FROM attempts WHERE exam_id = ? ORDER BY created_at DESC', [examId]);
}

export async function getAttempt(userId: string, attemptId: string): Promise<Attempt | null> {
  return one<Attempt>('SELECT * FROM attempts WHERE id = ? AND user_id = ?', [attemptId, userId]);
}

export async function listQuestions(attemptId: string): Promise<Question[]> {
  return all<Question>('SELECT * FROM questions WHERE attempt_id = ? ORDER BY position ASC', [
    attemptId,
  ]);
}

export async function listAnswers(attemptId: string): Promise<Answer[]> {
  return all<Answer>('SELECT * FROM answers WHERE attempt_id = ?', [attemptId]);
}

export async function listScanPages(attemptId: string): Promise<ScanPage[]> {
  return all<ScanPage>('SELECT * FROM scan_pages WHERE attempt_id = ? ORDER BY page_index ASC', [
    attemptId,
  ]);
}

export async function createAttempt(params: {
  userId: string;
  examId: string;
  kind: AttemptKind;
  title: string;
  difficulty: Difficulty;
  timeLimitMinutes: number;
  focusTopics: string[];
  questions: GeneratedQuestion[];
}): Promise<string> {
  const attemptId = randomUUID();
  const now = new Date().toISOString();
  const totalPoints = params.questions.reduce((sum, question) => sum + question.points, 0);

  await transaction(async () => {
    await run(
      `INSERT INTO attempts (
         id, exam_id, user_id, kind, title, difficulty, delivery, status,
         time_limit_minutes, focus_topics, total_points, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'undecided', 'ready', ?, ?, ?, ?)`,
      [
        attemptId,
        params.examId,
        params.userId,
        params.kind,
        params.title,
        params.difficulty,
        params.timeLimitMinutes,
        params.focusTopics.join(', '),
        totalPoints,
        now,
      ],
    );

    for (const [index, question] of params.questions.entries()) {
      await run(
        `INSERT INTO questions (
           id, attempt_id, exam_id, position, type, topic_name, subtopic, difficulty,
           prompt, code_block, options_json, correct_option, expected_answer,
           grading_criteria, explanation, points, answer_lines,
           source_type, source_reference, source_basis
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          attemptId,
          params.examId,
          index + 1,
          question.type,
          question.topic_name,
          question.subtopic,
          question.difficulty,
          question.prompt,
          question.code_block,
          question.options.length > 0 ? JSON.stringify(question.options) : '',
          question.correct_option >= 0 ? question.correct_option : null,
          question.expected_answer,
          question.grading_criteria,
          question.explanation,
          question.points,
          question.answer_lines,
          question.source_type,
          question.source_reference,
          question.source_basis,
        ],
      );
    }
  });

  return attemptId;
}

export async function setDelivery(
  userId: string,
  attemptId: string,
  delivery: Attempt['delivery'],
): Promise<void> {
  await run('UPDATE attempts SET delivery = ? WHERE id = ? AND user_id = ?', [
    delivery,
    attemptId,
    userId,
  ]);
}

export async function startAttempt(userId: string, attemptId: string): Promise<void> {
  const attempt = await getAttempt(userId, attemptId);
  if (!attempt || attempt.started_at) return;
  await run(
    "UPDATE attempts SET started_at = ?, status = 'in_progress' WHERE id = ? AND user_id = ?",
    [new Date().toISOString(), attemptId, userId],
  );
}

/** Autosave. Upsert on question_id, which carries a UNIQUE constraint. */
export async function saveAnswer(params: {
  userId: string;
  attemptId: string;
  questionId: string;
  responseText?: string;
  selectedOption?: number | null;
  flagged?: boolean;
  inputSource?: Answer['input_source'];
  scanConfidence?: Answer['scan_confidence'];
  scanRaw?: string;
  scanPage?: number | null;
}): Promise<void> {
  const existing = await one<Answer>(
    `SELECT a.* FROM answers a
     JOIN attempts t ON t.id = a.attempt_id
     WHERE a.question_id = ? AND t.user_id = ?`,
    [params.questionId, params.userId],
  );
  const now = new Date().toISOString();

  if (existing) {
    await run(
      `UPDATE answers SET
         response_text = ?, selected_option = ?, flagged = ?, input_source = ?,
         scan_confidence = ?, scan_raw = ?, scan_page = ?, updated_at = ?
       WHERE id = ?`,
      [
        params.responseText ?? existing.response_text,
        params.selectedOption === undefined ? existing.selected_option : params.selectedOption,
        params.flagged === undefined ? existing.flagged : params.flagged ? 1 : 0,
        params.inputSource ?? existing.input_source,
        params.scanConfidence ?? existing.scan_confidence,
        params.scanRaw ?? existing.scan_raw,
        params.scanPage === undefined ? existing.scan_page : params.scanPage,
        now,
        existing.id,
      ],
    );
    return;
  }

  // Confirm the question really belongs to this user's attempt before inserting.
  const owned = await one<{ id: string }>(
    `SELECT q.id FROM questions q
     JOIN attempts t ON t.id = q.attempt_id
     WHERE q.id = ? AND t.id = ? AND t.user_id = ?`,
    [params.questionId, params.attemptId, params.userId],
  );
  if (!owned) throw new Error('FORBIDDEN');

  await run(
    `INSERT INTO answers (
       id, question_id, attempt_id, user_id, response_text, selected_option, flagged,
       input_source, scan_confidence, scan_raw, scan_page, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      params.questionId,
      params.attemptId,
      params.userId,
      params.responseText ?? '',
      params.selectedOption ?? null,
      params.flagged ? 1 : 0,
      params.inputSource ?? 'online',
      params.scanConfidence ?? '',
      params.scanRaw ?? '',
      params.scanPage ?? null,
      now,
    ],
  );
}

/**
 * Writes grades, recomputes topic mastery from scratch over every graded
 * attempt for this exam, records a performance snapshot, and files new
 * mistakes. Mastery is recomputed rather than incremented so that deleting a
 * test cannot leave a stale figure behind.
 */
export async function finaliseGrading(params: {
  userId: string;
  exam: Exam;
  attempt: Attempt;
  questions: Question[];
  graded: GradedAnswer[];
  topics: Topic[];
  gradingNote: string;
}): Promise<{ earned: number; total: number; percent: number; grade: number }> {
  const now = new Date().toISOString();
  const byQuestion = new Map(params.graded.map((entry) => [entry.questionId, entry]));

  // Uncertain answers are excluded from the denominator: a question that could
  // not be read is not a question the student got wrong.
  let earned = 0;
  let total = 0;

  await transaction(async () => {
    for (const question of params.questions) {
      const grade = byQuestion.get(question.id);
      if (!grade) continue;

      if (grade.verdict !== 'uncertain') {
        earned += grade.awardedPoints;
        total += question.points;
      }

      const existing = await one<{ id: string }>(
        'SELECT id FROM answers WHERE question_id = ?',
        [question.id],
      );
      if (existing) {
        await run(
          `UPDATE answers SET awarded_points = ?, verdict = ?, feedback = ?, evaluated_by = ?, updated_at = ?
           WHERE id = ?`,
          [grade.awardedPoints, grade.verdict, grade.feedback, grade.evaluatedBy, now, existing.id],
        );
      } else {
        await run(
          `INSERT INTO answers (id, question_id, attempt_id, user_id, awarded_points, verdict, feedback, evaluated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            question.id,
            params.attempt.id,
            params.userId,
            grade.awardedPoints,
            grade.verdict,
            grade.feedback,
            grade.evaluatedBy,
            now,
          ],
        );
      }
    }

    const percent = total > 0 ? (earned / total) * 100 : 0;
    const scaleGrade = percentToGrade(percent, readBands(params.exam));

    await run(
      `UPDATE attempts SET status = 'graded', earned_points = ?, score_10 = ?, total_points = ?,
         submitted_at = COALESCE(submitted_at, ?), graded_at = ?, grading_note = ?
       WHERE id = ?`,
      [earned, scaleGrade, total, now, now, params.gradingNote, params.attempt.id],
    );
  });

  await recomputeMastery(params.exam.id, params.topics);
  await recordMistakes(params);
  await recordSnapshot(params.userId, params.exam, params.attempt.id);

  const percent = total > 0 ? (earned / total) * 100 : 0;
  return {
    earned,
    total,
    percent,
    grade: percentToGrade(percent, readBands(params.exam)),
  };
}

/** Rebuilds per-topic mastery from every graded answer for this exam. */
export async function recomputeMastery(examId: string, topics: Topic[]): Promise<void> {
  const rows = await all<{
    topic_name: string;
    points: number;
    awarded: number;
    attempt_id: string;
    graded_at: string;
  }>(
    `SELECT q.topic_name AS topic_name, q.points AS points,
            COALESCE(a.awarded_points, 0) AS awarded,
            q.attempt_id AS attempt_id, t.graded_at AS graded_at
     FROM questions q
     JOIN attempts t ON t.id = q.attempt_id
     LEFT JOIN answers a ON a.question_id = q.id
     WHERE q.exam_id = ? AND t.status = 'graded' AND COALESCE(a.verdict, '') != 'uncertain'`,
    [examId],
  );

  const aggregated = new Map<
    string,
    { seen: number; earned: number; possible: number; attempts: Set<string>; last: string }
  >();

  for (const row of rows) {
    const key = row.topic_name || 'Uncategorised';
    const entry =
      aggregated.get(key) ??
      { seen: 0, earned: 0, possible: 0, attempts: new Set<string>(), last: '' };
    entry.seen += 1;
    entry.earned += row.awarded;
    entry.possible += row.points;
    entry.attempts.add(row.attempt_id);
    if (row.graded_at > entry.last) entry.last = row.graded_at;
    aggregated.set(key, entry);
  }

  const now = new Date().toISOString();

  // Keep a row for every known topic, including untested ones.
  for (const topic of topics) {
    if (!aggregated.has(topic.name)) {
      await run(
        `INSERT INTO topic_mastery (id, exam_id, topic_name, questions_seen, points_earned, points_possible, mastery, attempts_count, last_tested_at, updated_at)
         VALUES (?, ?, ?, 0, 0, 0, NULL, 0, NULL, ?)
         ON CONFLICT (exam_id, topic_name) DO UPDATE SET
           questions_seen = 0, points_earned = 0, points_possible = 0,
           mastery = NULL, attempts_count = 0, last_tested_at = NULL, updated_at = excluded.updated_at`,
        [randomUUID(), examId, topic.name, now],
      );
    }
  }

  for (const [topicName, entry] of aggregated) {
    const mastery = entry.possible > 0 ? entry.earned / entry.possible : null;
    await run(
      `INSERT INTO topic_mastery (id, exam_id, topic_name, questions_seen, points_earned, points_possible, mastery, attempts_count, last_tested_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (exam_id, topic_name) DO UPDATE SET
         questions_seen = excluded.questions_seen,
         points_earned = excluded.points_earned,
         points_possible = excluded.points_possible,
         mastery = excluded.mastery,
         attempts_count = excluded.attempts_count,
         last_tested_at = excluded.last_tested_at,
         updated_at = excluded.updated_at`,
      [
        randomUUID(),
        examId,
        topicName,
        entry.seen,
        entry.earned,
        entry.possible,
        mastery,
        entry.attempts.size,
        entry.last || null,
        now,
      ],
    );
  }
}

/** Files every lost-point question into the mistake book. */
async function recordMistakes(params: {
  userId: string;
  exam: Exam;
  attempt: Attempt;
  questions: Question[];
  graded: GradedAnswer[];
}): Promise<void> {
  const answers = await listAnswers(params.attempt.id);
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  const now = new Date();
  const nowIso = now.toISOString();
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString();

  for (const grade of params.graded) {
    if (grade.verdict === 'correct' || grade.verdict === 'uncertain') continue;
    const question = params.questions.find((item) => item.id === grade.questionId);
    if (!question) continue;

    const answer = answerByQuestion.get(question.id);
    const studentAnswer =
      answer?.selected_option !== null && answer?.selected_option !== undefined
        ? (JSON.parse(question.options_json || '[]') as string[])[answer.selected_option] ?? ''
        : answer?.response_text ?? '';

    // One mistake per concept per exam: a repeat raises the counter instead of
    // filling the book with duplicates.
    const existing = await one<{ id: string; times_missed: number }>(
      `SELECT id, times_missed FROM mistakes
       WHERE exam_id = ? AND user_id = ? AND topic_name = ? AND question_prompt = ?`,
      [params.exam.id, params.userId, question.topic_name, question.prompt],
    );

    if (existing) {
      await run(
        `UPDATE mistakes SET times_missed = ?, status = 'open', user_answer = ?,
           last_seen_at = ?, next_review_at = ? WHERE id = ?`,
        [existing.times_missed + 1, studentAnswer, nowIso, tomorrow, existing.id],
      );
      continue;
    }

    await run(
      `INSERT INTO mistakes (
         id, user_id, exam_id, question_id, topic_name, question_prompt, user_answer,
         correct_concept, why_lost_points, status, times_missed, last_seen_at, next_review_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, ?)`,
      [
        randomUUID(),
        params.userId,
        params.exam.id,
        question.id,
        question.topic_name,
        question.prompt,
        studentAnswer,
        grade.correctConcept || question.expected_answer,
        grade.feedback,
        nowIso,
        tomorrow,
        nowIso,
      ],
    );
  }

  // A concept answered correctly this time moves from open to improving, and
  // from improving to resolved. Getting it wrong again reopens it above.
  for (const grade of params.graded) {
    if (grade.verdict !== 'correct') continue;
    const question = params.questions.find((item) => item.id === grade.questionId);
    if (!question) continue;
    await run(
      `UPDATE mistakes
       SET status = CASE status WHEN 'open' THEN 'improving' ELSE 'resolved' END,
           last_seen_at = ?,
           next_review_at = ?
       WHERE exam_id = ? AND user_id = ? AND topic_name = ? AND status != 'resolved'`,
      [
        nowIso,
        new Date(now.getTime() + 3 * 86_400_000).toISOString(),
        params.exam.id,
        params.userId,
        question.topic_name,
      ],
    );
  }
}

/** One snapshot per graded attempt — this is what the history charts read. */
export async function recordSnapshot(
  userId: string,
  exam: Exam,
  attemptId: string | null,
): Promise<void> {
  const [attempts, mastery, topics] = await Promise.all([
    all<Attempt>('SELECT * FROM attempts WHERE exam_id = ?', [exam.id]),
    all<TopicMastery>('SELECT * FROM topic_mastery WHERE exam_id = ?', [exam.id]),
    all<Topic>('SELECT * FROM topics WHERE exam_id = ?', [exam.id]),
  ]);

  const readiness = computeReadiness({
    exam,
    attempts,
    mastery,
    topicNames: topics.map((topic) => topic.name),
  });

  await run(
    `INSERT INTO performance_snapshots (
       id, exam_id, attempt_id, taken_at, score_10, readiness_band, readiness,
       recent_average, coverage, consistency, metrics_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      exam.id,
      attemptId,
      new Date().toISOString(),
      readiness.recentAverageGrade,
      readiness.band,
      readiness.score,
      readiness.recentAveragePercent,
      readiness.coverage,
      readiness.consistency,
      JSON.stringify({
        weakTopics: readiness.weakTopics,
        strongTopics: readiness.strongTopics,
        gradedAttempts: readiness.gradedAttempts,
      }),
    ],
  );
}

export async function deleteAttempt(userId: string, attemptId: string): Promise<string | null> {
  const attempt = await getAttempt(userId, attemptId);
  if (!attempt) return null;
  await run('DELETE FROM attempts WHERE id = ? AND user_id = ?', [attemptId, userId]);

  const topics = await all<Topic>('SELECT * FROM topics WHERE exam_id = ?', [attempt.exam_id]);
  await recomputeMastery(attempt.exam_id, topics);
  return attempt.exam_id;
}
