'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { Pill, cx } from '@/components/ui/primitives';
import type { Exam } from '@/lib/types';

/**
 * The countdown ticks live. It is rendered from an ISO timestamp rather than a
 * server-computed string so it stays correct without a page refresh.
 */
export function ExamHeader({ exam }: { exam: Exam }) {
  const { d, t, date } = useI18n();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const target = new Date(
    `${exam.exam_date}T${/^\d{2}:\d{2}$/.test(exam.exam_time) ? exam.exam_time : '09:00'}:00`,
  ).getTime();

  const remaining = now === null ? null : target - now;
  const passed = remaining !== null && remaining <= 0;
  const days = remaining === null ? 0 : Math.floor(Math.max(0, remaining) / 86_400_000);
  const hours = remaining === null ? 0 : Math.floor((Math.max(0, remaining) % 86_400_000) / 3_600_000);

  return (
    <header className="pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{exam.course_name}</h1>
          <p className="tabular mt-1 text-sm text-[var(--text-muted)]">
            {date(exam.exam_date)}
            {exam.exam_time ? ` · ${exam.exam_time}` : ''}
            {exam.course_code ? ` · ${exam.course_code}` : ''}
            {exam.professor ? ` · ${exam.professor}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent">
            {d.exam.target} {exam.target_grade}
          </Pill>
          {exam.exam_weight !== null ? (
            <Pill>
              {d.exam.weight} {exam.exam_weight}%
            </Pill>
          ) : null}
          {exam.current_grade !== null ? (
            <Pill>
              {d.exam.currentGrade} {exam.current_grade}
            </Pill>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
          {d.exam.timeLeft}
        </div>
        <div
          className={cx(
            'tabular mt-0.5 text-[28px] font-semibold leading-tight',
            passed ? 'text-[var(--text-muted)]' : days <= 3 ? 'text-[var(--bad)]' : undefined,
          )}
        >
          {now === null ? (
            <span className="pulse-soft text-[var(--text-subtle)]">—</span>
          ) : passed ? (
            d.exam.examPassed
          ) : (
            t(d.exam.timeLeftValue, { days, hours })
          )}
        </div>
      </div>
    </header>
  );
}
