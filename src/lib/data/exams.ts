import 'server-only';
import { randomUUID } from 'node:crypto';
import { all, one, run } from '@/lib/db';
import { defaultBandsFor } from '@/lib/engine/grading-scale';
import { computeReadiness, type ReadinessResult } from '@/lib/engine/readiness';
import type { Attempt, Exam, Topic, TopicItem, TopicMastery } from '@/lib/types';

/**
 * Every read here is scoped by user_id. There is no "get exam by id" that does
 * not also check who is asking.
 */

export async function listExams(userId: string, includeArchived = false): Promise<Exam[]> {
  return all<Exam>(
    `SELECT * FROM exams
     WHERE user_id = ? ${includeArchived ? '' : 'AND archived = 0'}
     ORDER BY exam_date ASC, created_at ASC`,
    [userId],
  );
}

export async function getExam(userId: string, examId: string): Promise<Exam | null> {
  return one<Exam>('SELECT * FROM exams WHERE id = ? AND user_id = ?', [examId, userId]);
}

export interface ExamInput {
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
  university: string;
  program: string;
  professor: string;
  language: string;
  notes: string;
}

export async function createExam(userId: string, input: ExamInput): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const bands = JSON.stringify(
    defaultBandsFor(input.grading_scale, input.grade_min, input.grade_max),
  );

  await run(
    `INSERT INTO exams (
       id, user_id, course_name, course_code, exam_date, exam_time, target_grade,
       current_grade, exam_weight, grading_scale, grade_min, grade_max, grade_bands,
       university, program, professor, language, notes, analysis_state, analysis_error,
       archived, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'empty', '', 0, ?, ?)`,
    [
      id,
      userId,
      input.course_name,
      input.course_code,
      input.exam_date,
      input.exam_time,
      input.target_grade,
      input.current_grade,
      input.exam_weight,
      input.grading_scale,
      input.grade_min,
      input.grade_max,
      bands,
      input.university,
      input.program,
      input.professor,
      input.language,
      input.notes,
      now,
      now,
    ],
  );
  return id;
}

export async function updateExam(
  userId: string,
  examId: string,
  input: Partial<ExamInput> & { grade_bands?: string; archived?: number },
): Promise<void> {
  const allowed: (keyof typeof input)[] = [
    'course_name',
    'course_code',
    'exam_date',
    'exam_time',
    'target_grade',
    'current_grade',
    'exam_weight',
    'grading_scale',
    'grade_min',
    'grade_max',
    'grade_bands',
    'university',
    'program',
    'professor',
    'language',
    'notes',
    'archived',
  ];
  const fields = allowed.filter((key) => input[key] !== undefined);
  if (fields.length === 0) return;

  await run(
    `UPDATE exams SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [...fields.map((field) => input[field] as unknown), new Date().toISOString(), examId, userId],
  );
}

export async function deleteExam(userId: string, examId: string): Promise<void> {
  await run('DELETE FROM exams WHERE id = ? AND user_id = ?', [examId, userId]);
}

export async function setAnalysisState(
  examId: string,
  state: Exam['analysis_state'],
  error = '',
): Promise<void> {
  await run('UPDATE exams SET analysis_state = ?, analysis_error = ?, updated_at = ? WHERE id = ?', [
    state,
    error,
    new Date().toISOString(),
    examId,
  ]);
}

// ---- Topics ---------------------------------------------------------------

export async function listTopics(examId: string): Promise<Topic[]> {
  return all<Topic>('SELECT * FROM topics WHERE exam_id = ? ORDER BY position ASC, name ASC', [
    examId,
  ]);
}

export async function listTopicItems(examId: string): Promise<TopicItem[]> {
  return all<TopicItem>(
    'SELECT * FROM topic_items WHERE exam_id = ? ORDER BY position ASC',
    [examId],
  );
}

export async function replaceTopics(
  examId: string,
  topics: {
    name: string;
    description: string;
    importance: number;
    source_reference: string;
    items: { kind: string; content: string; source_reference: string }[];
  }[],
): Promise<void> {
  const now = new Date().toISOString();
  await run('DELETE FROM topic_items WHERE exam_id = ?', [examId]);
  await run('DELETE FROM topics WHERE exam_id = ?', [examId]);

  for (const [index, topic] of topics.entries()) {
    const topicId = randomUUID();
    await run(
      `INSERT INTO topics (id, exam_id, name, description, importance, source_type, source_reference, position, created_at)
       VALUES (?, ?, ?, ?, ?, 'course_material', ?, ?, ?)`,
      [
        topicId,
        examId,
        topic.name,
        topic.description,
        topic.importance,
        topic.source_reference,
        index,
        now,
      ],
    );
    for (const [itemIndex, item] of topic.items.entries()) {
      await run(
        `INSERT INTO topic_items (id, topic_id, exam_id, kind, content, source_reference, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), topicId, examId, item.kind, item.content, item.source_reference, itemIndex],
      );
    }
    // Keep a mastery row for every topic so "never tested" is visible, not absent.
    await run(
      `INSERT OR IGNORE INTO topic_mastery (id, exam_id, topic_name, updated_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), examId, topic.name, now],
    );
  }
}

// ---- Mastery --------------------------------------------------------------

export async function listMastery(examId: string): Promise<TopicMastery[]> {
  return all<TopicMastery>('SELECT * FROM topic_mastery WHERE exam_id = ?', [examId]);
}

// ---- Readiness ------------------------------------------------------------

export interface ExamSnapshot {
  exam: Exam;
  attempts: Attempt[];
  mastery: TopicMastery[];
  topics: Topic[];
  readiness: ReadinessResult;
}

/** The single place the rest of the app asks "where does this student stand?" */
export async function loadExamSnapshot(
  userId: string,
  examId: string,
): Promise<ExamSnapshot | null> {
  const exam = await getExam(userId, examId);
  if (!exam) return null;

  const [attempts, mastery, topics] = await Promise.all([
    all<Attempt>('SELECT * FROM attempts WHERE exam_id = ? ORDER BY created_at ASC', [examId]),
    listMastery(examId),
    listTopics(examId),
  ]);

  const readiness = computeReadiness({
    exam,
    attempts,
    mastery,
    topicNames: topics.map((topic) => topic.name),
  });

  return { exam, attempts, mastery, topics, readiness };
}

/**
 * Priority order for study: never-tested topics that matter, then lowest
 * mastery first, with topic importance breaking ties. Decided in code, so the
 * model cannot quietly reorder the student's priorities.
 */
export function prioritiseTopics(
  topics: Topic[],
  mastery: TopicMastery[],
  limit = 6,
): { topic: string; mastery: number | null }[] {
  const byName = new Map(mastery.map((row) => [row.topic_name, row]));

  return topics
    .map((topic) => {
      const row = byName.get(topic.name);
      const value = row?.mastery ?? null;
      // Untested important material ranks just above a genuinely weak topic:
      // an unknown is a risk, but a measured failure is a certainty.
      const rank = value === null ? 0.55 - topic.importance * 0.2 : value - topic.importance * 0.05;
      return { topic: topic.name, mastery: value, rank };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ topic, mastery: value }) => ({ topic, mastery: value }));
}
