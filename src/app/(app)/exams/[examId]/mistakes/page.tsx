import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getExam } from '@/lib/data/exams';
import { listMistakes } from '@/lib/data/study';
import { MistakesPage } from '@/components/MistakesPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;

  const exam = await getExam(user.id, examId);
  if (!exam) notFound();

  return <MistakesPage exam={exam} mistakes={await listMistakes(user.id, examId)} />;
}
