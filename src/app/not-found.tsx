import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">We could not find that.</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        The page may have been deleted, or the link may be wrong.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
      >
        Dashboard
      </Link>
    </main>
  );
}
