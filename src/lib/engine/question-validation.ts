import type { GeneratedQuestion } from '@/lib/ai/schemas';

/**
 * Mechanical checks on generated questions.
 *
 * These run before any model review, because a duplicate, a missing answer or
 * a source label that claims something untrue can be caught in code for free.
 * Kept separate from the generation workflow so they can be tested directly.
 */
export interface QuestionIssue {
  index: number;
  problems: string[];
}

export function mechanicalIssues(questions: GeneratedQuestion[]): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const seen = new Map<string, number>();

  questions.forEach((question, index) => {
    const problems: string[] = [];

    const fingerprint = question.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 90);
    if (seen.has(fingerprint)) problems.push('duplicate of an earlier question');
    else seen.set(fingerprint, index);

    if (!question.expected_answer.trim()) problems.push('no expected answer');
    if (!question.grading_criteria.trim()) problems.push('no grading criteria');

    const isChoice = question.type === 'multiple_choice' || question.type === 'true_false';
    if (isChoice) {
      if (question.options.length < 2) {
        problems.push('choice question with fewer than two options');
      }
      if (question.correct_option < 0 || question.correct_option >= question.options.length) {
        problems.push('correct_option does not point at one of the options');
      }
      if (
        new Set(question.options.map((option) => option.trim().toLowerCase())).size !==
        question.options.length
      ) {
        problems.push('duplicate options');
      }
    }

    // A source label has to be literally true. "verified_external" is only
    // legitimate when a checked source was actually supplied, which never
    // happens on this path, and "course_material" has to name its file.
    if (question.source_type === 'verified_external') {
      problems.push('claims a verified external source that was never supplied');
    }
    if (question.source_type === 'course_material' && !question.source_reference.trim()) {
      problems.push('claims course material as its source but names no file');
    }
    if (question.source_type === 'previous_exam' && !question.source_reference.trim()) {
      problems.push('claims a previous exam as its source but names no paper');
    }

    if (problems.length > 0) issues.push({ index, problems });
  });

  return issues;
}

/** Clamps model output into the shape the rest of the application relies on. */
export function normaliseQuestion(
  question: GeneratedQuestion,
  knownTopics: string[],
): GeneratedQuestion {
  const isChoice = question.type === 'multiple_choice' || question.type === 'true_false';
  const matched = knownTopics.find(
    (topic) => topic.toLowerCase() === question.topic_name.trim().toLowerCase(),
  );

  return {
    ...question,
    // Snap to the canonical topic name so mastery tracking stays consistent.
    topic_name: matched ?? question.topic_name.trim(),
    options: isChoice ? question.options : [],
    correct_option: isChoice ? question.correct_option : -1,
    code_block: question.code_block.replace(/^```[a-z]*\n?|```$/g, '').trim(),
    // Half-point granularity keeps printed papers tidy.
    points: Math.max(0.5, Math.round(question.points * 2) / 2),
  };
}
