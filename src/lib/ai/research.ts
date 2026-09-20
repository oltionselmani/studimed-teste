import 'server-only';
import { searchWeb, structured } from './client';
import { ResearchFindingsSchema, type ResearchFindings } from './schemas';
import { HONESTY_RULES, examContext } from './prompts';
import type { Exam } from '@/lib/types';

/**
 * Looks for publicly available information about previous exams for this
 * course, using the configured provider's web search.
 *
 * What this is: a real search whose results are stored with their URLs so the
 * student can check them. What it is not: a claim that anything found is an
 * official past paper. Anything the model cannot substantiate from the search
 * results is reported as unverified, and an empty result is reported as
 * "nothing found" — never as "no previous exams exist".
 */
export async function researchPreviousExams(exam: Exam): Promise<{
  findings: ResearchFindings;
  rawCount: number;
}> {
  const queryContext = [
    exam.course_name,
    exam.course_code,
    exam.university,
    exam.program,
  ]
    .filter(Boolean)
    .join(' ');

  const { hits, prose } = await searchWeb({
    maxUses: 6,
    maxTokens: 16_000,
    system: `${HONESTY_RULES}

You are running a research step for a student. Search the public web for information about a specific university course: past exam papers, official syllabi, course outlines, published question examples, and lecturer-published material.

Search rules:
- Only use what the search results actually show you. Do not add anything from memory.
- Do not attempt to reach anything behind a login, a paywall, or a student portal.
- A forum post claiming to describe an exam is not a past paper. Say what a source actually is.
- If nothing relevant comes back, say so plainly. Absence of search results is not evidence that past exams do not exist.`,
    prompt: `${examContext(exam)}

Search for publicly available information about previous exams and course documentation for: ${queryContext}

Try several phrasings, including the course name with the university name, the course code, and terms for exams and syllabi in both English and Albanian ("provim", "provimi", "syllabus", "sillabus", "detyra", "past exam", "final exam"). Then summarise what you found and what you did not.`,
  });

  // The hits are the evidence; the model's prose about them is not. A hit
  // carries a title, a URL and, where the provider reports one, a date — not a
  // text extract.
  if (hits.length === 0) {
    return {
      rawCount: 0,
      findings: {
        findings: [],
        conclusion: prose.slice(0, 700) || 'The search returned no results for this course.',
        found_previous_exams: false,
      },
    };
  }

  const findings = await structured({
    schema: ResearchFindingsSchema,
    effort: 'medium',
    maxTokens: 12_000,
    system: `${HONESTY_RULES}

Your task: classify web search results for a university course.

For each result decide:
- "previous_exam" — the page demonstrably is, or directly contains, a past exam paper or official published exam questions for THIS course.
- "related" — official course documentation, a syllabus, lecturer material: useful, but not a past paper.
- "unverified" — anything you cannot substantiate from the result itself.

Be conservative. If in doubt, it is "unverified".
Set found_previous_exams true only if at least one result is genuinely "previous_exam".
The conclusion must state plainly what was and was not established, and must not imply that an absence of results proves anything.
Every url must be copied exactly from the results. Never write a URL that was not in the results.`,
    content: [
      {
        kind: 'text',
        text: `Course: ${queryContext}

The search assistant reported:
${prose.slice(0, 4000)}

Raw search results:
${hits
  .map(
    (result, index) =>
      `[${index}] ${result.title}\n    ${result.url}${result.pageAge ? `\n    published: ${result.pageAge}` : ''}`,
  )
  .join('\n')}`,
      },
    ],
  });

  // Discard anything whose URL was not actually in the search results.
  const allowed = new Set(hits.map((result) => result.url));
  return {
    rawCount: hits.length,
    findings: {
      ...findings,
      findings: findings.findings.filter((entry) => allowed.has(entry.url)),
    },
  };
}
