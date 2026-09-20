import 'server-only';
import { all } from '@/lib/db';
import { getExam, listMastery, listTopics } from './exams';
import { attemptsScopedToTopics } from './attempts';
import { activePart, effectiveTopics, ensureParts, getPart } from './parts';
import { readBands } from '@/lib/engine/grading-scale';
import { computeReadiness, requiredPartPercentage, type ReadinessResult } from '@/lib/engine/readiness';
import type { Attempt, Exam, ExamPart, Topic, TopicMastery } from '@/lib/types';

/**
 * Everything a page needs to talk about one part of an exam.
 *
 * Readiness here is measured only over the topics the part covers, from tests
 * re-scored over those same topics — so "ready for kolokvium 1" never borrows
 * credit from material kolokvium 1 does not examine.
 */
export interface PartSnapshot {
  exam: Exam;
  parts: ExamPart[];
  part: ExamPart;
  /** Topics this part is measured on. */
  topics: string[];
  /** Every topic in the course, for pickers and coverage warnings. */
  allTopics: Topic[];
  mastery: TopicMastery[];
  attempts: Attempt[];
  readiness: ReadinessResult;
  /** True when the exam is split into more than one sitting. */
  isSplit: boolean;
}

export async function loadPartSnapshot(
  userId: string,
  examId: string,
  partId?: string | null,
): Promise<PartSnapshot | null> {
  const exam = await getExam(userId, examId);
  if (!exam) return null;

  const parts = await ensureParts(exam);
  const requested = partId ? await getPart(userId, partId) : null;
  const part =
    requested && requested.exam_id === examId ? requested : (activePart(parts) ?? parts[0]);
  if (!part) return null;

  const [allTopics, allMastery] = await Promise.all([listTopics(examId), listMastery(examId)]);
  const topicNames = allTopics.map((topic) => topic.name);
  const scope = effectiveTopics(part, parts, topicNames);

  const isSplit = parts.length > 1;
  const inScope = new Set(scope);

  // With a single sitting the whole course is the scope, so the unscoped
  // figures are already correct and cost one query fewer.
  const attempts = isSplit
    ? await attemptsScopedToTopics(examId, scope)
    : await all<Attempt>('SELECT * FROM attempts WHERE exam_id = ? ORDER BY created_at ASC', [
        examId,
      ]);

  const mastery = isSplit
    ? allMastery.filter((row) => inScope.has(row.topic_name))
    : allMastery;

  const required = requiredPartPercentage(exam, part, parts, readBands(exam));

  return {
    exam,
    parts,
    part,
    topics: scope,
    allTopics,
    mastery,
    attempts,
    isSplit,
    readiness: computeReadiness({
      // The countdown must run to this part's date, not the course's.
      exam: { ...exam, exam_date: part.exam_date, exam_time: part.exam_time },
      attempts,
      mastery,
      topicNames: scope,
      required: { percent: required.percent, confidence: required.confidence },
      scopeLabel: isSplit ? part.name : undefined,
    }),
  };
}
