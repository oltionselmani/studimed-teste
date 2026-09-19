'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { setMistakeStatusAction } from '@/lib/actions/study';
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Pill,
  SectionTitle,
  cx,
} from '@/components/ui/primitives';
import type { Exam, Mistake } from '@/lib/types';

/**
 * The mistake book. Every question that lost points is kept here with the
 * concept that was missing, until the student answers that concept correctly.
 */
export function MistakesPage({
  exam,
  mistakes,
}: {
  exam: Exam;
  mistakes: Mistake[];
}) {
  const { d, t, date } = useI18n();

  const open = mistakes.filter((mistake) => mistake.status === 'open');
  const improving = mistakes.filter((mistake) => mistake.status === 'improving');
  const resolved = mistakes.filter((mistake) => mistake.status === 'resolved');
  const dueToday = open.filter((mistake) => mistake.next_review_at <= new Date().toISOString());

  if (mistakes.length === 0) {
    return <EmptyState title={d.mistakes.empty} body={d.mistakes.emptyBody} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{d.mistakes.title}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{d.mistakes.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/exams/${exam.id}/tests?kind=mistake_review`} size="sm">
            {d.mistakes.testOnThese}
          </ButtonLink>
          <ButtonLink href={`/print/mistakes/${exam.id}`} variant="secondary" size="sm">
            {d.mistakes.printMistakes}
          </ButtonLink>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Pill tone="bad">
          {d.mistakes.statusOpen}: {open.length}
        </Pill>
        <Pill tone="warn">
          {d.mistakes.statusImproving}: {improving.length}
        </Pill>
        <Pill tone="ok">
          {d.mistakes.statusResolved}: {resolved.length}
        </Pill>
        {dueToday.length > 0 ? (
          <Pill tone="accent">
            {d.mistakes.dueToday}: {dueToday.length}
          </Pill>
        ) : null}
      </div>

      {[
        { label: d.mistakes.statusOpen, items: open },
        { label: d.mistakes.statusImproving, items: improving },
        { label: d.mistakes.statusResolved, items: resolved },
      ]
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.label}>
            <SectionTitle>{group.label}</SectionTitle>
            <div className="space-y-3">
              {group.items.map((mistake) => (
                <MistakeCard key={mistake.id} mistake={mistake} examId={exam.id} />
              ))}
            </div>
          </section>
        ))}

      <p className="text-xs text-[var(--text-subtle)]">
        {t(d.mistakes.nextReview, {})}
        {dueToday.length > 0 ? ` · ${date(dueToday[0].next_review_at)}` : ''}
      </p>
    </div>
  );
}

function MistakeCard({ mistake, examId }: { mistake: Mistake; examId: string }) {
  const { d, t, date } = useI18n();

  return (
    <Card as="article" className="avoid-break overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {mistake.topic_name ? <Pill tone="accent">{mistake.topic_name}</Pill> : null}
          {mistake.times_missed > 1 ? (
            <Pill tone="bad">{t(d.mistakes.timesMissed, { count: mistake.times_missed })}</Pill>
          ) : null}
        </div>
        <span className="tabular text-xs text-[var(--text-subtle)]">
          {d.mistakes.nextReview}: {date(mistake.next_review_at)}
        </span>
      </div>

      <div className="space-y-3.5 px-5 py-4">
        <p className="text-sm font-medium">{mistake.question_prompt}</p>

        <Field label={d.mistakes.yourAnswer} body={mistake.user_answer || '—'} />
        <Field label={d.mistakes.correctConcept} body={mistake.correct_concept} highlight />
        {mistake.why_lost_points ? (
          <Field label={d.mistakes.whyLost} body={mistake.why_lost_points} />
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <form action={setMistakeStatusAction}>
            <input type="hidden" name="mistake_id" value={mistake.id} />
            <input type="hidden" name="exam_id" value={examId} />
            <input
              type="hidden"
              name="status"
              value={mistake.status === 'resolved' ? 'open' : 'resolved'}
            />
            <Button type="submit" variant="secondary" size="sm">
              {mistake.status === 'resolved' ? d.mistakes.reopen : d.mistakes.markResolved}
            </Button>
          </form>
          {mistake.topic_name ? (
            <Link
              href={`/exams/${examId}/tests?kind=targeted&topic=${encodeURIComponent(mistake.topic_name)}`}
              className="inline-flex items-center text-sm font-medium text-[var(--accent-text)] hover:underline"
            >
              {d.results.testAgain}
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function Field({ label, body, highlight }: { label: string; body: string; highlight?: boolean }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
        {label}
      </h4>
      <p
        className={cx(
          'mt-1 whitespace-pre-wrap text-sm',
          highlight ? 'font-medium' : 'text-[var(--text-muted)]',
        )}
      >
        {body}
      </p>
    </div>
  );
}
