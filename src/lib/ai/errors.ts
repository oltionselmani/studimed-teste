/**
 * Failures the AI layer raises. Every one of them is surfaced to the student
 * as itself: nothing in the product answers an AI failure with invented
 * content.
 */

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
 * Thrown when the configured provider cannot do what a feature needs — a web
 * search its key is not entitled to, for instance. The feature says so and
 * stops, rather than producing something that looks like a result.
 */
export class AiFeatureUnsupportedError extends Error {
  constructor(
    readonly feature: 'web_search',
    detail?: string,
  ) {
    super(detail ? `AI_FEATURE_UNSUPPORTED: ${feature}: ${detail}` : `AI_FEATURE_UNSUPPORTED: ${feature}`);
    this.name = 'AiFeatureUnsupportedError';
  }
}

/**
 * Thrown when the provider refused because the key is over its rate limit.
 * Free tiers are metered per minute, so this is an ordinary, temporary
 * condition — and it is reported as one, rather than as a failed request.
 */
export class AiRateLimitedError extends Error {
  constructor(detail?: string) {
    super(detail ? `AI_RATE_LIMITED: ${detail}` : 'AI_RATE_LIMITED');
    this.name = 'AiRateLimitedError';
  }
}
