import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { buildFinalReport } from '@/lib/data/report';
import { ReportView } from '@/components/ReportView';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;

  const report = await buildFinalReport(user.id, examId);
  if (!report) notFound();

  return <ReportView report={report} tone={user.tone} />;
}
