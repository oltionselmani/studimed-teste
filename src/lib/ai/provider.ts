import type { ZodType, infer as ZodInfer } from 'zod';

/**
 * The shape every AI provider implements, so the rest of the app never knows
 * which one is configured. The contract is deliberately narrow: validated
 * structured output, and a web search that returns the hits themselves rather
 * than prose about them.
 */

export type ProviderId = 'anthropic' | 'gemini';

/** Provider-neutral request content. Providers translate it to their own wire format. */
export type AiBlock =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaType: string; data: string }
  | { kind: 'document'; mediaType: string; data: string };

export const textBlock = (text: string): AiBlock => ({ kind: 'text', text });

/** 'low' for mechanical extraction, 'high' for anything requiring judgement. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh';

export interface StructuredRequest<T extends ZodType> {
  system: string;
  content: AiBlock[];
  schema: T;
  maxTokens?: number;
  effort?: Effort;
  /** Caches the system prompt prefix across the calls of one workflow, where the provider can. */
  cacheSystem?: boolean;
}

export interface SearchRequest {
  system: string;
  prompt: string;
  maxUses?: number;
  maxTokens?: number;
}

export interface SearchHit {
  title: string;
  url: string;
  /** Publication date, when the provider reports one. */
  pageAge: string;
}

export interface SearchResult {
  /** What the search actually returned. This is the evidence. */
  hits: SearchHit[];
  /** What the model said about it. Never stored as a source. */
  prose: string;
}

export interface CallContext {
  apiKey: string;
  model: string;
}

export interface AiProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly defaultModel: string;
  /** Shown in the settings field so a key from the wrong provider is obvious. */
  readonly keyPlaceholder: string;
  readonly keyUrl: string;
  /** Environment variable that supplies the key in a server deployment. */
  readonly envVar: string;
  structured<T extends ZodType>(
    request: StructuredRequest<T>,
    context: CallContext,
  ): Promise<ZodInfer<T>>;
  searchWeb(request: SearchRequest, context: CallContext): Promise<SearchResult>;
}
