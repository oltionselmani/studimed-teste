'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { persist } from '@/lib/db';
import { getExam, listMastery, listTopics, prioritiseTopics } from '@/lib/data/exams';
import { listMaterials, listPreviousExams } from '@/lib/data/materials';
import {
  createAttempt,
  deleteAttempt,
  finaliseGrading,
  getAttempt,
  listAnswers,
  listQuestions,
  saveAnswer,
  setDelivery,
  startAttempt,
} from '@/lib/data/attempts';
import { listMistakes } from '@/lib/data/study';
import { generateQuestions } from '@/lib/ai/exam-generation';
import { gradeDeterministically, gradeWrittenAnswers, type GradedAnswer } from '@/lib/ai/grading';
import { aiAvailable } from '@/lib/ai/client';
import { errorCode, type ActionResult } from './errors';
import type { AttemptKind, Difficulty, Question } from '@/lib/types';

const DEFAULT_COUNTS: Record<AttemptKind, number> = {
  diagnostic: 12,
  targeted: 10,
  mock: 18,
  mistake_review: 8,
};

/**
 * Generates a test from the student's own material.
 *
 * Nothing is written to the database unless generation *and* the quality gate
 * succeed — a failed run leaves no half-built exam behind.
 */
export async function generateAttemptAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) return { error: 'notFound' };
  if (!(await aiAvailable())) return { error: 'aiUnavailable' };

  const kind = (String(formData.get('kind') ?? 'diagnostic') || 'diagnostic') as AttemptKind;
  const difficulty = (String(formData.get('difficulty') ?? 'university') ||
    'university') as Difficulty;
  const questionCount = Math.max(
    4,
    Math.min(40, Number(formData.get('question_count')) || DEFAULT_COUNTS[kind]),
  );
  const timeLimit = Math.max(0, Math.min(300, Number(formData.get('time_limit')) || 0));
  const requestedTopics = formData
    .getAll('focus_topics')
    .map((value) => String(value))
    .filter(Boolean);

  const [materials, topics, mastery, mistakes, previousExams] = await Promise.all([
    listMaterials(examId),
    listTopics(examId),
    listMastery(examId),
    listMistakes(user.id, examId),
    listPreviousExams(examId),
  ]);

  if (topics.length === 0) return { error: 'noMaterial' };

  const masteryMap: Record<string, number> = {};
  for (const row of mastery) {
    if (row.mastery !== null) masteryMap[row.topic_name] = row.mastery;
  }

  // When the student did not pick topics, the deterministic priority order
  // decides — not the model.
  const focusTopics =
    requestedTopics.length > 0
      ? requestedTopics
      : kind === 'diagnostic'
        ? []
        : prioritiseTopics(topics, mastery, 4).map((entry) => entry.topic);

  const analysed = previousExams.find((paper) => paper.analysis_json);

  try {
    const { questions, regenerated } = await generateQuestions({
      exam,
      materials,
      locale: exam.language,
      kind,
      difficulty,
      questionCount,
      focusTopics,
      allTopics: topics.map((topic) => topic.name),
      mastery: masteryMap,
      recurringMistakes: mistakes
        .filter((mistake) => mistake.status !== 'resolved')
        .slice(0, 15)
        .map((mistake) => ({
          topic: mistake.topic_name,
          prompt: mistake.question_prompt,
          concept: mistake.correct_concept,
        })),
      previousExamAnalysis: analysed?.analysis_json ?? null,
      hasPreviousExams: previousExams.length > 0,
    });

    const attemptId = await createAttempt({
      userId: user.id,
      examId,
      kind,
      title: titleFor(kind, exam.course_name, focusTopics),
      difficulty,
      timeLimitMinutes: timeLimit,
      focusTopics,
      questions,
    });

    await persist();
    revalidatePath(`/exams/${examId}`, 'layout');
    return {
      ok: true,
      redirectTo: `/attempts/${attemptId}`,
      detail: regenerated > 0 ? String(regenerated) : undefined,
    };
  } catch (error) {
    return { error: errorCode(error) };
  }
}

