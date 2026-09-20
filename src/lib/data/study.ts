import 'server-only';
import { randomUUID } from 'node:crypto';
import { all, one, run } from '@/lib/db';
import type { StudyPlanOutput, StudySheet } from '@/lib/ai/schemas';
import type { Mistake, NotificationRow, PerformanceSnapshot, StudyMaterialRow, StudyPlan, StudyTask } from '@/lib/types';

// ---- Mistake book ---------------------------------------------------------

export async function listMistakes(
  userId: string,
  examId: string,
  status?: Mistake['status'],
): Promise<Mistake[]> {
  return all<Mistake>(
    `SELECT * FROM mistakes WHERE user_id = ? AND exam_id = ? ${status ? 'AND status = ?' : ''}
     ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'improving' THEN 1 ELSE 2 END,
              times_missed DESC, last_seen_at DESC`,
    status ? [userId, examId, status] : [userId, examId],
  );
}

export async function setMistakeStatus(
  userId: string,
  mistakeId: string,
  status: Mistake['status'],
): Promise<void> {
  await run('UPDATE mistakes SET status = ? WHERE id = ? AND user_id = ?', [
    status,
    mistakeId,
    userId,
  ]);
}

// ---- Study plan -----------------------------------------------------------

export async function currentPlan(examId: string): Promise<StudyPlan | null> {
  return one<StudyPlan>(
    'SELECT * FROM study_plans WHERE exam_id = ? AND is_current = 1 ORDER BY generated_at DESC LIMIT 1',
    [examId],
  );
}

export async function planTasks(planId: string): Promise<StudyTask[]> {
  return all<StudyTask>(
    'SELECT * FROM study_tasks WHERE plan_id = ? ORDER BY day_index ASC, position ASC',
    [planId],
  );
}

export async function savePlan(params: {
  userId: string;
  examId: string;
  basedOnAttempt: string | null;
  horizonDays: number;
  priorities: { topic: string; mastery: number | null }[];
  output: StudyPlanOutput;
}): Promise<string> {
  const planId = randomUUID();
  const now = new Date();

  await run('UPDATE study_plans SET is_current = 0 WHERE exam_id = ?', [params.examId]);
  await run(
    `INSERT INTO study_plans (
       id, exam_id, user_id, generated_at, based_on_attempt, horizon_days,
       rationale, priorities_json, avoid_json, is_current
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      planId,
      params.examId,
      params.userId,
      now.toISOString(),
      params.basedOnAttempt,
      params.horizonDays,
      params.output.rationale,
      JSON.stringify(params.priorities),
      JSON.stringify(params.output.avoid),
    ],
  );

  for (const day of params.output.days) {
    const date = new Date(now.getTime() + day.day_index * 86_400_000).toISOString().slice(0, 10);
    for (const [position, task] of day.tasks.entries()) {
      await run(
        `INSERT INTO study_tasks (
           id, plan_id, exam_id, day_index, date, position, title, detail,
           topic_name, minutes, action, target_note, done
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          randomUUID(),
          planId,
          params.examId,
          day.day_index,
          date,
          position,
          task.title,
          task.detail,
          task.topic_name,
          task.minutes,
          task.action,
          task.target_note,
        ],
      );
    }
  }

  return planId;
}

export async function toggleTask(userId: string, taskId: string): Promise<string | null> {
  const task = await one<StudyTask & { user_id: string }>(
    `SELECT t.*, p.user_id AS user_id FROM study_tasks t
     JOIN study_plans p ON p.id = t.plan_id
     WHERE t.id = ? AND p.user_id = ?`,
    [taskId, userId],
  );
  if (!task) return null;
  await run('UPDATE study_tasks SET done = ?, done_at = ? WHERE id = ?', [
    task.done ? 0 : 1,
    task.done ? null : new Date().toISOString(),
    taskId,
  ]);
  return task.exam_id;
}

// ---- Study sheets ---------------------------------------------------------

export async function listStudySheets(examId: string): Promise<StudyMaterialRow[]> {
  return all<StudyMaterialRow>(
    'SELECT * FROM study_materials WHERE exam_id = ? ORDER BY created_at DESC',
    [examId],
  );
}

export async function getStudySheet(
  userId: string,
  sheetId: string,
): Promise<StudyMaterialRow | null> {
  return one<StudyMaterialRow>('SELECT * FROM study_materials WHERE id = ? AND user_id = ?', [
    sheetId,
    userId,
  ]);
}

export async function saveStudySheet(params: {
  userId: string;
  examId: string;
  topic: string;
  title: string;
  language: string;
  sheet: StudySheet;
}): Promise<string> {
  const id = randomUUID();
  await run(
    `INSERT INTO study_materials (id, exam_id, user_id, topic_name, title, language, content_json, source_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.examId,
      params.userId,
      params.topic,
      params.title,
      params.language,
      JSON.stringify(params.sheet),
      params.sheet.source_note,
      new Date().toISOString(),
    ],
  );
  return id;
}

export async function deleteStudySheet(userId: string, sheetId: string): Promise<void> {
  await run('DELETE FROM study_materials WHERE id = ? AND user_id = ?', [sheetId, userId]);
}

// ---- History --------------------------------------------------------------

export async function listSnapshots(examId: string): Promise<PerformanceSnapshot[]> {
  return all<PerformanceSnapshot>(
    'SELECT * FROM performance_snapshots WHERE exam_id = ? ORDER BY taken_at ASC',
    [examId],
  );
}

// ---- Notifications --------------------------------------------------------

export async function listNotifications(userId: string, limit = 12): Promise<NotificationRow[]> {
  return all<NotificationRow>(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
  );
}

export async function pushNotification(params: {
  userId: string;
  examId: string | null;
  kind: string;
  titleKey: string;
  params: Record<string, string | number>;
}): Promise<void> {
  // Do not repeat the same message for the same exam on the same day.
  const today = new Date().toISOString().slice(0, 10);
  const existing = await one<{ id: string }>(
    `SELECT id FROM notifications
     WHERE user_id = ? AND kind = ? AND COALESCE(exam_id, '') = ? AND substr(created_at, 1, 10) = ?`,
    [params.userId, params.kind, params.examId ?? '', today],
  );
  if (existing) return;

  await run(
    `INSERT INTO notifications (id, user_id, exam_id, kind, title_key, params_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      params.userId,
      params.examId,
      params.kind,
      params.titleKey,
      JSON.stringify(params.params),
      new Date().toISOString(),
    ],
  );
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [
    new Date().toISOString(),
    userId,
  ]);
}
