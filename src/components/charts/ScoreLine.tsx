'use client';

import { useId, useState } from 'react';
import { cx } from '@/components/ui/primitives';

export interface ScorePoint {
  label: string;
  /** 0..100 */
  value: number;
  /** Secondary caption shown in the tooltip, e.g. the test title. */
  caption?: string;
}

/**
 * Practice performance over time — one series, so no legend: the title names it.
 * The target level is a dashed reference line with a direct label, not a second
 * series.
 */
export function ScoreLine({
  points,
  target,
  targetLabel,
  valueSuffix = '%',
  tableCaption,
  columnLabels,
  height = 200,
}: {
  points: ScorePoint[];
  target?: number | null;
  targetLabel?: string;
  valueSuffix?: string;
  tableCaption: string;
  columnLabels: [string, string];
  height?: number;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const padding = { top: 16, right: 18, bottom: 26, left: 34 };
  const width = 640;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = 100;
  const min = 0;
  const x = (index: number) =>
    padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) =>
    padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');
  const ticks = [0, 25, 50, 75, 100];
  const active = hover === null ? null : points[hover];

  return (
    <figure className="viz m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-labelledby={`${id}-title`}
          onMouseLeave={() => setHover(null)}
        >
          <title id={`${id}-title`}>{tableCaption}</title>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize={10}
                fill="var(--viz-muted)"
                className="tabular"
              >
                {tick}
              </text>
            </g>
          ))}

          {typeof target === 'number' ? (
            <g>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(target)}
                y2={y(target)}
                stroke="var(--viz-muted)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              {targetLabel ? (
                <text
                  x={width - padding.right}
                  y={y(target) - 6}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--viz-muted)"
                >
                  {targetLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          <path
            d={path}
            fill="none"
            stroke="var(--viz-series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((point, index) => (
            <g key={`${point.label}-${index}`}>
              <circle
                cx={x(index)}
                cy={y(point.value)}
                r={hover === index ? 6 : 4}
                fill="var(--viz-series-1)"
                stroke="var(--viz-surface)"
                strokeWidth={2}
              />
              {/* A generous invisible hit target, independent of the mark size. */}
              <rect
                x={x(index) - plotWidth / Math.max(2, points.length) / 2}
                y={padding.top}
                width={plotWidth / Math.max(2, points.length)}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                tabIndex={0}
                role="button"
                aria-label={`${point.label}: ${point.value}${valueSuffix}`}
              />
            </g>
          ))}

          {/* First and last points are labelled directly; the rest on hover. */}
          {[0, points.length - 1]
            .filter((index, position, list) => list.indexOf(index) === position)
            .map((index) => (
              <text
                key={`direct-${index}`}
                x={x(index)}
                y={y(points[index].value) - 12}
                textAnchor={index === 0 ? 'start' : 'end'}
                fontSize={11}
                fontWeight={600}
                fill="var(--text)"
                className="tabular"
              >
                {Math.round(points[index].value)}
                {valueSuffix}
              </text>
            ))}

          {points.map((point, index) => (
            <text
              key={`label-${index}`}
              x={x(index)}
              y={height - 8}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              fontSize={10}
              fill="var(--viz-muted)"
            >
              {point.label}
            </text>
          ))}
        </svg>

        {active ? (
          <div
            className={cx(
              'pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border',
              'bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-md)]',
            )}
            style={{
              left: `${((x(hover as number) / width) * 100).toFixed(2)}%`,
              top: `${((y(active.value) / height) * 100).toFixed(2)}%`,
            }}
          >
            <div className="tabular font-semibold">
              {Math.round(active.value)}
              {valueSuffix}
            </div>
            <div className="text-[var(--text-muted)]">{active.caption ?? active.label}</div>
          </div>
        ) : null}
      </div>

      <table className="viz-table">
        <caption>{tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{columnLabels[0]}</th>
            <th scope="col">{columnLabels[1]}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`${point.label}-row-${index}`}>
              <th scope="row">{point.caption ?? point.label}</th>
              <td>
                {Math.round(point.value)}
                {valueSuffix}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
