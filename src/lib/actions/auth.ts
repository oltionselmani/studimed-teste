'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  authenticate,
  createSession,
  destroySession,
  registerUser,
  requireUser,
} from '@/lib/auth/session';
import { run } from '@/lib/db';
import { persist } from '@/lib/db';
import { setApiKey } from '@/lib/ai/client';

export interface FormState {
  error?: string;
  ok?: boolean;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const user = await authenticate(email, password);
  if (!user) return { error: 'invalidCredentials' };

  await createSession(user.id);
  await persist();
  redirect('/dashboard');
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) return { error: 'passwordTooShort' };
  if (!email.includes('@')) return { error: 'invalidCredentials' };

  try {
    const user = await registerUser({
      email,
      password,
      name: String(formData.get('name') ?? ''),
      locale: String(formData.get('locale') ?? 'en'),
      university: String(formData.get('university') ?? ''),
      program: String(formData.get('program') ?? ''),
    });
    await createSession(user.id);
    await persist();
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_TAKEN') return { error: 'emailTaken' };
    throw error;
  }
  redirect('/dashboard');
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const locale = String(formData.get('locale') ?? user.locale);
  const tone = String(formData.get('tone') ?? user.tone);

  await run(
    `UPDATE users SET name = ?, locale = ?, university = ?, program = ?, tone = ?, notifications_enabled = ?
     WHERE id = ?`,
    [
      String(formData.get('name') ?? user.name),
      locale === 'sq' ? 'sq' : 'en',
      String(formData.get('university') ?? user.university),
      String(formData.get('program') ?? user.program),
      tone === 'blunt' ? 'blunt' : 'direct',
      formData.get('notifications') === 'on' ? 1 : 0,
      user.id,
    ],
  );

  const apiKey = formData.get('apiKey');
  if (typeof apiKey === 'string' && apiKey.trim() && !apiKey.startsWith('•')) {
    await setApiKey(apiKey);
  }

  await persist();
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Switches the interface language from anywhere in the app. */
export async function setLocaleAction(locale: string): Promise<void> {
  const user = await requireUser();
  await run('UPDATE users SET locale = ? WHERE id = ?', [locale === 'sq' ? 'sq' : 'en', user.id]);
  await persist();
  revalidatePath('/', 'layout');
}

export async function deleteAccountAction(): Promise<void> {
  const user = await requireUser();
  await run('DELETE FROM users WHERE id = ?', [user.id]);
  await destroySession();
  await persist();
  redirect('/register');
}
