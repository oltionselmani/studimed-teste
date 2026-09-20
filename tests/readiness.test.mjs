import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The readiness engine and the grading scale decide what the student is told
 * about where they stand, so they are tested directly rather than only through
 * the UI. The modules are compiled to JavaScript first (see `npm test`).
 */
const { computeReadiness, timeLeftUntil, bandFor, requiredExamPercentage } = await import(
  '../.test-build/engine/readiness.js'
);
const { percentToGrade, gradeToMinPercent, readBands, DEFAULT_BANDS_10 } = await import(
  '../.test-build/engine/grading-scale.js'
);

const NOW = new Date('2026-06-01T09:00:00Z');

function makeExam(overrides = {}) {
  return {
    id: 'exam',
    user_id: 'user',
    course_name: 'Data Structures',
    course_code: '',
    exam_date: '2026-06-18',
    exam_time: '09:00',
    target_grade: 10,
    current_grade: 8.2,
    exam_weight: 50,
    grading_scale: 'ubt_10',
    grade_min: 5,
    grade_max: 10,
    grade_bands: '',
    university: '',
    program: '',
    professor: '',
    language: 'en',
    notes: '',
    analysis_state: 'ready',
    analysis_error: '',
    archived: 0,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function makeAttempt(percent, daysAgo, overrides = {}) {
  const at = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
  return {
    id: `attempt-${daysAgo}`,
    exam_id: 'exam',
    user_id: 'user',
    kind: 'diagnostic',
    title: 'Test',
    difficulty: 'university',
    delivery: 'online',
    status: 'graded',
    time_limit_minutes: 0,
    focus_topics: '',
    total_points: 100,
    earned_points: percent,
    score_10: null,
    started_at: at,
    submitted_at: at,
    graded_at: at,
    grading_note: '',
    created_at: at,
    ...overrides,
  };
}

function makeMastery(entries) {
  return Object.entries(entries).map(([topic_name, mastery]) => ({
    id: topic_name,
    exam_id: 'exam',
    topic_name,
    questions_seen: mastery === null ? 0 : 6,
    points_earned: 0,
    points_possible: 0,
    mastery,
    attempts_count: mastery === null ? 0 : 2,
    last_tested_at: mastery === null ? null : NOW.toISOString(),
    updated_at: NOW.toISOString(),
  }));
}

// ---- Grading scale ---------------------------------------------------------

test('the default conversion maps percentages onto the 5-10 scale', () => {
  assert.equal(percentToGrade(95, DEFAULT_BANDS_10), 10);
  assert.equal(percentToGrade(90, DEFAULT_BANDS_10), 10);
  assert.equal(percentToGrade(89.9, DEFAULT_BANDS_10), 9);
  assert.equal(percentToGrade(50, DEFAULT_BANDS_10), 6);
  assert.equal(percentToGrade(49, DEFAULT_BANDS_10), 5);
  assert.equal(percentToGrade(0, DEFAULT_BANDS_10), 5);
});

test('a target grade converts back to the percentage it requires', () => {
  assert.equal(gradeToMinPercent(10, DEFAULT_BANDS_10), 90);
  assert.equal(gradeToMinPercent(8, DEFAULT_BANDS_10), 70);
  // A custom target between two bands interpolates rather than rounding away.
  assert.equal(gradeToMinPercent(9.5, DEFAULT_BANDS_10), 85);
});

test('a per-exam conversion overrides the default', () => {
  const exam = makeExam({
    grade_bands: JSON.stringify([
      { grade: 10, min_percent: 85 },
      { grade: 5, min_percent: 0 },
    ]),
  });
  assert.equal(percentToGrade(86, readBands(exam)), 10);
});

test('a percent scale passes the percentage straight through', () => {
  const exam = makeExam({ grading_scale: 'percent', grade_min: 0, grade_max: 100 });
  assert.equal(percentToGrade(73.4, readBands(exam)), 73.4);
});

// ---- Working backwards from the target -------------------------------------

test('the required exam performance accounts for weight and current standing', () => {
  // Target 10 needs 90%. Half the grade is already banked at 8.2, so the exam
  // has to carry the rest: (10 - 8.2 x 0.5) / 0.5 = 11.8, clamped to 10 -> 90%.
  const result = requiredExamPercentage(makeExam(), DEFAULT_BANDS_10);
  assert.equal(result.percent, 90);
  assert.equal(result.confidence, 'estimate');
});

test('a high current grade lowers what the exam itself has to reach', () => {
  const exam = makeExam({ target_grade: 8, current_grade: 9, exam_weight: 50 });
  // (8 - 9 x 0.5) / 0.5 = 7 -> the 7 band starts at 60%.
  assert.equal(requiredExamPercentage(exam, DEFAULT_BANDS_10).percent, 60);
});

test('an unconfirmed grading scale is reported as unknown, not as an estimate', () => {
  const exam = makeExam({ grading_scale: 'unknown' });
  const result = requiredExamPercentage(exam, DEFAULT_BANDS_10);
  // A figure is still produced — there has to be something to plan against —
  // but it must not be presented as an inference the app stands behind.
  assert.equal(result.percent, 90);
  assert.equal(result.confidence, 'unknown');
});

test('an unknown weight falls back to the target level, and says it is an estimate', () => {
  const exam = makeExam({ exam_weight: null, current_grade: null });
  const result = requiredExamPercentage(exam, DEFAULT_BANDS_10);
  assert.equal(result.percent, 90);
  assert.equal(result.confidence, 'estimate');
});

// ---- Time -------------------------------------------------------------------

test('time remaining counts down to the exam time', () => {
  const left = timeLeftUntil({ exam_date: '2026-06-18', exam_time: '09:00' }, NOW);
  assert.equal(left.days, 17);
  assert.equal(left.passed, false);
});

test('a past exam is reported as passed, not as negative time', () => {
  const left = timeLeftUntil({ exam_date: '2026-05-01', exam_time: '09:00' }, NOW);
  assert.equal(left.passed, true);
  assert.equal(left.days, 0);
});

// ---- Readiness --------------------------------------------------------------

test('with no completed tests the engine reports insufficient data, not a score', () => {
  const result = computeReadiness({
    exam: makeExam(),
    attempts: [],
    mastery: [],
    topicNames: ['Arrays', 'Graphs'],
    now: NOW,
  });
  assert.equal(result.insufficientData, true);
  assert.equal(result.score, null);
  assert.equal(result.recentAveragePercent, null);
  assert.ok(result.factors.some((factor) => factor.key === 'no_practice_yet'));
});

test('a large gap to the target cannot be reported as on track', () => {
  // 70% measured against a target that needs 90%, with perfect coverage and
  // plenty of time. Process being good must not outrank being 20 points short.
  const result = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(68, 12), makeAttempt(70, 7), makeAttempt(72, 2)],
    mastery: makeMastery({ Arrays: 0.91, Graphs: 0.44, 'Big-O Complexity': 0.38 }),
    topicNames: ['Arrays', 'Graphs', 'Big-O Complexity'],
    now: NOW,
  });

  assert.equal(result.insufficientData, false);
  assert.equal(result.coverage, 1);
  assert.ok(result.gap < -15, `expected a gap worse than -15, got ${result.gap}`);
  assert.ok(
    result.band === 'at_risk' || result.band === 'significant_gap',
    `expected at_risk or worse, got ${result.band}`,
  );
});

