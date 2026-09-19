'use client';

import { useI18n } from '@/lib/i18n/provider';
import { PrintHeader } from '@/components/print/PrintHeader';
import type { Exam, Mistake } from '@/lib/types';

/** A printable sheet of the concepts still being got wrong. */
export function MistakeSheetDoc({ exam, mistakes }: { exam: Exam; mistakes: Mistake[] }) {
  const { d, t, date } = useI18n();

  return (
    <article>
      <PrintHeader
        course={exam.course_name}
        title={d.mistakes.title}
        meta={[
          { label: d.print.date, value: date(new Date().toISOString().slice(0, 10)) },
          { label: d.common.questions, value: mistakes.length },
        ]}
      />

      {mistakes.length === 0 ? (
        <p className="text-[11pt]">{d.mistakes.empty}</p>
      ) : (
        <ol className="space-y-6">
          {mistakes.map((mistake, index) => (
            <li key={mistake.id} className="avoid-break list-none">
              <div className="flex items-baseline justify-between gap-4 border-b border-black/30 pb-1">
                <h2 className="font-serif text-[12pt] font-semibold">
                  {index + 1}. {mistake.topic_name || d.common.topic}
                </h2>
                {mistake.times_missed > 1 ? (
                  <span className="text-[10pt]">
                    {t(d.mistakes.timesMissed, { count: mistake.times_missed })}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-[11pt]">{mistake.question_prompt}</p>

              <div className="mt-2 space-y-1.5 text-[10.5pt]">
                <p>
                  <span className="font-semibold">{d.mistakes.yourAnswer}: </span>
                  <span className="whitespace-pre-wrap">{mistake.user_answer || '—'}</span>
                </p>
                <p className="border-l-2 border-black/40 pl-3">
                  <span className="font-semibold">{d.mistakes.correctConcept}: </span>
                  <span className="whitespace-pre-wrap">{mistake.correct_concept}</span>
                </p>
                {mistake.why_lost_points ? (
                  <p className="text-black/70">
                    <span className="font-semibold">{d.mistakes.whyLost}: </span>
                    <span className="whitespace-pre-wrap">{mistake.why_lost_points}</span>
                  </p>
                ) : null}
              </div>

              <div className="answer-lines mt-3 h-[22mm] w-full" aria-hidden />
            </li>
          ))}
        </ol>
      )}

      <footer className="mt-10 border-t border-black/30 pt-3 text-[9.5pt] text-black/60">
        <p>{d.print.notForSubmission}</p>
      </footer>
    </article>
  );
}
