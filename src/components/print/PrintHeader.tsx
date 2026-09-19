import type { ReactNode } from 'react';

/**
 * The masthead of a printed document. Deliberately restrained: course, title,
 * a rule, and a compact details row. No product branding on the page itself.
 */
export function PrintHeader({
  course,
  title,
  meta,
  warning,
}: {
  course: string;
  title: string;
  meta: { label: string; value: ReactNode }[];
  warning?: string;
}) {
  return (
    <header className="avoid-break mb-6">
      {warning ? (
        <p className="mb-3 border border-black px-3 py-1.5 text-center text-[11pt] font-semibold uppercase tracking-wide">
          {warning}
        </p>
      ) : null}
      <div className="border-b-2 border-black pb-3">
        <p className="text-[11pt] uppercase tracking-[0.12em]">{course}</p>
        <h1 className="mt-1 font-serif text-[20pt] font-semibold leading-tight">{title}</h1>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[10.5pt]">
        {meta.map((item) => (
          <div key={item.label} className="flex gap-2">
            <dt className="font-semibold">{item.label}:</dt>
            <dd className="tabular">{item.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/** Ruled writing space, sized from the question's expected answer length. */
export function AnswerSpace({ lines }: { lines: number }) {
  return (
    <div
      className="answer-lines mt-3 w-full"
      style={{ height: `${Math.max(1, lines) * 9}mm` }}
      aria-hidden
    />
  );
}
