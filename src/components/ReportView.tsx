'use client';

import { useI18n } from '@/lib/i18n/provider';
import { ButtonLink, Card, CardHeader, EmptyState, Notice, SectionTitle, Stat } from '@/components/ui/primitives';
import { ReadinessPanel } from '@/components/ReadinessPanel';
import { ScoreLine } from '@/components/charts/ScoreLine';
import { MasteryBars, type MasteryBand } from '@/components/charts/MasteryBars';
import type { FinalReport } from '@/lib/data/report';

/**
 * The last-days readout: what to do with the time that is left, and what to
 * leave alone.
 */
export function ReportView({ report, tone }: { report: FinalReport; tone: string }) {
  const { d, t, date } = useI18n();
  const { readiness, exam } = report;

  if (readiness.gradedAttempts === 0) {
    return (
      <EmptyState
        title={d.readiness.noData}
        body={d.readiness.noDataBody}
        action={<ButtonLink href={`/exams/${exam.id}/tests`}>{d.generate.diagnostic}</ButtonLink>}
      />
    );
  }

  const bandLabels: Record<MasteryBand, string> = {
    strong: d.readiness.onTrack,
    solid: d.readiness.needsAttention,
    weak: d.readiness.atRisk,
    critical: d.readiness.significantGap,
    untested: d.plan.notTested,
  };

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{d.report.title}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{d.report.subtitle}</p>
        </div>
        <ButtonLink href={`/print/report/${exam.id}`} variant="secondary" size="sm">
          {d.report.printReport}
        </ButtonLink>
      </div>

      <Card className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
        <Stat
          label={d.report.daysRemaining}
          value={readiness.timeLeft.days}
          tone={readiness.timeLeft.days <= 3 ? 'bad' : undefined}
        />
        <Stat label={d.exam.target} value={exam.target_grade} />
        <Stat
          label={d.report.recentAverage}
          value={
            readiness.recentAveragePercent === null
              ? '—'
              : `${Math.round(readiness.recentAveragePercent)}%`
          }
        />
        <Stat
          label={d.readiness.title}
          value={readiness.score === null ? '—' : readiness.score}
        />
      </Card>

      <Card className="p-6">
        <ReadinessPanel readiness={readiness} targetGrade={exam.target_grade} tone={tone} />
      </Card>

      {report.recentScores.length > 0 ? (
        <Card>
          <CardHeader title={d.report.mockScores} />
          <div className="p-5 pt-3">
            <ScoreLine
              points={report.recentScores.map((row) => ({
                label: date(row.label),
                value: row.percent,
                caption: row.title,
              }))}
              target={report.targetPercent}
              targetLabel={`${d.exam.target} ${exam.target_grade}`}
              tableCaption={d.report.mockScores}
              columnLabels={[d.history.attempt, d.results.score]}
              height={170}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {report.strongest.length > 0 ? (
          <section>
            <SectionTitle>{d.report.strongest}</SectionTitle>
            <Card className="p-5">
              <MasteryBars
                rows={report.strongest.map((row) => ({
                  topic: row.topic,
                  value: row.mastery * 100,
                }))}
                bandLabels={bandLabels}
                tableCaption={d.report.strongest}
                columnLabels={[d.common.topic, d.results.score]}
              />
            </Card>
          </section>
        ) : null}

        {report.weakest.length > 0 ? (
          <section>
            <SectionTitle>{d.report.weakest}</SectionTitle>
            <Card className="p-5">
              <MasteryBars
                rows={report.weakest.map((row) => ({
                  topic: row.topic,
                  value: row.mastery * 100,
                }))}
                bandLabels={bandLabels}
                tableCaption={d.report.weakest}
                columnLabels={[d.common.topic, d.results.score]}
              />
            </Card>
          </section>
        ) : null}
      </div>

      {report.untested.length > 0 ? (
        <Notice tone="warn">
          <strong>{d.report.untested}: </strong>
          {report.untested.join(', ')}
        </Notice>
      ) : null}

      <section>
        <SectionTitle>{d.report.finalPriorities}</SectionTitle>
        <Card className="divide-y">
          {report.priorities.map((priority, index) => (
            <div key={priority.topic} className="flex items-center gap-4 p-4">
              <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-text)]">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{priority.topic}</div>
                <div className="tabular text-xs text-[var(--text-muted)]">
                  {priority.mastery === null
                    ? d.plan.notTested
                    : t(d.plan.currentMastery, { value: Math.round(priority.mastery * 100) })}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </section>

      {report.avoid.length > 0 ? (
        <section>
          <SectionTitle hint={d.plan.dontSpendTimeHelp}>{d.report.avoid}</SectionTitle>
          <Card className="divide-y">
            {report.avoid.map((item) => (
              <div key={item.topic} className="p-4">
                <div className="text-sm font-medium">{item.topic}</div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.reason}</p>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {report.recurringMistakes.length > 0 ? (
        <section>
          <SectionTitle>{d.report.recurringMistakes}</SectionTitle>
          <Card className="divide-y">
            {report.recurringMistakes.map((mistake) => (
              <div key={mistake.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{mistake.topic_name}</span>
                  <span className="tabular text-xs text-[var(--text-subtle)]">
                    {t(d.mistakes.timesMissed, { count: mistake.times_missed })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{mistake.correct_concept}</p>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {report.remainingTasks.length > 0 ? (
        <section>
          <SectionTitle>{d.report.remainingPlan}</SectionTitle>
          <Card className="divide-y">
            {report.remainingTasks.slice(0, 12).map((task) => (
              <div key={task.id} className="flex items-baseline gap-3 p-4">
                <span className="tabular shrink-0 text-xs text-[var(--text-subtle)]">
                  {date(task.date)}
                </span>
                <span className="min-w-0 flex-1 text-sm">{task.title}</span>
                <span className="tabular shrink-0 text-xs text-[var(--text-subtle)]">
                  {task.minutes} {d.common.minutes}
                </span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <Notice tone="info">{d.report.disclaimer}</Notice>
    </div>
  );
}
