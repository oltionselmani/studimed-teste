import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { all, one, run } from '@/lib/db';
import { uploadsDir } from '@/lib/db/paths';
import { extractText, isSupported } from '@/lib/extract';
import type { Material, MaterialKind, PreviousExamRow, ResearchSource } from '@/lib/types';

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export async function listMaterials(examId: string): Promise<Material[]> {
  return all<Material>('SELECT * FROM materials WHERE exam_id = ? ORDER BY created_at ASC', [
    examId,
  ]);
}

export async function getMaterial(userId: string, materialId: string): Promise<Material | null> {
  return one<Material>('SELECT * FROM materials WHERE id = ? AND user_id = ?', [
    materialId,
    userId,
  ]);
}

/**
 * Stores an uploaded file outside the web root and extracts its text.
 *
 * Files are written under the private data directory and are only ever served
 * back through a route that re-checks ownership — there is no public URL.
 */
export async function saveMaterial(params: {
  userId: string;
  examId: string;
  filename: string;
  mime: string;
  kind: MaterialKind;
  buffer: Buffer;
}): Promise<Material> {
  if (params.buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error('FILE_TOO_LARGE');
  if (!isSupported(params.filename)) throw new Error('UNSUPPORTED_FORMAT');

  const id = randomUUID();
  const directory = path.join(uploadsDir(), params.userId, params.examId);
  await mkdir(directory, { recursive: true });

  const safeName = params.filename.replace(/[^\w.\- ]+/g, '_').slice(-120);
  const storagePath = path.join(directory, `${id}__${safeName}`);
  await writeFile(storagePath, params.buffer);

  const extracted = await extractText(params.buffer, params.filename);
  const now = new Date().toISOString();

  await run(
    `INSERT INTO materials (
       id, exam_id, user_id, filename, mime, size_bytes, kind, storage_path,
       text_content, char_count, page_count, extraction_state, extraction_error, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.examId,
      params.userId,
      params.filename,
      params.mime,
      params.buffer.byteLength,
      params.kind,
      storagePath,
      extracted.text,
      extracted.text.length,
      extracted.pageCount,
      extracted.state,
      extracted.error,
      now,
    ],
  );

  // A file the student labelled as a previous exam is registered as one, with
  // its provenance recorded as "you gave us this".
  if (params.kind === 'previous_exam' || params.kind === 'practice_exam') {
    await run(
      `INSERT INTO previous_exams (id, exam_id, material_id, title, year, source_type, source_url, source_note, analysis_json, created_at)
       VALUES (?, ?, ?, ?, '', 'user_upload', '', ?, '', ?)`,
      [
        randomUUID(),
        params.examId,
        id,
        params.filename,
        params.kind === 'practice_exam' ? 'Labelled as a practice exam by the student.' : 'Uploaded by the student.',
        now,
      ],
    );
  }

  const saved = await one<Material>('SELECT * FROM materials WHERE id = ?', [id]);
  if (!saved) throw new Error('SAVE_FAILED');
  return saved;
}

export async function deleteMaterial(userId: string, materialId: string): Promise<string | null> {
  const material = await getMaterial(userId, materialId);
  if (!material) return null;
  await run('DELETE FROM materials WHERE id = ? AND user_id = ?', [materialId, userId]);
  await unlink(material.storage_path).catch(() => undefined);
  return material.exam_id;
}

export async function listPreviousExams(examId: string): Promise<PreviousExamRow[]> {
  return all<PreviousExamRow>(
    'SELECT * FROM previous_exams WHERE exam_id = ? ORDER BY created_at ASC',
    [examId],
  );
}

export async function savePreviousExamAnalysis(examId: string, analysis: string): Promise<void> {
  await run(
    "UPDATE previous_exams SET analysis_json = ? WHERE exam_id = ? AND source_type = 'user_upload'",
    [analysis, examId],
  );
}

export async function listResearchSources(examId: string): Promise<ResearchSource[]> {
  return all<ResearchSource>(
    'SELECT * FROM research_sources WHERE exam_id = ? ORDER BY retrieved_at DESC',
    [examId],
  );
}

export async function replaceResearchSources(
  examId: string,
  sources: {
    title: string;
    url: string;
    relevance: ResearchSource['relevance'];
    note: string;
  }[],
): Promise<void> {
  await run('DELETE FROM research_sources WHERE exam_id = ?', [examId]);
  const now = new Date().toISOString();
  for (const source of sources) {
    await run(
      `INSERT INTO research_sources (id, exam_id, title, url, snippet, relevance, note, retrieved_at)
       VALUES (?, ?, ?, ?, '', ?, ?, ?)`,
      [randomUUID(), examId, source.title, source.url, source.relevance, source.note, now],
    );
  }

  // A source that genuinely is a past paper is registered as a previous exam,
  // with its URL kept so the student can verify it themselves.
  await run(
    "DELETE FROM previous_exams WHERE exam_id = ? AND source_type = 'verified_external'",
    [examId],
  );
  for (const source of sources.filter((entry) => entry.relevance === 'previous_exam')) {
    await run(
      `INSERT INTO previous_exams (id, exam_id, material_id, title, year, source_type, source_url, source_note, analysis_json, created_at)
       VALUES (?, ?, NULL, ?, '', 'verified_external', ?, ?, '', ?)`,
      [randomUUID(), examId, source.title, source.url, source.note, now],
    );
  }
}
