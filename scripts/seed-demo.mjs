/**
 * Development utility: fills a database with a realistic worked example so the
 * whole product can be exercised without spending model calls.
 *
 * This is a developer tool. It is never imported by the application, and it
 * writes only to the database you point it at:
 *
 *   EXAMOS_DATA_DIR=./.demo-data node scripts/seed-demo.mjs
 */
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.EXAMOS_DATA_DIR ?? join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const wasmPath = join(root, 'vendor', 'sql-wasm.wasm');
const SQL = await initSqlJs({ locateFile: () => wasmPath, wasmBinary: readFileSync(wasmPath) });

const dbFile = join(dataDir, 'examos.sqlite');
const db = existsSync(dbFile) ? new SQL.Database(readFileSync(dbFile)) : new SQL.Database();

// Reuse the application's schema rather than restating it here.
const schemaModule = readFileSync(join(root, 'src', 'lib', 'db', 'schema.ts'), 'utf8');
const schema = schemaModule.slice(schemaModule.indexOf('`') + 1, schemaModule.lastIndexOf('`'));
db.run('PRAGMA foreign_keys = ON;');
db.run(schema);

const now = new Date();
const iso = (date) => date.toISOString();
const daysFromNow = (days) => new Date(now.getTime() + days * 86_400_000);

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params.map((value) => (value === undefined ? null : value)));
  stmt.step();
  stmt.free();
}

