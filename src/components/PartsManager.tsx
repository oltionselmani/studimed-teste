'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import {
  createPartAction,
  deletePartAction,
  recordPartResultAction,
  updatePartAction,
} from '@/lib/actions/parts';
import type { ActionResult } from '@/lib/actions/errors';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Notice,
  Pill,
  cx,
  inputClass,
} from '@/components/ui/primitives';
import type { Exam, ExamPart, ExamPartKind, Topic } from '@/lib/types';

function SubmitButton({
  label,
  variant = 'primary',
  size = 'md',
}: {
  label: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
}) {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? d.common.saving : label}
    </Button>
  );
}

/**
 * Splitting an exam into kolokviums.
 *
 * The weights are shown as a running total because a split that does not add
 * up is the thing most likely to make every downstream figure wrong, and it is
 * invisible unless someone adds it up for you.
 */
export function PartsManager({
  exam,
  parts,
  topics,
  uncovered,
}: {
  exam: Exam;
  parts: ExamPart[];
  topics: Topic[];
  uncovered: string[];
}) {
  const { d, t, date } = useI18n();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const [createState, create] = useActionState<ActionResult, FormData>(createPartAction, {});
  const [deleteState, remove] = useActionState<ActionResult, FormData>(deletePartAction, {});

  const totalWeight = parts.reduce((sum, part) => sum + (part.weight ?? 0), 0);
  const weightsKnown = parts.every((part) => part.weight !== null);

  return (
    <Card>
      <CardHeader
        title={d.parts.title}
        subtitle={d.parts.subtitle}
        action={
          !adding ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              {parts.length <= 1 ? d.parts.split : d.parts.add}
            </Button>
          ) : null
        }
      />

      <div className="space-y-4 p-5">
        {parts.length === 1 && !adding ? (
          <Notice tone="info">
            <strong className="block">{d.parts.single}</strong>
            <span className="mt-1 block text-xs">{d.parts.singleHelp}</span>
          </Notice>
        ) : null}

        {parts.length > 1 && weightsKnown && Math.abs(totalWeight - 100) > 0.5 ? (
          <Notice tone="warn">
            {t(d.parts.weightsTotal, { total: Math.round(totalWeight * 10) / 10 })}
          </Notice>
        ) : null}

        {uncovered.length > 0 ? (
          <Notice tone="warn">
            <strong className="block">{t(d.parts.uncovered, { topics: uncovered.join(', ') })}</strong>
            <span className="mt-1 block text-xs">{d.parts.uncoveredHelp}</span>
          </Notice>
        ) : null}

        <ul className="space-y-3">
          {parts.map((part) => (
            <li key={part.id}>
              {editing === part.id ? (
                <PartForm
                  exam={exam}
                  part={part}
                  topics={topics}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{part.name}</span>
                        <Pill tone={part.status === 'taken' ? 'ok' : 'accent'}>
                          {part.status === 'taken' ? d.parts.taken : d.parts.upcoming}
                        </Pill>
                        {part.result_grade !== null ? (
                          <Pill tone="ok">{t(d.parts.banked, { grade: part.result_grade })}</Pill>
                        ) : null}
                      </div>
                      <div className="tabular mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-subtle)]">
                        <span>{date(part.exam_date)}</span>
                        {part.exam_time ? <span>{part.exam_time}</span> : null}
                        {part.weight !== null ? (
                          <span>
                            {d.parts.weight} {part.weight}%
                          </span>
                        ) : null}
                        {part.target_grade !== null ? (
                          <span>
                            {d.exam.target} {part.target_grade}
                          </span>
                        ) : null}
                        <span>
                          {partTopicCount(part) === 0
                            ? d.parts.topicsAll
                            : t(d.parts.topicsCount, { count: partTopicCount(part) })}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(part.id)}>
                        {d.common.edit}
                      </Button>
                      {parts.length > 1 ? (
                        <form action={remove}>
                          <input type="hidden" name="part_id" value={part.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            {d.common.remove}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <ResultForm exam={exam} part={part} />
                </div>
              )}
            </li>
          ))}
        </ul>

        {deleteState.error ? (
          <Notice tone="danger">
            {d.errors[deleteState.error as keyof typeof d.errors] ?? d.errors.generic}
          </Notice>
        ) : null}

        {adding ? (
          <PartForm exam={exam} topics={topics} onDone={() => setAdding(false)} />
        ) : null}

        {createState.error ? (
          <Notice tone="danger">
            {d.errors[createState.error as keyof typeof d.errors] ?? d.errors.generic}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}

function partTopicCount(part: ExamPart): number {
  if (!part.topics_json) return 0;
  try {
    const parsed = JSON.parse(part.topics_json) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function partTopicList(part: ExamPart | undefined): string[] {
  if (!part?.topics_json) return [];
  try {
    const parsed = JSON.parse(part.topics_json) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function PartForm({
  exam,
  part,
  topics,
  onDone,
}: {
  exam: Exam;
  part?: ExamPart;
  topics: Topic[];
  onDone: () => void;
}) {
  const { d } = useI18n();
  const [state, action] = useActionState<ActionResult, FormData>(
    part ? updatePartAction : createPartAction,
    {},
  );
  const [selected, setSelected] = useState<string[]>(() => partTopicList(part));

  // Close the form once the action reports success.
  if (state.ok) {
    queueMicrotask(onDone);
  }

  const kinds: ExamPartKind[] = ['midterm', 'final', 'other'];
  const kindLabel = (kind: ExamPartKind) =>
    kind === 'midterm' ? d.parts.kindMidterm : kind === 'final' ? d.parts.kindFinal : d.parts.kindOther;

  return (
    <form action={action} className="rounded-lg border border-[var(--accent)] p-4">
      <input type="hidden" name="exam_id" value={exam.id} />
      {part ? <input type="hidden" name="part_id" value={part.id} /> : null}
      {selected.map((topic) => (
        <input key={topic} type="hidden" name="topics" value={topic} />
      ))}

      <h3 className="mb-4 text-sm font-semibold">{part ? d.parts.edit : d.parts.addTitle}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={d.parts.name} htmlFor={`name-${part?.id ?? 'new'}`}>
          <input
            id={`name-${part?.id ?? 'new'}`}
            name="name"
            className={inputClass}
            placeholder={d.parts.namePlaceholder}
            defaultValue={part?.name}
            required
          />
        </Field>

        <Field label={d.parts.kind} htmlFor={`kind-${part?.id ?? 'new'}`}>
          <select
            id={`kind-${part?.id ?? 'new'}`}
            name="kind"
            className={inputClass}
            defaultValue={part?.kind ?? 'midterm'}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={d.parts.date} htmlFor={`date-${part?.id ?? 'new'}`}>
          <input
            id={`date-${part?.id ?? 'new'}`}
            name="exam_date"
            type="date"
            className={inputClass}
            defaultValue={part?.exam_date}
            required
          />
        </Field>

        <Field label={d.parts.time} optional={d.common.optional} htmlFor={`time-${part?.id ?? 'new'}`}>
          <input
            id={`time-${part?.id ?? 'new'}`}
            name="exam_time"
            type="time"
            className={inputClass}
            defaultValue={part?.exam_time}
          />
        </Field>

        <Field
          label={d.parts.weight}
          hint={d.parts.weightHelp}
          optional={d.common.optional}
          htmlFor={`weight-${part?.id ?? 'new'}`}
        >
          <div className="relative">
            <input
              id={`weight-${part?.id ?? 'new'}`}
              name="weight"
              type="number"
              min={0}
              max={100}
              step={1}
              className={inputClass}
              defaultValue={part?.weight ?? ''}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-subtle)]">
              %
            </span>
          </div>
        </Field>

        <Field
          label={d.parts.targetGrade}
          hint={d.parts.targetHelp}
          optional={d.common.optional}
          htmlFor={`target-${part?.id ?? 'new'}`}
        >
          <input
            id={`target-${part?.id ?? 'new'}`}
            name="target_grade"
            type="number"
            step="0.1"
            min={exam.grade_min}
            max={exam.grade_max}
            className={inputClass}
            defaultValue={part?.target_grade ?? ''}
          />
        </Field>
      </div>

      {topics.length > 0 ? (
        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium">{d.parts.topics}</span>
          <p className="mb-2 text-xs text-[var(--text-muted)]">{d.parts.topicsHelp}</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => {
              const on = selected.includes(topic.name);
              return (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSelected((current) =>
                      current.includes(topic.name)
                        ? current.filter((name) => name !== topic.name)
                        : [...current, topic.name],
                    )
                  }
                  className={cx(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    on
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                      : 'hover:bg-[var(--bg-hover)]',
                  )}
                >
                  {topic.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Field
        label={d.parts.notes}
        optional={d.common.optional}
        className="mt-4"
        htmlFor={`notes-${part?.id ?? 'new'}`}
      >
        <input
          id={`notes-${part?.id ?? 'new'}`}
          name="notes"
          className={inputClass}
          defaultValue={part?.notes}
        />
      </Field>

      {state.error ? (
        <Notice tone="danger" className="mt-4">
          {d.errors[state.error as keyof typeof d.errors] ?? d.errors.generic}
        </Notice>
      ) : null}

      <div className="mt-4 flex gap-3">
        <SubmitButton label={d.common.save} size="sm" />
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          {d.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Records the grade actually awarded for a part that has been sat. */
function ResultForm({ exam, part }: { exam: Exam; part: ExamPart }) {
  const { d } = useI18n();
  const [state, action] = useActionState<ActionResult, FormData>(recordPartResultAction, {});
  const [open, setOpen] = useState(false);

  if (!open && part.result_grade === null) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-medium text-[var(--accent-text)] hover:underline"
      >
        {d.parts.recordResult} →
      </button>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-xs text-[var(--text-muted)]">{d.parts.recordResultHelp}</p>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="part_id" value={part.id} />
        <div className="w-32">
          <label
            htmlFor={`mode-${part.id}`}
            className="mb-1 block text-[11px] font-medium text-[var(--text-subtle)]"
          >
            {d.parts.result}
          </label>
          <select id={`mode-${part.id}`} name="result_mode" className={inputClass} defaultValue="grade">
            <option value="grade">{d.parts.resultAsGrade}</option>
            <option value="percent">{d.parts.resultAsPercent}</option>
          </select>
        </div>
        <div className="w-28">
          <label
            htmlFor={`value-${part.id}`}
            className="mb-1 block text-[11px] font-medium text-[var(--text-subtle)]"
          >
            {d.parts.resultValue}
          </label>
          <input
            id={`value-${part.id}`}
            name="result_value"
            type="number"
            step="0.1"
            className={inputClass}
            defaultValue={part.result_grade ?? ''}
            placeholder={String(exam.grade_max)}
          />
        </div>
        <SubmitButton label={d.common.save} variant="secondary" size="sm" />
        {part.result_grade !== null ? (
          <button
            type="submit"
            name="clear"
            value="1"
            className="pb-2 text-xs text-[var(--text-muted)] hover:text-[var(--bad)]"
          >
            {d.parts.clearResult}
          </button>
        ) : null}
      </form>
      {state.error ? (
        <Notice tone="danger" className="mt-2">
          {d.errors[state.error as keyof typeof d.errors] ?? d.errors.generic}
        </Notice>
      ) : null}
    </div>
  );
}
