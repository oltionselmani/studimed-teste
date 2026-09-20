import 'server-only';
import { all } from '@/lib/db';
import { computeReadiness, timeLeftUntil, type ReadinessResult } from '@/lib/engine/readiness';
import { listExams } from './exams';
import type { Attempt, Exam, StudyTask, Topic, TopicMastery } from '@/lib/types';

export interface DashboardExam {
  exam: Exam;
  readiness: ReadinessResult;
  nextAction: NextAction;
  attemptCount: number;
}

export type NextAction =
  | { kind: 'upload_material'; href: string }
  | { kind: 'analyse_material'; href: string }
  | { kind: 'take_diagnostic'; href: string }
  | { kind: 'resume_attempt'; href: string; title: string }
  | { kind: 'grade_scan'; href: string; title: string }
  | { kind: 'build_plan'; href: string }
  | { kind: 'study_task'; href: string; title: string; minutes: number }
  | { kind: 'practise_weak'; href: string; topic: string }
  | { kind: 'final_mock'; href: string };

/**
 * One concrete next step per exam. The rule is fixed and readable: fix the
 * thing that is blocking measurement, then work the weakest measured topic.
 */
function decideNextAction(params: {
  exam: Exam;
  readiness: ReadinessResult;
  attempts: Attempt[];
  materialCount: number;
  topicCount: number;
  openTask: StudyTask | null;
  hasPlan: boolean;
}): NextAction {
  const { exam, readiness, attempts } = params;
  const base = `/exams/${exam.id}`;

  const unfinished = attempts.find((attempt) => attempt.status === 'in_progress');
  if (unfinished) {
    return { kind: 'resume_attempt', href: `/attempts/${unfinished.id}/take`, title: unfinished.title };
  }

  const awaitingGrade = attempts.find(
    (attempt) => attempt.delivery === 'scan' && attempt.status !== 'graded',
  );
  if (awaitingGrade) {
    return { kind: 'grade_scan', href: `/attempts/${awaitingGrade.id}/scan`, title: awaitingGrade.title };
  }

  // Only ask for uploads while there is nothing to work from at all. Once the
  // course structure exists, a missing file does not send the student back to
  // the start.
  if (params.topicCount === 0) {
    return params.materialCount === 0
      ? { kind: 'upload_material', href: `${base}/material` }
      : { kind: 'analyse_material', href: `${base}/material` };
  }
  if (readiness.gradedAttempts === 0) return { kind: 'take_diagnostic', href: `${base}/tests` };

  if (readiness.timeLeft.days <= 3) return { kind: 'final_mock', href: `${base}/tests` };
  if (!params.hasPlan) return { kind: 'build_plan', href: `${base}/plan` };
  if (params.openTask) {
    return {
      kind: 'study_task',
      href: `${base}/plan`,
      title: params.openTask.title,
      minutes: params.openTask.minutes,
    };
  }

  const weakest = readiness.weakTopics[0] ?? null;
  if (weakest) {
    return { kind: 'practise_weak', href: `${base}/tests`, topic: weakest.topic };
  }
  return { kind: 'final_mock', href: `${base}/tests` };
}

export async function loadDashboard(userId: string): Promise<DashboardExam[]> {
  const exams = await listExams(userId);
  const result: DashboardExam[] = [];

  for (const exam of exams) {
    const [attempts, mastery, topics, materials, tasks, plans] = await Promise.all([
      all<Attempt>('SELECT * FROM attempts WHERE exam_id = ?', [exam.id]),
      all<TopicMastery>('SELECT * FROM topic_mastery WHERE exam_id = ?', [exam.id]),
      all<Topic>('SELECT * FROM topics WHERE exam_id = ?', [exam.id]),
      all<{ id: string }>('SELECT id FROM materials WHERE exam_id = ?', [exam.id]),
      all<StudyTask>(
        `SELECT t.* FROM study_tasks t
         JOIN study_plans p ON p.id = t.plan_id
         WHERE p.exam_id = ? AND p.is_current = 1 AND t.done = 0
         ORDER BY t.day_index ASC, t.position ASC LIMIT 1`,
        [exam.id],
      ),
      all<{ id: string }>('SELECT id FROM study_plans WHERE exam_id = ? AND is_current = 1', [
        exam.id,
      ]),
    ]);

    const readiness = computeReadiness({
      exam,
      attempts,
      mastery,
      topicNames: topics.map((topic) => topic.name),
    });

    result.push({
      exam,
      readiness,
      attemptCount: attempts.length,
      nextAction: decideNextAction({
        exam,
        readiness,
        attempts,
        materialCount: materials.length,
        topicCount: topics.length,
        openTask: tasks[0] ?? null,
        hasPlan: plans.length > 0,
      }),
    });
  }

  return result;
}

export interface ExamConflict {
  exams: DashboardExam[];
  withinDays: number;
  /** Suggested share of study time per exam, summing to 100. */
  split: { course: string; percent: number }[];
}

/**
 * Flags exams bunched together and proposes a split of study time.
 *
 * The weighting is explicit: how far each exam is from its target, and how soon
 * it is. An exam already at target does not get the same share as one that is
 * 25 points short.
 */
export function findConflicts(entries: DashboardExam[], windowDays = 8): ExamConflict | null {
  const upcoming = entries
    .filter((entry) => !entry.readiness.timeLeft.passed)
    .sort((a, b) => a.readiness.timeLeft.days - b.readiness.timeLeft.days);

  if (upcoming.length < 2) return null;

  const cluster = upcoming.filter(
    (entry) => entry.readiness.timeLeft.days - upcoming[0].readiness.timeLeft.days <= windowDays,
  );
  if (cluster.length < 2) return null;

  const weights = cluster.map((entry) => {
    const gap = entry.readiness.gap === null ? 20 : Math.max(0, -entry.readiness.gap);
    const urgency = 1 / Math.max(1, entry.readiness.timeLeft.days);
    // A floor keeps every exam in the split even when it is already on target.
    return { entry, weight: (gap + 8) * (0.4 + urgency * 4) };
  });

  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  const split = weights.map((item) => ({
    course: item.entry.exam.course_name,
    percent: Math.round((item.weight / total) * 100),
  }));

  // Absorb rounding drift into the largest share.
  const drift = 100 - split.reduce((sum, item) => sum + item.percent, 0);
  if (drift !== 0 && split.length > 0) {
    const largest = split.reduce((best, item) => (item.percent > best.percent ? item : best), split[0]);
    largest.percent += drift;
  }

  return {
    exams: cluster,
    withinDays:
      cluster[cluster.length - 1].readiness.timeLeft.days - cluster[0].readiness.timeLeft.days + 1,
    split,
  };
}

export { timeLeftUntil };
