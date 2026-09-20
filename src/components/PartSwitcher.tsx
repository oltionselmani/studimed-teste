'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { Pill, cx } from '@/components/ui/primitives';
import type { ExamPart } from '@/lib/types';

/**
 * Chooses which sitting the page is talking about.
 *
 * Hidden entirely when an exam has a single part, so a course that is not split
 * never pays for a concept it does not use.
 */
export function PartSwitcher({
  parts,
  active,
  examId,
}: {
  parts: ExamPart[];
  active: ExamPart;
  examId: string;
}) {
  const { d, t, date } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams();

  if (parts.length < 2) return null;

  function hrefFor(part: ExamPart): string {
    const params = new URLSearchParams(search.toString());
    params.set('part', part.id);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="no-print mb-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
        {d.parts.switcher}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={d.parts.title}>
        {parts.map((part) => {
          const current = part.id === active.id;
          return (
            <Link
              key={part.id}
              href={hrefFor(part)}
              aria-current={current ? 'true' : undefined}
              className={cx(
                'rounded-lg border px-3.5 py-2 text-sm transition-colors',
                current
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'hover:bg-[var(--bg-hover)]',
              )}
            >
              <span
                className={cx(
                  'block font-medium',
                  current ? 'text-[var(--accent-text)]' : undefined,
                )}
              >
                {part.name}
              </span>
              <span className="tabular mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
                {date(part.exam_date)}
                {part.result_grade !== null ? (
                  <Pill tone="ok">{t(d.parts.banked, { grade: part.result_grade })}</Pill>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {t(d.parts.scopeNote, { part: active.name })}
      </p>
    </div>
  );
}

/** A compact, non-interactive version for pages that only need the context. */
export function PartScopeNote({ parts, active }: { parts: ExamPart[]; active: ExamPart }) {
  const { d, t } = useI18n();
  if (parts.length < 2) return null;
  return (
    <p className="no-print mb-4 rounded-lg bg-[var(--bg-sunken)] px-3.5 py-2.5 text-xs text-[var(--text-muted)]">
      {t(d.parts.scopeNote, { part: active.name })}
    </p>
  );
}
