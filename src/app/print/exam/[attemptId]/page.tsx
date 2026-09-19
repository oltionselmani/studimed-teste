import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttempt, listQuestions } from '@/lib/data/attempts';
import { getExam } from '@/lib/data/exams';
import { ExamPaper } from '@/components/print/ExamPaper';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;

  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) notFound();
  const [exam, questions] = await Promise.all([
    getExam(user.id, attempt.exam_id),
    listQuestions(attemptId),
  ]);
  if (!exam) notFound();

  return (
    <ExamPaper exam={exam} attempt={attempt} questions={questions} user={user} answerKey={false} />
  );
}
