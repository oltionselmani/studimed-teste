'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { persist } from '@/lib/db';
import { getExam } from '@/lib/data/exams';
import {
  createPart,
  deletePart,
  ensureParts,
  getPart,
  recordPartResult,
  updatePart,
  type PartInput,
} from '@/lib/data/parts';
import { percentToGrade, readBands } from '@/lib/engine/grading-scale';
import type { ExamPartKind } from '@/lib/types';
import type { ActionResult } from './errors';

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const text = String(value).trim().replace(',', '.');
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPartInput(formData: FormData): { input: PartInput; error?: string } {
  const name = String(formData.get('name') ?? '').trim();
  const date = String(formData.get('exam_date') ?? '').trim();
  if (!name || !date) return { input: {} as PartInput, error: 'requiredField' };

  const weight = parseNumber(formData.get('weight'));
  if (weight !== null && (weight < 0 || weight > 100)) {
    return { input: {} as PartInput, error: 'invalidNumber' };
  }

  const kind = String(formData.get('kind') ?? 'midterm');
  return {
    input: {
      name,
      kind: (['midterm', 'final', 'other'].includes(kind) ? kind : 'midterm') as ExamPartKind,
      exam_date: date,
      exam_time: String(formData.get('exam_time') ?? '').trim(),
      weight,
      target_grade: parseNumber(formData.get('target_grade')),
      topics: formData.getAll('topics').map((value) => String(value)).filter(Boolean),
      notes: String(formData.get('notes') ?? '').trim(),
    },
  };
}

export async function createPartAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };

  const { input, error } = readPartInput(formData);
  if (error) return { error };

  // Make sure the implicit default part exists before adding a second one,
  // otherwise splitting an exam would silently lose its original sitting.
  await ensureParts(exam);
  await createPart(user.id, examId, input);

  await persist();
  revalidatePath(`/exams/${examId}`, 'layout');
  return { ok: true };
}

export async function updatePartAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const partId = String(formData.get('part_id') ?? '');
  const part = await getPart(user.id, partId);
  if (!part) return { error: 'notFound' };

  const { input, error } = readPartInput(formData);
  if (error) return { error };

  await updatePart(user.id, partId, input);
  await persist();
  revalidatePath(`/exams/${part.exam_id}`, 'layout');
  return { ok: true };
}

/**
 * Records what the student actually scored once a part has been sat, so the
 * remaining parts can be planned against what is already banked.
 */
export async function recordPartResultAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const partId = String(formData.get('part_id') ?? '');
  const part = await getPart(user.id, partId);
  if (!part) return { error: 'notFound' };

  const exam = await getExam(user.id, part.exam_id);
  if (!exam) return { error: 'notFound' };

  // Clearing the field puts the part back to upcoming rather than recording a
  // zero, which would quietly wreck every downstream figure.
  if (String(formData.get('clear') ?? '') === '1') {
    await recordPartResult(user.id, partId, null, null);
    await persist();
    revalidatePath(`/exams/${part.exam_id}`, 'layout');
    return { ok: true };
  }

  const mode = String(formData.get('result_mode') ?? 'grade');
  const value = parseNumber(formData.get('result_value'));
  if (value === null) return { error: 'requiredField' };

  let grade: number;
  let percent: number;

  if (mode === 'percent') {
    if (value < 0 || value > 100) return { error: 'invalidNumber' };
    percent = value;
    grade = percentToGrade(percent, readBands(exam));
  } else {
    if (value < exam.grade_min || value > exam.grade_max) return { error: 'invalidNumber' };
    grade = value;
    // The percentage is only kept for display; the grade is what the student
    // gave us and what the remaining-target maths uses.
    percent = Math.round(((grade - exam.grade_min) / (exam.grade_max - exam.grade_min)) * 100);
  }

  await recordPartResult(user.id, partId, percent, grade);
  await persist();
  revalidatePath(`/exams/${part.exam_id}`, 'layout');
  return { ok: true };
}

export async function deletePartAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const partId = String(formData.get('part_id') ?? '');

  try {
    const examId = await deletePart(user.id, partId);
    await persist();
    if (examId) revalidatePath(`/exams/${examId}`, 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'LAST_PART') return { error: 'lastPart' };
    throw error;
  }
}
