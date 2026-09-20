'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import { deleteAttemptAction, generateAttemptAction } from '@/lib/actions/attempts';
import type { ActionResult } from '@/lib/actions/errors';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Notice,
  Pill,
  SectionTitle,
  cx,
  inputClass,
} from '@/components/ui/primitives';
import { PartSwitcher } from '@/components/PartSwitcher';
import type {
  Attempt,
  AttemptKind,
  Difficulty,
  ExamPart,
  Topic,
  TopicMastery,
} from '@/lib/types';

interface Props {
  examId: string;
  parts: ExamPart[];
  activePart: ExamPart;
  aiReady: boolean;
  hasTopics: boolean;
  hasPreviousExams: boolean;
  topics: Topic[];
  mastery: TopicMastery[];
  attempts: Attempt[];
  suggestedKind: AttemptKind;
  suggestedTopic: string | null;
  openMistakes: number;
  daysLeft: number;
}

const KINDS: AttemptKind[] = ['diagnostic', 'targeted', 'mock', 'mistake_review'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'university', 'previous_exam_style'];

function GenerateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  return (
    <Button type="submit" size="lg" disabled={pending || disabled} className="w-full sm:w-auto">
      {pending ? d.generate.generating : d.common.generate}
    </Button>
  );
}

function GeneratingNotice() {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  if (!pending) return null;
  return (
    <Notice tone="info" className="mt-3">
      <span className="pulse-soft">{d.generate.generatingDetail}</span>
    </Notice>
  );
}

