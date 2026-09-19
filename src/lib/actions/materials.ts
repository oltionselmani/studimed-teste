'use server';

import { readFile } from 'node:fs/promises';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { persist } from '@/lib/db';
import { getExam, replaceTopics, setAnalysisState } from '@/lib/data/exams';
import {
  MAX_UPLOAD_BYTES,
  deleteMaterial,
  listMaterials,
  replaceResearchSources,
  savePreviousExamAnalysis,
  saveMaterial,
} from '@/lib/data/materials';
import { analyseCourseMaterial, analysePreviousExams, type MaterialImage } from '@/lib/ai/analysis';
import { researchPreviousExams } from '@/lib/ai/research';
import { AiInvalidOutputError, AiUnavailableError, aiAvailable } from '@/lib/ai/client';
import { extensionOf, isImage } from '@/lib/extract';
import { errorCode } from './errors';
import type { ActionResult } from './errors';
import type { MaterialKind } from '@/lib/types';

const IMAGE_MEDIA: Record<string, MaterialImage['mediaType']> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function uploadMaterialsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };

  const kind = (String(formData.get('kind') ?? 'lecture') || 'lecture') as MaterialKind;
  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return { error: 'requiredField' };

  let saved = 0;
  const problems: string[] = [];

  for (const file of files) {
    if (file.size === 0) continue;
    try {
      await saveMaterial({
        userId: user.id,
        examId,
        filename: file.name,
        mime: file.type,
        kind,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
      saved += 1;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'FILE_TOO_LARGE') {
        problems.push(`${file.name}: over ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
      } else if (code === 'UNSUPPORTED_FORMAT') {
        problems.push(`${file.name}: unsupported format`);
      } else {
        problems.push(`${file.name}: could not be read`);
      }
    }
  }

  await persist();
  revalidatePath(`/exams/${examId}`, 'layout');

  if (saved === 0) return { error: 'upload', detail: problems.join('\n') };
  return { ok: true, detail: problems.length > 0 ? problems.join('\n') : undefined };
}

export async function deleteMaterialAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const examId = await deleteMaterial(user.id, String(formData.get('material_id') ?? ''));
  await persist();
  if (examId) revalidatePath(`/exams/${examId}`, 'layout');
}

/**
 * Reads the uploads and extracts the course structure. On failure the previous
 * analysis is left untouched and the error is reported — the app never falls
 * back to a generic topic list for a course it has not read.
 */
export async function analyseCourseAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };

  if (!(await aiAvailable())) return { error: 'aiUnavailable' };

  const materials = await listMaterials(examId);
  const readable = materials.filter((material) => material.extraction_state === 'ready');
  const imageFiles = materials.filter((material) => isImage(material.filename));
  if (readable.length === 0 && imageFiles.length === 0) return { error: 'noMaterial' };

  const images: MaterialImage[] = [];
  for (const material of imageFiles.slice(0, 12)) {
    const mediaType = IMAGE_MEDIA[extensionOf(material.filename)];
    if (!mediaType) continue;
    try {
      images.push({
        filename: material.filename,
        mediaType,
        data: (await readFile(material.storage_path)).toString('base64'),
      });
    } catch {
      // A missing file on disk should not abort the whole analysis.
    }
  }

  await setAnalysisState(examId, 'pending');
  await persist();

  try {
    const analysis = await analyseCourseMaterial(exam, readable, exam.language, images);
    await replaceTopics(
      examId,
      analysis.topics.map((topic) => ({
        name: topic.name,
        description: topic.description,
        importance: topic.importance,
        source_reference: topic.source_reference,
        items: topic.items,
      })),
    );
    await setAnalysisState(examId, 'ready');
    await persist();
    revalidatePath(`/exams/${examId}`, 'layout');
    return { ok: true, detail: analysis.coverage_note };
  } catch (error) {
    const code = errorCode(error);
    await setAnalysisState(examId, 'failed', code);
    await persist();
    revalidatePath(`/exams/${examId}`, 'layout');
    return { error: code };
  }
}

export async function analysePreviousExamsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };
  if (!(await aiAvailable())) return { error: 'aiUnavailable' };

  const materials = await listMaterials(examId);
  const papers = materials.filter(
    (material) =>
      (material.kind === 'previous_exam' || material.kind === 'practice_exam') &&
      material.extraction_state === 'ready',
  );
  if (papers.length === 0) return { error: 'noMaterial' };

  try {
    const analysis = await analysePreviousExams(exam, papers, exam.language);
    await savePreviousExamAnalysis(examId, JSON.stringify(analysis));
    await persist();
    revalidatePath(`/exams/${examId}`, 'layout');
    return { ok: true };
  } catch (error) {
    return { error: errorCode(error) };
  }
}

/**
 * Runs a real web search for publicly available previous-exam information.
 * An empty result is reported as "nothing found", never as "none exist".
 */
export async function researchPreviousExamsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };
  if (!(await aiAvailable())) return { error: 'aiUnavailable' };

  try {
    const { findings } = await researchPreviousExams(exam);
    await replaceResearchSources(examId, findings.findings);
    await persist();
    revalidatePath(`/exams/${examId}`, 'layout');
    return {
      ok: true,
      message: findings.found_previous_exams ? undefined : 'researchNoResults',
      detail: findings.conclusion,
    };
  } catch (error) {
    return { error: errorCode(error) };
  }
}