function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`;
}

// ---- User ------------------------------------------------------------------
const email = process.env.SEED_EMAIL ?? 'demo@examos.local';
const password = process.env.SEED_PASSWORD ?? 'demo-password-1234';
const userId = randomUUID();

run('DELETE FROM users WHERE email = ?', [email]);
run(
  `INSERT INTO users (id, email, password_hash, name, locale, theme, university, program, tone, notifications_enabled, created_at)
   VALUES (?, ?, ?, ?, 'en', 'system', ?, ?, 'direct', 1, ?)`,
  [
    userId,
    email,
    hashPassword(password),
    'Demo Student',
    'UBT — University for Business and Technology',
    'Shkenca Kompjuterike dhe Inxhinieri',
    iso(now),
  ],
);

// ---- Exam ------------------------------------------------------------------
const examId = randomUUID();
run(
  `INSERT INTO exams (
     id, user_id, course_name, course_code, exam_date, exam_time, target_grade,
     current_grade, exam_weight, grading_scale, grade_min, grade_max, grade_bands,
     university, program, professor, language, notes, analysis_state, analysis_error,
     archived, created_at, updated_at
   ) VALUES (?, ?, 'Data Structures', 'CS201', ?, '09:00', 10, 8.2, 50, 'ubt_10', 5, 10, '',
             ?, ?, '', 'en', '', 'ready', '', 0, ?, ?)`,
  [
    examId,
    userId,
    daysFromNow(17).toISOString().slice(0, 10),
    'UBT — University for Business and Technology',
    'Shkenca Kompjuterike dhe Inxhinieri',
    iso(now),
    iso(now),
  ],
);

// A second exam so the dashboard's clash detection has something to detect.
const exam2Id = randomUUID();
run(
  `INSERT INTO exams (
     id, user_id, course_name, course_code, exam_date, exam_time, target_grade,
     current_grade, exam_weight, grading_scale, grade_min, grade_max, grade_bands,
     university, program, professor, language, notes, analysis_state, analysis_error,
     archived, created_at, updated_at
   ) VALUES (?, ?, 'Operating Systems', 'CS305', ?, '', 9, NULL, NULL, 'ubt_10', 5, 10, '',
             '', '', '', 'en', '', 'empty', '', 0, ?, ?)`,
  [exam2Id, userId, daysFromNow(22).toISOString().slice(0, 10), iso(now), iso(now)],
);

// ---- Course structure ------------------------------------------------------
const topics = [
  ['Arrays', 0.8, 'Contiguous storage, indexing, resizing costs.'],
  ['Linked Lists', 0.75, 'Singly, doubly and circular lists; pointer manipulation.'],
  ['Stacks', 0.6, 'LIFO discipline, call stacks, expression evaluation.'],
  ['Queues', 0.6, 'FIFO discipline, circular buffers, deques.'],
  ['Trees', 0.9, 'Binary search trees, traversals, balancing.'],
  ['Graphs', 0.85, 'Representations, BFS and DFS, shortest paths.'],
  ['Sorting', 0.7, 'Comparison sorts, stability, in-place behaviour.'],
  ['Searching', 0.55, 'Linear and binary search, hash-based lookup.'],
  ['Big-O Complexity', 0.95, 'Asymptotic analysis of time and space.'],
];

for (const [index, entry] of topics.entries()) {
  const [name, importance, description] = entry;
  const topicId = randomUUID();
  run(
    `INSERT INTO topics (id, exam_id, name, description, importance, source_type, source_reference, position, created_at)
     VALUES (?, ?, ?, ?, ?, 'course_material', 'lecture_notes.pdf', ?, ?)`,
    [topicId, examId, name, description, importance, index, iso(now)],
  );
  run(
    `INSERT INTO topic_items (id, topic_id, exam_id, kind, content, source_reference, position)
     VALUES (?, ?, ?, 'concept', ?, 'lecture_notes.pdf', 0)`,
    [randomUUID(), topicId, examId, description],
  );
}

// ---- Mastery profile -------------------------------------------------------
const mastery = {
  Arrays: 0.91,
  'Linked Lists': 0.84,
  Stacks: 0.78,
  Queues: 0.72,
  Trees: 0.62,
  Graphs: 0.44,
  Sorting: 0.68,
  Searching: 0.71,
  'Big-O Complexity': 0.38,
};

for (const [topic, value] of Object.entries(mastery)) {
  run(
    `INSERT INTO topic_mastery (id, exam_id, topic_name, questions_seen, points_earned, points_possible, mastery, attempts_count, last_tested_at, updated_at)
     VALUES (?, ?, ?, 4, ?, 12, ?, 3, ?, ?)`,
    [
      randomUUID(),
      examId,
      topic,
      Math.round(value * 12 * 10) / 10,
      value,
      iso(daysFromNow(-2)),
      iso(now),
    ],
  );
}

// ---- Three graded attempts, improving over time ----------------------------
const attemptPlan = [
  { daysAgo: 12, percent: 0.61, kind: 'diagnostic', title: 'Diagnostic — Data Structures' },
  { daysAgo: 7, percent: 0.68, kind: 'targeted', title: 'Practice — Graphs' },
  { daysAgo: 2, percent: 0.74, kind: 'targeted', title: 'Practice — Big-O Complexity' },
];

const topicNames = Object.keys(mastery);
let lastAttemptId = null;

for (const [attemptIndex, plan] of attemptPlan.entries()) {
  const attemptId = randomUUID();
  lastAttemptId = attemptId;
  const gradedAt = iso(daysFromNow(-plan.daysAgo));
  const questionCount = 10;
  const totalPoints = questionCount * 2;
  const earned = Math.round(totalPoints * plan.percent * 10) / 10;

  run(
    `INSERT INTO attempts (
       id, exam_id, user_id, kind, title, difficulty, delivery, status,
       time_limit_minutes, focus_topics, total_points, earned_points, score_10,
       started_at, submitted_at, graded_at, grading_note, created_at
     ) VALUES (?, ?, ?, ?, ?, 'university', 'online', 'graded', 0, '', ?, ?, ?, ?, ?, ?, '', ?)`,
    [
      attemptId,
      examId,
      userId,
      plan.kind,
      plan.title,
      totalPoints,
      earned,
      plan.percent >= 0.7 ? 8 : plan.percent >= 0.6 ? 7 : 6,
      gradedAt,
      gradedAt,
      gradedAt,
      gradedAt,
    ],
  );

  for (let position = 1; position <= questionCount; position += 1) {
    const topic = topicNames[(position + attemptIndex) % topicNames.length];
    const questionId = randomUUID();
    const isChoice = position % 3 === 0;
    const correct = Math.random() < (mastery[topic] ?? 0.6);

    run(
      `INSERT INTO questions (
         id, attempt_id, exam_id, position, type, topic_name, subtopic, difficulty,
         prompt, code_block, options_json, correct_option, expected_answer,
         grading_criteria, explanation, points, answer_lines, source_type,
         source_reference, source_basis
       ) VALUES (?, ?, ?, ?, ?, ?, '', 'medium', ?, '', ?, ?, ?, ?, ?, 2, 5,
                 'course_material', 'lecture_notes.pdf', 'course_material')`,
      [
        questionId,
        attemptId,
        examId,
        position,
        isChoice ? 'multiple_choice' : 'short_answer',
        topic,
        `Explain how ${topic.toLowerCase()} behaves in the worst case, and justify your answer.`,
        isChoice ? JSON.stringify(['O(1)', 'O(log n)', 'O(n)', 'O(n log n)']) : '',
        isChoice ? 2 : null,
        `A complete answer identifies the worst case for ${topic} and states why.`,
        'Full marks for the correct bound plus a justification; half marks for the bound alone.',
        `The worst case for ${topic} follows from how the structure is traversed.`,
      ],
    );

    run(
      `INSERT INTO answers (
         id, question_id, attempt_id, user_id, response_text, selected_option, flagged,
         input_source, scan_confidence, scan_raw, scan_page, awarded_points, verdict,
         feedback, evaluated_by, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, 'online', '', '', NULL, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        questionId,
        attemptId,
        userId,
        isChoice ? '' : 'It is O(n) because the structure has to be walked end to end.',
        isChoice ? (correct ? 2 : 1) : null,
        correct ? 2 : position % 4 === 0 ? 1 : 0,
        correct ? 'correct' : position % 4 === 0 ? 'partial' : 'incorrect',
        correct
          ? ''
          : 'The bound is right but the justification does not follow from the traversal order.',
        isChoice ? 'deterministic' : 'ai',
        gradedAt,
      ],
    );
  }

  run(
    `INSERT INTO performance_snapshots (
       id, exam_id, attempt_id, taken_at, score_10, readiness_band, readiness,
       recent_average, coverage, consistency, metrics_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
    [
      randomUUID(),
      examId,
      attemptId,
      gradedAt,
      plan.percent >= 0.7 ? 8 : 7,
      attemptIndex === 0 ? 'significant_gap' : 'at_risk',
      38 + attemptIndex * 9,
      plan.percent * 100,
      (attemptIndex + 1) / 3,
      0.7 + attemptIndex * 0.05,
    ],
  );
}


// ---- One test that has not been taken yet, so the print / take-online fork,
// ---- the exam runner and the scan flow all have something to open.
const readyAttemptId = randomUUID();
run(
  `INSERT INTO attempts (
     id, exam_id, user_id, kind, title, difficulty, delivery, status,
     time_limit_minutes, focus_topics, total_points, earned_points, score_10,
     started_at, submitted_at, graded_at, grading_note, created_at
   ) VALUES (?, ?, ?, 'mock', 'Full mock exam — Data Structures', 'university', 'undecided',
             'ready', 90, 'Big-O Complexity, Graphs', 12, NULL, NULL, NULL, NULL, NULL, '', ?)`,
  [readyAttemptId, examId, userId, iso(now)],
);

const readyQuestions = [
  {
    type: 'short_answer',
    topic: 'Big-O Complexity',
    prompt: 'Explain why binary search runs in O(log n). Your answer must connect the halving step to the logarithm.',
    code: '',
    options: '',
    correct: null,
    expected: 'Each comparison halves the remaining range, so after k comparisons at most n/2^k elements remain; the search ends when that drops below 1, giving k > log2(n).',
    lines: 6,
  },
  {
    type: 'code_reading',
    topic: 'Big-O Complexity',
    prompt: 'State the time complexity of the function below and justify your answer.',
    code: 'def f(items):\n    total = 0\n    for i in range(len(items)):\n        for j in range(i, len(items)):\n            total += items[j]\n    return total',
    options: '',
    correct: null,
    expected: 'O(n^2): the inner loop runs n - i times for each i, and the sum of n, n-1, ..., 1 is n(n+1)/2.',
    lines: 5,
  },
  {
    type: 'multiple_choice',
    topic: 'Graphs',
    prompt: 'What is the time complexity of breadth-first search on a graph stored as an adjacency list?',
    code: '',
    options: JSON.stringify(['O(V)', 'O(E)', 'O(V + E)', 'O(V * E)']),
    correct: 2,
    expected: 'O(V + E) — every vertex is dequeued once and every edge examined once.',
    lines: 1,
  },
  {
    type: 'algorithm',
    topic: 'Graphs',
    prompt: 'Describe how you would detect a cycle in a directed graph, and give the complexity of your method.',
    code: '',
    options: '',
    correct: null,
    expected: 'Depth-first search tracking vertices on the current recursion stack; an edge back to a vertex still on the stack is a cycle. O(V + E).',
    lines: 8,
  },
  {
    type: 'true_false',
    topic: 'Trees',
    prompt: 'An in-order traversal of a binary search tree visits its keys in ascending order.',
    code: '',
    options: JSON.stringify(['True', 'False']),
    correct: 0,
    expected: 'True — in-order visits the left subtree, then the node, then the right subtree.',
    lines: 1,
  },
  {
    type: 'debugging',
    topic: 'Linked Lists',
    prompt: 'The function below is meant to reverse a singly linked list but loses all but one node. Identify the bug and state the fix.',
    code: 'def reverse(head):\n    prev = None\n    while head:\n        head.next = prev\n        prev = head\n        head = head.next\n    return prev',
    options: '',
    correct: null,
    expected: 'head.next is overwritten before the rest of the list is saved. Capture nxt = head.next before reassigning head.next, then advance with head = nxt.',
    lines: 6,
  },
];

for (const [index, question] of readyQuestions.entries()) {
  run(
    `INSERT INTO questions (
       id, attempt_id, exam_id, position, type, topic_name, subtopic, difficulty,
       prompt, code_block, options_json, correct_option, expected_answer,
       grading_criteria, explanation, points, answer_lines, source_type,
       source_reference, source_basis
     ) VALUES (?, ?, ?, ?, ?, ?, '', 'medium', ?, ?, ?, ?, ?, ?, ?, 2, ?,
               'course_material', 'lecture_notes.pdf', 'course_material')`,
    [
      randomUUID(),
      readyAttemptId,
      examId,
      index + 1,
      question.type,
      question.topic,
      question.prompt,
      question.code,
      question.options,
      question.correct,
      question.expected,
      'Full marks for the correct result with a justification; half for the result alone.',
      question.expected,
      question.lines,
    ],
  );
}

// ---- Mistake book ----------------------------------------------------------
const mistakes = [
  [
    'Big-O Complexity',
    'Explain why binary search is O(log n).',
    'Because it splits the list.',
    'Each comparison halves the remaining search space, so the number of comparisons is log2(n).',
    'The answer names the mechanism but never connects halving to a logarithm.',
    3,
  ],
  [
    'Graphs',
    'Give the time complexity of BFS on an adjacency list and justify it.',
    'O(n^2)',
    'BFS visits every vertex once and every edge once, so it is O(V + E) on an adjacency list.',
    'O(n^2) is the adjacency-matrix bound; the question specified an adjacency list.',
    2,
  ],
  [
    'Trees',
    'When does a binary search tree degrade to linear search time?',
    'When it is too big.',
    'When insertions arrive in sorted order the tree becomes a chain, so operations become O(n).',
    'Size is not what causes the degradation — the insertion order is.',
    1,
  ],
];

for (const entry of mistakes) {
  const [topic, prompt, answer, concept, why, missed] = entry;
  run(
    `INSERT INTO mistakes (
       id, user_id, exam_id, question_id, topic_name, question_prompt, user_answer,
       correct_concept, why_lost_points, status, times_missed, last_seen_at, next_review_at, created_at
     ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
    [
      randomUUID(),
      userId,
      examId,
      topic,
      prompt,
      answer,
      concept,
      why,
      missed,
      iso(daysFromNow(-2)),
      iso(daysFromNow(1)),
      iso(daysFromNow(-2)),
    ],
  );
}