export function TestsPage(props: Props) {
  const { d, t } = useI18n();
  const router = useRouter();
  const [state, action] = useActionState<ActionResult, FormData>(generateAttemptAction, {});

  const [kind, setKind] = useState<AttemptKind>(props.suggestedKind);
  const [difficulty, setDifficulty] = useState<Difficulty>('university');
  const [focus, setFocus] = useState<string[]>(props.suggestedTopic ? [props.suggestedTopic] : []);

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state.redirectTo, router]);

  const kindLabel = (value: AttemptKind) =>
    value === 'diagnostic'
      ? d.generate.diagnostic
      : value === 'targeted'
        ? d.generate.targeted
        : value === 'mock'
          ? d.generate.mock
          : d.generate.mistakeReview;

  const kindHelp = (value: AttemptKind) =>
    value === 'diagnostic'
      ? d.generate.diagnosticHelp
      : value === 'targeted'
        ? d.generate.targetedHelp
        : value === 'mock'
          ? d.generate.mockHelp
          : d.generate.mistakeReviewHelp;

  const difficultyLabel = (value: Difficulty) =>
    value === 'easy'
      ? d.generate.difficultyEasy
      : value === 'medium'
        ? d.generate.difficultyMedium
        : value === 'hard'
          ? d.generate.difficultyHard
          : value === 'university'
            ? d.generate.difficultyUniversity
            : d.generate.difficultyPreviousStyle;

  const blocked = !props.aiReady || !props.hasTopics;

  return (
    <div className="space-y-10">
      <PartSwitcher parts={props.parts} active={props.activePart} examId={props.examId} />

      <section>
        <SectionTitle>{d.generate.title}</SectionTitle>

        {!props.hasTopics ? (
          <Notice tone="warn" className="mb-4">
            {d.generate.needsMaterial}
          </Notice>
        ) : null}
        {!props.aiReady ? (
          <Notice tone="warn" className="mb-4">
            {d.generate.needsApiKey}
          </Notice>
        ) : null}

        <form action={action}>
          <input type="hidden" name="exam_id" value={props.examId} />
          <input type="hidden" name="part_id" value={props.activePart.id} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="difficulty" value={difficulty} />
          {focus.map((topic) => (
            <input key={topic} type="hidden" name="focus_topics" value={topic} />
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((value) => {
              const unavailable = value === 'mistake_review' && props.openMistakes === 0;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  disabled={unavailable}
                  aria-pressed={kind === value}
                  className={cx(
                    'rounded-[var(--radius-card)] border p-4 text-left transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    kind === value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--bg-hover)]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cx(
                        'text-sm font-semibold',
                        kind === value ? 'text-[var(--accent-text)]' : undefined,
                      )}
                    >
                      {kindLabel(value)}
                    </span>
                    {value === 'mistake_review' && props.openMistakes > 0 ? (
                      <Pill tone="warn">{props.openMistakes}</Pill>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{kindHelp(value)}</p>
                </button>
              );
            })}
          </div>

          <Card className="mt-4">
            <CardHeader title={d.generate.difficulty} />
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((value) => {
                  const unavailable = value === 'previous_exam_style' && !props.hasPreviousExams;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDifficulty(value)}
                      disabled={unavailable}
                      aria-pressed={difficulty === value}
                      title={unavailable ? d.generate.previousStyleUnavailable : undefined}
                      className={cx(
                        'rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-45',
                        difficulty === value
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                          : 'hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      {difficultyLabel(value)}
                    </button>
                  );
                })}
              </div>
              {difficulty === 'previous_exam_style' ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {d.generate.difficultyPreviousStyleHelp}
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="question_count" className="mb-1.5 block text-sm font-medium">
                    {d.generate.questionCount}
                  </label>
                  <input
                    id="question_count"
                    name="question_count"
                    type="number"
                    min={4}
                    max={40}
                    className={inputClass}
                    defaultValue={kind === 'mock' ? 18 : kind === 'diagnostic' ? 12 : 10}
                    key={kind}
                  />
                </div>
                <div>
                  <label htmlFor="time_limit" className="mb-1.5 block text-sm font-medium">
                    {d.generate.timeLimit}
                  </label>
                  <select
                    id="time_limit"
                    name="time_limit"
                    className={inputClass}
                    defaultValue={kind === 'mock' ? 120 : 0}
                    key={`time-${kind}`}
                  >
                    <option value={0}>{d.generate.noTimeLimit}</option>
                    {[20, 30, 45, 60, 90, 120, 180].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} {d.common.minutes}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {props.topics.length > 0 && kind !== 'diagnostic' ? (
                <div>
                  <span className="mb-1.5 block text-sm font-medium">{d.generate.focusTopics}</span>
                  <p className="mb-2 text-xs text-[var(--text-muted)]">{d.generate.focusAuto}</p>
                  <div className="flex flex-wrap gap-2">
                    {props.topics.map((topic) => {
                      const value = props.mastery.find((row) => row.topic_name === topic.name);
                      const selected = focus.includes(topic.name);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setFocus((current) =>
                              current.includes(topic.name)
                                ? current.filter((name) => name !== topic.name)
                                : [...current, topic.name],
                            )
                          }
                          className={cx(
                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                            selected
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                              : 'hover:bg-[var(--bg-hover)]',
                          )}
                        >
                          {topic.name}
                          {value?.mastery !== null && value?.mastery !== undefined ? (
                            <span className="tabular ml-1.5 opacity-70">
                              {Math.round(value.mastery * 100)}%
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <div className="mt-4">
            <GenerateButton disabled={blocked} />
            <GeneratingNotice />
          </div>

          {state.error ? (
            <Notice tone="danger" className="mt-3">
              {d.errors[state.error as keyof typeof d.errors] ?? d.errors.generic}
            </Notice>
          ) : null}
          {state.ok && state.detail ? (
            <Notice tone="info" className="mt-3">
              {t(d.generate.qualityRegenerated, { count: state.detail })}
            </Notice>
          ) : null}
        </form>
      </section>

      <section>
        <SectionTitle>{d.nav.tests}</SectionTitle>
        {props.attempts.length === 0 ? (
          <EmptyState title={d.history.empty} body={d.history.emptyBody} />
        ) : (
          <Card className="divide-y">
            {props.attempts.map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  const { d, date } = useI18n();

  const statusPill = (() => {
    switch (attempt.status) {
      case 'graded':
        return { tone: 'ok' as const, label: d.attempt.graded };
      case 'in_progress':
        return { tone: 'accent' as const, label: d.attempt.inProgress };
      case 'submitted':
        return { tone: 'warn' as const, label: d.attempt.submitted };
      default:
        return { tone: 'neutral' as const, label: d.attempt.notStarted };
    }
  })();

  const href =
    attempt.status === 'graded'
      ? `/attempts/${attempt.id}/result`
      : attempt.status === 'in_progress'
        ? `/attempts/${attempt.id}/take`
        : `/attempts/${attempt.id}`;

  const percent =
    attempt.earned_points !== null && attempt.total_points > 0
      ? Math.round((attempt.earned_points / attempt.total_points) * 100)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <Link href={href} className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium hover:text-[var(--accent-text)]">
          {attempt.title}
        </div>
        <div className="tabular mt-0.5 text-xs text-[var(--text-subtle)]">
          {date(attempt.created_at, true)} · {attempt.total_points} {d.common.points}
          {attempt.time_limit_minutes > 0
            ? ` · ${attempt.time_limit_minutes} ${d.common.minutes}`
            : ''}
        </div>
      </Link>
      {percent !== null ? (
        <span className="tabular text-sm font-semibold">{percent}%</span>
      ) : null}
      <Pill tone={statusPill.tone}>{statusPill.label}</Pill>
      <form action={deleteAttemptAction}>
        <input type="hidden" name="attempt_id" value={attempt.id} />
        <button
          type="submit"
          aria-label={`${d.attempt.deleteAttempt}: ${attempt.title}`}
          className="rounded-md p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bad-soft)] hover:text-[var(--bad)]"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
