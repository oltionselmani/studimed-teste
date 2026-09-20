import 'server-only';
import type { ZodType, infer as ZodInfer } from 'zod';
import { one, run } from '@/lib/db';
import {
  AiFeatureUnsupportedError,
  AiInvalidOutputError,
  AiRateLimitedError,
  AiUnavailableError,
} from './errors';
import { anthropicProvider } from './providers/anthropic';
import { geminiProvider } from './providers/gemini';
import type {
  AiBlock,
  AiProvider,
  ProviderId,
  SearchRequest,
  SearchResult,
  StructuredRequest,
} from './provider';

export { AiFeatureUnsupportedError, AiInvalidOutputError, AiRateLimitedError, AiUnavailableError };
export type { AiBlock, ProviderId, SearchHit, SearchResult } from './provider';
export { textBlock } from './provider';

/**
 * ExamOS talks to one AI provider at a time. Which one is a setting, not a
 * rewrite: every workflow asks for validated structured output and gets it
 * from whichever provider is configured.
 */
export const PROVIDERS: Record<ProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: string): value is ProviderId {
  return value === 'anthropic' || value === 'gemini';
}

/** Where each provider's key lives in local settings. */
const KEY_ROW: Record<ProviderId, string> = {
  anthropic: 'anthropic_api_key',
  gemini: 'gemini_api_key',
};

const PROVIDER_ROW = 'ai_provider';

export function apiKeyFromEnv(provider: ProviderId): boolean {
  return Boolean(envKey(provider));
}

function envKey(provider: ProviderId): string | null {
  const direct = process.env[PROVIDERS[provider].envVar]?.trim();
  if (direct) return direct;
  // Google's own tooling accepts either name, so a key set for another Google
  // tool on the same machine is picked up rather than silently ignored.
  if (provider === 'gemini') return process.env.GOOGLE_API_KEY?.trim() || null;
  return null;
}

/**
 * The API key comes from the environment in a server deployment, or from the
 * local settings row in the desktop build. There is no bundled key and no
 * offline fallback that invents content: if there is no key, AI features say so.
 */
export async function getApiKey(provider?: ProviderId): Promise<string | null> {
  const id = provider ?? (await providerId());
  const fromEnv = envKey(id);
  if (fromEnv) return fromEnv;
  const stored = await one<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
    KEY_ROW[id],
  ]);
  return stored?.value?.trim() || null;
}

export async function setApiKey(key: string, provider: ProviderId): Promise<void> {
  const trimmed = key.trim();
  if (trimmed) {
    await run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
      KEY_ROW[provider],
      trimmed,
    ]);
  } else {
    await run('DELETE FROM app_meta WHERE key = ?', [KEY_ROW[provider]]);
  }
}

export async function setProvider(provider: ProviderId): Promise<void> {
  await run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
    PROVIDER_ROW,
    provider,
  ]);
}

/** True when the deployment fixed the provider, so the setting is not the app's to change. */
export function providerFromEnv(): ProviderId | null {
  const value = process.env.EXAMOS_PROVIDER?.trim().toLowerCase();
  return value && isProviderId(value) ? value : null;
}

/**
 * Which provider is in use: the deployment's choice, then the stored setting,
 * then whichever one actually has a key. Nothing is guessed from a key's shape.
 */
export async function providerId(): Promise<ProviderId> {
  const fromEnv = providerFromEnv();
  if (fromEnv) return fromEnv;

  const stored = await one<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
    PROVIDER_ROW,
  ]);
  const value = stored?.value?.trim();
  if (value && isProviderId(value)) return value;

  for (const id of PROVIDER_IDS) {
    if (envKey(id)) return id;
    const row = await one<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
      KEY_ROW[id],
    ]);
    if (row?.value?.trim()) return id;
  }
  return 'anthropic';
}

export async function aiAvailable(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

/**
 * The model for a provider. `EXAMOS_MODEL` is honoured only when it plausibly
 * names a model of the provider in use, so a leftover value for one provider
 * cannot send an unusable model id to the other.
 */
export function modelFor(provider: ProviderId): string {
  const specific = process.env[`EXAMOS_MODEL_${provider.toUpperCase()}`]?.trim();
  if (specific) return specific;

  const shared = process.env.EXAMOS_MODEL?.trim();
  if (shared) {
    const prefix = provider === 'anthropic' ? 'claude' : 'gemini';
    if (shared.toLowerCase().startsWith(prefix)) return shared;
  }
  return PROVIDERS[provider].defaultModel;
}

export async function modelId(): Promise<string> {
  return modelFor(await providerId());
}

async function active(): Promise<{ provider: AiProvider; apiKey: string; model: string }> {
  const id = await providerId();
  const apiKey = await getApiKey(id);
  if (!apiKey) throw new AiUnavailableError();
  return { provider: PROVIDERS[id], apiKey, model: modelFor(id) };
}

/**
 * Every AI call in ExamOS goes through here and comes back as validated,
 * typed JSON. Nothing in the product parses free-form model prose.
 */
export async function structured<T extends ZodType>(
  request: StructuredRequest<T>,
): Promise<ZodInfer<T>> {
  const { provider, apiKey, model } = await active();
  return provider.structured(request, { apiKey, model });
}

/**
 * A live web search, used only where a feature needs sources it can show the
 * student — currently previous-exam research. The caller reads the hits, not
 * the prose about them.
 */
export async function searchWeb(request: SearchRequest): Promise<SearchResult> {
  const { provider, apiKey, model } = await active();
  return provider.searchWeb(request, { apiKey, model });
}
