import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getExam } from '@/lib/data/exams';
import { ExamHeader } from '@/components/ExamHeader';
import { ExamTabs } from '@/components/ExamTabs';
import { ScaleUnknownBanner } from '@/components/ScaleUnknownBanner';

export const dynamic = 'force-dynamic';

export default async function ExamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ examId: string }>;
}) {
  const user = await requireUser();
  const { examId } = await params;
  const exam = await getExam(user.id, examId);
  if (!exam) notFound();

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <ExamHeader exam={exam} />
      <ExamTabs examId={exam.id} />
      <div className="pt-7">
        {exam.grading_scale === 'unknown' ? <ScaleUnknownBanner examId={exam.id} /> : null}
        {children}
      </div>
    </div>
  );
}
