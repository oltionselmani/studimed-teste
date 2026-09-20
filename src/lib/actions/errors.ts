import {
  AiFeatureUnsupportedError,
  AiInvalidOutputError,
  AiRateLimitedError,
  AiUnavailableError,
} from '@/lib/ai/client';

/**
 * Maps a thrown error onto a translation key.
 *
 * Users see a sentence about what happened and what to do; the underlying
 * message is logged, not rendered.
 */
export function errorCode(error: unknown): string {
  if (error instanceof AiUnavailableError) return 'aiUnavailable';
  if (error instanceof AiRateLimitedError) {
    console.error('[examos] AI rate limited:', error.message);
    return 'aiRateLimited';
  }
  if (error instanceof AiFeatureUnsupportedError) {
    console.error('[examos] AI capability missing:', error.message);
    return 'aiUnsupported';
  }
  if (error instanceof AiInvalidOutputError) {
    console.error('[examos] AI output rejected:', error.message);
    return 'aiInvalid';
  }
  if (error instanceof Error) {
    if (error.message === 'NO_MATERIAL') return 'noMaterial';
    if (error.message === 'NO_QUESTIONS') return 'noQuestions';
    if (error.message === 'FORBIDDEN') return 'forbidden';
    if (error.message === 'UNAUTHENTICATED') return 'unauthenticated';
    if (error.message === 'UNSUPPORTED_SCAN_FORMAT') return 'uploadUnsupported';
    console.error('[examos] action failed:', error);
  } else {
    console.error('[examos] action failed with a non-error value:', error);
  }
  return 'aiFailed';
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Extra detail to show under the message. Never a fabricated summary. */
  detail?: string;
  /** Where to send the user once the action succeeds. */
  redirectTo?: string;
}
