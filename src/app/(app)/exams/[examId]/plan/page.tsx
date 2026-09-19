import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadExamSnapshot, prioritiseTopics } from '@/lib/data/exams';
import { currentPlan, listStudySheets, planTasks } from '@/lib/data/study';
import { aiAvailable } from '@/lib/ai/client';
import { PlanPage } from '@/components/PlanPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;

  const snapshot = await loadExamSnapshot(user.id, examId);
  if (!snapshot) notFound();

  const plan = await currentPlan(examId);
  const [tasks, sheets, aiReady] = await Promise.all([
    plan ? planTasks(plan.id) : Promise.resolve([]),
    listStudySheets(examId),
    aiAvailable(),
  ]);

  let avoid: { topic: string; reason: string }[] = [];
  if (plan?.avoid_json) {
    try {
      avoid = JSON.parse(plan.avoid_json) as { topic: string; reason: string }[];
    } catch {
      avoid = [];
    }
  }

  return (
    <PlanPage
      exam={snapshot.exam}
      plan={plan}
      tasks={tasks}
      priorities={prioritiseTopics(snapshot.topics, snapshot.mastery, 6)}
      avoid={avoid}
      topics={snapshot.topics}
      sheets={sheets}
      aiReady={aiReady}
      hasResults={snapshot.readiness.gradedAttempts > 0}
      daysLeft={snapshot.readiness.timeLeft.days}
    />
  );
}
