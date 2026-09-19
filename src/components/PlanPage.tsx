'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import {
  deleteStudySheetAction,
  generatePlanAction,
  generateStudySheetAction,
  toggleTaskAction,
} from '@/lib/actions/study';
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
import type { Exam, StudyMaterialRow, StudyPlan, StudyTask, Topic } from '@/lib/types';

interface Priority {
  topic: string;
  mastery: number | null;
}

interface Props {
  exam: Exam;
  plan: StudyPlan | null;
  tasks: StudyTask[];
  priorities: Priority[];
  avoid: { topic: string; reason: string }[];
  topics: Topic[];
  sheets: StudyMaterialRow[];
  aiReady: boolean;
  hasResults: boolean;
  daysLeft: number;
}

function PendingButton({
  label,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  disabled,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function PlanPage(props: Props) {
  const { d, t, date } = useI18n();
  const router = useRouter();

  const [planState, buildPlan] = useActionState<ActionResult, FormData>(generatePlanAction, {});
  const [sheetState, makeSheet] = useActionState<ActionResult, FormData>(
    generateStudySheetAction,
    {},
  );
  const [sheetTopic, setSheetTopic] = useState(props.priorities[0]?.topic ?? '');

  useEffect(() => {
    if (sheetState.redirectTo) router.push(sheetState.redirectTo);
  }, [sheetState.redirectTo, router]);

  const byDay = props.tasks.reduce<Record<number, StudyTask[]>>((acc, task) => {
    (acc[task.day_index] ??= []).push(task);
    return acc;
  }, {});
  const dayIndexes = Object.keys(byDay)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {t(d.plan.whatDoINeed, { target: props.exam.target_grade })}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{d.plan.updatedAfterTest}</p>
          </div>
          <form action={buildPlan}>
            <input type="hidden" name="exam_id" value={props.exam.id} />
            <PendingButton
              label={props.plan ? d.plan.regenerate : d.plan.generate}
              pendingLabel={d.plan.generating}
              disabled={!props.aiReady || !props.hasResults}
            />
          </form>
        </div>

        {!props.hasResults ? (
          <Notice tone="warn" className="mt-4">
            <strong className="block">{d.plan.noPlan}</strong>
            <span className="mt-1 block text-xs">{d.plan.noPlanBody}</span>
          </Notice>
        ) : null}
        {planState.error ? (
          <Notice tone="danger" className="mt-4">
            {d.errors[planState.error as keyof typeof d.errors] ?? d.errors.generic}
          </Notice>
        ) : null}
      </section>

      {props.priorities.length > 0 ? (
        <section>
          <SectionTitle hint={t(d.plan.daysRemaining, { days: props.daysLeft })}>
            {d.plan.priorities}
          </SectionTitle>
          <div className="space-y-2.5">
            {props.priorities.map((priority, index) => (
              <Card key={priority.topic} className="flex flex-wrap items-center gap-4 p-4">
                <span className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-text)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{priority.topic}</div>
                  <div className="tabular mt-0.5 text-xs text-[var(--text-muted)]">
                    {priority.mastery === null
                      ? d.plan.notTested
                      : t(d.plan.currentMastery, { value: Math.round(priority.mastery * 100) })}
                  </div>
                </div>
                <Link
                  href={`/exams/${props.exam.id}/tests?kind=targeted&topic=${encodeURIComponent(priority.topic)}`}
                  className="shrink-0 text-sm font-medium text-[var(--accent-text)] hover:underline"
                >
                  {d.results.testAgain}
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {props.plan ? (
        <>
          {props.plan.rationale ? (
            <section>
              <SectionTitle>{d.plan.rationale}</SectionTitle>
              <Card className="p-5">
                <p className="text-sm text-[var(--text-muted)]">{props.plan.rationale}</p>
              </Card>
            </section>
          ) : null}

          <section>
            <SectionTitle hint={date(props.plan.generated_at, true)}>
              {t(d.plan.planTitle, { target: props.exam.target_grade })}
            </SectionTitle>
            <div className="space-y-4">
              {dayIndexes.map((dayIndex) => (
                <Card key={dayIndex}>
                  <CardHeader
                    title={
                      dayIndex === 0
                        ? d.plan.today
                        : dayIndex === 1
                          ? d.plan.tomorrow
                          : date(byDay[dayIndex][0].date)
                    }
                    subtitle={`${byDay[dayIndex].reduce((sum, task) => sum + task.minutes, 0)} ${d.common.minutes}`}
                  />
                  <ol className="divide-y p-5 pt-3">
                    {byDay[dayIndex].map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </ol>
                </Card>
              ))}
            </div>
          </section>

          {props.avoid.length > 0 ? (
            <section>
              <SectionTitle hint={d.plan.dontSpendTimeHelp}>{d.plan.dontSpendTime}</SectionTitle>
              <Card className="divide-y">
                {props.avoid.map((item) => (
                  <div key={item.topic} className="p-4">
                    <div className="text-sm font-medium">{item.topic}</div>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.reason}</p>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}
        </>
      ) : null}

      <section>
        <SectionTitle>{d.study.title}</SectionTitle>
        <p className="mb-4 text-sm text-[var(--text-muted)]">{d.study.subtitle}</p>

        <Card className="p-5">
          <form action={makeSheet} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="exam_id" value={props.exam.id} />
            <div className="min-w-[200px] flex-1">
              <label htmlFor="sheet-topic" className="mb-1.5 block text-sm font-medium">
                {d.study.forTopic}
              </label>
              <select
                id="sheet-topic"
                name="topic"
                className={inputClass}
                value={sheetTopic}
                onChange={(event) => setSheetTopic(event.target.value)}
              >
                <option value="">—</option>
                {props.topics.map((topic) => (
                  <option key={topic.id} value={topic.name}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
            <PendingButton
              label={d.study.generate}
              pendingLabel={d.study.generating}
              disabled={!props.aiReady || !sheetTopic}
            />
          </form>

          {sheetState.error ? (
            <Notice tone="danger" className="mt-3">
              {d.errors[sheetState.error as keyof typeof d.errors] ?? d.errors.generic}
            </Notice>
          ) : null}
        </Card>

        {props.sheets.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={d.study.empty} body={d.study.emptyBody} />
          </div>
        ) : (
          <Card className="mt-4 divide-y">
            {props.sheets.map((sheet) => (
              <div key={sheet.id} className="flex flex-wrap items-center gap-3 p-4">
                <Link
                  href={`/print/study/${sheet.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:text-[var(--accent-text)]"
                >
                  {sheet.title}
                </Link>
                <span className="tabular text-xs text-[var(--text-subtle)]">
                  {date(sheet.created_at)}
                </span>
                <Link
                  href={`/print/study/${sheet.id}`}
                  className="text-sm font-medium text-[var(--accent-text)] hover:underline"
                >
                  {d.study.printSheet}
                </Link>
                <form action={deleteStudySheetAction}>
                  <input type="hidden" name="sheet_id" value={sheet.id} />
                  <input type="hidden" name="exam_id" value={props.exam.id} />
                  <button
                    type="submit"
                    aria-label={`${d.common.delete}: ${sheet.title}`}
                    className="rounded-md p-1.5 text-[var(--text-subtle)] hover:bg-[var(--bad-soft)] hover:text-[var(--bad)]"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </form>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function TaskRow({ task }: { task: StudyTask }) {
  const { d } = useI18n();

  const actionLabel = {
    study: d.plan.action.study,
    practice: d.plan.action.practice,
    review: d.plan.action.review,
    test: d.plan.action.test,
    rest: d.plan.action.rest,
  }[task.action];

  return (
    <li className="flex items-start gap-3 py-3">
      <form action={toggleTaskAction} className="pt-0.5">
        <input type="hidden" name="task_id" value={task.id} />
        <button
          type="submit"
          aria-label={task.done ? d.plan.markUndone : d.plan.markDone}
          aria-pressed={Boolean(task.done)}
          className={cx(
            'flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
            task.done
              ? 'border-[var(--ok)] bg-[var(--ok)] text-white'
              : 'hover:border-[var(--accent)]',
          )}
        >
          {task.done ? (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : null}
        </button>
      </form>

      <div className={cx('min-w-0 flex-1', task.done ? 'opacity-55' : undefined)}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cx('text-sm font-medium', task.done ? 'line-through' : undefined)}>
            {task.title}
          </span>
          <Pill tone={task.action === 'test' ? 'accent' : 'neutral'}>{actionLabel}</Pill>
          <span className="tabular text-xs text-[var(--text-subtle)]">
            {task.minutes} {d.common.minutes}
          </span>
        </div>
        {task.detail ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{task.detail}</p>
        ) : null}
        {task.target_note ? (
          <p className="mt-1 text-xs font-medium text-[var(--accent-text)]">{task.target_note}</p>
        ) : null}
      </div>
    </li>
  );
}
