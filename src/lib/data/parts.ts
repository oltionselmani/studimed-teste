import 'server-only';
import { randomUUID } from 'node:crypto';
import { all, one, run } from '@/lib/db';
import type { Exam, ExamPart, ExamPartKind, Topic } from '@/lib/types';

/**
 * Exam parts: kolokviums, finals, or any other assessed sitting.
 *
 * A course examined in halves is the normal case here, not a special one. Each
 * part carries its own date, weight, target and slice of the syllabus, and is
 * measured against only the topics it actually covers.
 */

export async function listParts(examId: string): Promise<ExamPart[]> {
  return all<ExamPart>(
    'SELECT * FROM exam_parts WHERE exam_id = ? ORDER BY position ASC, exam_date ASC',
    [examId],
  );
}

export async function getPart(userId: string, partId: string): Promise<ExamPart | null> {
  return one<ExamPart>('SELECT * FROM exam_parts WHERE id = ? AND user_id = ?', [partId, userId]);
}

/** Topic names a part covers. An empty list means "everything". */
export function partTopics(part: ExamPart): string[] {
  if (!part.topics_json) return [];
  try {
    const parsed = JSON.parse(part.topics_json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The topics a part is actually measured on.
 *
 * A part with no explicit topic list covers whatever no other part claims —
 * which is what a final that mops up the second half of a course really is.
 * If nothing is claimed anywhere, every part covers the whole course.
 */
export function effectiveTopics(part: ExamPart, allParts: ExamPart[], allTopics: string[]): string[] {
  const own = partTopics(part);
  if (own.length > 0) return own.filter((name) => allTopics.includes(name));

  const claimed = new Set(
    allParts.filter((other) => other.id !== part.id).flatMap((other) => partTopics(other)),
  );
  const unclaimed = allTopics.filter((name) => !claimed.has(name));
  return unclaimed.length > 0 ? unclaimed : allTopics;
}

/**
 * Every exam has at least one part. An exam created before parts existed — or
 * one the student never split — gets a single final synthesised from the exam
 * row itself, so the rest of the app only ever deals with parts.
 */
export async function ensureParts(exam: Exam): Promise<ExamPart[]> {
  const existing = await listParts(exam.id);
  if (existing.length > 0) return existing;

  const id = randomUUID();
  await run(
    `INSERT INTO exam_parts (
       id, exam_id, user_id, name, kind, position, exam_date, exam_time,
       weight, target_grade, topics_json, result_percent, result_grade,
       status, notes, created_at
     ) VALUES (?, ?, ?, ?, 'final', 0, ?, ?, ?, ?, '', NULL, NULL, 'upcoming', '', ?)`,
    [
      id,
      exam.id,
      exam.user_id,
      exam.course_name,
      exam.exam_date,
      exam.exam_time,
      exam.exam_weight,
      exam.target_grade,
      new Date().toISOString(),
    ],
  );
  return listParts(exam.id);
}

export interface PartInput {
  name: string;
  kind: ExamPartKind;
  exam_date: string;
  exam_time: string;
  weight: number | null;
  target_grade: number | null;
  topics: string[];
  notes: string;
}

export async function createPart(
  userId: string,
  examId: string,
  input: PartInput,
): Promise<string> {
  const existing = await listParts(examId);
  const id = randomUUID();
  await run(
    `INSERT INTO exam_parts (
       id, exam_id, user_id, name, kind, position, exam_date, exam_time,
       weight, target_grade, topics_json, result_percent, result_grade,
       status, notes, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'upcoming', ?, ?)`,
    [
      id,
      examId,
      userId,
      input.name,
      input.kind,
      existing.length,
      input.exam_date,
      input.exam_time,
      input.weight,
      input.target_grade,
      JSON.stringify(input.topics),
      input.notes,
      new Date().toISOString(),
    ],
  );
  return id;
}

export async function updatePart(
  userId: string,
  partId: string,
  input: Partial<PartInput>,
): Promise<void> {
  const part = await getPart(userId, partId);
  if (!part) throw new Error('FORBIDDEN');

  await run(
    `UPDATE exam_parts SET name = ?, kind = ?, exam_date = ?, exam_time = ?,
       weight = ?, target_grade = ?, topics_json = ?, notes = ?
     WHERE id = ? AND user_id = ?`,
    [
      input.name ?? part.name,
      input.kind ?? part.kind,
      input.exam_date ?? part.exam_date,
      input.exam_time ?? part.exam_time,
      input.weight === undefined ? part.weight : input.weight,
      input.target_grade === undefined ? part.target_grade : input.target_grade,
      input.topics === undefined ? part.topics_json : JSON.stringify(input.topics),
      input.notes ?? part.notes,
      partId,
      userId,
    ],
  );
}

/**
 * Records what the student actually scored on a part once they have sat it.
 * Passing null for the percentage puts the part back to upcoming.
 */
export async function recordPartResult(
  userId: string,
  partId: string,
  percent: number | null,
  grade: number | null,
): Promise<void> {
  await run(
    `UPDATE exam_parts SET result_percent = ?, result_grade = ?, status = ?
     WHERE id = ? AND user_id = ?`,
    [percent, grade, percent === null ? 'upcoming' : 'taken', partId, userId],
  );
}

export async function deletePart(userId: string, partId: string): Promise<string | null> {
  const part = await getPart(userId, partId);
  if (!part) return null;

  // Never leave an exam with no parts at all.
  const siblings = await listParts(part.exam_id);
  if (siblings.length <= 1) throw new Error('LAST_PART');

  await run('DELETE FROM exam_parts WHERE id = ? AND user_id = ?', [partId, userId]);

  // Close the gap in the ordering so positions stay contiguous.
  const remaining = await listParts(part.exam_id);
  for (const [index, sibling] of remaining.entries()) {
    if (sibling.position !== index) {
      await run('UPDATE exam_parts SET position = ? WHERE id = ?', [index, sibling.id]);
    }
  }
  return part.exam_id;
}

/**
 * The part the student should be working on: the next one not yet sat, by
 * date. Falls back to the last part once everything has been taken.
 */
export function activePart(parts: ExamPart[], now = new Date()): ExamPart | null {
  if (parts.length === 0) return null;

  const upcoming = parts
    .filter((part) => part.status !== 'taken')
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date));

  // Prefer the soonest part that has not happened yet.
  const today = now.toISOString().slice(0, 10);
  const ahead = upcoming.find((part) => part.exam_date >= today);
  return ahead ?? upcoming[0] ?? parts[parts.length - 1];
}

/**
 * Topics no part covers. Worth surfacing: a student who splits a course and
 * forgets a topic would otherwise never be tested on it.
 */
export function uncoveredTopics(parts: ExamPart[], topics: Topic[]): string[] {
  const explicit = parts.filter((part) => partTopics(part).length > 0);
  // With no explicit split, everything is covered by definition.
  if (explicit.length === 0 || explicit.length < parts.length) return [];

  const claimed = new Set(explicit.flatMap((part) => partTopics(part)));
  return topics.map((topic) => topic.name).filter((name) => !claimed.has(name));
}
