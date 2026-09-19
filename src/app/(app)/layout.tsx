import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { listExams } from '@/lib/data/exams';
import { listNotifications } from '@/lib/data/study';
import { refreshNotifications } from '@/lib/actions/notifications';
import { I18nProvider } from '@/lib/i18n/provider';
import { AppShell } from '@/components/AppShell';
import { isLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const exams = await listExams(user.id);
  if (user.notifications_enabled) await refreshNotifications(user.id, exams);
  const notifications = await listNotifications(user.id);
  const unread = notifications.filter((item) => !item.read_at).length;

  return (
    <I18nProvider locale={isLocale(user.locale) ? user.locale : 'en'}>
      <AppShell user={user} exams={exams} unreadCount={user.notifications_enabled ? unread : 0}>
        {children}
      </AppShell>
    </I18nProvider>
  );
}