// ---- Study plan ------------------------------------------------------------
const planId = randomUUID();
run(
  `INSERT INTO study_plans (
     id, exam_id, user_id, generated_at, based_on_attempt, horizon_days,
     rationale, priorities_json, avoid_json, is_current
   ) VALUES (?, ?, ?, ?, ?, 7, ?, ?, ?, 1)`,
  [
    planId,
    examId,
    userId,
    iso(now),
    lastAttemptId,
    'Your last three tests moved from 61% to 74%, but Big-O and Graphs are still under half marks and together they carry most of the exam weight. The first five days go almost entirely to those two, with a mixed test every second day so the numbers stay current.',
    JSON.stringify([
      { topic: 'Big-O Complexity', mastery: 0.38 },
      { topic: 'Graphs', mastery: 0.44 },
      { topic: 'Trees', mastery: 0.62 },
    ]),
    JSON.stringify([
      { topic: 'Arrays', reason: 'At 91% across three tests — well past what your target needs.' },
      { topic: 'Linked Lists', reason: 'At 84% and stable. A single review pass is enough.' },
    ]),
  ],
);

const tasks = [
  [0, 'Work through the complexity section of lecture_notes.pdf', 'Read pages 14–22 and rewrite each bound in your own words.', 'Big-O Complexity', 40, 'study', 'Be able to state every bound without looking'],
  [0, 'Complete 15 complexity questions', 'Mixed recurrences and loop analysis.', 'Big-O Complexity', 35, 'practice', 'Target: at least 12 of 15'],
  [0, 'Review the three mistakes in your mistake book', 'Re-derive each one from scratch rather than rereading the answer.', 'Big-O Complexity', 20, 'review', 'All three answered without notes'],
  [0, 'Mini-test on complexity', 'Ten questions, no notes, timed.', 'Big-O Complexity', 25, 'test', 'Target: ≥80%'],
  [1, 'Graph traversal from the lecture slides', 'BFS and DFS on both representations, tracing by hand.', 'Graphs', 45, 'study', 'Trace both on a 7-vertex graph without error'],
  [1, 'Twelve shortest-path problems', 'Dijkstra on small weighted graphs.', 'Graphs', 40, 'practice', 'Target: at least 9 correct'],
  [2, 'Balanced trees and rotations', 'Focus on why an unbalanced tree degrades.', 'Trees', 35, 'study', 'Explain the degradation case out loud'],
  [2, 'Mixed mini-test', 'Complexity, graphs and trees together.', '', 30, 'test', 'Target: ≥75% overall'],
  [3, 'Rest and light review', 'Read your summary sheets only. No new material.', '', 25, 'rest', 'Nothing new today'],
];

