import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttempt, listAnswers, listQuestions, listScanPages } from '@/lib/data/attempts';
import { getExam } from '@/lib/data/exams';
import { aiAvailable } from '@/lib/ai/client';
import { ScanFlow } from '@/components/ScanFlow';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;

  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) notFound();

  const [exam, pages, questions, answers, aiReady] = await Promise.all([
    getExam(user.id, attempt.exam_id),
    listScanPages(attemptId),
    listQuestions(attemptId),
    listAnswers(attemptId),
    aiAvailable(),
  ]);
  if (!exam) notFound();

  return (
    <ScanFlow
      exam={exam}
      attempt={attempt}
      pages={pages}
      questions={questions}
      answers={answers}
      aiReady={aiReady}
    />
  );
}
