import 'server-only';
import { structured } from './client';
import {
  CourseAnalysisSchema,
  PreviousExamAnalysisSchema,
  type CourseAnalysis,
  type PreviousExamAnalysis,
} from './schemas';
import { HONESTY_RULES, examContext, languageInstruction } from './prompts';
import { chunkMaterials, fitToBudget, renderChunks, sampleChunks } from './retrieval';
import type { AiBlock } from './client';
import type { Exam, Material } from '@/lib/types';

/** A photographed page or slide, passed to the model's vision. */
export interface MaterialImage {
  filename: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;
}

/**
 * Reads the student's uploads and returns the structure of the course: topics,
 * and under each of them the definitions, formulas, algorithms and terminology
 * the material actually contains. Every item carries the filename it came from.
 */
export async function analyseCourseMaterial(
  exam: Exam,
  materials: Material[],
  locale: string,
  images: MaterialImage[] = [],
): Promise<CourseAnalysis> {
  const chunks = chunkMaterials(materials.filter((m) => m.extraction_state === 'ready'));
  // A wide, even sample of the corpus: the goal here is structure, not detail.
  const selected = fitToBudget(sampleChunks(chunks, 60), 45_000);

  const fileList = materials
    .map((m) => `- ${m.filename} (${m.kind}, ${m.char_count} chars)`)
    .join('\n');

  // Photographed notes and slide images carry no extractable text, so they go
  // to the model as images alongside the excerpts.
  const content: AiBlock[] = [];
  for (const image of images.slice(0, 12)) {
    content.push({ kind: 'text', text: `Image from ${image.filename}:` });
    content.push({ kind: 'image', mediaType: image.mediaType, data: image.data });
  }

  if (selected.length === 0 && content.length === 0) throw new Error('NO_MATERIAL');

  return structured({
    schema: CourseAnalysisSchema,
    effort: 'high',
    maxTokens: 32_000,
    cacheSystem: true,
    system: `${HONESTY_RULES}

Your task: extract the structure of a university course from the student's own uploaded material.

${languageInstruction(locale)}

Rules for this task:
- Every topic must be visibly present in the excerpts. Do not add topics that "usually" belong to a course with this name.
- importance reflects how much of the provided material is devoted to the topic, nothing else.
- source_reference must be one of the excerpt source names given to you.
- coverage_note must state plainly what the uploads appear to cover and what they seem to be missing.`,
    content: [
      ...content,
      {
        kind: 'text',
        text: `${examContext(exam)}

Files the student uploaded:
${fileList}

${selected.length > 0 ? `Excerpts from those files:\n\n${renderChunks(selected)}` : 'No extractable text — work from the images above.'}`,
      },
    ],
  });
}

/** Analyses previous exams the student actually provided. Never invents papers. */
export async function analysePreviousExams(
  exam: Exam,
  previousExamMaterials: Material[],
  locale: string,
): Promise<PreviousExamAnalysis> {
  const chunks = chunkMaterials(previousExamMaterials);
  const selected = fitToBudget(sampleChunks(chunks, 40), 40_000);

  return structured({
    schema: PreviousExamAnalysisSchema,
    effort: 'high',
    maxTokens: 16_000,
    cacheSystem: true,
    system: `${HONESTY_RULES}

Your task: describe the observable patterns in the previous exam papers the student provided.

${languageInstruction(locale)}

Rules for this task:
- Describe only what is in these papers. Counts and percentages must be countable from the excerpts.
- Write every note as an observation about these papers, never as a prediction about the next one.
- If the excerpts are too thin to judge something, say so in that field rather than estimating.`,
    content: [
      {
        kind: 'text',
        text: `${examContext(exam)}

Previous exam papers provided by the student:

${renderChunks(selected)}`,
      },
    ],
  });
}