const positionByDay = new Map();
for (const entry of tasks) {
  const [dayIndex, title, detail, topic, minutes, action, target] = entry;
  const position = positionByDay.get(dayIndex) ?? 0;
  positionByDay.set(dayIndex, position + 1);
  run(
    `INSERT INTO study_tasks (
       id, plan_id, exam_id, day_index, date, position, title, detail,
       topic_name, minutes, action, target_note, done, done_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
    [
      randomUUID(),
      planId,
      examId,
      dayIndex,
      daysFromNow(dayIndex).toISOString().slice(0, 10),
      position,
      title,
      detail,
      topic,
      minutes,
      action,
      target,
    ],
  );
}

// ---- A study sheet ---------------------------------------------------------
run(
  `INSERT INTO study_materials (id, exam_id, user_id, topic_name, title, language, content_json, source_note, created_at)
   VALUES (?, ?, ?, 'Big-O Complexity', 'Big-O Complexity', 'en', ?, 'lecture_notes.pdf', ?)`,
  [
    randomUUID(),
    examId,
    userId,
    JSON.stringify({
      summary:
        'Asymptotic notation describes how the cost of an algorithm grows as the input grows. It deliberately ignores constants, because for large inputs the growth rate dominates everything else.',
      key_concepts: [
        {
          term: 'Big-O',
          explanation:
            'An upper bound on growth: f(n) = O(g(n)) when f grows no faster than g beyond some input size.',
        },
        {
          term: 'Amortised cost',
          explanation:
            'The average cost per operation across a sequence, even when individual operations are occasionally expensive — a dynamic array resize is the standard case.',
        },
      ],
      formulas: [
        {
          name: 'Halving recurrence',
          expression: 'T(n) = T(n/2) + O(1) → O(log n)',
          when_to_use: 'Binary search and any loop that halves its range.',
        },
        {
          name: 'Divide and conquer',
          expression: 'T(n) = 2T(n/2) + O(n) → O(n log n)',
          when_to_use: 'Merge sort and similar split-then-combine algorithms.',
        },
      ],
      worked_examples: [
        {
          problem: 'Show that binary search runs in O(log n).',
          solution:
            'Each comparison discards half the remaining range. After k comparisons at most n/2^k elements remain. The search ends when n/2^k < 1, so k > log2(n). The number of comparisons is therefore bounded by log2(n), giving O(log n).',
        },
      ],
      common_mistakes: [
        'Saying "it splits the list" without connecting halving to a logarithm.',
        'Quoting the adjacency-matrix bound when the question specifies an adjacency list.',
        'Treating O(n) and Θ(n) as interchangeable.',
      ],
      active_recall: [
        {
          question: 'Why does an unbalanced BST degrade to O(n)?',
          answer: 'Sorted insertions produce a chain, so every operation walks the whole structure.',
        },
        {
          question: 'What is the amortised cost of appending to a dynamic array?',
          answer: 'O(1): doubling makes the total cost of n appends linear in n.',
        },
      ],
      mini_quiz: [
        { question: 'Complexity of BFS on an adjacency list?', answer: 'O(V + E).' },
        {
          question: 'Worst case of quicksort?',
          answer: 'O(n^2), when the pivot is consistently the smallest or largest element.',
        },
      ],
      checklist: [
        'State every common bound from memory',
        'Derive the halving recurrence without notes',
        'Explain the difference between worst case and amortised cost',
      ],
      source_note: 'Built from lecture_notes.pdf and your three recorded mistakes.',
    }),
    iso(now),
  ],
);

writeFileSync(dbFile, Buffer.from(db.export()));
console.log(`[seed-demo] ${dbFile}`);
console.log(`[seed-demo] sign in as ${email} / ${password}`);
