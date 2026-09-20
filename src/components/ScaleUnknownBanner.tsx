'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Notice } from '@/components/ui/primitives';

/**
 * Shown on every page of an exam whose grading conversion the student said they
 * did not know. The app still has to convert percentages into grades to plan
 * against a target, so it says plainly which assumption it is using and keeps
 * asking until the student confirms it.
 */
export function ScaleUnknownBanner({ examId }: { examId: string }) {
  const { d } = useI18n();

  return (
    <Notice tone="warn" className="no-print mb-5">
      <strong className="block">{d.exam.scaleUnknownTitle}</strong>
      <span className="mt-1 block text-xs">{d.exam.scaleUnknownBody}</span>
      <Link
        href={`/exams/${examId}/settings`}
        className="mt-2 inline-block text-xs font-semibold underline"
      >
        {d.exam.scaleUnknownAction} →
      </Link>
    </Notice>
  );
}
