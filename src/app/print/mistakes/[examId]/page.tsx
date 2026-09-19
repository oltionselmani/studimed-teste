import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getExam } from '@/lib/data/exams';
import { listMistakes } from '@/lib/data/study';
import { MistakeSheetDoc } from '@/components/print/MistakeSheetDoc';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;

  const exam = await getExam(user.id, examId);
  if (!exam) notFound();

  const mistakes = (await listMistakes(user.id, examId)).filter(
    (mistake) => mistake.status !== 'resolved',
  );

  return <MistakeSheetDoc exam={exam} mistakes={mistakes} />;
}
