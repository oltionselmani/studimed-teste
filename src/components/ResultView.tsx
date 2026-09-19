'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { ButtonLink, Card, CardHeader, Notice, Pill, SectionTitle, Stat, cx } from '@/components/ui/primitives';
import { MasteryBars, bandFor, type MasteryBand } from '@/components/charts/MasteryBars';
import { EvidenceTag } from '@/components/ReadinessPanel';
import type { Answer, Attempt, Exam, Question, Verdict } from '@/lib/types';

export interface TopicResult {
  topic: string;
  percent: number;
  questions: number;
}

export function ResultView({
  exam,
  attempt,
  questions,
  answers,
  topicResults,
  grade,
  percent,
  weakest,
  strongest,
}: {
  exam: Exam;
  attempt: Attempt;
  questions: Question[];
  answers: Answer[];
  topicResults: TopicResult[];
  grade: number;
  percent: number;
  weakest: string[];
  strongest: string[];
}) {
  const { d, t } = useI18n();
  const answerBy = new Map(answers.map((answer) => [answer.question_id, answer]));

  const bandLabels: Record<MasteryBand, string> = {
    strong: d.results.correct,
    solid: d.evidence.estimate,
    weak: d.readiness.atRisk,
    critical: d.readiness.significantGap,
    untested: d.plan.notTested,
  };

  const uncertainCount = answers.filter((answer) => answer.verdict === 'uncertain').length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-12">
      <Link
        href={`/exams/${exam.id}/tests`}
        className="no-print text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        ← {exam.course_name}
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{d.results.title}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{attempt.title}</p>
      </header>

      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
              {d.results.score}
            </div>
            <div className="tabular mt-1 text-5xl font-semibold leading-none">
              {Math.round(percent)}%
            </div>
            <div className="tabular mt-1.5 text-sm text-[var(--text-muted)]">
              {t(d.results.scoreOf, {
                earned: formatPoints(attempt.earned_points ?? 0),
                total: formatPoints(attempt.total_points),
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
                {d.results.grade}
              </span>
              <EvidenceTag confidence="estimate" />
            </div>
            <div className="tabular mt-1 text-3xl font-semibold leading-none">{grade}</div>
            <div className="mt-1.5 text-xs text-[var(--text-subtle)]">{d.results.gradeEstimate}</div>
          </div>
          <Stat label={d.exam.target} value={exam.target_grade} />
        </div>

        {attempt.grading_note ? (
          <Notice tone="warn" className="mt-5">
            {attempt.grading_note} {d.results.uncertainHelp}
          </Notice>
        ) : null}
      </Card>

      {topicResults.length > 0 ? (
        <section className="mt-8">
          <SectionTitle>{d.results.topicPerformance}</SectionTitle>
          <Card className="p-5">
            <MasteryBars
              rows={topicResults.map((row) => ({
                topic: row.topic,
                value: row.percent,
                questions: row.questions,
              }))}
              bandLabels={bandLabels}
              tableCaption={d.results.topicPerformance}
              columnLabels={[d.common.topic, d.common.questions]}
            />
          </Card>

          {weakest.length > 0 ? (
            <p className="mt-4 text-sm">
              {t(d.results.biggestWeaknesses, { topics: weakest.join(', ') })}
            </p>
          ) : null}
          {strongest.length > 0 ? (
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              {t(d.results.strengths, { topics: strongest.join(', ') })}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="no-print mt-8">
        <SectionTitle>{d.results.whatNow}</SectionTitle>
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href={`/exams/${exam.id}/tests?kind=targeted${weakest[0] ? `&topic=${encodeURIComponent(weakest[0])}` : ''}`}
          >
            {d.results.testAgain}
          </ButtonLink>
          <ButtonLink href={`/exams/${exam.id}/plan`} variant="secondary">
            {t(d.plan.whatDoINeed, { target: exam.target_grade })}
          </ButtonLink>
          <ButtonLink href={`/exams/${exam.id}/mistakes`} variant="secondary">
            {d.mistakes.title}
          </ButtonLink>
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle hint={uncertainCount > 0 ? d.results.uncertainHelp : undefined}>
          {d.results.perQuestion}
        </SectionTitle>
        <div className="space-y-3">
          {questions.map((question) => (
            <QuestionResult
              key={question.id}
              question={question}
              answer={answerBy.get(question.id) ?? null}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function QuestionResult({ question, answer }: { question: Question; answer: Answer | null }) {
  const { d } = useI18n();
  const options: string[] = question.options_json ? JSON.parse(question.options_json) : [];
  const verdict = (answer?.verdict || 'blank') as Verdict;

  const verdictInfo = (() => {
    switch (verdict) {
      case 'correct':
        return { tone: 'ok' as const, label: d.results.correct };
      case 'partial':
        return { tone: 'warn' as const, label: d.results.partial };
      case 'incorrect':
        return { tone: 'bad' as const, label: d.results.incorrect };
      case 'uncertain':
        return { tone: 'neutral' as const, label: d.results.uncertain };
      default:
        return { tone: 'neutral' as const, label: d.results.blank };
    }
  })();

  const studentAnswer =
    answer?.selected_option !== null && answer?.selected_option !== undefined
      ? (options[answer.selected_option] ?? '')
      : (answer?.response_text ?? '');

  return (
    <Card as="article" className="avoid-break overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div className="tabular text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
          {d.common.question} {question.position}
          {question.topic_name ? ` · ${question.topic_name}` : ''} ·{' '}
          {formatPoints(answer?.awarded_points ?? 0)}/{formatPoints(question.points)}
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge question={question} />
          <Pill tone={verdictInfo.tone}>{verdictInfo.label}</Pill>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="whitespace-pre-wrap text-sm">{question.prompt}</p>
        {question.code_block ? (
          <pre className="overflow-x-auto rounded-lg border bg-[var(--bg-sunken)] p-3 font-mono text-[12.5px]">
            <code>{question.code_block}</code>
          </pre>
        ) : null}

        {options.length > 0 ? (
          <ul className="space-y-1.5">
            {options.map((option, index) => {
              const chosen = answer?.selected_option === index;
              const correct = question.correct_option === index;
              return (
                <li
                  key={index}
                  className={cx(
                    'rounded-lg border px-3 py-2 text-sm',
                    correct
                      ? 'border-[var(--ok)] bg-[var(--ok-soft)]'
                      : chosen
                        ? 'border-[var(--bad)] bg-[var(--bad-soft)]'
                        : 'border-transparent',
                  )}
                >
                  <span className="mr-2 font-semibold text-[var(--text-muted)]">
                    {String.fromCharCode(65 + index)})
                  </span>
                  {option}
                  {chosen ? (
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      ← {d.results.yourAnswer}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-3">
            <Detail label={d.results.yourAnswer} body={studentAnswer || '—'} />
            <Detail label={d.results.expected} body={question.expected_answer} muted />
          </div>
        )}

        {answer?.feedback ? (
          <Detail
            label={verdict === 'correct' ? d.results.explanation : d.results.whyLost}
            body={answer.feedback}
          />
        ) : null}

        {question.explanation ? (
          <Detail label={d.results.explanation} body={question.explanation} muted />
        ) : null}
      </div>
    </Card>
  );
}

function Detail({ label, body, muted }: { label: string; body: string; muted?: boolean }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
        {label}
      </h4>
      <p
        className={cx(
          'mt-1 whitespace-pre-wrap text-sm',
          muted ? 'text-[var(--text-muted)]' : undefined,
        )}
      >
        {body}
      </p>
    </div>
  );
}

export function SourceBadge({ question }: { question: Question }) {
  const { d } = useI18n();

  const info = (() => {
    switch (question.source_type) {
      case 'course_material':
        return { tone: 'accent' as const, label: d.evidence.sourceCourseMaterial };
      case 'previous_exam':
        return { tone: 'ok' as const, label: d.evidence.sourcePreviousExam };
      case 'verified_external':
        return { tone: 'ok' as const, label: d.evidence.sourceVerifiedExternal };
      default:
        return { tone: 'neutral' as const, label: d.evidence.sourceAiGenerated };
    }
  })();

  const title = [info.label, question.source_reference, question.source_basis]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pill tone={info.tone} title={title}>
      {info.label}
    </Pill>
  );
}

export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
