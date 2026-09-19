'use client';

import { ReadinessGauge } from '@/components/charts/ReadinessGauge';
import { Notice, Pill } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n/provider';
import type { Confidence, Factor, ReadinessBand, ReadinessResult } from '@/lib/engine/readiness';

export function bandLabel(band: ReadinessBand, d: ReturnType<typeof useI18n>['d']): string {
  switch (band) {
    case 'on_track':
      return d.readiness.onTrack;
    case 'needs_attention':
      return d.readiness.needsAttention;
    case 'at_risk':
      return d.readiness.atRisk;
    case 'significant_gap':
      return d.readiness.significantGap;
  }
}

/** A confidence tag on every figure, so nothing reads as more certain than it is. */
export function EvidenceTag({ confidence }: { confidence: Confidence }) {
  const { d } = useI18n();
  const map = {
    verified: { label: d.evidence.verified, help: d.evidence.verifiedHelp, tone: 'ok' },
    user_data: { label: d.evidence.userData, help: d.evidence.userDataHelp, tone: 'accent' },
    estimate: { label: d.evidence.estimate, help: d.evidence.estimateHelp, tone: 'warn' },
    unknown: { label: d.evidence.unknown, help: d.evidence.unknownHelp, tone: 'neutral' },
  } as const;
  const entry = map[confidence];
  return (
    <Pill tone={entry.tone} title={entry.help}>
      {entry.label}
    </Pill>
  );
}

function factorText(factor: Factor, d: ReturnType<typeof useI18n>['d'], t: ReturnType<typeof useI18n>['t']): string {
  const template = d.readiness.factors[factor.key as keyof typeof d.readiness.factors];
  if (!template) return factor.key;
  return t(template, { value: factor.value ?? 0, ...(factor.params ?? {}) });
}

/**
 * The honest readout: a band, a one-line summary, and the numbers the band was
 * derived from — each tagged with how much it can be trusted.
 */
export function ReadinessPanel({
  readiness,
  targetGrade,
  tone,
  compact,
}: {
  readiness: ReadinessResult;
  targetGrade: number;
  tone: string;
  compact?: boolean;
}) {
  const { d, t } = useI18n();

  if (readiness.timeLeft.passed) {
    return <Notice tone="info">{d.readiness.summaryPassed}</Notice>;
  }

  if (readiness.insufficientData) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-muted)]">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
          {d.readiness.noData}
        </div>
        <p className="text-sm text-[var(--text-muted)]">{d.readiness.noDataBody}</p>
      </div>
    );
  }

  const summary = summaryFor(readiness, targetGrade, d, t, tone);

  return (
    <div className="space-y-5">
      <ReadinessGauge
        score={readiness.score}
        band={readiness.band}
        bandLabel={bandLabel(readiness.band, d)}
        caption={summary}
      />

      {!compact ? (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.readiness.whyTitle}
          </h3>
          <ul className="mt-2.5 space-y-2">
            {readiness.factors.map((factor) => (
              <li key={factor.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span
                  aria-hidden
                  className={
                    factor.direction === 'positive'
                      ? 'text-[var(--ok)]'
                      : factor.direction === 'negative'
                        ? 'text-[var(--risk)]'
                        : 'text-[var(--text-subtle)]'
                  }
                >
                  {factor.direction === 'positive' ? '▲' : factor.direction === 'negative' ? '▼' : '•'}
                </span>
                <span className="text-[var(--text-muted)]">{factorText(factor, d, t)}</span>
                <EvidenceTag confidence={factor.confidence} />
                {factor.key === 'required_exam_performance' ? (
                  <span className="basis-full pl-5 text-xs text-[var(--text-subtle)]">
                    {factor.params?.basis === 'weighted'
                      ? d.readiness.factors.required_basis_weighted
                      : d.readiness.factors.required_basis_target_only}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t pt-3 text-xs text-[var(--text-subtle)]">{d.readiness.notAPrediction}</p>
    </div>
  );
}

function summaryFor(
  readiness: ReadinessResult,
  targetGrade: number,
  d: ReturnType<typeof useI18n>['d'],
  t: ReturnType<typeof useI18n>['t'],
  tone: string,
): string {
  const params = { target: targetGrade };
  const tight = readiness.timeLeft.days <= 5;

  if (readiness.band === 'on_track') return t(d.readiness.summaryOnTrack, params);
  if (readiness.band === 'needs_attention') return t(d.readiness.summaryClose, params);

  const base = tight ? t(d.readiness.summaryBehindTight, params) : t(d.readiness.summaryBehind, params);

  // "Blunt" changes the wording, never the numbers or the verdict.
  if (tone === 'blunt' && readiness.gap !== null) {
    return `${Math.abs(Math.round(readiness.gap))} percentage points short, ${readiness.timeLeft.days} days left. ${base}`;
  }
  return base;
}
