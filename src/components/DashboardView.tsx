'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { ButtonLink, Card, EmptyState, Notice, Pill, SectionTitle, cx } from '@/components/ui/primitives';
import { bandLabel } from '@/components/ReadinessPanel';
import { ReadinessGauge } from '@/components/charts/ReadinessGauge';
import type { DashboardExam, ExamConflict, NextAction } from '@/lib/data/dashboard';
import type { NotificationRow } from '@/lib/types';

export function DashboardView({
  entries,
  conflict,
  notifications,
  notificationsEnabled,
}: {
  entries: DashboardExam[];
  conflict: ExamConflict | null;
  notifications: NotificationRow[];
  notificationsEnabled: boolean;
}) {
  const { d, t } = useI18n();

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:py-14">
        <h1 className="text-2xl font-semibold tracking-tight">{d.dashboard.title}</h1>
        <div className="mt-8">
          <EmptyState
            icon={<IconBooks />}
            title={d.dashboard.emptyTitle}
            body={d.dashboard.emptyBody}
            action={
              <ButtonLink href="/exams/new" size="lg">
                {d.dashboard.createFirst}
              </ButtonLink>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.dashboard.title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{d.dashboard.greeting}</p>
        </div>
        <ButtonLink href="/exams/new" variant="secondary" size="sm">
          + {d.nav.newExam}
        </ButtonLink>
      </header>

      {conflict ? (
        <Card className="mt-7 border-[var(--warn)] bg-[var(--warn-soft)] p-5">
          <h2 className="text-sm font-semibold text-[var(--warn)]">{d.dashboard.conflictTitle}</h2>
          <p className="mt-1.5 text-sm text-[var(--text)]">
            {t(d.dashboard.conflictBody, {
              count: conflict.exams.length,
              days: conflict.withinDays,
              courses: conflict.exams.map((entry) => entry.exam.course_name).join(', '),
            })}
          </p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">{d.dashboard.conflictAdvice}</p>
          <ul className="mt-2 space-y-1.5">
            {conflict.split.map((item) => (
              <li key={item.course} className="flex items-center gap-3 text-sm">
                <span className="w-10 shrink-0 text-right font-semibold tabular">{item.percent}%</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <span
                    className="block h-full rounded-r-[4px] bg-[var(--warn)]"
                    style={{ width: `${item.percent}%` }}
                  />
                </span>
                <span className="w-1/3 min-w-0 truncate text-[var(--text-muted)]">{item.course}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="mt-8">
        <SectionTitle>{d.dashboard.myExams}</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <ExamCard key={entry.exam.id} entry={entry} />
          ))}
        </div>
      </section>

      {notificationsEnabled && notifications.length > 0 ? (
        <section className="mt-10">
          <SectionTitle>{d.dashboard.notifications}</SectionTitle>
          <Card className="divide-y">
            {notifications.slice(0, 6).map((item) => (
              <NotificationRowView key={item.id} row={item} />
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function ExamCard({ entry }: { entry: DashboardExam }) {
  const { d, t, date } = useI18n();
  const { exam, readiness } = entry;
  const passed = readiness.timeLeft.passed;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/exams/${exam.id}`}
            className="block truncate text-[17px] font-semibold hover:text-[var(--accent-text)]"
          >
            {exam.course_name}
          </Link>
          <p className="tabular mt-0.5 text-sm text-[var(--text-muted)]">
            {date(exam.exam_date)}
            {exam.exam_time ? ` · ${exam.exam_time}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {entry.partName ? <Pill>{entry.partName}</Pill> : null}
          <Pill tone="accent">
            {d.exam.target} {exam.target_grade}
          </Pill>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.exam.timeLeft}
          </div>
          <div
            className={cx(
              'tabular text-xl font-semibold',
              !passed && readiness.timeLeft.days <= 3 ? 'text-[var(--bad)]' : undefined,
            )}
          >
            {passed
              ? '—'
              : `${readiness.timeLeft.days} ${readiness.timeLeft.days === 1 ? d.common.day : d.common.days}`}
          </div>
        </div>
        {readiness.recentAveragePercent !== null ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
              {d.report.recentAverage}
            </div>
            <div className="tabular text-xl font-semibold">
              {Math.round(readiness.recentAveragePercent)}%
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 border-t pt-4">
        {passed ? (
          <p className="text-sm text-[var(--text-muted)]">{d.exam.examPassed}</p>
        ) : readiness.insufficientData ? (
          <p className="text-sm text-[var(--text-muted)]">{d.readiness.noDataBody}</p>
        ) : (
          <ReadinessGauge
            score={readiness.score}
            band={readiness.band}
            bandLabel={bandLabel(readiness.band, d)}
            size={84}
            caption={
              readiness.weakTopics.length > 0
                ? t(d.results.biggestWeaknesses, {
                    topics: readiness.weakTopics.slice(0, 2).map((item) => item.topic).join(', '),
                  })
                : undefined
            }
          />
        )}
      </div>

      {!passed ? (
        <div className="mt-4 rounded-lg bg-[var(--bg-sunken)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.dashboard.nextAction}
          </div>
          <NextActionLink action={entry.nextAction} />
        </div>
      ) : null}
    </Card>
  );
}

export function NextActionLink({ action }: { action: NextAction }) {
  const { d } = useI18n();

  const text = (() => {
    switch (action.kind) {
      case 'upload_material':
        return d.materials.upload;
      case 'analyse_material':
        return d.materials.analyze;
      case 'take_diagnostic':
        return d.generate.diagnostic;
      case 'resume_attempt':
        return `${d.attempt.resume}: ${action.title}`;
      case 'grade_scan':
        return `${d.scan.gradeMyExam}: ${action.title}`;
      case 'build_plan':
        return d.plan.generate;
      case 'study_task':
        return `${action.title} · ${action.minutes} ${d.common.minutes}`;
      case 'practise_weak':
        return `${d.generate.targeted}: ${action.topic}`;
      case 'final_mock':
        return d.generate.mock;
    }
  })();

  return (
    <Link
      href={action.href}
      className="mt-1 flex items-center gap-1.5 text-sm font-medium text-[var(--accent-text)] hover:underline"
    >
      {text}
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

function NotificationRowView({ row }: { row: NotificationRow }) {
  const { d, t } = useI18n();
  const template = d.notifications[row.title_key as keyof typeof d.notifications];
  const params = JSON.parse(row.params_json || '{}') as Record<string, string | number>;

  return (
    <div className="flex items-start gap-3 p-3.5">
      <span
        aria-hidden
        className={cx(
          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
          row.read_at ? 'bg-[var(--border-strong)]' : 'bg-[var(--accent)]',
        )}
      />
      <span className="text-sm">{template ? t(template, params) : row.title_key}</span>
    </div>
  );
}

function IconBooks() {
  return (
    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      <path d="M9 7h7M9 11h7" />
    </svg>
  );
}
