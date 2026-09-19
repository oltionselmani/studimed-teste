'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { chooseDeliveryAction } from '@/lib/actions/attempts';
import { Button, Card, Pill } from '@/components/ui/primitives';
import type { Attempt, Exam } from '@/lib/types';

/**
 * The fork in the road after a test is generated: paper or screen.
 *
 * Both routes end in the same grading and the same analysis, so neither is
 * presented as the "real" one.
 */
export function AttemptReady({
  attempt,
  exam,
  questionCount,
}: {
  attempt: Attempt;
  exam: Exam;
  questionCount: number;
}) {
  const { d, t } = useI18n();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:py-16">
      <div className="rise">
        <Link
          href={`/exams/${exam.id}/tests`}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← {exam.course_name}
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{d.attempt.ready}</h1>
        <p className="tabular mt-1.5 text-sm text-[var(--text-muted)]">
          {t(d.attempt.readySubtitle, {
            count: questionCount,
            points: attempt.total_points,
            time:
              attempt.time_limit_minutes > 0
                ? t(d.attempt.timed, { minutes: attempt.time_limit_minutes })
                : '',
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="accent">{attempt.title}</Pill>
          {attempt.focus_topics ? <Pill>{attempt.focus_topics}</Pill> : null}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <form action={chooseDeliveryAction}>
            <input type="hidden" name="attempt_id" value={attempt.id} />
            <input type="hidden" name="delivery" value="print" />
            <Card className="flex h-full flex-col p-6">
              <IconPrinter />
              <h2 className="mt-4 text-lg font-semibold">{d.attempt.printExam}</h2>
              <p className="mt-1.5 flex-1 text-sm text-[var(--text-muted)]">{d.attempt.printHelp}</p>
              <Button type="submit" variant="secondary" size="lg" className="mt-5 w-full">
                {d.attempt.printExam}
              </Button>
            </Card>
          </form>

          <form action={chooseDeliveryAction}>
            <input type="hidden" name="attempt_id" value={attempt.id} />
            <input type="hidden" name="delivery" value="online" />
            <Card className="flex h-full flex-col border-[var(--accent)] p-6">
              <IconScreen />
              <h2 className="mt-4 text-lg font-semibold">{d.attempt.takeOnline}</h2>
              <p className="mt-1.5 flex-1 text-sm text-[var(--text-muted)]">
                {d.attempt.onlineHelp}
              </p>
              <Button type="submit" size="lg" className="mt-5 w-full">
                {d.attempt.takeOnline}
              </Button>
            </Card>
          </form>
        </div>

        <Card className="mt-6 p-5">
          <h2 className="text-sm font-semibold">{d.attempt.afterPrint}</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{d.scan.subtitle}</p>
          <form action={chooseDeliveryAction} className="mt-4">
            <input type="hidden" name="attempt_id" value={attempt.id} />
            <input type="hidden" name="delivery" value="scan" />
            <Button type="submit" variant="secondary">
              {d.attempt.scanMyExam}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function IconPrinter() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

function IconScreen() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
