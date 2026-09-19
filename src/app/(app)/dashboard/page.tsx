import { requireUser } from '@/lib/auth/session';
import { findConflicts, loadDashboard } from '@/lib/data/dashboard';
import { listNotifications, markNotificationsRead } from '@/lib/data/study';
import { DashboardView } from '@/components/DashboardView';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const entries = await loadDashboard(user.id);
  const notifications = await listNotifications(user.id);
  await markNotificationsRead(user.id);

  return (
    <DashboardView
      entries={entries}
      conflict={findConflicts(entries)}
      notifications={notifications}
      notificationsEnabled={Boolean(user.notifications_enabled)}
    />
  );
}
