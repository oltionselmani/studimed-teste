'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/primitives';

export function PrintBar({ extra }: { extra?: React.ReactNode }) {
  const { d } = useI18n();
  const router = useRouter();

  return (
    <div className="no-print sticky top-0 z-10 border-b bg-[var(--bg-elevated)]">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← {d.common.back}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          <Button size="sm" onClick={() => window.print()}>
            {d.common.printOrSave}
          </Button>
        </div>
      </div>
    </div>
  );
}