function titleFor(kind: AttemptKind, courseName: string, focusTopics: string[]): string {
  const stamp = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case 'diagnostic':
      return `Diagnostic — ${courseName} — ${stamp}`;
    case 'mock':
      return `Mock exam — ${courseName} — ${stamp}`;
    case 'mistake_review':
      return `Mistake re-test — ${courseName} — ${stamp}`;
    default:
      return `Practice — ${focusTopics[0] ?? courseName} — ${stamp}`;
  }
}

export async function chooseDeliveryAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const attemptId = String(formData.get('attempt_id') ?? '');
  const delivery = String(formData.get('delivery') ?? 'online');

  if (delivery === 'online') {
    await setDelivery(user.id, attemptId, 'online');
    await startAttempt(user.id, attemptId);
    await persist();
    redirect(`/attempts/${attemptId}/take`);
  }

  await setDelivery(user.id, attemptId, delivery === 'scan' ? 'scan' : 'print');
  await persist();
  redirect(delivery === 'scan' ? `/attempts/${attemptId}/scan` : `/print/exam/${attemptId}`);
}

export async function saveAnswerAction(input: {
  attemptId: string;
  questionId: string;
  responseText?: string;
  selectedOption?: number | null;
  flagged?: boolean;
}): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await saveAnswer({ userId: user.id, ...input });
  await persist();
  return { ok: true };
}

/**
 * Grades a submitted attempt. Choice questions are marked in code; written
 * answers go to the model against the criteria stored with each question.
 */
export async function submitAttemptAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const attemptId = String(formData.get('attempt_id') ?? '');
  const attempt = await getAttempt(user.id, attemptId);
  if (!attempt) return { error: 'notFound' };

  const exam = await getExam(user.id, attempt.exam_id);
  if (!exam) return { error: 'notFound' };

  const [questions, answers, topics] = await Promise.all([
    listQuestions(attemptId),
    listAnswers(attemptId),
    listTopics(attempt.exam_id),
  ]);

  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  const graded: GradedAnswer[] = [];
  const written: { question: Question; answer: (typeof answers)[number] | null }[] = [];

  for (const question of questions) {
    const answer = answerByQuestion.get(question.id) ?? null;
    const deterministic = gradeDeterministically(question, answer);
    if (deterministic) {
      graded.push(deterministic);
      continue;
    }
    if (!answer || (!answer.response_text.trim() && answer.scan_confidence !== 'unreadable')) {
      graded.push({
        questionId: question.id,
        verdict: 'blank',
        awardedPoints: 0,
        feedback: '',
        correctConcept: question.expected_answer,
        evaluatedBy: 'deterministic',
      });
      continue;
    }
    written.push({ question, answer });
  }

  let gradingNote = '';
  if (written.length > 0) {
    if (!(await aiAvailable())) return { error: 'aiUnavailable' };
    try {
      graded.push(...(await gradeWrittenAnswers(written, exam.language, exam.course_name)));
    } catch (error) {
      return { error: errorCode(error) };
    }
  }

  const uncertain = graded.filter((entry) => entry.verdict === 'uncertain').length;
  if (uncertain > 0) {
    gradingNote = `${uncertain} answer(s) could not be read confidently and were left out of the score.`;
  }

  await finaliseGrading({
    userId: user.id,
    exam,
    attempt,
    questions,
    graded,
    topics,
    gradingNote,
  });

  await persist();
  revalidatePath(`/exams/${attempt.exam_id}`, 'layout');
  return { ok: true, redirectTo: `/attempts/${attemptId}/result` };
}

export async function deleteAttemptAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const examId = await deleteAttempt(user.id, String(formData.get('attempt_id') ?? ''));
  await persist();
  if (examId) {
    revalidatePath(`/exams/${examId}`, 'layout');
    redirect(`/exams/${examId}/tests`);
  }
  redirect('/dashboard');
}

/** Used by the "Test me again" button on a result page. */
export async function retestTopicAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const examId = String(formData.get('exam_id') ?? '');
  const topic = String(formData.get('topic') ?? '');
  const exam = await getExam(user.id, examId);
  if (!exam) redirect('/dashboard');

  const search = new URLSearchParams({ kind: 'targeted' });
  if (topic) search.set('topic', topic);
  redirect(`/exams/${examId}/tests?${search.toString()}`);
}
