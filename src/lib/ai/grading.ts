import 'server-only';
import { structured } from './client';
import { AnswerEvaluationSchema } from './schemas';
import { HONESTY_RULES, languageInstruction } from './prompts';
import type { Answer, Question, Verdict } from '@/lib/types';

export interface GradedAnswer {
  questionId: string;
  verdict: Verdict;
  awardedPoints: number;
  feedback: string;
  correctConcept: string;
  evaluatedBy: 'deterministic' | 'ai';
}

/**
 * Choice questions are graded in code. There is no reason to spend a model
 * call — or to introduce any uncertainty — on comparing two integers.
 */
export function gradeDeterministically(question: Question, answer: Answer | null): GradedAnswer | null {
  const isChoice = question.type === 'multiple_choice' || question.type === 'true_false';
  if (!isChoice || question.correct_option === null) return null;

  // An answer the scanner could not read is never silently marked wrong.
  if (answer?.scan_confidence === 'unreadable') {
    return {
      questionId: question.id,
      verdict: 'uncertain',
      awardedPoints: 0,
      feedback: '',
      correctConcept: '',
      evaluatedBy: 'deterministic',
    };
  }

  const selected = answer?.selected_option ?? null;
  if (selected === null || selected < 0) {
    return {
      questionId: question.id,
      verdict: 'blank',
      awardedPoints: 0,
      feedback: '',
      correctConcept: '',
      evaluatedBy: 'deterministic',
    };
  }

  const correct = selected === question.correct_option;
  return {
    questionId: question.id,
    verdict: correct ? 'correct' : 'incorrect',
    awardedPoints: correct ? question.points : 0,
    feedback: '',
    correctConcept: correct ? '' : question.expected_answer,
    evaluatedBy: 'deterministic',
  };
}

/**
 * Written answers are evaluated by the model against the grading criteria that
 * were stored with the question when it was generated — not against a fresh
 * opinion of what the answer should have been.
 */
export async function gradeWrittenAnswers(
  items: { question: Question; answer: Answer | null }[],
  locale: string,
  courseName: string,
): Promise<GradedAnswer[]> {
  const gradable = items.filter(({ answer }) => answer?.scan_confidence !== 'unreadable');
  const uncertain: GradedAnswer[] = items
    .filter(({ answer }) => answer?.scan_confidence === 'unreadable')
    .map(({ question }) => ({
      questionId: question.id,
      verdict: 'uncertain' as Verdict,
      awardedPoints: 0,
      feedback: '',
      correctConcept: '',
      evaluatedBy: 'deterministic' as const,
    }));

  if (gradable.length === 0) return uncertain;

  const result = await structured({
    schema: AnswerEvaluationSchema,
    effort: 'high',
    maxTokens: 32_000,
    cacheSystem: true,
    system: `${HONESTY_RULES}

Your task: mark a student's written exam answers against the grading criteria supplied with each question.

${languageInstruction(locale)}

Marking rules:
- Mark against the grading criteria, not against your own preferred answer. If the student reached the right conclusion by a valid route the criteria did not anticipate, give the marks.
- Award partial credit in the same units as the question's points. "partial" means some criteria met.
- An empty answer is "blank" with 0 points and no criticism.
- feedback names what was present and what was missing, in one short paragraph. No praise padding, no scolding.
- correct_concept states the idea the student needed, in one or two sentences, so it can go straight into their mistake book.
- awarded_points must never exceed the question's points.`,
    content: [
      {
        kind: 'text',
        text: `Course: ${courseName}

${gradable
  .map(
    ({ question, answer }, index) => `<answer index="${index}">
question_type: ${question.type}
topic: ${question.topic_name}
points_available: ${question.points}
question: ${question.prompt}
${question.code_block ? `code:\n${question.code_block}\n` : ''}expected_answer: ${question.expected_answer}
grading_criteria: ${question.grading_criteria}
student_answer: ${answer?.response_text?.trim() || '(no answer given)'}
${answer?.scan_confidence === 'low' ? 'note: this answer was transcribed from a photo and was hard to read. Mark what is there; do not penalise transcription noise.' : ''}
</answer>`,
  )
  .join('\n\n')}`,
      },
    ],
  });

  const graded: GradedAnswer[] = result.evaluations
    .filter((entry) => entry.index >= 0 && entry.index < gradable.length)
    .map((entry) => {
      const { question } = gradable[entry.index];
      return {
        questionId: question.id,
        verdict: entry.verdict,
        awardedPoints: Math.max(0, Math.min(question.points, entry.awarded_points)),
        feedback: entry.feedback,
        correctConcept: entry.correct_concept,
        evaluatedBy: 'ai' as const,
      };
    });

  // Anything the model skipped stays ungraded rather than silently zeroed.
  const gradedIds = new Set(graded.map((entry) => entry.questionId));
  const missed: GradedAnswer[] = gradable
    .filter(({ question }) => !gradedIds.has(question.id))
    .map(({ question }) => ({
      questionId: question.id,
      verdict: 'uncertain' as Verdict,
      awardedPoints: 0,
      feedback: '',
      correctConcept: '',
      evaluatedBy: 'ai' as const,
    }));

  return [...graded, ...missed, ...uncertain];
}
