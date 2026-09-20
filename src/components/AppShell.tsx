'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { setLocaleAction, signOutAction } from '@/lib/actions/auth';
import { cx } from '@/components/ui/primitives';
import type { Exam, User } from '@/lib/types';

interface Props {
  user: User;
  exams: Exam[];
  unreadCount: number;
  children: React.ReactNode;
}

export function AppShell({ user, exams, unreadCount, children }: Props) {
  const { d } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  const nav = (
    <NavContent
      user={user}
      exams={exams}
      unreadCount={unreadCount}
      pathname={pathname}
      onNavigate={() => setMenuOpen(false)}
    />
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Mobile header */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-[var(--bg-elevated)]/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold tracking-tight">{d.app.name}</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="app-nav"
          aria-label={menuOpen ? d.nav.closeMenu : d.nav.openMenu}
          className="relative -mr-1 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
        >
          {unreadCount > 0 && !menuOpen ? (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--accent)]" />
          ) : null}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </header>

      {menuOpen ? (
        <nav
          id="app-nav"
          className="no-print fixed inset-x-0 bottom-0 top-[57px] z-20 overflow-y-auto border-t bg-[var(--bg)] px-4 py-5 lg:hidden"
        >
          {nav}
        </nav>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh w-[264px] shrink-0 overflow-y-auto border-r bg-[var(--bg-elevated)] px-4 py-5 lg:block">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">{d.app.name}</span>
        </Link>
        {nav}
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function NavContent({
  user,
  exams,
  unreadCount,
  pathname,
  onNavigate,
}: {
  user: User;
  exams: Exam[];
  unreadCount: number;
  pathname: string;
  onNavigate: () => void;
}) {
  const { d } = useI18n();

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-0.5">
        <NavLink href="/dashboard" active={pathname === '/dashboard'} onClick={onNavigate} badge={unreadCount}>
          <IconHome />
          {d.nav.dashboard}
        </NavLink>
        <NavLink href="/exams/new" active={pathname === '/exams/new'} onClick={onNavigate}>
          <IconPlus />
          {d.nav.newExam}
        </NavLink>
        <NavLink href="/settings" active={pathname === '/settings'} onClick={onNavigate}>
          <IconGear />
          {d.nav.settings}
        </NavLink>
      </div>

      {exams.length > 0 ? (
        <div className="mt-7">
          <h2 className="px-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.nav.exams}
          </h2>
          <div className="mt-2 space-y-0.5">
            {exams.map((exam) => (
              <ExamLink
                key={exam.id}
                exam={exam}
                active={pathname.startsWith(`/exams/${exam.id}`)}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-auto space-y-3 pt-8">
        <div className="flex items-center gap-1.5">
          <LanguageToggle current={user.locale} />
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name || user.email}</div>
            <div className="truncate text-xs text-[var(--text-subtle)]">{user.email}</div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              title={d.auth.signOut}
              aria-label={d.auth.signOut}
              className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function NavLink({
  href,
  active,
  onClick,
  badge,
  children,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
      )}
    >
      {children}
      {badge ? (
        <span className="tabular ml-auto rounded-full bg-[var(--accent)] px-1.5 py-px text-[10px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function ExamLink({
  exam,
  active,
  onClick,
}: {
  exam: Exam;
  active: boolean;
  onClick: () => void;
}) {
  const { d, t } = useI18n();
  const days = daysUntil(exam.exam_date);

  return (
    <Link
      href={`/exams/${exam.id}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'block rounded-lg px-3 py-2 transition-colors',
        active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]',
      )}
    >
      <div
        className={cx(
          'truncate text-sm font-medium',
          active ? 'text-[var(--accent-text)]' : 'text-[var(--text)]',
        )}
      >
        {exam.course_name}
      </div>
      <div className="tabular mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
        <span className={days <= 3 && days >= 0 ? 'font-semibold text-[var(--bad)]' : undefined}>
          {days < 0 ? d.exam.examPassed : `${days} ${days === 1 ? d.common.day : d.common.days}`}
        </span>
        <span aria-hidden>·</span>
        <span>
          {d.exam.target} {exam.target_grade}
        </span>
      </div>
      <span className="sr-only">{t(d.exam.timeLeftValue, { days, hours: 0 })}</span>
    </Link>
  );
}

function daysUntil(date: string): number {
  const target = new Date(`${date}T23:59:59`);
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000) - 1;
}

function LanguageToggle({ current }: { current: string }) {
  const { d } = useI18n();
  return (
    <div className="flex gap-0.5 rounded-lg border p-0.5" role="group" aria-label={d.common.language}>
      {(['en', 'sq'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => void setLocaleAction(value)}
          aria-pressed={current === value}
          className={cx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            current === value
              ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
          )}
        >
          {value === 'en' ? 'EN' : 'SQ'}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const { d } = useI18n();
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('examos-theme');
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch {
      // Storage can be unavailable (private mode); the system theme still works.
    }
  }, []);

  function apply(next: 'system' | 'light' | 'dark') {
    setTheme(next);
    try {
      if (next === 'system') {
        localStorage.removeItem('examos-theme');
        document.documentElement.removeAttribute('data-theme');
      } else {
        localStorage.setItem('examos-theme', next);
        document.documentElement.setAttribute('data-theme', next);
      }
    } catch {
      // Ignore: the attribute change above still applies for this page view.
    }
  }

  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const label =
    theme === 'dark' ? d.settings.themeDark : theme === 'light' ? d.settings.themeLight : d.settings.themeSystem;

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      title={`${d.settings.theme}: ${label}`}
      aria-label={`${d.settings.theme}: ${label}`}
      className="rounded-lg border p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {theme === 'dark' ? (
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        ) : theme === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <>
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 18v3" />
          </>
        )}
      </svg>
    </button>
  );
}

function Logo() {
  return (
    // The real product mark, at the size it is drawn, rather than a redrawn
    // approximation of it. Decorative: the app name sits next to it.
    <img
      src="/icons/logo.png"
      alt=""
      aria-hidden
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded-lg"
    />
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v.09a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
