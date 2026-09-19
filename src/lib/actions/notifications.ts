import 'server-only';
import { all } from '@/lib/db';
import { pushNotification } from '@/lib/data/study';
import { timeLeftUntil } from '@/lib/engine/readiness';
import type { Attempt, Exam, TopicMastery } from '@/lib/types';

/**
 * Derives the small set of notifications worth showing, from data that already
 * exists. Nothing is scheduled or pushed; they are computed when the app is
 * opened, and deduplicated per exam per day so they cannot pile up.
 */
export async function refreshNotifications(userId: string, exams: Exam[]): Promise<void> {
  const now = new Date();

  for (const exam of exams) {
    const time = timeLeftUntil(exam, now);
    if (time.passed) continue;

    const attempts = await all<Attempt>(
      "SELECT * FROM attempts WHERE exam_id = ? AND status = 'graded'",
      [exam.id],
    );

    if (time.days <= 1) {
      await pushNotification({
        userId,
        examId: exam.id,
        kind: 'exam_tomorrow',
        titleKey: 'examTomorrow',
        params: { course: exam.course_name },
      });
    } else if (time.days <= 10 && time.days % 5 === 0) {
      await pushNotification({
        userId,
        examId: exam.id,
        kind: 'exam_soon',
        titleKey: 'examSoon',
        params: { course: exam.course_name, days: time.days },
      });
    }

    if (attempts.length === 0) {
      await pushNotification({
        userId,
        examId: exam.id,
        kind: 'first_diagnostic',
        titleKey: 'firstDiagnostic',
        params: { course: exam.course_name },
      });
      continue;
    }

    // A weak topic that has gone untouched for a while is worth surfacing.
    const mastery = await all<TopicMastery>(
      'SELECT * FROM topic_mastery WHERE exam_id = ? AND mastery IS NOT NULL',
      [exam.id],
    );
    for (const row of mastery) {
      if (row.mastery === null || row.mastery >= 0.6 || !row.last_tested_at) continue;
      const staleDays = Math.floor(
        (now.getTime() - new Date(row.last_tested_at).getTime()) / 86_400_000,
      );
      if (staleDays >= 4) {
        await pushNotification({
          userId,
          examId: exam.id,
          kind: `topic_stale:${row.topic_name}`,
          titleKey: 'topicStale',
          params: { topic: row.topic_name, days: staleDays },
        });
      }
    }
  }
}
