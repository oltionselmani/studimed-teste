import { requireUser } from '@/lib/auth/session';
import { ExamForm } from '@/components/ExamForm';

export const dynamic = 'force-dynamic';

export default async function NewExamPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
      <ExamForm />
    </div>
  );
}
