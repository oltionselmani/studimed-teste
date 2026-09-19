'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { persist } from '@/lib/db';
import {
  getExam,
  listExams,
  listMastery,
  listTopics,
  loadExamSnapshot,
  prioritiseTopics,
} from '@/lib/data/exams';
import { listMaterials } from '@/lib/data/materials';
import {
  deleteStudySheet,
  listMistakes,
  savePlan,
  saveStudySheet,
  setMistakeStatus,
  toggleTask,
} from '@/lib/data/study';
import { generateStudyPlan, generateStudySheet } from '@/lib/ai/study';
import { aiAvailable } from '@/lib/ai/client';
import { timeLeftUntil } from '@/lib/engine/readiness';
import { errorCode, type ActionResult } from './errors';
import type { Mistake } from '@/lib/types';

/**
 * Builds the study plan.
 *
 * The priority ordering is computed from measured mastery before the model is
 * called, and is passed in as fixed. The model turns it into scheduled work; it
 * does not decide what matters.
 */
export async function generatePlanAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const snapshot = await loadExamSnapshot(user.id, examId);
  if (!snapshot) return { error: 'notFound' };
  if (!(await aiAvailable())) return { error: 'aiUnavailable' };

  const { exam, readiness, topics, mastery } = snapshot;
  if (readiness.gradedAttempts === 0) return { error: 'noQuestions' };

  const priorities = prioritiseTopics(topics, mastery, 6);
  const mistakes = (await listMistakes(user.id, examId)).filter(
    (mistake) => mistake.status !== 'resolved',
  );

  const otherExams = (await listExams(user.id))
    .filter((other) => other.id !== examId)
    .map((other) => ({
      course: other.course_name,
      date: other.exam_date,
      days: timeLeftUntil(other).days,
    }))
    .filter((other) => other.days >= 0 && other.days <= 21);

  const horizonDays = Math.max(1, Math.min(14, readiness.timeLeft.days + 1));

  try {
    const output = await generateStudyPlan({
      exam,
      readiness,
      priorities,
      mistakes,
      topicNames: topics.map((topic) => topic.name),
      horizonDays,
      locale: user.locale,
      otherExams,
    });

    const lastGraded = snapshot.attempts
      .filter((attempt) => attempt.status === 'graded')
      .sort((a, b) => (a.graded_at ?? '').localeCompare(b.graded_at ?? ''))
      .at(-1);

    await savePlan({
      userId: user.id,
      examId,
      basedOnAttempt: lastGraded?.id ?? null,
      horizonDays,
      priorities,
      output,
    });

    await persist();
    revalidatePath(`/exams/${examId}`, 'layout');
    return { ok: true };
  } catch (error) {
    return { error: errorCode(error) };
  }
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const examId = await toggleTask(user.id, String(formData.get('task_id') ?? ''));
  await persist();
  if (examId) revalidatePath(`/exams/${examId}/plan`);
}

export async function generateStudySheetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const topic = String(formData.get('topic') ?? '').trim();
  if (!topic) return { error: 'requiredField' };

  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };
  if (!(await aiAvailable())) return { error: 'aiUnavailable' };

  const [materials, mastery, mistakes] = await Promise.all([
    listMaterials(examId),
    listMastery(examId),
    listMistakes(user.id, examId),
  ]);

  const topicMastery = mastery.find((row) => row.topic_name === topic)?.mastery ?? null;
  const topicMistakes: Mistake[] = mistakes.filter(
    (mistake) => mistake.topic_name === topic && mistake.status !== 'resolved',
  );

  try {
    const sheet = await generateStudySheet({
      exam,
      materials,
      topic,
      mastery: topicMastery,
      mistakes: topicMistakes,
      locale: user.locale,
    });

    const sheetId = await saveStudySheet({
      userId: user.id,
      examId,
      topic,
      title: topic,
      language: user.locale,
      sheet,
    });

    await persist();
    revalidatePath(`/exams/${examId}`, 'layout');
    return { ok: true, redirectTo: `/print/study/${sheetId}` };
  } catch (error) {
    return { error: errorCode(error) };
  }
}

export async function deleteStudySheetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  await deleteStudySheet(user.id, String(formData.get('sheet_id') ?? ''));
  await persist();
  revalidatePath(`/exams/${examId}/plan`);
}

export async function setMistakeStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const status = String(formData.get('status') ?? 'open');
  await setMistakeStatus(
    user.id,
    String(formData.get('mistake_id') ?? ''),
    status === 'resolved' ? 'resolved' : 'open',
  );
  await persist();
  revalidatePath(`/exams/${examId}/mistakes`);
}

export async function listTopicNames(examId: string): Promise<string[]> {
  return (await listTopics(examId)).map((topic) => topic.name);
}
