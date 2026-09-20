import 'server-only';
import { structured } from './client';
import {
  GeneratedExamSchema,
  QuestionReviewSchema,
  type GeneratedQuestion,
} from './schemas';
import { HONESTY_RULES, examContext, languageInstruction } from './prompts';
import { chunkMaterials, fitToBudget, renderChunks, sampleChunks, selectChunks } from './retrieval';
import { mechanicalIssues, normaliseQuestion } from '@/lib/engine/question-validation';
import type { AttemptKind, Difficulty, Exam, Material } from '@/lib/types';

export interface GenerationRequest {
  exam: Exam;
  materials: Material[];
  locale: string;
  kind: AttemptKind;
  difficulty: Difficulty;
  questionCount: number;
  /** Topic names to concentrate on, weakest first. Empty means whole course. */
  focusTopics: string[];
  /** All topic names known for the course, so distribution can be sensible. */
  allTopics: string[];
  /** Mastery per topic (0..1) where measured, to calibrate difficulty. */
  mastery: Record<string, number>;
  /** Concepts the student has previously got wrong. */
  recurringMistakes: { topic: string; prompt: string; concept: string }[];
  /** Pattern analysis of provided previous exams, when it exists. */
  previousExamAnalysis: string | null;
  hasPreviousExams: boolean;
}

export interface GenerationResult {
  questions: GeneratedQuestion[];
  regenerated: number;
}

function kindBrief(kind: AttemptKind, request: GenerationRequest): string {
  switch (kind) {
    case 'diagnostic':
      return `A diagnostic exam. Spread the questions across the whole course so the result shows where the student genuinely stands. Cover as many of the listed topics as the question count allows, weighted by topic importance. Mix difficulties.`;
    case 'targeted':
      return `A targeted practice set. About 70% of the questions must address the focus topics below, testing them from several angles rather than repeating one idea. The remaining 30% keep the rest of the course alive.`;
    case 'mock':
      return `A full mock exam. Match a real university paper: a realistic mix of question types, a difficulty curve from approachable to demanding, and a topic distribution that follows topic importance${request.hasPreviousExams ? ' and the structure observed in the provided previous papers' : ''}. Include at least one substantial multi-part problem.`;
    case 'mistake_review':
      return `A re-test built on the student's recorded mistakes. Most questions must attack the listed missed concepts from a different angle than the original question — not the same question reworded. Add a few questions on neighbouring material to check the understanding actually transferred.`;
  }
}

function difficultyBrief(difficulty: Difficulty, hasPreviousExams: boolean): string {
  switch (difficulty) {
    case 'easy':
      return 'Difficulty: recall and direct application. The student is building confidence.';
    case 'medium':
      return 'Difficulty: standard coursework level — application and short reasoning.';
    case 'hard':
      return 'Difficulty: demanding. Multi-step reasoning, edge cases, and questions that separate memorisation from understanding.';
    case 'university':
      return 'Difficulty: a real university exam. Mostly application and analysis, with a few straightforward marks at the start and one or two genuinely hard questions.';
    case 'previous_exam_style':
      return hasPreviousExams
        ? 'Difficulty and style: follow the structure, question formats and difficulty observed in the provided previous papers. You are matching their style, NOT predicting the next paper. Never state or imply that a question appeared in a real exam.'
        : 'Difficulty: a real university exam.';
  }
}

function typeGuidance(exam: Exam): string {
  const text = `${exam.course_name} ${exam.program} ${exam.notes}`.toLowerCase();
  const computing = /comput|program|software|algorithm|data struct|inxhinieri|shkenca kompjuterike|informatik/.test(
    text,
  );
  if (computing) {
    return `This is a computing course. Do not reduce it to multiple choice. Include code reading, debugging, algorithm design or tracing, and complexity reasoning wherever the material supports it. At most a third of the questions may be multiple_choice or true_false.`;
  }
  return `Choose question types that fit how this subject is actually examined. At most half the questions may be multiple_choice or true_false, and only where that format genuinely tests understanding.`;
}

