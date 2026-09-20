import type { Attempt, Exam, TopicMastery } from '@/lib/types';
import { gradeToMinPercent, percentToGrade, readBands, type GradeBand } from './grading-scale';

/**
 * The readiness engine is deliberately deterministic and AI-free.
 *
 * Every number below comes from the student's own test results and the clock.
 * The model is never asked "how ready is this person" — it only writes the
 * prose around numbers this file produces. That is what makes the readout
 * defensible instead of flattering.
 */

export type ReadinessBand = 'on_track' | 'needs_attention' | 'at_risk' | 'significant_gap';

export type Confidence = 'verified' | 'user_data' | 'estimate' | 'unknown';

export interface Factor {
  key: string;
  /** Numeric value where one exists, for the UI to format. */
  value: number | null;
  /** Free-form detail (topic names, counts) passed to the translated string. */
  params?: Record<string, string | number>;
  confidence: Confidence;
  /** Whether this factor currently pushes readiness up or down. */
  direction: 'positive' | 'negative' | 'neutral';
}

export interface TimeLeft {
  totalMs: number;
  days: number;
  hours: number;
  passed: boolean;
}

export interface ReadinessResult {
  band: ReadinessBand;
  /** 0..100. A composite of the sub-scores below, not a probability. */
  score: number | null;
  /** Null when the student has not completed a graded attempt yet. */
  recentAveragePercent: number | null;
  recentAverageGrade: number | null;
  allTimeAveragePercent: number | null;
  /** Percentage the target grade corresponds to under this exam's bands. */
  targetPercent: number;
  /** Percentage needed on the exam itself, if weight and current grade allow it. */
  requiredExamPercent: number | null;
  requiredExamConfidence: Confidence;
  /** Gap in percentage points between recent performance and what's needed. */
  gap: number | null;
  coverage: number | null;
  consistency: number | null;
  trendPerAttempt: number | null;
  weakTopicCoveragePercent: number | null;
  gradedAttempts: number;
  topicsTotal: number;
  topicsTested: number;
  weakTopics: { topic: string; mastery: number }[];
  strongTopics: { topic: string; mastery: number }[];
  untestedTopics: string[];
  timeLeft: TimeLeft;
  factors: Factor[];
  /** True when there is simply not enough data to say anything yet. */
  insufficientData: boolean;
}

const WEAK_THRESHOLD = 0.6;
const STRONG_THRESHOLD = 0.8;
const RECENT_WINDOW = 4;

export function timeLeftUntil(exam: Pick<Exam, 'exam_date' | 'exam_time'>, now = new Date()): TimeLeft {
  const time = exam.exam_time && /^\d{2}:\d{2}$/.test(exam.exam_time) ? exam.exam_time : '09:00';
  const target = new Date(`${exam.exam_date}T${time}:00`);
  const totalMs = target.getTime() - now.getTime();
  if (Number.isNaN(totalMs)) {
    return { totalMs: 0, days: 0, hours: 0, passed: true };
  }
  const clamped = Math.max(0, totalMs);
  return {
    totalMs,
    days: Math.floor(clamped / 86_400_000),
    hours: Math.floor((clamped % 86_400_000) / 3_600_000),
    passed: totalMs <= 0,
  };
}

function percentOf(attempt: Attempt): number | null {
  if (attempt.total_points <= 0 || attempt.earned_points === null) return null;
  return (attempt.earned_points / attempt.total_points) * 100;
}

