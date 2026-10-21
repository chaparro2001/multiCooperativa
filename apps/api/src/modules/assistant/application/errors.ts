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

/** US-AI-07: the model is not allowlisted, or not installed in Ollama. */
export class ModelNotAvailableError extends AssistantApplicationError {
  readonly code = 'assistant_model_not_available';

  constructor(model: string) {
    super(`The model "${model}" is not available for this server.`);
  }
}

/** US-AI-07: the assistant runs on Gemini, so there is no local model to choose. */
export class LocalModelNotInUseError extends AssistantApplicationError {
  readonly code = 'local_model_not_in_use';

  constructor() {
    super('The assistant is not using a local model on this server.');
  }
}

/** US-AI-07: the server has no ASSISTANT_SECRETS_KEY, so a cooperative's API key cannot be stored. */
export class HostedProviderUnavailableError extends AssistantApplicationError {
  readonly code = 'hosted_provider_unavailable';

  constructor() {
    super('External providers are not enabled on this server.');
  }
}

/** US-AI-07: first time or provider changed, and the request carried no API key. */
export class ApiKeyRequiredError extends AssistantApplicationError {
  readonly code = 'assistant_api_key_required';

  constructor() {
    super('An API key is required for this provider.');
  }
}

/** US-AI-07: the provider rejected the key (401/403). */
export class ProviderKeyInvalidError extends AssistantApplicationError {
  readonly code = 'assistant_provider_key_invalid';

  constructor() {
    super('The provider rejected the API key.');
  }
}

/** US-AI-07: the provider could not be asked to verify the key and the model. */
export class ProviderUnreachableError extends AssistantApplicationError {
  readonly code = 'assistant_provider_unreachable';

  constructor() {
    super('The provider could not be reached to verify the key.');
  }
}
