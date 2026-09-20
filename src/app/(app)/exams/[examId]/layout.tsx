import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getExam } from '@/lib/data/exams';
import { activePart, ensureParts } from '@/lib/data/parts';
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

  // The header counts down to the next sitting, which for a split course is a
  // kolokvium rather than the course's own date.
  const parts = await ensureParts(exam);
  const next = activePart(parts);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <ExamHeader
        exam={exam}
        partName={parts.length > 1 ? (next?.name ?? null) : null}
        partDate={next?.exam_date ?? exam.exam_date}
        partTime={next?.exam_time ?? exam.exam_time}
      />
      <ExamTabs examId={exam.id} />
      <div className="pt-7">
        {exam.grading_scale === 'unknown' ? <ScaleUnknownBanner examId={exam.id} /> : null}
        {children}
      </div>
    </div>
  );
}
