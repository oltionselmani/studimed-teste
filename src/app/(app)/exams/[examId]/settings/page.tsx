import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getExam, listTopics } from '@/lib/data/exams';
import { ensureParts, uncoveredTopics } from '@/lib/data/parts';
import { readBands } from '@/lib/engine/grading-scale';
import { ExamSettings } from '@/components/ExamSettings';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;

  const exam = await getExam(user.id, examId);
  if (!exam) notFound();

  const [parts, topics] = await Promise.all([ensureParts(exam), listTopics(examId)]);

  return (
    <ExamSettings
      exam={exam}
      bands={readBands(exam)}
      parts={parts}
      topics={topics}
      uncovered={uncoveredTopics(parts, topics)}
    />
  );
}
