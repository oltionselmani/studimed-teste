import 'server-only';
import { readFile } from 'node:fs/promises';
import { structured } from './client';
import { ScanPageReadSchema, type ScanPageRead } from './schemas';
import { HONESTY_RULES } from './prompts';
import type { ContentBlock } from './client';
import type { Question } from '@/lib/types';

const IMAGE_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function mediaTypeFor(path: string) {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return IMAGE_TYPES[extension] ?? null;
}

/**
 * Reads one photographed or scanned exam page.
 *
 * The model is told to transcribe, not to interpret: it reports what is on the
 * paper and how confident it is, and an unreadable answer comes back as
 * "unreadable" rather than as a wrong answer. The student sees and corrects
 * every transcription before anything is graded.
 */
export async function readScanPage(params: {
  storagePath: string;
  pageIndex: number;
  totalPages: number;
  questions: Question[];
  locale: string;
}): Promise<ScanPageRead> {
  const { storagePath, questions } = params;

  const content: ContentBlock[] = [];
  const mediaType = mediaTypeFor(storagePath);
  const data = (await readFile(storagePath)).toString('base64');

  if (mediaType) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  } else if (storagePath.toLowerCase().endsWith('.pdf')) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data },
    });
  } else {
    throw new Error('UNSUPPORTED_SCAN_FORMAT');
  }

  const questionIndex = questions
    .map((question) => {
      const options = question.options_json ? (JSON.parse(question.options_json) as string[]) : [];
      const letters = options
        .map((option, index) => `${String.fromCharCode(65 + index)}) ${option}`)
        .join(' | ');
      return `Q${question.position}: [${question.type}] ${question.prompt.slice(0, 200)}${
        letters ? `\n   options: ${letters}` : ''
      }`;
    })
    .join('\n');

  content.push({
    type: 'text',
    text: `This is page ${params.pageIndex + 1} of ${params.totalPages} of a printed practice exam that the student answered by hand.

The printed questions on this exam are:
${questionIndex}

Transcribe the student's handwritten answers.

- Match each answer to its printed question number.
- transcription is exactly what is written. Do not correct spelling, do not complete unfinished sentences, do not fix wrong answers, do not fill in what you think they meant.
- For a multiple-choice answer, report the chosen letter in selected_option_letter (a circled letter, a tick, a written letter). If the choice is ambiguous, say so in note and use confidence "low".
- confidence: "high" if you can read it plainly; "medium" if you are reasonably sure; "low" if you are guessing at words; "unreadable" if you genuinely cannot make it out.
- Never guess in order to produce something. An honest "unreadable" is correct and is not penalised.
- If a question on this page has no answer written at all, do not return an entry for it.
- If the whole page is unusable (too blurry, cut off, upside down), set page_readable false and explain in page_note.`,
  });

  return structured({
    schema: ScanPageReadSchema,
    effort: 'high',
    maxTokens: 16_000,
    system: `${HONESTY_RULES}

Your task: transcribe handwritten answers from a photograph of an exam page. You are a transcriber, not a marker. Accuracy about what is on the page matters more than producing a complete-looking result.`,
    content,
  });
}
