import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ZodType, infer as ZodInfer } from 'zod';
import { one, run } from '@/lib/db';

export const DEFAULT_MODEL = 'claude-opus-5';

/** Thrown when AI is asked for but cannot run. Callers surface it, never fake around it. */
export class AiUnavailableError extends Error {
  constructor() {
    super('AI_UNAVAILABLE');
    this.name = 'AiUnavailableError';
  }
}

/** Thrown when the model answered but the answer failed schema validation. */
export class AiInvalidOutputError extends Error {
  constructor(detail?: string) {
    super(detail ? `AI_INVALID_OUTPUT: ${detail}` : 'AI_INVALID_OUTPUT');
    this.name = 'AiInvalidOutputError';
  }
}

/**
 * The API key comes from the environment in a server deployment, or from the
 * local settings row in the desktop build. There is no bundled key and no
 * offline fallback that invents content: if there is no key, AI features say so.
 */
export async function getApiKey(): Promise<string | null> {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const stored = await one<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
    'anthropic_api_key',
  ]);
  return stored?.value?.trim() || null;
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed) {
    await run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
      'anthropic_api_key',
      trimmed,
    ]);
  } else {
    await run('DELETE FROM app_meta WHERE key = ?', ['anthropic_api_key']);
  }
}

export function apiKeyFromEnv(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export async function aiAvailable(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

export function modelId(): string {
  return process.env.EXAMOS_MODEL?.trim() || DEFAULT_MODEL;
}

async function client(): Promise<Anthropic> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new AiUnavailableError();
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
}

export type ContentBlock = Anthropic.ContentBlockParam;

interface StructuredRequest<T extends ZodType> {
  system: string;
  content: ContentBlock[];
  schema: T;
  maxTokens?: number;
  /** 'low' for mechanical extraction, 'high' for anything requiring judgement. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh';
  /** Caches the system prompt prefix across the calls of one workflow. */
  cacheSystem?: boolean;
}

/**
 * Every AI call in ExamOS goes through here and comes back as validated,
 * typed JSON. Nothing in the product parses free-form model prose.
 */
export async function structured<T extends ZodType>(
  request: StructuredRequest<T>,
): Promise<ZodInfer<T>> {
  const anthropic = await client();
  const maxTokens = request.maxTokens ?? 32_000;

  const stream = anthropic.messages.stream({
    model: modelId(),
    max_tokens: maxTokens,
    output_config: {
      format: zodOutputFormat(request.schema),
      effort: request.effort ?? 'high',
    },
    system: request.cacheSystem
      ? [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }]
      : request.system,
    messages: [{ role: 'user', content: request.content }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new AiInvalidOutputError('the request was declined by the model');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiInvalidOutputError('the response was cut off before it finished');
  }

  const parsed = (message as { parsed_output?: unknown }).parsed_output;
  if (parsed === undefined || parsed === null) {
    throw new AiInvalidOutputError('no structured output was returned');
  }

  const result = request.schema.safeParse(parsed);
  if (!result.success) {
    throw new AiInvalidOutputError(result.error.issues[0]?.message ?? 'schema mismatch');
  }
  return result.data as ZodInfer<T>;
}

/**
 * A plain (unstructured) call used only where the model needs a server tool —
 * currently the live web search behind previous-exam research. The caller reads
 * the tool result blocks, not the prose.
 */
export async function withWebSearch(params: {
  system: string;
  prompt: string;
  maxUses?: number;
  maxTokens?: number;
}): Promise<Anthropic.Message> {
  const anthropic = await client();
  const stream = anthropic.messages.stream({
    model: modelId(),
    max_tokens: params.maxTokens ?? 16_000,
    system: params.system,
    tools: [
      {
        // The basic search variant, rather than the newer filtered one, because
        // EXAMOS_MODEL is configurable and this variant is accepted by every
        // model that supports search at all.
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: params.maxUses ?? 6,
      } as unknown as Anthropic.ToolUnion,
    ],
    messages: [{ role: 'user', content: params.prompt }],
  });
  return stream.finalMessage();
}
