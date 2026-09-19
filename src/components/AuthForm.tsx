'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { signInAction, signUpAction, type FormState } from '@/lib/actions/auth';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui/primitives';
import { en } from '@/lib/i18n/en';
import { sq } from '@/lib/i18n/sq';
import { useState } from 'react';
import type { Locale } from '@/lib/types';

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  // The sign-in screen is reached before a user record exists, so the language
  // is chosen here rather than read from a profile.
  const [locale, setLocale] = useState<Locale>('en');
  const d = locale === 'sq' ? sq : en;

  const [state, action] = useActionState<FormState, FormData>(
    mode === 'signin' ? signInAction : signUpAction,
    {},
  );

  const errorText = state.error
    ? (d.auth[state.error as keyof typeof d.auth] as string) ?? d.errors.generic
    : null;

  return (
    <div className="rise">
      <div className="mb-7 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">{d.app.name}</span>
        </div>
        <div className="flex gap-1 rounded-lg border p-0.5" role="group" aria-label={d.common.language}>
          {(['en', 'sq'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocale(value)}
              aria-pressed={locale === value}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                locale === value
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {value === 'en' ? 'EN' : 'SQ'}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-6">
        <h1 className="text-xl font-semibold">
          {mode === 'signin' ? d.auth.signInTitle : d.auth.signUpTitle}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          {mode === 'signin' ? d.app.tagline : d.auth.signUpSubtitle}
        </p>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="locale" value={locale} />

          {mode === 'signup' ? (
            <Field label={d.auth.name} htmlFor="name">
              <input id="name" name="name" className={inputClass} autoComplete="name" required />
            </Field>
          ) : null}

          <Field label={d.auth.email} htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              className={inputClass}
              autoComplete="email"
              required
            />
          </Field>

          <Field label={d.auth.password} htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              className={inputClass}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
          </Field>

          {mode === 'signup' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={d.auth.university} optional={d.common.optional} htmlFor="university">
                <input
                  id="university"
                  name="university"
                  className={inputClass}
                  defaultValue="UBT — University for Business and Technology"
                />
              </Field>
              <Field label={d.auth.program} optional={d.common.optional} htmlFor="program">
                <input
                  id="program"
                  name="program"
                  className={inputClass}
                  defaultValue="Shkenca Kompjuterike dhe Inxhinieri"
                />
              </Field>
            </div>
          ) : null}

          {errorText ? <Notice tone="danger">{errorText}</Notice> : null}

          <Submit
            label={mode === 'signin' ? d.auth.signIn : d.auth.signUp}
            pendingLabel={d.common.working}
          />
        </form>
      </Card>

      <p className="mt-5 text-center text-sm text-[var(--text-muted)]">
        {mode === 'signin' ? d.auth.noAccount : d.auth.haveAccount}{' '}
        <Link
          href={mode === 'signin' ? '/register' : '/login'}
          className="font-medium text-[var(--accent-text)] hover:underline"
        >
          {mode === 'signin' ? d.auth.signUp : d.auth.signIn}
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-[var(--text-subtle)]">{d.auth.localHint}</p>
    </div>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white"
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18V9M10 18V5M16 18v-6M22 18H2" />
      </svg>
    </span>
  );
}
