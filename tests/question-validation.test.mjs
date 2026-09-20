import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The quality gate is what stops a bad or dishonestly-labelled question
 * reaching a student, so it is tested directly rather than only in passing.
 */
const { mechanicalIssues, normaliseQuestion } = await import(
  '../.test-build/engine/question-validation.js'
);

function makeQuestion(overrides = {}) {
  return {
    type: 'short_answer',
    topic_name: 'Graphs',
    subtopic: '',
    difficulty: 'medium',
    prompt: 'State the time complexity of BFS on an adjacency list and justify it.',
    code_block: '',
    options: [],
    correct_option: -1,
    expected_answer: 'O(V + E), because every vertex and every edge is visited once.',
    grading_criteria: 'Full marks for the bound plus the justification.',
    explanation: 'BFS touches each vertex once and each edge once.',
    points: 2,
    answer_lines: 5,
    source_type: 'course_material',
    source_reference: 'lecture_05.pdf',
    source_basis: 'course_material',
    ...overrides,
  };
}

test('a well-formed question passes', () => {
  assert.deepEqual(mechanicalIssues([makeQuestion()]), []);
});

test('a question with no expected answer is rejected', () => {
  const issues = mechanicalIssues([makeQuestion({ expected_answer: '   ' })]);
  assert.equal(issues.length, 1);
  assert.ok(issues[0].problems.includes('no expected answer'));
});

test('a question with no grading criteria is rejected', () => {
  const issues = mechanicalIssues([makeQuestion({ grading_criteria: '' })]);
  assert.ok(issues[0].problems.includes('no grading criteria'));
});

test('near-duplicate prompts are caught', () => {
  const issues = mechanicalIssues([
    makeQuestion(),
    makeQuestion({ prompt: 'State the time complexity of BFS on an adjacency list, and justify it!' }),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].index, 1);
  assert.ok(issues[0].problems.includes('duplicate of an earlier question'));
});

test('a choice question whose correct_option points nowhere is rejected', () => {
  const issues = mechanicalIssues([
    makeQuestion({
      type: 'multiple_choice',
      options: ['O(1)', 'O(n)', 'O(V + E)'],
      correct_option: 7,
    }),
  ]);
  assert.ok(issues[0].problems.includes('correct_option does not point at one of the options'));
});

test('a choice question with repeated options is rejected', () => {
  const issues = mechanicalIssues([
    makeQuestion({
      type: 'multiple_choice',
      options: ['O(n)', 'O(N)', 'O(V + E)'],
      correct_option: 2,
    }),
  ]);
  assert.ok(issues[0].problems.includes('duplicate options'));
});

test('a choice question with a single option is rejected', () => {
  const issues = mechanicalIssues([
    makeQuestion({ type: 'true_false', options: ['True'], correct_option: 0 }),
  ]);
  assert.ok(issues[0].problems.includes('choice question with fewer than two options'));
});

// ---- Source honesty ---------------------------------------------------------

test('a question claiming a verified external source is always rejected', () => {
  // No checked external source is ever supplied on this path, so the claim
  // cannot be true.
  const issues = mechanicalIssues([makeQuestion({ source_type: 'verified_external' })]);
  assert.ok(
    issues[0].problems.includes('claims a verified external source that was never supplied'),
  );
});

test('a question claiming course material must name the file it came from', () => {
  const issues = mechanicalIssues([
    makeQuestion({ source_type: 'course_material', source_reference: '' }),
  ]);
  assert.ok(
    issues[0].problems.includes('claims course material as its source but names no file'),
  );
});

test('a question claiming a previous exam must name the paper', () => {
  const issues = mechanicalIssues([
    makeQuestion({ source_type: 'previous_exam', source_reference: '' }),
  ]);
  assert.ok(
    issues[0].problems.includes('claims a previous exam as its source but names no paper'),
  );
});

test('an AI-generated question needs no source reference', () => {
  const issues = mechanicalIssues([
    makeQuestion({ source_type: 'ai_generated', source_reference: '' }),
  ]);
  assert.deepEqual(issues, []);
});

// ---- Normalisation ----------------------------------------------------------

test('a topic name is snapped to the canonical spelling', () => {
  const result = normaliseQuestion(makeQuestion({ topic_name: '  graphs ' }), [
    'Arrays',
    'Graphs',
  ]);
  assert.equal(result.topic_name, 'Graphs');
});

test('an unrecognised topic name is kept, trimmed, rather than discarded', () => {
  const result = normaliseQuestion(makeQuestion({ topic_name: ' Tries ' }), ['Arrays', 'Graphs']);
  assert.equal(result.topic_name, 'Tries');
});

test('options are cleared on a non-choice question', () => {
  const result = normaliseQuestion(
    makeQuestion({ type: 'short_answer', options: ['a', 'b'], correct_option: 1 }),
    [],
  );
  assert.deepEqual(result.options, []);
  assert.equal(result.correct_option, -1);
});

test('markdown fences are stripped from code blocks', () => {
  const result = normaliseQuestion(
    makeQuestion({ code_block: '```python\nprint(1)\n```' }),
    [],
  );
  assert.equal(result.code_block, 'print(1)');
});

test('points are rounded to a half and never fall below half a point', () => {
  assert.equal(normaliseQuestion(makeQuestion({ points: 2.3 }), []).points, 2.5);
  assert.equal(normaliseQuestion(makeQuestion({ points: 2.1 }), []).points, 2);
  assert.equal(normaliseQuestion(makeQuestion({ points: 0.1 }), []).points, 0.5);
});
