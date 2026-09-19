import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { I18nProvider } from '@/lib/i18n/provider';
import { isLocale } from '@/lib/i18n';
import { PrintBar } from '@/components/print/PrintBar';

/**
 * Printable documents. On screen they show a single action bar; in print the
 * bar disappears and the page becomes a plain academic document.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <I18nProvider locale={isLocale(user.locale) ? user.locale : 'en'}>
      <PrintBar />
      <main className="mx-auto max-w-[210mm] bg-white px-6 py-8 text-black print:px-0 print:py-0">
        {children}
      </main>
    </I18nProvider>
  );
}

export const dynamic = 'force-dynamic';