test('performance at the required level reads as on track', () => {
  const result = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(90, 10), makeAttempt(92, 5), makeAttempt(93, 1)],
    mastery: makeMastery({ Arrays: 0.95, Graphs: 0.9, 'Big-O Complexity': 0.88 }),
    topicNames: ['Arrays', 'Graphs', 'Big-O Complexity'],
    now: NOW,
  });
  assert.equal(result.band, 'on_track');
  assert.ok(result.gap >= 0);
});

test('untested topics are reported rather than assumed to be fine', () => {
  const result = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(95, 3)],
    mastery: makeMastery({ Arrays: 0.95, Graphs: null, 'Big-O Complexity': null }),
    topicNames: ['Arrays', 'Graphs', 'Big-O Complexity'],
    now: NOW,
  });
  assert.deepEqual(result.untestedTopics, ['Graphs', 'Big-O Complexity']);
  assert.ok(Math.abs(result.coverage - 1 / 3) < 1e-9);
  assert.ok(result.factors.some((factor) => factor.key === 'untested_topics'));
});

test('recent tests are weighted more heavily than older ones', () => {
  const improving = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(40, 20), makeAttempt(60, 10), makeAttempt(90, 1)],
    mastery: makeMastery({ Arrays: 0.9 }),
    topicNames: ['Arrays'],
    now: NOW,
  });
  const declining = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(90, 20), makeAttempt(60, 10), makeAttempt(40, 1)],
    mastery: makeMastery({ Arrays: 0.9 }),
    topicNames: ['Arrays'],
    now: NOW,
  });

  // Same three scores, opposite order: the improving student must read higher.
  assert.ok(
    improving.recentAveragePercent > declining.recentAveragePercent,
    'recent results should dominate the average',
  );
  assert.ok(improving.trendPerAttempt > 0);
  assert.ok(declining.trendPerAttempt < 0);
});

