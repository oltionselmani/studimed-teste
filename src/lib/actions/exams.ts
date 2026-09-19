'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { persist } from '@/lib/db';
import { createExam, deleteExam, getExam, updateExam, type ExamInput } from '@/lib/data/exams';
import { DEFAULT_BANDS_10, defaultBandsFor } from '@/lib/engine/grading-scale';

export interface ExamFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const text = String(value).trim().replace(',', '.');
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function readExamInput(formData: FormData): { input: ExamInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const courseName = String(formData.get('course_name') ?? '').trim();
  if (!courseName) errors.course_name = 'requiredField';

  const examDate = String(formData.get('exam_date') ?? '').trim();
  if (!examDate) errors.exam_date = 'requiredField';

  const scale = String(formData.get('grading_scale') ?? 'ubt_10');
  const gradeMin = parseNumber(formData.get('grade_min')) ?? (scale === 'percent' ? 0 : 5);
  const gradeMax = parseNumber(formData.get('grade_max')) ?? (scale === 'percent' ? 100 : 10);

  const targetRaw = String(formData.get('target_grade') ?? '');
  const target =
    targetRaw === 'custom'
      ? parseNumber(formData.get('target_grade_custom'))
      : parseNumber(targetRaw);
  if (target === null) errors.target_grade = 'requiredField';

  const weight = parseNumber(formData.get('exam_weight'));
  if (weight !== null && (weight < 0 || weight > 100)) errors.exam_weight = 'invalidNumber';

  return {
    errors,
    input: {
      course_name: courseName,
      course_code: String(formData.get('course_code') ?? '').trim(),
      exam_date: examDate,
      exam_time: String(formData.get('exam_time') ?? '').trim(),
      target_grade: target ?? gradeMax,
      current_grade: parseNumber(formData.get('current_grade')),
      exam_weight: weight,
      grading_scale: scale,
      grade_min: gradeMin,
      grade_max: gradeMax,
      university: String(formData.get('university') ?? '').trim(),
      program: String(formData.get('program') ?? '').trim(),
      professor: String(formData.get('professor') ?? '').trim(),
      language: String(formData.get('language') ?? 'en'),
      notes: String(formData.get('notes') ?? '').trim(),
    },
  };
}

export async function createExamAction(
  _prev: ExamFormState,
  formData: FormData,
): Promise<ExamFormState> {
  const user = await requireUser();
  const { input, errors } = readExamInput(formData);
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const examId = await createExam(user.id, input);
  await persist();
  revalidatePath('/', 'layout');
  redirect(`/exams/${examId}/material`);
}

export async function updateExamAction(
  _prev: ExamFormState,
  formData: FormData,
): Promise<ExamFormState> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const { input, errors } = readExamInput(formData);
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const existing = await getExam(user.id, examId);
  if (!existing) return { error: 'notFound' };

  // If the scale itself changed, the stored conversion no longer applies.
  const bands =
    existing.grading_scale !== input.grading_scale ||
    existing.grade_min !== input.grade_min ||
    existing.grade_max !== input.grade_max
      ? JSON.stringify(defaultBandsFor(input.grading_scale, input.grade_min, input.grade_max))
      : undefined;

  await updateExam(user.id, examId, { ...input, grade_bands: bands });
  await persist();
  revalidatePath('/', 'layout');
  return {};
}

/** Saves an edited percentage-to-grade conversion for one exam. */
export async function updateGradeBandsAction(
  _prev: ExamFormState,
  formData: FormData,
): Promise<ExamFormState> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };

  const bands = DEFAULT_BANDS_10.map((band) => band.grade)
    .map((grade) => {
      const raw = formData.get(`band_${grade}`);
      const value = raw === null ? null : Number(String(raw));
      return value === null || !Number.isFinite(value)
        ? null
        : { grade, min_percent: Math.max(0, Math.min(100, value)) };
    })
    .filter((band): band is { grade: number; min_percent: number } => band !== null);

  if (bands.length === 0) return { error: 'invalidNumber' };

  await updateExam(user.id, examId, { grade_bands: JSON.stringify(bands) });
  await persist();
  revalidatePath(`/exams/${examId}`, 'layout');
  return {};
}

export async function deleteExamAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await deleteExam(user.id, String(formData.get('exam_id') ?? ''));
  await persist();
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function archiveExamAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const archived = formData.get('archived') === '1' ? 1 : 0;
  await updateExam(user.id, examId, { archived });
  await persist();
  revalidatePath('/', 'layout');
}
