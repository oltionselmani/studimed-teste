'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import { ExamForm } from '@/components/ExamForm';
import {
  archiveExamAction,
  deleteExamAction,
  updateGradeBandsAction,
  type ExamFormState,
} from '@/lib/actions/exams';
import { Button, Card, CardHeader, Notice, inputClass } from '@/components/ui/primitives';
import type { GradeBand } from '@/lib/engine/grading-scale';
import type { Exam } from '@/lib/types';

function SaveBands() {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? d.common.saving : d.common.save}
    </Button>
  );
}

export function ExamSettings({ exam, bands }: { exam: Exam; bands: GradeBand[] }) {
  const { d } = useI18n();
  const [bandState, saveBands] = useActionState<ExamFormState, FormData>(
    updateGradeBandsAction,
    {},
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-6">
      <ExamForm exam={exam} />

      <Card>
        <CardHeader title={d.exam.gradeBandsTitle} subtitle={d.exam.gradeBandsHelp} />
        <form action={saveBands} className="p-5">
          <input type="hidden" name="exam_id" value={exam.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            {[...bands]
              .sort((a, b) => b.grade - a.grade)
              .map((band) => (
                <label key={band.grade} className="flex items-center gap-2.5">
                  <span className="tabular w-10 shrink-0 text-sm font-semibold">{band.grade}</span>
                  <span className="text-xs text-[var(--text-subtle)]">≥</span>
                  <input
                    name={`band_${band.grade}`}
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={band.min_percent}
                    className={inputClass}
                    aria-label={`${d.results.grade} ${band.grade}`}
                  />
                  <span className="text-xs text-[var(--text-subtle)]">%</span>
                </label>
              ))}
          </div>
          {bandState.error ? (
            <Notice tone="danger" className="mt-4">
              {d.errors.invalidNumber}
            </Notice>
          ) : null}
          <div className="mt-4">
            <SaveBands />
          </div>
        </form>
      </Card>

      <Card className="border-[var(--bad)]">
        <CardHeader title={d.settings.dangerZone} />
        <div className="flex flex-wrap gap-3 p-5">
          <form action={archiveExamAction}>
            <input type="hidden" name="exam_id" value={exam.id} />
            <input type="hidden" name="archived" value={exam.archived ? '0' : '1'} />
            <Button type="submit" variant="secondary">
              {exam.archived ? d.exam.unarchive : d.exam.archive}
            </Button>
          </form>

          {confirmDelete ? (
            <div className="w-full space-y-3">
              <Notice tone="danger">{d.exam.deleteConfirm}</Notice>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  {d.common.cancel}
                </Button>
                <form action={deleteExamAction}>
                  <input type="hidden" name="exam_id" value={exam.id} />
                  <Button type="submit" variant="danger">
                    {d.common.delete}
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              {d.common.delete}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
