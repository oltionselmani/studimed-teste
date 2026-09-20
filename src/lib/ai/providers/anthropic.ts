import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ZodType, infer as ZodInfer } from 'zod';
import { AiInvalidOutputError, AiRateLimitedError } from '../errors';
import type {
  AiBlock,
  AiProvider,
  CallContext,
  SearchHit,
  SearchRequest,
  SearchResult,
  StructuredRequest,
} from '../provider';

const TIMEOUT_MS = 10 * 60 * 1000;

/** A rate limit is temporary and says so; it is never dressed up as anything else. */
function asRateLimit(error: unknown): AiRateLimitedError | null {
  const status = (error as { status?: number } | null)?.status;
  return status === 429 ? new AiRateLimitedError(String((error as Error).message)) : null;
}

function client({ apiKey }: CallContext): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 2, timeout: TIMEOUT_MS });
}

function toContent(blocks: AiBlock[]): Anthropic.ContentBlockParam[] {
  return blocks.map((block) => {
    if (block.kind === 'text') return { type: 'text', text: block.text };
    if (block.kind === 'image') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: block.data,
        },
      };
    }
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: block.data },
    };
  });
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  defaultModel: 'claude-opus-5',
  keyPlaceholder: 'sk-ant-…',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  envVar: 'ANTHROPIC_API_KEY',

  async structured<T extends ZodType>(
    request: StructuredRequest<T>,
    context: CallContext,
  ): Promise<ZodInfer<T>> {
    const stream = client(context).messages.stream({
      model: context.model,
      max_tokens: request.maxTokens ?? 32_000,
      output_config: {
        format: zodOutputFormat(request.schema),
        effort: request.effort ?? 'high',
      },
      system: request.cacheSystem
        ? [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }]
        : request.system,
      messages: [{ role: 'user', content: toContent(request.content) }],
    });

    let message;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      throw asRateLimit(error) ?? error;
    }

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
  },

  async searchWeb(request: SearchRequest, context: CallContext): Promise<SearchResult> {
    const stream = client(context).messages.stream({
      model: context.model,
      max_tokens: request.maxTokens ?? 16_000,
      system: request.system,
      tools: [
        {
          // The basic search variant, rather than the newer filtered one,
          // because the model is configurable and this variant is accepted by
          // every model that supports search at all.
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: request.maxUses ?? 6,
        } as unknown as Anthropic.ToolUnion,
      ],
      messages: [{ role: 'user', content: request.prompt }],
    });

    let message;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      throw asRateLimit(error) ?? error;
    }

    // The server-tool result blocks are the evidence, not the model's prose.
    const hits: SearchHit[] = [];
    for (const block of message.content) {
      if (block.type !== 'web_search_tool_result') continue;
      const content = (block as { content?: unknown }).content;
      if (!Array.isArray(content)) continue; // an error object, not a result list
      for (const entry of content as Record<string, unknown>[]) {
        if (entry?.type !== 'web_search_result') continue;
        hits.push({
          title: String(entry.title ?? ''),
          url: String(entry.url ?? ''),
          pageAge: entry.page_age ? String(entry.page_age) : '',
        });
      }
    }

    const prose = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n');

    return { hits, prose };
  },
};
