'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { persist } from '@/lib/db';
import {
  getAttempt,
  listQuestions,
  listScanPages,
  saveAnswer,
  setDelivery,
} from '@/lib/data/attempts';
import { deleteScanPage, markScanPage, saveScanPage } from '@/lib/data/scans';
import { readScanPage } from '@/lib/ai/scan';
import { aiAvailable } from '@/lib/ai/client';
import { getExam } from '@/lib/data/exams';
import type { ActionResult } from './errors';

export async function uploadScanPagesAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const attemptId = String(formData.get('attempt_id') ?? '');
  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) return { error: 'notFound' };

  const files = formData.getAll('pages').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return { error: 'requiredField' };

  let saved = 0;
  for (const file of files) {
    if (file.size === 0) continue;
    try {
      await saveScanPage({
        userId: user.id,
        attemptId,
        filename: file.name || `page-${Date.now()}.jpg`,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
      saved += 1;
    } catch {
      // Report per-file failures together rather than aborting the batch.
    }
  }

  await setDelivery(user.id, attemptId, 'scan');
  await persist();
  revalidatePath(`/attempts/${attemptId}/scan`);
  return saved > 0 ? { ok: true } : { error: 'uploadUnsupported' };
}

export async function deleteScanPageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const attemptId = await deleteScanPage(user.id, String(formData.get('page_id') ?? ''));
  await persist();
  if (attemptId) revalidatePath(`/attempts/${attemptId}/scan`);
}

/**
 * Reads every uploaded page and records what was found, together with how
 * confident the reading was. Nothing is graded here — the student reviews and
 * corrects the transcription first.
 */
export async function readScanPagesAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const attemptId = String(formData.get('attempt_id') ?? '');
  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) return { error: 'notFound' };
  if (!(await aiAvailable())) return { error: 'aiUnavailable' };

  const exam = await getExam(user.id, attempt.exam_id);
  if (!exam) return { error: 'notFound' };

  const [pages, questions] = await Promise.all([
    listScanPages(attemptId),
    listQuestions(attemptId),
  ]);
  if (pages.length === 0) return { error: 'requiredField' };

  const byPosition = new Map(questions.map((question) => [question.position, question]));
  let failures = 0;

  for (const page of pages) {
    try {
      const read = await readScanPage({
        storagePath: page.storage_path,
        pageIndex: page.page_index,
        totalPages: pages.length,
        questions,
        locale: exam.language,
      });

      if (!read.page_readable) {
        await markScanPage(page.id, 'failed', read.page_note);
        failures += 1;
        continue;
      }

      for (const entry of read.answers) {
        const question = byPosition.get(entry.question_number);
        if (!question) continue;

        const options: string[] = question.options_json ? JSON.parse(question.options_json) : [];
        let selectedOption: number | null = null;
        if (options.length > 0 && entry.selected_option_letter) {
          const index = entry.selected_option_letter.trim().toUpperCase().charCodeAt(0) - 65;
          if (index >= 0 && index < options.length) selectedOption = index;
        }

        await saveAnswer({
          userId: user.id,
          attemptId,
          questionId: question.id,
          responseText: entry.transcription,
          selectedOption,
          inputSource: 'scan',
          scanConfidence: entry.confidence,
          scanRaw: entry.transcription,
          scanPage: page.page_index,
        });
      }

      await markScanPage(page.id, 'read', read.page_note);
    } catch (error) {
      await markScanPage(page.id, 'failed', '');
      failures += 1;
      console.error('[examos] scan page failed:', error);
    }
  }

  await persist();
  revalidatePath(`/attempts/${attemptId}/scan`);

  if (failures === pages.length) return { error: 'aiFailed' };
  return { ok: true, message: failures > 0 ? 'pageFailed' : undefined };
}

/** Lets the student fix a transcription before grading. */
export async function correctScanAnswerAction(input: {
  attemptId: string;
  questionId: string;
  responseText: string;
  selectedOption: number | null;
}): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await saveAnswer({
    userId: user.id,
    attemptId: input.attemptId,
    questionId: input.questionId,
    responseText: input.responseText,
    selectedOption: input.selectedOption,
    inputSource: 'scan_corrected',
    // A corrected answer is, by definition, no longer uncertain.
    scanConfidence: 'high',
  });
  await persist();
  return { ok: true };
}
