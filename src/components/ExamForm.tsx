'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import { createExamAction, updateExamAction, type ExamFormState } from '@/lib/actions/exams';
import { Button, Card, CardHeader, Field, Notice, inputClass } from '@/components/ui/primitives';
import type { Exam } from '@/lib/types';

const TARGETS = [5, 6, 7, 8, 9, 10];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? d.common.saving : label}
    </Button>
  );
}

export function ExamForm({ exam }: { exam?: Exam }) {
  const { d } = useI18n();
  const [state, action] = useActionState<ExamFormState, FormData>(
    exam ? updateExamAction : createExamAction,
    {},
  );

  const [scale, setScale] = useState(exam?.grading_scale ?? 'ubt_10');
  const [target, setTarget] = useState(() => {
    const initial = exam?.target_grade ?? 10;
    return TARGETS.includes(initial) ? String(initial) : 'custom';
  });

  const fieldError = (name: string) =>
    state.fieldErrors?.[name]
      ? (d.errors[state.fieldErrors[name] as keyof typeof d.errors] as string)
      : undefined;

  const isTenScale = scale === 'ubt_10';

  return (
    <form action={action} className="space-y-5">
      {exam ? <input type="hidden" name="exam_id" value={exam.id} /> : null}

      <Card>
        <CardHeader title={d.exam.createTitle} subtitle={d.exam.createSubtitle} />
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label={d.exam.courseName} htmlFor="course_name" error={fieldError('course_name')}>
              <input
                id="course_name"
                name="course_name"
                className={inputClass}
                placeholder={d.exam.courseNamePlaceholder}
                defaultValue={exam?.course_name}
                required
              />
            </Field>
            <Field label={d.exam.courseCode} optional={d.common.optional} htmlFor="course_code">
              <input id="course_code" name="course_code" className={inputClass} defaultValue={exam?.course_code} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={d.exam.examDate} htmlFor="exam_date" error={fieldError('exam_date')}>
              <input
                id="exam_date"
                name="exam_date"
                type="date"
                className={inputClass}
                defaultValue={exam?.exam_date}
                required
              />
            </Field>
            <Field label={d.exam.examTime} optional={d.common.optional} htmlFor="exam_time">
              <input id="exam_time" name="exam_time" type="time" className={inputClass} defaultValue={exam?.exam_time} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={d.exam.targetGrade} />
        <div className="space-y-5 p-5">
          <Field label={d.exam.gradingScale} htmlFor="grading_scale">
            <select
              id="grading_scale"
              name="grading_scale"
              className={inputClass}
              value={scale}
              onChange={(event) => setScale(event.target.value)}
            >
              <option value="ubt_10">{d.exam.gradingScaleUbt}</option>
              <option value="percent">{d.exam.gradingScalePercent}</option>
              <option value="custom">{d.exam.gradingScaleCustom}</option>
              <option value="unknown">{d.exam.gradingScaleUnknown}</option>
            </select>
          </Field>

          {scale === 'unknown' ? (
            <Notice tone="warn">{d.exam.gradingScaleUnknownHelp}</Notice>
          ) : null}

          {scale === 'custom' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Min" htmlFor="grade_min">
                <input id="grade_min" name="grade_min" type="number" step="0.1" className={inputClass} defaultValue={exam?.grade_min ?? 1} />
              </Field>
              <Field label="Max" htmlFor="grade_max">
                <input id="grade_max" name="grade_max" type="number" step="0.1" className={inputClass} defaultValue={exam?.grade_max ?? 10} />
              </Field>
            </div>
          ) : (
            <>
              <input type="hidden" name="grade_min" value={scale === 'percent' ? 0 : 5} />
              <input type="hidden" name="grade_max" value={scale === 'percent' ? 100 : 10} />
            </>
          )}

          <Field label={d.exam.targetGrade} error={fieldError('target_grade')}>
            {isTenScale ? (
              <div className="flex flex-wrap gap-2">
                {TARGETS.map((value) => (
                  <label
                    key={value}
                    className={`tabular cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                      target === String(value)
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="target_grade"
                      value={value}
                      checked={target === String(value)}
                      onChange={() => setTarget(String(value))}
                      className="sr-only"
                    />
                    {value.toFixed(1)}
                  </label>
                ))}
                <label
                  className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    target === 'custom'
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="target_grade"
                    value="custom"
                    checked={target === 'custom'}
                    onChange={() => setTarget('custom')}
                    className="sr-only"
                  />
                  {d.exam.customTarget}
                </label>
              </div>
            ) : (
              <input
                name="target_grade"
                type="number"
                step="0.1"
                className={inputClass}
                defaultValue={exam?.target_grade}
                required
              />
            )}
          </Field>

          {isTenScale && target === 'custom' ? (
            <Field label={d.exam.customTarget} htmlFor="target_grade_custom">
              <input
                id="target_grade_custom"
                name="target_grade_custom"
                type="number"
                step="0.1"
                className={inputClass}
                defaultValue={exam?.target_grade}
                required
              />
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={d.exam.currentGrade}
              optional={d.common.optional}
              hint={d.exam.currentGradeHelp}
              htmlFor="current_grade"
            >
              <input
                id="current_grade"
                name="current_grade"
                type="number"
                step="0.1"
                className={inputClass}
                defaultValue={exam?.current_grade ?? ''}
              />
            </Field>
            <Field
              label={d.exam.examWeight}
              optional={d.common.optional}
              hint={d.exam.examWeightHelp}
              error={fieldError('exam_weight')}
              htmlFor="exam_weight"
            >
              <div className="relative">
                <input
                  id="exam_weight"
                  name="exam_weight"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  className={inputClass}
                  defaultValue={exam?.exam_weight ?? ''}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-subtle)]">
                  %
                </span>
              </div>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={d.exam.notes} subtitle={d.settings.profile} />
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={d.exam.university} optional={d.common.optional} htmlFor="university">
              <input id="university" name="university" className={inputClass} defaultValue={exam?.university} />
            </Field>
            <Field label={d.exam.program} optional={d.common.optional} htmlFor="program">
              <input id="program" name="program" className={inputClass} defaultValue={exam?.program} />
            </Field>
            <Field label={d.exam.professor} optional={d.common.optional} htmlFor="professor">
              <input id="professor" name="professor" className={inputClass} defaultValue={exam?.professor} />
            </Field>
            <Field label={d.exam.courseLanguage} htmlFor="language">
              <select id="language" name="language" className={inputClass} defaultValue={exam?.language ?? 'en'}>
                <option value="en">{d.common.english}</option>
                <option value="sq">{d.common.albanian}</option>
              </select>
            </Field>
          </div>

          <Field label={d.exam.notes} optional={d.common.optional} htmlFor="notes">
            <textarea
              id="notes"
              name="notes"
              rows={4}
              className={inputClass}
              placeholder={d.exam.notesPlaceholder}
              defaultValue={exam?.notes}
            />
          </Field>
        </div>
      </Card>

      {state.error ? <Notice tone="danger">{d.errors.generic}</Notice> : null}

      <div className="flex justify-end">
        <Submit label={exam ? d.common.save : d.exam.create} />
      </div>
    </form>
  );
}
