import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { I18nProvider } from '@/lib/i18n/provider';
import { isLocale } from '@/lib/i18n';

/**
 * Chrome-free shell for taking an exam. Same auth and language as the rest of
 * the app, without the navigation competing for attention.
 */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <I18nProvider locale={isLocale(user.locale) ? user.locale : 'en'}>{children}</I18nProvider>
  );
}

export const dynamic = 'force-dynamic';
