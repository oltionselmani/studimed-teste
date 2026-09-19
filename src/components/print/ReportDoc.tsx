'use client';

import { useI18n } from '@/lib/i18n/provider';
import { PrintHeader } from '@/components/print/PrintHeader';
import type { FinalReport } from '@/lib/data/report';

/** The final readiness report as a printable one-pager. */
export function ReportDoc({ report }: { report: FinalReport }) {
  const { d, t, date } = useI18n();
  const { readiness, exam } = report;

  const bandName =
    readiness.band === 'on_track'
      ? d.readiness.onTrack
      : readiness.band === 'needs_attention'
        ? d.readiness.needsAttention
        : readiness.band === 'at_risk'
          ? d.readiness.atRisk
          : d.readiness.significantGap;

  return (
    <article>
      <PrintHeader
        course={exam.course_name}
        title={d.report.title}
        meta={[
          { label: d.print.date, value: date(exam.exam_date) },
          { label: d.report.daysRemaining, value: readiness.timeLeft.days },
          { label: d.exam.target, value: exam.target_grade },
          {
            label: d.report.recentAverage,
            value:
              readiness.recentAveragePercent === null
                ? '—'
                : `${Math.round(readiness.recentAveragePercent)}%`,
          },
          { label: d.readiness.title, value: bandName },
        ]}
      />

      {readiness.gradedAttempts === 0 ? (
        <p className="text-[11pt]">{d.readiness.noDataBody}</p>
      ) : (
        <>
          <Section title={d.readiness.whyTitle}>
            <ul className="space-y-1 text-[10.5pt]">
              {readiness.factors.map((factor) => {
                const template =
                  d.readiness.factors[factor.key as keyof typeof d.readiness.factors];
                if (!template) return null;
                return (
                  <li key={factor.key}>
                    • {t(template, { value: factor.value ?? 0, ...(factor.params ?? {}) })}
                  </li>
                );
              })}
            </ul>
          </Section>

          {report.recentScores.length > 0 ? (
            <Section title={d.report.mockScores}>
              <p className="tabular text-[11pt]">
                {report.recentScores.map((row) => `${Math.round(row.percent)}%`).join('  →  ')}
              </p>
            </Section>
          ) : null}

          <div className="grid grid-cols-2 gap-6">
            {report.strongest.length > 0 ? (
              <Section title={d.report.strongest}>
                <ul className="space-y-1 text-[10.5pt]">
                  {report.strongest.map((row) => (
                    <li key={row.topic} className="flex justify-between gap-3">
                      <span>{row.topic}</span>
                      <span className="tabular">{Math.round(row.mastery * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {report.weakest.length > 0 ? (
              <Section title={d.report.weakest}>
                <ul className="space-y-1 text-[10.5pt]">
                  {report.weakest.map((row) => (
                    <li key={row.topic} className="flex justify-between gap-3">
                      <span>{row.topic}</span>
                      <span className="tabular">{Math.round(row.mastery * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>

          {report.untested.length > 0 ? (
            <Section title={d.report.untested}>
              <p className="text-[10.5pt]">{report.untested.join(', ')}</p>
            </Section>
          ) : null}

          <Section title={d.report.finalPriorities}>
            <ol className="space-y-1 text-[10.5pt]">
              {report.priorities.map((priority, index) => (
                <li key={priority.topic}>
                  {index + 1}. <span className="font-semibold">{priority.topic}</span>
                  {priority.mastery === null
                    ? ` — ${d.plan.notTested}`
                    : ` — ${t(d.plan.currentMastery, { value: Math.round(priority.mastery * 100) })}`}
                </li>
              ))}
            </ol>
          </Section>

          {report.avoid.length > 0 ? (
            <Section title={d.report.avoid}>
              <ul className="space-y-1 text-[10.5pt]">
                {report.avoid.map((item) => (
                  <li key={item.topic}>
                    <span className="font-semibold">{item.topic}</span> — {item.reason}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {report.recurringMistakes.length > 0 ? (
            <Section title={d.report.recurringMistakes}>
              <ul className="space-y-1.5 text-[10.5pt]">
                {report.recurringMistakes.slice(0, 10).map((mistake) => (
                  <li key={mistake.id}>
                    <span className="font-semibold">{mistake.topic_name}: </span>
                    {mistake.correct_concept}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {report.remainingTasks.length > 0 ? (
            <Section title={d.report.remainingPlan}>
              <ul className="space-y-1 text-[10.5pt]">
                {report.remainingTasks.slice(0, 15).map((task) => (
                  <li key={task.id} className="flex gap-2.5">
                    <span aria-hidden>☐</span>
                    <span className="tabular w-[22mm] shrink-0">{date(task.date)}</span>
                    <span className="flex-1">{task.title}</span>
                    <span className="tabular shrink-0">
                      {task.minutes} {d.common.minutes}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}

      <footer className="mt-8 border-t border-black/40 pt-3 text-[9.5pt]">
        <p>{d.report.disclaimer}</p>
        <p className="mt-1 text-black/60">
          {t(d.report.generatedOn, { date: date(report.generatedAt, true) })}
        </p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="avoid-break mb-5">
      <h2 className="mb-1.5 border-b border-black/50 pb-1 font-serif text-[12.5pt] font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
