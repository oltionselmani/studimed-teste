'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { AnswerSpace, PrintHeader } from '@/components/print/PrintHeader';
import { formatPoints } from '@/components/ResultView';
import type { Attempt, Exam, Question, User } from '@/lib/types';

/**
 * The printed exam.
 *
 * Answers are never included — the answer key is a separate document, reachable
 * only from the on-screen bar.
 */
export function ExamPaper({
  exam,
  attempt,
  questions,
  user,
  answerKey,
}: {
  exam: Exam;
  attempt: Attempt;
  questions: Question[];
  user: User;
  answerKey: boolean;
}) {
  const { d, t, date } = useI18n();

  return (
    <article>
      <PrintHeader
        course={exam.course_name + (exam.course_code ? ` · ${exam.course_code}` : '')}
        title={answerKey ? d.print.answerKey : d.print.exam}
        warning={answerKey ? d.print.answerKeyWarning : undefined}
        meta={[
          { label: d.print.date, value: date(new Date().toISOString().slice(0, 10)) },
          { label: d.print.student, value: user.name || user.email },
          {
            label: d.print.totalPoints,
            value: formatPoints(attempt.total_points),
          },
          ...(attempt.time_limit_minutes > 0
            ? [
                {
                  label: d.print.duration,
                  value: `${attempt.time_limit_minutes} ${d.common.minutes}`,
                },
              ]
            : []),
        ]}
      />

      {!answerKey ? (
        <section className="avoid-break mb-7 border border-black/40 px-4 py-3">
          <h2 className="text-[11pt] font-semibold uppercase tracking-wide">
            {d.print.instructions}
          </h2>
          <p className="mt-1 text-[10.5pt] leading-relaxed">{d.print.instructionsBody}</p>
        </section>
      ) : null}

      <ol className="space-y-7">
        {questions.map((question) => (
          <QuestionBlock key={question.id} question={question} answerKey={answerKey} />
        ))}
      </ol>

      <footer className="mt-10 border-t border-black/30 pt-3 text-[9.5pt] text-black/60">
        <p>{d.print.notForSubmission}</p>
      </footer>

      <div className="no-print mt-8 border-t pt-4">
        <Link
          href={
            answerKey ? `/print/exam/${attempt.id}` : `/print/answerkey/${attempt.id}`
          }
          className="text-sm text-[var(--accent-text)] hover:underline"
        >
          {answerKey ? d.print.exam : d.print.answerKey} →
        </Link>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {t(d.attempt.readySubtitle, {
            count: questions.length,
            points: attempt.total_points,
            time: '',
          })}
        </p>
      </div>
    </article>
  );
}

function QuestionBlock({ question, answerKey }: { question: Question; answerKey: boolean }) {
  const { d, t } = useI18n();
  const options: string[] = question.options_json ? JSON.parse(question.options_json) : [];

  return (
    <li className="avoid-break list-none">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-[12pt] font-semibold">
          {t(d.print.questionN, { n: question.position })}
        </h3>
        <span className="tabular shrink-0 text-[10.5pt]">
          {t(d.print.pointsValue, { points: formatPoints(question.points) })}
        </span>
      </div>

      <p className="mt-1.5 whitespace-pre-wrap text-[11.5pt] leading-relaxed">{question.prompt}</p>

      {question.code_block ? (
        <pre className="mt-2.5 overflow-x-auto border border-black/25 bg-black/[0.03] p-3 font-mono text-[10pt] leading-relaxed">
          <code>{question.code_block}</code>
        </pre>
      ) : null}

      {options.length > 0 ? (
        <ol className="mt-2.5 space-y-1.5">
          {options.map((option, index) => (
            <li key={index} className="flex gap-2.5 text-[11pt]">
              <span
                className={
                  answerKey && question.correct_option === index
                    ? 'font-bold'
                    : undefined
                }
              >
                {answerKey && question.correct_option === index ? '■' : '☐'}
              </span>
              <span className={answerKey && question.correct_option === index ? 'font-semibold' : undefined}>
                <span className="mr-1.5 font-semibold">{String.fromCharCode(65 + index)})</span>
                {option}
              </span>
            </li>
          ))}
        </ol>
      ) : answerKey ? null : (
        <AnswerSpace lines={question.answer_lines} />
      )}

      {answerKey ? (
        <div className="mt-3 space-y-2 border-l-2 border-black/40 pl-3 text-[10.5pt]">
          <KeyRow label={d.results.expected} body={question.expected_answer} />
          <KeyRow label={d.print.instructions} body={question.grading_criteria} />
          {question.explanation ? (
            <KeyRow label={d.results.explanation} body={question.explanation} />
          ) : null}
          <p className="text-[9.5pt] text-black/55">
            {d.evidence.sourceLabel}: {sourceLabel(question.source_type, d)}
            {question.source_reference ? ` — ${question.source_reference}` : ''}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function KeyRow({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <span className="font-semibold uppercase tracking-wide">{label}: </span>
      <span className="whitespace-pre-wrap">{body}</span>
    </div>
  );
}

function sourceLabel(source: string, d: ReturnType<typeof useI18n>['d']): string {
  switch (source) {
    case 'course_material':
      return d.evidence.sourceCourseMaterial;
    case 'previous_exam':
      return d.evidence.sourcePreviousExam;
    case 'verified_external':
      return d.evidence.sourceVerifiedExternal;
    default:
      return d.evidence.sourceAiGenerated;
  }
}
