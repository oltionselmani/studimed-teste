'use client';

import { useState } from 'react';
import { cx } from '@/components/ui/primitives';

export type MasteryBand = 'strong' | 'solid' | 'weak' | 'critical' | 'untested';

export interface MasteryRow {
  topic: string;
  /** 0..100, or null when the topic has never been tested. */
  value: number | null;
  questions?: number;
}

export function bandFor(value: number | null): MasteryBand {
  if (value === null) return 'untested';
  if (value >= 80) return 'strong';
  if (value >= 60) return 'solid';
  if (value >= 40) return 'weak';
  return 'critical';
}

const BAND_COLOR: Record<MasteryBand, string> = {
  strong: 'var(--viz-good)',
  solid: 'var(--viz-warning)',
  weak: 'var(--viz-serious)',
  critical: 'var(--viz-critical)',
  untested: 'var(--viz-axis)',
};

/**
 * Topic mastery as a bar list.
 *
 * The bar colour is a status hue, so every row also carries its band as text —
 * the colour never carries the meaning on its own.
 */
export function MasteryBars({
  rows,
  bandLabels,
  tableCaption,
  columnLabels,
  limit,
}: {
  rows: MasteryRow[];
  bandLabels: Record<MasteryBand, string>;
  tableCaption: string;
  columnLabels: [string, string];
  limit?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = limit ? rows.slice(0, limit) : rows;
  if (shown.length === 0) return null;

  return (
    <figure className="viz m-0">
      <ul className="space-y-2.5">
        {shown.map((row) => {
          const band = bandFor(row.value);
          const width = row.value === null ? 0 : Math.max(1.5, row.value);
          return (
            <li
              key={row.topic}
              className="group relative"
              onMouseEnter={() => setHover(row.topic)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium" title={row.topic}>
                  {row.topic}
                </span>
                <span className="tabular shrink-0 text-sm font-semibold">
                  {row.value === null ? '—' : `${Math.round(row.value)}%`}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                {/* 8px track, 4px rounded data-end, square at the baseline. */}
                <div className="h-2 flex-1 overflow-hidden rounded-sm bg-[var(--bg-sunken)]">
                  <div
                    className="h-full rounded-r-[4px] transition-[width] duration-500 ease-out"
                    style={{ width: `${width}%`, background: BAND_COLOR[band] }}
                  />
                </div>
                <span
                  className={cx(
                    'shrink-0 text-[11px] font-medium',
                    band === 'untested' ? 'text-[var(--text-subtle)]' : 'text-[var(--text-muted)]',
                  )}
                >
                  {bandLabels[band]}
                </span>
              </div>
              {hover === row.topic && row.questions ? (
                <div className="pointer-events-none absolute right-0 top-0 -translate-y-full rounded-lg border bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-md)]">
                  {row.questions} {columnLabels[1].toLowerCase()}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <table className="viz-table">
        <caption>{tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{columnLabels[0]}</th>
            <th scope="col">{columnLabels[1]}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={`${row.topic}-row`}>
              <th scope="row">{row.topic}</th>
              <td>{row.value === null ? '—' : `${Math.round(row.value)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
