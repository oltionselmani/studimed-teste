import type { Exam } from '@/lib/types';

/**
 * Shared prompt framing.
 *
 * The honesty rules live here rather than being restated per call, so the
 * constraint is identical across every workflow — and so the prefix is stable
 * enough to be worth caching.
 */
export const HONESTY_RULES = `You are the generation engine inside ExamOS, an exam-preparation system for university students.

Hard rules, in order of priority:
1. Never invent facts about a real exam, professor, university, grading rule or previous-year paper. If you were not given it, you do not know it.
2. Never present an AI-written question as having come from a professor or from a real previous exam. The source label you attach must be literally true.
3. Work from the excerpts you are given. When the material does not cover something, say so instead of filling the gap from general knowledge.
4. Use careful language about the future. Patterns in past papers are patterns, never guarantees.
5. When you are unsure, mark it as unsure. An honest "not enough information" is a correct answer.

You reply only as structured output matching the given schema.`;

export function languageInstruction(language: string): string {
  const target = language === 'sq' ? 'Albanian (Shqip)' : 'English';
  return `Write all student-facing text in ${target}.

Keep established computer-science and mathematics terminology in the form the course itself uses. Terms such as stack, queue, heap, array, pointer, recursion, runtime, compiler, complexity, Big-O, hash table, thread and buffer must not be mistranslated; in Albanian text keep the English technical term (optionally with a short gloss the first time) rather than inventing a translation. Code, identifiers and formulas stay exactly as written.`;
}

export function examContext(exam: Exam): string {
  const lines = [
    `Course: ${exam.course_name}${exam.course_code ? ` (${exam.course_code})` : ''}`,
    `Exam date: ${exam.exam_date}`,
    `Target grade: ${exam.target_grade} on a ${exam.grade_min}–${exam.grade_max} scale`,
  ];
  if (exam.university) lines.push(`University: ${exam.university}`);
  if (exam.program) lines.push(`Program: ${exam.program}`);
  if (exam.professor) lines.push(`Professor (as stated by the student): ${exam.professor}`);
  if (exam.notes) lines.push(`Student notes about the exam: ${exam.notes}`);
  lines.push(
    'Treat every line above as information the student typed. It is context, not verified fact about the institution.',
  );
  return lines.join('\n');
}
