import 'server-only';
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { all, one, run } from '@/lib/db';
import type { User } from '@/lib/types';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = 'examos_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

let cachedSecret: Uint8Array | null = null;

/**
 * Signing key for session cookies. Configured through the environment in a
 * server deployment; for the desktop build one is generated on first run and
 * kept in the local database so sessions survive restarts.
 */
async function sessionSecret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;

  const configured = process.env.EXAMOS_SESSION_SECRET?.trim();
  if (configured) {
    cachedSecret = new TextEncoder().encode(configured);
    return cachedSecret;
  }

  const stored = await one<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
    'session_secret',
  ]);
  if (stored?.value) {
    cachedSecret = new TextEncoder().encode(stored.value);
    return cachedSecret;
  }

  const generated = randomBytes(48).toString('base64url');
  await run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
    'session_secret',
    generated,
  ]);
  cachedSecret = new TextEncoder().encode(generated);
  return cachedSecret;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(await sessionSecret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !process.env.EXAMOS_DESKTOP,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Returns the signed-in user, or null. Never throws on a bad cookie. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, await sessionSecret());
    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    if (!userId) return null;
    return await one<User>('SELECT * FROM users WHERE id = ?', [userId]);
  } catch {
    return null;
  }
}

/** Use inside server actions and pages that must have a user. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  locale: string;
  university: string;
  program: string;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const existing = await one<{ id: string }>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw new Error('EMAIL_TAKEN');

  const user: User = {
    id: randomUUID(),
    email,
    password_hash: await hashPassword(input.password),
    name: input.name.trim(),
    locale: input.locale === 'sq' ? 'sq' : 'en',
    theme: 'system',
    university: input.university.trim(),
    program: input.program.trim(),
    tone: 'direct',
    notifications_enabled: 1,
    created_at: new Date().toISOString(),
  };

  await run(
    `INSERT INTO users (id, email, password_hash, name, locale, theme, university, program, tone, notifications_enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.email,
      user.password_hash,
      user.name,
      user.locale,
      user.theme,
      user.university,
      user.program,
      user.tone,
      user.notifications_enabled,
      user.created_at,
    ],
  );
  return user;
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await one<User>('SELECT * FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
  if (!user) return null;
  return (await verifyPassword(password, user.password_hash)) ? user : null;
}

export async function anyUserExists(): Promise<boolean> {
  const rows = await all<{ id: string }>('SELECT id FROM users LIMIT 1');
  return rows.length > 0;
}
