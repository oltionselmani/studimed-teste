import { z } from 'zod';

/**
 * Structured-output contracts. Everything the model produces is validated
 * against one of these before it reaches the database, so a malformed or
 * half-invented response is discarded rather than displayed.
 */

export const TopicItemSchema = z.object({
  kind: z.enum([
    'subtopic',
    'definition',
    'formula',
    'concept',
    'example',
    'algorithm',
    'term',
    'exercise',
  ]),
  content: z.string().min(1).max(600),
  source_reference: z
    .string()
    .max(200)
    .describe('The excerpt source filename this item came from. Empty if not traceable.'),
});

export const ExtractedTopicSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500),
  importance: z
    .number()
    .min(0)
    .max(1)
    .describe('How much space this topic takes up in the provided material.'),
  source_reference: z.string().max(200),
  items: z.array(TopicItemSchema).max(24),
});

export const CourseAnalysisSchema = z.object({
  topics: z.array(ExtractedTopicSchema).min(1).max(30),
  detected_language: z.enum(['en', 'sq', 'other']),
  coverage_note: z
    .string()
    .max(600)
    .describe('What the provided material does and does not appear to cover.'),
});
export type CourseAnalysis = z.infer<typeof CourseAnalysisSchema>;

export const PreviousExamAnalysisSchema = z.object({
  recurring_topics: z.array(z.object({ topic: z.string().max(120), occurrences: z.number().int().min(1) })).max(20),
  question_formats: z.array(z.object({ format: z.string().max(80), share_percent: z.number().min(0).max(100) })).max(12),
  structure_note: z.string().max(800),
  difficulty_note: z.string().max(500),
  theory_vs_practical: z.object({
    theory_percent: z.number().min(0).max(100),
    practical_percent: z.number().min(0).max(100),
  }),
  repeated_concepts: z.array(z.string().max(160)).max(25),
  terminology: z.array(z.string().max(80)).max(30),
});
export type PreviousExamAnalysis = z.infer<typeof PreviousExamAnalysisSchema>;

export const GeneratedQuestionSchema = z.object({
  type: z.enum([
    'multiple_choice',
    'true_false',
    'short_answer',
    'conceptual',
    'calculation',
    'code_reading',
    'debugging',
    'algorithm',
    'problem_solving',
    'long_answer',
  ]),
  topic_name: z.string().min(1).max(120),
  subtopic: z.string().max(120),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prompt: z.string().min(10).max(2500),
  code_block: z
    .string()
    .max(2500)
    .describe('Code the question refers to, without markdown fences. Empty when not needed.'),
  options: z
    .array(z.string().min(1).max(400))
    .max(6)
    .describe('Choices for multiple_choice / true_false. Empty array otherwise.'),
  correct_option: z
    .number()
    .int()
    .min(-1)
    .max(5)
    .describe('Zero-based index of the correct option, or -1 when not a choice question.'),
  expected_answer: z.string().min(1).max(2500),
  grading_criteria: z
    .string()
    .min(1)
    .max(1200)
    .describe('What a full-credit answer must contain, as markable points.'),
  explanation: z.string().min(1).max(1500),
  points: z.number().min(0.5).max(25),
  answer_lines: z
    .number()
    .int()
    .min(1)
    .max(30)
    .describe('Ruled lines of writing space to print under this question.'),
  source_type: z.enum(['course_material', 'previous_exam', 'verified_external', 'ai_generated']),
  source_reference: z
    .string()
    .max(200)
    .describe('The exact excerpt source this is built on. Required unless purely ai_generated.'),
  source_basis: z
    .string()
    .max(300)
    .describe('What the question was derived from, e.g. "course_material + previous_exam_patterns".'),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const GeneratedExamSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1).max(40),
});

export const QuestionReviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        index: z.number().int().min(0),
        passes: z.boolean(),
        problems: z.array(z.string().max(200)).max(6),
      }),
    )
    .max(40),
});

export const AnswerEvaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      index: z.number().int().min(0),
      verdict: z.enum(['correct', 'partial', 'incorrect', 'blank']),
      awarded_points: z.number().min(0),
      feedback: z.string().max(900).describe('What was right, what was missing. Addressed to the student.'),
      correct_concept: z.string().max(600).describe('The concept the student needs, in one or two sentences.'),
    }),
  ),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const ScanPageReadSchema = z.object({
  page_readable: z.boolean(),
  page_note: z.string().max(300),
  answers: z.array(
    z.object({
      question_number: z
        .number()
        .int()
        .min(1)
        .describe('The printed question number this answer belongs to.'),
      transcription: z.string().max(3000).describe('Exactly what is written. Do not correct or complete it.'),
      selected_option_letter: z
        .string()
        .max(2)
        .describe('For a multiple-choice answer, the chosen letter. Empty otherwise.'),
      confidence: z.enum(['high', 'medium', 'low', 'unreadable']),
      note: z.string().max(200),
    }),
  ).max(40),
});
export type ScanPageRead = z.infer<typeof ScanPageReadSchema>;

export const StudySheetSchema = z.object({
  summary: z.string().min(1).max(1200),
  key_concepts: z.array(z.object({ term: z.string().max(120), explanation: z.string().max(700) })).max(12),
  formulas: z
    .array(
      z.object({
        name: z.string().max(120),
        expression: z.string().max(300),
        when_to_use: z.string().max(300),
      }),
    )
    .max(12),
  worked_examples: z
    .array(z.object({ problem: z.string().max(900), solution: z.string().max(1600) }))
    .max(6),
  common_mistakes: z.array(z.string().max(300)).max(10),
  active_recall: z.array(z.object({ question: z.string().max(400), answer: z.string().max(700) })).max(12),
  mini_quiz: z.array(z.object({ question: z.string().max(400), answer: z.string().max(700) })).max(8),
  checklist: z.array(z.string().max(200)).max(12),
  source_note: z
    .string()
    .max(400)
    .describe('Which of the student files this sheet was built from.'),
});
export type StudySheet = z.infer<typeof StudySheetSchema>;

export const StudyPlanSchema = z.object({
  rationale: z.string().min(1).max(900),
  avoid: z
    .array(z.object({ topic: z.string().max(120), reason: z.string().max(240) }))
    .max(6)
    .describe('Topics already strong enough for the target — not worth re-studying.'),
  days: z
    .array(
      z.object({
        day_index: z.number().int().min(0).max(60),
        tasks: z
          .array(
            z.object({
              title: z.string().min(1).max(160),
              detail: z.string().max(400),
              topic_name: z.string().max(120),
              minutes: z.number().int().min(10).max(240),
              action: z.enum(['study', 'practice', 'review', 'test', 'rest']),
              target_note: z.string().max(160).describe('A concrete success criterion, e.g. "≥80% on a 10-question set".'),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(21),
});
export type StudyPlanOutput = z.infer<typeof StudyPlanSchema>;

export const ResearchFindingsSchema = z.object({
  findings: z
    .array(
      z.object({
        title: z.string().max(240),
        url: z.string().max(600),
        snippet: z.string().max(600),
        relevance: z.enum(['previous_exam', 'related', 'unverified']),
        note: z
          .string()
          .max(400)
          .describe('What this source actually is, and what it does not establish.'),
      }),
    )
    .max(12),
  conclusion: z
    .string()
    .max(700)
    .describe('State plainly whether verified previous-exam information was found.'),
  found_previous_exams: z.boolean(),
});
export type ResearchFindings = z.infer<typeof ResearchFindingsSchema>;
