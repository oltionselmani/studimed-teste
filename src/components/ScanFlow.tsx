'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import {
  correctScanAnswerAction,
  deleteScanPageAction,
  readScanPagesAction,
  uploadScanPagesAction,
} from '@/lib/actions/scans';
import { submitAttemptAction } from '@/lib/actions/attempts';
import type { ActionResult } from '@/lib/actions/errors';
import { Button, Card, Notice, Pill, SectionTitle, cx } from '@/components/ui/primitives';
import type { Answer, Attempt, Exam, Question, ScanPage } from '@/lib/types';

interface Props {
  exam: Exam;
  attempt: Attempt;
  pages: ScanPage[];
  questions: Question[];
  answers: Answer[];
  aiReady: boolean;
}

function PendingButton({
  label,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  disabled,
  className,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled} className={className}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Photograph → read → correct → grade.
 *
 * The correction step is not optional politeness: an answer the model could not
 * read is never scored as wrong, so the student has to be able to type it in.
 */
export function ScanFlow(props: Props) {
  const { d, t } = useI18n();
  const router = useRouter();

  const [uploadState, upload] = useActionState<ActionResult, FormData>(uploadScanPagesAction, {});
  const [readState, read] = useActionState<ActionResult, FormData>(readScanPagesAction, {});
  const [gradeState, grade] = useActionState<ActionResult, FormData>(submitAttemptAction, {});

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (gradeState.redirectTo) router.push(gradeState.redirectTo);
  }, [gradeState.redirectTo, router]);

  const hasRead = props.answers.some((answer) => answer.input_source !== 'online');

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
      <Link
        href={`/attempts/${props.attempt.id}`}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        ← {props.attempt.title}
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{d.scan.title}</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">{d.scan.subtitle}</p>
      </header>

      {!props.aiReady ? (
        <Notice tone="warn" className="mt-6">
          {d.scan.needsApiKey}
        </Notice>
      ) : null}

      <section className="mt-7">
        <SectionTitle>{d.scan.addPages}</SectionTitle>

        <form
          ref={formRef}
          action={upload}
          className="flex flex-wrap gap-3"
          encType="multipart/form-data"
        >
          <input type="hidden" name="attempt_id" value={props.attempt.id} />
          {/* capture="environment" opens the rear camera straight away on a phone. */}
          <input
            ref={cameraRef}
            type="file"
            name="pages"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            aria-label={d.scan.takePhoto}
            onChange={() => formRef.current?.requestSubmit()}
          />
          <input
            ref={fileRef}
            type="file"
            name="pages"
            accept="image/*,application/pdf"
            multiple
            className="sr-only"
            aria-label={d.scan.uploadFiles}
            onChange={() => formRef.current?.requestSubmit()}
          />
          <Button type="button" size="lg" onClick={() => cameraRef.current?.click()}>
            <IconCamera />
            {d.scan.takePhoto}
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={() => fileRef.current?.click()}>
            {d.scan.uploadFiles}
          </Button>
        </form>

        {uploadState.error ? (
          <Notice tone="danger" className="mt-3">
            {d.errors[uploadState.error as keyof typeof d.errors] ?? d.errors.generic}
          </Notice>
        ) : null}

        {props.pages.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-subtle)]">{d.scan.noPages}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {props.pages.map((page) => (
              <li
                key={page.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2.5"
              >
                <span className="text-sm font-medium">
                  {t(d.scan.pageDetected, { n: page.page_index + 1 })}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-subtle)]">
                  {page.filename}
                </span>
                {page.state === 'read' ? (
                  <Pill tone="ok">{d.scan.detected}</Pill>
                ) : page.state === 'failed' ? (
                  <Pill tone="bad" title={page.note}>
                    {d.scan.pageFailed}
                  </Pill>
                ) : (
                  <Pill>{d.materials.extractionPending}</Pill>
                )}
                <form action={deleteScanPageAction}>
                  <input type="hidden" name="page_id" value={page.id} />
                  <button
                    type="submit"
                    aria-label={`${d.common.remove}: ${page.filename}`}
                    className="rounded-md p-1.5 text-[var(--text-subtle)] hover:bg-[var(--bad-soft)] hover:text-[var(--bad)]"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {props.pages.length > 0 ? (
          <form action={read} className="mt-4">
            <input type="hidden" name="attempt_id" value={props.attempt.id} />
            <PendingButton
              label={d.scan.readPages}
              pendingLabel={d.scan.reading}
              disabled={!props.aiReady}
            />
          </form>
        ) : null}

        {readState.error ? (
          <Notice tone="danger" className="mt-3">
            {d.errors[readState.error as keyof typeof d.errors] ?? d.errors.generic}
          </Notice>
        ) : null}
        {readState.message === 'pageFailed' ? (
          <Notice tone="warn" className="mt-3">
            {d.scan.pageFailed}
          </Notice>
        ) : null}
      </section>

      {hasRead ? (
        <section className="mt-10">
          <SectionTitle>{d.scan.reviewTitle}</SectionTitle>
          <p className="mb-4 text-sm text-[var(--text-muted)]">{d.scan.reviewSubtitle}</p>

          <div className="space-y-3">
            {props.questions.map((question) => (
              <DetectedAnswer
                key={question.id}
                attemptId={props.attempt.id}
                question={question}
                answer={props.answers.find((answer) => answer.question_id === question.id) ?? null}
              />
            ))}
          </div>

          <form action={grade} className="mt-7">
            <input type="hidden" name="attempt_id" value={props.attempt.id} />
            <PendingButton
              label={d.scan.gradeMyExam}
              pendingLabel={d.attempt.submitting}
              size="lg"
              className="w-full sm:w-auto"
            />
          </form>

          {gradeState.error ? (
            <Notice tone="danger" className="mt-3">
              {d.errors[gradeState.error as keyof typeof d.errors] ?? d.errors.generic}
            </Notice>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function DetectedAnswer({
  attemptId,
  question,
  answer,
}: {
  attemptId: string;
  question: Question;
  answer: Answer | null;
}) {
  const { d } = useI18n();
  const options: string[] = question.options_json ? JSON.parse(question.options_json) : [];

  const [text, setText] = useState(answer?.response_text ?? '');
  const [option, setOption] = useState<number | null>(answer?.selected_option ?? null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const confidence = answer?.scan_confidence ?? '';
  const info = (() => {
    switch (confidence) {
      case 'high':
        return { tone: 'ok' as const, label: d.scan.confidenceHigh };
      case 'medium':
        return { tone: 'accent' as const, label: d.scan.confidenceMedium };
      case 'low':
        return { tone: 'warn' as const, label: d.scan.confidenceLow };
      case 'unreadable':
        return { tone: 'bad' as const, label: d.scan.confidenceUnreadable };
      default:
        return { tone: 'neutral' as const, label: d.results.blank };
    }
  })();

  async function save() {
    await correctScanAnswerAction({
      attemptId,
      questionId: question.id,
      responseText: text,
      selectedOption: option,
    });
    setSaved(true);
    setEditing(false);
  }

  const needsAttention = confidence === 'low' || confidence === 'unreadable';

  return (
    <Card
      className={cx('p-4', needsAttention && !saved ? 'border-[var(--warn)]' : undefined)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tabular text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
          {d.common.question} {question.position}
          {question.topic_name ? ` · ${question.topic_name}` : ''}
        </span>
        <Pill tone={saved ? 'ok' : info.tone}>{saved ? d.common.saved : info.label}</Pill>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-[var(--text-muted)]">{question.prompt}</p>

      {confidence === 'unreadable' && !saved ? (
        <p className="mt-2 text-xs text-[var(--bad)]">{d.scan.unreadableHelp}</p>
      ) : null}

      <div className="mt-3">
        {options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {options.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setOption(index);
                  setEditing(true);
                }}
                aria-pressed={option === index}
                className={cx(
                  'h-9 w-9 rounded-lg border text-sm font-semibold transition-colors',
                  option === index
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'hover:bg-[var(--bg-hover)]',
                )}
              >
                {String.fromCharCode(65 + index)}
              </button>
            ))}
          </div>
        ) : editing ? (
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            className="w-full rounded-lg border bg-[var(--bg-elevated)] p-3 font-mono text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            aria-label={d.scan.correctIt}
            autoFocus
          />
        ) : (
          <p className="whitespace-pre-wrap rounded-lg bg-[var(--bg-sunken)] p-3 font-mono text-sm">
            {text || '—'}
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {editing || (options.length > 0 && option !== (answer?.selected_option ?? null)) ? (
          <Button size="sm" onClick={save}>
            {d.common.save}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {d.scan.correctIt}
          </Button>
        )}
      </div>
    </Card>
  );
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
