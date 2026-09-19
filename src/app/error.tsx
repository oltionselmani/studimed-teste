'use client';

import { useEffect } from 'react';

/**
 * Users see a sentence they can act on; the technical detail goes to the
 * server log, never to the screen.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[examos] unhandled error:', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        Nothing was saved. You can try that again — if it keeps happening, the details are in the
        application log.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border px-4 py-2 text-sm font-medium text-[var(--text)]"
        >
          Dashboard
        </a>
      </div>
    </main>
  );
}
