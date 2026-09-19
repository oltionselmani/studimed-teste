import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadExamSnapshot } from '@/lib/data/exams';
import { loadDashboard } from '@/lib/data/dashboard';
import { listMistakes } from '@/lib/data/study';
import { gradeToMinPercent, readBands } from '@/lib/engine/grading-scale';
import { OverviewPage } from '@/components/OverviewPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;

  const snapshot = await loadExamSnapshot(user.id, examId);
  if (!snapshot) notFound();

  const dashboard = await loadDashboard(user.id);
  const entry = dashboard.find((item) => item.exam.id === examId);
  const mistakes = await listMistakes(user.id, examId);

  return (
    <OverviewPage
      exam={snapshot.exam}
      readiness={snapshot.readiness}
      mastery={snapshot.mastery}
      attempts={snapshot.attempts}
      nextAction={entry?.nextAction ?? { kind: 'upload_material', href: `/exams/${examId}/material` }}
      tone={user.tone}
      targetPercent={gradeToMinPercent(snapshot.exam.target_grade, readBands(snapshot.exam))}
      openMistakes={mistakes.filter((mistake) => mistake.status !== 'resolved').length}
    />
  );
}
