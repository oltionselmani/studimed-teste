import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttempt, listQuestions } from '@/lib/data/attempts';
import { getExam } from '@/lib/data/exams';
import { AttemptReady } from '@/components/AttemptReady';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;

  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) notFound();
  if (attempt.status === 'graded') redirect(`/attempts/${attemptId}/result`);

  const [exam, questions] = await Promise.all([
    getExam(user.id, attempt.exam_id),
    listQuestions(attemptId),
  ]);
  if (!exam) notFound();

  return <AttemptReady attempt={attempt} exam={exam} questionCount={questions.length} />;
}
