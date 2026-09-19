import type { ReadinessBand } from '@/lib/engine/readiness';

const BAND_COLOR: Record<ReadinessBand, string> = {
  on_track: 'var(--viz-good)',
  needs_attention: 'var(--viz-warning)',
  at_risk: 'var(--viz-serious)',
  significant_gap: 'var(--viz-critical)',
};

/**
 * The headline readiness figure.
 *
 * The arc is decoration around a number; the band name is always spelled out
 * next to it, so the colour is never the only thing carrying the verdict.
 */
export function ReadinessGauge({
  score,
  band,
  bandLabel,
  caption,
  size = 132,
}: {
  score: number | null;
  band: ReadinessBand;
  bandLabel: string;
  caption?: string;
  size?: number;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius * 1.5; // a 270° arc
  const filled = score === null ? 0 : (score / 100) * circumference;

  return (
    <figure className="viz m-0 flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="img"
          aria-label={`${bandLabel}${score === null ? '' : ` — ${score} of 100`}`}
        >
          <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--bg-sunken)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference * 3}`}
            />
            {score !== null ? (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={BAND_COLOR[band]}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${circumference * 3}`}
              />
            ) : null}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[38px] font-semibold leading-none">
            {score === null ? '—' : score}
          </span>
          {score !== null ? (
            <span className="mt-0.5 text-[11px] text-[var(--text-subtle)]">/ 100</span>
          ) : null}
        </div>
      </div>
      <figcaption className="min-w-0">
        <div
          className="flex items-center gap-2 text-[17px] font-semibold"
          style={{ color: BAND_COLOR[band] }}
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: BAND_COLOR[band] }}
          />
          {bandLabel}
        </div>
        {caption ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{caption}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}