test('erratic results lower consistency even when the average holds', () => {
  const steady = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(70, 9), makeAttempt(71, 6), makeAttempt(70, 3), makeAttempt(71, 1)],
    mastery: makeMastery({ Arrays: 0.7 }),
    topicNames: ['Arrays'],
    now: NOW,
  });
  const erratic = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(45, 9), makeAttempt(95, 6), makeAttempt(50, 3), makeAttempt(92, 1)],
    mastery: makeMastery({ Arrays: 0.7 }),
    topicNames: ['Arrays'],
    now: NOW,
  });
  assert.ok(steady.consistency > erratic.consistency);
});

test('the same gap is treated more seriously as the exam gets closer', () => {
  const far = computeReadiness({
    exam: makeExam({ exam_date: '2026-07-15' }),
    attempts: [makeAttempt(70, 5), makeAttempt(70, 3), makeAttempt(70, 1)],
    mastery: makeMastery({ Arrays: 0.7 }),
    topicNames: ['Arrays'],
    now: NOW,
  });
  const near = computeReadiness({
    exam: makeExam({ exam_date: '2026-06-03' }),
    attempts: [makeAttempt(70, 5), makeAttempt(70, 3), makeAttempt(70, 1)],
    mastery: makeMastery({ Arrays: 0.7 }),
    topicNames: ['Arrays'],
    now: NOW,
  });
  assert.ok(near.score < far.score, 'less time with the same gap must score lower');
});

test('the band ceiling never lets a shortfall read better than it is', () => {
  // A perfect composite score is still capped by the raw gap.
  assert.equal(bandFor(100, -30), 'significant_gap');
  assert.equal(bandFor(100, -15), 'at_risk');
  assert.equal(bandFor(100, -5), 'needs_attention');
  assert.equal(bandFor(100, 0), 'on_track');
  // The ceiling only lowers the band; it never raises it.
  assert.equal(bandFor(20, 10), 'significant_gap');
});

test('every factor carries an evidence level', () => {
  const result = computeReadiness({
    exam: makeExam(),
    attempts: [makeAttempt(70, 5), makeAttempt(75, 1)],
    mastery: makeMastery({ Arrays: 0.8, Graphs: 0.4 }),
    topicNames: ['Arrays', 'Graphs'],
    now: NOW,
  });
  const allowed = new Set(['verified', 'user_data', 'estimate', 'unknown']);
  for (const factor of result.factors) {
    assert.ok(allowed.has(factor.confidence), `bad confidence on ${factor.key}`);
  }
  // The required-performance figure is always an estimate, never "verified".
  const required = result.factors.find((f) => f.key === 'required_exam_performance');
  assert.equal(required.confidence, 'estimate');
});
