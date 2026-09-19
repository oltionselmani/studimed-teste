import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadExamSnapshot } from '@/lib/data/exams';
import { listSnapshots } from '@/lib/data/study';
import { gradeToMinPercent, readBands } from '@/lib/engine/grading-scale';
import { HistoryPage } from '@/components/HistoryPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;

  const snapshot = await loadExamSnapshot(user.id, examId);
  if (!snapshot) notFound();

  return (
    <HistoryPage
      exam={snapshot.exam}
      attempts={snapshot.attempts}
      snapshots={await listSnapshots(examId)}
      mastery={snapshot.mastery}
      targetPercent={gradeToMinPercent(snapshot.exam.target_grade, readBands(snapshot.exam))}
    />
  );
}
