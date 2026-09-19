'use client';

import { useI18n } from '@/lib/i18n/provider';
import { Card, CardHeader, EmptyState, Notice, SectionTitle } from '@/components/ui/primitives';
import { ScoreLine, type ScorePoint } from '@/components/charts/ScoreLine';
import { MasteryBars, type MasteryBand } from '@/components/charts/MasteryBars';
import type { Attempt, Exam, PerformanceSnapshot, TopicMastery } from '@/lib/types';

/**
 * Whether preparation is actually improving. Every series here is the student's
 * own measured results — there is no modelled or projected line.
 */
export function HistoryPage({
  exam,
  attempts,
  snapshots,
  mastery,
  targetPercent,
}: {
  exam: Exam;
  attempts: Attempt[];
  snapshots: PerformanceSnapshot[];
  mastery: TopicMastery[];
  targetPercent: number;
}) {
  const { d, t, date, num } = useI18n();

  const graded = attempts
    .filter((attempt) => attempt.status === 'graded' && attempt.total_points > 0)
    .sort((a, b) => (a.graded_at ?? '').localeCompare(b.graded_at ?? ''));

  if (graded.length === 0) {
    return <EmptyState title={d.history.empty} body={d.history.emptyBody} />;
  }

  const scorePoints: ScorePoint[] = graded.map((attempt, index) => ({
    label: date(attempt.graded_at ?? attempt.created_at),
    value: ((attempt.earned_points ?? 0) / attempt.total_points) * 100,
    caption: `${index + 1}. ${attempt.title}`,
  }));

  const readinessPoints: ScorePoint[] = snapshots
    .filter((snapshot) => snapshot.readiness !== null)
    .map((snapshot) => ({
      label: date(snapshot.taken_at),
      value: snapshot.readiness as number,
      caption: date(snapshot.taken_at, true),
    }));

  const first = scorePoints[0]?.value ?? 0;
  const last = scorePoints[scorePoints.length - 1]?.value ?? 0;
  const delta = last - first;

  const bandLabels: Record<MasteryBand, string> = {
    strong: d.readiness.onTrack,
    solid: d.readiness.needsAttention,
    weak: d.readiness.atRisk,
    critical: d.readiness.significantGap,
    untested: d.plan.notTested,
  };

  return (
    <div className="space-y-9">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{d.history.title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{d.history.subtitle}</p>
      </div>

      <section>
        <Card>
          <CardHeader
            title={d.history.practiceScores}
            subtitle={
              scorePoints.length < 2
                ? undefined
                : Math.abs(delta) < 3
                  ? d.history.noChange
                  : t(delta > 0 ? d.history.improved : d.history.declined, {
                      from: num(first, 0),
                      to: num(last, 0),
                    })
            }
          />
          <div className="p-5 pt-3">
            <ScoreLine
              points={scorePoints}
              target={targetPercent}
              targetLabel={`${d.exam.target} ${exam.target_grade} ≈ ${Math.round(targetPercent)}%`}
              tableCaption={d.history.practiceScores}
              columnLabels={[d.history.attempt, d.results.score]}
            />
          </div>
        </Card>
      </section>

      {readinessPoints.length > 1 ? (
        <section>
          <Card>
            <CardHeader title={d.history.readinessOverTime} />
            <div className="p-5 pt-3">
              <ScoreLine
                points={readinessPoints}
                valueSuffix=""
                tableCaption={d.history.readinessOverTime}
                columnLabels={[d.print.date, d.readiness.title]}
                height={170}
              />
            </div>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionTitle>{d.history.topicMastery}</SectionTitle>
        <Card className="p-5">
          <MasteryBars
            rows={[...mastery]
              .sort((a, b) => (a.mastery ?? 2) - (b.mastery ?? 2))
              .map((row) => ({
                topic: row.topic_name,
                value: row.mastery === null ? null : row.mastery * 100,
                questions: row.questions_seen,
              }))}
            bandLabels={bandLabels}
            tableCaption={d.history.topicMastery}
            columnLabels={[d.common.topic, d.common.questions]}
          />
        </Card>
      </section>

      <Notice tone="info">{d.readiness.notAPrediction}</Notice>
    </div>
  );
}
