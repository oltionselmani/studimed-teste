import 'server-only';
import { structured } from './client';
import { StudyPlanSchema, StudySheetSchema, type StudyPlanOutput, type StudySheet } from './schemas';
import { HONESTY_RULES, examContext, languageInstruction } from './prompts';
import { chunkMaterials, fitToBudget, renderChunks, selectChunks } from './retrieval';
import type { Exam, Material, Mistake } from '@/lib/types';
import type { ReadinessResult } from '@/lib/engine/readiness';

/**
 * Builds a concise, course-specific study sheet for one topic.
 *
 * The material is drawn from the student's own uploads plus the mistakes they
 * actually made — not from a generic explanation of the topic.
 */
export async function generateStudySheet(params: {
  exam: Exam;
  materials: Material[];
  topic: string;
  mastery: number | null;
  mistakes: Mistake[];
  locale: string;
}): Promise<StudySheet> {
  const chunks = chunkMaterials(params.materials.filter((m) => m.extraction_state === 'ready'));
  const query = `${params.topic} ${params.mistakes.map((m) => m.correct_concept).join(' ')}`;
  const selected = fitToBudget(selectChunks(chunks, query, 20), 35_000);

  if (selected.length === 0) throw new Error('NO_MATERIAL');

  return structured({
    schema: StudySheetSchema,
    effort: 'high',
    maxTokens: 24_000,
    cacheSystem: true,
    system: `${HONESTY_RULES}

Your task: write a study sheet for one topic, for a student who is preparing for an exam and has limited time.

${languageInstruction(params.locale)}

Rules for this task:
- Build it from the excerpts provided. Where the course material uses a particular definition, notation or example, use theirs, not a textbook's.
- Be concise. This is a revision sheet that gets printed and used, not a chapter. Prefer the twelve things that matter to the forty things that are true.
- common_mistakes must be grounded in the student's actual recorded mistakes where they are given, and in the material otherwise.
- worked_examples must be fully worked, with the reasoning visible, not just the answer.
- active_recall questions are for self-testing from memory; mini_quiz questions are short and checkable.
- source_note names which of the student's files this was built from.
- If the material does not cover something important about this topic, say so in the summary rather than filling it in from elsewhere.`,
    content: [
      {
        type: 'text',
        text: `${examContext(params.exam)}

Topic: ${params.topic}
${params.mastery !== null ? `The student's measured mastery of this topic is ${Math.round(params.mastery * 100)}%.` : 'This topic has not been tested yet.'}

${
  params.mistakes.length > 0
    ? `Mistakes this student has actually made on this topic:\n${params.mistakes
        .slice(0, 10)
        .map((m) => `- Question: ${m.question_prompt.slice(0, 200)}\n  Their answer: ${m.user_answer.slice(0, 200) || '(blank)'}\n  Missing concept: ${m.correct_concept}`)
        .join('\n')}`
    : 'No recorded mistakes on this topic yet.'
}

Course material excerpts for this topic:

${renderChunks(selected)}`,
      },
    ],
  });
}

/**
 * Turns the deterministic readiness picture into a day-by-day plan.
 *
 * The priorities are decided in code from measured mastery; the model is asked
 * only to turn that ordering into concrete, time-boxed work. It is explicitly
 * not allowed to reorder the priorities or to promise an outcome.
 */
export async function generateStudyPlan(params: {
  exam: Exam;
  readiness: ReadinessResult;
  priorities: { topic: string; mastery: number | null }[];
  mistakes: Mistake[];
  topicNames: string[];
  horizonDays: number;
  locale: string;
  otherExams: { course: string; date: string; days: number }[];
}): Promise<StudyPlanOutput> {
  const { readiness } = params;

  return structured({
    schema: StudyPlanSchema,
    effort: 'high',
    maxTokens: 24_000,
    system: `${HONESTY_RULES}

Your task: turn a measured readiness picture into a concrete day-by-day study plan.

${languageInstruction(params.locale)}

Rules for this task:
- The priority order is given to you and is not yours to change. It comes from measured results.
- Every task must be concrete and time-boxed: what to study, for how long, and how the student will know it worked. "Revise graphs" is a bad task. "Work 12 shortest-path problems, target 9 correct" is a good one.
- Each day should hold 2 to 5 tasks and a realistic total. Do not plan 8-hour days.
- Include a testing task at least every other day — the plan has to produce new measurements or it cannot adapt.
- Include mistake review where the student has recorded mistakes.
- The last day before the exam is consolidation and a final mock, not new material.
- avoid lists topics already strong enough for the target, with a one-line reason.
- rationale explains the shape of the plan in a few sentences, referring to the student's actual numbers.
- Never promise a grade or state a probability of reaching the target.
- Where other exams are close, account for them rather than pretending this exam is the only one.`,
    content: [
      {
        type: 'text',
        text: `${examContext(params.exam)}

Measured position (all figures from the student's own completed tests):
- Days remaining: ${readiness.timeLeft.days} (${readiness.timeLeft.hours} hours)
- Completed practice tests: ${readiness.gradedAttempts}
- Recent weighted practice average: ${readiness.recentAveragePercent === null ? 'none yet' : `${Math.round(readiness.recentAveragePercent)}%`}
- Performance the target grade requires: ${readiness.requiredExamPercent === null ? 'unknown' : `${Math.round(readiness.requiredExamPercent)}%`}
- Topic coverage: ${readiness.coverage === null ? 'unknown' : `${Math.round(readiness.coverage * 100)}% (${readiness.topicsTested} of ${readiness.topicsTotal} topics tested)`}
- Consistency across recent tests: ${readiness.consistency === null ? 'not measurable yet' : `${Math.round(readiness.consistency * 100)}%`}
- Readiness band: ${readiness.band}

Priority order (fixed — highest priority first):
${params.priorities.map((p, i) => `${i + 1}. ${p.topic} — ${p.mastery === null ? 'never tested' : `${Math.round(p.mastery * 100)}% mastery`}`).join('\n')}

Topics never tested: ${readiness.untestedTopics.join(', ') || 'none'}
Topics already strong: ${readiness.strongTopics.map((t) => `${t.topic} (${Math.round(t.mastery * 100)}%)`).join(', ') || 'none'}

${
  params.mistakes.length > 0
    ? `Open mistakes to work back in:\n${params.mistakes.slice(0, 12).map((m) => `- [${m.topic_name}] ${m.correct_concept.slice(0, 160)}`).join('\n')}`
    : 'No open mistakes recorded.'
}

${
  params.otherExams.length > 0
    ? `Other exams competing for the same days:\n${params.otherExams.map((e) => `- ${e.course} in ${e.days} days (${e.date})`).join('\n')}`
    : 'No other exams are close.'
}

Plan day_index 0 as today, covering ${params.horizonDays} days.`,
      },
    ],
  });
}
