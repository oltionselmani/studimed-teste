import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttempt, listAnswers, listQuestions, startAttempt } from '@/lib/data/attempts';
import { persist } from '@/lib/db';
import { ExamRunner } from '@/components/ExamRunner';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;

  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) notFound();
  if (attempt.status === 'graded') redirect(`/attempts/${attemptId}/result`);

  await startAttempt(user.id, attemptId);
  await persist();

  const [questions, answers, refreshed] = await Promise.all([
    listQuestions(attemptId),
    listAnswers(attemptId),
    getAttempt(user.id, attemptId),
  ]);

  return (
    <ExamRunner attempt={refreshed ?? attempt} questions={questions} initialAnswers={answers} />
  );
}
