import type { Material } from '@/lib/types';

/**
 * Cost control.
 *
 * Course material is split once into overlapping chunks, and only the chunks
 * that actually match what is being generated are sent to the model. A 200-page
 * lecture set therefore costs a few thousand tokens per question batch instead
 * of the whole document, every time.
 *
 * Scoring is a small BM25-style ranker over term frequencies. That is enough to
 * pull "the pages about graph traversal" out of a course pack, and it needs no
 * embedding API, no vector store, and no extra round trip.
 */

export interface Chunk {
  id: string;
  materialId: string;
  /** Human-readable origin, e.g. "lecture_05.pdf (part 3)". */
  reference: string;
  kind: string;
  text: string;
}

const CHUNK_SIZE = 1_800;
const CHUNK_OVERLAP = 200;

export function chunkMaterials(materials: Material[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const material of materials) {
    const text = material.text_content.trim();
    if (!text) continue;

    if (text.length <= CHUNK_SIZE) {
      chunks.push({
        id: `${material.id}:0`,
        materialId: material.id,
        reference: material.filename,
        kind: material.kind,
        text,
      });
      continue;
    }

    let start = 0;
    let part = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + CHUNK_SIZE);
      // Prefer to break on a paragraph or sentence boundary.
      let cut = end;
      if (end < text.length) {
        const window = text.slice(start, end);
        const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '));
        if (breakAt > CHUNK_SIZE * 0.5) cut = start + breakAt + 1;
      }
      chunks.push({
        id: `${material.id}:${part}`,
        materialId: material.id,
        reference: `${material.filename} (${part + 1})`,
        kind: material.kind,
        text: text.slice(start, cut).trim(),
      });
      part += 1;
      start = cut - CHUNK_OVERLAP;
      if (start <= 0 || cut >= text.length) break;
    }
  }
  return chunks;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has',
  'dhe', 'për', 'per', 'një', 'nje', 'është', 'eshte', 'janë', 'jane', 'nga', 'me', 'te', 'të',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_+-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/** Ranks chunks against a query and returns the best ones, highest first. */
export function selectChunks(chunks: Chunk[], query: string, limit: number): Chunk[] {
  if (chunks.length === 0) return [];
  const terms = tokenize(query);
  if (terms.length === 0) return chunks.slice(0, limit);

  const documentFrequency = new Map<string, number>();
  const tokenized = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    const unique = new Set(tokens);
    for (const token of unique) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
    return tokens;
  });

  const total = chunks.length;
  const averageLength =
    tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(1, total);

  const scored = chunks.map((chunk, index) => {
    const tokens = tokenized[index];
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of terms) {
      const frequency = counts.get(term);
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 1;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      const normalised =
        (frequency * 2.2) /
        (frequency + 1.2 * (0.25 + 0.75 * (tokens.length / Math.max(1, averageLength))));
      score += idf * normalised;
    }
    // A slight preference for material the student labelled as an exam.
    if (chunk.kind === 'previous_exam' || chunk.kind === 'practice_exam') score *= 1.15;
    return { chunk, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}

/** Takes an even spread across the whole corpus — used for the first analysis pass. */
export function sampleChunks(chunks: Chunk[], limit: number): Chunk[] {
  if (chunks.length <= limit) return chunks;
  const step = chunks.length / limit;
  const picked: Chunk[] = [];
  for (let i = 0; i < limit; i += 1) picked.push(chunks[Math.floor(i * step)]);
  return picked;
}

/** Renders chunks for a prompt with their source reference attached. */
export function renderChunks(chunks: Chunk[]): string {
  return chunks
    .map((chunk) => `<excerpt source="${chunk.reference}">\n${chunk.text}\n</excerpt>`)
    .join('\n\n');
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

/** Trims a chunk list so the rendered prompt stays under a token budget. */
export function fitToBudget(chunks: Chunk[], tokenBudget: number): Chunk[] {
  const kept: Chunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const cost = approxTokens(chunk.text) + 20;
    if (used + cost > tokenBudget) break;
    kept.push(chunk);
    used += cost;
  }
  return kept.length > 0 ? kept : chunks.slice(0, 1);
}
