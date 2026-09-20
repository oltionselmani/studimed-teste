import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { loadPartSnapshot } from '@/lib/data/part-snapshot';
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
  searchParams: Promise<{ kind?: string; topic?: string; part?: string }>;
}) {
  const user = await requireUser();
  const { examId } = await params;
  const query = await searchParams;

  const snapshot = await loadPartSnapshot(user.id, examId, query.part);
  if (!snapshot) notFound();

  const [attempts, previousExams, mistakes, aiReady] = await Promise.all([
    listAttempts(examId),
    listPreviousExams(examId),
    listMistakes(user.id, examId),
    aiAvailable(),
  ]);

  const timeLeft = timeLeftUntil({
    exam_date: snapshot.part.exam_date,
    exam_time: snapshot.part.exam_time,
  });
  const graded = snapshot.attempts.filter((attempt) => attempt.status === 'graded');
  const inScope = new Set(snapshot.topics);

  // Baseline first, a full mock as the sitting approaches, targeted practice
  // in between.
  const suggestedKind: AttemptKind =
    (query.kind as AttemptKind | undefined) ??
    (graded.length === 0 ? 'diagnostic' : timeLeft.days <= 4 ? 'mock' : 'targeted');

  return (
    <TestsPage
      examId={examId}
      parts={snapshot.parts}
      activePart={snapshot.part}
      aiReady={aiReady}
      hasTopics={snapshot.topics.length > 0}
      hasPreviousExams={previousExams.length > 0}
      topics={snapshot.allTopics.filter((topic) => inScope.has(topic.name))}
      mastery={snapshot.mastery}
      attempts={attempts}
      suggestedKind={suggestedKind}
      suggestedTopic={query.topic ?? null}
      openMistakes={
        mistakes.filter(
          (mistake) =>
            mistake.status !== 'resolved' &&
            (!snapshot.isSplit || inScope.has(mistake.topic_name)),
        ).length
      }
      daysLeft={timeLeft.days}
    />
  );
}
