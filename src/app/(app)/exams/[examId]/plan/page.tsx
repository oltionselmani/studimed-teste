import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { prioritiseTopics } from '@/lib/data/exams';
import { loadPartSnapshot } from '@/lib/data/part-snapshot';
import { currentPlan, listStudySheets, planTasks } from '@/lib/data/study';
import { aiAvailable } from '@/lib/ai/client';
import { PlanPage } from '@/components/PlanPage';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ part?: string }>;
}) {
  const user = await requireUser();
  const { examId } = await params;
  const { part: partId } = await searchParams;

  const snapshot = await loadPartSnapshot(user.id, examId, partId);
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

  const inScope = new Set(snapshot.topics);
  const scopedTopics = snapshot.allTopics.filter((topic) => inScope.has(topic.name));

  return (
    <PlanPage
      exam={snapshot.exam}
      parts={snapshot.parts}
      activePart={snapshot.part}
      plan={plan}
      tasks={tasks}
      priorities={prioritiseTopics(scopedTopics, snapshot.mastery, 6)}
      avoid={avoid.filter((item) => !snapshot.isSplit || inScope.has(item.topic))}
      topics={scopedTopics}
      sheets={sheets}
      aiReady={aiReady}
      hasResults={snapshot.readiness.gradedAttempts > 0}
      daysLeft={snapshot.readiness.timeLeft.days}
    />
  );
}
