import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { I18nProvider } from '@/lib/i18n/provider';
import { isLocale } from '@/lib/i18n';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user) redirect('/dashboard');

  return (
    <I18nProvider locale="en">
      <main className="flex min-h-dvh items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </I18nProvider>
  );
}

export const dynamic = 'force-dynamic';
export { isLocale };
