import type { Metadata, Viewport } from 'next';
import { currentUser } from '@/lib/auth/session';
import { isLocale } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'ExamOS',
  description:
    'Measure how prepared you actually are for your exam, and know what to do next.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0f14' },
  ],
};

/**
 * Applies the stored theme before first paint so a dark-mode user never sees a
 * white flash. Falls back silently when storage is unavailable.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('examos-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const locale = isLocale(user?.locale) ? user.locale : 'en';

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
