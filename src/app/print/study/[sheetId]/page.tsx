import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getStudySheet } from '@/lib/data/study';
import { getExam } from '@/lib/data/exams';
import { StudySheetDoc } from '@/components/print/StudySheetDoc';
import type { StudySheet } from '@/lib/ai/schemas';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ sheetId: string }> }) {
  const user = await requireUser();
  const { sheetId } = await params;

  const row = await getStudySheet(user.id, sheetId);
  if (!row) notFound();

  const exam = await getExam(user.id, row.exam_id);
  if (!exam) notFound();

  let sheet: StudySheet;
  try {
    sheet = JSON.parse(row.content_json) as StudySheet;
  } catch {
    notFound();
  }

  return (
    <StudySheetDoc
      sheet={sheet}
      topic={row.topic_name || row.title}
      courseName={exam.course_name}
      createdAt={row.created_at}
    />
  );
}
