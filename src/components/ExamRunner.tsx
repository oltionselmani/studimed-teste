'use client';

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import { saveAnswerAction, submitAttemptAction } from '@/lib/actions/attempts';
import type { ActionResult } from '@/lib/actions/errors';
import { Button, Card, Notice, cx } from '@/components/ui/primitives';
import type { Answer, Attempt, Question } from '@/lib/types';

interface LocalAnswer {
  responseText: string;
  selectedOption: number | null;
  flagged: boolean;
}

const AUTOSAVE_DELAY = 900;

function SubmitButton() {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? d.attempt.submitting : d.attempt.submit}
    </Button>
  );
}

/**
 * The online exam.
 *
 * Deliberately plain: one question at a time, a strip of numbers to move
 * around, autosave, and a review flag. Nothing here competes with the question
 * for attention.
 */
export function ExamRunner({
  attempt,
  questions,
  initialAnswers,
}: {
  attempt: Attempt;
  questions: Question[];
  initialAnswers: Answer[];
}) {
  const { d, t } = useI18n();
  const router = useRouter();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(() => {
    const initial: Record<string, LocalAnswer> = {};
    for (const question of questions) {
      const existing = initialAnswers.find((answer) => answer.question_id === question.id);
      initial[question.id] = {
        responseText: existing?.response_text ?? '',
        selectedOption: existing?.selected_option ?? null,
        flagged: Boolean(existing?.flagged),
      };
    }
    return initial;
  });

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [state, submit] = useActionState<ActionResult, FormData>(submitAttemptAction, {});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state.redirectTo, router]);

  const persistAnswer = useCallback(
    (question: Question, value: LocalAnswer) => {
      clearTimeout(timers.current[question.id]);
      timers.current[question.id] = setTimeout(() => {
        void saveAnswerAction({
          attemptId: attempt.id,
          questionId: question.id,
          responseText: value.responseText,
          selectedOption: value.selectedOption,
          flagged: value.flagged,
        }).then(() => setSavedAt(Date.now()));
      }, AUTOSAVE_DELAY);
    },
    [attempt.id],
  );

  const update = useCallback(
    (question: Question, patch: Partial<LocalAnswer>) => {
      setAnswers((current) => {
        const next = { ...current[question.id], ...patch };
        const updated = { ...current, [question.id]: next };
        persistAnswer(question, next);
        return updated;
      });
    },
    [persistAnswer],
  );

  // Flush anything still in flight when the page goes away.
  useEffect(() => {
    const flush = () => {
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  const answeredCount = useMemo(
    () =>
      questions.filter((question) => {
        const answer = answers[question.id];
        return Boolean(answer?.responseText.trim()) || answer?.selectedOption !== null;
      }).length,
    [answers, questions],
  );

  const flaggedCount = useMemo(
    () => questions.filter((question) => answers[question.id]?.flagged).length,
    [answers, questions],
  );

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Notice tone="warn">{d.attempt.noQuestions}</Notice>
      </div>
    );
  }

  const question = questions[index];
  const answer = answers[question.id];
  const options: string[] = question.options_json ? JSON.parse(question.options_json) : [];

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-20 border-b bg-[var(--bg-elevated)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{attempt.title}</div>
            <div className="tabular text-xs text-[var(--text-subtle)]">
              {t(d.attempt.progress, { answered: answeredCount, total: questions.length })}
              {savedAt ? ` · ${d.attempt.autosaved}` : ''}
            </div>
          </div>
          {attempt.time_limit_minutes > 0 ? (
            <Timer startedAt={attempt.started_at} minutes={attempt.time_limit_minutes} />
          ) : null}
        </div>

        <div className="mx-auto max-w-3xl px-5 pb-3 sm:px-8">
          <div
            className="h-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]"
            role="progressbar"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label={t(d.attempt.progress, {
              answered: answeredCount,
              total: questions.length,
            })}
          >
            <div
              className="h-full rounded-r-[4px] bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${(answeredCount / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-7 sm:px-8">
        <nav aria-label={d.common.questions} className="mb-6 flex flex-wrap gap-1.5">
          {questions.map((item, position) => {
            const value = answers[item.id];
            const answered = Boolean(value?.responseText.trim()) || value?.selectedOption !== null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(position)}
                aria-current={position === index ? 'step' : undefined}
                aria-label={`${d.common.question} ${position + 1}${answered ? ' ✓' : ''}${value?.flagged ? ' ⚑' : ''}`}
                className={cx(
                  'tabular relative h-8 w-8 rounded-lg border text-xs font-semibold transition-colors',
                  position === index
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : answered
                      ? 'border-[var(--border-strong)] bg-[var(--bg-elevated)]'
                      : 'border-dashed text-[var(--text-subtle)]',
                )}
              >
                {position + 1}
                {value?.flagged ? (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--warn)]"
                  />
                ) : null}
              </button>
            );
          })}
        </nav>

        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
              {d.common.question} {index + 1} {d.common.of} {questions.length} ·{' '}
              <span className="tabular">
                {question.points} {d.common.points}
              </span>
              {question.topic_name ? ` · ${question.topic_name}` : ''}
            </div>
            <button
              type="button"
              onClick={() => update(question, { flagged: !answer?.flagged })}
              aria-pressed={Boolean(answer?.flagged)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                answer?.flagged
                  ? 'border-[var(--warn)] bg-[var(--warn-soft)] text-[var(--warn)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
              )}
            >
              {answer?.flagged ? d.attempt.flagged : d.attempt.reviewFlag}
            </button>
          </div>

          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">{question.prompt}</p>

          {question.code_block ? (
            <pre className="mt-4 overflow-x-auto rounded-lg border bg-[var(--bg-sunken)] p-4 font-mono text-[13px] leading-relaxed">
              <code>{question.code_block}</code>
            </pre>
          ) : null}

          <div className="mt-6">
            {options.length > 0 ? (
              <fieldset>
                <legend className="mb-2.5 text-sm font-medium">{d.attempt.selectOne}</legend>
                <div className="space-y-2">
                  {options.map((option, optionIndex) => (
                    <label
                      key={optionIndex}
                      className={cx(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                        answer?.selectedOption === optionIndex
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={answer?.selectedOption === optionIndex}
                        onChange={() => update(question, { selectedOption: optionIndex })}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="mr-2 font-semibold text-[var(--text-muted)]">
                          {String.fromCharCode(65 + optionIndex)})
                        </span>
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm font-medium">{d.attempt.writeAnswer}</span>
                <textarea
                  value={answer?.responseText ?? ''}
                  onChange={(event) => update(question, { responseText: event.target.value })}
                  rows={question.answer_lines > 6 ? 12 : 6}
                  className="w-full rounded-lg border bg-[var(--bg-elevated)] p-3 font-mono text-sm leading-relaxed focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                  spellCheck={false}
                />
              </label>
            )}
          </div>
        </Card>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
          >
            ← {d.common.previous}
          </Button>
          {index < questions.length - 1 ? (
            <Button onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}>
              {d.common.next} →
            </Button>
          ) : (
            <Button onClick={() => setConfirming(true)}>{d.attempt.submit}</Button>
          )}
        </div>

        <div className="mt-8 flex justify-center">
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            {d.attempt.submit}
          </Button>
        </div>

        {state.error ? (
          <Notice tone="danger" className="mt-4">
            {d.errors[state.error as keyof typeof d.errors] ?? d.errors.generic}
          </Notice>
        ) : null}
      </main>

      {confirming ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-title"
        >
          <Card className="w-full max-w-md p-6">
            <h2 id="submit-title" className="text-lg font-semibold">
              {d.attempt.submitConfirmTitle}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {t(d.attempt.submitConfirmBody, {
                answered: answeredCount,
                total: questions.length,
                flagged: flaggedCount,
              })}
            </p>
            <form action={submit} className="mt-6 flex flex-wrap justify-end gap-3">
              <input type="hidden" name="attempt_id" value={attempt.id} />
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                {d.common.cancel}
              </Button>
              <SubmitButton />
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Timer({ startedAt, minutes }: { startedAt: string | null; minutes: number }) {
  const { d } = useI18n();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const start = startedAt ? new Date(startedAt).getTime() : Date.now();
    const deadline = start + minutes * 60_000;
    const tick = () => setRemaining(deadline - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt, minutes]);

  if (remaining === null) return null;

  const expired = remaining <= 0;
  const safe = Math.max(0, remaining);
  const hours = Math.floor(safe / 3_600_000);
  const mins = Math.floor((safe % 3_600_000) / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);

  return (
    <div className="text-right" aria-live="polite">
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
        {d.attempt.timeRemaining}
      </div>
      <div
        className={cx(
          'tabular text-lg font-semibold leading-tight',
          expired ? 'text-[var(--bad)]' : safe < 5 * 60_000 ? 'text-[var(--risk)]' : undefined,
        )}
      >
        {expired
          ? d.attempt.timeUp
          : `${hours > 0 ? `${hours}:` : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
      </div>
    </div>
  );
}
