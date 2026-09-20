import 'server-only';
import { loadExamSnapshot, prioritiseTopics } from './exams';
import { currentPlan, listMistakes, planTasks } from './study';
import { gradeToMinPercent, readBands } from '@/lib/engine/grading-scale';
import type { ReadinessResult } from '@/lib/engine/readiness';
import type { Exam, Mistake, StudyTask } from '@/lib/types';

export interface FinalReport {
  exam: Exam;
  readiness: ReadinessResult;
  targetPercent: number;
  recentScores: { label: string; percent: number; title: string }[];
  strongest: { topic: string; mastery: number }[];
  weakest: { topic: string; mastery: number }[];
  untested: string[];
  recurringMistakes: Mistake[];
  priorities: { topic: string; mastery: number | null }[];
  avoid: { topic: string; reason: string }[];
  remainingTasks: StudyTask[];
  generatedAt: string;
}

/**
 * Assembles the final readiness report entirely from stored measurements. No
 * model call is involved, so the report cannot say anything the data does not.
 */
export async function buildFinalReport(
  userId: string,
  examId: string,
): Promise<FinalReport | null> {
  const snapshot = await loadExamSnapshot(userId, examId);
  if (!snapshot) return null;

  const plan = await currentPlan(examId);
  const [tasks, mistakes] = await Promise.all([
    plan ? planTasks(plan.id) : Promise.resolve([]),
    listMistakes(userId, examId),
  ]);

  let avoid: { topic: string; reason: string }[] = [];
  if (plan?.avoid_json) {
    try {
      avoid = JSON.parse(plan.avoid_json) as { topic: string; reason: string }[];
    } catch {
      avoid = [];
    }
  }

  const recentScores = snapshot.attempts
    .filter((attempt) => attempt.status === 'graded' && attempt.total_points > 0)
    .sort((a, b) => (a.graded_at ?? '').localeCompare(b.graded_at ?? ''))
    .slice(-6)
    .map((attempt) => ({
      label: (attempt.graded_at ?? attempt.created_at).slice(0, 10),
      percent: ((attempt.earned_points ?? 0) / attempt.total_points) * 100,
      title: attempt.title,
    }));

  return {
    exam: snapshot.exam,
    readiness: snapshot.readiness,
    targetPercent: gradeToMinPercent(snapshot.exam.target_grade, readBands(snapshot.exam)),
    recentScores,
    strongest: snapshot.readiness.strongTopics.slice(0, 4),
    weakest: snapshot.readiness.weakTopics.slice(0, 5),
    untested: snapshot.readiness.untestedTopics,
    // "Still recurring" means missed more than once and not yet resolved.
    recurringMistakes: mistakes.filter(
      (mistake) => mistake.status !== 'resolved' && mistake.times_missed > 1,
    ),
    priorities: prioritiseTopics(snapshot.topics, snapshot.mastery, 5),
    avoid,
    remainingTasks: tasks.filter((task) => !task.done),
    generatedAt: new Date().toISOString(),
  };
}
