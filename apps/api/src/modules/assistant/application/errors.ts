/** Base class for the failures of the assistant use cases. */
export abstract class AssistantApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing, from another cooperative or from another member (BR-AI-07). */
export class ConversationNotFoundError extends AssistantApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('Not found.');
  }
}

/** BR-AI-08. */
export class UsageLimitExceededError extends AssistantApplicationError {
  readonly code = 'usage_limit_exceeded';

  constructor(
    readonly limit: number,
    /** Seconds until the oldest counted message leaves the window. */
    readonly retryAfterSeconds: number,
  ) {
    super(`The limit of ${limit} messages per hour was reached.`);
  }
}

/** No model configured, or the provider failed: the rest of the app keeps working. */
export class AssistantUnavailableError extends AssistantApplicationError {
  readonly code = 'assistant_unavailable';

  constructor(message = 'The assistant is not available at the moment.') {
    super(message);
  }
}

/** The provider's safety systems declined the request. */
export class AssistantRefusedError extends AssistantApplicationError {
  readonly code = 'assistant_refused';

  constructor() {
    super('The assistant cannot answer this request.');
  }
}