/** Exponentially weighted toward the most recent attempts. */
function weightedRecentAverage(percents: number[]): number | null {
  if (percents.length === 0) return null;
  const window = percents.slice(-RECENT_WINDOW);
  let weightSum = 0;
  let total = 0;
  window.forEach((value, index) => {
    const weight = Math.pow(1.6, index);
    total += value * weight;
    weightSum += weight;
  });
  return total / weightSum;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Least-squares slope: percentage points gained per attempt. */
function linearTrend(values: number[]): number | null {
  if (values.length < 3) return null;
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Works backwards from the target grade.
 *
 * final = currentGrade x (1 - weight) + examGrade x weight
 *
 * Returns null — not a guess — whenever the exam weight or the current course
 * grade is unknown, because the equation genuinely cannot be solved.
 */
export function requiredExamPercentage(
  exam: Exam,
  bands: GradeBand[],
): { percent: number | null; confidence: Confidence } {
  const targetPercent = gradeToMinPercent(exam.target_grade, bands);

  // The student told us they do not know how their course converts marks into
  // grades. The figure below is still needed to plan against, but it rests on
  // a conversion nobody has confirmed, so it is reported as unknown.
  if (exam.grading_scale === 'unknown') {
    return { percent: targetPercent, confidence: 'unknown' };
  }

  if (exam.exam_weight === null || exam.exam_weight <= 0 || exam.current_grade === null) {
    // Without weighting information the honest answer is: the exam itself has
    // to reach the target level.
    return { percent: targetPercent, confidence: 'estimate' };
  }

  const weight = Math.min(100, exam.exam_weight) / 100;
  if (weight >= 1) return { percent: targetPercent, confidence: 'estimate' };

  const requiredGrade = (exam.target_grade - exam.current_grade * (1 - weight)) / weight;
  const clamped = Math.max(exam.grade_min, Math.min(exam.grade_max, requiredGrade));
  return { percent: gradeToMinPercent(clamped, bands), confidence: 'estimate' };
}

export interface ReadinessInput {
  exam: Exam;
  attempts: Attempt[];
  mastery: TopicMastery[];
  topicNames: string[];
  now?: Date;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { exam, mastery, topicNames } = input;
  const now = input.now ?? new Date();
  const bands = readBands(exam);

  const graded = input.attempts
    .filter((attempt) => attempt.status === 'graded' && percentOf(attempt) !== null)
    .sort((a, b) => (a.graded_at ?? a.created_at).localeCompare(b.graded_at ?? b.created_at));

  const percents = graded.map((attempt) => percentOf(attempt) as number);
  const recentAveragePercent = weightedRecentAverage(percents);
  const allTimeAveragePercent =
    percents.length > 0 ? percents.reduce((sum, value) => sum + value, 0) / percents.length : null;

  const targetPercent = gradeToMinPercent(exam.target_grade, bands);
  const required = requiredExamPercentage(exam, bands);
  const needed = required.percent ?? targetPercent;
  const gap = recentAveragePercent === null ? null : recentAveragePercent - needed;

  const tested = mastery.filter((row) => row.questions_seen > 0 && row.mastery !== null);
  const topicsTotal = topicNames.length;
  const topicsTested = tested.length;
  const coverage = topicsTotal > 0 ? topicsTested / topicsTotal : null;

  const recentWindow = percents.slice(-RECENT_WINDOW);
  const consistency =
    recentWindow.length >= 2
      ? Math.max(0, 1 - standardDeviation(recentWindow) / 25)
      : null;
  const trendPerAttempt = linearTrend(percents);

  const ranked = [...tested].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0));
  const weakTopics = ranked
    .filter((row) => (row.mastery ?? 0) < WEAK_THRESHOLD)
    .map((row) => ({ topic: row.topic_name, mastery: row.mastery ?? 0 }));
  const strongTopics = [...ranked]
    .reverse()
    .filter((row) => (row.mastery ?? 0) >= STRONG_THRESHOLD)
    .map((row) => ({ topic: row.topic_name, mastery: row.mastery ?? 0 }));

  const testedNames = new Set(tested.map((row) => row.topic_name));
  const untestedTopics = topicNames.filter((name) => !testedNames.has(name));

  // How much of the known-weak material has actually been re-practised.
  const weakTopicCoveragePercent =
    weakTopics.length > 0
      ? (weakTopics.reduce((sum, row) => sum + row.mastery, 0) / weakTopics.length) * 100
      : tested.length > 0
        ? 100
        : null;

  const timeLeft = timeLeftUntil(exam, now);
  const insufficientData = graded.length === 0;

  const factors: Factor[] = [];

  factors.push({
    key: 'time_remaining',
    value: timeLeft.days,
    params: { days: timeLeft.days, hours: timeLeft.hours },
    confidence: 'verified',
    direction: timeLeft.passed ? 'neutral' : timeLeft.days <= 3 ? 'negative' : 'neutral',
  });

  factors.push({
    key: 'target_grade',
    value: exam.target_grade,
    confidence: 'verified',
    direction: 'neutral',
  });

  if (recentAveragePercent === null) {
    factors.push({ key: 'no_practice_yet', value: null, confidence: 'unknown', direction: 'negative' });
  } else {
    factors.push({
      key: 'recent_average',
      value: Math.round(recentAveragePercent * 10) / 10,
      params: {
        grade: percentToGrade(recentAveragePercent, bands),
        attempts: Math.min(RECENT_WINDOW, graded.length),
      },
      confidence: 'user_data',
      direction: gap !== null && gap >= 0 ? 'positive' : 'negative',
    });
  }

  factors.push({
    key: 'required_exam_performance',
    value: Math.round(needed * 10) / 10,
    params: { basis: exam.exam_weight !== null && exam.current_grade !== null ? 'weighted' : 'target_only' },
    confidence: required.confidence,
    direction: 'neutral',
  });

  if (coverage !== null) {
    factors.push({
      key: 'coverage',
      value: Math.round(coverage * 100),
      params: { tested: topicsTested, total: topicsTotal },
      confidence: 'user_data',
      direction: coverage >= 0.7 ? 'positive' : 'negative',
    });
  } else {
    factors.push({ key: 'no_topics_yet', value: null, confidence: 'unknown', direction: 'neutral' });
  }

  if (consistency !== null) {
    factors.push({
      key: 'consistency',
      value: Math.round(consistency * 100),
      confidence: 'user_data',
      direction: consistency >= 0.7 ? 'positive' : 'negative',
    });
  }

  if (trendPerAttempt !== null) {
    factors.push({
      key: 'trend',
      value: Math.round(trendPerAttempt * 10) / 10,
      confidence: 'user_data',
      direction: trendPerAttempt > 1 ? 'positive' : trendPerAttempt < -1 ? 'negative' : 'neutral',
    });
  }

  if (weakTopics.length > 0) {
    factors.push({
      key: 'weak_topics',
      value: weakTopics.length,
      params: { topics: weakTopics.slice(0, 3).map((row) => row.topic).join(', ') },
      confidence: 'user_data',
      direction: 'negative',
    });
  }

  if (untestedTopics.length > 0) {
    factors.push({
      key: 'untested_topics',
      value: untestedTopics.length,
      params: { topics: untestedTopics.slice(0, 3).join(', ') },
      confidence: 'unknown',
      direction: 'negative',
    });
  }

  if (insufficientData) {
    return {
      band: 'significant_gap',
      score: null,
      recentAveragePercent: null,
      recentAverageGrade: null,
      allTimeAveragePercent: null,
      targetPercent,
      requiredExamPercent: required.percent,
      requiredExamConfidence: required.confidence,
      gap: null,
      coverage,
      consistency,
      trendPerAttempt,
      weakTopicCoveragePercent,
      gradedAttempts: 0,
      topicsTotal,
      topicsTested,
      weakTopics,
      strongTopics,
      untestedTopics,
      timeLeft,
      factors,
      insufficientData: true,
    };
  }

  // ---- Composite score -----------------------------------------------------
  // Four transparent components, each 0..1, then a fixed weighting.
  // performance: how close recent work is to what the target demands. A gap of
  // 25 percentage points takes this to zero, so the distance from the target
  // dominates the result rather than being averaged away.
  const performance = clamp01(1 + Math.min(0, (gap ?? 0) / 25));
  // coverageScore: untested material is unknown material.
  const coverageScore = coverage === null ? 0.5 : clamp01(coverage);
  // stability: erratic scores mean the average is not trustworthy.
  const stability = consistency === null ? 0.5 : clamp01(consistency);
  // runway: is there enough time left relative to the size of the gap?
  const runway = runwayScore(gap, timeLeft, trendPerAttempt);

  const score = Math.round(
    (performance * 0.55 + coverageScore * 0.15 + stability * 0.1 + runway * 0.2) * 100,
  );

  return {
    band: bandFor(score, gap),
    score,
    recentAveragePercent,
    recentAverageGrade:
      recentAveragePercent === null ? null : percentToGrade(recentAveragePercent, bands),
    allTimeAveragePercent,
    targetPercent,
    requiredExamPercent: required.percent,
    requiredExamConfidence: required.confidence,
    gap,
    coverage,
    consistency,
    trendPerAttempt,
    weakTopicCoveragePercent,
    gradedAttempts: graded.length,
    topicsTotal,
    topicsTested,
    weakTopics,
    strongTopics,
    untestedTopics,
    timeLeft,
    factors,
    insufficientData: false,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Time adequacy. A 20-point gap with 30 days left is a different situation
 * from the same gap with 2 days left; this is that difference, expressed
 * without pretending to predict an outcome.
 */
function runwayScore(gap: number | null, timeLeft: TimeLeft, trend: number | null): number {
  if (timeLeft.passed) return 0;
  if (gap === null) return 0.5;
  if (gap >= 0) return 1;

  const deficit = Math.abs(gap);
  const days = timeLeft.days + timeLeft.hours / 24;
  // A conservative planning assumption: focused study moves a weak area by
  // roughly 1.5 percentage points of exam performance per day. Observed trend
  // overrides it once there is enough history to measure one.
  const assumedGainPerDay = trend !== null && trend > 0 ? Math.min(3, trend / 2) : 1.5;
  const daysNeeded = deficit / assumedGainPerDay;
  if (daysNeeded <= 0) return 1;
  return clamp01(days / (daysNeeded * 1.3));
}

/**
 * Bands the composite score, then applies a ceiling based on the raw gap.
 *
 * The ceiling exists because good coverage and a comfortable runway should
 * never add up to "on track" for a grade the student is not currently
 * reaching. Being ahead on process is not the same as being ahead.
 */
export function bandFor(score: number, gap: number | null = null): ReadinessBand {
  const fromScore: ReadinessBand =
    score >= 80 ? 'on_track' : score >= 60 ? 'needs_attention' : score >= 40 ? 'at_risk' : 'significant_gap';

  if (gap === null) return fromScore;

  const ceiling: ReadinessBand =
    gap >= -2 ? 'on_track' : gap >= -10 ? 'needs_attention' : gap >= -20 ? 'at_risk' : 'significant_gap';

  const order: ReadinessBand[] = ['significant_gap', 'at_risk', 'needs_attention', 'on_track'];
  return order[Math.min(order.indexOf(fromScore), order.indexOf(ceiling))];
}
