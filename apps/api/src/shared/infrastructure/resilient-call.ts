/**
 * Resilient calls to an overloaded provider (ADR-009, ADR-010). Gemini's free tier answers
 * 503 UNAVAILABLE / 429 RESOURCE_EXHAUSTED in bursts: a transient failure is retried with
 * exponential backoff and jitter, within a bounded total time so an HTTP request never hangs,
 * and when one model keeps failing the next one of the fallback list is tried.
 * Free of any SDK: errors are recognized by their shape.
 */

export interface ResilienceOptions {
  /** Calls per model, the first one included. */
  attemptsPerModel: number;
  /** Delay before the second attempt; it doubles on each following one. */
  baseDelayMs: number;
  /** Cap of a single wait (a server-requested delay above it skips to the next model). */
  maxDelayMs: number;
  /** Time after which no new wait is started. A call already in flight is not interrupted. */
  maxTotalMs: number;
  /** Test seams. */
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  now: () => number;
  /** One line per retry or fallback; never receives secrets or content. */
  onRetry: (event: RetryEvent) => void;
}

export interface RetryEvent {
  model: string;
  attempt: number;
  status: number | string | undefined;
  /** Wait before the next attempt on the same model; 0 when moving to the next model. */
  delayMs: number;
  nextModel?: string;
}

export const CHAT_RESILIENCE: Pick<
  ResilienceOptions,
  'attemptsPerModel' | 'baseDelayMs' | 'maxDelayMs' | 'maxTotalMs'
> = { attemptsPerModel: 3, baseDelayMs: 1_000, maxDelayMs: 8_000, maxTotalMs: 20_000 };

/** Embeddings run in the background (indexing) or inside a short search: a little more room. */
export const EMBEDDING_RESILIENCE: typeof CHAT_RESILIENCE = {
  attemptsPerModel: 4,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  maxTotalMs: 30_000,
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_STATUS_TEXT = /\b(UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED)\b/;
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  const code = (error as { code?: unknown }).code ?? (error.cause as { code?: unknown })?.code;
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return true;
  // undici: "TypeError: fetch failed" with the socket error as cause.
  return error.name === 'TypeError' && /fetch failed/i.test(error.message);
}

/** Overload, quota, server error or network failure: worth trying again. Anything else is not. */
export function isTransientError(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return RETRYABLE_STATUS.has(status);
  if (isNetworkError(error)) return true;
  return error instanceof Error && RETRYABLE_STATUS_TEXT.test(error.message);
}

/** Wait requested by the server: `Retry-After` (seconds) or the `retryDelay` ("7s") of the error body. */
export function requestedDelayMs(error: unknown): number | undefined {
  const headers = (error as { headers?: { get?: (name: string) => string | null } } | null)
    ?.headers;
  const header = headers?.get?.('retry-after');
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000;
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(
    error instanceof Error ? error.message : '',
  );
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
}

function describeStatus(error: unknown): number | string | undefined {
  return (
    statusOf(error) ??
    (error instanceof Error ? RETRYABLE_STATUS_TEXT.exec(error.message)?.[1] : undefined) ??
    (error instanceof Error ? error.name : undefined)
  );
}

/** One JSON line, with no message and no content. */
export const logRetry = (event: RetryEvent): void =>
  console.warn(JSON.stringify({ event: 'gemini_retry', ...event }));

/**
 * Runs `call` against the first model and, while it keeps failing with a transient error,
 * against the following ones. A non-transient error is thrown at once. When everything is
 * exhausted, the last error is thrown.
 */
export async function callWithFallback<T>(
  models: readonly string[],
  call: (model: string) => Promise<T>,
  settings: Partial<ResilienceOptions> = {},
): Promise<T> {
  const options: ResilienceOptions = {
    ...CHAT_RESILIENCE,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: Date.now,
    onRetry: logRetry,
    ...settings,
  };
  const startedAt = options.now();
  let lastError: unknown;

  for (const [modelIndex, model] of models.entries()) {
    for (let attempt = 1; attempt <= options.attemptsPerModel; attempt++) {
      try {
        return await call(model);
      } catch (error) {
        if (!isTransientError(error)) throw error;
        lastError = error;
      }

      const remaining = options.maxTotalMs - (options.now() - startedAt);
      const backoff = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
      // Full-range jitter on the upper half, so simultaneous requests do not retry in lockstep.
      const jittered = backoff * (0.5 + options.random() * 0.5);
      const delayMs = Math.max(requestedDelayMs(lastError) ?? 0, Math.round(jittered));
      const nextModel = models[modelIndex + 1];
      const lastAttempt = attempt === options.attemptsPerModel;

      if (lastAttempt || delayMs > options.maxDelayMs || delayMs >= remaining) {
        // This model is done (out of attempts, or the wait would not fit): move on.
        if (nextModel === undefined || remaining <= 0) throw lastError;
        options.onRetry({
          model,
          attempt,
          status: describeStatus(lastError),
          delayMs: 0,
          nextModel,
        });
        break;
      }

      options.onRetry({ model, attempt, status: describeStatus(lastError), delayMs });
      await options.sleep(delayMs);
    }
  }
  throw lastError;
}

/** `GEMINI_MODEL` first, then the fallbacks, without repeating any. */
export const modelChain = (primary: string, fallbacks: readonly string[] = []): string[] => [
  ...new Set([primary, ...fallbacks]),
];
