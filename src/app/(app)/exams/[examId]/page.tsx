import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadPartSnapshot } from '@/lib/data/part-snapshot';
import { loadDashboard } from '@/lib/data/dashboard';
import { listMistakes } from '@/lib/data/study';
import { gradeToMinPercent, readBands } from '@/lib/engine/grading-scale';
import { OverviewPage } from '@/components/OverviewPage';

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

  const dashboard = await loadDashboard(user.id);
  const entry = dashboard.find((item) => item.exam.id === examId);
  const mistakes = await listMistakes(user.id, examId);
  const inScope = new Set(snapshot.topics);

  return (
    <OverviewPage
      exam={snapshot.exam}
      parts={snapshot.parts}
      activePart={snapshot.part}
      readiness={snapshot.readiness}
      mastery={snapshot.mastery}
      attempts={snapshot.attempts}
      nextAction={entry?.nextAction ?? { kind: 'upload_material', href: `/exams/${examId}/material` }}
      tone={user.tone}
      targetPercent={gradeToMinPercent(
        snapshot.part.target_grade ?? snapshot.exam.target_grade,
        readBands(snapshot.exam),
      )}
      openMistakes={
        mistakes.filter(
          (mistake) =>
            mistake.status !== 'resolved' &&
            (!snapshot.isSplit || inScope.has(mistake.topic_name)),
        ).length
      }
    />
  );
}
