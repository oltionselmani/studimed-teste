'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { ReadinessPanel } from '@/components/ReadinessPanel';
import { NextActionLink } from '@/components/DashboardView';
import { MasteryBars, type MasteryBand } from '@/components/charts/MasteryBars';
import { ScoreLine, type ScorePoint } from '@/components/charts/ScoreLine';
import {
  ButtonLink,
  Card,
  CardHeader,
  Notice,
  SectionTitle,
  Stat,
} from '@/components/ui/primitives';
import type { NextAction } from '@/lib/data/dashboard';
import type { ReadinessResult } from '@/lib/engine/readiness';
import type { Attempt, Exam, TopicMastery } from '@/lib/types';

export function OverviewPage({
  exam,
  readiness,
  mastery,
  attempts,
  nextAction,
  tone,
  targetPercent,
  openMistakes,
}: {
  exam: Exam;
  readiness: ReadinessResult;
  mastery: TopicMastery[];
  attempts: Attempt[];
  nextAction: NextAction;
  tone: string;
  targetPercent: number;
  openMistakes: number;
}) {
  const { d, t, date } = useI18n();

  const graded = attempts
    .filter((attempt) => attempt.status === 'graded' && attempt.total_points > 0)
    .sort((a, b) => (a.graded_at ?? '').localeCompare(b.graded_at ?? ''));

  const points: ScorePoint[] = graded.map((attempt, index) => ({
    label: date(attempt.graded_at ?? attempt.created_at),
    value: ((attempt.earned_points ?? 0) / attempt.total_points) * 100,
    caption: `${index + 1}. ${attempt.title}`,
  }));

  const bandLabels: Record<MasteryBand, string> = {
    strong: d.readiness.onTrack,
    solid: d.readiness.needsAttention,
    weak: d.readiness.atRisk,
    critical: d.readiness.significantGap,
    untested: d.plan.notTested,
  };

  const ranked = [...mastery].sort((a, b) => (a.mastery ?? 2) - (b.mastery ?? 2));
  const tested = ranked.filter((row) => row.mastery !== null);
  // Split the ranked list so a middling topic never appears as both a weakness
  // and a strength.
  const weakestCount = Math.min(5, Math.ceil(ranked.length / 2));
  const weakest = ranked.slice(0, weakestCount);
  const strongest = [...tested]
    .reverse()
    .filter((row) => !weakest.some((item) => item.topic_name === row.topic_name))
    .slice(0, 5);

  return (
    <div className="space-y-9">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">{d.readiness.howScrewed}</h2>
          </div>
          <ReadinessPanel readiness={readiness} targetGrade={exam.target_grade} tone={tone} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
              {d.dashboard.nextAction}
            </div>
            <NextActionLink action={nextAction} />
          </Card>

          <Card className="grid grid-cols-2 gap-5 p-5">
            <Stat
              label={d.report.recentAverage}
              value={
                readiness.recentAveragePercent === null
                  ? '—'
                  : `${Math.round(readiness.recentAveragePercent)}%`
              }
              sub={
                readiness.recentAverageGrade === null
                  ? undefined
                  : `≈ ${readiness.recentAverageGrade}`
              }
            />
            <Stat label={d.exam.target} value={exam.target_grade} />
            <Stat
              label={d.readiness.coverageLabel}
              value={readiness.coverage === null ? '—' : `${Math.round(readiness.coverage * 100)}%`}
              sub={`${readiness.topicsTested}/${readiness.topicsTotal}`}
            />
            <Stat label={d.mistakes.title} value={openMistakes} />
          </Card>

          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/exams/${exam.id}/tests`} size="sm">
              {d.generate.title}
            </ButtonLink>
            <ButtonLink href={`/exams/${exam.id}/plan`} variant="secondary" size="sm">
              {t(d.plan.whatDoINeed, { target: exam.target_grade })}
            </ButtonLink>
          </div>
        </div>
      </div>

      {points.length > 0 ? (
        <section>
          <Card>
            <CardHeader title={d.history.practiceScores} />
            <div className="p-5 pt-3">
              <ScoreLine
                points={points}
                target={targetPercent}
                targetLabel={`${d.exam.target} ${exam.target_grade} ≈ ${Math.round(targetPercent)}%`}
                tableCaption={d.history.practiceScores}
                columnLabels={[d.history.attempt, d.results.score]}
                height={180}
              />
            </div>
          </Card>
        </section>
      ) : null}

      {ranked.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {weakest.length > 0 ? (
          <section>
            <SectionTitle>{d.report.weakest}</SectionTitle>
            <Card className="p-5">
              <MasteryBars
                rows={weakest.map((row) => ({
                  topic: row.topic_name,
                  value: row.mastery === null ? null : row.mastery * 100,
                  questions: row.questions_seen,
                }))}
                bandLabels={bandLabels}
                tableCaption={d.report.weakest}
                columnLabels={[d.common.topic, d.common.questions]}
              />
            </Card>
          </section>
          ) : null}
          {strongest.length > 0 ? (
          <section>
            <SectionTitle>{d.report.strongest}</SectionTitle>
            <Card className="p-5">
              <MasteryBars
                rows={strongest.map((row) => ({
                  topic: row.topic_name,
                  value: row.mastery === null ? null : row.mastery * 100,
                  questions: row.questions_seen,
                }))}
                bandLabels={bandLabels}
                tableCaption={d.report.strongest}
                columnLabels={[d.common.topic, d.common.questions]}
              />
            </Card>
          </section>
          ) : null}
        </div>
      ) : null}

      {readiness.untestedTopics.length > 0 ? (
        <Notice tone="warn">
          <strong>{d.report.untested}: </strong>
          {readiness.untestedTopics.join(', ')}
        </Notice>
      ) : null}

      <div className="no-print flex flex-wrap items-center gap-3 border-t pt-5">
        <Link
          href={`/exams/${exam.id}/settings`}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          {d.common.edit} · {d.exam.gradeBandsTitle}
        </Link>
      </div>
    </div>
  );
}
