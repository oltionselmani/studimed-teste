import type { Exam } from '@/lib/types';

/**
 * A grading scale maps an objective percentage (points earned / points
 * possible) onto the grade the university actually awards.
 *
 * ExamOS never claims to know a university's official conversion. It ships a
 * documented default, labels it as the app's own default everywhere it is
 * shown, and lets the student replace it per exam.
 */
export interface GradeBand {
  /** Minimum percentage (0..100) that earns this grade. */
  min_percent: number;
  grade: number;
}

/** ExamOS default for a 5–10 scale. Editable per exam; shown as an estimate. */
export const DEFAULT_BANDS_10: GradeBand[] = [
  { min_percent: 90, grade: 10 },
  { min_percent: 80, grade: 9 },
  { min_percent: 70, grade: 8 },
  { min_percent: 60, grade: 7 },
  { min_percent: 50, grade: 6 },
  { min_percent: 0, grade: 5 },
];

export function defaultBandsFor(scale: string, min: number, max: number): GradeBand[] {
  if (scale === 'percent') {
    return [{ min_percent: 0, grade: 0 }];
  }
  if (scale === 'ubt_10' || (min === 5 && max === 10)) {
    return DEFAULT_BANDS_10;
  }
  // Generic linear scale: split the range into equal percentage slices.
  const steps = Math.max(1, Math.round(max - min));
  const bands: GradeBand[] = [];
  for (let i = steps; i >= 0; i -= 1) {
    bands.push({ min_percent: Math.round((i / (steps + 1)) * 100), grade: min + i });
  }
  return bands;
}

export function readBands(exam: Pick<Exam, 'grade_bands' | 'grading_scale' | 'grade_min' | 'grade_max'>): GradeBand[] {
  if (exam.grade_bands) {
    try {
      const parsed = JSON.parse(exam.grade_bands) as GradeBand[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return [...parsed].sort((a, b) => b.min_percent - a.min_percent);
      }
    } catch {
      // Fall through to the default rather than failing a page render.
    }
  }
  return defaultBandsFor(exam.grading_scale, exam.grade_min, exam.grade_max);
}

/** Percentage (0..100) -> grade on the exam's scale. */
export function percentToGrade(percent: number, bands: GradeBand[]): number {
  if (bands.length === 1 && bands[0].grade === 0) return Math.round(percent * 10) / 10;
  const ordered = [...bands].sort((a, b) => b.min_percent - a.min_percent);
  for (const band of ordered) {
    if (percent >= band.min_percent) return band.grade;
  }
  return ordered[ordered.length - 1]?.grade ?? 0;
}

/**
 * Grade -> the lowest percentage that reaches it. Used to translate a target
 * grade into the practice percentage the student has to be hitting.
 */
export function gradeToMinPercent(grade: number, bands: GradeBand[]): number {
  if (bands.length === 1 && bands[0].grade === 0) return Math.max(0, Math.min(100, grade));
  const ordered = [...bands].sort((a, b) => a.grade - b.grade);
  const exact = ordered.find((band) => band.grade === grade);
  if (exact) return exact.min_percent;
  // Target sits between bands (a custom target): interpolate conservatively.
  const above = ordered.find((band) => band.grade > grade);
  const below = [...ordered].reverse().find((band) => band.grade < grade);
  if (above && below) {
    const span = above.grade - below.grade;
    const ratio = span === 0 ? 0 : (grade - below.grade) / span;
    return below.min_percent + ratio * (above.min_percent - below.min_percent);
  }
  return above?.min_percent ?? below?.min_percent ?? 100;
}
