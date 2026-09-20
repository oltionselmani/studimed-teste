import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { all, one, run } from '@/lib/db';
import { uploadsDir } from '@/lib/db/paths';
import type { ScanPage } from '@/lib/types';

const ALLOWED = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'];

export async function saveScanPage(params: {
  userId: string;
  attemptId: string;
  filename: string;
  buffer: Buffer;
}): Promise<ScanPage> {
  const extension = params.filename.slice(params.filename.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED.includes(extension)) throw new Error('UNSUPPORTED_SCAN_FORMAT');

  const existing = await all<{ page_index: number }>(
    'SELECT page_index FROM scan_pages WHERE attempt_id = ? ORDER BY page_index DESC LIMIT 1',
    [params.attemptId],
  );
  const pageIndex = (existing[0]?.page_index ?? -1) + 1;

  const id = randomUUID();
  const directory = path.join(uploadsDir(), params.userId, 'scans', params.attemptId);
  await mkdir(directory, { recursive: true });
  const storagePath = path.join(directory, `${id}${extension}`);
  await writeFile(storagePath, params.buffer);

  await run(
    `INSERT INTO scan_pages (id, attempt_id, user_id, page_index, filename, storage_path, state, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'uploaded', '', ?)`,
    [
      id,
      params.attemptId,
      params.userId,
      pageIndex,
      params.filename,
      storagePath,
      new Date().toISOString(),
    ],
  );

  const saved = await one<ScanPage>('SELECT * FROM scan_pages WHERE id = ?', [id]);
  if (!saved) throw new Error('SAVE_FAILED');
  return saved;
}

export async function markScanPage(
  id: string,
  state: ScanPage['state'],
  note = '',
): Promise<void> {
  await run('UPDATE scan_pages SET state = ?, note = ? WHERE id = ?', [state, note, id]);
}

export async function deleteScanPage(userId: string, id: string): Promise<string | null> {
  const page = await one<ScanPage>('SELECT * FROM scan_pages WHERE id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  if (!page) return null;
  await run('DELETE FROM scan_pages WHERE id = ?', [id]);
  await unlink(page.storage_path).catch(() => undefined);
  return page.attempt_id;
}
