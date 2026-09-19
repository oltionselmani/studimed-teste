'use client';

import { useI18n } from '@/lib/i18n/provider';
import { PrintHeader } from '@/components/print/PrintHeader';
import type { StudySheet } from '@/lib/ai/schemas';

/**
 * A printable revision sheet. Answers to the recall and quiz items live on a
 * separate page so the sheet can actually be used for self-testing.
 */
export function StudySheetDoc({
  sheet,
  topic,
  courseName,
  createdAt,
}: {
  sheet: StudySheet;
  topic: string;
  courseName: string;
  createdAt: string;
}) {
  const { d, date } = useI18n();

  return (
    <article>
      <PrintHeader
        course={courseName}
        title={`${d.print.studySheet} — ${topic}`}
        meta={[
          { label: d.print.date, value: date(createdAt) },
          ...(sheet.source_note ? [{ label: d.evidence.sourceLabel, value: sheet.source_note }] : []),
        ]}
      />

      <section className="avoid-break mb-6">
        <p className="whitespace-pre-wrap text-[11.5pt] leading-relaxed">{sheet.summary}</p>
      </section>

      {sheet.key_concepts.length > 0 ? (
        <Section title={d.study.keyConcepts}>
          <dl className="space-y-2.5">
            {sheet.key_concepts.map((item) => (
              <div key={item.term} className="avoid-break">
                <dt className="font-serif text-[11.5pt] font-semibold">{item.term}</dt>
                <dd className="text-[11pt] leading-relaxed">{item.explanation}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {sheet.formulas.length > 0 ? (
        <Section title={d.study.formulas}>
          <table className="w-full border-collapse text-[10.5pt]">
            <tbody>
              {sheet.formulas.map((formula) => (
                <tr key={formula.name} className="avoid-break border-b border-black/20">
                  <th scope="row" className="w-1/4 py-2 pr-3 text-left align-top font-semibold">
                    {formula.name}
                  </th>
                  <td className="py-2 pr-3 align-top font-mono">{formula.expression}</td>
                  <td className="w-2/5 py-2 align-top text-black/70">{formula.when_to_use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {sheet.worked_examples.length > 0 ? (
        <Section title={d.study.workedExamples}>
          <ol className="space-y-4">
            {sheet.worked_examples.map((example, index) => (
              <li key={index} className="avoid-break">
                <p className="text-[11pt]">
                  <span className="font-semibold">{d.study.problem}: </span>
                  <span className="whitespace-pre-wrap">{example.problem}</span>
                </p>
                <p className="mt-1.5 border-l-2 border-black/40 pl-3 text-[11pt]">
                  <span className="font-semibold">{d.study.solution}: </span>
                  <span className="whitespace-pre-wrap">{example.solution}</span>
                </p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {sheet.common_mistakes.length > 0 ? (
        <Section title={d.study.commonMistakes}>
          <ul className="list-disc space-y-1.5 pl-5 text-[11pt]">
            {sheet.common_mistakes.map((mistake, index) => (
              <li key={index}>{mistake}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {sheet.active_recall.length > 0 ? (
        <Section title={d.study.activeRecall} note={d.study.answersHidden}>
          <ol className="space-y-3 text-[11pt]">
            {sheet.active_recall.map((item, index) => (
              <li key={index} className="avoid-break">
                <span className="font-semibold">{index + 1}. </span>
                {item.question}
                <div className="answer-lines mt-1.5 h-[18mm] w-full" aria-hidden />
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {sheet.mini_quiz.length > 0 ? (
        <Section title={d.study.miniQuiz} note={d.study.answersHidden}>
          <ol className="space-y-3 text-[11pt]">
            {sheet.mini_quiz.map((item, index) => (
              <li key={index} className="avoid-break">
                <span className="font-semibold">{index + 1}. </span>
                {item.question}
                <div className="answer-lines mt-1.5 h-[13mm] w-full" aria-hidden />
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {sheet.checklist.length > 0 ? (
        <Section title={d.study.checklist}>
          <ul className="space-y-1.5 text-[11pt]">
            {sheet.checklist.map((item, index) => (
              <li key={index} className="flex gap-2.5">
                <span aria-hidden>☐</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {sheet.active_recall.length > 0 || sheet.mini_quiz.length > 0 ? (
        <section className="page-break">
          <h2 className="mb-4 border-b-2 border-black pb-2 font-serif text-[15pt] font-semibold">
            {d.study.answers} — {topic}
          </h2>
          {sheet.active_recall.length > 0 ? (
            <Section title={d.study.activeRecall}>
              <ol className="space-y-2 text-[10.5pt]">
                {sheet.active_recall.map((item, index) => (
                  <li key={index} className="avoid-break">
                    <span className="font-semibold">{index + 1}. </span>
                    {item.answer}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
          {sheet.mini_quiz.length > 0 ? (
            <Section title={d.study.miniQuiz}>
              <ol className="space-y-2 text-[10.5pt]">
                {sheet.mini_quiz.map((item, index) => (
                  <li key={index} className="avoid-break">
                    <span className="font-semibold">{index + 1}. </span>
                    {item.answer}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </section>
      ) : null}

      <footer className="mt-10 border-t border-black/30 pt-3 text-[9.5pt] text-black/60">
        <p>{d.print.notForSubmission}</p>
      </footer>
    </article>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-4 border-b border-black/50 pb-1">
        <h2 className="font-serif text-[13pt] font-semibold">{title}</h2>
        {note ? <span className="text-[9.5pt] text-black/60">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}
