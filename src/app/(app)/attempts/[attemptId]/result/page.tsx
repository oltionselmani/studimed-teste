import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttempt, listAnswers, listQuestions } from '@/lib/data/attempts';
import { getExam } from '@/lib/data/exams';
import { percentToGrade, readBands } from '@/lib/engine/grading-scale';
import { ResultView, type TopicResult } from '@/components/ResultView';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;

  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) notFound();
  if (attempt.status !== 'graded') redirect(`/attempts/${attemptId}`);

  const [exam, questions, answers] = await Promise.all([
    getExam(user.id, attempt.exam_id),
    listQuestions(attemptId),
    listAnswers(attemptId),
  ]);
  if (!exam) notFound();

  const answerBy = new Map(answers.map((answer) => [answer.question_id, answer]));

  // Per-topic percentage for this attempt only. Answers that could not be read
  // are excluded from both sides of the fraction.
  const byTopic = new Map<string, { earned: number; possible: number; count: number }>();
  for (const question of questions) {
    const answer = answerBy.get(question.id);
    if (answer?.verdict === 'uncertain') continue;
    const key = question.topic_name || '—';
    const entry = byTopic.get(key) ?? { earned: 0, possible: 0, count: 0 };
    entry.earned += answer?.awarded_points ?? 0;
    entry.possible += question.points;
    entry.count += 1;
    byTopic.set(key, entry);
  }

  const topicResults: TopicResult[] = [...byTopic.entries()]
    .map(([topic, entry]) => ({
      topic,
      percent: entry.possible > 0 ? (entry.earned / entry.possible) * 100 : 0,
      questions: entry.count,
    }))
    .sort((a, b) => a.percent - b.percent);

  const percent =
    attempt.total_points > 0 ? ((attempt.earned_points ?? 0) / attempt.total_points) * 100 : 0;

  return (
    <ResultView
      exam={exam}
      attempt={attempt}
      questions={questions}
      answers={answers}
      topicResults={topicResults}
      grade={percentToGrade(percent, readBands(exam))}
      percent={percent}
      weakest={topicResults.filter((row) => row.percent < 60).slice(0, 3).map((row) => row.topic)}
      strongest={[...topicResults].reverse().filter((row) => row.percent >= 80).slice(0, 2).map((row) => row.topic)}
    />
  );
}
