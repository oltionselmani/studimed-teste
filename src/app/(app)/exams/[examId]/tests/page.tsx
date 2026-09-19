import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getExam, listMastery, listTopics } from '@/lib/data/exams';
import { listAttempts } from '@/lib/data/attempts';
import { listPreviousExams } from '@/lib/data/materials';
import { listMistakes } from '@/lib/data/study';
import { timeLeftUntil } from '@/lib/engine/readiness';
import { aiAvailable } from '@/lib/ai/client';
import { TestsPage } from '@/components/TestsPage';
import type { AttemptKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ kind?: string; topic?: string }>;
}) {
  const user = await requireUser();
  const { examId } = await params;
  const query = await searchParams;
  const exam = await getExam(user.id, examId);
  if (!exam) notFound();

  const [topics, mastery, attempts, previousExams, mistakes, aiReady] = await Promise.all([
    listTopics(examId),
    listMastery(examId),
    listAttempts(examId),
    listPreviousExams(examId),
    listMistakes(user.id, examId),
    aiAvailable(),
  ]);

  const timeLeft = timeLeftUntil(exam);
  const graded = attempts.filter((attempt) => attempt.status === 'graded');

  // A sensible default: baseline first, a full mock as the exam approaches,
  // targeted practice in between.
  const suggestedKind: AttemptKind =
    (query.kind as AttemptKind | undefined) ??
    (graded.length === 0 ? 'diagnostic' : timeLeft.days <= 4 ? 'mock' : 'targeted');

  return (
    <TestsPage
      examId={examId}
      aiReady={aiReady}
      hasTopics={topics.length > 0}
      hasPreviousExams={previousExams.length > 0}
      topics={topics}
      mastery={mastery}
      attempts={attempts}
      suggestedKind={suggestedKind}
      suggestedTopic={query.topic ?? null}
      openMistakes={mistakes.filter((mistake) => mistake.status !== 'resolved').length}
      daysLeft={timeLeft.days}
    />
  );
}
