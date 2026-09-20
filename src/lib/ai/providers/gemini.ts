import 'server-only';
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Part } from '@google/genai';
import type { ZodType, infer as ZodInfer } from 'zod';
import { AiFeatureUnsupportedError, AiInvalidOutputError, AiRateLimitedError } from '../errors';
import { geminiResponseSchema } from '../json-schema';
import type {
  AiBlock,
  AiProvider,
  CallContext,
  Effort,
  SearchHit,
  SearchRequest,
  SearchResult,
  StructuredRequest,
} from '../provider';

function client({ apiKey }: CallContext): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

function toParts(blocks: AiBlock[]): Part[] {
  return blocks.map((block) =>
    block.kind === 'text'
      ? { text: block.text }
      : { inlineData: { mimeType: block.mediaType, data: block.data } },
  );
}

function userContent(parts: Part[]): Content[] {
  return [{ role: 'user', parts }];
}

/**
 * Gemini 3 models take a thinking *level*; the 2.5 generation took a token
 * budget instead and rejects the level. Sending nothing there leaves the
 * model's own default, which is the right behaviour for a model we were not
 * told about.
 */
function thinkingFor(effort: Effort | undefined, model: string) {
  if (!/^gemini-(?:[3-9]|\d{2})/.test(model)) return undefined;
  const level =
    effort === 'low'
      ? ThinkingLevel.LOW
      : effort === 'medium'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.HIGH;
  return { thinkingLevel: level };
}

/** Reasons the model stopped that mean "there is no usable answer here". */
function stopProblem(finishReason: string | undefined): string | null {
  switch (finishReason) {
    case undefined:
    case 'STOP':
      return null;
    case 'MAX_TOKENS':
      return 'the response was cut off before it finished';
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
    case 'SPII':
      return 'the request was declined by the model';
    case 'RECITATION':
      return 'the answer was withheld as a recitation of copyrighted material';
    default:
      return `the model stopped early (${finishReason})`;
  }
}

/** A rate limit is temporary and says so; it is never dressed up as anything else. */
function rateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

/**
 * Grounded search is billed per query on Gemini 3 models, so a free-tier key
 * can be refused outright. That is reported as a missing capability rather
 * than as a failed search, because "the search found nothing" and "the search
 * never ran" are different facts and the student is shown which one happened.
 *
 * Deliberately not 429: being over a per-minute limit is a rate limit, not a
 * capability the key lacks, and saying otherwise would be wrong.
 */
function searchRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status === 429) return false;
  return (
    error.status === 403 ||
    /billing|not (?:be )?(?:enabled|supported|available)|permission/i.test(error.message)
  );
}

export const geminiProvider: AiProvider = {
  id: 'gemini',
  label: 'Google (Gemini)',
  // Free tier at the time of writing, multimodal, and current.
  defaultModel: 'gemini-3.8-flash',
  keyPlaceholder: 'AIza…',
  keyUrl: 'https://aistudio.google.com/apikey',
  envVar: 'GEMINI_API_KEY',

  async structured<T extends ZodType>(
    request: StructuredRequest<T>,
    context: CallContext,
  ): Promise<ZodInfer<T>> {
    let response;
    try {
      response = await client(context).models.generateContent({
        model: context.model,
        contents: userContent(toParts(request.content)),
        config: {
          systemInstruction: request.system,
          // No maxOutputTokens: the ceiling differs per Gemini model and asking
          // for more than a model allows is a hard request error, while the
          // default is that model's own maximum. A cut-off answer is still
          // caught below by its finish reason rather than being stored half
          // written.
          responseMimeType: 'application/json',
          responseJsonSchema: geminiResponseSchema(request.schema),
          thinkingConfig: thinkingFor(request.effort, context.model),
        },
      });
    } catch (error) {
      if (rateLimited(error)) throw new AiRateLimitedError((error as ApiError).message);
      throw error;
    }

    if (response.promptFeedback?.blockReason) {
      throw new AiInvalidOutputError(
        `the request was blocked (${response.promptFeedback.blockReason})`,
      );
    }

    const problem = stopProblem(response.candidates?.[0]?.finishReason);
    if (problem) throw new AiInvalidOutputError(problem);

    const text = response.text;
    if (!text || !text.trim()) throw new AiInvalidOutputError('no structured output was returned');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiInvalidOutputError('the response was not valid JSON');
    }

    const result = request.schema.safeParse(parsed);
    if (!result.success) {
      throw new AiInvalidOutputError(result.error.issues[0]?.message ?? 'schema mismatch');
    }
    return result.data as ZodInfer<T>;
  },

  async searchWeb(request: SearchRequest, context: CallContext): Promise<SearchResult> {
    let response;
    try {
      response = await client(context).models.generateContent({
        model: context.model,
        contents: userContent([{ text: request.prompt }]),
        config: {
          systemInstruction: request.system,
          tools: [{ googleSearch: {} }],
        },
      });
    } catch (error) {
      if (rateLimited(error)) throw new AiRateLimitedError((error as ApiError).message);
      if (searchRefusal(error)) {
        throw new AiFeatureUnsupportedError(
          'web_search',
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }

    // The grounding chunks are what the search actually returned. Google hands
    // back its own redirect URLs rather than the publishers' addresses; they
    // are stored exactly as given, because a link the student can open and
    // check is the point, and rewriting one would be inventing a source.
    const hits: SearchHit[] = [];
    for (const chunk of response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
      const uri = chunk.web?.uri;
      if (!uri) continue;
      hits.push({ title: chunk.web?.title ?? '', url: uri, pageAge: '' });
    }

    return { hits, prose: response.text ?? '' };
  },
};
