'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cx } from '@/components/ui/primitives';

/**
 * Horizontal, scrollable on narrow screens. The active tab is announced with
 * aria-current, not only with colour.
 */
export function ExamTabs({ examId }: { examId: string }) {
  const { d } = useI18n();
  const pathname = usePathname();
  const base = `/exams/${examId}`;

  const tabs = [
    { href: base, label: d.nav.overview },
    { href: `${base}/material`, label: d.nav.material },
    { href: `${base}/tests`, label: d.nav.tests },
    { href: `${base}/plan`, label: d.nav.plan },
    { href: `${base}/mistakes`, label: d.nav.mistakes },
    { href: `${base}/history`, label: d.nav.history },
    { href: `${base}/report`, label: d.nav.report },
  ];

  return (
    <nav className="no-print -mx-5 overflow-x-auto border-b px-5 sm:-mx-8 sm:px-8" aria-label={d.nav.exams}>
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative block px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'text-[var(--text)] after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