/**
 * Builds the retrieval query so the excerpts sent to the model are the ones
 * that matter for this particular test, rather than the whole course.
 */
function buildQuery(request: GenerationRequest): string {
  const parts = [request.exam.course_name];
  parts.push(...request.focusTopics);
  if (request.focusTopics.length === 0) parts.push(...request.allTopics);
  parts.push(...request.recurringMistakes.map((m) => `${m.topic} ${m.concept}`));
  return parts.join(' ');
}

export async function generateQuestions(request: GenerationRequest): Promise<GenerationResult> {
  const ready = request.materials.filter((m) => m.extraction_state === 'ready');
  const chunks = chunkMaterials(ready);
  if (chunks.length === 0) throw new Error('NO_MATERIAL');

  const query = buildQuery(request);
  const ranked = selectChunks(chunks, query, 40);
  // Always keep a little breadth so a targeted test is not blind to the rest.
  const breadth = sampleChunks(
    chunks.filter((chunk) => !ranked.some((r) => r.id === chunk.id)),
    10,
  );
  const selected = fitToBudget([...ranked, ...breadth], 55_000);

  const masteryLines = Object.entries(request.mastery)
    .map(([topic, value]) => `- ${topic}: ${Math.round(value * 100)}% mastery`)
    .join('\n');

  const mistakeLines = request.recurringMistakes
    .slice(0, 15)
    .map((m) => `- [${m.topic}] ${m.prompt} — missing concept: ${m.concept}`)
    .join('\n');

  const system = `${HONESTY_RULES}

Your task: write a practice exam from the student's own course material.

${languageInstruction(request.locale)}

${typeGuidance(request.exam)}

Source labelling is mandatory and must be literally true:
- "course_material" — the question is built on a specific excerpt. Put that excerpt's source name in source_reference.
- "previous_exam" — ONLY when the excerpt itself is from a previous exam paper the student provided, and the question tests the same thing that paper tested.
- "verified_external" — only if you were handed a checked external source. You were not, so do not use it.
- "ai_generated" — you wrote it yourself using the course material as background. Say so in source_basis.
Never use a professor's name, a university's name or a year to make a question look official.

Quality bar, applied to every question before you return it:
- It must be answerable from the course material, and the expected answer must be correct.
- The wording must be unambiguous and read like an exam, not like a chatbot. No "which of the following best describes", no "as an AI", no meta-commentary.
- grading_criteria must be markable points a human could apply.
- No two questions may test the same idea in the same way.
- points and answer_lines must match the real size of the answer.
- For multiple_choice, the distractors must be plausible to someone who half-understands the topic. correct_option is the zero-based index; for true_false use options ["True","False"] translated into the output language, with correct_option 0 or 1. For every other type, options is [] and correct_option is -1.`;

  const brief = `${examContext(request.exam)}

${kindBrief(request.kind, request)}
${difficultyBrief(request.difficulty, request.hasPreviousExams)}

Write exactly ${request.questionCount} questions.

Topics in this course (from the analysis of the student's material):
${request.allTopics.map((topic) => `- ${topic}`).join('\n') || '- (none recorded)'}

${request.focusTopics.length > 0 ? `Focus topics for this test, weakest first:\n${request.focusTopics.map((t) => `- ${t}`).join('\n')}` : 'No focus topics — cover the course broadly.'}

${masteryLines ? `Measured mastery from the student's previous tests:\n${masteryLines}` : 'The student has no measured mastery yet.'}

${mistakeLines ? `Concepts this student has previously got wrong:\n${mistakeLines}` : ''}

${request.previousExamAnalysis ? `Observed patterns in the previous exam papers the student provided:\n${request.previousExamAnalysis}\n\nUse these to shape structure and style. Do not claim any question came from a real exam.` : 'No previous exam papers are available for this course.'}

Course material excerpts:

${renderChunks(selected)}`;

  const first = await structured({
    schema: GeneratedExamSchema,
    effort: 'high',
    maxTokens: 64_000,
    cacheSystem: true,
    system,
    content: [{ kind: 'text', text: brief }],
  });

  let questions = normalise(first.questions, request);
  let regenerated = 0;

  // ---- Quality gate --------------------------------------------------------
  const failures = await reviewQuestions(questions, request);
  if (failures.length > 0) {
    const kept = questions.filter((_, index) => !failures.some((f) => f.index === index));
    const replacement = await structured({
      schema: GeneratedExamSchema,
      effort: 'high',
      maxTokens: 32_000,
      cacheSystem: true,
      system,
      content: [
        {
          kind: 'text',
          text: `${brief}

The following ${failures.length} question(s) failed review and must be replaced. Write exactly ${failures.length} NEW questions covering the same topics, avoiding the problems listed and avoiding duplication with the questions that were kept.

Rejected questions and why:
${failures.map((f) => `- "${questions[f.index]?.prompt.slice(0, 160)}…" → ${f.problems.join('; ')}`).join('\n')}

Questions being kept (do not duplicate these):
${kept.map((q) => `- ${q.prompt.slice(0, 140)}`).join('\n')}`,
        },
      ],
    });
    regenerated = failures.length;
    questions = [...kept, ...normalise(replacement.questions, request)].slice(
      0,
      request.questionCount,
    );
  }

  if (questions.length === 0) throw new Error('NO_QUESTIONS');
  return { questions, regenerated };
}

/**
 * A second pass in which the model checks its own output against the quality
 * bar. Mechanical checks (duplicates, missing answers, bad option indexes) are
 * done in code first — no point spending tokens on those.
 */
async function reviewQuestions(
  questions: GeneratedQuestion[],
  request: GenerationRequest,
): Promise<{ index: number; problems: string[] }[]> {
  const mechanical = mechanicalIssues(questions);

  const survivors = questions
    .map((question, index) => ({ question, index }))
    .filter(({ index }) => !mechanical.some((m) => m.index === index));

  if (survivors.length === 0) return mechanical;

  const review = await structured({
    schema: QuestionReviewSchema,
    effort: 'medium',
    maxTokens: 16_000,
    system: `${HONESTY_RULES}

Your task: review generated exam questions and reject the bad ones. Be strict — a bad question wastes the student's remaining study time.

Reject a question when any of these is true:
- the expected answer is wrong, or does not actually answer the question asked
- the question is ambiguous, or could be read two ways
- it is trivial, or tests nothing beyond reading the question
- it does not belong to the topic it claims
- it is unrelated to a course of this description
- it obviously duplicates another question in the list
- it reads as machine-written rather than as an exam question
- for a choice question, more than one option is defensible, or none is

Return one entry per question you were given, using the index provided.`,
    content: [
      {
        kind: 'text',
        text: `Course: ${request.exam.course_name}
Topics in this course: ${request.allTopics.join(', ') || '(none recorded)'}

Questions to review:

${survivors
  .map(
    ({ question, index }) => `<question index="${index}">
type: ${question.type}
topic: ${question.topic_name}
prompt: ${question.prompt}
${question.code_block ? `code:\n${question.code_block}\n` : ''}${question.options.length ? `options: ${question.options.map((o, i) => `[${i}] ${o}`).join(' | ')}\ncorrect_option: ${question.correct_option}\n` : ''}expected_answer: ${question.expected_answer}
grading_criteria: ${question.grading_criteria}
</question>`,
  )
  .join('\n\n')}`,
      },
    ],
  });

  const modelFailures = review.reviews
    .filter((entry) => !entry.passes && entry.index < questions.length)
    .map((entry) => ({ index: entry.index, problems: entry.problems }));

  return [...mechanical, ...modelFailures];
}

function normalise(
  questions: GeneratedQuestion[],
  request: GenerationRequest,
): GeneratedQuestion[] {
  return questions.map((question) => normaliseQuestion(question, request.allTopics));
}
